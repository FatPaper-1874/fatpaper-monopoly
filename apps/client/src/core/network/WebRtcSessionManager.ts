import { DataConnection } from "peerjs";
import {
	AIDecisionConfig,
	ClientSocketMessage,
	RoomMapInfo,
	ServerSocketMessage,
	SocketMessage,
	SocketMsgSource,
	SocketMsgType,
} from "@mine-monopoly/types";
import { PeerClient } from "@src/core/monopoly-client/PeerClient";
import { ReconnectionManager } from "@src/core/monopoly-client/ReconnectionManager";
import { MonopolyHost } from "@src/core/monopoly-host/MonopolyHost";
import { getRoomSessionStatus } from "@src/utils/api/room-router";
import { useUserInfo } from "@src/store";
import { LocalPartySession } from "@src/core/local-party/LocalPartySession";

export type WebRtcSessionState =
	| "idle"
	| "hosting"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "closing"
	| "closed"
	| "failed";
export type ConnectionStrategy = "prefer-p2p" | "force-relay";
export type SessionSendResult =
	| { ok: true; generation: number }
	| { ok: false; reason: "not-connected" | "send-failed"; error?: unknown };
export interface HostSessionRegistration {
	hostLeaseToken: string;
	hostEpoch: number;
	/** 在创建主机时冻结身份信息，供服务端重启后的租约 reclaim 使用。 */
	hostName: string;
	hostId: string;
}
export interface WebRtcSessionManagerOptions {
	iceServer: { host: string; port: number };
	onMessage: (message: ServerSocketMessage) => void;
	onStateChange?: (state: WebRtcSessionState, detail?: string) => void;
	onHeartbeat?: (ping: number) => void;
	onReconnectAttempt?: (attempt: number, strategy: ConnectionStrategy) => void;
	onHostClosed?: (status: "closed" | "expired") => void;
	onReconnectCancelled?: () => void;
}

/** 地图分块二进制包类型标记（与主机端 Room.ts 保持一致） */
const MAP_CHUNK_BIN_TYPE = 1;

/**
 * 解析地图分块二进制包。
 * 新格式: [type][session 长度][session UTF-8][chunkIndex][数据]；旧格式: [type][chunkIndex][数据]。
 * 返回 null 表示不是合法的地图分块包。
 */
function parseMapChunkBinaryPacket(bytes: Uint8Array): SocketMessage<SocketMsgType.MapChunk, SocketMsgSource.Server> | null {
	if (bytes.length < 5 || bytes[0] !== MAP_CHUNK_BIN_TYPE) return null;

	const sessionLength = bytes[1];
	const indexOffset = 2 + sessionLength;
	const dataOffset = indexOffset + 4;
	const sessionCandidate =
		sessionLength > 0 && bytes.length >= dataOffset ? new TextDecoder().decode(bytes.slice(2, indexOffset)) : "";
	const isNewProtocolPacket = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionCandidate);

	if (isNewProtocolPacket) {
		const chunkIndex =
			(((bytes[indexOffset] << 24) | (bytes[indexOffset + 1] << 16) | (bytes[indexOffset + 2] << 8) | bytes[indexOffset + 3]) >>> 0);
		return {
			type: SocketMsgType.MapChunk,
			source: SocketMsgSource.Server,
			data: { mapLoadSessionId: sessionCandidate, chunkIndex, data: bytes.slice(dataOffset) },
		};
	}

	const chunkIndex = (((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0);
	return {
		type: SocketMsgType.MapChunk,
		source: SocketMsgSource.Server,
		data: { chunkIndex, data: bytes.slice(5) },
	};
}

type ReconnectContext = { roomId: string; hostPeerId: string; isReady: () => boolean };
export type WebRtcSessionEvent = "state" | "message" | "heartbeat" | "reconnect-attempt" | "host-closed";
class HostRoomClosedError extends Error {
	public constructor(public readonly status: "closed" | "expired") {
		super(status === "closed" ? "房主已退出，房间已关闭" : "房间已过期");
	}
}

export class WebRtcSessionManager {
	private peerClient: PeerClient | null = null;
	private connection: DataConnection | null = null;
	private host: MonopolyHost | null = null;
	private localPartySession: LocalPartySession | null = null;
	private state: WebRtcSessionState = "idle";
	private connectionGeneration = 0;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastHeartbeatSentAt = 0;
	private heartbeatPaused = false;
	private reconnectManager: ReconnectionManager | null = null;
	private reconnectContext: ReconnectContext | null = null;
	private iceServers: RTCIceServer[] = [];
	private strategy: ConnectionStrategy = "prefer-p2p";
	private peerStrategy: ConnectionStrategy | null = null;
	private explicitClose = false;
	private listeners = new Map<WebRtcSessionEvent, Set<(payload: unknown) => void>>();

	public constructor(private readonly options: WebRtcSessionManagerOptions) {}
	public on(event: WebRtcSessionEvent, listener: (payload: unknown) => void): () => void {
		const listeners = this.listeners.get(event) || new Set();
		listeners.add(listener);
		this.listeners.set(event, listeners);
		return () => listeners.delete(listener);
	}

	public getState(): WebRtcSessionState {
		return this.state;
	}
	public getConnectionGeneration(): number {
		return this.connectionGeneration;
	}
	public getConnectionStrategy(): ConnectionStrategy {
		return this.strategy;
	}
	/** 当前页面是否为本地派对会话。 */
	public isLocalParty(): boolean {
		return this.localPartySession !== null;
	}
	public async createLocalParty(defaultName: string): Promise<void> {
		await this.close();
		this.explicitClose = false;
		this.localPartySession = await LocalPartySession.create(defaultName, (message) => {
			this.options.onMessage(message);
			this.emit("message", message);
		});
		this.transition("connected", "本地派对");
	}
	public addLocalPartyPlayer() {
		return this.localPartySession?.addHuman() ?? Promise.resolve({ success: false, error: "本地派对未创建" });
	}
	public updateLocalPartyPlayerName(userId: string, username: string) {
		return this.localPartySession?.updateHumanName(userId, username) ?? { success: false, error: "本地派对未创建" };
	}
	public removeLocalPartyPlayer(userId: string) {
		return this.localPartySession?.removeHuman(userId) ?? { success: false, error: "本地派对未创建" };
	}

	public hasLocalHost(): boolean {
		return this.host !== null;
	}

	/** 仅供开发环境 window.__MM_TEST__ 调用：立即发送一次房主租约心跳。 */
	public async debugSendHostHeartbeat(): Promise<{ ok: boolean; reclaimed: boolean; error?: string }> {
		if (!this.host) throw new Error("当前页面未持有 P2P 主机实例");
		return this.host.debugSendHeartbeat();
	}

	/** 仅供开发环境 window.__MM_TEST__ 调用：关闭当前 P2P 连接，以触发正常重连流程。 */
	public debugDropP2pConnection(): void {
		if (!this.connection) throw new Error("当前没有可关闭的 P2P 连接");
		this.connection.close();
	}

	/** 仅供开发环境 window.__MM_TEST__ 调用：立即执行一次重连流程。 */
	public async debugReconnectNow(): Promise<void> {
		await this.reconnectNow();
	}
	public setIceServers(iceServers: RTCIceServer[]): void {
		this.iceServers = iceServers;
	}

	public async createHost(
		roomId: string,
		deleteIntervalMs: number,
		registration: HostSessionRegistration,
	): Promise<string> {
		this.transition("hosting");
		this.explicitClose = false;
		this.host = await MonopolyHost.create(
			roomId,
			this.options.iceServer.host,
			this.options.iceServer.port,
			deleteIntervalMs,
			this.iceServers,
			registration,
		);
		this.host.addDestoryListener(() => {
			this.host = null;
		});
		return this.host.getPeerId();
	}

	public async connect(roomId: string, hostPeerId: string, isReady: () => boolean): Promise<void> {
		this.stopReconnection();
		this.explicitClose = false;
		this.reconnectContext = { roomId, hostPeerId, isReady };
		this.transition("connecting");
		await this.openConnection(hostPeerId);
		const result = this.sendJoinRoom(isReady());
		if (!result.ok) throw new Error("加入房间消息发送失败");
		this.transition("connected");
	}

	public send(message: ClientSocketMessage): SessionSendResult {
		if (this.localPartySession) {
			this.localPartySession.handleClientMessage(message);
			return { ok: true, generation: this.connectionGeneration };
		}
		if (!this.connection?.open || this.state === "closing" || this.state === "closed")
			return { ok: false, reason: "not-connected" };
		try {
			this.connection.send(
				JSON.stringify(message, (_key, value) =>
					value === Infinity ? "Infinity" : value === -Infinity ? "-Infinity" : value,
				),
			);
			return { ok: true, generation: this.connectionGeneration };
		} catch (error) {
			return { ok: false, reason: "send-failed", error };
		}
	}

	public pauseHeartbeat(): void {
		this.heartbeatPaused = true;
		this.clearHeartbeatTimeout();
	}
	public resumeHeartbeat(): void {
		this.heartbeatPaused = false;
		this.scheduleHeartbeatTimeout();
	}
	public handleHeartbeatReply(): void {
		if (this.lastHeartbeatSentAt) {
			const ping = Math.round((Date.now() - this.lastHeartbeatSentAt) / 2);
			this.options.onHeartbeat?.(ping);
			this.emit("heartbeat", ping);
		}
		this.scheduleHeartbeatTimeout();
	}
	public cancelReconnection(): void {
		this.reconnectManager?.cancel();
		this.reconnectManager = null;
	}
	public isReconnecting(): boolean {
		return this.state === "reconnecting";
	}

	public requestSave(): void {
		if (this.localPartySession) {
			this.localPartySession.requestSave();
			return;
		}
		this.host?.getRoom().requestSave();
	}
	public loadSave(record: any, usePrevious: boolean): Promise<{ success: boolean; error?: string }> {
		return (
			this.localPartySession?.loadSave(record, usePrevious) ?? this.host?.getRoom().loadSave(record, usePrevious) ?? Promise.resolve({ success: false, error: "未连接到主机" })
		);
	}
	public changeColorForUser(userId: string, color: string) {
		return this.localPartySession?.changeColorForUser(userId, color) ?? this.host?.getRoom().changeColor(userId, color) ?? { success: false, error: "只有房主可以执行此操作" };
	}
	public addAIPlayer() {
		return this.localPartySession?.addAIPlayer() ?? this.host?.getRoom().addAiPlayer() ?? { success: false, error: "只有房主可以添加 AI" };
	}
	public randomizeAIRoles(): boolean {
		return this.localPartySession?.randomizeAIRoles() ?? this.host?.getRoom().randomizeAiRoles() ?? false;
	}
	public setSpectatorMode(enabled: boolean) {
		return this.host?.getRoom().setOwnerSpectatorMode(enabled) ?? { success: false, error: "只有房主可以切换旁观模式" };
	}
	public changeRoleForUser(userId: string, roleId: string) {
		return this.localPartySession?.changeRoleForUser(userId, roleId) ?? this.host?.getRoom().changeRole(userId, roleId) ?? { success: false, error: "只有房主可以修改角色" };
	}
	public updateAIPlayerName(userId: string, username: string) {
		return (
			this.localPartySession?.updateAIPlayerName(userId, username) ?? this.host?.getRoom().updateAIPlayerName(userId, username) ?? { success: false, error: "只有房主可以修改 AI 名称" }
		);
	}
	public updateAIDecisionConfig(config: AIDecisionConfig): void {
		if (this.localPartySession) {
			this.localPartySession.updateAIDecisionConfig(config);
			return;
		}
		this.host?.getRoom().updateAIDecisionConfig(config);
	}
	public isAiPlayer(userId: string): boolean {
		return this.localPartySession?.isAiPlayer(userId) ?? this.host?.getRoom().isAiPlayer(userId) ?? false;
	}
	public removeAIPlayer(userId: string): boolean {
		return this.localPartySession?.removeAIPlayer(userId) ?? this.host?.getRoom().removeAiPlayer(userId) ?? false;
	}
	public changeLocalPartyMap(mapInfo: RoomMapInfo): Promise<{ success: boolean; error?: string }> {
		return this.localPartySession?.changeGameMap(mapInfo)
			?? Promise.resolve({ success: false, error: "本地派对未创建" });
	}
	public changeGameMap(mapInfo: RoomMapInfo): boolean {
		if (this.localPartySession || !this.host) return false;
		void this.host.getRoom().changeMap(mapInfo);
		return true;
	}

	public async close(): Promise<void> {
		if (this.state === "closing") return;
		if (this.state === "closed" && !this.connection && !this.peerClient && !this.host && !this.localPartySession && !this.reconnectContext) return;
		this.explicitClose = true;
		this.transition("closing");
		this.stopReconnection();
		this.stopHeartbeat();
		this.disposeConnection();
		this.peerClient?.destory();
		this.peerClient = null;
		this.peerStrategy = null;
		this.host?.destory();
		this.localPartySession?.destroy();
		this.localPartySession = null;
		this.host = null;
		this.reconnectContext = null;
		this.transition("closed");
	}

	private async reconnectNow(): Promise<void> {
		const context = this.reconnectContext;
		if (!context) throw new Error("缺少重连上下文");
		// 优先直接重连主机 P2P(P2P 才是游戏的真实状态);只有直连失败时才查服务端注册表，
		// 避免"游戏还活着、但服务端房间已过期"导致玩家被误判踢出
		try {
			await this.openConnection(context.hostPeerId);
		} catch (error) {
			await this.assertRoomStillActive(context.roomId);
			await this.openConnection(context.hostPeerId);
		}
		const result = this.sendJoinRoom(context.isReady());
		if (!result.ok) throw new Error("重连加入消息发送失败");
	}

	private async openConnection(hostPeerId: string): Promise<void> {
		this.disposeConnection();
		await this.ensurePeerClient();
		const { conn } = await this.peerClient!.linkToHost(hostPeerId);
		this.bindConnection(conn);
	}

	private async ensurePeerClient(): Promise<void> {
		if (this.peerClient && this.peerStrategy === this.strategy) return;
		this.peerClient?.destory();
		this.peerClient = await PeerClient.create(
			this.options.iceServer.host,
			this.options.iceServer.port,
			this.buildRtcConfig(),
		);
		this.peerStrategy = this.strategy;
	}
	private buildRtcConfig(): RTCConfiguration {
		return { iceServers: this.iceServers, ...(this.strategy === "force-relay" ? { iceTransportPolicy: "relay" } : {}) };
	}

	private bindConnection(connection: DataConnection): void {
		this.connection = connection;
		const generation = ++this.connectionGeneration;
		this.startHeartbeat();
		connection.on("data", (payload: unknown) => {
			if (!this.isCurrentConnection(connection, generation)) return;
			try {
				// 二进制通道：地图分块包（主机端直传 Uint8Array，接收端为 ArrayBuffer）
				if (payload instanceof ArrayBuffer || payload instanceof Uint8Array) {
					const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
					const mapChunkMsg = parseMapChunkBinaryPacket(bytes);
					if (mapChunkMsg) {
						this.options.onMessage(mapChunkMsg);
						this.emit("message", mapChunkMsg);
					}
					return;
				}
				const message = JSON.parse(String(payload), (_key, value) =>
					value === "Infinity" ? Infinity : value === "-Infinity" ? -Infinity : value,
				) as ServerSocketMessage;
				this.options.onMessage(message);
				this.emit("message", message);
			} catch (error) {
				console.error("[WebRtcSessionManager] 无法解析主机消息", error);
			}
		});
		connection.on("close", () => this.handleConnectionLoss(connection, generation, "连接已关闭"));
		connection.on("error", (error) =>
			this.handleConnectionLoss(connection, generation, "连接异常: " + (error.message || error)),
		);
	}

	private handleConnectionLoss(connection: DataConnection, generation: number, detail: string): void {
		if (!this.isCurrentConnection(connection, generation) || this.explicitClose) return;
		this.connection = null;
		this.stopHeartbeat();
		this.startReconnection(detail);
	}
	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			if (this.heartbeatPaused || this.state !== "connected") return;
			this.lastHeartbeatSentAt = Date.now();
			if (this.send({ type: SocketMsgType.Heart, source: SocketMsgSource.Client, data: undefined }).ok)
				this.scheduleHeartbeatTimeout();
		}, 3000);
	}
	private scheduleHeartbeatTimeout(): void {
		this.clearHeartbeatTimeout();
		if (this.heartbeatPaused || this.state !== "connected") return;
		this.heartbeatTimeout = setTimeout(() => {
			if (this.state === "connected") this.startReconnection("心跳超时");
		}, 5000);
	}
	private stopHeartbeat(): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = null;
		this.clearHeartbeatTimeout();
	}
	private clearHeartbeatTimeout(): void {
		if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
		this.heartbeatTimeout = null;
	}

	private startReconnection(detail: string): void {
		if (!this.reconnectContext || this.state === "reconnecting" || this.explicitClose) return;
		this.transition("reconnecting", detail);
		this.reconnectManager = new ReconnectionManager(async () => this.reconnectNow(), {
			retryInterval: 3000,
			maxRetries: Number.POSITIVE_INFINITY,
			showCountdown: true,
			getDisplayState: (attempt) => ({
				title: "正在恢复连接",
				message: "正在第 " + attempt + " 次恢复房间连接",
				actionLabel: "离开房间",
			}),
			onRetry: (attempt) => {
				if (attempt >= 4) this.strategy = "force-relay";
				this.options.onReconnectAttempt?.(attempt, this.strategy);
				this.emit("reconnect-attempt", { attempt, strategy: this.strategy });
			},
			onSuccess: () => this.transition("connected"),
			onFail: (error) => {
				this.reconnectManager = null;
				if (error instanceof HostRoomClosedError) {
					this.transition("closed", error.message);
					this.options.onHostClosed?.(error.status);
					this.emit("host-closed", error.status);
					return;
				}
				this.transition("failed", error.message);
			},
			onCancel: () => {
				this.transition("closed", "用户取消重连");
				this.options.onReconnectCancelled?.();
			},
			shouldRetry: (error) => !(error instanceof HostRoomClosedError),
		});
		this.reconnectManager.start();
	}
	private stopReconnection(): void {
		this.reconnectManager?.destroy();
		this.reconnectManager = null;
	}
	private async assertRoomStillActive(roomId: string): Promise<void> {
		const response = await getRoomSessionStatus(roomId);
		const status = response.data.status;
		if (status === "closed" || status === "expired") throw new HostRoomClosedError(status);
		// grace(宽限期)与 active 均视为可重连
		if (status !== "active" && status !== "grace") throw new Error("房间会话不可用");
	}
	private sendJoinRoom(isReady: boolean): SessionSendResult {
		const user = useUserInfo();
		return this.send({
			type: SocketMsgType.JoinRoom,
			source: SocketMsgSource.Client,
			data: { userId: user.userId, username: user.username, color: user.color, avatar: user.avatar, isReady },
		});
	}
	private disposeConnection(): void {
		if (!this.connection) return;
		this.connectionGeneration++;
		this.connection.removeAllListeners();
		this.connection.close();
		this.connection = null;
	}
	private isCurrentConnection(connection: DataConnection, generation: number): boolean {
		return this.connection === connection && this.connectionGeneration === generation;
	}
	private emit(event: WebRtcSessionEvent, payload: unknown): void {
		this.listeners.get(event)?.forEach((listener) => listener(payload));
	}
	private transition(state: WebRtcSessionState, detail?: string): void {
		this.state = state;
		this.options.onStateChange?.(state, detail);
		this.emit("state", { state, detail });
	}
}

import { DataConnection } from "peerjs";
import {
	AIDecisionConfig,
	ClientSocketMessage,
	OperateType,
	RoomMapInfo,
	ServerSocketMessage,
	SocketMsgSource,
	SocketMsgType,
	User,
} from "@mine-monopoly/types";
import { Room } from "@src/core/monopoly-host/Room";
import type { LocalPartyPlayer } from "@mine-monopoly/types";
import type { SaveRecord } from "@src/core/save";
import { useLocalParty } from "@src/store/local-party";
import { useUserInfo } from "@src/store";
import { useMapData } from "@src/store/game";

const MAX_PLAYERS = 6;
const BROADCAST_TYPES = new Set<SocketMsgType>([
	SocketMsgType.RoomInfo,
	SocketMsgType.MsgNotify,
	SocketMsgType.GameStart,
	SocketMsgType.GameInit,
	SocketMsgType.GameInitFinished,
	SocketMsgType.GameData,
	SocketMsgType.GameLog,
	SocketMsgType.RoundTurn,
	SocketMsgType.RoundTimeOut,
	SocketMsgType.RollDiceStart,
	SocketMsgType.RollDiceResult,
	SocketMsgType.RemainingTime,
	SocketMsgType.CurrentEventName,
	SocketMsgType.PlayerWalk,
	SocketMsgType.PlayerTp,
	SocketMsgType.GainMoney,
	SocketMsgType.CostMoney,
	SocketMsgType.GameOver,
	SocketMsgType.PauseGame,
	SocketMsgType.ResumeGame,
]);
const PLAYER_ACTION_TYPES = new Set<SocketMsgType>([
	SocketMsgType.ButtonRegister,
	SocketMsgType.ButtonStateChanged,
	SocketMsgType.ButtonRemove,
	SocketMsgType.MessageCard,
	SocketMsgType.ConfirmDialog,
	SocketMsgType.FormDialog,
	SocketMsgType.TargetSelectDialog,
	SocketMsgType.ItemSelectDialog,
	SocketMsgType.UseChanceCard,
	SocketMsgType.MapPathChoiceRequest,
]);

/** 需要玩家应答、会阻塞 worker 的交互弹窗消息。目标玩家不是当前接管者时必须交接后再投递。 */
const INTERACTION_DIALOG_TYPES = new Set<SocketMsgType>([
	SocketMsgType.ConfirmDialog,
	SocketMsgType.FormDialog,
	SocketMsgType.TargetSelectDialog,
	SocketMsgType.ItemSelectDialog,
]);

/** 结果类操作：按 timeoutId 反查弹窗归属玩家，避免交接切换后结果被错误归属。 */
const DIALOG_RESULT_OPERATE_TYPES = new Set<OperateType>([
	OperateType.ConfirmDialogResult,
	OperateType.FormDialogResult,
	OperateType.TargetSelectDialogResult,
	OperateType.ItemSelectDialogResult,
]);

export class LocalPartySession {
	private room: Room;
	private readonly connections = new Map<string, DataConnection>();
	private readonly recentBroadcastKeys = new Map<string, number>();
	private readonly players = new Map<string, LocalPartyPlayer>();
	/** 等待交接确认后投递的交互弹窗消息队列。 */
	private readonly pendingInteractions: Array<{ recipientId: string; message: ServerSocketMessage }> = [];
	/** 上一帧 handoffPlayerId，用于通过 store 订阅识别交接确认。 */
	private lastHandoffPlayerId = "";
	private unsubscribeStore: (() => void) | null = null;
	private pendingMapLoad:
		| { resolve: () => void; reject: (reason: Error) => void; timer: number }
		| null = null;

	private constructor(
		private readonly roomId: string,
		private readonly onMessage: (message: ServerSocketMessage) => void,
	) {
		this.room = new Room(roomId, { localParty: true });
		this.unsubscribeStore = useLocalParty().$subscribe(() => {
			const localParty = useLocalParty();
			const prevHandoffPlayerId = this.lastHandoffPlayerId;
			this.lastHandoffPlayerId = localParty.handoffPlayerId;
			if (prevHandoffPlayerId && !localParty.handoffPlayerId) {
				// 交接确认：控制权已转移到 activePlayerId，投递属于该玩家的交互弹窗。
				this.flushPendingInteractions(localParty.activePlayerId);
			}
		});
	}

	public static async create(defaultName: string, onMessage: (message: ServerSocketMessage) => void): Promise<LocalPartySession> {
		const session = new LocalPartySession(`local-party-${crypto.randomUUID()}`, onMessage);
		await session.addHuman(defaultName || "本地玩家1", useUserInfo().avatar, useUserInfo().color);
		useLocalParty().start(session.roomId, session.getPlayers());
		return session;
	}

	public isAiPlayer(userId: string): boolean {
		return this.room.isAiPlayer(userId);
	}

	public getPlayers(): LocalPartyPlayer[] {
		return Array.from(this.players.values());
	}

	public async addHuman(username?: string, avatar = "", color?: string): Promise<{ success: boolean; error?: string }> {
		if (this.room.isStarted) return { success: false, error: "游戏开始后不能添加本地玩家" };
		if (this.room.getSeatUserCount() >= MAX_PLAYERS) return { success: false, error: `最多支持 ${MAX_PLAYERS} 名玩家` };
		const name = (username || `本地玩家${this.players.size + 1}`).trim();
		if (!name) return { success: false, error: "玩家名称不能为空" };
		if (Array.from(this.players.values()).some((player) => player.username === name)) return { success: false, error: "玩家名称不能重复" };
		const userId = `local-player-${crypto.randomUUID()}`;
		const player: LocalPartyPlayer = { userId, username: name, avatar, color: color || this.getNextColor() };
		const joined = await this.room.join(this.toUser(player), this.createConnection(userId));
		if (!joined) return { success: false, error: "本地玩家加入失败" };
		if (userId !== this.room.getOwnerId()) this.room.readyToggle(userId);
		this.players.set(userId, player);
		this.syncPlayers();
		return { success: true };
	}

	public updateHumanName(userId: string, username: string): { success: boolean; error?: string } {
		const result = this.room.updateWaitingUserName(userId, username);
		if (!result.success) return result;
		const player = this.players.get(userId);
		if (player) player.username = username.trim();
		this.syncPlayers();
		return result;
	}

	public removeHuman(userId: string): { success: boolean; error?: string } {
		const result = this.room.removeWaitingUser(userId);
		if (!result.success) return result;
		this.players.delete(userId);
		this.connections.delete(userId);
		this.syncPlayers();
		return result;
	}

	public addAIPlayer() {
		return this.room.addAiPlayer();
	}
	public removeAIPlayer(userId: string) {
		return this.room.removeAiPlayer(userId);
	}
	public updateAIPlayerName(userId: string, username: string) {
		return this.room.updateAIPlayerName(userId, username);
	}
	public randomizeAIRoles() {
		return this.room.randomizeAiRoles();
	}
	public changeColorForUser(userId: string, color: string) {
		const result = this.room.changeColor(userId, color);
		if (!result.success) return result;
		const player = this.players.get(userId);
		if (player) {
			player.color = color;
			this.syncPlayers();
		}
		return result;
	}
	public changeRoleForUser(userId: string, roleId: string) {
		return this.room.changeRole(userId, roleId);
	}
	public updateAIDecisionConfig(config: AIDecisionConfig) {
		this.room.updateAIDecisionConfig(config);
	}
	public async changeGameMap(mapInfo: RoomMapInfo): Promise<{ success: boolean; error?: string }> {
		const mapLoad = this.waitForMapLoad();
		try {
			await this.room.changeMap(mapInfo);
			await mapLoad;
			this.room.randomizeRolesForAllPlayers();
			return { success: true };
		} catch (error) {
			const reason = error instanceof Error ? error : new Error("地图加载失败");
			this.rejectPendingMapLoad(reason);
			return { success: false, error: reason.message };
		}
	}
	public requestSave() {
		this.room.requestSave();
	}
	public async loadSave(record: SaveRecord, usePrevious: boolean): Promise<{ success: boolean; error?: string }> {
		const previousMapInfo = this.room.getMapInfo();
		const previousMapId = useMapData().id;
		const previousMapVersion = useMapData().info?.version ?? "0.0.0";
		const canReusePreviousMap = previousMapInfo
			&& previousMapId === record.mapId
			&& previousMapVersion === record.mapVersion;
		const rebuildResult = await this.rebuildHumansForSave(record, usePrevious);
		if (!rebuildResult.success) return rebuildResult;

		const mapInfo = canReusePreviousMap && previousMapInfo
			? previousMapInfo
			: { from: "server" as const, data: record.mapId };
		const mapResult = await this.changeGameMap(mapInfo);
		if (!mapResult.success) return mapResult;

		const loadedMap = useMapData();
		const loadedVersion = loadedMap.info?.version ?? "0.0.0";
		if (loadedMap.id !== record.mapId || loadedVersion !== record.mapVersion) {
			return { success: false, error: "已加载地图与存档不匹配，请先加载存档对应的地图" };
		}
		return this.room.loadSave(record, usePrevious);
	}

	public handleClientMessage(message: ClientSocketMessage): void {
		const payload = message as any;
		const ownerId = this.room.getOwnerId();
		const localParty = useLocalParty();
		const activePlayerId = localParty.activePlayerId;
		// 交接提示尚未确认时，动态按钮同步等操作仍应归属待操作玩家。
		const operationUserId = activePlayerId || localParty.handoffPlayerId || ownerId;
		switch (payload.type) {
			case SocketMsgType.Heart:
				this.onMessage({ type: SocketMsgType.Heart, source: SocketMsgSource.Server, data: undefined });
				break;
			case SocketMsgType.RoomChat:
				this.room.chatBroadcast(payload.data, operationUserId);
				break;
			case SocketMsgType.ReadyToggle:
				this.room.readyToggle(operationUserId);
				break;
			case SocketMsgType.ChangeColor:
				this.room.changeColor(operationUserId, payload.data);
				break;
			case SocketMsgType.ChangeMap:
				void this.changeGameMap(payload.data);
				break;
			case SocketMsgType.MapLocalCheck:
				this.getHumanIds().forEach((playerId) => this.room.handleMapLocalCheck(playerId, payload.data));
				break;
			case SocketMsgType.MapTransferRequest:
				this.getHumanIds().forEach((playerId) => this.room.handleMapTransferRequest(playerId, payload.data));
				break;
			case SocketMsgType.ChangeRole:
				this.room.changeRole(operationUserId, payload.data);
				break;
			case SocketMsgType.ChangeGameSetting:
				this.room.changeGameSetting(payload.data);
				break;
			case SocketMsgType.GameStart:
				void this.room.startGame();
				break;
			case SocketMsgType.Operation:
				this.handleOperation(operationUserId, payload);
				break;
		}
	}

	public destroy(): void {
		this.rejectPendingMapLoad(new Error("本地派对会话已关闭"));
		this.unsubscribeStore?.();
		this.unsubscribeStore = null;
		this.clearPendingInteractions();
		this.room.destory();
		this.connections.clear();
		this.players.clear();
		this.recentBroadcastKeys.clear();
		useLocalParty().reset();
	}

	private waitForMapLoad(): Promise<void> {
		this.rejectPendingMapLoad(new Error("地图加载已被新的请求替换"));
		return new Promise((resolve, reject) => {
			const timer = window.setTimeout(() => {
				this.rejectPendingMapLoad(new Error("地图资源加载超时"));
			}, 65_000);
			this.pendingMapLoad = { resolve, reject, timer };
		});
	}

	private resolvePendingMapLoad(): void {
		const pending = this.pendingMapLoad;
		if (!pending) return;
		this.pendingMapLoad = null;
		window.clearTimeout(pending.timer);
		pending.resolve();
	}

	private rejectPendingMapLoad(reason: Error): void {
		const pending = this.pendingMapLoad;
		if (!pending) return;
		this.pendingMapLoad = null;
		window.clearTimeout(pending.timer);
		pending.reject(reason);
	}

	private handleOperation(defaultPlayerId: string, message: any) {
		const operateType = message.data?.operateType as OperateType;
		const data = message.data?.data;
		const extra = message.extra;
		const localParty = useLocalParty();
		if (operateType === OperateType.GameInitFinished) {
			// 本地派对会把一次页面初始化确认扩展为所有真人玩家的确认。
			// 每个玩家都必须携带独立的 messageId，否则 Worker 会把后续确认判定为重复消息。
			this.getHumanIds().forEach((playerId) => {
				this.room.emitOperation(playerId, operateType, data, { ...extra, messageId: crypto.randomUUID() });
			});
			return;
		}
		if (operateType === OperateType.MapResourceLoaded) {
			this.getHumanIds().forEach((playerId) => this.room.handleMapResourceLoaded(playerId, extra?.mapLoadSessionId, extra));
			this.resolvePendingMapLoad();
			return;
		}
		let playerId = operateType === OperateType.PauseGame || operateType === OperateType.ResumeGame ? this.room.getOwnerId() : defaultPlayerId;
		if (DIALOG_RESULT_OPERATE_TYPES.has(operateType) && typeof data?.timeoutId === "string") {
			// 弹窗结果按 timeoutId 归属到弹窗目标玩家；交接切换导致接管者变化时仍能送回正确的 worker 监听。
			const dialogOwner = localParty.dialogTimeoutOwners[data.timeoutId];
			if (dialogOwner) playerId = dialogOwner;
			delete localParty.dialogTimeoutOwners[data.timeoutId];
		}
		if (playerId) this.room.emitOperation(playerId, operateType, data, extra);
	}

	private createConnection(playerId: string): DataConnection {
		return {
			open: true,
			send: (payload: unknown) => this.receiveRoomPayload(playerId, payload),
		} as DataConnection;
	}

	private receiveRoomPayload(recipientId: string, payload: unknown): void {
		const message = this.parseRoomMessage(payload);
		if (!message) return;
		this.syncTurn(message, recipientId);
		if (message.type === SocketMsgType.ConfirmDialog && this.isCustomMapRiskPrompt(message)) {
			this.room.emitOperation(recipientId, OperateType.ConfirmDialogResult, { id: recipientId, confirm: true });
			return;
		}
		const localParty = useLocalParty();
		const intendedPlayerId = localParty.activePlayerId || localParty.handoffPlayerId;
		if (PLAYER_ACTION_TYPES.has(message.type) && recipientId !== intendedPlayerId) {
			// 交互弹窗不能静默丢弃：切换交接给目标玩家，确认后投递，否则 worker 只能等超时拿默认值。
			if (INTERACTION_DIALOG_TYPES.has(message.type)) this.queueInteraction(recipientId, message);
			return;
		}
		if (INTERACTION_DIALOG_TYPES.has(message.type)) this.trackDialogOwner(message, recipientId);
		if (BROADCAST_TYPES.has(message.type) && this.isDuplicateBroadcast(message)) return;
		if (!BROADCAST_TYPES.has(message.type) && !PLAYER_ACTION_TYPES.has(message.type) && recipientId !== this.getPreferredReceiverId()) return;
		this.onMessage(message);
	}

	private parseRoomMessage(payload: unknown): ServerSocketMessage | null {
		if (typeof payload === "string") {
			try {
				return JSON.parse(payload, (_key, value) => value === "Infinity" ? Infinity : value === "-Infinity" ? -Infinity : value) as ServerSocketMessage;
			} catch {
				return null;
			}
		}
		const bytes = payload instanceof ArrayBuffer
			? new Uint8Array(payload)
			: ArrayBuffer.isView(payload) ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength) : null;
		if (!bytes || bytes.length < 5 || bytes[0] !== 1) return null;
		const sessionLength = bytes[1];
		const indexOffset = 2 + sessionLength;
		const dataOffset = indexOffset + 4;
		const sessionId = sessionLength > 0 && bytes.length >= dataOffset ? new TextDecoder().decode(bytes.slice(2, indexOffset)) : "";
		const isNewPacket = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId);
		const index = isNewPacket
			? (((bytes[indexOffset] << 24) | (bytes[indexOffset + 1] << 16) | (bytes[indexOffset + 2] << 8) | bytes[indexOffset + 3]) >>> 0)
			: (((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0);
		return {
			type: SocketMsgType.MapChunk,
			source: SocketMsgSource.Server,
			data: isNewPacket ? { mapLoadSessionId: sessionId, chunkIndex: index, data: bytes.slice(dataOffset) } : { chunkIndex: index, data: bytes.slice(5) },
		};
	}

	private syncTurn(message: ServerSocketMessage, _recipientId: string) {
		let playerId = "";
		let forceHandoff = false;
		if (message.type === SocketMsgType.GameInit) {
			playerId = (message.data as any)?.currentPlayerIdInRound || "";
			forceHandoff = true;
		} else if (message.type === SocketMsgType.GameData) {
			playerId = (message.data as any)?.currentPlayerIdInRound || "";
		} else if (message.type === SocketMsgType.RoundTurn) {
			playerId = message.data as string;
		}
		if (!playerId) return;
		const localParty = useLocalParty();
		if (localParty.currentTurnPlayerId && localParty.currentTurnPlayerId !== playerId) {
			// 回合已切换，说明此前等待的交互弹窗已被 worker 超时跳过，丢弃避免过期弹窗再次交接。
			this.clearPendingInteractions();
		}
		localParty.setTurn(playerId, this.players.has(playerId), forceHandoff);
	}

	private queueInteraction(recipientId: string, message: ServerSocketMessage): void {
		this.trackDialogOwner(message, recipientId);
		this.pendingInteractions.push({ recipientId, message });
		const localParty = useLocalParty();
		localParty.hasPendingInteraction = true;
		// 没有待确认的交接时立即把控制权交给弹窗目标玩家；已有交接则等其确认后由 flush 推进。
		if (!localParty.handoffVisible) localParty.setTurn(recipientId, true, true);
	}

	private flushPendingInteractions(activePlayerId: string): void {
		const remaining: Array<{ recipientId: string; message: ServerSocketMessage }> = [];
		for (const item of this.pendingInteractions) {
			if (item.recipientId !== activePlayerId) {
				remaining.push(item);
				continue;
			}
			this.trackDialogOwner(item.message, item.recipientId);
			this.onMessage(item.message);
		}
		this.pendingInteractions.length = 0;
		this.pendingInteractions.push(...remaining);
		useLocalParty().hasPendingInteraction = this.pendingInteractions.length > 0;
		// 队列里还有其他玩家的弹窗时，继续发起下一次交接。
		const next = this.pendingInteractions[0];
		if (next && !useLocalParty().handoffVisible) useLocalParty().setTurn(next.recipientId, true, true);
	}

	private clearPendingInteractions(): void {
		if (!this.pendingInteractions.length) return;
		this.pendingInteractions.length = 0;
		useLocalParty().hasPendingInteraction = false;
	}

	private trackDialogOwner(message: ServerSocketMessage, recipientId: string): void {
		const timeoutId = (message.data as any)?.timeoutId;
		if (typeof timeoutId !== "string" || !timeoutId) return;
		const localParty = useLocalParty();
		const owners = localParty.dialogTimeoutOwners;
		if (Object.keys(owners).length > 100) {
			for (const key of Object.keys(owners)) delete owners[key];
		}
		owners[timeoutId] = recipientId;
	}

	private isCustomMapRiskPrompt(message: ServerSocketMessage): boolean {
		const option = (message.data as any)?.option;
		return typeof option?.title === "string" && option.title.includes("非官方地图");
	}

	private isDuplicateBroadcast(message: ServerSocketMessage): boolean {
		const now = Date.now();
		for (const [key, timestamp] of this.recentBroadcastKeys) {
			if (now - timestamp > 1000) this.recentBroadcastKeys.delete(key);
		}
		const key = JSON.stringify(message, (_key, value) => value instanceof Uint8Array ? Array.from(value) : value);
		if (this.recentBroadcastKeys.has(key)) return true;
		this.recentBroadcastKeys.set(key, now);
		return false;
	}

	private getPreferredReceiverId(): string {
		return useLocalParty().activePlayerId || this.room.getOwnerId();
	}
	private getHumanIds(): string[] {
		return Array.from(this.players.keys());
	}

	private getNextColor(): string {
		const colors = ["#4f83ff", "#00a6a6", "#ff8a3d", "#e85d75", "#7c6cff", "#22c55e"];
		return colors[this.players.size % colors.length];
	}
	private toUser(player: LocalPartyPlayer): User {
		return { userId: player.userId, username: player.username, avatar: player.avatar, color: player.color } as User;
	}
	private syncPlayers(): void {
		useLocalParty().setPlayers(this.getPlayers());
	}

	private async rebuildHumansForSave(record: SaveRecord, usePrevious: boolean): Promise<{ success: boolean; error?: string }> {
		if (this.room.isStarted) return { success: false, error: "游戏进行中不能读取存档" };
		const snapshot = usePrevious ? record.previousSnapshot : record.snapshot;
		if (!snapshot) return { success: false, error: "没有可用的存档数据" };
		const humanIds = record.playerUserIds.filter((playerId) => snapshot.playerSnapshots[playerId]?.isAI !== true);
		if (!humanIds.length) return { success: false, error: "存档中没有真人玩家" };
		this.room.destory();
		this.connections.clear();
		this.players.clear();
		this.room = new Room(this.roomId, { localParty: true });
		for (const [index, userId] of humanIds.entries()) {
			const player: LocalPartyPlayer = {
				userId,
				username: record.playerNames[record.playerUserIds.indexOf(userId)] || `本地玩家${index + 1}`,
				avatar: "",
				color: this.getNextColor(),
			};
			const joined = await this.room.join(this.toUser(player), this.createConnection(userId));
			if (!joined) return { success: false, error: "重建本地玩家失败" };
			if (userId !== this.room.getOwnerId()) this.room.readyToggle(userId);
			this.players.set(userId, player);
		}
		this.syncPlayers();
		return { success: true };
	}
}
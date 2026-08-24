import { FPMessage } from "@mine-monopoly/ui";
import { useChat, useGameLog, useLoading, useRoomInfo, useUserInfo, useUtil } from "@src/store";
import { useGameData } from "@src/store/game";
import { emitHostPeerId, getRoomSessionStatus, joinRoomApi } from "@src/utils/api/room-router";
import { WebRtcSessionManager, SessionSendResult } from "@src/core/network/WebRtcSessionManager";
import {
	AIDecisionConfig,
	RoomMapInfo,
	GameSetting,
	OperateType,
	SocketMsgSource,
	SocketMsgType,
	ClientSocketMessage,
} from "@mine-monopoly/types";
import { handleServerSocketMessage } from "./host-message-handlers";
import router from "@src/router";
import { connectionDiagnostics } from "@src/utils/connection-diagnostics";

type MonopolyClientOptions = {
	iceServer: {
		host: string;
		port: number;
	};
};


export class MonopolyClient {
	private static instance: MonopolyClient | null;
	private session: WebRtcSessionManager;
	private currentInitSessionId: string | null = null;

	public static getInstance(): MonopolyClient;
	public static getInstance(options: MonopolyClientOptions): Promise<MonopolyClient>;
	public static getInstance(options?: MonopolyClientOptions) {
		if (this.instance) {
			return this.instance;
		}
		if (options) {
			return (async () => {
				this.instance = new MonopolyClient(options);
				this.instance.installConsoleTestApi();

				return this.instance;
			})();
		} else {
			// if (!this.instance) {
			// 	throw Error("在调用MonopolyClient之前应该先对其初始化, 使用useMonopolyClient时提供options以初始化");
			// }
			return this.instance;
		}
	}

	private constructor(options: MonopolyClientOptions) {
		this.session = new WebRtcSessionManager({
			iceServer: options.iceServer,
			onMessage: (data) => {
				// PauseGame/ResumeGame 由专用暂停弹窗展示，不走通用 toast，避免与 handleGamePause 重复弹出
				if (
					data.msg &&
					data.type !== SocketMsgType.LeaveRoom &&
					data.type !== SocketMsgType.GameOver &&
					data.type !== SocketMsgType.PauseGame &&
					data.type !== SocketMsgType.ResumeGame
				) {
					useLoading().hideLoading();
					FPMessage({ type: data.msg.type, message: data.msg.content });
				}
				handleServerSocketMessage(data, this);
			},
			onHeartbeat: (ping) => { useUtil().ping = ping; },
			onReconnectAttempt: (attempt, strategy) => {
				useUtil().connectionReconnectAttempt = attempt;
				useUtil().connectionPolicy = strategy === "force-relay" ? "relay" : "auto";
			},
			onStateChange: (state, detail) => {
				useUtil().connectionStatusText = state;
				useUtil().connectionStatusReason = detail || "";
				useUtil().connectionMode = state === "connected" ? (this.session.isLocalParty() ? "local" : this.session.getConnectionStrategy() === "force-relay" ? "relay" : "p2p") : "unknown";
			},
			onHostClosed: (status) => {
				this.handleDisconnect({
					type: "error",
					content: status === "expired" ? "房间已过期" : "房主已退出，房间已关闭",
				});
			},
			onReconnectCancelled: () => {
				this.handleDisconnect({ type: "warning", content: "已停止恢复连接，已离开房间" });
			},
		});
	}

	public async joinRoom(roomId: string): Promise<boolean> {
		connectionDiagnostics.reset();
		connectionDiagnostics.stageStart("joinRoom_Total");
		try {
			// 上一局若在暂停中异常结束，加入新房间时必须清理本地暂停 UI 状态。
			useUtil().gamePaused = false;
			const response = await joinRoomApi(roomId);
			const data = response.data;
			this.session.setIceServers(data.iceServers || []);
			let hostPeerId = data.hostPeerId;
			if (data.needCreate) {
				useLoading().showLoading("正在创建主机...");
				const user = useUserInfo();
				hostPeerId = await this.session.createHost(roomId, data.heartbeatIntervalMs ?? data.deleteIntervalMs, {
					hostLeaseToken: data.hostLeaseToken,
					hostEpoch: data.hostEpoch,
					hostName: user.username,
					hostId: user.userId,
				});
				await emitHostPeerId(roomId, hostPeerId, user.username, user.userId, data.hostLeaseToken);
			}
			if (!hostPeerId) throw new Error("房主尚未就绪，请稍后重试");
			useLoading().showLoading("正在建立连接...");
			await this.session.connect(roomId, hostPeerId, () => useRoomInfo().isReady);
			connectionDiagnostics.stageEnd("joinRoom_Total");
			return true;
		} catch (error: any) {
			// 优先展示服务端返回的友好提示(如"房间已过期/已关闭/房主租约无效"),避免暴露 axios 原文
			const serverMsg = error?.response?.data?.msg;
			const message = serverMsg || error?.message || "服务器连接失败";
			connectionDiagnostics.stageFail("joinRoom_Total", message);
			FPMessage({ type: "error", message });
			return false;
		}
	}

	public async createLocalParty(defaultName: string): Promise<void> {
		useUtil().gamePaused = false;
		await this.session.createLocalParty(defaultName);
	}
	public addLocalPartyPlayer(): Promise<{ success: boolean; error?: string }> { return this.session.addLocalPartyPlayer(); }
	public updateLocalPartyPlayerName(userId: string, username: string): { success: boolean; error?: string } {
		return this.session.updateLocalPartyPlayerName(userId, username);
	}
	public removeLocalPartyPlayer(userId: string): { success: boolean; error?: string } {
		return this.session.removeLocalPartyPlayer(userId);
	}

	public cancelReconnection(): void { this.session.cancelReconnection(); }
	public isReconnecting(): boolean { return this.session.isReconnecting(); }
	public handleHeartReply(): void { this.session.handleHeartbeatReply(); }
	public initHeartBeat(): void {}
	public pauseHeartBeat(): void { this.session.pauseHeartbeat(); }
	public resumeHeartBeat(): void { this.session.resumeHeartbeat(); }
	public sendLoadingStarted(): void {
		void this.sendMsg({ type: SocketMsgType.Operation, source: SocketMsgSource.Client, data: { operateType: OperateType.LoadingStarted, data: undefined } });
	}
	public registerGameInitSession(initSessionId?: string): void { this.currentInitSessionId = initSessionId || null; }
	private handleDisconnect(notification: { type: "info" | "success" | "warning" | "error"; content: string }): void {
		useUtil().gamePaused = false;
		useGameData().$reset(); useRoomInfo().$reset(); useChat().$reset(); useGameLog().$reset();
		this.destory();
		void router.replace({ name: "room-router" }).finally(() => {
			FPMessage({ type: notification.type, message: notification.content });
		});
	}

	public sendRoomChatMessage(message: string, roomId: string) {
		this.sendMsg({ type: SocketMsgType.RoomChat, source: SocketMsgSource.Client, data: message });
	}

	public async leaveRoom() {
		useUtil().gamePaused = false;
		await this.sendMsg({ type: SocketMsgType.LeaveRoom, source: SocketMsgSource.Client, data: undefined });
		this.session.pauseHeartbeat();
	}

	public readyToggle() {
		this.sendMsg({ type: SocketMsgType.ReadyToggle, source: SocketMsgSource.Client, data: undefined });
	}

	public changeColor(newColor: string) {
		this.sendMsg({ type: SocketMsgType.ChangeColor, source: SocketMsgSource.Client, data: newColor });
	}

	public changeColorForUser(userId: string, newColor: string): { success: boolean; error?: string } {
		if (this.session.isLocalParty() || this.session.isAiPlayer(userId)) return this.session.changeColorForUser(userId, newColor);
		if (userId === useUserInfo().userId) { this.changeColor(newColor); return { success: true }; }
		return { success: false, error: "当前只支持房主修改 AI 玩家颜色" };
	}

	public kickOut(playerId: string) {
		if (this.session.isAiPlayer(playerId)) { this.session.removeAIPlayer(playerId); return; }
		if (this.session.isLocalParty()) return this.session.removeLocalPartyPlayer(playerId);
		void this.sendMsg({ type: SocketMsgType.KickOut, source: SocketMsgSource.Client, data: playerId });
	}

	public addAIPlayer(): { success: boolean; error?: string } { return this.session.addAIPlayer(); }

	public randomizeAIRoles(): { success: boolean; error?: string } {
		return this.session.randomizeAIRoles() ? { success: true } : { success: false, error: "当前没有可随机分配的 AI 玩家或地图没有角色" };
	}

	public setSpectatorMode(enabled: boolean): { success: boolean; error?: string } { return this.session.setSpectatorMode(enabled); }

	public changeRoleForUser(userId: string, roleId: string): { success: boolean; error?: string } {
		if (this.session.isLocalParty() || this.session.isAiPlayer(userId)) return this.session.changeRoleForUser(userId, roleId);
		if (userId === useUserInfo().userId) { this.changeRole(roleId); return { success: true }; }
		return { success: false, error: "当前只支持房主修改 AI 玩家角色" };
	}

	public changeRole(roleId: string) {
		this.sendMsg({ type: SocketMsgType.ChangeRole, source: SocketMsgSource.Client, data: roleId });
	}

	public updateAIPlayerName(userId: string, username: string): { success: boolean; error?: string } {
		return this.session.updateAIPlayerName(userId, username);
	}

	public async changeGameMap(msg: RoomMapInfo): Promise<{ success: boolean; error?: string }> {
		if (this.session.isLocalParty()) return this.session.changeLocalPartyMap(msg);
		if (this.session.changeGameMap(msg)) return { success: true };
		const result = await this.sendMsg({ type: SocketMsgType.ChangeMap, source: SocketMsgSource.Client, data: msg });
		return result.ok ? { success: true } : { success: false, error: "地图切换请求发送失败" };
	}

	public changeGameSetting(gameSetting: GameSetting) {
		this.sendMsg({ type: SocketMsgType.ChangeGameSetting, source: SocketMsgSource.Client, data: gameSetting });
	}

	public updateAIDecisionConfig(config: AIDecisionConfig): { success: boolean; error?: string } {
		this.session.updateAIDecisionConfig(config);
		return { success: true };
	}

	public startGame() {
		this.sendMsg({ type: SocketMsgType.GameStart, source: SocketMsgSource.Client, data: undefined });
	}

	/**
	 * 请求暂停游戏：房主直接暂停；其他玩家发送请求，由房主代为执行
	 */
	public pauseGame() {
		this.sendMsg({
			type: SocketMsgType.Operation,
			source: SocketMsgSource.Client,
			data: { operateType: OperateType.PauseGame, data: undefined },
		});
	}

	/**
	 * 请求恢复游戏：房主直接恢复；其他玩家发送请求，由房主代为执行
	 */
	public resumeGame() {
		this.sendMsg({
			type: SocketMsgType.Operation,
			source: SocketMsgSource.Client,
			data: { operateType: OperateType.ResumeGame, data: undefined },
		});
	}

	/**
	 * 开发环境控制台测试入口。仅在 Vite DEV 模式下挂到 window.__MM_TEST__，不参与正式功能。
	 * 可用于验证暂停、P2P 重连、房主心跳与房间状态，避免人工等待 UI 操作。
	 */
	private installConsoleTestApi(): void {
		if (!import.meta.env.DEV) return;
		const getClientState = () => ({
			roomId: useRoomInfo().roomId,
			gamePaused: useUtil().gamePaused,
			connectionState: this.session.getState(),
			connectionStrategy: this.session.getConnectionStrategy(),
			isRoomOwner: useRoomInfo().amIRoomOwner,
			isP2pHost: this.session.hasLocalHost(),
		});
		(window as any).__MM_TEST__ = {
			help: [
				"state()", "pause()", "resume()", "roomStatus()", "sendHostHeartbeat()",
				"dropP2pConnection()", "reconnect()", "gameProcessState()",
			],
			state: getClientState,
			pause: () => this.pauseGame(),
			resume: () => this.resumeGame(),
			roomStatus: async () => {
				const roomId = useRoomInfo().roomId;
				if (!roomId) throw new Error("当前未加入房间");
				return (await getRoomSessionStatus(roomId)).data;
			},
			sendHostHeartbeat: async () => {
				if (!this.session.hasLocalHost()) {
					return { ok: false, reason: "当前页面未持有 P2P 主机实例；请检查 state().isP2pHost" };
				}
				return this.session.debugSendHostHeartbeat();
			},
			dropP2pConnection: () => this.session.debugDropP2pConnection(),
			reconnect: () => this.session.debugReconnectNow(),
			gameProcessState: () => {
				const bridge = (window as any).__gpBridge;
				if (!bridge?.requestState) throw new Error("游戏进程尚未初始化");
				return new Promise((resolve, reject) => {
					const previousHandler = bridge.onState;
					const timeout = window.setTimeout(() => {
						bridge.onState = previousHandler;
						reject(new Error("获取游戏进程状态超时"));
					}, 5000);
					bridge.onState = (state: unknown) => {
						window.clearTimeout(timeout);
						bridge.onState = previousHandler;
						resolve(state);
					};
					bridge.requestState();
				});
			},
		};
		console.info("[MM_TEST] 控制台测试 API 已就绪", (window as any).__MM_TEST__.help);
	}

	public requestSave(): void { this.session.requestSave(); }
	public async loadSave(record: any, usePrevious: boolean = false): Promise<{ success: boolean; error?: string }> { return this.session.loadSave(record, usePrevious); }
	public gameInitFinished() {
		return this.sendMsg({ type: SocketMsgType.Operation, source: SocketMsgSource.Client, data: { operateType: OperateType.GameInitFinished, data: undefined }, extra: { initSessionId: this.currentInitSessionId, initStatus: "ready", messageId: crypto.randomUUID() } });
	}
	public gameInitFailed(reason: string) {
		return this.sendMsg({ type: SocketMsgType.Operation, source: SocketMsgSource.Client, data: { operateType: OperateType.GameInitFinished, data: undefined }, extra: { initSessionId: this.currentInitSessionId, initStatus: "failed", reason, messageId: crypto.randomUUID() } });
	}

	public chooseMapPath(requestId: string, pathId: string) {
		this.sendMsg({
			type: SocketMsgType.Operation,
			source: SocketMsgSource.Client,
			data: { operateType: OperateType.ChooseMapPath, data: { requestId, pathId } },
		});
	}

	public rollDice() {
		// 客户端立即锁定，防止重复点击
		const utilStore = useUtil();
		utilStore.startAnimation();

		this.sendMsg({
			type: SocketMsgType.Operation,
			source: SocketMsgSource.Client,
			data: { operateType: OperateType.RollDice, data: undefined },
		});
	}

	public useChanceCard(chanceCardId: string, targetIdList: string[]) {
		// 客户端立即锁定，防止重复点击
		const utilStore = useUtil();
		utilStore.startAnimation();

		this.sendMsg({
			type: SocketMsgType.Operation,
			source: SocketMsgSource.Client,
			data: {
				operateType: OperateType.UseChanceCard,
				data: { chanceCardId, targetIdList },
			},
		});
	}

	public sendDynamicButtonClick(buttonId: string) {
		this.sendMsg({
			type: SocketMsgType.Operation,
			source: SocketMsgSource.Client,
			data: {
				operateType: OperateType.DynamicButtonClick,
				data: { buttonId, success: true },
			},
		});
	}

	public AnimationComplete(animationId: string) {
		this.sendMsg({
			type: SocketMsgType.Operation,
			source: SocketMsgSource.Client,
			data: {
				operateType: OperateType.Animation,
				data: animationId,
			},
		});

		// 动画完成后解锁状态
		const utilStore = useUtil();
		utilStore.endAnimation();
	}

	public async sendMsg(msg: ClientSocketMessage): Promise<SessionSendResult> {
		const result = this.session.send(msg);
		if (!result.ok) console.warn("[MonopolyClient] 消息未发送", msg.type, result.reason);
		return result;
	}

	public destory() { void this.session.close(); }

	public static destoryInstance() {
		if (this.instance) {
			this.instance.destory();
			this.instance = null;
		}
		// 移除 beforeunload 事件监听器
		window.removeEventListener("beforeunload", destoryMonopolyClient);
	}
}

function useMonopolyClient(): MonopolyClient;
function useMonopolyClient(options: MonopolyClientOptions): Promise<MonopolyClient>;
function useMonopolyClient(options?: MonopolyClientOptions) {
	window.addEventListener("beforeunload", destoryMonopolyClient, { once: true });
	return options ? MonopolyClient.getInstance(options) : MonopolyClient.getInstance();
}

function destoryMonopolyClient() {
	try {
		MonopolyClient.getInstance() && MonopolyClient.destoryInstance();
	} catch (e) {
		console.log(e);
	}
}

export { useMonopolyClient, destoryMonopolyClient };

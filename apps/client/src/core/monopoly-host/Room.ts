import {
	AIDecisionConfig,
	AIPlayerDecisionBinding,
	AIDecisionRequest,
	AIRemoteLLMConfig,
	AIRemoteLLMProfile,
	Role,
	GameOverRule,
	ChatMessageType,
	SocketMsgType,
	ChangeRoleOperate,
	OperateType,
	SocketMsgSource,
	UserInRoomInfo,
	User,
	ChatMessage,
	GameSetting,
	RoomInfo,
	ServerSocketMessage,
	SocketMessage,
	SocketMessageDataType,
	PlayerOperationResult,
	RoomMapInfo,
	MapChunkStartData,
	MapChunkData,
	MapChunkEndData,
	MapChunkAbortData,
} from "@mine-monopoly/types";
import { WorkerCommType, WorkerState } from "@src/enums/worker";
import { WorkerCommMsg, HeartbeatData, WorkerStateChangedData, GMAction, GMActionResponseData, GameProcessDebugState } from "@src/interfaces/worker";
import { useLoading, useDeviceStatus, useSettig } from "@src/store";
import { randomString } from "@src/utils";
import { getGameMapById } from "@src/utils/api/map";
import { setRoomStarted } from "@src/utils/api/room-router";
import { clearAIRemoteUsageStats, getAIRemoteUsageSnapshot } from "@src/core/ai/remote-usage-stats";
import { DataConnection } from "peerjs";
import GameProcessWorker from "@src/core/worker/GameProcessWorker?worker";
import { getGameMap } from "@src/utils/file/game-map";
import { useMapData } from "@src/store/game";
import { FPMessage } from "@mine-monopoly/ui";
import logService, { ErrorCategory, logWorkerError, logErrorWithOptions } from "@src/utils/log";
import { OperateListener } from "../worker/class/OperateListener";
import { base64ToArrayBuffer } from "@mine-monopoly/utils";
import { SaveManager, SaveRecord, SaveSnapshot } from "@src/core/save";
import { createAIDecisionProviderFromConfig, createRemoteAIDecisionProvider } from "@src/core/ai/OpenAICompatibleDecisionProvider";
import { normalizeAIDecisionConfig, normalizeAIDecisionMode, normalizeRemoteLLMConfig } from "@src/core/ai/ai-decision-config";

interface UserInRoom extends UserInRoomInfo {
	socketClient: DataConnection;
	isOffLine: boolean;
}

/**
 * 地图分块传输状态
 */
/**
 * 地图分块二进制包类型标记
 * 包格式: [1 字节 type][4 字节 chunkIndex 大端序][chunk 原始字节]
 *
 * 可靠性说明：DataConnection 使用 reliable + ordered 的 RTCDataChannel（SCTP 层自带
 * 丢包重传与有序投递），PeerJS 内部还会对超过 MTU 的大消息自动分包重组。
 * 因此应用层无需 ACK/重传协议——按序发完所有块后发送 MapChunkEnd，客机端保证最后收到。
 */
const MAP_CHUNK_BIN_TYPE = 1;

export class Room {
	private mapInfo: RoomMapInfo | undefined;
	private roomId: string;
	private userList: Map<string, UserInRoom>;
	private aiUserList: Map<string, UserInRoomInfo>;
	private ownerId: string = "";
	private ownerSpectatorMode: boolean;
	private gameSetting: GameSetting;
	private aiDecisionConfig: AIDecisionConfig;
	private aiPlayerBindings: Map<string, AIPlayerDecisionBinding>;
	private gameProcessWorker: Worker | null = null;
	private gameProcess: any = null; // 存储从worker传递的gameProcess引用
	public isStarted: boolean;
	private operationListener: OperateListener;
	private saveManager: SaveManager = new SaveManager();
	private pendingSaveData: { snapshot: any; aiPlayerIds: string[] } | null = null;
	/** GM 操作响应处理 Map */
	private pendingGMResponses = new Map<string, { resolve: (value: GMActionResponseData) => void, timeout: ReturnType<typeof setTimeout> }>();
	private pendingDebugStateResolvers = new Set<{
		resolve: (value: GameProcessDebugState | null) => void;
		timeout: ReturnType<typeof setTimeout>;
	}>();

	// 状态管理相关属性
	private workerState: WorkerState = WorkerState.Uninitialized;
	private safeModeReason: string = "";
	private lastKnownGameState: HeartbeatData["gameState"] | null = null;
	private heartbeatTimeout: number | null = null;
	/** 分块大小（字节） */
	private readonly CHUNK_SIZE = 64 * 1024; // 64KB
	/** 整体传输超时基础值（毫秒），实际按块数动态计算（下发客机端兜底） */
	private readonly TRANSFER_TIMEOUT = 60000;
	/** 每块预估传输时间（毫秒），用于动态整体超时估算（覆盖 TURN 中继等慢链路） */
	private readonly CHUNK_ESTIMATED_TIME = 3000;
	/** 整体传输超时上限（毫秒） */
	private readonly TRANSFER_TIMEOUT_MAX = 300000;
	private initTimeoutTimer: number | null = null;
	private initSessionId: string | null = null;
	// 标记是否正在手动请求快照（避免重复保存）
	private isManuallyRequestingSnapshot: boolean = false;
	// 标记是否正在进入安全模式（防止重复调用）
	private enteringSafeMode: boolean = false;

	private static readonly HEARTBEAT_NORMAL_TIMEOUT = 15000;
	private static readonly HEARTBEAT_BUSY_TIMEOUT = 60000;
	private static readonly INIT_TIMEOUT = 65000;
	private static readonly MAX_ROOM_PLAYERS = 6;
	private static readonly AI_COLOR_PALETTE = [
		"#4f83ff",
		"#00a6a6",
		"#ff8a3d",
		"#e85d75",
		"#7c6cff",
		"#ff5d8f",
		"#22c55e",
		"#eab308",
		"#06b6d4",
		"#ef4444",
		"#8b5cf6",
		"#14b8a6",
		"#f97316",
		"#ec4899",
		"#3b82f6",
		"#84cc16",
		"#f43f5e",
		"#6366f1",
		"#10b981",
		"#f59e0b",
	];

	constructor(roomId: string) {
		this.roomId = roomId;
		this.ownerId = "";
		this.ownerSpectatorMode = false;
		this.isStarted = false;
		this.userList = new Map();
		this.aiUserList = new Map();
		this.aiPlayerBindings = new Map();
		this.gameSetting = {};
		this.aiDecisionConfig = normalizeAIDecisionConfig(useSettig().aiDecisionConfig);
		this.operationListener = new OperateListener();
		// 暴露 Room 实例给 Inspector 窗口（dev only）
		(window as any).__roomInstance = this;
	}

	public getRoomId() {
		return this.roomId;
	}

	public getOwner() {
		return {
			userId: this.ownerId,
			username: this.userList.get(this.ownerId)?.username || "",
		};
	}

	public getOwnerId(): string {
		return this.ownerId;
	}

	public getUserList(): UserInRoom[] {
		return Array.from(this.userList.values());
	}

	public isAiPlayer(userId: string): boolean {
		return this.aiUserList.has(userId);
	}

	public addAiPlayer(): { success: boolean; error?: string } {
		if (this.isStarted) {
			return { success: false, error: "游戏开始后不能添加 AI 玩家" };
		}
		if (this.getSeatUsers().length >= Room.MAX_ROOM_PLAYERS) {
			return { success: false, error: `房间最多支持 ${Room.MAX_ROOM_PLAYERS} 名玩家` };
		}

		const aiIndex = this.aiUserList.size + 1;
		const aiUser: UserInRoomInfo = {
			userId: `ai-${randomString(12)}`,
			username: `AI玩家${aiIndex}`,
			isReady: true,
			avatar: "",
			color: this.getNextAiColor(),
			roleId: "",
			isAI: true,
		};
		this.assignRandomRoleToAiUser(aiUser);
		this.aiUserList.set(aiUser.userId, aiUser);
		this.aiPlayerBindings.delete(aiUser.userId);
		this.roomBroadcast({
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
			msg: { type: "info", content: `${aiUser.username}加入了房间` },
		});
		this.roomInfoBroadcast();
		return { success: true };
	}

	public removeAiPlayer(userId: string): boolean {
		const aiUser = this.aiUserList.get(userId);
		if (!aiUser) return false;
		if (this.isStarted) return false;

		this.aiUserList.delete(userId);
		this.aiPlayerBindings.delete(userId);
		this.roomBroadcast({
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
			msg: { type: "warning", content: `${aiUser.username}离开了房间` },
		});
		this.roomInfoBroadcast();
		return true;
	}

	private getRoomUserInfo(user: UserInRoom): UserInRoomInfo {
		return {
			userId: user.userId,
			username: user.username,
			isReady: user.isReady,
			color: user.color,
			avatar: user.avatar,
			roleId: user.roleId,
			isAI: false,
			isSpectator: this.isSpectatorUser(user.userId),
		};
	}

	private getAllRoomUsers(): UserInRoomInfo[] {
		return [
			...Array.from(this.userList.values()).map((user) => this.getRoomUserInfo(user)),
			...Array.from(this.aiUserList.values()),
		];
	}

	private getSeatUsers(): UserInRoomInfo[] {
		return this.getAllRoomUsers().filter((user) => !user.isSpectator);
	}

	private getGameParticipants(): UserInRoomInfo[] {
		return this.getSeatUsers();
	}

	private getParticipatingHumanUserIds(): string[] {
		return Array.from(this.userList.keys()).filter((userId) => !this.isSpectatorUser(userId));
	}

	private isSpectatorUser(userId: string): boolean {
		return userId === this.ownerId && this.ownerSpectatorMode;
	}

	private getNextAiColor(): string {
		const usedColors = new Set(
			this.getAllRoomUsers()
				.map((user) => user.color?.trim().toLowerCase())
				.filter(Boolean),
		);
		const availableColors = Room.AI_COLOR_PALETTE.filter((color) => !usedColors.has(color.toLowerCase()));

		if (availableColors.length > 0) {
			return availableColors[Math.floor(Math.random() * availableColors.length)];
		}

		return Room.AI_COLOR_PALETTE[Math.floor(Math.random() * Room.AI_COLOR_PALETTE.length)];
	}

	private getRandomRoleId(): string | null {
		const roles = useMapData().roles;
		if (roles.length === 0) return null;
		return roles[Math.floor(Math.random() * roles.length)]?.id ?? null;
	}

	private assignRandomRoleToAiUser(aiUser: UserInRoomInfo): boolean {
		const roleId = this.getRandomRoleId();
		if (!roleId) return false;
		aiUser.roleId = roleId;
		aiUser.isReady = true;
		return true;
	}

	private removeLastAiPlayerForSeatCapacity(): boolean {
		const lastAiUserId = Array.from(this.aiUserList.keys()).at(-1);
		if (!lastAiUserId) return false;
		return this.removeAiPlayer(lastAiUserId);
	}

	public randomizeAiRoles(targetUserId?: string): boolean {
		const targets = targetUserId ? [this.aiUserList.get(targetUserId)].filter(Boolean) : Array.from(this.aiUserList.values());
		if (targets.length === 0) return false;
		for (const aiUser of targets) {
			if (!this.assignRandomRoleToAiUser(aiUser!)) {
				return false;
			}
		}
		this.roomInfoBroadcast();
		return true;
	}

	public setOwnerSpectatorMode(enabled: boolean): { success: boolean; error?: string } {
		if (!this.userList.has(this.ownerId)) {
			return { success: false, error: "房主未在房间中" };
		}
		if (this.isStarted) {
			return { success: false, error: "游戏开始后不能切换旁观模式" };
		}
		if (this.ownerSpectatorMode === enabled) {
			return { success: true };
		}

		if (!enabled) {
			while (this.getSeatUsers().length >= Room.MAX_ROOM_PLAYERS) {
				if (!this.removeLastAiPlayerForSeatCapacity()) {
					return { success: false, error: "房间已满，无法退出旁观模式" };
				}
			}
		}

		this.ownerSpectatorMode = enabled;
		this.roomBroadcast({
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
			msg: {
				type: "info",
				content: enabled ? "房主将以旁观者身份开局" : "房主将重新参与本局",
			},
		});
		this.roomInfoBroadcast();
		return { success: true };
	}

	private ensureAiPlayersReadyForStart(): { success: boolean; error?: string } {
		const invalidAiUser = Array.from(this.aiUserList.values()).find((user) => {
			if (user.roleId) return false;
			return !this.assignRandomRoleToAiUser(user);
		});
		if (invalidAiUser) {
			return { success: false, error: `${invalidAiUser.username}未能分配角色` };
		}
		return { success: true };
	}

	private ensureAiPlayersForSave(record: SaveRecord, aiPlayerIds: string[]): void {
		for (const playerId of aiPlayerIds) {
			if (this.aiUserList.has(playerId)) continue;
			const nameIndex = record.playerUserIds.indexOf(playerId);
			const snapshotRoleId = record.snapshot.playerSnapshots[playerId]?.roleId ?? "";
			this.aiUserList.set(playerId, {
				userId: playerId,
				username: record.playerNames[nameIndex] || `AI玩家-${playerId.slice(0, 4)}`,
				isReady: true,
				avatar: "",
				color: this.getNextAiColor(),
				roleId: snapshotRoleId,
				isAI: true,
			});
		}
		for (const playerId of aiPlayerIds) {
			this.aiPlayerBindings.delete(playerId);
		}
	}

	private getUserNameById(userId: string): string {
		return this.userList.get(userId)?.username ?? this.aiUserList.get(userId)?.username ?? `Player-${userId.slice(0, 4)}`;
	}

	private abbreviateAIChatText(text: string | undefined, maxLength: number): string {
		const normalized = (text || "").replace(/\s+/g, " ").trim();
		if (!normalized) return "";
		return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
	}

	private getChatUserInfo(userId: string): UserInRoomInfo | undefined {
		const roomUser = this.userList.get(userId);
		if (roomUser) {
			return this.getRoomUserInfo(roomUser);
		}
		const aiUser = this.aiUserList.get(userId);
		if (aiUser) {
			return { ...aiUser };
		}
		return undefined;
	}

	private broadcastChatMessageFromUser(userInfo: UserInRoomInfo, content: string): void {
		const trimmed = content.trim();
		if (!trimmed) return;
		const message: ChatMessage = {
			id: randomString(16),
			type: ChatMessageType.Text,
			content: trimmed,
			user: userInfo,
			time: Date.now(),
		};
		this.roomBroadcast({
			type: SocketMsgType.RoomChat,
			data: message,
			source: SocketMsgSource.Server,
		});
	}

	private humanizeAIReason(reason?: string): string | undefined {
		if (!reason) return undefined;
		const knownReasonMap: Record<string, string> = {
			no_available_option: "这步先没必要动",
			fallback_first_option: "我先走个稳的",
			confirm_score_not_good_enough: "现在接这个不太赚",
			cancel_empty_selectable: "眼下没合适的目标",
			cancel_low_value_options: "这些选择都一般",
			missing_submit_option: "这一步条件还不太够",
			cancel_form: "这一步先不急着交",
			no_button_good_enough: "还没到值得按的时候",
			no_card_available: "手里暂时没合适的牌",
			no_card_good_enough: "这张牌现在打出去有点亏",
		};
		if (knownReasonMap[reason]) {
			return knownReasonMap[reason];
		}
		if (/^[a-z0-9_:-]+$/i.test(reason)) {
			return undefined;
		}
		const normalized = this.abbreviateAIChatText(reason.replace(/[。.!?]+$/g, ""), 42);
		return normalized ? normalized : undefined;
	}

	private pickAIChatLine(candidates: string[]): string {
		const filtered = candidates.map((item) => item.trim()).filter(Boolean);
		if (filtered.length === 0) return "";
		return filtered[Math.floor(Math.random() * filtered.length)] || filtered[0];
	}

	private isGenericAIChatText(text: string): boolean {
		const compact = text.replace(/[「」"'`，。！？、,.!?：:\s]/g, "");
		return ["确认", "取消", "提交", "使用", "继续", "选择", "选项", "目标", "确认操作", "选择目标"].includes(compact);
	}

	private isTechnicalAIChatText(text: string): boolean {
		if (!text.trim()) return true;
		if (this.isGenericAIChatText(text)) return true;
		return [
			/__[a-z0-9:_-]+__/i,
			/\b(?:optionid|fieldvalues|confirmdialog|targetselect|itemselect|payload|sourceid|propertyid|playerid|mapitemid)\b/i,
			/\b(?:button|chance-card|property|player|map-item):[a-z0-9_-]+\b/i,
			/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i,
			/机会卡.{0,4}id/i,
			/地皮.{0,4}id/i,
			/玩家.{0,4}id/i,
		].some((pattern) => pattern.test(text));
	}

	private normalizeNaturalAIChatText(text: string | undefined, maxLength: number): string | undefined {
		const normalized = this.abbreviateAIChatText(text, maxLength);
		if (!normalized || this.isTechnicalAIChatText(normalized)) {
			return undefined;
		}
		return normalized;
	}

	private extractReadableAIPayloadText(payload?: Record<string, unknown>, maxLength: number = 28): string | undefined {
		if (!payload) return undefined;
		const candidateKeys = ["name", "title", "label", "text", "displayName", "cardName", "playerName", "propertyName", "targetName", "buttonText"];
		for (const key of candidateKeys) {
			const value = payload[key];
			if (typeof value !== "string") continue;
			const normalized = this.normalizeNaturalAIChatText(value, maxLength);
			if (normalized) return normalized;
		}
		return undefined;
	}

	private getReadableAIOptionText(request: AIDecisionRequest, optionId: string, maxLength: number = 28): string | undefined {
		const option = request.options.find((item) => item.id === optionId);
		if (!option) return undefined;

		const candidates: Array<string | undefined> = [
			this.extractReadableAIPayloadText(option.payload, maxLength),
			this.isGenericAIChatText(option.label) ? undefined : option.label,
			option.summary,
			option.description,
		];

		for (const candidate of candidates) {
			const normalized = this.normalizeNaturalAIChatText(candidate, maxLength);
			if (normalized) {
				return normalized;
			}
		}

		return undefined;
	}

	private formatAIDecisionResult(request: AIDecisionRequest, selection: { optionId?: string; optionIds?: string[]; submitted?: boolean; fieldValues?: Record<string, unknown>; reason?: string }): string {
		const reasonText = this.humanizeAIReason(selection.reason);
		const withReason = (base: string) => (reasonText ? `${base}，${reasonText}。` : `${base}。`);

		if (selection.optionId) {
			const label = this.getReadableAIOptionText(request, selection.optionId, 28);
			switch (request.scene) {
				case "confirm-dialog":
					return label
						? withReason(this.pickAIChatLine([`这步我准备 ${label}`, `这手我决定 ${label}`, `我先按 ${label} 来`]))
						: withReason(this.pickAIChatLine(["这步我就这么定了", "这手我准备直接上", "我先按这个思路走"]));
				case "target-select":
					return label
						? withReason(this.pickAIChatLine([`我盯上 ${label} 了`, `这步先找 ${label}`, `目标就定 ${label} 吧`]))
						: withReason(this.pickAIChatLine(["这步先挑个顺手的目标", "我先找个合适的目标", "这手先锁一个目标"]));
				case "item-select":
					return label
						? withReason(this.pickAIChatLine([`这步我拿 ${label}`, `先选 ${label} 试试`, `我更倾向 ${label}`]))
						: withReason(this.pickAIChatLine(["这步我先拿一个更稳的", "我先挑个顺手的", "这手先选这个"]));
				case "active-action":
				case "scripted-action":
				default:
					return label
						? withReason(this.pickAIChatLine([`我这步准备用 ${label}`, `先按 ${label} 来`, `这手我打算走 ${label}`]))
						: withReason(this.pickAIChatLine(["我这步先稳着来", "这手先走个顺的", "我先按现在这个思路处理"]));
			}
		}

		if (selection.optionIds && selection.optionIds.length > 0) {
			const labels = selection.optionIds
				.map((id) => this.getReadableAIOptionText(request, id, 16))
				.filter(Boolean)
				.join("、");
			return labels
				? withReason(this.pickAIChatLine([`这几个我都要：${labels}`, `我先拿这几项：${labels}`, `我这步会选 ${labels}`]))
				: withReason(this.pickAIChatLine(["这几个我先一起收下", "这手我会多拿几项", "我先把这几项一起处理"]));
		}

		if (selection.submitted) {
			return withReason(this.pickAIChatLine(["我就按这个提交了", "这样填差不多", "这步我这么交"]));
		}

		if (selection.fieldValues && Object.keys(selection.fieldValues).length > 0) {
			return withReason(this.pickAIChatLine(["我先按这个填", "这步我这么填更顺", "先这样写进去"]));
		}

		return withReason(this.pickAIChatLine(["我先这么走", "这步我稳一点", "先这样处理"]));
	}

	private broadcastAIThought(userId: string, content: string): void {
		this.chatBroadcast(content, userId);
	}

	private broadcastAISelectionChat(
		request: AIDecisionRequest,
		selection: {
			optionId?: string;
			optionIds?: string[];
			submitted?: boolean;
			fieldValues?: Record<string, unknown>;
			reason?: string;
			chatMessages?: string[];
		},
	): void {
		if (selection.chatMessages && selection.chatMessages.length > 0) {
			const naturalMessage = this.normalizeNaturalAIChatText(selection.chatMessages[0], 96);
			if (naturalMessage) {
				this.broadcastAIThought(request.playerId, naturalMessage);
			}
		}
	}

	// public isUserOffLine(userId: string): boolean {
	//     let res = false;
	//     //没有这个用户以及游戏尚未开启均判断为不是断线 无需重连
	//     if (this.hasUser(userId) && this.gameProcess && this.gameProcess.getPlayerIsOffline(userId)) {
	//         res = true;
	//     }
	//     return res;
	// }

	public chatBroadcast(content: string, userId: string) {
		if (!content) return;
		const userInfo = this.getChatUserInfo(userId);
		if (!userInfo) return;
		this.broadcastChatMessageFromUser(userInfo, content);
	}

	/**
	 * 将房间的信息广播到房间内的全部用户, 通常在房间界面会用到
	 */
	public roomInfoBroadcast() {
		const roomInfo = this.getRoomInfo();
		const msg: ServerSocketMessage = {
			type: SocketMsgType.RoomInfo,
			source: SocketMsgSource.Server,
			roomId: this.roomId,
			data: roomInfo,
		};
		this.roomBroadcast(msg);
	}

	public notifyHostClosing(): void {
		for (const [userId, user] of this.userList) {
			if (userId === this.ownerId) continue;
			this.sendToClient(user.socketClient, SocketMsgType.LeaveRoom, undefined, {
				type: "warning",
				content: "房主已退出，房间已关闭",
			});
		}
	}

	/**
	 * 将信息广播到房间内的全部用户
	 */
	public roomBroadcast(msg: ServerSocketMessage) {
		Array.from(this.userList.values()).forEach((user: UserInRoom) => {
			user.socketClient.send(
				JSON.stringify(msg, (key, value) => {
					if (value === Infinity) return "Infinity";
					if (value === -Infinity) return "-Infinity";
					return value;
				}),
			);
		});
	}

	/**
	 * 获取房间的信息
	 * @returns 返回房间的信息
	 */
	private getRoomInfo(): RoomInfo {
		const roomInfo: RoomInfo = {
			// mapInfo: this.mapInfo,
			roomId: this.roomId,
			userList: this.getAllRoomUsers(),
			isStarted: this.isStarted,
			ownerId: this.getOwner().userId,
			ownerName: this.getOwner().username,
			gameSetting: this.gameSetting,
		};
		return roomInfo;
	}

	/**
	 * 转变某个用户的准备状态
	 * @param _user 要转变准备状态用户的id或实例
	 */
	readyToggle(_user: UserInRoomInfo): boolean;
	readyToggle(_user: string): boolean;
	public readyToggle(_user: UserInRoomInfo | string) {
		const user = this.userList.get(typeof _user === "string" ? _user : _user.userId);
		if (user) {
			user.isReady = !user.isReady;
			this.roomInfoBroadcast();
			return user.isReady;
		}
		return false;
	}

	/**
	 * 用户加入房间
	 * @param user 加入房间的用户的id或实例
	 * @param conn peer链接
	 * @returns 是否加入成功
	 */
	public async join(user: User, conn: DataConnection) {
		if (this.userList.has(user.userId)) {
			//用户已在房间内
			this.sendToClient(
				conn,
				SocketMsgType.JoinRoom,
				{ roomId: this.roomId },
				{
					type: "warning",
					content: "你已在房间中",
				},
				this.roomId,
			);
			return false;
		} else {
			const userInRoom: UserInRoom = {
				...user,
				socketClient: conn,
				isOffLine: false,
				roleId: "",
				isReady: false,
			};
			if (Array.from(this.userList.values()).length === 0) this.ownerId = userInRoom.userId;
			this.userList.set(user.userId, userInRoom);
			this.sendToClient(
				conn,
				SocketMsgType.JoinRoom,
				{ roomId: this.roomId },
				{
					type: "success",
					content: "加入房间成功",
				},
				this.roomId,
			);
			this.roomBroadcast({
				type: SocketMsgType.MsgNotify,
				source: SocketMsgSource.Server,
				data: undefined,
				msg: { type: "success", content: `${userInRoom.username}加入了房间` },
			});
			this.roomInfoBroadcast();

			// 如果房间已有地图，向新玩家发送地图信息
			if (this.mapInfo) {
				// 如果是自定义地图，需要玩家确认风险
				if (this.mapInfo.from === "custom") {
					// 发送确认对话框
					this.sendToClient(userInRoom.socketClient, SocketMsgType.ConfirmDialog, {
						playerId: userInRoom.userId,
						option: {
							title: "房主要启用非官方地图",
							content: `此地图由房主 <b>${
								this.getOwner().username
							} </b> 提供，未经过官方验证，可能存在<b><color:red>数据异常、游戏不平衡或脚本风险。</color></b><br>请谨慎游玩，并自行承担使用非官方内容所带来的风险。`,
							confirmText: "同意",
							cancelText: "不同意",
						},
					});

					// 等待玩家确认
					const confirmResult = await this.operationListener.onceAsync(
						userInRoom.userId,
						OperateType.ConfirmDialogResult,
					);

					// 如果玩家拒绝，踢出房间
					if (!confirmResult.confirm) {
						this.leave(userInRoom.userId);
						return false;
					}
				}

				// 发送地图信息（使用分块传输）
				this.startMapChunkTransfer(userInRoom.userId, this.mapInfo!);

				// 等待地图资源加载完成
				await this.operationListener.onceAsync(userInRoom.userId, OperateType.MapResourceLoaded);
			}

			return true;
		}
	}

	/**
	 * 用户离开房间
	 * @param user 离开房间的用户的id
	 * @returns 玩家离开后房间是否为空
	 */
	public leave(userId: string): boolean {
		const user = this.userList.get(userId);
		if (!user) return false;
		this.sendToClient(user.socketClient, SocketMsgType.LeaveRoom, undefined);
		//房间中还有更多玩家的情况
		if (this.isStarted) {
			//游戏已经开始，处理断线
			this.handleUserOffline(userId);
			return Array.from(this.userList.values()).every((u) => u.isOffLine);
		} else {
			//游戏没有开始，仍在房间页面
			if (this.userList.size <= 1) {
				//房间最后一个人退出, 退出后解散房间
				this.userList.delete(userId);
				return true;
			} else {
				const user = this.userList.get(userId);
				if (user)
					this.roomBroadcast({
						type: SocketMsgType.MsgNotify,
						source: SocketMsgSource.Server,
						data: undefined,
						msg: { type: "warning", content: `${user.username}离开了房间` },
					});
				this.userList.delete(userId);
				this.roomInfoBroadcast();
				return false;
			}
		}
	}

	private handleUserOffline(userId: string) {
		const user = this.userList.get(userId);
		if (!user || user.isOffLine) return;
		user.isOffLine = true;
		if (this.gameProcessWorker) {
			this.gameProcessWorker.postMessage(<WorkerCommMsg>{
				type: WorkerCommType.UserOffLine,
				data: { userId },
			});
		}
		this.roomBroadcast({
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
			msg: { type: "error", content: `${user.username}断开了连接` },
		});
		this.roomInfoBroadcast();
	}

	public async handleUserReconnect(userId: string, newCoon: DataConnection, connectionVersion: number) {
		const oldUser = this.userList.get(userId);
		if (oldUser && this.mapInfo) {
			oldUser.socketClient = newCoon;
			this.roomInfoBroadcast();

			// 发送地图信息（使用分块传输）
			this.startMapChunkTransfer(userId, this.mapInfo!);

			// 等待地图资源加载完成
			try {
				await Promise.race([
					this.operationListener.onceAsync(userId, OperateType.MapResourceLoaded),
					new Promise((_, reject) => setTimeout(() => reject(new Error("地图资源加载超时")), this.TRANSFER_TIMEOUT)),
				]);
			} catch (error) {
				this.sendToClient(newCoon, SocketMsgType.GameInitAborted, {
					initSessionId: crypto.randomUUID(),
					reason: error instanceof Error ? error.message : "地图资源加载失败",
				});
				this.handleUserOffline(userId);
				return;
			}

			if (this.gameProcessWorker) {
				this.gameProcessWorker.postMessage(<WorkerCommMsg>{
					type: WorkerCommType.UserReconnect,
					data: { userId: oldUser.userId },
				});
			}

			oldUser.isOffLine = false;
			this.roomInfoBroadcast();
			this.roomBroadcast({
				type: SocketMsgType.MsgNotify,
				source: SocketMsgSource.Server,
				data: undefined,
				msg: { type: "success", content: `${oldUser.username}重新连接` },
			});
		} else {
			console.log("奇怪的玩家 in room");
		}
	}

	public async changeMap(data: RoomMapInfo) {
		const _this = this;
		this.aiUserList.forEach((user) => {
			user.isReady = true;
			user.roleId = "";
		});
		//换地图取消所有玩家准备状态
		if (data.from === "server") {
			this.mapInfo = data;
			//如果地图来源为服务器 (安全的)
			// 通知所有客户端显示 loading
			this.roomBroadcast({
				type: SocketMsgType.LoadingControl,
				source: SocketMsgSource.Server,
				data: { show: true, text: "地图加载中..." },
			});
			sendChangeMapMessage();
		} else if ((data.from === "custom")) {
			//如果地图来源为玩家 (有风险的)
			//需要其他玩家确定
			const otherPlayers = Array.from(this.userList.values()).filter((user) => user.userId !== this.ownerId);

			if (otherPlayers.length === 0) {
				this.roomBroadcast({
					type: SocketMsgType.LoadingControl,
					source: SocketMsgSource.Server,
					data: { show: true, text: "地图加载中..." },
				});
				this.mapInfo = data;
				sendChangeMapMessage();
			} else {
				const promiseArr = otherPlayers.map((user, index) => {
					this.sendToClient(user.socketClient, SocketMsgType.ConfirmDialog, {
						playerId: user.userId,
						option: {
							title: "房主要启用非官方地图",
							content: `此地图由房主 <b>${
								this.getOwner().username
							} </b> 提供，未经过官方验证，可能存在<b><color:red>数据异常、游戏不平衡或脚本风险。</color></b><br>请谨慎游玩，并自行承担使用非官方内容所带来的风险。`,
							confirmText: "同意",
							cancelText: "不同意",
						},
					});
					return this.operationListener.onceAsync(user.userId, OperateType.ConfirmDialogResult);
				});

				const res = await Promise.all(promiseArr);
				if (res.some((r) => !r.confirm)) {
					// 有玩家拒绝，通知所有客户端隐藏 loading
					this.roomBroadcast({
						type: SocketMsgType.LoadingControl,
						source: SocketMsgSource.Server,
						data: { show: false },
					});
					this.roomBroadcast({
						type: SocketMsgType.MsgNotify,
						source: SocketMsgSource.Server,
						data: undefined,
						msg: { type: "error", content: "有玩家拒绝使用自定义地图" },
					});
				} else {
					// 所有玩家同意，通知所有客户端显示地图加载 loading
					this.roomBroadcast({
						type: SocketMsgType.LoadingControl,
						source: SocketMsgSource.Server,
						data: { show: true, text: "地图加载中..." },
					});
					this.mapInfo = data;
					sendChangeMapMessage();
				}
			}
		}

		function sendChangeMapMessage() {
			_this.userList.forEach((u) => (u.isReady = false));
			// 房间快照不能继续携带上一张地图的参数；新地图加载后由房主同步其默认值。
			_this.gameSetting = {};
			// 使用分块传输发送给所有玩家（含房主，避免单条大消息被不可靠信道丢弃）
			for (const [userId, user] of _this.userList) {
				_this.startMapChunkTransfer(userId, data);
			}
			_this.roomBroadcast({
				type: SocketMsgType.RoomInfo,
				source: SocketMsgSource.Server,
				data: _this.getRoomInfo(),
			});
		}
	}

	public changeColor(_userId: string, color: string): void {
		const user = this.userList.get(_userId);
		if (user) {
			user.color = color;
			this.roomInfoBroadcast();
			return;
		}
		const aiUser = this.aiUserList.get(_userId);
		if (!aiUser) return;
		aiUser.color = color;
		this.roomInfoBroadcast();
	}

	public changeRole(_userId: string, roleId: string): void {
		const user = this.userList.get(_userId);
		if (user) {
			user.roleId = roleId;
			this.roomInfoBroadcast();
			return;
		}
		const aiUser = this.aiUserList.get(_userId);
		if (!aiUser) return;
		aiUser.roleId = roleId;
		this.roomInfoBroadcast();
	}

	public updateAIPlayerName(userId: string, username: string): { success: boolean; error?: string } {
		const aiUser = this.aiUserList.get(userId);
		if (!aiUser) {
			return { success: false, error: "AI 玩家不存在" };
		}

		const nextName = username.trim();
		if (!nextName) {
			return { success: false, error: "AI 玩家名称不能为空" };
		}

		aiUser.username = nextName;
		this.roomInfoBroadcast();
		return { success: true };
	}

	public changeGameSetting(gameSetting: GameSetting): void {
		this.gameSetting = gameSetting;
		this.roomBroadcast({
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
			msg: { type: "info", content: "地图设置有变更" },
		});
		this.roomInfoBroadcast();
	}

	public updateAIDecisionConfig(config: AIDecisionConfig): void {
		this.aiDecisionConfig = normalizeAIDecisionConfig(config);
		if (this.gameProcessWorker) {
			this.gameProcessWorker.postMessage(<WorkerCommMsg>{
				type: WorkerCommType.UpdateAIDecisionConfig,
				data: this.aiDecisionConfig,
			});
		}
	}

	public applyAIDecisionConfigFromConsole(config: AIDecisionConfig) {
		const nextConfig = normalizeAIDecisionConfig(config);
		useSettig().aiDecisionConfig = nextConfig;
		this.updateAIDecisionConfig(nextConfig);
		return {
			success: true,
			syncedRoomAI: Boolean(this.gameProcessWorker),
			config: nextConfig,
		};
	}

	public setAIPlayerDecisionBinding(userId: string, binding: Partial<AIPlayerDecisionBinding>) {
		if (!this.aiUserList.has(userId)) {
			return { success: false, error: "AI 玩家不存在" };
		}
		const nextBinding = this.normalizeAIPlayerDecisionBinding(binding);
		this.aiPlayerBindings.set(userId, nextBinding);
		return {
			success: true,
			binding: nextBinding,
		};
	}

	public clearAIRemoteUsageStatsFromConsole() {
		clearAIRemoteUsageStats();
		return { success: true };
	}

	public clearAIStrategyMemory(playerId?: string) {
		if (!this.gameProcessWorker) {
			return { success: false, error: "游戏进程尚未启动" };
		}
		this.gameProcessWorker.postMessage(<WorkerCommMsg>{
			type: WorkerCommType.ClearAIStrategyMemory,
			data: { playerId },
		});
		return { success: true };
	}

	public async getAIConsoleSnapshot() {
		const debugState = await this.requestWorkerDebugState();
		const remoteUsage = getAIRemoteUsageSnapshot();
		return {
			room: {
				roomId: this.roomId,
				ownerId: this.ownerId,
				isStarted: this.isStarted,
				mapName: useMapData().info?.name ?? "",
				canSyncRoomAI: Boolean(this.gameProcessWorker),
				workerState: this.workerState,
				lastKnownGameState: this.lastKnownGameState,
			},
			config: normalizeAIDecisionConfig(this.aiDecisionConfig),
			remoteUsage,
			aiPlayers: Array.from(this.aiUserList.values()).map((user) => ({
				userId: user.userId,
				username: user.username,
				color: user.color,
				roleId: user.roleId,
				isReady: user.isReady,
				binding: this.getAIPlayerDecisionBinding(user.userId),
				resolvedRemoteProfile: this.getResolvedAIPlayerRemoteProfile(user.userId),
				usage: remoteUsage.byPlayer[user.userId],
				strategyState: debugState?.aiStrategyStates?.[user.userId],
			})),
			debugState,
		};
	}

	private normalizeAIPlayerDecisionBinding(binding: Partial<AIPlayerDecisionBinding> | undefined): AIPlayerDecisionBinding {
		return {
			mode: normalizeAIDecisionMode(binding?.mode),
			remoteProfileId:
				typeof binding?.remoteProfileId === "string" && binding.remoteProfileId.trim()
					? binding.remoteProfileId.trim()
					: undefined,
		};
	}

	private getAIPlayerDecisionBinding(userId: string): AIPlayerDecisionBinding {
		const binding = this.aiPlayerBindings.get(userId);
		if (binding) {
			return this.normalizeAIPlayerDecisionBinding(binding);
		}
		return {
			mode: this.aiDecisionConfig.mode,
			remoteProfileId: this.aiDecisionConfig.defaultRemoteProfileId,
		};
	}

	private getResolvedAIPlayerRemoteProfile(userId: string): AIRemoteLLMProfile | null {
		const binding = this.getAIPlayerDecisionBinding(userId);
		if (binding.mode !== "remote") return null;
		if (!binding.remoteProfileId) return null;
		return this.aiDecisionConfig.remoteProfiles?.find((profile) => profile.id === binding.remoteProfileId) ?? null;
	}

	private getResolvedAIRemoteConfig(userId: string): AIRemoteLLMConfig | undefined {
		const binding = this.getAIPlayerDecisionBinding(userId);
		if (binding.mode !== "remote") {
			return undefined;
		}
		const profile = this.getResolvedAIPlayerRemoteProfile(userId);
		if (profile) {
			return normalizeRemoteLLMConfig(profile);
		}
		return normalizeRemoteLLMConfig(this.aiDecisionConfig.remote);
	}

	public async startGame() {
		const aiReadyResult = this.ensureAiPlayersReadyForStart();
		if (!aiReadyResult.success) {
			this.roomBroadcast({
				type: SocketMsgType.MsgNotify,
				source: SocketMsgSource.Server,
				data: undefined,
				msg: { type: "warning", content: aiReadyResult.error || "AI 玩家未就绪" },
			});
			this.roomInfoBroadcast();
			return;
		}
		if (!this.getAllRoomUsers().every((item) => item.isSpectator || item.userId === this.ownerId || item.isAI || item.isReady)) {
			this.roomBroadcast({
				type: SocketMsgType.MsgNotify,
				source: SocketMsgSource.Server,
				data: undefined,
				msg: { type: "warning", content: "有玩家未准备" },
			});
			return;
		}
		if (this.isStarted || this.gameProcessWorker) return;
		clearAIRemoteUsageStats();
		this.roomBroadcast({
			type: SocketMsgType.GameStart,
			source: SocketMsgSource.Server,
			data: undefined,
		});
		this.isStarted = true;

		// 上报游戏开始状态和地图信息到服务端
		const mapId = this.mapInfo?.from === "server" ? this.mapInfo.data : useMapData().id;
		const mapName = useMapData().info?.name || null;
		setRoomStarted(this.getRoomId(), true, mapId, mapName);

		// 状态转换: Uninitialized -> Initializing
		this.transitionTo(WorkerState.Initializing, "开始创建游戏进程");

		// 重置安全模式相关标志
		this.enteringSafeMode = false;

		// 启动初始化超时定时器
		this.initSessionId = crypto.randomUUID();
		this.startInitTimeout();

		this.gameProcessWorker = new GameProcessWorker();

		// 设置消息处理器
		this.setupWorkerMessageHandler();

		// 监听 Worker 错误事件 - 进入安全模式
		this.gameProcessWorker.addEventListener("error", (event) => {
			console.error("[Worker Error Event]:", event);
			useLoading().hideLoading();

			// 进入安全模式
			this.enterSafeMode("Worker初始化失败", {
				message: event.message || "Unknown Worker Error",
			});
		});

		window.addEventListener("beforeunload", () => {
			this.gameProcessWorker && this.gameProcessWorker.terminate();
		});

	// DevTools debug bridge
	(window as any).__gpBridge = {
		requestState: () => {
			console.log("[gpBridge] requestState called, worker:", !!this.gameProcessWorker);
			if (this.gameProcessWorker) {
				this.gameProcessWorker.postMessage({
					type: WorkerCommType.DebugGetState,
					data: undefined,
				});
				console.log("[gpBridge] DebugGetState sent to worker");
			}
		},
		onState: null as ((state: any) => void) | null,
	};
	}
	private async handleGameOver() {
		await setRoomStarted(this.getRoomId(), false);
		Array.from(this.userList.values()).forEach((u) => {
			u.isReady = false;
		});
		this.aiUserList.forEach((u) => {
			u.isReady = true;
		});
		this.roomInfoBroadcast();
		console.log("🚀 ~ Room ~ handleGameOver ~ 游戏结束啦:");
		this.gameProcessWorker && this.gameProcessWorker.terminate();
		this.gameProcessWorker = null;
		this.isStarted = false;
	}

	/**
	 * 获取房间内用户数量
	 * @return  用户数量
	 */
	public getUserNum() {
		return this.userList.size;
	}

	public isUserInRoomAndOffline(userId: string) {
		const user = Array.from(this.userList.values()).find((u) => u.userId === userId);
		if (!user) return false;
		return user.isOffLine;
	}

	public isUserInRoom(userId: string) {
		return this.userList.has(userId);
	}

	public emitOperation<T extends OperateType>(userId: string, operateType: T, data?: PlayerOperationResult[T], metadata?: import("@src/interfaces/worker").InitOperationMeta) {
		this.operationListener.emit(userId, operateType, data);
		if (operateType === OperateType.GameInitFinished && metadata?.initStatus === "failed") this.handleUserOffline(userId);
		if (!this.gameProcessWorker) return;
		this.gameProcessWorker.postMessage(<WorkerCommMsg>{
			type: WorkerCommType.EmitOperation,
			data: {
				userId,
				operateType,
				data,
				metadata,
			},
		});
	}

	public sendToClientById<T extends SocketMsgType>(
		id: string,
		type: T,
		data?: SocketMessageDataType[T][SocketMsgSource.Server],
		msg?: {
			type: "info" | "success" | "warning" | "error";
			content: string;
		},
		extra: any = undefined,
	) {
		const user = this.userList.get(id);
		if (!user) return;
		this.sendToClient(user.socketClient, type, data, msg, extra);
	}

	public sendToClient<T extends SocketMsgType>(
		socketClient: DataConnection,
		type: T,
		data?: SocketMessageDataType[T][SocketMsgSource.Server],
		msg?: {
			type: "info" | "success" | "warning" | "error";
			content: string;
		},
		extra: any = undefined,
	) {
		const msgToSend: SocketMessage = {
			type,
			source: SocketMsgSource.Server,
			data,
			roomId: this.roomId,
			msg,
			extra,
		};
		if (socketClient.open)
			socketClient.send(
				JSON.stringify(msgToSend, (key, value) => {
					if (value === Infinity) return "Infinity";
					if (value === -Infinity) return "-Infinity";
					return value;
				}),
			);
	}

	/**
	 * 将地图原始字节按指定大小切块（按字节而非字符，避免多字节字符被切断）
	 */
	private splitIntoChunks(data: Uint8Array, chunkSize: number): Uint8Array[] {
		const chunks: Uint8Array[] = [];
		for (let i = 0; i < data.length; i += chunkSize) {
			chunks.push(data.slice(i, Math.min(i + chunkSize, data.length)));
		}
		return chunks;
	}

	/**
	 * 根据块数动态计算整体传输超时
	 * 传输时间与地图大小线性相关，固定超时会导致大图在完成前被误杀
	 */
	private calcTransferTimeout(totalChunks: number): number {
		const estimated = this.TRANSFER_TIMEOUT + totalChunks * this.CHUNK_ESTIMATED_TIME;
		return Math.min(estimated, this.TRANSFER_TIMEOUT_MAX);
	}

	/**
	 * 发送单个分块（二进制直传，绕过 JSON/Base64 通道）
	 * 包格式: [1 字节 type][4 字节 chunkIndex 大端序][chunk 原始字节]
	 */
	private sendChunk(user: UserInRoom, chunkIndex: number, chunk: Uint8Array): void {
		const packet = new Uint8Array(5 + chunk.length);
		packet[0] = MAP_CHUNK_BIN_TYPE;
		packet[1] = (chunkIndex >>> 24) & 0xff;
		packet[2] = (chunkIndex >>> 16) & 0xff;
		packet[3] = (chunkIndex >>> 8) & 0xff;
		packet[4] = chunkIndex & 0xff;
		packet.set(chunk, 5);

		user.socketClient.send(packet);
	}

	/**
	 * 开始分块传输地图数据
	 * 一次性按序发出所有块，随后发送 MapChunkEnd。
	 * DataChannel 为 reliable + ordered（SCTP 层保证丢包重传与有序投递），
	 * MapChunkEnd 必然在所有块之后到达客机端，无需应用层 ACK/重传。
	 */
	private startMapChunkTransfer(clientId: string, mapInfo: RoomMapInfo): void {
		// 只对自定义地图进行分块传输
		if (mapInfo.from !== "custom") {
			// 服务器地图直接发送原消息
			const user = this.userList.get(clientId);
			if (user) {
				this.sendToClient(user.socketClient, SocketMsgType.ChangeMap, mapInfo);
			}
			return;
		}

		const user = this.userList.get(clientId);
		if (!user || !user.socketClient.open) {
			return;
		}

		// 提取地图数据（兼容旧版 Base64 字符串与新版二进制）
		const mapData = mapInfo.data;
		const raw = typeof mapData === "string" ? new Uint8Array(base64ToArrayBuffer(mapData)) : mapData;
		const chunks = this.splitIntoChunks(raw, this.CHUNK_SIZE);

		// 发送 MapChunkStart（附带动态整体超时与总大小，供客机端兜底/展示进度）
		this.sendToClient(
			user.socketClient,
			SocketMsgType.MapChunkStart,
			{
				totalChunks: chunks.length,
				chunkSize: this.CHUNK_SIZE,
				mapInfo: { from: "custom" as const },
				transferTimeout: this.calcTransferTimeout(chunks.length),
				totalBytes: raw.byteLength,
			},
		);

		// 流水线：按序发送所有块
		for (let i = 0; i < chunks.length; i++) {
			this.sendChunk(user, i, chunks[i]);
		}

		// MapChunkEnd 在所有块之后发送，DataChannel 有序投递保证其最后到达
		this.sendToClient(
			user.socketClient,
			SocketMsgType.MapChunkEnd,
			{ success: true },
		);
		console.log(`[MapTransfer] Sent ${chunks.length} chunks to client ${clientId}`);
	}

	public requestSave(): void {
		if (!this.gameProcessWorker) return;
		this.gameProcessWorker.postMessage(<WorkerCommMsg>{
			type: WorkerCommType.RequestSnapshot,
			data: undefined,
		});
	}

	public async loadSave(record: SaveRecord, usePrevious: boolean = false): Promise<{ success: boolean; error?: string }> {
		const snapshot = usePrevious ? record.previousSnapshot : record.snapshot;
		if (!snapshot) return { success: false, error: "没有可用的存档数据" };

		// 校验玩家
		const roomUserIds = this.getParticipatingHumanUserIds();
		const { valid, aiPlayerIds, error } = this.saveManager.validatePlayers(record, roomUserIds);
		if (!valid) return { success: false, error };
		this.ensureAiPlayersForSave(record, aiPlayerIds);
		this.roomInfoBroadcast();

		// 预存存档数据，将在 handleWorkerReady 发送 LoadGameInfo 时一并传递给 Worker
		// Worker 在 waitInitFinished() 完成后自动注入存档
		// JSON 序列化剥离 Vue 响应式 Proxy（postMessage 使用 structured clone，无法处理 Proxy）
		this.pendingSaveData = JSON.parse(JSON.stringify({ snapshot, aiPlayerIds }));

		// 正常启动游戏流程（Worker 内部会在适当时机注入存档）
		await this.startGame();

		return { success: true };
	}

	public destory() {
		this.clearHeartbeatTimer();
		this.clearInitTimeout();
		if (this.gameProcessWorker) {
			this.gameProcessWorker.terminate();
			this.gameProcessWorker = null;
		}
	}

	// ==================== 状态管理方法 ====================

	/**
	 * 状态转换方法
	 * @param newState 新状态
	 * @param reason 状态转换原因
	 */
	private transitionTo(newState: WorkerState, reason?: string): void {
		const previousState = this.workerState;
		if (previousState === newState) return;

		this.workerState = newState;

		// 记录状态转换日志
		logService.info({
			category: ErrorCategory.WORKER,
			type: "StateTransition",
			message: `Worker状态转换: ${previousState} -> ${newState}`,
			info: reason ? `原因: ${reason}` : undefined,
		});

		// 如果进入安全模式，记录原因
		if (newState === WorkerState.SafeMode && reason) {
			this.safeModeReason = reason;
		}

		// 根据状态更新心跳超时时间
		if (newState === WorkerState.Running) {
			this.resetHeartbeatTimer();
		}

		// 通知 Worker 状态变化（如果 Worker 还在运行）
		if (this.gameProcessWorker && newState !== WorkerState.Crashed && newState !== WorkerState.Terminated) {
			this.gameProcessWorker.postMessage(<WorkerCommMsg>{
				type: WorkerCommType.WorkerStateChanged,
				data: {
					previousState,
					currentState: newState,
					reason,
				},
			});
		}
	}

	/**
	 * 获取当前 Worker 状态
	 */
	public getWorkerState(): WorkerState {
		return this.workerState;
	}

	// ==================== 心跳监控方法 ====================

	/**
	 * 启动心跳监控
	 */
	private startHeartbeatMonitor(): void {
		this.resetHeartbeatTimer();
	}

	/**
	 * 重置心跳定时器
	 */
	private resetHeartbeatTimer(): void {
		this.clearHeartbeatTimer();

		// 根据游戏状态选择超时时间
		const timeout = this.lastKnownGameState?.isBusy
			? Room.HEARTBEAT_BUSY_TIMEOUT
			: Room.HEARTBEAT_NORMAL_TIMEOUT;

		this.heartbeatTimeout = window.setTimeout(() => {
			this.handleWorkerCrashed("心跳超时");
		}, timeout);
	}

	/**
	 * 清除心跳定时器
	 */
	private clearHeartbeatTimer(): void {
		if (this.heartbeatTimeout !== null) {
			window.clearTimeout(this.heartbeatTimeout);
			this.heartbeatTimeout = null;
		}
	}

	/**
	 * 处理 Worker 心跳消息
	 */
	private handleWorkerHeartbeat(data: HeartbeatData): void {
		this.lastKnownGameState = data.gameState;

		// 只有在运行状态下才重置心跳定时器
		if (this.workerState === WorkerState.Running) {
			this.resetHeartbeatTimer();
		}
	}

	private requestWorkerDebugState(timeoutMs: number = 3000): Promise<GameProcessDebugState | null> {
		if (!this.gameProcessWorker) {
			return Promise.resolve(null);
		}
		return new Promise((resolve) => {
			const pending = {
				resolve,
				timeout: setTimeout(() => {
					this.pendingDebugStateResolvers.delete(pending);
					resolve(null);
				}, timeoutMs),
			};
			this.pendingDebugStateResolvers.add(pending);
			this.gameProcessWorker!.postMessage(<WorkerCommMsg>{
				type: WorkerCommType.DebugGetState,
				data: undefined,
			});
		});
	}

	private resolvePendingDebugState(state: GameProcessDebugState | null): void {
		for (const pending of this.pendingDebugStateResolvers) {
			clearTimeout(pending.timeout);
			pending.resolve(state);
		}
		this.pendingDebugStateResolvers.clear();
	}

	/**
	 * 处理 Worker 崩溃
	 */
	private handleWorkerCrashed(reason: string): void {
		logWorkerError({
			message: `Worker崩溃: ${reason}`,
			type: "WorkerCrashed",
			workerState: this.workerState,
		});

		this.transitionTo(WorkerState.Crashed, reason);

		// 通知用户
		FPMessage({
			type: "error",
			message: `游戏进程无响应 (${reason})，请尝试重新开始游戏`,
		});

		// 清理资源
		this.terminateWorker();
	}

	// ==================== 初始化超时方法 ====================

	/**
	 * 启动初始化超时定时器
	 */
	private startInitTimeout(): void {
		this.clearInitTimeout();

		this.initTimeoutTimer = window.setTimeout(() => {
			this.handleInitTimeout();
		}, Room.INIT_TIMEOUT);
	}

	/**
	 * 清除初始化超时定时器
	 */
	private clearInitTimeout(): void {
		if (this.initTimeoutTimer !== null) {
			window.clearTimeout(this.initTimeoutTimer);
			this.initTimeoutTimer = null;
		}
	}

	/**
	 * 处理初始化超时
	 */
	private handleInitTimeout(): void {
		logWorkerError({
			message: `Worker初始化超时 (${Room.INIT_TIMEOUT}ms)`,
			type: "InitTimeout",
			workerState: this.workerState,
		});

		this.handleInitializationFailed("初始化超时");
	}

	// ==================== 初始化失败处理 ====================

	/**
	 * 处理初始化失败
	 */
	private handleInitializationFailed(reason?: string): void {
		const failureReason = reason || "未知错误";

		logWorkerError({
			message: `Worker初始化失败: ${failureReason}`,
			type: "InitFailed",
			workerState: this.workerState,
		});

		this.transitionTo(WorkerState.Failed, failureReason);

		// 清理资源
		this.terminateWorker();

		// 通知用户
		FPMessage({
			type: "error",
			message: `游戏初始化失败: ${failureReason}`,
		});
		this.roomBroadcast({
			type: SocketMsgType.GameInitAborted,
			source: SocketMsgSource.Server,
			data: { initSessionId: this.initSessionId || crypto.randomUUID(), reason: failureReason },
		});

		// 重置游戏状态
		this.isStarted = false;
		useLoading().hideLoading();
	}

	// ==================== Worker 终止方法 ====================

	/**
	 * 终止 Worker 并清理资源
	 */
	private terminateWorker(): void {
		this.clearHeartbeatTimer();
		this.clearInitTimeout();

		if (this.gameProcessWorker) {
			this.gameProcessWorker.terminate();
			this.gameProcessWorker = null;
		}

		this.transitionTo(WorkerState.Terminated, "主动终止");
	}

	// ==================== Worker 消息处理器 ====================

		/**
		 * 处理 Worker 状态变化消息
		 */
		private handleWorkerStateChanged(data: WorkerStateChangedData): void {
			const { previousState, currentState, reason } = data;
			this.workerState = currentState;

			logService.info({
				category: ErrorCategory.WORKER,
				type: "StateChangeReceived",
				message: `收到Worker状态变化: ${previousState} -> ${currentState}`,
				info: reason,
			});

			// 如果进入安全模式，记录原因
			if (currentState === WorkerState.SafeMode && reason) {
				this.safeModeReason = reason;
			}

			// 如果进入运行状态，启动心跳监控
			if (currentState === WorkerState.Running) {
				this.startHeartbeatMonitor();
			}
		}

		/**
		 * 处理组件验证错误消息
		 */
		private handleValidationError(errors: Array<{
			componentType: string;
			componentId: string;
			componentName: string;
			errorType: string;
			errorMessage: string;
		}>): void {
			logErrorWithOptions({
				category: ErrorCategory.COMPONENT_VALIDATION,
				type: "ComponentValidationError",
				message: `组件验证错误: ${errors.length} 个错误`,
				extraInfo: { errors },
			});

			// 通知用户
			const errorMessages = errors.map(e => `${e.componentName}: ${e.errorMessage}`).join("\n");
			FPMessage({
				type: "error",
				message: `地图组件验证失败:\n${errorMessages}`,
			});
		}

		/**
		 * 处理详细错误消息
		 */
		private handleDetailedError(data: {
			category: string;
			type: string;
			component?: string;
			message: string;
			technical?: {
				message: string;
				stack?: string;
				mapInfo?: any;
			};
		}): void {
			logErrorWithOptions({
				category: ErrorCategory.WORKER,
				type: data.type,
				message: data.message,
				error: data.technical?.stack
					? ({ message: data.technical.message, stack: data.technical.stack } as Error)
					: undefined,
				extraInfo: {
					technical: data.technical,
				},
			});

			// 通知用户
			FPMessage({
				type: "error",
				message: `游戏错误: ${data.message}\n日志已记录，请查看日志面板`,
			});
		}

		/**
		 * 处理进入安全模式消息
		 */
		private handleEnterSafeMode(data: { reason?: string }): void {
			const reason = data.reason || "未知原因";
			this.transitionTo(WorkerState.SafeMode, reason);

			logService.warn({
				category: ErrorCategory.WORKER,
				type: "EnterSafeMode",
				message: `Worker进入安全模式: ${reason}`,
			});

			// 通知用户
			FPMessage({
				type: "warning",
				message: `进程遇到错误: ${reason}`,
			});
		}

		/**
		 * 处理退出安全模式消息
		 */
		private handleExitSafeMode(): void {
			this.transitionTo(WorkerState.Ready, "退出安全模式");
			this.safeModeReason = "";

			logService.info({
				category: ErrorCategory.WORKER,
				type: "ExitSafeMode",
				message: "Worker退出安全模式",
			});

			// 通知用户
			FPMessage({
				type: "success",
				message: "游戏已恢复正常模式",
			});
		}

		/**
		 * 处理从安全模式重试消息
		 */
		private handleRetryFromSafeMode(): void {
			logService.info({
				category: ErrorCategory.WORKER,
				type: "RetryFromSafeMode",
				message: "Worker从安全模式重试",
			});

			// 重试时先转换到 Ready 状态
			this.transitionTo(WorkerState.Ready, "从安全模式重试");
		}

	// ==================== 安全模式相关方法 ====================

	/**
	 * 进入安全模式
	 * @param reason 进入安全模式的原因
	 * @param technicalDetails 技术细节（可选）
	 */
	public enterSafeMode(reason: string, technicalDetails?: Record<string, any>): void {
		// 如果已经在安全模式，不再重复进入
		if (this.workerState === WorkerState.SafeMode) {
			logService.warn({
				category: ErrorCategory.WORKER,
				type: "AlreadyInSafeMode",
				message: "尝试进入安全模式，但已在安全模式中",
				info: reason,
			});
			return;
		}

		// 如果正在进入安全模式，不再重复进入
		if (this.enteringSafeMode) {
			logService.warn({
				category: ErrorCategory.WORKER,
				type: "AlreadyEnteringSafeMode",
				message: "已经在进入安全模式的过程中",
				info: reason,
			});
			return;
		}

		this.enteringSafeMode = true;

		// 清除初始化超时，防止超时回调覆盖安全模式状态
		this.clearInitTimeout();

		this.transitionTo(WorkerState.SafeMode, reason);

		// 通知 Worker 进入安全模式
		if (this.gameProcessWorker) {
			this.gameProcessWorker.postMessage(<WorkerCommMsg>{
				type: WorkerCommType.EnterSafeMode,
				data: { reason },
			});
		}

		// 记录详细错误
		logWorkerError({
				message: `进程遇到错误: ${reason}`,
				type: "EnterSafeMode",
				workerState: this.workerState,
				extraInfo: technicalDetails,
			});


		// 判断是否可以保存：只有当游戏进行了至少一回合时才有实际进度
		const canSave = (this.lastKnownGameState?.currentRound ?? 0) > 0;


		// 向房主发送选项提示
		this.roomBroadcast({
				type: SocketMsgType.SafeModePanel,
				source: SocketMsgSource.Server,
				data: {
					reason: this.formatUserFriendlyReason(reason),
					canSave: canSave,
					errorDetails: technicalDetails ? {
						category: technicalDetails.category,
						type: technicalDetails.type,
						message: technicalDetails.message,
						stack: technicalDetails.stack,
					} : undefined,
				},
			});

		// 重置标志
		this.enteringSafeMode = false;
	}

	/**
	 * 格式化用户友好的错误原因
	 * @param reason 原始错误原因
	 * @returns 用户友好的错误描述
	 */
	private formatUserFriendlyReason(reason: string): string {
		const reasonMap: Record<string, string> = {
			"地图验证失败": "地图数据存在问题，可能缺少必需组件或数据格式错误",
			"组件初始化失败": "游戏组件加载失败，请检查地图配置",
			"脚本执行错误": "游戏脚本运行时发生错误",
			"心跳超时": "游戏进程无响应",
			"初始化超时": "游戏启动超时",
			"Worker崩溃": "游戏进程意外终止",
		};

		return reasonMap[reason] || reason;
	}

	/**
	 * 判断是否可以从安全模式重试
	 * @param reason 进入安全模式的原因
	 * @returns 是否可以重试
	 */
	private canRetryFromSafeMode(reason: string): boolean {
		// 以下情况允许重试
		const retryableReasons = [
			"地图验证失败",
			"组件初始化失败",
			"脚本执行错误",
			"心跳超时",
		];

		return retryableReasons.some(r => reason.includes(r));
	}

	/**
	 * 获取技术细节
	 * @param error 错误对象
	 * @returns 格式化的技术细节
	 */
	private getTechnicalDetails(error: any): Record<string, any> {
		return {
			message: error.message || "未知错误",
			stack: error.stack,
			component: error.component || "未知组件",
			timestamp: new Date().toISOString(),
			workerState: this.workerState,
		};
	}

	/**
	 * 向房主发送安全模式选项通知
	 * @param reason 进入安全模式的原因
	 */
	private notifySafeModeOptions(reason: string): void {
		const owner = this.userList.get(this.ownerId);
		if (!owner) return;

		const canRetry = this.canRetryFromSafeMode(reason);
		const userFriendlyReason = this.formatUserFriendlyReason(reason);

		this.sendToClient(owner.socketClient, SocketMsgType.ConfirmDialog, {
			playerId: this.ownerId,
			option: {
				title: "进程遇到错误",
				content: `<color:red>${userFriendlyReason}</color>\n\n请房主选择处理方式：`,
				confirmText: canRetry ? "重试" : "放弃游戏",
				cancelText: canRetry ? "放弃游戏" : undefined,
			},
		});

		// 监听房主选择
		this.operationListener.onceAsync(this.ownerId, OperateType.ConfirmDialogResult)
			.then((result) => {
				logService.info({
					category: ErrorCategory.WORKER,
					type: "SafeModeUserChoice",
					message: `房主选择: confirm=${result.confirm}, canRetry=${canRetry}`,
				});
				if (result.confirm && canRetry) {
					this.retryFromSafeMode();
				} else {
					this.abandonGame();
				}
			});
	}

	/**
	 * 房主从安全模式重试
	 */
	public retryFromSafeMode(): void {
		if (this.workerState !== WorkerState.SafeMode) {
			logService.warn({
				category: ErrorCategory.WORKER,
				type: "RetryNotInSafeMode",
				message: "尝试从安全模式重试，但当前不在安全模式",
			});
			return;
		}

		logService.info({
			category: ErrorCategory.WORKER,
			type: "RetryFromSafeMode",
			message: "房主选择从安全模式重试",
		});

		// 通知 Worker 重试
		if (this.gameProcessWorker) {
			this.gameProcessWorker.postMessage(<WorkerCommMsg>{
				type: WorkerCommType.RetryFromSafeMode,
				data: undefined,
			});
		} else {
			// Worker 已不存在，需要重新初始化
			this.startGameInternal();
		}

		// 转换到 Ready 状态
		this.transitionTo(WorkerState.Ready, "从安全模式重试");

		// 通知所有玩家
		this.roomBroadcast({
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
			msg: { type: "info", content: "房主正在重试启动游戏..." },
		});
	}

	/**
	 * 房主放弃游戏
	 */
	public abandonGame(): void {
		logService.info({
			category: ErrorCategory.WORKER,
			type: "AbandonGame",
			message: "房主放弃游戏",
		});

		// 终止 Worker
		this.terminateWorker();

		// 重置游戏状态
		this.isStarted = false;
		this.transitionTo(WorkerState.Terminated, "房主放弃游戏");

		// 通知所有玩家游戏结束并返回房间
		this.roomBroadcast({
			type: SocketMsgType.GameOver,
			source: SocketMsgSource.Server,
			data: { returnToRoom: true },
			msg: { type: "warning", content: "房主放弃了当前游戏" },
		});

		// 重置所有玩家准备状态
		Array.from(this.userList.values()).forEach((u) => {
			u.isReady = false;
		});
		this.roomInfoBroadcast();
	}

	/**
	 * 房主从安全模式存档并退出
	 */
	public async saveAndExitFromSafeMode(): Promise<void> {
		logService.info({
			category: ErrorCategory.WORKER,
			type: "SaveAndExitFromSafeMode",
			message: "房主选择存档并退出",
		});

		// 通知所有玩家
		this.roomBroadcast({
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
			msg: { type: "info", content: "正在保存游戏并退出..." },
		});

		try {
			// 1. 获取当前快照
			let snapshot: SaveSnapshot | null = null;
			if (this.gameProcessWorker) {
				// 标记为手动请求快照，避免触发自动保存
				this.isManuallyRequestingSnapshot = true;

				// 发送请求获取快照
				this.gameProcessWorker.postMessage(<WorkerCommMsg>{
					type: WorkerCommType.RequestSnapshot,
					data: undefined,
				});

				// 等待快照响应
				const worker = this.gameProcessWorker;
				if (!worker) {
					throw new Error("游戏进程不可用");
				}

				snapshot = await new Promise<SaveSnapshot | null>((resolve) => {
					const timeout = setTimeout(() => {
						this.isManuallyRequestingSnapshot = false;
						resolve(null);
					}, 5000);

					const handler = (ev: MessageEvent) => {
						const msg: WorkerCommMsg = ev.data;
						if (msg.type === WorkerCommType.SaveSnapshot) {
							clearTimeout(timeout);
							worker.removeEventListener("message", handler);
							resolve(msg.data.snapshot);
						}
					};

					worker.addEventListener("message", handler);
				});
			}

			if (!snapshot) {
				throw new Error("无法获取当前游戏状态");
			}

			// 2. 保存到 IndexedDB
			const mapId = this.mapInfo?.from === "server" ? this.mapInfo.data : useMapData().id;
			const mapVersion = useMapData().info?.version ?? "0.0.0";
			const mapName = useMapData().info?.name ?? "未知地图";

			// 获取玩家名字列表
			const playerNames = Object.keys(snapshot.playerSnapshots).map((userId) => this.getUserNameById(userId));

			const record = await this.saveManager.save(snapshot, mapId, mapVersion, mapName, playerNames);

			// 3. 通知存档成功
			this.roomBroadcast({
				type: SocketMsgType.MsgNotify,
				source: SocketMsgSource.Server,
				data: undefined,
				msg: { type: "success", content: `存档成功！存档ID: ${record.id}` },
			});

			// 4. 等待一段时间让玩家看到消息
			await new Promise(resolve => setTimeout(resolve, 2000));

			// 5. 结束游戏，返回房间
			this.endGameAndReturnToRoom();

		} catch (e: any) {
			// 确保重置标志位
			this.isManuallyRequestingSnapshot = false;

			logService.error({
				category: ErrorCategory.WORKER,
				type: "SaveAndExitFailed",
				message: `存档并退出失败: ${e.message}`,
			});

			this.roomBroadcast({
				type: SocketMsgType.MsgNotify,
				source: SocketMsgSource.Server,
				data: undefined,
				msg: { type: "error", content: `存档失败: ${e.message}` },
			});
		}
	}

	/**
	 * 结束游戏并返回房间
	 */
	private endGameAndReturnToRoom(): void {
		// 通知所有玩家游戏结束并返回房间
		this.roomBroadcast({
			type: SocketMsgType.GameOver,
			source: SocketMsgSource.Server,
			data: { returnToRoom: true },
		});

		// 清理 Worker
		if (this.gameProcessWorker) {
			this.gameProcessWorker.terminate();
			this.gameProcessWorker = null;
		}

		// 重置状态
		this.isStarted = false;
		this.workerState = WorkerState.Ready;

		// 重置所有玩家准备状态
		Array.from(this.userList.values()).forEach((u) => {
			u.isReady = false;
		});
		this.roomInfoBroadcast();
	}

	/**
	 * 内部启动游戏方法（用于重试）
	 */
	private startGameInternal(): void {
		if (this.gameProcessWorker) {
			this.gameProcessWorker.terminate();
			this.gameProcessWorker = null;
		}

		this.transitionTo(WorkerState.Initializing, "重新初始化游戏进程");

		// 重置安全模式相关标志
		this.enteringSafeMode = false;

		// 启动初始化超时定时器
		this.startInitTimeout();

		// 创建新的 Worker
		this.gameProcessWorker = new GameProcessWorker();

		// 设置消息处理器
		this.setupWorkerMessageHandler();

		// 监听 Worker 错误事件
		this.gameProcessWorker.addEventListener("error", (event) => {
			console.error("[Worker Error Event]:", event);
			this.enterSafeMode("Worker初始化失败", {
				message: event.message || "Unknown Worker Error",
			});
		});
	}

	/**
	 * 处理 GM 操作请求
	 * @param action - GM 操作
	 * @returns 操作响应
	 */
	public async gmAction(action: GMAction): Promise<GMActionResponseData> {
		if (!this.gameProcessWorker) {
			return { success: false, error: "Worker not available" };
		}

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				this.pendingGMResponses.delete(action.id);
				resolve({ success: false, error: "Timeout: Worker did not respond" });
			}, 5000);

			this.pendingGMResponses.set(action.id, { resolve, timeout });

			// 发送请求
			this.gameProcessWorker!.postMessage({
				type: WorkerCommType.GMAction,
				data: action,
			} as WorkerCommMsg);
		});
	}

	/**
	 * 设置 Worker 消息处理器
	 */
	private setupWorkerMessageHandler(): void {
		if (!this.gameProcessWorker) return;

		this.gameProcessWorker.addEventListener("message", (ev) => {
			// 处理 Worker 内部错误消息
			const rawData = ev.data as any;
			if (rawData?.type === "worker-error") {
				this.handleWorkerErrorInternal(rawData.data);
				return;
			}

			const msg: WorkerCommMsg = ev.data;
			switch (msg.type) {
				case WorkerCommType.WorkerReady:
					this.handleWorkerReadyInternal();
					break;
				case WorkerCommType.SendToUsers:
					this.handleSendToUsersInternal(msg.data);
					break;
				case WorkerCommType.GameStart:
					// 游戏开始，不做特殊处理
					break;
				case WorkerCommType.GameOver:
					this.handleGameOver();
					break;
				case WorkerCommType.GameProcessReady:
					this.handleGameProcessReady();
					break;
				case WorkerCommType.RequestAIDecision:
					void this.handleWorkerAIDecisionRequest(msg.data);
					break;
				case WorkerCommType.WorkerStateChanged:
					this.handleWorkerStateChanged(msg.data);
					break;
				case WorkerCommType.WorkerHeartbeat:
					this.handleWorkerHeartbeat(msg.data);
					break;
				case WorkerCommType.ValidationError:
					this.handleValidationError(msg.data);
					break;
				case WorkerCommType.DetailedError:
					this.handleDetailedError(msg.data);
					break;
				case WorkerCommType.EnterSafeMode:
					this.handleEnterSafeMode(msg.data);
					break;
				case WorkerCommType.ExitSafeMode:
					this.handleExitSafeMode();
					break;
				case WorkerCommType.RetryFromSafeMode:
					this.handleRetryFromSafeMode();
					break;
				case WorkerCommType.SaveSnapshot:
					{
						// 如果是手动请求快照，跳过自动保存
						if (this.isManuallyRequestingSnapshot) {
							this.isManuallyRequestingSnapshot = false;
							break;
						}
						const { snapshot } = msg.data;
						const mapId = this.mapInfo?.from === "server" ? this.mapInfo.data : useMapData().id;
						const mapVersion = useMapData().info?.version ?? "0.0.0";
						const mapName = useMapData().info?.name ?? "未知地图";
						// 获取玩家名字列表
						const playerNames = Object.keys(snapshot.playerSnapshots).map((userId) => this.getUserNameById(userId));
						this.saveManager.save(snapshot, mapId, mapVersion, mapName, playerNames)
							.then(() => {
								FPMessage({ type: "success", message: "存档成功！" });
							})
							.catch((e) => {
								FPMessage({ type: "error", message: `存档失败: ${e.message}` });
							});
					}
					break;
				case WorkerCommType.DebugStateResponse:
					{
						this.resolvePendingDebugState(msg.data.state);
						const bridge = (window as any).__gpBridge;
						if (bridge && typeof bridge.onState === "function") {
							bridge.onState(msg.data.state);
						}
					}
					break;
				case WorkerCommType.GMActionResponse:
					{
						const actionId = (msg.data as any).action?.id;
						const pending = this.pendingGMResponses.get(actionId);
						if (pending) {
							clearTimeout(pending.timeout);
							this.pendingGMResponses.delete(actionId);
							pending.resolve(msg.data.response);
						}
					}
					break;
				default:
					console.warn("[Room] Unknown Worker message type:", msg.type);
			}
		});
	}

	/**
	 * 处理 Worker 内部错误
	 */
	private handleWorkerErrorInternal(errorData: {
		type: string;
		message: string;
		stack?: string;
		info?: string;
		timestamp?: string;
		additionalData?: Record<string, any>;
	}): void {
		console.error("[GameProcess Worker Error]:", errorData);

			logWorkerError({
				message: errorData.message,
				type: errorData.type,
				error: errorData.stack ? { message: errorData.message, stack: errorData.stack } as Error : undefined,
				workerState: this.workerState,
				extraInfo: { info: errorData.info },
			});

		// 进入安全模式
		this.enterSafeMode(errorData.message, {
			type: errorData.type,
			stack: errorData.stack,
			info: errorData.info,
		});
	}

	/**
	 * 内部处理 Worker 就绪消息
	 */
	private async handleWorkerReadyInternal(): Promise<void> {
		if (!this.mapInfo || !this.gameProcessWorker) return;

		useLoading().showLoading("正在获取地图信息...");

		const mapData = JSON.parse(
			JSON.stringify(useMapData().$state, (key, value) => {
				if (value === Infinity) return "Infinity";
				if (value === -Infinity) return "-Infinity";
				return value;
			}),
		);

		useLoading().showLoading("正在加载地图...");

		this.gameProcessWorker.postMessage(<WorkerCommMsg>{
			type: WorkerCommType.LoadGameInfo,
			data: {
				setting: this.gameSetting,
				mapInfo: mapData,
				userList: this.getGameParticipants(),
				roomOwnerId: this.ownerId,
				aiConfig: this.aiDecisionConfig,
				saveData: this.pendingSaveData ?? undefined,
				initSessionId: this.initSessionId || crypto.randomUUID(),
			},
		});

		this.pendingSaveData = null;

		// 订阅设备状态
		const deviceStatusStore = useDeviceStatus();
		deviceStatusStore.$subscribe((mutation, state) => {
			if (this.gameProcessWorker)
				this.gameProcessWorker.postMessage(<WorkerCommMsg>{
					type: WorkerCommType.EmitOperation,
					data: {
						userId: this.ownerId,
						operateType: state.isFocus ? OperateType.ResumeGame : OperateType.PauseGame,
					},
				});
		});
	}

	private async handleWorkerAIDecisionRequest(data: {
		requestId: string;
		request: AIDecisionRequest;
	}): Promise<void> {
		if (!this.gameProcessWorker) return;

		try {
			const binding = this.getAIPlayerDecisionBinding(data.request.playerId);
			const remoteConfig = this.getResolvedAIRemoteConfig(data.request.playerId);
			const provider = remoteConfig
				? createRemoteAIDecisionProvider(remoteConfig)
				: createAIDecisionProviderFromConfig(this.aiDecisionConfig);
			const selection = await provider.decide(data.request);
			this.broadcastAISelectionChat(data.request, selection);
			this.gameProcessWorker.postMessage(<WorkerCommMsg>{
				type: WorkerCommType.AIDecisionResponse,
				data: {
					requestId: data.requestId,
					selection,
				},
			});
		} catch (error: any) {
			this.gameProcessWorker.postMessage(<WorkerCommMsg>{
				type: WorkerCommType.AIDecisionResponse,
				data: {
					requestId: data.requestId,
					error: error?.message || "AI decision failed",
				},
			});
		}
	}

	/**
	 * 内部处理发送消息给用户
	 */
	private shouldMirrorToOwnerSpectator(msg: ServerSocketMessage): boolean {
		if (msg.msg) {
			return true;
		}
		switch (msg.type) {
			case SocketMsgType.MsgNotify:
			case SocketMsgType.GameInit:
			case SocketMsgType.GameInitFinished:
			case SocketMsgType.GameData:
			case SocketMsgType.GameLog:
			case SocketMsgType.RoundTurn:
			case SocketMsgType.RollDiceStart:
			case SocketMsgType.RollDiceResult:
			case SocketMsgType.RemainingTime:
			case SocketMsgType.CurrentEventName:
			case SocketMsgType.PlayerWalk:
			case SocketMsgType.PlayerTp:
			case SocketMsgType.GainMoney:
			case SocketMsgType.CostMoney:
			case SocketMsgType.GameOver:
			case SocketMsgType.PauseGame:
			case SocketMsgType.ResumeGame:
			case SocketMsgType.MessageCard:
			case SocketMsgType.UseChanceCard:
			case SocketMsgType.ButtonRegister:
			case SocketMsgType.ButtonStateChanged:
			case SocketMsgType.ButtonRemove:
			case SocketMsgType.MapPathChoiceRequest:
				return true;
			default:
				return false;
		}
	}

	private handleSendToUsersInternal(data: {
		userIdList: string[];
		data: ServerSocketMessage;
	}): void {
		for (const userId of data.userIdList) {
			const user = this.userList.get(userId);
			if (user) {
				this.sendToClient(user.socketClient, data.data.type, data.data.data, data.data.msg, data.data.extra);
			}
		}

		if (
			this.ownerSpectatorMode &&
			this.shouldMirrorToOwnerSpectator(data.data) &&
			!data.userIdList.includes(this.ownerId)
		) {
			const owner = this.userList.get(this.ownerId);
			if (owner) {
				this.sendToClient(owner.socketClient, data.data.type, data.data.data, data.data.msg, data.data.extra);
			}
		}
	}

	/**
	 * 处理 GameProcessReady 消息
	 */
	private handleGameProcessReady(): void {
		console.log("GameProcess已就绪");

		// 清除初始化超时定时器
		this.clearInitTimeout();

		// 转换到 Running 状态
		this.transitionTo(WorkerState.Running, "游戏进程就绪");

		// 隐藏加载状态
		useLoading().hideLoading();

		// 启动心跳监控
		this.startHeartbeatMonitor();

		logService.info({
			category: ErrorCategory.WORKER,
			type: "GameProcessReady",
			message: "游戏进程就绪，游戏开始",
		});
	}
}

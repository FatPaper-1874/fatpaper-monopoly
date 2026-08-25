import { OperateListener, type TimeoutInfo } from "./class/OperateListener";
import {
	WorkerCommMsg,
	type GameProcessDebugState,
	GMAction,
	GMActionResponseData,
	SetMoneyAction,
	AddChanceCardAction,
	SetPropertyOwnerAction,
} from "@src/interfaces/worker";
import { WorkerCommType } from "@src/enums/worker";
import {
	AIDecisionConfig,
	ChanceCardInfo,
	TargetSelectType,
	ConfirmDialogOption,
	ConfirmDialogResult,
	GameContext,
	GameData,
	GameEvent,
	GameLinkItem,
	GameLog,
	GameMap,
	GameSetting,
	IGamePhase,
	IGameProcess,
	IGameProcessExportData,
	IPlayer,
	IProperty,
	MapEvent,
	MapItem,
	MapMoveDirection,
	MapMovementSegment,
	MapPath,
	MapPathCanPass,
	MapPathChoiceRequest,
	OperateType,
	PlayerOperationResult,
	PlayerRoundContext,
	ServerSocketMessage,
	SocketMsgSource,
	SocketMsgType,
	UserInRoomInfo,
	TargetSelectDialogOption,
	TargetSelectDialogResult,
	IChanceCard,
	ItemSelectDialogOption,
	ItemSelectDialogResult,
	MessageCardOption,
	GameRuntimeEvent,
	RuntimeMapEvent,
	MapEventType,
	FormDialogOption,
	FormDialogResult,
	FormField,
	MoneyTag,
	ButtonConfig,
	ButtonRegisterMessage,
	ButtonStateChangedMessage,
	ButtonRemoveMessage,
	AIDecisionContextSnapshot,
	AIDecisionOption,
	AIDecisionPrompt,
	AIDecisionRequest,
	AIDecisionSelection,
	AIDecisionProvider,
} from "@mine-monopoly/types";
import { allRuntimeEnums } from "./runtime-enums";
import { ButtonController } from "./ButtonController";

import { Player, type MapMovementHistoryEntry } from "./class/Player";
import { Property } from "./class/Property";
import { ChanceCard } from "./class/ChanceCard";
import { compileTsToJs, randomString } from "@src/utils";
import { GamePhase } from "@src/core/worker/class/GamePhase";
import { GameRuntimeStack } from "@src/core/worker/class/GameRuntimeStack";
import GameProcessTypes from "./editor-lib.d.ts?raw";
import { generatePropertySchema } from "@src/utils/html";
import mitt from "mitt";
import { aiManager } from "./ai";
import type { Emitter } from "mitt";
import { SaveSnapshot, PlayerSnapshot, PropertySnapshot } from "@src/core/save/types";
import { applyWorkerSandbox } from "./security";

import {
	buildMapPathAdjacency,
	getAvailableMapPaths as getAvailableMapPathsFromAdjacency,
	getInitialEnabledMapPathIds,
	getMapItemIdFromPositionIndex,
	getPositionIndexFromMapItemId,
	normalizeGameMap,
	normalizePhases,
	selectDefaultMapPath,
	type MapPathAdjacency,
} from "@mine-monopoly/utils";
// ⚠️ 必须在任何游戏代码执行前调用，切断危险 API
applyWorkerSandbox();

const operationListener = new OperateListener();
let gameProcess: GameProcess | null = null;
const AI_LOG_PREFIX = "[AI Flow]";

type MapMoveOption = {
	path: MapPath;
	targetMapItemId: string;
	direction: MapMoveDirection;
};

function reverseMapMoveDirection(direction: MapMoveDirection): MapMoveDirection {
	return direction === "forward" ? "reverse" : "forward";
}
let aiDecisionRequestSeq = 0;
const pendingAIDecisionRequests = new Map<
	string,
	{
		resolve: (selection: AIDecisionSelection) => void;
		reject: (error: Error) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}
>();

type AITurnActionState = {
	attemptedDynamicButtons: Record<string, string>;
};

type AIPreRollOperationTask = {
	sessionId: number;
	task: Promise<void>;
};

type AIChainedDecisionStep = {
	title: string;
	scene?: AIDecisionRequest["scene"];
	chosen?: string;
	summary?: string;
};

type AIChainedDecisionState = {
	chainId: string;
	eventName: string;
	round: number;
	currentRoundPlayerId?: string;
	steps: AIChainedDecisionStep[];
	lastUpdatedAt: number;
};

class HostBridgeDecisionProvider implements AIDecisionProvider {
	constructor(private readonly config: AIDecisionConfig) {}

	async decide(request: AIDecisionRequest): Promise<AIDecisionSelection> {
		const timeoutMs = this.config.remote.timeoutMs ?? 30000;
		const requestId = `ai-request-${++aiDecisionRequestSeq}`;
		try {
			return await new Promise<AIDecisionSelection>((resolve, reject) => {
				const timeoutId = setTimeout(() => {
					pendingAIDecisionRequests.delete(requestId);
					reject(new Error("AI decision bridge timeout"));
				}, timeoutMs);

				pendingAIDecisionRequests.set(requestId, { resolve, reject, timeoutId });
				self.postMessage(<WorkerCommMsg>{
					type: WorkerCommType.RequestAIDecision,
					data: {
						requestId,
						request,
					},
				});
			});
		} catch (error) {
			console.warn("[AI Remote] bridge request failed", error);
			return {};
		}
	}
}

function applyAIDecisionConfig(config: AIDecisionConfig): void {
	aiManager.setContextMemoryLimit(config.contextMemoryLimit ?? 6);
	aiManager.setProvider(new HostBridgeDecisionProvider(config));
}

function resolveAIDecisionResponse(data: { requestId: string; selection?: AIDecisionSelection; error?: string }): void {
	const pending = pendingAIDecisionRequests.get(data.requestId);
	if (!pending) return;
	clearTimeout(pending.timeoutId);
	pendingAIDecisionRequests.delete(data.requestId);
	if (data.error) {
		pending.reject(new Error(data.error));
		return;
	}
	pending.resolve(data.selection || {});
}

// ========== Web Worker 错误捕获 ==========

// 格式化错误信息
function formatWorkerError(error: Error | string, context?: string): string {
	const errorMsg = error instanceof Error ? error.message : String(error);
	let result = `[Worker Error] ${errorMsg}`;

	if (context) {
		result += `\nContext: ${context}`;
	}

	if (error instanceof Error && error.stack) {
		result += `\nStack:\n${error.stack}`;
	}

	return result;
}

// 发送错误到主线程
function reportWorkerError(error: Error | string, context?: string, additionalData?: Record<string, any>) {
	// 附加游戏状态快照（如果 gameProcess 可用）
	const gameState = gameProcess ? gameProcess.getDebugState() : undefined;

	const errorInfo = {
		type: "Worker" as const,
		message: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
		info: context,
		timestamp: new Date().toISOString(),
		additionalData: {
			...additionalData,
			gameState, // 附加游戏状态快照
		},
	};

	// 通过 postMessage 发送到主线程
	try {
		self.postMessage({
			type: "worker-error",
			data: errorInfo,
		});
	} catch (e) {
		// 如果无法发送错误，至少在控制台输出
		console.error("[Worker Error Reporting Failed]:", e);
		console.error("[Original Error]:", errorInfo);
	}
}

// 捕获 Worker 中的未处理错误
self.addEventListener("error", (event) => {
	console.error("[Worker Uncaught Error]:", event);

	reportWorkerError(event.error || event.message, "Uncaught Exception in Worker", {
		filename: event.filename,
		lineno: event.lineno,
		colno: event.colno,
	});

	event.preventDefault();
});

// 捕获 Worker 中的未处理 Promise 拒绝
self.addEventListener("unhandledrejection", (event) => {
	console.error("[Worker Unhandled Rejection]:", event.reason);

	const reason = event.reason;
	reportWorkerError(reason instanceof Error ? reason : String(reason), "Unhandled Promise Rejection in Worker", {
		promise: "Promise rejection",
	});

	event.preventDefault();
});

// ========== Web Worker 错误捕获结束 ==========

self.postMessage(<WorkerCommMsg>{
	type: WorkerCommType.WorkerReady,
});

self.addEventListener("message", async (ev) => {
	try {
		const data = ev.data as WorkerCommMsg;
		await handleMessage(data);
	} catch (e: any) {
		console.error("[Worker Message Handler Error]:", e);
		reportWorkerError(e, "Message Handler Error");
	}
});

// ========== GM Action 处理函数 ==========

async function handleGMAction(action: GMAction, gameProcess: GameProcess | null): Promise<GMActionResponseData> {
	if (!gameProcess) {
		return { success: false, error: "无游戏进行中" };
	}

	switch (action.type) {
		case "setMoney":
			return await handleSetMoney(action, gameProcess);
		case "addChanceCard":
			return await handleAddChanceCard(action, gameProcess);
		case "setPropertyOwner":
			return await handleSetPropertyOwner(action, gameProcess);
		default:
			return { success: false, error: "Unknown action type" };
	}
}

async function handleSetMoney(
	action: SetMoneyAction & { type: "setMoney" },
	gameProcess: GameProcess,
): Promise<GMActionResponseData> {
	const { playerId, operation, amount } = action.payload;
	const player = gameProcess.players.get(playerId);

	if (!player) {
		return { success: false, error: "玩家不存在" };
	}

	if (typeof amount !== "number" || isNaN(amount)) {
		return { success: false, error: "金额无效" };
	}

	switch (operation) {
		case "set":
			await player.setMoney(amount);
			break;
		case "add":
			await player.gain(amount);
			break;
		case "subtract":
			await player.cost(amount);
			break;
	}

	// 广播游戏状态
	gameProcess.gameDataBroadcast();

	return {
		success: true,
		data: { newMoney: player.money },
	};
}

async function handleAddChanceCard(
	action: AddChanceCardAction & { type: "addChanceCard" },
	gameProcess: GameProcess,
): Promise<GMActionResponseData> {
	const { cardId, targetPlayerId } = action.payload;
	const player = gameProcess.players.get(targetPlayerId);

	if (!player) {
		return { success: false, error: "玩家不存在" };
	}

	const cardInfo = gameProcess.chanceCardInfos.get(cardId);
	if (!cardInfo) {
		return { success: false, error: "机会卡不存在" };
	}

	const newCard = gameProcess.createNewChanceCard(cardId);
	player.chanceCards.push(newCard);

	// 广播游戏状态
	gameProcess.gameDataBroadcast();

	return {
		success: true,
		data: {
			cardName: cardInfo.name,
			targetPlayerName: player.name,
		},
	};
}

async function handleSetPropertyOwner(
	action: SetPropertyOwnerAction & { type: "setPropertyOwner" },
	gameProcess: GameProcess,
): Promise<GMActionResponseData> {
	const { propertyId, newOwnerId } = action.payload;
	const property = gameProcess.properties.get(propertyId);

	if (!property) {
		return { success: false, error: "地产不存在" };
	}

	const oldOwner = property.owner;
	const newOwner = newOwnerId ? gameProcess.players.get(newOwnerId) || undefined : undefined;

	await property.setOwner(newOwner);

	// 广播游戏状态
	gameProcess.gameDataBroadcast();

	return {
		success: true,
		data: {
			propertyName: property.name,
			oldOwner: oldOwner?.id || null,
			newOwner: newOwnerId,
		},
	};
}

// ========== GM Action 处理函数结束 ==========

async function handleMessage(data: WorkerCommMsg) {
	switch (data.type) {
		case WorkerCommType.LoadGameInfo:
			{
				try {
					const { mapInfo, setting, userList, roomOwnerId, aiConfig, saveData, initSessionId } = data.data;
					applyAIDecisionConfig(aiConfig);
					gameProcess = new GameProcess(mapInfo, setting, userList, roomOwnerId);
					gameProcess.setInitSessionId(initSessionId);
					if (saveData) gameProcess.setPendingSaveData(saveData);
					void gameProcess.start().catch((error) => {
						reportWorkerError(error, "GameProcess.start");
					});
				} catch (e: any) {
					console.error("[LoadGameInfo Error]:", e);
					reportWorkerError(e, "LoadGameInfo");
					throw e;
				}
			}
			break;
		case WorkerCommType.UpdateAIDecisionConfig:
			applyAIDecisionConfig(data.data);
			break;
		case WorkerCommType.ClearAIStrategyMemory:
			aiManager.clearStrategyState(data.data?.playerId);
			break;
		case WorkerCommType.AIDecisionResponse:
			resolveAIDecisionResponse(data.data);
			break;
		case WorkerCommType.EmitOperation:
			{
				const { userId, operateType, data: _data, metadata } = data.data;
				operationListener.emit(userId, operateType, _data);
				if (operateType === OperateType.GameInitFinished) gameProcess?.handleInitSignal(userId, metadata);

				// 特殊处理：如果是动画完成事件，检查并调用对应的处理器
				if (operateType === OperateType.Animation && _data && typeof _data === "string") {
					const animationId = _data;
					gameProcess?.markAnimationComplete(animationId);
				}
			}
			break;
		case WorkerCommType.UserOffLine:
			{
				const { userId } = data.data;
				gameProcess && gameProcess.handlePlayerOffline(userId);
			}
			break;
		case WorkerCommType.UserReconnect:
			{
				const { userId } = data.data;
				gameProcess && gameProcess.handlePlayerReconnect(userId);
			}
			break;
		case WorkerCommType.RequestSnapshot:
			{
				if (gameProcess) {
					const snapshot = gameProcess.createSnapshot();
					self.postMessage(<WorkerCommMsg>{
						type: WorkerCommType.SaveSnapshot,
						data: { snapshot },
					});
				}
			}
			break;
		case WorkerCommType.LoadSaveData:
			{
				try {
					if (gameProcess) {
						const { snapshot, aiPlayerIds } = data.data;
						await gameProcess.restoreFromSnapshot(snapshot, aiPlayerIds);
					}
				} catch (e: any) {
					console.error("[LoadSaveData Error]:", e);
					reportWorkerError(e, "LoadSaveData", { snapshot: data.data.snapshot, aiPlayerIds: data.data.aiPlayerIds });
					throw e;
				}
			}
			break;
		case WorkerCommType.DebugGetState:
			{
				console.log("[DebugGetState] received");
				try {
					const state = gameProcess ? gameProcess.getDebugState() : null;
					console.log("[DebugGetState] state serialized, players:", state?.players?.length);
					self.postMessage(<WorkerCommMsg>{
						type: WorkerCommType.DebugStateResponse,
						data: { state },
					});
				} catch (e: any) {
					console.error("[DebugGetState] ERROR:", e.message, e.stack);
					self.postMessage(<WorkerCommMsg>{
						type: WorkerCommType.DebugStateResponse,
						data: { state: null as any },
					});
				}
			}
			break;
		case WorkerCommType.GMAction:
			{
				console.log("[GMAction] received:", data.data);
				try {
					const action = data.data as GMAction;
					const response = await handleGMAction(action, gameProcess);
					self.postMessage(<WorkerCommMsg>{
						type: WorkerCommType.GMActionResponse,
						data: { action, response },
					});
				} catch (e: any) {
					console.error("[GMAction ERROR]:", e.message, e.stack);
					const errorResponse: GMActionResponseData = {
						success: false,
						error: e.message || "Unknown error",
					};
					self.postMessage(<WorkerCommMsg>{
						type: WorkerCommType.GMActionResponse,
						data: { action: data.data, response: errorResponse },
					});
				}
			}
			break;
	}
}

function sendToUsers(userIdList: string[], msg: ServerSocketMessage) {
	self.postMessage(<WorkerCommMsg>{
		type: WorkerCommType.SendToUsers,
		data: {
			userIdList,
			data: msg,
		},
	});
}

(async () => {})();

export class GameProcess implements IGameProcess {
	private initSessionId = "";
	private initialInitBarrier = new Map<string, "pending" | "ready" | "failed" | "offline-ai">();
	private initialInitResolve: (() => void) | null = null;
	private initialInitTimeout: ReturnType<typeof setTimeout> | null = null;
	private reconnectInitSessions = new Map<string, { sessionId: string; timeout: ReturnType<typeof setTimeout> }>();
	private processedInitMessageIds = new Set<string>();
	private static readonly INIT_BARRIER_TIMEOUT = 60000;

	public eventBus: Emitter<GameRuntimeEvent> = mitt<GameRuntimeEvent>();
	public customData: Record<string, any> = {};
	public exportData: IGameProcessExportData = {} as IGameProcessExportData;

	private pendingSaveData: { snapshot: SaveSnapshot; aiPlayerIds: string[] } | null = null;

	/** 从游戏设置中获取回合默认超时（毫秒），取不到时回退 15000ms */
	private get defaultTimeoutMs(): number {
		const seconds = this.gameSetting.turnTimeout?.value;
		return typeof seconds === "number" && seconds > 0 ? seconds * 1000 : 15000;
	}

	public mapData: GameMap;
	public gameSetting: GameSetting;

	// 走路动画常量
	private static readonly WALK_ANIMATION_BASE_DURATION = 350; // 单步动画基础时长
	private static readonly WALK_ANIMATION_EXTRA_STEPS = 3; // 额外的安全步数

	private userList: UserInRoomInfo[];
	private startTime: number = Date.now();

	private gameRoundPhase: {
		roundStartPhase: IGamePhase<GameContext>[];
		roundEndPhase: IGamePhase<GameContext>[];
	};
	public currentGamePhase: IGamePhase<GameContext> | null = null;
	public players: Map<string, Player> = new Map();
	public properties: Map<string, Property> = new Map();
	public chanceCardInfos: Map<string, ChanceCardInfo> = new Map();
	public mapItems: Map<string, MapItem> = new Map();
	public mapEvents: Map<string, RuntimeMapEvent> = new Map();
	private mapPathAdjacency: MapPathAdjacency;
	private enabledPathIds: Set<string>;
	/** 当前游戏会话中注册的路径通行条件，不参与序列化。 */
	private mapPathCanPassConditions: Map<string, MapPathCanPass> = new Map();
	private currentMapMoveDirection?: MapMoveDirection;
	private pendingMapPathChoice?: MapPathChoiceRequest;

	public gameRuntimeStack: GameRuntimeStack = new GameRuntimeStack();

	public currentRoundPlayer: Player | null = null;
	public currentRound: number = 0; //当前回合
	private isGameOver: boolean = false;
	/** 游戏是否处于暂停状态（房主切后台或手动暂停时置位，游戏循环等待恢复信号） */
	private isGamePaused: boolean = false;
	/** 暂停期间游戏循环等待恢复的 resolver（游戏循环为单协程，同一时刻至多一个等待者） */
	private pauseResumeResolve: (() => void) | null = null;
	private timeoutList: any[] = []; //计时器列表
	private intervalTimerList: any[] = []; //计时器列表
	private gameLogList: GameLog[] = [];

	public currentMultiplier: number = 1;

	// 当前事件名称（用于倒计时显示）
	private currentEventName: string = "";

	// 完整的类型定义（包含 GameProcessTypes 和 extraLibs）
	private fullTypes: string = "";

	/** 动画完成处理器映射表（animationId -> cleanup函数） */
	animationCompletionHandlers: Map<string, () => void> = new Map();

	/** 游戏结束时的玩家排名 */
	private rankedPlayerIds: string[] = [];

	/** 动态按钮注册表（外层key: playerId, 内层key: buttonId） */
	private playerButtons: Map<string, Map<string, ButtonConfig>> = new Map();
	/** 跟踪已注册监听器的玩家ID */
	private playerButtonListeners: Set<string> = new Set();
	/** AI 动态按钮决策定时器 */
	private aiDynamicButtonTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	/** AI 动态按钮是否正在决策 */
	private aiDynamicButtonInFlight: Set<string> = new Set();
	/** AI 动态按钮调度抑制（防止同一按钮回调结束后立即再次触发） */
	private aiDynamicButtonSchedulingSuppressed: Set<string> = new Set();
	/** AI 当前回合的主动动作状态 */
	private aiTurnActionState: Map<string, AITurnActionState> = new Map();
	/** AI 预掷骰操作 session 号 */
	private aiPreRollOperationSessionSeq: number = 0;
	/** AI 预掷骰操作当前 session */
	private aiPreRollOperationSessions: Map<string, number> = new Map();
	/** AI 预掷骰操作 broker 任务 */
	private aiPreRollOperationTasks: Map<string, AIPreRollOperationTask> = new Map();
	/** AI 当前是否处于预掷骰操作 broker 中 */
	private aiPreRollOperationPlayers: Set<string> = new Set();
	/** AI 连续弹窗决策链 */
	private aiDecisionChains: Map<string, AIChainedDecisionState> = new Map();
	/** 按钮ID计数器 */
	private buttonIdCounter: number = 0;
	/** 缓存的 UI 替换规则（用于运行时动态创建的 modifier） */
	private cachedUiReplacements: Array<{ token: string; json: string }> = [];
	/** 缓存的 modifier 替换规则（用于运行时动态创建的 modifier） */
	private cachedModReplacements: Array<{ token: string; json: string }> = [];

	/** 心跳定时器 */
	private heartbeatTimer: number | null = null;
	/** 是否正在处理耗时操作 */
	private isProcessingLongOperation: boolean = false;
	/** 心跳间隔（毫秒） */
	private static readonly HEARTBEAT_INTERVAL = 5000;

	public gameOverRuleFunction: (ctx: GameContext, gameProcess: IGameProcess) => Promise<string[] | true | false> =
		async () => {
			return false;
		};

	constructor(mapData: GameMap, gameSetting: GameSetting, userList: UserInRoomInfo[], roomOwnerId: string) {
		this.mapData = normalizeGameMap(mapData);
		// 向后兼容：确保所有阶段类型都已初始化（旧地图可能缺少新增的阶段类型）
		normalizePhases(this.mapData.phases);
		this.mapPathAdjacency = buildMapPathAdjacency(this.mapData.mapPaths);
		this.enabledPathIds = new Set(getInitialEnabledMapPathIds(this.mapData.mapPaths));
		this.gameSetting = gameSetting;
		this.userList = userList;
		// 暴露 gameProcess 给自定义代码，但不可被覆盖
		Object.defineProperty(globalThis, "gameProcess", {
			value: this,
			writable: false,
			configurable: false,
		});

		// 设置运行时可用的枚举（用于动态执行的代码）
		// 从 runtime-enums.ts 统一加载，确保新增枚举时不会遗漏
		// 暴露运行时枚举给自定义代码，浅拷贝后冻结，防止篡改
		for (const [name, value] of Object.entries(allRuntimeEnums)) {
			Object.defineProperty(globalThis, name, {
				value: Object.freeze({ ...value }),
				writable: false,
				configurable: false,
			});
		}

		console.dir(gameSetting);
		console.dir(gameSetting.initMoney.value);

		// 组合完整的类型定义（包含 GameProcessTypes 和 extraLibs）
		this.fullTypes = `${GameProcessTypes}\n${mapData.extraLibs || ""}`;

		// 绑定倒计时广播到 OperateListener
		operationListener.setGlobalTickCallback((timeouts) => {
			if (timeouts.length === 0) {
				this.roundRemainingTimeBroadcast(0, 0);
				this.updateCurrentEventShowCountdown(false);
				return;
			}

			// 嵌套 show 调用时，UI 应展示最近发起的那一个等待，且剩余/总时间必须来自同一计时器。
			const currentTimeout = timeouts.reduce((latest, timeout) =>
				timeout.startedAt >= latest.startedAt ? timeout : latest,
			);
			const remainingSeconds = Math.ceil(currentTimeout.remainingMs / 1000);
			const totalSeconds = Math.ceil(currentTimeout.totalTime / 1000);

			this.roundRemainingTimeBroadcast(remainingSeconds, totalSeconds, currentTimeout);
			this.updateCurrentEventShowCountdown(remainingSeconds > 0);
		});

		// 绑定超时回调到 OperateListener
		operationListener.setTimeoutCallback((timeout) => {
			this.gameBroadcast(<ServerSocketMessage>{
				type: SocketMsgType.RoundTimeOut,
				source: SocketMsgSource.Server,
				data: {
					playerId: timeout.playerId,
					eventType: timeout.eventType,
					timeoutId: timeout.timeoutId,
				},
			});
		});

		// 暂停/恢复：房主切后台自动触发(deviceStatus)，也可通过设置界面手动触发
		operationListener.on(roomOwnerId, OperateType.PauseGame, () => {
			console.log("PauseGame");
			this.setGamePaused(true);
			this.gameBroadcast(<ServerSocketMessage>{
				type: SocketMsgType.PauseGame,
				msg: {
					type: "info",
					content: "游戏已暂停",
				},
			});
		});
		operationListener.on(roomOwnerId, OperateType.ResumeGame, () => {
			console.log("ResumeGame");
			this.setGamePaused(false);
			this.gameBroadcast(<ServerSocketMessage>{
				type: SocketMsgType.ResumeGame,
				msg: {
					type: "info",
					content: "游戏继续",
				},
			});
		});

		this.preprocessingEffectCode();
		this.gameRoundPhase = {
			roundStartPhase: mapData.phases.gameRoundStart.map(
				(phaseInfo) => new GamePhase(phaseInfo, undefined, mapData.extraLibs),
			),
			roundEndPhase: mapData.phases.gameRoundEnd.map(
				(phaseInfo) => new GamePhase(phaseInfo, undefined, mapData.extraLibs),
			),
		};
		this.initGameOverRuleFunction();
		this.initMap();
	}

	/**
	 * 为指定玩家注册动态按钮
	 * @param playerId 玩家ID
	 * @param text 按钮文案
	 * @param callback 点击回调函数
	 * @returns ButtonController 按钮控制实例
	 */
	public registerPlayerButton(playerId: string, text: string, callback: () => Promise<void> | void): ButtonController {
		// 验证玩家ID
		if (!this.players.has(playerId)) {
			throw new Error(`玩家不存在: ${playerId}`);
		}

		// 验证文案
		const buttonText = text.trim() || "按钮";

		// 验证回调
		if (typeof callback !== "function") {
			throw new TypeError("callback must be a function");
		}

		// 生成唯一buttonId
		const buttonId = `dynamic-btn-${playerId}-${++this.buttonIdCounter}`;

		// 创建按钮配置
		const config: ButtonConfig = {
			id: buttonId,
			playerId,
			text: buttonText,
			enabled: true,
			visible: true,
			callback,
		};

		// 存储配置
		if (!this.playerButtons.has(playerId)) {
			this.playerButtons.set(playerId, new Map());
		}
		this.playerButtons.get(playerId)!.set(buttonId, config);

		// 创建控制器
		const controller = new ButtonController(buttonId, playerId, this);

		// 为该玩家注册按钮点击监听器（每个玩家只注册一次）
		if (!this.playerButtonListeners.has(playerId)) {
			this.playerButtonListeners.add(playerId);
			operationListener.on(
				playerId,
				OperateType.DynamicButtonClick,
				async (data: PlayerOperationResult[OperateType.DynamicButtonClick]) => {
					await this.handleDynamicButtonClick(playerId, data.buttonId);
				},
			);
		}

		// 通知客户端
		const registerMessage: ButtonRegisterMessage = {
			buttonId,
			text: buttonText,
			enabled: true,
			visible: true,
		};

		this.sendToPlayer(playerId, {
			type: SocketMsgType.ButtonRegister,
			source: SocketMsgSource.Server,
			data: registerMessage,
		});

		this.scheduleAIDynamicButtonDecision(playerId);

		return controller;
	}

	/**
	 * 设置按钮启用状态
	 * @param playerId 玩家ID
	 * @param buttonId 按钮ID
	 * @param enabled 是否启用
	 */
	public setButtonEnabled(playerId: string, buttonId: string, enabled: boolean): void {
		const playerButtons = this.playerButtons.get(playerId);
		if (!playerButtons || !playerButtons.has(buttonId)) {
			return;
		}

		const config = playerButtons.get(buttonId)!;
		config.enabled = enabled;

		const stateMessage: ButtonStateChangedMessage = {
			buttonId,
			enabled,
		};

		this.sendToPlayer(playerId, {
			type: SocketMsgType.ButtonStateChanged,
			source: SocketMsgSource.Server,
			data: stateMessage,
		});

		if (enabled && config.visible && !this.aiDynamicButtonSchedulingSuppressed.has(playerId)) {
			this.scheduleAIDynamicButtonDecision(playerId);
		}
	}

	/**
	 * 设置按钮可见性
	 * @param playerId 玩家ID
	 * @param buttonId 按钮ID
	 * @param visible 是否可见
	 */
	public setButtonVisible(playerId: string, buttonId: string, visible: boolean): void {
		const playerButtons = this.playerButtons.get(playerId);
		if (!playerButtons || !playerButtons.has(buttonId)) {
			return;
		}

		const config = playerButtons.get(buttonId)!;
		config.visible = visible;

		const stateMessage: ButtonStateChangedMessage = {
			buttonId,
			visible,
		};

		this.sendToPlayer(playerId, {
			type: SocketMsgType.ButtonStateChanged,
			source: SocketMsgSource.Server,
			data: stateMessage,
		});

		if (visible && config.enabled) {
			this.scheduleAIDynamicButtonDecision(playerId);
		}
	}

	/**
	 * 设置按钮文案
	 * @param playerId 玩家ID
	 * @param buttonId 按钮ID
	 * @param text 按钮文案
	 */
	public setButtonText(playerId: string, buttonId: string, text: string): void {
		const playerButtons = this.playerButtons.get(playerId);
		if (!playerButtons || !playerButtons.has(buttonId)) {
			return;
		}

		const config = playerButtons.get(buttonId)!;
		config.text = text.trim() || "按钮";

		const stateMessage: ButtonStateChangedMessage = {
			buttonId,
			text: config.text,
		};

		this.sendToPlayer(playerId, {
			type: SocketMsgType.ButtonStateChanged,
			source: SocketMsgSource.Server,
			data: stateMessage,
		});

		if (config.visible && config.enabled) {
			this.scheduleAIDynamicButtonDecision(playerId);
		}
	}

	/**
	 * 移除按钮
	 * @param playerId 玩家ID
	 * @param buttonId 按钮ID
	 */
	public removeButton(playerId: string, buttonId: string): void {
		const playerButtons = this.playerButtons.get(playerId);
		if (!playerButtons || !playerButtons.has(buttonId)) {
			return;
		}

		// 从存储中删除
		playerButtons.delete(buttonId);

		// 通知客户端
		const removeMessage: ButtonRemoveMessage = {
			buttonId,
		};

		this.sendToPlayer(playerId, {
			type: SocketMsgType.ButtonRemove,
			source: SocketMsgSource.Server,
			data: removeMessage,
		});

		this.scheduleAIDynamicButtonDecision(playerId);
	}

	// ==================== 动态地图事件管理 ====================

	/**
	 * 运行时动态添加地图事件
	 * 编译 effectCode 并注册到 mapEvents，同时通知所有客户端
	 * @param mapEvent 地图事件（含 effectCode TypeScript 代码）
	 */
	public addRuntimeMapEvent(mapEvent: MapEvent): void {
		try {
			const effectCode = compileTsToJs(mapEvent.effectCode, this.fullTypes);
			const runtimeEvent: RuntimeMapEvent = {
				...mapEvent,
				effectCode,
				fn: new Function(effectCode)(),
			};
			this.mapEvents.set(mapEvent.id, runtimeEvent);
			this.gameBroadcast({
				type: SocketMsgType.MapEventChanged,
				source: SocketMsgSource.Server,
				data: { action: "add", mapEvent },
			});
		} catch (e: any) {
			console.error(`[addRuntimeMapEvent] 地图事件 "${mapEvent.name || mapEvent.id}" 添加失败:`, e);
			reportWorkerError(e, `动态地图事件添加: ${mapEvent.name || mapEvent.id}`);
		}
	}

	/**
	 * 运行时动态移除地图事件
	 * @param mapEventId 事件 ID
	 */
	public removeRuntimeMapEvent(mapEventId: string): void {
		if (this.mapEvents.has(mapEventId)) {
			this.mapEvents.delete(mapEventId);
			// 清理所有引用此事件的地块
			for (const [, mapItem] of this.mapItems) {
				if (mapItem.mapEventId === mapEventId) {
					mapItem.mapEventId = undefined;
				}
			}
			this.gameBroadcast({
				type: SocketMsgType.MapEventChanged,
				source: SocketMsgSource.Server,
				data: { action: "remove", mapEventId },
			});
		}
	}

	/**
	 * 运行时动态关联地图事件到地块
	 * @param mapItemId 地块 ID
	 * @param mapEventId 事件 ID
	 */
	public linkMapEvent(mapItemId: string, mapEventId: string): void {
		const mapItem = this.mapItems.get(mapItemId);
		if (!mapItem) {
			console.warn(`[linkMapEvent] 找不到地块: ${mapItemId}`);
			return;
		}
		const mapEvent = this.mapEvents.get(mapEventId);
		if (!mapEvent) {
			console.warn(`[linkMapEvent] 找不到地图事件: ${mapEventId}`);
			return;
		}
		mapItem.mapEventId = mapEventId;
		// 剥离不可序列化的 fn 属性后广播
		const { fn: _fn, ...serializableEvent } = mapEvent;
		this.gameBroadcast({
			type: SocketMsgType.MapEventChanged,
			source: SocketMsgSource.Server,
			data: { action: "link", mapEventId, mapItemId, mapEvent: serializableEvent },
		});
	}

	/**
	 * 运行时取消地块的事件关联
	 * @param mapItemId 地块 ID
	 */
	public unlinkMapEvent(mapItemId: string): void {
		const mapItem = this.mapItems.get(mapItemId);
		if (!mapItem) {
			console.warn(`[unlinkMapEvent] 找不到地块: ${mapItemId}`);
			return;
		}
		const previousEventId = mapItem.mapEventId;
		mapItem.mapEventId = undefined;
		this.gameBroadcast({
			type: SocketMsgType.MapEventChanged,
			source: SocketMsgSource.Server,
			data: { action: "unlink", mapEventId: previousEventId, mapItemId },
		});
	}

	/**
	 * 获取玩家的所有按钮（用于解决时序问题）
	 * @param playerId 玩家ID
	 * @returns 玩家的所有按钮配置列表
	 */
	public getPlayerButtons(playerId: string): ButtonConfig[] {
		const playerButtons = this.playerButtons.get(playerId);
		if (!playerButtons) {
			return [];
		}
		return Array.from(playerButtons.values());
	}

	private scheduleAIDynamicButtonDecision(playerId: string): void {
		const player = this.players.get(playerId);
		if (!player?.isAI || this.currentRoundPlayer?.id !== playerId || this.aiPreRollOperationPlayers.has(playerId)) {
			return;
		}

		const previousTimer = this.aiDynamicButtonTimers.get(playerId);
		if (previousTimer) {
			clearTimeout(previousTimer);
		}

		const timer = setTimeout(() => {
			this.aiDynamicButtonTimers.delete(playerId);
			void this.tryAIDynamicButtonDecision(playerId);
		}, 180);
		this.aiDynamicButtonTimers.set(playerId, timer);
	}

	private async tryAIDynamicButtonDecision(playerId: string): Promise<void> {
		const player = this.players.get(playerId);
		if (
			!player?.isAI ||
			this.currentRoundPlayer?.id !== playerId ||
			this.aiDynamicButtonInFlight.has(playerId) ||
			this.aiPreRollOperationPlayers.has(playerId)
		) {
			return;
		}

		const request = this.buildDynamicButtonDecisionRequest(player, this.buildAIDecisionContext(player));
		if (!request) {
			return;
		}
		this.ensureAIDecisionMetadata(request, playerId, `dynamic-button:${request.title}`);

		this.aiDynamicButtonInFlight.add(playerId);
		try {
			console.log(`${AI_LOG_PREFIX} dynamic-button request`, {
				decisionId: request.metadata?.decisionId,
				playerId,
				title: request.title,
				scene: request.scene,
				options: request.options.map((option) => ({
					id: option.id,
					label: option.label,
					actionType: option.actionType,
				})),
			});
			const selection = await this.runAIDecision(player, request);
			console.log(`${AI_LOG_PREFIX} dynamic-button selection`, {
				decisionId: request.metadata?.decisionId,
				playerId,
				selection,
			});
			const selectedOptionId = selection.optionId;
			const selectedOption = request.options.find((option) => option.id === selectedOptionId);
			const buttonId = String(selectedOption?.payload?.id || selectedOptionId || "");
			if (!selectedOption || !buttonId) {
				return;
			}

			this.markAITurnDynamicButtonAttempt(playerId, buttonId, selectedOption.label);
			aiManager.feedback({
				playerId,
				request,
				selection,
				outcome: "dynamic-button",
			});
			console.log(`${AI_LOG_PREFIX} execute dynamic button`, {
				decisionId: request.metadata?.decisionId,
				playerId,
				buttonId,
				label: selectedOption.label,
			});
			await this.handleDynamicButtonClick(playerId, buttonId);
		} finally {
			this.aiDynamicButtonInFlight.delete(playerId);
		}
	}

	private ensureAIPreRollOperationSession(playerId: string): number {
		const currentSessionId = this.aiPreRollOperationSessions.get(playerId);
		if (currentSessionId) {
			return currentSessionId;
		}

		const sessionId = ++this.aiPreRollOperationSessionSeq;
		this.aiPreRollOperationSessions.set(playerId, sessionId);
		return sessionId;
	}

	private isAIPreRollOperationSessionActive(playerId: string, sessionId: number): boolean {
		return this.currentRoundPlayer?.id === playerId && this.aiPreRollOperationSessions.get(playerId) === sessionId;
	}

	private invalidateAIPreRollOperationSession(playerId: string): void {
		this.aiPreRollOperationSessions.delete(playerId);
		this.aiPreRollOperationPlayers.delete(playerId);
		this.aiPreRollOperationTasks.delete(playerId);
	}

	private syncAIPreRollOperationSession(playerId: string): void {
		const hasRollDiceListener = operationListener.hasListener(playerId, OperateType.RollDice);
		const hasUseChanceCardListener = operationListener.hasListener(playerId, OperateType.UseChanceCard);
		if (!hasRollDiceListener && !hasUseChanceCardListener) {
			this.invalidateAIPreRollOperationSession(playerId);
		}
	}

	private closeAIPreRollOperationSessionAndEmit<T extends OperateType>(
		playerId: string,
		sessionId: number,
		operationType: T,
		data: PlayerOperationResult[T],
	): void {
		if (!this.isAIPreRollOperationSessionActive(playerId, sessionId)) {
			return;
		}
		this.invalidateAIPreRollOperationSession(playerId);
		this.emitPlayerOperation(playerId, operationType, data);
	}

	private ensureAIPreRollOperationBroker(player: Player): void {
		if (!player.isAI || this.currentRoundPlayer?.id !== player.id) {
			return;
		}
		const sessionId = this.ensureAIPreRollOperationSession(player.id);
		if (this.aiPreRollOperationTasks.has(player.id)) {
			return;
		}

		const pendingTimer = this.aiDynamicButtonTimers.get(player.id);
		if (pendingTimer) {
			clearTimeout(pendingTimer);
			this.aiDynamicButtonTimers.delete(player.id);
		}

		this.aiPreRollOperationPlayers.add(player.id);
		const task = this.runAIPreRollOperationBroker(player.id, sessionId)
			.catch((error) => {
				console.error(`${AI_LOG_PREFIX} pre-roll broker failed`, {
					playerId: player.id,
					sessionId,
					error,
				});
			})
			.finally(() => {
				const currentTask = this.aiPreRollOperationTasks.get(player.id);
				if (currentTask?.sessionId === sessionId) {
					this.aiPreRollOperationPlayers.delete(player.id);
					this.aiPreRollOperationTasks.delete(player.id);
				}
			});
		this.aiPreRollOperationTasks.set(player.id, {
			sessionId,
			task,
		});
	}

	private async runAIPreRollOperationBroker(playerId: string, sessionId: number): Promise<void> {
		const blockedChanceCardIds = new Set<string>();
		// Let the current synchronous phase script finish registering all pre-roll listeners
		// before we snapshot available actions for the AI.
		await Promise.resolve();

		while (this.isAIPreRollOperationSessionActive(playerId, sessionId)) {
			const player = this.players.get(playerId);
			if (!player?.isAI) {
				return;
			}

			const allowRollDice = operationListener.hasListener(playerId, OperateType.RollDice);
			const allowUseChanceCard = operationListener.hasListener(playerId, OperateType.UseChanceCard);
			if (!allowRollDice && !allowUseChanceCard) {
				return;
			}

			const request = this.buildAIPreRollOperationRequest(player, {
				allowRollDice,
				allowUseChanceCard,
				blockedChanceCardIds,
			});
			if (!request) {
				if (allowRollDice) {
					console.log(`${AI_LOG_PREFIX} pre-roll broker auto-roll`, {
						playerId,
						reason: "no_active_actions",
					});
					this.closeAIPreRollOperationSessionAndEmit(
						playerId,
						sessionId,
						OperateType.RollDice,
						undefined as PlayerOperationResult[OperateType.RollDice],
					);
				}
				return;
			}
			this.ensureAIDecisionMetadata(request, playerId, `pre-roll:${request.title}`);

			console.log(`${AI_LOG_PREFIX} pre-roll request`, {
				decisionId: request.metadata?.decisionId,
				playerId,
				sessionId,
				title: request.title,
				scene: request.scene,
				options: request.options.map((option) => ({
					id: option.id,
					label: option.label,
					actionType: option.actionType,
					actionKind: option.payload?.actionKind,
				})),
			});
			const selection = await this.runAIDecision(player, request);
			console.log(`${AI_LOG_PREFIX} pre-roll selection`, {
				decisionId: request.metadata?.decisionId,
				playerId,
				sessionId,
				selection,
			});
			if (!this.isAIPreRollOperationSessionActive(playerId, sessionId)) {
				console.log(`${AI_LOG_PREFIX} stale pre-roll selection ignored`, {
					playerId,
					sessionId,
				});
				return;
			}

			const selectedOptionId = selection.optionId;
			if (!selectedOptionId || selectedOptionId === "__finish_pre_roll__" || selectedOptionId === "__cancel__") {
				aiManager.feedback({
					playerId,
					request,
					selection,
					outcome: "finish-pre-roll",
				});
				if (allowRollDice) {
					this.closeAIPreRollOperationSessionAndEmit(
						playerId,
						sessionId,
						OperateType.RollDice,
						undefined as PlayerOperationResult[OperateType.RollDice],
					);
				}
				return;
			}

			const selectedOption = request.options.find((option) => option.id === selectedOptionId);
			if (!selectedOption) {
				if (allowRollDice) {
					this.closeAIPreRollOperationSessionAndEmit(
						playerId,
						sessionId,
						OperateType.RollDice,
						undefined as PlayerOperationResult[OperateType.RollDice],
					);
				}
				return;
			}

			const actionKind = String(selectedOption.payload?.actionKind || "");
			if (actionKind === "dynamic-button") {
				const buttonId = String(selectedOption.payload?.id || "");
				if (!buttonId) {
					if (allowRollDice) {
						this.closeAIPreRollOperationSessionAndEmit(
							playerId,
							sessionId,
							OperateType.RollDice,
							undefined as PlayerOperationResult[OperateType.RollDice],
						);
					}
					return;
				}

				this.markAITurnDynamicButtonAttempt(playerId, buttonId, selectedOption.label);
				aiManager.feedback({
					playerId,
					request,
					selection,
					outcome: "dynamic-button",
				});
				console.log(`${AI_LOG_PREFIX} pre-roll execute dynamic button`, {
					decisionId: request.metadata?.decisionId,
					playerId,
					sessionId,
					buttonId,
					label: selectedOption.label,
				});
				await this.handleDynamicButtonClick(playerId, buttonId);
				if (!this.isAIPreRollOperationSessionActive(playerId, sessionId)) {
					return;
				}
				continue;
			}

			if (actionKind === "use-chance-card") {
				const chanceCardId = String(selectedOption.payload?.id || "");
				if (!allowUseChanceCard) {
					if (allowRollDice) {
						this.closeAIPreRollOperationSessionAndEmit(
							playerId,
							sessionId,
							OperateType.RollDice,
							undefined as PlayerOperationResult[OperateType.RollDice],
						);
					}
					return;
				}
				if (!chanceCardId) {
					if (allowRollDice) {
						this.closeAIPreRollOperationSessionAndEmit(
							playerId,
							sessionId,
							OperateType.RollDice,
							undefined as PlayerOperationResult[OperateType.RollDice],
						);
					}
					return;
				}

				const chanceCard = player.getCardById(chanceCardId);
				if (!chanceCard) {
					blockedChanceCardIds.add(chanceCardId);
					continue;
				}

				const targetIdList = await this.buildAIChanceCardTargetIds(player, chanceCardId);
				if (!this.isAIPreRollOperationSessionActive(playerId, sessionId)) {
					return;
				}
				if (chanceCard.getType() !== TargetSelectType.ToSelf && targetIdList.length === 0) {
					aiManager.feedback({
						playerId,
						request,
						selection,
						outcome: "chance-card-no-target",
					});
					blockedChanceCardIds.add(chanceCardId);
					continue;
				}

				aiManager.feedback({
					playerId,
					request,
					selection,
					outcome: "chance-card",
				});
				console.log(`${AI_LOG_PREFIX} pre-roll emit chance card`, {
					decisionId: request.metadata?.decisionId,
					playerId,
					sessionId,
					chanceCardId,
					label: selectedOption.label,
					targetIdList,
				});
				this.closeAIPreRollOperationSessionAndEmit(playerId, sessionId, OperateType.UseChanceCard, {
					chanceCardId,
					targetIdList,
				});
				return;
			}

			if (allowRollDice) {
				this.closeAIPreRollOperationSessionAndEmit(
					playerId,
					sessionId,
					OperateType.RollDice,
					undefined as PlayerOperationResult[OperateType.RollDice],
				);
			}
			return;
		}
	}

	/**
	 * 处理客户端按钮点击操作
	 * @param playerId 玩家ID
	 * @param buttonId 按钮ID
	 */
	private async handleDynamicButtonClick(playerId: string, buttonId: string): Promise<void> {
		// 特殊处理：同步按钮请求
		if (buttonId === "__sync__") {
			const playerButtons = this.playerButtons.get(playerId);
			if (playerButtons) {
				for (const [id, config] of playerButtons) {
					const registerMessage: ButtonRegisterMessage = {
						buttonId: id,
						text: config.text,
						enabled: config.enabled,
						visible: config.visible,
					};

					this.sendToPlayer(playerId, {
						type: SocketMsgType.ButtonRegister,
						source: SocketMsgSource.Server,
						data: registerMessage,
					});
				}
			}
			return;
		}

		const playerButtons = this.playerButtons.get(playerId);
		if (!playerButtons || !playerButtons.has(buttonId)) {
			console.warn(`[ButtonAPI] 按钮不存在: ${buttonId}`);
			return;
		}

		const config = playerButtons.get(buttonId)!;

		// 检查按钮是否启用
		if (!config.enabled) {
			return;
		}

		// 临时禁用按钮（防止重复点击）
		this.aiDynamicButtonSchedulingSuppressed.add(playerId);
		this.setButtonEnabled(playerId, buttonId, false);
		config.enabled = false;

		try {
			// 执行回调
			await config.callback();
		} catch (error) {
			console.error(`[ButtonAPI] 按钮回调执行失败: ${buttonId}`, error);

			// 发送失败通知
			this.messageNotify([playerId], {
				type: "error",
				content: error instanceof Error ? error.message : "操作失败",
			});
		} finally {
			// 重新启用按钮
			config.enabled = true;
			this.setButtonEnabled(playerId, buttonId, true);
			this.aiDynamicButtonSchedulingSuppressed.delete(playerId);
		}
	}

	private preprocessingEffectCode() {
		const { mapEvents, chanceCards, roles, mapItems, phases, uiTemplates, modifierTemplates } = this.mapData;

		const uiReplacements = (uiTemplates || [])
			.filter((t) => t.slug && t.template)
			.map((t) => ({
				token: `$ui__${t.slug}`,
				json: JSON.stringify(t.template),
			}))
			.sort((a, b) => b.token.length - a.token.length);

		// 缓存替换规则，供运行时动态创建的 modifier 使用
		this.cachedUiReplacements = uiReplacements;

		// 预编译所有 modifier 模板的 effectCode：TypeScript → JavaScript
		// 直接修改 mapData 中的模板，确保 initCode 和 restoreModifiers 都使用编译后的代码
		if (modifierTemplates) {
			for (const t of modifierTemplates) {
				t.effectCode = compileTsToJs(t.effectCode, "").replace(/^"use strict";\n?/, "");
			}
		}

		const modReplacements = (modifierTemplates || [])
			.filter((t) => t.slug)
			.map((t) => ({
				token: `$mod__${t.slug}`,
				json: JSON.stringify(t),
			}))
			.sort((a, b) => b.token.length - a.token.length);

		// 缓存替换规则，供运行时动态创建的 modifier 使用
		this.cachedModReplacements = modReplacements;

		/**
		 * 核心处理函数：
		 * 1. 替换 $ui__xxx 为 JSON 对象
		 * 2. 包装 return 语句
		 */
		const processCode = (code: string | undefined | null): string => {
			if (!code || !code.trim()) return "";

			let processedCode = code;

			// 执行全局替换
			for (const { token, json } of uiReplacements) {
				processedCode = processedCode.split(token).join(json);
			}

			for (const { token, json } of modReplacements) {
				processedCode = processedCode.split(token).join(json);
			}

			return `return ${processedCode}`;
		};

		// --- 2. 批量应用 ---

		for (const mapEvent of mapEvents) {
			mapEvent.effectCode = processCode(mapEvent.effectCode);
		}

		for (const chanceCard of chanceCards) {
			chanceCard.effectCode = processCode(chanceCard.effectCode);
		}

		for (const role of roles) {
			role.initCode = processCode(role.initCode);
		}

		for (const mapItem of mapItems) {
			if (mapItem.property && mapItem.property.custom) {
				mapItem.property.custom.effectCode = processCode(mapItem.property.custom.effectCode);
			}
		}

		Object.values(phases).forEach((phaseList) => {
			for (const phase of phaseList) {
				phase.initEventCode = processCode(phase.initEventCode);
			}
		});

		// 处理 modifierTemplates 的 effectCode（已编译过，只需替换 $ui__）
		// 注意：ModifiersManager 使用 "return " + effectCode，所以这里不包装 return
		if (modifierTemplates) {
			for (const t of modifierTemplates) {
				let processedCode = t.effectCode;
				// 执行 $ui__ 和 $mod__ 替换，不包装 return
				for (const { token, json } of uiReplacements) {
					processedCode = processedCode.split(token).join(json);
				}
				for (const { token, json } of modReplacements) {
					processedCode = processedCode.split(token).join(json);
				}
				t.effectCode = processedCode;
				// 标记为已处理，避免 ModifiersManager.add 重复处理
				(t as { _uiProcessed?: true })._uiProcessed = true;
			}
		}
	}

	private initGameOverRuleFunction() {
		const { phases } = this.mapData;
		const gameOverRule = phases.gameOverRule;
		const compiledCode = compileTsToJs(gameOverRule[0].initEventCode, this.fullTypes);
		this.gameOverRuleFunction = new Function(compiledCode)() as () => Promise<string[] | true | false>;
	}

	private initMap() {
		const { mapItems, mapEvents, chanceCards } = this.mapData;

		mapEvents.forEach((mapEvent) => {
			try {
				const effectCode = compileTsToJs(mapEvent.effectCode, this.fullTypes);
				this.mapEvents.set(mapEvent.id, {
					...mapEvent,
					effectCode,
					fn: new Function(effectCode)(),
				});
			} catch (e: any) {
				console.error(`[initMap] 地图事件 "${mapEvent.name || mapEvent.id}" 初始化失败:`, e);
				reportWorkerError(e, `地图事件初始化: ${mapEvent.name || mapEvent.id}`);
			}
		});

		mapItems.forEach((mapItem) => {
			if (mapItem.property) {
				const property = mapItem.property;
				this.properties.set(property.id, new Property(property, this.mapData.extraLibs));
			}
			this.mapItems.set(mapItem.id, mapItem);
		});

		chanceCards.forEach((chanceCard) => {
			this.chanceCardInfos.set(chanceCard.id, {
				...chanceCard,
				effectCode: compileTsToJs(chanceCard.effectCode, this.fullTypes),
			});
		});
	}

	private async initPlayers(savedRoleIds?: Map<string, string>) {
		// 打乱玩家顺序，确保房主不总是第一个行动
		const shuffledList = [...this.userList];
		for (let i = shuffledList.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffledList[i], shuffledList[j]] = [shuffledList[j], shuffledList[i]];
		}
		this.userList = shuffledList;

		// 步骤1: 创建所有玩家实例并设置 commandBus
		this.userList.forEach((u) => {
			// 优先使用存档中的 roleId，如果没有则使用房间选择的 roleId
			const roleId = savedRoleIds?.get(u.userId) ?? u.roleId;
			const role = this.mapData.roles.find((r) => r.id === roleId);
			if (!role) throw Error(`找不到对应角色: ${roleId}`);
			const player = new Player(
				u,
				this.gameSetting.initMoney.value || 10000,
				0,
				this.mapData.phases.playerRound,
				role,
				this.mapData.startMapItemId || "",
				this.mapData.extraLibs,
			);
			player.isAI = Boolean(u.isAI);
			player.setBankruptcyHandler((bankruptedPlayer) => this.releaseBankruptedPlayerAssets(bankruptedPlayer));
			player.setPositionIndex(0);
			const startMapItemId = this.mapData.startMapItemId ?? this.mapData.mapIndex[0];
			if (!startMapItemId) throw new Error("地图缺少有效起点，无法初始化玩家位置");
			player.setPositionMapItemId(startMapItemId);
			this.players.set(player.id, player);

			player.commandBus.setHandler("player.walk", async (payload) => {
				this.setCurrentEventName(`${player.name} 正在走路`);
				const { steps } = payload;
				const totalSteps = Math.abs(steps);
				const isForcedReverse = steps < 0;
				const segments: MapMovementSegment[] = [];
				const passedItems: {
					mapItemId: string;
					index: number;
					mapItem?: MapItem;
					pathId?: string;
					direction?: MapMoveDirection;
				}[] = [];
				let passedIndex = 0;
				let completedSteps = 0;
				const rejectedAutomaticPathIds = new Set<string>();
				let currentMapItemId =
					player.positionMapItemId ??
					getMapItemIdFromPositionIndex(player.positionIndex, this.mapData.mapIndex) ??
					this.mapData.startMapItemId;

				if (!currentMapItemId || !this.mapItems.has(currentMapItemId)) {
					throw new Error(`玩家 ${player.name} 缺少有效地图位置，无法移动`);
				}
				player.setPositionMapItemId(currentMapItemId);

				try {
					while (completedSteps < totalSteps) {
						let selectedOption: MapMoveOption | undefined;
						let isHistoryBacktrack = false;
						let isAutomaticPathSelection = false;

						const lastHistoryEntry = player.getLastMovementHistoryEntry();
						if (lastHistoryEntry && lastHistoryEntry.toMapItemId !== currentMapItemId) {
							console.warn("[MapPath] 玩家导航轨迹与当前位置不一致，已重置导航状态", {
								playerId: player.id,
								mapItemId: currentMapItemId,
								lastHistoryEntry,
							});
							player.resetMapNavigation();
						}

						const historyEntry: MapMovementHistoryEntry | undefined = player.getLastMovementHistoryEntry();
						const incomingMapItemId: string | undefined =
							historyEntry && historyEntry.toMapItemId === currentMapItemId ? historyEntry.fromMapItemId : undefined;
						const createHistoryReturnOption = (entry: MapMovementHistoryEntry): MapMoveOption | undefined => {
							const path = this.getMapPathById(entry.pathId);
							if (!path) return undefined;
							return {
								path,
								targetMapItemId: entry.fromMapItemId,
								direction: reverseMapMoveDirection(entry.direction),
							};
						};

						if (isForcedReverse && historyEntry) {
							selectedOption = createHistoryReturnOption(historyEntry);
							if (!selectedOption) {
								console.warn("[MapPath] 玩家强制倒退中断：历史路径已不存在", {
									playerId: player.id,
									pathId: historyEntry.pathId,
								});
								break;
							}
							isHistoryBacktrack = true;
						} else {
							const direction: MapMoveDirection = isForcedReverse ? "reverse" : "forward";
							const options = this.getMapMoveOptions(currentMapItemId, direction);
							const selectableCandidates: MapMoveOption[] = isForcedReverse
								? options
								: player.returnFromMapItemId
									? options.filter(
											(option) =>
												option.targetMapItemId !== player.returnFromMapItemId &&
												option.targetMapItemId !== incomingMapItemId,
										)
									: options.filter((option) => option.targetMapItemId !== incomingMapItemId);

							if (selectableCandidates.length === 0) {
								if (isForcedReverse || !historyEntry) {
									console.warn("[MapPath] 玩家移动中断：当前位置没有可走路径", {
										playerId: player.id,
										mapItemId: currentMapItemId,
										remainingSteps: totalSteps - completedSteps,
									});
									break;
								}
								selectedOption = createHistoryReturnOption(historyEntry);
								if (!selectedOption) {
									console.warn("[MapPath] 玩家移动中断：回退路径已不存在", {
										playerId: player.id,
										pathId: historyEntry.pathId,
									});
									break;
								}
								isHistoryBacktrack = true;
							} else {
								isAutomaticPathSelection = player.isAI || selectableCandidates.length === 1;
								const candidateOptions = isAutomaticPathSelection
									? selectableCandidates.filter((option) => !rejectedAutomaticPathIds.has(option.path.id))
									: selectableCandidates;
								if (candidateOptions.length === 0) {
									console.warn("[MapPath] 玩家移动中断：所有自动选路候选均无法通行", {
										playerId: player.id,
										mapItemId: currentMapItemId,
										remainingSteps: totalSteps - completedSteps,
									});
									break;
								}
								const defaultPath = selectDefaultMapPath(candidateOptions.map((option) => option.path));
								const defaultSelectedOption: MapMoveOption =
									candidateOptions.find((option) => option.path.id === defaultPath?.id) ?? candidateOptions[0]!;
								selectedOption = defaultSelectedOption;

								if (!isAutomaticPathSelection) {
									const request: MapPathChoiceRequest = {
										requestId: randomString(16),
										playerId: player.id,
										currentMapItemId,
										direction: selectedOption.direction,
										remainingSteps: totalSteps - completedSteps,
										candidates: selectableCandidates.map((option) => ({
											pathId: option.path.id,
											targetMapItemId: option.targetMapItemId,
											direction: option.direction,
											name: option.path.name,
											description: option.path.description,
										})),
									};
									const defaultValue = { requestId: request.requestId, pathId: defaultSelectedOption.path.id };
									const choicePromise = this.oncePlayerOperationAsync(player.id, OperateType.ChooseMapPath, {
										timeout: this.defaultTimeoutMs,
										defaultValue,
									});
									this.pendingMapPathChoice = request;
									this.setCurrentEventName(`${player.name} 正在抉择分岔路`);
									this.gameDataBroadcast();
									this.sendToPlayer(player.id, {
										type: SocketMsgType.MapPathChoiceRequest,
										source: SocketMsgSource.Server,
										data: request,
									});

									try {
										const choice = await choicePromise;
										if (choice?.requestId === request.requestId) {
											selectedOption =
												selectableCandidates.find((option) => option.path.id === choice.pathId) ??
												defaultSelectedOption;
										}
									} finally {
										if (this.pendingMapPathChoice?.requestId === request.requestId) {
											this.pendingMapPathChoice = undefined;
											this.setCurrentEventName(`${player.name} 正在走路`);
											this.gameDataBroadcast();
										}
									}
								}
							}
						}

						if (!selectedOption) break;
						if (selectedOption.direction === "forward" && !(await this.canPassMapPath(player, selectedOption.path))) {
							if (isAutomaticPathSelection) {
								rejectedAutomaticPathIds.add(selectedOption.path.id);
								continue;
							}
							this.setCurrentEventName(`${player.name} 正在抉择分岔路`);
							continue;
						}
						rejectedAutomaticPathIds.clear();
						this.currentMapMoveDirection = selectedOption.direction;
						const fromMapItemId = currentMapItemId;
						const toMapItemId = selectedOption.targetMapItemId;
						const segment: MapMovementSegment = {
							pathId: selectedOption.path.id,
							direction: selectedOption.direction,
							fromMapItemId,
							toMapItemId,
							stepIndex: completedSteps,
							totalSteps,
						};

						await this.walkSegment(
							player,
							selectedOption.direction === "forward" ? 1 : -1,
							segment,
							totalSteps,
							completedSteps + 1,
						);
						player.setPositionMapItemId(toMapItemId);
						const positionIndex = getPositionIndexFromMapItemId(toMapItemId, this.mapData.mapIndex);
						if (positionIndex !== undefined) player.setPositionIndex(positionIndex);

						if (isHistoryBacktrack) {
							player.popLastMovementHistoryEntry();
							player.returnFromMapItemId = isForcedReverse ? undefined : fromMapItemId;
						} else if (!isForcedReverse) {
							player.recordMapMovement({
								pathId: selectedOption.path.id,
								fromMapItemId,
								toMapItemId,
								direction: selectedOption.direction,
							});
							player.returnFromMapItemId = undefined;
						} else {
							// 无历史轨迹时按入边倒退，不将该临时反向路线写入前进行走轨迹。
							player.returnFromMapItemId = undefined;
						}

						segments.push(segment);
						completedSteps++;
						currentMapItemId = toMapItemId;

						if (this.checkMapItemHasPassedEvent(currentMapItemId)) {
							passedItems.push({
								mapItemId: currentMapItemId,
								index: passedIndex++,
								mapItem: this.mapItems.get(currentMapItemId),
								pathId: selectedOption.path.id,
								direction: selectedOption.direction,
							});
							try {
								await this.handlePlayerPassedEvents(player, [currentMapItemId]);
								currentMapItemId =
									player.positionMapItemId ??
									getMapItemIdFromPositionIndex(player.positionIndex, this.mapData.mapIndex) ??
									currentMapItemId;
							} catch (error) {
								console.error("经过事件执行失败:", error);
							}
						}
					}
				} finally {
					this.currentMapMoveDirection = undefined;
				}

				this.gameDataBroadcast();
				payload.passed = passedItems;
				return { steps, segments };
			});

			player.commandBus.setHandler("player.tp", async (payload) => {
				this.setCurrentEventName(`${player.name} 正在传送`);
				const { positionIndex } = payload;
				const mapItemId = getMapItemIdFromPositionIndex(positionIndex, this.mapData.mapIndex);
				if (!mapItemId || !this.mapItems.has(mapItemId)) {
					throw new Error(`无效的旧地图位置索引: ${positionIndex}`);
				}
				const walkId = randomString(16);
				player.setPositionIndex(positionIndex);
				player.setPositionMapItemId(mapItemId);
				player.resetMapNavigation();
				this.gameDataBroadcast();
				this.gameBroadcast({
					type: SocketMsgType.PlayerTp,
					source: SocketMsgSource.Server,
					data: { playerId: player.id, positionIndex, mapItemId, walkId },
				});
				await this.waitForAnimationComplete(walkId, 2000);
				return payload;
			});

			player.commandBus.setHandler("player.tp.map-item", async (payload) => {
				this.setCurrentEventName(`${player.name} 正在传送`);
				const { mapItemId } = payload;
				if (!this.mapItems.has(mapItemId)) {
					throw new Error(`找不到传送目标地图项: ${mapItemId}`);
				}
				const walkId = randomString(16);
				const mappedPositionIndex = getPositionIndexFromMapItemId(mapItemId, this.mapData.mapIndex);
				if (mappedPositionIndex !== undefined) player.setPositionIndex(mappedPositionIndex);
				player.setPositionMapItemId(mapItemId);
				player.resetMapNavigation();
				this.gameDataBroadcast();
				this.gameBroadcast({
					type: SocketMsgType.PlayerTp,
					source: SocketMsgSource.Server,
					data: {
						playerId: player.id,
						positionIndex: mappedPositionIndex ?? player.positionIndex,
						mapItemId,
						walkId,
					},
				});
				await this.waitForAnimationComplete(walkId, 2000);
				return payload;
			});

			player.commandBus.setHandler("player.dice.roll", async (payload) => {
				this.setCurrentEventName(`${player.name} 正在掷骰子`);
				const { dices } = payload;
				const diceResult = dices.map((d) => d.roll());

				//向客户端发送骰子结果
				const msgToRollDice: ServerSocketMessage = {
					type: SocketMsgType.RollDiceResult,
					source: SocketMsgSource.Server,
					data: {
						rollDiceResult: diceResult,
						rollDicePlayerId: player.id,
					},
					msg: {
						type: "info",
						content: `${player.name} 摇到的点数是: ${diceResult.map((d) => d.result).join("-")}`,
					},
				};
				this.gameBroadcast(msgToRollDice);

				//等待动画
				await new Promise((resolve) => setTimeout(resolve, 3000));

				return { diceResult };
			});

			// 注册玩家回合跳过命令
			player.commandBus.setHandler("player.round.skip", async (payload) => {
				this.eventBus.emit("player.round.skip", { player });
				return payload;
			});

			// 注册玩家回合开始命令
			player.commandBus.setHandler("player.round.start", async (payload) => {
				this.eventBus.emit("player.round.start", { player });
				return payload;
			});

			// 注册玩家回合结束命令
			player.commandBus.setHandler("player.round.end", async (payload) => {
				this.eventBus.emit("player.round.end", { player });
				return payload;
			});
		});

		// 步骤2: 运行玩家预初始化阶段（在 initRoleFn 之前）
		for (const phaseInfo of this.mapData.phases.playerPreInit) {
			const playerPreInitPhase = new GamePhase(phaseInfo, undefined, this.mapData.extraLibs);
			await this.runGamePhase(playerPreInitPhase);
		}

		// 步骤3: 执行每个玩家的 initRoleFn
		for (const player of this.players.values()) {
			const roleInitFn = player.getInitRoleFunction();
			roleInitFn(player, this);
		}
	}

	private async initProperties() {
		// 步骤1: 为所有地皮设置 commandBus
		this.properties.forEach((property) => {
			property.commandBus.setHandler("property.arrived", async (payload) => {
				const { arrivedPlayer, owner, toll } = payload;
				if (owner) {
					//地皮有主人
					if (owner.id === arrivedPlayer.id) {
						//地产是自己的
						if (property.level < property.maxLevel) {
							this.setCurrentEventName(`等待${arrivedPlayer.name} 升级房屋`);
							//已有房产, 升级房屋
							const playerRes = await this.showConfirmDialog(arrivedPlayer.id, {
								title: `升级 ${property.name}`,
								content: generatePropertySchema(property.getPropertyInfo()),
								cancelText: `不要`,
								confirmText: `升！`,
							});
							if (playerRes.confirm) {
								await this.handlePlayerBuildUp(arrivedPlayer, property);
							}
						}
					} else {
						//地产是别人的
						this.setCurrentEventName(`等待${arrivedPlayer.name} 给过路费`);
						const ownerPlayer = this.getPlayerById(owner.id);
						if (!ownerPlayer) return payload;
						if (owner !== undefined && toll !== undefined) {
							const res = await arrivedPlayer.cost(toll, MoneyTag.PROPOERTY, owner);
							this.messageNotify([arrivedPlayer.id], {
								type: "error",
								content: `你到达了${owner.name}的地皮: ${property.name}，支付了${res.actualCost}￥过路费`,
							});
							await owner.gain(res.actualCost, MoneyTag.PROPOERTY, arrivedPlayer);
							this.messageNotify([ownerPlayer.id], {
								type: "success",
								content: `${arrivedPlayer.name}到达了你的地皮: ${property.name}，支付了${res.actualCost}￥过路费`,
							});
							this.messageNotify(
								Array.from(this.players.values())
									.filter((p) => p.id !== arrivedPlayer.id && p.id !== owner.id)
									.map((p) => p.id),
								{
									type: "info",
									content: `${arrivedPlayer.name}到达了${owner.name}的地皮: ${property.name}，支付了${res.actualCost}￥过路费`,
								},
							);

							this.gameLogBroadcast(
								`${this.createGameLinkItem(GameLinkItem.Player, arrivedPlayer.id)} 到达了 ${this.createGameLinkItem(
									GameLinkItem.Player,
									owner.id,
								)} 的地皮: ${this.createGameLinkItem(GameLinkItem.Property, property.id)}，支付了 ${res.actualCost}￥ 过路费`,
							);
						}

						this.gameDataBroadcast();
					}
				} else {
					// this.eventMsg = `等待 ${arrivedPlayer.name} 购买地皮`;
					//地皮没有购买
					//空地, 买房
					//等待客户端回应买房
					this.setCurrentEventName(`等待${arrivedPlayer.name} 购买地皮`);
					const playerRes = await this.showConfirmDialog(arrivedPlayer.id, {
						title: `购买 ${property.name}`,
						content: generatePropertySchema(property.getPropertyInfo()),
						cancelText: `不要`,
						confirmText: `买！`,
					});
					if (playerRes.confirm) {
						await this.handlePlayerBuyProperty(arrivedPlayer, property);
					}
				}
				return payload;
			});
		});

		// 步骤2: 运行地皮预初始化阶段（在 customInitFn 之前）
		for (const phaseInfo of this.mapData.phases.propertyPreInit) {
			const propertyPreInitPhase = new GamePhase(phaseInfo, undefined, this.mapData.extraLibs);
			await this.runGamePhase(propertyPreInitPhase);
		}

		// 步骤3: 执行每个地皮的 customInitFn
		this.properties.forEach((property) => {
			const customInitFn = property.getCustomInitFunction();
			customInitFn && customInitFn(property, this);
		});
	}

	private async runInitedPhase() {
		for (const phaseInfo of this.mapData.phases.gameInited) {
			const gameInitedPhase = new GamePhase(phaseInfo, undefined, this.mapData.extraLibs);
			await this.runGamePhase(gameInitedPhase);
		}
	}

	private async runPostRestorePhase() {
		for (const phaseInfo of this.mapData.phases.postRestore) {
			const postRestorePhase = new GamePhase(phaseInfo, undefined, this.mapData.extraLibs);
			await this.runGamePhase(postRestorePhase);
		}
	}

	private async releaseBankruptedPlayerAssets(player: Player) {
		const properties = [...player.properties];
		for (const property of properties) {
			await property.setOwner(undefined);
			await property.setLevel(0);
		}
		player.chanceCards = [];
		player.isStop = 0;
		player.stop = 0;
		this.gameDataBroadcast();
	}

	/**
	 * 暂停/恢复的唯一入口：同步驱动游戏循环检查点与操作定时器，避免多套暂停状态分叉
	 */
	public setGamePaused(paused: boolean): void {
		if (this.isGamePaused === paused) return;
		this.isGamePaused = paused;
		if (paused) {
			operationListener.pause();
		} else {
			operationListener.resume();
			const resolve = this.pauseResumeResolve;
			this.pauseResumeResolve = null;
			resolve?.();
		}
	}

	/**
	 * 暂停检查点：暂停期间阻塞游戏循环，直到恢复
	 */
	private async waitIfPaused(): Promise<void> {
		while (this.isGamePaused) {
			await new Promise<void>((resolve) => {
				this.pauseResumeResolve = resolve;
			});
		}
	}

	private async gameLoop() {
		this.gameDataBroadcast();
		//游戏循环
		while (!this.isGameOver) {
			await this.waitIfPaused();
			//回合循环 加载回合开始阶段
			this.eventBus.emit("game.round.start");
			const roundStartPhases = this.gameRoundPhase.roundStartPhase;
			for (const phase of roundStartPhases) {
				await this.runLongOperation(() => this.runGamePhase(phase), `执行回合开始阶段: ${phase.name}`);
			}

			//玩家回合
			for (const player of Array.from(this.players.values())) {
				await this.waitIfPaused();
				// 检查玩家是否应该跳过回合
				if (player.isStop > 0) {
					const originalStop = player.isStop;
					player.isStop--; // 减少停止计数
					await player.commandBus.execute({ type: "player.round.skip", payload: { player } });

					// 根据剩余暂停次数显示不同的提示
					if (player.isStop === 0) {
						this.msgNotifyBroadcast("info", `${player.name} 暂停中，下一回合将恢复`);
					} else {
						this.msgNotifyBroadcast("info", `${player.name} 暂停中，还需跳过 ${player.isStop} 回合`);
					}
					continue; // 跳过此玩家的回合
				}

				// 检查玩家是否破产
				if (player.isBankrupted) {
					// await player.commandBus.execute({ type: "player.round.skip", payload: { player } });
					continue;
				}

				await player.commandBus.execute({ type: "player.round.start", payload: { player } });
				this.currentRoundPlayer = player;
				this.roundTurnNotify(player.id);
				this.gameDataBroadcast();
				const context: PlayerRoundContext = {
					currentRoundPlayer: player,
				};
				const playerRoundPhases = player.getRoundPhases();
				for (const phase of playerRoundPhases) {
					await this.runLongOperation(
						() => this.runGamePhase(phase, context),
						`${player.name} 回合阶段: ${phase.name}`,
					);
					if (player.isBankrupted) break;
				}
				this.currentRoundPlayer = null;
				if (player.isBankrupted) {
					await this.checkGameOver();
					if (this.isGameOver) break;
					continue;
				}
				await player.commandBus.execute({ type: "player.round.end", payload: { player } });
			}

			//回合结束阶段
			const roundEndPhases = this.gameRoundPhase.roundEndPhase;
			for (const phase of roundEndPhases) {
				await this.runLongOperation(() => this.runGamePhase(phase), `执行回合结束阶段: ${phase.name}`);
			}
			this.eventBus.emit("game.round.end");
		}
	}

	public async handlePlayerBuyProperty(player: IPlayer, property: IProperty) {
		const msgToSend: ServerSocketMessage = {
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
		};
		if (player.money >= property.sellCost) {
			await property.setOwner(player);
			this.gameDataBroadcast();
			this.msgNotifyBroadcast("info", `${player.name} 买下了地皮 ${property.name}`);
			this.gameLogBroadcast(
				`${this.createGameLinkItem(GameLinkItem.Player, player.id)} 买下了地皮 ${this.createGameLinkItem(
					GameLinkItem.Property,
					property.id,
				)}`,
			);
			await player.cost(property.sellCost, MoneyTag.SYSTEM);
		} else {
			msgToSend.msg = { type: "error", content: "不够钱啊穷鬼" };
			sendToUsers([player.id], msgToSend);
		}
	}

	public async handlePlayerBuildUp(player: IPlayer, property: IProperty) {
		const msgToSend: ServerSocketMessage = {
			type: SocketMsgType.MsgNotify,
			source: SocketMsgSource.Server,
			data: undefined,
		};
		if (player.money >= property.buildCost) {
			await property.levelUp();
			this.gameDataBroadcast();
			this.msgNotifyBroadcast("info", `${player.name}把地皮${property.name}升到了${property.level}级`);
			this.gameLogBroadcast(
				`${this.createGameLinkItem(GameLinkItem.Player, player.id)} 把地皮 ${this.createGameLinkItem(
					GameLinkItem.Property,
					property.id,
				)} 升到了 ${property.level} 级`,
			);
			await player.cost(property.buildCost, MoneyTag.SYSTEM);
		} else {
			msgToSend.msg = { type: "error", content: "不够钱啊穷鬼" };
			sendToUsers([player.id], msgToSend);
		}
		return;
	}

	// private getRandomChanceCard(num: number): ChanceCard[] {
	// 	let tempChanceCardList: ChanceCard[] = [];
	// 	for (let i = 0; i < num; i++) {
	// 		const getIndex = Math.floor(Math.random() * this.chanceCardInfoList.length);
	// 		const card = this.chanceCardInfos.get();
	// 		if (card) tempChanceCardList.push(new ChanceCard(card));
	// 	}
	// 	return tempChanceCardList;
	// }

	public createNewChanceCard(sourceId: string): IChanceCard {
		const tempChanceCard = this.chanceCardInfos.get(sourceId);
		if (!tempChanceCard) throw new Error(`错误的机会卡ID: ${sourceId}`);
		return new ChanceCard(tempChanceCard);
	}

	public async handleUseChanceCard(
		sourcePlayer: IPlayer,
		chanceCardId: string,
		targetIdList: string[],
	): Promise<boolean> {
		operationListener.clearAllTimers();
		const _this = this;

		const chanceCard = sourcePlayer.getCardById(chanceCardId);

		// 1. 卫语句：卡片不存在直接返回错误
		if (!chanceCard) {
			sendChanceCardCallback(sourcePlayer.id, true, "机会卡使用失败: 未知的机会卡ID");
			return false;
		}

		// 2. 验证目标列表是否为空
		const cardType = chanceCard.getType();
		const needsTarget = cardType !== TargetSelectType.ToSelf;
		const hasTarget = targetIdList && targetIdList.length > 0;

		if (needsTarget && !hasTarget) {
			sendChanceCardCallback(sourcePlayer.id, true, "机会卡使用失败: 请选择使用目标");
			return false;
		}

		// 3. 对于不需要目标的卡片类型，清空目标列表以避免混淆
		if (!needsTarget) {
			targetIdList = [];
		}

		try {
			const cardName = chanceCard.getName();
			const sourceLink = this.createGameLinkItem(GameLinkItem.Player, sourcePlayer.id);
			const cardLink = this.createGameLinkItem(GameLinkItem.ChanceCard, chanceCard.getSourceId());

			// 4. 根据类型解析目标，然后统一执行：动画 → 等待 → effectCode
			switch (chanceCard.getType()) {
				case TargetSelectType.ToSelf: {
					await this.executeChanceCardWithAnimation(sourcePlayer, chanceCard, sourcePlayer, [sourcePlayer.id]);
					this.msgNotifyBroadcast("info", `${sourcePlayer.name} 对自己使用了机会卡: "${cardName}"`);
					this.gameLogBroadcast(`${sourceLink} 对自己使用了机会卡: ${cardLink}`);
					break;
				}

				case TargetSelectType.ToOtherPlayer:
				case TargetSelectType.ToPlayer: {
					const targetPlayer = this.players.get(targetIdList[0]);
					if (!targetPlayer) throw new Error("目标玩家不存在");
					await this.executeChanceCardWithAnimation(sourcePlayer, chanceCard, targetPlayer, [targetPlayer.id]);
					const targetLink = this.createGameLinkItem(GameLinkItem.Player, targetPlayer.id);
					this.msgNotifyBroadcast(
						"info",
						`${sourcePlayer.name} 对玩家 ${targetPlayer.name} 使用了机会卡: "${cardName}"`,
					);
					this.gameLogBroadcast(`${sourceLink} 对玩家 ${targetLink} 使用了机会卡: ${cardLink}`);
					break;
				}

				case TargetSelectType.ToProperty: {
					const targetProperty = this.properties.get(targetIdList[0]);
					if (!targetProperty) throw new Error("目标建筑/地皮不存在");
					await this.executeChanceCardWithAnimation(sourcePlayer, chanceCard, targetProperty, [targetProperty.id]);
					const targetLink = this.createGameLinkItem(GameLinkItem.Property, targetProperty.id);
					this.msgNotifyBroadcast(
						"info",
						`${sourcePlayer.name} 对地皮 ${targetProperty.name} 使用了机会卡: "${cardName}"`,
					);
					this.gameLogBroadcast(`${sourceLink} 对地皮 ${targetLink} 使用了机会卡: ${cardLink}`);
					break;
				}

				case TargetSelectType.ToMapItem: {
					const targetMapItemId = targetIdList[0];
					if (!targetMapItemId) throw new Error("目标地图项不存在");
					const targetMapItem = this.mapItems.get(targetMapItemId);
					if (!targetMapItem) throw new Error("目标地图项不存在");
					await this.executeChanceCardWithAnimation(sourcePlayer, chanceCard, targetMapItemId, [targetMapItem.id]);
					this.msgNotifyBroadcast(
						"info",
						`${sourcePlayer.name} 对格子 ${targetMapItem.type.name} 使用了机会卡: "${cardName}"`,
					);
					this.gameLogBroadcast(`${sourceLink} 对格子 ${targetMapItem.id} 使用了机会卡: ${cardLink}`);
					break;
				}

				default:
					throw new Error(`未知的机会卡目标类型: ${chanceCard.getType()}`);
			}

			// 5. 成功后的通用处理
			await sourcePlayer.loseCard(chanceCardId); // 扣除卡片

			// 发送成功通知给当前玩家
			this.sendToPlayer(sourcePlayer.id, {
				type: SocketMsgType.MsgNotify,
				source: SocketMsgSource.Server,
				data: undefined,
				msg: {
					type: "success",
					content: `机会卡 ${cardName} 使用成功！`,
				},
			});

			// 发送操作回调
			sendChanceCardCallback(sourcePlayer.id, false);

			// 广播最新游戏数据
			this.gameDataBroadcast();

			return true;
		} catch (e: any) {
			// 6. 统一错误处理
			const errorMessage = e.message || "未知错误";

			// 发送错误通知
			sendChanceCardCallback(sourcePlayer.id, true, errorMessage);

			return false;
		}

		function sendChanceCardCallback(playerId: string, isError: boolean, errorMsgContent?: string) {
			// 1. 如果有错误内容，先发 Notify
			if (isError && errorMsgContent) {
				_this.sendToPlayer(playerId, {
					type: SocketMsgType.MsgNotify,
					source: SocketMsgSource.Server,
					data: undefined,
					msg: { type: "error", content: errorMsgContent },
				});
			}

			// 2. 发送 UseChanceCard 回调指令
			const callBackMsg: ServerSocketMessage = {
				type: SocketMsgType.UseChanceCard,
				data: { error: isError },
				source: SocketMsgSource.Server,
			};
			sendToUsers([playerId], callBackMsg);
		}
	}

	public async handleArriveEvent(arrivedPlayer: IPlayer) {
		if (arrivedPlayer.isBankrupted) return;
		const arriveItemId = arrivedPlayer.positionMapItemId ?? this.mapData.mapIndex[arrivedPlayer.positionIndex];
		const arriveItem = this.mapItems.get(arriveItemId);
		if (!arriveItem) return;
		if (arriveItem.mapEventId) {
			// 特殊地块
			const mapEvent = this.mapEvents.get(arriveItem.mapEventId);
			if (!mapEvent) throw Error("找不到对应的MapEvent");
			// 是到达触发的事件
			if (mapEvent.type === MapEventType.ArrivedEvent) {
				await mapEvent.fn(arrivedPlayer, this);
				this.msgNotifyBroadcast("info", `${arrivedPlayer.name} 触发了地图事件: ${mapEvent.name}`);
				this.gameLogBroadcast(
					`${this.createGameLinkItem(GameLinkItem.Player, arrivedPlayer.id)} 触发了地图事件: ${this.createGameLinkItem(
						GameLinkItem.ArrivedEvent,
						mapEvent.id,
					)}`,
				);
				this.gameDataBroadcast();
			}
		}
		if (arriveItem.linkto) {
			const linkMapItem = this.mapItems.get(arriveItem.linkto);
			if (!linkMapItem || !linkMapItem.property) return;
			const property = this.properties.get(linkMapItem.property.id);
			if (!property) return;
			await property.arrived(arrivedPlayer);
			this.gameDataBroadcast();
		}
	}

	/**
	 * 处理玩家经过某个格子的事件
	 * @param player - 玩家
	 * @param passedMapItemsId - 经过的格子ID列表
	 */
	private async handlePlayerPassedEvents(player: Player, passedMapItemsId: string[]): Promise<void> {
		for (const mapItemId of passedMapItemsId) {
			const mapItem = this.mapItems.get(mapItemId);
			if (!mapItem) throw Error("处理经过事件时, 找不到MapItem");
			if (!mapItem.mapEventId) continue;

			const mapEvent = this.mapEvents.get(mapItem.mapEventId);
			if (!mapEvent) throw Error("处理经过事件时, 找不到MapEvent");
			if (mapEvent.type !== MapEventType.PassedEvent) continue;

			// 直接 await 执行经过事件，不推入事件栈
			await mapEvent.fn(player, this);
			this.msgNotifyBroadcast("info", `${player.name} 经过了: ${mapEvent.name} 触发事件`);
			this.gameLogBroadcast(
				`${this.createGameLinkItem(
					GameLinkItem.Player,
					player.id,
				)} 触发了地图事件: ${this.createGameLinkItem(GameLinkItem.ArrivedEvent, mapEvent.id)}`,
			);
			this.gameDataBroadcast();
		}
	}

	/**
	 * 规范化地图索引，处理循环地图的索引计算
	 * @param index - 原始索引（可能为负数或超出范围）
	 * @param total - 地图总格数
	 * @returns 规范化后的索引（0 到 total-1）
	 */
	private normalizeIndex(index: number, total: number): number {
		return ((index % total) + total) % total;
	}

	/**
	 * 检查某个格子是否有经过事件
	 * @param mapItemId - 格子ID
	 * @returns 是否有经过事件
	 */
	private checkMapItemHasPassedEvent(mapItemId: string): boolean {
		const mapItem = this.mapItems.get(mapItemId);
		if (!mapItem || !mapItem.mapEventId) return false;

		const mapEvent = this.mapEvents.get(mapItem.mapEventId);
		if (!mapEvent) return false;

		return mapEvent.type === MapEventType.PassedEvent;
	}

	/** 执行当前会话中注册的路径通行条件。 */
	private async canPassMapPath(player: IPlayer, path: MapPath): Promise<boolean> {
		const canPass = this.mapPathCanPassConditions.get(path.id);
		if (!canPass) return true;

		try {
			return await canPass(player, path);
		} catch (error) {
			console.error("[MapPath] 路径通行条件执行失败", { pathId: path.id, error });
			return false;
		}
	}

	/**
	 * 走一段连续的路并等待动画完成
	 * @param player - 玩家
	 * @param sourceIndex - 起始格子索引
	 * @param steps - 步数（可为负数表示后退）
	 * @param totalSteps - 总移动步数（用于显示）
	 * @param currentStep - 当前是第几步（用于显示）
	 */
	private async walkSegment(
		player: Player,
		step: number,
		segment: MapMovementSegment,
		totalSteps: number,
		currentStep: number,
	): Promise<void> {
		const walkId = randomString(16);
		this.gameBroadcast({
			type: SocketMsgType.PlayerWalk,
			source: SocketMsgSource.Server,
			data: {
				playerId: player.id,
				step,
				segment,
				walkId,
				totalSteps,
				startStep: currentStep,
			},
		});

		const animationDuration =
			GameProcess.WALK_ANIMATION_BASE_DURATION * (Math.abs(step) + GameProcess.WALK_ANIMATION_EXTRA_STEPS);
		await this.waitForAnimationComplete(walkId, animationDuration);
	}

	public getMapItemById(mapItemId: string): MapItem | undefined {
		return this.mapItems.get(mapItemId);
	}

	public getMapPathById(pathId: string): MapPath | undefined {
		return this.mapData.mapPaths.find((path) => path.id === pathId);
	}

	public getPathMapItemIds(): string[] {
		const pathMapItemTypeIds = new Set(this.mapData.pathMapItemTypeIds ?? []);
		return this.mapData.mapItems
			.filter((mapItem) => pathMapItemTypeIds.has(mapItem.type.id))
			.map((mapItem) => mapItem.id);
	}

	private getMapMoveOptions(mapItemId: string, direction: MapMoveDirection = "forward"): MapMoveOption[] {
		const options: MapMoveOption[] = [];
		const targetMapItemIds = new Set<string>();

		for (const path of this.getAvailableMapPaths(mapItemId, direction)) {
			const option: MapMoveOption = {
				path,
				targetMapItemId: direction === "forward" ? path.toMapItemId : path.fromMapItemId,
				direction,
			};
			if (targetMapItemIds.has(option.targetMapItemId)) {
				console.warn("[MapPath] 检测到重复的移动目标，已忽略后续路径", {
					mapItemId,
					targetMapItemId: option.targetMapItemId,
					pathId: path.id,
					direction,
				});
				continue;
			}

			targetMapItemIds.add(option.targetMapItemId);
			options.push(option);
		}

		return options;
	}

	public getAvailableMapPaths(mapItemId: string, direction: MapMoveDirection): MapPath[] {
		return getAvailableMapPathsFromAdjacency(this.mapPathAdjacency, mapItemId, direction, this.enabledPathIds);
	}

	public isMapPathEnabled(pathId: string): boolean {
		return this.enabledPathIds.has(pathId);
	}

	public setMapPathEnabled(pathId: string, enabled: boolean, canPass?: MapPathCanPass): void {
		if (!this.getMapPathById(pathId)) throw new Error(`找不到地图路径: ${pathId}`);
		if (enabled) {
			this.enabledPathIds.add(pathId);
			if (canPass) this.mapPathCanPassConditions.set(pathId, canPass);
			else this.mapPathCanPassConditions.delete(pathId);
		} else {
			this.enabledPathIds.delete(pathId);
			this.mapPathCanPassConditions.delete(pathId);
		}
		this.gameDataBroadcast();
	}
	private getPlayerById(id: string) {
		return this.players.get(id);
	}

	public onPlayerOperation<T extends OperateType>(
		playerId: string,
		operationType: T,
		callback: (res: PlayerOperationResult[T]) => void,
	): void {
		operationListener.on(playerId, operationType, callback);
	}

	public oncePlayerOperation<T extends OperateType>(
		playerId: string,
		operationType: T,
		callback: (res: PlayerOperationResult[T]) => void,
	): void {
		operationListener.once(playerId, operationType, callback);
	}

	public async onPlayerOperationAsync<T extends OperateType>(
		playerId: string,
		operationType: T,
	): Promise<PlayerOperationResult[T]> {
		return await operationListener.onAsync(playerId, operationType);
	}

	public async oncePlayerOperationAsync<T extends OperateType>(
		playerId: string,
		operationType: T,
		options?: { timeout?: number; defaultValue?: PlayerOperationResult[T] },
	): Promise<PlayerOperationResult[T]> {
		const player = this.players.get(playerId);

		// 如果玩家是AI托管，使用AI决策
		if (player?.isAI) {
			if (operationType === OperateType.RollDice || operationType === OperateType.UseChanceCard) {
				const waitForOperation = operationListener.onceAsyncWithTimeout(playerId, operationType, {
					timeout: options?.timeout ?? this.defaultTimeoutMs,
					defaultValue: options?.defaultValue ?? (undefined as any),
				});
				this.ensureAIPreRollOperationBroker(player);
				return await waitForOperation;
			}
			return await this.makeAIDecision(player, operationType, {
				defaultValue: options?.defaultValue,
			});
		}

		// 真实玩家，使用带超时的方法
		return await operationListener.onceAsyncWithTimeout(playerId, operationType, {
			timeout: options?.timeout ?? this.defaultTimeoutMs,
			defaultValue: options?.defaultValue ?? (undefined as any),
		});
	}

	public emitPlayerOperation<T extends OperateType>(
		playerId: string,
		operationType: T,
		data: PlayerOperationResult[T],
	) {
		operationListener.emit(playerId, operationType, data);
	}

	public removePlayerOperationListener<T extends OperateType>(
		playerId: string,
		operationType: T,
		listener: (...args: any[]) => PlayerOperationResult[T],
	): void {
		operationListener.remove(playerId, operationType, listener);
		if (operationType === OperateType.RollDice || operationType === OperateType.UseChanceCard) {
			this.syncAIPreRollOperationSession(playerId);
		}
	}

	public removePlayerAllOperationListener<T extends OperateType>(playerId: string, operationType?: T): void {
		operationListener.removeAll(playerId, operationType);
		if (
			operationType === undefined ||
			operationType === OperateType.RollDice ||
			operationType === OperateType.UseChanceCard
		) {
			this.syncAIPreRollOperationSession(playerId);
		}
	}

	private async makeAIDecision<T extends OperateType>(
		player: Player,
		operationType: T,
		input?: {
			option?: unknown;
			defaultValue?: PlayerOperationResult[T];
		},
	): Promise<PlayerOperationResult[T]> {
		const request = this.buildAIDecisionRequest(player, operationType, input?.option);
		if (!request) {
			console.log(`${AI_LOG_PREFIX} no request built`, {
				playerId: player.id,
				operationType,
			});
			return this.buildAIDefaultOperationResult(player, operationType, input?.option, input?.defaultValue);
		}

		this.attachAIDecisionChainContext(player, request);
		this.ensureAIDecisionMetadata(request, player.id, `${String(operationType)}:${request.title}`);

		console.log(`${AI_LOG_PREFIX} structured request`, {
			decisionId: request.metadata?.decisionId,
			playerId: player.id,
			operationType,
			title: request.title,
			scene: request.scene,
			chainContext: request.metadata?.chainContext,
			options: request.options.map((option) => ({
				id: option.id,
				label: option.label,
				actionType: option.actionType,
			})),
		});
		const selection = await this.runAIDecision(player, request);
		const result = this.mapAIDecisionSelectionToResult(player, request, selection, input?.option, input?.defaultValue);
		this.rememberAIDecisionChain(player.id, request, selection);
		aiManager.feedback({
			playerId: player.id,
			request,
			selection,
			outcome: "mapped-operation",
		});
		console.log(`${AI_LOG_PREFIX} mapped result`, {
			decisionId: request.metadata?.decisionId,
			playerId: player.id,
			operationType,
			selection,
			result,
		});
		return result;
	}

	private isChainableAIDecisionScene(scene: AIDecisionRequest["scene"] | undefined): boolean {
		return (
			scene === "confirm-dialog" || scene === "target-select" || scene === "item-select" || scene === "form-dialog"
		);
	}

	private appendAIDecisionSummary(base: string | undefined, fragment: string | undefined): string | undefined {
		const normalizedBase = typeof base === "string" ? base.trim() : "";
		const normalizedFragment = typeof fragment === "string" ? fragment.trim() : "";
		if (!normalizedFragment) {
			return normalizedBase || undefined;
		}
		if (!normalizedBase) {
			return normalizedFragment;
		}
		return normalizedBase.includes(normalizedFragment) ? normalizedBase : `${normalizedBase} ${normalizedFragment}`;
	}

	private buildAIDecisionChainContext(player: Player, request: AIDecisionRequest): Record<string, unknown> | undefined {
		if (!this.isChainableAIDecisionScene(request.scene)) {
			this.aiDecisionChains.delete(player.id);
			return undefined;
		}
		const eventName = this.currentEventName?.trim();
		if (!eventName) {
			this.aiDecisionChains.delete(player.id);
			return undefined;
		}
		const currentRoundPlayerId = this.currentRoundPlayer?.id;
		const currentRound = request.context.currentRound;
		const existing = this.aiDecisionChains.get(player.id);
		const canContinue =
			Boolean(existing) &&
			existing!.eventName === eventName &&
			existing!.round === currentRound &&
			existing!.currentRoundPlayerId === currentRoundPlayerId;
		const previousDecisions = canContinue
			? existing!.steps.slice(-2).map((step) => ({
					title: step.title,
					chosen: step.chosen,
					summary: step.summary,
				}))
			: [];
		const guidance =
			previousDecisions.length > 0
				? "这是同一串连续弹窗。默认延续上一步已做出的决定；除非当前约束显示不可执行，否则不要推翻前一步。"
				: undefined;
		return {
			chainId: canContinue ? existing!.chainId : `chain-${player.id.slice(0, 6)}-${currentRound}-${randomString(4)}`,
			step: previousDecisions.length + 1,
			eventName,
			previousDecisions,
			guidance,
		};
	}

	private attachAIDecisionChainContext(player: Player, request: AIDecisionRequest): void {
		const chainContext = this.buildAIDecisionChainContext(player, request);
		if (!chainContext) {
			return;
		}
		request.metadata = {
			...(request.metadata || {}),
			chainContext,
		};
		const previousDecisionText = Array.isArray(chainContext.previousDecisions)
			? chainContext.previousDecisions
					.map((step) => {
						if (typeof step !== "object" || step === null) {
							return undefined;
						}
						const item = step as Record<string, unknown>;
						const title = typeof item.title === "string" ? item.title : "";
						const chosen = typeof item.chosen === "string" ? item.chosen : "";
						const summary = typeof item.summary === "string" ? item.summary : "";
						return [title, chosen || summary].filter(Boolean).join(" -> ");
					})
					.filter((item): item is string => Boolean(item))
			: [];
		if (previousDecisionText.length > 0) {
			request.summary = this.appendAIDecisionSummary(
				request.summary,
				`连续决策上下文：上一步已决定 ${previousDecisionText.join("；")}。当前只需完成这一串操作。`,
			);
		}
	}

	private rememberAIDecisionChain(playerId: string, request: AIDecisionRequest, selection: AIDecisionSelection): void {
		if (!this.isChainableAIDecisionScene(request.scene)) {
			this.aiDecisionChains.delete(playerId);
			return;
		}
		const chainContext = request.metadata?.chainContext;
		if (typeof chainContext !== "object" || chainContext === null) {
			return;
		}
		const currentRoundPlayerId = this.currentRoundPlayer?.id;
		const chosenIds = selection.optionIds || (selection.optionId ? [selection.optionId] : []);
		const chosenLabel = request.options.find((option) => chosenIds.includes(option.id))?.label;
		const fieldSummary =
			selection.fieldValues && Object.keys(selection.fieldValues).length > 0
				? Object.entries(selection.fieldValues)
						.map(([key, value]) => `${key}=${String(value)}`)
						.join(", ")
				: undefined;
		const stepSummary =
			request.scene === "form-dialog"
				? selection.submitted
					? fieldSummary || "已提交表单"
					: "放弃提交"
				: chosenLabel || fieldSummary;
		const state: AIChainedDecisionState = {
			chainId:
				typeof (chainContext as Record<string, unknown>).chainId === "string"
					? ((chainContext as Record<string, unknown>).chainId as string)
					: `chain-${playerId.slice(0, 6)}-${request.context.currentRound}`,
			eventName:
				typeof (chainContext as Record<string, unknown>).eventName === "string"
					? ((chainContext as Record<string, unknown>).eventName as string)
					: this.currentEventName,
			round: request.context.currentRound,
			currentRoundPlayerId,
			steps: [
				...(this.aiDecisionChains.get(playerId)?.steps || []).slice(-2),
				{
					title: request.title,
					scene: request.scene,
					chosen: chosenLabel,
					summary: stepSummary,
				},
			].slice(-3),
			lastUpdatedAt: Date.now(),
		};
		this.aiDecisionChains.set(playerId, state);
	}

	private buildAIDecisionRequest<T extends OperateType>(
		player: Player,
		operationType: T,
		option?: unknown,
	): AIDecisionRequest<T> | null {
		const context = this.buildAIDecisionContext(player);

		switch (operationType) {
			case OperateType.RollDice:
				return {
					operationType,
					playerId: player.id,
					title: "掷骰子",
					context,
					options: [
						{
							id: "__roll__",
							label: "掷骰子",
							actionType: "roll",
							description: "继续当前回合，开始掷骰并移动。",
						},
					],
				} as AIDecisionRequest<T>;
			case OperateType.ConfirmDialogResult:
				return this.buildConfirmDecisionRequest(player, context, option as ConfirmDialogOption) as AIDecisionRequest<T>;
			case OperateType.TargetSelectDialogResult:
				return this.buildTargetDecisionRequest(
					player,
					context,
					option as TargetSelectDialogOption<TargetSelectType>,
				) as AIDecisionRequest<T>;
			case OperateType.ItemSelectDialogResult:
				return this.buildItemDecisionRequest(player, context, option as ItemSelectDialogOption) as AIDecisionRequest<T>;
			case OperateType.FormDialogResult:
				return this.buildFormDecisionRequest(
					player,
					context,
					option as FormDialogOption<FormField<string, any>[]>,
				) as AIDecisionRequest<T>;
			case OperateType.DynamicButtonClick:
				return this.buildDynamicButtonDecisionRequest(player, context) as AIDecisionRequest<T>;
			default:
				return null;
		}
	}

	private buildAIDecisionContext(player: Player): AIDecisionContextSnapshot {
		const gameData = this.getGameData();
		const playerRoles = gameData.players.map((item) => {
			const roleId = item.user.roleId;
			const role = roleId ? this.mapData.roles.find((candidate) => candidate.id === roleId) : undefined;
			return {
				playerId: item.id,
				playerName: item.user.username,
				isSelf: item.id === player.id,
				isAI: item.isAI,
				roleId,
				roleName: role?.name,
				roleDescription: role?.description,
			};
		});
		return {
			player: player.getPlayerInfo(),
			players: gameData.players,
			properties: gameData.properties,
			mapItems: this.mapData.mapItems.map((item) => ({
				id: item.id,
				type: item.type,
				x: item.x,
				y: item.y,
				rotation: item.rotation,
				mapEventId: item.mapEventId,
				linkto: item.linkto,
				beLinked: item.beLinked,
				property: item.property,
			})),
			mapIndex: [...this.mapData.mapIndex],
			mapEvents: this.mapData.mapEvents.map((event) => ({
				id: event.id,
				type: event.type,
				name: event.name,
				description: event.description,
			})),
			systems: (gameData.exportData as Record<string, unknown> | undefined) || undefined,
			playerRoles,
			currentRound: gameData.currentRound,
			currentMultiplier: gameData.currentMultiplier,
			currentPlayerIdInRound: gameData.currentPlayerIdInRound,
			map: {
				id: this.mapData.id,
				name: this.mapData.info.name,
				description: this.mapData.info.description,
				roles: this.mapData.roles.map((role) => ({
					id: role.id,
					name: role.name,
					description: role.description,
				})),
			},
		};
	}

	private buildDialogDecisionSummary(title?: string, content?: unknown): string | undefined {
		const contentText =
			typeof content === "string" ? this.normalizeDecisionText(content) : this.extractDisplayText(content);
		const titleText = this.normalizeDecisionText(title);
		if (contentText && titleText && contentText !== titleText) {
			return `${titleText}：${contentText}`;
		}
		return contentText || titleText;
	}

	private buildConfirmDecisionRequest(
		player: Player,
		context: AIDecisionContextSnapshot,
		option?: ConfirmDialogOption,
	): AIDecisionRequest<OperateType.ConfirmDialogResult> {
		const confirmId = "__confirm__";
		const cancelId = "__cancel__";
		return {
			operationType: OperateType.ConfirmDialogResult,
			scene: "confirm-dialog",
			playerId: player.id,
			title: option?.title || "确认操作",
			summary: this.buildDialogDecisionSummary(option?.title, option?.content),
			context,
			options: [
				{
					id: confirmId,
					label: option?.confirmText || "确认",
					actionType: "confirm",
					description: this.buildDialogDecisionSummary(option?.title, option?.content),
				},
				{
					id: cancelId,
					label: option?.cancelText || "取消",
					actionType: "cancel",
					description: "放弃这一步，保持当前状态不变。",
				},
			],
		};
	}

	private buildTargetDecisionRequest(
		player: Player,
		context: AIDecisionContextSnapshot,
		option?: TargetSelectDialogOption<TargetSelectType>,
	): AIDecisionRequest<OperateType.TargetSelectDialogResult> {
		const options = this.buildTargetDecisionOptions(player, option?.type);
		return {
			operationType: OperateType.TargetSelectDialogResult,
			scene: "target-select",
			playerId: player.id,
			title: option?.title || "选择目标",
			summary: this.buildDialogDecisionSummary(option?.title, option?.content),
			context,
			options,
			metadata: {
				maxSelections: 1,
			},
		};
	}

	private buildTargetDecisionOptions(player: Player, type: TargetSelectType | undefined): AIDecisionOption[] {
		switch (type) {
			case TargetSelectType.ToSelf:
				return [
					{
						id: player.id,
						label: player.name,
						actionType: "target",
						description: `自己，现金 ${player.money}，地产 ${player.properties.length} 处。`,
						payload: { id: player.id, type: "player" },
					},
				];
			case TargetSelectType.ToOtherPlayer:
			case TargetSelectType.ToPlayer:
				return Array.from(this.players.values())
					.filter((candidate) => type === TargetSelectType.ToPlayer || candidate.id !== player.id)
					.map((candidate) => {
						const info = candidate.getPlayerInfo();
						return {
							id: candidate.id,
							label: candidate.name,
							actionType: "target",
							description: `现金 ${info.money}，地产 ${info.properties.length} 处${info.isBankrupted ? "，已破产" : ""}。`,
							payload: {
								id: candidate.id,
								type: "player",
								money: info.money,
								propertyCount: info.properties.length,
							},
						};
					});
			case TargetSelectType.ToProperty:
				return Array.from(this.properties.values()).map((property) => {
					const info = property.getPropertyInfo();
					return {
						id: property.id,
						label: property.name,
						actionType: "target",
						description: `售价 ${info.sellCost}，当前等级 ${info.level}/${info.maxLevel}，最高租金 ${Math.max(...info.costList, 0)}。`,
						payload: {
							id: property.id,
							type: "property",
							sellCost: info.sellCost,
							rentPeak: Math.max(...info.costList, 0),
							ownerId: info.owner?.userId,
						},
					};
				});
			case TargetSelectType.ToMapItem:
				return this.mapData.mapItems.map((item) => ({
					id: item.id,
					label: item.property?.name || item.type.name || item.id,
					actionType: "target",
					description: item.property
						? `关联地皮 ${item.property.name}${item.mapEventId ? `，事件 ${item.mapEventId}` : ""}。`
						: item.mapEventId
							? `地图事件 ${item.mapEventId}。`
							: `地图格 ${item.type.name}。`,
					payload: {
						id: item.id,
						type: "map-item",
						mapEventId: item.mapEventId,
						hasProperty: !!item.property,
					},
				}));
			default:
				return [];
		}
	}

	private buildItemDecisionRequest(
		player: Player,
		context: AIDecisionContextSnapshot,
		option?: ItemSelectDialogOption,
	): AIDecisionRequest<OperateType.ItemSelectDialogResult> {
		const maxSelections =
			option?.multiple === true
				? option.itemList.length
				: typeof option?.multiple === "number"
					? Math.max(1, option.multiple)
					: 1;
		const keyName = option?.keyName;
		const options: AIDecisionOption[] = (option?.itemList || []).map((item: any, index) => {
			const label = this.buildSelectorItemLabel(item, index, keyName);
			const description = this.buildSelectorItemDescription(item, label);
			return {
				id: String(item?.id ?? index),
				label,
				description,
				actionType: "select",
				payload: {
					id: item?.id ?? index,
					type: "item",
				},
			};
		});

		if (option?.cancelText) {
			options.push({
				id: "__cancel__",
				label: option.cancelText,
				actionType: "cancel",
				description: "不选择任何物品，直接返回。",
			});
		}

		return {
			operationType: OperateType.ItemSelectDialogResult,
			scene: "item-select",
			playerId: player.id,
			title: option?.title || "选择物品",
			summary: this.buildDialogDecisionSummary(option?.title, option?.content),
			context,
			options,
			metadata: {
				maxSelections,
			},
		};
	}

	private buildFormDecisionRequest(
		player: Player,
		context: AIDecisionContextSnapshot,
		option?: FormDialogOption<FormField<string, any>[]>,
	): AIDecisionRequest<OperateType.FormDialogResult> {
		const formFields = (option?.fields || []).map((field) => ({
			key: field.key,
			label: field.label,
			defaultValue: field.defaultValue,
			min: field.min,
			max: field.max,
			valueType: typeof field.defaultValue === "number" ? "number" : "string",
		}));
		const defaultFieldValues = Object.fromEntries(
			(option?.fields || []).map((field) => [field.key, field.defaultValue]),
		);

		return {
			operationType: OperateType.FormDialogResult,
			scene: "form-dialog",
			playerId: player.id,
			title: option?.title || "填写表单",
			summary: this.buildDialogDecisionSummary(option?.title, option?.content),
			context,
			options: [
				{
					id: "__submit__",
					label: option?.confirmText || "提交",
					actionType: "submit",
					description: "按当前判断提交表单。",
				},
				{
					id: "__cancel__",
					label: option?.cancelText || "取消",
					actionType: "cancel",
					description: "放弃这次填写，不提交表单。",
				},
			],
			metadata: {
				defaultFieldValues,
				formFields,
			},
		};
	}

	private buildDynamicButtonDecisionRequest(
		player: Player,
		context: AIDecisionContextSnapshot,
	): AIDecisionRequest<OperateType.DynamicButtonClick> | null {
		const buttons = this.getPlayerButtons(player.id).filter(
			(button) => button.visible && button.enabled && !this.shouldSkipAITurnDynamicButton(player.id, button),
		);
		if (buttons.length === 0) {
			return null;
		}

		return {
			operationType: OperateType.DynamicButtonClick,
			scene: "active-action",
			playerId: player.id,
			title: "选择动态按钮",
			context,
			options: buttons.map((button) => ({
				id: button.id,
				label: button.text,
				actionType: "dynamic-button",
				description: `执行按钮操作：${button.text}`,
				payload: {
					id: button.id,
					type: "button",
				},
			})),
		};
	}

	private createAITurnActionState(): AITurnActionState {
		return {
			attemptedDynamicButtons: {},
		};
	}

	private getAITurnActionState(playerId: string): AITurnActionState {
		return this.aiTurnActionState.get(playerId) ?? this.createAITurnActionState();
	}

	private buildAIDynamicButtonSignature(text: string): string {
		return JSON.stringify({
			text: text.trim() || "按钮",
		});
	}

	private shouldSkipAITurnDynamicButton(playerId: string, button: ButtonConfig): boolean {
		const attemptedDynamicButtons = this.aiTurnActionState.get(playerId)?.attemptedDynamicButtons;
		if (!attemptedDynamicButtons) {
			return false;
		}

		const signature = this.buildAIDynamicButtonSignature(button.text);
		return attemptedDynamicButtons[button.id] === signature;
	}

	private markAITurnDynamicButtonAttempt(playerId: string, buttonId: string, text: string): void {
		const previous = this.getAITurnActionState(playerId);
		this.aiTurnActionState.set(playerId, {
			...previous,
			attemptedDynamicButtons: {
				...previous.attemptedDynamicButtons,
				[buttonId]: this.buildAIDynamicButtonSignature(text),
			},
		});
	}

	private buildAIPreRollOperationRequest(
		player: Player,
		optionsConfig: {
			allowRollDice: boolean;
			allowUseChanceCard: boolean;
			blockedChanceCardIds?: ReadonlySet<string>;
		},
	): AIDecisionRequest<OperateType.RollDice> | null {
		const context = this.buildAIDecisionContext(player);
		const options: AIDecisionOption[] = [];
		const blockedChanceCardIds = optionsConfig.blockedChanceCardIds ?? new Set<string>();

		for (const button of this.getPlayerButtons(player.id)) {
			if (!button.visible || !button.enabled || this.shouldSkipAITurnDynamicButton(player.id, button)) {
				continue;
			}
			options.push({
				id: `button:${button.id}`,
				label: button.text,
				actionType: "select",
				description: `执行按钮操作：${button.text}`,
				payload: {
					id: button.id,
					type: "button",
					actionKind: "dynamic-button",
				},
			});
		}

		if (optionsConfig.allowUseChanceCard) {
			for (const card of player.chanceCards) {
				if (blockedChanceCardIds.has(card.getId())) {
					continue;
				}
				options.push({
					id: `chance-card:${card.getId()}`,
					label: card.getName(),
					description: card.getDescribe(),
					actionType: "use-card",
					summary: this.buildChanceCardDecisionSummary(card),
					payload: {
						id: card.getId(),
						type: "chance-card",
						actionKind: "use-chance-card",
						targetType: card.getType(),
					},
				});
			}
		}

		if (options.length === 0) {
			return null;
		}

		if (optionsConfig.allowRollDice) {
			options.push({
				id: "__finish_pre_roll__",
				label: "结束操作并掷骰",
				actionType: "roll",
				description: "结束本回合准备阶段，并立即进入掷骰移动。",
			});
		}

		return {
			operationType: OperateType.RollDice,
			scene: "active-action",
			playerId: player.id,
			title: "选择主动行动或结束准备阶段",
			context,
			options,
			metadata: {
				maxSelections: 1,
				finishActionId: "__finish_pre_roll__",
			},
		};
	}

	private buildChanceCardDecisionSummary(chanceCard: IChanceCard): string {
		return `${chanceCard.getName()}：${chanceCard.getDescribe()}（目标类型：${chanceCard.getType()}）`;
	}

	private async buildAIChanceCardTargetIds(player: Player, chanceCardId: string): Promise<string[]> {
		const chanceCard = player.getCardById(chanceCardId);
		if (!chanceCard) {
			console.log(`${AI_LOG_PREFIX} chance card target build failed`, {
				playerId: player.id,
				chanceCardId,
				reason: "card_not_found",
			});
			return [];
		}

		if (chanceCard.getType() === TargetSelectType.ToSelf) {
			console.log(`${AI_LOG_PREFIX} chance card target self`, {
				playerId: player.id,
				chanceCardId,
			});
			return [];
		}

		const request = this.buildTargetDecisionRequest(player, this.buildAIDecisionContext(player), {
			title: `使用机会卡: ${chanceCard.getName()}`,
			content: chanceCard.getDescribe(),
			type: chanceCard.getType(),
			confirmText: "使用",
			cancelText: "取消",
		});
		this.ensureAIDecisionMetadata(request, player.id, `chance-card-target:${request.title}`);
		const selection = await this.runAIDecision(player, request);
		aiManager.feedback({
			playerId: player.id,
			request,
			selection,
			outcome: "chance-card-target",
		});
		const targetIds = selection.optionIds || (selection.optionId ? [selection.optionId] : []);
		console.log(`${AI_LOG_PREFIX} chance card target selection`, {
			decisionId: request.metadata?.decisionId,
			playerId: player.id,
			chanceCardId,
			title: request.title,
			selection,
			targetIds,
		});
		return targetIds;
	}

	private extractDisplayText(display: unknown): string | undefined {
		if (typeof display === "string") {
			const normalized = display.trim();
			return normalized || undefined;
		}
		if (!display || typeof display !== "object") {
			return undefined;
		}

		const variableText = this.extractObjectStringByKeys(display, [
			"description",
			"summary",
			"content",
			"text",
			"label",
			"title",
			"name",
		]);
		if (variableText) {
			return variableText;
		}

		const record = display as { content?: unknown; variable?: unknown; children?: unknown };
		if (typeof record.content === "string") {
			const normalized = record.content.trim();
			if (normalized) {
				return normalized;
			}
		}
		if (record.variable && typeof record.variable === "object") {
			const variableContent = this.extractObjectStringByKeys(record.variable, [
				"description",
				"summary",
				"content",
				"text",
				"label",
				"title",
				"name",
			]);
			if (variableContent) {
				return variableContent;
			}
		}
		if (Array.isArray(record.children)) {
			for (const child of record.children) {
				const childText = this.extractDisplayText(child);
				if (childText) {
					return childText;
				}
			}
		}
		return undefined;
	}

	private buildSelectorItemLabel(item: any, index: number, keyName?: PropertyKey): string {
		const explicitLabel =
			keyName !== undefined && item && typeof item === "object" ? item[keyName as keyof typeof item] : undefined;
		const label =
			this.normalizeDecisionText(explicitLabel) ??
			this.normalizeDecisionText(item?.name) ??
			this.normalizeDecisionText(item?.title) ??
			this.normalizeDecisionText(item?.label) ??
			this.normalizeDecisionText(item?.summary) ??
			this.normalizeDecisionText(item?.info?.name) ??
			this.extractDisplayVariableText(item?.display, ["name", "title", "label"]) ??
			this.normalizeDecisionText(item?.id);
		return label || `选项${index + 1}`;
	}

	private buildSelectorItemDescription(item: any, label: string): string | undefined {
		const description =
			this.normalizeDecisionText(item?.description) ??
			this.normalizeDecisionText(item?.summary) ??
			this.normalizeDecisionText(item?.info?.description) ??
			this.extractDisplayVariableText(item?.display, ["description", "summary", "content", "text"]) ??
			this.extractDisplayText(item?.display);
		if (!description || description === label) {
			return undefined;
		}
		return description;
	}

	private extractDisplayVariableText(display: unknown, keys: string[]): string | undefined {
		if (!display || typeof display !== "object" || !("variable" in display)) {
			return undefined;
		}
		return this.extractObjectStringByKeys((display as { variable?: unknown }).variable, keys);
	}

	private extractObjectStringByKeys(source: unknown, keys: string[]): string | undefined {
		return this.findObjectStringByKeys(source, keys, new Set<object>());
	}

	private normalizeDecisionText(value: unknown): string | undefined {
		if (typeof value !== "string") {
			return undefined;
		}
		const normalized = value.replace(/\s+/g, " ").trim();
		return normalized || undefined;
	}

	private extractSummaryHeadline(summary: string | undefined): string | undefined {
		const normalized = this.normalizeDecisionText(summary);
		if (!normalized) {
			return undefined;
		}
		const firstSegment = normalized.split(/[，,。:：;；|]/)[0]?.trim();
		if (!firstSegment) {
			return undefined;
		}
		const cleaned = firstSegment
			.replace(/^(?:购买|买入|使用|发动|选择|选中|获取|获得|触发|执行|升级|查看|前往|移动到)\s+/u, "")
			.replace(/^(?:物品|道具|卡牌|机会卡|地皮|角色|目标)\s+/u, "")
			.trim();
		return cleaned || firstSegment;
	}

	private findObjectStringByKeys(source: unknown, keys: string[], visited: Set<object>): string | undefined {
		if (!source || typeof source !== "object") {
			return undefined;
		}
		if (visited.has(source as object)) {
			return undefined;
		}
		visited.add(source as object);

		for (const key of keys) {
			const value = (source as Record<string, unknown>)[key];
			const normalized = this.normalizeDecisionText(value);
			if (normalized) {
				return normalized;
			}
		}

		if (Array.isArray(source)) {
			for (const item of source) {
				const nested = this.findObjectStringByKeys(item, keys, visited);
				if (nested) {
					return nested;
				}
			}
			return undefined;
		}

		for (const value of Object.values(source as Record<string, unknown>)) {
			const nested = this.findObjectStringByKeys(value, keys, visited);
			if (nested) {
				return nested;
			}
		}
		return undefined;
	}

	private buildAIDefaultOperationResult<T extends OperateType>(
		player: Player,
		operationType: T,
		option?: unknown,
		fallback?: PlayerOperationResult[T],
	): PlayerOperationResult[T] {
		if (fallback !== undefined) {
			return fallback;
		}

		switch (operationType) {
			case OperateType.RollDice:
				return undefined as PlayerOperationResult[T];
			case OperateType.ConfirmDialogResult:
				return { id: player.id, confirm: false } as PlayerOperationResult[T];
			case OperateType.TargetSelectDialogResult:
				return { target: [] } as unknown as PlayerOperationResult[T];
			case OperateType.ItemSelectDialogResult:
				return { selected: [] } as unknown as PlayerOperationResult[T];
			case OperateType.FormDialogResult:
				return this.buildDefaultFormResult(
					(option as FormDialogOption<FormField<string, any>[]>)?.fields || [],
				) as PlayerOperationResult[T];
			case OperateType.DynamicButtonClick:
				return { buttonId: "", success: false } as PlayerOperationResult[T];
			default:
				return undefined as PlayerOperationResult[T];
		}
	}

	private mapAIDecisionSelectionToResult<T extends OperateType>(
		player: Player,
		request: AIDecisionRequest<T>,
		selection: AIDecisionSelection,
		option?: unknown,
		fallback?: PlayerOperationResult[T],
	): PlayerOperationResult[T] {
		switch (request.operationType) {
			case OperateType.RollDice:
				return undefined as PlayerOperationResult[T];
			case OperateType.ConfirmDialogResult: {
				const confirm = selection.optionId === "__confirm__";
				return { id: player.id, confirm } as PlayerOperationResult[T];
			}
			case OperateType.TargetSelectDialogResult: {
				const target = selection.optionIds || (selection.optionId ? [selection.optionId] : []);
				return { target } as PlayerOperationResult[T];
			}
			case OperateType.ItemSelectDialogResult: {
				const selected = (selection.optionIds || (selection.optionId ? [selection.optionId] : [])).filter(
					(id) => id !== "__cancel__",
				);
				return { selected } as PlayerOperationResult[T];
			}
			case OperateType.FormDialogResult: {
				const defaultResult = this.buildDefaultFormResult(
					(option as FormDialogOption<FormField<string, any>[]>)?.fields || [],
				);
				const submitted =
					selection.submitted === true || (selection.submitted === undefined && selection.optionId === "__submit__");
				return {
					...defaultResult,
					...(selection.fieldValues || {}),
					submitted,
				} as PlayerOperationResult[T];
			}
			case OperateType.DynamicButtonClick:
				return {
					buttonId: selection.optionId || "",
					success: !!selection.optionId,
				} as PlayerOperationResult[T];
			default:
				return this.buildAIDefaultOperationResult(player, request.operationType, option, fallback);
		}
	}

	public setInitSessionId(initSessionId: string): void {
		this.initSessionId = initSessionId;
	}

	private prepareInitialInitBarrier(): void {
		this.initialInitBarrier.clear();
		for (const player of this.players.values()) {
			if (!player.isAI) this.initialInitBarrier.set(player.id, "pending");
		}
	}

	private async waitInitFinished(): Promise<void> {
		if (this.initialInitBarrier.size === 0) {
			this.gameBroadcast({
				type: SocketMsgType.GameInitFinished,
				data: undefined,
				source: SocketMsgSource.Server,
				extra: { initSessionId: this.initSessionId },
			});
			return;
		}
		await new Promise<void>((resolve) => {
			this.initialInitResolve = resolve;
			this.initialInitTimeout = setTimeout(() => {
				for (const [userId, status] of this.initialInitBarrier) {
					if (status === "pending") this.markInitialPlayerOffline(userId, "初始化确认超时");
				}
				this.resolveInitialBarrierIfComplete();
			}, GameProcess.INIT_BARRIER_TIMEOUT);
		});
		this.gameBroadcast({
			type: SocketMsgType.GameInitFinished,
			data: undefined,
			source: SocketMsgSource.Server,
			extra: { initSessionId: this.initSessionId },
		});
	}

	public handleInitSignal(
		userId: string,
		metadata?: { initSessionId?: string; initStatus?: "ready" | "failed"; reason?: string; messageId?: string },
	): void {
		if (metadata?.messageId) {
			if (this.processedInitMessageIds.has(metadata.messageId)) return;
			this.processedInitMessageIds.add(metadata.messageId);
		}
		const reconnect = this.reconnectInitSessions.get(userId);
		if (reconnect && reconnect.sessionId === metadata?.initSessionId) {
			clearTimeout(reconnect.timeout);
			this.reconnectInitSessions.delete(userId);
			if (metadata?.initStatus === "failed") {
				this.sendToPlayer(userId, {
					type: SocketMsgType.GameInitAborted,
					source: SocketMsgSource.Server,
					data: { initSessionId: reconnect.sessionId, reason: metadata?.reason || "游戏初始化失败" },
				});
				this.handlePlayerOffline(userId);
			} else {
				this.sendToPlayer(userId, {
					type: SocketMsgType.GameInitFinished,
					source: SocketMsgSource.Server,
					data: undefined,
					extra: { initSessionId: reconnect.sessionId },
				});
			}
			return;
		}
		if (metadata?.initSessionId !== this.initSessionId || !this.initialInitBarrier.has(userId)) return;
		if (metadata?.initStatus === "failed") {
			this.initialInitBarrier.set(userId, "failed");
			this.sendToPlayer(userId, {
				type: SocketMsgType.GameInitAborted,
				source: SocketMsgSource.Server,
				data: { initSessionId: this.initSessionId, reason: metadata.reason || "游戏初始化失败" },
			});
			this.markInitialPlayerOffline(userId, metadata.reason || "游戏初始化失败");
		} else {
			this.initialInitBarrier.set(userId, "ready");
		}
		this.resolveInitialBarrierIfComplete();
	}

	private markInitialPlayerOffline(userId: string, _reason: string): void {
		if (this.initialInitBarrier.get(userId) === "offline-ai") return;
		this.initialInitBarrier.set(userId, "offline-ai");
		this.handlePlayerOffline(userId);
	}

	private resolveInitialBarrierIfComplete(): void {
		if (Array.from(this.initialInitBarrier.values()).some((status) => status === "pending")) return;
		if (this.initialInitTimeout) clearTimeout(this.initialInitTimeout);
		this.initialInitTimeout = null;
		this.initialInitResolve?.();
		this.initialInitResolve = null;
	}

	public async runGamePhase(phase: IGamePhase<GameContext>, context?: GameContext) {
		this.currentGamePhase = phase;
		const checkGameOverEvent = {
			fn: this.checkGameOver.bind(this),
			key: "GameOverCheck",
		};
		this.gameRuntimeStack.push(...[checkGameOverEvent, ...phase.getEventQueue().reverse()]);
		await this.gameRuntimeStack.run(context, this);
	}

	public getAllPlayersId(): string[] {
		return Array.from(this.players.keys());
	}

	public nextTick(fn: (ctx: GameContext, gameProcess: IGameProcess) => Promise<void> | void): void {
		this.gameRuntimeStack.push({ fn });
	}

	/**
	 * 统一执行机会卡流程：广播动画 → 等待动画完成 → 执行 effectCode
	 */
	private async executeChanceCardWithAnimation(
		sourcePlayer: IPlayer,
		chanceCard: IChanceCard,
		target: IPlayer | IProperty | string | IPlayer[] | IProperty[],
		targetIdListForAnim: string[],
	) {
		const animationId = randomString(16);
		const chanceCardInfo = chanceCard.getChanceCardInfo();

		this.gameBroadcast({
			type: SocketMsgType.UseChanceCard,
			source: SocketMsgSource.Server,
			data: {
				error: false,
				animationId,
				chanceCard: chanceCardInfo,
				sourcePlayerId: sourcePlayer.id,
				targetIdList: targetIdListForAnim,
			},
		});

		this.setCurrentEventName(`${sourcePlayer.name} 使用机会卡中`);
		await this.waitForAnimationComplete(animationId, 6000);

		await chanceCard.use(sourcePlayer, target, this);
	}

	public pushEventToStack(...gameEvents: GameEvent<GameContext>[]) {
		this.gameRuntimeStack.push(...gameEvents);
	}

	public roundRemainingTimeBroadcast = (remainingTime: number, totalTime: number, timeout?: TimeoutInfo) => {
		const msg: ServerSocketMessage = {
			type: SocketMsgType.RemainingTime,
			source: SocketMsgSource.Server,
			data: {
				remainingTime,
				totalTime,
				timeoutId: timeout?.timeoutId,
				playerId: timeout?.playerId,
				eventType: timeout?.eventType,
			},
		};
		this.gameBroadcast(msg);
	};

	/**
	 * 设置当前事件名称
	 * @param eventName - 事件名称
	 */
	public setCurrentEventName(eventName: string): void {
		this.currentEventName = eventName;
		const msg: ServerSocketMessage = {
			type: SocketMsgType.CurrentEventName,
			source: SocketMsgSource.Server,
			data: { eventName },
		};
		this.gameBroadcast(msg);
	}

	/**
	 * 标记动画完成
	 * @param animationId - 动画ID
	 */
	public markAnimationComplete(animationId: string): void {
		const cleanup = this.animationCompletionHandlers.get(animationId);
		if (cleanup) {
			cleanup();
		} else {
			console.warn(`[GameProcess] 未找到动画完成处理器: ${animationId}`);
		}
	}

	/**
	 * 等待动画完成（带超时）
	 * @param animationId - 动画ID
	 * @param timeout - 超时时间（毫秒）
	 * @returns Promise，动画完成或超时时resolve
	 */
	private waitForAnimationComplete(animationId: string, timeout: number): Promise<void> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				console.warn(`[GameProcess] 动画超时: ${animationId}`);
				cleanup();
			}, timeout);

			const cleanup = () => {
				clearTimeout(timer);
				this.animationCompletionHandlers.delete(animationId);
				resolve();
			};

			this.animationCompletionHandlers.set(animationId, cleanup);
		});
	}

	/**
	 * 更新当前事件的倒计时显示状态
	 * @param showCountdown - 是否显示倒计时
	 */
	public updateCurrentEventShowCountdown(showCountdown: boolean): void {
		const msg: ServerSocketMessage = {
			type: SocketMsgType.CurrentEventName,
			source: SocketMsgSource.Server,
			data: {
				eventName: this.currentEventName,
				showCountdown,
			},
		};
		this.gameBroadcast(msg);
	}

	public async showConfirmDialog(
		playerId: string,
		option: ConfirmDialogOption,
		config?: { timeout?: number; defaultValue?: ConfirmDialogResult },
	): Promise<ConfirmDialogResult> {
		const player = this.players.get(playerId);

		// 如果玩家是AI托管，直接返回决策，不显示对话框
		if (player?.isAI) {
			console.log(`${AI_LOG_PREFIX} intercept confirm dialog for AI`, {
				playerId,
				title: option.title,
			});
			return (await this.makeAIDecision(player, OperateType.ConfirmDialogResult, { option })) as ConfirmDialogResult;
		}

		const timeoutId = randomString(16);
		const timeout = config?.timeout ?? this.defaultTimeoutMs;

		// 真实玩家，显示对话框
		sendToUsers([playerId], {
			type: SocketMsgType.ConfirmDialog,
			source: SocketMsgSource.Server,
			data: {
				playerId,
				option,
				timeoutId,
			},
		});

		// 使用带超时的方法
		return (await operationListener.onceAsyncWithTimeout(playerId, OperateType.ConfirmDialogResult, {
			timeout,
			timeoutId,
			match: (result) => result.timeoutId === timeoutId,
			defaultValue: config?.defaultValue ?? { id: playerId, confirm: false },
		})) as ConfirmDialogResult;
	}

	public async showTargetSelectDialog<I extends TargetSelectType>(
		playerId: string,
		option: TargetSelectDialogOption<I>,
		config?: { timeout?: number; defaultValue?: TargetSelectDialogResult<I> },
	): Promise<TargetSelectDialogResult<I>> {
		const player = this.players.get(playerId);

		// 如果玩家是AI托管，直接返回决策，不显示对话框
		if (player?.isAI) {
			console.log(`${AI_LOG_PREFIX} intercept target dialog for AI`, {
				playerId,
				title: option.title,
				type: option.type,
			});
			return (await this.makeAIDecision(player, OperateType.TargetSelectDialogResult, {
				option,
			})) as TargetSelectDialogResult<I>;
		}

		const timeoutId = randomString(16);
		const timeout = config?.timeout ?? this.defaultTimeoutMs;

		// 真实玩家，显示对话框
		sendToUsers([playerId], {
			type: SocketMsgType.TargetSelectDialog,
			source: SocketMsgSource.Server,
			data: {
				playerId,
				option,
				timeoutId,
			},
		});

		return (await operationListener.onceAsyncWithTimeout(playerId, OperateType.TargetSelectDialogResult, {
			timeout,
			timeoutId,
			match: (result) => result.timeoutId === timeoutId,
			defaultValue: config?.defaultValue ?? { target: [] },
		})) as TargetSelectDialogResult<I>;
	}

	public async showItemSelectDialog(
		playerId: string,
		option: ItemSelectDialogOption,
		config?: { timeout?: number; defaultValue?: ItemSelectDialogResult },
	): Promise<ItemSelectDialogResult> {
		const player = this.players.get(playerId);

		// 如果玩家是AI托管，直接返回决策，不显示对话框
		if (player?.isAI) {
			console.log(`${AI_LOG_PREFIX} intercept item dialog for AI`, {
				playerId,
				title: option.title,
				itemCount: option.itemList?.length || 0,
			});
			return (await this.makeAIDecision(player, OperateType.ItemSelectDialogResult, {
				option,
			})) as ItemSelectDialogResult;
		}

		const timeoutId = randomString(16);
		const timeout = config?.timeout ?? this.defaultTimeoutMs;

		// 真实玩家，显示对话框
		sendToUsers([playerId], {
			type: SocketMsgType.ItemSelectDialog,
			source: SocketMsgSource.Server,
			data: {
				playerId,
				option,
				timeoutId,
			},
		});

		return (await operationListener.onceAsyncWithTimeout(playerId, OperateType.ItemSelectDialogResult, {
			timeout,
			timeoutId,
			match: (result) => result.timeoutId === timeoutId,
			defaultValue: config?.defaultValue ?? { selected: [] },
		})) as ItemSelectDialogResult;
	}

	/**
	 * 显示表单对话框
	 * @param playerId - 玩家 ID
	 * @param option - 表单对话框选项
	 * @param config - 配置选项（超时时间和默认值）
	 * @returns 表单对话框结果
	 */
	public async showFormDialog<F extends FormField<string, any>[]>(
		playerId: string,
		option: FormDialogOption<F>,
		config?: { timeout?: number; defaultValue?: FormDialogResult<F> },
	): Promise<FormDialogResult<F>> {
		const player = this.players.get(playerId);

		// 如果玩家是 AI 托管，直接返回决策，不显示对话框
		if (player?.isAI) {
			console.log(`${AI_LOG_PREFIX} intercept form dialog for AI`, {
				playerId,
				title: option.title,
				fieldCount: option.fields?.length || 0,
			});
			return (await this.makeAIDecision(player, OperateType.FormDialogResult, {
				option,
			})) as FormDialogResult<F>;
		}

		const timeoutId = randomString(16);
		const timeout = config?.timeout ?? this.defaultTimeoutMs;

		// 真实玩家，显示表单对话框
		sendToUsers([playerId], {
			type: SocketMsgType.FormDialog,
			source: SocketMsgSource.Server,
			data: {
				playerId,
				option,
				timeoutId,
			},
		});

		// 使用带超时的方法等待响应
		return (await operationListener.onceAsyncWithTimeout(playerId, OperateType.FormDialogResult, {
			timeout,
			timeoutId,
			match: (result) => result.timeoutId === timeoutId,
			defaultValue: config?.defaultValue ?? this.buildDefaultFormResult(option.fields),
		})) as FormDialogResult<F>;
	}

	/**
	 * 构建表单默认结果
	 */
	private buildDefaultFormResult<F extends FormField<string, any>[]>(fields: F): FormDialogResult<F> {
		const result: any = { submitted: false };
		for (const field of fields) {
			result[field.key] = field.defaultValue;
		}
		return result;
	}

	/**
	 * 启动心跳机制
	 */
	private startHeartbeat(): void {
		const scheduleNextHeartbeat = () => {
			this.heartbeatTimer = setTimeout(() => {
				this.sendHeartbeat();
				scheduleNextHeartbeat();
			}, GameProcess.HEARTBEAT_INTERVAL) as any;
		};
		scheduleNextHeartbeat();
	}

	/**
	 * 发送心跳消息到主线程
	 */
	private sendHeartbeat(): void {
		self.postMessage(<WorkerCommMsg>{
			type: WorkerCommType.WorkerHeartbeat,
			data: {
				timestamp: Date.now(),
				gameState: {
					currentRound: this.currentRound,
					currentPlayerId: this.currentRoundPlayer?.id,
					isGameOver: this.isGameOver,
					isBusy: this.isProcessingLongOperation,
				},
			},
		});
	}

	/**
	 * 停止心跳机制
	 */
	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearTimeout(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	/**
	 * 运行耗时操作的包装方法
	 * @param fn 要执行的异步函数
	 * @param operationName 操作名称（用于显示）
	 * @returns 函数执行结果
	 */
	private async runLongOperation<T>(fn: () => Promise<T>, operationName: string): Promise<T> {
		this.isProcessingLongOperation = true;
		this.setCurrentEventName(operationName);
		try {
			return await fn();
		} finally {
			this.isProcessingLongOperation = false;
		}
	}

	private abbreviateAIThought(text: string, maxLength: number): string {
		const normalized = text.replace(/\s+/g, " ").trim();
		if (!normalized) return "";
		if (normalized.length <= maxLength) return normalized;
		return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
	}

	private stripMessageCardRichText(text: string): string {
		return text
			.replace(/<br\s*\/?>/gi, "，")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	private appendMessageCardTextFragment(fragments: string[], value: unknown): void {
		const normalized =
			typeof value === "string" ? this.stripMessageCardRichText(value) : this.normalizeDecisionText(value);
		if (!normalized || fragments.includes(normalized)) {
			return;
		}
		fragments.push(normalized);
	}

	private collectMessageCardStructuredText(source: unknown, fragments: string[], visited: Set<object>): void {
		if (!source || typeof source !== "object") {
			return;
		}
		if (visited.has(source as object)) {
			return;
		}
		visited.add(source as object);

		if (Array.isArray(source)) {
			for (const item of source) {
				this.collectMessageCardStructuredText(item, fragments, visited);
			}
			return;
		}

		const record = source as Record<string, unknown>;
		for (const key of ["title", "name", "label", "summary", "description", "content", "text"]) {
			this.appendMessageCardTextFragment(fragments, record[key]);
		}

		if (record.variable && typeof record.variable === "object") {
			this.collectMessageCardStructuredText(record.variable, fragments, visited);
		}
		if (Array.isArray(record.children)) {
			for (const child of record.children) {
				this.collectMessageCardStructuredText(child, fragments, visited);
			}
		}
	}

	private extractMessageCardContentText(content: MessageCardOption["content"]): string {
		if (typeof content === "string") {
			return this.stripMessageCardRichText(content);
		}
		const fragments: string[] = [];
		this.collectMessageCardStructuredText(content, fragments, new Set<object>());
		return fragments.join("，");
	}

	private extractAIMessageCardSummary(option: MessageCardOption, maxLength: number = 24): string | undefined {
		const candidates = [option.title, this.extractMessageCardContentText(option.content)];
		const genericTitles = new Set(["提示", "消息", "信息", "通知", "提醒"]);
		for (const candidate of candidates) {
			const trimmed = candidate?.trim();
			if (!trimmed) continue;
			if (genericTitles.has(trimmed)) continue;
			return this.abbreviateAIThought(trimmed, maxLength);
		}
		return undefined;
	}

	private buildMessageCardAIReactionPrompt(option: MessageCardOption): AIDecisionPrompt<"scripted-action"> {
		const title = this.abbreviateAIThought(option.title || "提示", 32) || "提示";
		const rawContent = this.extractMessageCardContentText(option.content);
		const contentSummary = this.abbreviateAIThought(rawContent, 160);
		const humanSummary = this.extractAIMessageCardSummary(option, 36) || title;
		const summaryParts = [
			"你刚收到一张 showMessageCard 提示卡，请把它当作游戏内即时信息。",
			`标题：${title}。`,
			contentSummary ? `内容：${contentSummary}。` : "内容：这张卡主要是界面化提示，请结合标题理解。",
			"请用玩家第一人称、口语化地说 1 句即时反应。",
			"把这句话放进 chatMessages[0]，不要复述按钮词、技术词或 JSON 结构。",
		];
		return {
			operationType: "scripted-action",
			scene: "scripted-action",
			title: `收到提示卡：${title}`,
			summary: summaryParts.join(" "),
			options: [
				{
					id: "__acknowledge_message_card__",
					label: "收到信息并说一句自然反应",
					actionType: "acknowledge",
					description: "理解提示卡内容，给出一句自然聊天发言，不执行额外游戏动作。",
					summary: `就“${humanSummary}”做出一句即时反应。`,
					payload: {
						title,
						content: contentSummary,
						type: "message-card",
						actionKind: "message-card-reaction",
					},
				},
			],
			metadata: {
				messageCardTitle: title,
				messageCardContent: contentSummary,
				chatOnly: true,
			},
		};
	}

	private async requestAIMessageCardReaction(playerId: string, option: MessageCardOption): Promise<void> {
		try {
			await this.requestAIDecision(playerId, this.buildMessageCardAIReactionPrompt(option));
		} catch (error) {
			console.warn(`${AI_LOG_PREFIX} message card reaction failed`, {
				playerId,
				title: option.title,
				error,
			});
		}
	}

	public async showMessageCard(playerIds: string[], option: MessageCardOption): Promise<void> {
		for (const playerId of playerIds) {
			const player = this.players.get(playerId);
			if (!player?.isAI) continue;
			void this.requestAIMessageCardReaction(playerId, option);
		}
		sendToUsers(playerIds, {
			type: SocketMsgType.MessageCard,
			source: SocketMsgSource.Server,
			data: { option },
		});
		await this.sleep(option.duration);
	}

	public async requestAIDecision(playerId: string, prompt: AIDecisionPrompt): Promise<AIDecisionSelection | null> {
		const player = this.players.get(playerId);
		if (!player?.isAI) {
			console.log(`${AI_LOG_PREFIX} requestAIDecision ignored`, {
				playerId,
				reason: "player_not_ai",
				title: prompt.title,
			});
			return null;
		}

		const request: AIDecisionRequest = {
			...prompt,
			playerId,
			context: this.buildAIDecisionContext(player),
		};
		this.ensureAIDecisionMetadata(request, playerId, `scripted:${request.title}`);

		try {
			console.log(`${AI_LOG_PREFIX} scripted request`, {
				decisionId: request.metadata?.decisionId,
				playerId,
				title: request.title,
				operationType: request.operationType,
				scene: request.scene,
				options: request.options.map((option) => ({
					id: option.id,
					label: option.label,
					actionType: option.actionType,
				})),
			});
			const selection = await this.runAIDecision(player, request);
			aiManager.feedback({
				playerId,
				request,
				selection,
				outcome: "scripted",
			});
			console.log(`${AI_LOG_PREFIX} scripted selection`, {
				decisionId: request.metadata?.decisionId,
				playerId,
				title: request.title,
				selection,
			});
			return selection;
		} finally {
		}
	}

	private async runAIDecision(player: Player, request: AIDecisionRequest): Promise<AIDecisionSelection> {
		if (player.beginAIThinking()) {
			this.gameDataBroadcast();
		}

		try {
			return await aiManager.decide(request);
		} finally {
			if (player.endAIThinking()) {
				this.gameDataBroadcast();
			}
		}
	}

	private ensureAIDecisionMetadata(request: AIDecisionRequest, playerId: string, label: string): void {
		const decisionId =
			typeof request.metadata?.decisionId === "string" && request.metadata.decisionId
				? request.metadata.decisionId
				: this.createAIDecisionId(playerId);
		request.metadata = {
			...(request.metadata || {}),
			decisionId,
			traceLabel: request.metadata?.traceLabel || label,
		};
	}

	private createAIDecisionId(playerId: string): string {
		return `ai-${playerId.slice(0, 6)}-${randomString(6)}`;
	}

	private sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	public setPendingSaveData(data: { snapshot: SaveSnapshot; aiPlayerIds: string[] }) {
		this.pendingSaveData = data;
	}

	public async start() {
		try {
			// 提取存档中的角色ID映射（如果有存档），用于在创建玩家时使用正确的角色
			// 这样可以避免使用错误的角色初始化代码产生副作用
			const savedRoleIds = this.pendingSaveData
				? new Map<string, string>(
						Object.entries(this.pendingSaveData.snapshot.playerSnapshots).map(([userId, snap]) => [
							userId,
							(snap as any).roleId,
						]),
					)
				: undefined;

			// 步骤1: 初始化玩家和地皮（包含预初始化阶段）
			await this.initPlayers(savedRoleIds);
			await this.initProperties();

			// 步骤2: 运行游戏初始化后阶段
			await this.runInitedPhase();

			// 步骤2.5: 如果有待注入的存档数据，在发送给客户端之前恢复
			// 这样客户端首次收到的 GameInit 就是存档后的正确状态
			if (this.pendingSaveData) {
				await this.restoreFromSnapshot(this.pendingSaveData.snapshot, this.pendingSaveData.aiPlayerIds);
				this.pendingSaveData = null;
				// 运行存档恢复后阶段（供地图脚本重建运行时状态）
				await this.runPostRestorePhase();
			}

			// 步骤3: 发送游戏初始化消息给客户端（已包含存档恢复后的状态）
			this.prepareInitialInitBarrier();
			this.gameBroadcast({
				type: SocketMsgType.GameInit,
				source: SocketMsgSource.Server,
				data: this.getGameData(),
				extra: { initSessionId: this.initSessionId },
			});

			// 步骤4: 等待客户端初始化完成
			await this.waitInitFinished();

			// 在所有真人玩家完成初始化、失败或切换 AI 托管后才通知房主清除初始化超时。
			self.postMessage(<WorkerCommMsg>{ type: WorkerCommType.GameProcessReady, data: undefined });

			// 启动心跳机制
			this.startHeartbeat();
		} catch (e: any) {
			console.error("[GameProcess.start Init Error]:", e);
			reportWorkerError(e, "GameProcess.start 初始化阶段");
			throw e;
		}

		// 步骤5: 开始游戏循环（不放在 try 中，游戏循环中的错误由 unhandledrejection 捕获）
		await this.gameLoop();
	}

	public async checkGameOver(): Promise<void> {
		const result = await this.gameOverRuleFunction({}, this);
		if (result === true) {
			// 旧地图兼容: 返回 true/undefined 时按默认顺序（玩家ID列表）结束
			this.gameOver(Array.from(this.players.keys()));
		} else if (Array.isArray(result) && result.length > 0) {
			this.gameOver(result);
		}
	}

	private gameOver(rankedPlayerIds: string[]) {
		this.isGameOver = true;
		this.rankedPlayerIds = rankedPlayerIds;
		this.gameDataBroadcast();
		this.gameBroadcast({
			type: SocketMsgType.GameOver,
			source: SocketMsgSource.Server,
			data: { returnToRoom: false },
			msg: { content: "游戏结束", type: "info" },
		});
		self.postMessage(<WorkerCommMsg>{
			type: WorkerCommType.GameOver,
		});
		this.destroy();
	}

	public messageNotify(
		playerIdList: string[],
		msg: {
			type: "info" | "success" | "warning" | "error";
			content: string;
		},
	) {
		sendToUsers(playerIdList, { type: SocketMsgType.MsgNotify, source: SocketMsgSource.Server, data: undefined, msg });
	}

	public getGameData() {
		const gameInfo: GameData = {
			exportData: this.exportData || {},
			currentPlayerIdInRound: this.currentRoundPlayer ? this.currentRoundPlayer.id : "",
			currentRound: this.currentRound,
			currentMultiplier: this.currentMultiplier,
			players: Array.from(this.players.values()).map((player) => player.getPlayerInfo()),
			mapPathRuntimeState: {
				enabledPathIds: [...this.enabledPathIds],
				currentMoveDirection: this.currentMapMoveDirection,
				pendingChoice: this.pendingMapPathChoice,
			},
			properties: Array.from(this.properties.values()).map((property) => property.getPropertyInfo()),
			isGameOver: this.isGameOver,
			rankedPlayerIds: this.rankedPlayerIds,
		};
		return gameInfo;
	}

	/** DevTools debug: serialize all internal state */
	public getDebugState(): GameProcessDebugState {
		// Use JSON round-trip to strip non-serializable values (functions, etc.)
		const raw = {
			currentRound: this.currentRound,
			currentMultiplier: this.currentMultiplier,
			currentRoundPlayer: this.currentRoundPlayer
				? `${this.currentRoundPlayer.name} (${this.currentRoundPlayer.id})`
				: null,
			currentGamePhase: this.currentGamePhase ? (this.currentGamePhase.name ?? "(unnamed)") : null,
			currentEventName: this.currentEventName,
			isGameOver: this.isGameOver,
			gameRuntimeStack: {
				stackSize: this.gameRuntimeStack.stack.length,
				isRunning: this.gameRuntimeStack.isRunning,
			},
			players: Array.from(this.players.values()).map((p) => p.getPlayerInfo()),
			properties: Array.from(this.properties.values()).map((p) => p.getPropertyInfo()),
			chanceCardInfos: Array.from(this.chanceCardInfos.entries()),
			mapItems: Array.from(this.mapItems.entries()).map(([id, item]) => [id, item]),
			mapEvents: Array.from(this.mapEvents.entries()).map(([id, evt]) => [id, evt]),
			gameLogList: this.gameLogList,
			exportData: { ...this.exportData },
			customData: { ...this.customData },
			gameSetting: this.gameSetting,
			playerButtons: Array.from(this.playerButtons.entries()).map(([playerId, buttons]) => [
				playerId,
				Array.from(buttons.entries()),
			]),
			animationCompletionHandlers: Array.from(this.animationCompletionHandlers.keys()),
			rankedPlayerIds: [...this.rankedPlayerIds],
			aiStrategyStates: aiManager.getAllStrategyStates(),
		};
		return JSON.parse(JSON.stringify(raw));
	}
	public createGameLinkItem(type: GameLinkItem, id: string) {
		return `@-#${type}#-#${id}#`;
	}

	/**
	 * 通知所有客户端进入新回合
	 * 广播当前回合玩家 ID,让每个客户端自行判断是否是自己的回合
	 * @param playerId - 当前回合玩家的 ID
	 */
	public roundTurnNotify(playerId: string) {
		this.invalidateAIPreRollOperationSession(playerId);
		this.aiTurnActionState.set(playerId, this.createAITurnActionState());
		this.gameBroadcast({
			type: SocketMsgType.RoundTurn,
			source: SocketMsgSource.Server,
			data: playerId,
		});
		this.gameLogBroadcast(`---接下来是 ${this.createGameLinkItem(GameLinkItem.Player, playerId)} 的回合---`);
	}

	public sendToPlayer(id: string, msg: ServerSocketMessage) {
		sendToUsers([id], msg);
	}

	public gameDataBroadcast() {
		this.gameBroadcast({
			type: SocketMsgType.GameData,
			source: SocketMsgSource.Server,
			data: this.getGameData(),
		});
	}

	public msgNotifyBroadcast(type: "success" | "warning" | "error" | "info", msg: string) {
		this.gameBroadcast({
			type: SocketMsgType.MsgNotify,
			data: undefined,
			msg: { type, content: msg },
			source: SocketMsgSource.Server,
		});
	}

	public gameLogBroadcast(log: string) {
		const gameLog: GameLog = { id: randomString(8), time: Date.now() - this.startTime, content: log };
		this.gameLogList.push(gameLog);
		this.gameBroadcast({
			type: SocketMsgType.GameLog,
			data: gameLog,
			source: SocketMsgSource.Server,
		});
	}

	public gameBroadcast(msg: ServerSocketMessage) {
		sendToUsers(
			Array.from(this.players.values()).map((p) => p.id),
			msg,
		);
	}

	/**
	 * 清理玩家的所有按钮
	 * @param playerId 玩家ID
	 */
	private cleanupPlayerButtons(playerId: string): void {
		const timer = this.aiDynamicButtonTimers.get(playerId);
		if (timer) {
			clearTimeout(timer);
			this.aiDynamicButtonTimers.delete(playerId);
		}
		this.aiDynamicButtonInFlight.delete(playerId);
		this.aiDynamicButtonSchedulingSuppressed.delete(playerId);
		this.invalidateAIPreRollOperationSession(playerId);
		this.aiTurnActionState.delete(playerId);

		const playerButtons = this.playerButtons.get(playerId);
		if (!playerButtons) {
			return;
		}

		// 通知客户端移除所有按钮
		for (const buttonId of playerButtons.keys()) {
			const removeMessage: ButtonRemoveMessage = {
				buttonId,
			};

			sendToUsers([playerId], {
				type: SocketMsgType.ButtonRemove,
				source: SocketMsgSource.Server,
				data: removeMessage,
			});
		}

		// 清理监听器
		this.playerButtonListeners.delete(playerId);

		// 清理内存
		this.playerButtons.delete(playerId);
	}

	public handlePlayerOffline(userId: string) {
		if (this.initialInitBarrier.get(userId) === "pending") {
			this.initialInitBarrier.set(userId, "offline-ai");
			this.resolveInitialBarrierIfComplete();
		}
		const player = this.getPlayerById(userId);
		if (player) {
			// 清理玩家的所有按钮
			this.cleanupPlayerButtons(userId);

			player.setIsOffline(true);
			// 启用AI托管
			player.isAI = true;
			console.log(`[AI托管] 玩家 ${player.name} 离线，启用AI托管`);
			this.gameDataBroadcast();
		}
	}

	public handlePlayerReconnect(userId: string) {
		const player = this.players.get(userId);
		if (player) {
			const timer = this.aiDynamicButtonTimers.get(userId);
			if (timer) {
				clearTimeout(timer);
				this.aiDynamicButtonTimers.delete(userId);
			}
			this.aiDynamicButtonInFlight.delete(userId);
			this.aiDynamicButtonSchedulingSuppressed.delete(userId);
			this.invalidateAIPreRollOperationSession(userId);
			player.setIsOffline(false);
			// 取消AI托管
			player.isAI = false;
			console.log(`[AI托管] 玩家 ${player.name} 重连，取消AI托管`);
			sendToUsers([userId], {
				type: SocketMsgType.GameStart,
				source: SocketMsgSource.Server,
				data: undefined,
			});

			const initSessionId = randomString(16);
			const timeout = setTimeout(() => {
				this.reconnectInitSessions.delete(userId);
				this.sendToPlayer(userId, {
					type: SocketMsgType.GameInitAborted,
					source: SocketMsgSource.Server,
					data: { initSessionId, reason: "重连初始化超时" },
				});
				this.handlePlayerOffline(userId);
			}, GameProcess.INIT_BARRIER_TIMEOUT);
			this.reconnectInitSessions.set(userId, { sessionId: initSessionId, timeout });
			sendToUsers([userId], {
				type: SocketMsgType.GameInit,
				source: SocketMsgSource.Server,
				data: this.getGameData(),
				extra: { initSessionId },
			});
			this.gameDataBroadcast();
		} else {
			console.log("奇怪的玩家 in game");
		}
	}

	public createSnapshot(): SaveSnapshot {
		const playerSnapshots: Record<string, PlayerSnapshot> = {};
		for (const [id, player] of this.players) {
			playerSnapshots[id] = player.getSnapshot();
		}

		const propertySnapshots: Record<string, PropertySnapshot> = {};
		for (const [id, property] of this.properties) {
			propertySnapshots[id] = property.getSnapshot();
		}

		return {
			playerSnapshots,
			propertySnapshots,
			currentRound: this.currentRound,
			currentMultiplier: this.currentMultiplier,
			exportData: { ...this.exportData },
			customData: { ...this.customData },
			gameLogList: [...this.gameLogList],
			mapPathRuntimeState: {
				enabledPathIds: [...this.enabledPathIds],
				currentMoveDirection: this.currentMapMoveDirection,
				pendingChoice: this.pendingMapPathChoice
					? {
							...this.pendingMapPathChoice,
							candidates: this.pendingMapPathChoice.candidates.map((candidate) => ({ ...candidate })),
						}
					: undefined,
			},
		};
	}

	public async restoreFromSnapshot(snapshot: SaveSnapshot, aiPlayerIds: string[]): Promise<void> {
		// 通行条件是 Worker 会话内存状态，恢复存档时不得继承。
		this.mapPathCanPassConditions.clear();

		// 将缺失的存档玩家标记为 AI
		for (const playerId of aiPlayerIds) {
			const player = this.players.get(playerId);
			if (player) player.isAI = true;
		}

		// 各 Player 自行恢复
		for (const [id, playerSnapshot] of Object.entries(snapshot.playerSnapshots)) {
			const player = this.players.get(id);
			if (player) {
				player.restoreFromSnapshot(playerSnapshot, this);
			}
		}

		// 各 Property 自行恢复
		for (const [id, propSnapshot] of Object.entries(snapshot.propertySnapshots)) {
			const property = this.properties.get(id);
			if (property) {
				await property.restoreFromSnapshot(propSnapshot, this.players, this);
			}
		}

		// 恢复 GameProcess 级别数据
		this.currentRound = snapshot.currentRound;
		this.currentMultiplier = snapshot.currentMultiplier;
		this.exportData = { ...snapshot.exportData };
		this.customData = { ...snapshot.customData };
		this.gameLogList = [...snapshot.gameLogList];

		const mapPathRuntimeState = snapshot.mapPathRuntimeState;
		if (mapPathRuntimeState) {
			const validPathIds = new Set(this.mapData.mapPaths.map((path) => path.id));
			this.enabledPathIds = new Set(mapPathRuntimeState.enabledPathIds.filter((pathId) => validPathIds.has(pathId)));
			this.currentMapMoveDirection = mapPathRuntimeState.currentMoveDirection;
			this.pendingMapPathChoice = mapPathRuntimeState.pendingChoice
				? {
						...mapPathRuntimeState.pendingChoice,
						candidates: mapPathRuntimeState.pendingChoice.candidates.map((candidate) => ({ ...candidate })),
					}
				: undefined;
		} else {
			this.enabledPathIds = new Set(getInitialEnabledMapPathIds(this.mapData.mapPaths));
			this.currentMapMoveDirection = undefined;
			this.pendingMapPathChoice = undefined;
		}

		// 广播最新状态
		this.gameDataBroadcast();
	}

	public destroy() {
		// 停止心跳机制
		this.stopHeartbeat();

		this.players.forEach((_player, playerId) => {
			operationListener.removeAll(playerId);
		});
		operationListener.clearAllTimers();
		this.intervalTimerList.forEach((id) => {
			clearInterval(id);
		});
		this.timeoutList.forEach((id) => {
			clearTimeout(id);
		});
	}
}

import { MonopolyClient, useMonopolyClient } from "./MonopolyClient";
import {
	GameEventType,
	GameSetting,
	OperateType,
	PlayerInfo,
	PropertyInfo,
	RoleInRoom,
	ServerSocketMessage,
	SocketMessage,
	SocketMsgType,
	FormField,
	UISchema,
	FormSchema,
} from "@mine-monopoly/types";
import {
	useChat,
	useGameLog,
	useLoading,
	useRoomInfo,
	useRoomList,
	useUserInfo,
	useUserList,
	useUtil,
} from "@src/store";
import { debounce, formatBytes, getDisplayValueByFormSchema } from "@src/utils";
import { SocketMsgSource } from "@mine-monopoly/types";
import { FPMessage } from "@mine-monopoly/ui";
import { FPMessageBox } from "@src/components/utils/fp-message-box";
import router from "@src/router";
import useEventBus from "@src/utils/event-bus";
import { createVNode } from "vue";
import PropertyInfoVue from "@src/components/common/property-card.vue";
import { useGameData, useMapData, useResourceStore } from "@src/store/game";
import { GameMap } from "@mine-monopoly/utils/protos/game-map";
import { loadGameMapFromFile, loadGameMapFromServer } from "@src/utils/file/game-map";
import { base64ToArrayBuffer } from "@mine-monopoly/utils";
import { showTargetSelector } from "@src/components/common/target-seletor";
import { showItemSelector } from "@src/components/utils/item-selector";
import { FPMessageCard } from "../../components/utils/fp-message-card/index";
import { MapChunkStartData, MapChunkData, MapChunkEndData, MapChunkAbortData, RoomMapInfo, MapEventChangedData } from "@mine-monopoly/types";

/** 地图分块接收状态 */
interface ChunkReceiveState {
	totalChunks: number;
	/** 地图数据总大小（字节） */
	totalBytes: number;
	/** 已接收数据大小（字节） */
	receivedBytes: number;
	receivedChunks: Map<number, Uint8Array>;
	transferTimeoutId: number | null;
	chunkTimeoutId: number | null;
	/** 上次更新进度的 5% 桶（用于降频 UI 更新） */
	lastProgressBucket: number;
}

/** 当前接收状态 */
let receiveState: ChunkReceiveState | null = null;

/** 整体传输超时基础值（毫秒），实际按块数动态计算（与主机端一致） */
const TRANSFER_TIMEOUT = 60000;

/** 每块预估传输时间（毫秒），用于动态整体超时估算（覆盖 TURN 中继等慢链路） */
const CHUNK_ESTIMATED_TIME = 3000;

/** 整体传输超时上限（毫秒） */
const TRANSFER_TIMEOUT_MAX = 300000;

/** 块超时（毫秒）：长时间未收到新块判定传输停滞 */
const CHUNK_TIMEOUT = 20000;

/** 根据块数计算动态整体超时 */
function calcTransferTimeout(totalChunks: number, provided?: number): number {
	if (provided) return provided;
	const estimated = TRANSFER_TIMEOUT + totalChunks * CHUNK_ESTIMATED_TIME;
	return Math.min(estimated, TRANSFER_TIMEOUT_MAX);
}

function clearReceiveState(): void {
	if (receiveState) {
		if (receiveState.transferTimeoutId) clearTimeout(receiveState.transferTimeoutId);
		if (receiveState.chunkTimeoutId) clearTimeout(receiveState.chunkTimeoutId);
		receiveState = null;
	}
}

function resetChunkTimeout(): void {
	if (receiveState?.chunkTimeoutId) clearTimeout(receiveState.chunkTimeoutId);
	if (receiveState) {
		receiveState.chunkTimeoutId = window.setTimeout(() => {
			handleTransferTimeout("长时间未收到数据分块");
		}, CHUNK_TIMEOUT);
	}
}

function handleTransferTimeout(reason: string): void {
	clearReceiveState();
	useLoading().hideLoading();
	FPMessage({ type: "error", message: `地图传输失败: ${reason}` });
}

import { logErrorWithOptions } from "@src/utils/log/error-helpers";
import { ErrorCategory } from "@src/utils/log/index";
import { useAudioManager } from "@src/utils/audio/AudioManager";
import { SoundName } from "@src/utils/audio/types";

type ServerMessageHandler<T extends SocketMsgType> = (
	msg: SocketMessage<T, SocketMsgSource.Server>,
	client: MonopolyClient,
) => void;

export function handleServerSocketMessage(msg: ServerSocketMessage, client: MonopolyClient) {
	switch (msg.type) {
		case SocketMsgType.Heart:
			handleHeartReply(msg, client);
			break;
		case SocketMsgType.UserList:
			handleUserListReply(msg, client);
			break;
		case SocketMsgType.RoomList:
			handleRoomListReply(msg, client);
			break;
		case SocketMsgType.JoinRoom:
			handleJoinRoomReply(msg, client);
			break;
		case SocketMsgType.LeaveRoom:
			handleLeaveRoomReply(msg, client);
			break;
		case SocketMsgType.KickOut:
			handleKickOutReply(msg, client);
			break;
		case SocketMsgType.RoomInfo:
			handleRoomInfoReply(msg, client);
			break;
		case SocketMsgType.ChangeMap:
			handleChangeMap(msg, client);
			break;
		case SocketMsgType.RoomChat:
			handleRoomChatReply(msg, client);
			break;
		case SocketMsgType.GameStart:
			handleGameStartReply(msg, client);
			break;
		case SocketMsgType.GameInit:
			handleGameInit(msg, client);
			break;
		case SocketMsgType.GameInitFinished:
			handleGameInitFinished(msg, client);
			break;
		case SocketMsgType.GameInitAborted:
			handleGameInitAborted(msg, client);
			break;
		case SocketMsgType.GameData:
			handleGameData(msg, client);
			break;
		case SocketMsgType.GameLog:
			handleGameLog(msg, client);
			break;
		case SocketMsgType.GainMoney:
			handleGainMoney(msg, client);
			break;
		case SocketMsgType.CostMoney:
			handleCostMoney(msg, client);
			break;
		case SocketMsgType.RemainingTime:
			handleRemainingTime(msg, client);
			break;
		case SocketMsgType.RoundTimeOut:
			handleRoundTimeOut(msg, client);
			break;
		case SocketMsgType.CurrentEventName:
			handleCurrentEventName(msg, client);
			break;
		case SocketMsgType.RoundTurn:
			handleRoundTurn(msg, client);
			break;
		case SocketMsgType.RollDiceStart:
			handleRollDiceAnimationPlay(msg, client);
			break;
		case SocketMsgType.RollDiceResult:
			handleRollDiceResult(msg, client);
			break;
		case SocketMsgType.UseChanceCard:
			handleUsedChanceCard(msg, client);
			break;
		case SocketMsgType.PlayerWalk:
			handlePlayerWalk(msg, client);
			break;
		case SocketMsgType.PlayerTp:
			handlePlayerTp(msg, client);
			break;
		case SocketMsgType.MapPathChoiceRequest:
			handleMapPathChoiceRequest(msg, client);
			break;
		case SocketMsgType.GameOver:
			handleGameOver(msg, client);
			break;
		case SocketMsgType.PauseGame:
			handleGamePause(msg, client);
			break;
		case SocketMsgType.ResumeGame:
			handleGameResume(msg, client);
			break;
		case SocketMsgType.ConfirmDialog:
			handleConfirmDialog(msg, client);
			break;
		case SocketMsgType.FormDialog:
			handleFormDialog(msg, client);
			break;
		case SocketMsgType.TargetSelectDialog:
			handleTargetSelect(msg, client);
			break;
		case SocketMsgType.ItemSelectDialog:
			handleItemSelectDialog(msg, client);
			break;
		case SocketMsgType.MessageCard:
			handleMessageCardDialog(msg, client);
			break;
		case SocketMsgType.LoadingControl:
			handleLoadingControl(msg, client);
			break;
		case SocketMsgType.ButtonRegister:
			handleButtonRegister(msg, client);
			break;
		case SocketMsgType.ButtonStateChanged:
			handleButtonStateChanged(msg, client);
			break;
		case SocketMsgType.ButtonRemove:
			handleButtonRemove(msg, client);
			break;
		case SocketMsgType.SafeModePanel:
			handleSafeModePanel(msg, client);
			break;
		case SocketMsgType.MapChunkStart:
			handleMapChunkStart(msg, client);
			break;
		case SocketMsgType.MapChunk:
			handleMapChunk(msg, client);
			break;
		case SocketMsgType.MapChunkEnd:
			handleMapChunkEnd(msg, client);
			break;
		case SocketMsgType.MapChunkAbort:
			handleMapChunkAbort(msg, client);
			break;
		case SocketMsgType.MapEventChanged:
			handleMapEventChanged(msg, client);
			break;
		default:
			break;
	}
}

const handleHeartReply: ServerMessageHandler<SocketMsgType.Heart> = (msg, client) => {
	client.handleHeartReply();
};

const handleUserListReply: ServerMessageHandler<SocketMsgType.UserList> = (msg) => {
	const userListStore = useUserList();
	userListStore.userList = msg.data;
};

const handleRoomListReply: ServerMessageHandler<SocketMsgType.RoomList> = (msg) => {
	const roomListStore = useRoomList();
	roomListStore.roomList = msg.data;
};

const handleJoinRoomReply: ServerMessageHandler<SocketMsgType.JoinRoom> = (msg) => {
	const roomId = msg.data.roomId;
	console.log("🚀 ~ handleJoinRoomReply ~ roomId:", roomId);
	if (roomId) {
		useRoomInfo().roomId = roomId;
		router.replace({ name: "room" });
	}
};

const handleLeaveRoomReply: ServerMessageHandler<SocketMsgType.LeaveRoom> = (msg, client) => {
	clearReceiveState();
	const notification = msg.msg || { type: "success" as const, content: "退出房间" };
	useRoomInfo().$reset();
	useChat().$reset();
	useGameLog().$reset();
	useGameData().$reset();
	client.destory();
	void router.replace({ name: "room-router" }).finally(() => {
		FPMessage({ type: notification.type, message: notification.content });
	});
};

const handleKickOutReply: ServerMessageHandler<SocketMsgType.KickOut> = (msg, client) => {
	clearReceiveState();
	useRoomInfo().$reset();
	useChat().$reset();
	useGameLog().$reset();
	useGameData().$reset();
	client.destory();
	void router.replace({ name: "room-router" }).finally(() => {
		FPMessage({ type: "error", message: "你已被踢出房间" });
	});
};

const handleRoomInfoReply: ServerMessageHandler<SocketMsgType.RoomInfo> = (msg) => {
	const roomInfoData = msg.data;
	const roomInfoStore = useRoomInfo();
	roomInfoData && roomInfoStore.$patch(roomInfoData);
};

const handleChangeMap: ServerMessageHandler<SocketMsgType.ChangeMap> = async (msg, client) => {
	await handleChangeMapInternal(msg, client);
};

const handleChangeMapInternal: ServerMessageHandler<SocketMsgType.ChangeMap> = async (msg, client) => {
	try {
		const data = msg.data;
		let gameMap, mapInfo;
		switch (data.from) {
			case "server": {
				const res = await loadGameMapFromServer(data.data);
				gameMap = res.gameMap;
				mapInfo = res.mapInfo;
				break;
			}
			case "custom": {
				// 兼容新版二进制直传与旧版 base64 字符串
				const raw = data.data;
				const arrayBuffer =
					raw instanceof Uint8Array
						? (raw.slice().buffer as ArrayBuffer)
						: base64ToArrayBuffer(raw);
				const res = await loadGameMapFromFile(arrayBuffer);
				gameMap = res.gameMap;
				mapInfo = res.mapInfo;
				break;
			}
		}

		//版本校验
		const editorVersion = gameMap.info?.editorVersion;
		if (!editorVersion) {
			throw Error("地图数据缺少版本信息");
		}
		const mapVersion = editorVersion.split(".").slice(0, 2).join("."); //获取前两位版本号
		const clientVersion = __COMPATIBLE_VERSION__;
		if (mapVersion !== clientVersion) {
			throw Error(`版本不匹配！地图编辑器版本: ${mapVersion}, 客户端版本: ${clientVersion}`);
		}

		const tempRoleList: RoleInRoom[] = [];
		const roles = gameMap.roles;
		const resourceStore = useResourceStore();
		for (const role of roles) {
			const imageResource = resourceStore.getRecourceById(role.imageId);
			if (!imageResource) {
				useLoading().hideLoading();
				FPMessage({ type: "error", message: "获取角色资源错误" });
				throw Error("获取角色资源错误");
			}
			tempRoleList.push({ ...role, imageUrl: imageResource.url });
		}
		useRoomInfo().roleList = tempRoleList;
		useRoomInfo().gameSettingForm = gameMap.gameSettingForm;
		// 初始随机选择一个角色
		if (roles.length > 0 && !useRoomInfo().amISpectator) {
			useMonopolyClient().changeRole(roles[Math.floor(Math.random() * roles.length)].id);
		}
		// 如果自己是房主,提交默认游戏设置(房间类里不解析游戏数据, 只能靠房主来传)
		if (useRoomInfo().amIRoomOwner) {
			client.randomizeAIRoles();
			const setting: GameSetting = {};
			gameMap.gameSettingForm.forEach((formSchema) => {
				setting[formSchema.key] = {
					label: formSchema.label,
					value: formSchema.defaultValue,
					displayValue: getDisplayValueByFormSchema(formSchema, formSchema.defaultValue),
				};
			});
			client.changeGameSetting(setting);
		}
		FPMessage({ type: "info", message: `地图加载成功: ${mapInfo.name} v${mapInfo.version}` });
		useRoomInfo().mapInfo = mapInfo;
		useRoomInfo().mapId = mapInfo.id;
		//地图加载完毕后发送信号
		client.sendMsg({
			type: SocketMsgType.Operation,
			source: SocketMsgSource.Client,
			data: { operateType: OperateType.MapResourceLoaded, data: undefined },
		});
		useLoading().hideLoading();
	} catch (e: any) {
		logErrorWithOptions({
			category: ErrorCategory.GAME_RUNTIME,
			message: `地图加载失败: ${e.message}`,
			error: e instanceof Error ? e : undefined,
			extraInfo: { mapData: msg.data },
		});
		FPMessageBox({
			title: "地图加载失败",
			content: `地图数据加载过程中发生错误，请通知房主重新选择地图。\n\n错误详情: ${e.message}`,
			confirmText: "确定",
			showCancel: false,
		}).catch(() => {});
		useLoading().hideLoading();
	} finally {
		client.resumeHeartBeat();
	}
};

const handleRoomChatReply: ServerMessageHandler<SocketMsgType.RoomChat> = (msg) => {
	useChat().addNewMessage(msg.data);
};

const handleGameStartReply: ServerMessageHandler<SocketMsgType.GameStart> = () => {
	useLoading().$patch({
		loading: true,
		text: "正在进入游戏...",
	});
};

const handleGameInit: ServerMessageHandler<SocketMsgType.GameInit> = (msg, client) => {
	client.registerGameInitSession(msg.extra?.initSessionId);
	const gameDataStore = useGameData();
	const gameData = msg.data;
	if (gameData) {
		gameDataStore.$patch((state) => {
			state.exportData = gameData.exportData;
			state.currentPlayerIdInRound = gameData.currentPlayerIdInRound;
			state.currentRound = gameData.currentRound;
			state.currentMultiplier = gameData.currentMultiplier;
			state.players = gameData.players;
			state.properties = gameData.properties;
			state.isGameOver = false;
			state.rankedPlayerIds = [];
		});

		// 重置状态管理器，然后设置破产状态
		const utilStore = useUtil();
		utilStore.resetTurnState();
		const me = gameData.players.find((p) => p.id === useUserInfo().userId);
		utilStore.setBankrupted(me?.isBankrupted ?? false);

		// 同步回合状态
		const isMyTurn = Boolean(me) && gameData.currentPlayerIdInRound === useUserInfo().userId;
		utilStore.changeTurn(isMyTurn);
	}
	const loadingStore = useLoading();
	loadingStore.text = "获取数据成功，加载中...";
	const isAlreadyInGame = router.currentRoute.value.name === "game";
	router.replace({ name: "game" });
	if (isAlreadyInGame) useEventBus().emit("game:init", msg.extra?.initSessionId);
};

const handleGameInitAborted: ServerMessageHandler<SocketMsgType.GameInitAborted> = (msg) => {
	useLoading().hideLoading();
	const message = msg.data.reason || "游戏初始化失败，已返回房间";
	void router.replace({ name: "room" }).finally(() => {
		FPMessage({ type: "error", message });
	});
};

const handleGameInitFinished: ServerMessageHandler<SocketMsgType.GameInitFinished> = () => {
	useLoading().hideLoading();
	// 触发游戏初始化完成事件，用于同步动态按钮
	const eventBus = useEventBus();
	eventBus.emit('game:init-finished');
};

const handleGainMoney: ServerMessageHandler<SocketMsgType.GainMoney> = (msg) => {
	if (!msg.data) return;
	const { player, money, source } = msg.data;
	useEventBus().emit(GameEventType.GainMoney + player.id, player, money, source);
};

const handleCostMoney: ServerMessageHandler<SocketMsgType.CostMoney> = (msg) => {
	if (!msg.data) return;
	const { player, money, target } = msg.data;
	useEventBus().emit(GameEventType.CostMoney + player.id, player, money, target);
};

const handleGameData: ServerMessageHandler<SocketMsgType.GameData> = (msg) => {
	const gameDataStore = useGameData();
	const gameData = msg.data;

	if (gameData) {
		gameDataStore.updateGameData(gameData);

		// MapPath V2 会通过 GameData 回传 pendingChoice 的清除状态，供所有客户端关闭等待面板。
		if (gameData.mapPathRuntimeState) {
			const pendingChoice = gameData.mapPathRuntimeState.pendingChoice;
			if (pendingChoice) {
				gameDataStore.setMapPathChoiceRequest(pendingChoice);
			} else {
				gameDataStore.clearMapPathChoiceRequest();
			}
		}

		const me = gameData.players.find((p) => p.id === useUserInfo().userId);
		const utilStore = useUtil();
		utilStore.setBankrupted(me?.isBankrupted ?? false);

		// 同步回合状态
		const isMyTurn = Boolean(me) && gameData.currentPlayerIdInRound === useUserInfo().userId;
		utilStore.changeTurn(isMyTurn);
	}
};

const handleGameLog: ServerMessageHandler<SocketMsgType.GameLog> = (msg) => {
	useGameLog().addNewLog(msg.data);
};

/**
 * 处理倒计时剩余时间
 */
const handleRemainingTime: ServerMessageHandler<SocketMsgType.RemainingTime> = (msg) => {
	if (!msg.data) return;
	const { remainingTime, totalTime } = msg.data;
	const utilStore = useUtil();

	utilStore.waitingFor = { remainingTime, totalTime };
	utilStore.showCountdown = remainingTime > 0; // 服务端控制是否显示倒计时

	// 当有新的倒计时开始时，复位超时状态
	if (remainingTime > 0) {
		utilStore.timeOut = false;
	}
};

/**
 * 处理回合超时事件
 */
const handleRoundTimeOut: ServerMessageHandler<SocketMsgType.RoundTimeOut> = (msg) => {
	if (!msg.data) return;
	const { playerId } = msg.data;
	const utilStore = useUtil();
	const currentUserId = useUserInfo().userId;

	// 只有当前玩家的超时才触发
	if (playerId === currentUserId) {
		utilStore.timeOut = true;
		utilStore.timeout();
		utilStore.showCountdown = false; // 超时后不显示倒计时
		// 将剩余时间设置为 0，确保 UI 正确更新
		utilStore.waitingFor = { ...utilStore.waitingFor, remainingTime: 0 };
		useEventBus().emit(GameEventType.TimeOut);
	}
};

/**
 * 处理当前事件名称
 */
const handleCurrentEventName: ServerMessageHandler<SocketMsgType.CurrentEventName> = (msg) => {
	if (!msg.data) return;
	const { eventName, showCountdown = false } = msg.data;
	const utilStore = useUtil();
	utilStore.currentEventName = eventName;
	// 服务端控制是否显示倒计时
	if (showCountdown !== undefined) {
		utilStore.showCountdown = showCountdown;
	}
};

const handleRoundTurn: ServerMessageHandler<SocketMsgType.RoundTurn> = (msg) => {
	if (!msg.data) return;
	const currentRoundPlayerId = msg.data;
	const utilStore = useUtil();
	const isMyTurn = currentRoundPlayerId === useUserInfo().userId;

	// 使用 store 的 action 处理回合切换
	utilStore.changeTurn(isMyTurn);

	if (isMyTurn) {
		// 只在是自己的回合时显示提示
		FPMessage({
			type: "info",
			message: "现在是你的回合啦！",
		});
	}

	useEventBus().emit("round-turn");
};

const handleRollDiceAnimationPlay: ServerMessageHandler<SocketMsgType.RollDiceStart> = () => {
	const utilStore = useUtil();
	utilStore.startAnimation();
	utilStore.isRollDiceAnimationPlay = true;
};

const handleRollDiceResult: ServerMessageHandler<SocketMsgType.RollDiceResult> = (msg) => {
	if (!msg.data) return;
	const res = msg.data;
	const utilStore = useUtil();
	useEventBus().emit("dice-roll", res.rollDiceResult);
	// utilStore.rollDiceResult = res.rollDiceResult;
	utilStore.isRollDiceAnimationPlay = false;
	// 动画结束后恢复状态
	utilStore.endAnimation();
};

const handleUsedChanceCard: ServerMessageHandler<SocketMsgType.UseChanceCard> = (msg) => {
	if (!msg.data) return;
	const { error, animationId, chanceCard, sourcePlayerId, targetIdList } = msg.data;
	const utilStore = useUtil();
	if (error) {
		// 使用失败，恢复状态
		utilStore.cancelAnimation();
		return;
	}

	// 使用成功，保持动画状态（客户端已经调用过 startAnimation）
	// 如果有动画信息，触发机会卡使用事件
	if (animationId && chanceCard && sourcePlayerId && targetIdList) {
		useEventBus().emit("chance-card-use", {
			animationId,
			chanceCard,
			sourcePlayerId,
			targetIdList,
		});
	}
};

const handlePlayerWalk: ServerMessageHandler<SocketMsgType.PlayerWalk> = (msg) => {
	if (!msg.data) return;
	const { playerId, step, walkId, totalSteps, startStep, segment } = msg.data;
	useEventBus().emit("player-walk", playerId, step, walkId, totalSteps, startStep, segment);
};

const handlePlayerTp: ServerMessageHandler<SocketMsgType.PlayerTp> = (msg) => {
	if (!msg.data) return;
	const { playerId, positionIndex, walkId, mapItemId } = msg.data;
	useEventBus().emit("player-tp", playerId, positionIndex, walkId, mapItemId);
};

const handleMapPathChoiceRequest: ServerMessageHandler<SocketMsgType.MapPathChoiceRequest> = (msg) => {
	const request = msg.data;
	if (!request) return;

	// 所有客户端保留当前请求，以便观战者和其他玩家显示等待状态。
	useGameData().setMapPathChoiceRequest(request);
};

const handleGameOver: ServerMessageHandler<SocketMsgType.GameOver> = (msg) => {
	// 游戏结束时清理暂停状态，防止下一局沿用不可关闭的暂停弹窗。
	useUtil().gamePaused = false;
	if (msg.msg) useLoading().hideLoading();
	const gameInfoStore = useGameData();
	if (msg.data?.returnToRoom) {
		useRoomInfo().$patch({ isStarted: false });
		useChat().$reset();
		useGameLog().$reset();
		gameInfoStore.$reset();
		void router.replace({ name: "room" }).finally(() => {
			if (msg.msg) FPMessage({ type: msg.msg.type, message: msg.msg.content });
		});
		return;
	}
	gameInfoStore.isGameOver = true;
	if (msg.msg) FPMessage({ type: msg.msg.type, message: msg.msg.content });
};

const handleGamePause: ServerMessageHandler<SocketMsgType.PauseGame> = (msg, client) => {
	// 只更新状态：暂停弹窗由 game.vue 的 fp-dialog 统一呈现，避免重复 toast
	const utilStore = useUtil();
	utilStore.gamePaused = true;
};

const handleGameResume: ServerMessageHandler<SocketMsgType.ResumeGame> = () => {
	const utilStore = useUtil();
	utilStore.gamePaused = false;
};

const handleConfirmDialog: ServerMessageHandler<SocketMsgType.ConfirmDialog> = (msg, client) => {
	const data = msg.data;
	FPMessageBox(data.option)
		.then(() => {
			client.sendMsg({
				type: SocketMsgType.Operation,
				source: SocketMsgSource.Client,
				data: {
					operateType: OperateType.ConfirmDialogResult,
					data: { id: data.playerId, confirm: true },
				},
			});
		})
		.catch(() => {
			client.sendMsg({
				type: SocketMsgType.Operation,
				source: SocketMsgSource.Client,
				data: {
					operateType: OperateType.ConfirmDialogResult,
					data: { id: data.playerId, confirm: false },
				},
			});
		});
};

const handleFormDialog: ServerMessageHandler<SocketMsgType.FormDialog> = (msg, client) => {
	const data = msg.data;

	// 将 FormDialogOption 转换为 FormSchema 格式
	const formSchema: FormSchema[] = data.option.fields.map((field) => ({
		id: crypto.randomUUID(),
		key: field.key,
		type: typeof field.defaultValue === "number" ? "number-input" : "select",
		label: field.label,
		defaultValue: field.defaultValue,
		min: field.min,
		max: field.max,
	}));

	// 显示表单对话框，同时显示 content 和表单
	FPMessageBox({
		title: data.option.title,
		content: data.option.content,
		form: formSchema,
		confirmText: data.option.confirmText || "提交",
		cancelText: data.option.cancelText || "取消",
	})
		.then((formData) => {
			// 用户提交，formData 包含表单数据
			client.sendMsg({
				type: SocketMsgType.Operation,
				source: SocketMsgSource.Client,
				data: {
					operateType: OperateType.FormDialogResult,
					data: {
						id: data.playerId,
						submitted: true,
						...formData,
					},
				},
			});
		})
		.catch(() => {
			// 用户取消，发送默认值
			const defaultData = buildDefaultFormData(data.option.fields);

			client.sendMsg({
				type: SocketMsgType.Operation,
				source: SocketMsgSource.Client,
				data: {
					operateType: OperateType.FormDialogResult,
					data: {
						id: data.playerId,
						submitted: false,
						...defaultData,
					},
				},
			});
		});
};

const handleTargetSelect: ServerMessageHandler<SocketMsgType.TargetSelectDialog> = (msg, client) => {
	const data = msg.data;
	showTargetSelector(data.option.type)
		.then((res) => {
			client.sendMsg({
				type: SocketMsgType.Operation,
				source: SocketMsgSource.Client,
				data: {
					operateType: OperateType.TargetSelectDialogResult,
					data: { target: res },
				},
			});
		})
		.catch(() => {
			client.sendMsg({
				type: SocketMsgType.Operation,
				source: SocketMsgSource.Client,
				data: {
					operateType: OperateType.TargetSelectDialogResult,
					data: { target: [] },
				},
			});
		});
};

const handleItemSelectDialog: ServerMessageHandler<SocketMsgType.ItemSelectDialog> = (msg, client) => {
	const data = msg.data;
	showItemSelector(data.option)
		.then((res) => {
			client.sendMsg({
				type: SocketMsgType.Operation,
				source: SocketMsgSource.Client,
				data: {
					operateType: OperateType.ItemSelectDialogResult,
					data: { selected: res },
				},
			});
		})
		.catch(() => {
			client.sendMsg({
				type: SocketMsgType.Operation,
				source: SocketMsgSource.Client,
				data: {
					operateType: OperateType.ItemSelectDialogResult,
					data: { selected: [] },
				},
			});
		});
};

const handleMessageCardDialog: ServerMessageHandler<SocketMsgType.MessageCard> = (msg, client) => {
	const data = msg.data;
	FPMessageCard(data.option);
};

const handleLoadingControl: ServerMessageHandler<SocketMsgType.LoadingControl> = (msg, client) => {
	const { show, text } = msg.data;
	if (show) {
		useLoading().showLoading(text || "加载中...");
		client.sendLoadingStarted();
		client.pauseHeartBeat();
	} else {
		client.resumeHeartBeat();
		useLoading().hideLoading();
	}
};

// 动态按钮相关处理器
import { ButtonRegisterMessage, ButtonStateChangedMessage, ButtonRemoveMessage } from "@mine-monopoly/types";

const handleButtonRegister: ServerMessageHandler<SocketMsgType.ButtonRegister> = (msg, client) => {
	const eventBus = useEventBus();
	eventBus.emit('button:register', msg.data);
};

const handleButtonStateChanged: ServerMessageHandler<SocketMsgType.ButtonStateChanged> = (msg, client) => {
	const eventBus = useEventBus();
	eventBus.emit('button:state-changed', msg.data);
};

const handleButtonRemove: ServerMessageHandler<SocketMsgType.ButtonRemove> = (msg, client) => {
	const eventBus = useEventBus();
	eventBus.emit('button:remove', msg.data);
};

const handleSafeModePanel: ServerMessageHandler<SocketMsgType.SafeModePanel> = (msg, client) => {
	const eventBus = useEventBus();
	useLoading().hideLoading();
	eventBus.emit('safe-mode:show', msg.data);
};

const handleMapEventChanged: ServerMessageHandler<SocketMsgType.MapEventChanged> = (msg) => {
	const data = msg.data as MapEventChangedData;
	const mapDataStore = useMapData();
	const eventBus = useEventBus();

	switch (data.action) {
		case "add": {
			if (data.mapEvent) {
				// 添加到 store
				const existing = mapDataStore.mapEvents.findIndex((e) => e.id === data.mapEvent!.id);
				if (existing === -1) {
					mapDataStore.mapEvents.push(data.mapEvent);
				}
				eventBus.emit("map-event-changed", data);
			}
			break;
		}
		case "remove": {
			if (data.mapEventId) {
				const idx = mapDataStore.mapEvents.findIndex((e) => e.id === data.mapEventId);
				if (idx !== -1) {
					mapDataStore.mapEvents.splice(idx, 1);
				}
				// 清理所有引用此事件的地块
				for (const mapItem of mapDataStore.mapItems) {
					if (mapItem.mapEventId === data.mapEventId) {
						mapItem.mapEventId = undefined;
					}
				}
				eventBus.emit("map-event-changed", data);
			}
			break;
		}
		case "link": {
			if (data.mapItemId && data.mapEventId && data.mapEvent) {
				// 确保事件已存在于 store（可能 link 先于 add 到达）
				const eventIdx = mapDataStore.mapEvents.findIndex((e) => e.id === data.mapEventId);
				if (eventIdx === -1) {
					mapDataStore.mapEvents.push(data.mapEvent);
				}
				const mapItem = mapDataStore.mapItems.find((m) => m.id === data.mapItemId);
				if (mapItem) {
					mapItem.mapEventId = data.mapEventId;
				}
				eventBus.emit("map-event-changed", data);
			}
			break;
		}
		case "unlink": {
			if (data.mapItemId) {
				const mapItem = mapDataStore.mapItems.find((m) => m.id === data.mapItemId);
				if (mapItem) {
					mapItem.mapEventId = undefined;
				}
				eventBus.emit("map-event-changed", data);
			}
			break;
		}
	}
};

function buildDefaultFormData(fields: FormField<string, any>[]): Record<string, any> {
	const result: Record<string, any> = {};
	for (const field of fields) {
		result[field.key] = field.defaultValue;
	}
	return result;
}

const handleMapChunkStart: ServerMessageHandler<SocketMsgType.MapChunkStart> = (msg) => {
	const data = msg.data;
	clearReceiveState();
	receiveState = {
		totalChunks: data.totalChunks,
		totalBytes: data.totalBytes ?? 0,
		receivedBytes: 0,
		receivedChunks: new Map(),
		transferTimeoutId: window.setTimeout(() => {
			handleTransferTimeout("传输超时");
		}, calcTransferTimeout(data.totalChunks, data.transferTimeout)),
		chunkTimeoutId: null,
		lastProgressBucket: -1,
	};
	useLoading().showLoading(
		data.totalBytes ? `地图加载中... 0 B / ${formatBytes(data.totalBytes)}` : "地图加载中...",
		0,
	);
	console.log(`[MapTransfer] Started receiving ${data.totalChunks} chunks (${formatBytes(data.totalBytes ?? 0)})`);
};

const handleMapChunk: ServerMessageHandler<SocketMsgType.MapChunk> = (msg) => {
	const data = msg.data;
	if (!receiveState) {
		console.warn("[MapTransfer] Received chunk without start state");
		return;
	}
	// 兼容旧版 base64 字符串分块与新版二进制分块
	const chunkBytes =
		typeof data.data === "string" ? new TextEncoder().encode(data.data) : data.data;
	receiveState.receivedChunks.set(data.chunkIndex, chunkBytes);
	receiveState.receivedBytes += chunkBytes.byteLength;
	const received = receiveState.receivedChunks.size;
	const progress = (received / receiveState.totalChunks) * 100;
	// 进度降频：按 5% 桶更新 UI，避免每块都触发响应式更新
	const bucket = Math.floor(progress / 5);
	if (bucket !== receiveState.lastProgressBucket) {
		receiveState.lastProgressBucket = bucket;
		useLoading().updateProgress(progress);
		// 显示已加载/总大小信息（旧版主机未下发 totalBytes 时回退为纯文本）
		useLoading().showLoading(
			receiveState.totalBytes
				? `地图加载中... ${formatBytes(receiveState.receivedBytes)} / ${formatBytes(receiveState.totalBytes)} (${progress.toFixed(0)}%)`
				: "地图加载中...",
			progress,
		);
	}
	// DataChannel 可靠有序投递，无需逐块 ACK（避免慢网络下的重传风暴）
	resetChunkTimeout();
};

const handleMapChunkEnd: ServerMessageHandler<SocketMsgType.MapChunkEnd> = async (msg, client) => {
	if (!receiveState) {
		console.warn("[MapTransfer] Received end without start state");
		return;
	}
	const state = receiveState;
	clearReceiveState();
	try {
		const sortedChunks = Array.from({ length: state.totalChunks }, (_, i) =>
			state.receivedChunks.get(i),
		);
		if (sortedChunks.some((chunk) => chunk === undefined)) {
			throw new Error("缺少数据分块");
		}
		// 按原始字节拼接，直接还原 .mmmap 文件内容，省去 base64 解码
		let totalLength = 0;
		for (const chunk of sortedChunks) totalLength += (chunk as Uint8Array).byteLength;
		const fullData = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of sortedChunks) {
			const bytes = chunk as Uint8Array;
			fullData.set(bytes, offset);
			offset += bytes.byteLength;
		}
		// 分块传输仅用于自定义地图
		const mapInfo: RoomMapInfo = { from: "custom", data: fullData };
		await handleChangeMapInternal({ type: SocketMsgType.ChangeMap, source: SocketMsgSource.Server, data: mapInfo } as SocketMessage<SocketMsgType.ChangeMap, SocketMsgSource.Server>, client);
	} catch (e: any) {
		logErrorWithOptions({
			category: ErrorCategory.GAME_RUNTIME,
			message: `地图组装失败: ${e.message}`,
			error: e instanceof Error ? e : undefined,
		});
		FPMessage({ type: "error", message: `地图加载失败: ${e.message}` });
		void client.sendMsg({ type: SocketMsgType.Operation, source: SocketMsgSource.Client, data: { operateType: OperateType.MapResourceLoaded, data: undefined }, extra: { initStatus: "failed", reason: e.message } });
		useLoading().hideLoading();
		client.resumeHeartBeat();
	}
};

const handleMapChunkAbort: ServerMessageHandler<SocketMsgType.MapChunkAbort> = (msg) => {
	clearReceiveState();
	useLoading().hideLoading();
	FPMessage({ type: "warning", message: `地图传输已中止: ${msg.data.reason || "未知原因"}` });
	const client = useMonopolyClient();
	client.resumeHeartBeat();
};

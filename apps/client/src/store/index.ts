import { defineStore } from "pinia";
import {
	AIDecisionConfig,
	ChatMessage,
	FormSchema,
	GameLog,
	GameMapInDb,
	GameOverRule,
	GameSetting,
	RoleInRoom,
	Room,
	User,
	UserInRoomInfo,
} from "@mine-monopoly/types";
import { isFullScreen, isLandscape, setTimeOutAsync } from "@src/utils";
import { getUserByToken } from "@src/utils/api/user";
import { getPlatformType } from "@src/utils/platform";
import { normalizeAIDecisionConfig } from "@src/core/ai/ai-decision-config";
import { useGameData } from "./game";
import { useLocalParty } from "./local-party";

/**
 * 回合状态枚举
 */
enum TurnState {
	WAITING_TURN = "waiting_turn",      // 等待回合
	MY_TURN = "my_turn",                // 我的回合（可操作）
	ANIMATING = "animating",            // 动画中（不可操作）
	TIMEOUT = "timeout",                // 超时（不可操作）
	BANKRUPTED = "bankrupted"           // 已破产（不可操作）
}

export const useLoading = defineStore("loading", {
	state: () => {
		return {
			loading: false,
			text: "",
			progress: 0, // 新增：进度百分比 0-100
		};
	},
	actions: {
		showLoading(text: string, progress: number = 0) {
			this.text = text;
			this.loading = true;
			this.progress = progress;
		},
		hideLoading() {
			this.loading = false;
			this.progress = 0;
		},
		updateProgress(progress: number) {
			this.progress = Math.max(0, Math.min(100, progress));
		},
	},
});

export const useUserInfo = defineStore("userInfo", {
	state: () => {
		return {
			userId: "",
			useraccount: "",
			username: "",
			avatar: "",
			color: "",
		};
	},
	actions: {
		hasUserInfo() {
			return Boolean(this.userId);
		},
	},
});

export const useUserList = defineStore("userList", {
	state: () => {
		return {
			userList: new Array<User>(),
		};
	},
});

export const useRoomList = defineStore("roomList", {
	state: () => {
		return {
			roomList: new Array<Room>(),
		};
	},
});

export const useRoomInfo = defineStore("roomInfo", {
	state: () => {
		return {
			mapId: "",
			mapInfo: null as GameMapInDb | null,
			roomId: "",
			isStarted: false,
			ownerId: "",
			ownerName: "",
			userList: new Array<UserInRoomInfo>(),
			roleList: new Array<RoleInRoom>(),
			gameSettingForm: new Array<FormSchema>(),
			gameSetting: {} as GameSetting,
		};
	},
	actions: {},
	getters: {
		amIRoomOwner: (state) => useLocalParty().isActive ? state.ownerId === useLocalParty().players[0]?.userId : useUserInfo().userId === state.ownerId,
		isReady: (state) => state.userList.find((user) => user.userId === (useLocalParty().isActive ? useLocalParty().players[0]?.userId : useUserInfo().userId))?.isReady ?? false,
		amISpectator: (state) => useLocalParty().isActive ? false : Boolean(state.userList.find((user) => user.userId === useUserInfo().userId)?.isSpectator),
	},
});

export const useUtil = defineStore("util", {
	state: () => {
		return {
			ping: 0,
			fps: 0,
			/** 连接模式：unknown=未确定, p2p=直连, relay=TURN中继 */
			connectionMode: "unknown" as "unknown" | "p2p" | "relay" | "local",
			/** 当前连接策略：auto=优先直连, relay=强制中继 */
			connectionPolicy: "auto" as "auto" | "relay",
			/** 面向用户的连接状态说明 */
			connectionStatusText: "等待连接" as string,
			/** 最近一次连接异常原因 */
			connectionStatusReason: "" as string,
			/** 当前重连尝试次数 */
			connectionReconnectAttempt: 0,
			isRollDiceAnimationPlay: false,
			rollDiceResult: new Array<number>(),
			currentEventName: "",
			waitingFor: { remainingTime: 0, totalTime: 0 },
			showCountdown: false,
			timeOut: false,
			// 回合状态（直接在 store 中管理）
			currentTurnState: TurnState.WAITING_TURN,
			isMyTurn: false,
			isBankrupted: false,
			// 记录动画开始前的状态，用于失败时恢复
			stateBeforeAnimation: TurnState.WAITING_TURN,
			/** 游戏是否处于暂停状态（房主切后台或任何玩家手动暂停） */
			gamePaused: false,
		};
	},
	getters: {
		canRoll: (state) => {
			return state.currentTurnState === TurnState.MY_TURN;
		},
		canUseCard: (state) => {
			return state.currentTurnState === TurnState.MY_TURN;
		},
	},
	actions: {
		// 切换回合
		changeTurn(isMyTurn: boolean) {
			this.isMyTurn = isMyTurn;

			if (this.isBankrupted) {
				this.currentTurnState = TurnState.BANKRUPTED;
				return;
			}

			if (isMyTurn) {
				this.currentTurnState = TurnState.MY_TURN;
			} else {
				this.currentTurnState = TurnState.WAITING_TURN;
			}
		},

		// 设置破产状态
		setBankrupted(isBankrupted: boolean) {
			this.isBankrupted = isBankrupted;

			if (isBankrupted) {
				this.currentTurnState = TurnState.BANKRUPTED;
			} else {
				// 根据是否我的回合决定状态
				this.changeTurn(this.isMyTurn);
			}
		},

		// 开始动画
		startAnimation() {
			if (this.currentTurnState === TurnState.ANIMATING) return;
			// 保存动画前的状态
			this.stateBeforeAnimation = this.currentTurnState;
			this.currentTurnState = TurnState.ANIMATING;
		},

		// 结束动画（成功情况：等待服务器更新状态）
		endAnimation() {
			// 动画成功结束，不自动恢复状态
			// 等待服务器的 RoundTurn、GameData 等消息来更新状态
		},

		// 取消动画（失败情况：恢复到动画前的状态）
		cancelAnimation() {
			if (this.currentTurnState !== TurnState.ANIMATING) return;
			this.currentTurnState = this.stateBeforeAnimation;
		},

		// 超时
		timeout() {
			this.currentTurnState = TurnState.TIMEOUT;
		},

		// 重置状态
		resetTurnState() {
			this.currentTurnState = TurnState.WAITING_TURN;
			this.isMyTurn = false;
			this.isBankrupted = false;
		},
	},
});

export const useChat = defineStore("chat", {
	state: (): {
		visible: boolean;
		messageLimit: number;
		chatMessageQueue: Array<ChatMessage>;
		newMessage: ChatMessage | undefined;
		newMessageNum: number;
	} => {
		return {
			visible: false,
			messageLimit: 30,
			chatMessageQueue: new Array<ChatMessage>(),
			newMessage: undefined,
			newMessageNum: 0,
		};
	},
	actions: {
		addNewMessage(_newMessage: ChatMessage) {
			this.chatMessageQueue.push(_newMessage);
			this.newMessage = _newMessage;
			if (!this.visible) this.newMessageNum += 1;
			if (this.chatMessageQueue.length > this.messageLimit) {
				this.chatMessageQueue.shift();
			}
		},
		resetNewMessageNum() {
			this.newMessageNum = 0;
		},
	},
});

export const useGameLog = defineStore("gameLog", {
	state: (): {
		visible: boolean;
		logLimit: number;
		gameLogQueue: Array<GameLog>;
	} => {
		return {
			visible: false,
			logLimit: 30,
			gameLogQueue: new Array<GameLog>(),
		};
	},
	actions: {
		addNewLog(_newLog: GameLog) {
			this.gameLogQueue.push(_newLog);
			if (this.gameLogQueue.length > this.logLimit) {
				this.gameLogQueue.shift();
			}
		},
	},
});

export const useDeviceStatus = defineStore("deviceStatus", {
	state: () => {
		return {
			isFullScreen: false,
			isLandscape: false,
			isMobile: false,
			isFocus: false,
		};
	},
});

export const useSettig = defineStore("setting", {
	state: () => {
		return {
			autoMusic: true,
			musicVolume: 0.3,
			sfxVolume: 0.5,
			masterVolume: 1,
			masterMuted: false,
			sfxMuted: false,
			musicMuted: false,
			lockRole: true,
			enableTurnFocus: true,
			chatRenderMode: "bubble" as "danmaku" | "bubble",
			// 画面质量设置：低/中/高三档
			graphicQuality: "medium" as "low" | "medium" | "high",
			// 阴影开关
			enableShadow: false,
			enableModelAnimation: true,
			// 地图缓存最大容量（MB），默认 500MB
			mapCacheMaxSizeMB: 500,
			aiDecisionConfig: normalizeAIDecisionConfig(undefined) as AIDecisionConfig,
		};
	},
	actions: {
		// 初始化画质设置（从 localStorage 读取或自动检测）
		initGraphicQuality() {
			// 移动端 / Capacitor 强制低画质，关闭阴影
			const platform = getPlatformType();
			if (platform === "capacitor" || platform === "mobile") {
				this.graphicQuality = "low";
				this.enableShadow = false;
				this.enableModelAnimation = false;
				console.log("[画质设置] 移动端强制 low，关闭阴影和模型动画");
				return;
			}

			try {
				const saved = localStorage.getItem("graphicQuality");
				if (saved && (saved === "low" || saved === "medium" || saved === "high")) {
					this.graphicQuality = saved;
					console.log("[画质设置] 从 localStorage 读取画质设置:", saved);
				} else {
					// 自动检测：根据 CPU 核心数
					const cores = navigator.hardwareConcurrency || 4;
					this.graphicQuality = cores <= 4 ? "low" : "medium";
					console.log("[画质设置] 自动检测画质:", this.graphicQuality, "(CPU 核心数:", cores, ")");
				}
			} catch (e) {
				// localStorage 失败，回退到自动检测
				const cores = navigator.hardwareConcurrency || 4;
				this.graphicQuality = cores <= 4 ? "low" : "medium";
				console.warn("[画质设置] localStorage 读取失败，使用自动检测:", this.graphicQuality);
			}
		},
		// 获取实际像素比
		getPixelRatio(): number {
			const ratioMap = { low: 0.85, medium: 1.0, high: 2.0 };
			return window.devicePixelRatio * ratioMap[this.graphicQuality];
		},
		// 初始化地图缓存上限（从 localStorage 读取，默认 500MB，范围 100MB ~ 10GB）
		initMapCacheMaxSize() {
			try {
				const saved = Number(localStorage.getItem("mapCacheMaxSizeMB"));
				if (Number.isFinite(saved) && saved > 0) {
					this.mapCacheMaxSizeMB = Math.min(10240, Math.max(100, Math.round(saved)));
				} else {
					this.mapCacheMaxSizeMB = 500;
				}
			} catch (e) {
				console.warn("[设置] localStorage 读取缓存上限失败，使用默认 500MB:", e);
				this.mapCacheMaxSizeMB = 500;
			}
		},
	},
});

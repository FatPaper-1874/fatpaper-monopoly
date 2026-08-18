import { ChatMessageType, MonopolyWebSocketMsgType, SocketMsgSource, SocketMsgType } from "../../enums/game/base";
import { GameOverRule, TargetSelectType } from "../../enums/game/game";
import { OperateType } from "../../enums/game/game-process";
import { GameMapInDb } from "./db";
import { ButtonRegisterMessage, ButtonStateChangedMessage, ButtonRemoveMessage, DynamicButtonClickOperationResult } from "./button";
import {
	ConfirmDialogOption,
	FormDialogOption,
	FormField,
	FormDialogResult,
	GameData,
	GameSetting,
	ItemSelectDialogOption,
	ItemSelectDialogResult,
	MessageCardOption,
	PlayerInfo,
	PropertyInfo,
	TargetSelectDialogOption,
	TargetSelectDialogResult,
} from "./game-process";
import { Role, User, UserInRoomInfo } from "./item";
import { DiceResult } from "./util";

/**
 * WebSocket 消息类型
 * 用于 Monopoly 特定的 WebSocket 通信
 */
export type MonopolyWebSocketMsg = {
	/** 消息类型 */
	type: MonopolyWebSocketMsgType;

	/** 消息数据 */
	data: any;
};

/**
 * 音乐接口
 */
export interface Music {
	/** 音乐唯一标识 */
	id: string;

	/** 音乐名称 */
	name: string;

	/** 音乐 URL */
	url: string;
}

/** Base64 编码字符串类型 */
type Base64String = string;

/**
 * 房间地图信息类型
 * 可以从服务器获取或使用自定义数据
 */
export type RoomMapInfo =
	| { from: "server"; data: string }
	| { from: "custom"; data: Base64String | Uint8Array };

/**
 * Socket 消息接口
 * 定义客户端和服务器之间通信的消息格式
 * @template T - 消息类型
 * @template S - 消息来源（Client/Server）
 */
export interface SocketMessage<T extends SocketMsgType = SocketMsgType, S extends SocketMsgSource = SocketMsgSource> {
	/** 消息类型 */
	type: T;

	/** 消息来源 */
	source: S;

	/** 消息数据（根据类型和来源有不同的数据格式） */
	data: SocketMessageDataType[T][S];

	/** 消息提示（可选） */
	msg?: {
		/** 提示类型 */
		type: "info" | "success" | "warning" | "error";

		/** 提示内容 */
		content: string;
	};

	/** 额外数据（可选） */
	extra?: any;

	/** 房间 ID（可选） */
	roomId?: string;
}

/**
 * 客户端 Socket 消息类型
 */
export type ClientSocketMessage = {
	[K in SocketMsgType]: SocketMessage<K, SocketMsgSource.Client>;
}[SocketMsgType];

/**
 * 服务器 Socket 消息类型
 */
export type ServerSocketMessage = {
	[K in SocketMsgType]: SocketMessage<K, SocketMsgSource.Server>;
}[SocketMsgType];

/**
 * 操作消息类型
 * 用于客户端发送操作请求
 */
type OperationMessage = {
	[T in OperateType]: {
		/** 操作类型 */
		operateType: T;

		/** 操作数据 */
		data: PlayerOperationResult[T];
	};
}[OperateType];

/**
 * Socket 消息数据类型映射
 * 定义每种消息类型在不同来源下的数据格式
 */
export interface SocketMessageDataType {
	/**
	 * 心跳消息
	 * 用于保持连接活跃
	 */
	[SocketMsgType.Heart]: {
		/** 客户端发送的数据（无） */
		client: undefined;
		/** 服务器发送的数据（无） */
		server: undefined;
	};

	/**
	 * 消息通知
	 * 服务器向客户端发送消息提示
	 */
	[SocketMsgType.MsgNotify]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的数据（无） */
		server: undefined;
	};

	/**
	 * 游戏日志
	 * 服务器向客户端发送游戏日志
	 */
	[SocketMsgType.GameLog]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的游戏日志 */
		server: GameLog;
	};

	/**
	 * 用户列表
	 * 服务器向客户端发送用户列表
	 */
	[SocketMsgType.UserList]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的用户列表 */
		server: User[];
	};

	/**
	 * 房间列表
	 * 服务器向客户端发送房间列表
	 */
	[SocketMsgType.RoomList]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的房间列表 */
		server: Room[];
	};

	/**
	 * 加入房间
	 * 客户端请求加入房间
	 */
	[SocketMsgType.JoinRoom]: {
		/** 客户端发送的用户信息 */
		client: User;
		/** 服务器返回的房间 ID */
		server: { roomId: string };
	};

	/**
	 * 离开房间
	 * 客户端请求离开房间
	 */
	[SocketMsgType.LeaveRoom]: {
		/** 客户端发送的数据（无） */
		client: undefined;
		/** 服务器返回的数据（无） */
		server: undefined;
	};

	/**
	 * 房间信息
	 * 服务器向客户端发送房间信息
	 */
	[SocketMsgType.RoomInfo]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的房间信息 */
		server: RoomInfo;
	};

	/**
	 * 房间聊天
	 * 客户端和服务器之间的聊天消息
	 */
	[SocketMsgType.RoomChat]: {
		/** 客户端发送的聊天内容 */
		client: string;
		/** 服务器返回的完整聊天消息 */
		server: ChatMessage;
	};

	/**
	 * 准备状态切换
	 * 客户端切换准备状态
	 */
	[SocketMsgType.ReadyToggle]: {
		/** 客户端发送的数据（无） */
		client: undefined;
		/** 服务器返回的数据（无） */
		server: undefined;
	};

	/**
	 * 更改颜色
	 * 客户端请求更改颜色
	 */
	[SocketMsgType.ChangeColor]: {
		/** 客户端发送的颜色 */
		client: string;
		/** 服务器返回的数据（不支持） */
		server: never;
	};

	/**
	 * 踢出玩家
	 * 房主踢出玩家
	 */
	[SocketMsgType.KickOut]: {
		/** 客户端发送的被踢玩家 ID */
		client: string;
		/** 服务器返回的数据（不支持） */
		server: never;
	};

	/**
	 * 更改地图
	 * 房主更改游戏地图
	 */
	[SocketMsgType.ChangeMap]: {
		/** 客户端发送的地图信息 */
		client: RoomMapInfo;
		/** 服务器返回的地图信息 */
		server: RoomMapInfo;
	};

	/**
	 * 更改角色
	 * 客户端请求更改角色
	 */
	[SocketMsgType.ChangeRole]: {
		/** 客户端发送的角色 ID */
		client: string;
		/** 服务器返回的角色 ID */
		server: string;
	};

	/**
	 * 更改游戏设置
	 * 房主更改游戏设置
	 */
	[SocketMsgType.ChangeGameSetting]: {
		/** 客户端发送的游戏设置 */
		client: GameSetting;
		/** 服务器返回的数据（不支持） */
		server: never;
	};

	/**
	 * 游戏开始
	 * 房主开始游戏
	 */
	[SocketMsgType.GameStart]: {
		/** 客户端发送的数据（无） */
		client: undefined;
		/** 服务器返回的数据（无） */
		server: undefined;
	};

	/**
	 * 游戏初始化
	 * 服务器向客户端发送游戏初始化数据
	 */
	[SocketMsgType.GameInit]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的游戏数据 */
		server: GameData;
	};

	/**
	 * 游戏初始化完成
	 * 客户端通知服务器游戏初始化完成
	 */
	[SocketMsgType.GameInitFinished]: {
		/** 客户端发送的数据（无） */
		client: undefined;
		/** 服务器返回的数据（无） */
		server: undefined;
	};

	[SocketMsgType.GameInitAborted]: {
		client: never;
		server: { initSessionId: string; reason: string };
	};

	/**
	 * 游戏数据
	 * 服务器向客户端同步游戏数据
	 */
	[SocketMsgType.GameData]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的游戏数据 */
		server: GameData;
	};

	/**
	 * 获得金钱
	 * 服务器通知玩家获得金钱
	 */
	[SocketMsgType.GainMoney]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的金钱信息 */
		server: {
			/** 获得金钱的玩家 */
			player: PlayerInfo;
			/** 获得的金钱数量 */
			money: number;
			/** 金钱来源玩家（可选） */
			source: PlayerInfo | undefined;
		};
	};

	/**
	 * 花费金钱
	 * 服务器通知玩家花费金钱
	 */
	[SocketMsgType.CostMoney]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的金钱信息 */
		server: {
			/** 花费金钱的玩家 */
			player: PlayerInfo;
			/** 花费的金钱数量 */
			money: number;
			/** 收取金钱的目标玩家（可选） */
			target: PlayerInfo | undefined;
		};
	};

	/**
	 * 回合轮换
	 * 服务器通知所有客户端进入新回合,广播当前回合玩家 ID
	 */
	[SocketMsgType.RoundTurn]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器返回的当前回合玩家 ID */
		server: string;
	};

	/**
	 * 开始掷骰子
	 * 服务器通知客户端开始掷骰子动画
	 * @deprecated 未实现
	 */
	[SocketMsgType.RollDiceStart]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器返回的掷骰子玩家 ID */
		server: string;
	};

	/**
	 * 掷骰子结果
	 * 服务器向客户端发送掷骰子结果
	 */
	[SocketMsgType.RollDiceResult]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的掷骰子结果 */
		server: {
			/** 掷骰子结果 */
			rollDiceResult: DiceResult[];
			/** 掷骰子玩家 ID */
			rollDicePlayerId: string;
		};
	};

	/**
	 * 使用机会卡
	 * 客户端使用机会卡
	 */
	[SocketMsgType.UseChanceCard]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器返回的结果 */
		server: {
			/** 是否有错误 */
			error: boolean;
			/** 动画ID（用于客户端完成确认） */
			animationId?: string;
			/** 机会卡信息 */
			chanceCard?: {
				/** 机会卡实例ID */
				id: string;
				/** 机会卡来源ID */
				sourceId: string;
				/** 机会卡名称 */
				name: string;
				/** 机会卡描述 */
				description: string;
				/** 图标ID */
				iconId: string;
				/** 卡片颜色 */
				color: string;
				/** 目标类型 */
				type: TargetSelectType;
			};
			/** 使用者玩家ID */
			sourcePlayerId?: string;
			/** 目标ID列表 */
			targetIdList?: string[];
		};
	};

	/**
	 * 剩余时间
	 * 服务器向客户端发送倒计时剩余时间
	 */
	[SocketMsgType.RemainingTime]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的剩余时间信息 */
		server: {
			/** 剩余时间（秒） */
			remainingTime: number;
			/** 总时间（秒） */
			totalTime: number;
		};
	};

	/**
	 * 当前事件名称
	 * 服务器向客户端发送当前事件的名称
	 */
	[SocketMsgType.CurrentEventName]: {
		client: never;
		server: {
			/** 事件名称 */
			eventName: string;
			/** 是否显示倒计时（由服务端控制） */
			showCountdown?: boolean;
		};
	};

	/**
	 * 回合超时
	 * 服务器通知客户端回合超时
	 */
	[SocketMsgType.RoundTimeOut]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器返回的数据 */
		server: {
			/** 超时的玩家ID */
			playerId: string;
			/** 超时的事件类型 */
			eventType: OperateType;
		};
	};

	/**
	 * 玩家行走
	 * 服务器通知客户端玩家行走
	 */
	[SocketMsgType.PlayerWalk]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的行走信息 */
		server: {
			/** 行走的玩家 ID */
			playerId: string;
			/** 行走的步数 */
			step: number;
			/** 行走 ID */
			walkId: string;
			/** 总移动步数（用于分段走路时的步数显示） */
			totalSteps?: number;
			/** 当前是第几步（用于分段走路时的步数显示） */
			startStep?: number;
		};
	};

	/**
	 * 玩家传送
	 * 服务器通知客户端玩家传送
	 */
	[SocketMsgType.PlayerTp]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的传送信息 */
		server: {
			/** 传送的玩家 ID */
			playerId: string;
			/** 目标位置索引 */
			positionIndex: number;
			/** 行走 ID */
			walkId: string;
		};
	};

	/**
	 * 操作
	 * 客户端向服务器发送操作请求
	 */
	[SocketMsgType.Operation]: {
		/** 客户端发送的操作消息 */
		client: OperationMessage;
		/** 服务器返回的数据（不支持） */
		server: never;
	};

	/**
	 * 破产
	 * 服务器通知客户端玩家破产
	 */
	[SocketMsgType.Bankrupt]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器返回的数据（无） */
		server: never;
	};

	/**
	 * 游戏结束
	 * 服务器通知客户端游戏结束
	 */
	[SocketMsgType.GameOver]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器返回的数据 */
		server: {
			/** 是否返回房间（安全模式放弃游戏时使用） */
			returnToRoom?: boolean;
		};
	};

	/**
	 * 暂停游戏
	 * 客户端请求暂停游戏
	 */
	[SocketMsgType.PauseGame]: {
		/** 客户端发送的数据（无） */
		client: undefined;
		/** 服务器返回的数据（无） */
		server: undefined;
	};

	/**
	 * 恢复游戏
	 * 客户端请求恢复游戏
	 */
	[SocketMsgType.ResumeGame]: {
		/** 客户端发送的数据（无） */
		client: undefined;
		/** 服务器返回的数据（无） */
		server: undefined;
	};

	/**
	 * 确认对话框
	 * 服务器向客户端显示确认对话框
	 */
	[SocketMsgType.ConfirmDialog]: {
		/** 客户端发送的数据（不支持） */
		client: undefined;
		/** 服务器发送的对话框选项 */
		server: {
			/** 玩家 ID */
			playerId: string;
			/** 对话框选项 */
			option: ConfirmDialogOption;
		};
	};

	/**
	 * 目标选择对话框
	 * 服务器向客户端显示目标选择对话框
	 */
	[SocketMsgType.TargetSelectDialog]: {
		/** 客户端发送的数据（不支持） */
		client: undefined;
		/** 服务器发送的对话框选项 */
		server: {
			/** 玩家 ID */
			playerId: string;
			/** 对话框选项 */
			option: TargetSelectDialogOption<TargetSelectType>;
		};
	};

	/**
	 * 物品选择对话框
	 * 服务器向客户端显示物品选择对话框
	 */
	[SocketMsgType.ItemSelectDialog]: {
		/** 客户端发送的数据（不支持） */
		client: undefined;
		/** 服务器发送的对话框选项 */
		server: {
			/** 玩家 ID */
			playerId: string;
			/** 对话框选项 */
			option: ItemSelectDialogOption;
		};
	};

	/**
	 * 消息卡片
	 * 服务器向客户端显示消息卡片
	 */
	[SocketMsgType.MessageCard]: {
		/** 客户端发送的数据（不支持） */
		client: undefined;
		/** 服务器发送的消息卡片选项 */
		server: {
			/** 消息卡片选项 */
			option: MessageCardOption;
		};
	};

	/**
	 * 表单对话框
	 * 服务器向客户端显示表单对话框
	 */
	[SocketMsgType.FormDialog]: {
		/** 客户端发送的数据（不支持） */
		client: undefined;
		/** 服务器发送的表单对话框选项 */
		server: {
			/** 玩家 ID */
			playerId: string;
			/** 表单对话框选项 */
			option: FormDialogOption<FormField<string, any>[]>;
		};
	};

	/**
	 * UI 更新
	 * 服务器通知客户端更新 UI
	 */
	[SocketMsgType.UI]: {
		/** 客户端发送的数据（不支持） */
		client: undefined;
		/** 服务器返回的数据（无） */
		server: undefined;
	};

	/**
	 * Loading 控制
	 * 服务器控制客户端的 loading 显示/隐藏
	 */
	[SocketMsgType.LoadingControl]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的 loading 控制指令 */
		server: {
			/** 是否显示 loading */
			show: boolean;
			/** loading 文本（可选） */
			text?: string;
		};
	};

	/**
	 * 按钮注册
	 * 服务器通知客户端注册新的动态按钮
	 */
	[SocketMsgType.ButtonRegister]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的按钮注册信息 */
		server: ButtonRegisterMessage;
	};

	/**
	 * 按钮状态变更
	 * 服务器通知客户端按钮状态发生变化
	 */
	[SocketMsgType.ButtonStateChanged]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的按钮状态变更信息 */
		server: ButtonStateChangedMessage;
	};

	/**
	 * 按钮移除
	 * 服务器通知客户端移除某个动态按钮
	 */
	[SocketMsgType.ButtonRemove]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的按钮移除信息 */
		server: ButtonRemoveMessage;
	};

	/**
	 * 安全模式操作面板
	 * 服务器通知房主显示安全模式操作面板
	 */
	[SocketMsgType.SafeModePanel]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的安全模式信息 */
		server: SafeModePanelMessage;
	};

	/**
	 * 地图分块传输开始
	 * 主机通知客机开始分块传输
	 */
	[SocketMsgType.MapChunkStart]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的分块传输开始信息 */
		server: MapChunkStartData;
	};

	/**
	 * 地图数据分块
	 * 主机向客机发送单个数据分块
	 */
	[SocketMsgType.MapChunk]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的分块数据 */
		server: MapChunkData;
	};

	/**
	 * 地图分块传输结束
	 * 主机通知客机分块传输完成
	 */
	[SocketMsgType.MapChunkEnd]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的传输结束信息 */
		server: MapChunkEndData;
	};

	/**
	 * 地图分块中止
	 * 主机或客机中止分块传输
	 */
	[SocketMsgType.MapChunkAbort]: {
		/** 客户端发送的中止原因 */
		client: MapChunkAbortData;
		/** 服务器发送的中止原因 */
		server: MapChunkAbortData;
	};

	/**
	 * 地图分块接收确认
	 * 客机向主机发送分块接收确认
	 */
	[SocketMsgType.MapChunkAck]: {
		/** 客户端发送的确认信息 */
		client: MapChunkAckData;
		/** 服务器发送的数据（不支持） */
		server: never;
	};

	/**
	 * 地图事件动态变更
	 * 服务器通知客户端地图事件发生了变化
	 */
	[SocketMsgType.MapEventChanged]: {
		/** 客户端发送的数据（不支持） */
		client: never;
		/** 服务器发送的事件变更数据 */
		server: MapEventChangedData;
	};
}

/**
 * 安全模式面板消息
 */
export interface SafeModePanelMessage {
	/** 进入安全模式的原因 */
	reason: string;
	/** 是否可以保存（游戏是否有实际进度） */
	canSave: boolean;
	/** 错误详情（可选） */
	errorDetails?: {
		category?: string;
		type?: string;
		message?: string;
		stack?: string;
	};
}

/**
 * 地图分块传输开始消息
 */
export interface MapChunkStartData {
	/** 总块数 */
	totalChunks: number;
	/** 每块大小（字节） */
	chunkSize: number;
	/** 地图元信息（不含 data） */
	mapInfo: Omit<RoomMapInfo, "data">;
	/** 整体传输超时（毫秒），由主机端按块数动态计算下发 */
	transferTimeout?: number;
	/** 地图数据总大小（字节），用于进度条展示 */
	totalBytes?: number;
}

/**
 * 地图数据分块消息
 */
export interface MapChunkData {
	/** 当前块索引 (0-based) */
	chunkIndex: number;
	/** 分块数据：二进制直传时为 Uint8Array，兼容旧版 base64 字符串 */
	data: string | Uint8Array;
}

/**
 * 地图分块传输结束消息
 */
export interface MapChunkEndData {
	/** 是否成功 */
	success: boolean;
}

/**
 * 地图分块接收确认消息
 */
export interface MapChunkAckData {
	/** 已确认的块索引 */
	chunkIndex: number;
}

/**
 * 地图分块中止消息
 */
export interface MapChunkAbortData {
	/** 中止原因 */
	reason: string;
}

/**
 * 地图事件动态变更数据
 * 支持的操作：add（添加事件）、remove（移除事件）、link（关联到地块）、unlink（取消关联）
 */
export interface MapEventChangedData {
	/** 操作类型 */
	action: "add" | "remove" | "link" | "unlink";
	/** 地图事件（add 时必填） */
	mapEvent?: import("./item").MapEvent;
	/** 事件 ID（remove / link / unlink 时必填） */
	mapEventId?: string;
	/** 地块 ID（link / unlink 时必填） */
	mapItemId?: string;
}

/**
 * 房间接口
 * 表示游戏房间的基本信息
 */
export interface Room {
	/** 房间 ID */
	roomId: string;

	/** 房主 ID */
	ownerId: string;

	/** 房主名称 */
	ownerName: string;

	/** 房间内用户数量 */
	userNum: number;
}

/**
 * 房间信息接口
 * 表示房间的详细信息
 */
export interface RoomInfo {
	/** 房间 ID */
	roomId: string;

	/** 房间内用户列表 */
	userList: Array<UserInRoomInfo>;

	/** 游戏是否已开始 */
	isStarted: boolean;

	/** 房主 ID */
	ownerId: string;

	/** 房主名称 */
	ownerName: string;

	/** 游戏设置 */
	gameSetting: GameSetting;
}

/**
 * 房间内角色接口
 * 包含角色信息和图片 URL
 */
export interface RoleInRoom extends Role {
	/** 角色图片 URL */
	imageUrl: string;
}

/**
 * 聊天消息接口
 */
export interface ChatMessage {
	/** 消息唯一标识 */
	id: string;

	/** 消息类型 */
	type: ChatMessageType;

	/** 发送消息的用户 */
	user: User;

	/** 消息内容 */
	content: string;

	/** 消息时间戳 */
	time: number;
}

/**
 * 游戏日志接口
 */
export interface GameLog {
	/** 日志唯一标识 */
	id: string;

	/** 日志时间戳 */
	time: number;

	/** 日志内容 */
	content: string;
}

/**
 * 玩家操作结果接口
 * 定义每种操作类型对应的结果数据
 */
export interface PlayerOperationResult {
	/** 游戏初始化完成 */
	[OperateType.GameInitFinished]: undefined;

	/** 掷骰子 */
	[OperateType.RollDice]: undefined;

	/** 使用机会卡 */
	[OperateType.UseChanceCard]: {
		/** 机会卡 ID */
		chanceCardId: string;
		/** 目标 ID 列表 */
		targetIdList: string[];
	};

	/** 播放动画 */
	[OperateType.Animation]: string;

	/** 地图资源加载完成 */
	[OperateType.MapResourceLoaded]: undefined;

	/** 客机开始加载地图资源 */
	[OperateType.LoadingStarted]: undefined;

	/** 暂停游戏 */
	[OperateType.PauseGame]: undefined;

	/** 恢复游戏 */
	[OperateType.ResumeGame]: undefined;

	/** 确认对话框结果 */
	[OperateType.ConfirmDialogResult]: {
		/** 对话框 ID */
		id: string;
		/** 是否确认 */
		confirm: boolean;
	};

	/** 目标选择对话框结果 */
	[OperateType.TargetSelectDialogResult]: TargetSelectDialogResult<TargetSelectType>;

	/** 物品选择对话框结果 */
	[OperateType.ItemSelectDialogResult]: ItemSelectDialogResult;

	/** 表单对话框结果 */
	[OperateType.FormDialogResult]: FormDialogResult<FormField<string, any>[]>;

	/** 动态按钮点击 */
	[OperateType.DynamicButtonClick]: DynamicButtonClickOperationResult;

	/** 安全模式重试 */

	/** 安全模式放弃游戏 */
	[OperateType.SafeModeAbort]: undefined;

	/** 安全模式存档并退出 */
	[OperateType.SafeModeSaveAndExit]: undefined;

	/** 地图分块接收确认 */
	[OperateType.MapChunkAck]: MapChunkAckData;
}

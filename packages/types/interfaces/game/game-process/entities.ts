import { TargetSelectType } from "../../../../types/enums/game/game";
import { ICommandBus, IModifierManager, IBuffManager, PlayerCommandMap, PropertyCommandMap } from "../action-system";
import { UserInRoomInfo } from "../item";
import { DiceResult, IDice } from "../util";
import { GameContext, IGamePhase } from "./events"; // 引用 events
import { PlayerInfo, PropertyInfo, ChanceCardClientInfo, PropertyCustom } from "./infos"; // 引用 infos
import { IGameProcess } from "./core"; // 引用 core
import { UISchema } from "./ui";
import { MoneyTagType } from "./money-tag";

/**
 * 玩家接口
 * 表示游戏中的玩家实体
 */
export interface IPlayer {
	/** 玩家唯一标识 */
	id: string;

	/** 玩家名称 */
	name: string;

	/** 角色 ID */
	roleId: string;

	/** 玩家金钱 */
	money: number;

	/** 玩家拥有的地产列表 */
	properties: IProperty[];

	/** 玩家拥有的机会卡列表 */
	chanceCards: IChanceCard[];

	/** MapPath V2 的当前位置地图项 ID；旧玩家实例可暂时不提供。 */
	positionMapItemId?: string;

	/**
	 * 旧版线性位置索引。
	 * @deprecated 仅供旧 effectCode 与线性地图兼容；新逻辑应使用 positionMapItemId。
	 */
	positionIndex: number;

	/** 是否停止回合（废弃，使用 stop） */
	isStop: number;

	/** 是否破产 */
	isBankrupted: boolean;

	/** 是否离线 */
	isOffline: boolean;

	/** 停止回合数 */
	stop: number;

	/** 玩家回合阶段列表 */
	roundPhases: IGamePhase<GameContext>[];

	/** 玩家的骰子列表 */
	dices: IDice[];

	/** 玩家信息展示 UI Schema */
	infoDisplay: UISchema;

	// ===== 获取器方法 =====

	/**
	 * 获取用户信息
	 * @returns 用户信息
	 */
	getUser: () => UserInRoomInfo;

	// ===== 地产相关方法 =====

	/**
	 * 设置地产列表
	 * @param newPropertiesList - 新的地产列表
	 */
	setPropertiesList: (newPropertiesList: IProperty[]) => void;

	/**
	 * 获得地产
	 * @param property - 要获得的地产
	 */
	gainProperty: (property: IProperty) => Promise<void>;

	/**
	 * 失去地产
	 * @param property - 要失去的地产
	 */
	loseProperty: (property: IProperty) => Promise<void>;

	// ===== 机会卡相关方法 =====

	/**
	 * 设置机会卡列表
	 * @param newChanceCardList - 新的机会卡列表
	 */
	setCardsList: (newChanceCardList: IChanceCard[]) => void;

	/**
	 * 根据 ID 获取机会卡
	 * @param cardId - 机会卡 ID
	 * @returns 机会卡对象或 undefined
	 */
	getCardById: (cardId: string) => IChanceCard | undefined;

	/**
	 * 获得机会卡
	 * @param gainCard - 要获得的机会卡
	 */
	gainCard: (gainCard: IChanceCard) => Promise<void>;

	/**
	 * 失去机会卡
	 * @param cardId - 要失去的机会卡 ID
	 */
	loseCard: (cardId: string) => Promise<void>;

	// ===== 金钱相关方法 =====

	/**
	 * 设置金钱
	 * @param money - 新的金钱数量
	 */
	setMoney: (money: number) => void;

	/**
	 * 花费金钱
	 * @param money - 要花费的金钱数量
	 * @param tag - 金钱流动标签（可选，用于标识花费途径）
	 * @param target - 收取金钱的目标玩家（可选）
	 * @returns 返回命令执行结果，包含实际花费的金钱数量、目标和标签
	 */
	cost: (money: number, tag?: MoneyTagType, target?: IPlayer) => Promise<PlayerCommandMap['player.money.lose']['result']>;

	/**
	 * 获得金钱
	 * @param money - 要获得的金钱数量
	 * @param tag - 金钱流动标签（可选，用于标识收入途径）
	 * @param source - 金钱来源玩家（可选）
	 * @returns 返回命令执行结果，包含实际获得的金钱数量、来源和标签
	 */
	gain: (money: number, tag?: MoneyTagType, source?: IPlayer) => Promise<PlayerCommandMap['player.money.gain']['result']>;

	// ===== 游戏相关方法 =====

	/**
	 * 设置停止回合数
	 * @param stop - 停止回合数
	 */
	setStop: (stop: number) => void;

	/**
	 * 设置位置索引
	 * @deprecated 仅用于旧线性地图兼容。
	 * @param newIndex - 新的位置索引
	 */
	setPositionIndex: (newIndex: number) => void;

	/** 设置当前位置地图项 ID（MapPath V2）。 */
	setPositionMapItemId?: (mapItemId: string) => void;

	/**
	 * 设置破产状态
	 * @param isBankrupted - 是否破产
	 */
	setBankrupted: (isBankrupted: boolean) => void;

	/**
	 * 行走指定步数
	 * @param step - 步数
	 */
	walk: (step: number) => Promise<void>;

	/**
	 * 传送到指定位置
	 * @deprecated 仅用于旧线性地图兼容；请改用 tpToMapItem(mapItemId)。
	 * @param positionIndex - 目标位置索引
	 */
	tp: (positionIndex: number) => Promise<void>;

	/** 按地图项 ID 传送（MapPath V2）。 */
	tpToMapItem?: (mapItemId: string) => Promise<void>;

	/**
	 * 掷骰子
	 * @returns 骰子结果数组
	 */
	rollDices: () => Promise<DiceResult[]>;

	/**
	 * 添加骰子
	 * @param diceValue - 骰子初始值（可选）
	 * @returns 新添加的骰子
	 */
	addDice: (diceValue?: number[]) => Promise<IDice>;

	/**
	 * 移除骰子
	 * @param id - 骰子 ID
	 * @returns 被移除的骰子或 undefined
	 */
	removeDice: (id: string) => Promise<IDice | undefined>;

	// ===== 命令和修饰器系统 =====

	/** 玩家命令总线 */
	commandBus: ICommandBus<PlayerCommandMap>;

	/** 玩家修饰器管理器 */
	modifierManager: IModifierManager<PlayerCommandMap>;

	/** 玩家 Buff 管理器（独立于修饰器系统） */
	buffManager: IBuffManager;

	// ===== 信息获取 =====

	/**
	 * 获取玩家信息
	 * @returns 玩家信息
	 */
	getPlayerInfo: () => PlayerInfo;

	/**
	 * 获取回合阶段列表
	 * @returns 回合阶段列表
	 */
	getRoundPhases: () => IGamePhase<GameContext>[];
}

/**
 * 地产接口
 * 表示游戏中的地产实体
 */
export interface IProperty {
	/** 地产唯一标识 */
	id: string;

	/** 地产名称 */
	name: string;

	/** 当前等级 */
	level: number;

	/** 最大等级 */
	maxLevel: number;

	/** 出售价格 */
	sellCost: number;

	/** 建造/升级费用 */
	buildCost: number;

	/** 各等级过路费列表 */
	costList: number[];

	/** 建筑模型 ID 列表 */
	buildingModelIdList: string[] | undefined;

	/** 自定义效果配置 */
	custom: PropertyCustom | undefined;

	/** 地产所有者 */
	owner: IPlayer | undefined;

	// ===== 获取器方法 =====

	/**
	 * 获取原始数据
	 * @returns 地产信息
	 */
	getOriginalData: () => PropertyInfo;

	// ===== 地产操作方法 =====

	/**
	 * 升级地产
	 */
	levelUp: () => Promise<void>;

	/**
	 * 降级地产
	 */
	levelDown: () => Promise<void>;

	/**
	 * 设置地产所有者
	 * @param player - 新的所有者（undefined 表示无主）
	 */
	setOwner: (player: IPlayer | undefined) => Promise<void>;

	/**
	 * 设置地产等级
	 * @param level - 新的等级
	 */
	setLevel: (level: number) => Promise<void>;

	/**
	 * 玩家到达地产
	 * @param player - 到达的玩家
	 */
	arrived: (player: IPlayer) => Promise<void>;

	/**
	 * 获取地产信息
	 * @returns 地产信息
	 */
	getPropertyInfo: () => PropertyInfo;

	// ===== 命令和修饰器系统 =====

	/** 地产命令总线 */
	commandBus: ICommandBus<PropertyCommandMap>;

	/** 地产修饰器管理器 */
	modifierManager: IModifierManager<PropertyCommandMap>;
}

/**
 * 机会卡接口
 * 表示游戏中的机会卡实体
 */
export interface IChanceCard {
	/**
	 * 获取机会卡 ID
	 * @returns 机会卡 ID
	 */
	getId: () => string;

	/**
	 * 获取源 ID
	 * @returns 源 ID
	 */
	getSourceId: () => string;

	/**
	 * 获取机会卡名称
	 * @returns 机会卡名称
	 */
	getName: () => string;

	/**
	 * 获取机会卡描述
	 * @returns 机会卡描述
	 */
	getDescribe: () => string;

	/**
	 * 获取机会卡图标
	 * @returns 图标 ID
	 */
	getIcon: () => string;

	/**
	 * 获取机会卡类型
	 * @returns 目标选择类型
	 */
	getType: () => TargetSelectType;

	/**
	 * 获取机会卡颜色
	 * @returns 颜色
	 */
	getColor: () => string;

	/**
	 * 获取效果代码
	 * @returns 效果代码
	 */
	getEffectCode: () => string;

	/**
	 * 使用机会卡
	 * @param sourcePlayer - 使用机会卡的玩家
	 * @param target - 目标（玩家、地产、地图项 ID 或它们的数组）
	 * @param gameProcess - 游戏进程
	 */
	use: (
		sourcePlayer: IPlayer,
		target: IPlayer | IProperty | string | IPlayer[] | IProperty[],
		gameProcess: IGameProcess,
	) => Promise<void>;

	/**
	 * 获取机会卡信息
	 * @returns 机会卡信息
	 */
	getChanceCardInfo: () => ChanceCardClientInfo;
}

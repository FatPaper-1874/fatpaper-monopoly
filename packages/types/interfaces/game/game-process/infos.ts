import { TargetSelectType } from "../../../../types/enums/game/game";
import { UserInRoomInfo } from "../item";
import { DiceInfo } from "../util";
import { UISchema } from "./ui";
import { IGameProcessExportData } from "./core";
import type { MapPathRuntimeState } from "../map";

/**
 * 游戏数据接口
 * 用于同步游戏状态到客户端
 */
export interface GameData {
	/** 导出数据（游戏进程扩展数据） */
	exportData: IGameProcessExportData;

	/** 当前回合玩家 ID */
	currentPlayerIdInRound: string;

	/** 当前回合数 */
	currentRound: number;

	/** 当前倍率 */
	currentMultiplier: number;

	/** 玩家列表 */
	players: PlayerInfo[];

	/** 地图路径会话状态；旧客户端和旧存档可省略。 */
	mapPathRuntimeState?: MapPathRuntimeState;

	/** 地产列表 */
	properties: PropertyInfo[];

	/** 是否游戏结束 */
	isGameOver: boolean;

	/** 游戏结束时的玩家排名（玩家ID数组，索引0为第一名） */
	rankedPlayerIds: string[];
}

/**
 * 玩家信息接口
 * 用于同步玩家状态到客户端
 */
export interface PlayerInfo {
	/** 玩家唯一标识 */
	id: string;

	/** 用户信息 */
	user: UserInRoomInfo;

	/** 骰子列表 */
	dices: DiceInfo[];

	/** 金钱数量 */
	money: number;

	/** 拥有的地产列表 */
	properties: PropertyInfo[];

	/** 拥有的机会卡列表 */
	chanceCards: ChanceCardClientInfo[];

	/** 玩家身上的 Buff 列表 */
	buff: Buff[];

	/**
	 * 当前位置地图项 ID。
	 * MapPath V2 的位置事实；未提供时由旧 positionIndex + mapIndex 兼容恢复。
	 */
	positionMapItemId?: string;

	/**
	 * 旧版线性位置索引。
	 * @deprecated 仅供旧 UI、effectCode 和旧存档兼容；新逻辑应读取 positionMapItemId。
	 */
	positionIndex: number;

	/** 停止回合数 */
	stop: number;

	/** 是否破产 */
	isBankrupted: boolean;

	/** 是否离线 */
	isOffline: boolean;
	/** 是否为 AI 托管 */
	isAI: boolean;
	/** AI 是否正在思考（请求决策中） */
	isThinking: boolean;

	/** 玩家信息展示 UI Schema */
	infoDisplay: UISchema;
}

/**
 * 地产信息接口
 * 用于同步地产状态到客户端
 */
export interface PropertyInfo {
	/** 地产唯一标识 */
	id: string;

	/** 地产名称 */
	name: string;

	/** 出售价格 */
	sellCost: number;

	/** 建造/升级费用 */
	buildCost: number;

	/** 当前等级 */
	level: number;

	/** 最大等级 */
	maxLevel: number;

	/** 各等级过路费列表 */
	costList: number[];

	/** 建筑模型 ID 列表 */
	buildingModelIdList?: string[];

	/** 自定义扩展数据 */
	exportData?: Record<string, any>;

	/** 地产所有者信息 */
	owner?: UserInRoomInfo;

	/** 自定义效果配置 */
	custom?: PropertyCustom;

	/** 自定义 UI */
	customUI: string | undefined;
}

/**
 * 地产自定义配置接口
 * 用于定义地产的特殊效果
 */
export interface PropertyCustom {
	/** 效果代码（TypeScript 代码字符串） */
	effectCode: string;

	/** 效果描述 */
	description: string;
}

/**
 * 机会卡客户端信息接口
 * 用于显示机会卡信息（不包含 effectCode）
 */
export interface ChanceCardClientInfo extends Omit<ChanceCardInstanceInfo, "effectCode"> {}

/**
 * 机会卡实例信息接口
 * 表示一张具体的机会卡实例
 */
export interface ChanceCardInstanceInfo extends ChanceCardInfo {
	/** 源 ID（指向 ChanceCardInfo） */
	sourceId: string;
}

/**
 * 机会卡信息接口
 * 定义机会卡的基本信息
 */
export interface ChanceCardInfo {
	/** 机会卡唯一标识 */
	id: string;

	/** 机会卡名称 */
	name: string;

	/** 机会卡描述 */
	description: string;

	/** 图标 ID */
	iconId: string;

	/** 卡片颜色 */
	color: string;

	/** 效果代码（TypeScript 代码字符串） */
	effectCode: string;

	/** 目标选择类型 */
	type: TargetSelectType;
}

/**
 * Buff 展示信息（统一类型，修饰器 meta 和独立 buff 共用）
 */
export interface BuffDisplay {
	/** 名称 */
	name: string;
	/** 描述 */
	description: string;
	/** 来源 */
	source: string;
	/** 触发时机名称（可选，独立 buff 不一定有） */
	triggerTiming?: string;
	/** 标签（用于分组、查找等） */
	tags?: string[];
}

/**
 * Buff 接口
 * 表示玩家身上的临时效果
 */
export interface Buff extends BuffDisplay {
	/** Buff 唯一标识 */
	id: string;
	/** 剩余触发次数（可选，不设则不显示） */
	triggerTimes?: number;
}

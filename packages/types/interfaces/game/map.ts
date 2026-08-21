import { ModifierTemplate } from "./action-system/modifier";
import { ChanceCardInfo, GamePhaseInfo, GameSetting, UISchema, UITemplate } from "./game-process";
import { MapItem, MapItemType, Street, Role, MapEvent, GameMapInfo, CustomUI } from "./item";
import { FormSchema } from "./util";
import type { IPlayer } from "./game-process/entities";

/**
 * 游戏设置表单接口
 * 预留用于扩展
 */
export interface GameSettingForm {}

/**
 * 地图路径接口
 * 表示从一个地图项到另一个地图项的单向连接。
 */
export interface MapPath {
	/** 路径唯一标识 */
	id: string;

	/** 起点地图项 ID */
	fromMapItemId: string;

	/** 终点地图项 ID */
	toMapItemId: string;

	/** 地图初始化时是否开放；未配置时默认为 true */
	initEnable?: boolean;

	/** 仅供编辑器识别和展示，不参与运行时选路 */
	name?: string;

	/** 仅供编辑器识别和展示，不参与运行时选路 */
	description?: string;
}
/**
 * 地图路径的运行时通行条件。
 * 条件仅存在于当前游戏会话，允许异步执行并产生副作用。
 */
export type MapPathCanPass = (player: IPlayer, path: MapPath) => boolean | Promise<boolean>;

/** 一次地图移动沿路径原始方向还是反向进行。 */
export type MapMoveDirection = "forward" | "reverse";

/**
 * 一次实际跨越地图路径的移动段。
 * 反向移动时，toMapItemId 等于该路径的 fromMapItemId。
 */
export interface MapMovementSegment {
	/** 实际行走的路径 ID */
	pathId: string;

	/** 实际行走方向 */
	direction: MapMoveDirection;

	/** 实际移动起点地图项 ID */
	fromMapItemId: string;

	/** 实际移动终点地图项 ID */
	toMapItemId: string;

	/** 本次行动中的第几步（0-based） */
	stepIndex: number;

	/** 本次行动的总步数 */
	totalSteps: number;
}

/** 玩家在岔路口可选择的一条实际可走路径。 */
export interface MapPathChoiceCandidate {
	/** 原始地图路径 ID */
	pathId: string;

	/** 按当前方向实际可到达的终点地图项 ID */
	targetMapItemId: string;

	/** 选择后实际行走方向 */
	direction: MapMoveDirection;

	/** 路径展示名称 */
	name?: string;

	/** 路径展示说明 */
	description?: string;
}

/** 宿主向当前玩家发出的路径选择请求。 */
export interface MapPathChoiceRequest {
	/** 用于拒绝迟到或重复选择的请求 ID */
	requestId: string;

	/** 需要作出选择的玩家 ID */
	playerId: string;

	/** 当前所在地图项 ID */
	currentMapItemId: string;

	/** 当前需要选择的实际移动方向 */
	direction: MapMoveDirection;

	/** 选择前尚未消耗的步数 */
	remainingSteps: number;

	/** 宿主已校验的候选路径，顺序与 mapPaths 保持一致 */
	candidates: MapPathChoiceCandidate[];
}

/**
 * 地图路径的会话运行时状态。
 * 该状态不应写回 GameMap；initEnable 仅属于静态地图定义。
 */
export interface MapPathRuntimeState {
	/** 当前启用的路径 ID 集合 */
	enabledPathIds: string[];

	/** 当前移动行动的方向（如果有） */
	currentMoveDirection?: MapMoveDirection;

	/** 暂停等待玩家选择的请求（如果有） */
	pendingChoice?: MapPathChoiceRequest;
}

/**
 * 游戏地图接口
 * 表示完整的游戏地图配置
 */
export interface GameMap {
	/** 地图唯一标识 */
	id: string;

	/** 服务端地图 ID（用户上传审核流使用） */
	serverMapId?: string;

	/** 地图基本信息 */
	info: GameMapInfo;

	/** 地图项列表 */
	mapItems: MapItem[];

	/** 机会卡列表 */
	chanceCards: ChanceCardInfo[];

	/** 地图项类型列表 */
	mapItemTypes: MapItemType[];

	/** 地图路径列表（有向图边集合） */
	mapPaths: MapPath[];

	/**
	 * 可供玩家行走的 MapItem 类型 ID。
	 * 未配置时，编辑器只能从现有路径端点推断路径节点，无法检查遗漏节点。
	 */
	pathMapItemTypeIds?: string[];

	/** 地图起点；旧地图未配置时从 mapIndex 的第一个节点推断 */
	startMapItemId?: string;

	/**
	 * 旧版线性闭环路径索引。
	 * @deprecated MapPath V2 迁移期间仅供旧 effectCode、旧存档和线性地图兼容；新逻辑不得以此作为路径事实来源。
	 */
	mapIndex: string[];

	/** 角色列表 */
	roles: Role[];

	/** 是否正在使用 */
	inUse: boolean;

	/** 地图事件列表 */
	mapEvents: MapEvent[];

	/** 游戏设置表单 Schema */
	gameSettingForm: FormSchema[];

	/** 游戏阶段配置 */
	phases: {
		/** 游戏结束规则阶段 */
		gameOverRule: GamePhaseInfo[];

		/** 游戏初始化阶段 */
		gameInited: GamePhaseInfo[];

		/** 玩家预初始化阶段（在玩家初始化之前运行） */
		playerPreInit: GamePhaseInfo[];

		/** 地皮预初始化阶段（在地皮初始化之前运行） */
		propertyPreInit: GamePhaseInfo[];

		/** 游戏回合开始阶段 */
		gameRoundStart: GamePhaseInfo[];

		/** 玩家回合阶段 */
		playerRound: GamePhaseInfo[];

		/** 游戏回合结束阶段 */
		gameRoundEnd: GamePhaseInfo[];

		/** 存档恢复后阶段（在 restoreFromSnapshot 之后、GameInit 广播之前运行，仅在有存档数据时执行一次） */
		postRestore: GamePhaseInfo[];
	};

	/** 建筑模型 ID 列表 */
	buildingModelIdList: string[];

	/** UI 模板列表 */
	uiTemplates: UITemplate[];

	/** Modifier 模板列表 */
	modifierTemplates: ModifierTemplate[];

	/** 自定义 UI 列表 */
	customUIs: CustomUI[];

	/** 额外库代码（TypeScript 代码字符串） */
	extraLibs: string;
}
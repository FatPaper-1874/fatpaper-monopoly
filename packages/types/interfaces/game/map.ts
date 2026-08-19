import { ModifierTemplate } from "./action-system/modifier";
import { ChanceCardInfo, GamePhaseInfo, GameSetting, UISchema, UITemplate } from "./game-process";
import { MapItem, MapItemType, Street, Role, MapEvent, GameMapInfo, CustomUI } from "./item";
import { FormSchema } from "./util";

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
	 * @deprecated 当前移动逻辑仍依赖该字段；完成路径移动迁移后再将其设为可选。
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

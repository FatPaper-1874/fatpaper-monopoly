import { Buff, DiceInfo, GameLog, MapPathRuntimeState, ModifierSnapshot } from "@mine-monopoly/types";

/** Player 全量快照 */
export interface PlayerSnapshot {
	/** 已知字段的显式声明（方便类型提示） */
	roleId: string;
	money: number;
	positionIndex: number;
	/** MapPath V2 的位置真相；缺失时按旧 positionIndex 迁移。 */
	positionMapItemId?: string;
	stop: number;
	isBankrupted: boolean;
	isOffline: boolean;
	isAI: boolean;
	dices: DiceInfo[];
	chanceCards: { instanceId: string; sourceId: string }[];
	buffs: Buff[];
	modifiers: ModifierSnapshot[];
	/** 自定义地图脚本可能挂载到 Player 上的额外数据属性 */
	[key: string]: unknown;
}

/** Property 全量快照 */
export interface PropertySnapshot {
	level: number;
	ownerId: string | undefined;
	modifiers: ModifierSnapshot[];
	/** 自定义地图脚本可能挂载到 Property 上的额外数据属性 */
	[key: string]: unknown;
}

/** 单次游戏快照 */
export interface SaveSnapshot {
	currentRound: number;
	currentMultiplier: number;
	exportData: Record<string, any>;
	customData: Record<string, any>;
	gameLogList: GameLog[];
	playerSnapshots: Record<string, PlayerSnapshot>;
	propertySnapshots: Record<string, PropertySnapshot>;
	/** MapPath V2 会话状态；由 Worker 写入，恢复时原样交回 Worker。 */
	mapPathRuntimeState?: MapPathRuntimeState;
}

/** IndexedDB 存档记录 */
export interface SaveRecord {
	id: string;
	mapId: string;
	mapVersion: string;
	mapName: string;
	saveTime: number;
	round: number;
	playerCount: number;
	playerUserIds: string[];
	playerNames: string[];
	snapshot: SaveSnapshot;
	previousSnapshot?: SaveSnapshot;
}
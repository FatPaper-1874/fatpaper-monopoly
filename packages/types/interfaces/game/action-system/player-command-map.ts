import { IChanceCard, IPlayer, IProperty, MoneyTagType } from "../game-process";
import { DiceResult, IDice } from "../util";
import { ICommandMap } from "./command";
import { MapItem } from "../item";
import type { MapMoveDirection, MapMovementSegment } from "../map";

/**
 * 玩家命令映射
 * 定义所有与玩家相关的命令类型、负载和结果
 */
export interface PlayerCommandMap extends ICommandMap {
	// ===== 地产相关命令 =====

	/**
	 * 玩家获得地产
	 */
	"player.property.gain": {
		payload: { property: IProperty };
		result: { property: IProperty };
	};

	/**
	 * 玩家失去地产
	 */
	"player.property.lose": {
		payload: { property: IProperty };
		result: { property: IProperty };
	};

	// ===== 机会卡相关命令 =====

	/**
	 * 玩家获得机会卡
	 */
	"player.card.gain": {
		payload: { card: IChanceCard };
		result: { card: IChanceCard };
	};

	/**
	 * 玩家失去机会卡
	 */
	"player.card.lose": {
		payload: { cardId: string };
		result: { cardId: string };
	};

	// ===== 金钱相关命令 =====

	/**
	 * 玩家获得金钱
	 */
	"player.money.gain": {
		payload: { money: number; source?: IPlayer; tag?: MoneyTagType };
		result: { money: number; source?: IPlayer; tag?: MoneyTagType };
	};

	/**
	 * 玩家失去金钱
	 */
	"player.money.lose": {
		payload: { money: number; target?: IPlayer; tag?: MoneyTagType };
		result: { money: number; target?: IPlayer; tag?: MoneyTagType; success: boolean; actualCost: number; remainingMoney: number };
	};

	// ===== 移动相关命令 =====

	/**
	 * 设置玩家停止回合数
	 */
	"player.stop": {
		payload: { stop: number };
		result: { stop: number };
	};

	/**
	 * 玩家行走指定步数
	 */
	"player.walk": {
		payload: { steps: number; passed?: PassedMapItem[] };
		result: { steps: number; segments?: MapMovementSegment[] };
	};

	/**
	 * 玩家传送到指定位置。
	 * @deprecated 仅供旧线性地图和 effectCode 兼容；新逻辑请使用 player.tp.map-item。
	 */
	"player.tp": {
		payload: { positionIndex: number };
		result: { positionIndex: number };
	};

	/** 玩家按地图项 ID 传送（MapPath V2）。 */
	"player.tp.map-item": {
		payload: { mapItemId: string };
		result: { mapItemId: string };
	};

	// ===== 游戏事件相关命令 =====

	/**
	 * 玩家回合跳过
	 */
	"player.round.skip": {
		payload: { player: IPlayer };
		result: { player: IPlayer };
	};

	/**
	 * 玩家回合开始
	 */
	"player.round.start": {
		payload: { player: IPlayer };
		result: { player: IPlayer };
	};

	/**
	 * 玩家回合结束
	 */
	"player.round.end": {
		payload: { player: IPlayer };
		result: { player: IPlayer };
	};

	/**
	 * 设置玩家破产状态
	 */
	"player.bankrupted.set": {
		payload: { bankrupted: boolean };
		result: { bankrupted: boolean };
	};

	// ===== 骰子相关命令 =====

	/**
	 * 玩家掷骰子
	 */
	"player.dice.roll": {
		payload: { dices: IDice[] };
		result: { diceResult: DiceResult[] };
	};

	/**
	 * 玩家添加骰子
	 */
	"player.dice.add": {
		payload: { newDice: IDice };
		result: { newDice: IDice };
	};

	/**
	 * 玩家移除骰子
	 */
	"player.dice.remove": {
		payload: { diceId: string };
		result: { removeDice: IDice | undefined };
	};
}

/**
 * 玩家经过的地图项信息
 */
export interface PassedMapItem {
	/** 地图项 ID */
	mapItemId: string;
	/** 经过的顺序（0-based） */
	index: number;
	/** 地图项详情 */
	mapItem?: MapItem;
	/** 实际经过的路径 ID（MapPath V2）。 */
	pathId?: string;
	/** 实际经过方向（MapPath V2）。 */
	direction?: MapMoveDirection;
}

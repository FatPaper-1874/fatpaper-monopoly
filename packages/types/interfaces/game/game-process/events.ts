import { PlayerMoveType } from "../../../../types/enums/game/game";
import { GamePhaseMark } from "../../../../types/enums/game/game-process";
import { PropertyInfo } from "./infos"; // 引用 infos
import { IPlayer } from "./entities"; // 引用 entities
import { IGameProcess } from "./core"; // 引用 core
import { DiceResult } from "../util";
import { MapEvent } from "../item";
import type { MapMoveDirection, MapMovementSegment } from "../map";

/**
 * 游戏上下文接口
 * 用于在事件执行过程中传递状态
 */
// Host服务端 Worker
export type GameContext = {
	/** 是否取消事件执行 */
	cancel?: boolean;
} & Record<string, any>;

/**
 * 游戏运行时栈接口
 * 管理游戏事件的执行栈（事件队列）
 * @template Context - 上下文类型
 */
export interface IGameRuntimeStack<Context extends GameContext> {
	/** 事件栈 */
	stack: GameEvent<Context>[];

	/**
	 * 运行事件栈
	 * @param context - 执行上下文
	 * @param gameProcess - 游戏进程
	 */
	run(context: Context, gameProcess: IGameProcess): Promise<void>;

	/**
	 * 检查栈是否为空
	 * @returns 是否为空
	 */
	isEmpty(): boolean;

	/**
	 * 将事件推入栈
	 * @param gameEvents - 要推入的事件
	 */
	push(...gameEvents: GameEvent<Context>[]): void;

	/**
	 * 从栈中弹出事件
	 * @returns 弹出的事件或 undefined
	 */
	pop(): GameEvent<Context> | undefined;
}

/**
 * 游戏事件函数类型
 * 定义游戏事件的执行函数签名
 * @template Context - 上下文类型
 * @param ctx - 当前事件执行上下文
 * @param gameProcess - 当前游戏进程实例
 */
export type GameEventFunction<Context extends GameContext> = (
	ctx: Context,
	gameProcess: IGameProcess
) => Promise<void> | void;

/**
 * 游戏事件类型
 * 游戏循环中的最基础的执行单位
 * @template Context - 上下文类型
 */
// 游戏事件--游戏循环中的最基础的单位
export type GameEvent<Context extends GameContext> = {
	/** 事件执行函数 */
	fn: GameEventFunction<Context>;

	/** 事件键（可选，用于标识和移除事件） */
	key?: string;
};

/**
 * 游戏阶段信息接口
 * 定义游戏阶段的基本信息
 */
export interface GamePhaseInfo {
	/** 阶段唯一标识 */
	id: string;

	/** 阶段名称 */
	name: string;

	/** 阶段描述 */
	description: string;

	/** 阶段标记（可选） */
	mark?: GamePhaseMark;

	/** 阶段来源（地图编辑器中定义） */
	from?: string;

	/** 初始化事件代码（TypeScript 代码字符串） */
	initEventCode: string;
}

/**
 * 修饰器触发时机类型
 * - "before": 在命令执行前触发
 * - "after": 在命令执行后触发
 */
type ModifierTiming = "before" | "after";

/**
 * 游戏阶段接口
 * 表示游戏中的一个阶段（如：回合开始、掷骰子、移动等）
 * @template Context - 上下文类型
 */
export interface IGamePhase<Context extends GameContext> extends GamePhaseInfo {
	/** 事件队列 */
	eventQueue: GameEvent<Context>[];

	/**
	 * 在指定时机使用事件
	 * @param tiggerTime - 触发时机（before/after）
	 * @param fn - 事件函数
	 * @param key - 事件键（可选）
	 */
	use(tiggerTime: ModifierTiming, fn: GameEventFunction<Context>, key?: string): void;

	/**
	 * 获取事件队列
	 * @returns 事件队列
	 */
	getEventQueue(): GameEvent<Context>[];
}

// ===== 预设上下文类型 =====

/**
 * 游戏回合开始上下文
 */
export interface GameRoundStartContext extends GameContext {}

/**
 * 玩家回合上下文
 */
export interface PlayerRoundContext extends GameContext {
	/** 当前回合玩家 */
	currentRoundPlayer: IPlayer;
}

/**
 * 玩家回合开始上下文
 */
export interface PlayerRoundStartContext extends PlayerRoundContext {}

/**
 * 掷骰子上下文
 */
export interface RollDiceContext extends PlayerRoundStartContext {
	/** 骰子结果 */
	diceResult: DiceResult[];
}

/**
 * 玩家移动上下文
 */
export interface PlayerMoveContext extends RollDiceContext {
	/** 移动类型 */
	type: PlayerMoveType;

	/** 目标位置索引（旧线性地图兼容）。 */
	targetIndex: number;

	/** 实际跨越的路径 ID（MapPath V2）。 */
	pathId?: string;

	/** 实际行走方向（MapPath V2）。 */
	direction?: MapMoveDirection;

	/** 实际移动起点地图项 ID（MapPath V2）。 */
	fromMapItemId?: string;

	/** 实际移动终点地图项 ID（MapPath V2）。 */
	toMapItemId?: string;

	/** 本次行动已产生的实际移动段（MapPath V2）。 */
	movementSegments?: MapMovementSegment[];
}

/**
 * 到达事件上下文
 */
export interface ArrivedEventContext extends PlayerMoveContext {
	/** 到达的地产信息 */
	arrivedProperty: PropertyInfo;
}

/**
 * 玩家回合结束上下文
 */
export interface PlayerRoundEndContext extends ArrivedEventContext {}

/**
 * 游戏回合结束上下文
 */
export interface GameRoundEndContext extends GameContext {}

/**
 * 游戏运行时事件类型
 * 定义事件总线支持的所有事件类型
 */
export type GameRuntimeEvent = {
	/** 游戏回合开始 */
	"game.round.start": void;

	/** 游戏回合结束 */
	"game.round.end": void;

	/** 玩家回合开始 */
	"player.round.start": { player: IPlayer };

	/** 玩家回合结束 */
	"player.round.end": { player: IPlayer };

	/** 玩家到达某位置；mapItemId 为 MapPath V2 位置事实。 */
	"player.arrived": { positionIndex: number; mapItemId?: string; player: IPlayer };
} & Record<string, any>;

/**
 * 运行时地图事件接口
 * 扩展自 MapEvent，添加运行时执行函数
 */
export interface RuntimeMapEvent extends MapEvent {
	/**
	 * 事件执行函数
	 * @param player - 触发事件的玩家
	 * @param gameProcess - 游戏进程
	 */
	fn: (player: IPlayer, gameProcess: IGameProcess) => Promise<void>;
}

import { GameLinkItem, TargetSelectType } from "../../../../types/enums/game/game";
import { OperateType } from "../../../../types/enums/game/game-process";
import { GameMap, MapMoveDirection, MapPath, MapPathCanPass } from "../map";
import { PlayerOperationResult, ServerSocketMessage } from "../socket";
import { IPlayer, IProperty, IChanceCard } from "./entities"; // 引用 entities
import { ChanceCardInfo } from "./infos"; // 引用 infos
import { IGameRuntimeStack, GameContext, GameEvent, GameRuntimeEvent, RuntimeMapEvent } from "./events"; // 引用 events
import { ButtonController } from "../button"; // 引用 button
import { AIDecisionPrompt, AIDecisionSelection } from "../ai";
import { MapEvent, MapItem } from "../item"; // 引用 item

import {
	ConfirmDialogOption,
	ConfirmDialogResult,
	ItemSelectDialogOption,
	ItemSelectDialogResult,
	MessageCardOption,
	TargetSelectDialogOption,
	TargetSelectDialogResult,
	FormDialogOption,
	FormDialogResult,
	FormField,
} from "./ui"; // 引用 ui
import type { Emitter } from "mitt";

/**
 * 游戏设置类型
 * 键值对形式的游戏配置项
 */
export interface GameSetting {
	[key: string]: { label: string; value: any; displayValue: any };
}

/**
 * 游戏进程自定义字段接口
 * 允许通过 declare module 扩展游戏进程的额外字段
 */
export interface IGameProcessCustomFields {
	// 默认为空，允许利用 declare module 扩展
}

/**
 * 游戏进程导出数据接口
 * 允许通过 declare module 扩展游戏进程的导出数据
 */
export interface IGameProcessExportData {
	// 默认为空，允许利用 declare module 扩展
}

/**
 * 游戏进程接口
 * 核心游戏逻辑接口，管理游戏状态、玩家、地产、事件等
 */
export interface IGameProcess extends IGameProcessCustomFields {
	/** 事件总线（使用 mitt） */
	eventBus: Emitter<GameRuntimeEvent>;

	/** 游戏地图数据 */
	mapData: GameMap;

	/** 根据 ID 获取地图项。 */
	getMapItemById(mapItemId: string): MapItem | undefined;

	/** 根据 ID 获取地图路径。 */
	getMapPathById(pathId: string): MapPath | undefined;

	/** 获取所有可行走地图项的 ID（其类型位于 pathMapItemTypeIds 中）。 */
	getPathMapItemIds(): string[];

	/**
	 * 获取指定地图项在给定实际移动方向下的可走路径。
	 * 返回顺序必须与 mapData.mapPaths 保持一致。
	 */
	getAvailableMapPaths(mapItemId: string, direction: MapMoveDirection): MapPath[];

	/** 查询路径是否在当前会话中启用。 */
	isMapPathEnabled(pathId: string): boolean;

	/**
	 * 设置路径在当前会话中的启用状态，不修改静态地图数据。
	 * 启用时可注册通行条件；未提供条件时清除旧条件。关闭时始终清除条件。
	 */
	setMapPathEnabled(pathId: string, enabled: boolean, canPass?: MapPathCanPass): void;

	/** 游戏设置 */
	gameSetting: GameSetting;

	/** 玩家映射表（ID -> 玩家对象） */
	players: Map<string, IPlayer>;

	/** 地产映射表（ID -> 地产对象） */
	properties: Map<string, IProperty>;

	/** 机会卡信息映射表（ID -> 机会卡信息） */
	chanceCardInfos: Map<string, ChanceCardInfo>;

	/** 当前回合玩家 */
	currentRoundPlayer: IPlayer | null;

	/** 当前回合数 */
	currentRound: number;

	/** 游戏运行时栈（事件队列管理） */
	gameRuntimeStack: IGameRuntimeStack<GameContext>;

	/** 游戏导出数据（同步到客户端 GameData.exportData，用于游戏内脚本访问） */
	exportData: IGameProcessExportData;

	/** 游戏自定义数据（纯主机端内部存储，不同步到客户端） */
	customData: Record<string, any>;

	/**
	 * 游戏结束规则检查函数
	 * @param ctx - 当前游戏上下文
	 * @param gameProcess - 游戏进程实例
	 * @returns false 表示游戏继续，true 表示已被其他流程终止，玩家 ID 数组表示最终排名
	 */
	gameOverRuleFunction: (ctx: GameContext, gameProcess: IGameProcess) => Promise<string[] | true | false>;

	/** 动画完成处理器映射表（animationId -> cleanup函数） */
	animationCompletionHandlers: Map<string, () => void>;

	// ===== 地产相关操作 =====

	/**
	 * 处理玩家购买地产
	 * @param player - 购买地产的玩家
	 * @param property - 要购买的地产
	 */
	handlePlayerBuyProperty(player: IPlayer, property: IProperty): Promise<void>;

	/**
	 * 处理玩家升级地产
	 * @param player - 升级地产的玩家
	 * @param property - 要升级的地产
	 */
	handlePlayerBuildUp(player: IPlayer, property: IProperty): Promise<void>;

	/**
	 * 处理玩家到达事件
	 * @param arrivedPlayer - 到达的玩家
	 */
	handleArriveEvent(arrivedPlayer: IPlayer): Promise<void>;

	// ===== 机会卡相关操作 =====

	/**
	 * 处理使用机会卡
	 * @param sourcePlayer - 使用机会卡的玩家
	 * @param chanceCardId - 机会卡 ID
	 * @param targetIdList - 目标 ID 列表
	 * @returns 是否成功使用
	 */
	handleUseChanceCard(sourcePlayer: IPlayer, chanceCardId: string, targetIdList: string[]): Promise<boolean>;

	// ===== 回合通知 =====

	/**
	 * 回合轮换通知
	 * @param playerId - 轮到的玩家 ID
	 */
	roundTurnNotify(playerId: string): void;

	// ===== 玩家操作监听 =====

	/**
	 * 发送玩家操作事件
	 * @param playerId - 玩家 ID
	 * @param operationType - 操作类型
	 * @param data - 操作数据
	 */
	emitPlayerOperation<T extends OperateType>(playerId: string, operationType: T, data: PlayerOperationResult[T]): void;

	/**
	 * 监听单次玩家操作（异步）
	 * @param playerId - 玩家 ID
	 * @param operationType - 操作类型
	 * @param options - 可选配置（超时时间、默认值）
	 * @returns 操作结果
	 */
	oncePlayerOperationAsync<T extends OperateType>(
		playerId: string,
		operationType: T,
		options?: { timeout?: number; defaultValue?: PlayerOperationResult[T] }
	): Promise<PlayerOperationResult[T]>;

	/**
	 * 监听玩家操作（异步，持续监听）
	 * @param playerId - 玩家 ID
	 * @param operationType - 操作类型
	 * @returns 操作结果
	 */
	onPlayerOperationAsync<T extends OperateType>(playerId: string, operationType: T): Promise<PlayerOperationResult[T]>;

	/**
	 * 监听单次玩家操作（回调方式）
	 * @param playerId - 玩家 ID
	 * @param operationType - 操作类型
	 * @param callback - 回调函数
	 */
	oncePlayerOperation<T extends OperateType>(
		playerId: string,
		operationType: T,
		callback: (res: PlayerOperationResult[T]) => void
	): void;

	/**
	 * 监听玩家操作（持续监听，回调方式）
	 * @param playerId - 玩家 ID
	 * @param operationType - 操作类型
	 * @param callback - 回调函数
	 */
	onPlayerOperation<T extends OperateType>(
		playerId: string,
		operationType: T,
		callback: (res: PlayerOperationResult[T]) => void
	): void;

	/**
	 * 移除玩家操作监听器
	 * @param playerId - 玩家 ID
	 * @param operationType - 操作类型
	 * @param listener - 监听器函数
	 */
	removePlayerOperationListener<T extends OperateType>(
		playerId: string,
		operationType: T,
		listener: (...args: any[]) => PlayerOperationResult[T]
	): void;

	/**
	 * 移除玩家所有操作监听器
	 * @param playerId - 玩家 ID
	 * @param operationType - 操作类型（可选，不指定则移除所有类型）
	 */
	removePlayerAllOperationListener<T extends OperateType>(playerId: string, operationType?: T): void;

	// ===== 事件栈管理 =====

	/**
	 * 获取所有玩家 ID
	 * @returns 玩家 ID 数组
	 */
	getAllPlayersId(): string[];

	/**
	 * 将异步函数推入事件栈顶端（下一个执行）
	 * @param fn - 异步函数
	 */
	nextTick(fn: (ctx: GameContext, gameProcess: IGameProcess) => Promise<void> | void): void;

	/**
	 * 将游戏事件推入栈
	 * @param gameEvent - 游戏事件
	 */
	pushEventToStack(gameEvent: GameEvent<GameContext>): void;

	// ===== 对象创建 =====

	/**
	 * 创建新的机会卡实例
	 * @param sourceId - 机会卡源 ID
	 * @returns 机会卡对象
	 */
	createNewChanceCard(sourceId: string): IChanceCard;

	/**
	 * 创建游戏链接项
	 * @param type - 链接项类型
	 * @param id - ID
	 */
	createGameLinkItem(type: GameLinkItem, id: string): void;

	// ===== 消息发送 =====

	/**
	 * 发送消息给指定玩家
	 * @param id - 玩家 ID
	 * @param msg - 服务器消息
	 */
	sendToPlayer(id: string, msg: ServerSocketMessage): void;

	/**
	 * 广播游戏数据给所有玩家
	 */
	gameDataBroadcast(): void;

	/**
	 * 广播游戏消息通知
	 * @param type - 消息类型（success/warning/error/info）
	 * @param msg - 消息内容
	 */
	msgNotifyBroadcast(type: "success" | "warning" | "error" | "info", msg: string): void;

	/**
	 * 发送消息通知给指定玩家列表
	 * @param playerIdList - 玩家 ID 列表
	 * @param msg - 消息对象
	 */
	messageNotify(
		playerIdList: string[],
		msg: {
			type: "info" | "success" | "warning" | "error";
			content: string;
		}
	): void;

	/**
	 * 广播游戏日志
	 * @param log - 日志内容
	 */
	gameLogBroadcast(log: string): void;

	/**
	 * 广播消息给所有玩家
	 * @param msg - 服务器消息
	 */
	gameBroadcast(msg: ServerSocketMessage): void;

	/**
	 * 设置当前事件名称
	 * @param eventName - 事件名称
	 */
	setCurrentEventName(eventName: string): void;

	// ===== 对话框交互 =====

	/**
	 * 显示确认对话框
	 * @param playerId - 玩家 ID
	 * @param option - 对话框选项
	 * @param config - 配置选项（超时时间和默认值）
	 * @returns 对话框结果
	 */
	showConfirmDialog(
		playerId: string,
		option: ConfirmDialogOption,
		config?: { timeout?: number; defaultValue?: ConfirmDialogResult }
	): Promise<ConfirmDialogResult>;

	/**
	 * 显示表单对话框
	 * @param playerId - 玩家 ID
	 * @param option - 表单对话框选项
	 * @param config - 配置选项（超时时间和默认值）
	 * @returns 表单对话框结果
	 */
	showFormDialog<F extends FormField<string, any>[]>(
		playerId: string,
		option: FormDialogOption<F>,
		config?: { timeout?: number; defaultValue?: FormDialogResult<F> }
	): Promise<FormDialogResult<F>>;

	/**
	 * 显示目标选择对话框
	 * @param playerId - 玩家 ID
	 * @param option - 对话框选项
	 * @param config - 配置选项（超时时间和默认值）
	 * @returns 对话框结果
	 */
	showTargetSelectDialog<I extends TargetSelectType>(
		playerId: string,
		option: TargetSelectDialogOption<I>,
		config?: { timeout?: number; defaultValue?: TargetSelectDialogResult<I> }
	): Promise<TargetSelectDialogResult<I>>;

	/**
	 * 显示物品选择对话框
	 * @param playerId - 玩家 ID
	 * @param option - 对话框选项
	 * @param config - 配置选项（超时时间和默认值）
	 * @returns 对话框结果
	 */
	showItemSelectDialog(
		playerId: string,
		option: ItemSelectDialogOption,
		config?: { timeout?: number; defaultValue?: ItemSelectDialogResult }
	): Promise<ItemSelectDialogResult>;

	/**
	 * 显示消息卡片
	 * @param playerIds - 玩家 ID 列表
	 * @param option - 消息卡片选项
	 */
	showMessageCard(playerIds: string[], option: MessageCardOption): Promise<void>;

	/**
	 * 主动向 AI 推送一组合法候选动作，由 AI 返回选择结果
	 * 仅对 AI 玩家生效；非 AI 玩家返回 null。
	 * @param playerId - 玩家 ID
	 * @param prompt - 决策请求
	 */
	requestAIDecision(playerId: string, prompt: AIDecisionPrompt): Promise<AIDecisionSelection | null>;

	// ===== 动态按钮管理 =====

	/**
	 * 为指定玩家注册动态按钮
	 * @param playerId - 玩家 ID
	 * @param text - 按钮文案
	 * @param callback - 点击回调函数
	 * @returns ButtonController - 按钮控制实例
	 */
	registerPlayerButton(
		playerId: string,
		text: string,
		callback: () => Promise<void> | void
	): ButtonController;

	/**
	 * 设置按钮启用状态
	 * @param playerId - 玩家 ID
	 * @param buttonId - 按钮 ID
	 * @param enabled - 是否启用
	 */
	setButtonEnabled(playerId: string, buttonId: string, enabled: boolean): void;

	/**
	 * 设置按钮可见性
	 * @param playerId - 玩家 ID
	 * @param buttonId - 按钮 ID
	 * @param visible - 是否可见
	 */
	setButtonVisible(playerId: string, buttonId: string, visible: boolean): void;

	/**
	 * 更新按钮文案
	 * @param playerId - 玩家 ID
	 * @param buttonId - 按钮 ID
	 * @param text - 新的按钮文案
	 */
	setButtonText(playerId: string, buttonId: string, text: string): void;

	/**
	 * 移除按钮
	 * @param playerId - 玩家 ID
	 * @param buttonId - 按钮 ID
	 */
	removeButton(playerId: string, buttonId: string): void;

	// ===== 游戏结束 =====

	/**
	 * 检查游戏是否结束
	 */
	checkGameOver(): Promise<void>;

	// ===== 动态地图事件管理 =====

	/**
	 * 运行时动态添加地图事件
	 * @param mapEvent - 地图事件（含 effectCode TypeScript 代码）
	 */
	addRuntimeMapEvent(mapEvent: MapEvent): void;

	/**
	 * 运行时动态移除地图事件
	 * @param mapEventId - 事件 ID
	 */
	removeRuntimeMapEvent(mapEventId: string): void;

	/**
	 * 运行时动态关联地图事件到地块（支持 1:N，同一事件可关联多个地块）
	 * @param mapItemId - 地块 ID
	 * @param mapEventId - 事件 ID（可以是地图自带的已有事件）
	 */
	linkMapEvent(mapItemId: string, mapEventId: string): void;

	/**
	 * 运行时取消地块的事件关联
	 * @param mapItemId - 地块 ID
	 */
	unlinkMapEvent(mapItemId: string): void;
}

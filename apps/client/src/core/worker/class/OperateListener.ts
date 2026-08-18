import { OperateType, PlayerOperationResult } from "@mine-monopoly/types";

/**
 * 操作监听器项类型
 */
type OperateListenerItem = {
	isOnce: boolean;
	fn: Function;
};

/**
 * 事件映射类型
 */
type EventMap = Map<OperateType, OperateListenerItem[]>;

/**
 * 定时器数据结构
 */
type TimerData = {
	playerId: string;
	eventType: OperateType;
	timeoutId: ReturnType<typeof setTimeout>;
	intervalId?: ReturnType<typeof setInterval>;
	startTime: number;
	totalPausedTime: number;
	timeout: number;
	/** 超时/恢复时用于结束等待 Promise 的 resolve（防止暂停恢复后 Promise 永久悬挂） */
	resolve?: (value: any) => void;
	/** 超时后返回的默认值 */
	defaultValue?: any;
};

/**
 * 倒计时信息类型
 */
export type TimeoutInfo = {
	playerId: string;
	remainingMs: number;
	totalTime: number;
};

/**
 * 常量配置
 */
const DEFAULT_TIMEOUT = 15000; // 默认超时时间（毫秒）
const BROADCAST_INTERVAL = 1000; // 倒计时间隔（毫秒）

/**
 * 操作监听器类
 * 负责管理玩家操作监听、超时倒计时和事件触发
 */
export class OperateListener {
	private eventMap: Map<string, EventMap> = new Map();
	private timerIdCounter: number = 0;
	private isPaused: boolean = false;
	/** 本次暂停开始的时间戳（null 表示当前未处于暂停状态） */
	private pauseStartedAt: number | null = null;
	private activeTimers: Map<string, TimerData> = new Map();

	// 回调函数
	private globalTickCallback: ((timeouts: TimeoutInfo[]) => void) | null = null;
	private timeoutCallback: ((playerId: string, eventType: OperateType) => void) | null = null;

	constructor() {}

	/* ==================== 监听器管理方法 ==================== */

	/**
	 * 设置操作监听器
	 */
	private setOperateListener<T extends OperateType>(
		playerId: string,
		eventType: T,
		fn: (args: PlayerOperationResult[T]) => void,
		isOnce: boolean,
	): void {
		if (!this.eventMap.has(playerId)) {
			this.eventMap.set(playerId, new Map());
		}
		const eventTypeMap = this.eventMap.get(playerId)!;
		if (!eventTypeMap.has(eventType)) {
			eventTypeMap.set(eventType, []);
		}
		eventTypeMap.get(eventType)!.push({ isOnce, fn });
	}

	/**
	 * 添加持续监听器
	 */
	public on<T extends OperateType>(
		playerId: string,
		eventType: T,
		listener: (res: PlayerOperationResult[T]) => void,
	): void {
		this.setOperateListener(playerId, eventType, listener, false);
	}

	/**
	 * 添加一次性监听器
	 */
	public once<T extends OperateType>(
		playerId: string,
		eventType: T,
		listener: (res: PlayerOperationResult[T]) => void,
	): void {
		this.setOperateListener(playerId, eventType, listener, true);
	}

	/**
	 * 异步等待操作（持续监听）
	 */
	public onAsync<T extends OperateType>(playerId: string, eventType: T): Promise<PlayerOperationResult[T]> {
		return new Promise((resolve) => {
			this.setOperateListener(playerId, eventType, resolve, false);
		});
	}

	/**
	 * 异步等待操作（一次性监听）
	 */
	public onceAsync<T extends OperateType>(playerId: string, eventType: T): Promise<PlayerOperationResult[T]> {
		return new Promise((resolve) => {
			this.setOperateListener(playerId, eventType, resolve, true);
		});
	}

	/**
	 * 移除指定监听器
	 */
	public remove<T extends OperateType>(
		playerId: string,
		eventType: T,
		listener: (...args: any[]) => PlayerOperationResult[T],
	): void {
		const playerEvents = this.eventMap.get(playerId);
		if (!playerEvents) return;

		const eventTypeMap = playerEvents.get(eventType);
		if (!eventTypeMap) return;

		const removeIndex = eventTypeMap.findIndex((fobj) => fobj.fn === listener);
		if (removeIndex !== -1) {
			eventTypeMap.splice(removeIndex, 1);
			// 如果该事件类型下没有监听器了，清理关联的计时器
			if (eventTypeMap.length === 0) {
				this.clearTimersByEvent(playerId, eventType);
			}
		}
	}

	/**
	 * 移除玩家所有监听器或指定类型的监听器
	 */
	public removeAll(playerId: string, eventType?: OperateType): void {
		const playerEvents = this.eventMap.get(playerId);
		if (!playerEvents) return;

		if (eventType) {
			playerEvents.delete(eventType);
		} else {
			this.eventMap.delete(playerId);
		}
		// 清理关联的计时器
		this.clearTimersByEvent(playerId, eventType);
	}

	/**
	 * 触发事件
	 */
	public emit<T extends OperateType>(
		playerId: string,
		eventType: T,
		args?: PlayerOperationResult[T],
	): boolean {
		const playerEvents = this.eventMap.get(playerId);
		if (!playerEvents) return false;

		const eventTypeMap = playerEvents.get(eventType);
		if (!eventTypeMap) return false;

		for (let index = 0; index < eventTypeMap.length; index++) {
			const listener = eventTypeMap[index];
			listener.fn.apply(null, [args]);
			if (listener.isOnce) {
				eventTypeMap.splice(index, 1);
				index--;
			}
		}
		return true;
	}

	public hasListener(playerId: string, eventType: OperateType): boolean {
		const playerEvents = this.eventMap.get(playerId);
		if (!playerEvents) return false;

		const eventTypeMap = playerEvents.get(eventType);
		return !!eventTypeMap?.length;
	}

	/* ==================== 回调设置方法 ==================== */

	/**
	 * 设置倒计时广播回调
	 * @param callback 回调函数，接收当前所有活跃倒计时信息
	 */
	public setGlobalTickCallback(callback: (timeouts: TimeoutInfo[]) => void): void {
		this.globalTickCallback = callback;
		// 如果已经有活跃的定时器，立即广播一次
		if (this.activeTimers.size > 0) {
			this.broadcastAllTimeouts();
		}
	}

	/**
	 * 设置超时回调
	 * @param callback 回调函数，接收超时的玩家ID和事件类型
	 */
	public setTimeoutCallback(callback: (playerId: string, eventType: OperateType) => void): void {
		this.timeoutCallback = callback;
	}

	/* ==================== 超时与倒计时方法 ==================== */

	/**
	 * 带超时的异步操作等待
	 * @param playerId 玩家ID
	 * @param eventType 事件类型
	 * @param options 配置选项
	 * @returns 操作结果或默认值
	 */
	public async onceAsyncWithTimeout<T extends OperateType>(
		playerId: string,
		eventType: T,
		options: {
			timeout?: number;
			defaultValue: PlayerOperationResult[T];
		},
	): Promise<PlayerOperationResult[T]> {
		const timeout = options.timeout ?? DEFAULT_TIMEOUT;
		const timerKey = this.generateTimerKey();
		const startTime = Date.now();

		return new Promise((resolve) => {
			// 创建操作监听器
			const listener = (data: PlayerOperationResult[T]) => {
				this.clearTimer(timerKey);
				resolve(data);
			};

			this.once(playerId, eventType, listener);

			// 设置超时定时器
			const timeoutId = setTimeout(() => {
				this.clearTimer(timerKey);
				this.removeAll(playerId, eventType);
				// 通知服务器发生了超时
				this.timeoutCallback?.(playerId, eventType);
				resolve(options.defaultValue);
			}, timeout);

			// 保存定时器数据
			this.activeTimers.set(timerKey, {
				playerId,
				eventType,
				timeoutId,
				intervalId: undefined,
				startTime,
				totalPausedTime: 0,
				timeout,
				resolve: (value) => resolve(value as PlayerOperationResult[T]),
				defaultValue: options.defaultValue,
			});

			// 设置倒计时间隔（如果需要广播）
			if (this.globalTickCallback) {
				this.broadcastAllTimeouts(); // 立即广播一次
				const intervalId = setInterval(() => {
					this.broadcastAllTimeouts();
				}, BROADCAST_INTERVAL);
				// 更新定时器的 intervalId
				const timerData = this.activeTimers.get(timerKey);
				if (timerData) {
					timerData.intervalId = intervalId;
				}
			}
		});
	}

	/**
	 * 广播所有活跃倒计时
	 */
	private broadcastAllTimeouts(): void {
		if (!this.globalTickCallback || this.isPaused) return;

		const now = Date.now();
		const timeouts: TimeoutInfo[] = Array.from(this.activeTimers.values()).map((timerData) => {
			const elapsed = now - timerData.startTime - timerData.totalPausedTime;
			const remaining = Math.max(0, timerData.timeout - elapsed);
			return {
				playerId: timerData.playerId,
				remainingMs: remaining,
				totalTime: timerData.timeout,
			};
		});

		this.globalTickCallback(timeouts);
	}

	/* ==================== 暂停/恢复方法 ==================== */

	/**
	 * 暂停所有倒计时
	 */
	public pause(): void {
		if (this.isPaused) return; // 防止重复暂停
		this.isPaused = true;
		this.pauseStartedAt = Date.now();

		this.activeTimers.forEach((timerData) => {
			clearTimeout(timerData.timeoutId);
			if (timerData.intervalId) {
				clearInterval(timerData.intervalId);
			}
		});
	}

	/**
	 * 恢复所有倒计时
	 */
	public resume(): void {
		if (!this.isPaused) return;
		this.isPaused = false;

		const now = Date.now();
		// 累计本次暂停时长，确保剩余时间不包含暂停期间（修复暂停后剩余时间被错误清零的问题）
		const pausedDuration = this.pauseStartedAt !== null ? now - this.pauseStartedAt : 0;
		this.pauseStartedAt = null;

		this.activeTimers.forEach((timerData, timerKey) => {
			timerData.totalPausedTime += pausedDuration;
			const elapsed = now - timerData.startTime - timerData.totalPausedTime;
			const remaining = timerData.timeout - elapsed;

			// 如果暂停期间已经超时，立即触发超时并结束等待（修复 Promise 永久悬挂）
			if (remaining <= 0) {
				this.removeAll(timerData.playerId, timerData.eventType);
				this.clearTimer(timerKey);
				this.timeoutCallback?.(timerData.playerId, timerData.eventType);
				timerData.resolve?.(timerData.defaultValue);
				return;
			}

			// 重新设置超时定时器（到期后同样要触发超时回调并结束等待）
			timerData.timeoutId = setTimeout(() => {
				this.clearTimer(timerKey);
				this.removeAll(timerData.playerId, timerData.eventType);
				this.timeoutCallback?.(timerData.playerId, timerData.eventType);
				timerData.resolve?.(timerData.defaultValue);
			}, remaining);

			// 重新设置倒计时间隔
			if (this.globalTickCallback) {
				timerData.intervalId = setInterval(() => {
					this.broadcastAllTimeouts();
				}, BROADCAST_INTERVAL);
				this.broadcastAllTimeouts(); // 立即广播一次
			}
		});
	}

	/**
	 * 清除所有定时器
	 */
	public clearAllTimers(): void {
		this.activeTimers.forEach((timerData) => {
			clearTimeout(timerData.timeoutId);
			if (timerData.intervalId) {
				clearInterval(timerData.intervalId);
			}
		});
		this.activeTimers.clear();
	}

	/* ==================== 私有辅助方法 ==================== */

	/**
	 * 生成唯一定时器键
	 */
	private generateTimerKey(): string {
		return `timer-${++this.timerIdCounter}`;
	}

	/**
	 * 清除指定定时器
	 */
	private clearTimer(timerKey: string): void {
		const timerData = this.activeTimers.get(timerKey);
		if (!timerData) return;

		clearTimeout(timerData.timeoutId);
		if (timerData.intervalId) {
			clearInterval(timerData.intervalId);
		}
		this.activeTimers.delete(timerKey);
	}

	/**
	 * 清理指定玩家和事件类型的所有计时器
	 */
	private clearTimersByEvent(playerId: string, eventType?: OperateType): void {
		const timersToDelete: string[] = [];

		this.activeTimers.forEach((timerData, timerKey) => {
			const shouldDelete = timerData.playerId === playerId && (!eventType || timerData.eventType === eventType);
			if (shouldDelete) {
				timersToDelete.push(timerKey);
			}
		});

		timersToDelete.forEach((timerKey) => this.clearTimer(timerKey));
	}
}

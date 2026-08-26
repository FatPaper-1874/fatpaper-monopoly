/**
 * 异步任务队列增强版
 * 支持重试、降级等错误处理机制
 */

export type EventSource<TYPE, DATA> = (
	callback: (data: DATA & { type: TYPE }) => void,
	cancle: (message: string) => void
) => Function;

export type MissionQueueItem<TYPE, DATA> = {
	type: TYPE;
	fn: (data: DATA & { type: TYPE }, cancle: (message: string) => void) => any | Promise<any>;
};

/**
 * 重试配置
 */
export interface RetryConfig {
	/** 最大重试次数 */
	maxRetries: number;
	/** 重试延迟（毫秒） */
	retryDelay: number;
	/** 可重试的错误类型/消息 */
	retryableErrors: string[];
}

/**
 * 执行策略
 */
export interface ExecutionStrategy {
	/** 重试配置 */
	retry?: RetryConfig;
	/** 失败后的降级函数 */
	fallback?: () => any | Promise<any>;
	/** 失败是否抛出异常 */
	throwOnFailure?: boolean;
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	retryDelay: 1000,
	retryableErrors: ['Network', 'Timeout', 'ECONNABORTED']
};

/**
 * 检查错误是否可重试
 */
function isRetryableError(error: Error, config: RetryConfig): boolean {
	if (config.retryableErrors.length === 0) {
		return true; // 如果没有指定，默认所有错误都可重试
	}

	const errorMessage = error.message;
	const errorName = error.name;

	return config.retryableErrors.some(keyword =>
		errorMessage.includes(keyword) || errorName.includes(keyword)
	);
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 执行带重试的异步任务
 */
async function executeWithRetry<T>(
	fn: () => Promise<T>,
	strategy: ExecutionStrategy = {}
): Promise<T> {
	const { retry = DEFAULT_RETRY_CONFIG, fallback, throwOnFailure = true } = strategy;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			// 检查是否可重试
			if (attempt < retry.maxRetries && isRetryableError(lastError, retry)) {
				// 指数退避：每次重试延迟翻倍
				const delayTime = retry.retryDelay * Math.pow(2, attempt);
				await delay(delayTime);
				continue;
			}

			break; // 不可重试或达到最大重试次数
		}
	}

	// 所有重试都失败，尝试降级
	if (fallback) {
		try {
			return await fallback();
		} catch (fallbackError) {
			console.error('[asyncMission] 降级函数也失败了:', fallbackError);
			lastError = fallbackError as Error;
		}
	}

	// 决定是否抛出异常
	if (throwOnFailure) {
		throw lastError || new Error('任务执行失败');
	}

	// 返回 undefined 作为兜底
	return undefined as T;
}

/**
 * 异步任务（增强版）
 * 支持重试和降级
 */
export async function asyncMission<TYPE, DATA>(
	eventSource: EventSource<TYPE, DATA>,
	handler: MissionQueueItem<TYPE, DATA>,
	strategy?: ExecutionStrategy
): Promise<any> {
	return executeWithRetry(async () => {
		return new Promise<any>((resolve, reject) => {
			let cancleHandler: Function | null = null;
			const _handler = async (data: DATA & { type: TYPE }) => {
				if (data.type === handler.type) {
					try {
						resolve(await handler.fn(data, cancle));
					} catch (e: any) {
						reject(e);
					}
				}

				cancleHandler && cancleHandler();
			};

			function cancle(e: string) {
				cancleHandler && cancleHandler();
				reject(new Error(e));
			}

			// 订阅事件源，传入 handler 回调函数
			cancleHandler = eventSource(_handler, cancle);
		});
	}, strategy);
}

/**
 * 通用的异步消息队列处理函数（增强版）
 * 支持队列级别的重试和降级
 */
export async function asyncMissionQueue<TYPE, DATA>(
	eventSource: EventSource<TYPE, DATA>,
	functionList: MissionQueueItem<TYPE, DATA>[],
	strategy?: ExecutionStrategy
): Promise<string> {
	return executeWithRetry(async () => {
		return new Promise((resolve, reject) => {
			function* fnQueue() {
				while (functionList.length !== 0) {
					yield functionList.shift();
				}
			}

			const queueIterator = fnQueue();
			let queueResult = queueIterator.next();
			let currentFunctionObj = queueResult.value;
			let cancleHandler: Function | null = null;

			// 通用的事件处理器
			const handler = async (data: DATA & { type: TYPE }) => {
				if (!queueResult.done && currentFunctionObj) {
					if (data.type === currentFunctionObj.type) {
						try {
							await currentFunctionObj.fn(data, cancle);
						} catch (e: any) {
							reject(e);
							return;
						}
						queueResult = queueIterator.next();
						currentFunctionObj = queueResult.value;
					}
				}

				// 如果所有函数都已执行完毕
				if (queueResult.done) {
					// 取消监听
					cancleHandler && cancleHandler();
					resolve("done");
				}
			};

			function cancle(e: string) {
				cancleHandler && cancleHandler();
				reject(new Error(e));
			}

			// 订阅事件源，传入 handler 回调函数
			cancleHandler = eventSource(handler, cancle);
		});
	}, strategy);
}

/**
 * 创建执行策略
 */
export function createExecutionStrategy(config?: Partial<ExecutionStrategy>): ExecutionStrategy {
	return {
		retry: config?.retry ?? DEFAULT_RETRY_CONFIG,
		fallback: config?.fallback,
		throwOnFailure: config?.throwOnFailure ?? true
	};
}

/**
 * 创建重试配置
 */
export function createRetryConfig(config?: Partial<RetryConfig>): RetryConfig {
	return {
		maxRetries: config?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
		retryDelay: config?.retryDelay ?? DEFAULT_RETRY_CONFIG.retryDelay,
		retryableErrors: config?.retryableErrors ?? DEFAULT_RETRY_CONFIG.retryableErrors
	};
}

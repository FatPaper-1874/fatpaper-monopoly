import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { env } from "@mine-monopoly/env";
import { FPMessage } from "@mine-monopoly/ui";
import { clearAuthAndRedirect, getRefreshToken, setToken, setRefreshToken } from "@src/utils/auth";
import type { ApiResponse } from "@mine-monopoly/types";
import logService, { ErrorCategory, ErrorLevel } from "@src/utils/log";

// 扩展 axios 配置：允许后台轮询/心跳类请求标记 silent，错误时跳过全局 toast
declare module "axios" {
	export interface AxiosRequestConfig {
		/** 静默模式：请求失败时不通过全局拦截器弹 toast（用于心跳、状态轮询等后台请求） */
		silent?: boolean;
	}
}

// 获取 API 基础 URL
const getApiBaseUrl = () => {
	const protocol = env("PROTOCOL");
	const domain = env("MONOPOLY_DOMAIN");
	const prefix = env("API_BASE_PREFIX", "");
	const port = env<number>("SERVER_PORT");

	// 如果有前缀，使用路径模式（不需要端口）
	if (prefix) {
		return `${protocol}://${domain}${prefix}`;
	}
	// 否则使用端口模式
	return `${protocol}://${domain}:${port}`;
};

const apiClient = axios.create({
	baseURL: getApiBaseUrl(),
	timeout: 15000,
});

// Symbol 标记：用于标记已在拦截器中处理过的错误
// 避免 main.ts 的 unhandledrejection 重复显示错误消息
const AXIOS_HANDLED_ERROR = Symbol("__axios_handled_error__");

// 导出标记，供 main.ts 使用
export { AXIOS_HANDLED_ERROR };

// --- Token 刷新机制 ---

let refreshPromise: Promise<boolean> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 过期前 5 分钟刷新

export function doRefresh(): Promise<boolean> {
	if (refreshPromise) return refreshPromise;

	const refreshToken = getRefreshToken();
	if (!refreshToken) {
		return Promise.resolve(false);
	}

	refreshPromise = axios
		.post(`${getApiBaseUrl()}/user/refresh-token`, { refreshToken })
		.then((res) => {
			const data = res.data?.data;
			if (data?.token && data?.refreshToken) {
				setToken(data.token);
				setRefreshToken(data.refreshToken);
				return true;
			}
			return false;
		})
		.catch(() => false)
		.finally(() => {
			refreshPromise = null;
		});

	return refreshPromise;
}

export function startTokenRefreshTimer() {
	stopTokenRefreshTimer();
	refreshTimer = setTimeout(async () => {
		const success = await doRefresh();
		if (success) {
			startTokenRefreshTimer();
		} else {
			clearAuthAndRedirect();
		}
	}, 30 * 60 * 1000 - REFRESH_BEFORE_EXPIRY_MS);
}

export function stopTokenRefreshTimer() {
	if (refreshTimer) {
		clearTimeout(refreshTimer);
		refreshTimer = null;
	}
}

/**
 * 确保用户凭证有效，先尝试刷新 token，成功后再获取用户信息。
 * 适用于登录页和房间列表页等需要验明身份的场景。
 *
 * @returns 用户信息对象，若凭证无效则返回 null（已自动跳转登录页）
 */
export async function ensureValidAuth(): Promise<{
	id: string;
	useraccount: string;
	username: string;
	avatar: string;
	color: string;
} | null> {
	const token = localStorage.getItem("token");
	if (!token) return null;

	const refreshed = await doRefresh();
	if (!refreshed) {
		FPMessage({ type: "error", message: "登录凭证已过期，请重新登录" });
		clearAuthAndRedirect();
		return null;
	}

	try {
		const { getUserByToken } = await import("@src/utils/api/user");
		return await getUserByToken(token);
	} catch {
		clearAuthAndRedirect();
		return null;
	}
}

// 页面从后台切回前台时检查 token 是否需要刷新
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		const token = localStorage.getItem("token");
		if (!token) return;
		try {
			const payload = JSON.parse(atob(token.split(".")[1]));
			const expiresAt = payload.exp;
			if (expiresAt && Date.now() > expiresAt - REFRESH_BEFORE_EXPIRY_MS) {
				doRefresh().then((ok) => {
					if (ok) startTokenRefreshTimer();
				});
			}
		} catch {
			// token 解析失败，忽略
		}
	}
});

// --- 拦截器 ---

// 请求拦截器
apiClient.interceptors.request.use(
	(config) => {
		const token = localStorage.getItem("token");
		if (token && config.headers) {
			config.headers["Authorization"] = token;
		}
		return config;
	},
	(error: AxiosError) => Promise.reject(error)
);

// 响应拦截器 - 成功
apiClient.interceptors.response.use(
	(response: AxiosResponse<ApiResponse>) => {
		const { msg, status } = response.data;
		if (msg && status === 200) {
			FPMessage({ type: "success", message: msg });
		}
		return response.data as any;
	},
	// 响应拦截器 - 错误
	async (error: AxiosError) => {
		const originalConfig = error.config as InternalAxiosRequestConfig | undefined;
		let message = "";
		let showErrorMessage = true;
		let errorLevel: ErrorLevel = ErrorLevel.ERROR;
		let errorCategory: ErrorCategory = ErrorCategory.UNKNOWN;

		// 1. 处理网络错误和超时
		if (!error.response) {
			errorCategory = ErrorCategory.NETWORK;
			if (error.code === "ECONNABORTED") {
				message = "请求超时，请检查网络连接";
				errorLevel = ErrorLevel.WARNING;
			} else {
				message = "网络错误，请检查网络连接";
				errorLevel = ErrorLevel.ERROR;
			}
		}
		// 2. 处理 HTTP 错误
		else {
			const { status, data } = error.response;

			switch (status) {
				case 400:
					message = (data as any)?.msg || "请求参数错误";
					errorCategory = ErrorCategory.UNKNOWN;
					errorLevel = ErrorLevel.WARNING;
					break;
				case 401: {
					errorCategory = ErrorCategory.AUTH;
					errorLevel = ErrorLevel.FATAL;
					message = (data as any)?.msg || "登录凭证已过期，请重新登录";
					// 刷新请求本身失败，直接跳登录
					if (originalConfig?.url?.includes("/user/refresh-token")) {
						clearAuthAndRedirect();
						break;
					}
					// 尝试刷新 token
					const refreshed = await doRefresh();
					if (refreshed && originalConfig) {
						// 用新 token 重试原请求
						originalConfig.headers["Authorization"] = localStorage.getItem("token");
						return apiClient.request(originalConfig);
					}
					// 刷新失败，跳登录（不在此提示，由调用层负责）
					showErrorMessage = false;
					clearAuthAndRedirect();
					break;
				}
				case 403:
					message = (data as any)?.msg || "没有权限访问";
					errorCategory = ErrorCategory.AUTH;
					errorLevel = ErrorLevel.FATAL;
					break;
				case 404:
					message = (data as any)?.msg || "请求的资源不存在";
					errorCategory = ErrorCategory.UNKNOWN;
					errorLevel = ErrorLevel.WARNING;
					break;
				case 500:
				case 502:
				case 503:
				case 504:
					message = (data as any)?.msg || "服务器内部错误";
					errorCategory = ErrorCategory.NETWORK;
					errorLevel = ErrorLevel.ERROR;
					break;
				default:
					message = (data as any)?.msg || `请求失败(${status})`;
					errorCategory = ErrorCategory.NETWORK;
					errorLevel = ErrorLevel.ERROR;
			}
		}

		// 显示错误消息（必须在日志记录之前，防止日志异常导致消息丢失）
		// silent 标记的请求（心跳/轮询）失败时不弹 toast，由调用方自行处理
		if (showErrorMessage && message && !(originalConfig as InternalAxiosRequestConfig | undefined)?.silent) {
			FPMessage({ type: "error", message });
		}

		// 标记错误已在拦截器中处理
		// 避免 main.ts 的 unhandledrejection 重复显示
		(error as any)[AXIOS_HANDLED_ERROR] = true;

		// 记录错误日志（放在 try-catch 中，防止 FormData 等不可序列化数据导致日志写入异常中断错误处理流程）
		try {
			await logService.error({
				category: errorCategory,
				message,
				stack: error.stack,
				context: {
					requestConfig: originalConfig ? {
						url: originalConfig.url ?? "",
						method: originalConfig.method ?? "",
						data: originalConfig.data instanceof FormData ? "[FormData]" : originalConfig.data
					} : undefined,
					responseInfo: error.response ? {
						status: error.response.status,
						statusText: error.response.statusText,
						data: error.response.data
					} : undefined
				}
			});
		} catch {
			// 日志记录失败不应影响业务流程
		}

		return Promise.reject(error);
	}
);

export default apiClient;

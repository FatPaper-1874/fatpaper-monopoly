/**
 * Electron 平台实现
 *
 * 从 preload 暴露的 electronAPI 中读取，
 * 封装为统一的 PlatformAPI 接口。
 */
import type { PlatformAPI } from "../types";

/**
 * 创建 Electron 平台的 PlatformAPI 实现
 *
 * 委托给 preload 通过 contextBridge 暴露的 window.electronAPI。
 */
export function createElectronPlatform(): PlatformAPI {
	const api = (window as any).electronAPI;

	return {
		// 窗口控制
		minimize: api?.minimize?.bind(api),
		maximize: api?.maximize?.bind(api),
		unmaximize: api?.unmaximize?.bind(api),
		close: api?.close?.bind(api),
		isMaximized: api?.isMaximized?.bind(api),

		// 版本
		getVersion: () => api?.getVersion?.() ?? __APP_VERSION__,

		// 全屏
		onFullScreenChange: (cb: (isFull: boolean) => void) => api?.onFullScreenChange?.(cb),

		// 日志
		logError: (data) => api?.logError?.(data),
		logConsole: (data) => api?.logConsole?.(data),
		logNetwork: (data) => api?.logNetwork?.(data),
		openLogsFolder: () => api?.openLogsFolder?.(),

		// 历史日志（从主进程文件加载，Electron 专属）
		getHistoryLogs: api?.getLogs?.bind(api) as any,

		// 地图缓存（Electron 专属，走主进程文件系统）
		loadMapCache: (mapId, hash) => api?.loadMapCache?.(mapId, hash),
		saveMapCache: (mapId, hash, buffer, maxSizeBytes) => api?.saveMapCache?.(mapId, hash, buffer, maxSizeBytes),
		getMapCacheStat: () => api?.getMapCacheStat?.(),
		clearMapCache: () => api?.clearMapCache?.(),
		openMapCacheFolder: () => api?.openMapCacheFolder?.(),

		// 本地地图仓库
		importLocalMap: () => api?.importLocalMap?.(),
		scanLocalMaps: () => api?.scanLocalMaps?.(),
		findLocalMapByHash: (input) => api?.findLocalMapByHash?.(input),
		saveReceivedLocalMap: (input) => api?.saveReceivedLocalMap?.(input),
		openLocalMapDirectory: () => api?.openLocalMapDirectory?.(),
		getLocalMapDirectoryStatus: () => api?.getLocalMapDirectoryStatus?.(),

		// 开发者
		openInspector: api?.openInspector?.bind(api),
		openAIConsole: api?.openAIConsole?.bind(api),
	};
}

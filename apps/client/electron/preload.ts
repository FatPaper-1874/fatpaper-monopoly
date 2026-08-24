import { ipcRenderer, contextBridge } from "electron";
import { version } from "../package.json";

// --------- 错误日志类型定义 ---------
export interface LogErrorData {
	type: "Vue" | "Promise" | "Runtime" | "Worker" | "Network" | "Console";
	message: string;
	stack?: string;
	info?: string; // Vue 错误的额外信息
	filename?: string; // Runtime 错误的文件名
	lineno?: number; // Runtime 错误的行号
	colno?: number; // Runtime 错误的列号
	url?: string; // Network 错误的 URL
	method?: string; // Network 请求方法
	status?: number; // Network 状态码
	timestamp?: string;
	additionalData?: Record<string, any>;
}

export interface LogConsoleData {
	level: "error" | "warn" | "info";
	message: string;
	stack?: string;
}

export interface LogNetworkData {
	url: string;
	method: string;
	status?: number;
	error: string;
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld("electronAPI", {
	//窗口事件相关
	minimize: () => ipcRenderer.send("window-minimize"),
	isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
	maximize: () => ipcRenderer.send("window-maximize"),
	unmaximize: () => ipcRenderer.send("window-unmaximize"),
	close: () => ipcRenderer.send("window-close"),
	getVersion: () => version,
	onFullScreenChange: (callback: (isFull: boolean) => void) =>
		ipcRenderer.on("fullscreen-changed", (_, isFull) => callback(isFull)),
	//错误日志相关
	logError: (error: LogErrorData) => ipcRenderer.send("log-error", error),
	logConsole: (data: LogConsoleData) => ipcRenderer.send("log-console", data),
	logNetwork: (data: LogNetworkData) => ipcRenderer.send("log-network", data),
	openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
	openLogsFolder: () => ipcRenderer.invoke("open-logs-folder"),
	openAIConsole: () => ipcRenderer.invoke("open-ai-console"),
	//地图缓存相关
	loadMapCache: (mapId: string, hash: string) => ipcRenderer.invoke("map-cache:load", mapId, hash),
	saveMapCache: (mapId: string, hash: string, buffer: ArrayBuffer, maxSizeBytes?: number) =>
		ipcRenderer.invoke("map-cache:save", mapId, hash, buffer, maxSizeBytes),
	getMapCacheStat: () => ipcRenderer.invoke("map-cache:stat"),
	clearMapCache: () => ipcRenderer.invoke("map-cache:clear"),
	openMapCacheFolder: () => ipcRenderer.invoke("map-cache:open-folder"),
	// 本地地图仓库：主进程始终限制在 game-map 根目录中。
	importLocalMap: () => ipcRenderer.invoke("local-map:import"),
	scanLocalMaps: () => ipcRenderer.invoke("local-map:scan"),
	findLocalMapByHash: (input: { sha256: string; size: number }) => ipcRenderer.invoke("local-map:find-by-hash", input),
	saveReceivedLocalMap: (input: { sha256: string; format: "fpmap" | "mmmap"; fileName?: string; data: ArrayBuffer }) =>
		ipcRenderer.invoke("local-map:save-received", input),
	openLocalMapDirectory: () => ipcRenderer.invoke("local-map:open-folder"),
	getLocalMapDirectoryStatus: () => ipcRenderer.invoke("local-map:status"),
	// Inspector (dev only) — only exposed in dev mode
	...(process.env.VITE_DEV_SERVER_URL ? { openInspector: () => ipcRenderer.invoke("open-inspector") } : {}),
});

contextBridge.exposeInMainWorld("updateAPI", {
	// 触发操作
	checkForUpdate: () => ipcRenderer.invoke("check-for-update"),
	startDownload: () => ipcRenderer.invoke("start-download-update"),
	quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),

	// 监听状态
	onUpdateStatus: (callback: (data: any) => void) => {
		const subscription = (_: any, value: any) => callback(value);
		ipcRenderer.on("update-status", subscription);
		// 返回清理函数
		return () => ipcRenderer.removeListener("update-status", subscription);
	},
});

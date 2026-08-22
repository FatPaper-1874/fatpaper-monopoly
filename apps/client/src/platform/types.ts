/**
 * 通用平台 API 类型定义
 *
 * 统一所有平台（Electron / Capacitor / Web）的能力接口，
 * 各平台提供各自的实现模块。
 */

/** 平台类型 */
export type PlatformType = "electron" | "capacitor" | "mobile" | "web";

// ========== 日志数据类型 ==========

export interface LogErrorData {
	type: "Vue" | "Promise" | "Runtime" | "Worker" | "Network" | "Console" | string;
	message: string;
	stack?: string;
	info?: string;
	filename?: string;
	lineno?: number;
	colno?: number;
	url?: string;
	method?: string;
	status?: number;
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

// ========== 平台能力接口 ==========

/**
 * 平台 API — 各平台按需实现
 *
 * 窗口控制类方法（minimize / maximize / close 等）仅桌面平台有，标记为可选。
 */
export interface ImportLocalMapResult {
	status: "imported" | "duplicate" | "failed";
	fileName?: string;
	sha256?: string;
	size?: number;
	message?: string;
}

export interface LocalMapScanResult {
	files: number;
	indexed: number;
	updated: number;
	removed: number;
	message?: string;
}

export interface LocalMapDirectoryStatus {
	path: string;
	readable: boolean;
	writable: boolean;
}

export interface LocalMapLookupResult {
	found: boolean;
	fileName?: string;
	data?: ArrayBuffer;
	verifiedSha256?: string;
}

export interface PlatformAPI {
	// ---- 窗口控制（桌面平台） ----
	minimize?: () => void;
	maximize?: () => void;
	unmaximize?: () => void;
	close?: () => void;
	isMaximized?: () => Promise<boolean>;

	// ---- 版本 ----
	getVersion: () => string;

	// ---- 全屏 ----
	onFullScreenChange: (callback: (isFull: boolean) => void) => void;

	// ---- 日志 ----
	logError: (error: LogErrorData) => void;
	logConsole: (data: LogConsoleData) => void;
	logNetwork: (data: LogNetworkData) => void;
	openLogsFolder?: () => Promise<string>;

	/** Electron: 从主进程文件系统加载历史日志 */
	getHistoryLogs?: () => Promise<any[]>;

	// ---- 地图缓存（仅 Electron 平台实现，缺省时调用方降级为网络加载） ----
	/** 按 mapId + hash 加载缓存的地图文件，未命中返回 undefined */
	loadMapCache?: (mapId: string, hash: string) => Promise<ArrayBuffer | undefined>;
	/** 保存地图文件到缓存；maxSizeBytes 为最大缓存容量（默认 500MB），超限按 LRU 淘汰 */
	saveMapCache?: (mapId: string, hash: string, buffer: ArrayBuffer, maxSizeBytes?: number) => Promise<void>;
	/** 当前缓存占用（字节 + 文件数） */
	getMapCacheStat?: () => Promise<{ size: number; count: number }>;
	/** 清空缓存，返回清空后的占用 */
	clearMapCache?: () => Promise<{ size: number; count: number }>;
	/** 打开缓存文件夹 */
	openMapCacheFolder?: () => Promise<string>;

	// ---- 本地地图仓库（仅 Electron 平台实现） ----
	importLocalMap?: () => Promise<ImportLocalMapResult>;
	scanLocalMaps?: () => Promise<LocalMapScanResult>;
	findLocalMapByHash?: (input: { sha256: string; size: number }) => Promise<LocalMapLookupResult>;
	/** 仅接受已在渲染进程完成加载验证的 P2P 地图，写入固定仓库缓存。 */
	saveReceivedLocalMap?: (input: {
		sha256: string;
		format: "fpmap" | "mmmap";
		/** 房主原始文件名；主进程会校验安全性并在冲突时自动加序号。 */
		fileName?: string;
		data: ArrayBuffer;
	}) => Promise<void>;
	openLocalMapDirectory?: () => Promise<void>;
	getLocalMapDirectoryStatus?: () => Promise<LocalMapDirectoryStatus>;

	// ---- 开发者 ----
	openInspector?: () => Promise<void>;
	openAIConsole?: () => Promise<void>;
}

/** 更新 API 接口 */
export interface UpdateAPI {
	checkForUpdate: () => Promise<any>;
	startDownload: () => Promise<void>;
	quitAndInstall: () => Promise<void>;
	onUpdateStatus: (callback: (data: any) => void) => () => void;
}

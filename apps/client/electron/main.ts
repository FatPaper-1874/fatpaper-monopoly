import {
	app,
	ipcMain,
	BrowserWindow,
	Menu,
	dialog,
	OpenDialogOptions,
	SaveDialogOptions,
	protocol,
	net,
	shell,
} from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs/promises";
import fsSync from "fs";
import url from "node:url";
import { createHash } from "node:crypto";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import { loadUpdateSources, type UpdateSource } from "./update-config.js";
import { GMAction, GMActionResponseData } from "../src/interfaces/worker";

// ============================================================
// 更新源配置
// ============================================================
let currentUpdateSource: UpdateSource | null = null;
let isFallbackInProgress = false;

// --------- 错误日志处理 ---------

interface LogErrorData {
	type: "Vue" | "Promise" | "Runtime" | "Worker" | "Network" | "Console";
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

// 日志目录：在用户数据目录下（跨平台可写，兼容 macOS .app 包结构）
const logsDir = path.join(app.getPath("userData"), "logs");

// 增强的日志文件路径
const mainLogPath = path.join(logsDir, "main.log");
const errorLogPath = path.join(logsDir, "error.log");

// 日志文件健康检查
let logFileHealthy = true;
let lastLogCheck = 0;
const LOG_CHECK_INTERVAL = 60000; // 每分钟检查一次

// 本地时间格式化（YYYY-MM-DD HH:mm:ss）
function formatLocalTime(date: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 检查日志文件是否可写
async function checkLogFileHealth(): Promise<boolean> {
	const now = Date.now();
	if (now - lastLogCheck < LOG_CHECK_INTERVAL) {
		return logFileHealthy;
	}
	lastLogCheck = now;

	try {
		const testPath = path.join(logsDir, ".health-check");
		await fs.appendFile(testPath, `health-check-${now}\n`);
		await fs.unlink(testPath);
		logFileHealthy = true;
		return true;
	} catch (err) {
		logFileHealthy = false;
		console.error("[日志健康检查失败]:", err);
		// 尝试重新创建日志目录
		try {
			await fs.mkdir(logsDir, { recursive: true });
			logFileHealthy = true;
		} catch (retryErr) {
			console.error("[重建日志目录失败]:", retryErr);
		}
		return false;
	}
}

// 确保日志目录存在
async function ensureLogsDir() {
	try {
		await fs.mkdir(logsDir, { recursive: true });

		// 初始化日志文件
		const now = formatLocalTime();
		const header = `\n${"=".repeat(80)}\n应用启动: ${now}\nElectron 版本: ${process.versions.electron}\nChrome 版本: ${process.versions.chrome}\nNode 版本: ${process.versions.node}\n平台: ${process.platform}\n架构: ${process.arch}\n${"=".repeat(80)}\n\n`;

		await fs.appendFile(mainLogPath, header, "utf-8");
		await fs.appendFile(errorLogPath, header, "utf-8");
	} catch (err) {
		console.error("Failed to create logs directory:", err);
	}
}

// 格式化日志条目（增强版）
function formatLogEntry(error: LogErrorData): string {
	const timestamp = formatLocalTime();

	let log = `\n[${timestamp}] [${error.type}]\n`;
	log += `消息: ${error.message}\n`;

	if (error.info) {
		log += `信息: ${error.info}\n`;
	}

	if (error.filename) {
		log += `文件: ${error.filename}:${error.lineno}:${error.colno}\n`;
	}

	if (error.url) {
		log += `URL: ${error.url}\n`;
		if (error.method) {
			log += `方法: ${error.method}\n`;
		}
		if (error.status) {
			log += `状态码: ${error.status}\n`;
		}
	}

	if (error.stack) {
		// 改进堆栈格式化
		log += `\n堆栈跟踪:\n`;
		const lines = error.stack.split("\n");
		for (const line of lines) {
			log += `  ${line}\n`;
		}
	}

	if (error.additionalData) {
		log += `\n附加数据:\n`;
		try {
			log += `  ${JSON.stringify(error.additionalData, null, 2)}\n`;
		} catch (err) {
			log += `  [无法序列化附加数据]\n`;
		}
	}

	log += "-".repeat(80) + "\n";
	return log;
}

// 同时写入主日志和错误日志
async function writeLogEntry(logEntry: string, isError: boolean = true): Promise<void> {
	const healthOk = await checkLogFileHealth();
	if (!healthOk) {
		console.error("[日志系统异常] 无法写入日志文件");
		return;
	}

	try {
		// 所有错误都写入主日志
		await fs.appendFile(mainLogPath, logEntry, "utf-8");
		// 错误也写入专门的错误日志
		if (isError) {
			await fs.appendFile(errorLogPath, logEntry, "utf-8");
		}
	} catch (err) {
		console.error("[写入日志失败]:", err);
		logFileHealthy = false;
	}
}

// 写入错误日志（增强版）
async function writeErrorLog(error: LogErrorData): Promise<string | null> {
	const logEntry = formatLogEntry(error);

	// 确定错误等级
	const isError = ["Vue", "Promise", "Runtime", "Worker"].includes(error.type);

	await writeLogEntry(logEntry, isError);

	// 返回日志文件路径用于显示
	return isError ? errorLogPath : mainLogPath;
}

autoUpdater.logger = log;
autoUpdater.autoDownload = false; // 关键：设为 false，防止游戏过程中自动抢网速
autoUpdater.autoInstallOnAppQuit = true; // 退出时自动安装

log.transports.file.level = "info";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

const isProduction = app.isPackaged;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;

let win: BrowserWindow | null;

function buildAppMenu() {
	if (process.platform !== "darwin") return;

	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: app.name,
			submenu: [
				{ role: "about" as any },
				{ type: "separator" },
				{ role: "services" as any, submenu: [] },
				{ type: "separator" },
				{ role: "hide" as any },
				{ role: "hideOthers" as any },
				{ role: "unhide" as any },
				{ type: "separator" },
				{ role: "quit" as any },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" as any },
				{ role: "redo" as any },
				{ type: "separator" },
				{ role: "cut" as any },
				{ role: "copy" as any },
				{ role: "paste" as any },
				{ role: "selectAll" as any },
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "toggleDevTools" as any },
				{ type: "separator" },
				{ role: "resetZoom" as any },
				{ role: "zoomIn" as any },
				{ role: "zoomOut" as any },
				{ type: "separator" },
				{ role: "togglefullscreen" as any },
			],
		},
		{
			label: "Window",
			submenu: [{ role: "minimize" as any }, { role: "zoom" as any }, { role: "close" as any }],
		},
	];

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function createWindow() {
	win = new BrowserWindow({
		width: 1200,
		height: 780,
		minWidth: 1200,
		minHeight: 780,
		webPreferences: {
			nodeIntegration: true,
			nodeIntegrationInWorker: false,
			contextIsolation: true,
			sandbox: false,
			enableBlinkFeatures: "WebRTC",
			preload: path.join(__dirname, "preload.mjs"),
			devTools: isProduction ? false : true,
			webSecurity: false,
			// 允许自动播放音频，无需用户交互
			autoplayPolicy: "no-user-gesture-required",
		},
		frame: false,
		...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" } : {}),
	});

	if (!isProduction) win.webContents.openDevTools();

	win.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", new Date().toLocaleString());
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL);
	} else {
		// win.loadFile("./dist/index.html");
		win.loadFile(path.join(RENDERER_DIST, "frontend/index.html")).catch((err) => {
			console.error("[加载页面失败]:", err);
			writeLogEntry(`[${formatLocalTime()}] [FATAL] 加载页面失败: ${err.message}\n`, true);
		});
	}

	win.on("enter-full-screen", () => {
		win!.webContents.send("fullscreen-changed", true);
	});

	win.on("leave-full-screen", () => {
		win!.webContents.send("fullscreen-changed", false);
	});

	autoUpdater.on("update-available", (info) => {
		win && win.webContents.send("update-status", {
			status: "available",
			info,
			sourceName: currentUpdateSource?.name,
		});
	});

	// 已经是最新
	autoUpdater.on("update-not-available", (info) => {
		win && win.webContents.send("update-status", {
			status: "not-available",
			info,
			sourceName: currentUpdateSource?.name,
		});
	});

	// 下载进度
	autoUpdater.on("download-progress", (progressObj) => {
		win && win.webContents.send("update-status", { status: "progress", progress: progressObj });
	});

	// 下载完成
	autoUpdater.on("update-downloaded", (info) => {
		win && win.webContents.send("update-status", { status: "downloaded", info });
	});

	// 错误 — fallback 期间的错误静默处理，由 checkForUpdatesWithFallback 循环接管
	autoUpdater.on("error", (err) => {
		if (isFallbackInProgress) return;
		win && win.webContents.send("update-status", { status: "error", error: err.message });
	});
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

// ===== 游戏进程控制台 (dev only) =====
let inspectorWin: BrowserWindow | null = null;
let aiConsoleWin: BrowserWindow | null = null;

async function executeInMainWindow<T>(script: string): Promise<T> {
	if (!win || win.isDestroyed()) {
		throw new Error("Main window not available");
	}
	return await win.webContents.executeJavaScript(script);
}

async function executeAIControlBridge<T>(callExpression: string, missingResult: string): Promise<T> {
	return await executeInMainWindow(
		"(async function() {" +
			"  const bridge = window.__aiControlBridge;" +
			"  if (!bridge) {" +
			`    return ${missingResult};` +
			"  }" +
			`  return await ${callExpression};` +
			"})()",
	);
}

ipcMain.handle("open-inspector", async () => {
	if (app.isPackaged) return;
	if (inspectorWin && !inspectorWin.isDestroyed()) {
		inspectorWin.focus();
		return;
	}

	inspectorWin = new BrowserWindow({
		width: 900,
		height: 700,
		title: "游戏进程控制台",
		frame: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	inspectorWin.loadFile(path.join(process.env.APP_ROOT!, "electron", "inspector.html"));
	inspectorWin.on("closed", () => {
		inspectorWin = null;
	});

	// Handle close button from inspector window
	ipcMain.on("close-inspector", () => {
		if (inspectorWin && !inspectorWin.isDestroyed()) {
			inspectorWin.close();
		}
	});
});

ipcMain.handle("open-ai-console", async () => {
	if (aiConsoleWin && !aiConsoleWin.isDestroyed()) {
		aiConsoleWin.focus();
		return;
	}

	aiConsoleWin = new BrowserWindow({
		width: 1360,
		height: 820,
		minWidth: 1040,
		minHeight: 700,
		title: "AI 控制台",
		frame: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	aiConsoleWin.loadFile(path.join(process.env.APP_ROOT!, "electron", "ai-console.html"));
	aiConsoleWin.on("closed", () => {
		aiConsoleWin = null;
	});
});

ipcMain.on("close-ai-console", () => {
	if (aiConsoleWin && !aiConsoleWin.isDestroyed()) {
		aiConsoleWin.close();
	}
});

ipcMain.handle("inspector:get-state", async () => {
	try {
		const result = await executeInMainWindow(
			"(function() {" +
				"  const bridge = window.__gpBridge;" +
				"  if (!bridge || typeof bridge.requestState !== 'function') {" +
				"    return { __error: 'GameProcess not started yet' };" +
				"  }" +
				"  return new Promise((resolve) => {" +
				"    const timeout = setTimeout(() => {" +
				"      bridge.onState = null;" +
				"      resolve({ __error: 'Timeout: Worker did not respond' });" +
				"    }, 3000);" +
				"    bridge.onState = (state) => {" +
				"      clearTimeout(timeout);" +
				"      bridge.onState = null;" +
				"      resolve(state);" +
				"    };" +
				"    bridge.requestState();" +
				"  });" +
				"})()",
		);
		return result;
	} catch (e: any) {
		return { __error: e.message };
	}
});

ipcMain.handle("inspector:gm-action", async (event, action: GMAction) => {
	try {
		const result = await executeInMainWindow(
			"(function() {" +
				"  const room = window.__roomInstance;" +
				"  if (!room || typeof room.gmAction !== 'function') {" +
				"    return { success: false, error: 'Room not available or gmAction not supported' };" +
				"  }" +
				"  return new Promise((resolve) => {" +
				"    room.gmAction(" + JSON.stringify(action) + ").then(resolve);" +
				"  });" +
				"})()"
		);
		return result;
	} catch (e: any) {
		return { success: false, error: e.message };
	}
});

ipcMain.handle("ai-console:get-state", async () => {
	try {
		return await executeAIControlBridge(
			"bridge.getSnapshot()",
			"{ __error: 'AI control bridge not available' }",
		);
	} catch (e: any) {
		return { __error: e.message };
	}
});

ipcMain.handle("ai-console:apply-config", async (_event, config) => {
	try {
		return await executeAIControlBridge(
			"bridge.applyConfig(" + JSON.stringify(config) + ")",
			"{ success: false, error: 'AI control bridge not available' }",
		);
	} catch (e: any) {
		return { success: false, error: e.message };
	}
});

ipcMain.handle("ai-console:set-player-binding", async (_event, payload: { userId: string; binding: unknown }) => {
	try {
		return await executeAIControlBridge(
			"bridge.setPlayerBinding(" +
				JSON.stringify(payload?.userId) +
				", " +
				JSON.stringify(payload?.binding ?? {}) +
				")",
			"{ success: false, error: 'AI control bridge not available' }",
		);
	} catch (e: any) {
		return { success: false, error: e.message };
	}
});

ipcMain.handle("ai-console:clear-usage", async () => {
	try {
		return await executeAIControlBridge(
			"bridge.clearUsage()",
			"{ success: false, error: 'AI control bridge not available' }",
		);
	} catch (e: any) {
		return { success: false, error: e.message };
	}
});

ipcMain.handle("ai-console:clear-memory", async (_event, payload: { playerId?: string } | undefined) => {
	try {
		const playerId = payload?.playerId ?? null;
		return await executeAIControlBridge(
			"bridge.clearMemory(" + JSON.stringify(playerId) + " || undefined)",
			"{ success: false, error: 'AI control bridge not available' }",
		);
	} catch (e: any) {
		return { success: false, error: e.message };
	}
});
// ===== End 游戏进程控制台 =====

app.whenReady().then(async () => {
	protocol.handle("local", (request) => {
		const filePath = request.url.slice("local://".length);
		return net.fetch(url.pathToFileURL(path.join(__dirname, filePath)).toString());
	});

	try {
		await ensureLogsDir();
		buildAppMenu();
		createWindow();
	} catch (err: any) {
		console.error("[应用初始化失败]:", err);
		await writeLogEntry(`[${formatLocalTime()}] [FATAL] 应用初始化失败: ${err.message}\n${err.stack || ""}\n`, true);
		throw err;
	}
});

ipcMain.on("window-minimize", () => {
	if (win) win.minimize();
});

ipcMain.on("window-maximize", () => {
	if (win) {
		if (win.isMaximized()) {
			win.unmaximize();
		} else {
			win.maximize();
		}
	}
});

ipcMain.on("window-close", () => {
	if (win) win.close();
});

ipcMain.handle("window-is-maximized", () => {
	return win ? win.isMaximized() : false;
});

ipcMain.handle("open-external", async (_event, targetUrl: string) => {
	await shell.openExternal(targetUrl);
});

const cacheDir = path.join(app.getPath("userData"), "map-cache");
const indexFile = path.join(cacheDir, "index.json");
/** 默认最大缓存容量 500MB */
const DEFAULT_MAX_CACHE_SIZE = 500 * 1024 * 1024;

/** index.json 条目：hash + 最后使用时间戳（用于 LRU 淘汰） */
interface CacheIndexEntry {
	hash: string;
	lastUsed: number;
}
type CacheIndex = Record<string, CacheIndexEntry>;

/**
 * 缓存键（mapId / hash）白名单校验：仅允许字母数字与 -_，且拒绝原型链危险键。
 * 防止通过 IPC 传入的 mapId/hash 拼入文件路径造成目录逃逸或原型污染。
 */
function isValidCacheKey(key: string): boolean {
	return /^[A-Za-z0-9_-]{1,128}$/.test(key) && key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

async function loadIndex(): Promise<CacheIndex> {
	try {
		const raw = await fs.readFile(indexFile, "utf-8");
		const parsed = JSON.parse(raw) as Record<string, string | CacheIndexEntry>;
		// 兼容旧格式：{ mapId: hash }（无 lastUsed），迁移为条目结构。
		// 使用无原型对象组装，杜绝 "__proto__" 等键触发原型污染。
		const index: CacheIndex = Object.create(null) as CacheIndex;
		for (const [mapId, value] of Object.entries(parsed)) {
			if (!isValidCacheKey(mapId)) continue;
			if (typeof value === "string") {
				if (isValidCacheKey(value)) index[mapId] = { hash: value, lastUsed: 0 };
			} else if (value && typeof value === "object" && typeof value.hash === "string" && isValidCacheKey(value.hash)) {
				index[mapId] = {
					hash: value.hash,
					lastUsed: typeof value.lastUsed === "number" ? value.lastUsed : 0,
				};
			}
		}
		return index;
	} catch {
		return Object.create(null) as CacheIndex;
	}
}

async function saveIndex(index: CacheIndex) {
	await fs.writeFile(indexFile, JSON.stringify(index, null, 2), "utf-8");
}

/** 统计缓存目录中 .bin 文件的总大小与数量 */
async function getCacheSize(): Promise<{ size: number; count: number }> {
	let size = 0;
	let count = 0;
	try {
		const entries = await fs.readdir(cacheDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".bin")) continue;
			const stat = await fs.stat(path.join(cacheDir, entry.name)).catch(() => null);
			if (stat) {
				size += stat.size;
				count += 1;
			}
		}
	} catch {
		// 目录不存在视为空缓存
	}
	return { size, count };
}

/** LRU 淘汰：按 lastUsed 升序删除缓存项，直到总大小低于 maxSizeBytes */
async function enforceCacheLimit(index: CacheIndex, maxSizeBytes: number) {
	const { size } = await getCacheSize();
	if (size <= maxSizeBytes) return;

	// lastUsed 为 0 的旧格式条目优先淘汰
	const entries = Object.entries(index).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
	for (const [mapId, entry] of entries) {
		const filePath = path.join(cacheDir, `${mapId}-${entry.hash}.bin`);
		await fs.rm(filePath, { force: true }).catch(() => {});
		delete index[mapId];
		const { size: currentSize } = await getCacheSize();
		if (currentSize <= maxSizeBytes) break;
	}
	await saveIndex(index);
}

ipcMain.handle("map-cache:save", async (_event, mapId: string, hash: string, buffer: ArrayBuffer, maxSizeBytes?: number) => {
	// hash 为空无法校验版本，不缓存（避免不同版本地图串用）；同时白名单校验防路径逃逸
	if (!isValidCacheKey(mapId) || !isValidCacheKey(hash)) return;

	// 容量上限钳制：非法值（NaN/Infinity/<=0）回退默认 500MB，超 10GB 硬顶
	const MAX_CACHE_LIMIT = 10240 * 1024 * 1024; // 与设置面板上限一致（10GB）
	const limit =
		Number.isFinite(maxSizeBytes) && maxSizeBytes! > 0
			? Math.min(maxSizeBytes!, MAX_CACHE_LIMIT)
			: DEFAULT_MAX_CACHE_SIZE;
	// 单文件超过容量上限则缓存无意义，直接拒绝（防止一次写入撑爆磁盘）
	if (!buffer || buffer.byteLength <= 0 || buffer.byteLength > limit) return;

	async function ensureCacheDir() {
		await fs.mkdir(cacheDir, { recursive: true });
	}

	await ensureCacheDir();
	const index = await loadIndex();
	const oldEntry = index[mapId];

	// 删除旧文件
	if (oldEntry && oldEntry.hash !== hash) {
		const oldFilePath = path.join(cacheDir, `${mapId}-${oldEntry.hash}.bin`);
		await fs.rm(oldFilePath, { force: true }).catch(() => {});
	}

	const filePath = path.join(cacheDir, `${mapId}-${hash}.bin`);
	await fs.writeFile(filePath, new Uint8Array(buffer));

	index[mapId] = { hash, lastUsed: Date.now() };
	await saveIndex(index);

	// 容量管理（未传时使用默认 500MB）
	await enforceCacheLimit(index, limit);
});

ipcMain.handle("map-cache:load", async (_event, mapId: string, hash: string) => {
	if (!isValidCacheKey(mapId) || !isValidCacheKey(hash)) return undefined;
	const index = await loadIndex();
	const entry = index[mapId];
	if (!entry || entry.hash !== hash) return undefined;

	const filePath = path.join(cacheDir, `${mapId}-${hash}.bin`);
	try {
		const buf = await fs.readFile(filePath);
		// 命中时刷新最后使用时间（LRU 依据）
		entry.lastUsed = Date.now();
		await saveIndex(index);
		// 返回精确大小的 ArrayBuffer，避免底层大 Buffer 内存一并传出
		return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	} catch {
		return undefined;
	}
});

/** 当前缓存占用统计（大小字节 + 文件数） */
ipcMain.handle("map-cache:stat", async () => {
	return getCacheSize();
});

/** 清空缓存目录并重置索引 */
ipcMain.handle("map-cache:clear", async () => {
	await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {});
	await fs.mkdir(cacheDir, { recursive: true });
	await saveIndex({});
	return getCacheSize();
});

/** 打开缓存文件夹（资源管理器中显示） */
ipcMain.handle("map-cache:open-folder", async () => {
	await fs.mkdir(cacheDir, { recursive: true });
	await shell.openPath(cacheDir);
	return cacheDir;
});


// ============================================================
// 本地地图仓库（固定在可执行文件同级 game-map/）
// ============================================================
type LocalMapFormat = "fpmap" | "mmmap";
type LocalMapSource = "imported" | "scanned" | "p2p-cache" | "server-cache";
interface LocalMapIndexEntry {
	fileName: string;
	format: LocalMapFormat;
	size: number;
	mtimeMs: number;
	sha256: string;
	addedAt: string;
	source: LocalMapSource;
	lastAccessedAt?: string;
}
interface LocalMapIndex {
	version: 1;
	updatedAt: string;
	entries: LocalMapIndexEntry[];
}
interface LocalMapDirectoryStatus {
	path: string;
	readable: boolean;
	writable: boolean;
}

const LOCAL_MAP_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const LOCAL_MAP_CACHE_MAX_SIZE = 500 * 1024 * 1024;

function getLocalMapDirectory(): string {
	return path.join(path.dirname(process.execPath), "game-map");
}

function getLocalMapIndexPath(): string {
	return path.join(getLocalMapDirectory(), "index.json");
}

function getLocalMapFormat(fileName: string): LocalMapFormat | undefined {
	const extension = path.extname(fileName).toLowerCase();
	if (extension === ".fpmap") return "fpmap";
	if (extension === ".mmmap") return "mmmap";
	return undefined;
}

function isSafeLocalMapFileName(fileName: string): boolean {
	return Boolean(getLocalMapFormat(fileName))
		&& fileName === path.basename(fileName)
		&& !fileName.includes("..")
		&& !fileName.includes("/")
		&& !fileName.includes("\\");
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function isLocalMapIndexEntry(value: unknown): value is LocalMapIndexEntry {
	if (!value || typeof value !== "object") return false;
	const entry = value as Partial<LocalMapIndexEntry>;
	return (
		typeof entry.fileName === "string"
		&& isSafeLocalMapFileName(entry.fileName)
		&& (entry.format === "fpmap" || entry.format === "mmmap")
		&& typeof entry.size === "number"
		&& Number.isFinite(entry.size)
		&& typeof entry.mtimeMs === "number"
		&& Number.isFinite(entry.mtimeMs)
		&& isSha256(entry.sha256)
		&& typeof entry.addedAt === "string"
		&& (entry.source === "imported" || entry.source === "scanned" || entry.source === "p2p-cache" || entry.source === "server-cache")
	);
}

async function getLocalMapDirectoryStatus(): Promise<LocalMapDirectoryStatus> {
	const directory = getLocalMapDirectory();
	try {
		await fs.mkdir(directory, { recursive: true });
	} catch {
		return { path: directory, readable: false, writable: false };
	}
	const readable = await fs.access(directory, fsSync.constants.R_OK).then(() => true).catch(() => false);
	const writable = await fs.access(directory, fsSync.constants.W_OK).then(() => true).catch(() => false);
	return { path: directory, readable, writable };
}

async function hashLocalMapFile(filePath: string): Promise<string> {
	const hash = createHash("sha256");
	await new Promise<void>((resolve, reject) => {
		const stream = fsSync.createReadStream(filePath);
		stream.on("data", (chunk: Buffer) => {
			const bytes = new Uint8Array(chunk.buffer as ArrayBuffer, chunk.byteOffset, chunk.byteLength);
			hash.update(bytes);
		});
		stream.on("error", reject);
		stream.on("end", resolve);
	});
	return `sha256:${hash.digest("hex")}`;
}

async function readLocalMapIndex(): Promise<LocalMapIndex> {
	try {
		const raw = JSON.parse(await fs.readFile(getLocalMapIndexPath(), "utf-8")) as Partial<LocalMapIndex>;
		if (raw.version !== 1 || !Array.isArray(raw.entries)) throw new Error("invalid local map index");
		return {
			version: 1,
			updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
			entries: raw.entries.filter(isLocalMapIndexEntry),
		};
	} catch {
		return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
	}
}

async function writeLocalMapIndex(index: LocalMapIndex): Promise<void> {
	const directoryStatus = await getLocalMapDirectoryStatus();
	if (!directoryStatus.writable) throw new Error("本地地图仓库目录不可写");
	const indexPath = getLocalMapIndexPath();
	const tempPath = `${indexPath}.tmp`;
	index.updatedAt = new Date().toISOString();
	await fs.writeFile(tempPath, JSON.stringify(index, null, 2), "utf-8");
	await fs.rename(tempPath, indexPath);
}

async function scanLocalMapsInternal(): Promise<{ files: number; indexed: number; updated: number; removed: number }> {
	const status = await getLocalMapDirectoryStatus();
	if (!status.readable) throw new Error("本地地图仓库目录不可读");

	const directory = getLocalMapDirectory();
	const index = await readLocalMapIndex();
	const previousByName = new Map(index.entries.map((entry) => [entry.fileName, entry]));
	const nextEntries: LocalMapIndexEntry[] = [];
	let files = 0;
	let indexed = 0;
	let updated = 0;

	for (const dirent of await fs.readdir(directory, { withFileTypes: true })) {
		if (!dirent.isFile() || dirent.isSymbolicLink() || !isSafeLocalMapFileName(dirent.name)) continue;
		const format = getLocalMapFormat(dirent.name)!;
		const filePath = path.join(directory, dirent.name);
		const stat = await fs.stat(filePath);
		if (stat.size <= 0 || stat.size > LOCAL_MAP_MAX_FILE_SIZE) continue;
		files++;
		const previous = previousByName.get(dirent.name);
		if (previous && previous.size === stat.size && previous.mtimeMs === stat.mtimeMs) {
			nextEntries.push(previous);
			continue;
		}
		const source: LocalMapSource = previous?.source ?? "scanned";
		nextEntries.push({
			fileName: dirent.name,
			format,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			sha256: await hashLocalMapFile(filePath),
			addedAt: previous?.addedAt ?? new Date().toISOString(),
			source,
			lastAccessedAt: previous?.lastAccessedAt,
		});
		if (previous) updated++;
		else indexed++;
	}

	const removed = index.entries.filter((entry) => !nextEntries.some((next) => next.fileName === entry.fileName)).length;
	const changed = indexed > 0 || updated > 0 || removed > 0 || nextEntries.length !== index.entries.length;
	if (changed && status.writable) {
		await writeLocalMapIndex({ version: 1, updatedAt: new Date().toISOString(), entries: nextEntries });
	}
	return { files, indexed, updated, removed };
}

async function enforceLocalMapCacheLimit(index: LocalMapIndex): Promise<void> {
	const candidates = index.entries
		.filter((entry) => entry.source === "p2p-cache" || entry.source === "server-cache")
		.sort((a, b) => Date.parse(a.lastAccessedAt ?? a.addedAt) - Date.parse(b.lastAccessedAt ?? b.addedAt));
	let cacheSize = candidates.reduce((total, entry) => total + entry.size, 0);
	let changed = false;
	while (cacheSize > LOCAL_MAP_CACHE_MAX_SIZE && candidates.length > 0) {
		const entry = candidates.shift()!;
		await fs.rm(path.join(getLocalMapDirectory(), entry.fileName), { force: true }).catch(() => {});
		index.entries = index.entries.filter((item) => item.fileName !== entry.fileName);
		cacheSize -= entry.size;
		changed = true;
	}
	if (changed) await writeLocalMapIndex(index);
}

async function saveReceivedLocalMap(input: { sha256: string; format: LocalMapFormat; fileName?: string; data: ArrayBuffer }): Promise<void> {
	if (!isSha256(input?.sha256) || (input?.format !== "fpmap" && input?.format !== "mmmap") || !(input?.data instanceof ArrayBuffer)) return;
	if (input.data.byteLength <= 0 || input.data.byteLength > LOCAL_MAP_MAX_FILE_SIZE) return;
	const status = await getLocalMapDirectoryStatus();
	if (!status.writable) return;

	const index = await readLocalMapIndex();
	if (index.entries.some((entry) => entry.sha256 === input.sha256)) return;
	const digest = input.sha256.slice("sha256:".length);
	const requestedFileName = input.fileName;
	const fallbackFileName = `p2p-${digest}.${input.format}`;
	const baseFileName = requestedFileName && isSafeLocalMapFileName(requestedFileName) && getLocalMapFormat(requestedFileName) === input.format
		? requestedFileName
		: fallbackFileName;
	const baseName = path.basename(baseFileName, path.extname(baseFileName));
	let fileName = baseFileName;
	let suffix = 1;
	while (fsSync.existsSync(path.join(getLocalMapDirectory(), fileName))) {
		fileName = `${baseName} (${suffix++}).${input.format}`;
	}
	const filePath = path.join(getLocalMapDirectory(), fileName);
	const tempPath = `${filePath}.tmp`;
	await fs.writeFile(tempPath, new Uint8Array(input.data));
	const actualHash = await hashLocalMapFile(tempPath);
	if (actualHash !== input.sha256) {
		await fs.rm(tempPath, { force: true });
		throw new Error("接收地图校验失败");
	}
	await fs.rename(tempPath, filePath);
	const stat = await fs.stat(filePath);
	index.entries.push({
		fileName,
		format: input.format,
		size: stat.size,
		mtimeMs: stat.mtimeMs,
		sha256: input.sha256,
		addedAt: new Date().toISOString(),
		source: "p2p-cache",
		lastAccessedAt: new Date().toISOString(),
	});
	await writeLocalMapIndex(index);
	await enforceLocalMapCacheLimit(index);
}

ipcMain.handle("local-map:status", () => getLocalMapDirectoryStatus());
ipcMain.handle("local-map:scan", async () => {
	try {
		return await scanLocalMapsInternal();
	} catch (error) {
		return { files: 0, indexed: 0, updated: 0, removed: 0, message: error instanceof Error ? error.message : "扫描失败" };
	}
});
ipcMain.handle("local-map:open-folder", async () => {
	const status = await getLocalMapDirectoryStatus();
	if (!status.readable) throw new Error("本地地图仓库目录不可访问");
	await shell.openPath(status.path);
});
ipcMain.handle("local-map:find-by-hash", async (_event, input: { sha256: string; size: number }) => {
	if (!isSha256(input?.sha256) || !Number.isSafeInteger(input?.size) || input.size <= 0) return { found: false };
	try {
		await scanLocalMapsInternal();
		const index = await readLocalMapIndex();
		const entry = index.entries.find((candidate) => candidate.size === input.size && candidate.sha256 === input.sha256);
		if (!entry || !isSafeLocalMapFileName(entry.fileName)) return { found: false };
		const filePath = path.join(getLocalMapDirectory(), entry.fileName);
		const data = await fs.readFile(filePath);
		const verifiedSha256 = await hashLocalMapFile(filePath);
		if (verifiedSha256 !== input.sha256) return { found: false };
		entry.lastAccessedAt = new Date().toISOString();
		const status = await getLocalMapDirectoryStatus();
		if (status.writable) await writeLocalMapIndex(index);
		return {
			found: true,
			fileName: entry.fileName,
			verifiedSha256,
			data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
		};
	} catch {
		return { found: false };
	}
});
ipcMain.handle("local-map:save-received", async (_event, input) => saveReceivedLocalMap(input));
ipcMain.handle("local-map:import", async () => {
	try {
		const status = await getLocalMapDirectoryStatus();
		if (!status.writable) return { status: "failed", message: "本地地图仓库目录不可写" };
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{ name: "MineMonopoly 地图", extensions: ["fpmap", "mmmap"] }],
		});
		if (result.canceled || result.filePaths.length === 0) return { status: "failed", message: "已取消导入" };
		const sourcePath = result.filePaths[0];
		const sourceName = path.basename(sourcePath);
		const format = getLocalMapFormat(sourceName);
		const sourceStat = await fs.stat(sourcePath);
		if (!format || !sourceStat.isFile() || sourceStat.size <= 0 || sourceStat.size > LOCAL_MAP_MAX_FILE_SIZE) {
			return { status: "failed", message: "仅支持大小合法的 .fpmap 或 .mmmap 文件" };
		}
		await scanLocalMapsInternal();
		const sha256 = await hashLocalMapFile(sourcePath);
		const index = await readLocalMapIndex();
		const duplicate = index.entries.find((entry) => entry.sha256 === sha256);
		if (duplicate) return { status: "duplicate", fileName: duplicate.fileName, sha256, size: duplicate.size, message: "该地图文件已存在" };

		const directory = getLocalMapDirectory();
		const baseName = path.basename(sourceName, path.extname(sourceName));
		let targetName = sourceName;
		let suffix = 1;
		while (fsSync.existsSync(path.join(directory, targetName))) {
			targetName = `${baseName} (${suffix++}).${format}`;
		}
		const targetPath = path.join(directory, targetName);
		const tempPath = `${targetPath}.tmp`;
		await fs.copyFile(sourcePath, tempPath);
		if ((await hashLocalMapFile(tempPath)) !== sha256) {
			await fs.rm(tempPath, { force: true });
			return { status: "failed", message: "导入文件校验失败" };
		}
		await fs.rename(tempPath, targetPath);
		const targetStat = await fs.stat(targetPath);
		index.entries.push({
			fileName: targetName,
			format,
			size: targetStat.size,
			mtimeMs: targetStat.mtimeMs,
			sha256,
			addedAt: new Date().toISOString(),
			source: "imported",
		});
		await writeLocalMapIndex(index);
		return { status: "imported", fileName: targetName, sha256, size: targetStat.size };
	} catch (error) {
		return { status: "failed", message: error instanceof Error ? error.message : "导入失败" };
	}
});

// ============================================================
// 多源自动 fallback 更新检查
// ============================================================
async function checkForUpdatesWithFallback() {
	const sources = loadUpdateSources(app.getPath("userData"));
	if (sources.length === 0) {
		win?.webContents.send("update-status", {
			status: "error",
			error: "没有可用的更新源，请联系客服",
		});
		return;
	}

	isFallbackInProgress = true;

	let lastError: string | null = null;

	for (const source of sources) {
		try {
			log.info(`[Updater] 尝试源: "${source.name}" (${source.url})`);
			autoUpdater.setFeedURL(source.url);
			currentUpdateSource = source;

			const result = await autoUpdater.checkForUpdates();

			// 成功：update-available 或 update-not-available 事件已在上面处理
			isFallbackInProgress = false;
			return result;
		} catch (err: any) {
			log.info(`[Updater] 源 "${source.name}" 失败: ${err.message}`);
			lastError = err.message;
			// 继续尝试下一个源
		}
	}

	isFallbackInProgress = false;
	currentUpdateSource = null;

	// 所有源均失败
	win?.webContents.send("update-status", {
		status: "error",
		error: `所有更新源均不可用（共 ${sources.length} 个）\n${lastError || "未知错误"}`,
		sourceName: "无",
	});
}

// A. 检查更新（可以由前端触发，也可以启动时触发）
ipcMain.handle("check-for-update", () => {
	if (!app.isPackaged) return "dev-mode"; // 开发环境不检查
	return checkForUpdatesWithFallback();
});

// B. 开始下载
ipcMain.handle("start-download-update", () => {
	autoUpdater.downloadUpdate();
});

// C. 退出并安装
ipcMain.handle("quit-and-install", () => {
	autoUpdater.quitAndInstall();
});

// --- 错误日志 IPC 处理 ---
ipcMain.on("log-error", (_event, error: LogErrorData) => {
	writeErrorLog(error);
});

// 主进程未捕获异常
process.on("uncaughtException", async (err) => {
	console.error("[主进程未捕获异常]:", err);

	await writeErrorLog({
		type: "Runtime",
		message: err.message,
		stack: err.stack,
		additionalData: {
			process: "main",
			uncaught: true,
		},
	});
});

// 主进程未处理的 Promise 拒绝
process.on("unhandledRejection", async (reason) => {
	console.error("[主进程未处理的 Promise 拒绝]:", reason);

	const errMessage = reason instanceof Error ? reason.message : String(reason);

	await writeErrorLog({
		type: "Promise",
		message: errMessage,
		stack: reason instanceof Error ? reason.stack : undefined,
		additionalData: {
			process: "main",
			unhandledRejection: true,
		},
	});
});

// 记录控制台输出到文件
ipcMain.on("log-console", async (_event, data: { level: string; message: string; stack?: string }) => {
	const timestamp = formatLocalTime();
	const logEntry = `[${timestamp}] [Console.${data.level}] ${data.message}\n`;

	if (data.stack) {
		const lines = data.stack.split("\n");
		for (const line of lines) {
			await writeLogEntry(`  ${line}\n`, false);
		}
	}
});

// 记录网络请求错误
ipcMain.on("log-network", async (_event, data: { url: string; method: string; status?: number; error: string }) => {
	await writeErrorLog({
		type: "Network",
		message: data.error,
		url: data.url,
		method: data.method,
		status: data.status,
		additionalData: {
			process: "renderer",
		},
	});
});

// 打开日志文件夹
ipcMain.handle("open-logs-folder", async () => {
	await shell.openPath(logsDir);
	return logsDir;
});

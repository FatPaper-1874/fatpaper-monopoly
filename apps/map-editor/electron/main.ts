import { app, ipcMain, BrowserWindow, Menu, dialog, OpenDialogOptions, SaveDialogOptions, protocol, net } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, writeFile, copyFile, mkdir, readdir, stat, unlink, rm, rename } from "fs/promises";
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import { loadUpdateSources, type UpdateSource } from "./update-config.js";
import { startHTTPMCPServer, type HTTPMCPServer } from "../src/mcp/http-server.js";
import { setBridge, type IPCBridge } from "../src/mcp/bridge.js";
import {
	gitInit,
	gitCommitAll,
	gitLog,
	gitCheckout,
	gitDiff,
	gitReadFile,
	gitCurrentOid,
	gitCreateTag,
	gitHasChanges,
} from "./git-service.js";

const tempDir = path.join(app.getPath("userData"), "temp");

protocol.registerSchemesAsPrivileged([
	{
		scheme: "fp-file",
		privileges: {
			secure: true,
			supportFetchAPI: true,
			standard: true,
			bypassCSP: true,
			stream: true,
		},
	},
]);

// 处理单例启动
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	app.quit();
} else {
	app.on("second-instance", (_event, commandLine, _workingDirectory) => {
		if (win) {
			if (win.isMinimized()) win.restore();
			win.focus();

			// macOS: 文件路径通过 open-file 事件传递，不从 commandLine 获取
			if (process.platform !== "darwin") {
				const filePath = getFileFromArgv(commandLine);
				if (filePath) {
					win.webContents.send("open-map-file", filePath);
				}
			}
		}
	});
}

autoUpdater.logger = log;
autoUpdater.autoDownload = false; // 关键：设为 false，防止游戏过程中自动抢网速
autoUpdater.autoInstallOnAppQuit = true; // 退出时自动安装

// ============================================================
// 更新源配置
// ============================================================
let currentUpdateSource: UpdateSource | null = null;
let isFallbackInProgress = false;

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

const isProduction = app.isPackaged;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;

let win: BrowserWindow | null;

// 处理文件启动
// 1. 定义暂存变量
let fileToOpen: string | null = null;

// 2. 辅助函数：解析命令行参数 (Windows)
function getFileFromArgv(argv: string[]) {
	// 生产环境通常 argv[1] 是文件路径
	const possibleFile = argv[1];
	if (possibleFile && possibleFile.endsWith(".fpmap")) {
		return possibleFile;
	}
	return null;
}

// 3. 冷启动检查 (Windows: 通过 argv，macOS: 通过 open-file 事件)
if (process.platform !== "darwin") {
	fileToOpen = getFileFromArgv(process.argv);
}

// 4. macOS: 监听 open-file 事件（双击 .fpmap 文件时触发）
app.on("open-file", (event, filePath) => {
	event.preventDefault();
	if (filePath.endsWith(".fpmap")) {
		if (win && win.webContents) {
			// 应用已就绪，直接发送给渲染进程
			win.webContents.send("open-map-file", filePath);
		} else {
			// 应用未就绪，暂存等待 renderer-ready
			fileToOpen = filePath;
		}
	}
});

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
			submenu: [
				{ role: "minimize" as any },
				{ role: "zoom" as any },
				{ role: "close" as any },
			],
		},
	];

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function createWindow() {
	win = new BrowserWindow({
		width: 1200,
		height: 860,
		webPreferences: {
			nodeIntegration: true,
			nodeIntegrationInWorker: false,
			preload: path.join(__dirname, "preload.mjs"),
			devTools: isProduction ? false : true,
			webSecurity: true,
			zoomFactor: 1.0,
		},
		frame: false,
		...(process.platform === "darwin"
			? { titleBarStyle: "hiddenInset" }
			: {}),
	});

	win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [
					"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: fp-file: ws: http: https:",
				],
			},
		});
	});

	if (!isProduction) win.webContents.openDevTools();

	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", new Date().toLocaleString());
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL);
	} else {
		// win.loadFile("./dist/index.html");
		win.loadFile(path.join(RENDERER_DIST, "frontend/index.html"));
	}

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

	ipcMain.on("renderer-ready", (event) => {
		console.log("Vue is ready.");
		if (fileToOpen) {
			console.log("Sending cached file to renderer:", fileToOpen);
			event.sender.send("open-map-file", fileToOpen);
			fileToOpen = null; // 发送完清空
		}
	});
}

app.on("window-all-closed", async () => {
	// 清理 HTTP 服务器
	if (httpServer) {
		try {
			await httpServer.close();
			httpServer = null;
			mcpServerRunning = false;
		} catch (error) {
			console.error("Failed to close MCP server:", error);
		}
	}

	if (process.platform !== "darwin") {
		cleanTempDir();
		app.quit();
		win = null;
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

app.whenReady().then(() => {
	protocol.handle("fp-file", (request) => {
		// 1. 截取协议头
		let urlPath = request.url.slice("fp-file://".length);

		// 2. 处理 Windows 盘符丢失冒号的问题
		if (process.platform === "win32") {
			urlPath = decodeURIComponent(urlPath);

			// 场景 A: "c/DEV/..." -> 补全为 "c:/DEV/..."
			if (/^[a-zA-Z]\//.test(urlPath)) {
				// 在第1个字符后插入冒号
				urlPath = urlPath.slice(0, 1) + ":" + urlPath.slice(1);
			}

			// 场景 B: "/c:/DEV/..." (有时候浏览器会保留斜杠) -> 去掉开头的 "/"
			else if (urlPath.startsWith("/") && /^[a-zA-Z]:/.test(urlPath.slice(1))) {
				urlPath = urlPath.slice(1);
			}

			// 场景 C: 已经是 "c:/DEV/..." (正常) -> 不做处理
		} else {
			urlPath = decodeURIComponent(urlPath);
		}

		// 3. 最终清洗：确保是标准路径分隔符
		const finalPath = path.normalize(urlPath);
		try {
			return net.fetch(pathToFileURL(finalPath).toString());
		} catch (error) {
			console.error("❌ [fp-file] 加载失败:", finalPath, error);
			return new Response("Invalid Path", { status: 400 });
		}
	});
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

// ipcMain.on("window-unmaximize", () => {
// 	if (win) win.unmaximize();
// });

ipcMain.on("window-close", () => {
	if (win) win.close();
});

ipcMain.handle("window-is-maximized", () => {
	return win ? win.isMaximized() : false;
});

ipcMain.handle("read-file", async (event, path: string) => {
	return await readFile(path);
});

ipcMain.handle("write-file", async (event, targetPath: string, data: string) => {
	await writeFile(targetPath, data);
	return targetPath;
});

ipcMain.handle("write-local-file", async (event, targetPath: string, data: Uint8Array) => {
	const finalPath = path.isAbsolute(targetPath) ? targetPath : path.join(tempDir, targetPath);
	const dir = path.dirname(finalPath);
	await mkdir(dir, { recursive: true });
	await writeFile(finalPath, data);
	return finalPath;
});

ipcMain.handle("copy-file", async (event, fromFilePath: string, toFilePathtoFilePath: string, newFileName: string) => {
	if (!toFilePathtoFilePath) {
		toFilePathtoFilePath = tempDir;
		fs.mkdirSync(toFilePathtoFilePath, { recursive: true }); // 如果目录不存在则创建
	}

	const fileType = path.extname(fromFilePath);
	const newFilePath = path.join(toFilePathtoFilePath, newFileName + fileType);

	fs.copyFileSync(fromFilePath, newFilePath);

	return { filePath: newFilePath, fileType: fileType.slice(1) };
});

// 复制 empty 资源到 temp 目录
ipcMain.handle("copy-empty-resource", async (event, resourceType: "model" | "image") => {
	fs.mkdirSync(tempDir, { recursive: true });

	// 确定 empty 资源的文件名和扩展名
	const fileName = resourceType === "model" ? "empty.glb" : "empty.png";
	const fileType = resourceType === "model" ? "glb" : "png";

	// 确定 empty 资源的源路径
	// 开发环境：public/mock/
	// 生产环境：dist/frontend/mock/ (RENDERER_DIST + "frontend")
	const sourceDir = isProduction ? path.join(RENDERER_DIST, "frontend") : path.join(process.env.APP_ROOT, "public");
	const sourcePath = path.join(sourceDir, "mock", fileName);

	// 生成唯一的文件名
	const uniqueId = Date.now() + "-" + Math.random().toString(36).substring(2, 9);
	const newFileName = `temp-${resourceType}-${uniqueId}.${fileType}`;
	const targetPath = path.join(tempDir, newFileName);

	// 复制文件
	fs.copyFileSync(sourcePath, targetPath);

	// 将本地绝对路径转换为自定义协议 URL（与 utils/file/index.ts 的 convertToFpUrl 一致）
	const fpUrl = `fp-file://${targetPath.replace(/\\/g, "/")}`;

	return {
		filePath: targetPath,
		fileType: fileType,
		url: fpUrl,
	};
});

ipcMain.handle("get-image-base64", async (event, filePath) => {
	const fileContent = await readFile(filePath);
	return fileContent.toString("base64");
});

ipcMain.handle("clear-temp-dir", async (event) => {
	await cleanTempDir();
});

// ─── 目录操作 (地图版本管理用) ───
ipcMain.handle("mkdir-dir", async (_event, dirPath: string) => {
	await mkdir(dirPath, { recursive: true });
});

ipcMain.handle("read-dir", async (_event, dirPath: string) => {
	const entries = await readdir(dirPath, { withFileTypes: true });
	return entries.map((e) => ({
		name: e.name,
		isDirectory: e.isDirectory(),
		isFile: e.isFile(),
	}));
});

ipcMain.handle("exists-path", async (_event, p: string) => {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
});

ipcMain.handle("stat-path", async (_event, p: string) => {
	const s = await stat(p);
	return {
		isDirectory: s.isDirectory(),
		isFile: s.isFile(),
		size: s.size,
		mtimeMs: s.mtimeMs,
	};
});

ipcMain.handle("unlink-path", async (_event, p: string) => {
	await unlink(p);
});

ipcMain.handle("rmdir-dir", async (_event, dirPath: string) => {
	await rm(dirPath, { recursive: true, force: true });
});

ipcMain.handle("rename-path", async (_event, oldPath: string, newPath: string) => {
	await rename(oldPath, newPath);
});

// ─── Git 操作 ───
ipcMain.handle("git-init", async (_event, dir: string) => {
	await gitInit(dir);
});

ipcMain.handle("git-commit-all", async (_event, dir: string, message: string, author?: string) => {
	return await gitCommitAll(dir, message, author);
});

ipcMain.handle("git-log", async (_event, dir: string, depth?: number) => {
	return await gitLog(dir, depth);
});

ipcMain.handle("git-checkout", async (_event, dir: string, oid: string) => {
	await gitCheckout(dir, oid);
});

ipcMain.handle("git-diff", async (_event, dir: string, oidA: string, oidB: string) => {
	return await gitDiff(dir, oidA, oidB);
});

ipcMain.handle("git-read-file", async (_event, dir: string, oid: string, filePath: string) => {
	return await gitReadFile(dir, oid, filePath);
});

ipcMain.handle("git-current-oid", async (_event, dir: string) => {
	return await gitCurrentOid(dir);
});

ipcMain.handle("git-create-tag", async (_event, dir: string, name: string, message?: string) => {
	await gitCreateTag(dir, name, message);
});

ipcMain.handle("git-has-changes", async (_event, dir: string) => {
	return await gitHasChanges(dir);
});

ipcMain.handle("open-load-dialog", async (event, options: OpenDialogOptions) => {
	return await dialog.showOpenDialog(options);
});

ipcMain.handle("open-save-dialog", async (event, options: SaveDialogOptions) => {
	return await dialog.showSaveDialog(options);
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

// MCP Server handlers
const DEFAULT_MCP_PORT = 3000;
let mcpServerRunning = false;
let httpServer: HTTPMCPServer | null = null;

ipcMain.handle("start-mcp-server", async (_event, port?: unknown) => {
	console.log("[MCP] start-mcp-server called, mcpServerRunning:", mcpServerRunning);

	if (port !== undefined && (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535)) {
		return { success: false, error: "MCP 端口必须是 1 到 65535 之间的整数" };
	}

	const requestedPort = typeof port === "number" ? port : DEFAULT_MCP_PORT;

	if (mcpServerRunning) {
		console.log("[MCP] Server already running, URL:", httpServer?.url);
		return {
			success: true,
			message: "MCP Server already running",
			url: httpServer?.url || null,
			port: httpServer?.port || null,
		};
	}

	try {
		console.log("[MCP] Starting HTTP MCP Server...");

		// 设置 IPC bridge 以便 MCP 工具可以与渲染进程通信
		const ipcBridge: IPCBridge = {
			invokeTool: async (toolName, args) => {
				const invokeId = Math.random().toString(36).substring(7);
				const startTime = Date.now();

				console.log(`[MCP IPC] → Sending to renderer: ${toolName} [${invokeId}]`);
				console.log(`[MCP IPC] → Request payload:`, JSON.stringify(args, null, 2));

				return new Promise((resolve) => {
					const timeout = setTimeout(() => {
						const duration = Date.now() - startTime;
						console.error(`[MCP IPC] ⏱️ Timeout: ${toolName} [${invokeId}] (${duration}ms)`);
						resolve({ success: false, error: "Tool invocation timeout" });
					}, 10000); // 10 second timeout

					// Listen for the response
					const responseHandler = (_event: any, data: any) => {
						clearTimeout(timeout);
						ipcMain.removeListener("mcp-tool-response", responseHandler);

						const duration = Date.now() - startTime;

						// Log response from renderer
						if (data.success !== false) {
							console.log(`[MCP IPC] ← Response received: ${toolName} [${invokeId}] (${duration}ms)`);
							console.log(`[MCP IPC] ← Response data:`, JSON.stringify(data, null, 2));
						} else {
							console.error(`[MCP IPC] ← Error response: ${toolName} [${invokeId}] (${duration}ms)`);
							console.error(`[MCP IPC] ← Error data:`, JSON.stringify(data, null, 2));
						}

						resolve(data);
					};

					ipcMain.once("mcp-tool-response", responseHandler);

					// Send the invocation request to renderer
					if (win) {
						win.webContents.send("mcp-invoke-tool", { toolName, args });
					} else {
						clearTimeout(timeout);
						console.error(`[MCP IPC] ❌ No window available for ${toolName} [${invokeId}]`);
						resolve({ success: false, error: "No window available" });
					}
				});
			},
			sendMessage: (channel, data) => {
				if (win) {
					console.log(`[MCP IPC] → Sending message: ${channel}`, data);
					win.webContents.send(channel, data);
				}
			},
			onMessage: (channel, callback) => {
				console.log(`[MCP IPC] ← Registering listener: ${channel}`);
				ipcMain.on(channel, (event, data) => {
					console.log(`[MCP IPC] ← Message received: ${channel}`, data);
					callback(data);
				});
			},
		};

		// 设置全局 bridge
		setBridge(ipcBridge);
		console.log("[MCP] IPC Bridge set up successfully");

		// 启动 HTTP 服务器（会等待服务器真正启动）
		httpServer = await startHTTPMCPServer({
			port: requestedPort, // 指定端口被占用时会自动尝试后续端口
			host: "127.0.0.1",
			onReady: ({ port, url }: { port: any; url: any }) => {
				console.log("[MCP] onReady callback - Server started on:", url);
				console.log("[MCP] onReady - port:", port, "url:", url);
				console.log("[MCP] onReady - url type:", typeof url);
				mcpServerRunning = true;

				// 通知所有窗口
				console.log("[MCP] Sending mcp-server-status event to renderer");
				if (win) {
					console.log("[MCP] Window exists, sending event with data:", { running: true, url });
					win.webContents.send("mcp-server-status", { running: true, url, port });
					console.log("[MCP] Event sent successfully");
				} else {
					console.log("[MCP] ERROR: win is null!");
				}
			},
			onError: (error: any) => {
				console.error("[MCP] onError callback:", error);
				if (win) {
					win.webContents.send("mcp-server-error", { error: error.message });
				}
			},
		});

		console.log("[MCP] startHTTPMCPServer returned");
		console.log("[MCP] httpServer object:", httpServer);
		console.log("[MCP] httpServer.url:", httpServer?.url);
		console.log("[MCP] httpServer.url type:", typeof httpServer?.url);

		const result = {
			success: true,
			message: "MCP Server started",
			url: httpServer.url,
			port: httpServer.port,
		};

		console.log("[MCP] Returning result:", result);
		return result;
	} catch (error: any) {
		console.error("[MCP] Failed to start MCP server:", error);
		return {
			success: false,
			error: error.message,
		};
	}
});

ipcMain.handle("stop-mcp-server", async (event) => {
	if (!mcpServerRunning || !httpServer) {
		return { success: true, message: "MCP Server not running" };
	}

	try {
		await httpServer.close();
		httpServer = null;
		mcpServerRunning = false;

		if (win) {
			win.webContents.send("mcp-server-status", { running: false, url: null });
		}

		return { success: true, message: "MCP Server stopped" };
	} catch (error: any) {
		console.error("Failed to stop MCP server:", error);
		return {
			success: false,
			error: error.message,
		};
	}
});

ipcMain.handle("get-mcp-status", async () => {
	return {
		running: mcpServerRunning,
		url: httpServer?.url || null,
		port: httpServer?.port || null,
	};
});

ipcMain.handle("get-mcp-tools", async () => {
	// Import and get all tools from the MCP server
	const { getAllTools } = await import("../src/mcp/server.js");
	const tools = getAllTools();

	// Return simplified tool information
	return tools.map((tool: any) => ({
		name: tool.name,
		description: tool.description,
		category: tool.category,
	}));
});

ipcMain.handle("mcp-call-tool", async (event, toolName: string, args: any) => {
	// Forward the tool invocation to the renderer process
	// We use a one-time listener to get the response
	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve({ success: false, error: "Tool invocation timeout" });
		}, 10000); // 10 second timeout

		// Listen for the response
		const responseHandler = (_event: any, data: any) => {
			clearTimeout(timeout);
			ipcMain.removeListener("mcp-tool-response", responseHandler);
			resolve(data);
		};

		ipcMain.once("mcp-tool-response", responseHandler);

		// Send the invocation request to renderer
		event.sender.send("mcp-invoke-tool", { toolName, args });
	});
});

app.whenReady().then(() => { buildAppMenu(); createWindow(); });

export async function cleanTempDir() {
	try {
		// 1. 检查目录是否存在
		await fs.accessSync(tempDir);

		// 2. 读取目录内容
		const files = await fs.readdirSync(tempDir);

		// 3. 并行删除所有文件和子目录
		await Promise.all(
			files.map(async (file) => {
				const filePath = path.join(tempDir, file);
				const stats = await fs.statSync(filePath);

				if (stats.isDirectory()) {
					await fs.rmSync(filePath, { recursive: true }); // 删除子目录
				} else {
					await fs.unlinkSync(filePath); // 删除文件
				}
			}),
		);

		console.log(`已清空临时目录: ${tempDir}`);
	} catch (error: any) {
		if (error.code === "ENOENT") {
			console.log("临时目录不存在，无需清理");
		} else {
			console.error("清理临时目录失败:", error);
		}
	}
}

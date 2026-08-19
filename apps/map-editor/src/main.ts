// 桥接 preload 暴露的 electronAPI → platformAPI（供 TitleBar 等共享组件使用）
if ((window as any).electronAPI) {
	const api = (window as any).electronAPI;
	(window as any).platformAPI = {
		minimize: () => api.minimize?.(),
		maximize: () => api.maximize?.(),
		unmaximize: () => api.unmaximize?.(),
		close: () => api.close?.(),
		isMaximized: () => api.isMaximized?.(),
	};
}

import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "./App.vue";
import router from "./router";
import "@src/assets/index.scss";

/* import the fontawesome core */
import { library } from "@fortawesome/fontawesome-svg-core";

/* import font awesome icon component */
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

/* import specific icons */
import {
	faWindowRestore,
	faHouseChimneyWindow,
	faHandPointer,
	faPenToSquare,
	faBoxesStacked,
	faBook,
	faWandMagicSparkles,
	faPlus,
	faCamera,
	faPlane,
	faRoad,
	faMicrochip,
	faArrowDown,
	faArrowUp,
	faArrowLeft,
	faArrowRight,
	faArrowsSpin,
	faBezierCurve,
	faXmark,
	faExpand,
	faCompress,
	faWindowMinimize,
	faCubes,
	faMask,
	faCircleInfo,
	faImage,
	faHouse,
	faLayerGroup,
	faDatabase,
	faSlidersH,
	faCode,
	faNetworkWired,
	faRotate,
	faRotateLeft,
	faRotateRight,
	faPlay,
	faStop,
	faMagnifyingGlass,
	faCopy,
	faObjectGroup,
	faBoltLightning,
	faChevronDown,
	faEye,
} from "@fortawesome/free-solid-svg-icons";
import { eventBus } from "./utils/event-bus";
import { loadMapAuto } from "@src/services/map-serializer";
import { useEditorStore, useMapDataStore, useResourceStore, useVersionStore } from "@src/stores";

library.add(
	faWindowRestore,
	faHouseChimneyWindow,
	faHandPointer,
	faPenToSquare,
	faBoxesStacked,
	faBook,
	faWandMagicSparkles,
	faPlus,
	faCamera,
	faPlane,
	faRoad,
	faMicrochip,
	faArrowDown,
	faArrowUp,
	faArrowLeft,
	faArrowRight,
	faArrowsSpin,
	faBezierCurve,
	faXmark,
	faExpand,
	faCompress,
	faWindowMinimize,
	faCubes,
	faMask,
	faCircleInfo,
	faImage,
	faHouse,
	faLayerGroup,
	faDatabase,
	faSlidersH,
	faCode,
	faNetworkWired,
	faRotate,
	faRotateLeft,
	faRotateRight,
	faPlay,
	faStop,
	faMagnifyingGlass,
	faCopy,
	faObjectGroup,
	faBoltLightning,
	faChevronDown,
	faEye,
);

eventBus.on("renderer-ready", async () => {
	const platformKey = `last-time-file-path-${navigator.platform}`;
	const lastTimeFilePath = localStorage.getItem(platformKey);
	if (lastTimeFilePath) {
		try {
			await window.electronAPI.clearTempDir();

			const result = await loadMapAuto(lastTimeFilePath);

			useMapDataStore().$patch(result.mapData);
			useResourceStore().$patch({ models: result.models, images: result.images });
			useEditorStore().setCurrentFilePath(lastTimeFilePath);
			await useVersionStore().detectAndInit(lastTimeFilePath);

			eventBus.emit("map-loaded", result.mapData);
		} catch (e) {
			console.error("自动恢复上次地图失败:", e);
		}
	}
	eventBus.off("renderer-ready");
});

const app = createApp(App).component("font-awesome-icon", FontAwesomeIcon);

app.use(createPinia());
app.use(router);

app.mount("#app");

// Initialize MCP Bridge (after app mount)
import { initMCPBridge } from "./mcp/bridge-handler";
initMCPBridge();

import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import { message } from "ant-design-vue";

// @ts-ignore
self.MonacoEnvironment = {
	getWorker(_: any, label: string) {
		if (label === "typescript" || label === "javascript") {
			return new tsWorker();
		}
		if (label === "html") {
			return new htmlWorker();
		}

		if (label === "css" || label === "scss" || label === "less") {
			return new cssWorker();
		}
		return new editorWorker();
	},
};

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
	// 关键配置
	strict: true,
	noImplicitAny: true,
	noImplicitReturns: true,
	noFallthroughCasesInSwitch: true,
	// 其他配置
	target: monaco.languages.typescript.ScriptTarget.ES2020,
	module: monaco.languages.typescript.ModuleKind.ESNext,
	allowNonTsExtensions: true,
	lib: ["es2020", "dom"],
});

monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
	noSemanticValidation: false,
	noSyntaxValidation: false,
});

// --- 捕获 Vue 组件内部错误 ---
app.config.errorHandler = (err, instance, info) => {
	console.error("[Vue Error]:", err); // 保留控制台打印方便调试

	const errMessage = err instanceof Error ? err.message : String(err);

	message.error(`系统错误: ${errMessage}`);
};

// --- 捕获未处理的 Promise 拒绝 (Async/Await, Axios 等) ---
window.addEventListener("unhandledrejection", (event) => {
	console.error("[Unhandled Promise]:", event.reason);

	// 提取错误信息
	const reason = event.reason;
	const errMessage = reason instanceof Error ? reason.message : String(reason);
	if (errMessage.includes("cancel") || errMessage.includes("abort")) return;

	message.error(`异步错误: ${errMessage}`);
	event.preventDefault();
});

// --- 捕获常规 JS 运行时错误 ---
window.addEventListener("error", (event) => {
	console.error("[Global JS Error]:", event.error);

	message.error(`程序异常: ${event.message}`);
	event.preventDefault();
});

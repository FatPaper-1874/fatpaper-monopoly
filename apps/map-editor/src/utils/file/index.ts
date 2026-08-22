import { FormSchema, GameMap, GameMapInfo } from "@mine-monopoly/types";
import { dataToProtoBuffer, loadFromProto, ProtoFileType, encodeProductMap } from "@mine-monopoly/utils/protos";
import { encrypt } from "@mine-monopoly/utils/crypto";
import { gzipCompress, normalizeGameMap, normalizePhases } from "@mine-monopoly/utils";
import { useEditorStore, useMapDataStore, useResourceStore } from "@src/stores";
import { eventBus } from "@src/utils/event-bus";
import { getInitPhase } from "@src/views/map-editor/components/manager/process-manager/utils/init-phase";
import { Alert, message, Modal } from "ant-design-vue";
import { generateShortId } from "@src/utils/short-id";
import { __MAP_ENCRYPT_KEY__ } from "@src/global.config";
import { h } from "vue";
import { getFsApi } from "@src/services/fs-api";

/**
 * 向后兼容：确保地图 phases 中所有已知阶段类型都存在，
 * 并为特定阶段注入默认系统阶段（如 postRestore）。
 */
function ensureDefaultPhases(mapData: GameMap): void {
	const phases = mapData.phases;
	if (!phases) return;
	// 首先调用共享的 normalizePhases 确保所有阶段类型存在
	normalizePhases(phases);
	// 旧地图的 postRestore 为空时，注入默认系统阶段
	if (phases.postRestore.length === 0) {
		const defaultPhases = getInitPhase();
		phases.postRestore.push(defaultPhases.postRestore[0]);
	}
}

/**
 * 向后兼容：旧地图文件的 info 可能缺少更新日志字段（pendingChangelog/changelog），补默认值
 */
export function ensureMapInfoDefaults(info: Partial<GameMapInfo> | undefined | null): GameMapInfo {
	return {
		name: info?.name ?? "",
		author: info?.author ?? "",
		version: info?.version ?? "0.0.0",
		description: info?.description ?? "",
		pendingChangelog: info?.pendingChangelog ?? "",
		changelog: info?.changelog ?? [],
		editorVersion: info?.editorVersion ?? "",
		backgroundImageId: info?.backgroundImageId ?? "",
		coverImageId: info?.coverImageId ?? "",
	};
}

export function getFileName(path: string): string {
	return path.split(/[/\\]/).pop() || "";
}

export function getFileNameWithoutExt(path: string): string {
	const fileName = getFileName(path);
	const lastDotIndex = fileName.lastIndexOf(".");
	if (lastDotIndex === -1 || lastDotIndex === 0) {
		return fileName;
	}
	return fileName.substring(0, lastDotIndex);
}

/**
 * 判断旧地图是否需要由 mapIndex 自动生成 mapPaths：
 * 旧版地图未包含 mapPaths 字段，但携带了旧版线性路径索引 mapIndex。
 */
export function hasLegacyMapIndexWithoutPaths(mapData: {
	mapPaths?: unknown;
	mapIndex?: unknown;
}): boolean {
	return (
		!Array.isArray(mapData.mapPaths) &&
		Array.isArray(mapData.mapIndex) &&
		mapData.mapIndex.length > 0
	);
}

/** 弹窗告知用户：旧版地图已根据 mapIndex 自动生成了 mapPaths */
export function notifyLegacyMapPathsGenerated(mapData: GameMap): void {
	const count = Array.isArray(mapData.mapIndex) ? mapData.mapIndex.length : 0;
	Modal.warning({
		title: "旧版地图路径已自动生成",
		content: h("div", [
			h("p", `该地图是旧版地图，未包含新版路径配置，已根据旧版路径索引自动生成 ${count} 条路径。`),
			h("p", "可在「生成相邻路径 / 路径详情」中查看和调整；保存后路径将写入新版格式。"),
			h(Alert, {
				type: "warning",
				showIcon: true,
				message: "旧版 effectCode 中的 player.tp(positionIndex) 接口即将废弃，请改用 player.tpToMapItem(mapItemId)。",
			}),
		]),
		okText: "知道了",
	});
}

export async function parseGameMapFromProtoFile(filePath: string) {
	const buffer = await window.electronAPI.readFile(filePath);
	const res = await loadFromProto(new Uint8Array(buffer));
	const rawMapData = JSON.parse(res.jsonData) as GameMap;
	// 旧版地图（无 mapPaths）由 mapIndex 生成路径前先记录，用于弹窗告知
	const legacyPathsGenerated = hasLegacyMapIndexWithoutPaths(rawMapData);
	const mapData = normalizeGameMap(rawMapData);
	// 向后兼容：确保所有阶段类型都已初始化（旧地图可能缺少新增的阶段类型）
	ensureDefaultPhases(mapData);
	// 向后兼容：旧地图 info 缺少更新日志字段时补默认值
	mapData.info = ensureMapInfoDefaults(mapData.info);
	// 从 proto 顶层恢复 serverMapId（旧文件无该字段时为 ""，以 payload 内为准兜底）
	if (res.serverMapId) mapData.serverMapId = res.serverMapId;
	// 旧版地图：弹窗告知路径已由 mapIndex 自动生成
	if (legacyPathsGenerated) notifyLegacyMapPathsGenerated(mapData);
	return {
		id: res.id,
		mapData,
		models: res.modelFiles,
		images: res.imageFiles,
	};
}

export async function buildFpmapBuffer(mapId: string, mapData: GameMap): Promise<Uint8Array> {
	const fetchBuffer = async (url: string): Promise<Uint8Array> => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`资源加载失败: ${url}`);
		const arrayBuffer = await response.arrayBuffer();
		return new Uint8Array(arrayBuffer);
	};

	const resourceStore = useResourceStore();
	const modelsList: ProtoFileType[] = [];
	//加载模型:
	for (const model of resourceStore.models) {
		const tempModel: ProtoFileType = {
			id: model.id,
			name: model.name,
			filetype: model.fileType,
			buffer: await fetchBuffer(model.url),
		};
		modelsList.push(tempModel);
	}

	const imagesList: ProtoFileType[] = [];
	//加载图片:
	for (const image of resourceStore.images) {
		const tempImage: ProtoFileType = {
			id: image.id,
			name: image.name,
			filetype: image.fileType,
			buffer: await fetchBuffer(image.url),
		};
		imagesList.push(tempImage);
	}
	const dataStr = JSON.stringify(mapData);
	return dataToProtoBuffer(mapId, dataStr, modelsList, imagesList, mapData.serverMapId);
}

export async function saveGameMapToBinFile(mapId: string, filePath: string, mapData: GameMap): Promise<void> {
	// 防御：禁止写入目录
	try {
		const s = await getFsApi().statPath(filePath);
		if (s.isDirectory) {
			throw new Error(`目标路径是目录而非文件: ${filePath}`);
		}
	} catch (e: any) {
		if (e.message?.includes("目录而非文件")) throw e;
		// statPath 失败（文件不存在等）继续执行
	}

	const buffer = await buildFpmapBuffer(mapId, mapData);
	await window.electronAPI.saveFile(filePath, buffer);
}

export async function loadMapDataFromPath(path: string) {
	const editorStore = useEditorStore();
	const mapDataStore = useMapDataStore();
	const resourceStore = useResourceStore();
	await editorStore.withLoading(async () => {
		const data = await parseGameMapFromProtoFile(path);
		if (data) {
			// 补全旧地图缺少的内置游戏参数（如 turnTimeout）
			data.mapData.gameSettingForm = ensureBuiltInGameSettings(data.mapData.gameSettingForm);
			mapDataStore.$patch(data.mapData);
			editorStore.setCurrentFilePath(path);

			await window.electronAPI.clearTempDir();

			const modelsList: typeof resourceStore.models = [];
			for (const model of data.models) {
				const absolutePath = await readBufferToFile(model.buffer, `temp/${model.id}.${model.filetype}`);
				const filePath = convertToFpUrl(absolutePath);
				const tempModel = {
					id: model.id,
					name: model.name,
					fileType: model.filetype,
					url: filePath,
				};
				modelsList.push(tempModel);
			}
			resourceStore.$patch({ models: modelsList });

			const imagesList: typeof resourceStore.images = [];
			for (const image of data.images) {
				const absolutePath = await readBufferToFile(image.buffer, `temp/${image.id}.${image.filetype}`);
				const filePath = convertToFpUrl(absolutePath);
				const tempImage = {
					id: image.id,
					name: image.name,
					fileType: image.filetype,
					url: filePath,
				};
				imagesList.push(tempImage);
			}
			resourceStore.$patch({ images: imagesList });

			eventBus.emit("map-loaded", data.mapData);
			message.success("加载成功", 1);
		}
	}, "加载地图中...");
}

/** 内置游戏参数字段定义（不含 id，由使用处生成） */
const BUILT_IN_GAME_SETTINGS: Omit<FormSchema, "id">[] = [
	{ key: "initMoney", type: "number-input", label: "初始金钱", defaultValue: 10000, builtIn: true },
	{ key: "turnTimeout", type: "number-input", label: "回合倒计时(秒)", defaultValue: 15, min: 5, max: 120, builtIn: true },
];

/**
 * 补全/标记内置游戏参数
 * - 缺失的内置项 → 追加（含 builtIn: true）
 * - 已有的同名参数 → 标记 builtIn: true（以内置参数为准）
 */
function ensureBuiltInGameSettings(form: FormSchema[]): FormSchema[] {
	const builtInKeys = new Set(BUILT_IN_GAME_SETTINGS.map((s) => s.key));
	const result = form.map((s) => {
		if (builtInKeys.has(s.key) && !s.builtIn) {
			return { ...s, builtIn: true };
		}
		return s;
	});
	for (const def of BUILT_IN_GAME_SETTINGS) {
		if (!result.some((s) => s.key === def.key)) {
			result.push({ id: generateShortId("gs"), ...def });
		}
	}
	// 内置参数排前面，保持内置之间的相对顺序；用户自定义的保持原顺序
	result.sort((a, b) => {
		if (a.builtIn && !b.builtIn) return -1;
		if (!a.builtIn && b.builtIn) return 1;
		return 0;
	});
	return result;
}

export function createDefaultMapData(): GameMap {
	return {
		serverMapId: "",
		id: generateShortId("map", 12),
		info: {
			name: "",
			author: "",
			version: "0.0.0",
			editorVersion: __APP_VERSION__,
			description: "",
			pendingChangelog: "",
			changelog: [],
			backgroundImageId: "",
			coverImageId: "",
		},
		mapItems: [],
		chanceCards: [],
		mapItemTypes: [],
		mapPaths: [],
		mapIndex: [],
		roles: [],
		inUse: false,
		mapEvents: [],
		phases: getInitPhase(),
		buildingModelIdList: ["", "", ""],
		uiTemplates: [],
		modifierTemplates: [],
		customUIs: [],
		gameSettingForm: BUILT_IN_GAME_SETTINGS.map((s) => ({ id: generateShortId("gs"), ...s })),
		extraLibs: "",
	} as GameMap;
}

export async function handleNewProtoFile() {
	const editorStore = useEditorStore();
	const mapDataStore = useMapDataStore();
	const resourceStore = useResourceStore();

	try {
		useEditorStore().setLoading(true);

		await window.electronAPI.clearTempDir();
		editorStore.setCurrentFilePath("");
		resourceStore.$patch({
			models: [],
			images: [],
		});
		const defaultMap = createDefaultMapData();
		mapDataStore.$patch(defaultMap);
		eventBus.emit("map-loaded", defaultMap);

		message.success("新建地图成功", 1);
	} catch (error) {
		console.error("新建地图失败:", error);
		message.error("新建地图失败");
	} finally {
		useEditorStore().setLoading(false);
	}
}

export async function handleOpenProtoFile() {
	const res = await window.electronAPI.showOpenDialog({
		title: "打开地图文件",
		properties: [],
		filters: [{ name: "地图文件", extensions: ["fpmap"] }],
	});
	const path = res.filePaths[0];
	if (path) loadMapDataFromPath(path);
}

export async function handleSaveProtoFile() {
	const editorStore = useEditorStore();
	const mapDataStore = useMapDataStore();
	mapDataStore.info.editorVersion = __APP_VERSION__;

	const path = editorStore.currentFilePath;
	if (!path) {
		await handleSaveAsOtherProtoFile();
		return;
	} else {
		await editorStore.withLoading(async () => {
			await saveGameMapToBinFile(mapDataStore.id, path, mapDataStore.$state);
		}, "保存地图中...");
		message.success("保存地图文件成功", 1);
	}
}

export async function handleSaveAsOtherProtoFile() {
	const mapDataStore = useMapDataStore();

	const res = await window.electronAPI.showSaveDialog({
		title: "另存为",
		filters: [{ name: "地图文件", extensions: ["fpmap"] }],
	});
	const path = res.filePath;
	console.log("🚀 ~ handleSaveAsOtherProtoFile ~ path:", path);
	if (path) {
		await useEditorStore().withLoading(async () => {
			await saveGameMapToBinFile(mapDataStore.id, path, mapDataStore.$state);
		}, "保存地图中...");
		useEditorStore().setCurrentFilePath(path);
		message.success("保存成功", 1);
	}
}

export async function readBufferToFile(buffer: Uint8Array, filePath: string) {
	return await window.electronAPI.saveLocalFile(filePath, buffer);
}

export async function readFileToTempDir(filePath: string, type: "model" | "image", fileName?: string) {
	const id = generateShortId(type);
	filePath = convertFpUrlToPath(filePath);
	const { filePath: newFilePath, fileType } = await window.electronAPI.copyFile(filePath, "", fileName || id);
	return { newFilePath, id, fileType };
}

export async function updateExistingModel(id: string, name: string, filePath: string) {
	const resourcesStore = useResourceStore();
	const oldModel = resourcesStore.findModelById(id);
	if (!oldModel) throw new Error("找不到该模型");

	let finalFileType = oldModel.fileType;

	if (filePath && filePath !== oldModel.url) {
		try {
			const buffer = await window.electronAPI.readFile(convertFpUrlToPath(filePath));
			await window.electronAPI.saveLocalFile(convertFpUrlToPath(oldModel.url), new Uint8Array(buffer));
			const newExt = filePath.split(".").pop();
			if (newExt) {
				finalFileType = newExt;
			}
		} catch (e: any) {
			message.error(`覆盖文件失败: ${e.message}`);
			return;
		}
	}

	resourcesStore.updateModel({
		id: id,
		name: name,
		fileType: finalFileType,
		url: oldModel.url,
	});
	eventBus.emit("change-model", id);
	message.success(`更新模型 "${name}" 成功`, 1);
}

export async function addNewModel(filePath: string, name: string) {
	try {
		const { newFilePath, id, fileType } = await readFileToTempDir(filePath, "model");
		const resourcesStore = useResourceStore();
		resourcesStore.addModel({
			id,
			name: name,
			fileType,
			url: convertToFpUrl(newFilePath),
		});
	} catch (e: any) {
		message.error(e.message, 1);
	}
}

export async function addNewImage(filePath: string, name: string) {
	const { newFilePath, id, fileType } = await readFileToTempDir(filePath, "image");
	const resourcesStore = useResourceStore();
	resourcesStore.addImage({
		id,
		name: name,
		fileType,
		url: convertToFpUrl(newFilePath),
	});
	return id;
}

/**
 * 将本地绝对路径转换为自定义协议 URL
 * @param localPath Electron 返回的绝对路径 (e.g. "C:\Games\map.png")
 */
export function convertToFpUrl(localPath: string): string {
	const normalizedPath = localPath.replace(/\\/g, "/");
	return `fp-file://${normalizedPath}`;
}

/**
 * 将自定义协议 URL转换为本地绝对路径
 * @param localPath 自定义协议 URL (e.g. "fp-file://C:/Games/map.png")
 */
export function convertFpUrlToPath(urlOrPath: string): string {
	if (!urlOrPath) return "";
	if (!urlOrPath.startsWith("fp-file:")) {
		return urlOrPath;
	}
	let rawPath = urlOrPath.replace(/^fp-file:\/{2,3}/, "");
	if (navigator.userAgent.includes("Windows")) {
		if (rawPath.startsWith("/") && /^[a-zA-Z]:/.test(rawPath.slice(1))) {
			rawPath = rawPath.slice(1);
		}
	}
	return decodeURIComponent(rawPath);
}

async function buildProductMapBuffer(
	mapId: string,
	mapData: GameMap,
	onProgress?: (stage: string, percent: number) => void
): Promise<Uint8Array> {
	const resourceStore = useResourceStore();
	const totalResources = resourceStore.models.length + resourceStore.images.length;
	let loadedResources = 0;

	const fetchBuffer = async (url: string): Promise<Uint8Array> => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`资源加载失败: ${url}`);
		const arrayBuffer = await response.arrayBuffer();
		loadedResources++;
		onProgress?.("加载资源", totalResources === 0 ? 30 : 10 + Math.floor((loadedResources / totalResources) * 20));
		return new Uint8Array(arrayBuffer);
	};

	const modelFiles: ProtoFileType[] = [];
	for (const model of resourceStore.models) {
		modelFiles.push({ id: model.id, name: model.name, filetype: model.fileType, buffer: await fetchBuffer(model.url) });
	}

	const imageFiles: ProtoFileType[] = [];
	for (const image of resourceStore.images) {
		imageFiles.push({ id: image.id, name: image.name, filetype: image.fileType, buffer: await fetchBuffer(image.url) });
	}

	const productData = {
		mapId,
		payload: JSON.stringify(mapData),
		serverMapId: mapData.serverMapId || "",
		resources: [
			...modelFiles.map((f) => ({ rid: f.id, label: f.name, ext: f.filetype, blob: f.buffer })),
			...imageFiles.map((f) => ({ rid: f.id, label: f.name, ext: f.filetype, blob: f.buffer })),
		],
	};

	onProgress?.("编码数据", 40);
	const encoded = encodeProductMap(productData);

	let dataToEncrypt: Uint8Array;
	try {
		onProgress?.("压缩中", 50);
		dataToEncrypt = await gzipCompress(encoded, (percent) => {
			onProgress?.("压缩中", 50 + Math.floor(percent * 0.3));
		});
		onProgress?.("压缩完成", 80);
	} catch (error) {
		console.warn("压缩失败，使用未压缩数据:", error);
		dataToEncrypt = encoded;
	}

	onProgress?.("加密", 85);
	const encrypted = await encrypt(dataToEncrypt, __MAP_ENCRYPT_KEY__);
	onProgress?.("导出完成", 100);
	return encrypted;
}

export async function exportGameMapToProductBuffer(
	mapId: string,
	mapData: GameMap,
	onProgress?: (stage: string, percent: number) => void
): Promise<Uint8Array> {
	return buildProductMapBuffer(mapId, mapData, onProgress);
}

export async function exportGameMapToProductFile(
	mapId: string,
	filePath: string,
	mapData: GameMap,
	onProgress?: (stage: string, percent: number) => void
): Promise<void> {
	const encrypted = await buildProductMapBuffer(mapId, mapData, onProgress);
	await window.electronAPI.saveFile(filePath, encrypted);
}

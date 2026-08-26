import { GameMap, GameMapInDb, MapPath, Role } from "@mine-monopoly/types";
import { loadFromProto, ProtoFileType, decodeProductMap, gzipDecompress, normalizeGameMap } from "@mine-monopoly/utils";
import { isProductFile, decrypt } from "@mine-monopoly/utils/crypto";
import { env } from "@mine-monopoly/env";
import { useLoading, useSettig } from "@src/store";
import { getGameMapById } from "../api/map";
import { useMapData, useResourceStore } from "@src/store/game";
import { formatBytes } from "@src/utils";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { getDracoLoader } from "../draco/draco";

/**
 * 地图在写入客户端 store / Worker 前必须满足的 MapPath 运行时前置条件。
 */
export function validateGameMapForRuntime(map: GameMap): string[] {
	const errors: string[] = [];
	const mapItems = Array.isArray(map.mapItems) ? map.mapItems : [];
	const mapItemById = new Map(mapItems.map((item) => [item.id, item]));

	if (!Array.isArray(map.mapItems)) {
		errors.push("地图缺少 mapItems 数组");
	}

	const startMapItemId = map.startMapItemId;
	if (!startMapItemId || !mapItemById.has(startMapItemId)) {
		errors.push(`起点 startMapItemId \"${startMapItemId ?? "<missing>"}\" 不存在于 mapItems`);
	}

	const pathNodes = new Set<string>();
	const paths = Array.isArray(map.mapPaths) ? map.mapPaths : [];
	for (const [index, path] of paths.entries()) {
		const candidate = path as Partial<MapPath>;
		const pathId = typeof candidate.id === "string" && candidate.id ? candidate.id : `<missing-id@${index}>`;
		const fromMapItemId = candidate.fromMapItemId;
		const toMapItemId = candidate.toMapItemId;

		if (!fromMapItemId || !mapItemById.has(fromMapItemId)) {
			errors.push(
				`路径 \"${pathId}\" 的 fromMapItemId \"${fromMapItemId ?? "<missing>"}\" 不存在于 mapItems`,
			);
		} else {
			pathNodes.add(fromMapItemId);
		}
		if (!toMapItemId || !mapItemById.has(toMapItemId)) {
			errors.push(
				`路径 \"${pathId}\" 的 toMapItemId \"${toMapItemId ?? "<missing>"}\" 不存在于 mapItems`,
			);
		} else {
			pathNodes.add(toMapItemId);
		}
	}

	// pathMapItemTypeIds 是新地图的显式路径节点声明；旧地图未配置该字段时不做此项收紧。
	const hasPathMapItemTypeIds = Object.prototype.hasOwnProperty.call(map, "pathMapItemTypeIds");
	if (!hasPathMapItemTypeIds) return errors;
	if (!Array.isArray(map.pathMapItemTypeIds)) {
		errors.push("pathMapItemTypeIds 必须是数组");
		return errors;
	}
	// 空数组表示编辑器尚未显式选择路径节点类型，继续按旧地图规则推断。
	if (map.pathMapItemTypeIds.length === 0) return errors;

	const declaredTypeIds = new Set(map.pathMapItemTypeIds);
	const knownTypeIds = new Set((Array.isArray(map.mapItemTypes) ? map.mapItemTypes : []).map((type) => type.id));
	for (const typeId of declaredTypeIds) {
		if (!knownTypeIds.has(typeId)) {
			errors.push(`pathMapItemTypeIds 声明了不存在的地图项类型 \"${typeId}\"`);
		}
	}

	for (const [index, path] of paths.entries()) {
		const candidate = path as Partial<MapPath>;
		const pathId = typeof candidate.id === "string" && candidate.id ? candidate.id : `<missing-id@${index}>`;
		for (const [endpointName, mapItemId] of [
			["fromMapItemId", candidate.fromMapItemId],
			["toMapItemId", candidate.toMapItemId],
		] as const) {
			if (!mapItemId) continue;
			const mapItem = mapItemById.get(mapItemId);
			if (mapItem && !declaredTypeIds.has(mapItem.type?.id)) {
				errors.push(
					`路径 \"${pathId}\" 的 ${endpointName} \"${mapItemId}\" 类型 \"${mapItem.type?.id ?? "<missing>"}\" 未包含在 pathMapItemTypeIds`,
				);
			}
		}
	}

	for (const mapItem of mapItems) {
		if (declaredTypeIds.has(mapItem.type?.id) && !pathNodes.has(mapItem.id)) {
			errors.push(
				`路径节点类型 \"${mapItem.type.id}\" 的地图项 \"${mapItem.id}\" 未被任何路径端点引用`,
			);
		}
	}

	return errors;
}

/**
 * 统一客户端地图入口：先补齐旧地图 MapPath 数据，再拒绝无法安全运行的路径图。
 */
export function normalizeAndValidateGameMap(map: GameMap): GameMap {
	const normalizedMap = normalizeGameMap(map);
	const errors = validateGameMapForRuntime(normalizedMap);
	if (errors.length > 0) {
		throw new Error(`地图路径校验失败：\n- ${errors.join("\n- ")}`);
	}
	return normalizedMap;
}

/**
 * 规范化已解码的地图载荷，使直接使用 getGameMap() 的宿主创建链路也不会绕过校验。
 */
function normalizeLoadedGameMapData<T extends { jsonData: string }>(mapData: T): T {
	const gameMap = normalizeAndValidateGameMap(JSON.parse(mapData.jsonData) as GameMap);
	return { ...mapData, jsonData: JSON.stringify(gameMap) };
}

/**
 * 流式下载地图文件并显示进度（已下载/总大小）
 * 通过 Content-Length 获取总大小；服务器未返回时仅显示已下载大小
 */
async function downloadMapFile(url: string): Promise<ArrayBuffer> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`地图文件下载失败 (HTTP ${response.status})`);
	}
	const total = Number(response.headers.get("content-length") || 0);
	const reader = response.body!.getReader();
	const chunks: BlobPart[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			// 转为独立 ArrayBuffer 视图，满足 BlobPart 的 Uint8Array<ArrayBuffer> 类型要求
			chunks.push(new Uint8Array(value));
			received += value.byteLength;
			const text = total > 0
				? `正在读取地图... ${formatBytes(received)} / ${formatBytes(total)} (${((received / total) * 100).toFixed(0)}%)`
				: `正在读取地图... ${formatBytes(received)}`;
			useLoading().showLoading(text, total > 0 ? (received / total) * 100 : 0);
		}
	}
	return new Blob(chunks).arrayBuffer();
}

async function loadFromProductFile(data: Uint8Array, key: string): Promise<{
	id: string;
	jsonData: string;
	modelFiles: ProtoFileType[];
	imageFiles: ProtoFileType[];
}> {
	// Decrypt the data
	const decrypted = await decrypt(data, key);

	// 尝试解压，如果失败则直接解析（向后兼容）
	let productData: Uint8Array;
	try {
		productData = await gzipDecompress(decrypted);
	} catch {
		// 解压失败，说明是旧格式，直接使用解密后的数据
		console.warn("解压失败，使用未压缩格式");
		productData = decrypted;
	}

	// Parse the product protobuf
	const productMap = decodeProductMap(productData);

	// Convert ProductResourceItem[] to ProtoFileType[]
	const modelFiles: ProtoFileType[] = [];
	const imageFiles: ProtoFileType[] = [];

	for (const resource of productMap.resources) {
		const protoFile: ProtoFileType = {
			id: resource.rid,
			name: resource.label,
			filetype: resource.ext,
			buffer: new Uint8Array(resource.blob),
		};

		// Model files are .glb or .gltf
		if (resource.ext === "glb" || resource.ext === "gltf") {
			modelFiles.push(protoFile);
		} else {
			imageFiles.push(protoFile);
		}
	}

	const mapData = JSON.parse(productMap.payload) as GameMap;
	mapData.serverMapId = productMap.serverMapId || mapData.serverMapId || "";

	return {
		id: productMap.mapId,
		jsonData: JSON.stringify(mapData),
		modelFiles,
		imageFiles,
	};
}

export async function getGameMap(gameMapInfo: GameMapInDb) {
	const encryptKey = env("MAP_ENCRYPT_KEY", "");
	const platform = window.platformAPI;

	let arrayBuffer: ArrayBuffer;
	if (platform?.loadMapCache && platform?.saveMapCache && gameMapInfo.hash) {
		// Electron 平台：优先命中本地缓存；未命中则下载并写回缓存
		// （hash 为空时跳过缓存，避免不同版本地图串用）
		const cached = await platform.loadMapCache(gameMapInfo.id, gameMapInfo.hash);
		if (cached) {
			arrayBuffer = cached;
		} else {
			arrayBuffer = await downloadMapFile(gameMapInfo.mapUrl);
			// 读取用户设置的最大缓存（幂等：从 localStorage 同步最新值）
			useSettig().initMapCacheMaxSize();
			const maxSizeBytes = useSettig().mapCacheMaxSizeMB * 1024 * 1024;
			await platform.saveMapCache(gameMapInfo.id, gameMapInfo.hash, arrayBuffer, maxSizeBytes);
		}
	} else {
		arrayBuffer = await downloadMapFile(gameMapInfo.mapUrl);
	}

	const bytes = new Uint8Array(arrayBuffer);
	// Detect format: .mmmap (encrypted product file) or .fpmap (legacy)
	const mapData = isProductFile(bytes)
		? await loadFromProductFile(bytes, encryptKey)
		: await loadFromProto(bytes);
	return normalizeLoadedGameMapData(mapData);
}

export async function loadGameMapFromServer(mapId: string) {
	useLoading().showLoading("正在向服务器获取地图信息...");
	const mapInfo = await getGameMapById(mapId);
	if (mapInfo) {
		useLoading().showLoading("正在读取地图...");
		const mapData = await getGameMap(mapInfo);
		const gameMap = normalizeAndValidateGameMap(JSON.parse(mapData.jsonData) as GameMap);
		useMapData().$patch(gameMap);
		await loadMapDataToResourceStore(mapData);
		useLoading().hideLoading();
		return { gameMap, mapInfo };
	} else {
		useLoading().hideLoading();
		throw Error("向服务器获取地图信息失败");
	}
}

export async function loadGameMapFromFile(file: ArrayBuffer) {
	useLoading().showLoading("正在读取地图...");
	const bytes = new Uint8Array(file);
	const encryptKey = env("MAP_ENCRYPT_KEY", "");

	// Detect format: .mmmap (encrypted product file) or .fpmap (legacy)
	let mapData;
	if (isProductFile(bytes)) {
		mapData = await loadFromProductFile(bytes, encryptKey);
	} else {
		mapData = await loadFromProto(bytes);
	}

	const gameMap = normalizeAndValidateGameMap(JSON.parse(mapData.jsonData) as GameMap);
	useMapData().$patch(gameMap);
	await loadMapDataToResourceStore(mapData);
	const coverResource = useResourceStore().getRecourceById(gameMap.info.coverImageId);
	if (!coverResource) throw Error("读取封面失败");
	const mapInfo: GameMapInDb = {
		id: gameMap.id,
		name: gameMap.info.name,
		author: gameMap.info.author,
		version: 0,
		description: gameMap.info.description,
		pendingChangelog: gameMap.info.pendingChangelog ?? "",
		changelog: gameMap.info.changelog ?? [],
		hash: "",
		coverUrl: coverResource.url,
		mapUrl: "",
		inuse: true,
		creatorId: null,
		status: "published",
		rejectReason: null,
		pendingUrl: null,
		pendingSourceUrl: null,
		sourceUrl: null,
		pendingHash: null,
		pendingVersion: gameMap.info.version,
	};
	useLoading().hideLoading();
	return { gameMap, mapInfo };
}

async function loadMapDataToResourceStore(mapData: {
	id: string;
	jsonData: string;
	modelFiles: ProtoFileType[];
	imageFiles: ProtoFileType[];
}) {
	const resourceStore = useResourceStore();
	resourceStore.clear();
	for (const imageResource of mapData.imageFiles) {
		const blob = new Blob([imageResource.buffer as BlobPart], { type: `image/${imageResource.filetype}` });
		const imageUrl = URL.createObjectURL(blob);
		//添加图片到资源仓库
		resourceStore.add({
			id: imageResource.id,
			name: imageResource.name,
			fileType: imageResource.filetype,
			url: imageUrl,
			type: "image",
		});
	}
	for (const modelResource of mapData.modelFiles) {
		const blob = new Blob([modelResource.buffer as BlobPart], { type: `application/octet-stream` });
		const modelUrl = URL.createObjectURL(blob);
		//添加模型到资源仓库
		resourceStore.add({
			id: modelResource.id,
			name: modelResource.name,
			fileType: modelResource.filetype,
			url: modelUrl,
			type: "model",
		});
	}
}

export async function getModelById(modelId: string) {
	const loader = new GLTFLoader();
	const modelInfo = useResourceStore().getRecourceById(modelId);
	if (!modelInfo) throw Error(`找不到id为 ${modelId} 的模型资源`);
	loader.setDRACOLoader(getDracoLoader());
	return await loader.loadAsync(modelInfo.url);
}

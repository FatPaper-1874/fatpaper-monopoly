import { GameMap, GameMapInDb, Role } from "@mine-monopoly/types";
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
	if (isProductFile(bytes)) {
		return await loadFromProductFile(bytes, encryptKey);
	} else {
		return await loadFromProto(bytes);
	}
}

export async function loadGameMapFromServer(mapId: string) {
	useLoading().showLoading("正在向服务器获取地图信息...");
	const mapInfo = await getGameMapById(mapId);
	if (mapInfo) {
		useLoading().showLoading("正在读取地图...");
		const mapData = await getGameMap(mapInfo);
		const gameMap = normalizeGameMap(JSON.parse(mapData.jsonData) as GameMap);
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

	console.log("🚀 ~ loadGameMapFromFile ~ mapData:", mapData);
	const gameMap = normalizeGameMap(JSON.parse(mapData.jsonData) as GameMap);
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

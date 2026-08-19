import { useMapDataStore } from "@src/stores";
import { generateMapItemId } from "@src/utils/map-item-id";
import { createMapPathId } from "@mine-monopoly/utils";

/**
 * 小工具：将地图所有 map item 的 ID 重新生成为当前标准格式（mi-xxxxxx），
 * 并同步更新所有引用该 ID 的位置：
 * - mapItem.linkto / beLinked（地图项之间的互相引用）
 * - mapPaths[].fromMapItemId / toMapItemId 及由它们推导的路径 ID
 * - startMapItemId（地图起点）
 * - mapIndex（旧版线性索引）
 *
 * @returns 被重命名的 map item 数量
 */
export function renameAllMapItemIds(): number {
	const mapDataStore = useMapDataStore();
	const { mapItems, mapPaths } = mapDataStore;

	if (mapItems.length === 0) return 0;

	// 1. 为每个 map item 生成新 ID 并直接赋值，建立 旧ID -> 新ID 映射用于引用同步。
	//    注意：旧地图可能存在重复 ID，此时不能通过 idMap 反查自身新 ID（会被覆盖），
	//    因此自身 ID 在生成时直接赋值，idMap 只服务于 linkto/beLinked 等引用。
	const usedIds = new Set<string>();
	const idMap = new Map<string, string>();
	for (const item of mapItems) {
		let newId = generateMapItemId();
		while (usedIds.has(newId)) {
			newId = generateMapItemId();
		}
		usedIds.add(newId);
		idMap.set(item.id, newId);
		item.id = newId;
	}

	// 2. 更新 map item 互相引用
	for (const item of mapItems) {
		if (item.linkto) item.linkto = idMap.get(item.linkto) ?? item.linkto;
		if (item.beLinked) item.beLinked = idMap.get(item.beLinked) ?? item.beLinked;
	}

	// 3. 更新路径：起止 map item ID 与由它们推导的路径 ID
	const usedPathIds = new Set<string>();
	mapPaths.forEach((path) => {
		path.fromMapItemId = idMap.get(path.fromMapItemId) ?? path.fromMapItemId;
		path.toMapItemId = idMap.get(path.toMapItemId) ?? path.toMapItemId;
		// 同方向路径唯一，ID 由起止 map item ID 推导；异常重复时追加序号避免冲突
		const baseId = createMapPathId(path.fromMapItemId, path.toMapItemId);
		let id = baseId;
		let suffix = 1;
		while (usedPathIds.has(id)) {
			id = `${baseId}-${suffix}`;
			suffix++;
		}
		usedPathIds.add(id);
		path.id = id;
	});

	// 4. 更新地图起点与旧版线性索引
	if (mapDataStore.startMapItemId) {
		mapDataStore.startMapItemId = idMap.get(mapDataStore.startMapItemId) ?? mapDataStore.startMapItemId;
	}
	mapDataStore.updateMapIndex(mapDataStore.mapIndex.map((id) => idMap.get(id) ?? id));

	return mapItems.length;
}

import { useMapDataStore } from "@src/stores";
import { generateMapItemId } from "@src/utils/map-item-id";
import { createMapPathId, createMapPathsFromMapIndex } from "@mine-monopoly/utils";

/** 重命名工具的统计结果，用于向用户展示修改内容与清理情况 */
export interface RenameMapItemIdsResult {
	/** 被重命名的 map item 数量 */
	renamedCount: number;
	/** 因端点悬空（引用不存在的 map item）而被移除的路径数量 */
	removedDanglingPaths: number;
	/** 从旧版路径索引中清理的悬空引用数量 */
	removedDanglingIndexIds: number;
	/** 起点 startMapItemId 因缺失/悬空而回退到其他有效节点 */
	startMapItemIdFallback: boolean;
}

/**
 * 小工具：将地图所有 map item 的 ID 重新生成为当前标准格式（mi-xxxxxx），
 * 并同步更新所有引用该 ID 的位置：
 * - mapItem.linkto / beLinked（地图项之间的互相引用）
 * - mapPaths[].fromMapItemId / toMapItemId 及由它们推导的路径 ID
 * - startMapItemId（地图起点；悬空/缺失时回退到有效节点）
 * - mapIndex（旧版线性索引；悬空引用会被清理）
 *
 * 悬空引用（指向不存在 map item 的旧 ID）会导致客户端加载时报
 * "起点 startMapItemId ... 不存在于 mapItems" 等校验错误，因此本工具会：
 * - startMapItemId 无法映射时回退到「新索引首节点 → 首条路径起点 → 首个 map item」
 * - mapIndex 过滤掉悬空引用
 * - from/to 端点悬空的路径整条移除（若全部被移除且索引仍有 ≥2 个节点，按索引重建闭环路径）
 *
 * @returns 重命名与清理统计
 */
export function renameAllMapItemIds(): RenameMapItemIdsResult {
	const mapDataStore = useMapDataStore();
	const { mapItems, mapPaths } = mapDataStore;

	if (mapItems.length === 0) {
		return { renamedCount: 0, removedDanglingPaths: 0, removedDanglingIndexIds: 0, startMapItemIdFallback: false };
	}

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
	const validIds = new Set(mapItems.map((item) => item.id));

	// 2. 更新 map item 互相引用（悬空引用保持原值：客户端不校验，避免误删用户数据）
	for (const item of mapItems) {
		if (item.linkto) item.linkto = idMap.get(item.linkto) ?? item.linkto;
		if (item.beLinked) item.beLinked = idMap.get(item.beLinked) ?? item.beLinked;
	}

	// 3. 旧版路径索引：过滤悬空引用（指向不存在 map item 的 ID 无意义，保留会导致运行时取到无效节点）
	let removedDanglingIndexIds = 0;
	const newMapIndex = mapDataStore.mapIndex
		.map((id) => idMap.get(id) ?? id)
		.filter((id) => {
			if (!validIds.has(id)) {
				removedDanglingIndexIds++;
				return false;
			}
			return true;
		});

	// 4. 路径：映射端点，端点悬空的路径整条移除（客户端对 from/to 做严格校验，悬空路径必须清理）
	let removedDanglingPaths = 0;
	const keptPaths = mapPaths.filter((path) => {
		const fromMapItemId = idMap.get(path.fromMapItemId) ?? path.fromMapItemId;
		const toMapItemId = idMap.get(path.toMapItemId) ?? path.toMapItemId;
		if (!validIds.has(fromMapItemId) || !validIds.has(toMapItemId)) {
			removedDanglingPaths++;
			return false;
		}
		path.fromMapItemId = fromMapItemId;
		path.toMapItemId = toMapItemId;
		return true;
	});
	// 重建路径 ID（由新端点推导；异常重复时追加序号避免冲突）
	const usedPathIds = new Set<string>();
	keptPaths.forEach((path) => {
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
	// 路径被全部清理且索引仍有 ≥2 个有效节点时，按索引重建闭环路径，保证地图可运行
	const rebuiltPaths = keptPaths.length === 0 && newMapIndex.length >= 2 ? createMapPathsFromMapIndex(newMapIndex) : keptPaths;
	mapPaths.splice(0, mapPaths.length, ...rebuiltPaths);

	// 5. 起点：优先映射旧值；旧值缺失/悬空时回退到有效节点，保证客户端校验通过
	const oldStart = mapDataStore.startMapItemId;
	const mappedStart = oldStart ? idMap.get(oldStart) : undefined;
	const needsFallback = !oldStart || !mappedStart || !validIds.has(mappedStart);
	if (!needsFallback) {
		mapDataStore.startMapItemId = mappedStart;
	} else {
		mapDataStore.startMapItemId = newMapIndex[0] ?? rebuiltPaths[0]?.fromMapItemId ?? mapItems[0]?.id;
	}

	// 6. 写回索引（触发 map-index-update 事件，UI 刷新）
	mapDataStore.updateMapIndex(newMapIndex);

	return {
		renamedCount: mapItems.length,
		removedDanglingPaths,
		removedDanglingIndexIds,
		startMapItemIdFallback: needsFallback,
	};
}

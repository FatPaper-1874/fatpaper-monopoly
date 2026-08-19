import type { GameMap, GamePhaseInfo, MapPath } from "@mine-monopoly/types";

/**
 * 生成路径 ID：由起止地图项 ID 组成。
 * 手动创建与从 mapIndex 自动生成的路径共用此格式，保证一致且可推导。
 */
export function createMapPathId(fromMapItemId: string, toMapItemId: string): string {
	return `${fromMapItemId}-${toMapItemId}`;
}

/**
 * 将旧版 mapIndex 转换为闭环的有向路径集合。
 *
 * 仅用于加载未保存 mapPaths 的旧地图；路径 ID 由起止地图项 ID 组成。
 * 正常旧地图为无重复相邻对的简单闭环，ID 天然唯一；
 * 若数据异常出现重复的相邻对，则追加最小序号避免 ID 冲突。
 */
export function createMapPathsFromMapIndex(mapIndex: readonly string[]): MapPath[] {
	if (mapIndex.length < 2) return [];

	const usedIds = new Set<string>();
	return mapIndex.map((fromMapItemId, index) => {
		const toMapItemId = mapIndex[(index + 1) % mapIndex.length];
		const baseId = createMapPathId(fromMapItemId, toMapItemId);
		let id = baseId;
		let suffix = 1;
		while (usedIds.has(id)) {
			id = `${baseId}-${suffix}`;
			suffix++;
		}
		usedIds.add(id);
		return {
			id,
			fromMapItemId,
			toMapItemId,
		};
	});
}

/**
 * 向后兼容：确保地图 phases 中所有已知阶段类型都存在。
 * 旧地图可能缺少新增的阶段类型（如 postRestore），缺失的初始化为空数组。
 *
 * 此函数会原地修改 phases 对象。
 *
 * @param phases - 地图 phases 对象
 */
export function normalizePhases(phases: GameMap["phases"]): void {
	const requiredPhases: Array<keyof GameMap["phases"]> = [
		"gameOverRule",
		"gameInited",
		"playerPreInit",
		"propertyPreInit",
		"gameRoundStart",
		"playerRound",
		"gameRoundEnd",
		"postRestore",
	];
	for (const key of requiredPhases) {
		// 使用 ??= 运算符仅在属性为 undefined/null 时赋值，避免不必要的覆盖
		// 注意：由于 phases[key] 类型可能包含 undefined，这里需要类型断言
		// 但由于我们只对已知的 key 进行操作，这是类型安全的
		if (!phases[key]) {
			(phases as Record<keyof GameMap["phases"], GamePhaseInfo[]>)[key] = [];
		}
	}
}

/**
 * 向后兼容：补齐地图运行所需的新增数据结构。
 *
 * 此函数会原地修改 map 对象并返回它（方便链式调用）。
 * 未配置 mapPaths 的旧地图会由 mapIndex 生成等价的线性闭环路径。
 *
 * @param map - 地图对象
 * @returns 同一个 map 对象（已规范化）
 */
export function normalizeGameMap(map: GameMap): GameMap {
	if (!Array.isArray(map.mapPaths)) {
		map.mapPaths = createMapPathsFromMapIndex(map.mapIndex ?? []);
	}
	if (!map.startMapItemId && map.mapIndex?.length) {
		map.startMapItemId = map.mapIndex[0];
	}

	const phases = map.phases;
	if (phases) normalizePhases(phases);
	return map;
}

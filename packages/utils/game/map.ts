import type { GameMap, GamePhaseInfo, MapMoveDirection, MapPath } from "@mine-monopoly/types";

/** 由路径方向区分的地图路径邻接表。 */
export interface MapPathAdjacency {
	/** 按路径原始方向离开每个地图项的边，顺序与 mapPaths 一致。 */
	outgoing: ReadonlyMap<string, readonly MapPath[]>;

	/** 可反向走入每个地图项的边，顺序与 mapPaths 一致。 */
	incoming: ReadonlyMap<string, readonly MapPath[]>;
}

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
 * 建立 MapPath V2 的双向邻接表。
 * 不排序、不去重、不修改输入，调用方可据此保留 mapPaths 的稳定选择顺序。
 */
export function buildMapPathAdjacency(mapPaths: readonly MapPath[]): MapPathAdjacency {
	const outgoing = new Map<string, MapPath[]>();
	const incoming = new Map<string, MapPath[]>();

	for (const path of mapPaths) {
		const outgoingPaths = outgoing.get(path.fromMapItemId);
		if (outgoingPaths) {
			outgoingPaths.push(path);
		} else {
			outgoing.set(path.fromMapItemId, [path]);
		}

		const incomingPaths = incoming.get(path.toMapItemId);
		if (incomingPaths) {
			incomingPaths.push(path);
		} else {
			incoming.set(path.toMapItemId, [path]);
		}
	}

	return { outgoing, incoming };
}

/** 返回地图初始状态下启用的路径 ID；未配置 initEnable 视为启用。 */
export function getInitialEnabledMapPathIds(mapPaths: readonly MapPath[]): string[] {
	return mapPaths.filter((path) => path.initEnable !== false).map((path) => path.id);
}

/**
 * 根据会话启用状态过滤路径。
 * 未传 enabledPathIds 时使用静态 initEnable；传入空集合表示没有路径启用。
 */
export function filterEnabledMapPaths(
	mapPaths: readonly MapPath[],
	enabledPathIds?: ReadonlySet<string> | readonly string[],
): MapPath[] {
	if (enabledPathIds === undefined) {
		return mapPaths.filter((path) => path.initEnable !== false);
	}

	const enabledPathIdSet = enabledPathIds instanceof Set ? enabledPathIds : new Set(enabledPathIds);
	return mapPaths.filter((path) => enabledPathIdSet.has(path.id));
}

/**
 * 从邻接表中获取当前节点在实际移动方向下可走且已启用的边。
 * forward 使用原始出边，reverse 使用原始入边；返回顺序始终保持 mapPaths 原始顺序。
 */
export function getAvailableMapPaths(
	adjacency: MapPathAdjacency,
	mapItemId: string,
	direction: MapMoveDirection,
	enabledPathIds?: ReadonlySet<string> | readonly string[],
): MapPath[] {
	const candidates = direction === "forward"
		? adjacency.outgoing.get(mapItemId) ?? []
		: adjacency.incoming.get(mapItemId) ?? [];
	return filterEnabledMapPaths(candidates, enabledPathIds);
}

/**
 * 从旧 positionIndex 和 mapIndex 解析当前地图项 ID。
 * 不对越界索引取模，避免损坏的旧快照被静默映射到错误位置。
 */
export function getMapItemIdFromPositionIndex(
	positionIndex: number | undefined,
	mapIndex: readonly string[] | undefined,
): string | undefined {
	if (typeof positionIndex !== "number" || !Number.isInteger(positionIndex) || !mapIndex || positionIndex < 0 || positionIndex >= mapIndex.length) {
		return undefined;
	}
	return mapIndex[positionIndex];
}

/**
 * 为旧线性兼容字段反查位置索引。
 * 地图项 ID 在 mapIndex 中重复时返回第一次出现的位置，调用方不得用该值作为图选路依据。
 */
export function getPositionIndexFromMapItemId(
	mapItemId: string | undefined,
	mapIndex: readonly string[] | undefined,
): number | undefined {
	if (!mapItemId || !mapIndex) return undefined;
	const positionIndex = mapIndex.indexOf(mapItemId);
	return positionIndex === -1 ? undefined : positionIndex;
}

/**
 * 从按 mapPaths 原始顺序生成的候选列表中确定默认路径。
 * 原始序号优先；序号相同（仅理论上的相同元素）时再以 path.id 作为确定性兜底。
 */
export function selectDefaultMapPath(candidates: readonly MapPath[]): MapPath | undefined {
	return candidates
		.map((candidate, index) => ({ candidate, index }))
		.sort((left, right) => left.index - right.index || left.candidate.id.localeCompare(right.candidate.id))[0]
		?.candidate;
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

<script setup lang="ts">
import type { MapItem, MapPath } from "@mine-monopoly/types";
import { message } from "ant-design-vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { createMapPathId } from "@mine-monopoly/utils";
import { useMapDataStore } from "@src/stores/index";

interface RouteSegment {
	id: string;
	pathIds: string[];
	mapItemIds: string[];
	isLoop: boolean;
}

interface PreviewPathLine {
	id: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
}

const mapDataStore = useMapDataStore();
const mapItemsList = computed(() => mapDataStore.mapItems);
const itemTypeList = computed(() => mapDataStore.mapItemTypes);
const startMapItemId = ref("");
const selectedItemTypeIds = ref<string[]>([...(mapDataStore.pathMapItemTypeIds ?? [])]);
const model = defineModel({ default: false });
const emits = defineEmits<{ (event: "submit"): void }>();
const previewViewportRef = ref<HTMLElement | null>(null);
const previewScale = ref(1);
const previewPaths = ref<MapPath[]>([]);
const previewStartMapItemId = ref("");
const previewComponentCount = ref(0);
let previewResizeObserver: ResizeObserver | undefined;

const PREVIEW_CELL_SIZE = 20;
const PREVIEW_CELL_GAP = 2;
const PREVIEW_PATH_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#db2777", "#0891b2"];

const selectedTypeNames = computed(() => new Set(
	selectedItemTypeIds.value
		.map((id) => itemTypeList.value.find((type) => type.id === id)?.name)
		.filter((name): name is string => Boolean(name)),
));

const selectedMapItems = computed(() => mapItemsList.value.filter((item) => {
	if (item.beLinked) return false;
	return Boolean(
		(item.type?.id && selectedItemTypeIds.value.includes(item.type.id)) ||
		(item.type?.name && selectedTypeNames.value.has(item.type.name)),
	);
}));

const selectedMapItemIds = computed(() => new Set(selectedMapItems.value.map((item) => item.id)));
const mapItemById = computed(() => new Map(mapItemsList.value.map((item) => [item.id, item])));
const startMapItemOptions = computed(() => selectedMapItems.value.map((item) => ({
	value: item.id,
	label: `${item.type?.name || "未命名类型"} (${item.x}, ${item.y})`,
})));

const previewBounds = computed(() => {
	if (mapItemsList.value.length === 0) return undefined;
	const xs = mapItemsList.value.map((item) => item.x);
	const ys = mapItemsList.value.map((item) => item.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	return { minX, minY, columns: maxX - minX + 1, rows: maxY - minY + 1 };
});

const previewCanvasSize = computed(() => {
	if (!previewBounds.value) return undefined;
	return {
		width: previewBounds.value.columns * PREVIEW_CELL_SIZE + (previewBounds.value.columns - 1) * PREVIEW_CELL_GAP,
		height: previewBounds.value.rows * PREVIEW_CELL_SIZE + (previewBounds.value.rows - 1) * PREVIEW_CELL_GAP,
	};
});

const previewCanvasStyle = computed(() => {
	if (!previewCanvasSize.value) return {};
	return {
		width: `${previewCanvasSize.value.width}px`,
		height: `${previewCanvasSize.value.height}px`,
		transform: `scale(${previewScale.value})`,
	};
});

const previewGridStyle = computed(() => {
	if (!previewBounds.value) return {};
	return {
		gridTemplateColumns: `repeat(${previewBounds.value.columns}, ${PREVIEW_CELL_SIZE}px)`,
		gridTemplateRows: `repeat(${previewBounds.value.rows}, ${PREVIEW_CELL_SIZE}px)`,
	};
});

const routeSegments = computed(() => buildRouteSegments(previewPaths.value));
const routeSegmentIndexByPathId = computed(() => {
	const indexes = new Map<string, number>();
	routeSegments.value.forEach((segment, index) => {
		segment.pathIds.forEach((pathId) => indexes.set(pathId, index));
	});
	return indexes;
});

const routeJunctionIds = computed(() => {
	const degreeByMapItemId = new Map<string, number>();
	for (const path of previewPaths.value) {
		degreeByMapItemId.set(path.fromMapItemId, (degreeByMapItemId.get(path.fromMapItemId) ?? 0) + 1);
		degreeByMapItemId.set(path.toMapItemId, (degreeByMapItemId.get(path.toMapItemId) ?? 0) + 1);
	}
	return new Set([...degreeByMapItemId].filter(([, degree]) => degree > 2).map(([id]) => id));
});

const previewPathLines = computed<PreviewPathLine[]>(() => {
	const bounds = previewBounds.value;
	if (!bounds) return [];

	return previewPaths.value.flatMap((path) => {
		const fromMapItem = mapItemById.value.get(path.fromMapItemId);
		const toMapItem = mapItemById.value.get(path.toMapItemId);
		if (!fromMapItem || !toMapItem) return [];

		const x1 = (fromMapItem.x - bounds.minX) * (PREVIEW_CELL_SIZE + PREVIEW_CELL_GAP) + PREVIEW_CELL_SIZE / 2;
		const y1 = (fromMapItem.y - bounds.minY) * (PREVIEW_CELL_SIZE + PREVIEW_CELL_GAP) + PREVIEW_CELL_SIZE / 2;
		const targetX = (toMapItem.x - bounds.minX) * (PREVIEW_CELL_SIZE + PREVIEW_CELL_GAP) + PREVIEW_CELL_SIZE / 2;
		const targetY = (toMapItem.y - bounds.minY) * (PREVIEW_CELL_SIZE + PREVIEW_CELL_GAP) + PREVIEW_CELL_SIZE / 2;
		const distance = Math.hypot(targetX - x1, targetY - y1);
		const arrowOffset = distance === 0 ? 0 : Math.min(PREVIEW_CELL_SIZE / 2 + 4, distance / 2);
		const x2 = targetX - ((targetX - x1) / distance) * arrowOffset;
		const y2 = targetY - ((targetY - y1) / distance) * arrowOffset;
		const segmentIndex = routeSegmentIndexByPathId.value.get(path.id) ?? 0;

		return [{
			id: path.id,
			x1,
			y1,
			x2,
			y2,
			color: PREVIEW_PATH_COLORS[segmentIndex % PREVIEW_PATH_COLORS.length],
		}];
	});
});

const previewMapItems = computed(() => mapItemsList.value.map((item) => ({
	...item,
	isPathNode: selectedMapItemIds.value.has(item.id),
	isStart: previewStartMapItemId.value === item.id || (!previewPaths.value.length && startMapItemId.value === item.id),
	isRouteJunction: routeJunctionIds.value.has(item.id),
	style: previewBounds.value
		? { gridColumn: item.x - previewBounds.value.minX + 1, gridRow: item.y - previewBounds.value.minY + 1 }
		: {},
	title: `${item.type?.name || "未命名类型"}\n坐标：(${item.x}, ${item.y})\nID：${item.id}`,
})));

function clearRoutePreview() {
	previewPaths.value = [];
	previewStartMapItemId.value = "";
	previewComponentCount.value = 0;
}

function getPathMapItemTypeIds(paths: readonly MapPath[]): string[] {
	const pathNodeIds = new Set(paths.flatMap((path) => [path.fromMapItemId, path.toMapItemId]));
	return [...new Set(
		mapItemsList.value
			.filter((mapItem) => pathNodeIds.has(mapItem.id))
			.map((mapItem) => mapItem.type?.id)
			.filter((typeId): typeId is string => Boolean(typeId)),
	)];
}

function loadCurrentMapPathsAsPreview() {
	const paths = mapDataStore.mapPaths;
	if (paths.length === 0) {
		clearRoutePreview();
		return;
	}

	const pathNodeIds = new Set(paths.flatMap((path) => [path.fromMapItemId, path.toMapItemId]));
	previewPaths.value = paths.map((path) => ({ ...path }));
	previewStartMapItemId.value = pathNodeIds.has(mapDataStore.startMapItemId ?? "")
		? mapDataStore.startMapItemId!
		: paths[0].fromMapItemId;
	previewComponentCount.value = getPathComponentCount(paths);
}

watch(model, (isOpen) => {
	if (!isOpen) return;
	const currentMapPaths = mapDataStore.mapPaths;
	// 旧地图可能没有保存 pathMapItemTypeIds，此时从当前 MapPath 端点的 MapItem 类型推断。
	selectedItemTypeIds.value = [...new Set([
		...(mapDataStore.pathMapItemTypeIds ?? []),
		...getPathMapItemTypeIds(currentMapPaths),
	])];
	startMapItemId.value = mapDataStore.startMapItemId ?? "";
	// 组件首次挂载时弹窗已处于打开状态；immediate 确保也会载入当前 MapPath。
	// 等类型和起点的响应式更新完成后，再载入当前 MapPath；这些更新会清空旧预览。
	void nextTick(() => {
		if (model.value) loadCurrentMapPathsAsPreview();
	});
}, { immediate: true });

watch(selectedMapItemIds, (ids) => {
	if (startMapItemId.value && !ids.has(startMapItemId.value)) startMapItemId.value = "";
	clearRoutePreview();
});

watch(startMapItemId, clearRoutePreview);
watch([model, previewBounds], queuePreviewScaleUpdate, { flush: "post" });

function updatePreviewScale() {
	const viewport = previewViewportRef.value;
	const size = previewCanvasSize.value;
	if (!model.value || !viewport || !size) return;

	const availableWidth = Math.max(viewport.clientWidth - 24, 1);
	const availableHeight = Math.max(viewport.clientHeight - 24, 1);
	previewScale.value = Math.min(availableWidth / size.width, availableHeight / size.height);
}

function queuePreviewScaleUpdate() {
	void nextTick(updatePreviewScale);
}

watch(previewViewportRef, (viewport) => {
	previewResizeObserver?.disconnect();
	if (!viewport) return;
	previewResizeObserver = new ResizeObserver(queuePreviewScaleUpdate);
	previewResizeObserver.observe(viewport);
	queuePreviewScaleUpdate();
});

onBeforeUnmount(() => previewResizeObserver?.disconnect());

function selectStartMapItem(mapItem: MapItem) {
	if (!selectedMapItemIds.value.has(mapItem.id)) return;
	startMapItemId.value = mapItem.id;
}

function resolveGenerationInput(): { pathNodes: MapItem[]; startMapItem: MapItem } | undefined {
	const pathNodes = selectedMapItems.value;
	if (pathNodes.length === 0) {
		message.warning("请先选择至少一个地图元素类型");
		return undefined;
	}

	let startMapItem = pathNodes[0];
	if (startMapItemId.value) {
		const selectedStartMapItem = mapDataStore.findMapItemById(startMapItemId.value);
		if (!selectedStartMapItem || !selectedMapItemIds.value.has(selectedStartMapItem.id)) {
			message.warning("所选起点不是当前的路径节点，将使用第一个路径节点");
			startMapItemId.value = "";
		} else {
			startMapItem = selectedStartMapItem;
		}
	}
	return { pathNodes, startMapItem };
}

function handleGenerateRoutePreview() {
	const input = resolveGenerationInput();
	if (!input) return;

	try {
		const { paths, componentCount } = generateAdjacentPaths(input.pathNodes, input.startMapItem);
		previewPaths.value = paths;
		previewStartMapItemId.value = input.startMapItem.id;
		previewComponentCount.value = componentCount;
		message.success(`已生成 ${paths.length} 条路径预览，可调整路线方向后再保存`, 2);
	} catch (error: any) {
		message.error(error.message || "生成相邻路径预览失败");
	}
}

function reverseRouteSegment(segment: RouteSegment) {
	const pathIds = new Set(segment.pathIds);
	previewPaths.value = previewPaths.value.map((path) => {
		if (!pathIds.has(path.id)) return path;
		return {
			...path,
			id: createMapPathId(path.toMapItemId, path.fromMapItemId),
			fromMapItemId: path.toMapItemId,
			toMapItemId: path.fromMapItemId,
		};
	});
}

function handleSaveRoutePreview() {
	if (previewPaths.value.length === 0 && selectedMapItems.value.length > 1) {
		message.warning("请先生成路线预览");
		return;
	}
	if (!previewStartMapItemId.value) {
		message.warning("请先生成路线预览");
		return;
	}

	try {
		mapDataStore.setPathMapItemTypeIds(selectedItemTypeIds.value);
		mapDataStore.replaceMapPaths(previewPaths.value, "自动生成相邻路径");
		mapDataStore.setStartMapItemId(previewStartMapItemId.value);
		message.success(`已保存 ${previewPaths.value.length} 条相邻路径，覆盖 ${previewComponentCount.value} 个区域`, 2);
		emits("submit");
		model.value = false;
	} catch (error: any) {
		message.error(error.message || "保存相邻路径失败");
	}
}

function generateAdjacentPaths(mapItems: MapItem[], startMapItem: MapItem): { paths: MapPath[]; componentCount: number } {
	const mapItemByCoordinate = new Map<string, MapItem>();
	for (const mapItem of mapItems) {
		const coordinateKey = `${mapItem.x},${mapItem.y}`;
		if (mapItemByCoordinate.has(coordinateKey)) throw new Error(`路径节点坐标重复：(${coordinateKey})`);
		mapItemByCoordinate.set(coordinateKey, mapItem);
	}

	const visited = new Set<string>();
	const traversedPairs = new Set<string>();
	const paths: MapPath[] = [];
	let componentCount = 0;
	const directions = [
		{ x: 1, y: 0 },
		{ x: 0, y: 1 },
		{ x: -1, y: 0 },
		{ x: 0, y: -1 },
	];
	const pairKey = (firstId: string, secondId: string) => firstId < secondId ? `${firstId}\u0000${secondId}` : `${secondId}\u0000${firstId}`;

	function traverse(current: MapItem) {
		visited.add(current.id);
		for (const direction of directions) {
			const neighbor = mapItemByCoordinate.get(`${current.x + direction.x},${current.y + direction.y}`);
			if (!neighbor) continue;

			const key = pairKey(current.id, neighbor.id);
			if (traversedPairs.has(key)) continue;
			traversedPairs.add(key);

			paths.push({
				id: createMapPathId(current.id, neighbor.id),
				fromMapItemId: current.id,
				toMapItemId: neighbor.id,
				initEnable: true,
			});
			if (!visited.has(neighbor.id)) traverse(neighbor);
		}
	}

	const roots = [startMapItem, ...mapItems.filter((item) => item.id !== startMapItem.id)];
	for (const root of roots) {
		if (visited.has(root.id)) continue;
		componentCount += 1;
		traverse(root);
	}
	return { paths, componentCount };
}

function getPathComponentCount(paths: readonly MapPath[]): number {
	const adjacency = new Map<string, string[]>();
	for (const path of paths) {
		const fromNeighbors = adjacency.get(path.fromMapItemId);
		if (fromNeighbors) fromNeighbors.push(path.toMapItemId);
		else adjacency.set(path.fromMapItemId, [path.toMapItemId]);

		const toNeighbors = adjacency.get(path.toMapItemId);
		if (toNeighbors) toNeighbors.push(path.fromMapItemId);
		else adjacency.set(path.toMapItemId, [path.fromMapItemId]);
	}

	const visited = new Set<string>();
	let componentCount = 0;
	for (const startMapItemId of adjacency.keys()) {
		if (visited.has(startMapItemId)) continue;
		componentCount += 1;
		const pendingMapItemIds = [startMapItemId];
		visited.add(startMapItemId);
		while (pendingMapItemIds.length > 0) {
			const currentMapItemId = pendingMapItemIds.pop()!;
			for (const neighborMapItemId of adjacency.get(currentMapItemId) ?? []) {
				if (visited.has(neighborMapItemId)) continue;
				visited.add(neighborMapItemId);
				pendingMapItemIds.push(neighborMapItemId);
			}
		}
	}
	return componentCount;
}

function buildRouteSegments(paths: MapPath[]): RouteSegment[] {
	const pathsByMapItemId = new Map<string, MapPath[]>();
	for (const path of paths) {
		for (const mapItemId of [path.fromMapItemId, path.toMapItemId]) {
			const incidentPaths = pathsByMapItemId.get(mapItemId);
			if (incidentPaths) incidentPaths.push(path);
			else pathsByMapItemId.set(mapItemId, [path]);
		}
	}

	const separatorIds = new Set(
		[...pathsByMapItemId].filter(([, incidentPaths]) => incidentPaths.length !== 2).map(([mapItemId]) => mapItemId),
	);
	const usedPathIds = new Set<string>();
	const segments: RouteSegment[] = [];

	function followRoute(startMapItemId: string, firstPath: MapPath, isLoop = false): RouteSegment {
		const pathIds: string[] = [];
		const mapItemIds = [startMapItemId];
		let currentMapItemId = startMapItemId;
		let currentPath = firstPath;

		while (true) {
			usedPathIds.add(currentPath.id);
			pathIds.push(currentPath.id);
			const nextMapItemId = currentPath.fromMapItemId === currentMapItemId
				? currentPath.toMapItemId
				: currentPath.fromMapItemId;
			mapItemIds.push(nextMapItemId);

			if (nextMapItemId === startMapItemId) return {
				id: `route-${segments.length + 1}`,
				pathIds,
				mapItemIds,
				isLoop: true,
			};
			if (!isLoop && separatorIds.has(nextMapItemId)) return {
				id: `route-${segments.length + 1}`,
				pathIds,
				mapItemIds,
				isLoop: false,
			};

			const nextPath = (pathsByMapItemId.get(nextMapItemId) ?? []).find((path) => path.id !== currentPath.id && !usedPathIds.has(path.id));
			if (!nextPath) return {
				id: `route-${segments.length + 1}`,
				pathIds,
				mapItemIds,
				isLoop,
			};
			currentMapItemId = nextMapItemId;
			currentPath = nextPath;
		}
	}

	for (const separatorId of separatorIds) {
		for (const path of pathsByMapItemId.get(separatorId) ?? []) {
			if (!usedPathIds.has(path.id)) segments.push(followRoute(separatorId, path));
		}
	}

	for (const path of paths) {
		if (!usedPathIds.has(path.id)) segments.push(followRoute(path.fromMapItemId, path, true));
	}
	return segments;
}

function getRouteSegmentColor(index: number): string {
	return PREVIEW_PATH_COLORS[index % PREVIEW_PATH_COLORS.length];
}

function getMapItemPosition(mapItemId: string): string {
	const mapItem = mapItemById.value.get(mapItemId);
	return mapItem ? `(${mapItem.x}, ${mapItem.y})` : "未知节点";
}

function getRouteSegmentDirection(segment: RouteSegment): string {
	if (segment.isLoop) return `闭环路线，共 ${segment.pathIds.length} 段`;
	const pathsById = new Map(previewPaths.value.map((path) => [path.id, path]));
	const isForward = segment.pathIds.every((pathId, index) => {
		const path = pathsById.get(pathId);
		return path?.fromMapItemId === segment.mapItemIds[index] && path.toMapItemId === segment.mapItemIds[index + 1];
	});
	const isReverse = segment.pathIds.every((pathId, index) => {
		const path = pathsById.get(pathId);
		return path?.toMapItemId === segment.mapItemIds[index] && path.fromMapItemId === segment.mapItemIds[index + 1];
	});
	const from = getMapItemPosition(segment.mapItemIds[0]);
	const to = getMapItemPosition(segment.mapItemIds[segment.mapItemIds.length - 1]);
	if (isForward) return `${from} → ${to}`;
	if (isReverse) return `${to} → ${from}`;
	return `${from} ⇄ ${to}（含混合方向）`;
}
</script>

<template>
	<a-modal v-model:open="model" :footer="null" :width="1080" title="地图路径">
		<div class="path-generator">
			<section class="map-preview-section">
				<div class="section-title">路线预览</div>
				<p class="section-description">生成后以箭头预览路线方向；预览内容不会写入地图，保存后才会替换当前路径。</p>
				<div v-if="previewMapItems.length > 0" ref="previewViewportRef" class="map-preview-viewport">
					<div class="map-preview-stage">
						<div class="map-preview-canvas" :style="previewCanvasStyle">
							<svg
								v-if="previewCanvasSize && previewPathLines.length > 0"
								class="route-lines"
								:width="previewCanvasSize.width"
								:height="previewCanvasSize.height"
								:viewBox="`0 0 ${previewCanvasSize.width} ${previewCanvasSize.height}`"
								aria-hidden="true"
							>
								<defs>
									<marker id="route-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto">
										<path d="M 0 0 L 8 4 L 0 8 z" fill="#334155" />
									</marker>
								</defs>
								<line
									v-for="line in previewPathLines"
									:key="line.id"
									:x1="line.x1"
									:y1="line.y1"
									:x2="line.x2"
									:y2="line.y2"
									:stroke="line.color"
									marker-end="url(#route-arrow)"
								/>
							</svg>
							<div class="map-preview-grid" :style="previewGridStyle">
								<button
									v-for="item in previewMapItems"
									:key="item.id"
									type="button"
									class="map-preview-cell"
									:class="{
										'is-path-node': item.isPathNode,
										'is-start': item.isStart,
										'is-route-junction': item.isRouteJunction,
									}"
									:style="item.style"
									:title="item.title"
									@click="selectStartMapItem(item)"
								></button>
							</div>
						</div>
					</div>
				</div>
				<a-empty v-else description="地图中暂无 MapItem" :image-style="{ height: '60px' }" />
				<div class="preview-legend">
					<span><i class="legend-cell"></i>全部格子</span>
					<span><i class="legend-cell is-path-node"></i>选中类型</span>
					<span><i class="legend-cell is-route-junction"></i>分叉点</span>
					<span><i class="legend-cell is-start"></i>起点</span>
					<span><i class="legend-line"></i>路线方向</span>
				</div>
			</section>

			<section class="form-section">
				<div class="section-title">生成设置</div>
				<a-form layout="vertical">
					<a-form-item label="路径节点类型">
						<a-select
							v-model:value="selectedItemTypeIds"
							mode="multiple"
							allow-clear
							show-search
							placeholder="选择可行走的 MapItem 类型"
						>
							<a-select-option v-for="itemType in itemTypeList" :key="itemType.id" :value="itemType.id">
								{{ itemType.name }}
							</a-select-option>
						</a-select>
					</a-form-item>
					<a-form-item label="地图起点">
						<a-select
							v-model:value="startMapItemId"
							allow-clear
							show-search
							placeholder="未选择时使用第一个路径节点"
							:options="startMapItemOptions"
						/>
					</a-form-item>
				</a-form>
				<a-alert
					message="生成规则"
					description="每对上下左右相邻的路径节点会生成一条单向连接。生成预览后，可按分叉点或端点分割的路线整体反转方向；只有点击保存才会写入地图。"
					type="info"
					show-icon
				/>
				<div v-if="previewPaths.length > 0" class="route-direction-section">
					<div class="direction-title">路线方向（{{ routeSegments.length }} 条）</div>
					<p class="direction-description">每条路线以分叉点或端点为边界。反转会同时修改该路线全部路径的方向。</p>
					<div class="route-direction-list">
						<div v-for="(segment, index) in routeSegments" :key="segment.id" class="route-direction-item">
							<div class="route-direction-info">
								<strong><i class="route-color-dot" :style="{ backgroundColor: getRouteSegmentColor(index) }"></i>路线 {{ index + 1 }}</strong>
								<span>{{ getRouteSegmentDirection(segment) }}</span>
							</div>
							<a-button size="small" @click="reverseRouteSegment(segment)">反转方向</a-button>
						</div>
					</div>
				</div>
				<div v-else class="route-preview-placeholder">尚未生成路线预览。</div>
				<div class="summary">
					当前选中 {{ selectedMapItems.length }} 个路径节点
					<span v-if="previewPaths.length > 0">，预览 {{ previewPaths.length }} 条路径，覆盖 {{ previewComponentCount }} 个区域。</span>
				</div>
				<div class="action-buttons">
					<a-button :disabled="selectedMapItems.length === 0" @click="handleGenerateRoutePreview">生成路线预览</a-button>
					<a-button type="primary" :disabled="!previewStartMapItemId" @click="handleSaveRoutePreview">保存路线</a-button>
				</div>
			</section>
		</div>
	</a-modal>
</template>

<style lang="scss" scoped>
.path-generator {
	display: grid;
	grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
	gap: 20px;
	min-height: 440px;
}

.map-preview-section,
.form-section {
	min-width: 0;
}

.map-preview-section {
	display: flex;
	flex-direction: column;
}

.section-title {
	margin-bottom: 6px;
	font-weight: 600;
	font-size: 15px;
	color: #1f2937;
}

.section-description {
	margin: 0 0 12px;
	font-size: 12px;
	line-height: 1.6;
	color: #6b7280;
}

.map-preview-viewport {
	height: 340px;
	min-height: 280px;
	padding: 12px;
	overflow: hidden;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	background: #f8fafc;
}

.map-preview-stage {
	display: grid;
	place-items: center;
	width: 100%;
	height: 100%;
}

.map-preview-canvas {
	position: relative;
	transform-origin: center;
	transition: transform 0.15s ease-out;
}

.route-lines {
	position: absolute;
	inset: 0;
	z-index: 3;
	pointer-events: none;
}

.route-lines line {
	stroke-width: 2.5;
	stroke-linecap: round;
	opacity: 0.9;
}

.map-preview-grid {
	position: relative;
	z-index: 2;
	display: grid;
	width: max-content;
	gap: 2px;
}

.map-preview-cell {
	width: 20px;
	height: 20px;
	padding: 0;
	border: 1px solid #cbd5e1;
	border-radius: 4px;
	background: #e2e8f0;
	cursor: default;
	transition: transform 0.15s, background-color 0.15s, box-shadow 0.15s;
}

.map-preview-cell.is-path-node {
	background: #38bdf8;
	border-color: #0284c7;
	cursor: pointer;
}

.map-preview-cell.is-path-node:hover {
	transform: scale(1.12);
	box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.25);
}

.map-preview-cell.is-route-junction {
	background: #a78bfa;
	border-color: #7c3aed;
	box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2);
}

.map-preview-cell.is-start {
	background: #f59e0b;
	border-color: #b45309;
	box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3);
}

.preview-legend {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 10px;
	font-size: 12px;
	color: #64748b;
}

.preview-legend span {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.legend-cell {
	display: inline-block;
	width: 11px;
	height: 11px;
	border: 1px solid #cbd5e1;
	border-radius: 3px;
	background: #e2e8f0;
}

.legend-cell.is-path-node {
	background: #38bdf8;
	border-color: #0284c7;
}

.legend-cell.is-route-junction {
	background: #a78bfa;
	border-color: #7c3aed;
}

.legend-cell.is-start {
	background: #f59e0b;
	border-color: #b45309;
}

.legend-line {
	display: inline-block;
	position: relative;
	width: 16px;
	height: 2px;
	background: #2563eb;
}

.legend-line::after {
	position: absolute;
	top: -3px;
	right: -1px;
	border-top: 4px solid transparent;
	border-bottom: 4px solid transparent;
	border-left: 5px solid #334155;
	content: "";
}

.form-section :deep(.ant-form-item) {
	margin-bottom: 14px;
}

.route-direction-section {
	margin-top: 14px;
}

.direction-title {
	font-weight: 600;
	font-size: 13px;
	color: #334155;
}

.direction-description,
.route-preview-placeholder {
	margin: 4px 0 8px;
	font-size: 12px;
	line-height: 1.5;
	color: #64748b;
}

.route-direction-list {
	display: flex;
	max-height: 175px;
	flex-direction: column;
	gap: 6px;
	overflow: auto;
}

.route-direction-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 8px 10px;
	border: 1px solid #dbe3ef;
	border-radius: 6px;
	background: #f8fafc;
}

.route-direction-info {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 2px;
}

.route-direction-info strong {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: #334155;
}

.route-color-dot {
	display: inline-block;
	width: 9px;
	height: 9px;
	border-radius: 999px;
	box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
}

.route-direction-info span {
	overflow: hidden;
	font-size: 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: #64748b;
}

.summary {
	margin: 14px 0;
	font-size: 13px;
	color: #475569;
}

.action-buttons {
	display: flex;
	gap: 8px;
}

@media (max-width: 820px) {
	.path-generator {
		grid-template-columns: 1fr;
	}
}
</style>
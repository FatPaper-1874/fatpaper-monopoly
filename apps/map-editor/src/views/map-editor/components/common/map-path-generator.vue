<script setup lang="ts">
import { MapItem, MapPath } from "@mine-monopoly/types";
import { message } from "ant-design-vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { createMapPathId } from "@mine-monopoly/utils";
import { useMapDataStore } from "@src/stores/index";

const mapDataStore = useMapDataStore();
const mapItemsList = computed(() => mapDataStore.mapItems);
const itemTypeList = computed(() => mapDataStore.mapItemTypes);
const startMapItemId = ref("");
const selectedItemTypeIds = ref<string[]>([...(mapDataStore.pathMapItemTypeIds ?? [])]);
const model = defineModel({ default: false });
const emits = defineEmits<{ (event: "submit"): void }>();
const previewViewportRef = ref<HTMLElement | null>(null);
const previewScale = ref(1);
let previewResizeObserver: ResizeObserver | undefined;

const PREVIEW_CELL_SIZE = 20;
const PREVIEW_CELL_GAP = 2;
const PREVIEW_GRID_PADDING = 2;

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

const previewGridStyle = computed(() => {
	if (!previewBounds.value) return {};
	return {
		gridTemplateColumns: `repeat(${previewBounds.value.columns}, ${PREVIEW_CELL_SIZE}px)`,
		gridTemplateRows: `repeat(${previewBounds.value.rows}, ${PREVIEW_CELL_SIZE}px)`,
		transform: `scale(${previewScale.value})`,
	};
});

const previewMapItems = computed(() => mapItemsList.value.map((item) => ({
	...item,
	isPathNode: selectedMapItemIds.value.has(item.id),
	isStart: startMapItemId.value === item.id,
	style: previewBounds.value
		? { gridColumn: item.x - previewBounds.value.minX + 1, gridRow: item.y - previewBounds.value.minY + 1 }
		: {},
	title: `${item.type?.name || "未命名类型"}\n坐标：(${item.x}, ${item.y})\nID：${item.id}`,
})));

watch(model, (isOpen) => {
	if (!isOpen) return;
	selectedItemTypeIds.value = [...(mapDataStore.pathMapItemTypeIds ?? [])];
	startMapItemId.value = mapDataStore.startMapItemId ?? "";
});

watch(selectedMapItemIds, (ids) => {
	if (startMapItemId.value && !ids.has(startMapItemId.value)) startMapItemId.value = "";
});

function updatePreviewScale() {
	const viewport = previewViewportRef.value;
	const bounds = previewBounds.value;
	if (!model.value || !viewport || !bounds) return;

	const gridWidth = bounds.columns * PREVIEW_CELL_SIZE + (bounds.columns - 1) * PREVIEW_CELL_GAP + PREVIEW_GRID_PADDING * 2;
	const gridHeight = bounds.rows * PREVIEW_CELL_SIZE + (bounds.rows - 1) * PREVIEW_CELL_GAP + PREVIEW_GRID_PADDING * 2;
	const availableWidth = Math.max(viewport.clientWidth - 24, 1);
	const availableHeight = Math.max(viewport.clientHeight - 24, 1);
	previewScale.value = Math.min(availableWidth / gridWidth, availableHeight / gridHeight);
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

watch([model, previewBounds], queuePreviewScaleUpdate, { flush: "post" });

onBeforeUnmount(() => previewResizeObserver?.disconnect());

function selectStartMapItem(mapItem: MapItem) {
	if (selectedMapItemIds.value.has(mapItem.id)) startMapItemId.value = mapItem.id;
}

function handleGenerateAdjacentPaths() {
	const pathNodes = selectedMapItems.value;
	if (pathNodes.length === 0) {
		message.warning("请先选择至少一个地图元素类型");
		return;
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

	try {
		const { paths, componentCount } = generateAdjacentPaths(pathNodes, startMapItem);
		mapDataStore.setPathMapItemTypeIds(selectedItemTypeIds.value);
		mapDataStore.replaceMapPaths(paths, "自动生成相邻路径");
		mapDataStore.setStartMapItemId(startMapItem.id);
		message.success(`已重建 ${paths.length} 条相邻路径，覆盖 ${componentCount} 个区域`, 2);
		emits("submit");
	} catch (error: any) {
		message.error(error.message || "生成相邻路径失败");
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

			// 首次发现时由当前节点指向新节点；遇到已访问节点时由当前节点回连，因而可闭合环。
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
</script>

<template>
	<a-modal v-model:open="model" :footer="null" :width="900" title="生成相邻路径">
		<div class="path-generator">
			<section class="map-preview-section">
				<div class="section-title">路径节点预览</div>
				<p class="section-description">展示全部 MapItem。选择类型后对应格子高亮；点击高亮格子可设为起点。</p>
				<div v-if="previewMapItems.length > 0" ref="previewViewportRef" class="map-preview-viewport">
					<div class="map-preview-stage">
						<div class="map-preview-grid" :style="previewGridStyle">
							<button
								v-for="item in previewMapItems"
								:key="item.id"
								type="button"
								class="map-preview-cell"
								:class="{ 'is-path-node': item.isPathNode, 'is-start': item.isStart }"
								:style="item.style"
								:title="item.title"
								@click="selectStartMapItem(item)"
							></button>
						</div>
					</div>
				</div>
				<a-empty v-else description="地图中暂无 MapItem" :image-style="{ height: '60px' }" />
				<div class="preview-legend">
					<span><i class="legend-cell"></i>全部格子</span>
					<span><i class="legend-cell is-path-node"></i>选中类型</span>
					<span><i class="legend-cell is-start"></i>起点</span>
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
					description="会清空并重建全部 MapPath。每对上下左右相邻的路径节点生成一条单向连接：从起点深度优先扩展，遇到已访问节点时回连以形成环；不连通区域会分别生成。"
					type="info"
					show-icon
				/>
				<div class="summary">当前选中 {{ selectedMapItems.length }} 个路径节点。</div>
				<a-button type="primary" block :disabled="selectedMapItems.length === 0" @click="handleGenerateAdjacentPaths">
					清空并生成相邻路径
				</a-button>
			</section>
		</div>
	</a-modal>
</template>

<style lang="scss" scoped>
.path-generator {
	display: grid;
	grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
	gap: 20px;
	min-height: 390px;
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
	height: 300px;
	min-height: 260px;
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

.map-preview-grid {
	display: grid;
	width: max-content;
	gap: 2px;
	padding: 2px;
	transform-origin: center;
	transition: transform 0.15s ease-out;
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

.legend-cell.is-start {
	background: #f59e0b;
	border-color: #b45309;
}

.form-section :deep(.ant-form-item) {
	margin-bottom: 14px;
}

.summary {
	margin: 14px 0;
	font-size: 13px;
	color: #475569;
}

@media (max-width: 720px) {
	.path-generator {
		grid-template-columns: 1fr;
	}
}
</style>
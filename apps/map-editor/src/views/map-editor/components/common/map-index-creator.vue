<script setup lang="ts">
import { MapItem } from "@mine-monopoly/types";
import { message } from "ant-design-vue";
import { computed, ref, watch } from "vue";
import { useMapDataStore } from "@src/stores/index";

const mapDataStore = useMapDataStore();
const mapItemslist = computed(() => mapDataStore.mapItems);
const itemTypeList = computed(() => mapDataStore.mapItemTypes);

const startMapItemId = ref("");
const emits = defineEmits(["submit"]);

const _itemTypeIdToAppendPath = ref<string[]>([...(mapDataStore.pathMapItemTypeIds ?? [])]);
const model = defineModel({ default: false });

watch(model, (isOpen) => {
	if (isOpen) _itemTypeIdToAppendPath.value = [...(mapDataStore.pathMapItemTypeIds ?? [])];
});

async function handleAppendMapIndex() {
	// 检查是否选择了类型
	if (_itemTypeIdToAppendPath.value.length === 0) {
		message.warning("请先选择至少一个地图元素类型");
		return;
	}

	// 获取选中类型的名称集合（用于兼容旧数据的 UUID 类型 ID）
	const selectedTypeNames = new Set(
		_itemTypeIdToAppendPath.value
			.map(id => itemTypeList.value.find(t => t.id === id)?.name)
			.filter(Boolean)
	);

	// 过滤出选定类型的 MapItem
	const tempMapItemsList = mapItemslist.value.filter((item) => {
		if (item.beLinked) return false;
		const itemTypeId = item.type?.id;
		const itemTypeName = item.type?.name;
		// 同时匹配 ID 和类型名称（兼容旧数据）
		return (
			(itemTypeId && _itemTypeIdToAppendPath.value.includes(itemTypeId)) ||
			(itemTypeName && selectedTypeNames.has(itemTypeName))
		);
	});

	if (tempMapItemsList.length === 0) {
		message.warning("所选类型没有对应的地图元素，请检查");
		return;
	}

	// 处理起点（可选）
	let startMapItem: MapItem | undefined;
	if (startMapItemId.value) {
		startMapItem = mapDataStore.findMapItemById(startMapItemId.value);
		if (!startMapItem || !tempMapItemsList.some((item) => item.id === startMapItem!.id)) {
			message.warning(`找不到可行走的起点 ${startMapItemId.value}，将使用第一个路径节点作为起点`);
			startMapItem = undefined;
		}
	}

	try {
		const mapIndex = findPath(tempMapItemsList, startMapItem);
		mapDataStore.setPathMapItemTypeIds(_itemTypeIdToAppendPath.value);
		mapDataStore.updateMapIndex(mapIndex);
		mapDataStore.setStartMapItemId(mapIndex[0]);
		message.success(`更新路径索引成功，共 ${mapIndex.length} 个节点`, 2);
		emits("submit");
	} catch (e: any) {
		mapDataStore.updateMapIndex([]);
		message.error(e.message || "生成路线失败");
	}
}

function findPath(mapItems: MapItem[], startMapItem?: MapItem): string[] | never {
	if (mapItems.length === 0) {
		throw new Error("输入数组不能为空");
	}

	const itemsCopy: MapItem[] = JSON.parse(JSON.stringify(mapItems));
	const startingPoint: MapItem = startMapItem ? startMapItem : itemsCopy[0];
	const traversedItems: MapItem[] | null = traverseMap(itemsCopy, startingPoint);

	if (!traversedItems || traversedItems.length == 0) {
		throw new Error("无法遍历整个数组");
	}

	return traversedItems.map((i) => i.id);
}

function traverseMap(items: MapItem[], startPoint: MapItem): MapItem[] | null {
	const visited: { [key: string]: boolean } = {};
	const result: MapItem[] = [];

	function dfs(node: MapItem) {
		visited[`${node.x},${node.y}`] = true;
		result.push(node);

		const neighbors = findNeighbors(node, items);
		for (const neighbor of neighbors) {
			if (!visited[`${neighbor.x},${neighbor.y}`]) {
				dfs(neighbor);
			}
		}
	}

	dfs(startPoint);

	if (result.length !== items.length) {
		return null;
	}

	return result;
}

function findNeighbors(node: MapItem, items: MapItem[]): MapItem[] {
	const neighbors: MapItem[] = [];
	const directions = [
		{ x: 1, y: 0 },
		{ x: -1, y: 0 },
		{ x: 0, y: 1 },
		{ x: 0, y: -1 },
	];

	for (const dir of directions) {
		const neighborX = node.x + dir.x;
		const neighborY = node.y + dir.y;
		const neighbor = items.find((item) => item.x === neighborX && item.y === neighborY);
		if (neighbor) {
			neighbors.push(neighbor);
		}
	}

	return neighbors;
}
</script>

<template>
	<a-modal :footer="null" v-model:open="model" title="建立地图路径索引">
		<a-input
			v-model:value="startMapItemId"
			style="margin-bottom: 10px"
			placeholder="输入起点MapItem的Id(可选)"
		></a-input>
		<a-select
			clearable
			v-model:value="_itemTypeIdToAppendPath"
			showArrow
			style="width: 70%"
			mode="multiple"
			placeholder="选择类型用来生成索引"
		>
			<a-select-option v-for="(item, index) in itemTypeList" :key="item.color" :value="item.id" :label="item.name">
				<span>{{ item.name }}</span>
			</a-select-option>
		</a-select>
		<a-button @click="handleAppendMapIndex" type="primary" style="margin-left: 10px">生成路线</a-button>
	</a-modal>
</template>

<style lang="scss" scoped>
.index-creator {
	padding: 10px;
	background-color: #ffffff;
}
</style>

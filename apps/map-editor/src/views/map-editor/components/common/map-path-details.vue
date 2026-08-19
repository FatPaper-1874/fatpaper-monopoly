<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { message } from "ant-design-vue";
import { useEditorStore, useMapDataStore } from "@src/stores";

const editorStore = useEditorStore();
const mapDataStore = useMapDataStore();

const activeMapPath = computed(() =>
	editorStore.activeMapPathId ? mapDataStore.findMapPathById(editorStore.activeMapPathId) : undefined,
);
const fromMapItem = computed(() => activeMapPath.value ? mapDataStore.findMapItemById(activeMapPath.value.fromMapItemId) : undefined);
const toMapItem = computed(() => activeMapPath.value ? mapDataStore.findMapItemById(activeMapPath.value.toMapItemId) : undefined);

const form = reactive({
	name: "",
	description: "",
	initEnable: true,
});

watch(activeMapPath, (path) => {
	form.name = path?.name ?? "";
	form.description = path?.description ?? "";
	form.initEnable = path?.initEnable !== false;
}, { immediate: true, deep: true });

// function formatMapItem(mapItem: typeof fromMapItem.value, id: string) {
// 	return mapItem ? `${mapItem.type.name} (${id})` : id;
// }

function savePath() {
	const path = activeMapPath.value;
	if (!path) return;
	mapDataStore.updateMapPath(path.id, {
		name: form.name.trim() || undefined,
		description: form.description.trim() || undefined,
		initEnable: form.initEnable,
	});
	message.success("路径详情已保存", 1);
}


function deletePath() {
	if (!activeMapPath.value) return;
	mapDataStore.removeMapPath(activeMapPath.value.id);
	message.success("路径已删除", 1);
}

function clearPathSelection() {
	editorStore.setActiveMapPath(undefined);
}
</script>

<template>
	<a-card v-if="activeMapPath" title="路径详情" class="map-path-details">
		<a-descriptions :column="1" size="small" bordered>
			<a-descriptions-item label="路径 ID">{{ activeMapPath.id }}</a-descriptions-item>
			<a-descriptions-item label="起点">{{ activeMapPath.fromMapItemId }}</a-descriptions-item>
			<a-descriptions-item label="终点">{{ activeMapPath.toMapItemId }}</a-descriptions-item>

		</a-descriptions>

		<a-form layout="vertical" class="path-form">
			<a-form-item label="名称">
				<a-input v-model:value="form.name" placeholder="可选" />
			</a-form-item>
			<a-form-item label="说明">
				<a-textarea v-model:value="form.description" :rows="3" placeholder="可选" />
			</a-form-item>
			<a-form-item label="初始启用">
				<a-switch v-model:checked="form.initEnable" />
			</a-form-item>
		</a-form>

		<a-space wrap>
			<a-button type="primary" @click="savePath">保存</a-button>
			<a-button @click="clearPathSelection">取消选择</a-button>
			<a-button danger @click="deletePath">删除</a-button>
		</a-space>
	</a-card>
</template>

<style lang="scss" scoped>
.map-path-details {
	width: 360px;
}

.path-form {
	margin-top: 12px;

	:deep(.ant-form-item) {
		margin-bottom: 10px;
	}
}
</style>

<script setup lang="ts">
import { MapItem } from "@mine-monopoly/types/interfaces/game/item";
import { message } from "ant-design-vue";
import { computed } from "vue";
import { useMapDataStore } from "@src/stores";

const props = defineProps<{ mapItem: MapItem }>();

const mapDataStore = useMapDataStore();

const outgoingPathCount = computed(() => mapDataStore.getPathsFrom(props.mapItem.id).length);
const incomingPathCount = computed(() => mapDataStore.getPathsTo(props.mapItem.id).length);

// 转换旋转值为可读文本
const rotationText = computed(() => {
	const rotations = ["0° (上)", "90° (右)", "180° (下)", "270° (左)"];
	return rotations[props.mapItem.rotation] || "未知方向";
});

async function copyMapItemId() {
	try {
		await navigator.clipboard.writeText(props.mapItem.id);
		message.success("ID 已复制到剪贴板");
	} catch (err) {
		message.error("复制失败，请手动选择复制");
	}
}
</script>

<template>
	<a-card size="small" class="info-card">
		<h4>MapItem详情</h4>
		<a-descriptions bordered :column="3" size="small" :contentStyle="{ 'font-size': '.9em', 'max-width': '200px' }">
			<a-descriptions-item :span="3" label="ID">
				<div class="id-container">
					<span class="id-text">{{ mapItem.id }}</span>
					<a-button type="link" size="mini" @click="copyMapItemId">
						<template #icon>复制ID</template>
					</a-button>
				</div>
			</a-descriptions-item>

			<a-descriptions-item :span="3" label="类型">{{ mapItem.type.name }}</a-descriptions-item>
			<a-descriptions-item :span="1" label="出边">{{ outgoingPathCount }}</a-descriptions-item>
			<a-descriptions-item :span="1" label="入边">{{ incomingPathCount }}</a-descriptions-item>
			<a-descriptions-item :span="1" label="坐标"> ({{ mapItem.x }}, {{ mapItem.y }})</a-descriptions-item>
			<a-descriptions-item :span="3" label="方向"> {{ rotationText }} </a-descriptions-item>

			<a-descriptions-item :span="3" label="绑定的地皮" v-if="mapItem.linkto">
				{{ mapItem.linkto }}
			</a-descriptions-item>
			<a-descriptions-item :span="3" label="地皮" v-if="mapItem.beLinked"> 是的，我是地皮</a-descriptions-item>
		</a-descriptions>
	</a-card>
</template>

<style lang="scss" scoped>
.info-card {
	overflow-y: auto;

	.id-container {
		display: flex;
		align-items: center;
		justify-content: space-between;

		.id-text {
			word-break: break-all;
			margin-right: 8px;
		}
	}

	:deep(.ant-descriptions-item-label) {
		font-weight: bold;
	}

	.ant-tag {
		margin-bottom: 4px;
	}

	.ant-descriptions {
		margin-top: 8px;
	}
}
</style>

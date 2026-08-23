<script setup lang="ts">
import { MapEvent } from "@mine-monopoly/types/interfaces/game/item";
import CodeEditor from "@src/components/code-editor/index.vue";
import libContent from "@src/components/code-editor/editor-lib.d.ts?raw";
import { MAP_EVENT_TEMPLATE as templateText } from "@src/components/code-editor/code-templates";
import { h, reactive, ref, watch } from "vue";
import { useMapDataStore, useResourceStore } from "@src/stores";
import { message, Modal } from "ant-design-vue";
import { MapEventType } from "@mine-monopoly/types";
import { ResourcePicker } from "@src/components/resource-picker";
import { addNewImage } from "@src/utils/file";
import { cloneDeep } from "lodash";
import { CodeValidationError, mapContentService } from "@src/services";
import { generateShortId } from "@src/utils/short-id";

// 事件类型选项
const eventTypeOptions = [
	{ label: "到达事件", value: MapEventType.ArrivedEvent },
	{ label: "经过事件", value: MapEventType.PassedEvent },
	{ label: "普通事件", value: MapEventType.NormalEvents },
];

const props = defineProps<{ mapEvent: MapEvent | undefined }>();
const emits = defineEmits(["close"]);
const resourceStore = useResourceStore();

const mapEventForm = reactive<MapEvent & { tempFilePath?: string }>(getInitForm());
const submitting = ref(false);

// 初始化表单
watch(
	() => props.mapEvent,
	(newEvent) => {
		if (newEvent) {
			Object.assign(mapEventForm, cloneDeep(newEvent));
		} else {
			Object.assign(mapEventForm, getInitForm());
		}
		mapEventForm.tempFilePath = undefined;
	},
	{ immediate: true },
);

function getInitForm() {
	const initForm = {
		id: generateShortId('event'),
		name: "",
		description: "",
		type: MapEventType.ArrivedEvent,
		effectCode: "",
		iconId: "",
		properties: [],
		tempFilePath: undefined,
	};
	return initForm;
}

function handleResourceChange(resource: any) {
	// 保存选择的文件路径（autoSave: false 模式）
	if (resource && resource.url) {
		mapEventForm.tempFilePath = resource.url;
	}
}

function showCodeValidationModal(error: CodeValidationError) {
	Modal.confirm({
		title: "代码校验失败",
		content: h("pre", { style: "max-height: 360px; overflow: auto; white-space: pre-wrap; margin: 0;" }, error.message),
		okText: "忽略错误并提交",
		cancelText: "返回修改",
		okType: "danger",
		onOk: () => handleAddMapEvent(true),
	});
}

async function handleAddMapEvent(skipCodeValidation: boolean = false) {
	if (submitting.value) return;
	submitting.value = true;

	try {
		if (props.mapEvent) {
			// 编辑模式
			if (mapEventForm.tempFilePath) {
				// 用户更换了图标（autoSave: false 模式）
				const newIconId = await addNewImage(mapEventForm.tempFilePath, mapEventForm.name);
				mapEventForm.iconId = newIconId;
			}
			await mapContentService.updateMapEvent(mapEventForm, { skipCodeValidation: skipCodeValidation === true });
		} else {
			// 新增模式
			if (mapEventForm.tempFilePath) {
				// autoSave: false 模式（虽然不应该发生）
				const newIconId = await addNewImage(mapEventForm.tempFilePath, mapEventForm.name);
				mapEventForm.iconId = newIconId;
			}
			// ResourcePicker 已经添加了图片（autoSave: true 模式）
			await mapContentService.addMapEvent(mapEventForm, { skipCodeValidation: skipCodeValidation === true });
		}
		emits("close");
	} catch (e: unknown) {
		if (e instanceof CodeValidationError) {
			showCodeValidationModal(e);
			return;
		}
		message.error(e instanceof Error ? e.message : "提交失败", 1);
	} finally {
		submitting.value = false;
	}
}
</script>

<template>
	<div class="map-event-form-container">
		<div class="map-event-form">
			<div class="form-content">
				<a-form
					@finish="() => handleAddMapEvent()"
					:model="mapEventForm"
					name="map-event"
					autocomplete="off"
				>
					<a-form-item label="ID">
						<a-alert style="word-break: break-all" :message="mapEventForm.id" type="info" />
					</a-form-item>
					<a-form-item label="事件名称" name="name" :rules="[{ required: true, message: '请输入事件名称' }]">
						<a-input v-model:value="mapEventForm.name" />
					</a-form-item>
					<a-form-item label="事件描述" name="description" :rules="[{ required: true, message: '请输入事件描述' }]">
						<a-textarea v-model:value="mapEventForm.description" :auto-size="{ minRows: 3, maxRows: 5 }" />
					</a-form-item>
					<a-form-item label="事件触发类型" name="type" :rules="[{ required: true, message: '请选择事件触发类型' }]">
						<a-select v-model:value="mapEventForm.type" :options="eventTypeOptions" />
					</a-form-item>
					<a-form-item label="icon图片" name="iconId" :rules="[{ required: true, message: '请选择图标图片' }]">
						<ResourcePicker
							type="image"
							v-model="mapEventForm.iconId"
							:auto-save="!props.mapEvent"
							@change="handleResourceChange"
						/>
					</a-form-item>
				</a-form>
			</div>
			<div class="footer-actions">
				<a-button type="primary" block :loading="submitting" @click="() => handleAddMapEvent()">
					{{ mapEvent ? '保存修改' : '创建事件' }}
				</a-button>
			</div>
		</div>
		<div class="editor-container">
			<span class="title">
				<a-alert
					message="在下面编辑器编写触发代码，游戏进行到响应的触发时机会直接执行下面全部的代码"
					type="info"
					show-icon
				/>
			</span>
			<code-editor
				v-model="mapEventForm.effectCode"
				:template-text="templateText"
				:static-types="libContent"
			/>
		</div>
	</div>
</template>

<style lang="scss" scoped>
.map-event-form-container {
	display: flex;
	height: 75vh;

	.map-event-form {
		width: 25vw;
		display: flex;
		flex-direction: column;
		padding-right: 10px;

		.form-content {
			flex: 1;
			overflow-y: auto;
		}

		.footer-actions {
			flex-shrink: 0;
			padding: 12px 0;
			border-top: 1px solid #f0f0f0;
			background: #fff;
		}
	}

	.editor-container {
		display: flex;
		flex: 1;
		flex-direction: column;
		padding: 0 10px;
		gap: 10px;
	}
}
</style>

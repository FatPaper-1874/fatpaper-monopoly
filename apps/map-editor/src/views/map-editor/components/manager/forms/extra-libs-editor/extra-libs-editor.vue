<script setup lang="ts">
import { h, ref, watch } from "vue";
import { message, Modal } from "ant-design-vue";
import { useMapDataStore } from "@src/stores";
import { eventBus } from "@src/utils/event-bus";
import { CodeValidationError, mapContentService } from "@src/services";
import CodeEditor from "@src/components/code-editor/index.vue";

const visible = defineModel({ default: false });

const store = useMapDataStore();
const localEffectCode = ref("");
const submitting = ref(false);

watch(
	() => visible.value,
	async (isOpen) => {
		if (isOpen) {
			localEffectCode.value = store.extraLibs + "" || "";
		}
	},
	{ immediate: true },
);

function showCodeValidationModal(error: CodeValidationError) {
	Modal.confirm({
		title: "代码校验失败",
		content: h("pre", { style: "max-height: 360px; overflow: auto; white-space: pre-wrap; margin: 0;" }, error.message),
		okText: "忽略错误并保存",
		cancelText: "返回修改",
		okType: "danger",
		onOk: () => handleSave(true),
	});
}

async function handleSave(skipCodeValidation: boolean = false) {
	if (submitting.value) return;
	submitting.value = true;

	try {
		await mapContentService.updateExtraLibs(localEffectCode.value, {
			skipCodeValidation: skipCodeValidation === true,
		});
		eventBus.emit("refresh-monaco-types");
		message.success("保存成功");
		visible.value = false;
	} catch (error: unknown) {
		if (error instanceof CodeValidationError) {
			showCodeValidationModal(error);
			return;
		}
		message.error(error instanceof Error ? error.message : "保存失败");
	} finally {
		submitting.value = false;
	}
}

function handleClose() {
	visible.value = false;
}
</script>

<template>
	<a-modal
		destroyOnClose
		@cancel="handleClose"
		@ok="() => handleSave()"
		:confirm-loading="submitting"
			ok-text="保存"
		cancel-text="取消"
		width="70%"
		v-model:open="visible"
		title="全局TS类型"
	>
		<div class="editor-container">
			<code-editor v-model="localEffectCode" :skip-type-libs="true" />
		</div>
	</a-modal>
</template>

<style lang="scss" scoped>
.editor-container {
	width: 100%;
	height: 60vh;
}
</style>

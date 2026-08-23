<script setup lang="ts">
import { useMapDataStore } from "@src/stores";
import { Modal } from "ant-design-vue";
import libContent from "@src/components/code-editor/editor-lib.d.ts?raw";
import { PROPERTY_TEMPLATE as templateText } from "@src/components/code-editor/code-templates";
import CodeEditor from "@src/components/code-editor/index.vue";
import { useMonacoValidator } from "@src/components/code-editor/composables/useMonacoValidator";
import { h, ref, watch, computed } from "vue";

const props = defineProps<{
	value?: string;
}>();

const emit = defineEmits<{
	save: [value: string];
}>();

const localCode = ref(props.value || "");
const submitting = ref(false);

// 监听外部值变化，更新本地编辑状态
watch(
	() => props.value,
	(newVal) => {
		localCode.value = newVal || "";
	}
);

function showCodeValidationModal(errors: Array<{ line: number; column: number; message: string }>) {
	const content = errors
		.map((error) => `${error.line > 0 ? `L${error.line}` : "模板"}:C${error.column} ${error.message}`)
		.join("\n");

	Modal.confirm({
		title: "代码校验失败",
		content: h("pre", { style: "max-height: 360px; overflow: auto; white-space: pre-wrap; margin: 0;" }, content),
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
		if (skipCodeValidation !== true && localCode.value.trim()) {
			const { validate } = useMonacoValidator();
			const result = await validate(localCode.value, "property", { mode: "full" });
			if (!result.valid) {
				showCodeValidationModal(result.errors);
				return;
			}
		}

		emit("save", localCode.value);
	} finally {
		submitting.value = false;
	}
}
</script>

<template>
	<div class="effect-editor-wrapper">
		<div class="editor-container">
			<code-editor v-model="localCode" :template-text="templateText" :static-types="libContent" />
		</div>
		<div class="save-bar">
			<a-button type="primary" :loading="submitting" @click="() => handleSave()">保存</a-button>
		</div>
	</div>
</template>

<style lang="scss" scoped>
.effect-editor-wrapper {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.editor-container {
	width: 100%;
	height: 70vh;
}

.save-bar {
	display: flex;
	justify-content: flex-end;
	padding: 8px 0;
	border-top: 1px solid #e8e8e8;
}
</style>

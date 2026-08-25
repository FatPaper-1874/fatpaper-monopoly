<script setup lang="ts">
import { FormSchema } from "@mine-monopoly/types";
import { ref, watch } from "vue";

const props = withDefaults(
	defineProps<{
		schema: FormSchema[];
		submitText: string;
		disable?: boolean;
		// [新增] 接收外部传入的初始数据，用于回填
		initialData?: Record<string, any>;
	}>(),
	{
		disable: false,
		// 默认为空对象
		initialData: () => ({}),
	},
);

type SubmitPayload = Record<
	string,
	{
		field: FormSchema;
		value: any;
	}
>;

const emit = defineEmits<{
	(e: "submit", payload: SubmitPayload): void;
	(e: "update:modelValue", data: Record<string, any>): void;
}>();

const formData = ref<Record<string, any>>({});

// [修改] 初始化数据逻辑
const initData = () => {
	const data: Record<string, any> = {};

	props.schema.forEach((field) => {
		// 优先级 1: 外部传入的 initialData (必须判断 !== undefined，允许传入 0 或 false)
		if (props.initialData && props.initialData[field.key] !== undefined) {
			data[field.key] = props.initialData[field.key];
		}
		// 优先级 2: Schema 定义的 defaultValue
		else if (field.defaultValue !== undefined && field.defaultValue !== "") {
			data[field.key] = field.defaultValue;
		}
		// 优先级 3: 空状态兜底
		else {
			data[field.key] = field.type === "number-input" ? undefined : "";
		}
	});

	formData.value = data;
};

// [修改] 同时监听 schema 和 initialData 的变化
// 这样无论是 schema 变了，还是父组件异步请求的数据回来了，表单都会刷新
watch([() => props.schema, () => props.initialData], initData, { immediate: true, deep: true });

// 监听 formData 变化，实时通知父组件
watch(formData, (newData) => {
	emit("update:modelValue", { ...newData });
}, { deep: true, immediate: true });

// 数字输入失焦时校验和修正
const handleNumberBlur = (field: FormSchema) => {
	if (field.type !== "number-input") return;

	const val = formData.value[field.key];
	if (val === undefined || val === null || val === "") return;

	const numVal = Number(val);
	let corrected = false;
	let correctedVal = numVal;

	// 检查最小值
	if (field.min !== undefined && numVal < field.min) {
		correctedVal = field.min;
		corrected = true;
	}

	// 检查最大值
	if (field.max !== undefined && numVal > field.max) {
		correctedVal = field.max;
		corrected = true;
	}

	// 如果需要修正，更新表单数据
	if (corrected) {
		formData.value[field.key] = correctedVal;
	}
};

const handleSubmit = () => {
	// 校验必填项并修正数字输入
	for (const field of props.schema) {
		const val = formData.value[field.key];

		// 检查必填项
		if (val === undefined || val === null || val === "") {
			alert(`【${field.label}】是必填项`);
			return;
		}

		// 数字输入校验和自动修正
		if (field.type === "number-input") {
			const numVal = Number(val);
			let corrected = false;
			let correctedVal = numVal;

			// 检查最小值
			if (field.min !== undefined && numVal < field.min) {
				correctedVal = field.min;
				corrected = true;
			}

			// 检查最大值
			if (field.max !== undefined && numVal > field.max) {
				correctedVal = field.max;
				corrected = true;
			}

			// 如果需要修正，更新表单数据并提示用户
			if (corrected) {
				formData.value[field.key] = correctedVal;
				console.warn(`【${field.label}】的值 ${numVal} 已自动修正为 ${correctedVal}`);
			}
		}
	}

	const submitData: SubmitPayload = {};

	props.schema.forEach((field) => {
		submitData[field.key] = {
			field: field,
			value: formData.value[field.key],
		};
	});

	emit("submit", submitData);
};
</script>

<template>
	<form class="custom-form" @submit.prevent="handleSubmit">
		<div v-for="field in schema" :key="field.id" class="form-group">
			<label :for="field.key" class="form-label">
				<span class="required">*</span>
				{{ field.label }}:
			</label>

			<input
				v-if="field.type === 'number-input'"
				:id="field.key"
				type="number"
				:disabled="disable"
				v-model.number="formData[field.key]"
				:placeholder="field.placeholder"
				:min="field.min"
				:max="field.max"
				@blur="handleNumberBlur(field)"
				class="form-control"
			/>

			<select
				v-else-if="field.type === 'select'"
				:id="field.key"
				:disabled="disable"
				v-model="formData[field.key]"
				class="form-control"
			>
				<option v-for="(opt, idx) in field.options" :key="idx" :value="opt.value">
					{{ opt.label }}
				</option>
			</select>
		</div>

		<button v-if="schema.length !== 0 && submitText" type="submit" class="submit-btn btn-small" :disabled="disable">
			{{ submitText }}
		</button>
	</form>
</template>

<style scoped>
/* 样式部分保持不变 */
.custom-form {
	display: flex;
	gap: 0.5rem;
	flex-direction: column;
}
.form-group {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.5rem;
}
.form-label {
	word-break: keep-all;
	color: #393939;
}
.form-control {
	width: 50%;
	color: var(--fp-color-secondary);
}
.submit-btn {
	font-size: 1rem;
	height: 2rem;
	border-radius: 0.3rem;
	text-shadow: none;
}
/* 简单的禁用样式示例 */
.submit-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
.required {
	color: #ff4d4f;
}
</style>

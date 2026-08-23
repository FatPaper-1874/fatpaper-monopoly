<script setup lang="ts">
import CodeEditor from "@src/components/code-editor/index.vue";
import libContent from "@src/components/code-editor/editor-lib.d.ts?raw";
import { generateChanceCardTemplate, generateChanceCardParams, replaceEffectCodeParams } from "@src/components/code-editor/code-templates";
import { computed, h, onMounted, reactive, ref, watch } from "vue";
import { useMapDataStore, useResourceStore } from "@src/stores";
import { message, Modal } from "ant-design-vue";
import { ChanceCardInfo, TargetSelectType } from "@mine-monopoly/types";
import { Rule } from "ant-design-vue/es/form";
import { ChanceCard } from "@mine-monopoly/ui";
import { ResourcePicker } from "@src/components/resource-picker";
import { addNewImage, convertToFpUrl } from "@src/utils/file";
import { CodeValidationError, mapContentService } from "@src/services";
import { generateShortId } from "@src/utils/short-id";

const props = defineProps<{ chanceCard: ChanceCardInfo | undefined }>();
const emits = defineEmits(["close"]);

onMounted(() => {
	if (!props.chanceCard) return;
	chanceCardForm.iconId = props.chanceCard.iconId;
});

const targetNameMap: Record<TargetSelectType, string> = {
	[TargetSelectType.ToSelf]: "对自己生效",
	[TargetSelectType.ToOtherPlayer]: "对其他玩家生效",
	[TargetSelectType.ToPlayer]: "对玩家生效",
	[TargetSelectType.ToProperty]: "对地产生效",
	[TargetSelectType.ToMapItem]: "对格子生效",
};

function getInitForm() {
	const initForm = {
		id: generateShortId('card'),
		name: "",
		color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
		description: "",
		type: TargetSelectType.ToSelf,
		effectCode: "",
		iconId: "",
		tempFilePath: undefined as string | undefined,
	};
	return initForm;
}

const chanceCardForm = reactive<ChanceCardInfo & { tempFilePath?: string }>(
	props.chanceCard ? JSON.parse(JSON.stringify(props.chanceCard)) : getInitForm(),
);
const chanceCardIdSuffix = ref(props.chanceCard ? chanceCardForm.id.replace(/^card-/, '') : '');
const submitting = ref(false);

const templateText = computed(() => generateChanceCardTemplate(chanceCardForm.type));

/** 只替换 effectCode 中的函数参数声明部分，保留函数体 */
function updateEffectCodeTargetType(targetType: TargetSelectType) {
	chanceCardForm.effectCode = replaceEffectCodeParams(
		chanceCardForm.effectCode,
		() => generateChanceCardTemplate(targetType),
		() => generateChanceCardParams(targetType),
	);
}

// 初始化时根据当前类型更新参数声明
onMounted(() => {
	if (chanceCardForm.type != null) {
		updateEffectCodeTargetType(chanceCardForm.type);
	}
});

watch(
	() => chanceCardForm.type,
	(newType, oldType) => {
		if (!oldType || newType === oldType) return;
		updateEffectCodeTargetType(newType);
	},
);

function handleResourceChange(resource: any) {
	if (resource && resource.url) {
		chanceCardForm.tempFilePath = resource.url;
	}
}

function showCodeValidationModal(error: CodeValidationError) {
	Modal.confirm({
		title: "代码校验失败",
		content: h("pre", { style: "max-height: 360px; overflow: auto; white-space: pre-wrap; margin: 0;" }, error.message),
		okText: "忽略错误并提交",
		cancelText: "返回修改",
		okType: "danger",
		onOk: () => handleAddChanceCard(true),
	});
}

async function handleAddChanceCard(skipCodeValidation: boolean = false) {
	if (submitting.value) return;
	submitting.value = true;

	try {
		if (props.chanceCard) {
			// 编辑模式：如果用户更换了图标，先保存新图片
			if (chanceCardForm.tempFilePath) {
				const newIconId = await addNewImage(chanceCardForm.tempFilePath, chanceCardForm.name);
				chanceCardForm.iconId = newIconId;
			}
			await mapContentService.updateChanceCard(chanceCardForm, { skipCodeValidation: skipCodeValidation === true });
		} else {
			// 新增模式
			if (chanceCardForm.tempFilePath) {
				const newIconId = await addNewImage(chanceCardForm.tempFilePath, chanceCardForm.name);
				chanceCardForm.iconId = newIconId;
			}
			await mapContentService.addChanceCard(chanceCardForm, { skipCodeValidation: skipCodeValidation === true });
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

const chanceCardIconPreview = computed(() => {
	if (chanceCardForm.tempFilePath) {
		return convertToFpUrl(chanceCardForm.tempFilePath);
	}
	const imageResource = useResourceStore().findImageById(chanceCardForm.iconId);
	return imageResource?.url || "";
});

async function copyToClipboard(text: string) {
	await navigator.clipboard.writeText(text);
	message.success("已复制");
}

const iconRule = async (_rule: Rule, value: string) => {
	if (!chanceCardForm.iconId) {
		return Promise.reject("请选择图片");
	} else {
		return Promise.resolve();
	}
};
</script>

<template>
	<div class="chance-card-form-container">
		<div class="chance-card-form">
			<div class="form-content">
				<ChanceCard
					class="chance-card-preview"
					:chance-card="chanceCardForm"
					:disable="false"
					:icon-url="chanceCardIconPreview"
				/>
				<a-form @finish="() => handleAddChanceCard()" :model="chanceCardForm" name="map-event" autocomplete="off">
					<a-form-item label="ID">
						<div style="display: flex; gap: 4px">
							<a-input
								v-model:value="chanceCardIdSuffix"
								placeholder="自定义后缀（留空自动生成）"
								allow-clear
								@input="chanceCardForm.id = $event.target.value ? `card-${$event.target.value}` : generateShortId('card')"
							>
								<template #prefix><span style="color: #999">card-</span></template>
							</a-input>
							<a-button @click="copyToClipboard(chanceCardForm.id)">复制</a-button>
						</div>
					</a-form-item>
					<a-form-item label="机会卡名称" name="name" :rules="[{ required: true, message: '请输入机会卡名称' }]">
						<a-input v-model:value="chanceCardForm.name" />
					</a-form-item>
					<a-form-item label="机会卡描述" name="description" :rules="[{ required: true, message: '请输入机会卡描述' }]">
						<a-textarea v-model:value="chanceCardForm.description" :auto-size="{ minRows: 3, maxRows: 5 }" />
					</a-form-item>
					<a-form-item label="机会卡类型" name="type" :rules="[{ required: true, message: '请选择机会卡目标类型' }]">
						<a-select v-model:value="chanceCardForm.type">
							<a-select-option v-for="(value, key) in targetNameMap" :value="key" :key="key">
								{{ value }}
							</a-select-option>
						</a-select>
					</a-form-item>
					<a-form-item label="颜色" name="color" :rules="[{ required: true, message: '请输入机会卡颜色' }]">
						<input type="color" v-model="chanceCardForm.color" />
					</a-form-item>
					<a-form-item label="icon图片" name="iconId" :rules="[{ required: true, validator: iconRule }]">
						<ResourcePicker
							type="image"
							v-model="chanceCardForm.iconId"
							:auto-save="!props.chanceCard"
							@change="handleResourceChange"
						/>
					</a-form-item>
				</a-form>
			</div>
			<div class="footer-actions">
				<a-button type="primary" block :loading="submitting" @click="() => handleAddChanceCard()">
					{{ chanceCard ? '保存修改' : '创建机会卡' }}
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
				v-model="chanceCardForm.effectCode"
				:template-text="templateText"
				:static-types="libContent"
			/>
		</div>
	</div>
</template>

<style lang="scss" scoped>
.chance-card-form-container {
	display: flex;
	height: 75vh;

	.chance-card-form {
		width: 25vw;
		display: flex;
		flex-direction: column;
		padding-right: 10px;

		.form-content {
			flex: 1;
			overflow-y: auto;
			display: flex;
			flex-direction: column;
			align-items: center;

			.chance-card-preview {
				font-size: 14px;
				margin: 10px 0;
			}
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

	.icon-url {
		display: block;
		word-break: break-all;
		margin-bottom: 10px;
		padding: 5px;
		border: 1px solid #ccc;
		border-radius: 5px;
		background-color: #f3f3f3;
		font-size: 0.8em;
	}
	.icon-preview {
		display: block;
		margin-bottom: 10px;
		border-radius: 10px;
		width: 150px;
		height: 150px;
		border-radius: 5px;
		background-color: #f3f3f3;
	}
}
</style>

<script setup lang="ts">
import { h, ref, computed, watch, onMounted } from "vue";
import { message, Modal } from "ant-design-vue";
import { ModifierTemplate } from "@mine-monopoly/types";
import CodeEditor from "@src/components/code-editor/index.vue";
import { useMonacoValidator } from "@src/components/code-editor/composables/useMonacoValidator";
import libContent from "@src/components/code-editor/editor-lib.d.ts?raw";
import { generateShortId } from "@src/utils/short-id";
import { generateModifierTemplate, generateModifierParams, replaceEffectCodeParams } from "@src/components/code-editor/code-templates";

const props = defineProps<{ data: ModifierTemplate }>();
const emit = defineEmits(["save", "cancel"]);

const localData = ref<ModifierTemplate>(JSON.parse(JSON.stringify(props.data)));

const idPrefix = "mod-";
const idSuffix = ref(localData.value.id.replace(/^mod-/, ""));
const submitting = ref(false);

if (!localData.value.descriptor.meta) {
	localData.value.descriptor.meta = { name: "", description: "", source: "", triggerTiming: "", tags: [] };
}

// 命令类型选项，按 Player / Property 分组
const commandTypeOptions = [
	{
		label: "Player 命令",
		options: [
			{ value: "player.money.gain", label: "player.money.gain — 玩家获得金钱" },
			{ value: "player.money.lose", label: "player.money.lose — 玩家失去金钱" },
			{ value: "player.walk", label: "player.walk — 玩家行走" },
			{ value: "player.tp", label: "player.tp — 玩家传送" },
			{ value: "player.dice.roll", label: "player.dice.roll — 玩家掷骰子" },
			{ value: "player.dice.add", label: "player.dice.add — 玩家添加骰子" },
			{ value: "player.dice.remove", label: "player.dice.remove — 玩家移除骰子" },
			{ value: "player.property.gain", label: "player.property.gain — 玩家获得地产" },
			{ value: "player.property.lose", label: "player.property.lose — 玩家失去地产" },
			{ value: "player.card.gain", label: "player.card.gain — 玩家获得机会卡" },
			{ value: "player.card.lose", label: "player.card.lose — 玩家失去机会卡" },
			{ value: "player.stop", label: "player.stop — 设置停止回合数" },
			{ value: "player.round.start", label: "player.round.start — 玩家回合开始" },
			{ value: "player.round.end", label: "player.round.end — 玩家回合结束" },
			{ value: "player.round.skip", label: "player.round.skip — 玩家回合跳过" },
			{ value: "player.bankrupted.set", label: "player.bankrupted.set — 设置破产状态" },
		],
	},
	{
		label: "Property 命令",
		options: [
			{ value: "property.owner.change", label: "property.owner.change — 地产主人变更" },
			{ value: "property.level.up", label: "property.level.up — 地产升级" },
			{ value: "property.level.down", label: "property.level.down — 地产降级" },
			{ value: "property.level.set", label: "property.level.set — 地产等级设置" },
			{ value: "property.arrived", label: "property.arrived — 玩家到达地产" },
		],
	},
];



const templateText = computed(() => generateModifierTemplate(localData.value.descriptor.commandType));

function updateEffectCodeCommandType(commandType: string) {
	localData.value.effectCode = replaceEffectCodeParams(
		localData.value.effectCode,
		() => generateModifierTemplate(commandType),
		() => generateModifierParams(commandType),
	);
}

// 初始化时根据当前 commandType 更新参数声明
onMounted(() => {
	const commandType = localData.value.descriptor.commandType;
	if (commandType) {
		updateEffectCodeCommandType(commandType);
	}
});

watch(
	() => localData.value.descriptor.commandType,
	(newType, oldType) => {
		if (!newType || newType === oldType) return;
		updateEffectCodeCommandType(newType);
	},
);

function handleIdInput(event: Event) {
	const value = (event.target as HTMLInputElement).value;
	localData.value.id = value ? `${idPrefix}${value}` : generateShortId("mod");
}

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

	if (!localData.value.name.trim()) {
		message.warning("请填写修饰器名称");
		return;
	}

	const slug = localData.value.slug?.trim();
	if (!slug) {
		message.warning("请填写修饰器标识 (Slug)，用于代码引用");
		return;
	}
	if (!/^[a-zA-Z0-9_\-]+$/.test(slug)) {
		message.error("标识包含非法字符，仅支持字母、数字、下划线、连字符");
		return;
	}
	if (!localData.value.descriptor.commandType.trim()) {
		message.warning("请选择命令类型 (commandType)");
		return;
	}

	submitting.value = true;
	try {
		if (skipCodeValidation !== true && localData.value.effectCode.trim()) {
			const { validate } = useMonacoValidator();
			const result = await validate(localData.value.effectCode, "modifier", {
				commandType: localData.value.descriptor.commandType,
				mode: "full",
			});
			if (!result.valid) {
				showCodeValidationModal(result.errors);
				return;
			}
		}

		localData.value.slug = slug;
		emit("save", localData.value);
	} finally {
		submitting.value = false;
	}
}
</script>

<template>
	<div class="modifier-editor-container">
		<!-- 左侧：表单 -->
		<div class="form-panel">
			<div class="form-scroll">
				<a-form layout="vertical">
					<a-form-item label="ID">
						<a-input
							v-model:value="idSuffix"
							placeholder="自定义后缀（留空自动生成）"
							allow-clear
							@input="handleIdInput"
						>
							<template #prefix><span style="color: #999">{{ idPrefix }}</span></template>
						</a-input>
					</a-form-item>

					<a-form-item label="名称">
						<a-input v-model:value="localData.name" placeholder="修饰器名称" />
					</a-form-item>

					<a-form-item label="标识 (Slug)">
						<a-tooltip title="唯一标识符，代码中通过 $mod__标识符 来引用">
							<a-input v-model:value="localData.slug" placeholder="unique_slug" addon-before="$mod__" />
						</a-tooltip>
					</a-form-item>

					<a-form-item label="触发时机 (Timing)">
						<a-select v-model:value="localData.descriptor.timing">
							<a-select-option value="before">before (命令执行前)</a-select-option>
							<a-select-option value="after">after (命令执行后)</a-select-option>
						</a-select>
					</a-form-item>

					<a-form-item label="命令类型 (CommandType)">
						<a-select
							v-model:value="localData.descriptor.commandType"
							placeholder="选择命令类型"
							:options="commandTypeOptions"
						/>
					</a-form-item>

					<a-form-item label="剩余触发次数">
						<a-input-number v-model:value="localData.descriptor.remainingTriggers" :min="-1" style="width: 100%" />
						<span class="field-hint">-1 表示无限次</span>
					</a-form-item>

					<a-form-item label="优先级 (Priority)">
						<a-input-number v-model:value="localData.descriptor.priority" style="width: 100%" />
						<span class="field-hint">数值越大优先级越高</span>
					</a-form-item>

					<a-form-item label="自动消耗 (autoConsume)">
						<a-switch v-model:checked="localData.descriptor.autoConsume" />
					</a-form-item>

					<a-divider />

					<a-form-item label="显示名称 (Meta)">
						<a-input v-model:value="localData.descriptor.meta!.name" placeholder="用于 UI 展示的名称" />
					</a-form-item>

					<a-form-item label="描述 (Meta)">
						<a-textarea
							v-model:value="localData.descriptor.meta!.description"
							placeholder="修饰器效果的简要描述"
							:auto-size="{ minRows: 2, maxRows: 4 }"
						/>
					</a-form-item>

					<a-form-item label="来源 (Source)">
						<a-input v-model:value="localData.descriptor.meta!.source" placeholder="修饰器来源，如：某个角色或道具" />
					</a-form-item>

					<a-form-item label="触发时机名称 (TriggerTiming)">
						<a-input v-model:value="localData.descriptor.meta!.triggerTiming" placeholder="触发时机的显示名称，如：掷骰子前" />
					</a-form-item>

					<a-form-item label="标签 (Tags)">
						<a-select
							v-model:value="localData.descriptor.meta!.tags"
							mode="tags"
							placeholder="输入标签后回车添加"
							style="width: 100%"
						/>
					</a-form-item>
				</a-form>
			</div>

			<div class="form-footer">
				<div style="margin-left: auto">
					<a-button @click="$emit('cancel')" style="margin-right: 8px">取消</a-button>
					<a-button type="primary" :loading="submitting" @click="() => handleSave()">保存修饰器</a-button>
				</div>
			</div>
		</div>

		<!-- 右侧：代码编辑器 -->
		<div class="editor-panel">
			<CodeEditor
				v-model="localData.effectCode"
				language="typescript"
				:template-text="templateText"
				:static-types="libContent"
			/>
		</div>
	</div>
</template>

<style scoped lang="scss">
.modifier-editor-container {
	display: flex;
	height: 75vh;
}

.form-panel {
	width: 320px;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	border-right: 1px solid #f0f0f0;

	.form-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	.form-footer {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 12px 16px;
		border-top: 1px solid #f0f0f0;
		background: #fafafa;
	}
}

.editor-panel {
	flex: 1;
	display: flex;
	flex-direction: column;
	padding: 0 10px;
}

.field-hint {
	font-size: 12px;
	color: #999;
}
</style>

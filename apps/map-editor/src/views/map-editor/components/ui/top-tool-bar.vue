<script setup lang="ts">
import { CameraMode, OperationMode } from "@src/enums";
import { message } from "ant-design-vue";
import { useEditorStore, useMapDataStore } from "@src/stores";
import { computed, ref, defineAsyncComponent } from "vue";
import { eventBus } from "@src/utils/event-bus";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import CollapsiblePanel from "@src/components/collapsible-panel/CollapsiblePanel.vue";

const editorStore = useEditorStore();

// --- 类型定义 ---
type ItemType = "modal" | "action";

interface ToolbarItem {
	key: string; // 唯一标识
	text: string; // 按钮文字
	icon: string; // 图标 class
	type: ItemType; // 类型：打开弹窗 或 执行函数
	component?: any; // 异步组件 (type='modal' 时必填)
	action?: () => void; // 执行函数 (type='action' 时必填)
}

// --- 核心配置表：在这里管理所有功能 ---
const toolbarItems: ToolbarItem[] = [
	{
		key: "MapInfo",
		text: "地图信息",
		icon: "fas fa-circle-info",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/map-info-form.vue")),
	},
	{
		key: "Model",
		text: "模型资源",
		icon: "fas fa-cubes",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/model-manager.vue")),
	},
	{
		key: "Role",
		text: "角色管理",
		icon: "fas fa-mask",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/role-manager.vue")),
	},
	{
		key: "MapPathGenerator",
		text: "地图路径",
		icon: "fas fa-bezier-curve",
		type: "modal",
		component: defineAsyncComponent(() => import("../common/map-path-generator.vue")),
	},
	{
		key: "Building",
		text: "建筑模型",
		icon: "fas fa-house",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/default-building-manager.vue")),
	},
	{
		key: "Process",
		text: "游戏流程",
		icon: "fas fa-microchip",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/process-manager/process-manager.vue")),
	},
	{
		key: "Event",
		text: "地块事件",
		icon: "fas fa-book",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/event-manager.vue")),
	},
	{
		key: "ChanceCard",
		text: "机会卡",
		icon: "fas fa-wand-magic-sparkles",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/chancecard-manager.vue")),
	},
	{
		key: "CustomUI",
		text: "自定义UI",
		icon: "fas fa-layer-group",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/custom-ui-manager/custom-ui-manager.vue")),
	},
	{
		key: "ModifierTemplate",
		text: "修饰器模板",
		icon: "fas fa-bolt-lightning",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/modifier-template-manager/modifier-template-manager.vue")),
	},
	{
		key: "MapData",
		text: "JSON数据",
		icon: "fas fa-database",
		type: "modal",
		component: defineAsyncComponent(() => import("../common/map-data-viewer.vue")),
	},
	{
		key: "GameSetting",
		text: "游戏参数",
		icon: "fas fa-sliders-h",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/forms/game-setting-form/index.vue")),
	},
	{
		key: "ExtraLibs",
		text: "TS类型",
		icon: "fas fa-code",
		type: "modal",
		component: defineAsyncComponent(() => import("../manager/forms/extra-libs-editor/extra-libs-editor.vue")),
	},
	{
		key: "Screenshot",
		text: "截图",
		icon: "fas fa-camera",
		type: "action",
		action: handleScreenshot,
	},
];

// --- 状态管理 ---
// 当前激活的功能 Key
const activeKey = ref<string | null>(null);

// 计算当前应该渲染的组件
// 使用 shallowRef 或直接返回 definition 都可以，Vue 会自动处理 defineAsyncComponent
const currentComponent = computed(() => {
	const item = toolbarItems.find((i) => i.key === activeKey.value);
	return item?.type === "modal" ? item.component : null;
});

// 控制弹窗显示的 v-model 绑定值
// 当 activeKey 有值时为 true，设为 false 时清空 activeKey (即关闭弹窗)
const isModalVisible = computed({
	get: () => !!activeKey.value,
	set: (val) => {
		if (!val) activeKey.value = null;
	},
});

// --- 事件处理 ---
function handleItemClick(item: ToolbarItem) {
	if (item.type === "action" && item.action) {
		// 如果是动作，直接执行
		item.action();
	} else if (item.type === "modal") {
		// 如果是弹窗，切换激活状态
		// 如果点的是当前已经打开的，不做处理或者可以设计为关闭
		activeKey.value = item.key;
	}
}

// --- 业务逻辑：设置背景图 ---

// --- 业务逻辑：模式切换 ---
const operationModeNameMap: Record<OperationMode, string> = {
	[OperationMode.Edit]: "创造模式",
	[OperationMode.Select]: "选择模式",
};

const caremaModeNameMap: Record<CameraMode, string> = {
	[CameraMode.Perspective]: "正常视角",
	[CameraMode.Orthographic]: "俯视视角",
};

function handleOperationModeChange() {
	// 如果当前是框选模式，切换操作模式时自动退出
	if (editorStore.isBoxSelectMode) {
		eventBus.emit("toggle-box-select-mode");
	}

	message.success({ content: `已切换到 ${operationModeNameMap[editorStore.currentEditMode]}`, duration: 1 });
	eventBus.emit("change-operation-mode", editorStore.currentEditMode);
}

function handleCameraModeChange() {
	// 如果当前是框选模式，切换视角时自动退出
	if (editorStore.isBoxSelectMode) {
		eventBus.emit("toggle-box-select-mode");
	}

	message.success({ content: `摄像机已切换到 ${caremaModeNameMap[editorStore.currentCameraMode]}`, duration: 1 });
	eventBus.emit("change-camera-mode", editorStore.currentCameraMode);
}

function handleBoxSelectModeChange() {
	const store = useEditorStore();
	if (store.currentCameraMode !== CameraMode.Orthographic) {
		message.warning("框选功能仅支持正交相机模式", 2);
		return;
	}

	// 直接触发事件，让 renderer 处理状态切换
	// 这样可以避免状态在 UI 层被提前改变导致 renderer 逻辑错误
	eventBus.emit("toggle-box-select-mode");
}

function handleToggleIndicators() {
	editorStore.toggleIndicators();
	eventBus.emit("toggle-indicators");
	message.success(
		editorStore.showIndicators ? "已显示所有工具指示器" : "已隐藏所有工具指示器",
		1
	);
}

async function handleScreenshot() {
	try {
		const canvas = document.querySelector("#map-editor-canvas-container") as HTMLCanvasElement;
		if (!canvas) {
			message.error("找不到编辑器画布", 2);
			return;
		}

		const dataUrl = canvas.toDataURL("image/png");

		const result = await window.electronAPI.showSaveDialog({
			title: "保存截图",
			defaultPath: `screenshot-${Date.now()}.png`,
			filters: [{ name: "PNG图片", extensions: ["png"] }],
		});

		if (!result.filePath) return;

		const base64 = dataUrl.split(",")[1];
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		await window.electronAPI.saveFile(result.filePath, bytes as any);
		message.success("截图已保存", 2);
	} catch (e: any) {
		message.error("截图失败: " + e.message, 2);
	}
}
</script>

<template>
	<div class="top-panel">
		<div class="left">
			<div class="mode-controls">
				<a-space>
					<a-radio-group
						@change="handleOperationModeChange"
						button-style="solid"
						class="mode-selector"
						v-model:value="editorStore.currentEditMode"
					>
						<a-radio-button :value="OperationMode.Select">
							<a-space>
								<span v-if="editorStore.currentEditMode === OperationMode.Select">
									{{ operationModeNameMap[OperationMode.Select] }}
								</span>
								<font-awesome-icon :icon="['fas', 'hand-pointer']" />
							</a-space>
						</a-radio-button>
						<a-radio-button :value="OperationMode.Edit">
							<a-space>
								<span v-if="editorStore.currentEditMode === OperationMode.Edit">
									{{ operationModeNameMap[OperationMode.Edit] }}
								</span>
								<font-awesome-icon :icon="['fas', 'plus']" />
							</a-space>
						</a-radio-button>
					</a-radio-group>

					<a-radio-group
						@change="handleCameraModeChange"
						button-style="solid"
						class="mode-selector"
						v-model:value="editorStore.currentCameraMode"
					>
						<a-radio-button :value="CameraMode.Perspective">
							<a-space>
								<span v-if="editorStore.currentCameraMode === CameraMode.Perspective">
									{{ caremaModeNameMap[CameraMode.Perspective] }}
								</span>
								<font-awesome-icon :icon="['fas', 'camera']" />
							</a-space>
						</a-radio-button>
						<a-radio-button :value="CameraMode.Orthographic">
							<a-space>
								<span v-if="editorStore.currentCameraMode === CameraMode.Orthographic">
									{{ caremaModeNameMap[CameraMode.Orthographic] }}
								</span>
								<font-awesome-icon :icon="['fas', 'plane']" />
							</a-space>
						</a-radio-button>
					</a-radio-group>
				</a-space>

				<a-button
					v-if="editorStore.currentEditMode === OperationMode.Select && editorStore.currentCameraMode === CameraMode.Orthographic"
					:type="editorStore.isBoxSelectMode ? 'primary' : 'default'"
					@click="handleBoxSelectModeChange"
				>
					<a-space>
						<span v-if="editorStore.isBoxSelectMode">退出框选</span>
						<span v-else>框选模式</span>
						<font-awesome-icon :icon="['fas', 'object-group']" />
					</a-space>
				</a-button>

				<a-button
					:type="editorStore.showIndicators ? 'primary' : 'default'"
					@click="handleToggleIndicators"
				>
					<a-space>
						<span v-if="editorStore.showIndicators">隐藏指示器</span>
						<span v-else>显示指示器</span>
						<font-awesome-icon :icon="['fas', 'eye']" />
					</a-space>
				</a-button>
			</div>
		</div>

		<div class="right">
			<CollapsiblePanel mode="slide" edge="top" :z-index="1" grip-align="end">
				<a-space wrap style="justify-content: flex-end">
					<a-button
						v-for="item in toolbarItems"
						:key="item.key"
						@click="handleItemClick(item)"
						:type="activeKey === item.key ? 'primary' : 'default'"
					>
						<font-awesome-icon style="margin-right: 5px" :icon="item.icon" />
						<span>{{ item.text }}</span>
					</a-button>
				</a-space>
			</CollapsiblePanel>
		</div>

		<component v-if="currentComponent" :is="currentComponent" v-model="isModalVisible" />
	</div>
</template>

<style lang="scss" scoped>
.top-panel {
	width: 100%;
	display: flex;
	padding: 10px;
	justify-content: space-between;
	pointer-events: initial;
	gap: 10px;

	.left {
		/* 层级高于右侧工具列表（.right z-index: 1 < .left 2），收起动画滑过时不会盖住操作栏 */
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 10px;

		.mode-controls {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
	}

	& .right {
		/* 独立 stacking context：隔离面板内部 z-index（CollapsiblePanel 已传低 z-index），
		   且 .right(1) < .left(2)，保证收起动画时工具列表不盖过左侧操作栏 */
		position: relative;
		z-index: 1;
		flex: 1;
		display: flex;
		align-items: stretch;

		.cp-slide {
			flex: 1;
			min-width: 0;
		}
	}
}
</style>

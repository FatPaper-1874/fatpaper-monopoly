<script setup lang="ts">
import { MapRenderer } from "@src/core/renderer/map-renderer";
import { useEditorStore } from "@src/stores";
import { computed, onBeforeUnmount, onMounted } from "vue";
import TopToolBar from "./components/ui/top-tool-bar.vue";
import EditModeUi from "./components/ui/edit-mode.vue";
import SelectModeUi from "./components/ui/select-mode.vue";
import { OperationMode } from "@src/enums";

const editorStore = useEditorStore();
let mapRenderer: MapRenderer | null = null;

onMounted(() => {
	const canvasEl = document.querySelector("#map-editor-canvas-container") as HTMLCanvasElement;
	mapRenderer = new MapRenderer(canvasEl);
});

onBeforeUnmount(() => {
	mapRenderer?.destroy();
	mapRenderer = null;
});

const modeUiMap: Record<OperationMode, any> = {
	[OperationMode.Edit]: EditModeUi,
	[OperationMode.Select]: SelectModeUi,
};

const uiContent = computed(() => modeUiMap[editorStore.currentEditMode]);
const isLoading = computed(() => editorStore.isLoading);
const loadingText = computed(() => editorStore.loadingText);
</script>

<template>
	<div class="map-editor-container">
		<div class="ui-container">
			<top-tool-bar />
			<component :is="uiContent" />
		</div>
		<canvas id="map-editor-canvas-container"> </canvas>
			<transition name="fade">
				<div v-if="isLoading" class="loading-mask">
					<div class="spinner"></div>
					<span>{{ loadingText }}</span>
				</div>
			</transition>
		</div>
</template>

<style lang="scss" scoped>
.map-editor-container {
	width: 100%;
	height: 100%;
	position: relative;
	/* 裁剪超出编辑器区域的 UI（如工具列表收起动画向上滑出），避免盖到顶部 Header */
	overflow: hidden;

	& > .ui-container {
		width: 100%;
		height: 100%;
		position: absolute;
		left: 0;
		top: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		pointer-events: none;

		.mode-selector {
			margin: 10px;
		}

		& > *:last-child {
			flex: 1;
			padding: 0 10px;
		}
	}
}

#map-editor-canvas-container {
	width: 100%;
	height: 100%;
	display: block;
	pointer-events: initial;
}

.loading-mask {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	background-color: rgba(0, 0, 0, 0.6);
	z-index: 2000;

	& > span {
		margin-top: 1rem;
		color: #ffffff;
		font-size: 0.8rem;
	}
}

.spinner {
	width: 50px;
	height: 50px;
	border-radius: 50%;
	border: 2px solid rgba(255, 255, 255, 0.3);
	border-top-color: #ffffff;
	animation: spin 1s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>

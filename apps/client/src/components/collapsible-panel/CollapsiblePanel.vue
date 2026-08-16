<script lang="ts" setup>
import { ref } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { useCollapsible } from "@mine-monopoly/utils";
import type { PanelEdge, CollapsibleMode } from "@mine-monopoly/utils";

/** slide 模式可传 auto：按面板实际位置自动选最近的边缘 */
export type SlideEdge = PanelEdge | "auto";
export type { PanelEdge, CollapsibleMode } from "@mine-monopoly/utils";

const props = withDefaults(
	defineProps<{
		/**
		 * 模式：
		 * - dock：fixed 视口定位 + 拖拽四边吸附，内容淡出缩放收起（编辑器用）
		 * - slide：继承宿主定位，内容整体位移滑出屏幕，把手在边沿（游戏面板用）
		 */
		mode?: CollapsibleMode;
		/** 吸附边 / 滑出边；slide 模式可传 auto 按面板实际位置自动判断 */
		edge?: PanelEdge | "auto";
		/** 闲置自动收缩毫秒数，0 表示仅手动开关 */
		autoCollapseMs?: number;
		/** 面板层级 */
		zIndex?: number | string;
		/** dock 模式：初始沿吸附边方向的对齐：start/end 时沿边偏移 8px，center 为居中 */
		initialAlign?: "start" | "center" | "end";
		/** dock 模式：初始沿吸附边方向的偏移（像素），提供时优先于 initialAlign */
		initialOffset?: number;
		/** slide 模式：把手位置。outside=面板外侧（可被相邻面板遮挡，玩家列表用）；inside=面板内侧边缘（不伸出，避免覆盖相邻自定义 UI） */
		gripSide?: "outside" | "inside";
	}>(),
	{ mode: "dock", edge: "right", autoCollapseMs: 0, zIndex: 2000, initialAlign: "center", gripSide: "outside" },
);

const collapsed = defineModel<boolean>("collapsed", { default: false });

const rootEl = ref<HTMLElement | null>(null);
const slideRootEl = ref<HTMLElement | null>(null);

// 纯逻辑（拖拽吸附 / 位移滑出 / 手动开关 / 闲置自动收缩）共享自 @mine-monopoly/utils
const {
	toggle,
	onMouseEnter,
	onMouseLeave,
	onGripDown,
	dockEdge,
	panelStyle,
	collapseRotate,
	expandRotate,
	slideEdge,
	slideCollapseIcon,
	slideExpandIcon,
} = useCollapsible(props, collapsed, rootEl, slideRootEl);
</script>

<template>
	<!-- dock 模式：fixed 定位 + 拖拽吸附 + 缩放淡出（编辑器） -->
	<div
		v-if="props.mode === 'dock'"
		ref="rootEl"
		class="cp-root"
		:class="[`cp-edge-${dockEdge}`, { 'cp-root--collapsed': collapsed }]"
		:style="panelStyle"
		@mouseenter="onMouseEnter"
		@mouseleave="onMouseLeave"
	>
		<div class="cp-body">
			<div class="cp-content">
				<slot />
			</div>
			<button class="cp-btn cp-collapse-btn" title="收起" @pointerdown="onGripDown">
				<svg
					class="cp-icon"
					:style="{ transform: `rotate(${collapseRotate}deg)` }"
					viewBox="0 0 24 24"
				>
					<path
						d="M9 6l6 6-6 6"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</div>
		<button class="cp-btn cp-grip" title="展开" @pointerdown="onGripDown">
			<svg
				class="cp-icon"
				:style="{ transform: `rotate(${expandRotate}deg)` }"
				viewBox="0 0 24 24"
			>
				<path
					d="M9 6l6 6-6 6"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>

	<!-- slide 模式：继承宿主定位，内容位移滑出屏幕，把手在边沿（游戏面板） -->
	<div
		v-else
		ref="slideRootEl"
		class="cp-slide"
		:class="[`cp-slide-${slideEdge}`, { collapsed }]"
		:style="{ zIndex: props.zIndex }"
		@mouseenter="onMouseEnter"
		@mouseleave="onMouseLeave"
	>
		<slot name="grip" :collapsed="collapsed" :toggle="toggle" :edge="props.edge">
			<button
				class="cp-slide-grip btn-small"
				:class="{ 'cp-slide-grip--inside': props.gripSide === 'inside' }"
				:title="collapsed ? '展开面板' : '收起面板'"
				@click="toggle"
			>
				<FontAwesomeIcon
					class="cp-slide-icon"
					:icon="['fas', collapsed ? slideExpandIcon : slideCollapseIcon]"
				/>
			</button>
		</slot>
		<div class="cp-slide-body">
			<slot />
		</div>
	</div>
</template>

<style lang="scss" scoped>
/* ================= dock 模式 ================= */
.cp-root {
	position: fixed;
	max-width: 90vw;
	max-height: 90vh;
	/* 覆盖父容器 pointer-events: none 的继承 */
	pointer-events: auto;
}

/* 收缩态整体不拦截事件，只保留抓手可点 */
.cp-root--collapsed {
	pointer-events: none;
}

.cp-body {
	position: relative;
	max-height: 90vh;
	overflow-y: auto;
	transition:
		opacity 0.28s ease,
		transform 0.28s ease,
		visibility 0.28s;
}

.cp-root--collapsed .cp-body {
	opacity: 0;
	visibility: hidden;
	pointer-events: none;
	transform: scale(0.4);
	transition:
		opacity 0.28s ease,
		transform 0.28s ease,
		visibility 0s 0.28s;
}

/* 收缩动画朝对应吸附边方向 */
.cp-edge-top.cp-root--collapsed .cp-body {
	transform: translateY(-40%) scale(0.4);
}

.cp-edge-bottom.cp-root--collapsed .cp-body {
	transform: translateY(40%) scale(0.4);
}

.cp-edge-left.cp-root--collapsed .cp-body {
	transform: translateX(-40%) scale(0.4);
}

.cp-edge-right.cp-root--collapsed .cp-body {
	transform: translateX(40%) scale(0.4);
}

.cp-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	padding: 0;
	border: none;
	cursor: pointer;
	background: rgba(20, 24, 34, 0.72);
	color: #fff;
	border-radius: 6px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	user-select: none;
	-webkit-user-select: none;
}

.cp-btn:hover {
	background: rgba(20, 24, 34, 0.9);
}

.cp-icon {
	width: 18px;
	height: 18px;
	/* SVG 元素 CSS transform 默认原点为 0 0，需显式设为中心，否则旋转会移出按钮 */
	transform-origin: center;
	transition: transform 0.2s ease;
}

/* 展开态收起按钮：悬浮在面板右上角 */
.cp-collapse-btn {
	position: absolute;
	top: 6px;
	right: 6px;
	z-index: 1;
}

/* 收缩态抓手：贴吸附边内侧，沿边居中（面板距边 8px，故抓手完整可见） */
.cp-grip {
	position: absolute;
	opacity: 0;
	visibility: hidden;
	pointer-events: none;
	transition:
		opacity 0.28s ease,
		visibility 0.28s;
}

.cp-root--collapsed .cp-grip {
	opacity: 1;
	visibility: visible;
	pointer-events: auto;
}

.cp-edge-top .cp-grip {
	top: 0;
	left: 50%;
	transform: translateX(-50%);
}

.cp-edge-bottom .cp-grip {
	bottom: 0;
	left: 50%;
	transform: translateX(-50%);
}

.cp-edge-left .cp-grip {
	left: 0;
	top: 50%;
	transform: translateY(-50%);
}

.cp-edge-right .cp-grip {
	right: 0;
	top: 50%;
	transform: translateY(-50%);
}

/* ================= slide 模式 ================= */
/* 根元素定位由宿主提供（如 absolute right/bottom），组件不写死 */

/* 收起后容器为透明占位，不拦截点击；把手单独恢复可点 */
.cp-slide.collapsed {
	pointer-events: none;
}

/* 把手：展开态在远离边缘侧，收起态滑到边缘；视觉直接复用 client 全局 btn-small 样式 */
.cp-slide-grip {
	position: absolute;
	z-index: 10;
	pointer-events: auto;
	display: flex;
	align-items: center;
	justify-content: center;
	/* 覆盖全局 button 的 margin-bottom，避免贴边时浮起 */
	margin: 0;
	user-select: none;
	-webkit-user-select: none;
	transition:
		right 0.35s ease,
		left 0.35s ease,
		top 0.35s ease,
		bottom 0.35s ease;
}


/* right/left 边：竖条长方形，垂直居中 */
.cp-slide-right .cp-slide-grip,
.cp-slide-left .cp-slide-grip {
	width: 1.375rem;
	height: 2.75rem;
	padding: 0.3rem 0;
	top: 50%;
	transform: translateY(-50%);
}

/* top/bottom 边：横条长方形，水平居中 */
.cp-slide-top .cp-slide-grip,
.cp-slide-bottom .cp-slide-grip {
	width: 2.75rem;
	height: 1.375rem;
	padding: 0 0.3rem;
	left: 50%;
	transform: translateX(-50%);
}

.cp-slide-right .cp-slide-grip {
	right: calc(100% + 0.4rem);
}

.cp-slide-right.collapsed .cp-slide-grip {
	right: 0;
}

.cp-slide-left .cp-slide-grip {
	left: calc(100% + 0.4rem);
}

.cp-slide-left.collapsed .cp-slide-grip {
	left: 0;
}

/* 覆盖全局 button:active 的 scale（会顶掉垂直居中导致按钮跳位） */
.cp-slide-right .cp-slide-grip:active,
.cp-slide-left .cp-slide-grip:active {
	transform: translateY(-50%) scale(0.97);
}

.cp-slide-top .cp-slide-grip {
	top: calc(100% + 0.4rem);
}

.cp-slide-top.collapsed .cp-slide-grip {
	top: 0;
}

.cp-slide-bottom .cp-slide-grip {
	bottom: calc(100% + 0.4rem);
}

.cp-slide-bottom.collapsed .cp-slide-grip {
	bottom: 0;
}

.cp-slide-top .cp-slide-grip:active,
.cp-slide-bottom .cp-slide-grip:active {
	transform: translateX(-50%) scale(0.97);
}

/* inside 模式：把手贴面板内侧边缘，不伸出面板范围（避免覆盖相邻自定义 UI）；
   收起后位置不变，面板滑走后按钮留在面板原位置（屏幕边缘侧） */
.cp-slide-right .cp-slide-grip--inside,
.cp-slide-right.collapsed .cp-slide-grip--inside {
	right: 0.4rem;
}

.cp-slide-left .cp-slide-grip--inside,
.cp-slide-left.collapsed .cp-slide-grip--inside {
	left: 0.4rem;
}

.cp-slide-top .cp-slide-grip--inside,
.cp-slide-top.collapsed .cp-slide-grip--inside {
	top: 0.4rem;
}

.cp-slide-bottom .cp-slide-grip--inside,
.cp-slide-bottom.collapsed .cp-slide-grip--inside {
	bottom: 0.4rem;
}

/* 内容：整体位移滑出屏幕 */
.cp-slide-body {
	/* 继承根元素高度（grid cell 等高场景），使内部 height: 100% 链路生效 */
	height: 100%;
	/* 内容根显式撑满（等价原 grid item 的 stretch），不依赖浏览器对 grid 子项拉伸的实现差异 */
	& > * {
		height: 100%;
		width: 100%;
		box-sizing: border-box;
	}

	transition:
		transform 0.35s ease,
		opacity 0.35s ease;
}

.cp-slide-right.collapsed .cp-slide-body {
	transform: translateX(110%);
	opacity: 0;
	pointer-events: none;
}

.cp-slide-left.collapsed .cp-slide-body {
	transform: translateX(-110%);
	opacity: 0;
	pointer-events: none;
}

.cp-slide-top.collapsed .cp-slide-body {
	transform: translateY(-110%);
	opacity: 0;
	pointer-events: none;
}

.cp-slide-bottom.collapsed .cp-slide-body {
	transform: translateY(110%);
	opacity: 0;
	pointer-events: none;
}
</style>

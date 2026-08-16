<script lang="ts" setup>
import { computed, ref } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faAngleRight, faAngleLeft, faChevronUp, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { useCollapsible } from "@mine-monopoly/utils";
import type { PanelEdge, CollapsibleMode } from "@mine-monopoly/utils";

/** slide 模式可传 auto：按面板实际位置自动选最近的边缘 */
export type SlideEdge = PanelEdge | "auto";
export type { PanelEdge, CollapsibleMode } from "@mine-monopoly/utils";

const props = withDefaults(
	defineProps<{
		/**
		 * 模式：
		 * - dock：fixed 视口定位 + 拖拽四边吸附，内容淡出缩放收起（悬浮面板用）
		 * - slide：继承宿主定位，内容整体位移滑出，把手在边沿（内嵌工具列表用）
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
		/** slide 模式：把手位置。outside=面板外侧；inside=面板内侧边缘（不伸出，避免覆盖相邻内容） */
		gripSide?: "outside" | "inside";
		/** slide 模式：把手沿吸附边的对齐方式。center=沿边居中（默认）；start=沿边起点端（top/bottom 边靠左，left/right 边靠顶）；end=沿边末端（top/bottom 边靠右，left/right 边靠底，如 top 边即右下角）。start/end 时把手固定不动，收起时不滑向面板边缘 */
		gripAlign?: "start" | "center" | "end";
	}>(),
	{ mode: "dock", edge: "right", autoCollapseMs: 0, zIndex: 2000, initialAlign: "center", gripSide: "outside", gripAlign: "center" },
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

// 图标本地引入（map-editor 按需注册图标库，不依赖 main.ts 的 library.add）
const slideIconNameMap: Record<string, IconDefinition> = {
	"angle-right": faAngleRight,
	"angle-left": faAngleLeft,
	"chevron-up": faChevronUp,
	"chevron-down": faChevronDown,
};
const slideIcon = computed(() => {
	const name = collapsed.value ? slideExpandIcon.value : slideCollapseIcon.value;
	return slideIconNameMap[name];
});
</script>

<template>
	<!-- dock 模式：fixed 定位 + 拖拽吸附 + 缩放淡出（悬浮面板） -->
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

	<!-- slide 模式：继承宿主定位，内容位移滑出，把手在边沿（内嵌工具列表） -->
	<div
		v-else
		ref="slideRootEl"
		class="cp-slide"
		:class="[
			`cp-slide-${slideEdge}`,
			`cp-slide-grip-align-${props.gripAlign}`,
			{ collapsed },
		]"
		:style="{ zIndex: props.zIndex }"
		@mouseenter="onMouseEnter"
		@mouseleave="onMouseLeave"
	>
		<slot name="grip" :collapsed="collapsed" :toggle="toggle" :edge="props.edge">
			<button
				class="cp-slide-grip"
				:class="{ 'cp-slide-grip--inside': props.gripSide === 'inside' }"
				:title="collapsed ? '展开工具列表' : '收起工具列表'"
				@click="toggle"
			>
				<FontAwesomeIcon
					class="cp-slide-icon"
					:icon="slideIcon"
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
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	border-radius: 6px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	user-select: none;
	-webkit-user-select: none;
}

.cp-btn:hover {
	background: rgba(0, 0, 0, 0.75);
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
/* 根元素定位由宿主提供（如 absolute/right 定位），组件只保证相对定位基准 */
.cp-slide {
	position: relative;
}

/* 收起后容器为透明占位，不拦截点击；把手单独恢复可点 */
.cp-slide.collapsed {
	pointer-events: none;
}

/* 把手：展开态在远离边缘侧，收起态滑到边缘 */
.cp-slide-grip {
	position: absolute;
	z-index: 10;
	pointer-events: auto;
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 0;
	border: none;
	cursor: pointer;
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	border-radius: 6px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	user-select: none;
	-webkit-user-select: none;
	transition:
		right 0.35s ease,
		left 0.35s ease,
		top 0.35s ease,
		bottom 0.35s ease;
}

.cp-slide-grip:hover {
	background: rgba(0, 0, 0, 0.75);
}

.cp-slide-icon {
	width: 1rem;
	height: 1rem;
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

/* inside 模式：把手贴面板内侧边缘，不伸出面板范围；
   收起后位置不变，面板滑走后按钮留在面板原位置 */
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

/* 内容：整体位移滑出 */
.cp-slide-body {
	/* 继承根元素高度，使内部 height: 100% 链路生效 */
	height: 100%;
	/* 内容根显式撑满，不依赖浏览器对 grid/flex 子项拉伸的实现差异 */
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

/* ================= slide 模式：把手端到端对齐（gripAlign: start/end） ================= */
/* start/end：长方形按钮（覆盖默认横条/竖条尺寸） */
.cp-slide-grip-align-start .cp-slide-grip,
.cp-slide-grip-align-end .cp-slide-grip {
	width: 2rem;
	height: 1.5rem;
	padding: 0;
}

/* start/end：active 缩放不产生位移 */
.cp-slide-grip-align-start .cp-slide-grip:active,
.cp-slide-grip-align-end .cp-slide-grip:active {
	transform: scale(0.97);
}

/* top 边：start=左端，end=右端；展开在面板底缘端点，收起滑到面板顶缘端点（跟随动画） */
.cp-slide-top.cp-slide-grip-align-start .cp-slide-grip {
	left: 0;
	bottom: 0;
	transform: none;
}

.cp-slide-top.cp-slide-grip-align-start.collapsed .cp-slide-grip {
	left: 0;
	top: 0;
	bottom: auto;
	transform: none;
}

.cp-slide-top.cp-slide-grip-align-end .cp-slide-grip {
	right: 0;
	bottom: 0;
	left: auto;
	transform: none;
}

.cp-slide-top.cp-slide-grip-align-end.collapsed .cp-slide-grip {
	right: 0;
	top: 0;
	bottom: auto;
	left: auto;
	transform: none;
}

/* bottom 边：start=左端，end=右端；展开在面板顶缘端点，收起滑到面板底缘端点 */
.cp-slide-bottom.cp-slide-grip-align-start .cp-slide-grip {
	left: 0;
	top: 0;
	transform: none;
}

.cp-slide-bottom.cp-slide-grip-align-start.collapsed .cp-slide-grip {
	left: 0;
	bottom: 0;
	top: auto;
	transform: none;
}

.cp-slide-bottom.cp-slide-grip-align-end .cp-slide-grip {
	right: 0;
	top: 0;
	left: auto;
	transform: none;
}

.cp-slide-bottom.cp-slide-grip-align-end.collapsed .cp-slide-grip {
	right: 0;
	bottom: 0;
	top: auto;
	left: auto;
	transform: none;
}

/* left 边：start=顶端，end=底端；展开在面板右缘端点，收起滑到面板左缘端点 */
.cp-slide-left.cp-slide-grip-align-start .cp-slide-grip {
	left: 0;
	top: 0;
	transform: none;
}

.cp-slide-left.cp-slide-grip-align-start.collapsed .cp-slide-grip {
	left: 0;
	bottom: 0;
	top: auto;
	transform: none;
}

.cp-slide-left.cp-slide-grip-align-end .cp-slide-grip {
	left: 0;
	bottom: 0;
	top: auto;
	transform: none;
}

.cp-slide-left.cp-slide-grip-align-end.collapsed .cp-slide-grip {
	left: 0;
	top: 0;
	bottom: auto;
	transform: none;
}

/* right 边：start=顶端，end=底端；展开在面板左缘端点，收起滑到面板右缘端点 */
.cp-slide-right.cp-slide-grip-align-start .cp-slide-grip {
	right: 0;
	top: 0;
	transform: none;
}

.cp-slide-right.cp-slide-grip-align-start.collapsed .cp-slide-grip {
	right: 0;
	bottom: 0;
	top: auto;
	transform: none;
}

.cp-slide-right.cp-slide-grip-align-end .cp-slide-grip {
	right: 0;
	bottom: 0;
	top: auto;
	transform: none;
}

.cp-slide-right.cp-slide-grip-align-end.collapsed .cp-slide-grip {
	right: 0;
	top: 0;
	bottom: auto;
	transform: none;
}
</style>

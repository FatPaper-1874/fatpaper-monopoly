import {
	computed,
	nextTick,
	onMounted,
	onUnmounted,
	reactive,
	ref,
	type CSSProperties,
	type Ref,
} from "vue";

export type PanelEdge = "top" | "bottom" | "left" | "right";
export type CollapsibleMode = "dock" | "slide";

/** CollapsiblePanel 组件 props（与 useCollapsible 共享） */
export interface CollapsiblePanelProps {
	mode?: CollapsibleMode;
	edge?: PanelEdge | "auto";
	autoCollapseMs?: number;
	zIndex?: number | string;
	initialAlign?: "start" | "center" | "end";
	initialOffset?: number;
}

function clamp(v: number, min: number, max: number) {
	const upper = Math.max(min, max);
	return Math.min(Math.max(v, min), upper);
}

/**
 * CollapsiblePanel 的纯逻辑（无样式）：dock 拖拽吸附 + slide 位移滑出 + 手动开关 + 闲置自动收缩。
 * 供 client / map-editor 的 CollapsiblePanel 组件共享，避免两份副本逻辑漂移。
 */
export function useCollapsible(
	props: CollapsiblePanelProps,
	collapsed: Ref<boolean>,
	rootEl: Ref<HTMLElement | null>,
	slideRootEl: Ref<HTMLElement | null>,
) {
	// ---------- dock 模式：定位状态 ----------
	const dockEdge = ref<PanelEdge>(props.edge === "auto" ? "right" : (props.edge ?? "right"));
	/** 沿吸附边方向的偏移（像素）；null 表示沿边居中 */
	const along = ref<number | null>(null);
	const dragPos = reactive({ active: false, left: 0, top: 0 });

	// ---------- dock 模式：拖拽吸附 ----------
	let dragStart = { x: 0, y: 0 };
	let dragRect: DOMRect | null = null;
	let dragging = false;

	function onGripDown(e: PointerEvent) {
		if (e.button !== 0) return;
		dragStart = { x: e.clientX, y: e.clientY };
		dragRect = rootEl.value?.getBoundingClientRect() ?? null;
		if (!dragRect) return;
		dragging = false;
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		e.preventDefault();
	}

	function onMove(e: PointerEvent) {
		const dx = e.clientX - dragStart.x;
		const dy = e.clientY - dragStart.y;
		if (!dragging && Math.hypot(dx, dy) > 4) dragging = true;
		if (!dragging) return;
		const rect = dragRect!;
		dragPos.active = true;
		dragPos.left = clamp(rect.left + dx, 0, window.innerWidth - rect.width);
		dragPos.top = clamp(rect.top + dy, 0, window.innerHeight - rect.height);
	}

	function onUp() {
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onCancel);
		if (dragging) {
			snapToEdge();
		} else {
			toggle();
		}
	}

	/** 指针被系统取消（如触摸手势被接管）：仅清理状态，不触发开关/吸附 */
	function onCancel() {
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onCancel);
		dragPos.active = false;
		dragging = false;
	}

	function snapToEdge() {
		const rect = rootEl.value?.getBoundingClientRect();
		if (!rect) return;
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const candidates: { edge: PanelEdge; d: number }[] = [
			{ edge: "top", d: cy },
			{ edge: "bottom", d: window.innerHeight - cy },
			{ edge: "left", d: cx },
			{ edge: "right", d: window.innerWidth - cx },
		];
		candidates.sort((a, b) => a.d - b.d);
		const target = candidates[0];
		dockEdge.value = target.edge;
		if (target.edge === "top" || target.edge === "bottom") {
			const left = clamp(cx - rect.width / 2, 8, window.innerWidth - rect.width - 8);
			along.value = Math.abs(left - (window.innerWidth - rect.width) / 2) < 40 ? null : left;
		} else {
			const top = clamp(rect.top, 8, window.innerHeight - rect.height - 8);
			along.value = Math.abs(top - (window.innerHeight - rect.height) / 2) < 40 ? null : top;
		}
		dragPos.active = false;
	}

	// ---------- 手动开关 ----------
	function toggle() {
		collapsed.value = !collapsed.value;
	}

	// ---------- 闲置自动收缩 ----------
	let autoTimer: number | undefined;

	function onMouseEnter() {
		if (autoTimer !== undefined) {
			window.clearTimeout(autoTimer);
			autoTimer = undefined;
		}
	}

	function onMouseLeave() {
		onMouseEnter();
		const delay = props.autoCollapseMs ?? 0;
		if (delay <= 0 || collapsed.value) return;
		autoTimer = window.setTimeout(() => {
			collapsed.value = true;
		}, delay);
	}

	// ---------- slide 模式：auto 自动选边 ----------
	const autoEdge = ref<PanelEdge>("right");
	/** slide 模式实际生效的边 */
	const slideEdge = computed<PanelEdge>(() =>
		props.edge === "auto" ? autoEdge.value : (props.edge ?? "right"),
	);

	function measureAutoEdge(retry = true) {
		const el = slideRootEl.value;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			// 布局尚未完成（如 grid 单元尺寸未定），下一帧重试一次
			if (retry) void nextTick(() => measureAutoEdge(false));
			return;
		}
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const candidates: { edge: PanelEdge; d: number }[] = [
			{ edge: "top", d: cy },
			{ edge: "bottom", d: window.innerHeight - cy },
			{ edge: "left", d: cx },
			{ edge: "right", d: window.innerWidth - cx },
		];
		candidates.sort((a, b) => a.d - b.d);
		autoEdge.value = candidates[0].edge;
	}

	/** resize 监听器：忽略事件参数，直接重新测量 */
	const handleResize = () => measureAutoEdge();

	// ---------- 生命周期 ----------
	onMounted(() => {
		if (props.mode === "slide" && props.edge === "auto") {
			measureAutoEdge();
			window.addEventListener("resize", handleResize);
		}
		const rect = rootEl.value?.getBoundingClientRect();
		if (!rect) return;
		if (props.initialOffset !== undefined) {
			const max =
				(props.edge ?? "right") === "top" || props.edge === "bottom"
					? window.innerWidth - rect.width - 8
					: window.innerHeight - rect.height - 8;
			along.value = clamp(props.initialOffset, 8, max);
			return;
		}
		if (props.initialAlign === "center") return;
		if (props.edge === "top" || props.edge === "bottom") {
			along.value =
				props.initialAlign === "start"
					? 8
					: Math.max(8, window.innerWidth - rect.width - 8);
		} else {
			along.value =
				props.initialAlign === "start"
					? 8
					: Math.max(8, window.innerHeight - rect.height - 8);
		}
	});

	onUnmounted(() => {
		onMouseEnter();
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onCancel);
		window.removeEventListener("resize", handleResize);
	});

	// ---------- dock 模式：样式 ----------
	const panelStyle = computed<CSSProperties>(() => {
		const base: CSSProperties = { zIndex: props.zIndex ?? 2000 };
		if (dragPos.active) {
			return { ...base, left: `${dragPos.left}px`, top: `${dragPos.top}px` };
		}
		switch (dockEdge.value) {
			case "top":
				return along.value == null
					? { ...base, left: "50%", top: "8px", transform: "translateX(-50%)" }
					: { ...base, left: `${along.value}px`, top: "8px" };
			case "bottom":
				return along.value == null
					? { ...base, left: "50%", bottom: "8px", transform: "translateX(-50%)" }
					: { ...base, left: `${along.value}px`, bottom: "8px" };
			case "left":
				return along.value == null
					? { ...base, left: "8px", top: "50%", transform: "translateY(-50%)" }
					: { ...base, left: "8px", top: `${along.value}px` };
			case "right":
				return along.value == null
					? { ...base, right: "8px", top: "50%", transform: "translateY(-50%)" }
					: { ...base, right: "8px", top: `${along.value}px` };
		}
	});

	/** dock 模式：收起按钮箭头方向（朝吸附边外侧） */
	const collapseRotate = computed(
		() => ({ top: 90, bottom: -90, left: 180, right: 0 })[dockEdge.value],
	);
	/** dock 模式：展开抓手箭头方向（朝屏幕内侧） */
	const expandRotate = computed(
		() => ({ top: -90, bottom: 90, left: 0, right: 180 })[dockEdge.value],
	);

	// ---------- slide 模式：图标 ----------
	const slideIconMap: Record<PanelEdge, { collapse: string; expand: string }> = {
		// 展开态箭头指向滑出方向（edge 方向），收起态箭头指向反方向
		right: { collapse: "angle-right", expand: "angle-left" },
		left: { collapse: "angle-left", expand: "angle-right" },
		/* top/bottom 用 chevron：angle-* 实心箭头在 viewBox 中水平偏移约 7%，chevron 完全居中 */
		top: { collapse: "chevron-up", expand: "chevron-down" },
		bottom: { collapse: "chevron-down", expand: "chevron-up" },
	};
	const slideCollapseIcon = computed(() => slideIconMap[slideEdge.value].collapse);
	const slideExpandIcon = computed(() => slideIconMap[slideEdge.value].expand);

	return {
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
	};
}

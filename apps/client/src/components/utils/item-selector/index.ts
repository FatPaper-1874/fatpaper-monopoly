// utils/item-selector/index.ts
import { createVNode, render, getCurrentInstance, type AppContext } from "vue";
import SelectorModal from "./selector-modal.vue";
import { GameEventType } from "@mine-monopoly/types";
import useEventBus from "@src/utils/event-bus";

interface SelectorOptions<T = any> {
	title?: string;
	itemList: Array<T>;
	keyName?: keyof T;
	multiple?: number | boolean;
	column?: number;
	selectedKey?: string[];
	appContext?: AppContext;
	confirmText?: string;
	cancelText?: string;
	content?: string | object;
	/** 当前游戏交互的唯一 ID；仅响应同一 ID 的超时事件。 */
	timeoutId?: string;
}

export function showItemSelector(options: SelectorOptions): Promise<string[]> {
	return new Promise((resolve, reject) => {
		// 1. 创建容器
		const container = document.createElement("div");

		// 2. 超时处理
		const handleTimeout = (payload?: { timeoutId?: string }) => {
			if (!options.timeoutId || payload?.timeoutId !== options.timeoutId) return;
			reject([]);
			destroy();
		};

		// 3. 准备 Props
		const props = {
			...options,
			// 监听组件抛出的 confirm 事件
			onConfirm: (result: string[]) => {
				resolve(result);
				destroy();
			},
			// 监听组件抛出的 cancel 事件
			onCancel: () => {
				reject("cancel");
				destroy();
			},
		};

		// 4. 创建虚拟节点
		const vnode = createVNode(SelectorModal, props);

		// 5. 关键步骤：继承应用上下文
		if (options.appContext) {
			vnode.appContext = options.appContext;
		} else {
			// 尝试自动获取（仅在 setup 期间调用有效）
			const currentInstance = getCurrentInstance();
			if (currentInstance) {
				vnode.appContext = currentInstance.appContext;
			}
		}

		// 6. 渲染
		render(vnode, container);
		document.body.appendChild(container);

		// 7. 打开弹窗
		if (vnode.component && vnode.component.exposed) {
			(vnode.component.exposed as any).init();
		}

		// 8. 注册超时事件监听
		useEventBus().on(GameEventType.TimeOut, handleTimeout);

		// 9. 销毁逻辑
		function destroy() {
			useEventBus().remove(GameEventType.TimeOut, handleTimeout);
			setTimeout(() => {
				render(null, container);
				document.body.removeChild(container);
			}, 350);
		}
	});
}

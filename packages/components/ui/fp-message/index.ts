type MessageOptions = {
	type: "info" | "success" | "warning" | "error";
	message: string;
	onClosed?: Function;
	delay?: number;
};

import fpMessageVue from "./fp-message.vue";
import { App, ComponentPublicInstance, createApp, ref, nextTick } from "vue";

// 扩展类型定义
interface FPMessageInstance extends ComponentPublicInstance {
	setVisible: (visible: boolean) => Promise<void>;
	setTop: (top: number) => void;
	getHeightPx: () => number;
}

let itemQueue = ref([] as Array<FPMessageInstance>);

function FPMessage(options: MessageOptions) {
	const fpMessage = createApp(fpMessageVue, options);
	showMessage(fpMessage, options.delay || 3000, options.onClosed);
}

function showMessage(app: App, delay: number, onClosedFn: Function | undefined) {
	const container = document.createDocumentFragment();
	const vm = app.mount(container) as FPMessageInstance;
	itemQueue.value.push(vm);

	const targetDocument = document.querySelector("#fpmessage-container") || document.body;
	targetDocument.appendChild(container);

	// v-show 隐藏时 offsetHeight 为 0；先显示并等待 DOM 更新，再按实际高度排布。
	nextTick(async () => {
		void vm.setVisible(true);
		await nextTick();
		updatePositions();
	});

	let timer: any = setTimeout(async () => {
		await hideMessage(app, vm);
		if (onClosedFn) onClosedFn();
		clearTimeout(timer);
		timer = -1;
	}, delay);
}

const hideMessage = async (app: App, vm: FPMessageInstance) => {
	await vm.setVisible(false);
	app.unmount();
	itemQueue.value = itemQueue.value.filter((item) => item !== vm);
	updatePositions();
};

// 获取当前 1rem 对应的像素值
function getRemBase() {
	if (typeof window === "undefined") return 16;
	// 获取 html 根元素的 fontSize
	const fontSize = getComputedStyle(document.documentElement).fontSize;
	return parseFloat(fontSize) || 16;
}

// 核心计算逻辑
function updatePositions() {
	const remBase = getRemBase(); // 获取当前的 rem 基准值
	const startTop = 1.2; // 起始距离 (rem)
	const gap = 1.2; // 间距 (rem)

	let currentTop = startTop;

	itemQueue.value.forEach((vm) => {
		// 设置当前元素的 top (rem)
		vm.setTop(currentTop);

		// 计算当前元素的高度 (转换 px -> rem)
		const heightPx = vm.getHeightPx();
		const heightRem = heightPx / remBase;

		// 累加：当前位置 + 元素高度 + 间距
		currentTop += heightRem + gap;
	});
}

export default FPMessage;

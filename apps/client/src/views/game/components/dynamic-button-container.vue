<template>
	<div class="dynamic-button-container" :class="layoutClass" v-show="visibleButtonsList.length > 0">
		<DynamicButton v-for="button in visibleButtonsList" :key="button.id" :config="button" @click="handleButtonClick" />
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import {
	ButtonConfig,
	ButtonRegisterMessage,
	ButtonStateChangedMessage,
	ButtonRemoveMessage,
} from "@mine-monopoly/types";
import useEventBus from "@src/utils/event-bus";
import DynamicButton from "./dynamic-button.vue";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import { useUtil } from "@src/store";

interface Props {
	playerId: string;
	layout?: "horizontal" | "vertical";
}

const props = withDefaults(defineProps<Props>(), {
	layout: "horizontal",
});

const buttons = ref<ButtonConfig[]>([]);
const eventBus = useEventBus();
const utilStore = useUtil();

const visibleButtonsList = computed(() => {
	return buttons.value.filter((b) => b.visible);
});

const layoutClass = computed(() => {
	return `layout-${props.layout}`;
});

// 根据回合状态调整按钮启用状态
const updateButtonsEnabledState = () => {
	const canRoll = utilStore.canRoll;

	buttons.value.forEach((button) => {
		// 只有在自己回合(canRoll = true)时，按钮才能使用
		button.enabled = canRoll;
	});

	// 触发响应式更新
	buttons.value = [...buttons.value];
};

// 监听 canRoll 状态变化
watch(
	() => utilStore.canRoll,
	() => {
		updateButtonsEnabledState();
	},
);

// 事件处理器
const handleButtonRegister = (message: ButtonRegisterMessage) => {
	const button: ButtonConfig = {
		id: message.buttonId,
		playerId: props.playerId,
		text: message.text,
		enabled: message.enabled && utilStore.canRoll, // 结合服务器状态和回合状态
		visible: message.visible,
		callback: () => {},
	};

	// 初始注册和 __sync__ 可能同时到达，按 ID 更新，避免重复按钮。
	const existingIndex = buttons.value.findIndex((item) => item.id === message.buttonId);
	if (existingIndex >= 0) {
		buttons.value.splice(existingIndex, 1, button);
	} else {
		buttons.value.push(button);
	}
	buttons.value = [...buttons.value];
};

const handleButtonStateChanged = (message: ButtonStateChangedMessage) => {
	const button = buttons.value.find((b) => b.id === message.buttonId);
	if (button) {
		if (message.enabled !== undefined) {
			// 服务器设置的 enabled 状态需要结合 canRoll 来决定最终状态
			button.enabled = message.enabled && utilStore.canRoll;
		}
		if (message.visible !== undefined) {
			button.visible = message.visible;
		}
		if (message.text !== undefined) {
			button.text = message.text;
		}
		buttons.value = [...buttons.value];
	}
};

const handleButtonRemove = (message: ButtonRemoveMessage) => {
	const index = buttons.value.findIndex((b) => b.id === message.buttonId);
	if (index !== -1) {
		buttons.value.splice(index, 1);
	}
};

const handleButtonClick = (buttonId: string) => {
	const socketClient = useMonopolyClient();
	if (socketClient) {
		socketClient.sendDynamicButtonClick(buttonId);
	}
};

const syncButtons = () => {
	try {
		useMonopolyClient().sendDynamicButtonClick("__sync__");
	} catch (error) {
		console.error("[DynamicButtonContainer] 请求同步按钮失败:", error);
	}
};

// 当前控制玩家变化时，清理上一位玩家的按钮并重新同步。
watch(
	() => props.playerId,
	() => {
		buttons.value = [];
		syncButtons();
	},
);

// 生命周期
onMounted(() => {
	// 注册事件监听器

	eventBus.on("button:register", handleButtonRegister);
	eventBus.on("button:state-changed", handleButtonStateChanged);
	eventBus.on("button:remove", handleButtonRemove);

	// 初始化按钮状态，并立即同步一次。
	// 组件可能在 game:init-finished 事件之后才挂载，不能只依赖 once 监听。
	updateButtonsEnabledState();
	syncButtons();

	// 游戏初始化完成后再同步一次，覆盖 Worker/UI 的初始化时序差异。
	eventBus.once("game:init-finished", () => {
		syncButtons();
		updateButtonsEnabledState();
	});
});

onUnmounted(() => {
	eventBus.remove("button:register", handleButtonRegister);
	eventBus.remove("button:state-changed", handleButtonStateChanged);
	eventBus.remove("button:remove", handleButtonRemove);
	buttons.value = [];
});
</script>

<style scoped>
.dynamic-button-container {
  max-width: 10rem;
	display: flex;
	gap: 0.5rem;
	z-index: var(--z-ui);
}

.dynamic-button-container.layout-horizontal {
	flex-direction: row;
	justify-content: flex-end;
	align-items: center;
}

.dynamic-button-container.layout-vertical {
	flex-direction: column;
	justify-content: flex-start;
	align-items: flex-end;
	max-height: 8.2rem;
	overflow-y: auto;
	overflow-x: hidden;
	padding-right: 0.4rem; /* 给滚动条留一点空间 */
  padding-bottom: 0.2rem;
}

/* 自定义滚动条样式 */
.dynamic-button-container.layout-vertical::-webkit-scrollbar {
	width: 0.25rem;
}

.dynamic-button-container.layout-vertical::-webkit-scrollbar-track {
	background: var(--fp-color-bg-light);
	border-radius: 0.125rem;
}

.dynamic-button-container.layout-vertical::-webkit-scrollbar-thumb {
	background: var(--fp-color-tertiary);
	border-radius: 0.125rem;
}

.dynamic-button-container.layout-vertical::-webkit-scrollbar-thumb:hover {
	background: var(--fp-color-secondary);
}
</style>

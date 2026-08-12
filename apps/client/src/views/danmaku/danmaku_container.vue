<script setup lang="ts">
import { useChat, useSettig } from "@src/store";
import { ChatMessage } from "@mine-monopoly/types";
import DanmakuItem from "@src/views/danmaku/components/danmaku_item.vue";
import { reactive, watch } from "vue";

const chatStore = useChat();
const settingStore = useSettig();

const messageQueue = reactive<ChatMessage[]>([]);

watch(
	() => chatStore.newMessage,
	(newMessage) => {
		if (settingStore.chatRenderMode !== "danmaku") return;
		newMessage && messageQueue.push(newMessage);
	},
);

watch(
	() => settingStore.chatRenderMode,
	(mode) => {
		if (mode !== "danmaku") {
			messageQueue.splice(0, messageQueue.length);
		}
	},
);

function handleEnter(el: Element, done: () => void) {
	const id = el.getAttribute("data-message_id");
	const index = messageQueue.findIndex((m) => m.id === id);
	if (index >= 0) messageQueue.splice(index, 1);
}

/** 离场固定短时长，避免长消息按进入时长再滑出一次（总时长 ≈ 进入时长 + 2s） */
function handleLeave(el: Element) {
	(el as HTMLElement).style.transitionDuration = "2s";
}

function randomHeight() {
	return Math.random() * 60 + "%";
}

/**
 * 弹幕时长按消息长度自适应：短消息快、长消息慢，保证能读完。
 * 约每秒 12 个字符，夹在 3~14 秒之间。
 */
function messageDuration(content: string): number {
	return Math.min(14, Math.max(3, 3 + content.length / 12));
}
</script>

<template>
	<div class="danmaku_container">
		<TransitionGroup @enter="handleEnter" @leave="handleLeave" name="danmaku">
			<DanmakuItem
				:style="{
					top: randomHeight(),
					transitionDuration: messageDuration(message.content) + 's',
				}"
				:data-message_id="message.id"
				class="danmaku_item"
				v-for="message in messageQueue"
				:key="message.id"
				:message="message"
			/>
		</TransitionGroup>
	</div>
</template>

<style scoped lang="scss">
.danmaku_container {
	position: absolute;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	z-index: var(--z-danmaku);
	pointer-events: none;
}

/* 兜底时长：实际按消息长度自适应（行内 transitionDuration 覆盖），离场由 handleLeave 固定 2s */
.danmaku-enter-active,
.danmaku-leave-active {
	transition: all 6s linear;
}

.danmaku-enter-from {
	transform: translateX(100vw);
}
</style>

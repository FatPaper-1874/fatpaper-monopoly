<template>
	<CollapsiblePanel
		v-model:collapsed="collapsed"
		mode="slide"
		edge="bottom"
		z-index="var(--z-ui)"
		class="game-buttons-panel"
	>
		<div class="panel-body">
			<div class="panel-title" v-if="title && !spectatorMode">{{ title }}</div>
			<div v-if="spectatorMode" class="panel-message">{{ spectatorMessage }}</div>
			<div class="panel-content" v-show="!spectatorMode">
				<DynamicButtonContainer :player-id="playerId" layout="vertical" />
				<Dices @click="$emit('rollDice')"></Dices>
			</div>
		</div>
	</CollapsiblePanel>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import DynamicButtonContainer from "./dynamic-button-container.vue";
import Dices from "./dices.vue";
import { CollapsiblePanel } from "@src/components/collapsible-panel";
import useEventBus from "@src/utils/event-bus";

interface Props {
	playerId: string;
	title?: string;
	spectatorMessage?: string;
}

const props = withDefaults(defineProps<Props>(), {
	title: "",
	spectatorMessage: "",
});
/** 面板折叠状态：默认展开，轮到自己回合时由事件自动展开 */
const collapsed = ref(false);
const spectatorMode = computed(() => !!props.spectatorMessage);
defineEmits<{
	rollDice: [];
}>();

/** 回合玩家变化：轮到自己时展开折叠的操作面板；已展开则无需处理 */
function handleCurrentPlayerChange(newPlayerId: string) {
	if (newPlayerId === props.playerId && !spectatorMode.value && collapsed.value) {
		collapsed.value = false;
	}
}

onMounted(() => {
	useEventBus().on("game-currentPlayerIdInRound", handleCurrentPlayerChange);
});

onUnmounted(() => {
	useEventBus().remove("game-currentPlayerIdInRound", handleCurrentPlayerChange);
});
</script>

<style lang="scss" scoped>
/* slide 模式：定位由宿主提供 */
.game-buttons-panel {
	position: absolute;
	right: 1rem;
	bottom: 1rem;
	z-index: var(--z-ui);
}

.panel-body {
	/* 卡片背景随内容一起滑出/收起 */
	display: flex;
	flex-direction: column;
	gap: 0.5rem;

	/* 使用纹理背景 + 颜色 */
	background-color: #ffffff;
	background-image: var(--fp-texture-felt);
	background-repeat: repeat;
	border-radius: 1.5rem;

	/* 内边距 */
	padding: 1.2rem;
	padding-top: 1rem;
	box-shadow:
		var(--fp-shadow-depth),
		0 0 0 0.1875rem rgba(0, 0, 0, 0.05);
}

.panel-title {
	font-size: 0.9rem;
	color: var(--fp-color-text-secondary);
	text-align: center;
	margin-bottom: 0.6rem;
	white-space: nowrap;
}

.panel-content {
	display: inline-flex;
	flex-direction: row;
	gap: 0.8rem;
}

.panel-message {
	max-width: 14rem;
	line-height: 1.5;
	color: var(--fp-color-text-secondary);
	text-align: left;
}
</style>

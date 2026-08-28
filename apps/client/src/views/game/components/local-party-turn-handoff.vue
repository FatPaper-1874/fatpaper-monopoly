<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ visible: boolean; playerName: string }>();
const emit = defineEmits<{ continue: [] }>();

// 仅在当前游戏会话内生效，重新进入游戏后会恢复显示。
const skipForGame = ref(false);
const displayVisible = ref(props.visible);

watch(
	() => props.visible,
	(visible) => {
		if (!visible) {
			displayVisible.value = false;
			return;
		}

		if (skipForGame.value) {
			// 隐藏提示时仍要完成交接，否则本地派对会一直停留在等待状态。
			displayVisible.value = false;
			emit("continue");
			return;
		}

		displayVisible.value = true;
	},
);

function handleContinue() {
	displayVisible.value = false;
	emit("continue");
}
</script>

<template>
	<Teleport to="body">
		<div v-if="displayVisible" class="local-party-turn-handoff" role="dialog" aria-modal="true" @click="handleContinue">
			<div class="handoff-card" @click.stop>
				<p class="handoff-kicker">本地派对 · 交接设备</p>
				<h2>轮到 {{ playerName || "下一位玩家" }} 的回合</h2>
				<p>请将设备交给该玩家，确认后才能继续操作。</p>
				<div
					class="skip-handoff"
					:class="{ 'is-checked': skipForGame }"
					role="checkbox"
					:aria-checked="skipForGame"
					tabindex="0"
					@click="skipForGame = !skipForGame"
					@keydown.enter.prevent="skipForGame = !skipForGame"
					@keydown.space.prevent="skipForGame = !skipForGame"
				>
					<div class="skip-handoff-box" aria-hidden="true"></div>
					<span>本局不再显示此提示</span>
				</div>
				<button type="button" class="handoff-button" @click="handleContinue">开始回合</button>
			</div>
		</div>
	</Teleport>
</template>

<style scoped lang="scss">
@use "@src/assets/variables" as *;

.local-party-turn-handoff {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: grid;
	place-items: center;
	padding: 1.5rem;
	background: rgba(10, 18, 32, 0.78);
	backdrop-filter: blur(8px);
}
.handoff-card {
	@include felt-patch(var(--fp-color-bg-light));
	width: min(28rem, 100%);
	text-align: center;
	padding: 2rem;
	color: #1f2937;
}
.handoff-kicker {
	margin: 0;
	color: var(--fp-color-secondary, #3b82f6);
	font-weight: 700;
}
h2 {
	margin: 0.75rem 0;
	font-size: 1.7rem;
}
p {
	line-height: 1.6;
}
.skip-handoff {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	margin-top: 1.25rem;
	color: #4b5563;
	font-size: 0.95rem;
	cursor: pointer;
}
.skip-handoff-box {
	position: relative;
	width: 1.25rem;
	height: 1.25rem;
	box-sizing: border-box;
	border: 2px solid #9ca3af;
	border-radius: 0.3rem;
	background: #fff;
}
.skip-handoff.is-checked .skip-handoff-box {
	border-color: var(--fp-color-primary, #2563eb);
	background: var(--fp-color-primary, #2563eb);
}
.skip-handoff.is-checked .skip-handoff-box::after {
	position: absolute;
	top: 50%;
	left: 50%;
	width: 0.32rem;
	height: 0.62rem;
	border: solid #fff;
	border-width: 0 2px 2px 0;
	content: "";
	transform: translate(-50%, -60%) rotate(45deg);
}
.skip-handoff:focus-visible {
	outline: 2px solid var(--fp-color-primary, #2563eb);
	outline-offset: 0.25rem;
	border-radius: 0.25rem;
}
.handoff-button {
	width: 100%;
	margin-top: 1rem;
	padding: 0.85rem 1rem;
	border: 0;
	border-radius: 0.7rem;
	background: var(--fp-color-primary, #2563eb);
	color: white;
	font-size: 1.1rem;
	font-weight: 700;
	cursor: pointer;
}
</style>

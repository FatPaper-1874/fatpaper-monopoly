<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { useRoomInfo } from "@src/store";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";

const route = useRoute();
const roomInfoStore = useRoomInfo();

const saving = ref(false);

const isOwner = computed(() => roomInfoStore.amIRoomOwner);
const isInGame = computed(() => route.name === "game");

async function handleSave() {
	saving.value = true;
	try {
		const client = useMonopolyClient();
		if (client) {
			client.requestSave();
		}
	} catch (e: any) {
		console.error("保存失败:", e);
	} finally {
		setTimeout(() => {
			saving.value = false;
		}, 1000);
	}
}
</script>

<template>
	<button v-if="isOwner && isInGame" @click="handleSave" class="save-button btn-small" :disabled="saving" title="保存游戏">
		<FontAwesomeIcon v-if="!saving" icon="floppy-disk" />
		<FontAwesomeIcon v-else icon="spinner" spin />
	</button>
</template>

<style lang="scss" scoped>
@use "@src/assets/variables" as *;
@use "@mine-monopoly/style/variables" as fp;

.save-button {
	height: 2.5rem;
	width: 2.5rem;
	border-radius: 0.5rem;
	font-size: 1.1rem;
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 0.4rem;
	// 使用默认 --btn-bg，box-shadow 已在 ui.scss 中自适应

	&:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
}
</style>

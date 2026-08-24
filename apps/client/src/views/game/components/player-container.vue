<script setup lang="ts">
import { useGameData } from "@src/store/game";
import { computed, ref } from "vue";
import PlayerCard from "./player-card.vue";
import { PlayerInfo } from "@mine-monopoly/types";
import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
import PlayerDetail from "./player-detail.vue";
import { CollapsiblePanel } from "@src/components/collapsible-panel";

const gameInfoStore = useGameData();
const _playersList = computed(() => gameInfoStore.players);
const playerDetailVisiable = ref(false);
const currentPlayer = ref<PlayerInfo | null>(null);
const roundTurnPlayerId = computed(() => gameInfoStore.currentPlayerIdInRound);

function handleShowPlayerDetail(player: PlayerInfo) {
	currentPlayer.value = player;
	playerDetailVisiable.value = true;
}
</script>

<template>
	<FpDialog :style="'width: 70%; height: 70%;'" v-model:visible="playerDetailVisiable">
		<template #title>
			<div class="title">{{ currentPlayer?.user.username }}的底细</div>
		</template>

		<PlayerDetail #default v-if="currentPlayer" :player="currentPlayer" />
	</FpDialog>

	<CollapsiblePanel
		mode="slide"
		edge="right"
		z-index="var(--z-ui)"
		class="player-container"
	>
		<div class="player-list">
			<div class="tips">点击玩家卡片查看底细</div>
			<PlayerCard
				:id="`player-card-${player.id}`"
				@click="handleShowPlayerDetail(player)"
				v-for="player in _playersList"
				:key="player.id"
				:player="player"
				:round-mark="player.id === roundTurnPlayerId"
			></PlayerCard>
		</div>
	</CollapsiblePanel>
</template>

<style lang="scss" scoped>
/* slide 模式：定位由宿主提供 */
.player-container {
	position: absolute;
	top: 4.2rem;
	right: 0;
	margin-right: 0.8rem;
	z-index: var(--z-ui);
}

.player-list {
	padding: .2rem;
	display: flex;
	flex-direction: column;
	justify-content: space-around;
	align-items: center;
	max-height: calc(100vh - 5rem);
	overflow-y: auto;

	& > .tips {
		width: 100%;
		background-color: rgba(255, 255, 255, 0.75);
		padding: 0.3rem;
		border-radius: 0.5rem;
		color: var(--fp-color-primary);
		padding: 0.3rem 0.6rem;
		box-sizing: border-box;
		text-shadow: var(--fp-text-shadow-surround-white);
		margin-bottom: 0.3rem;
		text-align: center;
	}
}
</style>

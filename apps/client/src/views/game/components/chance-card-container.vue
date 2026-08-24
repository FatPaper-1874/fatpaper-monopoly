<script setup lang="ts">
import { useSettig } from "@src/store";
import { getCurrentClientPlayerId } from "@src/store/local-party";
import { computed, provide, ref, watch, toRaw } from "vue";
import { ChanceCard } from "@mine-monopoly/ui";
import { useUtil } from "@src/store";
import { useGameData, useResourceStore } from "@src/store/game";
import { ChanceCardClientInfo, TargetSelectType } from "@mine-monopoly/types";
import { showTargetSelector } from "@src/components/common/target-seletor";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";

const gameInfoStore = useGameData();

const utilStore = useUtil();
const settingStore = useSettig();

const _chanceCardsList = computed(() => {
	const player = gameInfoStore.players.find((player) => player.id === getCurrentClientPlayerId());
	if (player) {
		return player.chanceCards;
	} else {
		return [];
	}
});

// 性能说明：此函数在模板中调用，Vue 会在每个卡片实例中创建独立的 computed 缓存
// 如果未来发现性能问题，可以考虑在父组件中预计算所有图标的 Map
const getIconUrl = (card: ChanceCardClientInfo) => {
	const resource = useResourceStore().getRecourceById(card.iconId);
	return resource ? resource.url : "";
};

const _canUseChanceCard = computed(() => utilStore.canUseCard);

async function handleChanceCardClick(card: ChanceCardClientInfo) {
	if (!utilStore.canUseCard) return;
	showTargetSelector(card.type, {
		title: `使用机会卡: “${card.name}”`,
		confirmText: "使用",
		cancelText: "取消",
	})
		.then((target) => {
			// 确保只有在用户确认时才使用卡片
			if (target && target.length > 0) {
				useMonopolyClient().useChanceCard(card.id, Array.from(toRaw(target)));
			}
		})
		.catch(() => {
			// 用户取消操作，不需要处理
		});
}
</script>

<template>
	<div class="chance-card-container" :style="{ '--num': _chanceCardsList.length }">
		<div v-show="utilStore.canUseCard" class="tips">点击卡片使用机会卡</div>
		<TransitionGroup name="card">
			<ChanceCard
				@click="handleChanceCardClick(card)"
				class="chance-card-item"
				v-for="card in _chanceCardsList"
				:key="card.id"
				:chance-card="card"
				:icon-url="getIconUrl(card)"
				:disable="!_canUseChanceCard"
			/>
		</TransitionGroup>
	</div>
</template>

<style lang="scss" scoped>
.card-enter-active,
.card-leave-active {
	transition: all 0.5s ease;
}

.card-enter-from,
.card-leave-to {
	opacity: 0;
	transform: translateY(-50rem);
}

.chance-card-container {
	font-size: 1.2rem;
	width: 10rem;
	height: 15rem;
	display: flex;
	justify-content: space-around;
	padding: 0.8rem;
	position: absolute;
	left: 50%;
	bottom: 0;
	transform: translateX(-50%);
	z-index: var(--z-ui);

	$n: 5;
	@for $i from 1 through $n {
		$r: calc(($i - ($n / 2 + 1)) * 6deg);
		.chance-card-item:nth-child(#{$i}) {
			transform: rotate($r);

			&:hover {
				transform: translateY(-1rem) rotate($r);
			}
		}
	}

	.chance-card-item {
		position: absolute;
		transform-origin: center 90rem;
	}

	& > .tips {
		background-color: rgba(0, 0, 0, 0.25);
		opacity: 0.5;
		padding: 0.3rem;
		border-radius: 0.5rem;
		color: var(--fp-color-primary);
		padding: 0.3rem 0.6rem;
		box-sizing: border-box;
		text-shadow: var(--fp-text-shadow-surround-white);
		margin-bottom: 0.3rem;
		position: absolute;
		bottom: 0;
		z-index: 1;
		text-wrap: nowrap;
	}

	//& > .bg {
	//  position: absolute;
	//  left: 0;
	//  bottom: 0;
	//  width: 100%;
	//  height: 30%;
	//  background-color: var(--fp-color-secondary);
	//  border: 0.4rem solid rgba(255, 255, 255, 0.5);
	//  border-radius: 0.8rem 0.8rem 0 0;
	//  border-bottom: 0;
	//  z-index: -1;
	//  backdrop-filter: blur(0.13rem);
	//  pointer-events: none;
	//}
}
</style>

<script setup lang="ts">
import { ref } from "vue";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import { useUserInfo } from "@src/store";
import router from "@src/router";
import { FPMessage } from "@mine-monopoly/ui";
import { __FATPAPER_HOST__, __ICE_SERVER_PORT__ } from "@src/../global.config";

const panelElement = ref<HTMLElement | null>(null);

defineExpose({ panelElement });

async function handleCreateLocalParty() {
	try {
		const monopolyClient =
			useMonopolyClient() ??
			(await useMonopolyClient({
				iceServer: {
					host: __FATPAPER_HOST__,
					port: __ICE_SERVER_PORT__,
				},
			}));
		await monopolyClient.createLocalParty(useUserInfo().username || "本地玩家1");
		router.push({ name: "room" });
	} catch (error: any) {
		FPMessage({ type: "error", message: error?.message || "创建本地派对失败" });
	}
}
</script>

<template>
	<section ref="panelElement" class="mode-page party-mode">
		<div class="title">派对模式</div>
		<div class="describe">
			·在同一台设备上创建本地派对，和身边的朋友一起游戏。<br />
			·玩家轮流操作同一设备，按回合进行游戏。<br />
		</div>
		<div class="enter-container">
			<div class="party-party"></div>
			<button type="button" class="local-party-button" @click="handleCreateLocalParty">开启本地派对</button>
		</div>
	</section>
</template>

<style lang="scss" scoped>
@use "@src/assets/variables" as *;

.party-mode {
	@include felt-patch(#ffedb7);
	padding: 1.8rem;
	width: max-content;
	border-radius: 2rem;

	.title {
		display: inline-block;
		font-size: 1.6rem;
		color: var(--fp-color-primary);
		margin-bottom: 0.7rem;
		background-color: rgba(255, 255, 255, 0.45);
		padding: 0.4rem 0.8rem;
		border-radius: 1rem;
	}

	.describe {
		font-size: 0.9rem;
		color: #393939;
		margin-bottom: 0.8rem;
		padding-left: 0.8rem;
	}

	.enter-container {
		display: flex;
		justify-content: space-between;

		.party-party {
			flex: 1;
			border-radius: 1rem;
			background-color: rgba(255, 255, 255, 0.3);
			display: flex;
			justify-content: center;
			align-items: center;
			color: #d3d3d3;
			font-size: 1.5rem;
		}
	}

	& button {
		margin-left: 0.5rem;
		border-radius: 0.7rem;
		height: 3rem;
	}
}
</style>

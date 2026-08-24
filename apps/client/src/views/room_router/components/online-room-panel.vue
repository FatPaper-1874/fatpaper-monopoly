<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import FpPopover from "@src/components/utils/fp-popover/fp-popover.vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import { useLoading } from "@src/store";
import { FPMessage } from "@mine-monopoly/ui";
import { __FATPAPER_HOST__, __ICE_SERVER_PORT__ } from "@src/../global.config";
import { getRandomPublicRoom } from "@src/utils/api/room-router";

const panelElement = ref<HTMLElement | null>(null);
const roomId = ref("");
const randomRoomButtonDisable = ref(false);
let randomRoomButtonTimer: ReturnType<typeof setTimeout> | undefined;

defineExpose({ panelElement });

onBeforeUnmount(() => {
	if (randomRoomButtonTimer) clearTimeout(randomRoomButtonTimer);
});

async function handleJoinRoom() {
	if (!roomId.value) {
		FPMessage({ type: "error", message: "请输入房间号" });
		return;
	}
	await joinRoom(roomId.value);
}

async function joinRoom(id: string): Promise<boolean> {
	// MonopolyClient.joinRoom 内部已吞掉错误并弹提示，这里只负责加载态与结果透传
	try {
		const monopolyClient = await useMonopolyClient({
			iceServer: {
				host: __FATPAPER_HOST__,
				port: __ICE_SERVER_PORT__,
			},
		});
		useLoading().showLoading("正在加入房间...");
		return await monopolyClient.joinRoom(id);
	} finally {
		useLoading().hideLoading();
	}
}

async function handleGetRandomPublicRoom() {
	if (randomRoomButtonTimer) clearTimeout(randomRoomButtonTimer);
	randomRoomButtonDisable.value = true;
	randomRoomButtonTimer = setTimeout(() => {
		randomRoomButtonDisable.value = false;
		randomRoomButtonTimer = undefined;
	}, 1000);

	try {
		const res = await getRandomPublicRoom();
		if ((res as any).roomId) {
			FPMessage({ type: "success", message: "遇到等待的小伙伴了呢!" });
			const ok = await joinRoom((res as any).roomId);
			if (!ok) {
				// 随机抽中的房间可能刚被关闭/过期：自动换一个房间再试一次
				FPMessage({ type: "warning", message: "该房间刚关闭，正在为你寻找其他房间…" });
				const retry = await getRandomPublicRoom();
				if ((retry as any).roomId) {
					await joinRoom((retry as any).roomId);
				} else {
					FPMessage({ type: "error", message: "暂时没有可加入的公开房间" });
				}
			}
		} else {
			FPMessage({ type: "error", message: "现在没有公开的房间喔" });
		}
	} catch (error: any) {
		FPMessage({ type: "error", message: error.message || error });
	}
}
</script>

<template>
	<section ref="panelElement" class="mode-page join-room">
		<div class="title">联机房间</div>
		<div class="describe">
			·输入房间号可加入房间，第一个使用房间号的将成为主机(房主)<br />
			·建议使用稍微复杂的房间号(防止误入别人的房间)<br />
		</div>
		<form @submit.prevent="handleJoinRoom">
			<input v-model="roomId" maxlength="12" type="text" placeholder="房间号(1-12个字符)" />
			<button type="submit">加入/创建房间</button>
			<FpPopover placement="bottom">
				<template #default>
					<button
						type="button"
						class="random-room-button"
						:disabled="randomRoomButtonDisable"
						@click="handleGetRandomPublicRoom"
					>
						<FontAwesomeIcon :icon="randomRoomButtonDisable ? 'hourglass-half' : 'shuffle'" />
					</button>
				</template>
				<template #content>
					<div class="tips">寻找随机的公开房间</div>
				</template>
			</FpPopover>
		</form>
	</section>
</template>

<style lang="scss" scoped>
@use "@src/assets/variables" as *;

.join-room {
	@include felt-patch(#ffedb7);
	padding: 1.8rem;
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

	& form {
		display: flex;
		justify-content: space-around;

		& .random-room-button {
			width: 3rem;
			padding: 0 0.6rem;
		}

		& .tips {
			width: max-content;
			font-size: 1.1rem;
			border-radius: 0.7rem;
			padding: 0.2rem;
			color: var(--fp-color-primary);
			text-shadow: var(--fp-text-shadow);
		}
	}

	& input {
		height: 3rem;
		flex: 1;
	}

	& button {
		margin-left: 0.5rem;
		border-radius: 0.7rem;
		height: 3rem;
	}
}
</style>
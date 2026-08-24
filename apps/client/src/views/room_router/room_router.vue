<script setup lang="ts">
import { onBeforeMount, onMounted, computed, ref, onUpdated, nextTick } from "vue";
import { useUserInfo, useUserList, useRoomList, useRoomInfo, useLoading } from "@src/store";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import userCard from "@src/components/common/user-card.vue";
import router from "@src/router";
import { FPMessage } from "@mine-monopoly/ui";
import { __FATPAPER_HOST__, __ICE_SERVER_PORT__ } from "@src/../global.config";
import LoginExtra from "@src/views/login/components/login-extra.vue";
import FpPopover from "@src/components/utils/fp-popover/fp-popover.vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { getRandomPublicRoom } from "@src/utils/api/room-router";
import { ensureValidAuth } from "@src/utils/api";
import { throttle } from "@src/utils";
import { useResourceStore } from "@src/store/game";
import FpErrorBoundary from "@src/components/utils/fp-error-boundary/index.vue";
import HeroTitle from "@src/components/hero-title";
import gsap from "gsap";

const userInfoStore = useUserInfo();
const userListStore = useUserList();
const roomListStore = useRoomList();

const user = computed(() => userInfoStore);
const roomId = ref("");
const roomRouterRef = ref<HTMLElement | null>(null);

onMounted(async () => {
	// 入场动画
	nextTick(() => {
		if (!roomRouterRef.value) return;

		const userContainer = roomRouterRef.value.querySelector(".user-container");
		const joinRoom = roomRouterRef.value.querySelector(".right-container");

		if (!userContainer || !joinRoom) return;

		// 创建 timeline
		const tl = gsap.timeline({ defaults: { ease: "back.out(1.5)" } });

		// 1. 左边容器弹出
		tl.fromTo(userContainer, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4 });

		// 2. 左边容器内容依次弹出
		tl.fromTo(
			userContainer.querySelectorAll(":scope > *"),
			{ y: 20, opacity: 0 },
			{ y: 0, opacity: 1, stagger: 0.1, duration: 0.3 },
		);

		// 3. 右边容器弹出
		tl.fromTo(joinRoom, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4 });

		// 4. 右边容器内容依次弹出
		tl.fromTo(
			joinRoom.querySelectorAll(":scope > *"),
			{ y: 20, opacity: 0 },
			{ y: 0, opacity: 1, stagger: 0.1, duration: 0.3 },
		);
	});
	// 清除缓存
	useResourceStore().clear();
	roomListStore.$reset();
	if (!userInfoStore.hasUserInfo()) {
		useLoading().showLoading("读取用户信息中");
		let token = localStorage.getItem("token") || "";
		if (token) {
			//账号登录 先尝试刷新 token，避免过期导致 401 重复提示
			const userData = await ensureValidAuth();
			if (userData) {
				const { id: userId, useraccount, username, avatar, color } = userData;
				const userInfoStore = useUserInfo();
				userInfoStore.$patch({ userId, useraccount, username, avatar, color });
				useLoading().hideLoading();
				return;
			} else {
				useLoading().hideLoading();
				handleLogout();
				return;
			}
		}
		let userInfo = localStorage.getItem("user") || "";
		if (userInfo) {
			//游客登录
			try {
				const { userId, useraccount = "", username, avatar = "", color } = JSON.parse(userInfo);
				const userInfoStore = useUserInfo();
				userInfoStore.$patch({ userId, useraccount, username, avatar, color });
				useLoading().hideLoading();
				return;
			} catch (e: any) {
				FPMessage({ type: "error", message: "读取用户信息失败, 请重新进行游客登记" });
				handleLogout();
			}
		}
		handleLogout();
	}
});

function handleLogout() {
	localStorage.removeItem("token");
	localStorage.removeItem("user");
	router.replace({ name: "login" });
}

async function handleJoinRoom(e: Event) {
	e.preventDefault();
	const _roomId = roomId.value;
	if (!_roomId) {
		FPMessage({ type: "error", message: "请输入房间号" });
		return;
	}
	await joinRoom(_roomId);
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

const randomRoomButtonDisable = ref(false);
let interval: any;
async function handleGetRandomPublicRoom(e: Event) {
	e.preventDefault();
	if (interval) clearInterval(interval);
	randomRoomButtonDisable.value = true;
	interval = setInterval(() => {
		randomRoomButtonDisable.value = false;
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
	} catch (e: any) {
		FPMessage({ type: "error", message: e.message || e });
	}
}
</script>

<template>
	<FpErrorBoundary>
		<LoginExtra></LoginExtra>
		<div class="hall-page">
			<HeroTitle text="Mine Monopoly" />
			<div class="room-router" ref="roomRouterRef">
				<div class="user-container">
					<userCard :avatar="user.avatar" :username="user.username" :color="user.color" />

					<div class="side-bar">
						<button class="quit btn-small" @click="handleLogout">登出</button>
					</div>
				</div>
				<div class="right-container">
					<div class="join-room">
						<div class="title">游戏大厅</div>
						<div class="describe">
							·输入房间号可加入房间，第一个使用房间号的将成为主机(房主)<br />
							·建议使用稍微复杂的房间号(防止误入别人的房间)<br />
						</div>
						<form @submit="handleJoinRoom">
							<input maxlength="12" v-model="roomId" type="text" placeholder="房间号(1-12个字符)" />
							<button type="submit">加入/创建房间</button>
							<FpPopover placement="bottom">
								<template #default>
									<button
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
					</div>

					<div class="party-mode">
						<div class="title">游戏大厅</div>
						<div class="describe">
							·输入房间号可加入房间，第一个使用房间号的将成为主机(房主)<br />
							·建议使用稍微复杂的房间号(防止误入别人的房间)<br />
						</div>
						<button type="button" class="local-party-button" @click="handleCreateLocalParty">本地派对</button>
					</div>
				</div>
			</div>
		</div>
	</FpErrorBoundary>
</template>

<style lang="scss" scoped>
@use "@src/assets/variables" as *;
@use "@mine-monopoly/style/variables" as fp;
.hall-page {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	justify-content: space-around;
	align-items: center;

	.room-router {
		flex: 1;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		margin-bottom: 5rem;
	}

	.user-container {
		width: 18rem;
		height: 7.5rem;
		margin-right: 0.7rem;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		position: relative;

		& > .side-bar {
			position: absolute;
			right: 0.3rem;
			top: 0.3rem;
			display: flex;
			flex-direction: column;
			align-items: center;

			& > button {
				width: 100%;
				height: 1.8rem;
				border-radius: 0.6rem 0.8rem 0.6rem 0.6rem;
				font-size: 0.8rem;
				padding: 0 0.8rem;
				z-index: 10;
			}
		}
	}

	.right-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;

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
	}

	.join-room {
		@include felt-patch(#ffedb7);
		padding: 1.8rem;
		border-radius: 2rem;

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
		}

		& button {
			margin-left: 0.5rem;
			border-radius: 0.7rem;
			height: 3rem;
		}
	}

	.party-mode {
		@include felt-patch(#ffedb7);
		padding: 1.8rem;
		border-radius: 2rem;
	}
}
</style>

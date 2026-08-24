<script setup lang="ts">
import { onBeforeMount, onBeforeUnmount, onMounted, computed, ref, onUpdated, nextTick } from "vue";
import { useUserInfo, useUserList, useRoomList, useRoomInfo, useLoading } from "@src/store";
import userCard from "@src/components/common/user-card.vue";
import router from "@src/router";
import { FPMessage } from "@mine-monopoly/ui";
import LoginExtra from "@src/views/login/components/login-extra.vue";
import OnlineRoomPanel from "./components/online-room-panel.vue";
import PartyModePanel from "./components/party-mode-panel.vue";
import { ensureValidAuth } from "@src/utils/api";
import { throttle } from "@src/utils";
import { useResourceStore } from "@src/store/game";
import FpErrorBoundary from "@src/components/utils/fp-error-boundary/index.vue";
import HeroTitle from "@src/components/hero-title";
import gsap from "gsap";

const userInfoStore = useUserInfo();
const userListStore = useUserList();
const roomListStore = useRoomList();

type RoomModePanelInstance = {
	panelElement: HTMLElement | null;
};

const user = computed(() => userInfoStore);
const activeMode = ref<"online" | "party">("online");
const isModeSwitching = ref(false);
const roomRouterRef = ref<HTMLElement | null>(null);
const onlineRoomPanelRef = ref<RoomModePanelInstance | null>(null);
const partyModePanelRef = ref<RoomModePanelInstance | null>(null);
let modeSwitchTimeline: gsap.core.Timeline | undefined;

function switchMode(mode: "online" | "party") {
	if (mode === activeMode.value || isModeSwitching.value) return;

	const isSwitchingToParty = mode === "party";
	const direction = isSwitchingToParty ? 1 : -1;
	const currentPanel = isSwitchingToParty
		? onlineRoomPanelRef.value?.panelElement
		: partyModePanelRef.value?.panelElement;
	const nextPanel = isSwitchingToParty ? partyModePanelRef.value?.panelElement : onlineRoomPanelRef.value?.panelElement;
	if (!currentPanel || !nextPanel) {
		activeMode.value = mode;
		return;
	}

	isModeSwitching.value = true;
	activeMode.value = mode;
	modeSwitchTimeline?.kill();
	gsap.killTweensOf([currentPanel, nextPanel]);

	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		gsap.set(currentPanel, { autoAlpha: 0, pointerEvents: "none" });
		gsap.set(nextPanel, { autoAlpha: 1, pointerEvents: "auto" });
		isModeSwitching.value = false;
		return;
	}

	const nextContents = nextPanel.querySelectorAll(
		":scope > .title, :scope > .describe, :scope > form, :scope > .local-party-button",
	);
	modeSwitchTimeline = gsap
		.timeline({
			defaults: { overwrite: "auto" },
			onComplete: () => {
				isModeSwitching.value = false;
			},
		})
		.set(currentPanel, { pointerEvents: "none", transformOrigin: "50% 50%" })
		.set(nextPanel, {
			autoAlpha: 0,
			x: direction * 72,
			y: 16,
			rotation: direction * 8,
			scale: 0.8,
			pointerEvents: "none",
			transformOrigin: "50% 50%",
		})
		.set(nextContents, { autoAlpha: 0, y: 18, rotation: direction * 2 })
		.to(currentPanel, {
			autoAlpha: 0,
			x: -direction * 54,
			y: -10,
			rotation: -direction * 6,
			scale: 0.82,
			duration: 0.26,
			ease: "back.in(1.5)",
		})
		.to(
			nextPanel,
			{
				autoAlpha: 1,
				x: 0,
				y: 0,
				rotation: 0,
				scale: 1,
				duration: 0.5,
				ease: "elastic.out(1, 0.58)",
			},
			0.1,
		)
		.to(
			nextContents,
			{
				autoAlpha: 1,
				y: 0,
				rotation: 0,
				duration: 0.3,
				ease: "back.out(1.7)",
				stagger: 0.055,
			},
			0.22,
		)
		.set(currentPanel, { x: 0, y: 0, rotation: 0, scale: 1, pointerEvents: "none" })
		.set(nextPanel, { pointerEvents: "auto" });
}

onBeforeUnmount(() => modeSwitchTimeline?.kill());

onMounted(async () => {
	// 入场动画
	nextTick(() => {
		if (!roomRouterRef.value) return;

		const userContainer = roomRouterRef.value.querySelector(".user-container");
		const joinRoom = roomRouterRef.value.querySelector(".right-container");

		if (!userContainer || !joinRoom) return;

		const modePanels = [onlineRoomPanelRef.value?.panelElement, partyModePanelRef.value?.panelElement].filter(
			(panel): panel is HTMLElement => panel !== null,
		);
		gsap.set(modePanels, { autoAlpha: 0, pointerEvents: "none" });
		if (onlineRoomPanelRef.value?.panelElement) {
			gsap.set(onlineRoomPanelRef.value.panelElement, { autoAlpha: 1, pointerEvents: "auto" });
		}

		// 左右面板并行入场，右侧稍后 0.08 秒跟进，避免出现明显空档。
		const tl = gsap.timeline({ defaults: { ease: "back.out(1.5)" } });
		tl.fromTo(userContainer, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.36 })
			.fromTo(
				userContainer.querySelectorAll(":scope > *"),
				{ y: 20, opacity: 0 },
				{ y: 0, opacity: 1, stagger: 0.1, duration: 0.3 },
				0.12,
			)
			.fromTo(joinRoom, { scale: 0.84, y: 12, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.32 }, 0.08)
			.fromTo(
				joinRoom.querySelectorAll(":scope > *"),
				{ y: 20, opacity: 0 },
				{ y: 0, opacity: 1, stagger: 0.1, duration: 0.28 },
				0.2,
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
					<div class="mode-tabs" role="tablist" aria-label="大厅模式">
						<button
							id="online-room-tab"
							type="button"
							class="mode-tab"
							:class="{ active: activeMode === 'online' }"
							:aria-selected="activeMode === 'online'"
							:disabled="isModeSwitching"
							aria-controls="online-room-panel"
							role="tab"
							@click="switchMode('online')"
						>
							{{ activeMode === "online" ? "> " : "" }}联机房间
						</button>
						<button
							id="party-mode-tab"
							type="button"
							class="mode-tab"
							:class="{ active: activeMode === 'party' }"
							:aria-selected="activeMode === 'party'"
							:disabled="isModeSwitching"
							aria-controls="party-mode-panel"
							role="tab"
							@click="switchMode('party')"
						>
							{{ activeMode === "party" ? "> " : "" }}派对模式
						</button>
					</div>

					<div class="mode-viewport">
						<OnlineRoomPanel
							ref="onlineRoomPanelRef"
							id="online-room-panel"
							:aria-hidden="activeMode !== 'online'"
							role="tabpanel"
							aria-labelledby="online-room-tab"
						/>
						<PartyModePanel
							ref="partyModePanelRef"
							id="party-mode-panel"
							:aria-hidden="activeMode !== 'party'"
							role="tabpanel"
							aria-labelledby="party-mode-tab"
						/>
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
		// width: min(34rem, calc(100vw - 20rem));
		display: flex;
		flex-direction: column;
		gap: 0.7rem;

		.mode-tabs {
			display: flex;
			gap: 0.5rem;
			padding: 0 0.4rem;
		}

		.mode-tab {
			--btn-bg: var(--fp-color-bg-light);
			--dashed-color: rgba(206, 206, 206, 0.65);
			// flex: 1;
			width: 10rem;
			height: 2.6rem;
			color: #6b6251;
			transition:
				color 0.2s ease,
				background-color 0.2s ease,
				transform 0.2s ease;

			&:disabled {
				opacity: 1;
				filter: none;
				cursor: default;
			}

			&.active {
				--btn-bg: var(--fp-color-secondary);
				--dashed-color: rgba(255, 255, 255, 0.65);
				color: #fff;
				transform: translateY(-0.1rem);
			}
		}

		.mode-viewport {
			display: grid;
		}

		.mode-page {
			grid-area: 1 / 1;
			visibility: hidden;
			opacity: 0;
			pointer-events: none;
		}
	}
}
</style>

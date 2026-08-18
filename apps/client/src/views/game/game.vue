<script setup lang="ts">
	import {
		onMounted,
		computed,
		onUnmounted,
		ref,
		onBeforeMount,
		onBeforeUnmount,
		h,
		VNode,
		isVNode,
		render,
		Fragment,
	} from "vue";
	import { GameRenderer } from "@src/core/renderer/GameRenderer";
	import { useLoading, useRoomInfo, useUtil } from "@src/store";
	import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
	import router from "@src/router/index";
	import { MonopolyClient, useMonopolyClient, destoryMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
	import Dices from "./components/dices.vue";
	import ChanceCardContainer from "./components/chance-card-container.vue";
	import CountdownTimer from "./components/countdown-timer.vue";
	import scoreboard from "./components/scoreboard.vue";
	import PlayerContainer from "./components/player-container.vue";
	import GameButtonsPanel from "./components/game-buttons-panel.vue";
	import { useGameData, useMapData } from "@src/store/game";
	import { useUserInfo } from "@src/store";
	import { CustomUI, GameMap, UISchema, MapEventChangedData } from "@mine-monopoly/types";
	import { compileTsToJs } from "@src/utils";
	import { useAudioManager } from "@src/utils/audio/AudioManager";
	import { SoundName } from "@src/utils/audio/types";
	import useEventBus from "@src/utils/event-bus";
	import { FPMessageBox } from "@src/components/utils/fp-message-box";
	import { buildGameInitDiagnostics, wrapGameInitError } from "@src/utils/game-init-diagnostics";
	import { ErrorCategory, logErrorWithOptions } from "@src/utils/log";
	import { storeToRefs } from "pinia";
	import UiRenderer from "@src/components/utils/ui-renderer/ui-renderer.vue";
	import FpErrorBoundary from "@src/components/utils/fp-error-boundary/index.vue";
	import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
	import { CollapsiblePanel } from "@src/components/collapsible-panel";
	//pinia仓库
	const mapDataStore = useMapData();
	const userInfoStore = useUserInfo();
	const roomInfoStore = useRoomInfo();
	const gameDataStore = useGameData();

	const windowWidth = computed(() => window.innerWidth);
	const windowHeight = computed(() => window.innerHeight);
	const amISpectator = computed(() => roomInfoStore.amISpectator);
	const utilStore = useUtil();

	// 暂停弹窗可见性：只读投影 gamePaused，禁止通过关闭按钮/遮罩点击关闭（只能点"继续游戏"）
	const pauseDialogVisible = computed({
		get: () => utilStore.gamePaused,
		set: () => {},
	});

	// 暂停弹窗上的"继续游戏"：房主直接恢复，其他玩家请求房主代为恢复
	function handleResumeGame() {
		socketClient?.resumeGame();
	}

	const currentPlayerId = computed(() => userInfoStore.userId);
	const gameDataState = computed(() => gameDataStore.$state);

	let socketClient: MonopolyClient;
	let gameRenderer: GameRenderer | null;
	const islockingCamera = ref(true);
	const lockCameraIcon = computed(() => (islockingCamera.value ? "fa-video" : "fa-video-slash"));

	function handleToggleLockCamera() {
		if (gameRenderer) islockingCamera.value = gameRenderer.toggleLockCamera();
	}

	function handleRollDice() {
		if (socketClient) {
			socketClient.rollDice();
		}
	}

	function renderInitFailureDialog(lines: string[]) {
		return h("div", { style: "max-width: 44rem;" }, [
			h(
				"div",
				{
					style: "margin-bottom: 0.75rem; font-weight: 600; color: var(--fp-color-primary, #333);",
				},
				"初始化失败。请截图下面完整内容发给开发者。",
			),
			h(
				"pre",
				{
					style: [
						"margin: 0",
						"padding: 0.9rem 1rem",
						"border-radius: 0.5rem",
						"background: rgba(0, 0, 0, 0.06)",
						"white-space: pre-wrap",
						"word-break: break-word",
						"overflow-wrap: anywhere",
						"font-size: 0.92rem",
						"line-height: 1.55",
					].join("; "),
				},
				lines.join("\n"),
			),
		]);
	}

	onMounted(async () => {
		try {
			socketClient = useMonopolyClient();
			useLoading().showLoading("加载数据中...");

			// 暂停心跳检测，避免加载期间误判断连
			socketClient.sendLoadingStarted();
			socketClient.pauseHeartBeat();

			const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
			const container = document.getElementsByClassName("game-page")[0] as HTMLDivElement;
			if (!canvas || !container) {
				throw wrapGameInitError("game-page-mounted", new Error("游戏画布元素未找到"));
			}
			const mapData = JSON.parse(JSON.stringify(mapDataStore.$state)) as GameMap;
			console.log("🚀 ~ mapData:", mapData);
			gameRenderer = new GameRenderer(canvas, container, mapData);
			await gameRenderer.init();

				// 注册金钱粒子系统
			// 恢复心跳检测
			socketClient.resumeHeartBeat();

			useEventBus().on("game:init", () => {
				if (!amISpectator.value) void socketClient.gameInitFinished();
			});

			if (amISpectator.value) {
				useLoading().hideLoading();
			} else {
				useLoading().showLoading("数据加载完成，等待其他玩家加载...");
				socketClient.gameInitFinished();
			}

			// 监听玩家金钱变化事件
			const audioManager = useAudioManager();
			const eventBus = useEventBus();
			eventBus.on("player-money", (playerId: string, oldMoney: number, newMoney: number) => {
				if (newMoney > oldMoney) {
					audioManager.playSound(SoundName.GAIN_MONEY);
				} else if (newMoney < oldMoney) {
					audioManager.playSound(SoundName.LOSE_MONEY);
				}
			});

			// 监听动态地图事件变更
			eventBus.on("map-event-changed", (data: MapEventChangedData) => {
				if (!gameRenderer) return;
				switch (data.action) {
					case "link":
						if (data.mapEvent && data.mapItemId) {
							gameRenderer.addEventIcon(data.mapItemId, data.mapEvent);
							gameRenderer.setMapItemEventUserData(data.mapItemId, data.mapEvent);
						}
						break;
					case "add":
						if (data.mapEvent) {
							const linkedItem = mapDataStore.mapItems.find((m) => m.mapEventId === data.mapEvent!.id);
							if (linkedItem) {
								gameRenderer.addEventIcon(linkedItem.id, data.mapEvent);
								gameRenderer.setMapItemEventUserData(linkedItem.id, data.mapEvent);
							}
						}
						break;
					case "remove":
						if (data.mapEventId) {
							// 移除所有关联此事件的地块上的图标
							for (const item of mapDataStore.mapItems) {
								if (item.mapEventId === data.mapEventId) {
									gameRenderer.removeEventIcon(item.id);
									gameRenderer.setMapItemEventUserData(item.id, null);
								}
							}
						}
						break;
					case "unlink":
						if (data.mapItemId) {
							gameRenderer.removeEventIcon(data.mapItemId);
							gameRenderer.setMapItemEventUserData(data.mapItemId, null);
						}
						break;
				}
			});
		} catch (e: any) {
			// 异常时也要恢复心跳，防止永久暂停
			socketClient?.resumeHeartBeat();
			const diagnostics = buildGameInitDiagnostics(e, {
				mapName: mapDataStore.info?.name || "unknown",
				route: window.location.pathname,
			});
			void socketClient?.gameInitFailed(diagnostics.rawMessage);
			console.error("[GameInitFailure]", diagnostics, e);
			logErrorWithOptions({
				category: ErrorCategory.UI_RENDER,
				type: diagnostics.errorCode,
				message: diagnostics.logMessage,
				error:
					e instanceof Error
						? e
						: diagnostics.logStack
							? ({ message: diagnostics.rawMessage, stack: diagnostics.logStack } as Error)
							: undefined,
				extraInfo: diagnostics.extraInfo,
				context: diagnostics.context,
			});
			useLoading().hideLoading();
			await FPMessageBox({
				title: "游戏初始化失败",
				content: renderInitFailureDialog(diagnostics.lines),
				confirmText: "返回房间",
				showCancel: false,
			}).catch(() => {});
			router.replace({ name: "room-router" });
		}
	});

	onBeforeUnmount(() => {
		if (gameRenderer) gameRenderer.destroy();
		gameRenderer = null;
		// 只有在真正离开房间时才销毁 MonopolyClient（安全模式回房间时不销毁）
		const nextRoute = router.currentRoute.value.name;
		if (nextRoute !== "room") {
			destoryMonopolyClient();
		}
	});

	function getUiTemplateById(id: string) {
		return (
			useMapData().getUITempolateById(id)?.template || { id: "404", type: "text", content: `找不到ID为: ${id} 的UI组件` }
		);
	}
</script>

<template>
	<FpErrorBoundary>
		<div class="game-page">
			<canvas id="game-canvas" :width="windowWidth" :height="windowHeight"></canvas>
			<div class="ui-container">
				<CollapsiblePanel
					v-for="ui in mapDataStore.customUIs"
					:key="ui.id"
					mode="slide"
					edge="auto"
					grip-side="inside"
					z-index="var(--z-ui)"
					class="custom-ui-collapsible"
					:style="{
						gridArea: `${ui.layout.y + 1} / ${ui.layout.x + 1} / span ${ui.layout.height} / span ${ui.layout.width}`,
					}"
				>
					<UiRenderer
						:schema="getUiTemplateById(ui.uiSchema)"
						:context="{
							...gameDataState,
							currentPlayer: gameDataStore.myGameInfo
						}"
					/>
				</CollapsiblePanel>

				<PlayerContainer />

				<div class="tool-bar ui-item">
					<button class="border-button lock-camera" @click="handleToggleLockCamera">
						<FontAwesomeIcon :icon="lockCameraIcon" />
					</button>
				</div>

				<ChanceCardContainer />

				<!-- 游戏按钮面板：包含骰子按钮和动态按钮 -->
				<GameButtonsPanel
					:player-id="currentPlayerId"
					title="操作面板"
					:spectator-message="amISpectator ? '你正在旁观本局，游戏操作将完全由 AI 自行完成。' : ''"
					@rollDice="handleRollDice"
				/>

				<teleport to="body">
					<CountdownTimer />
				</teleport>
			</div>

			<!-- 金钱粒子系统：放在 ui-container 外部，避免 pointer-events 冲突 -->

			<scoreboard />

			<!-- 游戏暂停弹窗：使用 fp-dialog 统一样式，暂停期间不可关闭，只能点"继续游戏" -->
			<FpDialog v-model:visible="pauseDialogVisible" :closable="false" hidden-footer title="游戏已暂停">
				<div class="pause-dialog-content">
					<FontAwesomeIcon icon="pause" class="pause-dialog-icon" />
					<p class="pause-dialog-desc">处理完其他事情后，点击下方按钮即可继续游戏</p>
					<button class="pause-resume-btn" @click="handleResumeGame">
						<FontAwesomeIcon icon="play" style="margin-right: 0.4rem" />
						继续游戏
					</button>
				</div>
			</FpDialog>
		</div>
	</FpErrorBoundary>
</template>

<style lang="scss" scoped>
/* 暂停弹窗内容（fp-dialog 内） */
.pause-dialog-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.9rem;
	text-align: center;
	user-select: none;
}

.pause-dialog-icon {
	font-size: 2.2rem;
	color: var(--fp-color-primary);
}

.pause-dialog-desc {
	margin: 0;
	font-size: 1rem;
	color: var(--fp-color-tertiary);
}

.pause-resume-btn {
	padding: 0.6rem 1.8rem;
	border: none;
	border-radius: 0.6rem;
	background: var(--fp-color-primary);
	color: #fff;
	font-size: 1.05rem;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.2s;
}

.pause-resume-btn:hover {
	opacity: 0.9;
}

.game-page {
	position: relative;
	width: 100%;
	height: 100%;
	background-color: #ffffff;
	user-select: none;
}

.border-button {
	border-style: solid;
	border-color: rgba($color: #ffffff, $alpha: 0.5);
	border-radius: 0.8rem;

	&.lock-camera {
		border-width: 0.25rem;
		font-size: 1.2em;
		width: 4rem;
		height: 4rem;
	}
}

.ui-container,
#game-canvas {
	position: absolute;
	width: 100%;
	height: 100%;
	left: 0;
	top: 0;
}

#game-canvas {
	z-index: var(--z-game);
	display: block;
}

.ui-container {
	pointer-events: none;
	display: grid;
	grid-template-columns: repeat(32, 1fr);
	grid-template-rows: repeat(20, 1fr);

	/* 自定义 UI 收放容器：grid item 定位上下文（把手 absolute 相对它）；
	   显式 height: 100% 让面板高度固定为网格单元（grid item 百分比高相对网格区域），
	   保证内部 height: 100% 链路生效、内容不撑破单元格 */
	.custom-ui-collapsible {
		position: relative;
		height: 100%;
	}

	.ui-item {
		position: absolute;

		&.tool-bar {
			position: absolute;
			right: 0;
			top: 0;
			display: none;
			justify-content: space-between;
			pointer-events: none;
		}
	}

	& * {
		pointer-events: initial;
	}
}

</style>

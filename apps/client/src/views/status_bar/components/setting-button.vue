<script setup lang="ts">
import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
import { useSettig, useUtil } from "@src/store";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { ref, watch, computed } from "vue";
import { useRoute } from "vue-router";
import useEventBus from "@src/utils/event-bus";
import FpMessage from "@mine-monopoly/ui/fp-message";
import { useAudioManager } from "@src/utils/audio";
import { FPMessageBox } from "@src/components/utils/fp-message-box";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import { useRoomInfo, useChat, useGameLog } from "@src/store";
import { useGameData } from "@src/store/game";
import router from "@src/router";
import LogPanel from "@src/components/log-panel";

import AiSettingPanel from "./ai-setting-panel.vue";

const settingVisible = ref(false);
const logPanelVisible = ref(false);
const aiSettingVisible = ref(false);

// 暴露 window 对象给模板使用
const win = window as any;
const localMapDirectoryStatus = ref<{ readable: boolean; writable: boolean } | null>(null);
const hasLocalMapRepository = computed(() => {
	return Boolean(win.platformAPI?.importLocalMap && win.platformAPI?.scanLocalMaps && win.platformAPI?.openLocalMapDirectory);
});
const hasStandaloneAIConsole = computed(() => Boolean(win.platformAPI?.openAIConsole));
const aiEntryLabel = computed(() => (hasStandaloneAIConsole.value ? "打开 AI 控制台" : "打开 AI 设置"));

const openInspector = () => {
	window.platformAPI?.openInspector?.();
};

const openAISettings = () => {
	if (hasStandaloneAIConsole.value) {
		settingVisible.value = false;
		window.platformAPI?.openAIConsole?.();
		return;
	}
	aiSettingVisible.value = true;
};

const openLogsFolder = () => {
	window.platformAPI
		?.openLogsFolder?.()
		.then((path: string) => {
		})
		.catch(() => {
			FpMessage({ type: "error", message: "无法打开日志文件夹" });
		});
};

async function refreshLocalMapDirectoryStatus() {
	try {
		localMapDirectoryStatus.value = (await win.platformAPI?.getLocalMapDirectoryStatus?.()) ?? null;
	} catch {
		localMapDirectoryStatus.value = null;
	}
}

async function handleOpenLocalMapDirectory() {
	try {
		await refreshLocalMapDirectoryStatus();
		await win.platformAPI?.openLocalMapDirectory?.();
		if (localMapDirectoryStatus.value && !localMapDirectoryStatus.value.writable) {
			FpMessage({ type: "warning", message: "本地地图仓库目录不可写；仍可从房主接收地图。" });
		}
	} catch (error) {
		FpMessage({ type: "error", message: `打开本地地图目录失败: ${error instanceof Error ? error.message : "未知错误"}` });
	}
}

async function handleImportLocalMap() {
	try {
		const result = await win.platformAPI?.importLocalMap?.();
		if (!result || result.status === "failed") {
			if (result?.message !== "已取消导入") FpMessage({ type: "error", message: result?.message || "导入地图失败" });
			return;
		}
		if (result.status === "duplicate") {
			FpMessage({ type: "info", message: `本地地图仓库已包含“${result.fileName || "该地图"}”。` });
			return;
		}
		FpMessage({ type: "success", message: `已导入本地地图“${result.fileName}”。` });
		await refreshLocalMapDirectoryStatus();
	} catch (error) {
		FpMessage({ type: "error", message: `导入本地地图失败: ${error instanceof Error ? error.message : "未知错误"}` });
	}
}

async function handleScanLocalMaps() {
	try {
		const result = await win.platformAPI?.scanLocalMaps?.();
		if (!result) return;
		if (result.message) {
			FpMessage({ type: "error", message: `扫描本地地图失败: ${result.message}` });
			return;
		}
		FpMessage({
			type: "success",
			message: `地图仓库扫描完成：${result.files} 个文件，新增 ${result.indexed} 个，更新 ${result.updated} 个。`,
		});
		await refreshLocalMapDirectoryStatus();
	} catch (error) {
		FpMessage({ type: "error", message: `扫描本地地图失败: ${error instanceof Error ? error.message : "未知错误"}` });
	}
}

async function handleExitGame() {
	const isOwner = useRoomInfo().amIRoomOwner;
	const content = isOwner
		? "你是房主，退出后游戏将解散，所有玩家将被送回大厅。确定退出？"
		: "确定退出游戏？退出后将由 AI 托管继续游戏。";

	try {
		await FPMessageBox({
			title: "退出游戏",
			content,
			confirmText: "确定退出",
			cancelText: "取消",
			showCancel: true,
		});

		settingVisible.value = false;
		const socketClient = useMonopolyClient();
		if (socketClient) {
			socketClient.leaveRoom();
		}
		useGameData().$reset();
		useRoomInfo().$reset();
		useChat().$reset();
		useGameLog().$reset();
		router.replace({ name: "room-router" });
	} catch {
		// 用户取消
	}
}

const settingStore = useSettig();
const route = useRoute();
const eventBus = useEventBus();
const audio = useAudioManager();
const utilStore = useUtil();
const isGamePaused = computed(() => utilStore.gamePaused);

// 暂停/继续游戏：房主直接执行；其他玩家发送请求由房主代为执行
function handleTogglePause() {
	const socketClient = useMonopolyClient();
	if (!socketClient) return;
	if (utilStore.gamePaused) {
		socketClient.resumeGame();
	} else {
		socketClient.pauseGame();
	}
}

// 画质标签映射
const qualityLabels = {
	low: "低",
	medium: "中",
	high: "高",
};

// 临时状态：用户选择但未应用
const tempLockRole = ref(settingStore.lockRole);
const tempEnableTurnFocus = ref(settingStore.enableTurnFocus);
const tempChatRenderMode = ref<"danmaku" | "bubble">(settingStore.chatRenderMode);
const tempGraphicQuality = ref<"low" | "medium" | "high">(settingStore.graphicQuality);
const tempEnableShadow = ref(settingStore.enableShadow);
const tempEnableModelAnimation = ref(settingStore.enableModelAnimation);
const tempMasterVolume = ref(settingStore.masterVolume);
const tempSFXVolume = ref(settingStore.sfxVolume);
const tempMusicVolume = ref(settingStore.musicVolume);
const tempMasterMuted = ref(settingStore.masterMuted);
const tempSFXMuted = ref(settingStore.sfxMuted);
const tempMusicMuted = ref(settingStore.musicMuted);
// 监听设置面板打开，重置临时状态
watch(settingVisible, (isOpen) => {
	if (isOpen) {
		void refreshLocalMapDirectoryStatus();
		tempLockRole.value = settingStore.lockRole;
		tempEnableTurnFocus.value = settingStore.enableTurnFocus;
		tempChatRenderMode.value = settingStore.chatRenderMode;
		tempGraphicQuality.value = settingStore.graphicQuality;
		tempEnableModelAnimation.value = settingStore.enableModelAnimation;
		tempEnableShadow.value = settingStore.enableShadow;
		tempMasterVolume.value = settingStore.masterVolume;
		tempSFXVolume.value = settingStore.sfxVolume;
		tempMusicVolume.value = settingStore.musicVolume;
		tempMasterMuted.value = settingStore.masterMuted;
		tempSFXMuted.value = settingStore.sfxMuted;
		tempMusicMuted.value = settingStore.musicMuted;
	}
});

// 检查是否有未应用的更改
const hasChanges = computed(() => {
	return (
		tempLockRole.value !== settingStore.lockRole ||
		tempEnableTurnFocus.value !== settingStore.enableTurnFocus ||
		tempChatRenderMode.value !== settingStore.chatRenderMode ||
		tempGraphicQuality.value !== settingStore.graphicQuality ||
		tempEnableShadow.value !== settingStore.enableShadow ||
		tempEnableModelAnimation.value !== settingStore.enableModelAnimation ||
		tempMasterVolume.value !== settingStore.masterVolume ||
		tempSFXVolume.value !== settingStore.sfxVolume ||
		tempMusicVolume.value !== settingStore.musicVolume ||
		tempMasterMuted.value !== settingStore.masterMuted ||
		tempSFXMuted.value !== settingStore.sfxMuted ||
		tempMusicMuted.value !== settingStore.musicMuted
	);
});

// 调整音量
const adjustVolume = (type: "master" | "sfx" | "music", delta: number) => {
	const step = 0.1; // 10% 步幅
	switch (type) {
		case "master":
			tempMasterVolume.value = Math.max(0, Math.min(1, tempMasterVolume.value + delta * step));
			break;
		case "sfx":
			tempSFXVolume.value = Math.max(0, Math.min(1, tempSFXVolume.value + delta * step));
			break;
		case "music":
			tempMusicVolume.value = Math.max(0, Math.min(1, tempMusicVolume.value + delta * step));
			break;
	}
};

// 切换静音
const toggleMute = (type: "master" | "sfx" | "music") => {
	switch (type) {
		case "master":
			tempMasterMuted.value = !tempMasterMuted.value;
			break;
		case "sfx":
			tempSFXMuted.value = !tempSFXMuted.value;
			break;
		case "music":
			tempMusicMuted.value = !tempMusicMuted.value;
			break;
	}
};

// 应用所有设置
const applySettings = () => {
	// 应用视角设置
	if (tempLockRole.value !== settingStore.lockRole) {
		settingStore.lockRole = tempLockRole.value;
		eventBus.emit("graphics:lockRole:change", { lockRole: tempLockRole.value });
	}

	if (tempEnableTurnFocus.value !== settingStore.enableTurnFocus) {
		settingStore.enableTurnFocus = tempEnableTurnFocus.value;
		eventBus.emit("graphics:turnFocus:change", { enable: tempEnableTurnFocus.value });
	}

	if (tempChatRenderMode.value !== settingStore.chatRenderMode) {
		settingStore.chatRenderMode = tempChatRenderMode.value;
	}

	// 应用画质设置
	if (tempGraphicQuality.value !== settingStore.graphicQuality) {
		const quality = tempGraphicQuality.value;

		// 保存到 localStorage
		try {
			localStorage.setItem("graphicQuality", quality);
		} catch (e) {
			console.warn("[画质设置] localStorage 保存失败:", e);
		}

		// 更新 store
		settingStore.graphicQuality = quality;

		// 发送 EventBus 事件
		eventBus.emit("graphics:quality:change", { quality });

		// 显示提示
	}

	// 应用阴影设置
	if (tempEnableShadow.value !== settingStore.enableShadow) {
		settingStore.enableShadow = tempEnableShadow.value;
		eventBus.emit("graphics:shadow:change", { enable: tempEnableShadow.value });
	}

	// 应用模型动画设置
	if (tempEnableModelAnimation.value !== settingStore.enableModelAnimation) {
		settingStore.enableModelAnimation = tempEnableModelAnimation.value;
		eventBus.emit("graphics:animation:change", { enable: tempEnableModelAnimation.value });
	}

	// 应用音量设置
	if (
		tempMasterVolume.value !== settingStore.masterVolume ||
		tempSFXVolume.value !== settingStore.sfxVolume ||
		tempMusicVolume.value !== settingStore.musicVolume ||
		tempMasterMuted.value !== settingStore.masterMuted ||
		tempSFXMuted.value !== settingStore.sfxMuted ||
		tempMusicMuted.value !== settingStore.musicMuted
	) {
		// 直接应用设置的音量和静音状态
		settingStore.masterVolume = tempMasterVolume.value;
		settingStore.sfxVolume = tempSFXVolume.value;
		settingStore.musicVolume = tempMusicVolume.value;
		settingStore.masterMuted = tempMasterMuted.value;
		settingStore.sfxMuted = tempSFXMuted.value;
		settingStore.musicMuted = tempMusicMuted.value;
		// Store 的订阅会自动同步到 AudioManager
	}

	FpMessage({ message: "所有设置已应用", type: "success" });
	settingVisible.value = false;
};
</script>

<template>
	<button @click="settingVisible = true" class="setting-button btn-small" title="设置">
		<FontAwesomeIcon icon="gear" />
	</button>
	<FpDialog v-model:visible="settingVisible" hidden-footer>
		<template #title>设置</template>
		<div class="setting-container" style="user-select: none">
			<div class="setting-list">
				<!-- 主音量 -->
				<div class="setting-item volume-setting">
					<div class="label">主音量</div>
					<div class="content volume-control">
						<FontAwesomeIcon
							icon="minus"
							class="control-icon decrease"
							@click="adjustVolume('master', -1)"
							:class="{ disabled: tempMasterVolume <= 0 }"
						/>
						<span class="volume-value">{{ Math.round(tempMasterVolume * 100) }}%</span>
						<FontAwesomeIcon
							icon="plus"
							class="control-icon increase"
							@click="adjustVolume('master', 1)"
							:class="{ disabled: tempMasterVolume >= 1 }"
						/>
						<FontAwesomeIcon
							:icon="tempMasterMuted ? 'volume-xmark' : 'volume-high'"
							class="control-icon mute"
							:class="{ muted: tempMasterMuted }"
							@click="toggleMute('master')"
						/>
					</div>
				</div>

				<!-- 音效音量 -->
				<div class="setting-item volume-setting">
					<div class="label">音效音量</div>
					<div class="content volume-control">
						<FontAwesomeIcon
							icon="minus"
							class="control-icon decrease"
							@click="adjustVolume('sfx', -1)"
							:class="{ disabled: tempSFXVolume <= 0 }"
						/>
						<span class="volume-value">{{ Math.round(tempSFXVolume * 100) }}%</span>
						<FontAwesomeIcon
							icon="plus"
							class="control-icon increase"
							@click="adjustVolume('sfx', 1)"
							:class="{ disabled: tempSFXVolume >= 1 }"
						/>
						<FontAwesomeIcon
							:icon="tempSFXMuted ? 'volume-xmark' : 'volume-high'"
							class="control-icon mute"
							:class="{ muted: tempSFXMuted }"
							@click="toggleMute('sfx')"
						/>
					</div>
				</div>

				<!-- 背景音乐音量 -->
				<div class="setting-item volume-setting">
					<div class="label">背景音乐</div>
					<div class="content volume-control">
						<FontAwesomeIcon
							icon="minus"
							class="control-icon decrease"
							@click="adjustVolume('music', -1)"
							:class="{ disabled: tempMusicVolume <= 0 }"
						/>
						<span class="volume-value">{{ Math.round(tempMusicVolume * 100) }}%</span>
						<FontAwesomeIcon
							icon="plus"
							class="control-icon increase"
							@click="adjustVolume('music', 1)"
							:class="{ disabled: tempMusicVolume >= 1 }"
						/>
						<FontAwesomeIcon
							:icon="tempMusicMuted ? 'volume-xmark' : 'volume-high'"
							class="control-icon mute"
							:class="{ muted: tempMusicMuted }"
							@click="toggleMute('music')"
						/>
					</div>
				</div>

				<div class="setting-item">
					<div class="label">移动时视角</div>
					<div class="content">
						<div>
							<input
								type="radio"
								name="lock-role-mode"
								:value="true"
								id="lock-role-mode-true"
								v-model="tempLockRole"
								hidden
							/>
							<label for="lock-role-mode-true">
								<FontAwesomeIcon icon="square-check" v-if="tempLockRole" />
								锁定</label
							>
						</div>
						<div>
							<input
								type="radio"
								name="lock-role-mode"
								:value="false"
								id="lock-role-mode-false"
								v-model="tempLockRole"
								hidden
							/>
							<label for="lock-role-mode-false">
								<FontAwesomeIcon icon="square-check" v-if="!tempLockRole" />
								自由</label
							>
						</div>
					</div>
				</div>

				<div class="setting-item">
					<div class="label">回合切换聚焦</div>
					<div class="content">
						<div>
							<input
								type="radio"
								name="turn-focus-mode"
								:value="true"
								id="turn-focus-mode-true"
								v-model="tempEnableTurnFocus"
								hidden
							/>
							<label for="turn-focus-mode-true">
								<FontAwesomeIcon icon="square-check" v-if="tempEnableTurnFocus" />
								开启</label
							>
						</div>
						<div>
							<input
								type="radio"
								name="turn-focus-mode"
								:value="false"
								id="turn-focus-mode-false"
								v-model="tempEnableTurnFocus"
								hidden
							/>
							<label for="turn-focus-mode-false">
								<FontAwesomeIcon icon="square-check" v-if="!tempEnableTurnFocus" />
								关闭</label
							>
						</div>
					</div>
				</div>

				<div class="setting-item">
					<div class="label">发言显示</div>
					<div class="content">
						<div>
							<input
								type="radio"
								name="chat-render-mode"
								value="danmaku"
								id="chat-render-mode-danmaku"
								v-model="tempChatRenderMode"
								hidden
							/>
							<label for="chat-render-mode-danmaku">
								<FontAwesomeIcon icon="square-check" v-if="tempChatRenderMode === 'danmaku'" />
								弹幕</label
							>
						</div>
						<div>
							<input
								type="radio"
								name="chat-render-mode"
								value="bubble"
								id="chat-render-mode-bubble"
								v-model="tempChatRenderMode"
								hidden
							/>
							<label for="chat-render-mode-bubble">
								<FontAwesomeIcon icon="square-check" v-if="tempChatRenderMode === 'bubble'" />
								对话框气泡</label
							>
						</div>
					</div>
				</div>

				<!-- 画面质量设置 -->
				<div class="setting-item">
					<div class="label">画面质量</div>
					<div class="content">
						<div>
							<input
								type="radio"
								name="graphic-quality"
								value="low"
								id="quality-low"
								v-model="tempGraphicQuality"
								hidden
							/>
							<label for="quality-low">
								<FontAwesomeIcon icon="square-check" v-if="tempGraphicQuality === 'low'" />
								低</label
							>
						</div>
						<div>
							<input
								type="radio"
								name="graphic-quality"
								value="medium"
								id="quality-medium"
								v-model="tempGraphicQuality"
								hidden
							/>
							<label for="quality-medium">
								<FontAwesomeIcon icon="square-check" v-if="tempGraphicQuality === 'medium'" />
								中</label
							>
						</div>
						<div>
							<input
								type="radio"
								name="graphic-quality"
								value="high"
								id="quality-high"
								v-model="tempGraphicQuality"
								hidden
							/>
							<label for="quality-high">
								<FontAwesomeIcon icon="square-check" v-if="tempGraphicQuality === 'high'" />
								高</label
							>
						</div>
					</div>
				</div>

				<!-- 阴影设置 -->
				<div class="setting-item">
					<div class="label">阴影</div>
					<div class="content">
						<div>
							<input
								type="radio"
								name="shadow-mode"
								:value="true"
								id="shadow-mode-true"
								v-model="tempEnableShadow"
								hidden
							/>
							<label for="shadow-mode-true">
								<FontAwesomeIcon icon="square-check" v-if="tempEnableShadow" />
								开启</label
							>
						</div>
						<div>
							<input
								type="radio"
								name="shadow-mode"
								:value="false"
								id="shadow-mode-false"
								v-model="tempEnableShadow"
								hidden
							/>
							<label for="shadow-mode-false">
								<FontAwesomeIcon icon="square-check" v-if="!tempEnableShadow" />
								关闭</label
							>
						</div>
					</div>
				</div>

				<!-- 模型动画设置 -->
				<div class="setting-item">
					<div class="label">模型动画</div>
					<div class="content">
						<div>
							<input
								type="radio"
								name="animation-mode"
								:value="true"
								id="animation-mode-true"
								v-model="tempEnableModelAnimation"
								hidden
							/>
							<label for="animation-mode-true">
								<FontAwesomeIcon icon="square-check" v-if="tempEnableModelAnimation" />
								开启</label
							>
						</div>
						<div>
							<input
								type="radio"
								name="animation-mode"
								:value="false"
								id="animation-mode-false"
								v-model="tempEnableModelAnimation"
								hidden
							/>
							<label for="animation-mode-false">
								<FontAwesomeIcon icon="square-check" v-if="!tempEnableModelAnimation" />
								关闭</label
							>
						</div>
					</div>
				</div>

				<!-- 日志管理 -->
				<div class="setting-item">
					<div class="label">日志</div>
					<div class="content log-actions">
						<button @click="logPanelVisible = true" class="btn-small log-button">查看日志</button>
						<button v-if="win.platformAPI?.openLogsFolder" @click="openLogsFolder" class="btn-small log-button">
							打开日志文件夹
						</button>
					</div>
				</div>

				<!-- 本地地图仓库（仅 Electron 平台） -->
				<div v-if="hasLocalMapRepository" class="setting-item">
					<div class="label">本地地图</div>
					<div class="content map-repository-actions">
						<button @click="handleImportLocalMap" class="btn-small">导入地图</button>
						<button @click="handleOpenLocalMapDirectory" class="btn-small">打开目录</button>
						<button @click="handleScanLocalMaps" class="btn-small">重新扫描</button>
						<span v-if="localMapDirectoryStatus" class="map-directory-status">
							{{
								!localMapDirectoryStatus.readable
									? "目录不可访问"
									: localMapDirectoryStatus.writable
										? "目录可读写"
										: "目录不可写"
							}}
						</span>
					</div>
				</div>

				<div class="setting-item">
					<div class="label">AI</div>
					<div class="content setting-link-content">
						<button @click="openAISettings" class="btn-small setting-link-button">{{ aiEntryLabel }}</button>
					</div>
				</div>

				<!-- 开发者工具（仅开发模式） -->
				<div v-if="win.platformAPI?.openInspector" class="setting-item">
					<div class="label">开发者</div>
					<div class="content">
						<button @click="openInspector" class="btn-purple">打开 游戏进程控制台</button>
					</div>
				</div>

				<!-- 游戏控制（暂停/继续、退出） -->
				<div class="setting-item" v-if="route.name === 'game'">
					<div class="label">游戏</div>
					<div class="content">
						<button @click="handleTogglePause" class="btn-small">
							<FontAwesomeIcon :icon="isGamePaused ? 'play' : 'pause'" style="margin-right: 0.3rem" />
							{{ isGamePaused ? "继续游戏" : "暂停游戏" }}
						</button>
						<button @click="handleExitGame" class="btn-red">
							<FontAwesomeIcon icon="right-from-bracket" style="margin-right: 0.3rem" />
							退出游戏
						</button>
					</div>
				</div>

				<!-- 应用按钮 -->
				<div class="setting-item apply-button-item">
					<button @click="applySettings" class="apply-button" :disabled="!hasChanges">应用设置</button>
				</div>
			</div>
		</div>
	</FpDialog>

	<!-- 日志面板 -->
	<LogPanel v-model:visible="logPanelVisible" />

	<AiSettingPanel v-if="!hasStandaloneAIConsole" v-model:visible="aiSettingVisible" />
</template>

<style lang="scss" scoped>
.setting-button {
	height: 2.5rem;
	width: 2.5rem;
	border-radius: 0.5rem;
	font-size: 1.1rem;
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 0.4rem;
}
.setting-container {
	display: flex;
	align-items: center;
	color: var(--fp-color-primary);
	user-select: none; /* 防止文本被选中 */

	& > .setting-list {
		display: flex;
		flex-direction: column;
		width: 100%;
		gap: 0.8rem;

		& > .setting-item {
			display: flex;
			justify-content: center;
			font-size: 1.1rem;
			background-color: rgba(255, 255, 255, 0.75);
			border-radius: 0.5rem;
			padding: 0.8rem;
			box-sizing: border-box;
			box-shadow: var(--fp-shadow-md);
			overflow: hidden;
			position: relative;

			& > div {
				display: inline-block;
			}

			& > .label {
				width: 30%;
				text-align: center;
				display: flex;
				align-items: center;
				justify-content: center;
			}
			& > .content {
				flex: 1;
				font-size: 1rem;
				display: flex;
				justify-content: space-around;
				align-items: center;

				& input[type="radio"]:checked + label {
					color: var(--fp-color-primary);
				}

				& label {
					padding: 0.2rem;
					cursor: pointer;
					color: var(--fp-color-tertiary);
				}

				// 日志按钮样式
				&.log-actions {
					gap: 0.5rem;
					justify-content: center;

					.log-button {
						flex: 0 0 auto;
					}


				}

				// 音量控制样式
				&.volume-control {
					gap: 0.2rem;
					align-items: center;

					& .control-icon {
						font-size: 1.2rem;
						cursor: pointer;
						transition: all 0.2s;
						padding: 0.4rem;
						border-radius: 0.4rem;
						background: rgba(255, 255, 255, 0.5);
						flex-shrink: 0;
						width: 2rem; /* 固定宽度 */
						height: 2rem; /* 固定高度 */
						display: inline-flex; /* 确保内容居中 */
						align-items: center; /* 垂直居中 */
						justify-content: center; /* 水平居中 */
						outline: none; /* 移除 focus 边框 */
						box-sizing: border-box; /* 确保内边距不影响总尺寸 */

						/* 确保内部 SVG 图标不溢出 */
						& :deep(svg) {
							width: 1em;
							height: 1em;
							max-width: 1em;
							max-height: 1em;
							display: block;
						}

						&:hover:not(.disabled) {
							transform: scale(1.15);
							background: rgba(255, 255, 255, 0.8);
							box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.1);
						}

						&:active:not(.disabled) {
							transform: scale(1);
						}

						&.disabled {
							opacity: 0.3;
							cursor: not-allowed;
							pointer-events: none; /* 禁用点击事件 */
						}

						&.decrease,
						&.increase {
							color: var(--fp-color-primary);
						}

						&.mute {
							color: var(--fp-color-tertiary);
							margin-left: 0.5rem; /* 静音图标稍微离远一点 */

							&.muted {
								color: #ff4d4f;
							}

							&:hover {
								background: rgba(255, 77, 79, 0.1);
							}
						}
					}

					& .volume-value {
						min-width: 3.5rem;
						text-align: center;
						font-weight: 500;
						color: var(--fp-color-primary);
						font-size: 1.1rem;
						margin: 0 0.1rem;
					}
				}

				&.map-repository-actions {
					gap: 0.5rem;
					justify-content: center;
					flex-wrap: wrap;

					.map-directory-status {
						width: 100%;
						font-size: 0.8rem;
						text-align: center;
						color: var(--fp-color-tertiary);
					}
				}

				&.setting-link-content {
					justify-content: center;

					.setting-link-button {
						flex: 0 0 auto;
					}
				}
			}

			// 音量设置项特殊样式
			&.volume-setting {
				.label {
					gap: 0.2rem;
				}
			}

			.ban-mask {
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				background-color: rgba(255, 255, 255, 0.75);
				z-index: 100;
				display: flex;
				justify-content: center;
				align-items: center;
				color: #777777;
			}

			// 应用按钮项
			&.apply-button-item {
				background-color: transparent;
				box-shadow: none;
				padding: 0;

				.apply-button {
					width: 100%;
					background: var(--fp-color-primary);
					color: white;
					border: none;
					border-radius: 0.5rem;
					padding: 0.8rem;
					font-size: 1.1rem;
					font-weight: bold;
					cursor: pointer;
					transition: all 0.3s;

					&:hover:not(:disabled) {
						opacity: 0.9;
						transform: translateY(-0.125rem);
						box-shadow: 0 0.25rem 0.75rem rgba(0, 0, 0, 0.15);
					}

					&:active:not(:disabled) {
						transform: translateY(0);
					}

					&:disabled {
						opacity: 0.4;
						cursor: not-allowed;
						background: var(--fp-color-tertiary);
					}
				}
			}
		}
	}

	// 设置面板中的按钮字体大小
	.content .btn-purple,
	.content .btn-red {
		font-size: 0.9rem;
	}
}
</style>

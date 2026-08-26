<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import FpMessage from "@src/components/utils/fp-message";

// 定义状态类型
type UpdateStatus = "checking" | "available" | "downloading" | "downloaded" | "error";
type UpdateKind = "web" | "native";
type ErrorAction = "download" | "install" | "open-external";

// 响应式数据
const visible = ref(false);
const status = ref<UpdateStatus>();
const version = ref("");
const releaseNote = ref("");
const downloadPercent = ref(0);
const downloadSpeed = ref("");
const downloadTransferred = ref("");
const downloadTotal = ref("");
const errorMsg = ref("");
const errorLink = ref("");
const updateKind = ref<UpdateKind>("web");
const errorAction = ref<ErrorAction>("download");

let removeListener: (() => void) | null = null;

// 动态计算弹窗标题
const title = computed(() => {
	switch (status.value) {
		case "available":
			return "✨ 发现新版本";
		case "downloading":
			return "🚀 正在更新...";
		case "downloaded":
			return "✅ 准备就绪";
		case "error":
			return "❌ 更新失败";
		default:
			return "系统更新";
	}
});

// --- 工具函数 ---

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const val = bytes / Math.pow(1024, i);
	return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSecond: number): string {
	if (bytesPerSecond === 0) return "-";
	return `${formatBytes(bytesPerSecond)}/s`;
}

// --- 核心逻辑 ---

const startDownload = () => {
	status.value = "downloading";
	window.updateAPI.startDownload();
};

const install = () => {
	window.updateAPI.quitAndInstall();
};

const close = () => {
	visible.value = false;
};

const triggerPrimaryAction = () => {
	if (status.value === "downloaded" || (status.value === "error" && errorAction.value === "install")) {
		install();
		return;
	}
	startDownload();
};

const primaryActionText = computed(() => {
	if (status.value === "error") {
		if (errorAction.value === "install") return "继续安装";
		if (errorAction.value === "open-external") return "再次打开下载链接";
		return "重试";
	}
	if (status.value === "downloaded") return updateKind.value === "native" ? "立即安装" : "立即重启";
	return updateKind.value === "native" ? "下载底座更新" : "立即更新";
});

onMounted(() => {
	if (window.updateAPI) {
		status.value = "checking";
		// 捕获 checkForUpdate 的错误，避免被 unhandledrejection 捕获
		window.updateAPI.checkForUpdate().catch((err) => {
			// 错误会通过 onUpdateStatus 事件处理，这里只需要捕获避免未处理
		});

		removeListener = window.updateAPI.onUpdateStatus((data: any) => {
			switch (data.status) {
				case "available":
					status.value = "available";
					updateKind.value = (data.info.kind as UpdateKind) || "web";
					errorAction.value = "download";
					errorLink.value = "";
					version.value = data.info.version;
					releaseNote.value = (data.info.releaseNotes as string) || "修复了一些已知问题，优化了游戏体验。";
					visible.value = true;
					break;

				case "progress":
					status.value = "downloading";
					updateKind.value = (data.progress.kind as UpdateKind) || updateKind.value;
					errorAction.value = "download";
					errorLink.value = "";
					downloadPercent.value = Math.floor(data.progress.percent);
					downloadSpeed.value = formatSpeed(data.progress.bytesPerSecond);
					downloadTransferred.value = formatBytes(data.progress.transferred);
					downloadTotal.value = formatBytes(data.progress.total);
					if (!visible.value) visible.value = true;
					break;

				case "downloaded":
					status.value = "downloaded";
					updateKind.value = (data.info?.kind as UpdateKind) || updateKind.value;
					errorAction.value = "install";
					errorLink.value = "";
					visible.value = true;
					break;

				case "error":
					const errorDetail = data.error || "未知原因";
					errorAction.value = (data.action as ErrorAction) || (status.value === "downloaded" ? "install" : "download");
					errorLink.value = (data.downloadUrl as string) || "";

					if (
						errorDetail.includes("底座")
						|| errorDetail.includes("安装包")
						|| errorDetail.includes("安装器")
						|| errorDetail.includes("未知来源")
					) {
						status.value = "error";
						errorMsg.value = errorDetail;
						visible.value = true;
					} else if (status.value === "downloading") {
						status.value = "error";
						errorMsg.value = "网络连接中断，请稍后重试。";
					} else if (errorDetail.includes("所有更新源")) {
						// 所有源均失败：在弹窗中展示完整信息
						status.value = "error";
						errorMsg.value = errorDetail;
						visible.value = true;
					} else {
						status.value = "error";
						// 404 错误表示找不到更新文件，实事求是地显示
						if (errorDetail.includes("404")) {
							FpMessage.error("检查更新失败: 未找到更新文件 (404)");
						} else {
							FpMessage.error(`检查更新失败: ${errorDetail}`);
						}
					}
					break;

				case "checking":
					status.value = "checking";
					break;
			}
		});
	}
});

onUnmounted(() => {
	if (removeListener) removeListener();
});
</script>

<template>
	<FpDialog
		v-model:visible="visible"
		:title="title"
		:closable="status !== 'downloading'"
		:hidden-footer="true"
		append-to-body
		style="width: 25rem; max-width: 90vw"
	>
		<div v-if="status === 'available'" class="scene-box">
			<div class="version-tag">版本: {{ version }}</div>
			<div class="note-box">
				<div class="note-label">更新内容：</div>
				<div class="note-text" v-html="releaseNote"></div>
			</div>
		</div>

		<div v-if="status === 'downloading'" class="scene-box centered">
			<div class="progress-wrapper">
				<div class="progress-track">
					<div class="progress-fill" :style="{ width: downloadPercent + '%' }"></div>
				</div>
				<span class="progress-text">{{ downloadPercent }}%</span>
			</div>
			<p class="info-text">{{ downloadTransferred }} / {{ downloadTotal }} — {{ downloadSpeed }}</p>
			<p class="sub-text">
				{{ updateKind === "native" ? "正在下载客户端底座，请勿关闭游戏..." : "正在下载资源，请勿关闭游戏..." }}
			</p>
		</div>

		<div v-if="status === 'downloaded'" class="scene-box centered">
			<div class="icon-success">
				<FontAwesomeIcon icon="check-circle" />
			</div>
			<p class="main-text">{{ updateKind === "native" ? "安装包已下载完成" : "更新包已就绪" }}</p>
			<p class="sub-text">{{ updateKind === "native" ? "点击下方按钮拉起系统安装器" : "重启游戏即可生效" }}</p>
		</div>

		<div v-if="status === 'error'" class="scene-box centered">
			<p class="error-text">{{ errorMsg }}</p>
			<p v-if="errorLink" class="link-label">下载链接：</p>
			<p v-if="errorLink" class="link-text">{{ errorLink }}</p>
		</div>

		<div v-if="status !== 'downloading'" class="custom-footer" :class="{ 'has-separator': status === 'available' }">
			<button v-if="status === 'available'" class="btn-gray" @click="close">稍后提醒</button>
			<button v-if="status === 'available' || status === 'error'" class="btn-theme" @click="triggerPrimaryAction">
				{{ primaryActionText }}
			</button>
			<button v-if="status === 'downloaded'" class="btn-theme" @click="install">{{ primaryActionText }}</button>
		</div>
	</FpDialog>
</template>

<style lang="scss" scoped>
// 通用布局
.scene-box {
	&.centered {
		text-align: center;
		padding: 1rem 0;
	}
}

// 1. 版本信息样式
.version-tag {
	display: inline-block;
	background-color: var(--fp-color-tertiary); // 复用你的主题色
	color: white;
	padding: 0.2rem 0.6rem;
	border-radius: 0.25rem;
	font-size: 0.9rem;
	margin-bottom: 1rem;
	box-shadow: 0.125rem 0.125rem 0.3125rem rgba(0, 0, 0, 0.2);
}

.note-box {
	background-color: rgba(0, 0, 0, 0.03);
	border-radius: 0.5rem;
	padding: 1rem;
	border: 0.0625rem solid rgba(0, 0, 0, 0.05);

	.note-label {
		margin-bottom: 0.5rem;
		color: #333;
	}
	.note-text {
		font-size: 0.95rem;
		color: #555;
		line-height: 1.6;
		white-space: pre-wrap; // 保留换行符
		max-height: 9.375rem;
		overflow-y: auto;
	}
}

// 2. 进度条样式
.progress-wrapper {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	margin-bottom: 0.5rem;

	.progress-track {
		flex: 1;
		height: 0.75rem;
		background-color: #eee;
		border-radius: 0.375rem;
		overflow: hidden;
		box-shadow: inset 0 0.0625rem 0.1875rem rgba(0, 0, 0, 0.1);

		.progress-fill {
			height: 100%;
			background-color: var(--fp-color-tertiary); // 保持一致
			transition: width 0.3s ease;
		}
	}
	.progress-text {
		color: var(--fp-color-tertiary);
		min-width: 3em;
	}
}

// 3. 状态文本
.icon-success {
	font-size: 3rem;
	color: #4caf50;
	margin-bottom: 1rem;
}
.main-text {
	font-size: 1.1rem;
	margin-bottom: 0.2rem;
}
.info-text {
	color: var(--fp-color-text-secondary);
	font-size: 0.85rem;
	margin-top: 0.25rem;
}

.sub-text {
	color: #888;
	font-size: 0.9rem;
}
.error-text {
	color: #ff5252;
}

.link-label {
	margin-top: 1rem;
	color: var(--fp-color-text-secondary);
	font-size: 0.85rem;
}

.link-text {
	margin-top: 0.25rem;
	word-break: break-all;
	font-size: 0.8rem;
	color: var(--fp-color-text-secondary);
	user-select: text;
}

// 4. 自定义底部按钮栏
.custom-footer {
	display: flex;
	justify-content: flex-end;
	gap: 1rem;
	padding-top: 1rem;

	&.has-separator {
		border-top: 0.0625rem solid rgba(0, 0, 0, 0.05);
	}

	button {
		border: none;
	}

	.btn-gray {
		--btn-bg: var(--fp-color-info);
	}

	.btn-theme {
		--btn-bg: var(--fp-color-tertiary);
	}
}
</style>

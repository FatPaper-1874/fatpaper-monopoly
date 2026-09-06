<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import type { GameMapChangelogEntry } from "@mine-monopoly/types";
import { useMapDataStore, useResourceStore, useVersionStore } from "@src/stores";
import { buildFpmapBuffer, exportGameMapToProductBuffer } from "@src/utils/file";
import { DEFAULT_MAP_UPLOAD_DAILY_LIMIT, DEFAULT_MAP_UPLOAD_SIZE_LIMIT_MB, getMapKeyInfo, getUploadedMapStatus, sha256Hex, uploadUserMap } from "@src/utils/map-upload";

const open = defineModel<boolean>("open", { default: false });

const mapDataStore = useMapDataStore();
const resourceStore = useResourceStore();
const versionStore = useVersionStore();

const apiKey = ref(localStorage.getItem("map-upload-api-key") || "");
const keyInfo = ref<{ username: string; quota: number | null; used: number; uploadSizeLimit: number | null; dailyUploadLimit: number | null; todayUploaded: number } | null>(null);
const mapStatus = ref<{ status: string; rejectReason: string | null; version: number; changelog: GameMapChangelogEntry[] } | null>(null);
const mapLinkError = ref<string | null>(null);
const clearingLink = ref(false);
const loadingInfo = ref(false);
const uploading = ref(false);
const uploadPercent = ref(0);
const uploadStage = ref("");

const quotaText = computed(() => {
	if (!keyInfo.value) return "未校验";
	return keyInfo.value.quota === null ? "未开通" : `${keyInfo.value.used}/${keyInfo.value.quota}`;
});

/** 上传大小限制展示（null 表示使用默认 50MB） */
const sizeLimitText = computed(() => {
	if (!keyInfo.value) return "未校验";
	const mb = keyInfo.value.uploadSizeLimit ?? DEFAULT_MAP_UPLOAD_SIZE_LIMIT_MB;
	return keyInfo.value.uploadSizeLimit === null ? `${mb} MB（默认）` : `${mb} MB`;
});

/** 今日剩余上传次数展示（null 表示使用默认 3 次/天，达到上限时为 0） */
const dailyUploadText = computed(() => {
	if (!keyInfo.value) return "未校验";
	const limit = keyInfo.value.dailyUploadLimit ?? DEFAULT_MAP_UPLOAD_DAILY_LIMIT;
	const remaining = Math.max(0, limit - keyInfo.value.todayUploaded);
	return `剩余 ${remaining} 次/天`;
});

/** 状态中文映射 */
const statusTextMap: Record<string, string> = {
	reviewing: "审核中",
	published: "已发布",
	rejected: "已驳回",
	offline: "已下架",
};

/** 状态对应样式（alert type + 文案） */
const statusStyleMap: Record<string, { type: "info" | "success" | "warning" | "error"; text: string }> = {
	reviewing: { type: "warning", text: "审核中" },
	published: { type: "success", text: "已发布" },
	rejected: { type: "error", text: "已驳回" },
	offline: { type: "info", text: "已下架" },
};

const currentStatus = computed(() => (mapStatus.value ? statusStyleMap[mapStatus.value.status] : null));

/** 审核期间禁止再次上传；今日次数达到上限时也禁止 */
const canUpload = computed(() => {
	if (mapStatus.value?.status === "reviewing") return false;
	if (keyInfo.value) {
		const limit = keyInfo.value.dailyUploadLimit ?? DEFAULT_MAP_UPLOAD_DAILY_LIMIT;
		if (keyInfo.value.todayUploaded >= limit) return false;
	}
	return true;
});

function statusText(status: string) {
	return statusTextMap[status] || status;
}

watch(open, (value) => {
	if (value && apiKey.value) void refreshInfo();
});

watch(apiKey, (value) => {
	localStorage.setItem("map-upload-api-key", value.trim());
});

/** 清空已保存的 API Key 与相关校验状态 */
function handleClearKey() {
	apiKey.value = "";
	localStorage.removeItem("map-upload-api-key");
	keyInfo.value = null;
	mapStatus.value = null;
	mapLinkError.value = null;
	message.success("已清空 API Key");
}

async function refreshInfo() {
	if (!apiKey.value.trim()) {
		message.warning("请先输入 API Key");
		return;
	}
	loadingInfo.value = true;
	mapLinkError.value = null;
	try {
		keyInfo.value = await getMapKeyInfo(apiKey.value.trim());
	} catch (e: any) {
		keyInfo.value = null;
		mapStatus.value = null;
		loadingInfo.value = false;
		message.error(formatUploadError(e));
		return;
	}
	if (mapDataStore.serverMapId) {
		try {
			mapStatus.value = await getUploadedMapStatus(apiKey.value.trim(), mapDataStore.serverMapId);
			await syncChangelogFromServer(mapStatus.value.changelog ?? []);
		} catch (e: any) {
			mapStatus.value = null;
			if (e?.status === 404) {
				mapLinkError.value = "该地图关联的服务器记录不存在（可能是他人分享或旧环境的地图文件），上传将被视为新地图";
			} else if (e?.status === 403) {
				mapLinkError.value = "该地图不属于当前 key 绑定的用户，无法更新";
			} else {
				mapLinkError.value = formatUploadError(e);
			}
		}
	} else {
		mapStatus.value = null;
	}
	loadingInfo.value = false;
}

/**
 * 将服务器已发布的更新日志历史合并写回本地地图文件：
 * - 按版本号去重追加服务器历史（以服务器为准，仅补缺失条目）
 * - 若本次待发布日志已固化进服务器历史（内容一致），清空本地草稿
 */
async function syncChangelogFromServer(serverLogs: GameMapChangelogEntry[]) {
	if (!serverLogs || serverLogs.length === 0) return;
	const localLogs = mapDataStore.info.changelog ?? [];
	const merged = [...localLogs];
	for (const entry of serverLogs) {
		if (!merged.some((l) => l.version === entry.version)) merged.push(entry);
	}
	merged.sort((a, b) => a.version - b.version);
	mapDataStore.info.changelog = merged;

	// 本次待发布日志已被审核通过并固化进历史时，清空本地草稿
	const pending = (mapDataStore.info.pendingChangelog || "").trim();
	const latestServer = serverLogs[serverLogs.length - 1];
	if (pending && latestServer && latestServer.content === pending) {
		mapDataStore.info.pendingChangelog = "";
	}

	// 持久化到地图文件（目录格式生效）
	if (versionStore.isDirFormat && versionStore.mapDir) {
		await versionStore.saveCurrent("sync: 同步服务器更新日志历史");
	}
}

/** 清除当前地图的 Server Map ID，后续上传将作为新地图处理 */
async function clearServerMapLink() {
	clearingLink.value = true;
	try {
		mapDataStore.serverMapId = "";
		mapLinkError.value = null;
		mapStatus.value = null;
		if (versionStore.isDirFormat && versionStore.mapDir) {
			await versionStore.saveCurrent("save: 清除 serverMapId 关联");
		}
		message.success("已清除 Server Map ID，后续将作为新图上传");
		if (apiKey.value.trim()) await refreshInfo();
	} finally {
		clearingLink.value = false;
	}
}

async function getCoverFile() {
	const coverImageId = mapDataStore.info.coverImageId;
	if (!coverImageId) return null;
	const cover = resourceStore.images.find((image) => image.id === coverImageId);
	if (!cover) return null;
	const response = await fetch(cover.url);
	if (!response.ok) throw new Error("封面图片加载失败");
	const buffer = await response.arrayBuffer();
	const ext = cover.fileType || "png";
	const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
	return new File([buffer], `cover.${ext}`, { type: mimeType });
}

function formatUploadError(error: any) {
	if (error?.status === 429) return `今日上传次数已达上限（${error.data?.used ?? "?"}/${error.data?.limit ?? "?"}），请明天再试或联系管理员重置`;
	if (error?.status === 413 && error.data?.limit !== undefined) return `上传文件超过大小限制（${error.data.limit} MB）`;
	if (error?.status === 413) return `超出地图配额：${error.data?.used ?? "?"}/${error.data?.quota ?? "?"}`;
	if (error?.status === 409) return "该地图正在审核中，无法再次上传，请等待审核结果";
	if (error?.status === 403) return "该地图不属于当前 key 绑定的用户，无法更新（存量地图未绑定创作者）";
	if (error?.status === 422) return "地图文件校验失败，请确认是 .mmmap 文件";
	if (error?.status === 401) return "API Key 无效或已吊销";
	return error?.message || "上传失败";
}

async function handleUpload() {
	if (!apiKey.value.trim()) {
		message.warning("请先输入 API Key");
		return;
	}
	if (mapStatus.value?.status === "reviewing") {
		message.warning("当前地图正在审核中，无法再次上传，请等待审核结果");
		return;
	}
	uploading.value = true;
	uploadPercent.value = 0;
	uploadStage.value = "导出地图";
	try {
		const mapBuffer = await exportGameMapToProductBuffer(mapDataStore.id, mapDataStore.$state, (stage, percent) => {
			uploadStage.value = stage;
			uploadPercent.value = Math.min(70, percent);
		});
		uploadStage.value = "导出源文件";
		const sourceBuffer = await buildFpmapBuffer(mapDataStore.id, mapDataStore.$state);
		// 上传前预检：仅在已获取 key 信息（确切限制）时拦截超限，避免未知限制下误拦截；服务端始终按实际配置兜底
		if (keyInfo.value) {
			const limitMb = keyInfo.value.uploadSizeLimit ?? DEFAULT_MAP_UPLOAD_SIZE_LIMIT_MB;
			const limitBytes = limitMb * 1024 * 1024;
			if (mapBuffer.byteLength > limitBytes || sourceBuffer.byteLength > limitBytes) {
				message.error(`地图文件超过大小限制（${limitMb} MB），请精简地图后重试`);
				return;
			}
		}
		const baseName = mapDataStore.info.name || mapDataStore.id;
		const formData = new FormData();
		formData.append("game-map", new File([mapBuffer.slice().buffer], `${baseName}.mmmap`, { type: "application/octet-stream" }));
		formData.append("source-map", new File([sourceBuffer.slice().buffer], `${baseName}.fpmap`, { type: "application/octet-stream" }));
		const coverFile = await getCoverFile();
		if (coverFile) formData.append("cover-image", coverFile);
		formData.append("name", mapDataStore.info.name);
		formData.append("version", mapDataStore.info.version);
		formData.append("description", mapDataStore.info.description || "");
		formData.append("changelog", mapDataStore.info.pendingChangelog || "");
		formData.append("hash", await sha256Hex(mapBuffer));
		if (mapDataStore.serverMapId) formData.append("server-map-id", mapDataStore.serverMapId);

		uploadStage.value = "上传中";
		const result = await uploadUserMap(apiKey.value.trim(), formData, (percent) => {
			uploadPercent.value = 80 + Math.round(percent * 0.2);
		});
		mapDataStore.serverMapId = result.serverMapId;
		if (versionStore.isDirFormat && versionStore.mapDir) {
			await versionStore.saveCurrent("save: 上传地图后记录 serverMapId");
		}
		message.success("地图已提交审核");
		await refreshInfo();
	} catch (e: any) {
		message.error(formatUploadError(e));
	} finally {
		uploading.value = false;
		uploadStage.value = "";
	}
}
</script>

<template>
	<a-modal v-model:open="open" title="上传地图" :footer="null" width="520px" destroyOnClose>
		<a-space direction="vertical" style="width: 100%">
			<a-alert v-if="!apiKey.trim()" type="info" show-icon class="no-key-tip">
				<template #message>
					<div>
						地图上传需要有效的 API Key。请加入 <strong>MineMonopoly 官方群聊</strong>（群号
						<a-typography-text :copyable="{ text: '643254778' }" class="group-no">
							<template #copyableTooltip="{ copied }">{{ copied ? "已复制" : "复制群号" }}</template>
							643254778
						</a-typography-text>
						），联系群主 <strong>Fat_Paper</strong> 获取。
					</div>
				</template>
			</a-alert>
			<a-input-password v-model:value="apiKey" placeholder="输入 mk_ 开头的 API Key" />
			<a-space>
				<a-button :loading="loadingInfo" @click="refreshInfo">校验 Key / 刷新状态</a-button>
				<a-button danger :disabled="!apiKey.trim()" @click="handleClearKey">清空 Key</a-button>
			</a-space>

			<a-alert v-if="mapDataStore.serverMapId" type="info" show-icon>
				<template #message>
					当前地图已关联 Server Map ID：
					<a-typography-text :copyable="{ text: mapDataStore.serverMapId }">{{ mapDataStore.serverMapId }}</a-typography-text>
				</template>
				<template #action>
					<a-popconfirm
						title="确定清除当前地图的 Server Map ID 吗？"
						description="清除后下次上传会作为新地图提交，无法再更新原地图。"
						ok-text="清除"
						cancel-text="取消"
						@confirm="clearServerMapLink"
					>
						<a-button danger size="small" :loading="clearingLink">清除</a-button>
					</a-popconfirm>
				</template>
			</a-alert>

			<a-descriptions v-if="keyInfo" size="small" bordered :column="1">
				<a-descriptions-item label="绑定用户">{{ keyInfo.username }}</a-descriptions-item>
				<a-descriptions-item label="地图配额">{{ quotaText }}</a-descriptions-item>
				<a-descriptions-item label="上传大小限制">{{ sizeLimitText }}</a-descriptions-item>
				<a-descriptions-item label="今日剩余次数">{{ dailyUploadText }}</a-descriptions-item>
			</a-descriptions>

			<a-alert v-if="mapStatus" :type="currentStatus?.type ?? 'info'" show-icon>
				<template #message>
					<span class="status-line">
						审核状态：<span class="status-tag">{{ currentStatus?.text ?? statusText(mapStatus.status) }}</span>，已发布版本：V{{ mapStatus.version }}
						<span v-if="mapStatus.rejectReason" class="reject-reason">，驳回原因：{{ mapStatus.rejectReason }}</span>
					</span>
				</template>
				<template v-if="mapStatus.status === 'reviewing'" #action>
					<span class="reviewing-tip">审核期间不可再次上传</span>
				</template>
			</a-alert>

			<a-alert v-if="mapLinkError" type="warning" show-icon>
				<template #message>{{ mapLinkError }}。可使用上方“清除”按钮解除关联后作为新图上传。</template>
			</a-alert>

			<a-progress v-if="uploading" :percent="uploadPercent" :status="uploadPercent >= 100 ? 'success' : 'active'" />
			<div v-if="uploadStage">{{ uploadStage }}</div>

			<div v-if="keyInfo && keyInfo.todayUploaded >= (keyInfo.dailyUploadLimit ?? DEFAULT_MAP_UPLOAD_DAILY_LIMIT)" class="daily-limit-tip">
				今日上传次数已达上限，请明天再试或联系管理员重置
			</div>

			<a-button type="primary" block :loading="uploading" :disabled="!canUpload" @click="handleUpload">上传并提交审核</a-button>
		</a-space>
	</a-modal>
</template>

<style lang="scss" scoped>
.no-key-tip {
	.no-key-title {
		font-weight: 600;
		margin-bottom: 2px;
	}

	.group-no {
		color: #1677ff;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	:deep(.ant-typography-copy) {
		color: #1677ff;
		margin-left: 2px;
	}
}

.daily-limit-tip {
	color: #faad14;
	font-size: 12px;
	margin-bottom: 6px;
}

.status-line {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.status-tag {
	font-weight: 600;
}

.reject-reason {
	font-weight: 600;
}

.reviewing-tip {
	color: #faad14;
	font-size: 12px;
}
</style>


<script setup lang="ts">
import { ref, computed, watch } from "vue";
import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
import { FPMessageBox } from "@src/components/utils/fp-message-box";
import FpMessage from "@mine-monopoly/ui/fp-message";
import { useSettig } from "@src/store";

/**
 * Props
 */
const props = withDefaults(
	defineProps<{
		visible?: boolean;
	}>(),
	{
		visible: false,
	},
);

/**
 * Emits
 */
const emits = defineEmits<{
	"update:visible": [value: boolean];
}>();

const win = window as any;
const settingStore = useSettig();

/** 最大缓存（MB），调整后即时生效 */
const maxSizeMB = ref(settingStore.mapCacheMaxSizeMB);
/** 缓存占用统计 */
const cacheStat = ref<{ size: number; count: number }>({ size: 0, count: 0 });

/** 字节数格式化显示 */
const formatSize = (bytes: number) => {
	if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${Math.max(0, Math.floor(bytes / 1024))} KB`;
};

/** 占用比例（0~100） */
const usedPercent = computed(() => {
	const total = maxSizeMB.value * 1024 * 1024;
	return total > 0 ? Math.min(100, Math.round((cacheStat.value.size / total) * 100)) : 0;
});

/** 刷新缓存占用统计（仅 Electron 平台） */
const loadCacheStat = async () => {
	if (!win.platformAPI?.getMapCacheStat) return;
	try {
		cacheStat.value = await win.platformAPI.getMapCacheStat();
	} catch (e) {
		console.warn("[缓存] 获取缓存占用失败:", e);
	}
};

/** 调整最大缓存（100MB 步幅，范围 100MB ~ 10GB），仅修改临时值，点击保存后生效 */
const adjustMaxSize = (delta: number) => {
	maxSizeMB.value = Math.min(10240, Math.max(100, maxSizeMB.value + delta));
};

/** 是否存在未保存的修改 */
const hasChanges = computed(() => maxSizeMB.value !== settingStore.mapCacheMaxSizeMB);

/** 保存最大缓存设置（footer 确认按钮触发，dialog 会自行关闭） */
const saveMaxSize = () => {
	settingStore.mapCacheMaxSizeMB = maxSizeMB.value;
	try {
		localStorage.setItem("mapCacheMaxSizeMB", String(maxSizeMB.value));
	} catch (e) {
		console.warn("[缓存] localStorage 保存缓存上限失败:", e);
	}
	FpMessage({ type: "success", message: "缓存设置已保存" });
};

const openFolder = () => {
	win.platformAPI
		?.openMapCacheFolder?.()
		.then((path: string) => {
		})
		.catch(() => {
			FpMessage({ type: "error", message: "无法打开缓存文件夹" });
		});
};

const clearCache = async () => {
	try {
		await FPMessageBox({
			title: "清空地图缓存",
			content: `确定清空全部地图缓存（当前占用 ${formatSize(cacheStat.value.size)}）？清空后首次进入地图需要重新下载。`,
			confirmText: "确定清空",
			cancelText: "取消",
			showCancel: true,
		});
	} catch {
		return; // 用户取消
	}
	try {
		cacheStat.value = await win.platformAPI!.clearMapCache!();
		FpMessage({ type: "success", message: "缓存已清空" });
	} catch (e) {
		console.warn("[缓存] 清空缓存失败:", e);
		FpMessage({ type: "error", message: "清空缓存失败" });
	}
};

// 打开面板时同步设置与占用
watch(
	() => props.visible,
	(isOpen) => {
		if (isOpen) {
			settingStore.initMapCacheMaxSize();
			maxSizeMB.value = settingStore.mapCacheMaxSizeMB;
			loadCacheStat();
		}
	},
);
</script>

<template>
	<FpDialog
		:visible="visible"
		@update:visible="emits('update:visible', $event)"
		title="缓存管理"
		:submit-disable="!hasChanges"
		confirm-text="保存设置"
		cancel-text="取消"
		@submit="saveMaxSize"
		:style="{ width: '34rem' }"
	>
		<div class="cache-panel">
			<!-- 最大缓存 -->
			<div class="cache-item">
				<div class="label">最大缓存</div>
				<div class="content">
					<div class="size-control">
						<button class="btn-small size-btn" @click="adjustMaxSize(-100)" :disabled="maxSizeMB <= 100">−</button>
						<span class="size-value">{{ maxSizeMB }} MB</span>
						<button class="btn-small size-btn" @click="adjustMaxSize(100)" :disabled="maxSizeMB >= 10240">+</button>
					</div>
				</div>
			</div>

			<!-- 占用概览 -->
			<div class="cache-item">
				<div class="label">占用</div>
				<div class="content overview">
					<div class="usage-bar">
						<div class="usage-fill" :style="{ width: usedPercent + '%' }"></div>
					</div>
					<span class="usage-text">{{ formatSize(cacheStat.size) }} / {{ formatSize(maxSizeMB * 1024 * 1024) }}（{{ cacheStat.count }} 个文件）</span>
				</div>
			</div>

			<!-- 操作 -->
			<div class="cache-item">
				<div class="label">操作</div>
				<div class="content actions">
					<button v-if="win.platformAPI?.openMapCacheFolder" class="btn-small" @click="openFolder">打开文件夹</button>
					<button class="btn-small btn-danger" @click="clearCache">清空缓存</button>
				</div>
			</div>
		</div>
	</FpDialog>
</template>

<style lang="scss" scoped>
.cache-panel {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	user-select: none;
}

.cache-item {
	display: flex;
	align-items: center;
	gap: 1rem;

	.label {
		flex: 0 0 5rem;
		font-size: 1.05rem;
		color: var(--fp-color-primary);
	}

	.content {
		flex: 1;
		display: flex;
		align-items: center;
	}

	// 步进调节
	.size-control {
		display: flex;
		align-items: center;
		gap: 0.8rem;

		.size-value {
			min-width: 6rem;
			text-align: center;
			font-size: 1.1rem;
			color: var(--fp-color-primary);
		}

		// 长宽相等的方形按钮，文字水平垂直居中
		.size-btn {
			width: 2.2rem;
			height: 2.2rem;
			padding: 0;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			text-align: center;
		}
	}

	// 占用概览
	.overview {
		flex-direction: column;
		align-items: stretch;
		gap: 0.4rem;

		.usage-bar {
			width: 100%;
			height: 0.6rem;
			border-radius: 0.3rem;
			background: rgba(0, 0, 0, 0.1);
			overflow: hidden;

			.usage-fill {
				height: 100%;
				border-radius: 0.3rem;
				background: linear-gradient(90deg, var(--fp-color-primary), var(--fp-color-secondary));
				transition: width 0.3s ease;
			}
		}

		.usage-text {
			font-size: 0.9rem;
			color: var(--fp-color-tertiary);
			text-align: right;
		}
	}

	// 操作按钮
	.actions {
		gap: 0.8rem;
	}
}
</style>

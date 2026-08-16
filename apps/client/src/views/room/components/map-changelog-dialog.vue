<script setup lang="ts">
import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
import { GameMapInDb } from "@mine-monopoly/types";
import { computed } from "vue";
import { marked } from "marked";

const visible = defineModel<boolean>("visible", { default: false });

const { map } = defineProps<{ map: GameMapInDb }>();

/** 历史日志按版本倒序展示（最新在上） */
const historyLogs = computed(() => {
	const logs = map.changelog ?? [];
	return [...logs].sort((a, b) => b.version - a.version);
});

/** 单条日志 Markdown 渲染 */
function renderLogHtml(content: string) {
	if (!content?.trim()) return "<p>（本条无具体内容）</p>";
	return marked.parse(content) as string;
}
</script>

<template>
	<Teleport to="body">
		<FpDialog
			:style="'width: 60%; max-width: 37.5rem;'"
			v-model:visible="visible"
			:cancel-text="undefined"
			confirm-text="关闭"
		>
			<template #title>"{{ map.name }}"更新日志</template>
			<div class="changelog-container">
				<div class="changelog-meta">
					<span>当前版本: v{{ map.version }}</span>
					<span>作者: {{ map.author }}</span>
				</div>
				<div v-if="historyLogs.length === 0" class="changelog-empty">暂无更新记录</div>
				<div v-else class="changelog-list">
					<div v-for="log in historyLogs" :key="log.version" class="changelog-item">
						<div class="changelog-item-head">
							<span class="version-badge">v{{ log.version }}</span>
						</div>
						<div class="log-content markdown-content" v-html="renderLogHtml(log.content)"></div>
					</div>
				</div>
			</div>
		</FpDialog>
	</Teleport>
</template>

<style lang="scss" scoped>
.changelog-container {
	display: flex;
	flex-direction: column;
	gap: 1rem;

	.changelog-meta {
		display: flex;
		justify-content: flex-start;
		gap: 1.5rem;
		color: #5e5e5e;
		font-size: 0.9rem;

		span {
			background-color: rgba(255, 255, 255, 0.6);
			padding: 0.3rem 0.8rem;
			border-radius: 0.25rem;
		}
	}

	.changelog-empty {
		color: #999;
		text-align: center;
		padding: 2rem 0;
	}

	.changelog-list {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		max-height: 55vh;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.changelog-item {
		border-left: 0.1875rem solid var(--fp-color-secondary);
		padding-left: 1rem;

		.changelog-item-head {
			display: flex;
			align-items: center;
			gap: 0.8rem;
			margin-bottom: 0.4rem;

			.version-badge {
				font-size: 0.8rem;
				font-weight: 600;
				color: #fff;
				background-color: var(--fp-color-secondary);
				padding: 0.1rem 0.6rem;
				border-radius: 0.75rem;
			}
		}

		.log-content {
			color: #3e3e3e;
			line-height: 1.7;
			font-size: 0.9rem;
		}
	}

	// Markdown 内容样式（参考 map-info-button.vue）
	.markdown-content {
		:deep(h2),
		:deep(h3) {
			color: var(--fp-color-primary);
			margin-top: 1rem;
			margin-bottom: 0.5rem;

			&:first-child {
				margin-top: 0;
			}
		}

		:deep(p) {
			margin-bottom: 0.6rem;
		}

		:deep(ul) {
			list-style: none;
			padding-left: 0;
			margin-bottom: 0.6rem;
		}

		:deep(li) {
			line-height: 1.6;
			margin-bottom: 0.3rem;
			padding-left: 1em;
			text-indent: -1em;

			&::before {
				content: "- ";
				color: var(--fp-color-secondary);
			}
		}

		:deep(strong) {
			color: var(--fp-color-text-secondary);
			font-weight: 600;
		}

		:deep(code) {
			background-color: rgba(0, 0, 0, 0.05);
			padding: 0.1em 0.3em;
			border-radius: 0.1875rem;
			font-family: monospace;
			font-size: 0.9em;
		}
	}
}
</style>

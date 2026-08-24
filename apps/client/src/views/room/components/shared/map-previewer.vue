<script setup lang="ts">
import { computed, ref } from "vue";
import { GameMapInDb } from "@mine-monopoly/types";
import { env } from "@mine-monopoly/env";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import MapChangelogDialog from "@src/views/room/components/map-changelog-dialog.vue";

const { map } = defineProps<{ map: GameMapInDb }>();

const changelogVisible = ref(false);

const coverImageUrl = computed(() => {
	return map.coverUrl;
});

/** 是否有更新日志历史 */
const hasChangelog = computed(() => (map.changelog?.length ?? 0) > 0);

/** 最新一条日志（按版本倒序取第一条） */
const latestLog = computed(() => {
	const logs = map.changelog ?? [];
	if (logs.length === 0) return null;
	return [...logs].sort((a, b) => b.version - a.version)[0];
});

/** 悬停提示的纯文本预览（去除常见 Markdown 标记并截断） */
const latestLogPreview = computed(() => {
	const log = latestLog.value;
	if (!log) return "";
	const plain = log.content
		.replace(/[#>*_`~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return plain.length > 120 ? `${plain.slice(0, 120)}...` : plain;
});
</script>

<template>
	<div class="map-preview">
		<MapChangelogDialog v-model:visible="changelogVisible" :map="map" />
		<div class="map-info">
			<div class="top-area">
				<div class="name-row" :class="{ 'is-official': map.isOfficial }">
					<div class="name">{{ map.name }}</div>
					<div v-if="map.isOfficial" class="official-badge" title="官方地图">官方</div>
					<div v-else class="workshop-badge" title="创意工坊">创意工坊</div>
				</div>
				<div
					v-if="hasChangelog"
					class="changelog-entry"
					@click.stop="changelogVisible = true"
					title="查看更新日志"
				>
					<FontAwesomeIcon icon="clock-rotate-left" />
					<span class="changelog-entry-text">更新日志</span>
					<div class="changelog-tooltip">
						<div class="tooltip-head">
							<span class="tooltip-version">v{{ latestLog?.version }}</span>
							<span class="tooltip-tip">点击查看全部历史</span>
						</div>
						<div class="tooltip-content">{{ latestLogPreview }}</div>
					</div>
				</div>
			</div>
			<div class="bottom">
				<div class="version">版本: v{{ map.version }}</div>
				<span class="author-name" :class="{ 'is-official': map.isOfficial }">{{ map.author }}</span>
			</div>
		</div>
		<div class="map-cover-container">
			<img class="map-cover" :src="coverImageUrl" />
		</div>
	</div>
</template>

<style lang="scss" scoped>
.map-preview {
	width: 100%;
	height: 100%;
	border: 0.4rem solid #ffffff;
	border-radius: 1rem;
	box-sizing: border-box;
	overflow: hidden;
	position: relative;
}
.map-info {
	width: 100%;
	height: 100%;
	z-index: 100;
	position: absolute;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	padding: 0.2rem;
	box-sizing: border-box;

	& .name-row {
		display: flex;
		align-items: center;
		width: max-content;
		padding: 0.4rem 0.7rem;
		border-radius: 0.6rem;
		background-color: #4caf50;
		color: var(--fp-color-text-white);

		// 官方地图：与其他地图背景一致（默认主题色）
		&.is-official {
			background-color: var(--fp-color-secondary);
			box-shadow: none;
		}

		& .name {
			width: max-content;
			line-height: 1.2;
		}

		& .official-badge,
		& .workshop-badge {
			flex-shrink: 0;
			margin-left: 0.4rem;
			padding-left: 0.4rem;
			border-left: 0.0625rem solid rgba(255, 255, 255, 0.55);
			font-size: 0.7rem;
			line-height: 1.2;
			color: #fff;
		}
	}

	// 更新日志入口：位于地图名称下方
	.top-area {
		display: flex;
		flex-direction: column;
		align-items: flex-start;

		.changelog-entry {
			display: flex;
			align-items: center;
			gap: 0.3rem;
			width: max-content;
			margin-top: 0.3rem;
			margin-left: 0.2rem;
			padding: 0.15rem 0.5rem;
			border-radius: 0.4rem;
			font-size: 0.7rem;
			font-weight: 600;
			color: #4caf50;
			background-color: rgba(255, 255, 255, 0.9);
			cursor: pointer;
			box-shadow: 0 0.05rem 0.15rem rgba(0, 0, 0, 0.15);
			transition: background-color 0.15s;

			&:hover {
				background-color: rgba(255, 255, 255, 1);
			}

			// 悬停提示：最新一条日志，向下弹出
			.changelog-tooltip {
				display: none;
				position: absolute;
				top: calc(100% + 0.4rem);
				left: 0;
				width: 16rem;
				padding: 0.6rem 0.8rem;
				border-radius: 0.5rem;
				background-color: rgba(30, 30, 30, 0.95);
				color: #eee;
				box-shadow: 0 0.2rem 0.5rem rgba(0, 0, 0, 0.3);
				z-index: 300;
				text-align: left;

				&::after {
					content: "";
					position: absolute;
					bottom: 100%;
					left: 1.2rem;
					border: 0.35rem solid transparent;
					border-bottom-color: rgba(30, 30, 30, 0.95);
				}

				.tooltip-head {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 0.5rem;
					margin-bottom: 0.3rem;

					.tooltip-version {
						font-weight: 600;
						font-size: 0.75rem;
						color: #7ed17e;
					}

					.tooltip-tip {
						font-size: 0.65rem;
						color: #aaa;
					}
				}

				.tooltip-content {
					font-size: 0.75rem;
					line-height: 1.5;
					word-break: break-word;
					white-space: normal;
					max-height: 5rem;
					overflow: hidden;
					display: -webkit-box;
					-webkit-line-clamp: 4;
					-webkit-box-orient: vertical;
				}
			}

			&:hover .changelog-tooltip {
				display: block;
			}
		}
	}

	.bottom {
		display: flex;
		gap: 0.3rem;
		align-items: start;
		flex-direction: column;
	}

	& .version {
		width: max-content;
		padding: 0.2rem 0.3rem;
		border-radius: 0.4rem;
		font-size: 0.7rem;
		color: var(--fp-color-text-regular);
		background-color: var(--fp-color-bg-transparent);
	}

	& .author-name {
		width: max-content;
		padding: 0.2rem 0.4rem;
		border-radius: 0.3rem;
		background-color: #fff;
		color: #4caf50;
		font-size: 0.85rem;

		// 官方地图作者名：与官方地图名字背景（橙色）一致
		&.is-official {
			color: var(--fp-color-secondary);
		}
	}
}
.map-cover-container {
	width: 100%;
	height: 100%;
	display: flex;
	justify-content: center;
	align-items: center;
	background-color: #ddd;
	background-image: repeating-linear-gradient(
		45deg,
		#fffaf0 0,
		#fffaf0 0.8rem,
		#fff3d6 0.8rem,
		#fff3d6 1.6rem
	);
	padding: 0.5rem;
	box-sizing: border-box;
	position: absolute;
	left: 0;
	top: 0;

	.map-cover {
		display: block;
		width: auto;
		height: auto;
		object-fit: contain;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		margin: auto;
		border-radius: 0.6em;
	}
}
</style>

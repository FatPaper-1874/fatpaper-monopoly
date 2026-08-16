<script setup lang="ts">
import { GameMapInfo } from "@mine-monopoly/types";
import { ResourcePicker } from "@src/components/resource-picker";
import { useMapDataStore } from "@src/stores";
import { message } from "ant-design-vue";
import { Rule } from "ant-design-vue/es/form";
import { computed, reactive, ref, watch } from "vue";

const visible = defineModel({ default: false });

const mapInfoForm = reactive<GameMapInfo>({ ...useMapDataStore().info });

/** 当前激活的 Tab（basic / media / changelog） */
const activeTab = ref("basic");

/** 历史日志按版本倒序展示（最新在上） */
const historyLogs = computed(() => [...mapInfoForm.changelog].sort((a, b) => b.version - a.version));

watch(
	() => visible,
	() => {
		Object.assign(mapInfoForm, useMapDataStore().info);
	},
	{ immediate: true },
);

async function handleUpdateInfo() {
	try {
		const mapDataStore = useMapDataStore();

		// 处理背景图片
		if (mapInfoForm.backgroundImageId !== mapDataStore.info.backgroundImageId) {
			mapDataStore.setBackgroundImageId(mapInfoForm.backgroundImageId);
		}

		// 处理封面图片
		if (mapInfoForm.coverImageId !== mapDataStore.info.coverImageId) {
			mapDataStore.setCoverImageId(mapInfoForm.coverImageId);
		}

		// 更新其他信息
		mapDataStore.updateMapInfo({
			name: mapInfoForm.name,
			author: mapInfoForm.author,
			version: mapInfoForm.version,
			description: mapInfoForm.description,
			pendingChangelog: mapInfoForm.pendingChangelog,
			changelog: mapInfoForm.changelog,
		});

		message.success(`更新地图信息成功`, 1);
	} catch (e: any) {
		message.error(e.message, 1);
	}

	handleClose();
	visible.value = false;
}

async function checkVersion(_rule: Rule, value: string) {
	if (!value) {
		return Promise.reject("请输入版本号");
	}
	const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
	if (!semverRegex.test(value)) {
		return Promise.reject(`请按照"数字.数字.数字"的格式定义版本号`);
	}
}

function handleClose() {
	// ResourcePicker manages its own state
}
</script>

<template>
	<a-modal
		destroyOnClose
		@cancel="handleClose"
		:footer="null"
		width="960px"
		v-model:open="visible"
		title="地图信息"
		wrap-class-name="fixed-map-info-modal"
		centered
	>
		<a-form
			@finish="handleUpdateInfo"
			:model="mapInfoForm"
			layout="vertical"
			name="basic"
			autocomplete="off"
			class="full-height-form"
		>
			<a-tabs v-model:activeKey="activeTab" class="info-tabs">
				<a-tab-pane key="basic" tab="基本信息">
					<div class="tab-pane-body">
						<a-form-item label="地图名称" name="name" :rules="[{ required: true, message: '请输入地图名称' }]">
							<a-input v-model:value="mapInfoForm.name" placeholder="地图名称" />
						</a-form-item>

						<div class="row-inputs">
							<a-form-item
								label="地图作者"
								name="author"
								class="half-item"
								:rules="[{ required: true, message: '请输入作者名称' }]"
							>
								<a-input v-model:value="mapInfoForm.author" placeholder="作者" />
							</a-form-item>

							<a-form-item
								label="地图版本"
								name="version"
								class="half-item"
								:rules="[{ required: true, validator: checkVersion, trigger: 'change' }]"
							>
								<a-input v-model:value="mapInfoForm.version" placeholder="1.0.0" />
							</a-form-item>
						</div>

						<a-form-item label="地图说明" name="description" :rules="[{ required: true, message: '请输入地图说明' }]">
							<a-textarea
								v-model:value="mapInfoForm.description"
								:auto-size="{ minRows: 8, maxRows: 14 }"
								placeholder="请输入地图说明..."
							/>
							<a-typography-paragraph type="secondary" style="font-size: 12px; margin-top: 4px;">
								支持 Markdown 语法（# 标题、**加粗**、- 列表等）
							</a-typography-paragraph>
						</a-form-item>
					</div>
				</a-tab-pane>

				<a-tab-pane key="media" tab="媒体资源">
					<div class="tab-pane-body">
						<div class="media-row">
							<a-form-item label="地图背景" name="background-image" class="media-item">
								<ResourcePicker
									type="image"
									v-model="mapInfoForm.backgroundImageId"
								/>
							</a-form-item>

							<a-form-item label="地图封面" name="cover-image" class="media-item">
								<ResourcePicker
									type="image"
									v-model="mapInfoForm.coverImageId"
								/>
								<div class="tip-text">推荐比例 16:9</div>
							</a-form-item>
						</div>
					</div>
				</a-tab-pane>

				<a-tab-pane key="changelog" tab="更新日志">
					<div class="tab-pane-body">
						<div class="changelog-header">
							<span class="changelog-title">更新日志</span>
							<span class="changelog-subtitle">最顶上一条为本次更新内容，随下次上传提交审核；下方为已发布历史</span>
						</div>
						<a-timeline class="changelog-timeline">
							<a-timeline-item color="blue">
								<div class="changelog-item current">
									<div class="changelog-item-head">
										<span class="version-badge current-badge">本次更新</span>
									</div>
									<a-textarea
										v-model:value="mapInfoForm.pendingChangelog"
										:auto-size="{ minRows: 4, maxRows: 10 }"
										placeholder="填写本次更新的内容（可留空，如修复了哪些问题、新增了哪些玩法）..."
									/>
								</div>
							</a-timeline-item>
							<a-timeline-item v-for="log in historyLogs" :key="log.version" color="gray">
								<div class="changelog-item history">
									<div class="changelog-item-head">
										<span class="version-badge">v{{ log.version }}</span>
									</div>
									<div class="changelog-content">{{ log.content }}</div>
								</div>
							</a-timeline-item>
							<a-timeline-item v-if="historyLogs.length === 0" color="gray">
								<div class="changelog-empty">暂无已发布的更新记录</div>
							</a-timeline-item>
						</a-timeline>
					</div>
				</a-tab-pane>
			</a-tabs>

			<div class="form-footer">
				<a-button type="default" @click="handleClose">取消</a-button>
				<a-button type="primary" html-type="submit">更新信息</a-button>
			</div>
		</a-form>
	</a-modal>
</template>

<style lang="scss">
/* 固定 Modal 高度 */
.fixed-map-info-modal {
	.ant-modal-content {
		height: 640px;
		display: flex;
		flex-direction: column;
		padding: 0;
		overflow: hidden;
	}

	.ant-modal-header {
		padding: 16px 24px;
		border-bottom: 1px solid #f0f0f0;
		margin-bottom: 0;
	}

	.ant-modal-body {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		padding: 0;
	}

	.ant-modal-close {
		top: 12px;
	}
}
</style>

<style lang="scss" scoped>
.full-height-form {
	display: flex;
	flex-direction: column;
	height: 100%;
}

.info-tabs {
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;

	:deep(.ant-tabs-nav) {
		margin-bottom: 0;
		padding: 0 24px;
		flex-shrink: 0;
	}

	:deep(.ant-tabs-content-holder) {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	:deep(.ant-tabs-content) {
		height: 100%;
	}

	:deep(.ant-tabs-tabpane) {
		height: 100%;
	}
}

.tab-pane-body {
	height: 100%;
	overflow-y: auto;
	padding: 20px 24px;

	&::-webkit-scrollbar {
		width: 6px;
	}
	&::-webkit-scrollbar-thumb {
		background-color: #ddd;
		border-radius: 4px;
	}

	.row-inputs {
		display: flex;
		gap: 16px;
		.half-item {
			flex: 1;
		}
	}

	// 媒体资源：背景/封面并排，内容少无需滚动
	.media-row {
		display: flex;
		gap: 24px;

		.media-item {
			flex: 1;
			min-width: 0;
		}
	}

	.changelog-header {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 8px;

		.changelog-title {
			font-weight: 600;
			font-size: 14px;
		}

		.changelog-subtitle {
			font-size: 12px;
			color: #888;
		}
	}

	.changelog-timeline {
		margin-top: 4px;
		padding-left: 4px;

		.changelog-item {
			&.current {
				.changelog-item-head {
					margin-bottom: 6px;
				}
			}

			.changelog-item-head {
				display: flex;
				align-items: center;
				gap: 8px;
				margin-bottom: 2px;

				.version-badge {
					font-size: 12px;
					font-weight: 600;
					color: #1677ff;
					background-color: #e6f4ff;
					padding: 1px 8px;
					border-radius: 10px;

					&.current-badge {
						color: #389e0d;
						background-color: #f6ffed;
					}
				}
			}

			.changelog-content {
				font-size: 13px;
				color: #555;
				white-space: pre-wrap;
				word-break: break-word;
			}

			.changelog-empty {
				font-size: 12px;
				color: #bbb;
			}
		}
	}

	.tip-text {
		font-size: 12px;
		color: #888;
		margin-top: 8px;
		text-align: center;
	}
}

.form-footer {
	flex-shrink: 0;
	padding: 16px 24px;
	border-top: 1px solid #f0f0f0;
	background-color: #fff;
	display: flex;
	justify-content: flex-end;
	gap: 12px;
}
</style>

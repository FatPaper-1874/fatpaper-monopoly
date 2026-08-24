<script setup lang="ts">
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { lightenColor } from "@src/utils";
import { computed, ref } from "vue";
import { UserInRoomInfo } from "@mine-monopoly/types";
import FpMessage from "@mine-monopoly/ui/fp-message";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
import FpPopover from "@src/components/utils/fp-popover/fp-popover.vue";
import {
	getAIControlSnapshot,
	setAIControlPlayerBinding,
	setAIControlPlayerName,
} from "@src/core/ai/ai-control-bridge";
import { useUserInfo, useRoomInfo } from "@src/store";
import { useMapData, useResourceStore } from "@src/store/game";

const props = defineProps<{
	user: UserInRoomInfo | undefined;
	addAiButton?: boolean;
	addButtonText?: string;
	localParty?: boolean;
	localPartyAddActions?: boolean;
}>();
const emits = defineEmits(["role-select", "add-ai", "add-local-player", "spectator-toggle"]);

const user = computed(() => props.user);
const lightColor = computed(() => (user.value ? lightenColor(user.value.color, 15) : "#ffffff"));
const avatarSrc = computed(() => {
	return user.value?.avatar || "";
});

const isMe = computed(() => (user.value ? user.value.userId === useUserInfo().userId : false));
const isRoomOwner = computed(() => (user.value ? user.value.userId === useRoomInfo().ownerId : false));
const amIRoomOwner = computed(() => props.localParty || useRoomInfo().amIRoomOwner);
const isAIPlayer = computed(() => Boolean(user.value?.isAI));
const isSpectator = computed(() => Boolean(user.value?.isSpectator));
const canEnterSpectator = computed(() => Boolean(user.value) && isMe.value && isRoomOwner.value && !isSpectator.value);
const canChangeColor = computed(() => !isSpectator.value && (props.localParty || isMe.value || (amIRoomOwner.value && isAIPlayer.value)));
const canEditAI = computed(() => Boolean(user.value) && amIRoomOwner.value && isAIPlayer.value);
const canEditLocalPlayerName = computed(
	() => Boolean(props.localParty && user.value && !isAIPlayer.value && !isSpectator.value),
);

const canSelectRole = computed(() => {
	if (isSpectator.value || useMapData().roles.length === 0) return false;
	if (props.localParty) return true;
	return isMe.value || (amIRoomOwner.value && isAIPlayer.value);
});
const role = computed(() => {
	if (!user.value) return undefined;
	return useMapData().getRoleById(user.value?.roleId);
});

const roleImageUrl = computed(() => {
	if (!role.value) return undefined;
	return useResourceStore().getRecourceById(role.value.imageId)?.url;
});

const colorPickerEl = ref<HTMLInputElement | null>(null);
const localPlayerNameEditorVisible = ref(false);
const localPlayerNameSubmitting = ref(false);
const tempLocalPlayerName = ref("");
const aiEditorVisible = ref(false);
const aiEditorLoading = ref(false);
const aiEditorSubmitting = ref(false);
const tempAIName = ref("");
const initialAIName = ref("");
const tempRemoteProfileId = ref("");
const initialRemoteProfileId = ref("");
const roomDefaultProfileLabel = ref("跟随房间默认配置");
const remoteProfiles = ref<Array<{ id: string; name: string }>>([]);

const aiProfileOptions = computed(() => [{ id: "", name: roomDefaultProfileLabel.value }, ...remoteProfiles.value]);
const canSubmitLocalPlayerName = computed(() => {
	const nextName = tempLocalPlayerName.value.trim();
	return (
		canEditLocalPlayerName.value &&
		!localPlayerNameSubmitting.value &&
		Boolean(nextName) &&
		nextName !== user.value?.username
	);
});

const canSubmitAIEdit = computed(() => {
	if (!canEditAI.value || aiEditorLoading.value || aiEditorSubmitting.value) return false;
	const nextName = tempAIName.value.trim();
	if (!nextName) return false;
	return nextName !== initialAIName.value || tempRemoteProfileId.value !== initialRemoteProfileId.value;
});

function handleColorPickerClick() {
	colorPickerEl.value && colorPickerEl.value.click();
}

function handleKickOut() {
	if (!props.user) return;
	const monopolyClient = useMonopolyClient();
	monopolyClient.kickOut(props.user.userId);
}

function handleRoleSelect() {
	if (!canSelectRole.value) return;
	if (!props.user) return;
	emits("role-select", props.user);
}

function handleColorChange(e: Event) {
	if (!props.user) return;
	const target = e.target as HTMLInputElement;
	const newColor = target.value;
	const monopolyClient = useMonopolyClient();
	monopolyClient.changeColorForUser(props.user.userId, newColor);
}

function openLocalPlayerNameEditor() {
	if (!canEditLocalPlayerName.value || !props.user) return;
	tempLocalPlayerName.value = props.user.username;
	localPlayerNameEditorVisible.value = true;
}

function handleSubmitLocalPlayerName() {
	if (!props.user || !canSubmitLocalPlayerName.value) return;

	localPlayerNameSubmitting.value = true;
	try {
		const result = useMonopolyClient().updateLocalPartyPlayerName(props.user.userId, tempLocalPlayerName.value.trim());
		if (!result.success) {
			FpMessage({ type: "error", message: result.error || "修改玩家名称失败" });
			return;
		}
		localPlayerNameEditorVisible.value = false;
		FpMessage({ type: "success", message: "玩家名称已更新" });
	} finally {
		localPlayerNameSubmitting.value = false;
	}
}

function handleAddLocalPlayer() {
	emits("add-local-player");
}

function handleAddAi() {
	emits("add-ai");
}

function handleEnterSpectator() {
	emits("spectator-toggle");
}

async function openAIEditor() {
	if (!canEditAI.value || !props.user) return;

	aiEditorLoading.value = true;
	try {
		const snapshot = await getAIControlSnapshot();
		const aiPlayer = snapshot.aiPlayers.find((item) => item.userId === props.user?.userId);
		if (!aiPlayer) {
			FpMessage({ type: "error", message: "未找到对应 AI 玩家配置" });
			return;
		}

		const defaultProfile = snapshot.config.remoteProfiles?.find(
			(profile) => profile.id === snapshot.config.defaultRemoteProfileId,
		);
		roomDefaultProfileLabel.value = defaultProfile ? `跟随房间默认档案（${defaultProfile.name}）` : "跟随房间默认配置";
		remoteProfiles.value = (snapshot.config.remoteProfiles ?? []).map((profile) => ({
			id: profile.id,
			name: profile.name,
		}));
		tempAIName.value = aiPlayer.username;
		initialAIName.value = aiPlayer.username;
		tempRemoteProfileId.value = aiPlayer.binding.remoteProfileId ?? "";
		initialRemoteProfileId.value = aiPlayer.binding.remoteProfileId ?? "";
		aiEditorVisible.value = true;
	} catch (error: any) {
		FpMessage({ type: "error", message: error?.message || "读取 AI 配置失败" });
	} finally {
		aiEditorLoading.value = false;
	}
}

async function handleSubmitAIEdit() {
	if (!props.user || !canSubmitAIEdit.value) return;

	aiEditorSubmitting.value = true;
	try {
		const nextName = tempAIName.value.trim();

		if (nextName !== initialAIName.value) {
			const renameResult = await setAIControlPlayerName(props.user.userId, nextName);
			if (!renameResult.success) {
				FpMessage({ type: "error", message: renameResult.error || "修改 AI 名称失败" });
				return;
			}
		}

		if (tempRemoteProfileId.value !== initialRemoteProfileId.value) {
			const bindingResult = await setAIControlPlayerBinding(props.user.userId, {
				remoteProfileId: tempRemoteProfileId.value || undefined,
			});
			if (!bindingResult.success) {
				FpMessage({ type: "error", message: bindingResult.error || "修改 AI 档案失败" });
				return;
			}
		}

		initialAIName.value = nextName;
		initialRemoteProfileId.value = tempRemoteProfileId.value;
		aiEditorVisible.value = false;
		FpMessage({ type: "success", message: "AI 玩家配置已更新" });
	} finally {
		aiEditorSubmitting.value = false;
	}
}
</script>

<template>
	<div class="room-user-card">
		<div v-if="localPartyAddActions && !user" class="add-player-actions">
			<button type="button" class="add-ai-button" @click="handleAddLocalPlayer">
				<FontAwesomeIcon style="margin-right: 0.35rem" icon="gamepad" />
				添加本地玩家
			</button>
			<button type="button" class="add-ai-button" @click="handleAddAi">
				<FontAwesomeIcon style="margin-right: 0.35rem" icon="robot" />
				添加 AI 机器人
			</button>
		</div>
		<button v-else-if="addAiButton && !user" type="button" class="add-ai-button" @click="handleAddAi">
			<FontAwesomeIcon style="margin-right: 0.35rem" icon="robot" />
			{{ addButtonText || "添加 机器人 / AI" }}
		</button>
		<template v-if="user">
			<div class="ready-tag" v-if="isSpectator">旁观中</div>
			<div class="ready-tag" v-else-if="user.isReady && !canSelectRole">准备</div>

			<div
				v-else
				@click="handleRoleSelect"
				class="choose-role"
				:style="{ 'background-color': role?.color }"
				:class="{ 'no-role': role === undefined, 'my-button': props.localParty || canSelectRole }"
				:aria-disabled="!canSelectRole"
			>
				<span>{{ role ? role.name : "选择角色" }}</span>
			</div>
		</template>

		<div v-if="isRoomOwner || isAIPlayer || isSpectator" class="status-badges">
			<div class="status-badge owner" v-if="isRoomOwner"><FontAwesomeIcon icon="crown" /> <span>房主</span></div>
			<div class="status-badge ai" v-if="isAIPlayer"><FontAwesomeIcon icon="robot" /> <span>AI</span></div>
			<div class="status-badge spectator" v-if="isSpectator"><FontAwesomeIcon icon="eye" /> <span>旁观</span></div>
		</div>

		<div class="right-side">
			<FpPopover v-if="canEditLocalPlayerName" placement="left">
				<template #default>
					<div class="local-player-name-editor" @click="openLocalPlayerNameEditor">名</div>
				</template>
				<template #content>
					<div class="action-tip">修改玩家名称</div>
				</template>
			</FpPopover>

			<FpPopover v-if="canChangeColor" placement="left">
				<template #default>
					<div class="color-picker">
						<div @click="handleColorPickerClick" class="color-display"></div>
						<input ref="colorPickerEl" type="color" @change="handleColorChange" />
					</div>
				</template>
				<template #content>
					<div class="action-tip">修改代表颜色</div>
				</template>
			</FpPopover>

			<FpPopover v-if="canEnterSpectator" placement="left">
				<template #default>
					<div class="spectator-toggle" @click="handleEnterSpectator">
						<FontAwesomeIcon class="spectator-toggle-icon" icon="eye" />
					</div>
				</template>
				<template #content>
					<div class="action-tip">切换为旁观者</div>
				</template>
			</FpPopover>

			<FpPopover v-if="canEditAI" placement="left">
				<template #default>
					<div class="ai-editor-trigger" title="编辑 AI" @click="openAIEditor">
						<FontAwesomeIcon class="ai-editor-trigger-icon" icon="gear" />
					</div>
				</template>
				<template #content>
					<div class="action-tip">编辑 AI 名称和档案</div>
				</template>
			</FpPopover>

			<FpPopover v-if="amIRoomOwner && user && !isMe" placement="left">
				<template #default>
					<div type="button" class="kick" @click="handleKickOut">
						<FontAwesomeIcon icon="person-running" />
					</div>
				</template>
				<template #content>
					<div class="action-tip">{{ isAIPlayer ? "移除这个 AI 玩家" : "将该玩家移出房间" }}</div>
				</template>
			</FpPopover>
		</div>

		<div v-if="user && user.username" class="user-info">
			<div class="avatar" :style="{ 'background-color': user.color }">
				<img v-if="avatarSrc" :src="avatarSrc" />
				<FontAwesomeIcon v-else :style="{ color: '#ffffff' }" :icon="isAIPlayer ? 'robot' : 'gamepad'" />
			</div>

			<div class="info" :style="{ 'background-color': lightColor }">
				<span class="username">{{ user.username }}</span>
			</div>
		</div>

		<div class="role-container">
			<img v-if="roleImageUrl" :src="roleImageUrl" alt="" />
		</div>
	</div>

	<FpDialog
		v-model:visible="localPlayerNameEditorVisible"
		title="修改玩家名称"
		confirm-text="保存"
		cancel-text="取消"
		:submit-disable="!canSubmitLocalPlayerName"
		:style="{ width: '28rem', maxWidth: '92vw' }"
		@submit="handleSubmitLocalPlayerName"
	>
		<div class="ai-editor-panel">
			<label class="ai-editor-field">
				<span class="ai-editor-label">显示名称</span>
				<input v-model="tempLocalPlayerName" type="text" maxlength="24" placeholder="输入玩家名称" />
			</label>
		</div>
	</FpDialog>

	<FpDialog
		v-model:visible="aiEditorVisible"
		title="编辑 AI 玩家"
		confirm-text="保存"
		cancel-text="取消"
		:submit-disable="!canSubmitAIEdit"
		:style="{ width: '28rem', maxWidth: '92vw' }"
		@submit="handleSubmitAIEdit"
	>
		<div class="ai-editor-panel">
			<label class="ai-editor-field">
				<span class="ai-editor-label">显示名称</span>
				<input v-model="tempAIName" type="text" maxlength="24" placeholder="输入 AI 玩家名称" />
			</label>

			<label class="ai-editor-field">
				<span class="ai-editor-label">LLM 档案</span>
				<select v-model="tempRemoteProfileId">
					<option v-for="profile in aiProfileOptions" :key="profile.id || '__default__'" :value="profile.id">
						{{ profile.name }}
					</option>
				</select>
			</label>

			<div class="ai-editor-note">单个 AI 玩家可以覆盖房间默认档案；留空时继续跟随房间默认远程配置。</div>
		</div>
	</FpDialog>
</template>

<style lang="scss" scoped>
@use "@src/assets/variables" as *;
@use "@mine-monopoly/style/variables" as fp;

$top-bar-height: 2.8rem;

// 定义跳动动画
@keyframes bounce {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-0.25rem);
	}
}

.room-user-card {
	width: auto;
	display: flex;
	justify-content: center;
	align-items: center;
	position: relative;
	border-radius: 0.8rem;
	box-sizing: border-box;
	box-shadow: var(--fp-shadow-md);
	z-index: var(--z-ui);
	@include felt-patch(#ffedb7);

	& > .add-ai-button {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 5;
		width: max-content;
		height: 5rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	& > .add-player-actions {
    position: absolute;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		z-index: 5;

		.add-ai-button {
			min-width: 10rem;
			height: 2.4rem;
		}
	}

	& > .right-side {
		$item-size: 2.4rem;

		position: absolute;
		top: $top-bar-height;
		right: 0.5rem;
		z-index: 101;
		padding: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;

		& > :deep(.fp-popover) {
			position: relative;
			z-index: 101;

			.color-picker {
				& > .color-display {
					width: $item-size;
					height: $item-size;
					background: conic-gradient(
						rgb(255, 0, 0),
						rgb(255, 187, 0),
						rgb(255, 255, 0),
						rgb(0, 255, 0),
						rgb(0, 0, 255),
						rgb(225, 0, 255),
						rgb(255, 0, 0)
					);
					border-radius: 50%;
					border: 0.3rem solid #ffffff;
					cursor: pointer;
					box-sizing: border-box;
				}

				& > input {
					width: 0;
					height: 0;
					opacity: 0;
					position: absolute;
					left: 0;
					top: 0;
				}
			}

			.kick,
			.spectator-toggle,
			.ai-editor-trigger,
			.local-player-name-editor {
				display: flex;
				justify-content: center;
				align-items: center;
				width: $item-size;
				height: $item-size;
				padding: 0;
				border-radius: 50%;
				border: 0.3rem solid #ffffff;
				cursor: pointer;
				z-index: 101;
				font-size: 1.2rem;
				color: #ffffff;
				box-sizing: border-box;

				& > svg {
					display: block;
					width: 1rem;
					height: 1rem;
					flex: 0 0 auto;
					transform: translateX(0.06rem);
				}
			}

			.kick {
				background-color: rgb(223, 79, 79);

				&:hover {
					background-color: rgb(197, 47, 47);
				}
			}

			.spectator-toggle {
				background-color: var(--fp-color-secondary);

				&:hover {
					background-color: darken(fp.$fp-color-secondary, 10%);
				}

				& > svg {
					transform: translateX(0);
				}
			}

			.local-player-name-editor {
				background-color: var(--fp-color-primary);
				font-size: 0.8rem;
				font-weight: 700;

				&:hover {
					background-color: darken(fp.$fp-color-primary, 8%);
				}
			}

			.ai-editor-trigger {
				background-color: var(--fp-color-tertiary);

				&:hover {
					background-color: darken(fp.$fp-color-tertiary, 8%);
				}
			}
		}
	}

	& > .ready-tag,
	& > .choose-role {
		@include felt-patch(#f7c336);
		user-select: none;
		position: absolute;
		bottom: 5%;
		width: 85%;
		font-size: 1.3rem;
		height: 2.8rem;
		line-height: 2.8rem;
		color: #ffffff;
		text-align: center;
		z-index: 100;
		box-shadow: var(--fp-shadow-depth);
		padding: 0;
	}

	& > .choose-role {
		padding: 0 0.6rem;
		box-sizing: border-box;

		// 只有自己的按钮才有交互效果
		&.my-button {
			cursor: pointer;
			transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
			animation: bounce 1.5s ease-in-out infinite;

			&:hover:not([disabled]) {
				background-color: var(--fp-color-primary);
			}

			&.no-role[disabled] {
				cursor: initial;
				animation: none;
			}
		}
	}

	& > .status-badges {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.45rem;
		inset-inline-start: 0.8rem;
		inset-block-start: calc($top-bar-height + 0.4rem);
		z-index: 101;

		.status-badge {
			position: relative;
			display: flex;
			align-items: center;
			gap: 0.3rem;
			padding: 0.45rem 0.75rem;
			border-radius: 0.6rem;
			font-size: 0.85rem;
			color: #ffffff;
			user-select: none;
			background-image: var(--fp-texture-felt);
			box-shadow: var(--fp-shadow-card);

			&.owner {
				background-color: var(--fp-color-tertiary);
			}

			&.spectator {
				background-color: var(--fp-color-secondary);
			}

			&.ai {
				background-color: var(--fp-color-secondary);
			}

			&:before {
				top: 0.3rem;
				left: 0.3rem;
				right: 0.3rem;
				bottom: 0.3rem;
			}
		}
	}

	& > .ban {
		font-size: 5rem;
		color: rgba(196, 196, 196, 0.6);
	}

	& > .user-info {
		width: 100%;
		display: flex;
		justify-content: space-between;
		position: absolute;
		left: 0;
		top: 0;
		$avatar-size: 3rem;

		& > .avatar {
			min-width: $avatar-size;
			min-height: $avatar-size;
			width: $avatar-size;
			height: $avatar-size;
			text-align: center;
			line-height: $avatar-size;
			// border: 0.25rem solid #ffffff;
			font-size: 1.2rem;
			color: #ffffff;
			z-index: 20;
			overflow: hidden;
			position: absolute;
			left: -0.3rem;
			top: -0.3rem;
			display: flex;
			justify-content: center;
			align-items: center;
			box-shadow: var(--fp-shadow-card);
			border-radius: 0.8rem;

			& > img {
				width: $avatar-size;
				height: $avatar-size;
			}

			&:before {
				top: 0.3rem;
				left: 0.3rem;
				right: 0.3rem;
				bottom: 0.3rem;
			}
		}

		& > .info {
			@include felt-patch(#ffedb7);
			width: 90%;
			height: 2.5rem;
			text-align: center;
			position: absolute;
			right: 0;
			display: flex;
			justify-content: center;
			align-items: center;
			z-index: 19;

			&:before {
				top: 0.3rem;
				left: 0.3rem;
				right: 0.3rem;
				bottom: 0.3rem;
			}

			& > .username {
				line-height: 2.4rem;
				color: #ffffff;
				font-size: 1.1rem;
				text-shadow: var(--fp-text-shadow);
			}
		}
	}
}

.role-container {
	width: 100%;
	height: 100%;
	padding-top: $top-bar-height;
	box-sizing: border-box;

	& img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		padding: 1rem;
		box-sizing: border-box;
	}
}

.ai-editor-panel {
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
}

.ai-editor-field {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
}

.ai-editor-label {
	font-size: 0.92rem;
	font-weight: 700;
	color: var(--fp-color-primary);
}

.ai-editor-field input,
.ai-editor-field select {
	width: 100%;
	border: 0.0625rem solid rgba(0, 0, 0, 0.12);
	border-radius: 0.45rem;
	padding: 0.65rem 0.75rem;
	font-size: 0.95rem;
	background: rgba(255, 255, 255, 0.92);
	color: var(--fp-color-primary);
	box-sizing: border-box;
}

.ai-editor-field input:focus,
.ai-editor-field select:focus {
	outline: none;
	border-color: var(--fp-color-tertiary);
	box-shadow: 0 0 0 0.125rem rgba(0, 0, 0, 0.06);
}

.ai-editor-note {
	font-size: 0.82rem;
	line-height: 1.55;
	color: var(--fp-color-tertiary);
}

.action-tip {
	width: max-content;
	max-width: 12rem;
	font-size: 0.8rem;
	line-height: 1.45;
	padding: 0.1rem 0.2rem;
	color: var(--fp-color-primary);
	text-shadow: var(--fp-text-shadow);
}
</style>

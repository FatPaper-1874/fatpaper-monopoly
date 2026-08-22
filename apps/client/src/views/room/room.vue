<script setup lang="ts">
import MapPreviewer from "@src/views/room/components/map-previewer.vue";
import roomUserCard from "@src/views/room/components/room-user-card.vue";
import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
import { FPMessage } from "@mine-monopoly/ui";
import { FPMessageBox, UserCancelledError } from "@src/components/utils/fp-message-box";
import ItemSelector from "@src/components/utils/item-selector/item-selector.vue";
import router from "@src/router";
import { useLoading, useRoomInfo, useSettig, useUserInfo } from "@src/store";
import { getGameMapById, getGameMapList } from "@src/utils/api/map";
import { MonopolyClient, useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import { computed, h, onBeforeMount, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { copyToClipboard, getDisplayValueByFormSchema } from "@src/utils";
import { setRoomPrivate } from "@src/utils/api/room-router";
import { FormSchema, GameMapInDb, GameSetting, RoleInRoom, UserInRoomInfo } from "@mine-monopoly/types";
import { loadGameMapFromServer } from "@src/utils/file/game-map";
import RolePreviewer from "./components/role-previewer.vue";
import { useResourceStore, useMapData } from "@src/store/game";
import { SaveManager, SaveRecord } from "@src/core/save";
import FpPopover from "@src/components/utils/fp-popover/fp-popover.vue";
import CustomForm from "@src/components/utils/custom-form/index.vue";
import FpErrorBoundary from "@src/components/utils/fp-error-boundary/index.vue";
import { vStagger } from "@src/directives";

let socketClient: MonopolyClient;

onMounted(async () => {
	socketClient = useMonopolyClient();
});

const roomInfoStore = useRoomInfo();
const userInfoStore = useUserInfo();
const maxRoomPlayers = 6;

const playerList = computed(() => roomInfoStore.userList.filter((user) => !user.isSpectator));
const spectatorList = computed(() => roomInfoStore.userList.filter((user) => user.isSpectator));
const roomSlots = computed(() => {
	const slots: Array<{ type: "player"; user: UserInRoomInfo } | { type: "add-ai" } | { type: "empty"; key: string }> =
		playerList.value.map((user) => ({ type: "player", user }));
	const emptyCount = Math.max(0, maxRoomPlayers - slots.length);
	for (let i = 0; i < emptyCount; i++) {
		const isFirstEmpty = i === 0;
		if (isFirstEmpty && canAddAIPlayer.value) {
			slots.push({ type: "add-ai" });
			continue;
		}
		slots.push({ type: "empty", key: `empty-${i}` });
	}
	return slots;
});
const ownerName = computed(() => roomInfoStore.ownerName);
const ownerId = computed(() => roomInfoStore.ownerId);
const roomId = computed(() => roomInfoStore.roomId);
const isPrivate = ref(true);

const isOwner = computed(() => userInfoStore.userId === roomInfoStore.ownerId);
const amISpectator = computed(() => roomInfoStore.amISpectator);
const isReady = computed(() => roomInfoStore.userList.find((user) => user.userId === userInfoStore.userId)?.isReady);

const saveManager = new SaveManager();
const saveRecords = ref<SaveRecord[]>([]);
const saveDialogVisible = ref(false);

// 地图相关
const mapList = ref<GameMapInDb[]>([]);
const mapSelectorVisible = ref(false);
const currentMap = computed(() => roomInfoStore.mapInfo);
const tempMapSelectedId = ref<string[]>(roomInfoStore.mapId ? [roomInfoStore.mapId] : []);
async function checkSaves() {
	if (!currentMap.value) {
		saveRecords.value = [];
		return;
	}
	const mapId = roomInfoStore.mapId;
	const mapVersion = useMapData().info?.version ?? "0.0.0";
	saveRecords.value = await saveManager.listByMap(mapId, mapVersion);
	// 按时间降序排序，最新的在前面
	saveRecords.value.sort((a, b) => b.saveTime - a.saveTime);
}

watch(
	currentMap,
	() => {
		checkSaves();
	},
	{ immediate: true },
);

function handleChangeMap() {
	if (socketClient && tempMapSelectedId.value.length > 0 && tempMapSelectedId.value[0] !== currentMap.value?.id) {
		useLoading().showLoading("地图传输中...");
		socketClient.changeGameMap({ from: "server", data: tempMapSelectedId.value[0] });
	}
}

// 角色相关
const roleList = computed(() => roomInfoStore.roleList);
const roleSelectorVisible = ref(false);
const tempRoleSelectedId = ref<string[]>([]);
const roleTargetUserId = ref<string>("");

function handleSelectRole(targetUser?: UserInRoomInfo) {
	const currentUser = targetUser ?? roomInfoStore.userList.find((user) => user.userId === userInfoStore.userId);
	if (!currentUser) return;
	roleTargetUserId.value = currentUser.userId;
	tempRoleSelectedId.value = currentUser?.roleId ? [currentUser.roleId] : [];
	roleSelectorVisible.value = true;
}

function handleChangeRole() {
	if (socketClient && tempRoleSelectedId.value.length > 0 && tempRoleSelectedId.value[0] !== undefined) {
		const result = socketClient.changeRoleForUser(
			roleTargetUserId.value || userInfoStore.userId,
			tempRoleSelectedId.value[0],
		);
		if (!result.success) {
			FPMessage({ type: "error", message: result.error || "修改角色失败" });
			return;
		}
		roleSelectorVisible.value = false;
	}
}

// 游戏设置相关
const gameSettingForm = computed(() => roomInfoStore.gameSettingForm);
const gameSettingForShow = computed(() => roomInfoStore.gameSetting);
const gameSettingForForm = computed(() => {
	const setting = roomInfoStore.gameSetting;
	const temp: Record<string, any> = {};
	for (const key in setting) {
		const item = setting[key];
		temp[key] = item.value;
	}
	return temp;
});
const gameSettingFormVisible = ref(false);

function handleGameSettingChange(gameSetting: Record<string, { field: FormSchema; value: any }>) {
	const res: GameSetting = {};
	for (const key in gameSetting) {
		const item = gameSetting[key];
		res[key] = {
			label: item.field.label,
			value: gameSetting[key].value as any,
			displayValue: getDisplayValueByFormSchema(item.field, gameSetting[key].value),
		};
	}
	socketClient.changeGameSetting(res);
	gameSettingFormVisible.value = false;
}

const canStart = computed(
	() =>
		!(
			Boolean(roomInfoStore.mapInfo) &&
			roomInfoStore.userList.every(
				(user) => Boolean(user.roleId) || Boolean(user.isAI) || user.userId === ownerId.value || user.isReady,
			) &&
			!useLoading().loading
		),
);
const canAddAIPlayer = computed(
	() => isOwner.value && playerList.value.length < maxRoomPlayers && !roomInfoStore.isStarted,
);

async function handleSetPrivate() {
	isPrivate.value = !isPrivate.value;
	await setRoomPrivate(roomId.value, isPrivate.value);
}

async function handleCopyRoomId() {
	await copyToClipboard(roomId.value);
	FPMessage({
		type: "success",
		message: "房间ID成功复制到剪贴板, 快去邀请小伙伴吧!",
	});
}

function handleLeaveRoom() {
	if (socketClient) {
		socketClient.leaveRoom();
	}
}

function handleReadyToggle() {
	if (socketClient) {
		socketClient.readyToggle();
	}
}

function handleGameStart() {
	if (socketClient) {
		socketClient.startGame();
	}
}

function isAnyLLMConfigured(): boolean {
	const config = useSettig().aiDecisionConfig;
	if (config.remote?.baseUrl && config.remote?.apiKey && config.remote?.model) {
		return true;
	}
	if (config.remoteProfiles?.some((p) => p.baseUrl && p.apiKey && p.model)) {
		return true;
	}
	return false;
}

async function handleAddAIPlayer() {
	if (!socketClient) return;

	if (!isAnyLLMConfigured()) {
		try {
			await FPMessageBox({
				title: "提示",
				content: h("div", { style: "line-height: 1.6;" }, [
					"检测到未配置远程LLM（大语言模型），AI玩家将无法进行智能决策，只能执行简单的拒绝操作。",
					h("br"),
					"如需完整体验，请前往「AI设置」配置LLM。",
					h("br"),
					h(
						"a",
						{
							href: "https://www.bilibili.com/video/BV1QhKr69EZ2",
							target: "_blank",
							style: "color: var(--fp-color-secondary); text-decoration: underline;",
						},
						"前往B站查看教程",
					),
				]),
				confirmText: "知道了",
			});
		} catch {
			// 用户关闭弹窗也继续添加
		}
	}

	const result = socketClient.addAIPlayer();
	if (!result.success) {
		FPMessage({ type: "error", message: result.error || "添加 AI 玩家失败" });
	}
}

function handleToggleSpectatorMode() {
	if (!socketClient) return;
	const result = socketClient.setSpectatorMode(!amISpectator.value);
	if (!result.success) {
		FPMessage({ type: "error", message: result.error || "切换旁观模式失败" });
	}
}

async function handleLoadSave(record: SaveRecord, usePrevious: boolean = false) {
	saveDialogVisible.value = false;
	useLoading().showLoading("正在加载存档...");

	try {
		if (socketClient) {
			const result = await socketClient.loadSave(record, usePrevious);
			if (!result.success) {
				FPMessage({ type: "error", message: result.error! });
			}
		}
	} catch (e: any) {
		FPMessage({ type: "error", message: `加载存档失败: ${e.message}` });
	} finally {
		useLoading().hideLoading();
	}
}

async function handleDeleteSave(record: SaveRecord) {
	try {
		await FPMessageBox({
			title: "确认删除",
			content: `确定要删除存档「${record.mapName} - 回合${record.round}」吗？此操作不可恢复。`,
			confirmText: "删除",
			cancelText: "取消",
		});
		await saveManager.delete(record.id);
		saveRecords.value = saveRecords.value.filter((r) => r.id !== record.id);
		FPMessage({ type: "success", message: "存档已删除" });
	} catch (e: any) {
		// 用户取消操作
		if (e instanceof UserCancelledError) return;
		FPMessage({ type: "error", message: `删除失败: ${e.message}` });
	}
}

async function handleSelectMap() {
	try {
		useLoading().showLoading("地图列表加载中...");
		const { gameMapList } = await getGameMapList(1, 1000);
		mapList.value = gameMapList;
		mapSelectorVisible.value = true;
	} catch {
		FPMessage({ type: "error", message: "加载地图列表失败" });
	} finally {
		useLoading().hideLoading();
	}
}

async function handleUploadMap() {
	if (!socketClient) return;

	// Electron 通过主进程导入，文件会复制到固定 game-map/ 仓库并完成原始字节 hash 校验。
	if (window.platformAPI?.importLocalMap && window.platformAPI.findLocalMapByHash) {
		const imported = await window.platformAPI.importLocalMap();
		if (imported.status === "failed") {
			if (imported.message !== "已取消导入") FPMessage({ type: "error", message: imported.message || "导入地图失败" });
			return;
		}
		if (!imported.sha256 || !imported.fileName || !imported.size) {
			FPMessage({ type: "error", message: "导入地图缺少校验信息" });
			return;
		}
		const local = await window.platformAPI.findLocalMapByHash({
			sha256: imported.sha256,
			size: imported.size,
		});
		if (!local.found || !local.data) {
			FPMessage({ type: "error", message: "导入后的地图无法读取" });
			return;
		}
		const mapData = { from: "custom" as const, data: new Uint8Array(local.data), fileName: imported.fileName };
		socketClient.changeGameMap(mapData);
		useLoading().showLoading("等待其他玩家确认");
		return;
	}

	const selected = await new Promise<{ data: ArrayBuffer; fileName: string } | null>((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".fpmap,.mmmap";
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) resolve({ data: await file.arrayBuffer(), fileName: file.name });
		};
		input.addEventListener("cancel", () => resolve(null));
		input.click();
	});
	if (!selected) return;
	// 浏览器端保留现有 P2P 传输兜底；房主会在 Room 中计算 descriptor hash。
	const mapData = { from: "custom" as const, data: new Uint8Array(selected.data), fileName: selected.fileName };
	socketClient.changeGameMap(mapData);
	useLoading().showLoading("等待其他玩家确认");
}
</script>

<template>
	<FpErrorBoundary>
		<div class="room-page" v-stagger.sound>
			<div class="left-container">
				<div v-stagger="300" class="left-inner">
					<div class="room-topbar">
						<button class="leave-room-button btn-small" @click="handleLeaveRoom">退出房间</button>
						<div class="room-name">
							<span>{{ ownerName }}的房间</span>
						</div>
					</div>

					<div class="room-id">
						<button v-if="isOwner" class="set-private-button btn-small" @click="handleSetPrivate">
							{{ isPrivate ? "点击公开" : "点击隐藏" }}
						</button>
						<div class="room-id-value" @click="handleCopyRoomId">
							房间ID:<span>{{ roomId }}</span>
						</div>
					</div>

					<div class="map-preview-inroom">
						<div class="map-cover-container">
							<MapPreviewer class="map-previewer" v-if="currentMap" :map="currentMap" />
							<span v-else>上传地图 & 选择官方地图</span>
						</div>
						<div class="select-map-button">
							<FpPopover v-if="isOwner" placement="top">
								<template #default>
									<button :class="{ nomap: !Boolean(roomInfoStore.mapId) }" class="btn-small" @click="handleUploadMap">
										<FontAwesomeIcon style="font-size: 0.9rem" icon="fa-upload" />
									</button>
								</template>
								<template #content>
									<div class="tips">分享自己的地图(需要房间成员确认)</div>
								</template>
							</FpPopover>
							<button :class="{ nomap: !Boolean(roomInfoStore.mapId) }" :disabled="!isOwner" @click="handleSelectMap">
								选择地图
							</button>
						</div>
					</div>

					<div class="local-map-tips">可以在“设置”页面导入地图到本地</div>

					<div class="game-setting">
						<button
							class="game-setting-button btn-small"
							v-if="isOwner && currentMap"
							@click="gameSettingFormVisible = true"
						>
							修改地图参数
						</button>
						<div class="game-setting-item" v-for="(setting, key) in gameSettingForShow">
							<span class="label">{{ setting.label }}:</span>
							<span class="value">{{ setting.displayValue }}</span>
						</div>
					</div>

					<div class="room-footbar">
						<template v-if="isOwner">
							<div v-if="saveRecords.length > 0" class="footbar-row">
								<button class="load-save-button btn-small footbar-btn-load" @click="saveDialogVisible = true">
									<FontAwesomeIcon style="font-size: 0.9rem; margin-right: 0.3rem" icon="clock-rotate-left" />
									读取存档
								</button>
								<button :disabled="canStart" class="ready-button footbar-btn-start" @click="handleGameStart">
									{{ currentMap ? "开始游戏" : "先选择地图吧" }}
								</button>
							</div>
							<div v-else class="footbar-row">
								<button :disabled="canStart" class="ready-button footbar-btn-start" @click="handleGameStart">
									{{ currentMap ? "开始游戏" : "先选择地图吧" }}
								</button>
							</div>
						</template>
						<button v-else class="ready-button" @click="handleReadyToggle">
							{{ isReady ? "取消准备" : "准备" }}
						</button>
					</div>
				</div>
			</div>

			<div class="right-container">
				<div v-if="spectatorList.length > 0" class="spectator-list">
					<span class="spectator-list-label">旁观者</span>
					<span v-for="user in spectatorList" :key="user.userId" class="spectator-user">
						{{ user.username }}
					</span>
					<button
						v-if="amISpectator"
						type="button"
						class="spectator-exit-button btn-small"
						@click="handleToggleSpectatorMode"
					>
						退出旁观
					</button>
				</div>
				<div class="player-list-container" v-stagger="350">
					<template
						v-for="slot in roomSlots"
						:key="slot.type === 'player' ? slot.user.userId : slot.type === 'empty' ? slot.key : 'add-ai'"
					>
						<room-user-card
							v-if="slot.type === 'player'"
							@role-select="handleSelectRole"
							@spectator-toggle="handleToggleSpectatorMode"
							:user="slot.user"
						/>
						<roomUserCard
							v-else-if="slot.type === 'add-ai'"
							:user="undefined"
							:add-ai-button="true"
							@add-ai="handleAddAIPlayer"
						/>
						<roomUserCard v-else :user="undefined" />
					</template>
				</div>
			</div>
		</div>

		<FpDialog v-model:visible="gameSettingFormVisible" :hidden-footer="true">
			<template #title>修改地图参数</template>
			<template #default>
				<custom-form
					:key="roomInfoStore.mapId"
					:initial-data="gameSettingForForm"
					@submit="handleGameSettingChange"
					:schema="gameSettingForm"
					:submit-text="'保存地图参数'"
				/>
			</template>
		</FpDialog>
		<FpDialog @submit="handleChangeRole" v-model:visible="roleSelectorVisible">
			<template #title>选择角色</template>
			<template #default>
				<ItemSelector
					:column="3"
					:multiple="false"
					:item-list="roleList"
					key-name="id"
					v-model:selected-key="tempRoleSelectedId"
				>
					<template #item="role">
						<RolePreviewer :role="role" />
					</template>
				</ItemSelector>
			</template>
		</FpDialog>
		<FpDialog @submit="handleChangeMap" v-model:visible="mapSelectorVisible">
			<template #title>选择地图 (点击想玩的地图然后确认)</template>
			<template #default>
				<ItemSelector
					:column="3"
					:multiple="false"
					:item-list="mapList"
					key-name="id"
					v-model:selected-key="tempMapSelectedId"
				>
					<template #item="map">
						<MapPreviewer style="width: 23rem; height: 14rem" :map="map" />
					</template>
				</ItemSelector>
			</template>
		</FpDialog>
		<FpDialog
			v-model:visible="saveDialogVisible"
			title="读取存档"
			@submit="saveDialogVisible = false"
			@cancel="saveDialogVisible = false"
		>
			<div class="save-list">
				<div v-for="record in saveRecords" :key="record.id" class="save-item">
					<div class="save-item-header">
						<div class="save-map-name">{{ record.mapName }}</div>
						<div class="save-round-badge">回合 {{ record.round }}</div>
					</div>
					<div class="save-item-body">
						<div class="save-meta">
							<span class="save-players">
								<FontAwesomeIcon style="font-size: 0.8rem; margin-right: 0.25rem" icon="users" />
								{{ record.playerNames.join(", ") }}
							</span>
							<span class="save-time">
								<FontAwesomeIcon style="font-size: 0.8rem; margin-right: 0.25rem" icon="clock" />
								{{ new Date(record.saveTime).toLocaleString() }}
							</span>
						</div>
						<div class="save-actions">
							<button class="btn-small save-load-btn" @click="handleLoadSave(record, false)">
								<FontAwesomeIcon style="font-size: 0.8rem; margin-right: 0.25rem" icon="play" />
								读取
							</button>
							<button class="btn-small btn-red" @click="handleDeleteSave(record)">
								<FontAwesomeIcon style="font-size: 0.8rem; margin-right: 0.25rem" icon="trash-can" />
								删除
							</button>
						</div>
					</div>
				</div>
				<div v-if="saveRecords.length === 0" class="save-empty">
					<FontAwesomeIcon style="font-size: 1.5rem; margin-bottom: 0.5rem" icon="box-open" />
					<span>没有找到存档</span>
				</div>
			</div>
		</FpDialog>
	</FpErrorBoundary>
</template>

<style lang="scss" scoped>
@use "@src/assets/variables" as *;
@use "@mine-monopoly/style/variables" as fp;

.room-page {
	width: 80%;
	height: 80%;
	padding: 1.2rem;
	margin: auto;
	box-sizing: border-box;
	display: flex;
	justify-content: space-between;

	& > div {
		height: 100%;
	}

	& > .left-container {
		width: 21rem;
		margin-right: 0.5rem;
		border-radius: 0.6rem;
		backdrop-filter: blur(0.2rem);
		box-shadow: var(--fp-shadow-md);
		display: flex;
		flex-direction: column;
		@include felt-patch(#ffedb7);

		.left-inner {
			flex: 1;
			width: 100%;
			min-height: 0;
			display: flex;
			flex-direction: column;
			justify-content: space-between;
			align-items: center;
		}
	}

	& > .right-container {
		flex: 1;
		display: flex;
		flex-direction: column;

		& > .spectator-list {
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 0.45rem;
			margin-bottom: 0.6rem;
			padding: 0.75rem 0.9rem;
			border-radius: 0.7rem;
			box-shadow: var(--fp-shadow-md);
			@include felt-patch(#ffe6a8);

			.spectator-list-label,
			.spectator-user {
				background-image: var(--fp-texture-felt);
			}

			& .spectator-list-label {
				display: inline-flex;
				align-items: center;
				padding: 0.42rem 0.72rem;
				border-radius: 0.65rem;
				background-color: var(--fp-color-secondary);
				color: #ffffff;
				font-size: 0.88rem;
				letter-spacing: 0.04em;
			}

			& .spectator-user {
				display: inline-flex;
				align-items: center;
				padding: 0.38rem 0.68rem;
				border-radius: 999px;
				background-color: rgba(255, 255, 255, 0.94);
				color: var(--fp-color-text);
				font-size: 0.84rem;
				font-weight: 600;
			}

			& .spectator-exit-button {
				margin-left: auto;
				flex-shrink: 0;
			}
		}

		& > .player-list-container {
			flex: 1;
			display: grid;
			grid-template-rows: 1fr 1fr;
			grid-template-columns: 1fr 1fr 1fr;
			row-gap: 0.5rem;
			column-gap: 0.5rem;
		}
	}
}

.room-topbar {
	position: absolute;
	top: -1rem;
	width: 100%;
	color: #ffffff;
	z-index: 20;

	& > .leave-room-button {
		height: 2.2rem;
		position: absolute;
		top: 0.3rem;
		left: -0.3rem;
		padding: 0 0.7rem;
		font-size: 1rem;
		text-shadow: var(--fp-text-shadow);
		border-radius: 0.6rem;
		transform: rotate(-2.5deg);
	}

	& > .room-name {
		background-image: var(--fp-texture-felt);
		border-radius: 0.6rem;
		height: 2.7rem;
		font-size: 1.1rem;
		display: block;
		position: absolute;
		right: 0.5rem;
		text-align: center;
		width: 70%;
		background-color: var(--fp-color-tertiary);
		text-shadow: var(--fp-text-shadow);
		display: flex;
		justify-content: center;
		align-items: center;
		box-shadow:
			0 0.15rem 0 darken(fp.$fp-color-secondary, 12%),
			0 0.2rem 0.3rem rgba(0, 0, 0, 0.15);
	}
}

.room-id {
	width: 100%;
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 0.6rem;
	margin-top: 1.5rem;
	margin-bottom: 0.4rem;
	padding: 0.3rem;

	& > .set-private-button {
		font-size: 0.8rem;
		margin-left: 0.3rem;
		border-radius: 0.3rem;
		transform: rotate(-1deg);
	}

	& .room-id-value {
		flex: 1;
		font-size: 0.8rem;
		padding: 0.2rem;
		text-align: center;
		background-color: rgba(255, 255, 255, 0.5);
		color: var(--fp-color-tertiary);
		user-select: none;
		font-size: 1rem;
		border-radius: 0.4rem;
		cursor: pointer;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;

		& > span {
			font-size: 1.1rem;
			margin-left: 0.8rem;
			user-select: text;
			color: var(--fp-color-secondary);
			border-radius: 0.4rem;
			padding: 0 0.4rem;
		}
	}
}

.map-preview-inroom {
	width: 95%;
	height: 12rem;
	position: relative;
	overflow: hidden;

	& > .select-map-info {
		position: absolute;
		left: 0;
		top: 0;

		& > .name {
			width: auto;
			display: inline-block;
			padding: 0.6rem 1rem;
			border-radius: 0 0.3rem 0.3rem 0.3rem;
			background-color: var(--fp-color-secondary);
			color: var(--fp-color-text-white);
		}
	}

	& > .select-map-button {
		position: absolute;
		right: 0;
		bottom: 0;
		z-index: 100;
		display: flex;
		gap: 0.2rem;

		button {
			border: 0;
			font-size: 0.8rem;
			padding: 0.6rem 1.2rem;
			border-radius: 0.6rem;
			&.nomap:not([disabled]) {
				background-color: var(--fp-color-secondary);
				animation: identifier 1.5s infinite ease-in-out;

				&:hover {
					background-color: var(--fp-color-tertiary);
				}

				@keyframes identifier {
					50% {
						background-color: lighten(fp.$fp-color-secondary, 10%);
					}
				}
			}
		}

		.tips {
			width: max-content;
			font-size: 0.8rem;
			border-radius: 0.7rem;
			padding: 0.2rem;
			color: var(--fp-color-primary);
			text-shadow: var(--fp-text-shadow);
		}
	}

	& .map-cover-container {
		width: 100%;
		height: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		box-sizing: border-box;
		border: 0.4rem solid var(--fp-color-border-lighter);
		border-radius: 1rem;
		background-color: var(--fp-color-bg-disable);
		color: var(--fp-color-text-secondary);
	}

	& .map-previewer {
		position: absolute;
		z-index: 1;
	}
}

.local-map-tips {
	margin: 0.4rem 0;
	color: var(--fp-color-primary);
	background-color: rgba(255, 255, 255, 0.4);
	border-radius: 0.5rem;
	padding: 0.3rem;
	font-size: .7rem;
}

.game-setting {
	width: 100%;
	padding: 0.6rem;
	padding-top: 0;
	box-sizing: border-box;
	flex: 1;
	overflow-y: auto;
	min-height: 0;

	& .game-setting-button {
		font-size: 0.8rem;
		padding: 0.5rem;
		margin-top: 0.1rem;
		border-radius: 0.6rem;
		width: 100%;
	}

	.game-setting-item {
		background-color: #ffffff;
		background-image: var(--fp-texture-felt);
		margin-top: 0.7rem;
		padding: 0.5rem 0.8rem;
		border: 0.2rem solid #ffffff;
		border-radius: 0.5rem;
		display: flex;
		justify-content: space-between;

		& .label {
			color: #393939;
		}
		& .value {
			color: var(--fp-color-secondary);
		}
	}
}

.room-footbar {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 0.4rem;

	& > .ready-button {
		width: 100%;
		height: 2.7rem;
		padding: 0 0.7rem;
		border: 0;
		font-size: 1.2rem;
		text-shadow: var(--fp-text-shadow);
		margin-bottom: 0;
		border-radius: 0.5rem;
	}

	.footbar-row {
		display: flex;
		gap: 0.4rem;
		width: 100%;

		.footbar-btn-start {
			flex: 2;
			height: 2.7rem;
			padding: 0 0.7rem;
			border: 0;
			font-size: 1.2rem;
			text-shadow: var(--fp-text-shadow);
			border-radius: 0.5rem;
		}

		.footbar-btn-load {
			flex: 1;
			height: 2.7rem;
			font-size: 1rem;
			background-color: var(--fp-color-tertiary);
			display: flex;
			justify-content: center;
			align-items: center;
		}
	}

	.load-save-button {
		display: flex;
		justify-content: center;
		align-items: center;
	}
}

.save-list {
	display: flex;
	flex-direction: column;
	gap: 0.6rem;
	max-height: 24rem;
	overflow-y: auto;
	padding: 0.2rem;

	.save-item {
		background-color: rgba(255, 255, 255, 0.8);
		border-radius: 0.6rem;
		box-shadow: var(--fp-shadow-md);

		.save-item-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0.6rem 0.8rem;
			border-bottom: 0.0625rem solid rgba(0, 0, 0, 0.06);

			.save-map-name {
				font-weight: bold;
				font-size: 1rem;
				color: var(--fp-color-primary);
			}

			.save-round-badge {
				font-size: 0.85rem;
				padding: 0.15rem 0.5rem;
				border-radius: 1rem;
				background-color: var(--fp-color-primary);
				color: white;
				font-weight: 500;
			}
		}

		.save-item-body {
			padding: 0.6rem 0.8rem;
			display: flex;
			flex-direction: column;
			gap: 0.5rem;

			.save-meta {
				display: flex;
				justify-content: space-between;
				font-size: 0.85rem;
				color: #666;

				.save-players,
				.save-time {
					display: flex;
					align-items: center;
				}
			}

			.save-actions {
				display: flex;
				gap: 0.4rem;

				.save-load-btn {
					flex: 1;
					background-color: var(--fp-color-primary);
					color: white;
					display: flex;
					justify-content: center;
					align-items: center;
				}
			}
		}
	}

	.save-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		color: #999;
		font-size: 0.95rem;
		gap: 0.3rem;
	}
}

/* 移动端响应式 */
@media (max-width: 48rem) {
	.room-page {
		width: 95%;
		height: 95%;
		flex-direction: column;
		overflow-y: auto;
		gap: 0.5rem;
		padding: 0.8rem;
	}

	.left-container {
		width: 100% !important;
		flex: none;
		height: auto !important;
		margin-right: 0 !important;
		min-height: 0;

		.left-inner {
			justify-content: space-between;
			gap: 0.4rem;
			min-height: 0;
		}
	}

	.right-container {
		width: 100%;
		flex: none;
		min-height: 8rem;

		.player-list-container {
			grid-template-rows: 1fr;
			grid-template-columns: 1fr 1fr;
		}
	}

	.room-topbar {
		position: static;
		margin-bottom: 0.3rem;

		.room-name {
			position: static;
			width: 100%;
			height: 2rem;
			font-size: 0.9rem;
		}

		.leave-room-button {
			position: static;
			transform: none;
		}
	}

	.room-id {
		margin-top: 0;
		margin-bottom: 0.2rem;
	}

	.map-preview-inroom {
		height: 8rem;
		width: 100%;
	}

	.game-setting {
		overflow-y: auto;
		max-height: 12rem;
		min-height: 0;

		.game-setting-item {
			font-size: 0.8rem;
			padding: 0.3rem 0.6rem;
			margin-top: 0.4rem;
		}
	}

	.room-footbar {
		.ready-button,
		.footbar-btn-start {
			font-size: 1rem;
			height: 2.2rem;
		}
	}
}
</style>

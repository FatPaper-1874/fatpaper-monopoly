<script setup lang="ts">
import MapPreviewer from "../shared/map-previewer.vue";
import RoomUserCard from "../shared/room-user-card.vue";
import FpDialog from "@src/components/utils/fp-dialog/fp-dialog.vue";
import FpPopover from "@src/components/utils/fp-popover/fp-popover.vue";
import ItemSelector from "@src/components/utils/item-selector/item-selector.vue";
import CustomForm from "@src/components/utils/custom-form/index.vue";
import FpErrorBoundary from "@src/components/utils/fp-error-boundary/index.vue";
import { FPMessage } from "@mine-monopoly/ui";
import router from "@src/router";
import { useLoading, useRoomInfo } from "@src/store";
import { getGameMapList } from "@src/utils/api/map";
import { getDisplayValueByFormSchema } from "@src/utils";
import { useMonopolyClient, type MonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import { useMapData } from "@src/store/game";
import { SaveManager, type SaveRecord } from "@src/core/save";
import type { FormSchema, GameMapInDb, GameSetting, UserInRoomInfo } from "@mine-monopoly/types";
import { computed, ref, watch } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import RolePreviewer from "../shared/role-previewer.vue";
import { vStagger } from "@src/directives";

const MAX_PLAYERS = 6;
const roomInfoStore = useRoomInfo();
const saveManager = new SaveManager();
const socketClient: MonopolyClient = useMonopolyClient();

const localPlayers = computed(() => roomInfoStore.userList.filter((player) => !player.isAI && !player.isSpectator));
const aiPlayers = computed(() => roomInfoStore.userList.filter((player) => player.isAI));
const playerList = computed(() => [...localPlayers.value, ...aiPlayers.value]);
const ownerName = computed(() => "本地派对");
const currentMap = computed(() => roomInfoStore.mapInfo);
const roleList = computed(() => roomInfoStore.roleList);
const gameSettingForm = computed(() => roomInfoStore.gameSettingForm);
const gameSettingForShow = computed(() => roomInfoStore.gameSetting);
const gameSettingForForm = computed(() => {
	const values: Record<string, unknown> = {};
	for (const key in roomInfoStore.gameSetting) values[key] = roomInfoStore.gameSetting[key].value;
	return values;
});
const roomSlots = computed(() => {
	const slots: Array<
		{ type: "player"; user: UserInRoomInfo } | { type: "add-players" } | { type: "empty"; key: string }
	> = playerList.value.map((user) => ({ type: "player", user }));

	if (slots.length < MAX_PLAYERS) slots.push({ type: "add-players" });
	for (let i = slots.length; i < MAX_PLAYERS; i++) slots.push({ type: "empty", key: `empty-${i}` });
	return slots;
});
const canStart = computed(() => {
	const names = localPlayers.value.map((player) => player.username.trim());
	return (
		!currentMap.value ||
		!localPlayers.value.length ||
		playerList.value.length > MAX_PLAYERS ||
		names.some((name) => !name) ||
		new Set(names).size !== names.length ||
		useLoading().loading
	);
});

const mapList = ref<GameMapInDb[]>([]);
const mapSelectorVisible = ref(false);
const tempMapSelectedId = ref<string[]>([]);
const roleSelectorVisible = ref(false);
const tempRoleSelectedId = ref<string[]>([]);
const roleTargetUserId = ref("");
const gameSettingFormVisible = ref(false);
const saveDialogVisible = ref(false);
const saveRecords = ref<SaveRecord[]>([]);

watch(
	() => roomInfoStore.mapId,
	() => {
		tempMapSelectedId.value = roomInfoStore.mapId ? [roomInfoStore.mapId] : [];
		void checkSaves();
	},
	{ immediate: true },
);

function notifyResult(result: { success: boolean; error?: string }, fallback: string) {
	if (!result.success) FPMessage({ type: "error", message: result.error || fallback });
}

function handleLeaveRoom() {
	socketClient.destory();
	void router.replace({ name: "room-router" });
}

async function handleAddLocalPlayer() {
	notifyResult(await socketClient.addLocalPartyPlayer(), "添加本地玩家失败");
}

function handleAddAIPlayer() {
	notifyResult(socketClient.addAIPlayer(), "添加 AI 玩家失败");
}

function handleSelectRole(targetUser?: UserInRoomInfo) {
	if (!targetUser) return;
	roleTargetUserId.value = targetUser.userId;
	tempRoleSelectedId.value = targetUser.roleId ? [targetUser.roleId] : [];
	roleSelectorVisible.value = true;
}

function handleChangeRole() {
	const roleId = tempRoleSelectedId.value[0];
	if (!roleId || !roleTargetUserId.value) return;
	const result = socketClient.changeRoleForUser(roleTargetUserId.value, roleId);
	if (result.success) roleSelectorVisible.value = false;
	else notifyResult(result, "修改角色失败");
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

async function applyMapChange(mapInfo: Parameters<MonopolyClient["changeGameMap"]>[0], loadingText: string) {
	useLoading().showLoading(loadingText);
	try {
		const result = await socketClient.changeGameMap(mapInfo);
		if (result.success) mapSelectorVisible.value = false;
		else notifyResult(result, "地图加载失败");
	} catch (error) {
		FPMessage({ type: "error", message: `地图加载失败: ${error instanceof Error ? error.message : "未知错误"}` });
	} finally {
		useLoading().hideLoading();
	}
}

async function handleChangeMap() {
	const mapId = tempMapSelectedId.value[0];
	if (!mapId || mapId === currentMap.value?.id) return;
	await applyMapChange({ from: "server", data: mapId }, "地图加载中...");
}

async function handleUploadMap() {
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
		const local = await window.platformAPI.findLocalMapByHash({ sha256: imported.sha256, size: imported.size });
		if (!local.found || !local.data) {
			FPMessage({ type: "error", message: "导入后的地图无法读取" });
			return;
		}
		await applyMapChange(
			{ from: "custom", data: new Uint8Array(local.data), fileName: imported.fileName },
			"正在加载本地地图...",
		);
		return;
	}

	const selected = await new Promise<{ data: ArrayBuffer; fileName: string } | null>((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".fpmap,.mmmap";
		input.onchange = async (event) => {
			const file = (event.target as HTMLInputElement).files?.[0];
			resolve(file ? { data: await file.arrayBuffer(), fileName: file.name } : null);
		};
		input.addEventListener("cancel", () => resolve(null));
		input.click();
	});
	if (!selected) return;
	await applyMapChange(
		{ from: "custom", data: new Uint8Array(selected.data), fileName: selected.fileName },
		"正在加载本地地图...",
	);
}

function handleGameSettingChange(gameSetting: Record<string, { field: FormSchema; value: unknown }>) {
	const result: GameSetting = {};
	for (const key in gameSetting) {
		const item = gameSetting[key];
		result[key] = {
			label: item.field.label,
			value: item.value as never,
			displayValue: getDisplayValueByFormSchema(item.field, item.value),
		};
	}
	socketClient.changeGameSetting(result);
	gameSettingFormVisible.value = false;
}

async function checkSaves() {
	if (!currentMap.value) {
		saveRecords.value = await saveManager.list();
	} else {
		const version = useMapData().info?.version ?? "0.0.0";
		saveRecords.value = await saveManager.listByMap(roomInfoStore.mapId, version);
	}
	saveRecords.value.sort((a, b) => b.saveTime - a.saveTime);
}

async function handleLoadSave(record: SaveRecord, usePrevious = false) {
	saveDialogVisible.value = false;
	useLoading().showLoading("正在加载存档...");
	try {
		const result = await socketClient.loadSave(record, usePrevious);
		if (!result.success) notifyResult(result, "加载存档失败");
	} catch (error) {
		FPMessage({ type: "error", message: `加载存档失败: ${error instanceof Error ? error.message : "未知错误"}` });
	} finally {
		useLoading().hideLoading();
	}
}

async function handleDeleteSave(record: SaveRecord) {
	try {
		await saveManager.delete(record.id);
		saveRecords.value = saveRecords.value.filter((item) => item.id !== record.id);
		FPMessage({ type: "success", message: "存档已删除" });
	} catch (error) {
		FPMessage({ type: "error", message: `删除存档失败: ${error instanceof Error ? error.message : "未知错误"}` });
	}
}

function handleGameStart() {
	if (canStart.value) {
		FPMessage({ type: "warning", message: "请确认已选择地图，且本地玩家昵称均非空且不重复" });
		return;
	}
	socketClient.startGame();
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
							<span>{{ ownerName }}</span>
						</div>
					</div>

					<div class="map-preview-inroom">
						<div class="map-cover-container">
							<MapPreviewer class="map-previewer" v-if="currentMap" :map="currentMap" />
							<span v-else>上传地图 & 选择官方地图</span>
						</div>
						<div class="select-map-button">
							<FpPopover placement="top">
								<template #default>
									<button :class="{ nomap: !Boolean(roomInfoStore.mapId) }" class="btn-small" @click="handleUploadMap">
										<FontAwesomeIcon style="font-size: 0.9rem" icon="fa-upload" />
									</button>
								</template>
								<template #content>
									<div class="tips">导入本地地图</div>
								</template>
							</FpPopover>
							<button :class="{ nomap: !Boolean(roomInfoStore.mapId) }" @click="handleSelectMap">选择地图</button>
						</div>
					</div>

					<div class="local-map-tips">可以在“设置”页面导入地图到本地</div>

					<div class="game-setting">
						<button class="game-setting-button btn-small" v-if="currentMap" @click="gameSettingFormVisible = true">
							修改地图参数
						</button>
						<div class="game-setting-item" v-for="(setting, key) in gameSettingForShow" :key="key">
							<span class="label">{{ setting.label }}:</span>
							<span class="value">{{ setting.displayValue }}</span>
						</div>
					</div>

					<div class="room-footbar">
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
					</div>
				</div>
			</div>

			<div class="right-container">
				<div class="player-list-container" v-stagger="350">
					<template
						v-for="slot in roomSlots"
						:key="slot.type === 'player' ? slot.user.userId : slot.type === 'empty' ? slot.key : slot.type"
					>
						<RoomUserCard v-if="slot.type === 'player'" :user="slot.user" local-party @role-select="handleSelectRole" />
						<RoomUserCard
							v-else-if="slot.type === 'add-players'"
							:user="undefined"
							:local-party-add-actions="true"
							@add-local-player="handleAddLocalPlayer"
							@add-ai="handleAddAIPlayer"
						/>
						<RoomUserCard v-else :user="undefined" />
					</template>
				</div>
			</div>
		</div>

		<FpDialog v-model:visible="gameSettingFormVisible" :hidden-footer="true">
			<template #title>修改地图参数</template>
			<template #default>
				<CustomForm
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
@use "../shared/room-lobby.scss";
</style>

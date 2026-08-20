import { ResourcesType, GameMap, PlayerInfo, PropertyInfo, GameData, IGameProcessExportData } from "@mine-monopoly/types";
import type { MapPathChoiceRequest } from "@mine-monopoly/types";
import { defineStore } from "pinia";
import { useUserInfo } from ".";
import useEventBus from "@src/utils/event-bus";
import { compareObjectArrays } from "@src/utils";
import { clone } from "lodash";

export const useResourceStore = defineStore("temp-resource", {
	state: () => {
		return {
			recourceMap: new Map<string, ResourcesType>(),
		};
	},
	actions: {
		add(recource: ResourcesType) {
			this.recourceMap.set(recource.id, recource);
		},
		remove(id: string) {
			const recource = this.recourceMap.get(id);
			if (!recource) return;
			URL.revokeObjectURL(recource.url);
			this.recourceMap.delete(id);
		},
		getRecourceById(id: string) {
			return this.recourceMap.get(id);
		},
		clear() {
			Array.from(this.recourceMap.values()).forEach((r) => {
				URL.revokeObjectURL(r.url);
			});
			this.recourceMap.clear();
		},
	},
});

export const useMapData = defineStore("map-data", {
	state: (): Omit<GameMap, "phases"> => ({
		id: crypto.randomUUID(),
		info: {
			name: "",
			author: "",
			version: "0.0.0",
			editorVersion: "",
			backgroundImageId: "",
			coverImageId: "",
			description: "",
			pendingChangelog: "",
			changelog: [],
		},
		gameSettingForm: [],
		mapItems: [],
		chanceCards: [],
		mapItemTypes: [],
		mapPaths: [],
		mapIndex: [],
		roles: [],
		inUse: false,
		mapEvents: [],
		buildingModelIdList: ["", "", ""],
		uiTemplates: [],
		customUIs: [],
		extraLibs: "",
	modifierTemplates: [],
	}),
	actions: {
		getMapEventByMapItemId(mapItemId: string) {
			const mapEventId = this.getMapItemById(mapItemId)?.mapEventId;
			if (!mapEventId) throw Error("查找MapEvent的Id失败");
			return this.getMapEventById(mapEventId);
		},

		// MapItem
		getMapItemByIndex(index: number) {
			return this.getMapItemById(this.mapIndex[index]);
		},
		getMapItemById(id: string) {
			return this.mapItems.find((m) => m.id === id);
		},
		getMapItemByPropertyId(id: string) {
			return this.mapItems.find((item) => item.property?.id === id);
		},

		// MapItemType
		getMapItemTypeById(id: string) {
			return this.mapItemTypes.find((m) => m.id === id);
		},

		// MapEvent
		getMapEventById(id: string) {
			return this.mapEvents.find((e) => e.id === id);
		},

		// ChanceCard
		getChanceCardById(id: string) {
			return this.chanceCards.find((c) => c.id === id);
		},

		// Role
		getRoleById(id: string) {
			return this.roles.find((r) => r.id === id);
		},

		// UITempolate
		getUITempolateById(id: string) {
			return this.uiTemplates.find((u) => u.id === id);
		},
	},
});

interface GameDataRuntimeState {
	/** 当前客户端等待玩家选择的地图路径请求；不属于宿主同步的 GameData。 */
	mapPathChoiceRequest: MapPathChoiceRequest | null;
}

type GameDataStoreState = GameData & GameDataRuntimeState;

export const useGameData = defineStore("game-data", {
	state: (): GameDataStoreState => {
		return {
			exportData: {} as IGameProcessExportData,
			currentPlayerIdInRound: "",
			currentRound: 0,
			currentMultiplier: 0,
			players: new Array<PlayerInfo>(),
			properties: new Array<PropertyInfo>(),
			isGameOver: false,
			rankedPlayerIds: [],
			mapPathChoiceRequest: null,
		};
	},
	getters: {
		isMyTurn: (state) => useUserInfo().userId === state.currentPlayerIdInRound,
		myGameInfo: (state) => state.players.find((p) => p.id === useUserInfo().userId),
	},
	actions: {
		setMapPathChoiceRequest(request: MapPathChoiceRequest) {
			this.mapPathChoiceRequest = request;
		},
		clearMapPathChoiceRequest(requestId?: string) {
			if (!requestId || this.mapPathChoiceRequest?.requestId === requestId) {
				this.mapPathChoiceRequest = null;
			}
		},
		getPlayerInfoById(id: string) {
			return this.$state.players.find((p) => p.id === id);
		},
		getPropertyById(id: string) {
			return this.$state.properties.find((p) => p.id === id);
		},
		updateGameData(newGamedata: GameData) {
			const eventBus = useEventBus();
			const oldGameData = clone(this.$state);

			this.$patch((state) => {
				Object.assign(state, newGamedata);
			});

			// 检查回合玩家是否变化
			if (oldGameData.currentPlayerIdInRound !== newGamedata.currentPlayerIdInRound) {
				eventBus.emit("game-currentPlayerIdInRound", newGamedata.currentPlayerIdInRound, oldGameData.currentPlayerIdInRound);
			}

			compareObjectArrays(oldGameData.players, newGamedata.players, "id", (itemId, key, oldValue, newValue) => {
				eventBus.emit(`player-${key}`, itemId, oldValue, newValue);
			});
			compareObjectArrays(oldGameData.properties, newGamedata.properties, "id", (itemId, key, oldValue, newValue) => {
				eventBus.emit(`property-${key}`, itemId, oldValue, newValue);
			});
		},
	},
});

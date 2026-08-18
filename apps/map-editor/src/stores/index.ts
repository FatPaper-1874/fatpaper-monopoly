import { defineStore } from "pinia";
import { ChanceCardInfo, FormSchema, GameMap, GameMapChangelogEntry, ModifierTemplate, PropertyInfo, UITemplate } from "@mine-monopoly/types";
import { CameraMode, OperationMode } from "@src/enums";
import {
	MapItem,
	MapItemType,
	MapEvent,
	Role,
	GameMapInfo,
	SemVer,
	CustomUI,
} from "@mine-monopoly/types/interfaces/game/item";
import { eventBus } from "@src/utils/event-bus";
import { createDefaultMapData } from "../utils/file/index";
import { generateShortId } from "../utils/short-id";
import { cloneDeep } from "lodash";

export { useVersionStore } from "./version-store";

export const useMapDataStore = defineStore("MapData", {
	state: createDefaultMapData,
	actions: {
		// MapInfo
		updateMapInfo(info: {
			name: string;
			author: string;
			version: SemVer;
			description: string;
			pendingChangelog: string;
			changelog: GameMapChangelogEntry[];
		}) {
			Object.assign(this.info, info);
		},

		setBackgroundImageId(id: string) {
			if (this.info.backgroundImageId) {
				useResourceStore().removeImage(this.info.backgroundImageId);
			}
			this.info.backgroundImageId = id;
			eventBus.emit("map-background-update");
		},

		setCoverImageId(id: string) {
			if (this.info.coverImageId) {
				useResourceStore().removeImage(this.info.coverImageId);
			}
			this.info.coverImageId = id;
		},

		// MapItem
		addMapItem(mapItem: MapItem) {
			this.mapItems.push(mapItem);
		},
		removeMapItem(id: string) {
			console.log("🚀 ~ removeMapItem ~ id:", id);
			const index = this.mapItems.findIndex((m) => m.id === id);
			if (index === -1) throw Error("寻找MapItem失败");
			this.unLinkMapItem(id);

			this.mapItems.splice(index, 1);
			eventBus.emit("map-item-deleted", id);
			this.updateMapIndex([]);
		},
		findMapItemById(id: string) {
			return this.mapItems.find((m) => m.id === id);
		},
		hasMapItemRepeatCoord(x: number, y: number) {
			return this.mapItems.some((m) => m.x === x && m.y === y);
		},
		linkToMapItem(sourceId: string, targetId: string) {
			if (sourceId === targetId) throw Error("你不能绑定自己");
			const source = this.findMapItemById(sourceId);
			const target = this.findMapItemById(targetId);
			if (!source) throw Error("绑定地皮时找不到源头MapItem");
			if (!target) throw Error("绑定地皮时找不到目标MapItem");
			if (target.beLinked || target.linkto) throw Error("目标MapItem已经处于绑定状态了");
			source.linkto = targetId;
			target.beLinked = sourceId;
			eventBus.emit("map-item-link", sourceId);
		},
		unLinkMapItem(id: string) {
			const mapItem = this.findMapItemById(id);
			if (!mapItem) throw Error("解绑地皮找不到MapItem");
			if (mapItem.linkto) {
				const taget = this.findMapItemById(mapItem.linkto);
				if (!taget) return;
				eventBus.emit("map-item-unlink", id);
				taget.beLinked = undefined;
				taget.property = undefined;
				mapItem.linkto = undefined;
			}
			if (mapItem.beLinked) {
				const taget = this.findMapItemById(mapItem.beLinked);
				if (!taget) return;
				eventBus.emit("map-item-unlink", mapItem.beLinked);
				taget.linkto = undefined;
				mapItem.beLinked = undefined;
				mapItem.property = undefined;
			}
		},

		// MapItemType
		addMapItemType(mapItemType: MapItemType) {
			this.mapItemTypes.push(mapItemType);
		},
		findMapItemTypeById(id: string) {
			return this.mapItemTypes.find((m) => m.id === id);
		},
		removeMapItemType(id: string) {
			const index = this.mapItemTypes.findIndex((s) => s.id === id);
			if (index < 0) throw Error("找不到目标MapItem类型");
			const mapItemIds = this.mapItems.filter((m) => m.type.id === id).map((m) => m.id);
			//级联删除MapItem
			mapItemIds.forEach((mapItemId) => {
				this.removeMapItem(mapItemId);
			});
			this.mapItemTypes.splice(index, 1);
		},

		// MapEvent
		addMapEvent(mapEvent: MapEvent) {
			this.mapEvents.push(mapEvent);
		},
		editMapEvent(mapEvent: MapEvent) {
			const index = this.mapEvents.findIndex((s) => s.id === mapEvent.id);
			if (index < 0) throw Error("找不到目标地图事件");
			const old = this.mapEvents[index];
			if (old.iconId !== mapEvent.iconId) useResourceStore().removeImage(old.iconId);
			Object.assign(this.mapEvents[index], mapEvent);
		},
		reomveMapEvent(id: string) {
			const deleteIndex = this.mapEvents.findIndex((s) => s.id === id);
			if (deleteIndex < 0) throw Error("找不到目标地图事件");
			const mapEvent = this.mapEvents.splice(deleteIndex, 1);
			useResourceStore().removeImage(mapEvent[0].iconId);
		},
		linkMapEvent(mapItemId: string, mapEventId: string | undefined) {
			const mapItem = this.findMapItemById(mapItemId);
			if (!mapItem) throw Error("找不到MapItem");
			if (mapEventId) {
				mapItem.mapEventId = mapEventId;
				eventBus.emit("map-event-link", mapItemId);
			} else {
				mapItem.mapEventId = undefined;
				eventBus.emit("map-event-unlink", mapItemId);
			}
		},
		findMapEventById(id: string) {
			return this.mapEvents.find((e) => e.id === id);
		},

		// ChanceCard
		addChanceCard(chanceCard: ChanceCardInfo) {
			this.chanceCards.push(chanceCard);
		},
		editChanceCard(chanceCard: ChanceCardInfo) {
			const index = this.chanceCards.findIndex((s) => s.id === chanceCard.id);
			if (index < 0) throw Error("找不到目标机会卡");
			const old = this.chanceCards[index];
			if (old.iconId !== chanceCard.iconId) useResourceStore().removeImage(old.iconId);
			Object.assign(this.chanceCards[index], chanceCard);
		},
		reomveChanceCard(id: string) {
			const deleteIndex = this.chanceCards.findIndex((s) => s.id === id);
			if (deleteIndex < 0) throw Error("找不到目标机会卡");
			const chanceCard = this.chanceCards.splice(deleteIndex, 1);
			useResourceStore().removeImage(chanceCard[0].iconId);
		},

		// Property
		addProperty(mapItemId: string, property: PropertyInfo) {
			const mapItem = this.mapItems.find((m) => m.id === mapItemId);
			if (!mapItem) throw Error("找不到目标地块");
			mapItem.property = cloneDeep(property);
		},
		editProperty(mapItemId: string, property: PropertyInfo) {
			const mapItem = this.mapItems.find((m) => m.id === mapItemId);
			if (!mapItem) throw Error("找不到目标地块");
			mapItem.property = cloneDeep(property);
		},
		removeProperty(mapItemId: string) {
			const mapItem = this.mapItems.find((m) => m.id === mapItemId);
			if (!mapItem) throw Error("找不到目标地块");
			mapItem.property = undefined;
		},

		// Role
		addRole(role: Role) {
			this.roles.push(role);
		},
		editRole(role: Role) {
			const index = this.roles.findIndex((s) => s.id === role.id);
			if (index < 0) throw Error("找不到目标角色");
			const old = this.roles[index];
			if (old.imageId !== role.imageId) useResourceStore().removeImage(old.imageId);
			Object.assign(this.roles[index], role);
		},
		findRoleById(id: string) {
			return this.roles.find((r) => r.id === id);
		},
		removeRole(id: string) {
			const deleteIndex = this.roles.findIndex((r) => r.id === id);
			if (deleteIndex < 0) throw Error("找不到目标角色");
			const resourceId = this.roles[deleteIndex].imageId;
			useResourceStore().removeImage(resourceId);
			this.roles.splice(deleteIndex, 1);
		},

		//MapIndex
		updateMapIndex(indexs: string[]) {
			this.mapIndex = indexs;
			eventBus.emit("map-index-update", indexs);
		},

		//UITemplate

		/** 保存或更新组件模板 */
		saveUITemplate(payload: UITemplate) {
			const idx = this.uiTemplates.findIndex((t) => t.id === payload.id);
			if (idx > -1) {
				// 更新：保持引用，避免丢失，或者直接替换
				this.uiTemplates.splice(idx, 1, payload);
			} else {
				// 新增
				this.uiTemplates.push(payload);
			}
		},

		/** 删除组件模板 */
		removeUITemplate(id: string) {
			const idx = this.uiTemplates.findIndex((t) => t.id === id);
			if (idx > -1) {
				this.uiTemplates.splice(idx, 1);
			}
		},

		//ModifierTemplate

		/** 保存或更新 Modifier 模板 */
		saveModifierTemplate(template: ModifierTemplate) {
			const idx = this.modifierTemplates.findIndex((t) => t.id === template.id);
			if (idx > -1) {
				this.modifierTemplates.splice(idx, 1, template);
			} else {
				this.modifierTemplates.push(template);
			}
		},

		/** 删除 Modifier 模板 */
		removeModifierTemplate(id: string) {
			const idx = this.modifierTemplates.findIndex((t) => t.id === id);
			if (idx > -1) {
				this.modifierTemplates.splice(idx, 1);
			}
		},

		//CustomUI

		/** 保存或更新地图实例 */
		saveCustomUI(payload: CustomUI) {
			const idx = this.customUIs.findIndex((ui) => ui.id === payload.id);
			if (idx > -1) {
				this.customUIs.splice(idx, 1, payload);
			} else {
				this.customUIs.push(payload);
			}
		},

		/** 删除地图实例 */
		removeCustomUI(id: string) {
			const idx = this.customUIs.findIndex((ui) => ui.id === id);
			if (idx > -1) {
				this.customUIs.splice(idx, 1);
			}
		},

		//gameSettingForm
		updateGameSettingFrom(form: FormSchema[]) {
			this.gameSettingForm = form;
		},

		// ExtraLibs
		updateExtraLibs(code: string) {
			this.extraLibs = code;
		},

		// MapItem update
		updateMapItem(id: string, updates: Partial<Pick<MapItem, "x" | "y" | "rotation">>) {
			const item = this.findMapItemById(id);
			if (!item) throw Error("找不到目标地图元素");
			Object.assign(item, updates);
		},

		// 批量删除 MapItem
		batchRemoveMapItem(ids: string[]) {
			if (ids.length === 0) return;

			const deletedItems: MapItem[] = [];

			ids.forEach(id => {
				try {
					const index = this.mapItems.findIndex((m) => m.id === id);
					if (index === -1) {
						console.error(`删除 MapItem ${id} 失败: 寻找MapItem失败`);
						return;
					}

					// 保存完整的 mapitem 数据（深拷贝）
					deletedItems.push(cloneDeep(this.mapItems[index]));

					// 手动解绑（不调用 removeMapItem 避免重复 updateMapIndex）
					if (this.mapItems[index].linkto) {
						const taget = this.findMapItemById(this.mapItems[index].linkto!);
						if (taget) {
							taget.beLinked = undefined;
							taget.property = undefined;
							eventBus.emit("map-item-unlink", this.mapItems[index].id);
						}
					}
					if (this.mapItems[index].beLinked) {
						const taget = this.findMapItemById(this.mapItems[index].beLinked);
						if (taget) {
							taget.linkto = undefined;
							eventBus.emit("map-item-unlink", this.mapItems[index].beLinked);
						}
					}
					this.mapItems.splice(index, 1);
					eventBus.emit("map-item-deleted", id);
				} catch (e) {
					console.error(`删除 MapItem ${id} 失败:`, e);
				}
			});

			// 将这次删除的记录作为一个批次添加到历史中（最多保留 50 个批次）
			if (deletedItems.length > 0) {
				const editorStore = useEditorStore();
				editorStore.deletedMapItemBatches.unshift({
					timestamp: Date.now(),
					items: deletedItems
				});
				// 限制批次数量
				if (editorStore.deletedMapItemBatches.length > 50) {
					editorStore.deletedMapItemBatches = editorStore.deletedMapItemBatches.slice(0, 50);
				}
			}

			// 批量删除完成后只更新一次
			this.updateMapIndex([]);
		},

		// 批量移动 MapItem
		batchMoveMapItem(ids: string[], deltaX: number, deltaY: number) {
			if (ids.length === 0) return;
			if (deltaX === 0 && deltaY === 0) return;

			// 检测目标位置冲突
			const conflicts: string[] = [];
			ids.forEach(id => {
				const item = this.findMapItemById(id);
				if (!item) return;
				const targetX = item.x + deltaX;
				const targetY = item.y + deltaY;

				// 检查目标位置是否被其他（非选中）MapItem 占用
				const isOccupied = this.mapItems.some(other => {
					return other.x === targetX && other.y === targetY && !ids.includes(other.id);
				});

				if (isOccupied) {
					conflicts.push(`${id} -> (${targetX}, ${targetY})`);
				}
			});

			if (conflicts.length > 0) {
				throw Error(`目标位置已被占用: ${conflicts.join(", ")}`);
			}

			// 执行移动
			ids.forEach(id => {
				const item = this.findMapItemById(id);
				if (item) {
					this.updateMapItem(id, {
						x: item.x + deltaX,
						y: item.y + deltaY,
					});
				}
			});

			// 通知渲染器更新
			ids.forEach(id => {
				eventBus.emit("map-item-updated", id);
			});
		},

			// 批量旋转 MapItem
			batchRotateMapItem(ids: string[], direction: 1 | -1) {
				if (ids.length === 0) return;

				// 执行旋转（direction: 1 = 顺时针 90°, -1 = 逆时针 90°）
				ids.forEach(id => {
					const item = this.findMapItemById(id);
					if (item) {
						// rotation 值域为 0 | 1 | 2 | 3，分别对应 0°, 90°, 180°, 270°
						const newRotation = ((item.rotation + direction + 4) % 4) as 0 | 1 | 2 | 3;
						this.updateMapItem(id, { rotation: newRotation });
					}
				});

				// 通知渲染器更新
				ids.forEach(id => {
					eventBus.emit("map-item-updated", id);
				});
			},

		// MapEvent edit
		updateMapEvent(mapEvent: MapEvent) {
			this.editMapEvent(mapEvent);
		},

		// ChanceCard edit
		updateChanceCard(chanceCard: ChanceCardInfo) {
			this.editChanceCard(chanceCard);
		},
	},
});

export type ResourcesType = {
	id: string;
	name: string;
	fileType: string;
	url: string;
};

export const useResourceStore = defineStore("Resources", {
	state: (): { models: ResourcesType[]; images: ResourcesType[] } => ({
		models: [],
		images: [],
	}),
	actions: {
		addModel(model: ResourcesType) {
			this.models.push(model);
		},
		updateModel(model: ResourcesType) {
			const index = this.models.findIndex((m) => m.id === model.id);
			if (index > -1) {
				Object.assign(this.models[index], model);
			}
		},
		addImage(image: ResourcesType) {
			this.images.push(image);
		},

		/**
		 * 添加临时模型（使用 empty.glb 模板）
		 * @returns 新创建的模型资源
		 */
		async addTempModel(): Promise<ResourcesType> {
			const id = generateShortId('model');

			// 使用 electronAPI 复制 empty.glb 到 temp 目录
			const result = await window.electronAPI.copyEmptyResource("model");

			const newModel: ResourcesType = {
				id,
				name: `临时模型 ${this.models.length + 1}`,
				fileType: result.fileType,
				url: result.url, // 直接使用返回的 fp-file:// URL
			};
			this.models.push(newModel);
			return newModel;
		},

		/**
		 * 添加临时图片（使用 empty.png 模板）
		 * @returns 新创建的图片资源
		 */
		async addTempImage(): Promise<ResourcesType> {
			const id = generateShortId('image');

			// 使用 electronAPI 复制 empty.png 到 temp 目录
			const result = await window.electronAPI.copyEmptyResource("image");

			const newImage: ResourcesType = {
				id,
				name: `临时图片 ${this.images.length + 1}`,
				fileType: result.fileType,
				url: result.url, // 直接使用返回的 fp-file:// URL
			};
			this.images.push(newImage);
			return newImage;
		},

		removeModel(id: string) {
			const deleteIndex = this.models.findIndex((m) => m.id === id);
			if (deleteIndex < 0) throw Error("找不到目标模型资源");
			//级联删除MapItemType
			const mapItemTypeIds = useMapDataStore()
				.mapItemTypes.filter((m) => m.modelId === id)
				.map((m) => m.id);
			mapItemTypeIds.forEach((mapItemTypeId) => {
				useMapDataStore().removeMapItemType(mapItemTypeId);
			});

			//级联删除默认房屋模型
			useMapDataStore().buildingModelIdList = useMapDataStore().buildingModelIdList.map((i) => (i === id ? "" : i));
			this.models.splice(deleteIndex, 1);
		},
		removeImage(id: string) {
			if (!id) return;
			const deleteIndex = this.images.findIndex((i) => i.id === id);
			if (deleteIndex < 0) return;
			this.images.splice(deleteIndex, 1);
		},
		findModelById(id: string) {
			return this.models.find((m) => m.id === id);
		},
		findImageById(id: string) {
			return this.images.find((i) => i.id === id);
		},
	},
});

type EditorState = {
	currentFilePath: string;
	currentEditMode: OperationMode;
	currentMapItemId: string | undefined;
	currentMapItemTypeId: string | undefined;
	currentCameraMode: CameraMode;
	isLinkMode: boolean;
	isLoading: boolean;
	loadingText: string;
	loadingCount: number;
	// 多选状态
	selectedMapItemIds: string[];
	isBoxSelectMode: boolean;
	isBoxSelecting: boolean;
	boxSelectStart: { x: number; y: number } | null;
	boxSelectUpdateCounter: number;
	// 撤销删除历史（分批次）
	deletedMapItemBatches: Array<{
		timestamp: number;
		items: MapItem[];
	}>;
	showIndicators: boolean;
};

type EditorAlert = {
	type: "success" | "info" | "warning" | "error";
	message: string;
	visible: () => boolean;
};

const alertList: EditorAlert[] = [
	{
		type: "warning",
		message: "没有设置地图背景",
		visible: () => useMapDataStore().info.backgroundImageId === "",
	},
	{
		type: "warning",
		message: "没有设置地图封面",
		visible: () => useMapDataStore().info.coverImageId === "",
	},
	{
		type: "warning",
		message: "没有机会卡",
		visible: () => useMapDataStore().chanceCards.length === 0,
	},
	{
		type: "error",
		message: "没有设置地皮等级(房屋)模型",
		visible: () => {
			const idList = useMapDataStore().buildingModelIdList;
			return idList.some((i) => i == "") || idList.length === 0;
		},
	},
	{
		type: "error",
		message: "没有设置地图名称",
		visible: () => useMapDataStore().info.name === "",
	},
	{
		type: "error",
		message: "没有设置地图索引路径",
		visible: () => useMapDataStore().mapIndex.length === 0,
	},
	{
		type: "error",
		message: "没有加入模型",
		visible: () => useResourceStore().models.length === 0,
	},
	{
		type: "error",
		message: "被绑定地皮没有设置地皮参数",
		visible: () => {
			return useMapDataStore().mapItems.some((m) => m.beLinked && !m.property);
		},
	},
	{
		type: "error",
		message: "没有角色",
		visible: () => useMapDataStore().roles.length === 0,
	},
	{
		type: "error",
		message: "空的地图",
		visible: () => {
			return useMapDataStore().mapItems.length === 0;
		},
	},
];

export const useEditorStore = defineStore("Editor", {
	state: (): EditorState => ({
		currentFilePath: "",
		currentEditMode: OperationMode.Select,
		currentMapItemId: undefined,
		currentMapItemTypeId: undefined,
		currentCameraMode: CameraMode.Perspective,
		isLinkMode: false,
		isLoading: false,
		loadingText: "加载中...",
		loadingCount: 0,
		// 多选状态初始值
		selectedMapItemIds: [],
		isBoxSelectMode: false,
		isBoxSelecting: false,
		boxSelectStart: null,
		boxSelectUpdateCounter: 0,
		// 撤销删除历史初始值（分批次）
		deletedMapItemBatches: [],
		showIndicators: true,
	}),
	actions: {
		setLoading(loading: boolean, text = "加载中...") {
			if (loading) {
				this.loadingCount++;
				this.isLoading = true;
				this.loadingText = text;
				return;
			}

			this.loadingCount = Math.max(0, this.loadingCount - 1);
			this.isLoading = this.loadingCount > 0;

			if (!this.isLoading) {
				this.loadingText = "加载中...";
			}
		},
		async withLoading<T>(task: () => Promise<T>, text = "加载中..."): Promise<T> {
			this.setLoading(true, text);
			try {
				return await task();
			} finally {
				this.setLoading(false);
			}
		},
		setCurrentFilePath(path: string) {
			this.currentFilePath = path;
			localStorage.setItem(`last-time-file-path-${navigator.platform}`, path);
		},
		setCameraMode(newMode: CameraMode) {
			this.currentCameraMode = newMode;
		},
		// 多选相关 actions
		toggleBoxSelectMode() {
			if (this.currentCameraMode !== CameraMode.Orthographic) {
				throw Error("框选功能仅支持正交相机模式");
			}
			this.isBoxSelectMode = !this.isBoxSelectMode;
			// 重置框选状态
			this.isBoxSelecting = false;
			this.boxSelectStart = null;
		},
		exitBoxSelectMode() {
			this.isBoxSelectMode = false;
			this.isBoxSelecting = false;
			this.boxSelectStart = null;
		},
		startBoxSelect(x: number, y: number) {
			this.isBoxSelecting = true;
			this.boxSelectStart = { x, y };
		},
		updateBoxSelect(x: number, y: number) {
			// 触发响应式更新，让 renderer 获取最新的鼠标位置
			this.boxSelectUpdateCounter++;
		},
		endBoxSelect() {
			this.isBoxSelecting = false;
			this.boxSelectStart = null;
		},
		setSelectedMapItemIds(ids: string[]) {
			this.selectedMapItemIds = ids;
			// 同时更新 currentMapItemId 以保持兼容性
			this.currentMapItemId = ids.length === 1 ? ids[0] : undefined;
		},
		addSelectedMapItemId(id: string) {
			if (!this.selectedMapItemIds.includes(id)) {
				this.selectedMapItemIds.push(id);
			}
			// 保持与 setSelectedMapItemIds 一致的逻辑
			if (this.selectedMapItemIds.length === 1) {
				this.currentMapItemId = this.selectedMapItemIds[0];
			} else {
				this.currentMapItemId = undefined;
			}
		},
		removeSelectedMapItemId(id: string) {
			const index = this.selectedMapItemIds.indexOf(id);
			if (index > -1) {
				this.selectedMapItemIds.splice(index, 1);
			}
			// 保持与 setSelectedMapItemIds 一致的逻辑
			if (this.selectedMapItemIds.length === 1) {
				this.currentMapItemId = this.selectedMapItemIds[0];
			} else {
				this.currentMapItemId = undefined;
			}
		},
		clearSelectedMapItemIds() {
			this.selectedMapItemIds = [];
			this.currentMapItemId = undefined;
		},
		// 撤销删除相关 actions
		popLastDeletedBatch(): MapItem[] {
			if (this.deletedMapItemBatches.length === 0) return [];
			return this.deletedMapItemBatches.shift()!.items;
		},
		clearDeletedHistory() {
			this.deletedMapItemBatches = [];
		},
		toggleIndicators() {
			this.showIndicators = !this.showIndicators;
		},
	},
	getters: {
		currentMapItem: (state) => {
			return state.currentMapItemId ? useMapDataStore().findMapItemById(state.currentMapItemId) : undefined;
		},
		currentMapItemType: (state) => {
			return state.currentMapItemTypeId ? useMapDataStore().findMapItemTypeById(state.currentMapItemTypeId) : undefined;
		},
		alertList: (state) => {
			const res = alertList.filter((a) => a.visible());
			const alertLeverMap = {
				error: 3,
				warning: 2,
				info: 1,
				success: 0,
			};
			return res
				.map((a) => ({ type: a.type, message: a.message }))
				.sort((a, b) => alertLeverMap[a.type] - alertLeverMap[b.type]);
		},
		hasMultipleSelection: (state) => state.selectedMapItemIds.length > 1,
		selectedMapItems: (state): MapItem[] => {
			const items = state.selectedMapItemIds
				.map((id) => useMapDataStore().findMapItemById(id))
				.filter((item): item is MapItem => item !== undefined);
			return items;
		},
		canUndoDelete: (state) => state.deletedMapItemBatches.length > 0,
	},
});

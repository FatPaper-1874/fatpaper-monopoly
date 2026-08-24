import { defineStore } from "pinia";
import { ChanceCardInfo, FormSchema, GameMap, MapPath, GameMapChangelogEntry, ModifierTemplate, PropertyInfo, UITemplate } from "@mine-monopoly/types";
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
import { createMapPathId } from "@mine-monopoly/utils";
import { cloneDeep } from "lodash";

export type MapPathValidationResult = {
	level: "error" | "warning";
	code: string;
	message: string;
	pathId?: string;
	mapItemId?: string;
};

type MapPathHistoryEntry = {
	label: string;
	before: { mapPaths: MapPath[]; mapIndex: string[] };
	after: { mapPaths: MapPath[]; mapIndex: string[] };
};

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

			this.removeMapPathsByMapItemId(id, false);
			if (this.startMapItemId === id) this.startMapItemId = undefined;
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

		// MapPath
		getPathsFrom(mapItemId: string): MapPath[] {
			return this.mapPaths.filter((path) => path.fromMapItemId === mapItemId);
		},
		getPathsTo(mapItemId: string): MapPath[] {
			return this.mapPaths.filter((path) => path.toMapItemId === mapItemId);
		},
		findMapPathById(pathId: string): MapPath | undefined {
			return this.mapPaths.find((path) => path.id === pathId);
		},
		addMapPath(input: Omit<MapPath, "id"> & { id?: string }): MapPath {
			const path: MapPath = {
				...input,
				id: input.id || createMapPathId(input.fromMapItemId, input.toMapItemId),
			};
			if (this.findMapPathById(path.id)) throw Error("路径 ID 已存在");
			this.assertMapPathCanBeSaved(path);
			this.mutateMapPaths("新增路径", () => {
				this.mapPaths.push(path);
				this.clearMapIndexForPathTopologyChange();
				eventBus.emit("map-path-added", path.id);
			});
			return path;
		},
		updateMapPath(pathId: string, patch: Partial<Pick<MapPath, "fromMapItemId" | "toMapItemId" | "initEnable" | "name" | "description">>): void {
			const path = this.findMapPathById(pathId);
			if (!path) throw Error("找不到目标路径");
			const nextPath = { ...path, ...patch };
			this.assertMapPathCanBeSaved(nextPath, pathId);

			const endpointChanged =
				nextPath.fromMapItemId !== path.fromMapItemId ||
				nextPath.toMapItemId !== path.toMapItemId;
			const initEnableChanged = (nextPath.initEnable === false) !== (path.initEnable === false);
			const metadataChanged = nextPath.name !== path.name || nextPath.description !== path.description;
			if (!endpointChanged && !initEnableChanged && !metadataChanged) return;

			this.mutateMapPaths("编辑路径", () => {
				Object.assign(path, patch);
				// 只有实际改变路径行为时才使旧版 mapIndex 失效；名称和说明不影响兼容拓扑。
				if (endpointChanged || initEnableChanged) this.clearMapIndexForPathTopologyChange();
				eventBus.emit("map-path-updated", pathId);
			});
		},
		removeMapPath(pathId: string): void {
			this.removeMapPaths((path) => path.id === pathId, "删除路径");
		},
		removeMapPathsByMapItemId(mapItemId: string, recordHistory = true): void {
			this.removeMapPaths(
				(path) => path.fromMapItemId === mapItemId || path.toMapItemId === mapItemId,
				"删除节点关联路径",
				recordHistory,
			);
		},
		moveMapPath(pathId: string, direction: -1 | 1): void {
			const index = this.mapPaths.findIndex((path) => path.id === pathId);
			if (index < 0) throw Error("找不到目标路径");
			const targetIndex = index + direction;
			if (targetIndex < 0 || targetIndex >= this.mapPaths.length) return;
			this.mutateMapPaths("调整路径优先级", () => {
				const [path] = this.mapPaths.splice(index, 1);
				this.mapPaths.splice(targetIndex, 0, path);
				this.clearMapIndexForPathTopologyChange();
				eventBus.emit("map-path-updated", pathId);
			});
		},
		setStartMapItemId(mapItemId: string | undefined): void {
			if (mapItemId && !this.findMapItemById(mapItemId)) throw Error("找不到地图起点");
			this.startMapItemId = mapItemId;
		},
		undoMapPathChange(): boolean {
			const entry = useEditorStore().popMapPathUndo();
			if (!entry) return false;
			this.restoreMapPathState(entry.before);
			return true;
		},
		redoMapPathChange(): boolean {
			const entry = useEditorStore().popMapPathRedo();
			if (!entry) return false;
			this.restoreMapPathState(entry.after);
			return true;
		},
		restoreMapPathState(state: { mapPaths: MapPath[]; mapIndex: string[] }): void {
			this.mapPaths = cloneDeep(state.mapPaths);
			this.mapIndex = cloneDeep(state.mapIndex);
			eventBus.emit("map-paths-replaced");
			eventBus.emit("map-index-update", [...this.mapIndex]);
		},
		/** 是否已明确配置可行走的 MapItem 类型。 */
		hasPathMapItemTypeSelection(): boolean {
			return (this.pathMapItemTypeIds?.length ?? 0) > 0;
		},
		/** 设置可行走的 MapItem 类型；地皮承载物始终不会作为路径节点。 */
		setPathMapItemTypeIds(typeIds: string[]): void {
			this.pathMapItemTypeIds = [...new Set(typeIds)];
		},
		/** 获取玩家实际可经过的路径节点，而非地图中的全部装饰元素。 */
		getPathMapItems(): MapItem[] {
			const selectedTypeIds = this.pathMapItemTypeIds ?? [];
			if (selectedTypeIds.length > 0) {
				const selectedTypeNames = new Set(
					selectedTypeIds
						.map((id) => this.mapItemTypes.find((type) => type.id === id)?.name)
						.filter((name): name is string => Boolean(name)),
				);
				return this.mapItems.filter((item) => {
					if (item.beLinked) return false;
					const itemTypeId = item.type?.id;
					const itemTypeName = item.type?.name;
					return Boolean(
						(itemTypeId && selectedTypeIds.includes(itemTypeId)) ||
						(itemTypeName && selectedTypeNames.has(itemTypeName)),
					);
				});
			}

			// 旧地图没有保存节点类型时，回退为已建路径的端点，避免把装饰和地皮承载物误判为路径节点。
			const pathNodeIds = new Set<string>();
			for (const path of this.mapPaths) {
				pathNodeIds.add(path.fromMapItemId);
				pathNodeIds.add(path.toMapItemId);
			}
			return this.mapItems.filter((item) => !item.beLinked && pathNodeIds.has(item.id));
		},
		getMapPathCompatibility(): { compatible: boolean; reason?: string } {
			const pathMapItems = this.getPathMapItems();
			const pathMapItemIds = new Set(pathMapItems.map((item) => item.id));
			if (this.mapPaths.length === 0) return { compatible: pathMapItems.length === 0, reason: "没有路径" };
			if (this.mapPaths.some((path) => path.initEnable === false)) return { compatible: false, reason: "包含初始关闭路径" };
			if (this.mapPaths.some((path) => !pathMapItemIds.has(path.fromMapItemId) || !pathMapItemIds.has(path.toMapItemId))) return { compatible: false, reason: "路径包含非路径节点" };
			if (this.mapPaths.length !== pathMapItems.length) return { compatible: false, reason: "路径数与节点数不一致" };
			const fromCounts = new Map<string, number>();
			const toCounts = new Map<string, number>();
			for (const path of this.mapPaths) {
				fromCounts.set(path.fromMapItemId, (fromCounts.get(path.fromMapItemId) ?? 0) + 1);
				toCounts.set(path.toMapItemId, (toCounts.get(path.toMapItemId) ?? 0) + 1);
			}
			if (pathMapItems.some((item) => fromCounts.get(item.id) !== 1 || toCounts.get(item.id) !== 1)) {
				return { compatible: false, reason: "不是覆盖所有路径节点的单向简单闭环" };
			}
			return { compatible: true };
		},
		validateMapPaths(): MapPathValidationResult[] {
			const results: MapPathValidationResult[] = [];
			const pathMapItems = this.getPathMapItems();
			const pathMapItemIds = new Set(pathMapItems.map((item) => item.id));
			const hasPathMapItemTypeSelection = this.hasPathMapItemTypeSelection();
			if (!hasPathMapItemTypeSelection && pathMapItems.length > 0) {
				results.push({ level: "warning", code: "path-node-types-not-configured", message: "未配置路径节点类型，当前仅按已建路径端点校验，无法识别遗漏节点" });
			}

			const pairSet = new Set<string>();
			for (const path of this.mapPaths) {
				const fromMapItem = this.findMapItemById(path.fromMapItemId);
				const toMapItem = this.findMapItemById(path.toMapItemId);
				if (!fromMapItem || !toMapItem) {
					results.push({ level: "error", code: "dangling-endpoint", message: "路径端点不存在", pathId: path.id });
				} else if (hasPathMapItemTypeSelection && (!pathMapItemIds.has(fromMapItem.id) || !pathMapItemIds.has(toMapItem.id))) {
					results.push({ level: "error", code: "non-path-node-endpoint", message: "路径端点不是可行走的路径节点", pathId: path.id });
				}
				const pairKey = `${path.fromMapItemId}\u0000${path.toMapItemId}`;
				if (pairSet.has(pairKey)) results.push({ level: "error", code: "duplicate-directed-path", message: "存在重复的有向路径", pathId: path.id });
				pairSet.add(pairKey);
			}
			for (const mapItem of pathMapItems) {
				const outgoing = this.getPathsFrom(mapItem.id).filter((path) => pathMapItemIds.has(path.toMapItemId));
				// 死路是合法设计：仅在存在出边但全部初始关闭时给出提示。
				if (outgoing.length > 0 && outgoing.every((path) => path.initEnable === false)) {
					results.push({ level: "warning", code: "all-outgoing-disabled", message: "节点所有出边初始关闭", mapItemId: mapItem.id });
				}
			}
			const compatibility = this.getMapPathCompatibility();
			// mapIndex 仅用于旧版线性地图兼容；新图结构清空它后不应再因分支或死路报警。
			if (this.mapIndex.length > 0 && !compatibility.compatible && this.mapPaths.length > 0) {
				results.push({ level: "warning", code: "legacy-map-index-incompatible", message: `与旧版 mapIndex 不兼容：${compatibility.reason}` });
			}
			const startId = this.startMapItemId || this.mapIndex[0] || pathMapItems[0]?.id;
			if (startId && pathMapItemIds.has(startId)) {
				const visited = new Set<string>([startId]);
				const queue = [startId];
				while (queue.length > 0) {
					const currentId = queue.shift()!;
					for (const path of this.getPathsFrom(currentId)) {
						if (pathMapItemIds.has(path.toMapItemId) && !visited.has(path.toMapItemId)) {
							visited.add(path.toMapItemId);
							queue.push(path.toMapItemId);
						}
					}
				}
				for (const mapItem of pathMapItems) {
					if (!visited.has(mapItem.id)) results.push({ level: "warning", code: "unreachable-node", message: "从地图起点不可达", mapItemId: mapItem.id });
				}
			} else if (this.startMapItemId && pathMapItems.length > 0) {
				results.push({ level: "warning", code: "start-not-path-node", message: "地图起点不是可行走的路径节点", mapItemId: this.startMapItemId });
			}
			return results;
		},
		replaceMapPaths(paths: MapPath[], label = "重建路径"): void {
			const nextPaths = cloneDeep(paths);
			const pathIds = new Set<string>();
			const directedPairs = new Set<string>();
			for (const path of nextPaths) {
				if (!this.findMapItemById(path.fromMapItemId) || !this.findMapItemById(path.toMapItemId)) {
					throw Error("路径的起点和终点必须是现有 MapItem");
				}
				if (pathIds.has(path.id)) throw Error("路径 ID 不能重复");
				const pairKey = `${path.fromMapItemId}\u0000${path.toMapItemId}`;
				if (directedPairs.has(pairKey)) throw Error("同一方向的路径只能存在一条");
				pathIds.add(path.id);
				directedPairs.add(pairKey);
			}
			this.mutateMapPaths(label, () => {
				this.mapPaths = nextPaths;
				this.clearMapIndexForPathTopologyChange();
				eventBus.emit("map-paths-replaced");
			});
		},
		assertMapPathCanBeSaved(path: MapPath, ignoredPathId?: string): void {
			if (!this.findMapItemById(path.fromMapItemId) || !this.findMapItemById(path.toMapItemId)) throw Error("路径的起点和终点必须是现有 MapItem");
			const duplicate = this.mapPaths.some((candidate) => candidate.id !== ignoredPathId && candidate.fromMapItemId === path.fromMapItemId && candidate.toMapItemId === path.toMapItemId);
			if (duplicate) throw Error("同一方向的路径只能存在一条");
		},
		removeMapPaths(predicate: (path: MapPath) => boolean, label: string, recordHistory = true, emitIndividually = true): void {
			const removed = this.mapPaths.filter(predicate);
			if (removed.length === 0) return;
			const mutation = () => {
				this.mapPaths = this.mapPaths.filter((path) => !predicate(path));
				this.clearMapIndexForPathTopologyChange();
				if (emitIndividually) {
					for (const path of removed) eventBus.emit("map-path-removed", path.id);
				} else {
					eventBus.emit("map-paths-replaced");
				}
			};
			if (recordHistory) this.mutateMapPaths(label, mutation);
			else mutation();
		},
		mutateMapPaths(label: string, mutation: () => void): void {
			const before = { mapPaths: cloneDeep(this.mapPaths), mapIndex: cloneDeep(this.mapIndex) };
			mutation();
			const after = { mapPaths: cloneDeep(this.mapPaths), mapIndex: cloneDeep(this.mapIndex) };
			if (JSON.stringify(before) !== JSON.stringify(after)) useEditorStore().pushMapPathHistory({ label, before, after });
		},
		clearMapIndexForPathTopologyChange(): void {
			if (this.mapIndex.length > 0) this.updateMapIndex([]);
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
			eventBus.emit("map-paths-for-map-item-updated", id);
		},

		// 批量删除 MapItem
		batchRemoveMapItem(ids: string[]) {
			if (ids.length === 0) return;
			this.removeMapPaths(
				(path) => ids.includes(path.fromMapItemId) || ids.includes(path.toMapItemId),
				"批量删除节点关联路径",
				false,
				false,
			);
			if (this.startMapItemId && ids.includes(this.startMapItemId)) this.startMapItemId = undefined;

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
	mapPathUndoStack: MapPathHistoryEntry[];
	mapPathRedoStack: MapPathHistoryEntry[];
	pathDraftSourceId?: string;
	activeMapPathId?: string;
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
		visible: () => useMapDataStore().mapPaths.length === 0 && useMapDataStore().mapIndex.length === 0,
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
		mapPathUndoStack: [],
		mapPathRedoStack: [],
		pathDraftSourceId: undefined,
		activeMapPathId: undefined,
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
		pushMapPathHistory(entry: MapPathHistoryEntry) {
			this.mapPathUndoStack.push(entry);
			if (this.mapPathUndoStack.length > 100) this.mapPathUndoStack.shift();
			this.mapPathRedoStack = [];
		},
		popMapPathUndo(): MapPathHistoryEntry | undefined {
			const entry = this.mapPathUndoStack.pop();
			if (entry) this.mapPathRedoStack.push(entry);
			return entry;
		},
		popMapPathRedo(): MapPathHistoryEntry | undefined {
			const entry = this.mapPathRedoStack.pop();
			if (entry) this.mapPathUndoStack.push(entry);
			return entry;
		},
		clearMapPathHistory() {
			this.mapPathUndoStack = [];
			this.mapPathRedoStack = [];
		},
		setPathDraftSource(mapItemId?: string) {
			this.pathDraftSourceId = mapItemId;
		},
		setActiveMapPath(pathId?: string) {
			this.activeMapPathId = pathId;
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
		canUndoMapPath: (state) => state.mapPathUndoStack.length > 0,
		canRedoMapPath: (state) => state.mapPathRedoStack.length > 0,
	},
});

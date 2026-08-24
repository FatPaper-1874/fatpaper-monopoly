/**
 * MCP Bridge Handler for Renderer Process
 *
 * This file handles MCP tool invocations from the main process.
 * All MCP tools now route through this handler to access Pinia stores.
 */

import { useMapDataStore, useResourceStore, useEditorStore } from "@src/stores";
import { createDefaultMapData } from "@src/utils/file";
import { eventBus } from "@src/utils/event-bus";
import { mapContentService } from "@src/services";
import type { MCPToolName } from "./bridge.js";
import { validateMap } from "./utils.js";
import { createMapPathId } from "@mine-monopoly/utils";

/**
 * Send MCP operation feedback event
 */
function sendMCPFeedback(operation: string, success: boolean, message: string, details?: any) {
	eventBus.emit("mcp-operation", {
		operation,
		success,
		message,
		details,
	});
}

/**
 * Helper to convert reactive objects to plain objects for IPC
 */
function toPlain<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

const batchMutationTools = new Set<MCPToolName>([
	"add_chance_card", "update_chance_card", "remove_chance_card",
	"add_map_event", "update_map_event", "remove_map_event",
	"add_role", "update_role", "remove_role",
	"add_phase", "update_phase", "remove_phase",
	"add_property", "update_property", "remove_property",
	"add_game_setting", "update_game_setting", "remove_game_setting",
	"create_ui_template", "update_ui_template", "remove_ui_template",
	"create_custom_ui", "update_custom_ui", "remove_custom_ui",
	"create_modifier_template", "update_modifier_template", "remove_modifier_template",
	"update_extra_libs",
	"add_map_path", "update_map_path", "remove_map_path", "replace_map_paths", "update_map_path_settings",
]);

/**
 * Initialize the MCP bridge handler
 * Call this in the main.ts of the renderer process
 */
export function initMCPBridge() {
	// Register the tool handler with the preload script via contextBridge
	console.log("MCP Bridge initialized");

	// Get the mcpAPI from window (exposed by contextBridge)
	const mcpAPI = (window as any).mcpAPI;
	if (mcpAPI && mcpAPI.registerToolHandler) {
		mcpAPI.registerToolHandler(handleToolInvocation);
		console.log("MCP Tool handler registered successfully");
	} else {
		console.error("mcpAPI.registerToolHandler not available!");
	}
}

/**
 * Handle tool invocation by routing to the appropriate store action
 */
export async function handleToolInvocation(toolName: MCPToolName, args: any): Promise<any> {
	const mapDataStore = useMapDataStore();
	const resourceStore = useResourceStore();
	const editorStore = useEditorStore();

	const startTime = Date.now();
	console.log(`[MCP Bridge] 🚀 Tool invoked: ${toolName}`);
	console.log(`[MCP Bridge] 📥 Arguments:`, JSON.stringify(args, null, 2));

	try {
		let result: any;

		switch (toolName) {
			// Chance Card Tools
			case "add_chance_card": {
				const serviceResult = await mapContentService.addChanceCard(args);
				result = toPlain(serviceResult);
				break;
			}

			case "update_chance_card": {
				const serviceResult = await mapContentService.updateChanceCard(args);
				result = toPlain(serviceResult);
				break;
			}

			case "remove_chance_card": {
				await mapContentService.removeChanceCard(args.cardId);
				result = { success: true };
				break;
			}

			case "get_chance_card_by_id": {
				const chanceCard = mapDataStore.chanceCards.find((card) => card.id === args.cardId);
				if (!chanceCard) throw new Error(`ChanceCard with ID ${args.cardId} not found`);
				result = toPlain(chanceCard);
				break;
			}

			case "list_chance_cards": {
				result = toPlain(mapDataStore.chanceCards.map(({ effectCode, ...chanceCard }) => chanceCard));
				break;
			}

			// Map Event Tools
			case "add_map_event": {
				const serviceResult = await mapContentService.addMapEvent(args);
				result = toPlain(serviceResult);
				break;
			}

			case "update_map_event": {
				const serviceResult = await mapContentService.updateMapEvent(args);
				result = toPlain(serviceResult);
				break;
			}

			case "remove_map_event": {
				await mapContentService.removeMapEvent(args.eventId);
				result = { success: true };
				break;
			}

			case "get_map_event_by_id": {
				const event = mapDataStore.findMapEventById(args.eventId);
				if (!event) throw new Error(`MapEvent with ID ${args.eventId} not found`);
				result = toPlain(event);
				break;
			}

			case "list_map_events": {
				result = toPlain(mapDataStore.mapEvents.map(({ effectCode, ...mapEvent }) => mapEvent));
				break;
			}

			// Role Tools
			case "add_role": {
				const serviceResult = await mapContentService.addRole(args);
				result = toPlain(serviceResult);
				break;
			}

			case "update_role": {
				const serviceResult = await mapContentService.updateRole(args);
				result = toPlain(serviceResult);
				break;
			}

			case "remove_role": {
				await mapContentService.removeRole(args.roleId);
				result = { success: true };
				break;
			}

			case "get_role_by_id": {
				const role = mapDataStore.roles.find((entry) => entry.id === args.roleId);
				if (!role) throw new Error(`Role with ID ${args.roleId} not found`);
				result = toPlain(role);
				break;
			}

			case "list_roles": {
				result = toPlain(mapDataStore.roles.map(({ initCode, ...role }) => role));
				break;
			}

			// Game Phase Tools
			case "get_phases": {
				const serviceResult = await mapContentService.getPhases();
				result = toPlain(Object.fromEntries(
					Object.entries(serviceResult).map(([phaseType, phases]) => [
						phaseType,
						(phases as any[]).map(({ initEventCode, ...phase }) => phase),
					]),
				));
				break;
			}

			case "get_phase_by_id": {
				const phaseType = args.phaseType as keyof typeof mapDataStore.phases;
				const phases = mapDataStore.phases[phaseType];
				const phase = phases?.find((entry: any) => entry.id === args.phaseId);
				if (!phase) throw new Error(`Phase with ID ${args.phaseId} not found in ${args.phaseType}`);
				result = toPlain(phase);
				break;
			}

			case "add_phase": {
				const serviceResult = await mapContentService.addPhase(args);
				result = toPlain(serviceResult);
				break;
			}

			case "update_phase": {
				const serviceResult = await mapContentService.updatePhase(args);
				result = toPlain(serviceResult);
				break;
			}

			case "remove_phase": {
				await mapContentService.removePhase(args.phaseId, args.phaseType);
				result = { success: true };
				break;
			}

			// Extra Libs Tools
			case "get_extra_libs": {
				const serviceResult = await mapContentService.getExtraLibs();
				result = toPlain(serviceResult);
				break;
			}

			case "update_extra_libs": {
				await mapContentService.updateExtraLibs(args.code);
				// 发送类型刷新事件，通知 Monaco 验证器清除缓存
				eventBus.emit("refresh-monaco-types");
				result = { success: true };
				break;
			}


			case "list_type_libs": {
				const typeLibraries = await mapContentService.getAllTypeLibs();
				result = Object.entries(typeLibraries).map(([id, code]) => ({ id: id.replace(/([A-Z])/g, "-$1").toLowerCase(), characters: code.length }));
				break;
			}

			case "get_type_lib": {
				const typeLibraries = await mapContentService.getAllTypeLibs();
				const keyMap: Record<string, keyof typeof typeLibraries> = {
					"extra-libs": "extraLibs",
					"ui-template-types": "uiTemplateTypes",
					"game-setting-types": "gameSettingTypes",
					"modifier-template-types": "modifierTemplateTypes",
				};
				const key = keyMap[args.typeLibId];
				if (!key) throw new Error(`Unknown type library: ${args.typeLibId}`);
				result = { id: args.typeLibId, code: typeLibraries[key] };
				break;
			}

			// Resource Tools
			case "list_models":
				result = toPlain(resourceStore.models);
				break;

			case "list_images":
				result = toPlain(resourceStore.images);
				break;

			case "list_resources": {
				const resources = [
					...resourceStore.models.map((resource) => ({ ...resource, resourceType: "model" })),
					...resourceStore.images.map((resource) => ({ ...resource, resourceType: "image" })),
				].filter((resource) => (!args.type || resource.resourceType === args.type) && (!args.query || resource.name.toLowerCase().includes(args.query.toLowerCase())));
				result = { total: resources.length, offset: args.offset, limit: args.limit, items: toPlain(resources.slice(args.offset, args.offset + args.limit)) };
				break;
			}

			case "get_resource_by_id": {
				// Try to find as image first, then as model
				let resource = resourceStore.findImageById(args.resourceId);
				if (!resource) {
					resource = resourceStore.models.find(m => m.id === args.resourceId);
				}
				if (!resource) throw new Error(`Resource not found: ${args.resourceId}`);
				result = toPlain(resource);
				break;
			}

			case "add_temp_model": {
				const tempModel = await resourceStore.addTempModel();
				result = toPlain(tempModel);
				break;
			}

			case "add_temp_image": {
				const tempImage = await resourceStore.addTempImage();
				result = toPlain(tempImage);
				break;
			}

			// Map Item Tools
			case "list_map_items": {
				result = toPlain(mapContentService.listMapItems());
				break;
			}

			case "get_map_item": {
				result = toPlain(mapContentService.getMapItem(args.mapItemId));
				break;
			}

			// MapPath V2 Tools
			case "get_map_path_graph": {
				result = toPlain({
					mapPaths: mapDataStore.mapPaths,
					pathMapItemTypeIds: mapDataStore.pathMapItemTypeIds ?? [],
					startMapItemId: mapDataStore.startMapItemId,
					mapIndex: mapDataStore.mapIndex,
					legacyCompatibility: mapDataStore.getMapPathCompatibility(),
					pathNodeIds: mapDataStore.getPathMapItems().map((mapItem) => mapItem.id),
				});
				break;
			}

			case "list_map_paths": {
				const paths = mapDataStore.mapPaths.filter((path) => {
					if (args.mapItemId) {
						const matchesOutgoing = path.fromMapItemId === args.mapItemId;
						const matchesIncoming = path.toMapItemId === args.mapItemId;
						if (args.direction === "outgoing" && !matchesOutgoing) return false;
						if (args.direction === "incoming" && !matchesIncoming) return false;
						if (args.direction === "all" && !matchesOutgoing && !matchesIncoming) return false;
					}
					return args.enabled === undefined || (path.initEnable !== false) === args.enabled;
				});
				result = toPlain({ total: paths.length, paths });
				break;
			}

			case "get_map_path": {
				const path = mapDataStore.findMapPathById(args.pathId);
				if (!path) throw new Error(`MapPath with ID ${args.pathId} not found`);
				result = toPlain(path);
				break;
			}

			case "add_map_path": {
				const path = mapDataStore.addMapPath(args);
				result = toPlain(path);
				break;
			}

			case "update_map_path": {
				const { pathId, ...patch } = args;
				mapDataStore.updateMapPath(pathId, patch);
				const path = mapDataStore.findMapPathById(pathId);
				if (!path) throw new Error(`MapPath with ID ${pathId} not found`);
				result = toPlain(path);
				break;
			}

			case "remove_map_path": {
				if (!mapDataStore.findMapPathById(args.pathId)) throw new Error(`MapPath with ID ${args.pathId} not found`);
				mapDataStore.removeMapPath(args.pathId);
				result = { success: true, pathId: args.pathId };
				break;
			}

			case "replace_map_paths": {
				const paths = args.paths.map((path: any) => ({
					...path,
					id: path.id || createMapPathId(path.fromMapItemId, path.toMapItemId),
				}));
				mapDataStore.replaceMapPaths(paths, "MCP 批量替换路径");
				result = toPlain({ count: mapDataStore.mapPaths.length, mapPaths: mapDataStore.mapPaths });
				break;
			}

			case "update_map_path_settings": {
				if (args.pathMapItemTypeIds !== undefined) {
					const unknownTypeIds = args.pathMapItemTypeIds.filter((typeId: string) => !mapDataStore.findMapItemTypeById(typeId));
					if (unknownTypeIds.length > 0) throw new Error(`Unknown path map item type IDs: ${unknownTypeIds.join(", ")}`);
				}
				if (args.startMapItemId !== undefined && args.startMapItemId !== null && !mapDataStore.findMapItemById(args.startMapItemId)) {
					throw new Error(`Start map item not found: ${args.startMapItemId}`);
				}
				if (args.pathMapItemTypeIds !== undefined) mapDataStore.setPathMapItemTypeIds(args.pathMapItemTypeIds);
				if (args.startMapItemId !== undefined) mapDataStore.setStartMapItemId(args.startMapItemId ?? undefined);
				result = toPlain({
					pathMapItemTypeIds: mapDataStore.pathMapItemTypeIds ?? [],
					startMapItemId: mapDataStore.startMapItemId,
					pathNodeIds: mapDataStore.getPathMapItems().map((mapItem) => mapItem.id),
				});
				break;
			}

			case "plan_map_changes": {
				const invalidOperations = args.operations
					.map((operation: any, index: number) => ({ index, tool: operation.tool }))
					.filter((operation: any) => !batchMutationTools.has(operation.tool));
				result = { valid: invalidOperations.length === 0, operationCount: args.operations.length, invalidOperations };
				break;
			}

			case "apply_map_changes": {
				const invalidOperations = args.operations.filter((operation: any) => !batchMutationTools.has(operation.tool));
				if (invalidOperations.length > 0) throw new Error(`Unsupported batch operations: ${invalidOperations.map((operation: any) => operation.tool).join(", ")}`);
				const snapshot = args.atomic ? toPlain(mapDataStore.$state) : undefined;
				const results: unknown[] = [];
				try {
					for (const operation of args.operations) {
						results.push(await handleToolInvocation(operation.tool, operation.args));
					}
					result = { success: true, operationCount: results.length, results };
				} catch (error) {
					if (snapshot) mapDataStore.$patch(snapshot);
					throw error;
				}
				break;
			}

			case "query_map_items": {
				const items = mapContentService.listMapItems().filter((item) =>
					(!args.typeId || item.typeId === args.typeId) &&
					(args.hasProperty === undefined || item.hasProperty === args.hasProperty) &&
					(args.minX === undefined || item.x >= args.minX) &&
					(args.maxX === undefined || item.x <= args.maxX) &&
					(args.minY === undefined || item.y >= args.minY) &&
					(args.maxY === undefined || item.y <= args.maxY),
				);
				result = { total: items.length, offset: args.offset, limit: args.limit, items: toPlain(items.slice(args.offset, args.offset + args.limit)) };
				break;
			}

			// Property Tools
			case "add_property": {
				const serviceResult = await mapContentService.addProperty(args);
				result = toPlain(serviceResult);
				break;
			}

			case "update_property": {
				const serviceResult = await mapContentService.updateProperty(args);
				result = toPlain(serviceResult);
				break;
			}

			case "remove_property": {
				await mapContentService.removeProperty(args.mapItemId);
				result = { success: true };
				break;
			}

			case "get_property_by_map_item_id": {
				const mapItem = mapDataStore.findMapItemById(args.mapItemId);
				if (!mapItem?.property) throw new Error(`Property not found for map item: ${args.mapItemId}`);
				result = toPlain({ mapItemId: mapItem.id, ...mapItem.property });
				break;
			}

			case "list_properties": {
				result = toPlain(mapDataStore.mapItems
					.filter((mapItem) => mapItem.property)
					.map((mapItem) => ({
						mapItemId: mapItem.id,
						name: mapItem.property!.name,
						sellCost: mapItem.property!.sellCost,
						buildCost: mapItem.property!.buildCost,
						maxLevel: mapItem.property!.maxLevel,
					})));
				break;
			}

			// Game Setting Tools
			case "get_game_setting": {
				const setting = mapDataStore.gameSettingForm.find((entry) => entry.id === args.settingId);
				if (!setting) throw new Error(`Game setting not found: ${args.settingId}`);
				result = toPlain(setting);
				break;
			}

			case "list_game_settings": {
				result = toPlain(mapDataStore.gameSettingForm.map(({ id, key, type, label, defaultValue }) => ({ id, key, type, label, defaultValue })));
				break;
			}

			case "add_game_setting": {
				const serviceResult = await mapContentService.addGameSetting(args);
				result = toPlain(serviceResult);
				break;
			}

			case "update_game_setting": {
				const serviceResult = await mapContentService.updateGameSetting(args);
				result = toPlain(serviceResult);
				break;
			}

			case "remove_game_setting": {
				await mapContentService.removeGameSetting(args.settingId);
				result = { success: true };
				break;
			}

			// UI Template Tools
			case "create_ui_template": {
				const serviceResult = await mapContentService.createUITemplate(args);
				result = toPlain(serviceResult);
				break;
			}

			case "update_ui_template": {
				const serviceResult = await mapContentService.updateUITemplate(args);
				result = toPlain(serviceResult);
				break;
			}

			case "remove_ui_template": {
				await mapContentService.removeUITemplate(args.templateId);
				result = { success: true };
				break;
			}

			case "get_ui_template": {
				const template = mapDataStore.uiTemplates.find(t => t.id === args.templateId);
				if (!template) throw new Error(`UITemplate 不存在: ${args.templateId}`);
				result = toPlain(template);
				break;
			}

			case "list_ui_templates": {
				result = toPlain(mapDataStore.uiTemplates.map(({ id, name, slug }) => ({ id, name, slug })));
				break;
			}

			// Custom UI Tools
			case "create_custom_ui": {
				const serviceResult = await mapContentService.createCustomUI(args);
				result = toPlain(serviceResult);
				break;
			}

			case "update_custom_ui": {
				const serviceResult = await mapContentService.updateCustomUI(args);
				result = toPlain(serviceResult);
				break;
			}

			case "remove_custom_ui": {
				await mapContentService.removeCustomUI(args.instanceId);
				result = { success: true };
				break;
			}

			case "get_custom_ui": {
				const instance = mapDataStore.customUIs.find(ui => ui.id === args.instanceId);
				if (!instance) throw new Error(`CustomUI 不存在: ${args.instanceId}`);
				result = toPlain(instance);
				break;
			}

			case "list_custom_uis": {
				result = toPlain(mapDataStore.customUIs);
				break;
			}

		// Modifier Template Tools
		case "create_modifier_template": {
			const serviceResult = await mapContentService.createModifierTemplate(args);
			result = toPlain(serviceResult);
			break;
		}

		case "update_modifier_template": {
			const serviceResult = await mapContentService.updateModifierTemplate(args);
			result = toPlain(serviceResult);
			break;
		}

		case "remove_modifier_template": {
			await mapContentService.removeModifierTemplate(args.templateId);
			result = { success: true };
			break;
		}

		case "get_modifier_template": {
			const template = mapDataStore.modifierTemplates.find(t => t.id === args.templateId);
			if (!template) throw new Error(`ModifierTemplate 不存在: ${args.templateId}`);
			result = toPlain(template);
			break;
		}

		case "list_modifier_templates": {
			result = toPlain(mapDataStore.modifierTemplates.map(({ effectCode, ...template }) => template));
			break;
		}

			// System Tools
			case "check_mcp_connection": {
				result = {
					success: true,
					connected: true,
					message: "MCP connection is active",
					timestamp: new Date().toISOString(),
					server: "minemonopoly-map-editor",
					version: "1.0.0"
				};
				break;
			}

			// Validate Tools
			case "validate_effect_code": {
				const serviceResult = await mapContentService.validateEffectCode(args);
				result = toPlain(serviceResult);
				break;
			}

			case "validate_map": {
				const legacyValidation = validateMap(
					mapDataStore.mapItems,
					mapDataStore.mapEvents,
					mapDataStore.roles,
					mapDataStore.mapIndex,
					mapDataStore.mapPaths.length > 0,
				);
				const mapPathResults = mapDataStore.validateMapPaths();
				const mapPathErrors = mapPathResults
					.filter((entry) => entry.level === "error")
					.map((entry) => `[${entry.code}] ${entry.message}${entry.pathId ? `: ${entry.pathId}` : entry.mapItemId ? `: ${entry.mapItemId}` : ""}`);
				const mapPathWarnings = mapPathResults
					.filter((entry) => entry.level === "warning")
					.map((entry) => `[${entry.code}] ${entry.message}${entry.pathId ? `: ${entry.pathId}` : entry.mapItemId ? `: ${entry.mapItemId}` : ""}`);
				result = {
					errors: [...legacyValidation.errors, ...mapPathErrors],
					warnings: [...legacyValidation.warnings, ...mapPathWarnings],
					isValid: legacyValidation.isValid && mapPathErrors.length === 0,
					checkLevel: args.checkLevel ?? "basic",
					mapPathValidation: {
						results: toPlain(mapPathResults),
						legacyCompatibility: mapDataStore.getMapPathCompatibility(),
					},
				};
				break;
			}

			default:
				throw new Error(`Unknown tool: ${toolName}`);
		}

		// Log success
		const duration = Date.now() - startTime;
		console.log(`[MCP Bridge] ✅ Tool succeeded: ${toolName} (${duration}ms)`);
		console.log(`[MCP Bridge] 📤 Result:`, JSON.stringify(result, null, 2));

		return result;
	} catch (error: any) {
		const duration = Date.now() - startTime;
		console.error(`[MCP Bridge] ❌ Tool failed: ${toolName} (${duration}ms)`);
		console.error(`[MCP Bridge] 🔴 Error:`, error.message);
		console.error(`[MCP Bridge] 📚 Stack:`, error.stack);

		sendMCPFeedback(toolName, false, `操作失败: ${error.message}`, {
			error: error.message,
			stack: error.stack
		});
		throw error;
	}
}

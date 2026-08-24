/**
 * Map Content Service
 *
 * Core service for unified map content operations.
 * This service provides a single API for both UI forms and MCP tools.
 */

import { useMapDataStore, useResourceStore } from "@src/stores";
import { generateShortId } from "@src/utils/short-id";
import { eventBus } from "@src/utils/event-bus";
import { z } from "zod";
import { AddChanceCardSchema, UpdateChanceCardSchema, RemoveChanceCardSchema } from "./validators/chance-card-validators";
import { AddRoleSchema, UpdateRoleSchema, RemoveRoleSchema } from "./validators/role-validators";
import { AddMapEventSchema, UpdateMapEventSchema, RemoveMapEventSchema } from "./validators/map-event-validators";
import { AddPhaseSchema, RemovePhaseSchema, UpdatePhaseSchema, type PhaseType } from "./validators/game-phase-validators";
import { GamePhaseMark } from "@mine-monopoly/types";
import { UpdateExtraLibsSchema } from "./validators/extra-libs-validators";
import { AddPropertySchema, UpdatePropertySchema, RemovePropertySchema, type PropertyData, type UpdatePropertyInput } from "./validators/property-validators";
import type { ChanceCard } from "./validators/chance-card-validators";
import type { Role } from "./validators/role-validators";
import type { MapEvent } from "./validators/map-event-validators";
import type { FormSchema } from "@mine-monopoly/types";
import { useMonacoValidator } from "@src/components/code-editor/composables/useMonacoValidator";

export interface CodeValidationOptions {
	skipCodeValidation?: boolean;
}

export class CodeValidationError extends Error {
	constructor(
		label: string,
		public readonly errors: Array<{ line: number; column: number; message: string }>,
	) {
		super(`${label} TS 校验失败:\n${errors
			.map((error) => {
				const lineLabel = error.line > 0 ? `L${error.line}` : "模板";
				return `${lineLabel}:C${error.column} ${error.message}`;
			})
			.join("\n")}`);
		this.name = "CodeValidationError";
	}
}

/**
 * Map Content Service class
 */
export class MapContentService {
	private async ensureCodeValid(
		data: {
			code: string;
			codeType: string;
			commandType?: string;
			targetType?: string;
			template?: string;
			mode?: "snippet" | "full";
		},
		label: string,
	): Promise<void> {
		if (!data.code?.trim()) return;
		const validation = await this.validateEffectCode(data);
		if (!validation.valid) {
			throw new CodeValidationError(label, validation.errors);
		}
	}

	/**
	 * Chance Card Operations
	 */

	/**
	 * Add a new chance card
	 * @param data - Chance card data without id
	 * @returns The created chance card with generated id
	 */
	async addChanceCard(data: Omit<ChanceCard, "id">, options: CodeValidationOptions = {}): Promise<ChanceCard> {
		// 1. Validate input data
		const validated = AddChanceCardSchema.parse(data);
		if (!options.skipCodeValidation) {
			await this.ensureCodeValid(
				{
					code: validated.effectCode,
					codeType: "chance-card",
					targetType: validated.type,
					mode: "full",
				},
				"机会卡 effectCode",
			);
		}

		// 2. Get Store instances
		const mapDataStore = useMapDataStore();
		const resourceStore = useResourceStore();

		// 3. Auto-generate iconId if not provided
		let iconId = validated.iconId;
		if (!iconId) {
			const tempImage = await resourceStore.addTempImage();
			if (!tempImage?.id) {
				throw new Error("Failed to generate temporary image resource");
			}
			iconId = tempImage.id;
		}

		// 4. Construct data object with generated ID
		const newCard: ChanceCard = {
			id: generateShortId('card'),
			name: validated.name,
			type: validated.type,
			description: validated.description,
			color: validated.color,
			iconId: iconId,
			effectCode: validated.effectCode,
		};

		// 5. Call Store
		mapDataStore.addChanceCard(newCard as any);

		// 6. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "add_chance_card",
			success: true,
			message: `添加机会卡成功: ${newCard.name}`,
			details: { id: newCard.id, name: newCard.name }
		});

		return newCard;
	}

	/**
	 * Update an existing chance card
	 * @param data - Chance card data with id
	 * @returns The updated chance card
	 */
	async updateChanceCard(data: ChanceCard, options: CodeValidationOptions = {}): Promise<ChanceCard> {
		// 1. Validate input
		const validated = UpdateChanceCardSchema.parse(data);
		if (!options.skipCodeValidation) {
			await this.ensureCodeValid(
				{
					code: validated.effectCode,
					codeType: "chance-card",
					targetType: validated.type,
					mode: "full",
				},
				"机会卡 effectCode",
			);
		}

		// 2. Check if exists
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.chanceCards.find(c => c.id === validated.id);
		if (!existing) {
			throw new Error(`机会卡不存在: ${validated.id}`);
		}

		// 3. Use provided iconId only if it exists in resource store, otherwise keep existing
		const resourceStore = useResourceStore();
		let iconId = existing.iconId;
		if (validated.iconId && resourceStore.findImageById(validated.iconId)) {
			iconId = validated.iconId;
		}

		// 4. Construct updated data
		const updatedCard: ChanceCard = {
			id: validated.id,
			name: validated.name,
			type: validated.type,
			description: validated.description,
			color: validated.color,
			iconId: iconId,
			effectCode: validated.effectCode,
		};

		// 5. Call Store
		mapDataStore.updateChanceCard(updatedCard as any);

		// 6. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "update_chance_card",
			success: true,
			message: `更新机会卡成功: ${updatedCard.name}`,
			details: { id: updatedCard.id, name: updatedCard.name }
		});

		return updatedCard;
	}

	/**
	 * Remove a chance card
	 * @param cardId - The ID of the chance card to remove
	 */
	async removeChanceCard(cardId: string): Promise<void> {
		// 1. Validate input
		const validated = RemoveChanceCardSchema.parse({ cardId });

		// 2. Check if exists
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.chanceCards.find(c => c.id === validated.cardId);
		if (!existing) {
			throw new Error(`机会卡不存在: ${validated.cardId}`);
		}

		// 3. Call Store
		mapDataStore.reomveChanceCard(validated.cardId);

		// 4. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "remove_chance_card",
			success: true,
			message: `删除机会卡成功`,
			details: { id: validated.cardId }
		});
	}

	/**
	 * Role Operations
	 */

	/**
	 * Add a new role
	 * @param data - Role data without id
	 * @returns The created role with generated id
	 */
	async addRole(data: Omit<Role, "id">, options: CodeValidationOptions = {}): Promise<Role> {
		// 1. Validate input data
		const validated = AddRoleSchema.parse(data);
		if (!options.skipCodeValidation) {
			await this.ensureCodeValid(
				{
					code: validated.initCode || "",
					codeType: "role",
					mode: "full",
				},
				"角色 initCode",
			);
		}

		// 2. Get Store instances
		const mapDataStore = useMapDataStore();
		const resourceStore = useResourceStore();

		// 3. Auto-generate imageId if not provided
		let imageId = validated.imageId;
		if (!imageId) {
			const tempImage = await resourceStore.addTempImage();
			if (!tempImage?.id) {
				throw new Error("Failed to generate temporary image resource");
			}
			imageId = tempImage.id;
		}

		// 4. Construct data object with generated ID
		const newRole: Role = {
			id: generateShortId('role'),
			name: validated.name,
			description: validated.description || "",
			color: validated.color || "#000000",
			initCode: validated.initCode || "",
			imageId: imageId,
		};

		// 5. Call Store
		mapDataStore.addRole(newRole as any);

		// 6. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "add_role",
			success: true,
			message: `添加角色成功: ${newRole.name}`,
			details: { id: newRole.id, name: newRole.name }
		});

		return newRole;
	}

	/**
	 * Update an existing role
	 * @param data - Role data with roleId
	 * @returns The updated role
	 */
	async updateRole(data: z.infer<typeof UpdateRoleSchema>, options: CodeValidationOptions = {}): Promise<Role> {
		// 1. Validate input
		const validated = UpdateRoleSchema.parse(data);
		if (!options.skipCodeValidation) {
			await this.ensureCodeValid(
				{
					code: validated.initCode || "",
					codeType: "role",
					mode: "full",
				},
				"角色 initCode",
			);
		}

		// 2. Check if exists and get current data
		const mapDataStore = useMapDataStore();
		const role = mapDataStore.findRoleById(validated.roleId);
		if (!role) {
			throw new Error(`角色不存在: ${validated.roleId}`);
		}

		// 3. Merge updated fields
		const updated = { ...role };
		if (validated.name !== undefined) updated.name = validated.name;
		if (validated.description !== undefined) updated.description = validated.description;
		if (validated.color !== undefined) updated.color = validated.color;
		if (validated.initCode !== undefined) updated.initCode = validated.initCode;
		if (validated.imageId !== undefined) {
			const resourceStore = useResourceStore();
			if (resourceStore.findImageById(validated.imageId)) {
				updated.imageId = validated.imageId;
			}
		}

		// 4. Call Store
		mapDataStore.editRole(updated as any);

		// 5. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "update_role",
			success: true,
			message: `更新角色成功: ${updated.name}`,
			details: { id: validated.roleId, name: updated.name }
		});

		return updated as Role;
	}

	/**
	 * Remove a role
	 * @param roleId - The ID of the role to remove
	 */
	async removeRole(roleId: string): Promise<void> {
		// 1. Validate input
		const validated = RemoveRoleSchema.parse({ roleId });

		// 2. Check if exists
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.roles.find(r => r.id === validated.roleId);
		if (!existing) {
			throw new Error(`角色不存在: ${validated.roleId}`);
		}

		// 3. Call Store
		mapDataStore.removeRole(validated.roleId);

		// 4. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "remove_role",
			success: true,
			message: `删除角色成功`,
			details: { id: validated.roleId }
		});
	}

	/**
	 * Map Event Operations
	 */

	/**
	 * Add a new map event
	 * @param data - Map event data without id
	 * @returns The created map event with generated id
	 */
	async addMapEvent(data: Omit<MapEvent, "id">, options: CodeValidationOptions = {}): Promise<MapEvent> {
		// 1. Validate input data
		const validated = AddMapEventSchema.parse(data);
		if (!options.skipCodeValidation) {
			await this.ensureCodeValid(
				{
					code: validated.effectCode,
					codeType: "map-event",
					mode: "full",
				},
				"地图事件 effectCode",
			);
		}

		// 2. Get Store instances
		const mapDataStore = useMapDataStore();
		const resourceStore = useResourceStore();

		// 3. Auto-generate iconId if not provided
		let iconId = validated.iconId;
		if (!iconId) {
			const tempImage = await resourceStore.addTempImage();
			if (!tempImage?.id) {
				throw new Error("Failed to generate temporary image resource");
			}
			iconId = tempImage.id;
		}

		// 4. Construct data object with generated ID
		const newEvent: MapEvent = {
			id: generateShortId('event'),
			name: validated.name,
			type: validated.type,
			description: validated.description || "",
			iconId: iconId,
			effectCode: validated.effectCode,
		};

		// 5. Call Store
		mapDataStore.addMapEvent(newEvent as any);

		// 6. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "add_map_event",
			success: true,
			message: `添加地图事件成功: ${newEvent.name}`,
			details: { id: newEvent.id, name: newEvent.name }
		});

		return newEvent;
	}

	/**
	 * Update an existing map event
	 * @param data - Map event data with id
	 * @returns The updated map event
	 */
	async updateMapEvent(data: MapEvent, options: CodeValidationOptions = {}): Promise<MapEvent> {
		// 1. Validate input
		const validated = UpdateMapEventSchema.parse(data);
		if (!options.skipCodeValidation) {
			await this.ensureCodeValid(
				{
					code: validated.effectCode,
					codeType: "map-event",
					mode: "full",
				},
				"地图事件 effectCode",
			);
		}

		// 2. Check if exists
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.findMapEventById(validated.id);
		if (!existing) {
			throw new Error(`地图事件不存在: ${validated.id}`);
		}

		// 3. Use provided iconId only if it exists in resource store, otherwise keep existing
		const resourceStore = useResourceStore();
		let iconId = existing.iconId;
		if (validated.iconId && resourceStore.findImageById(validated.iconId)) {
			iconId = validated.iconId;
		}

		// 4. Construct updated data
		const updatedEvent: MapEvent = {
			id: validated.id,
			name: validated.name,
			type: validated.type,
			description: validated.description || "",
			iconId: iconId,
			effectCode: validated.effectCode,
		};

		// 5. Call Store
		mapDataStore.updateMapEvent(updatedEvent as any);

		// 6. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "update_map_event",
			success: true,
			message: `更新地图事件成功: ${updatedEvent.name}`,
			details: { id: updatedEvent.id, name: updatedEvent.name }
		});

		return updatedEvent;
	}

	/**
	 * Remove a map event
	 * @param eventId - The ID of the map event to remove
	 */
	async removeMapEvent(eventId: string): Promise<void> {
		// 1. Validate input
		const validated = RemoveMapEventSchema.parse({ eventId });

		// 2. Check if exists
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.mapEvents.find(e => e.id === validated.eventId);
		if (!existing) {
			throw new Error(`地图事件不存在: ${validated.eventId}`);
		}

		// 3. Call Store
		mapDataStore.reomveMapEvent(validated.eventId);

		// 4. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "remove_map_event",
			success: true,
			message: `删除地图事件成功`,
			details: { id: validated.eventId }
		});
	}

	/**
	 * Game Phase Operations
	 */

	/**
	 * Get all game phases
	 * @returns All game phases organized by type
	 */
	async getPhases(): Promise<any> {
		const mapDataStore = useMapDataStore();
		return mapDataStore.phases;
	}

	/**
	 * Add a new game phase
	 * @param data - Game phase data
	 * @returns The created game phase
	 */
	async addPhase(data: {
		id: string;
		name: string;
		description: string;
		phaseType: PhaseType;
		mark?: string;
		from: string;
		initEventCode: string;
	}): Promise<any> {
		// 1. Validate input
		const validated = AddPhaseSchema.parse(data);
		await this.ensureCodeValid(
			{
				code: validated.initEventCode,
				codeType: "game-phase",
				mode: "full",
			},
			"游戏阶段 initEventCode",
		);

		// 2. Get Store
		const mapDataStore = useMapDataStore();

		// 3. Construct phase object
		const newPhase = {
			id: validated.id,
			name: validated.name,
			description: validated.description,
			mark: validated.mark,
			from: validated.from,
			initEventCode: validated.initEventCode,
		};

		// 4. Add to the appropriate phase category
		const phaseType = validated.phaseType;
		if (mapDataStore.phases[phaseType]) {
			(mapDataStore.phases[phaseType] as any).push(newPhase);
		} else {
			throw new Error(`Invalid phase type: ${phaseType}`);
		}

		// 5. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "add_phase",
			success: true,
			message: `添加游戏阶段成功: ${validated.name}`,
			details: { id: validated.id, name: validated.name, phaseType }
		});

		return newPhase;
	}

	/**
	 * Update an existing game phase
	 * @param data - Game phase update data
	 * @returns The updated game phase
	 */
	async updatePhase(data: {
		phaseId: string;
		phaseType: PhaseType;
		name?: string;
		description?: string;
		mark?: string;
		initEventCode?: string;
	}): Promise<any> {
		// 1. Validate input
		const validated = UpdatePhaseSchema.parse(data);
		await this.ensureCodeValid(
			{
				code: validated.initEventCode || "",
				codeType: "game-phase",
				mode: "full",
			},
			"游戏阶段 initEventCode",
		);

		// 2. Get Store and find phase
		const mapDataStore = useMapDataStore();
		const phaseArray = mapDataStore.phases[validated.phaseType];
		if (!phaseArray) {
			throw new Error(`Phase type not found: ${validated.phaseType}`);
		}

		const phase = phaseArray.find((p: any) => p.id === validated.phaseId);
		if (!phase) {
			throw new Error(`Phase not found: ${validated.phaseId}`);
		}

		// 3. Update fields
		if (validated.name !== undefined) phase.name = validated.name;
		if (validated.description !== undefined) phase.description = validated.description;
		if (validated.mark !== undefined) phase.mark = GamePhaseMark[validated.mark as keyof typeof GamePhaseMark];
		if (validated.initEventCode !== undefined) phase.initEventCode = validated.initEventCode;

		// 4. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "update_phase",
			success: true,
			message: `更新游戏阶段成功: ${phase.name}`,
			details: { id: validated.phaseId, name: phase.name }
		});

		return phase;
	}

	/**
	 * Remove a game phase
	 * @param phaseId - The ID of the phase to remove
	 * @param phaseType - The type of the phase
	 */
	async removePhase(phaseId: string, phaseType: PhaseType): Promise<void> {
		// 1. Validate input
		const validated = RemovePhaseSchema.parse({ phaseId, phaseType });

		// 2. Get Store and find phase
		const mapDataStore = useMapDataStore();
		const phaseArray = mapDataStore.phases[validated.phaseType];
		if (!phaseArray) {
			throw new Error(`Phase type not found: ${validated.phaseType}`);
		}

		const index = phaseArray.findIndex((p: any) => p.id === validated.phaseId);
		if (index < 0) {
			throw new Error(`Phase not found: ${validated.phaseId}`);
		}

		// 3. Remove phase
		phaseArray.splice(index, 1);

		// 4. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "remove_phase",
			success: true,
			message: `删除游戏阶段成功`,
			details: { id: validated.phaseId, phaseType }
		});
	}

	/**
	 * MapItem Query Operations
	 */

	/**
	 * List all map items with summary info
	 * @returns MapItem summary list
	 */
	listMapItems(): any[] {
		const mapDataStore = useMapDataStore();
		return mapDataStore.mapItems.map((item) => ({
			id: item.id,
			typeName: item.type.name,
			typeId: item.type.id,
			x: item.x,
			y: item.y,
			rotation: item.rotation,
			hasProperty: !!item.property,
			mapEventId: item.mapEventId,
			linkto: item.linkto,
			beLinked: item.beLinked,
		}));
	}

	/**
	 * Get a single map item with full details
	 * @param mapItemId - The map item ID
	 * @returns Full map item info including property
	 */
	getMapItem(mapItemId: string): any {
		const mapDataStore = useMapDataStore();
		const item = mapDataStore.findMapItemById(mapItemId);
		if (!item) {
			throw new Error(`MapItem 不存在: ${mapItemId}`);
		}
		return item;
	}

	/**
	 * Extra Libraries Operations
	 */

	/**
	 * Get extra libraries code
	 * @returns The extra libraries code
	 */
	async getExtraLibs(): Promise<{ code: string }> {
		const mapDataStore = useMapDataStore();
		return { code: mapDataStore.extraLibs };
	}

	/**
	 * Get all type libraries available to the code editor
	 * @returns extraLibs (user-defined code) and uiTemplateTypes (generated declarations)
	 */
	async getAllTypeLibs(): Promise<{ extraLibs: string; uiTemplateTypes: string; gameSettingTypes: string; modifierTemplateTypes: string }> {
		const mapDataStore = useMapDataStore();
		const extraLibs = mapDataStore.extraLibs || "";
		const uiTemplates = mapDataStore.uiTemplates || [];
		const gameSettingForm = mapDataStore.gameSettingForm || [];
		const modifierTemplates = mapDataStore.modifierTemplates || [];

		let uiTemplateTypes = "";
		if (uiTemplates.length > 0) {
			const declarations = uiTemplates
				.map(
					(ui) => `
    /**
     * **组件名称**: ${ui.name}
     * **slug**: ${ui.slug}
     * * ID: \`${ui.id}\`
     */
    const $ui__${ui.slug}: UISchema;
  `,
				)
				.join("\n");

			uiTemplateTypes = `
    declare global {
      ${declarations}
    }
    export {};
  `;
		}

		let gameSettingTypes = "";
		if (gameSettingForm.length > 0) {
			const declarations = gameSettingForm
				.map((setting) => {
					const valueType = setting.type === 'number-input'
						? 'number'
						: 'string | number';
					return `    /** ${setting.label} */
    ${setting.key}: { label: string; value: ${valueType}; displayValue: ${valueType} };`;
				})
				.join("\n");

			gameSettingTypes = `
    declare global {
      interface GameSetting {
        ${declarations}
      }
    }
    export {};
  `;
		}

		let modifierTemplateTypes = "";
		if (modifierTemplates.length > 0) {
			const declarations = modifierTemplates
				.map(
					(mod) => `
    /**
     * **修饰器名称**: ${mod.name}
     * **slug**: ${mod.slug}
     * * ID: \`${mod.id}\`
     */
    const $mod__${mod.slug}: ModifierTemplate;
  `,
				)
				.join("\n");

			modifierTemplateTypes = `
    declare global {
      ${declarations}
    }
    export {};
  `;
		}

		return { extraLibs, uiTemplateTypes, gameSettingTypes, modifierTemplateTypes };
	}

	/**
	 * Update extra libraries code
	 * @param code - The new code
	 */
	async updateExtraLibs(code: string, options: CodeValidationOptions = {}): Promise<void> {
		// 1. Validate input
		const validated = UpdateExtraLibsSchema.parse({ code });
		if (!options.skipCodeValidation) {
			await this.ensureCodeValid(
				{
					code: validated.code,
					codeType: "extra-libs",
					mode: "full",
				},
				"额外库代码",
			);
		}

		// 2. Get Store and update
		const mapDataStore = useMapDataStore();
		mapDataStore.updateExtraLibs(validated.code);

		// 3. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "update_extra_libs",
			success: true,
			message: `更新额外库代码成功`,
			details: { codeLength: validated.code.length }
		});
	}

	/**
	 * Property Operations
	 */

	/**
	 * Add property to a map item
	 * @param data - { mapItemId, property fields }
	 * @returns The created PropertyInfo
	 */
	async addProperty(data: { mapItemId: string } & PropertyData): Promise<any> {
		// 1. Validate input
		const validated = AddPropertySchema.parse(data);
		await this.ensureCodeValid(
			{
				code: validated.property.effectCode || "",
				codeType: "property",
				mode: "full",
			},
			"地皮 effectCode",
		);

		// 2. Get Store, check mapItem exists and has no property
		const mapDataStore = useMapDataStore();
		const mapItem = mapDataStore.findMapItemById(validated.mapItemId);
		if (!mapItem) {
			throw new Error(`MapItem 不存在: ${validated.mapItemId}`);
		}
		if (mapItem.property) {
			throw new Error(`MapItem 已有地皮属性: ${validated.mapItemId}`);
		}

		// 3. Construct PropertyInfo object
		const property = {
			id: generateShortId('prop'),
			name: validated.property.name,
			sellCost: validated.property.sellCost,
			buildCost: validated.property.buildCost,
			level: 0,
			maxLevel: validated.property.maxLevel,
			costList: validated.property.costList,
			buildingModelIdList: validated.property.buildingModelIdList,
			customUI: validated.property.customUI,
			custom: validated.property.effectCode
				? { effectCode: validated.property.effectCode, description: `${validated.property.name} 自定义效果` }
				: undefined,
			exportData: validated.property.exportData || {},
		};

		// 4. Call Store
		mapDataStore.addProperty(validated.mapItemId, property as any);

		// 5. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "add_property",
			success: true,
			message: `添加地产成功: ${property.name}`,
			details: { mapItemId: validated.mapItemId, propertyId: property.id, name: property.name }
		});

		return property;
	}

	/**
	 * Update property on a map item (partial update)
	 * @param data - { mapItemId, optional property fields }
	 * @returns The updated PropertyInfo
	 */
	async updateProperty(data: UpdatePropertyInput): Promise<any> {
		// 1. Validate input
		const validated = UpdatePropertySchema.parse(data);
		await this.ensureCodeValid(
			{
				code: validated.property.effectCode || "",
				codeType: "property",
				mode: "full",
			},
			"地皮 effectCode",
		);

		// 2. Get Store, check mapItem and property exist
		const mapDataStore = useMapDataStore();
		const mapItem = mapDataStore.findMapItemById(validated.mapItemId);
		if (!mapItem) {
			throw new Error(`MapItem 不存在: ${validated.mapItemId}`);
		}
		if (!mapItem.property) {
			throw new Error(`MapItem 没有地皮属性: ${validated.mapItemId}`);
		}

		// 3. Merge updated fields
		const existing = mapItem.property;
		if (validated.property.name !== undefined) existing.name = validated.property.name;
		if (validated.property.sellCost !== undefined) existing.sellCost = validated.property.sellCost;
		if (validated.property.buildCost !== undefined) existing.buildCost = validated.property.buildCost;
		if (validated.property.maxLevel !== undefined) existing.maxLevel = validated.property.maxLevel;
		if (validated.property.costList !== undefined) existing.costList = validated.property.costList;
		if (validated.property.buildingModelIdList !== undefined) existing.buildingModelIdList = validated.property.buildingModelIdList;
		if (validated.property.customUI !== undefined) existing.customUI = validated.property.customUI;
		if (validated.property.exportData !== undefined) existing.exportData = validated.property.exportData;
		if (validated.property.effectCode !== undefined) {
			if (validated.property.effectCode) {
				existing.custom = { effectCode: validated.property.effectCode, description: `${existing.name} 自定义效果` };
			} else {
				existing.custom = undefined;
			}
		}

		// 4. Call Store
		mapDataStore.editProperty(validated.mapItemId, existing as any);

		// 5. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "update_property",
			success: true,
			message: `更新地产成功: ${existing.name}`,
			details: { mapItemId: validated.mapItemId, propertyId: existing.id }
		});

		return existing;
	}

	/**
	 * Remove property from a map item
	 * @param mapItemId - The map item ID
	 */
	async removeProperty(mapItemId: string): Promise<void> {
		// 1. Validate input
		const validated = RemovePropertySchema.parse({ mapItemId });

		// 2. Check mapItem and property exist
		const mapDataStore = useMapDataStore();
		const mapItem = mapDataStore.findMapItemById(validated.mapItemId);
		if (!mapItem) {
			throw new Error(`MapItem 不存在: ${validated.mapItemId}`);
		}
		if (!mapItem.property) {
			throw new Error(`MapItem 没有地皮属性: ${validated.mapItemId}`);
		}

		// 3. Call Store
		mapDataStore.removeProperty(validated.mapItemId);

		// 4. Send event notification
		eventBus.emit("mcp-operation", {
			operation: "remove_property",
			success: true,
			message: `删除地产成功`,
			details: { mapItemId: validated.mapItemId }
		});
	}

	/**
	 * Game Setting Operations
	 */

	/**
	 * List all game settings
	 * @returns All game setting form fields
	 */
	listGameSettings(): FormSchema[] {
		const mapDataStore = useMapDataStore();
		return mapDataStore.gameSettingForm;
	}

	/**
	 * Add a new game setting field
	 * @param data - Game setting data without id
	 * @returns The created game setting with generated id
	 */
	async addGameSetting(data: Omit<FormSchema, "id">): Promise<FormSchema> {
		const mapDataStore = useMapDataStore();

		const newSetting: FormSchema = {
			id: generateShortId('gs'),
			key: data.key,
			type: data.type,
			label: data.label,
			defaultValue: data.defaultValue,
			min: data.min,
			max: data.max,
			placeholder: data.placeholder,
			options: data.options,
		};

		const updated = [...mapDataStore.gameSettingForm, newSetting];
		mapDataStore.updateGameSettingFrom(updated);

		eventBus.emit("mcp-operation", {
			operation: "add_game_setting",
			success: true,
			message: `添加游戏参数成功: ${newSetting.label}`,
			details: { id: newSetting.id, key: newSetting.key }
		});

		return newSetting;
	}

	/**
	 * Update an existing game setting field
	 * @param data - Game setting data with id
	 * @returns The updated game setting
	 */
	async updateGameSetting(data: { id: string } & Partial<Omit<FormSchema, "id">>): Promise<FormSchema> {
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.gameSettingForm.find(s => s.id === data.id);
		if (!existing) {
			throw new Error(`游戏参数不存在: ${data.id}`);
		}

		const updated = { ...existing };
		if (data.key !== undefined) updated.key = data.key;
		if (data.type !== undefined) updated.type = data.type;
		if (data.label !== undefined) updated.label = data.label;
		if (data.defaultValue !== undefined) updated.defaultValue = data.defaultValue;
		if (data.min !== undefined) updated.min = data.min;
		if (data.max !== undefined) updated.max = data.max;
		if (data.placeholder !== undefined) updated.placeholder = data.placeholder;
		if (data.options !== undefined) updated.options = data.options;

		const list = mapDataStore.gameSettingForm.map(s => s.id === data.id ? updated : s);
		mapDataStore.updateGameSettingFrom(list);

		eventBus.emit("mcp-operation", {
			operation: "update_game_setting",
			success: true,
			message: `更新游戏参数成功: ${updated.label}`,
			details: { id: updated.id, key: updated.key }
		});

		return updated;
	}

	/**
	 * Remove a game setting field
	 * @param settingId - The ID of the game setting to remove
	 */
	async removeGameSetting(settingId: string): Promise<void> {
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.gameSettingForm.find(s => s.id === settingId);
		if (!existing) {
			throw new Error(`游戏参数不存在: ${settingId}`);
		}
		if (existing.builtIn) {
			throw new Error(`内置参数 "${existing.label}" 不可删除`);
		}

		const list = mapDataStore.gameSettingForm.filter(s => s.id !== settingId);
		mapDataStore.updateGameSettingFrom(list);

		eventBus.emit("mcp-operation", {
			operation: "remove_game_setting",
			success: true,
			message: `删除游戏参数成功`,
			details: { id: settingId }
		});
	}

	/**
	 * UITemplate Operations
	 */

	/**
	 * Create a new UI template
	 */
	async createUITemplate(data: { name: string; slug: string; template: any }): Promise<any> {
		const mapDataStore = useMapDataStore();

		// Check slug uniqueness
		if (mapDataStore.uiTemplates.some(t => t.slug === data.slug)) {
			throw new Error(`模板别名已存在: ${data.slug}`);
		}

		const newTemplate = {
			id: generateShortId('tmpl'),
			name: data.name,
			slug: data.slug,
			template: data.template,
		};

		mapDataStore.saveUITemplate(newTemplate as any);

		eventBus.emit("mcp-operation", {
			operation: "create_ui_template",
			success: true,
			message: `创建 UI 模板成功: ${newTemplate.name}`,
			details: { id: newTemplate.id, name: newTemplate.name, slug: newTemplate.slug }
		});

		return newTemplate;
	}

	/**
	 * Update an existing UI template
	 */
	async updateUITemplate(data: { id: string; name?: string; slug?: string; template?: any }): Promise<any> {
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.uiTemplates.find(t => t.id === data.id);
		if (!existing) {
			throw new Error(`UITemplate 不存在: ${data.id}`);
		}

		// Check slug uniqueness if changing
		if (data.slug && data.slug !== existing.slug) {
			if (mapDataStore.uiTemplates.some(t => t.slug === data.slug)) {
				throw new Error(`模板别名已存在: ${data.slug}`);
			}
		}

		const updated = { ...existing };
		if (data.name !== undefined) updated.name = data.name;
		if (data.slug !== undefined) updated.slug = data.slug;
		if (data.template !== undefined) updated.template = data.template;

		mapDataStore.saveUITemplate(updated as any);

		eventBus.emit("mcp-operation", {
			operation: "update_ui_template",
			success: true,
			message: `更新 UI 模板成功: ${updated.name}`,
			details: { id: updated.id, name: updated.name }
		});

		return updated;
	}

	/**
	 * Remove a UI template (reject if referenced by CustomUI)
	 */
	async removeUITemplate(templateId: string): Promise<void> {
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.uiTemplates.find(t => t.id === templateId);
		if (!existing) {
			throw new Error(`UITemplate 不存在: ${templateId}`);
		}

		// Check if any CustomUI instance references this template
		const isUsed = mapDataStore.customUIs.some(ui => ui.uiSchema === templateId);
		if (isUsed) {
			throw new Error(`无法删除：该模板正被 CustomUI 实例引用，请先删除相关实例`);
		}

		mapDataStore.removeUITemplate(templateId);

		eventBus.emit("mcp-operation", {
			operation: "remove_ui_template",
			success: true,
			message: `删除 UI 模板成功`,
			details: { id: templateId, name: existing.name }
		});
	}

	/**
	 * CustomUI Operations
	 */

	/**
	 * Create a new CustomUI instance
	 */
	async createCustomUI(data: { name: string; uiSchema: string; layout: { x: number; y: number; width: number; height: number } }): Promise<any> {
		const mapDataStore = useMapDataStore();

		// Validate uiSchema references an existing template
		const template = mapDataStore.uiTemplates.find(t => t.id === data.uiSchema);
		if (!template) {
			throw new Error(`UITemplate 不存在: ${data.uiSchema}`);
		}

		const newInstance = {
			id: generateShortId('custom-ui'),
			name: data.name,
			uiSchema: data.uiSchema,
			layout: data.layout,
		};

		mapDataStore.saveCustomUI(newInstance as any);

		eventBus.emit("mcp-operation", {
			operation: "create_custom_ui",
			success: true,
			message: `创建 CustomUI 实例成功: ${newInstance.name}`,
			details: { id: newInstance.id, name: newInstance.name, templateId: data.uiSchema }
		});

		return newInstance;
	}

	/**
	 * Update an existing CustomUI instance
	 */
	async updateCustomUI(data: { id: string; name?: string; uiSchema?: string; layout?: Partial<{ x: number; y: number; width: number; height: number }> }): Promise<any> {
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.customUIs.find(ui => ui.id === data.id);
		if (!existing) {
			throw new Error(`CustomUI 不存在: ${data.id}`);
		}

		// Validate uiSchema references an existing template
		if (data.uiSchema !== undefined) {
			const template = mapDataStore.uiTemplates.find(t => t.id === data.uiSchema);
			if (!template) {
				throw new Error(`UITemplate 不存在: ${data.uiSchema}`);
			}
		}

		const updated = { ...existing };
		if (data.name !== undefined) updated.name = data.name;
		if (data.uiSchema !== undefined) updated.uiSchema = data.uiSchema;
		if (data.layout !== undefined) {
			updated.layout = { ...updated.layout };
			if (data.layout.x !== undefined) updated.layout.x = data.layout.x;
			if (data.layout.y !== undefined) updated.layout.y = data.layout.y;
			if (data.layout.width !== undefined) updated.layout.width = data.layout.width;
			if (data.layout.height !== undefined) updated.layout.height = data.layout.height;
		}

		mapDataStore.saveCustomUI(updated as any);

		eventBus.emit("mcp-operation", {
			operation: "update_custom_ui",
			success: true,
			message: `更新 CustomUI 实例成功: ${updated.name}`,
			details: { id: updated.id, name: updated.name }
		});

		return updated;
	}

	/**
	 * Remove a CustomUI instance
	 */
	async removeCustomUI(instanceId: string): Promise<void> {
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.customUIs.find(ui => ui.id === instanceId);
		if (!existing) {
			throw new Error(`CustomUI 不存在: ${instanceId}`);
		}

		mapDataStore.removeCustomUI(instanceId);

		eventBus.emit("mcp-operation", {
			operation: "remove_custom_ui",
			success: true,
			message: `删除 CustomUI 实例成功`,
			details: { id: instanceId, name: existing.name }
		});
	}

	/**
	 * ModifierTemplate Operations
	 */

	async createModifierTemplate(data: { name: string; slug: string; descriptor: any; effectCode: string }): Promise<any> {
		const mapDataStore = useMapDataStore();
		await this.ensureCodeValid(
			{
				code: data.effectCode,
				codeType: "modifier",
				commandType: data.descriptor?.commandType,
				mode: "full",
			},
			"修饰器 effectCode",
		);

		// Check slug uniqueness
		if (mapDataStore.modifierTemplates.some(t => t.slug === data.slug)) {
			throw new Error(`Modifier 模板别名已存在: ${data.slug}`);
		}

		const newTemplate = {
			id: generateShortId('mod'),
			name: data.name,
			slug: data.slug,
			descriptor: data.descriptor,
			effectCode: data.effectCode,
		};

		mapDataStore.saveModifierTemplate(newTemplate as any);

		eventBus.emit("mcp-operation", {
			operation: "create_modifier_template",
			success: true,
			message: `创建 Modifier 模板成功: ${newTemplate.name}`,
			details: { id: newTemplate.id, name: newTemplate.name, slug: newTemplate.slug }
		});

		return newTemplate;
	}

	async updateModifierTemplate(data: { id: string; name?: string; slug?: string; descriptor?: any; effectCode?: string }): Promise<any> {
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.modifierTemplates.find(t => t.id === data.id);
		if (!existing) {
			throw new Error(`ModifierTemplate 不存在: ${data.id}`);
		}
		await this.ensureCodeValid(
			{
				code: data.effectCode || "",
				codeType: "modifier",
				commandType: data.descriptor?.commandType || existing?.descriptor?.commandType,
				mode: "full",
			},
			"修饰器 effectCode",
		);

		// Check slug uniqueness if changing
		if (data.slug && data.slug !== existing.slug) {
			if (mapDataStore.modifierTemplates.some(t => t.slug === data.slug)) {
				throw new Error(`Modifier 模板别名已存在: ${data.slug}`);
			}
		}

		const updated = { ...existing };
		if (data.name !== undefined) updated.name = data.name;
		if (data.slug !== undefined) updated.slug = data.slug;
		if (data.descriptor !== undefined) updated.descriptor = data.descriptor;
		if (data.effectCode !== undefined) updated.effectCode = data.effectCode;

		mapDataStore.saveModifierTemplate(updated as any);

		eventBus.emit("mcp-operation", {
			operation: "update_modifier_template",
			success: true,
			message: `更新 Modifier 模板成功: ${updated.name}`,
			details: { id: updated.id, name: updated.name }
		});

		return updated;
	}

	async removeModifierTemplate(templateId: string): Promise<void> {
		const mapDataStore = useMapDataStore();
		const existing = mapDataStore.modifierTemplates.find(t => t.id === templateId);
		if (!existing) {
			throw new Error(`ModifierTemplate 不存在: ${templateId}`);
		}

		mapDataStore.removeModifierTemplate(templateId);

		eventBus.emit("mcp-operation", {
			operation: "remove_modifier_template",
			success: true,
			message: `删除 Modifier 模板成功`,
			details: { id: templateId, name: existing.name }
		});
	}

	async getModifierTemplate(templateId: string): Promise<any> {
		const mapDataStore = useMapDataStore();
		return mapDataStore.modifierTemplates.find(t => t.id === templateId);
	}

	async listModifierTemplates(): Promise<any[]> {
		const mapDataStore = useMapDataStore();
		return [...mapDataStore.modifierTemplates];
	}
	/**
	 * Validate Effect Code
	 *
	 * Uses Monaco TS language service to type-check effectCode.
	 */
	async validateEffectCode(data: {
		code: string;
		codeType: string;
		commandType?: string;
		targetType?: string;
		template?: string;
		mode?: "snippet" | "full";
	}) {
		const { validate } = useMonacoValidator();
		return await validate(data.code, data.codeType, {
			commandType: data.commandType,
			targetType: data.targetType,
			template: data.template,
			mode: data.mode,
		});
	}

}

/**
 * Singleton instance of the Map Content Service
 */
export const mapContentService = new MapContentService();

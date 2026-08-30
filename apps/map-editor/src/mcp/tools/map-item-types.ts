/**
 * MCP Tools for MapItemType Management
 *
 * This module provides query and management operations for map item types through the IPC Bridge.
 */

import { invokeTool } from "../bridge.js";
import { successResult, errorResult } from "../utils.js";
import { z } from "zod";

const ListMapItemTypesToolSchema = z.object({});

const GetMapItemTypeToolSchema = z.object({
	typeId: z.string().describe("地图项类型ID"),
});

const AddMapItemTypeToolSchema = z.object({
	name: z.string().describe("类型名称"),
	modelId: z.string().describe("模型资源ID，需已存在于资源列表中（可先通过 list_models 核验）"),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB 格式的 HEX 值").optional().describe("类型颜色，#RRGGBB 格式，缺省随机生成"),
	size: z.number().positive("size 必须为正数").optional().describe("类型尺寸，默认 1"),
});

const UpdateMapItemTypeToolSchema = z.object({
	typeId: z.string().describe("地图项类型ID"),
	name: z.string().optional().describe("新的类型名称"),
	modelId: z.string().optional().describe("新的模型资源ID"),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB 格式的 HEX 值").optional().describe("新的类型颜色，#RRGGBB 格式"),
	size: z.number().positive("size 必须为正数").optional().describe("新的类型尺寸"),
});

const RemoveMapItemTypeToolSchema = z.object({
	typeId: z.string().describe("地图项类型ID"),
});

/**
 * List all map item types with usage count
 */
export async function listMapItemTypes(args: unknown) {
	try {
		const result = await invokeTool("list_map_item_types", ListMapItemTypesToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to list map item types");
	}
}

/**
 * Get a single map item type with usage count
 */
export async function getMapItemType(args: unknown) {
	try {
		const result = await invokeTool("get_map_item_type", GetMapItemTypeToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to get map item type");
	}
}

/**
 * Add a map item type
 */
export async function addMapItemType(args: unknown) {
	try {
		const result = await invokeTool("add_map_item_type", AddMapItemTypeToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to add map item type");
	}
}

/**
 * Update a map item type
 */
export async function updateMapItemType(args: unknown) {
	try {
		const result = await invokeTool("update_map_item_type", UpdateMapItemTypeToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to update map item type");
	}
}

/**
 * Remove a map item type
 */
export async function removeMapItemType(args: unknown) {
	try {
		const result = await invokeTool("remove_map_item_type", RemoveMapItemTypeToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to remove map item type");
	}
}

/**
 * Export tool definitions for MCP server
 */
export const mapItemTypeTools = [
	{
		name: "list_map_item_types",
		description: "列出地图中所有地图项类型（物块类型），返回 id、名称、模型ID、颜色、尺寸以及每种类型当前被多少地图项使用。",
		inputSchema: ListMapItemTypesToolSchema,
		handler: listMapItemTypes,
	},
	{
		name: "get_map_item_type",
		description: "根据ID获取单个地图项类型的详情及使用计数。",
		inputSchema: GetMapItemTypeToolSchema,
		handler: getMapItemType,
	},
	{
		name: "add_map_item_type",
		description: "创建一个新的地图项类型（物块类型）。modelId 必须是已存在的模型资源（先通过 list_models 核验）；color 缺省随机生成；size 缺省 1。创建后即可通过 add_map_item 使用该 typeId 放置地图项。",
		inputSchema: AddMapItemTypeToolSchema,
		handler: addMapItemType,
	},
	{
		name: "update_map_item_type",
		description: "更新地图项类型的名称、模型、颜色或尺寸（至少提供一个字段）。更新会自动同步地图中所有已放置的该类型地图项，并刷新 3D 场景显示。",
		inputSchema: UpdateMapItemTypeToolSchema,
		handler: updateMapItemType,
	},
	{
		name: "remove_map_item_type",
		description: "删除指定的地图项类型。这是破坏性操作：会级联删除地图中所有使用该类型的地图项（包括其地皮、事件绑定和关联路径），并清理可行走路径类型设置中的引用。删除前应与用户确认。",
		inputSchema: RemoveMapItemTypeToolSchema,
		handler: removeMapItemType,
	},
];

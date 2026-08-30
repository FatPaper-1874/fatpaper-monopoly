/**
 * MCP Tools for MapItem Query
 *
 * This module provides read-only query operations for map items through the IPC Bridge.
 */

import { invokeTool } from "../bridge.js";
import { successResult, errorResult } from "../utils.js";
import { z } from "zod";

const ListMapItemsToolSchema = z.object({});

const GetMapItemToolSchema = z.object({
	mapItemId: z.string().describe("地图项ID"),
});

const QueryMapItemsToolSchema = z.object({
	typeId: z.string().optional().describe("地图项类型ID"),
	hasProperty: z.boolean().optional().describe("是否仅返回有地皮的地图项"),
	minX: z.number().optional(),
	maxX: z.number().optional(),
	minY: z.number().optional(),
	maxY: z.number().optional(),
	offset: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(200).default(50),
});

/**
 * List all map items with summary info
 */
export async function listMapItems(args: unknown) {
	try {
		const result = await invokeTool("list_map_items", args);
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to list map items");
	}
}

/**
 * Get a single map item with full details
 */
export async function getMapItem(args: unknown) {
	try {
		const result = await invokeTool("get_map_item", args);
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to get map item");
	}
}

export async function queryMapItems(args: unknown) {
	try {
		return successResult(await invokeTool("query_map_items", QueryMapItemsToolSchema.parse(args)));
	} catch (error: any) {
		return errorResult(error.message || "Failed to query map items");
	}
}

const AddMapItemToolSchema = z.object({
	typeId: z.string().describe("地图项类型ID，必须已存在于地图的 mapItemTypes 中"),
	x: z.number().int().describe("格子坐标 X"),
	y: z.number().int().describe("格子坐标 Y"),
	rotation: z.number().int().refine((v) => [0, 1, 2, 3].includes(v), "旋转方向只能是 0/1/2/3").optional().describe("旋转方向：0/1/2/3 分别对应 0°/90°/180°/270°，默认 0"),
});

const UpdateMapItemToolSchema = z.object({
	mapItemId: z.string().describe("地图项ID"),
	x: z.number().int().optional().describe("新的格子坐标 X"),
	y: z.number().int().optional().describe("新的格子坐标 Y"),
	rotation: z.number().int().refine((v) => [0, 1, 2, 3].includes(v), "旋转方向只能是 0/1/2/3").optional().describe("旋转方向：0/1/2/3 分别对应 0°/90°/180°/270°"),
});

const RemoveMapItemToolSchema = z.object({
	mapItemId: z.string().describe("地图项ID"),
});

const LinkMapEventToolSchema = z.object({
	mapItemId: z.string().describe("地图项ID"),
	mapEventId: z.string().optional().describe("要绑定的地图事件ID；省略或传空则解除该地图项的事件绑定"),
});

const LinkMapItemsToolSchema = z.object({
	sourceId: z.string().describe("发起绑定的地图项ID（linkto 方）"),
	targetId: z.string().describe("被绑定的地图项ID（beLinked 方，将作为持有 property 的地皮主体）"),
});

const UnlinkMapItemToolSchema = z.object({
	mapItemId: z.string().describe("地图项ID（绑定关系中的任意一方）"),
});

/**
 * Add a map item by typeId
 */
export async function addMapItem(args: unknown) {
	try {
		const result = await invokeTool("add_map_item", AddMapItemToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to add map item");
	}
}

/**
 * Update a map item's position / rotation
 */
export async function updateMapItem(args: unknown) {
	try {
		const result = await invokeTool("update_map_item", UpdateMapItemToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to update map item");
	}
}

/**
 * Remove a map item
 */
export async function removeMapItem(args: unknown) {
	try {
		const result = await invokeTool("remove_map_item", RemoveMapItemToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to remove map item");
	}
}

/**
 * Bind / unbind a map event to a map item
 */
export async function linkMapEvent(args: unknown) {
	try {
		const result = await invokeTool("link_map_event", LinkMapEventToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to link map event");
	}
}

/**
 * Link two map items（被绑定方成为持有 property 的地皮主体）
 */
export async function linkMapItems(args: unknown) {
	try {
		const result = await invokeTool("link_map_items", LinkMapItemsToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to link map items");
	}
}

/**
 * Unbind a map item's link
 */
export async function unlinkMapItem(args: unknown) {
	try {
		const result = await invokeTool("unlink_map_item", UnlinkMapItemToolSchema.parse(args));
		return successResult(result);
	} catch (error: any) {
		return errorResult(error.message || "Failed to unlink map item");
	}
}

/**
 * Export tool definitions for MCP server
 */
export const mapItemTools = [
	{
		name: "list_map_items",
		description: "列出地图中所有地图项的摘要信息。返回每个地图项的 id、类型名称、坐标、是否已有地皮等信息。",
		inputSchema: ListMapItemsToolSchema,
		handler: listMapItems,
	},
	{
		name: "get_map_item",
		description: "根据ID获取单个地图项的完整信息，包含类型详情、地皮属性、关联的地图事件等。",
		inputSchema: GetMapItemToolSchema,
		handler: getMapItem,
	},
	{
		name: "query_map_items",
		description: "按类型、地皮状态和坐标范围筛选地图项摘要，并分页返回。",
		inputSchema: QueryMapItemsToolSchema,
		handler: queryMapItems,
	},
	{
		name: "add_map_item",
		description: "在指定格子坐标放置一个新的地图项。必须提供已存在的地图项类型ID（可先通过地图数据或 get_map_item 确认有效 typeId）；目标坐标不能已被占用。rotation 可选，0/1/2/3 分别对应 0°/90°/180°/270°。",
		inputSchema: AddMapItemToolSchema,
		handler: addMapItem,
	},
	{
		name: "update_map_item",
		description: "更新地图项的位置（x/y 格子坐标）或旋转方向（0/1/2/3），至少提供一个字段。移动时会校验目标坐标未被其他地图项占用。",
		inputSchema: UpdateMapItemToolSchema,
		handler: updateMapItem,
	},
	{
		name: "remove_map_item",
		description: "删除指定地图项。这是破坏性操作：会级联解除其传送门绑定（linkto/beLinked）、删除关联的地图路径、若是起点则清除起点设置。删除前应与用户确认。",
		inputSchema: RemoveMapItemToolSchema,
		handler: removeMapItem,
	},
	{
		name: "link_map_event",
		description: "将地图事件绑定到指定地图项，或解除绑定。绑定前先通过 list_map_events 确认有效的地图事件ID；省略 mapEventId 参数则解除该地图项的事件绑定。",
		inputSchema: LinkMapEventToolSchema,
		handler: linkMapEvent,
	},
	{
		name: "link_map_items",
		description: "绑定两个地图项（一对一）：sourceId 方通过 linkto 指向 targetId 方，被绑定的目标方（beLinked）将成为持有 property 的地皮主体，用于渲染地皮的房屋模型和状态。约束：不能绑定自身；双方当前均不能已处于绑定状态。绑定后可通过 add_property 在目标方上配置地皮数据。",
		inputSchema: LinkMapItemsToolSchema,
		handler: linkMapItems,
	},
	{
		name: "unlink_map_item",
		description: "解除指定地图项的绑定关系，从绑定双方中的任意一方发起均可双向解绑。注意：解绑会一并清除被绑定地皮主体上的 property 数据。",
		inputSchema: UnlinkMapItemToolSchema,
		handler: unlinkMapItem,
	},
];
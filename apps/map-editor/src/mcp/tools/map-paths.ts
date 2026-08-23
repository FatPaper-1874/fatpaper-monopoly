import { z } from "zod";
import { invokeTool } from "../bridge.js";
import { errorResult, successResult } from "../utils.js";

const MapPathInputSchema = z.object({
	id: z.string().min(1).optional().describe("路径 ID；省略时由编辑器按端点自动生成"),
	fromMapItemId: z.string().min(1).describe("起点地图项 ID"),
	toMapItemId: z.string().min(1).describe("终点地图项 ID"),
	initEnable: z.boolean().optional().describe("地图初始化时是否开放；省略时为开放"),
	name: z.string().nullable().optional().describe("路径展示名称；传 null 清空"),
	description: z.string().nullable().optional().describe("路径展示说明；传 null 清空"),
});

const GetMapPathGraphSchema = z.object({});
const ListMapPathsSchema = z.object({
	mapItemId: z.string().min(1).optional().describe("按端点地图项 ID 过滤"),
	direction: z.enum(["outgoing", "incoming", "all"]).default("all").describe("相对于 mapItemId 的路径方向"),
	enabled: z.boolean().optional().describe("按初始化开放状态过滤；未配置 initEnable 视为 true"),
});
const GetMapPathSchema = z.object({ pathId: z.string().min(1).describe("路径 ID") });
const AddMapPathSchema = MapPathInputSchema.omit({ id: true }).extend({
	id: z.string().min(1).optional().describe("路径 ID；省略时由编辑器按端点自动生成"),
});
const UpdateMapPathSchema = z.object({
	pathId: z.string().min(1).describe("路径 ID"),
	fromMapItemId: z.string().min(1).optional().describe("起点地图项 ID"),
	toMapItemId: z.string().min(1).optional().describe("终点地图项 ID"),
	initEnable: z.boolean().optional().describe("地图初始化时是否开放"),
	name: z.string().nullable().optional().describe("路径展示名称；传 null 清空"),
	description: z.string().nullable().optional().describe("路径展示说明；传 null 清空"),
}).refine(
	(value) => Object.keys(value).some((key) => key !== "pathId"),
	{ message: "至少提供一个待更新字段" },
);
const RemoveMapPathSchema = z.object({ pathId: z.string().min(1).describe("路径 ID") });
const ReplaceMapPathsSchema = z.object({
	paths: z.array(MapPathInputSchema).describe("完整路径图；会替换当前全部路径"),
});
const UpdateMapPathSettingsSchema = z.object({
	pathMapItemTypeIds: z.array(z.string().min(1)).optional().describe("可行走地图项类型 ID；传空数组恢复按现有路径端点推断"),
	startMapItemId: z.string().min(1).nullable().optional().describe("地图起点 ID；传 null 清空后由旧 mapIndex 或路径节点推断"),
}).refine(
	(value) => value.pathMapItemTypeIds !== undefined || value.startMapItemId !== undefined,
	{ message: "至少提供 pathMapItemTypeIds 或 startMapItemId" },
);

function normalizeNullableMetadata<T extends { name?: string | null; description?: string | null }>(args: T) {
	return {
		...args,
		...(args.name === null ? { name: undefined } : {}),
		...(args.description === null ? { description: undefined } : {}),
	};
}

export async function getMapPathGraph(args: unknown) {
	try {
		return successResult(await invokeTool("get_map_path_graph", GetMapPathGraphSchema.parse(args)));
	} catch (error: any) {
		return errorResult(error.message || "Failed to get map path graph");
	}
}

export async function listMapPaths(args: unknown) {
	try {
		return successResult(await invokeTool("list_map_paths", ListMapPathsSchema.parse(args)));
	} catch (error: any) {
		return errorResult(error.message || "Failed to list map paths");
	}
}

export async function getMapPath(args: unknown) {
	try {
		return successResult(await invokeTool("get_map_path", GetMapPathSchema.parse(args)));
	} catch (error: any) {
		return errorResult(error.message || "Failed to get map path");
	}
}

export async function addMapPath(args: unknown) {
	try {
		return successResult(await invokeTool("add_map_path", normalizeNullableMetadata(AddMapPathSchema.parse(args))));
	} catch (error: any) {
		return errorResult(error.message || "Failed to add map path");
	}
}

export async function updateMapPath(args: unknown) {
	try {
		return successResult(await invokeTool("update_map_path", normalizeNullableMetadata(UpdateMapPathSchema.parse(args))));
	} catch (error: any) {
		return errorResult(error.message || "Failed to update map path");
	}
}

export async function removeMapPath(args: unknown) {
	try {
		return successResult(await invokeTool("remove_map_path", RemoveMapPathSchema.parse(args)));
	} catch (error: any) {
		return errorResult(error.message || "Failed to remove map path");
	}
}

export async function replaceMapPaths(args: unknown) {
	try {
		const parsed = ReplaceMapPathsSchema.parse(args);
		return successResult(await invokeTool("replace_map_paths", {
			paths: parsed.paths.map(normalizeNullableMetadata),
		}));
	} catch (error: any) {
		return errorResult(error.message || "Failed to replace map paths");
	}
}

export async function updateMapPathSettings(args: unknown) {
	try {
		return successResult(await invokeTool("update_map_path_settings", UpdateMapPathSettingsSchema.parse(args)));
	} catch (error: any) {
		return errorResult(error.message || "Failed to update map path settings");
	}
}

export const mapPathTools = [
	{
		name: "get_map_path_graph",
		description: "获取 MapPath V2 路径图、路径节点类型、地图起点和旧版 mapIndex 兼容状态。生成或批量调整路径前应先调用。",
		inputSchema: GetMapPathGraphSchema,
		handler: getMapPathGraph,
	},
	{
		name: "list_map_paths",
		description: "列出 MapPath V2 有向路径；可按端点、方向和初始开放状态过滤。",
		inputSchema: ListMapPathsSchema,
		handler: listMapPaths,
	},
	{
		name: "get_map_path",
		description: "按 ID 获取一条 MapPath V2 的完整定义。",
		inputSchema: GetMapPathSchema,
		handler: getMapPath,
	},
	{
		name: "add_map_path",
		description: "新增一条 MapPath V2 有向路径。端点必须是现有地图项，同方向重复路径会被拒绝。",
		inputSchema: AddMapPathSchema,
		handler: addMapPath,
	},
	{
		name: "update_map_path",
		description: "更新 MapPath V2 的端点、初始开放状态或展示信息；name/description 传 null 可清空。",
		inputSchema: UpdateMapPathSchema,
		handler: updateMapPath,
	},
	{
		name: "remove_map_path",
		description: "删除一条 MapPath V2 有向路径。",
		inputSchema: RemoveMapPathSchema,
		handler: removeMapPath,
	},
	{
		name: "replace_map_paths",
		description: "原子替换全部 MapPath V2 路径，适合由 AI 一次性生成路径图。会清空旧版 mapIndex；路径 ID 省略时自动生成。",
		inputSchema: ReplaceMapPathsSchema,
		handler: replaceMapPaths,
	},
	{
		name: "update_map_path_settings",
		description: "更新 MapPath V2 的可行走地图项类型和地图起点。pathMapItemTypeIds 传空数组可恢复旧地图兼容推断；startMapItemId 传 null 可清空。",
		inputSchema: UpdateMapPathSettingsSchema,
		handler: updateMapPathSettings,
	},
] as const;
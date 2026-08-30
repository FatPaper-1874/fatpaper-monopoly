/**
 * Validators for MapItemType Management
 */

import { z } from "zod";

/**
 * HEX color schema
 */
const HexColorSchema = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB 格式的 HEX 值")
	.describe("类型颜色，#RRGGBB 格式的 HEX 值");

/**
 * Add map item type schema
 */
export const AddMapItemTypeSchema = z.object({
	name: z.string().min(1, "名称不能为空").describe("类型名称"),
	modelId: z.string().min(1, "modelId 不能为空").describe("模型资源ID，需已存在于资源列表中"),
	color: HexColorSchema.optional(),
	size: z.number().positive("size 必须为正数").optional().describe("类型尺寸，默认 1"),
});

/**
 * Update map item type schema — 至少提供一个字段
 */
export const UpdateMapItemTypeSchema = z
	.object({
		typeId: z.string().min(1, "typeId 不能为空").describe("地图项类型ID"),
		name: z.string().min(1, "名称不能为空").optional().describe("新的类型名称"),
		modelId: z.string().min(1, "modelId 不能为空").optional().describe("新的模型资源ID"),
		color: HexColorSchema.optional(),
		size: z.number().positive("size 必须为正数").optional().describe("新的类型尺寸"),
	})
	.refine((data) => data.name !== undefined || data.modelId !== undefined || data.color !== undefined || data.size !== undefined, {
		message: "至少需要提供 name / modelId / color / size 中的一个字段",
	});

/**
 * Remove map item type schema
 */
export const RemoveMapItemTypeSchema = z.object({
	typeId: z.string().min(1, "typeId 不能为空").describe("地图项类型ID"),
});

/**
 * Get map item type schema
 */
export const GetMapItemTypeSchema = z.object({
	typeId: z.string().min(1, "typeId 不能为空").describe("地图项类型ID"),
});

/**
 * Type exports
 */
export type AddMapItemTypeInput = z.infer<typeof AddMapItemTypeSchema>;
export type UpdateMapItemTypeInput = z.infer<typeof UpdateMapItemTypeSchema>;
export type RemoveMapItemTypeInput = z.infer<typeof RemoveMapItemTypeSchema>;
export type GetMapItemTypeInput = z.infer<typeof GetMapItemTypeSchema>;

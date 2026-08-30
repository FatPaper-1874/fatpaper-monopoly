/**
 * Validators for MapItem Management
 */

import { z } from "zod";

/**
 * Rotation schema — 0/1/2/3 分别对应 0°/90°/180°/270°
 */
export const MapItemRotationSchema = z
	.number()
	.int()
	.refine((v) => [0, 1, 2, 3].includes(v), "旋转方向只能是 0/1/2/3")
	.transform((v) => v as 0 | 1 | 2 | 3)
	.describe("旋转方向：0/1/2/3 分别对应 0°/90°/180°/270°");

/**
 * Add map item schema
 */
export const AddMapItemSchema = z.object({
	typeId: z.string().min(1, "typeId 不能为空").describe("地图项类型ID，必须已存在于地图的 mapItemTypes 中"),
	x: z.number().int().describe("格子坐标 X"),
	y: z.number().int().describe("格子坐标 Y"),
	rotation: MapItemRotationSchema.default(0),
});

/**
 * Update map item schema — 移动/旋转，至少提供一个字段
 */
export const UpdateMapItemSchema = z
	.object({
		mapItemId: z.string().min(1, "mapItemId 不能为空").describe("地图项ID"),
		x: z.number().int().optional().describe("新的格子坐标 X"),
		y: z.number().int().optional().describe("新的格子坐标 Y"),
		rotation: MapItemRotationSchema.optional(),
	})
	.refine((data) => data.x !== undefined || data.y !== undefined || data.rotation !== undefined, {
		message: "至少需要提供 x / y / rotation 中的一个字段",
	});

/**
 * Remove map item schema
 */
export const RemoveMapItemSchema = z.object({
	mapItemId: z.string().min(1, "mapItemId 不能为空").describe("地图项ID"),
});

/**
 * Link map event schema — mapEventId 省略时解除绑定
 */
export const LinkMapEventSchema = z.object({
	mapItemId: z.string().min(1, "mapItemId 不能为空").describe("地图项ID"),
	mapEventId: z.string().optional().describe("要绑定的地图事件ID；省略或传空则解除该地图项的事件绑定"),
});

/**
 * Link two map items schema — source 指向 target，target 成为持有 property 的地皮主体
 */
export const LinkMapItemsSchema = z.object({
	sourceId: z.string().min(1, "sourceId 不能为空").describe("发起绑定的地图项ID（linkto 方）"),
	targetId: z.string().min(1, "targetId 不能为空").describe("被绑定的地图项ID（beLinked 方，将作为持有 property 的地皮主体）"),
});

/**
 * Unlink a map item schema — 从任一方发起均可双向解绑
 */
export const UnlinkMapItemSchema = z.object({
	mapItemId: z.string().min(1, "mapItemId 不能为空").describe("地图项ID（绑定关系中的任意一方）"),
});

/**
 * Type exports
 */
export type AddMapItemInput = z.infer<typeof AddMapItemSchema>;
export type UpdateMapItemInput = z.infer<typeof UpdateMapItemSchema>;
export type RemoveMapItemInput = z.infer<typeof RemoveMapItemSchema>;
export type LinkMapEventInput = z.infer<typeof LinkMapEventSchema>;
export type LinkMapItemsInput = z.infer<typeof LinkMapItemsSchema>;
export type UnlinkMapItemInput = z.infer<typeof UnlinkMapItemSchema>;

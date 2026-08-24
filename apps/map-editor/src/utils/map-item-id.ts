import { generateShortId } from "./short-id";

/** map item ID 的标准前缀 */
export const MAP_ITEM_ID_PREFIX = "mi";

/**
 * 生成当前标准的 map item ID（如 mi-abc123）。
 * 通过放置生成的 map item 与编辑器小工具统一调用此函数，保证 ID 格式一致。
 */
export function generateMapItemId(): string {
	return generateShortId(MAP_ITEM_ID_PREFIX);
}

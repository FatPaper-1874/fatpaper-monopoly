import { GameMap } from "@mine-monopoly/types";
import { MapItem, MapItemType } from "@mine-monopoly/types/interfaces/game/item";
import { CameraMode, OperationMode } from "@src/enums";
import mitt from "mitt";

export type Events = {
	// 事件名: 事件参数类型
	"change-model": string;

	"renderer-ready": void;
	"map-loaded": GameMap;
	"change-operation-mode": OperationMode;
	"change-camera-mode": CameraMode;
	"change-link-mode": boolean;
	"other-map-item-selected": string;
	"map-item-link": string;
	"map-item-unlink": string;
	"map-item-type-selected": string | undefined;
	"map-item-deleted": string;
	"map-item-updated": string;
	"map-event-link": string;
	"map-event-unlink": string;
	"map-path-added": string;
	"map-path-updated": string;
	"map-path-removed": string;
	"map-paths-for-map-item-updated": string;
	"map-paths-replaced": void;
	"map-path-selected": string | undefined;
	"map-index-update": string[];
	"map-background-update": void;

	// 框选模式相关事件
	"toggle-box-select-mode": void;

	// 批量移动地图项事件
	"batch-move-map-items": {
		ids: string[];
		deltaX: number;
		deltaY: number;
	};

	// 批量旋转地图项事件
	"batch-rotate-map-items": {
		ids: string[];
		direction: 1 | -1;  // 1 = 顺时针 90°, -1 = 逆时针 90°
	};

	// 批量删除地图项事件
	"batch-delete-map-items": string[];

	// 全选地图项事件
	"batch-select-all": void;

	// 清空选择事件
	"clear-selection": void;

	// 撤销删除事件
	"undo-delete": void;

	// MCP 操作反馈事件
	"mcp-operation": {
		operation: string;
		success: boolean;
		message: string;
		details?: any;
	};

	// Monaco 类型刷新事件
	"refresh-monaco-types": void;

	// 工具指示器显示/隐藏
	"toggle-indicators": void;

	// 保存请求（Ctrl+S 快捷键）
	"request-save": void;
};

export const eventBus = mitt<Events>();

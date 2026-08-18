import { IPlayer, PlayerInfo, PropertyInfo, UISchema } from "./game-process";
import { GameMapChangelogEntry } from "./db";
import { MapEventType } from "../../enums/game/game";

/**
 * 语义化版本类型
 * 格式：主版本号.次版本号.修订号
 */
export type SemVer = `${number}.${number}.${number}`;

/**
 * 游戏地图信息接口
 */
export interface GameMapInfo {
	/** 地图名称 */
	name: string;

	/** 地图作者 */
	author: string;

	/** 地图版本 */
	version: SemVer;

	/** 地图描述 */
	description: string;

	/** 当前待发布版本的更新日志（时间轴最顶上的可编辑条目；审核通过后固化进 changelog） */
	pendingChangelog: string;

	/** 已发布版本的更新日志历史（只读，按版本升序；随地图文件持久化） */
	changelog: GameMapChangelogEntry[];

	/** 地图编辑器版本 */
	editorVersion: string;

	/** 背景图片 ID */
	backgroundImageId: string;

	/** 封面图片 ID */
	coverImageId: string;
}

/**
 * 用户接口
 * 表示游戏用户的基本信息
 */
export interface User {
	/** 用户唯一标识 */
	userId: string;

	/** 用户名 */
	username: string;

	/** 是否准备就绪 */
	isReady: boolean;

	/** 头像 */
	avatar: string;

	/** 颜色 */
	color: string;
}

/**
 * 游戏内用户信息接口
 * 包含用户和角色信息
 */
export interface UserInGameInfo extends User {
	/** 角色 */
	role: Role;
}

/**
 * 房间内用户信息接口
 * 包含用户和所选角色 ID
 */
export interface UserInRoomInfo extends User {
	/** 所选角色 ID */
	roleId: string;
	/** 是否为 AI 玩家 */
	isAI?: boolean;
	/** 是否以旁观身份留在房间中 */
	isSpectator?: boolean;
}

/**
 * 地图项接口
 * 表示地图上的一个元素（如地产、特殊格等）
 */
export interface MapItem {
	/** 地图项唯一标识 */
	id: string;

	/** 地图项类型 */
	type: MapItemType;

	/** X 坐标 */
	x: number;

	/** Y 坐标 */
	y: number;

	/** 旋转角度（0, 1, 2, 3 对应 0°, 90°, 180°, 270°） */
	rotation: 0 | 1 | 2 | 3;

	/** 关联的地图事件 ID（可选） */
	mapEventId?: string;

	/** 链接到其他地图项（可选） */
	linkto?: string;

	/** 被链接的地图项 ID（可选） */
	beLinked?: string;

	/** 地产信息（可选） */
	property?: PropertyInfo;
}

/**
 * 角色接口
 * 表示游戏中的可选角色
 */
export interface Role {
	/** 角色唯一标识 */
	id: string;

	/** 角色名称 */
	name: string;

	/** 角色描述 */
	description: string;

	/** 角色颜色 */
	color: string;

	/** 角色图片 ID */
	imageId: string;

	/** 角色初始化代码（TypeScript 代码字符串） */
	initCode: string;
}

/**
 * 街道接口
 * 表示一组相关的地产
 */
export interface Street {
	/** 街道唯一标识 */
	id: string;

	/** 街道名称 */
	name: string;

	/** 街道描述 */
	description: string;

	/** 街道效果代码（TypeScript 代码字符串） */
	effectCode: string;

	/** 地产 ID 列表 */
	properties: string[];
}

/**
 * 地图项类型接口
 * 定义地图项的基本属性
 */
export interface MapItemType {
	/** 类型唯一标识 */
	id: string;

	/** 类型颜色 */
	color: string;

	/** 类型名称 */
	name: string;

	/** 模型 ID */
	modelId: string;

	/** 类型大小 */
	size: number;
}

/**
 * 地图事件接口
 * 定义地图上的特殊事件
 */
export interface MapEvent {
	/** 事件唯一标识 */
	id: string;

	/** 事件类型 */
	type: MapEventType;

	/** 事件名称 */
	name: string;

	/** 事件描述 */
	description: string;

	/** 事件图标 ID */
	iconId: string;

	/** 事件效果代码（TypeScript 代码字符串） */
	effectCode: string;
}

/**
 * 资源类型接口
 * 表示游戏中的图片或模型资源
 */
export type ResourcesType = {
	/** 资源唯一标识 */
	id: string;

	/** 资源名称 */
	name: string;

	/** 文件类型 */
	fileType: string;

	/** 资源 URL */
	url: string;

	/** 资源类型 */
	type: "image" | "model";
};

/**
 * 自定义 UI 接口
 * 表示游戏内自定义 UI 组件
 */
export interface CustomUI {
	/** 自定义 UI 唯一标识 */
	id: string;

	/** 自定义 UI 名称 */
	name: string;

	/** UI 布局 */
	layout: {
		/** X 坐标 */
		x: number;

		/** Y 坐标 */
		y: number;

		/** 宽度 */
		width: number;

		/** 高度 */
		height: number;
	};

	/** UI Schema（字符串形式） */
	uiSchema: string;
}

/** 地图审核状态 */
export type GameMapStatus = "reviewing" | "published" | "rejected" | "offline";

/**
 * 地图更新日志条目（每个已发布版本一条，审核通过时固化）
 */
export interface GameMapChangelogEntry {
	/** 已发布版本号（审核通过时 version+1 后的值） */
	version: number;

	/** 作者提交的语义化版本，可能为 null */
	semver: string | null;

	/** 日志内容（Markdown） */
	content: string;

	/** 固化时间（ISO 字符串） */
	createdAt: string;
}

/**
 * 数据库游戏地图接口
 * 表示存储在数据库中的游戏地图
 */
export interface GameMapInDb {
	/** 地图唯一标识 */
	id: string;

	/** 地图名称 */
	name: string;

	/** 地图作者 */
	author: string;

	/** 已发布版本号（审核通过时递增） */
	version: number;

	/** 地图描述 */
	description: string;

	/** 待审核版本的更新日志（作者本次上传时填写，审核通过后固化进 changelog） */
	pendingChangelog: string | null;

	/** 已发布版本的更新日志历史（按版本升序，审核通过时追加），列表/详情查询时附带解析后的数组 */
	changelog: GameMapChangelogEntry[];

	/** 地图哈希值 */
	hash: string;

	/** 封面图片 URL */
	coverUrl: string;

	/** 当前公开生效地图数据 URL */
	mapUrl: string;

	/** 是否正在使用 */
	inuse: boolean;

	/** 上传用户 ID；存量/管理员上传为 null */
	creatorId: string | null;

	/** 创作者用户名（列表查询时附带，未绑定时为 null） */
	creatorName?: string | null;

	/** 创作者账号（列表查询时附带，未绑定时为 null） */
	creatorAccount?: string | null;

	/** 是否官方地图（管理员直建或创作者为管理员），列表/详情查询时附带 */
	isOfficial?: boolean;

	/** 审核状态 */
	status: GameMapStatus;

	/** 驳回原因 */
	rejectReason: string | null;

	/** 待审核地图数据 URL */
	pendingUrl: string | null;

	/** 待审核版本的地图源文件（.fpmap）URL，与 pendingUrl 配对 */
	pendingSourceUrl: string | null;

	/** 当前公开版本的地图源文件（.fpmap）URL，与 mapUrl 配对 */
	sourceUrl: string | null;

	/** 待审核地图哈希 */
	pendingHash: string | null;

	/** 作者提交的语义化版本 */
	pendingVersion: string | null;
}

export interface MapKeyInDb {
	id: string;
	userId: string;
	key: string;
	revokedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface AdminAuditLogInDb {
	id: string;
	adminId: string | null;
	targetUserId: string | null;
	action: string;
	detail: string | null;
	createdAt: Date;
}
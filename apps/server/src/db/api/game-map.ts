import type { GameMapInDb, GameMapStatus } from "@mine-monopoly/types";
import { AppDataSource } from "#src/db/dbConnecter";
import { GameMap } from "#src/db/entities/GameMap";
import { FindOptionsWhere, IsNull } from "typeorm";

const gameMapRepository = AppDataSource.getRepository(GameMap);

export type CreateGameMapInput = Omit<GameMapInDb, "id">;

export const createGameMap = async (info: CreateGameMapInput) => {
	const gameMapToCreate = new GameMap();
	Object.assign(gameMapToCreate, info);

	return await gameMapRepository.save(gameMapToCreate);
};

export const updateGameMap = async (info: GameMapInDb) => {
	const gameMapToUpdate = await gameMapRepository.findOne({ where: { id: info.id } });
	if (!gameMapToUpdate) throw Error("查找地图错误");
	Object.assign(gameMapToUpdate, info);
	return await gameMapRepository.save(gameMapToUpdate);
};

export const setMapUse = async (id: string, use: boolean) => {
	const gameMap = await gameMapRepository.findOne({
		where: { id },
	});
	if (gameMap) {
		gameMap.inuse = use;
		return gameMapRepository.save(gameMap);
	} else {
		null;
	}
};

export const deleteGameMap = async (id: string) => {
	const gameMap = await gameMapRepository.findOne({
		where: { id },
	});
	if (gameMap) {
		return gameMapRepository.remove(gameMap);
	} else {
		null;
	}
};

export const getGameMapById = async (id: string, options?: { publishedOnly?: boolean }) => {
	const where: FindOptionsWhere<GameMap> = { id };
	if (options?.publishedOnly) where.status = "published";
	const gameMap = await gameMapRepository.findOne({ where });
	if (gameMap) {
		return gameMap;
	} else {
		return null;
	}
};

export const getGameMapList = async (
	page: number,
	size: number,
	options?: { publishedOnly?: boolean; inuse?: boolean }
) => {
	const qb = gameMapRepository
		.createQueryBuilder("map")
		.leftJoinAndSelect("map.creator", "creator");
	if (options?.publishedOnly) qb.andWhere("map.status = :status", { status: "published" });
	if (options?.inuse !== undefined) qb.andWhere("map.inuse = :inuse", { inuse: options.inuse });
	qb.addSelect(
		"CASE WHEN map.creatorId IS NULL OR creator.isAdmin = TRUE THEN 1 ELSE 0 END",
		"isOfficialOrder"
	)
		.orderBy("isOfficialOrder", "DESC")
		.addOrderBy("map.version", "DESC")
		.skip((page - 1) * size)
		.take(size);
	const [gameMapList, total] = await qb.getManyAndCount();
	const list = gameMapList.map(withCreatorInfo);
	return { gameMapList: list, total };
};

/** 附加创作者展示信息（用户名/账号/官方标识），剥离 User 实体敏感字段 */
function withCreatorInfo(gameMap: GameMap) {
	const creator = gameMap.creator;
	return {
		id: gameMap.id,
		name: gameMap.name,
		author: gameMap.author,
		version: gameMap.version,
		description: gameMap.description,
		pendingChangelog: gameMap.pendingChangelog,
		changelog: gameMap.changelog ?? [],
		hash: gameMap.hash,
		coverUrl: gameMap.coverUrl,
		mapUrl: gameMap.mapUrl,
		inuse: gameMap.inuse,
		creatorId: gameMap.creatorId,
		status: gameMap.status,
		rejectReason: gameMap.rejectReason,
		pendingUrl: gameMap.pendingUrl,
		pendingSourceUrl: gameMap.pendingSourceUrl,
		sourceUrl: gameMap.sourceUrl,
		pendingHash: gameMap.pendingHash,
		pendingVersion: gameMap.pendingVersion,
		creatorName: creator?.username ?? null,
		creatorAccount: creator?.useraccount ?? null,
		// 官方地图：管理员直建（creator 为空）或创作者是管理员
		isOfficial: !creator || creator.isAdmin === true,
	};
}

/** 获取地图详情（附带创作者信息与官方标识） */
export const getGameMapDetail = async (id: string, options?: { publishedOnly?: boolean }) => {
	const where: FindOptionsWhere<GameMap> = { id };
	if (options?.publishedOnly) where.status = "published";
	const gameMap = await gameMapRepository.findOne({ where, relations: { creator: true } });
	if (gameMap) {
		return withCreatorInfo(gameMap);
	} else {
		return null;
	}
};

export const countGameMapsByCreator = async (creatorId: string) => {
	return await gameMapRepository.count({ where: { creatorId } });
};

export const getGameMapByCreator = async (id: string, creatorId: string) => {
	return await gameMapRepository.findOne({ where: { id, creatorId } });
};

export const createPendingGameMap = async (info: {
	creatorId: string;
	name: string;
	author: string;
	description: string;
	coverUrl: string;
	pendingUrl: string;
	pendingSourceUrl: string | null;
	pendingHash: string;
	pendingVersion: string;
	pendingChangelog: string | null;
}) => {
	return await createGameMap({
		name: info.name,
		author: info.author,
		version: 0,
		description: info.description,
		pendingChangelog: info.pendingChangelog,
		changelog: [],
		hash: "",
		coverUrl: info.coverUrl,
		mapUrl: "",
		inuse: false,
		creatorId: info.creatorId,
		status: "reviewing",
		rejectReason: null,
		pendingUrl: info.pendingUrl,
		pendingSourceUrl: info.pendingSourceUrl,
		sourceUrl: null,
		pendingHash: info.pendingHash,
		pendingVersion: info.pendingVersion,
	});
};

export const updatePendingGameMap = async (gameMap: GameMap, info: {
	name: string;
	description: string;
	coverUrl?: string;
	pendingUrl: string;
	pendingSourceUrl: string | null;
	pendingHash: string;
	pendingVersion: string;
	pendingChangelog: string | null;
	author: string;
}) => {
	gameMap.name = info.name;
	gameMap.author = info.author;
	gameMap.description = info.description;
	gameMap.pendingChangelog = info.pendingChangelog;
	if (info.coverUrl !== undefined) gameMap.coverUrl = info.coverUrl;
	gameMap.pendingUrl = info.pendingUrl;
	gameMap.pendingSourceUrl = info.pendingSourceUrl;
	gameMap.pendingHash = info.pendingHash;
	gameMap.pendingVersion = info.pendingVersion;
	gameMap.status = "reviewing";
	gameMap.rejectReason = null;
	return await gameMapRepository.save(gameMap);
};

export const reviewGameMap = async (id: string, action: "approve" | "reject" | "offline" | "online") => {
	const gameMap = await gameMapRepository.findOne({ where: { id } });
	if (!gameMap) throw new Error("地图不存在");

	if (action === "approve") {
		if (!gameMap.pendingUrl) throw new Error("没有待审核版本");
		gameMap.mapUrl = gameMap.pendingUrl;
		gameMap.sourceUrl = gameMap.pendingSourceUrl;
		gameMap.hash = gameMap.pendingHash || gameMap.hash;
		gameMap.pendingUrl = null;
		gameMap.pendingSourceUrl = null;
		gameMap.pendingHash = null;
		const pendingSemver = gameMap.pendingVersion;
		gameMap.pendingVersion = null;
		gameMap.rejectReason = null;
		const nextVersion = (gameMap.version || 0) + 1;
		gameMap.version = nextVersion;
		// 固化更新日志：非空才追加，避免产生空历史条目
		if (gameMap.pendingChangelog?.trim()) {
			const history = gameMap.changelog ?? [];
			history.push({
				version: nextVersion,
				semver: pendingSemver,
				content: gameMap.pendingChangelog.trim(),
				createdAt: new Date().toISOString(),
			});
			gameMap.changelog = history;
		}
		gameMap.pendingChangelog = null;
		gameMap.status = "published";
	}
	if (action === "reject") {
		gameMap.status = "rejected";
		gameMap.pendingUrl = null;
		gameMap.pendingSourceUrl = null;
		gameMap.pendingHash = null;
		gameMap.pendingVersion = null;
		gameMap.pendingChangelog = null;
	}
	if (action === "offline") {
		if (gameMap.status !== "published") throw new Error("仅已发布地图可下架");
		gameMap.status = "offline";
	}
	if (action === "online") {
		if (!gameMap.mapUrl) throw new Error("没有已发布文件，无法上架");
		gameMap.status = "published";
	}
	return await gameMapRepository.save(gameMap);
};

export const setGameMapRejectReason = async (gameMap: GameMap, reason: string) => {
	gameMap.rejectReason = reason;
	return await gameMapRepository.save(gameMap);
};

/** 将存量地图绑定到指定创作者（creatorId 为 null 的历史地图） */
export const bindGameMapCreator = async (id: string, creatorId: string) => {
	const gameMap = await gameMapRepository.findOne({ where: { id } });
	if (!gameMap) throw new Error("地图不存在");
	if (gameMap.creatorId) throw new Error("该地图已绑定创作者");
	gameMap.creatorId = creatorId;
	return await gameMapRepository.save(gameMap);
};

export const getAdminGameMapList = async (options: {
	page: number;
	size: number;
	creatorId?: string;
	status?: GameMapStatus;
}) => {
	const where: FindOptionsWhere<GameMap> = {};
	if (options.creatorId) where.creatorId = options.creatorId;
	if (options.status) where.status = options.status;
	const [gameMapList, total] = await gameMapRepository.findAndCount({
		where,
		relations: { creator: true },
		skip: (options.page - 1) * options.size,
		take: options.size,
		order: { status: "ASC", version: "DESC" },
	});
	return { gameMapList: gameMapList.map(withCreatorInfo), total };
};

export const detachPublishedMapsAndRemoveDraftsByCreator = async (creatorId: string) => {
	const maps = await gameMapRepository.find({ where: { creatorId } });
	const deletedMaps: GameMap[] = [];
	for (const gameMap of maps) {
		if (gameMap.status === "published") {
			gameMap.creatorId = null;
			await gameMapRepository.save(gameMap);
		} else {
			deletedMaps.push(await gameMapRepository.remove(gameMap));
		}
	}
	return deletedMaps;
};

export const publishExistingInUseMaps = async () => {
	await gameMapRepository
		.createQueryBuilder()
		.update(GameMap)
		.set({ status: "published" })
		.where("inuse = :inuse AND status != :status", { inuse: true, status: "published" })
		.execute();
};

export const getActiveMapKeyOwnerMapCount = async (userId: string) => {
	return await gameMapRepository.count({ where: { creatorId: userId } });
};
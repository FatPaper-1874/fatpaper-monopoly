import { Router } from "express";
import { env } from "@mine-monopoly/env";
import type { GameMapStatus } from "@mine-monopoly/types";
import {
	bindGameMapCreator,
	countGameMapsByCreator,
	createGameMap,
	createPendingGameMap,
	deleteGameMap,
	getAdminGameMapList,
	getGameMapByCreator,
	getGameMapById,
	getGameMapDetail,
	getGameMapList,
	reviewGameMap,
	setGameMapRejectReason,
	setMapUse,
	updateGameMap,
	updatePendingGameMap,
} from "#src/db/api/game-map";
import { getUserById } from "#src/db/api/user";
import { getTodayUploadCount, incrementTodayUploadCount } from "#src/db/api/map-upload-counter";
import { ResInterface } from "#src/interfaces/res";
import { getStorage, createMulter, gameMapMulter, withFileCleanup, cleanupTempFiles } from "#src/utils/storage";
import { getFileNameInPath, randomString } from "#src/utils";
import { serverLog } from "#src/utils/logger";
import { apiKeyAuth, getApiKeyInfo, getApiKeyUser } from "#src/utils/api-key";
import { DEFAULT_MAP_UPLOAD_SIZE_LIMIT_MB, DEFAULT_MAP_UPLOAD_DAILY_LIMIT, resolveUploadSizeLimitBytes } from "#src/utils/map-upload-limit";

export const gameMapRouter = Router();

interface FileArray {
	[fieldname: string]: Express.Multer.File[];
}

type ReviewAction = "approve" | "reject" | "offline" | "online" | "delete";

function getFiles(req: { files?: unknown }) {
	return (req.files || {}) as FileArray;
}

function flattenFiles(files: FileArray) {
	return Object.values(files).flatMap((f) => f);
}

function getUrlStorageKey(url?: string | null) {
	if (!url) return null;
	const fileName = getFileNameInPath(url);
	if (!fileName) return null;
	return `${env("GAME_MAP_STORAGE_PATH", "monopoly/game-map")}/${fileName}`;
}

async function deleteMapUrls(urls: Array<string | null | undefined>) {
	const keys = urls.map(getUrlStorageKey).filter((key): key is string => Boolean(key));
	if (keys.length === 0) return;
	try {
		await getStorage().delete([...new Set(keys)]);
	} catch (e: any) {
		// 文件删除失败不应阻塞主流程（本地存储也是仅告警）；失败的文件由运维清理
		serverLog(`Map file delete failed (${keys.join(", ")}): ${e.message}`, "warn");
	}
}

async function uploadMapFiles(files: FileArray, options: { coverRequired: boolean; sourceRequired?: boolean }) {
	const mapFile = files["game-map"]?.[0];
	const coverFile = files["cover-image"]?.[0];
	const sourceFile = files["source-map"]?.[0];
	if (!mapFile) throw new Error("缺少地图文件");
	if (options.coverRequired && !coverFile) throw new Error("缺少封面文件");
	if (options.sourceRequired && !sourceFile) throw new Error("缺少地图源文件");

	const mapPath = env("GAME_MAP_STORAGE_PATH", "monopoly/game-map");
	const entries = [
		...(coverFile ? [{ file: coverFile, targetPath: mapPath, exts: [".png", ".jpg", ".jpeg"] }] : []),
		{ file: mapFile, targetPath: mapPath, exts: [".fpmap", ".mmmap"] },
		...(sourceFile ? [{ file: sourceFile, targetPath: mapPath, exts: [".fpmap"] }] : []),
	];
	return await withFileCleanup(
		{
			files: entries,
			name: randomString(16),
		},
		async (urls) => {
			let offset = 0;
			const coverUrl = coverFile ? urls[offset++] : undefined;
			const mapUrl = urls[offset++];
			const sourceUrl = sourceFile ? urls[offset++] : undefined;
			return { coverUrl, mapUrl, sourceUrl };
		},
	);
}

gameMapRouter.get("/key/info", apiKeyAuth, async (req, res) => {
	try {
		const resContent: ResInterface = { status: 200, data: await getApiKeyInfo(getApiKeyUser(req)) };
		res.status(200).json(resContent);
	} catch (e: any) {
		const resContent: ResInterface = { status: 500, msg: e.message || "获取 key 信息失败" };
		res.status(500).json(resContent);
	}
});

gameMapRouter.get("/status", apiKeyAuth, async (req, res) => {
	const { mapId } = req.query;
	if (!mapId) {
		const resContent: ResInterface = { status: 400, msg: "缺少 mapId" };
		res.status(400).json(resContent);
		return;
	}
	try {
		const user = getApiKeyUser(req);
		const gameMap = await getGameMapById(mapId.toString());
		if (!gameMap) {
			const resContent: ResInterface = { status: 404, msg: "地图不存在" };
			res.status(404).json(resContent);
			return;
		}
		if (gameMap.creatorId !== user.userId) {
			const resContent: ResInterface = { status: 403, msg: "该地图不属于当前 key 绑定的用户" };
			res.status(403).json(resContent);
			return;
		}
		const resContent: ResInterface = {
			status: 200,
			data: {
				status: gameMap.status,
				rejectReason: gameMap.rejectReason,
				version: gameMap.version,
				changelog: gameMap.changelog ?? [],
			},
		};
		res.status(200).json(resContent);
	} catch (e: any) {
		const resContent: ResInterface = { status: 500, msg: e.message || "获取地图状态失败" };
		res.status(500).json(resContent);
	}
});

const keyUploadFields: { name: string; maxCount: number }[] = [
	{ name: "game-map", maxCount: 1 },
	{ name: "source-map", maxCount: 1 },
	{ name: "cover-image", maxCount: 1 },
];

gameMapRouter.post(
	"/key/upload",
	apiKeyAuth,
	(req, res, next) => {
		// 动态创建 multer：按该 key 用户配置的上传大小限制（默认 50MB）限制单个文件大小，超限文件不落盘
		const user = getApiKeyUser(req);
		const multer = createMulter({
			dest: "public/temp",
			allowedExtensions: [".png", ".jpg", ".jpeg", ".fpmap", ".mmmap"],
			maxSize: resolveUploadSizeLimitBytes(user.user),
		});
		multer.fields(keyUploadFields)(req, res, (err: any) => {
			if (!err) {
				next();
				return;
			}
			void cleanupTempFiles(flattenFiles(getFiles(req)));
			if (err?.code === "LIMIT_FILE_SIZE") {
				const limitMb = user.user.mapUploadSizeLimit ?? DEFAULT_MAP_UPLOAD_SIZE_LIMIT_MB;
				const resContent: ResInterface = { status: 413, msg: "上传文件超过大小限制", data: { limit: limitMb } };
				res.status(413).json(resContent);
				return;
			}
			const status = err?.message?.startsWith("文件后缀名不合法") ? 422 : 500;
			const resContent: ResInterface = { status, msg: err?.message || "文件上传失败" };
			res.status(status).json(resContent);
		});
	},
	async (req, res) => {
		const files = getFiles(req);
		const { name, version, hash, description, changelog } = req.body;
		const serverMapId = req.body["server-map-id"] || req.body.serverMapId;

		if (!(name && version && hash && files["game-map"]?.[0] && files["source-map"]?.[0])) {
			await cleanupTempFiles(flattenFiles(files));
			const resContent: ResInterface = { status: 400, msg: "请求参数错误：需要同时上传 .mmmap 与 .fpmap 文件" };
			res.status(400).json(resContent);
			return;
		}

		try {
			const user = getApiKeyUser(req);
			if (user.quota === null) {
				await cleanupTempFiles(flattenFiles(files));
				const resContent: ResInterface = { status: 403, msg: "该用户未开通地图上传权限" };
				res.status(403).json(resContent);
				return;
			}

			// 每日上传次数限制（默认 3 次/天，管理端可配置）
			const dailyLimit = user.user.mapDailyUploadLimit ?? DEFAULT_MAP_UPLOAD_DAILY_LIMIT;
			const todayUploaded = getTodayUploadCount(user.user);
			if (todayUploaded >= dailyLimit) {
				await cleanupTempFiles(flattenFiles(files));
				const resContent: ResInterface = {
					status: 429,
					msg: "今日上传次数已达上限",
					data: { limit: dailyLimit, used: todayUploaded },
				};
				res.status(429).json(resContent);
				return;
			}

			let gameMap = serverMapId ? await getGameMapByCreator(serverMapId.toString(), user.userId) : null;
			if (serverMapId && !gameMap) {
				await cleanupTempFiles(flattenFiles(files));
				const resContent: ResInterface = { status: 403, msg: "无权更新该地图" };
				res.status(403).json(resContent);
				return;
			}
			if (gameMap?.status === "reviewing") {
				await cleanupTempFiles(flattenFiles(files));
				const resContent: ResInterface = { status: 409, msg: "该地图正在审核中，无法再次上传，请等待审核结果" };
				res.status(409).json(resContent);
				return;
			}

			if (!gameMap) {
				const used = await countGameMapsByCreator(user.userId);
				if (used >= user.quota) {
					await cleanupTempFiles(flattenFiles(files));
					const resContent: ResInterface = { status: 413, msg: "地图配额已满", data: { used, quota: user.quota } };
					res.status(413).json(resContent);
					return;
				}
			}

			const oldPendingUrl = gameMap?.pendingUrl || null;
			const oldPendingSourceUrl = gameMap?.pendingSourceUrl || null;
			const oldCoverUrl = gameMap?.coverUrl || null;
			const uploadResult = await uploadMapFiles(files, { coverRequired: !gameMap, sourceRequired: true });

			if (gameMap) {
				gameMap = await updatePendingGameMap(gameMap, {
					name: name.toString(),
					author: user.username,
					description: description?.toString() || "",
					coverUrl: uploadResult.coverUrl,
					pendingUrl: uploadResult.mapUrl,
					pendingSourceUrl: uploadResult.sourceUrl ?? null,
					pendingHash: hash.toString(),
					pendingVersion: version.toString(),
					pendingChangelog: changelog?.toString() || null,
				});
				await deleteMapUrls([oldPendingUrl, oldPendingSourceUrl, uploadResult.coverUrl ? oldCoverUrl : null]);
			} else {
				gameMap = await createPendingGameMap({
					creatorId: user.userId,
					name: name.toString(),
					author: user.username,
					description: description?.toString() || "",
					coverUrl: uploadResult.coverUrl || "",
					pendingUrl: uploadResult.mapUrl,
					pendingSourceUrl: uploadResult.sourceUrl ?? null,
					pendingHash: hash.toString(),
					pendingVersion: version.toString(),
					pendingChangelog: changelog?.toString() || null,
				});
			}

			// 计入每日上传次数（计数失败不阻塞成功响应，由日志告警）
			try {
				await incrementTodayUploadCount(user.user);
			} catch (e: any) {
				serverLog(`Increment today upload count failed (${user.userId}): ${e.message}`, "warn");
			}

			const resContent: ResInterface = { status: 200, msg: "地图已提交审核", data: { serverMapId: gameMap.id } };
			res.status(200).json(resContent);
		} catch (e: any) {
			const status = e.message?.startsWith("文件后缀名不合法") ? 422 : 500;
			const resContent: ResInterface = { status, msg: e.message || "服务器处理错误" };
			res.status(status).json(resContent);
		}
	}
);

gameMapRouter.post("/review", async (req, res) => {
	const { mapId, action, reason } = req.body as { mapId?: string; action?: ReviewAction; reason?: string };
	if (!mapId || !action || !["approve", "reject", "offline", "online", "delete"].includes(action)) {
		const resContent: ResInterface = { status: 400, msg: "请求参数错误" };
		res.status(400).json(resContent);
		return;
	}
	if (action === "reject" && !reason?.trim()) {
		const resContent: ResInterface = { status: 400, msg: "驳回必须填写原因" };
		res.status(400).json(resContent);
		return;
	}

	try {
		const gameMap = await getGameMapById(mapId);
		if (!gameMap) throw new Error("地图不存在");
		if (action === "delete") {
			const deleted = await deleteGameMap(mapId);
			if (!deleted) throw new Error("地图不存在");
			await deleteMapUrls([deleted.coverUrl, deleted.mapUrl, deleted.pendingUrl, deleted.sourceUrl, deleted.pendingSourceUrl]);
			const resContent: ResInterface = { status: 200, msg: "删除成功", data: deleted };
			res.status(200).json(resContent);
			return;
		}

		const pendingUrlsToDelete: Array<string | null | undefined> =
			action === "reject" ? [gameMap.pendingUrl, gameMap.pendingSourceUrl] : [];
		// approve 前记录旧已发布版本文件，新版本生效后删除，避免孤儿文件
		const oldPublishedUrls: Array<string | null | undefined> =
			action === "approve" ? [gameMap.mapUrl, gameMap.sourceUrl] : [];
		let reviewed = await reviewGameMap(mapId, action);
		if (action === "reject") {
			reviewed = await setGameMapRejectReason(reviewed, reason!.trim());
			await deleteMapUrls(pendingUrlsToDelete);
		}
		if (action === "approve") {
			await deleteMapUrls(oldPublishedUrls);
		}
		const resContent: ResInterface = { status: 200, msg: "审核操作成功", data: reviewed };
		res.status(200).json(resContent);
	} catch (e: any) {
		const resContent: ResInterface = { status: 500, msg: e.message || "审核操作失败" };
		res.status(500).json(resContent);
	}
});

/** 将存量地图绑定到指定创作者（仅 admin；用于 creatorId 为 null 的历史地图） */
gameMapRouter.post("/bind-creator", async (req, res) => {
	const { mapId, creatorId } = req.body as { mapId?: string; creatorId?: string };
	if (!mapId || !creatorId) {
		const resContent: ResInterface = { status: 400, msg: "缺少 mapId 或 creatorId" };
		res.status(400).json(resContent);
		return;
	}
	try {
		const user = await getUserById(creatorId);
		if (!user) throw new Error("目标用户不存在");
		if (!user.isCreator) throw new Error("目标用户不是创作者，无法绑定");

		const saved = await bindGameMapCreator(mapId, creatorId);
		const resContent: ResInterface = { status: 200, msg: "绑定创作者成功", data: saved };
		res.status(200).json(resContent);
	} catch (e: any) {
		const resContent: ResInterface = { status: 500, msg: e.message || "绑定创作者失败" };
		res.status(500).json(resContent);
	}
});

gameMapRouter.get("/admin-list", async (req, res) => {
	const { page = 1, size = 8, creatorId, status } = req.query;
	try {
		const { gameMapList, total } = await getAdminGameMapList({
			page: parseInt(page.toString()),
			size: parseInt(size.toString()),
			creatorId: creatorId?.toString(),
			status: ["reviewing", "published", "rejected", "offline"].includes(status?.toString() || "")
				? status?.toString() as GameMapStatus
				: undefined,
		});
		const resMsg: ResInterface = {
			status: 200,
			data: { total, current: parseInt(page.toString()), gameMapList },
		};
		res.status(200).json(resMsg);
	} catch {
		const resMsg: ResInterface = { status: 500, msg: "获取地图列表失败" };
		res.status(500).json(resMsg);
	}
});

gameMapRouter.post(
	"/create",
	gameMapMulter.fields([
		{ name: "game-map", maxCount: 1 },
		{ name: "cover-image", maxCount: 1 },
	]),
	async (req, res) => {
		const files = getFiles(req);
		const { name, author, version, hash, description } = req.body;

		if (!(name && author && version && hash && files["game-map"]?.[0] && files["cover-image"]?.[0])) {
			await cleanupTempFiles(flattenFiles(files));
			const resContent: ResInterface = { status: 400, msg: "请求参数错误" };
			res.status(400).json(resContent);
			return;
		}

		try {
			const uploadResult = await uploadMapFiles(files, { coverRequired: true });
			const map = await createGameMap({
				name,
				author,
				version: 1,
				description: description || "",
				pendingChangelog: null,
				changelog: [],
				hash,
				coverUrl: uploadResult.coverUrl || "",
				mapUrl: uploadResult.mapUrl,
				inuse: false,
				creatorId: null,
				status: "published",
				rejectReason: null,
				pendingUrl: null,
				pendingSourceUrl: null,
				sourceUrl: null,
				pendingHash: null,
				pendingVersion: version,
			});
			const resContent: ResInterface = { status: 200, msg: "添加地图成功", data: map };
			res.status(200).json(resContent);
		} catch (e: any) {
			const resContent: ResInterface = { status: 500, msg: e.message || "服务器处理错误" };
			res.status(500).json(resContent);
		}
	}
);

gameMapRouter.post(
	"/update",
	gameMapMulter.fields([
		{ name: "game-map", maxCount: 1 },
		{ name: "cover-image", maxCount: 1 },
	]),
	async (req, res) => {
		const files = getFiles(req);
		const { id, author, name, version, hash, description } = req.body;

		if (!(id && author && name && version && hash && files["game-map"]?.[0] && files["cover-image"]?.[0])) {
			await cleanupTempFiles(flattenFiles(files));
			const resContent: ResInterface = { status: 400, msg: "请求参数错误" };
			res.status(400).json(resContent);
			return;
		}

		try {
			const oldMap = await getGameMapById(id.toString());
			if (!oldMap) throw new Error("地图不存在");
			const uploadResult = await uploadMapFiles(files, { coverRequired: true });
			const map = await updateGameMap({
				id,
				name,
				author,
				version: (oldMap.version || 0) + 1,
				description: description || "",
				pendingChangelog: null,
				// admin 更新已发布地图时保留既有更新日志历史
				changelog: oldMap.changelog ?? [],
				hash,
				coverUrl: uploadResult.coverUrl || "",
				mapUrl: uploadResult.mapUrl,
				inuse: false,
				creatorId: null,
				status: "published",
				rejectReason: null,
				pendingUrl: null,
				pendingSourceUrl: null,
				sourceUrl: null,
				pendingHash: null,
				pendingVersion: version,
			});
			await deleteMapUrls([oldMap.coverUrl, oldMap.mapUrl, oldMap.pendingUrl, oldMap.sourceUrl, oldMap.pendingSourceUrl]);
			const resContent: ResInterface = { status: 200, msg: "更新地图成功", data: map };
			res.status(200).json(resContent);
		} catch (e: any) {
			const resContent: ResInterface = { status: 500, msg: e.message || "服务器处理错误" };
			res.status(500).json(resContent);
		}
	}
);

gameMapRouter.get("/info", async (req, res) => {
	const { id } = req.query;
	if (!id) {
		const resContent: ResInterface = { status: 400, msg: "请求参数错误, 缺少地图id" };
		res.status(400).json(resContent);
		return;
	}
	try {
		const gameMap = await getGameMapDetail(id.toString(), { publishedOnly: true });
		if (!gameMap) {
			const resMsg: ResInterface = { status: 404, msg: "地图不存在" };
			res.status(404).json(resMsg);
			return;
		}
		const resMsg: ResInterface = { status: 200, data: gameMap };
		res.status(200).json(resMsg);
	} catch {
		const resMsg: ResInterface = { status: 500, msg: "获取地图列表失败" };
		res.status(500).json(resMsg);
	}
});

gameMapRouter.get("/list", async (req, res) => {
	const { page = 1, size = 8, inuse } = req.query;
	try {
		const inuseFilter = inuse === "true" ? true : inuse === "false" ? false : undefined;
		const { gameMapList, total } = await getGameMapList(parseInt(page.toString()), parseInt(size.toString()), {
			publishedOnly: true,
			inuse: inuseFilter,
		});
		const resMsg: ResInterface = {
			status: 200,
			data: { total, current: parseInt(page.toString()), gameMapList },
		};
		res.status(200).json(resMsg);
	} catch (e: any) {
		serverLog(`获取地图列表失败: ${e?.message || e}`, "error");
		const resMsg: ResInterface = { status: 500, msg: "获取地图列表失败" };
		res.status(500).json(resMsg);
	}
});

gameMapRouter.post("/set-use", async (req, res) => {
	const { id, use } = req.body;
	try {
		const gameMap = await setMapUse(id, use);
		const resMsg: ResInterface = { status: 200, msg: use ? "已启用地图" : "已禁用地图", data: gameMap };
		res.status(200).json(resMsg);
	} catch {
		const resMsg: ResInterface = { status: 500, msg: "修改地图状态失败" };
		res.status(500).json(resMsg);
	}
});

gameMapRouter.delete("/delete", async (req, res) => {
	const { id } = req.query;
	if (!id) {
		const resContent: ResInterface = { status: 400, msg: "请求参数错误，缺少地图id" };
		res.status(400).json(resContent);
		return;
	}

	try {
		const gameMap = await deleteGameMap(id.toString());
		if (!gameMap) throw new Error("地图不存在");
		await deleteMapUrls([gameMap.coverUrl, gameMap.mapUrl, gameMap.pendingUrl, gameMap.sourceUrl, gameMap.pendingSourceUrl]);
		const resMsg: ResInterface = { status: 200, msg: "删除成功", data: gameMap };
		res.status(200).json(resMsg);
	} catch (e: any) {
		const resMsg: ResInterface = { status: 500, msg: e.message || "删除失败" };
		res.status(500).json(resMsg);
	}
});
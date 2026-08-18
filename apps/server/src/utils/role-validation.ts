import { RequestHandler } from "express";
import { match } from "path-to-regexp";
import { ResInterface } from "#src/interfaces/res";
import { verToken } from "#src/utils/token";
import { AppDataSource } from "#src/db/dbConnecter";
import { User } from "#src/db/entities/User";

const AllowPath = {
	Admin: [],
	User: ["/user/info"],
	Ignore: [
		"/upload/avatar",
		"/user/public-key",
		"/user/encryption-key",
		"/user/register",
		"/user/login",
		"/user/refresh-token",
		"/user/get-code-state",
		"/user/get-login-code",
		"/static/(.*)",
		"/game-map/list",
		"/game-map/info",
		"/game-map/key/(.*)",
		"/game-map/status",
		"/room-router/join",
		"/room-router/emit-host",
		"/room-router/delete",
		"/room-router/heart",
		// 会话状态查询与房主租约夺回依赖 lease token，不应因用户 access token 过期而中断正在进行的 P2P 对局。
		"/room-router/status",
		"/room-router/reclaim-host",
		"/room-router/random-public-room",
		"/room-router/set-private",
		"/room-router/set-started",
	],
};

const activeThrottle = new Map<string, number>();
const THROTTLE_MS = 30_000;

async function markUserOnline(userId: string) {
	const now = Date.now();
	const last = activeThrottle.get(userId);
	if (last && now - last < THROTTLE_MS) return;

	activeThrottle.set(userId, now);
	try {
		await AppDataSource.getRepository(User)
			.createQueryBuilder()
			.update(User)
			.set({ online: true, lastActiveTime: new Date() })
			.where("id = :userId", { userId })
			.execute();
	} catch {
		// 静默，不影响请求
	}
}

function isIgnore(path: string): boolean {
	return AllowPath.Ignore.some((allowPath) => {
		const pathMatcher = match(allowPath);
		return Boolean(pathMatcher(path));
	});
}

function isAllowPath(path: string): boolean {
	return AllowPath.User.some((allowPath) => {
		const pathMatcher = match(allowPath);
		return Boolean(pathMatcher(path));
	});
}

export const roleValidation: RequestHandler = async (req, res, next) => {
	const path = req.path;
	const token = req.headers.authorization;
	if (isIgnore(path)) {
		next();
	} else if (!token) {
		const resContent: ResInterface = {
			status: 401,
			msg: "没有携带token",
		};
		res.status(401).json(resContent);
	} else {
		let tokenInfo;
		try {
			tokenInfo = await verToken(token);
		} catch {
			const resContent: ResInterface = {
				status: 401,
				msg: "token过期，请重新登录",
			};
			res.status(401).json(resContent);
			return;
		}
		if (!tokenInfo) {
			const resContent: ResInterface = {
				status: 401,
				msg: "token过期，请重新登录",
			};
			res.status(401).json(resContent);
		} else {
			const { userId, isAdmin } = tokenInfo;

			markUserOnline(userId);

			if (!isAdmin && !isAllowPath(path)) {
				const resContent: ResInterface = {
					status: 403,
					msg: "无权访问该接口",
				};
				res.status(403).json(resContent);
			} else {
				next();
			}
		}
	}
};
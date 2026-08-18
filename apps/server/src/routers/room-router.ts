import { Router } from "express";
import { randomUUID } from "crypto";
import { createRecord } from "#src/db/api/game-record";
import { ResInterface } from "#src/interfaces/res";
import { User } from "#src/interfaces/bace";
import { verToken } from "#src/utils/token";
import { generateIceServers } from "#src/utils/turn-credentials";

type RoomMapItem = {
	roomId: string;
	hostName: string;
	hostId: string;
	hostPeerId: string | null;
	createTime: number;
	deleteTime: number;
	lastHeartTime: number;
	isPrivate: boolean;
	isStarted: boolean;
	mapId: string | null;
	mapName: string | null;
	status: "active" | "grace" | "closed" | "expired";
	statusUpdatedAt: number;
	hostLeaseToken: string;
	hostEpoch: number;
};

export const roomRouter = Router();
const heartContinuationTimeMs = 30000; // 房主心跳租约时长（原 10s，扩大余量避免网络抖动导致误判）
const heartbeatSuggestedIntervalMs = 5000; // 建议客户端心跳间隔（远小于租约，消除"心跳间隔==租约"竞态）
const leaseGracePeriodMs = 60000; // 租约到期后的宽限期，期间 /heart、/emit-host 仍可续回 active
const closedSessionRetentionMs = 5 * 60 * 1000;
const roomMap = new Map<string, RoomMapItem>();

//删除房间定时器
setInterval(() => {
	Array.from(roomMap.entries()).forEach((room) => {
		const roomItem = room[1];
		const now = Date.now();
		if (roomItem.status === "active") {
			if (roomItem.deleteTime < now) {
				// 租约到期：先进入宽限期（仍可由房主续回），宽限期结束后才彻底过期
				roomItem.status = "grace";
				roomItem.statusUpdatedAt = now;
			}
		} else if (roomItem.status === "grace") {
			if (roomItem.deleteTime + leaseGracePeriodMs < now) {
				roomItem.status = "expired";
				roomItem.statusUpdatedAt = now;
				roomItem.hostPeerId = null;
				createRecord(roomItem.roomId, now - roomItem.createTime, roomItem.mapId, roomItem.mapName);
			}
		}
		if (roomItem.status !== "active" && roomItem.status !== "grace" && roomItem.statusUpdatedAt + closedSessionRetentionMs < now) {
			roomMap.delete(room[0]);
		}
	});
}, 2000);

roomRouter.get("/join", async (req, res, next) => {
	const { roomId } = req.query as { roomId: string; hostName: string; hostId: string };

	// 尝试解析 JWT 获取 userId，用于生成 TURN 凭证（游客模式无 token 则跳过）
	let userId: string | undefined;
	const token = req.headers.authorization;
	if (token) {
		try {
			const tokenInfo = verToken(token);
			if (tokenInfo) userId = tokenInfo.userId;
		} catch {
			// token 无效时静默忽略，不阻断加入房间流程
		}
	}
	const iceServers = generateIceServers(userId);
	console.log(`[room-router] /join roomId=${roomId} userId=${userId || "guest"} iceServers=${JSON.stringify(iceServers.map(s => s.urls))}`);

	if (roomId && roomId.length < 13) {
		if (roomMap.has(roomId)) {
			const room = roomMap.get(roomId);
			if (room && room.status !== "active" && room.status !== "grace") {
				res.status(410).json({ status: 410, msg: room.status === "closed" ? "房间已关闭" : "房间已过期", data: { status: room.status } });
				return;
			}
			if (room && room.hostPeerId !== null) {
				const resMsg: ResInterface = {
					status: 200,
					data: { hostPeerId: room.hostPeerId, needCreate: false, iceServers, hostEpoch: room.hostEpoch, heartbeatIntervalMs: heartbeatSuggestedIntervalMs },
				};
				res.status(resMsg.status).json(resMsg);
			} else {
				const resMsg: ResInterface = {
					status: 202,
					msg: "服务器正在与房主建立联系, 请稍后重试...",
				};
				res.status(resMsg.status).json(resMsg);
			}
		} else {
			//创建房间s
			roomMap.set(roomId, {
				roomId,
				hostName: "",
				hostId: "",
				hostPeerId: null,
				createTime: Date.now(),
				deleteTime: Date.now() + heartContinuationTimeMs,
				lastHeartTime: Date.now(),
				isPrivate: true,
				isStarted: false,
				mapId: null,
				mapName: null,
				status: "active",
				statusUpdatedAt: Date.now(),
				hostLeaseToken: randomUUID(),
				hostEpoch: 0,
			});
			const resMsg: ResInterface = {
				status: 200,
				data: { hostPeerId: "", needCreate: true, deleteIntervalMs: heartContinuationTimeMs, heartbeatIntervalMs: heartbeatSuggestedIntervalMs, iceServers, hostLeaseToken: roomMap.get(roomId)!.hostLeaseToken, hostEpoch: 0 },
			};
			res.status(resMsg.status).json(resMsg);
		}
	} else {
		const resMsg: ResInterface = {
			status: 400,
			msg: "RoomId不符合标准",
		};
		res.status(resMsg.status).json(resMsg);
	}
});

roomRouter.post("/emit-host", async (req, res, next) => {
	const { roomId, hostPeerId, hostName, hostId, hostLeaseToken } = req.body as {
		roomId: string;
		hostPeerId: string;
		hostName: string;
		hostId: string;
		hostLeaseToken: string;
	};
	if (roomId && hostPeerId && hostName && hostId) {
		if (roomMap.has(roomId)) {
			// roomMap.set(roomId, { roomId,hostPeerId, deleteTime: Date.now() + heartContinuationTimeMs });
			const item = roomMap.get(roomId) as RoomMapItem;
			if ((item.status !== "active" && item.status !== "grace") || item.hostLeaseToken !== hostLeaseToken) {
				res.status(409).json({ status: 409, msg: "房主租约无效" });
				return;
			}
			item.hostPeerId = hostPeerId;
			item.hostEpoch++;
			item.hostName = hostName;
			item.hostId = hostId;
			item.status = "active";
			item.statusUpdatedAt = Date.now();
			item.deleteTime = Date.now() + heartContinuationTimeMs;

			const resMsg: ResInterface = {
				status: 200,
				data: { hostEpoch: item.hostEpoch },
			};
			res.status(resMsg.status).json(resMsg);
		} else {
			const resMsg: ResInterface = {
				status: 400,
				msg: "RoomId不存在",
			};
			res.status(resMsg.status).json(resMsg);
		}
	} else {
		const resMsg: ResInterface = {
			status: 400,
			msg: "RoomId不符合标准",
		};
		res.status(resMsg.status).json(resMsg);
	}
});

roomRouter.post("/delete", async (req, res) => {
	const { roomId, hostLeaseToken } = req.query as { roomId: string; hostLeaseToken?: string };
	const room = roomMap.get(roomId);
	if (!room) { res.status(200).json({ status: 200 }); return; }
	if (room.hostLeaseToken !== hostLeaseToken) { res.status(409).json({ status: 409, msg: "房主租约无效" }); return; }
	room.status = "closed";
	room.statusUpdatedAt = Date.now();
	room.hostPeerId = null;
	res.status(200).json({ status: 200 });
});

/**
 * 房主夺回房间：当房间因租约到期进入 grace/expired（或服务端重启导致注册丢失）后，
 * 原房主用旧 token 重新激活房间并签发新租约 token，避免"游戏在跑但房间注册永久死亡"。
 */
roomRouter.post("/reclaim-host", async (req, res) => {
	const { roomId, hostPeerId, hostName, hostId, hostLeaseToken } = req.body as {
		roomId: string;
		hostPeerId: string;
		hostName: string;
		hostId: string;
		hostLeaseToken: string;
	};
	if (!roomId || !hostPeerId || !hostName || !hostId) {
		res.status(400).json({ status: 400, msg: "参数不完整" });
		return;
	}
	const now = Date.now();
	const room = roomMap.get(roomId);
	if (!room) {
		// 服务端重启会清空内存注册表，已无法验证旧 token；恢复后的房间保守地设为私有且已开局，
		// 避免在公开大厅/随机匹配中暴露一个正在恢复中的对局。
		const newHostLeaseToken = randomUUID();
		roomMap.set(roomId, {
			roomId,
			hostPeerId,
			deleteTime: now + heartContinuationTimeMs,
			createTime: now,
			hostName,
			hostId,
			lastHeartTime: now,
			isPrivate: true,
			isStarted: true,
			mapId: null,
			mapName: null,
			status: "active",
			statusUpdatedAt: now,
			hostLeaseToken: newHostLeaseToken,
			hostEpoch: 1,
		});
		res.status(200).json({ status: 200, data: { hostLeaseToken: newHostLeaseToken, hostEpoch: 1 } });
		return;
	}
	if (room.status === "closed") {
		// 房主主动关闭的房间不能被延迟到达的心跳请求重新激活。
		res.status(410).json({ status: 410, msg: "房间已关闭" });
		return;
	}
	if (room.status === "active") {
		res.status(400).json({ status: 400, msg: "房间仍处于活跃状态，无需夺回" });
		return;
	}
	// 校验旧 token，防止陌生人劫持房间
	if (room.hostLeaseToken !== hostLeaseToken) {
		res.status(409).json({ status: 409, msg: "房主租约无效" });
		return;
	}
	// 夺回：签发新 token 并恢复 active
	room.hostLeaseToken = randomUUID();
	room.hostPeerId = hostPeerId;
	room.hostName = hostName;
	room.hostId = hostId;
	room.hostEpoch++;
	room.status = "active";
	room.statusUpdatedAt = now;
	room.deleteTime = now + heartContinuationTimeMs;
	room.lastHeartTime = now;
	res.status(200).json({ status: 200, data: { hostLeaseToken: room.hostLeaseToken, hostEpoch: room.hostEpoch } });
});

roomRouter.get("/status", async (req, res) => {
	const { roomId } = req.query as { roomId: string };
	const room = roomMap.get(roomId);
	if (!room) { res.status(200).json({ status: 200, data: { status: "expired", hostEpoch: 0 } }); return; }
	res.status(200).json({ status: 200, data: { status: room.status, hostEpoch: room.hostEpoch } });
});

roomRouter.get("/heart", async (req, res) => {
	const { roomId, hostLeaseToken } = req.query as { roomId: string; hostLeaseToken?: string };
	const room = roomMap.get(roomId);
	if (!room || (room.status !== "active" && room.status !== "grace") || room.hostLeaseToken !== hostLeaseToken) {
		res.status(409).json({ status: 409, msg: "房主租约无效" });
		return;
	}
	const now = Date.now();
	room.deleteTime = now + heartContinuationTimeMs;
	room.lastHeartTime = now;
	room.status = "active"; // 宽限期内心跳成功，恢复活跃
	room.statusUpdatedAt = now;
	res.status(200).end();
});

roomRouter.get("/room-list", async (req, res, next) => {
	res.status(200).json({
		// 只返回仍处于活跃状态且房主已就绪的房间，避免已关闭/已过期房间出现在列表中
		data: Array.from(roomMap.values())
			.filter((r) => r.status === "active" && r.hostPeerId !== null)
			.map((r) => {
				return <RoomMapItem>{
					...r,
					hostPeerId: null,
				};
			}),
	});
});

roomRouter.get("/random-public-room", async (req, res, next) => {
	// 只抽"公开、未开局、租约有效、房主 Peer 已就绪"的房间，避免抽中已关闭/已过期/未绑定房间
	const roomArr = Array.from(roomMap.values()).filter(
		(r) => r.status === "active" && !r.isPrivate && !r.isStarted && r.hostPeerId !== null,
	);

	if (roomArr.length > 0) {
		function getRandomElement<T>(arr: Array<T>) {
			const randomIndex = Math.floor(Math.random() * arr.length);
			return arr[randomIndex];
		}
		res.status(200).json({ roomId: getRandomElement(roomArr).roomId });
	} else {
		res.status(200).json({ roomId: "" });
	}
});

roomRouter.post("/set-private", async (req, res, next) => {
	const { roomId, isPrivate } = req.body as { roomId: string; isPrivate: boolean };
	const room = roomMap.get(roomId);
	if (room) {
		room.isPrivate = isPrivate;
		res.status(200).json(<ResInterface>{
			status: 200,
			msg: room.isPrivate ? "现在房间只能通过输入ID进入啦" : "已将房间公开",
			data: { roomId: roomId, isPrivate: room.isPrivate },
		});
	} else {
		res.status(400).json(<ResInterface>{ status: 400, msg: "不存在的房间" });
	}
});

roomRouter.post("/set-started", async (req, res, next) => {
	const { roomId, isStarted, mapId, mapName } = req.body as {
		roomId: string;
		isStarted: boolean;
		mapId?: string | null;
		mapName?: string | null;
	};
	const room = roomMap.get(roomId);
	if (room) {
		room.isStarted = isStarted;
		if (isStarted) {
			room.mapId = mapId ?? null;
			room.mapName = mapName ?? null;
		}
		res.status(200).json(<ResInterface>{
			status: 200,
		});
	} else {
		res.status(400).json(<ResInterface>{ status: 400, msg: "不存在的房间" });
	}
});

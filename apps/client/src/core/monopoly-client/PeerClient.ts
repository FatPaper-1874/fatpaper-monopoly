import { useLoading, useUtil } from "@src/store";
import { __ICE_SERVER_PATH__, __ICE_USE_PREFIX__, __FATPAPER_HOST__ } from "@src/../global.config";
import Peer, { DataConnection } from "peerjs";
import { connectionDiagnostics } from "@src/utils/connection-diagnostics";

export class PeerClient {
	private peer: Peer;
	private conn: DataConnection | null = null;
	private rtcConfig: RTCConfiguration;

	private constructor(peer: Peer, rtcConfig: RTCConfiguration) {
		this.peer = peer;
		this.rtcConfig = rtcConfig;
	}

	public async linkToHost(hostId: string) {
		if (!hostId) throw new Error("无效的主机ID");
		if (this.conn) {
			this.conn.close();
			this.conn = null;
		}

		connectionDiagnostics.stageStart("DataConnection");

		// 监听 ICE 连接状态（尝试访问底层 RTCPeerConnection）
		this.monitorIceState();

		const conn = await new Promise<DataConnection>((resolve, reject) => {
			const timeOutId = setTimeout(() => {
				const reason = "连接主机超时 (10s)";
				connectionDiagnostics.stageFail("DataConnection", reason, {
					hostId,
					peerId: this.peer.id,
					iceConnectionState: this.getIceConnectionState(),
				});
				connectionDiagnostics.checkRelayCandidates();
				reject(reason + ", 连不上主机捏😣");
			}, 10000);

			const conn = this.peer.connect(hostId, {
				reliable: true,
			});

			conn.on("open", () => {
				clearTimeout(timeOutId);
				connectionDiagnostics.stageEnd("DataConnection", {
					hostId,
					peerId: this.peer.id,
					connectionId: conn.connectionId,
				});
				// 兜底：本地连接可能跳过 ICE 流程
				if (useUtil().connectionMode === "unknown") {
					useUtil().connectionMode = this.rtcConfig.iceTransportPolicy === "relay" ? "relay" : "p2p";
				}
				resolve(conn);
			});

			conn.on("error", (e) => {
				clearTimeout(timeOutId);
				connectionDiagnostics.stageFail("DataConnection", `连接错误: ${e.message || e}`, {
					hostId,
					peerId: this.peer.id,
					errorType: e.type || "unknown",
				});
				reject(e);
			});

			// 监听 DataConnection 的 ICE 状态
			this.patchDataConnectionForIceLogging(conn);
		});

		this.conn = conn;
		return { conn: this.conn, peer: this.peer };
	}

	public static async create(host: string, port: number, rtcConfig: RTCConfiguration) {
		connectionDiagnostics.stageStart("SignalingConnect");
		connectionDiagnostics.setIceServers(rtcConfig.iceServers || []);
		connectionDiagnostics.setSignalingInfo(
			__ICE_USE_PREFIX__ ? `${__FATPAPER_HOST__}${__ICE_SERVER_PATH__}` : `${host}:${port}`,
			!!__ICE_USE_PREFIX__,
		);
		connectionDiagnostics.captureNetworkInfo();
		// 检测本地网络接口（不阻塞主流程）
		connectionDiagnostics.detectLocalInterfaces();

		// 向 PeerJS 信令服务器获取自己的 peerId
		const peer = await new Promise<Peer>((resolve, reject) => {
			const peerOptions = __ICE_USE_PREFIX__
				? {
						host: __FATPAPER_HOST__,
						path: __ICE_SERVER_PATH__,
						secure: true,
						debug: 0,
						config: rtcConfig,
					}
				: { host, port, debug: 0, config: rtcConfig };

			connectionDiagnostics.logPeerEvent("Peer.constructor", JSON.stringify({
				mode: __ICE_USE_PREFIX__ ? "prefix" : "port",
				host: __ICE_USE_PREFIX__ ? __FATPAPER_HOST__ : host,
				path: __ICE_USE_PREFIX__ ? __ICE_SERVER_PATH__ : undefined,
				port: __ICE_USE_PREFIX__ ? undefined : port,
				iceTransportPolicy: rtcConfig.iceTransportPolicy || "all",
			}));

			const peer = new Peer(peerOptions);

			// 注册 PeerJS 生命周期事件
			peer.on("open", (id) => {
				connectionDiagnostics.logPeerEvent("Peer.open", `peerId=${id}`);
				connectionDiagnostics.stageEnd("SignalingConnect", { peerId: id });
				resolve(peer);
			});

			peer.on("error", (e) => {
				connectionDiagnostics.logPeerEvent("Peer.error", `type=${e.type} message=${e.message}`);
				connectionDiagnostics.stageFail("SignalingConnect", `Peer错误: ${e.type} - ${e.message}`);
				reject(e);
			});

			peer.on("disconnected", () => {
				connectionDiagnostics.logPeerEvent("Peer.disconnected", "信令服务器断开连接");
				connectionDiagnostics.warn("PeerJS 信令服务器断开连接 (disconnected)");
			});

			peer.on("close", () => {
				connectionDiagnostics.logPeerEvent("Peer.close", "Peer 连接关闭");
			});

			// 监听 ICE 候选（在 Peer 对象上拦截）
			PeerClient.patchPeerForIceLogging(peer);
		});

		return new PeerClient(peer, rtcConfig);
	}

	/**
	 * 尝试拦截底层 RTCPeerConnection 来记录 ICE 候选
	 */
	private static patchPeerForIceLogging(peer: Peer) {
		try {
			// PeerJS 内部会创建 RTCPeerConnection，我们拦截它的创建
			const origConnect = peer.connect.bind(peer);
			// 这里只是注册一个标记，实际的 patch 在 linkToHost 后进行
		} catch (e) {
			// 静默失败，诊断功能不应影响主流程
		}
	}

	/**
	 * 监控底层 RTCPeerConnection 的 ICE 连接状态
	 */
	private monitorIceState() {
		try {
			// 尝试从 Peer 内部获取 RTCPeerConnection
			const anyPeer = this.peer as any;
			// PeerJS 1.x 内部结构：peer._connections 或 peer._connectionQueue
			const connections = anyPeer._connections || anyPeer.connections || {};
			// 轮询检查（因为 DataConnection 尚未建立）
			let checkCount = 0;
			const interval = setInterval(() => {
				checkCount++;
				if (checkCount > 50) {
					clearInterval(interval);
					return;
				}
				// 遍历所有连接，监控其 RTCPeerConnection
				for (const key of Object.keys(connections)) {
					const conns = connections[key];
					if (Array.isArray(conns)) {
						for (const dc of conns) {
							if (dc.peerConnection) {
								const pc = dc.peerConnection as RTCPeerConnection;
								const state = pc.iceConnectionState;
								connectionDiagnostics.logPeerEvent("ICE.state", state);
								if (state === "failed" || state === "disconnected") {
									connectionDiagnostics.error(`ICE 连接状态: ${state}`);
								}
								// 收集已有 ICE 候选
								PeerClient.logExistingIceCandidates(pc);
								clearInterval(interval);
								return;
							}
						}
					}
				}
			}, 200);
		} catch (e) {
			// 静默失败
		}
	}

	private static logExistingIceCandidates(pc: RTCPeerConnection) {
		try {
			// 拦截原始的 RTCPeerConnection 来过滤 ICE 候选
			let origOnIceCandidate = pc.onicecandidate;
			let hasRelayCandidate = false;

			// 覆盖 onicecandidate 属性以过滤候选
			Object.defineProperty(pc, "onicecandidate", {
				set: (value: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => any) | null) => {
					origOnIceCandidate = value;
				},
				get: () => {
					return (event: RTCPeerConnectionIceEvent) => {
						if (event.candidate) {
							const candidateStr = event.candidate.candidate || "";
							const parts = candidateStr.split(" ");
							const ip = parts[4];

							// 检测是否为 relay (TURN) 候选
							const typeIndex = parts.findIndex((p) => p === "typ");
							const candidateType = typeIndex >= 0 ? parts[typeIndex + 1] : "";
							if (candidateType === "relay") {
								hasRelayCandidate = true;
							}

							// 过滤 WSL/Docker 虚拟网卡候选 (172.27.x.x)
							if (ip && ip.startsWith("172.27.")) {
								// 不调用原始处理函数，该候选被丢弃
								return;
							}

							connectionDiagnostics.logIceCandidate(event.candidate);
						}

						// 调用原始处理函数（PeerJS 内部处理）
						if (origOnIceCandidate) {
							origOnIceCandidate.call(pc, event);
						}
					};
				},
				configurable: true,
			});
			pc.oniceconnectionstatechange = () => {
				connectionDiagnostics.logPeerEvent("ICE.connectionStateChange", pc.iceConnectionState);
				if (pc.iceConnectionState === "failed") {
					connectionDiagnostics.error("ICE 连接失败 — 可能 TURN/STUN 不可达或 NAT 过于严格");
				}
				if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
					// 用 getStats 查询实际选中的候选对类型
					PeerClient.detectActualConnectionMode(pc, hasRelayCandidate);
				}
			};
			pc.onicegatheringstatechange = () => {
				connectionDiagnostics.logPeerEvent("ICE.gatheringState", pc.iceGatheringState);
			};
			pc.onicecandidateerror = (event) => {
				connectionDiagnostics.error(`ICE candidate error: ${event.errorText} (code: ${event.errorCode})`);
			};
		} catch (e) {
			// 静默失败
		}
	}

	/**
	 * 为 DataConnection 打补丁以记录 ICE 日志
	 */
	private patchDataConnectionForIceLogging(conn: DataConnection) {
		try {
			const dc = conn as any;
			if (dc.peerConnection) {
				const pc = dc.peerConnection as RTCPeerConnection;
				PeerClient.logExistingIceCandidates(pc);
			}
		} catch (e) {
			// 静默失败
		}
	}

	/**
	 * 通过 getStats 查询实际选中的候选对类型，确定真实连接模式
	 */
	private static async detectActualConnectionMode(pc: RTCPeerConnection, hasRelayCandidate: boolean) {
		try {
			const stats = await pc.getStats();
			let localCandidateType = "";

			for (const report of stats.values()) {
				if (report.type === "candidate-pair" && report.state === "succeeded") {
					const localCandidate = stats.get(report.localCandidateId);
					if (localCandidate && localCandidate.candidateType) {
						localCandidateType = localCandidate.candidateType;
					}
					break;
				}
			}

			const mode = localCandidateType === "relay" ? "relay" : "p2p";
			useUtil().connectionMode = mode;
		} catch (e) {
			// getStats 失败时回退到 hasRelayCandidate 判断
			const mode = hasRelayCandidate ? "relay" : "p2p";
			useUtil().connectionMode = mode;
		}
	}

	/**
	 * 获取当前 ICE 连接状态
	 */
	private getIceConnectionState(): string {
		try {
			const anyPeer = this.peer as any;
			const connections = anyPeer._connections || anyPeer.connections || {};
			for (const key of Object.keys(connections)) {
				const conns = connections[key];
				if (Array.isArray(conns)) {
					for (const dc of conns) {
						if (dc.peerConnection) {
							return (dc.peerConnection as RTCPeerConnection).iceConnectionState;
						}
					}
				}
			}
		} catch {
			// 静默
		}
		return "unknown";
	}

	public destory() {
		connectionDiagnostics.logPeerEvent("PeerClient.destory", "PeerClient 销毁");
		useUtil().connectionMode = "unknown";
		this.peer.destroy();
		this.conn = null;
	}
}

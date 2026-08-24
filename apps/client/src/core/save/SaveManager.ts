import type { GameMap } from "@mine-monopoly/types";
import { normalizeAndValidateGameMap } from "@src/utils/file/game-map";
import { SaveRecord, SaveSnapshot } from "./types";
import { IndexedDBSaveStorage, ISaveStorage } from "./IndexedDBSaveStorage";
import { randomString } from "@src/utils";

export interface MapPathSnapshotRecoveryResult {
	snapshot: SaveSnapshot;
	warnings: string[];
}

/**
 * 为旧存档补齐 MapPath V2 位置字段。
 * 仅迁移缺失的 positionMapItemId；已经写入的 V2 运行时状态及待选路径请求保持原样。
 */
export function recoverMapPathSnapshot(snapshot: SaveSnapshot, map: GameMap): MapPathSnapshotRecoveryResult {
	const normalizedMap = normalizeAndValidateGameMap(map);
	const warnings: string[] = [];
	const startMapItemId = normalizedMap.startMapItemId!;
	const validMapItemIds = new Set(normalizedMap.mapItems.map((item) => item.id));
	const legacyMapIndex = normalizedMap.mapIndex ?? [];
	const playerSnapshots: SaveSnapshot["playerSnapshots"] = {};

	for (const [playerId, playerSnapshot] of Object.entries(snapshot.playerSnapshots)) {
		let positionMapItemId = playerSnapshot.positionMapItemId;
		if (positionMapItemId && !validMapItemIds.has(positionMapItemId)) {
			warnings.push(
				`玩家 ${playerId} 的 positionMapItemId \"${positionMapItemId}\" 不存在，已回退至起点 \"${startMapItemId}\"`,
			);
			positionMapItemId = undefined;
		}
		if (!positionMapItemId) {
			const legacyPosition = playerSnapshot.positionIndex;
			const legacyMapItemId = Number.isInteger(legacyPosition) ? legacyMapIndex[legacyPosition] : undefined;
			if (legacyMapItemId && validMapItemIds.has(legacyMapItemId)) {
				positionMapItemId = legacyMapItemId;
			} else {
				warnings.push(
					`玩家 ${playerId} 无法由 positionIndex \"${String(legacyPosition)}\" 恢复地图项位置，已回退至起点 \"${startMapItemId}\"`,
				);
				positionMapItemId = startMapItemId;
			}
		}
		playerSnapshots[playerId] = { ...playerSnapshot, positionMapItemId };
	}

	return {
		snapshot: {
			...snapshot,
			playerSnapshots,
			mapPathRuntimeState: snapshot.mapPathRuntimeState
				? {
					...snapshot.mapPathRuntimeState,
					enabledPathIds: [...snapshot.mapPathRuntimeState.enabledPathIds],
					pendingChoice: snapshot.mapPathRuntimeState.pendingChoice
						? {
							...snapshot.mapPathRuntimeState.pendingChoice,
							candidates: snapshot.mapPathRuntimeState.pendingChoice.candidates.map((candidate) => ({ ...candidate })),
						}
						: undefined,
				}
				: undefined,
		},
		warnings,
	};
}

export class SaveManager {
	private storage: ISaveStorage;

	constructor(storage?: ISaveStorage) {
		this.storage = storage ?? new IndexedDBSaveStorage();
	}

	/**
	 * 保存快照到 IndexedDB。MapPath V2 字段为加法式字段，因此 IndexedDB 无需升级。
	 */
	async save(
		snapshot: SaveSnapshot,
		mapId: string,
		mapVersion: string,
		mapName: string,
		playerNames: string[],
	): Promise<SaveRecord> {
		const existingRecords = await this.storage.listByMap(mapId, mapVersion);
		const latest = existingRecords.length > 0 ? existingRecords[existingRecords.length - 1] : null;
		const userIds = Object.keys(snapshot.playerSnapshots);

		const record: SaveRecord = {
			id: randomString(16),
			mapId,
			mapVersion,
			mapName,
			saveTime: Date.now(),
			round: snapshot.currentRound,
			playerCount: userIds.length,
			playerUserIds: userIds,
			playerNames,
			snapshot,
			previousSnapshot: latest?.snapshot,
		};

		await this.storage.save(record);
		return record;
	}

	/** 查询全部本地存档 */
	async list(): Promise<SaveRecord[]> {
		return this.storage.list();
	}

	/** 按地图查询存档列表 */
	async listByMap(mapId: string, mapVersion: string): Promise<SaveRecord[]> {
		return this.storage.listByMap(mapId, mapVersion);
	}

	/** 读取指定存档 */
	async load(id: string): Promise<SaveRecord | null> {
		return this.storage.load(id);
	}

	/**
	 * 读取并按当前地图迁移存档。Room 在将 snapshot 发送给 Worker 前应调用此方法，
	 * 并将 warnings 记录到恢复日志；本次范围不修改 Room/Worker。
	 */
	async loadForMap(id: string, map: GameMap): Promise<{ record: SaveRecord; warnings: string[] } | null> {
		const record = await this.load(id);
		if (!record) return null;
		const recovered = recoverMapPathSnapshot(record.snapshot, map);
		return {
			record: {
				...record,
				snapshot: recovered.snapshot,
				previousSnapshot: record.previousSnapshot
					? recoverMapPathSnapshot(record.previousSnapshot, map).snapshot
					: undefined,
			},
			warnings: recovered.warnings,
		};
	}

	/** 删除存档 */
	async delete(id: string): Promise<void> {
		return this.storage.delete(id);
	}

	/** 校验玩家身份 */
	validatePlayers(
		record: SaveRecord,
		roomUserIds: string[],
	): { valid: boolean; aiPlayerIds: string[]; error?: string } {
		const saveUserIds = record.playerUserIds;

		for (const roomUserId of roomUserIds) {
			if (!saveUserIds.includes(roomUserId)) {
				return {
					valid: false,
					aiPlayerIds: [],
					error: `玩家 ${roomUserId} 不属于该存档，无法读取`,
				};
			}
		}

		const aiPlayerIds = saveUserIds.filter((id) => !roomUserIds.includes(id));
		return { valid: true, aiPlayerIds };
	}
}
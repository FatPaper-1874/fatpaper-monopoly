import { defineStore } from "pinia";
import type { LocalPartyPlayer } from "@mine-monopoly/types";
import { useUserInfo } from "@src/store";


export const useLocalParty = defineStore("local-party", {
	state: () => ({
		isActive: false,
		roomId: "",
		players: [] as LocalPartyPlayer[],
		/** 已确认交接、能够操作游戏 UI 的真人 ID。 */
		activePlayerId: "",
		/** 当前游戏回合的玩家 ID，AI 回合也会保留。 */
		currentTurnPlayerId: "",
		/** 正等待交接确认的真人 ID。 */
		handoffPlayerId: "",
		handoffVisible: false,
		/** 是否有等待交接后投递的交互弹窗（对话类消息被切换到目标玩家时置位）。 */
		hasPendingInteraction: false,
		/** 进行中的交互弹窗：timeoutId -> 弹窗目标玩家 ID。 */
		dialogTimeoutOwners: {} as Record<string, string>,
	}),
	getters: {
		activePlayerName: (state) => {
			const playerId = state.handoffPlayerId || state.activePlayerId;
			return state.players.find((player) => player.userId === playerId)?.username || "";
		},
	},
	actions: {
		start(roomId: string, players: LocalPartyPlayer[]) {
			this.isActive = true;
			this.roomId = roomId;
			this.players = players;
			this.activePlayerId = "";
			this.currentTurnPlayerId = "";
			this.handoffPlayerId = "";
			this.handoffVisible = false;
			this.hasPendingInteraction = false;
			this.dialogTimeoutOwners = {};
		},
		setPlayers(players: LocalPartyPlayer[]) {
			this.players = players;
			if (this.activePlayerId && !players.some((player) => player.userId === this.activePlayerId)) {
				this.activePlayerId = "";
			}
			if (this.handoffPlayerId && !players.some((player) => player.userId === this.handoffPlayerId)) {
				this.handoffPlayerId = "";
				this.handoffVisible = false;
			}
		},
		setTurn(playerId: string, isHuman: boolean, forceHandoff = false) {
			const changed = this.currentTurnPlayerId !== playerId;
			this.currentTurnPlayerId = playerId;
			if (!isHuman) {
				// 交互弹窗触发的交接不能被 AI 回合数据清掉，否则弹窗无法交接给目标玩家。
				if (this.hasPendingInteraction) return;
				this.activePlayerId = "";
				this.handoffPlayerId = "";
				this.handoffVisible = false;
				return;
			}
			if (forceHandoff || changed) {
				this.activePlayerId = "";
				this.handoffPlayerId = playerId;
				this.handoffVisible = true;
				return;
			}
			if (!this.handoffVisible && !this.activePlayerId) this.activePlayerId = playerId;
		},
		dismissHandoff() {
			this.activePlayerId = this.handoffPlayerId;
			this.handoffPlayerId = "";
			this.handoffVisible = false;
		},
		reset() {
			this.isActive = false;
			this.roomId = "";
			this.players = [];
			this.activePlayerId = "";
			this.currentTurnPlayerId = "";
			this.handoffPlayerId = "";
			this.handoffVisible = false;
			this.hasPendingInteraction = false;
			this.dialogTimeoutOwners = {};
		},
	},
});

/** 当前控制游戏 UI 的玩家。本地派对在交接确认前及 AI 回合返回空值。 */
export function getCurrentClientPlayerId(): string {
	const localParty = useLocalParty();
	return localParty.isActive ? localParty.activePlayerId : useUserInfo().userId;
}
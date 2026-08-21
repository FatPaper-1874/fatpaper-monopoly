import {
	Buff,
	DiceResult,
	GameContext,
	GamePhaseInfo,
	IChanceCard,
	ICommandBus,
	IDice,
	IGamePhase,
	IGameProcess,
	IBuffManager,
	IModifierManager,
	IPlayer,
	IProperty,
	MoneyTagType,
	MapMoveDirection,
	PlayerCommandMap,
	PlayerInfo,
	Role,
	UISchema,
	UserInRoomInfo,
} from "@mine-monopoly/types";
import { GamePhase } from "./GamePhase";
import { compileTsToJs, randomString } from "@src/utils";
import GameProcessTypes from "../editor-lib.d.ts?raw";
import { CommandBus } from "./action-system/CommandBus";
import { BuffManager } from "./action-system/BuffManager";
import { ModifierManager } from "./action-system/ModifiersManager";
import Dice from "./Dice";
import { clone } from "lodash";

import type { PlayerSnapshot } from "@src/core/save/types";
import { ChanceCard } from "./ChanceCard";
import { pickSerializableFields } from "../utils/serialize";

export interface MapMovementHistoryEntry {
	pathId: string;
	fromMapItemId: string;
	toMapItemId: string;
	direction: MapMoveDirection;
}

export class Player implements IPlayer {
	public id: string;
	public name: string;
	public roleId: string;
	public money: number;
	public properties: IProperty[] = [];
	public chanceCards: IChanceCard[] = [];
	/** @deprecated 仅用于旧 effectCode、旧存档和线性地图兼容；图移动以 positionMapItemId 为准。 */
	public positionIndex: number;
	/** 玩家当前位置的唯一运行时真相。 */
	public positionMapItemId?: string;
	/** 尚未被回退的实际行走轨迹，同时用于分岔选择和 walk(-n)。 */
	public movementHistory: MapMovementHistoryEntry[] = [];
	/** 刚从该节点退回当前位置时设置；用于在路口排除死路和进入分支前的来路。 */
	public returnFromMapItemId?: string;
	public isStop: number; //是否停止回合
	public isBankrupted: boolean = false; //是否破产
	public isOffline: boolean; //是否断线
	public isAI: boolean = false; //是否为AI托管
	private aiThinkingRequestCount: number = 0;
	public stop: number = 0;
	public infoDisplay: UISchema;

	public roundPhases: IGamePhase<GameContext>[] = [];
	public modifierManager: IModifierManager<PlayerCommandMap>;
	public buffManager: IBuffManager;
	public commandBus: ICommandBus<PlayerCommandMap>;
	public dices: IDice[];

	private user: UserInRoomInfo;
	private roleInitFunction: (player: IPlayer, gameProcess: IGameProcess) => void;
	private bankruptcyHandler?: (player: Player) => Promise<void>;

	constructor(
		user: UserInRoomInfo,
		initMoney: number,
		initPositionIndex: number,
		roundPhasesInfo: GamePhaseInfo[],
		role: Role,
		extraLibs?: string,
		initPositionMapItemId?: string,
	) {
		this.roundPhases = roundPhasesInfo.map((roundPhaseInfo) => {
			return new GamePhase(roundPhaseInfo, undefined, extraLibs);
		});
		this.user = user;
		this.id = user.userId;
		this.name = user.username;
		this.roleId = user.roleId;
		this.money = initMoney;
		this.positionIndex = initPositionIndex;
		this.positionMapItemId = initPositionMapItemId;
		this.isStop = 0;
		this.isOffline = false;
		this.dices = [new Dice(), new Dice()];
		this.infoDisplay = {
			id: `info-${this.id}`,
			type: "div",
			style: {
				flex: "1",
				display: "flex",
				flexDirection: "column",
				textAlign: "center",
				borderRadius: "1.4em",
				padding: "0.3em 0.5em",
			},
			children: [
				{
					id: "username-text",
					type: "text",
					textBinding: "player.user.username",
				},
				{
					id: "money-container",
					type: "div",
					children: [
						{
							id: "money-tag",
							type: "text",
							content: "￥",
						},
						{
							id: "money-text",
							type: "text",
							textBinding: "player.money",
						},
					],
				},
			],
		};

		this.modifierManager = new ModifierManager();
		(this.modifierManager as any).setOwner(this);
		this.buffManager = new BuffManager();
		this.commandBus = new CommandBus<PlayerCommandMap>(this.modifierManager);
		this.initCommandBus();

		const fullTypes = extraLibs ? `${GameProcessTypes}\n${extraLibs}` : GameProcessTypes;
		try {
			const codeCompiled = compileTsToJs(role.initCode, fullTypes);
			this.roleInitFunction = new Function(codeCompiled)();
		} catch (e: any) {
			const error = new Error(`角色代码编译失败 (${role.name}): ${e.message}`);
			error.stack = e.stack;
			throw error;
		}
	}

	public getInitRoleFunction() {
		return this.roleInitFunction;
	}

	private initCommandBus() {
		this.commandBus.setHandler("player.property.gain", (payload) => {
			const { property } = payload;
			const owner = property.owner;
			if (owner && owner.id === this.id) this.properties.push(property);
			return payload;
		});

		this.commandBus.setHandler("player.property.lose", (payload) => {
			const { property } = payload;
			const index = this.properties.findIndex((p) => p.id === property.id);
			if (index != -1) {
				this.properties.splice(index, 1);
			}
			return payload;
		});

		this.commandBus.setHandler("player.card.gain", (payload) => {
			const { card } = payload;
			if (this.chanceCards.length >= 4) return payload;
			this.chanceCards.push(card);
			return payload;
		});

		this.commandBus.setHandler("player.card.lose", (payload) => {
			const { cardId } = payload;
			let card = this.chanceCards.find((card) => card.getId() === cardId);
			if (!card) throw Error("玩家没有这张机会卡");
			const index = this.chanceCards.findIndex((_card) => _card.getId() === card.getId());
			if (index != -1) {
				this.chanceCards.splice(index, 1);
			}
			return payload;
		});

		this.commandBus.setHandler("player.money.gain", (payload) => {
			const { money } = payload;
			this.money += money;
			return payload;
		});

		this.commandBus.setHandler("player.money.lose", async (payload) => {
			const { money } = payload;
			const moneyToLose = money > 0 ? money : 0;
			const success = this.money >= moneyToLose;
			const actualCost = success ? moneyToLose : this.money;
			this.money -= actualCost;
			if (this.money <= 0) await this.markBankrupted();
			return {
				...payload,
				success,
				actualCost,
				remainingMoney: this.money,
			};
		});

		this.commandBus.setHandler("player.stop", (payload) => {
			const { stop } = payload;
			this.stop = stop;
			return payload;
		});

		this.commandBus.setHandler("player.bankrupted.set", async (payload) => {
			const { bankrupted } = payload;
			if (bankrupted) {
				await this.markBankrupted();
			} else {
				this.isBankrupted = false;
			}
			return payload;
		});

		this.commandBus.setHandler("player.dice.add", (payload) => {
			const { newDice } = payload;
			this.dices.push(newDice);
			return { newDice };
		});

		this.commandBus.setHandler("player.dice.remove", (payload) => {
			const { diceId } = payload;
			const idx = this.dices.findIndex((d) => d.id === diceId);
			if (idx !== -1) {
				const [removeDice] = this.dices.splice(idx, 1);
				return { removeDice };
			}
			return { removeDice: undefined };
		});
	}

	//getter 和 setter
	public getUser() {
		return this.user;
	}

	public setIsOffline(isOffline: boolean) {
		this.isOffline = isOffline;
	}

	public async setCardsList(newChanceCardList: IChanceCard[]) {
		this.chanceCards = newChanceCardList;
	}

	public setPropertiesList(newPropertiesList: IProperty[]) {
		this.properties = newPropertiesList;
	}

	public async setMoney(money: number) {
		this.money = money;
		if (this.money <= 0) await this.markBankrupted();
	}

	public setBankruptcyHandler(handler: (player: Player) => Promise<void>) {
		this.bankruptcyHandler = handler;
	}

	public async setStop(stop: number) {
		this.isStop = stop;
	}

	public setPositionIndex(newPositionIndex: number) {
		this.positionIndex = newPositionIndex;
	}

	public setPositionMapItemId(mapItemId: string) {
		this.positionMapItemId = mapItemId;
	}

	public resetMapNavigation() {
		this.movementHistory = [];
		this.returnFromMapItemId = undefined;
	}

	public recordMapMovement(entry: MapMovementHistoryEntry) {
		this.movementHistory.push(entry);
	}

	public getLastMovementHistoryEntry(): MapMovementHistoryEntry | undefined {
		return this.movementHistory[this.movementHistory.length - 1];
	}

	public popLastMovementHistoryEntry(): MapMovementHistoryEntry | undefined {
		return this.movementHistory.pop();
	}

	public setBankrupted(isBankrupted: boolean) {
		const becameBankrupted = isBankrupted && !this.isBankrupted;
		this.isBankrupted = isBankrupted;
		if (becameBankrupted) {
			void this.bankruptcyHandler?.(this).catch((error) => {
				console.error(`玩家 ${this.name} 破产清算失败:`, error);
			});
		}
	}

	private async markBankrupted() {
		if (this.isBankrupted) return;
		this.isBankrupted = true;
		await this.bankruptcyHandler?.(this);
	}

	public getBuff(): Buff[] {
		return [
			...this.modifierManager.getBuffs(),
			...this.buffManager.getBuffs(),
		];
	}

	public isAIThinking(): boolean {
		return this.aiThinkingRequestCount > 0;
	}

	public beginAIThinking(): boolean {
		const wasThinking = this.isAIThinking();
		this.aiThinkingRequestCount += 1;
		return !wasThinking;
	}

	public endAIThinking(): boolean {
		const wasThinking = this.isAIThinking();
		this.aiThinkingRequestCount = Math.max(0, this.aiThinkingRequestCount - 1);
		return wasThinking && !this.isAIThinking();
	}

	public getCardById(id: string) {
		const index = this.chanceCards.findIndex((card) => card.getId() === id);
		return this.chanceCards[index] || undefined;
	}

	public getRoundPhases() {
		return this.roundPhases;
	}

	public getPlayerInfo(): PlayerInfo & Record<string, any> {
		const userInfo = this.user;
		const excludeKeys = new Set([
			"modifierManager", "buffManager", "commandBus", "roundPhases",
			"id", "user", "dices", "money", "properties", "chanceCards",
			"positionIndex", "positionMapItemId", "isStop", "stop", "isBankrupted", "isOffline",
			"isAI", "isThinking", "infoDisplay",
			"name", "roleId",
			"aiThinkingRequestCount",
			"movementHistory", "returnFromMapItemId",
			"exportData",
		]);

		const playerInfo: PlayerInfo & Record<string, any> = {
			id: this.user.userId,
			user: userInfo,
			dices: this.dices.map((d) => d.getInfo()),
			money: this.money,
			properties: this.properties.map((property) => property.getPropertyInfo()),
			chanceCards: this.chanceCards.map((card) => card.getChanceCardInfo()),
			buff: this.getBuff(),
			positionIndex: this.positionIndex,
			positionMapItemId: this.positionMapItemId,
			stop: this.isStop,
			isBankrupted: this.isBankrupted,
			isOffline: this.isOffline,
			isAI: this.isAI,
			isThinking: this.isAIThinking(),
			infoDisplay: this.infoDisplay,
			...pickSerializableFields(this, excludeKeys),
		};

		return playerInfo;
	}

	//游戏Action
	public async gainProperty(property: IProperty) {
		await this.commandBus.execute({ type: "player.property.gain", payload: { property } });
	}

	public async loseProperty(property: IProperty) {
		await this.commandBus.execute({ type: "player.property.lose", payload: { property } });
	}

	public async gainCard(card: IChanceCard) {
		await this.commandBus.execute({ type: "player.card.gain", payload: { card } });
	}

	public async loseCard(cardId: string) {
		await this.commandBus.execute({ type: "player.card.lose", payload: { cardId } });
	}

	public async gain(money: number, tag?: MoneyTagType, source?: IPlayer) {
		return await this.commandBus.execute({ type: "player.money.gain", payload: { money, source, tag } });
	}

	public async cost(money: number, tag?: MoneyTagType, target?: IPlayer) {
		return await this.commandBus.execute({ type: "player.money.lose", payload: { money, target, tag } });
	}

	public async bankrupted(isBankrupted: boolean) {
		await this.commandBus.execute({ type: "player.bankrupted.set", payload: { bankrupted: isBankrupted } });
	}

	public async walk(steps: number): Promise<void> {
		await this.commandBus.execute({ type: "player.walk", payload: { steps } });
	}

	/** @deprecated 仅保留旧线性地图和 effectCode 兼容。 */
	public async tp(positionIndex: number): Promise<void> {
		await this.commandBus.execute({ type: "player.tp", payload: { positionIndex } });
	}

	public async tpToMapItem(mapItemId: string): Promise<void> {
		await this.commandBus.execute({ type: "player.tp.map-item", payload: { mapItemId } });
	}

	public async rollDices(): Promise<DiceResult[]> {
		return (await this.commandBus.execute({ type: "player.dice.roll", payload: { dices: clone(this.dices) } }))
			.diceResult;
	}

	public async addDice(diceValue?: number[]) {
		return (await this.commandBus.execute({ type: "player.dice.add", payload: { newDice: new Dice(diceValue) } }))
			.newDice;
	}

	public async removeDice(id: string) {
		return (await this.commandBus.execute({ type: "player.dice.remove", payload: { diceId: id } })).removeDice;
	}

	private static readonly SNAPSHOT_EXCLUDE_KEYS = new Set([
		"modifierManager", "buffManager", "commandBus", "roundPhases",
		"infoDisplay", "user", "roleInitFunction",
		"properties", "chanceCards",
		"dices", "stop", "aiThinkingRequestCount",
		"exportData",
	]);

	private collectSerializableFields(): Record<string, any> {
		return pickSerializableFields(this, Player.SNAPSHOT_EXCLUDE_KEYS, { deep: true });
	}

	public getSnapshot(): PlayerSnapshot {
		const snapshot: any = {
			...this.collectSerializableFields(),
			stop: this.isStop,
			dices: this.dices.map(d => d.getInfo()),
			chanceCards: this.chanceCards.map(card => ({
				instanceId: card.getId(),
				sourceId: card.getSourceId(),
			})),
			buffs: this.buffManager.getBuffs(),
			modifiers: this.modifierManager.getSerializableModifiers(),
		};
		return snapshot as PlayerSnapshot;
	}

	private static readonly RESTORE_SPECIAL_KEYS = new Set([
		// 已知由专门逻辑处理的字段
		"dices", "chanceCards", "buffs", "modifiers", "stop",
		// 排除列表中的不可序列化字段
		"modifierManager", "buffManager", "commandBus", "roundPhases",
		"infoDisplay", "user", "roleInitFunction", "properties",
		"exportData",
	]);

	public restoreFromSnapshot(snapshot: PlayerSnapshot, gameProcess: IGameProcess): void {
		this.aiThinkingRequestCount = 0;

		// 通用恢复：遍历快照中所有字段，跳过由专门逻辑处理的
		for (const key of Object.keys(snapshot)) {
			if (Player.RESTORE_SPECIAL_KEYS.has(key)) continue;
			if (typeof (this as any)[key] === "function") continue;
			try {
				(this as any)[key] = (snapshot as any)[key];
			} catch {
				// 只读属性等跳过
			}
		}

		// 兼容旧存档格式：将 exportData 桶展开为实例直接属性
		const legacyExportData = (snapshot as any).exportData;
		if (legacyExportData && typeof legacyExportData === "object") {
			for (const [key, value] of Object.entries(legacyExportData)) {
				if (typeof (this as any)[key] === "function") continue;
				try { (this as any)[key] = value; } catch { /* skip */ }
			}
		}

		// stop 字段映射到 isStop
		this.isStop = snapshot.stop;

		// 兼容旧存档：缺少位置 ID 时按旧线性索引回填；无效索引再回退地图起点。
		if (!this.positionMapItemId) {
			this.positionMapItemId = gameProcess.mapData.mapIndex[this.positionIndex] ?? gameProcess.mapData.startMapItemId;
		}

		const lastMovement = this.getLastMovementHistoryEntry();
		if (lastMovement && lastMovement.toMapItemId !== this.positionMapItemId) {
			console.warn("[MapPath] 存档中的导航轨迹与当前位置不一致，已重置导航状态", {
				playerId: this.id,
				positionMapItemId: this.positionMapItemId,
				lastMovement,
			});
			this.resetMapNavigation();
		}

		// 同步 roleId 到 user 对象（客户端通过 PlayerInfo.user.roleId 渲染角色模型）
		// 直接使用快照中的 roleId，避免被 backward compat 或其他逻辑覆盖
		// 注意：由于现在在 initPlayers 中创建玩家时就使用了正确的 roleId，
		// 这里应该只是确保一致性，不应再需要重新编译 roleInitFunction
		const savedRoleId = (snapshot as any).roleId;
		if (savedRoleId) {
			this.roleId = savedRoleId;
			(this.user as any).roleId = savedRoleId;
		}

		// 清空旧属性列表（会在 Property.restoreFromSnapshot 的 setOwner 中重新填充）
		this.properties = [];

		// 骰子重建
		this.dices = snapshot.dices.map(diceInfo => {
			const dice = new Dice(diceInfo.diceValues);
			(dice as any).id = diceInfo.id;
			dice.setProphecy(diceInfo.prophecy);
			return dice;
		});

		// 机会卡从地图模板重建
		this.chanceCards = snapshot.chanceCards
			.map(({ instanceId, sourceId }) => {
				const template = gameProcess.chanceCardInfos?.get(sourceId);
				if (!template) return null;
				const card = new ChanceCard(template);
				(card as any).id = instanceId;
				return card;
			})
			.filter(Boolean) as IChanceCard[];

		// BuffManager 纯数据恢复
		this.buffManager.clear();
		for (const buff of snapshot.buffs) {
			this.buffManager.addBuff(buff);
		}

		// 修饰器恢复 — 新签名: restoreModifiers(snaps, mapData)
		(this.modifierManager as any).restoreModifiers(snapshot.modifiers, gameProcess?.mapData);
	}
}

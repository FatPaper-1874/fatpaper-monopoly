import type {
	AIDecisionConfig,
	AIDecisionMemoryPatch,
	AIDecisionOption,
	AIDecisionProvider,
	AIDecisionRequest,
	AIDecisionSelection,
	AIRemoteLLMConfig,
	AIRemoteLLMProfile,
	AIRemoteLLMProviderKind,
	AIStrategyState,
} from "@mine-monopoly/types";
import { recordAIRemoteUsage } from "./remote-usage-stats";

type OpenAIChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: string | Array<{ type?: string; text?: string }>;
		};
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		input_tokens?: number;
		output_tokens?: number;
	};
};

type AnthropicMessagesResponse = {
	content?: Array<{ type?: string; text?: string }>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
	};
};

type RemoteUsage = {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
};

const SYSTEM_PROMPT =
	"你是大富翁游戏 AI 决策器。只能基于给定 options 做选择。返回 JSON 对象，不要输出额外文本。优先返回 optionId；多选时返回 optionIds；表单场景如果决定提交，返回 optionId:\"__submit__\"、submitted:true，并尽量填写 fieldValues；如果放弃，返回 optionId:\"__cancel__\"、submitted:false。若请求里带有 decisionChain，说明这是一串连续弹窗；除非当前约束显示不可执行，否则后续步骤应延续前一步已做出的决定，不要自相矛盾。你还可以可选返回 memoryPatches 数组，每项只允许包含 scope(kind 取值限于 turn/match/map)、kind(systemPreference/riskRule/timingHeuristic/targetingBias/plan/experienceNote)、summary、confidence、evidence、key、tags、ttlTurns、promoteCandidate。你可以选择不返回 chatMessages；只有当你确实有自然、像玩家会说的话时才返回。若返回 chatMessages，1 条即可，用第一人称、口语化，可以带一点情绪、判断或理由，但不要提模型、提示词、JSON 或接口，也不要直接输出“确认”“取消”“提交”这类按钮词，或任何 id / 技术标识符，优先说具体对象名称、意图和原因。chatMessages 必须是字符串数组，例如 {\"chatMessages\":[\"我先买这个，后手更灵活\"]}，不要返回纯字符串。";

const GENERIC_CHAT_MESSAGES = new Set(["确认", "取消", "提交", "使用", "继续", "选择", "选项", "目标"]);
const TECHNICAL_CHAT_MESSAGE_PATTERNS = [
	/__[a-z0-9:_-]+__/i,
	/\b(?:optionid|fieldvalues|confirmdialog|targetselect|itemselect|payload|sourceid|propertyid|playerid|mapitemid)\b/i,
	/\b(?:button|chance-card|property|player|map-item):[a-z0-9_-]+\b/i,
	/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i,
	/机会卡.{0,4}id/i,
	/地皮.{0,4}id/i,
	/玩家.{0,4}id/i,
];

function clipText(text: string | undefined, maxLength: number): string | undefined {
	if (!text) return undefined;
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return undefined;
	return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function looksTechnicalOptionText(text: string | undefined): boolean {
	if (!text) return false;
	const normalized = text.trim();
	if (!normalized) return false;
	if (normalized === "__cancel__" || normalized === "__submit__") {
		return true;
	}
	if (!/^[a-z0-9:_-]+$/i.test(normalized)) {
		return false;
	}
	return (
		/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(normalized) ||
		(/[0-9]/.test(normalized) && /[-_:]/.test(normalized) && normalized.length >= 10) ||
		(/\b(?:id|uuid|option|card|item|target|player|property|button|map)\b/i.test(normalized) && /[-_:]/.test(normalized))
	);
}

function buildReadableDecisionLabel(option: AIDecisionOption): string | undefined {
	const conciseSummary = clipText(option.summary, 28);
	const description = clipText(option.description, 28);
	const label = clipText(option.label, 28);
	if (label && !looksTechnicalOptionText(label)) {
		return label;
	}
	return conciseSummary || description || label;
}

function buildReadableDecisionDescription(option: AIDecisionOption): string | undefined {
	const description = clipText(option.description, 40);
	if (description && !looksTechnicalOptionText(description)) {
		return description;
	}
	return clipText(option.summary, 40) || description;
}

function normalizeProviderKind(provider?: AIRemoteLLMProviderKind): AIRemoteLLMProviderKind {
	return provider ?? "openai-compatible";
}

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, "");
}

function buildOpenAIEndpoint(baseUrl: string): string {
	const normalized = normalizeBaseUrl(baseUrl);
	if (normalized.endsWith("/chat/completions")) {
		return normalized;
	}
	return `${normalized}/chat/completions`;
}

function buildAnthropicEndpoint(baseUrl: string): string {
	const normalized = normalizeBaseUrl(baseUrl);
	if (normalized.endsWith("/v1/messages")) {
		return normalized;
	}
	return `${normalized}/v1/messages`;
}

function pickAvailableOptions(options: AIDecisionOption[]): AIDecisionOption[] {
	return options.filter((option) => !option.hidden && !option.disabled);
}

function summarizeRecentDecisionSummaries(summaries: string[] | undefined) {
	return summaries
		?.map((item) => {
			const normalized = item.replace(/\s+/g, " ").trim();
			if (!normalized) return undefined;
			const lastColon = normalized.lastIndexOf(":");
			if (lastColon < 0) {
				return { title: clipText(normalized, 18) };
			}
			const secondLastColon = normalized.lastIndexOf(":", lastColon - 1);
			if (secondLastColon < 0) {
				return {
					title: clipText(normalized.slice(0, lastColon), 18),
					outcome: clipText(normalized.slice(lastColon + 1), 12),
				};
			}
			return {
				title: clipText(normalized.slice(0, secondLastColon), 18),
				choice: clipText(normalized.slice(secondLastColon + 1, lastColon), 16),
				outcome: clipText(normalized.slice(lastColon + 1), 12),
			};
		})
		.filter(Boolean);
}

function summarizeMemoryEntries(
	entries:
		| Array<{
				scope?: string;
				kind?: string;
				summary?: string;
				confidence?: number;
				hitCount?: number;
			}>
		| undefined,
	maxItems = 3,
): Array<Record<string, unknown>> | undefined {
	const next = (entries || [])
		.map((entry) => {
			const summary = clipText(entry.summary, 36);
			if (!summary) return undefined;
			return {
				scope: entry.scope,
				kind: entry.kind,
				summary,
				confidence: typeof entry.confidence === "number" ? Number(entry.confidence.toFixed(2)) : undefined,
				hitCount: entry.hitCount,
			};
		})
		.filter(Boolean)
		.slice(0, maxItems) as Array<Record<string, unknown>>;
	return next.length > 0 ? next : undefined;
}

function summarizeDecisionChain(request: AIDecisionRequest): Record<string, unknown> | undefined {
	const chain = request.metadata?.chainContext;
	if (typeof chain !== "object" || chain === null) {
		return undefined;
	}
	const data = chain as Record<string, unknown>;
	const previousDecisions = Array.isArray(data.previousDecisions)
		? data.previousDecisions
				.map((item) => {
					if (typeof item !== "object" || item === null) {
						return undefined;
					}
					const step = item as Record<string, unknown>;
					const title = clipText(typeof step.title === "string" ? step.title : undefined, 20);
					const chosen = clipText(typeof step.chosen === "string" ? step.chosen : undefined, 24);
					const summary = clipText(typeof step.summary === "string" ? step.summary : undefined, 40);
					if (!title && !chosen && !summary) {
						return undefined;
					}
					return { title, chosen, summary };
				})
				.filter(Boolean)
		: undefined;
	const guidance = clipText(typeof data.guidance === "string" ? data.guidance : undefined, 72);
	const eventName = clipText(typeof data.eventName === "string" ? data.eventName : undefined, 28);
	if (!previousDecisions?.length && !guidance && !eventName) {
		return undefined;
	}
	return {
		eventName,
		previousDecisions: previousDecisions?.slice(-2),
		guidance,
	};
}

type ContextMapItem = AIDecisionRequest["context"]["mapItems"][number];
type ContextProperty = AIDecisionRequest["context"]["properties"][number];
type ContextMapEvent = AIDecisionRequest["context"]["mapEvents"][number];
type ContextPlayer = AIDecisionRequest["context"]["players"][number];

const LIGHTWEIGHT_MAP_SCENES = new Set<AIDecisionRequest["scene"]>(["confirm-dialog", "form-dialog"]);

function buildRoleByPlayerId(request: AIDecisionRequest) {
	return new Map((request.context.playerRoles || []).map((item) => [item.playerId, item]));
}

function buildMapItemById(request: AIDecisionRequest) {
	return new Map(request.context.mapItems.map((item) => [item.id, item]));
}

function buildPropertyById(request: AIDecisionRequest) {
	return new Map(request.context.properties.map((item) => [item.id, item]));
}

function buildMapEventById(request: AIDecisionRequest) {
	return new Map(request.context.mapEvents.map((item) => [item.id, item]));
}

function getReadableRoleInfo(
	roleByPlayerId: Map<string, NonNullable<AIDecisionRequest["context"]["playerRoles"]>[number]>,
	playerId: string,
	includeDescription = false,
) {
	const role = roleByPlayerId.get(playerId);
	if (!role?.roleName) return undefined;
	return {
		name: clipText(role.roleName, 20),
		description: includeDescription ? clipText(role.roleDescription, 48) : undefined,
	};
}

function getCurrentRent(property: ContextProperty): number | undefined {
	if (!property.costList.length) return undefined;
	const rentIndex = Math.min(Math.max(property.level, 0), property.costList.length - 1);
	return property.costList[rentIndex];
}

function formatBoardPosition(index: number): string {
	return `第${index + 1}格`;
}

function summarizePropertyCompact(
	property: ContextProperty,
	options?: {
		includeOwner?: boolean;
		includeBuyCost?: boolean;
	},
): Record<string, unknown> {
	const summary: Record<string, unknown> = {
		name: clipText(property.name, 20),
		level: `${property.level}/${property.maxLevel}`,
	};
	const currentRent = getCurrentRent(property);
	if (typeof currentRent === "number") {
		summary.rent = currentRent;
	}
	if (options?.includeBuyCost !== false && typeof property.sellCost === "number") {
		summary.buyCost = property.sellCost;
	}
	if (options?.includeOwner) {
		summary.owner = clipText(property.owner?.username, 18) || "无主";
	}
	return summary;
}

function summarizePropertyBrief(property: ContextProperty, includeOwner = true): Record<string, unknown> {
	const ownerName = clipText(property.owner?.username, 18);
	const currentRent = getCurrentRent(property);
	const summaryParts: string[] = [];
	if (includeOwner) {
		summaryParts.push(ownerName ? `${ownerName}持有` : "无主地");
	}
	if (typeof property.level === "number") {
		summaryParts.push(`等级 ${property.level}/${property.maxLevel}`);
	}
	if (typeof property.sellCost === "number") {
		summaryParts.push(`购买价 ${property.sellCost}`);
	}
	if (typeof currentRent === "number") {
		summaryParts.push(`当前过路费 ${currentRent}`);
	}
	const customDescription = clipText(property.custom?.description, 32);
	if (customDescription) {
		summaryParts.push(customDescription);
	}
	return {
		name: clipText(property.name, 24),
		summary: summaryParts.join("，"),
	};
}

function summarizeMapEventBrief(event: ContextMapEvent | undefined): Record<string, unknown> | undefined {
	if (!event) return undefined;
	return {
		name: clipText(event.name, 24),
		type: String(event.type),
		description: clipText(event.description, 48),
	};
}

function buildTileDisplayName(item: ContextMapItem, mapEvent?: ContextMapEvent): string {
	return clipText(item.property?.name, 24) || clipText(mapEvent?.name, 24) || clipText(item.type?.name, 20) || "未知格子";
}

function summarizeMapEventCompact(event: ContextMapEvent | undefined, maxDescriptionLength = 24): Record<string, unknown> | undefined {
	if (!event) return undefined;
	const summary: Record<string, unknown> = {
		name: clipText(event.name, 20),
	};
	const description = clipText(event.description, maxDescriptionLength);
	if (description) {
		summary.description = description;
	}
	return summary;
}

function summarizeLinkedProperty(
	request: AIDecisionRequest,
	itemId: string | undefined,
	boardIndexByItemId: Map<string, number>,
): Record<string, unknown> | undefined {
	if (!itemId) return undefined;
	const mapItemById = buildMapItemById(request);
	const linkedTile = mapItemById.get(itemId);
	if (!linkedTile?.property) return undefined;
	return {
		position: typeof boardIndexByItemId.get(itemId) === "number" ? formatBoardPosition(boardIndexByItemId.get(itemId)!) : undefined,
		...summarizePropertyBrief(linkedTile.property),
	};
}

function summarizeLinkedPropertyCompact(
	request: AIDecisionRequest,
	itemId: string | undefined,
	boardIndexByItemId: Map<string, number>,
): Record<string, unknown> | undefined {
	if (!itemId) return undefined;
	const mapItemById = buildMapItemById(request);
	const linkedTile = mapItemById.get(itemId);
	if (!linkedTile?.property) return undefined;
	const summary: Record<string, unknown> = {
		index: typeof boardIndexByItemId.get(itemId) === "number" ? boardIndexByItemId.get(itemId)! + 1 : undefined,
		...summarizePropertyCompact(linkedTile.property, {
			includeOwner: false,
			includeBuyCost: false,
		}),
	};
	return summary;
}

function summarizeAttachedProperties(
	request: AIDecisionRequest,
	item: ContextMapItem,
	boardIndexByItemId: Map<string, number>,
): Array<Record<string, unknown>> | undefined {
	const attached = [item.linkto, item.beLinked]
		.map((linkedId) => summarizeLinkedProperty(request, linkedId, boardIndexByItemId))
		.filter((value): value is Record<string, unknown> => Boolean(value));
	if (attached.length === 0) return undefined;
	const seen = new Set<string>();
	const deduped = attached.filter((property) => {
		const key = JSON.stringify(property);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	return deduped.length > 0 ? deduped : undefined;
}

function summarizeAttachedPropertiesCompact(
	request: AIDecisionRequest,
	item: ContextMapItem,
	boardIndexByItemId: Map<string, number>,
): Array<Record<string, unknown>> | undefined {
	const attached = [item.linkto, item.beLinked]
		.map((linkedId) => summarizeLinkedPropertyCompact(request, linkedId, boardIndexByItemId))
		.filter((value): value is Record<string, unknown> => Boolean(value));
	if (attached.length === 0) return undefined;
	const seen = new Set<string>();
	const deduped = attached.filter((property) => {
		const key = JSON.stringify(property);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	return deduped.length > 0 ? deduped : undefined;
}

function summarizeTile(
	request: AIDecisionRequest,
	item: ContextMapItem | undefined,
	boardIndexByItemId: Map<string, number>,
	boardIndex?: number,
	options?: {
		includeOwner?: boolean;
	},
): Record<string, unknown> | undefined {
	if (!item) return undefined;
	const mapEventById = buildMapEventById(request);
	const event = item.mapEventId ? mapEventById.get(item.mapEventId) : undefined;
	const includeOwner = options?.includeOwner !== false;
	const typeName = clipText(item.type?.name, 20) || "未知格子";
	const summary: Record<string, unknown> = {
		name: buildTileDisplayName(item, event),
		type: typeName,
	};
	if (typeof boardIndex === "number") {
		summary.position = formatBoardPosition(boardIndex);
	}
	if (event) {
		summary.event = summarizeMapEventBrief(event);
	}
	if (item.property) {
		if (includeOwner) {
			summary.owner = clipText(item.property.owner?.username, 18) || "无主";
		}
		summary.property = summarizePropertyBrief(item.property, includeOwner);
	}
	const attachedProperties = summarizeAttachedProperties(request, item, boardIndexByItemId);
	if (attachedProperties) {
		summary.attachedProperties = attachedProperties;
	}
	if (item.property) {
		summary.summary = summarizePropertyBrief(item.property, includeOwner).summary;
	} else if (attachedProperties?.length) {
		summary.summary = `关联地产：${attachedProperties
			.map((property) => {
				const name = typeof property.name === "string" ? property.name : undefined;
				const brief = typeof property.summary === "string" ? property.summary : undefined;
				return [name, brief].filter(Boolean).join("，");
			})
			.filter(Boolean)
			.join("；")}`;
	} else if (event?.description) {
		summary.summary = clipText(event.description, 48);
	} else {
		summary.summary = "普通功能格";
	}
	return summary;
}

function summarizeTileCompact(
	request: AIDecisionRequest,
	item: ContextMapItem | undefined,
	boardIndexByItemId: Map<string, number>,
	boardIndex?: number,
	options?: {
		includeOwner?: boolean;
		includeAttachedProperties?: boolean;
		includeEventDescription?: boolean;
	},
): Record<string, unknown> | undefined {
	if (!item) return undefined;
	const mapEventById = buildMapEventById(request);
	const event = item.mapEventId ? mapEventById.get(item.mapEventId) : undefined;
	const summary: Record<string, unknown> = {
		index: typeof boardIndex === "number" ? boardIndex + 1 : undefined,
		name: buildTileDisplayName(item, event),
		type: clipText(item.type?.name, 16) || "未知格子",
	};
	if (item.property) {
		summary.property = summarizePropertyCompact(item.property, {
			includeOwner: options?.includeOwner,
			includeBuyCost: true,
		});
	}
	if (event) {
		summary.event = summarizeMapEventCompact(event, options?.includeEventDescription === false ? 16 : 24);
	}
	if (options?.includeAttachedProperties !== false) {
		const attachedProperties = summarizeAttachedPropertiesCompact(request, item, boardIndexByItemId);
		if (attachedProperties?.length) {
			summary.attachedProperties = attachedProperties;
		}
	}
	return summary;
}

function buildBoardIndexByItemId(request: AIDecisionRequest) {
	return new Map(request.context.mapIndex.map((itemId, index) => [itemId, index]));
}

function summarizeTileAtPosition(request: AIDecisionRequest, positionIndex: number): Record<string, unknown> | undefined {
	const itemId = request.context.mapIndex[positionIndex];
	if (!itemId) return undefined;
	return summarizeTileCompact(request, buildMapItemById(request).get(itemId), buildBoardIndexByItemId(request), positionIndex, {
		includeOwner: true,
		includeEventDescription: true,
	});
}

function summarizeNearbyTiles(request: AIDecisionRequest, positionIndex: number, maxSteps = 3) {
	const total = request.context.mapIndex.length;
	if (total <= 1) return undefined;
	const mapItemById = buildMapItemById(request);
	const boardIndexByItemId = buildBoardIndexByItemId(request);
	const tiles: Array<Record<string, unknown>> = [];
	const visibleSteps = Math.min(maxSteps, total - 1);
	for (let step = 1; step <= visibleSteps; step++) {
		const boardIndex = (positionIndex + step) % total;
		const tile = summarizeTileCompact(request, mapItemById.get(request.context.mapIndex[boardIndex]), boardIndexByItemId, boardIndex, {
			includeOwner: true,
			includeEventDescription: false,
		});
		if (!tile) continue;
		tiles.push({
			step,
			...tile,
		});
	}
	return tiles.length > 0 ? tiles : undefined;
}

function shouldIncludeFullMapStructure(request: AIDecisionRequest): boolean {
	return !LIGHTWEIGHT_MAP_SCENES.has(request.scene);
}

function summarizeMapStructure(request: AIDecisionRequest): Record<string, unknown> | undefined {
	if (!shouldIncludeFullMapStructure(request)) {
		return undefined;
	}
	const mapItemById = buildMapItemById(request);
	const boardIndexByItemId = buildBoardIndexByItemId(request);
	return {
		totalTiles: request.context.mapIndex.length,
		orderedTiles: request.context.mapIndex.map((itemId, index) => {
			return summarizeTileCompact(request, mapItemById.get(itemId), boardIndexByItemId, index, {
				includeOwner: false,
				includeEventDescription: true,
			});
		}),
	};
}

function sortThreatPlayers(players: ContextPlayer[], currentPlayerId: string): ContextPlayer[] {
	return players
		.filter((player) => player.id !== currentPlayerId)
		.sort((left, right) => {
			if (Number(right.isBankrupted) !== Number(left.isBankrupted)) {
				return Number(left.isBankrupted) - Number(right.isBankrupted);
			}
			if (right.money !== left.money) {
				return right.money - left.money;
			}
			return right.properties.length - left.properties.length;
		});
}

function summarizeStructuredStrategyMemory(
	request: AIDecisionRequest,
	state: AIStrategyState,
): Record<string, unknown> | undefined {
	const memory = state.memory;
	if (!memory) return undefined;
	const playerNameById = new Map(request.context.players.map((item) => [item.id, item.user.username]));
	const propertyById = buildPropertyById(request);
	const summary: Record<string, unknown> = {};

	if (memory.economy) {
		const economy: Record<string, unknown> = {};
		if (memory.economy.spendMode) economy.spendMode = memory.economy.spendMode;
		if (memory.economy.riskTolerance) economy.riskTolerance = memory.economy.riskTolerance;
		if (memory.economy.warningFlags?.length) {
			economy.warningFlags = memory.economy.warningFlags.map((item) => clipText(item, 24)).filter(Boolean).slice(0, 2);
		}
		if (Object.keys(economy).length > 0) {
			summary.economy = economy;
		}
	}

	if (memory.threatModel) {
		const threat: Record<string, unknown> = {};
		if (memory.threatModel.focusPlayerId) {
			threat.focusPlayer = clipText(playerNameById.get(memory.threatModel.focusPlayerId), 20) || "关注目标";
		}
		if (memory.threatModel.threatReasons?.length) {
			threat.reasons = memory.threatModel.threatReasons.map((item) => clipText(item, 20)).filter(Boolean).slice(0, 2);
		}
		if (memory.threatModel.dangerousPropertyIds?.length) {
			const dangerousProperties = memory.threatModel.dangerousPropertyIds
				.slice(0, 3)
				.map((id) => clipText(propertyById.get(id)?.name, 20))
				.filter(Boolean);
			if (dangerousProperties.length > 0) {
				threat.dangerousProperties = dangerousProperties;
			}
		}
		if (Object.keys(threat).length > 0) {
			summary.threat = threat;
		}
	}

	if (memory.propertyPlan) {
		const propertyPlan: Record<string, unknown> = {};
		if (memory.propertyPlan.focusPropertyIds?.length) {
			const focusProperties = memory.propertyPlan.focusPropertyIds
				.slice(0, 3)
				.map((id) => clipText(propertyById.get(id)?.name, 20))
				.filter(Boolean);
			if (focusProperties.length > 0) {
				propertyPlan.focusProperties = focusProperties;
			}
		}
		if (memory.propertyPlan.avoidPropertyIds?.length) {
			const avoidProperties = memory.propertyPlan.avoidPropertyIds
				.slice(0, 3)
				.map((id) => clipText(propertyById.get(id)?.name, 20))
				.filter(Boolean);
			if (avoidProperties.length > 0) {
				propertyPlan.avoidProperties = avoidProperties;
			}
		}
		if (memory.propertyPlan.expansionReason) {
			propertyPlan.expansionReason = clipText(memory.propertyPlan.expansionReason, 36);
		}
		if (Object.keys(propertyPlan).length > 0) {
			summary.propertyPlan = propertyPlan;
		}
	}

	if (memory.systemPlan) {
		const systems: Record<string, unknown> = {};
		if (memory.systemPlan.preferredSystems?.length) {
			systems.preferred = memory.systemPlan.preferredSystems.slice(-3);
		}
		if (memory.systemPlan.avoidedSystems?.length) {
			systems.avoided = memory.systemPlan.avoidedSystems.slice(-3);
		}
		if (memory.systemPlan.lastEffectiveSystem) {
			systems.lastEffectiveSystem = memory.systemPlan.lastEffectiveSystem;
		}
		if (Object.keys(systems).length > 0) {
			summary.systems = systems;
		}
	}

	if (memory.mapUnderstanding) {
		const mapUnderstanding: Record<string, unknown> = {};
		if (memory.mapUnderstanding.keyZones?.length) {
			mapUnderstanding.keyZones = memory.mapUnderstanding.keyZones.map((item) => clipText(item, 30)).filter(Boolean).slice(0, 2);
		}
		if (Object.keys(mapUnderstanding).length > 0) {
			summary.mapUnderstanding = mapUnderstanding;
		}
	}

	if (memory.shortTermIntent) {
		const intent: Record<string, unknown> = {};
		if (memory.shortTermIntent.currentGoal) {
			intent.goal = clipText(memory.shortTermIntent.currentGoal, 36);
		}
		if (memory.shortTermIntent.nextTurnPlan?.length) {
			intent.nextTurnPlan = memory.shortTermIntent.nextTurnPlan
				.map((item) => clipText(item, 24))
				.filter(Boolean)
				.slice(0, 3);
		}
		if (memory.shortTermIntent.holdConditions?.length) {
			intent.holdConditions = memory.shortTermIntent.holdConditions
				.map((item) => clipText(item, 28))
				.filter(Boolean)
				.slice(0, 2);
		}
		if (Object.keys(intent).length > 0) {
			summary.intent = intent;
		}
	}

	if (memory.shortTerm) {
		const shortTerm: Record<string, unknown> = {};
		const recentDecisions = summarizeRecentDecisionSummaries(memory.shortTerm.recentDecisions);
		if (recentDecisions?.length) {
			shortTerm.recentDecisions = recentDecisions.slice(-3);
		}
		if (memory.shortTerm.recentFailures?.length) {
			shortTerm.recentFailures = memory.shortTerm.recentFailures
				.map((item) => clipText(item, 28))
				.filter(Boolean)
				.slice(-2);
		}
		if (memory.shortTerm.blockedActionHints?.length) {
			shortTerm.blockedActionHints = memory.shortTerm.blockedActionHints
				.map((item) => clipText(item, 28))
				.filter(Boolean)
				.slice(-2);
		}
		if (memory.shortTerm.immediateFocus?.length) {
			shortTerm.immediateFocus = memory.shortTerm.immediateFocus
				.map((item) => clipText(item, 24))
				.filter(Boolean)
				.slice(-3);
		}
		if (memory.shortTerm.lastChosenSystem) {
			shortTerm.lastChosenSystem = clipText(memory.shortTerm.lastChosenSystem, 20);
		}
		if (memory.shortTerm.lastOutcome) {
			shortTerm.lastOutcome = clipText(memory.shortTerm.lastOutcome, 20);
		}
		const shortTermMemoryPatches = summarizeMemoryEntries(memory.shortTerm.memoryPatches, 3);
		if (shortTermMemoryPatches?.length) {
			shortTerm.memoryPatches = shortTermMemoryPatches;
		}
		if (Object.keys(shortTerm).length > 0) {
			summary.shortTerm = shortTerm;
		}
	}

	if (memory.match) {
		const match: Record<string, unknown> = {};
		if (memory.match.effectiveSystems?.length) {
			match.effectiveSystems = memory.match.effectiveSystems
				.map((item) => clipText(item, 18))
				.filter(Boolean)
				.slice(0, 3);
		}
		if (memory.match.riskySystems?.length) {
			match.riskySystems = memory.match.riskySystems
				.map((item) => clipText(item, 18))
				.filter(Boolean)
				.slice(0, 3);
		}
		if (memory.match.notableLessons?.length) {
			match.lessons = memory.match.notableLessons
				.map((item) => clipText(item, 30))
				.filter(Boolean)
				.slice(0, 3);
		}
		if (memory.match.systemStats?.length) {
			match.systemStats = memory.match.systemStats.slice(0, 3).map((stat) => ({
				system: clipText(stat.label || stat.key, 18),
				success: stat.successCount || 0,
				failure: stat.failureCount || 0,
				lastOutcome: stat.lastOutcome,
			}));
		}
		if (memory.match.actionStats?.length) {
			match.actionStats = memory.match.actionStats.slice(0, 3).map((stat) => ({
				action: clipText(stat.label || stat.key, 24),
				success: stat.successCount || 0,
				failure: stat.failureCount || 0,
				lastOutcome: stat.lastOutcome,
			}));
		}
		if (Object.keys(match).length > 0) {
			summary.match = match;
		}
	}

	if (memory.experience) {
		const experience: Record<string, unknown> = {};
		if (memory.experience.compressedLessons?.length) {
			experience.lessons = memory.experience.compressedLessons
				.map((item) => clipText(item, 28))
				.filter(Boolean)
				.slice(0, 3);
		}
		if (memory.experience.recentSuccesses?.length) {
			experience.recentSuccesses = memory.experience.recentSuccesses
				.map((item) => clipText(item, 28))
				.filter(Boolean)
				.slice(-2);
		}
		if (memory.experience.recentFailures?.length) {
			experience.recentFailures = memory.experience.recentFailures
				.map((item) => clipText(item, 28))
				.filter(Boolean)
				.slice(-2);
		}
		if (Object.keys(experience).length > 0) {
			summary.experience = experience;
		}
	}

	const candidateLongTermEntries = summarizeMemoryEntries(memory.candidateLongTerm?.entries, 3);
	if (candidateLongTermEntries?.length) {
		summary.candidateLongTerm = candidateLongTermEntries;
	}

	const promotedLongTermEntries = summarizeMemoryEntries(memory.promotedLongTerm?.entries, 3);
	if (promotedLongTermEntries?.length) {
		summary.promotedLongTerm = promotedLongTermEntries;
	}

	return Object.keys(summary).length > 0 ? summary : undefined;
}

function summarizeStrategyState(request: AIDecisionRequest): Record<string, unknown> | undefined {
	const state = request.strategyState;
	if (!state) return undefined;
	const summary: Record<string, unknown> = {};
	if (state.posture) summary.posture = state.posture;
	if (typeof state.reserveCashTarget === "number") summary.reserveCashTarget = state.reserveCashTarget;
	const structuredMemory = summarizeStructuredStrategyMemory(request, state);
	if (structuredMemory) {
		summary.memory = structuredMemory;
	} else {
		if (state.preferredSystems?.length) summary.preferredSystems = state.preferredSystems.slice(-2);
		const recentDecisionMemory = summarizeRecentDecisionSummaries(state.recentDecisionSummaries);
		if (recentDecisionMemory?.length) summary.recentDecisionMemory = recentDecisionMemory.slice(-2);
	}
	return Object.keys(summary).length > 0 ? summary : undefined;
}

function summarizeRequestBase(request: AIDecisionRequest): Record<string, unknown> {
	return {
		mapName: request.context.map.name,
		mapDescription: clipText(request.context.map.description, 80),
		roles: request.context.map.roles?.map((role) => ({
			name: clipText(role.name, 20),
			description: clipText(role.description, 32),
		})),
		enabledSystems: Object.keys(request.context.systems || {}).slice(0, 6),
	};
}

function summarizeTableState(request: AIDecisionRequest): Record<string, unknown> {
	const currentPlayer = request.context.player;
	const roleByPlayerId = buildRoleByPlayerId(request);
	const currentPlayerTile = summarizeTileAtPosition(request, currentPlayer.positionIndex);
	const currentTurnPlayerName = request.context.players.find((item) => item.id === request.context.currentPlayerIdInRound)?.user.username;
	const opponents = sortThreatPlayers(request.context.players, currentPlayer.id).slice(0, 2);
	return {
		currentRound: request.context.currentRound,
		currentMultiplier: request.context.currentMultiplier,
		currentTurnPlayer: clipText(currentTurnPlayerName, 20),
		currentPlayer: {
			name: currentPlayer.user.username,
			money: currentPlayer.money,
			role: getReadableRoleInfo(roleByPlayerId, currentPlayer.id),
			position: formatBoardPosition(currentPlayer.positionIndex),
			currentTile: currentPlayerTile,
			propertyCount: currentPlayer.properties.length,
			ownedProperties: currentPlayer.properties.slice(0, 3).map((property) =>
				summarizePropertyCompact(property, { includeOwner: false, includeBuyCost: false }),
			),
			chanceCards: currentPlayer.chanceCards.slice(0, 3).map((card) => ({
				name: card.name,
				description: clipText(card.description, 20),
			})),
			status:
				currentPlayer.isBankrupted
					? "已破产"
					: currentPlayer.stop > 0
						? `还需暂停 ${currentPlayer.stop} 回合`
						: undefined,
		},
		opponents: opponents
			.map((player) => {
				return {
					name: player.user.username,
					money: player.money,
					role: getReadableRoleInfo(roleByPlayerId, player.id),
					position: formatBoardPosition(player.positionIndex),
					currentTile: summarizeTileAtPosition(request, player.positionIndex),
					propertyCount: player.properties.length,
					properties: player.properties
						.slice(0, 2)
						.map((property) => clipText(property.name, 18))
						.filter(Boolean),
					isBankrupted: player.isBankrupted,
				};
			}),
		nearbyTiles: summarizeNearbyTiles(request, currentPlayer.positionIndex, 3),
	};
}

function summarizeDecision(request: AIDecisionRequest): Record<string, unknown> {
	const summary: Record<string, unknown> = {
		operationType: request.operationType,
		scene: request.scene,
		title: request.title,
		summary: clipText(request.summary, 80),
		options: pickAvailableOptions(request.options).map((option) => {
			const label = buildReadableDecisionLabel(option) || clipText(option.label, 28);
			const summary: Record<string, unknown> = {
				optionId: option.id,
				label,
				actionType: option.actionType,
			};
			const description = buildReadableDecisionDescription(option);
			if (description) {
				summary.description = description;
			}
			if (option.summary) {
				summary.summary = clipText(option.summary, 40);
			}
			if (option.payload && Object.keys(option.payload).length > 0) {
				summary.payload = option.payload;
			}
			return summary;
		}),
	};

	if (request.scene === "form-dialog") {
		const formFields = Array.isArray(request.metadata?.formFields)
			? request.metadata?.formFields
					.map((field) => {
						if (typeof field !== "object" || field === null) {
							return undefined;
						}
						const item = field as Record<string, unknown>;
						return {
							key: item.key,
							label: item.label,
							valueType: item.valueType,
							min: item.min,
							max: item.max,
							defaultValue: item.defaultValue,
						};
					})
					.filter(Boolean)
			: undefined;
		const defaultFieldValues =
			typeof request.metadata?.defaultFieldValues === "object" && request.metadata.defaultFieldValues !== null
				? request.metadata.defaultFieldValues
				: undefined;
		if (formFields?.length) {
			summary.formFields = formFields;
		}
		if (defaultFieldValues) {
			summary.defaultFieldValues = defaultFieldValues;
		}
	}

	const decisionChain = summarizeDecisionChain(request);
	if (decisionChain) {
		summary.decisionChain = decisionChain;
	}

	return summary;
}

function buildRemotePrompt(request: AIDecisionRequest): string {
	const sections = [`[game_profile]\n${JSON.stringify(summarizeRequestBase(request))}`];
	const mapStructure = summarizeMapStructure(request);
	if (mapStructure) {
		sections.push(`[map_structure]\n${JSON.stringify(mapStructure)}`);
	}
	sections.push(`[board_brief]\n${JSON.stringify(summarizeTableState(request))}`);
	sections.push(`[decision]\n${JSON.stringify(summarizeDecision(request))}`);
	const decisionChain = summarizeDecisionChain(request);
	if (decisionChain) {
		sections.push(`[decision_chain]\n${JSON.stringify(decisionChain)}`);
	}
	const strategyState = summarizeStrategyState(request);
	if (strategyState) {
		sections.push(`[strategy_memory]\n${JSON.stringify(strategyState)}`);
	}
	return sections.join("\n\n");
}

function getDecisionTraceId(request: AIDecisionRequest): string {
	const traceId = request.metadata?.decisionId;
	return typeof traceId === "string" && traceId ? traceId : "unknown";
}

function normalizeTokenCount(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sumTokenCounts(...values: Array<number | undefined>): number | undefined {
	const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
	if (filtered.length === 0) return undefined;
	return filtered.reduce((sum, value) => sum + value, 0);
}

function extractUsage(provider: AIRemoteLLMProviderKind, data: unknown): RemoteUsage | undefined {
	switch (provider) {
		case "anthropic": {
			const usage = (data as AnthropicMessagesResponse)?.usage;
			if (!usage) return undefined;
			const inputTokens = sumTokenCounts(
				normalizeTokenCount(usage.input_tokens),
				normalizeTokenCount(usage.cache_creation_input_tokens),
				normalizeTokenCount(usage.cache_read_input_tokens),
			);
			const outputTokens = normalizeTokenCount(usage.output_tokens);
			const totalTokens = sumTokenCounts(inputTokens, outputTokens);
			if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
				return undefined;
			}
			return {
				inputTokens,
				outputTokens,
				totalTokens,
			};
		}
		case "openai-compatible":
		default: {
			const usage = (data as OpenAIChatCompletionResponse)?.usage;
			if (!usage) return undefined;
			const inputTokens = normalizeTokenCount(usage.prompt_tokens) ?? normalizeTokenCount(usage.input_tokens);
			const outputTokens = normalizeTokenCount(usage.completion_tokens) ?? normalizeTokenCount(usage.output_tokens);
			const totalTokens = normalizeTokenCount(usage.total_tokens) ?? sumTokenCounts(inputTokens, outputTokens);
			if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
				return undefined;
			}
			return {
				inputTokens,
				outputTokens,
				totalTokens,
			};
		}
	}
}


function extractTextContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map((item) => item?.text || "")
			.join("\n")
			.trim();
	}
	return "";
}

function extractJsonPayload(raw: string): string {
	const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) {
		return fenced[1].trim();
	}
	const firstBrace = raw.indexOf("{");
	const lastBrace = raw.lastIndexOf("}");
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		return raw.slice(firstBrace, lastBrace + 1);
	}
	return raw.trim();
}

function isNaturalChatMessage(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) {
		return false;
	}
	const compact = trimmed.replace(/[「」"'`，。！？、,.!?：:\s]/g, "");
	if (!compact) {
		return false;
	}
	if (GENERIC_CHAT_MESSAGES.has(compact)) {
		return false;
	}
	return !TECHNICAL_CHAT_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function sanitizeChatMessages(value: unknown): string[] | undefined {
	const rawMessages = Array.isArray(value) ? value : typeof value === "string" ? [value] : undefined;
	if (!rawMessages) {
		return undefined;
	}
	const normalized = rawMessages
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.replace(/\s+/g, " ").trim())
		.filter((item) => item.length > 0 && isNaturalChatMessage(item))
		.map((item) => (item.length > 96 ? `${item.slice(0, 96)}...` : item))
		.slice(0, 1);
	return normalized.length > 0 ? normalized : undefined;
}

function sanitizeMemoryPatches(value: unknown): AIDecisionMemoryPatch[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const normalized = value
		.map((item) => {
			if (typeof item !== "object" || item === null) {
				return undefined;
			}
			const patch = item as Record<string, unknown>;
			const scope = patch.scope === "turn" || patch.scope === "match" || patch.scope === "map" ? patch.scope : undefined;
			const kind =
				patch.kind === "systemPreference" ||
				patch.kind === "riskRule" ||
				patch.kind === "timingHeuristic" ||
				patch.kind === "targetingBias" ||
				patch.kind === "plan" ||
				patch.kind === "experienceNote"
					? patch.kind
					: undefined;
			const summary = clipText(typeof patch.summary === "string" ? patch.summary : undefined, 120);
			if (!scope || !kind || !summary) {
				return undefined;
			}
			const tags = Array.isArray(patch.tags)
				? Array.from(
						new Set(
							patch.tags
								.filter((tag): tag is string => typeof tag === "string")
								.map((tag) => tag.replace(/\s+/g, " ").trim())
								.filter(Boolean),
						),
					).slice(0, 4)
				: undefined;
			return {
				scope,
				kind,
				summary,
				key: clipText(typeof patch.key === "string" ? patch.key : undefined, 80),
				confidence: typeof patch.confidence === "number" ? Math.max(0, Math.min(1, patch.confidence)) : undefined,
				evidence: clipText(typeof patch.evidence === "string" ? patch.evidence : undefined, 120),
				tags,
				ttlTurns:
					scope === "turn" && typeof patch.ttlTurns === "number" && Number.isFinite(patch.ttlTurns)
						? Math.max(1, Math.min(4, Math.round(patch.ttlTurns)))
						: undefined,
				promoteCandidate: Boolean(patch.promoteCandidate),
			} satisfies AIDecisionMemoryPatch;
		})
		.filter(Boolean) as AIDecisionMemoryPatch[];
	return normalized.length > 0 ? normalized.slice(0, 4) : undefined;
}

function normalizeSelection(request: AIDecisionRequest, value: unknown): AIDecisionSelection {
	const availableOptions = pickAvailableOptions(request.options);
	const validIds = new Set(availableOptions.map((option) => option.id));
	const payload = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	const optionId = typeof payload.optionId === "string" && validIds.has(payload.optionId) ? payload.optionId : undefined;
	const optionIds = Array.isArray(payload.optionIds)
		? payload.optionIds.filter((item): item is string => typeof item === "string" && validIds.has(item))
		: undefined;
	const confidence = typeof payload.confidence === "number" ? payload.confidence : undefined;
	const reason = typeof payload.reason === "string" ? payload.reason : undefined;
	const submitted =
		typeof payload.submitted === "boolean"
			? payload.submitted
			: request.scene === "form-dialog"
				? optionId === "__submit__"
					? true
					: optionId === "__cancel__"
						? false
						: undefined
				: undefined;
	const chatMessages = sanitizeChatMessages(payload.chatMessages);
	const memoryPatches = sanitizeMemoryPatches(payload.memoryPatches);
	const fieldValues =
		typeof payload.fieldValues === "object" && payload.fieldValues !== null
			? (payload.fieldValues as Record<string, unknown>)
			: undefined;

	if (optionId || (optionIds && optionIds.length > 0) || submitted !== undefined || fieldValues) {
		return {
			optionId,
			optionIds,
			confidence,
			reason,
			submitted,
			fieldValues,
			chatMessages,
			memoryPatches,
		};
	}

	return {
		optionId: availableOptions[0]?.id,
		confidence: 0.2,
		reason: "fallback_first_option",
		chatMessages,
		memoryPatches,
	};
}

function requiresApiKey(config: AIRemoteLLMConfig): boolean {
	return true;
}

function hasRequiredConfig(config: AIRemoteLLMConfig): boolean {
	if (!config.baseUrl || !config.model) {
		return false;
	}
	if (requiresApiKey(config) && !config.apiKey) {
		return false;
	}
	return true;
}

function buildRemoteRequest(config: AIRemoteLLMConfig, request: AIDecisionRequest): {
	url: string;
	headers: Record<string, string>;
	body: string;
	provider: AIRemoteLLMProviderKind;
	model: string;
	prompt: string;
} {
	const provider = normalizeProviderKind(config.provider);
	const prompt = buildRemotePrompt(request);

	switch (provider) {
		case "anthropic":
			return {
				provider,
				model: config.model,
				prompt,
				url: buildAnthropicEndpoint(config.baseUrl),
				headers: {
					"Content-Type": "application/json",
					"x-api-key": config.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: config.model,
					max_tokens: 512,
					temperature: 0.2,
					system: SYSTEM_PROMPT,
					messages: [
						{
							role: "user",
							content: prompt,
						},
					],
				}),
			};
		case "openai-compatible":
		default:
			return {
				provider,
				model: config.model,
				prompt,
				url: buildOpenAIEndpoint(config.baseUrl),
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${config.apiKey}`,
				},
				body: JSON.stringify({
					model: config.model,
					temperature: 0.2,
					messages: [
						{
							role: "system",
							content: SYSTEM_PROMPT,
						},
						{
							role: "user",
							content: prompt,
						},
					],
				}),
			};
	}
}

function extractResponseContent(provider: AIRemoteLLMProviderKind, data: unknown): string {
	switch (provider) {
		case "anthropic":
			return extractTextContent((data as AnthropicMessagesResponse)?.content);
		case "openai-compatible":
		default:
			return extractTextContent((data as OpenAIChatCompletionResponse)?.choices?.[0]?.message?.content);
	}
}

class RemoteAIDecisionProvider implements AIDecisionProvider {
	constructor(private readonly config: AIRemoteLLMConfig) {}

	async decide(request: AIDecisionRequest): Promise<AIDecisionSelection> {
		if (!hasRequiredConfig(this.config)) {
			return {};
		}

		const controller = new AbortController();
		const timeoutMs = this.config.timeoutMs ?? 30000;
		const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
		const remoteRequest = buildRemoteRequest(this.config, request);

		try {
			const response = await fetch(remoteRequest.url, {
				method: "POST",
				headers: remoteRequest.headers,
				body: remoteRequest.body,
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json();
			const usage = extractUsage(remoteRequest.provider, data);
			const content = extractResponseContent(remoteRequest.provider, data);
			if (!content) {
				throw new Error("远程模型未返回内容");
			}
			const selection = normalizeSelection(request, JSON.parse(extractJsonPayload(content)));
			recordAIRemoteUsage({
				traceId: getDecisionTraceId(request),
				playerId: request.playerId,
				title: request.title,
				scene: request.scene,
				profileId: this.config.id,
				profileName: this.config.name,
				provider: remoteRequest.provider,
				model: remoteRequest.model,
				inputTokens: usage?.inputTokens,
				outputTokens: usage?.outputTokens,
				totalTokens: usage?.totalTokens,
				promptChars: remoteRequest.prompt.length,
				responseChars: content.length,
				timestamp: Date.now(),
				usageAvailable: Boolean(usage),
			});
			return selection;
		} catch (error) {
			console.error(`[AI Remote:${remoteRequest.provider}] request failed`, error);
			return {};
		} finally {
			clearTimeout(timeoutId);
		}
	}
}

export function createAIDecisionProviderFromConfig(config: AIDecisionConfig): AIDecisionProvider {
	return createRemoteAIDecisionProvider(config.remote);
}

export function createRemoteAIDecisionProvider(config: AIRemoteLLMConfig | AIRemoteLLMProfile): AIDecisionProvider {
	return new RemoteAIDecisionProvider({
		...config,
		provider: normalizeProviderKind(config.provider),
	});
}

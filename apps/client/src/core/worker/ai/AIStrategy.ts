import { AIDecisionProvider, AIDecisionRequest, AIDecisionSelection, AIStrategyState } from "@mine-monopoly/types";

import { StrategyStateManager } from "./StrategyStateManager";

const AI_LOG_PREFIX = "[AI Decision]";

class EmptyDecisionProvider implements AIDecisionProvider {
	decide(): AIDecisionSelection {
		return {};
	}
}

function getDecisionId(request: AIDecisionRequest): string | undefined {
	return typeof request.metadata?.decisionId === "string" ? request.metadata.decisionId : undefined;
}

function inferSourceSystem(request: AIDecisionRequest, selection: AIDecisionSelection): string | undefined {
	const selectedIds = selection.optionIds || (selection.optionId ? [selection.optionId] : []);
	const selectedOption = request.options.find((option) => selectedIds.includes(option.id));
	const payload = selectedOption?.payload;
	if (!payload) {
		return undefined;
	}

	const actionKind = typeof payload.actionKind === "string" ? payload.actionKind : undefined;
	const type = typeof payload.type === "string" ? payload.type : undefined;
	if (actionKind === "use-chance-card" || type === "chance-card") {
		return "chance-card";
	}
	if (actionKind === "dynamic-button" || type === "button") {
		return "dynamic-button";
	}
	if (type === "property") {
		return "property";
	}
	if (type === "player") {
		return "player-target";
	}
	if (type === "map-item") {
		return "map-item";
	}
	return actionKind || type;
}

function inferIntent(request: AIDecisionRequest, selection: AIDecisionSelection): string | undefined {
	const selectedIds = selection.optionIds || (selection.optionId ? [selection.optionId] : []);
	const selectedOption = request.options.find((option) => selectedIds.includes(option.id));
	if (!selectedOption) {
		return undefined;
	}
	if (selectedOption.id === "__cancel__" || selectedOption.actionType === "cancel") {
		return "cancel";
	}
	if (selectedOption.id === "__confirm__" || selectedOption.actionType === "confirm") {
		return "confirm";
	}
	if (selectedOption.actionType === "submit") {
		return "submit";
	}
	if (selectedOption.actionType === "roll") {
		return "roll";
	}
	return selectedOption.actionType || undefined;
}

/**
 * AI 管理器
 * 负责统一 provider 调用和对远程模型仍有价值的 strategyState 汇总。
 */
export class AIManager {
	private provider: AIDecisionProvider;
	private readonly strategyStateManager: StrategyStateManager;

	constructor(provider: AIDecisionProvider = new EmptyDecisionProvider()) {
		this.provider = provider;
		this.strategyStateManager = new StrategyStateManager();
	}

	setProvider(provider: AIDecisionProvider): void {
		this.provider = provider;
	}

	getProvider(): AIDecisionProvider {
		return this.provider;
	}

	getStrategyState(playerId: string): AIStrategyState | undefined {
		return this.strategyStateManager.getState(playerId);
	}

	getAllStrategyStates(): Record<string, AIStrategyState> {
		return this.strategyStateManager.getAllStates();
	}

	clearStrategyState(playerId?: string): void {
		this.strategyStateManager.clearState(playerId);
	}

	setContextMemoryLimit(limit: number): void {
		this.strategyStateManager.setRecentDecisionLimit(limit);
	}

	async decide(request: AIDecisionRequest): Promise<AIDecisionSelection> {
		const strategyState = this.strategyStateManager.derive(request);
		const enrichedRequest: AIDecisionRequest = {
			...request,
			strategyState,
		};
		return await this.provider.decide(enrichedRequest);
	}

	feedback(args: {
		playerId: string;
		request: AIDecisionRequest;
		selection: AIDecisionSelection;
		outcome?: string;
	}): void {
		this.strategyStateManager.feedback({
			playerId: args.playerId,
			request: args.request,
			selectedOptionLabel: args.request.options.find((option) =>
				(args.selection.optionIds || (args.selection.optionId ? [args.selection.optionId] : [])).includes(option.id),
			)?.label,
			selectedSourceSystem: inferSourceSystem(args.request, args.selection),
			selectedIntent: inferIntent(args.request, args.selection),
			outcome: args.outcome,
			memoryPatches: args.selection.memoryPatches,
			decisionId: getDecisionId(args.request),
		});
	}
}

export const aiManager = new AIManager();

import { chanceCardTools } from "./chance-cards.js";
import { customUITools } from "./custom-uis.js";
import { extraLibsTools } from "./extra-libs.js";
import { gamePhaseTools } from "./game-phases.js";
import { gameSettingTools } from "./game-settings.js";
import { getCodeTemplateTools } from "./get-code-template.js";
import { getDefaultCodeTools } from "./get-default-code.js";
import { mapEventTools } from "./map-events.js";
import { mapItemTools } from "./map-items.js";
import { mapItemTypeTools } from "./map-item-types.js";
import { mapPathTools } from "./map-paths.js";
import { mapChangeTools } from "./map-changes.js";
import { modifierTemplateTools } from "./modifier-templates.js";
import { propertyTools } from "./properties.js";
import { resourceTools } from "./resources.js";
import { roleTools } from "./roles.js";
import { systemTools } from "./system.js";
import { typeLibsTools } from "./type-libs.js";
import { uiTemplateTools } from "./ui-templates.js";
import { validateEffectCodeTools } from "./validate-effect-code.js";
import { validateMapTools } from "./validate-map.js";

export type MCPToolCategory =
	| "system"
	| "chance-card"
	| "map-event"
	| "role"
	| "game-phase"
	| "extra-lib"
	| "type-lib"
	| "resource"
	| "map-item"
	| "map-path"
	| "map-change"
	| "property"
	| "game-setting"
	| "ui-template"
	| "custom-ui"
	| "modifier-template"
	| "code-template"
	| "validation";

export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema: unknown;
	handler: (args: unknown) => Promise<unknown>;
	category: MCPToolCategory;
}

function withCategory<T extends Omit<MCPToolDefinition, "category">>(
	category: MCPToolCategory,
	tools: readonly T[],
): Array<T & Pick<MCPToolDefinition, "category">> {
	return tools.map((tool) => ({ ...tool, category }));
}

export const allTools: MCPToolDefinition[] = [
	...withCategory("chance-card", chanceCardTools),
	...withCategory("map-event", mapEventTools),
	...withCategory("role", roleTools),
	...withCategory("game-phase", gamePhaseTools),
	...withCategory("extra-lib", extraLibsTools),
	...withCategory("type-lib", typeLibsTools),
	...withCategory("resource", resourceTools),
	...withCategory("map-item", mapItemTools),
	...withCategory("map-item", mapItemTypeTools),
	...withCategory("map-path", mapPathTools),
	...withCategory("map-change", mapChangeTools),
	...withCategory("property", propertyTools),
	...withCategory("system", systemTools),
	...withCategory("game-setting", gameSettingTools),
	...withCategory("ui-template", uiTemplateTools),
	...withCategory("custom-ui", customUITools),
	...withCategory("modifier-template", modifierTemplateTools),
	...withCategory("validation", validateEffectCodeTools),
	...withCategory("validation", validateMapTools),
	...withCategory("code-template", getCodeTemplateTools),
	...withCategory("code-template", getDefaultCodeTools),
];
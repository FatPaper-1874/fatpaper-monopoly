/**
 * Export all MCP tools
 *
 * This module exports only the core functionality needed for MCP service:
 * - Chance Cards
 * - Roles
 * - Map Events (including linking)
 * - Game Phases
 * - Extra Libs
 * - Resources
 *
 * Note: All CRUD operations go through Service Layer to ensure consistency.
 * UI forms also use Service Layer directly, providing a unified API.
 */

export { chanceCardTools } from "./chance-cards.js";
export { roleTools } from "./roles.js";
export { mapEventTools } from "./map-events.js";
export { gamePhaseTools } from "./game-phases.js";
export { extraLibsTools } from "./extra-libs.js";
export { typeLibsTools } from "./type-libs.js";
export { resourceTools } from "./resources.js";
export { mapItemTools } from "./map-items.js";
export { mapItemTypeTools } from "./map-item-types.js";
export { mapPathTools } from "./map-paths.js";
export { mapChangeTools } from "./map-changes.js";
export { propertyTools } from "./properties.js";
export { gameSettingTools } from "./game-settings.js";
export { systemTools } from "./system.js";
export { allTools } from "./registry.js";
export { uiTemplateTools } from "./ui-templates.js";
export { customUITools } from "./custom-uis.js";
export { modifierTemplateTools } from "./modifier-templates.js";
export { validateEffectCodeTools } from "./validate-effect-code.js";
export { validateMapTools } from "./validate-map.js";
export { getCodeTemplateTools } from "./get-code-template.js";
export { getDefaultCodeTools } from "./get-default-code.js";

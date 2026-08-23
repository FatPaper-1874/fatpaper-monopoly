/**
 * IPC Bridge for MCP Server to communicate with Pinia Stores
 *
 * In the Electron main process, this bridge will communicate with
 * the renderer process to access Pinia stores.
 */

// MCP服务只支持6个核心功能: 机会卡、地块事件、角色、游戏流程、额外库、资源管理
export type MCPToolName =
	// Chance card tools
	| "add_chance_card"
	| "update_chance_card"
	| "remove_chance_card"
	| "get_chance_card_by_id"
	| "list_chance_cards"
	// Map event tools
	| "add_map_event"
	| "update_map_event"
	| "remove_map_event"
	| "get_map_event_by_id"
	| "list_map_events"
	// Role tools
	| "add_role"
	| "update_role"
	| "remove_role"
	| "get_role_by_id"
	| "list_roles"
	// Game phase tools
	| "get_phases"
	| "get_phase_by_id"
	| "add_phase"
	| "remove_phase"
	| "update_phase"
	// Extra libs tools
	| "get_extra_libs"
	| "update_extra_libs"
	| "get_all_type_libs"
	| "list_type_libs"
	| "get_type_lib"
	// Resource tools
	| "list_models"
	| "list_images"
	| "get_resource_by_id"
	| "add_temp_model"
	| "add_temp_image"
	| "list_resources"
	// Map item tools
	| "list_map_items"
	| "get_map_item"
	| "query_map_items"
	| "plan_map_changes"
	| "apply_map_changes"
	// Map path tools
	| "get_map_path_graph"
	| "list_map_paths"
	| "get_map_path"
	| "add_map_path"
	| "update_map_path"
	| "remove_map_path"
	| "replace_map_paths"
	| "update_map_path_settings"
	// Property tools
	| "add_property"
	| "update_property"
	| "remove_property"
	| "get_property_by_map_item_id"
	| "list_properties"
	// Game setting tools
	| "get_game_setting"
	| "list_game_settings"
	| "add_game_setting"
	| "update_game_setting"
	| "remove_game_setting"
	// UI Template tools
	| "create_ui_template"
	| "update_ui_template"
	| "remove_ui_template"
	| "get_ui_template"
	| "list_ui_templates"
	// Custom UI tools
	| "create_custom_ui"
	| "update_custom_ui"
	| "remove_custom_ui"
	| "get_custom_ui"
	| "list_custom_uis"
	// Modifier Template tools
	| "create_modifier_template"
	| "update_modifier_template"
	| "remove_modifier_template"
	| "get_modifier_template"
	| "list_modifier_templates"
	// System tools
	| "check_mcp_connection"
	// Validate tools
	| "validate_effect_code"
	| "validate_map";

/**
 * MCP tool handler type
 */
export type MCPToolHandler = (args: any) => Promise<any>;

/**
 * Bridge interface for accessing Pinia stores from main process
 *
 * In production, this will be implemented via IPC communication
 * with the renderer process.
 */
export interface IPCBridge {
	/**
	 * Invoke a tool in the renderer process
	 */
	invokeTool: (toolName: MCPToolName, args: any) => Promise<any>;

	/**
	 * Send a message to the renderer process
	 */
	sendMessage: (channel: string, data: any) => void;

	/**
	 * Register a handler for messages from renderer
	 */
	onMessage: (channel: string, callback: (data: any) => void) => void;
}

/**
 * Create a mock bridge for testing (used when not in Electron)
 */
export function createMockBridge(): IPCBridge {
	return {
		invokeTool: async (toolName, args) => {
			console.log(`[Mock Bridge] Invoking tool: ${toolName}`, args);
			return { success: false, error: "Not implemented in mock bridge" };
		},
		sendMessage: (channel, data) => {
			console.log(`[Mock Bridge] Send message: ${channel}`, data);
		},
		onMessage: (channel, callback) => {
			console.log(`[Mock Bridge] Register handler: ${channel}`);
		},
	};
}

let currentBridge: IPCBridge | null = null;

/**
 * Set the current bridge instance
 */
export function setBridge(bridge: IPCBridge) {
	currentBridge = bridge;
}

/**
 * Get the current bridge instance
 */
export function getBridge(): IPCBridge {
	if (!currentBridge) {
		// Return mock bridge for testing
		return createMockBridge();
	}
	return currentBridge;
}

/**
 * Invoke a tool through the bridge
 */
export async function invokeTool(toolName: MCPToolName, args: any = {}): Promise<any> {
	const bridge = getBridge();
	return await bridge.invokeTool(toolName, args);
}

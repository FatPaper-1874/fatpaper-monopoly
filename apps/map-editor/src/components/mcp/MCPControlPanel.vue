<template>
	<a-modal v-model:open="visible" title="MCP 服务器控制" width="600px" :footer="null">
		<div class="mcp-control-panel-content">
			<!-- Server Status Card -->
			<a-card size="small" style="margin-bottom: 16px">
				<template #title>
					<a-space>
						<span>服务器状态</span>
						<a-tag :color="serverRunning ? 'success' : 'default'">
							{{ serverRunning ? "运行中" : "已停止" }}
						</a-tag>
					</a-space>
				</template>

				<div class="controls">
					<a-space>
						<span style="font-size: 12px; color: #666">端口</span>
						<a-input-number
							v-model:value="mcpPort"
							:min="1"
							:max="65535"
							:precision="0"
							:disabled="serverRunning || loading"
							size="small"
							style="width: 100px"
						/>
						<a-button v-if="!serverRunning" type="primary" size="small" @click="startServer" :loading="loading">
							<template #icon>
								<font-awesome-icon style="margin-right: 5px" icon="fa-solid fa-play" />
							</template>
							启动服务器
						</a-button>
						<a-button v-else danger size="small" @click="stopServer" :loading="loading">
							<template #icon>
								<font-awesome-icon style="margin-right: 5px" icon="fa-solid fa-stop" />
							</template>
							停止服务器
						</a-button>
						<a-button size="small" @click="refreshStatus">
							<template #icon>
								<font-awesome-icon icon="fa-solid fa-rotate" />
							</template>
							刷新
						</a-button>
					</a-space>
				</div>

				<a-alert
					v-if="message"
					:message="message"
					:type="messageType"
					show-icon
					style="margin-top: 12px"
					closable
					@close="message = ''"
				/>

				<!-- URL Display Section -->
				<div v-if="serverRunning && serverUrl" class="server-url-section">
					<a-divider style="margin: 12px 0" />
					<div class="url-display">
						<div class="url-label">服务器 URL:</div>
						<a-input
							:value="serverUrl"
							readonly
							size="small"
							style="margin-top: 8px"
						>
							<template #suffix>
								<a-tooltip title="复制 URL">
									<a-button
										type="text"
										size="small"
										@click="copyUrl"
									>
										<template #icon>
											<font-awesome-icon icon="fa-solid fa-copy" />
										</template>
									</a-button>
								</a-tooltip>
							</template>
						</a-input>

						<!-- AI Connection Prompt -->
						<div class="connection-instruction" style="margin-top: 12px">
							<div style="font-size: 11px; color: #666; margin-bottom: 4px">
								复制以下提示语给 AI，让它自动配置 MCP 服务:
							</div>
							<a-typography-paragraph
								:copyable="{ text: connectionPrompt }"
								style="margin: 0; padding: 8px; background: #f5f5f5; border-radius: 4px; white-space: pre-wrap"
							>
								<span style="font-size: 12px">{{ connectionPrompt }}</span>
							</a-typography-paragraph>
						</div>
					</div>
				</div>
			</a-card>

			<!-- Available Tools List -->
			<a-card size="small" title="可用工具">
				<template #extra>
					<a-space>
						<a-tag v-if="!toolsLoading" color="blue">{{ tools.length }} 个工具</a-tag>
						<a-tag v-else color="processing">加载中...</a-tag>
						<a-button v-if="serverRunning" size="small" @click="loadTools" :loading="toolsLoading">
							<template #icon>
								<font-awesome-icon icon="fa-solid fa-rotate" />
							</template>
						</a-button>
					</a-space>
				</template>

				<a-input v-model:value="searchText" placeholder="搜索工具..." size="small" style="margin-bottom: 12px">
					<template #prefix>
						<font-awesome-icon icon="fa-solid fa-magnifying-glass" />
					</template>
				</a-input>

				<div v-if="toolsLoading && tools.length === 0" class="tools-loading">
					<a-spin size="small" />
					<span style="margin-left: 8px; font-size: 12px; color: #999">正在加载工具列表...</span>
				</div>

				<div v-else-if="tools.length === 0" class="tools-empty">
					<a-empty :image-style="{ height: '60px' }" description="暂无可用工具">
						<template #description>
							<span style="font-size: 12px; color: #999">请先启动 MCP 服务器</span>
						</template>
					</a-empty>
				</div>

				<div v-else class="tools-list">
					<a-collapse size="small" ghost>
						<a-collapse-panel v-for="category in categorizedTools" :key="category.name" :header="category.name">
							<a-list size="small" :data-source="category.tools" style="max-height: 300px; overflow-y: auto">
								<template #renderItem="{ item }">
									<a-list-item>
										<a-list-item-meta>
											<template #title>
												<code>{{ item.name }}</code>
											</template>
											<template #description>
												<span style="font-size: 11px; color: #666">{{ item.description }}</span>
											</template>
										</a-list-item-meta>
									</a-list-item>
								</template>
							</a-list>
						</a-collapse-panel>
					</a-collapse>
				</div>
			</a-card>
		</div>
	</a-modal>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";

interface MCPTool {
	name: string;
	category: string;
	description: string;
}

const visible = defineModel({ default: false });

const serverRunning = ref(false);
const serverUrl = ref<string | null>(null);
const mcpPort = ref<number>(3000);
const loading = ref(false);
const message = ref("");
const messageType = ref<"success" | "error" | "info">("info");
const searchText = ref("");
const toolsLoading = ref(false);

const tools = ref<MCPTool[]>([]);

// Function to categorize tools based on their name
// MCP服务只支持6个核心功能: 机会卡、地块事件、角色、游戏流程、额外库、资源管理
function getCategory(toolName: string): string {
	if (toolName.includes("chance_card")) return "机会卡";
	if (toolName.includes("map_event")) return "地块事件";
	if (toolName.includes("role")) return "角色";
	if (toolName.includes("phase")) return "游戏流程";
	if (toolName.includes("extra_libs")) return "额外库";
	if (toolName.includes("model") || toolName.includes("image") || toolName.includes("resource")) return "资源管理";
	if (toolName.includes("map_item")) return "地图项";
	if (toolName.includes("property")) return "地皮";
	if (toolName.includes("game_setting")) return "游戏参数";
	if (toolName.includes("ui_template")) return "UI模板";
	if (toolName.includes("custom_ui")) return "自定义UI";
	if (toolName.includes("link") || toolName.includes("unlink")) return "地块事件"; // link/unlink 是事件相关功能
	return "其他";
}

// Load tools dynamically from MCP server
async function loadTools() {
	console.log("[MCP Vue] Loading tools from MCP server...");
	toolsLoading.value = true;
	try {
		const result = await (window as any).mcpAPI?.getMCPTools();
		console.log("[MCP Vue] Tools loaded:", result);

		if (result && Array.isArray(result)) {
			tools.value = result.map((tool: any) => ({
				name: tool.name,
				category: tool.category || getCategory(tool.name),
				description: tool.description || "暂无描述",
			}));
			console.log("[MCP Vue] Processed tools:", tools.value);
		} else {
			console.error("[MCP Vue] Invalid tools response:", result);
			showMessage("获取工具列表失败", "error");
		}
	} catch (error: any) {
		console.error("[MCP Vue] Failed to load tools:", error);
		showMessage("加载工具列表出错: " + error.message, "error");
	} finally {
		toolsLoading.value = false;
	}
}

// Group tools by category
const categorizedTools = computed(() => {
	const grouped = tools.value.reduce(
		(acc, tool) => {
			if (!acc[tool.category]) {
				acc[tool.category] = [];
			}
			acc[tool.category].push(tool);
			return acc;
		},
		{} as Record<string, MCPTool[]>,
	);

	// Filter by search text
	if (searchText.value) {
		const searchLower = searchText.value.toLowerCase();
		Object.keys(grouped).forEach((category) => {
			grouped[category] = grouped[category].filter(
				(tool) => tool.name.toLowerCase().includes(searchLower) || tool.description.toLowerCase().includes(searchLower),
			);
		});
	}

	// Convert to array and sort
	return Object.entries(grouped)
		.filter(([, tools]) => tools.length > 0)
		.map(([name, tools]) => ({ name, tools }))
		.sort((a, b) => a.name.localeCompare(b.name, "zh"));
});

// Generate a client-agnostic prompt for AI assistants to configure the MCP server.
const connectionPrompt = computed(() => {
	if (!serverUrl.value) return "";
	return `请帮我为当前 AI 客户端安装并配置名为 mine-monopoly-mcp 的 MCP 服务器。

服务器使用 Streamable HTTP 传输，地址为：${serverUrl.value}

请优先使用你内置的 MCP 安装或配置工具；如果没有，请按当前客户端支持的方式添加此服务器配置。保留已有 MCP 配置不变。配置完成后连接该服务，并调用 check_mcp_connection 工具验证连接是否成功；若需要我授权、重启或手动操作，请明确告诉我。`;
});

async function startServer() {
	console.log("[MCP Vue] startServer called");
	loading.value = true;
	message.value = "";

	try {
		console.log("[MCP Vue] Calling mcpAPI.startMCPServer() with port:", mcpPort.value);
		const result = await (window as any).mcpAPI?.startMCPServer(mcpPort.value);
		console.log("[MCP Vue] Result from main:", result);

		if (result?.success) {
			serverRunning.value = true;
			serverUrl.value = result.url || null;
			if (typeof result.port === "number") {
				mcpPort.value = result.port;
			}
			console.log("[MCP Vue] Server state updated - running:", serverRunning.value, "url:", serverUrl.value);
			showMessage(result.message || "MCP 服务器已启动", "success");
			// Load tools after server starts
			await loadTools();
		} else {
			console.log("[MCP Vue] Server start failed");
			showMessage("启动 MCP 服务器失败", "error");
		}
	} catch (error: any) {
		console.error("[MCP Vue] Error starting server:", error);
		showMessage(error.message || "启动服务器出错", "error");
	} finally {
		loading.value = false;
	}
}

async function stopServer() {
	loading.value = true;
	message.value = "";

	try {
		const result = await (window as any).mcpAPI?.stopMCPServer();
		if (result?.success) {
			serverRunning.value = false;
			serverUrl.value = null;
			showMessage(result.message || "MCP 服务器已停止", "success");
		} else {
			showMessage("停止 MCP 服务器失败", "error");
		}
	} catch (error: any) {
		showMessage(error.message || "停止服务器出错", "error");
	} finally {
		loading.value = false;
	}
}

async function refreshStatus() {
	try {
		const result = await (window as any).mcpAPI?.getMCPStatus();
		serverRunning.value = result?.running || false;
		serverUrl.value = result?.url || null;
		if (typeof result?.port === "number") {
			mcpPort.value = result.port;
		}
	} catch (error) {
		console.error("Failed to get MCP status:", error);
	}
}

async function copyUrl() {
	if (serverUrl.value) {
		try {
			await navigator.clipboard.writeText(serverUrl.value);
			showMessage('URL 已复制到剪贴板', 'success');
		} catch (error) {
			showMessage('复制失败', 'error');
		}
	}
}

function showMessage(msg: string, type: "success" | "error" | "info") {
	message.value = msg;
	messageType.value = type;
}

let cleanupStatusListener: (() => void) | null = null;
let cleanupErrorListener: (() => void) | null = null;

onMounted(async () => {
	console.log("[MCP Vue] Component mounted");
	await refreshStatus();

	// Load tools from MCP server
	await loadTools();

	// Listen for server status changes from main process
	if ((window as any).mcpAPI?.onServerStatusChange) {
		console.log("[MCP Vue] Registering status change listener");
		cleanupStatusListener = (window as any).mcpAPI.onServerStatusChange((status: { running: boolean; url?: string; port?: number }) => {
			console.log("[MCP Vue] Status changed:", status);
			serverRunning.value = status.running;
			serverUrl.value = status.url || null;
			if (typeof status.port === "number") {
				mcpPort.value = status.port;
			}
		});
	} else {
		console.log("[MCP Vue] ERROR: mcpAPI.onServerStatusChange not available!");
	}

	// Listen for server errors
	if ((window as any).mcpAPI?.onServerError) {
		cleanupErrorListener = (window as any).mcpAPI.onServerError((error: { error: string }) => {
			console.error("[MCP Vue] Server error:", error);
			showMessage(error.error || "MCP 服务器错误", "error");
		});
	}
});

onUnmounted(() => {
	if (cleanupStatusListener) {
		cleanupStatusListener();
	}
	if (cleanupErrorListener) {
		cleanupErrorListener();
	}
});

// Expose state to parent component
defineExpose({
	serverRunning,
	serverUrl,
});
</script>

<style scoped>
.mcp-control-panel-content {
	display: flex;
	flex-direction: column;
	height: 70vh;
	gap: 12px;
	overflow-y: auto;
}

.controls {
	display: flex;
	justify-content: flex-start;
	align-items: center;
}

.tools-list {
	border: 1px solid #f0f0f0;
	border-radius: 6px;
	padding: 8px;
	background: #fafafa;
}

.tools-loading {
	display: flex;
	justify-content: center;
	align-items: center;
	padding: 24px;
	color: #999;
	font-size: 12px;
}

.tools-empty {
	padding: 24px 0;
}

:deep(.ant-list-item) {
	padding: 8px 0;
	border-bottom: 1px solid #f0f0f0;
}

:deep(.ant-list-item:last-child) {
	border-bottom: none;
}

:deep(code) {
	background: #f5f5f5;
	padding: 2px 6px;
	border-radius: 3px;
	font-size: 12px;
	color: #c7254e;
}

:deep(.ant-collapse-ghost > .ant-collapse-item > .ant-collapse-header) {
	padding: 8px 12px;
	font-weight: 600;
}

:deep(.ant-collapse-ghost > .ant-collapse-item > .ant-collapse-content > .ant-collapse-content-box) {
	padding: 8px 12px;
}

.server-url-section {
	margin-top: 12px;
}

.url-display {
	background: #f9f9f9;
	padding: 12px;
	border-radius: 6px;
	border: 1px solid #e8e8e8;
}

.url-label {
	font-size: 12px;
	font-weight: 600;
	color: #333;
}

.connection-instruction code {
	background: transparent;
	padding: 0;
	color: #c7254e;
	word-break: break-all;
}
</style>

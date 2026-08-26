/**
 * 平台初始化入口
 *
 * 根据运行时环境动态加载对应平台实现，
 * 将 platformAPI / updateAPI 注入到 window 上。
 */
import { getPlatformType } from "@src/utils/platform";

let initialized = false;

/**
 * 初始化当前平台
 *
 * 在应用启动时调用一次，确保所有平台 API 可用。
 */
export async function initPlatform(): Promise<void> {
	if (initialized) return;
	initialized = true;

	const type = getPlatformType();

	try {
		switch (type) {
		case "electron": {
			const { createElectronPlatform } = await import("./electron");
			window.platformAPI = createElectronPlatform();
			break;
		}

		case "capacitor": {
			const { createCapacitorPlatform, createCapacitorUpdateAPI } = await import("./capacitor");
			window.platformAPI = createCapacitorPlatform();
			window.updateAPI = createCapacitorUpdateAPI();
			break;
		}

		default: {
			const { createWebPlatform } = await import("./web");
			const { createWebUpdateAPI } = await import("./web/update");
			window.platformAPI = createWebPlatform();
			window.updateAPI = createWebUpdateAPI();
			break;
		}
		}
	} catch (err) {
		console.error(`[Platform] 初始化失败 (${type}):`, err);
		if (type !== "web") {
			const { createWebPlatform } = await import("./web");
			window.platformAPI = createWebPlatform();
		}
	}

}

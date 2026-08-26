/**
 * Web 平台更新 API 实现
 *
 * 纯 Web 环境无自动更新能力，所有方法为空操作。
 */
import type { UpdateAPI } from "../types";

/** Web 平台 UpdateAPI：无自动更新能力 */
export function createWebUpdateAPI(): UpdateAPI {
	return {
		checkForUpdate: async () => {
		},
		startDownload: async () => {
		},
		quitAndInstall: async () => {
		},
		onUpdateStatus: () => {
			return () => {};
		},
	};
}

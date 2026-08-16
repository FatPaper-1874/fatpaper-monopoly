import { env } from "@mine-monopoly/env";
import type { ApiResponse, GameMapChangelogEntry } from "@mine-monopoly/types";

const getApiBaseUrl = () => {
	const protocol = env("PROTOCOL");
	const domain = env("MONOPOLY_DOMAIN");
	const port = env<number>("SERVER_PORT");
	const prefix = env("API_BASE_PREFIX", "");
	return prefix ? `${protocol}://${domain}${prefix}` : `${protocol}://${domain}:${port}`;
};

export const DEFAULT_MAP_UPLOAD_SIZE_LIMIT_MB = 50;

export const DEFAULT_MAP_UPLOAD_DAILY_LIMIT = 3;

async function parseResponse<T>(response: Response): Promise<T> {
	const json = await response.json() as ApiResponse<T>;
	if (!response.ok || json.status !== 200) {
		const error = new Error(json.msg || "请求失败");
		(error as any).status = response.status;
		(error as any).data = json.data;
		throw error;
	}
	return json.data;
}

export async function getMapKeyInfo(apiKey: string) {
	const response = await fetch(`${getApiBaseUrl()}/game-map/key/info`, {
		headers: { "X-Api-Key": apiKey },
	});
	return parseResponse<{ username: string; quota: number | null; used: number; uploadSizeLimit: number | null; dailyUploadLimit: number | null; todayUploaded: number }>(response);
}

export async function getUploadedMapStatus(apiKey: string, mapId: string) {
	const response = await fetch(`${getApiBaseUrl()}/game-map/status?mapId=${encodeURIComponent(mapId)}`, {
		headers: { "X-Api-Key": apiKey },
	});
	return parseResponse<{ status: string; rejectReason: string | null; version: number; changelog: GameMapChangelogEntry[] }>(response);
}

export function uploadUserMap(
	apiKey: string,
	formData: FormData,
	onProgress?: (percent: number) => void,
) {
	return new Promise<{ serverMapId: string }>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", `${getApiBaseUrl()}/game-map/key/upload`);
		xhr.setRequestHeader("X-Api-Key", apiKey);
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
		};
		xhr.onload = () => {
			try {
				const json = JSON.parse(xhr.responseText) as ApiResponse<{ serverMapId: string }>;
				if (xhr.status >= 200 && xhr.status < 300 && json.status === 200) {
					resolve(json.data);
					return;
				}
				const error = new Error(json.msg || "上传失败");
				(error as any).status = xhr.status;
				(error as any).data = json.data;
				reject(error);
			} catch (e) {
				reject(e);
			}
		};
		xhr.onerror = () => reject(new Error("网络错误，上传失败"));
		xhr.send(formData);
	});
}

export async function sha256Hex(data: Uint8Array) {
	const hashBuffer = await crypto.subtle.digest("SHA-256", data as BufferSource);
	return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
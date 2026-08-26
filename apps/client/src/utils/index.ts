import { FormSchema } from "@mine-monopoly/types";
import { isEqual } from "lodash";
import * as THREE from "three";
import * as ts from "typescript";

export const lightenColor = (hexColor: string, amount: number): string => {
	// Remove the '#' character from the beginning of the string
	hexColor = hexColor.slice(1);

	// Convert the hex color to RGB
	const r = parseInt(hexColor.slice(0, 2), 16);
	const g = parseInt(hexColor.slice(2, 4), 16);
	const b = parseInt(hexColor.slice(4, 6), 16);

	// Calculate the new RGB values by decreasing each by the specified amount
	const newR = Math.max(r - amount, 0);
	const newG = Math.max(g - amount, 0);
	const newB = Math.max(b - amount, 0);

	// Convert the new RGB values back to hex
	const newHexColor = `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB
		.toString(16)
		.padStart(2, "0")}`;

	return newHexColor;
};

export function adjustColorBrightness(hex: string, percent: number): string {
	// 移除 '#' 符号
	hex = hex.replace(/^#/, "");

	// 将 3 字符 HEX 转为 6 字符 HEX
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((char) => char + char)
			.join("");
	}

	// 将 HEX 转换为 RGB
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	// 调整颜色的亮度
	const adjust = (color: number) => Math.min(255, Math.max(0, Math.floor(color * (1 + percent / 100))));

	const newR = adjust(r);
	const newG = adjust(g);
	const newB = adjust(b);

	// 转回 HEX 格式
	const toHex = (color: number) => color.toString(16).padStart(2, "0");

	return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

export function adjustColorAuto(hex: string, percent: number): string {
	// 移除 '#' 符号
	hex = hex.replace(/^#/, "");

	// 将 3 字符 HEX 转为 6 字符 HEX
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((char) => char + char)
			.join("");
	}

	// 将 HEX 转换为 RGB
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	// 计算当前亮度 (0-255)，使用 YIQ 模型
	const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

	// 设定亮度阈值，判断是增加还是减少亮度
	const threshold = 128;
	const adjustment = brightness < threshold ? percent : -percent;

	// 调整颜色的亮度
	const adjust = (color: number) => Math.min(255, Math.max(0, Math.floor(color * (1 + adjustment / 100))));

	const newR = adjust(r);
	const newG = adjust(g);
	const newB = adjust(b);

	// 转回 HEX 格式
	const toHex = (color: number) => color.toString(16).padStart(2, "0");

	return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

export function getRandomInteger(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function arrayBufferToImgUrl(buffer: number[]): string {
	return (
		"data:image/png;base64," +
		window.btoa(new Uint8Array(buffer).reduce((res, byte) => res + String.fromCharCode(byte), ""))
	);
}

export function shuffleArray<T>(arr: T[]) {
	return arr.sort(function () {
		return 0.5 - Math.random();
	});
}

export function randomString(length: number) {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let randomString = "";
	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * characters.length);
		randomString += characters.charAt(randomIndex);
	}
	return randomString;
}

export function throttle(fn: Function, interval: number) {
	let lastTime = Date.now();
	//@ts-ignore
	const _this = this;

	return function (...args: any[]) {
		if (Date.now() >= interval + lastTime) {
			lastTime = Date.now();
			fn.apply(_this, args);
		}
	};
}

export function debounce(fn: (...args: any[]) => void, delay_ms: number): () => void;
export function debounce(
	fn: (...args: any[]) => void,
	delay_ms: number,
	needCancel: boolean,
): { fn: (...args: any[]) => void; cancel: () => void };
export function debounce(fn: (...args: any[]) => void, delay_ms: number, needCancel: boolean = false) {
	let timer: ReturnType<typeof setTimeout>;

	if (needCancel) {
		return {
			fn: function (...args: any[]) {
				clearTimeout(timer);
				timer = setTimeout(() => {
					fn(...args);
				}, delay_ms);
			},
			cancel: function () {
				clearTimeout(timer);
			},
		};
	} else {
		return function (...args: any[]) {
			clearTimeout(timer);
			timer = setTimeout(() => {
				fn(...args);
			}, delay_ms);
		};
	}
}

export function getScreenPosition(object3D: THREE.Object3D, camera: THREE.Camera) {
	if (!object3D) return new THREE.Vector2();
	const tempPosition = new THREE.Vector3(0, 0, 0);
	object3D.getWorldPosition(tempPosition);
	tempPosition.project(camera);
	return new THREE.Vector2(tempPosition.x, -tempPosition.y);
}

export type LandscapeFullscreenResult = {
	fullscreen: boolean;
	orientationLocked: boolean;
	isLandscape: boolean;
	error?: unknown;
};

type LockableScreenOrientation = ScreenOrientation & {
	lock?: (orientation: "landscape" | "landscape-primary" | "landscape-secondary") => Promise<void>;
	unlock?: () => void;
};

export async function requestFullScreen(element: HTMLElement = document.documentElement) {
	if (element.requestFullscreen) {
		await element.requestFullscreen();
		//@ts-ignore
	} else if (element.mozRequestFullScreen) {
		// 兼容Firefox
		//@ts-ignore
		await element.mozRequestFullScreen();
		//@ts-ignore
	} else if (element.webkitRequestFullscreen) {
		// 兼容Chrome和Safari
		//@ts-ignore
		await element.webkitRequestFullscreen();
	}
}

export async function requestLandscapeFullscreen(
	element: HTMLElement = document.documentElement,
): Promise<LandscapeFullscreenResult> {
	let orientationLocked = false;
	let error: unknown;

	try {
		if (!isFullScreen()) {
			await requestFullScreen(element);
		}
	} catch (err) {
		error = err;
	}

	try {
		const orientation = screen.orientation as LockableScreenOrientation | undefined;
		if (orientation && typeof orientation.lock === "function") {
			await orientation.lock("landscape");
			orientationLocked = true;
		}
	} catch (err) {
		error ??= err;
	}

	return {
		fullscreen: isFullScreen(),
		orientationLocked,
		isLandscape: isLandscape(),
		error,
	};
}

export async function exitFullScreen() {
	const orientation = screen.orientation as LockableScreenOrientation | undefined;
	if (orientation && typeof orientation.unlock === "function") {
		orientation.unlock();
	}
	if (isFullScreen()) {
		if (document.exitFullscreen) {
			await document.exitFullscreen();
			//@ts-ignore
		} else if (document.mozCancelFullScreen) {
			// 兼容Firefox
			//@ts-ignore
			await document.mozCancelFullScreen();
			//@ts-ignore
		} else if (document.webkitExitFullscreen) {
			// 兼容Chrome和Safari
			//@ts-ignore
			await document.webkitExitFullscreen();
		}
	}
}

export function setTimeOutAsync(delay: number = 1000, fn?: Function) {
	return new Promise((reslove) => {
		setTimeout(() => {
			if (fn) fn();
			reslove("");
		}, delay);
	});
}

export function isMobileDevice() {
	return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isFullScreen() {
	return document.fullscreenElement !== null;
}

export function isLandscape() {
	return window.matchMedia("(orientation: landscape)").matches;
}

export function hexToRgbNormalized(hex: string) {
	// Remove the hash at the start if it's there
	hex = hex.replace(/^#/, "");

	// Parse the r, g, b values
	const bigint = parseInt(hex, 16);
	const r = (bigint >> 16) & 255;
	const g = (bigint >> 8) & 255;
	const b = bigint & 255;

	// Convert to 0-1 range
	const rNormalized = r / 255;
	const gNormalized = g / 255;
	const bNormalized = b / 255;

	return { r: rNormalized, g: gNormalized, b: bNormalized };
}

/**
 * 将字节数格式化为可读大小（B/KB/MB）
 */
export function formatBytes(bytes: number): string {
	if (!bytes || bytes < 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function base64ToFileUrl(base64String: string, type: string) {
	const binaryString = atob(base64String); // Base64 解码为二进制字符串

	// 将二进制字符串转换为 Uint8Array
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	// 创建 Blob 对象
	const blob = new Blob([bytes], { type });

	// 创建临时 URL
	return URL.createObjectURL(blob);
}

export async function copyToClipboard(text: string): Promise<void> {
	if (!navigator.clipboard) {
		console.error("Clipboard API not supported");
		return;
	}

	try {
		await navigator.clipboard.writeText(text);
	} catch (err) {
		console.error("Failed to copy text to clipboard:", err);
	}
}

export function remToPx(rem: number) {
	return rem * parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
}

export function compileTsToJs(code: string, types: string): string {
	types = types.replaceAll("declare", "");
	const fullCode = `${types}\n${code}`;

	// 编译选项，可以根据需求进行调整
	const compilerOptions: ts.TranspileOptions = {
		compilerOptions: {
			module: ts.ModuleKind.None,
			target: ts.ScriptTarget.ES2020,
			strict: true,
			esModuleInterop: true,
			removeComments: true,
			noEmitHelpers: true,
		},
	};

	// 使用 TypeScript 的 transpileModule 函数来编译代码
	const result = ts.transpileModule(fullCode, compilerOptions);

	// 返回编译后的 JavaScript 代码
	return result.outputText;
}

export function compareObjectArrays<T extends Record<string, any>>(
	oldArray: T[],
	newArray: T[],
	idKey: keyof T,
	callback: <Key extends keyof T>(itemId: string, key: Key, oldValue: T[Key], newValue: T[Key]) => void,
): void {
	const oldMap = new Map<string, T>(oldArray.map((item) => [String(item[idKey]), item]));

	newArray.forEach((newItem) => {
		const itemId = String(newItem[idKey]);
		const oldItem = oldMap.get(itemId);
		if (oldItem) {
			const keys = new Set<keyof T>([
				...(Object.keys(oldItem) as Array<keyof T>),
				...(Object.keys(newItem) as Array<keyof T>),
			]);

			keys.forEach((key) => {
				if (!isEqual(newItem[key], oldItem[key])) {
					callback(itemId, key, oldItem[key], newItem[key]);
				}
			});
		}
	});
}

export function getDisplayValueByFormSchema(field: FormSchema, currentValue: any) {
	switch (field.type) {
		case "number-input":
			return currentValue;
			break;
		case "select":
			const selectOption = field.options!.find((o) => o.value === currentValue);
			return selectOption?.label || "获取selectValue失败";
			break;
	}
}

// 注意：不在此处导出音频模块，避免 Worker 环境加载 howler
// 音频模块应通过 `@src/utils/audio` 专门导入
// export * from "./audio";

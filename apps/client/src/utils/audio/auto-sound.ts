import { useAudioManager, SoundName } from "./index";
import { isPC } from "../platform";

// 标记是否已首次交互
let hasFirstInteraction = false;

/**
 * 全局音效自动播放
 * 为所有按钮自动添加点击和悬停音效
 */
export function initAutoSound() {
	const audio = useAudioManager();

	// 防抖配置
	const hoverDebounceMs = 100; // 悬停防抖时间
	const clickDebounceMs = 300; // 点击防抖时间
	const hoverTimers = new WeakMap<Element, number>();
	const clickTimers = new WeakMap<Element, number>();

	// 检查元素是否应该播放音效
	function shouldPlaySound(element: Element): boolean {
		// 检查是否有 data-no-sound 属性
		if (
			element.hasAttribute("data-no-sound") ||
			element.closest("[data-no-sound]")
		) {
			return false;
		}

		// 检查是否禁用
		if (
			element.hasAttribute("disabled") ||
			element.closest("[disabled]") ||
			element.getAttribute("aria-disabled") === "true"
		) {
			return false;
		}

		return true;
	}

	// 首次用户交互时播放背景音乐
	function playBGMOnFirstInteraction() {
		if (!hasFirstInteraction) {
			hasFirstInteraction = true;
			// 淡入背景音乐
			audio.fadeInBGM(2);
		}
	}

	// 检查是否是 Electron 环境
	// isPC() 内部已通过 electronAPI 完成 Electron 检测
	const isElectron = isPC();

	// Electron 环境：立即播放背景音乐（无需用户交互）
	if (isElectron) {
		// 延迟一点确保音频管理器已初始化
		setTimeout(() => {
			// 始终播放背景音乐，AudioManager 会根据静音状态控制音量
			audio.fadeInBGM(2);
			const volumeConfig = audio.getVolumeConfig();
			const isMuted = volumeConfig.muted || volumeConfig.masterMuted || volumeConfig.bgmMuted;
			hasFirstInteraction = true;
		}, 500);
	}

	// 全局点击事件监听
	document.addEventListener(
		"click",
		(e) => {
			const target = e.target;

			// 检查 target 是否有效
			if (!target || typeof (target as Element).closest !== "function") {
				return;
			}

			// 非 Electron 环境：首次点击时播放背景音乐
			if (!isElectron) {
				playBGMOnFirstInteraction();
			}

			const button = (target as Element).closest(
				"button, .ant-btn, [role='button']"
			);

			if (button && shouldPlaySound(button)) {
				const now = Date.now();
				const lastClick = clickTimers.get(button) || 0;

				// 防抖处理
				if (now - lastClick >= clickDebounceMs) {
					clickTimers.set(button, now);
					audio.playSound(SoundName.BUTTON_CLICK);
				}
			}
		},
		{ capture: true, passive: true }
	);

	// 全局悬停事件监听
	document.addEventListener(
		"mouseenter",
		(e) => {
			const target = e.target;

			// 检查 target 是否有效
			if (!target || typeof (target as Element).closest !== "function") {
				return;
			}

			const button = (target as Element).closest(
				"button, .ant-btn, [role='button']"
			);

			if (button && shouldPlaySound(button)) {
				// 如果鼠标从按钮内的子元素移入另一个子元素，不重复播放
				const relatedTarget = (e as MouseEvent).relatedTarget as Element | null;
				if (relatedTarget && button.contains(relatedTarget)) {
					return;
				}

				const now = Date.now();
				const lastHover = hoverTimers.get(button) || 0;

				// 防抖处理
				if (now - lastHover >= hoverDebounceMs) {
					hoverTimers.set(button, now);
					audio.playSound(SoundName.BUTTON_HOVER);
				}
			}
		},
		{ capture: true, passive: true }
	);

	// 非 Electron 环境：监听键盘事件（备用的首次交互）
	if (!isElectron) {
		document.addEventListener(
			"keydown",
			() => {
				playBGMOnFirstInteraction();
			},
			{ once: true, passive: true }
		);
	}

}

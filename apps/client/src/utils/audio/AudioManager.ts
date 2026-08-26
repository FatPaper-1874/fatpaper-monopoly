import { Howl, Howler } from "howler";
import { SoundConfig, SoundName, VolumeConfig } from "./types";
import { audioConfig, getBGMPath, getSoundPath } from "./config";

/**
 * 音频管理器类
 * 负责播放音效和背景音乐，支持音量控制和静音
 */
class AudioManager {
	/** 音效映射表 */
	private sounds: Map<SoundName, Howl> = new Map();

	/** 背景音乐实例 */
	private bgm: Howl | null = null;

	/** 音量配置 */
	private volumeConfig: VolumeConfig = {
		master: 1,
		sfx: 1,
		bgm: 1,
		muted: false,
		masterMuted: false,
		sfxMuted: false,
		bgmMuted: false,
	};

	/** 背景音乐是否启用 */
	private autoMusic: boolean = true;

	constructor() {
		this.initSounds();
		this.initBGM();
	}

	/**
	 * 初始化所有音效
	 */
	private initSounds(): void {
		audioConfig.sounds.forEach((config: SoundConfig) => {
			const sound = new Howl({
				src: getSoundPath(config.src),
				volume: config.volume || 0.5,
				preload: true,
				loop: config.loop || false,
			});
			this.sounds.set(config.name, sound);
		});
	}

	/**
	 * 初始化背景音乐
	 */
	private initBGM(): void {
		this.bgm = new Howl({
			src: [getBGMPath()],
			volume: 0.5,
			loop: true,
			preload: true,
			autoplay: false,
		});
	}

	/**
	 * 播放指定音效
	 * @param soundName 音效名称
	 * @returns 是否播放成功
	 */
	public playSound(soundName: SoundName): boolean {
		const sound = this.sounds.get(soundName);
		if (!sound) {
			console.warn(`[AudioManager] 音效 "${soundName}" 不存在`);
			return false;
		}

		// 检查是否静音（全局、主音量或音效静音）
		if (this.volumeConfig.muted || this.volumeConfig.masterMuted || this.volumeConfig.sfxMuted) {
			return false;
		}

		// 计算实际音量：主音量 × 音效音量
		const actualVolume = this.volumeConfig.master * this.volumeConfig.sfx;
		sound.volume(actualVolume);
		sound.play();

		return true;
	}

	/**
	 * 播放背景音乐
	 */
	public playBGM(): void {
		if (!this.bgm) {
			return;
		}

		// 检查是否静音（全局、主音量或背景音乐静音）
		if (this.volumeConfig.muted || this.volumeConfig.masterMuted || this.volumeConfig.bgmMuted) {
			// 如果静音，仍然播放但音量为0
			if (!this.bgm.playing()) {
				this.bgm.volume(0);
				this.bgm.play();
			}
			return;
		}

		// 未静音，正常播放
		if (!this.bgm.playing()) {
			const actualVolume = this.volumeConfig.master * this.volumeConfig.bgm;
			this.bgm.volume(actualVolume);
			this.bgm.play();
		}
	}

	/**
	 * 停止背景音乐
	 */
	public stopBGM(): void {
		if (!this.bgm) {
			return;
		}
		this.bgm.stop();
	}

	/**
	 * 暂停背景音乐
	 */
	public pauseBGM(): void {
		if (!this.bgm) {
			return;
		}
		this.bgm.pause();
	}

	/**
	 * 淡入背景音乐
	 * @param duration 淡入时长（秒）
	 */
	public fadeInBGM(duration: number = 1): void {
		if (!this.bgm) {
			return;
		}

		// 检查是否静音
		if (this.volumeConfig.muted || this.volumeConfig.masterMuted || this.volumeConfig.bgmMuted) {
			// 静音状态：播放但音量为0
			if (!this.bgm.playing()) {
				this.bgm.volume(0);
				this.bgm.play();
			} else {
				this.bgm.volume(0);
			}
			return;
		}

		// 未静音：正常淡入播放
		const actualVolume = this.volumeConfig.master * this.volumeConfig.bgm;
		this.bgm.volume(0);
			this.bgm.play();
			this.bgm.fade(0, actualVolume, duration * 1000);
	}

	/**
	 * 淡出背景音乐
	 * @param duration 淡出时长（秒）
	 */
	public fadeOutBGM(duration: number = 1): void {
		if (!this.bgm) {
			return;
		}

		const currentVolume = this.bgm.volume();
		this.bgm.fade(currentVolume, 0, duration * 1000);

		setTimeout(() => {
			this.bgm?.stop();
		}, duration * 1000);
	}

	/**
	 * 设置主音量
	 * @param volume 音量值 (0-1)
	 */
	public setMasterVolume(volume: number): void {
		this.volumeConfig.master = Math.max(0, Math.min(1, volume));
		this.updateAllVolumes();
	}

	/**
	 * 设置音效音量
	 * @param volume 音量值 (0-1)
	 */
	public setSFXVolume(volume: number): void {
		this.volumeConfig.sfx = Math.max(0, Math.min(1, volume));
	}

	/**
	 * 设置背景音乐音量
	 * @param volume 音量值 (0-1)
	 */
	public setBGMVolume(volume: number): void {
		this.volumeConfig.bgm = Math.max(0, Math.min(1, volume));
		if (this.bgm && this.bgm.playing()) {
			// 检查是否静音
			if (this.volumeConfig.muted || this.volumeConfig.masterMuted || this.volumeConfig.bgmMuted) {
				this.bgm.volume(0);
			} else {
				const actualVolume = this.volumeConfig.master * this.volumeConfig.bgm;
				this.bgm.volume(actualVolume);
			}
		}
	}

	/**
	 * 更新所有音频的音量
	 */
	private updateAllVolumes(): void {
		// 更新背景音乐音量
		if (this.bgm && this.bgm.playing()) {
			// 检查是否静音
			if (this.volumeConfig.muted || this.volumeConfig.masterMuted || this.volumeConfig.bgmMuted) {
				this.bgm.volume(0);
			} else {
				const bgmVolume = this.volumeConfig.master * this.volumeConfig.bgm;
				this.bgm.volume(bgmVolume);
			}
		}

		// 音效音量在播放时动态计算，无需更新
	}

	/**
	 * 切换全局静音状态
	 */
	public toggleMute(): void {
		this.volumeConfig.muted = !this.volumeConfig.muted;
		Howler.mute(this.volumeConfig.muted);
		this.updateAllVolumes();
	}

	/**
	 * 设置全局静音状态
	 * @param muted 是否静音
	 */
	public setMute(muted: boolean): void {
		this.volumeConfig.muted = muted;
		Howler.mute(muted);
		this.updateAllVolumes();
	}

	/**
	 * 设置是否自动播放背景音乐
	 * @param autoMusic 是否自动播放
	 */
	public setAutoMusic(autoMusic: boolean): void {
		this.autoMusic = autoMusic;
		if (!autoMusic) {
			this.stopBGM();
		}
	}

	/**
	 * 获取当前音量配置
	 */
	public getVolumeConfig(): VolumeConfig {
		return { ...this.volumeConfig };
	}

	/**
	 * 设置主音量静音状态
	 * @param muted 是否静音
	 */
	public setMasterMuted(muted: boolean): void {
		this.volumeConfig.masterMuted = muted;
		// 立即更新背景音乐音量（如果在播放）
		if (this.bgm && this.bgm.playing()) {
			if (muted) {
				this.bgm.volume(0);
			} else {
				// 取消静音时，检查其他静音状态
				if (this.volumeConfig.muted || this.volumeConfig.bgmMuted) {
					this.bgm.volume(0);
				} else {
					const bgmVolume = this.volumeConfig.master * this.volumeConfig.bgm;
					this.bgm.volume(bgmVolume);
				}
			}
		}
	}

	/**
	 * 设置音效静音状态
	 * @param muted 是否静音
	 */
	public setSFXMuted(muted: boolean): void {
		this.volumeConfig.sfxMuted = muted;
	}

	/**
	 * 设置背景音乐静音状态
	 * @param muted 是否静音
	 */
	public setBGMMuted(muted: boolean): void {
		this.volumeConfig.bgmMuted = muted;
		// 立即更新背景音乐音量
		if (this.bgm && this.bgm.playing()) {
			// 正在播放，只更新音量
			this.bgm.volume(muted ? 0 : this.calculateBGMVolume());
		}
		// 注意：不再自动启动播放，由 initAutoSound 统一管理
	}

	/**
	 * 计算背景音乐实际音量
	 */
	private calculateBGMVolume(): number {
		if (this.volumeConfig.muted || this.volumeConfig.masterMuted || this.volumeConfig.bgmMuted) {
			return 0;
		}
		return this.volumeConfig.master * this.volumeConfig.bgm;
	}

	/**
	 * 获取背景音乐播放状态
	 */
	public isBGMPlaying(): boolean {
		return this.bgm ? this.bgm.playing() : false;
	}

	/**
	 * 停止所有音效
	 */
	public stopAll(): void {
		this.sounds.forEach((sound) => {
			sound.stop();
		});
		this.stopBGM();
	}

	/**
	 * 卸载所有音频资源
	 */
	public unload(): void {
		this.stopAll();
		this.sounds.forEach((sound) => {
			sound.unload();
		});
		this.sounds.clear();
		this.bgm?.unload();
		this.bgm = null;
	}
}

// 创建单例实例
const audioManager = new AudioManager();

/**
 * 获取音频管理器实例
 */
export function useAudioManager(): AudioManager {
	return audioManager;
}

/**
 * 重置音频管理器（用于测试或重新初始化）
 */
export function resetAudioManager(): AudioManager {
	audioManager.unload();
	return new AudioManager();
}

export { AudioManager };
export default audioManager;

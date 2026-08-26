import * as THREE from "three";
import { createApp } from "vue";
import { ChanceCard } from "@mine-monopoly/ui";
import { toCanvas } from "html-to-image";
import { ChanceCardInfo } from "@mine-monopoly/types";
import contentFontLiteUrl from "@src/assets/font/ContentFont.woff2?url";

/**
 * 机会卡纹理生成器
 * 职责：将Vue组件渲染为Canvas纹理
 */
export class ChanceCardTextureGenerator {
	private static textureCache = new Map<string, THREE.CanvasTexture>();
	private static renderContainer: HTMLDivElement | null = null;
	private static MAX_CACHE_SIZE = 50;
	private static iconCache = new Map<string, HTMLImageElement>();
	private static liteFontLoaded = false;

	/**
	 * 预加载子集字体 ContentFontLite，确保渲染时可用
	 */
	static async preloadLiteFont(): Promise<void> {
		if (this.liteFontLoaded) return;
		const fontFace = new FontFace("ContentFontLite", `url(${contentFontLiteUrl})`, {
			style: "normal",
			weight: "normal",
		});
		await fontFace.load();
		document.fonts.add(fontFace);
		this.liteFontLoaded = true;
	}

	/**
	 * 生成机会卡纹理
	 */
	static async generateTexture(
		card: ChanceCardInfo,
		iconUrl: string
	): Promise<THREE.CanvasTexture> {
		const cacheKey = `${card.id}_${card.iconId}`;

		// 检查缓存
		if (this.textureCache.has(cacheKey)) {
			return this.textureCache.get(cacheKey)!;
		}

		try {
			// 1. 创建并挂载Vue组件
			const container = this.ensureRenderContainer();
			const tRender = performance.now();
			const canvas = await this.renderComponentToCanvas(container, card, iconUrl);
			// 2. 创建Three.js纹理
			const texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.minFilter = THREE.LinearFilter;
			texture.magFilter = THREE.LinearFilter;

			// 3. 缓存纹理（超出上限时淘汰最早的）
			if (this.textureCache.size >= this.MAX_CACHE_SIZE) {
				const firstKey = this.textureCache.keys().next().value;
				if (firstKey !== undefined) {
					this.textureCache.get(firstKey)?.dispose();
					this.textureCache.delete(firstKey);
				}
			}
			this.textureCache.set(cacheKey, texture);

			return texture;
		} catch (error) {
			console.error("[ChanceCardTextureGenerator] 生成纹理失败:", error);
			throw error;
		}
	}

	/**
	 * 初始化渲染容器（隐藏的DOM节点）
	 */
	private static ensureRenderContainer(): HTMLDivElement {
		if (!this.renderContainer) {
			this.renderContainer = document.createElement("div");
			this.renderContainer.style.position = "absolute";
			this.renderContainer.style.top = "-9999rem";
			this.renderContainer.style.left = "-9999rem";
			this.renderContainer.style.zIndex = "-1";
			this.renderContainer.style.pointerEvents = "none";
			document.body.appendChild(this.renderContainer);
		}
		return this.renderContainer;
	}

	/**
	 * 渲染Vue组件到Canvas
	 */
	private static async renderComponentToCanvas(
		container: HTMLDivElement,
		card: ChanceCardInfo,
		iconUrl: string
	): Promise<HTMLCanvasElement> {
		return new Promise((resolve, reject) => {
			// 1. 创建Vue应用实例
			const app = createApp(ChanceCard, {
				chanceCard: card,
				iconUrl: iconUrl,
			});

			// 2. 挂载到容器
			const wrapper = document.createElement("div");
			// ⭐ 获取实际的 rem 像素值
			const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);

			// ⭐ 关键修复：在 wrapper 上设置正确的 font-size，确保 rem 使用正确的基准值
			wrapper.style.fontSize = `${rootFontSize}px`;

			// ⭐ 根据组件实际尺寸设置 wrapper 大小（11em × 14em）
			wrapper.style.width = `${11 * rootFontSize}px`;
			wrapper.style.height = `${14 * rootFontSize}px`;
			wrapper.style.position = "relative";

			// ⭐ 使用flex布局确保组件完全居中
			wrapper.style.display = "flex";
			wrapper.style.justifyContent = "center";
			wrapper.style.alignItems = "center";
			wrapper.style.margin = "0";
			wrapper.style.padding = "0";
			wrapper.style.overflow = "hidden";
			wrapper.style.boxSizing = "border-box";

			// 隐藏内部滚动条（html-to-image 会正确渲染滚动条）
			const scrollbarStyle = document.createElement("style");
			scrollbarStyle.textContent = "* { scrollbar-width: none !important; } *::-webkit-scrollbar { display: none !important; }";
			wrapper.appendChild(scrollbarStyle);

			container.appendChild(wrapper);

			app.mount(wrapper);

			// 3. 等待组件完全渲染（包括图片加载）
			let settled = false;
			const cleanup = () => {
				if (settled) return;
				settled = true;
				app.unmount();
				if (container.contains(wrapper)) {
					container.removeChild(wrapper);
				}
			};

			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error("渲染超时：requestAnimationFrame 未触发"));
			}, 5000);

			requestAnimationFrame(async () => {
				clearTimeout(timeout);
				try {
					// 额外等待确保图片加载完成
					await this.waitForImages(wrapper);

					// 隐藏描述区域的滚动条
					wrapper.querySelectorAll(".describe").forEach(el => {
						(el as HTMLElement).style.overflow = "hidden";
					});

					// 强制所有子元素使用子集字体，避免全量字体导致 html-to-image 过慢
					wrapper.querySelectorAll("*").forEach(el => {
						(el as HTMLElement).style.setProperty("font-family", "ContentFontLite", "important");
					});
					wrapper.style.setProperty("font-family", "ContentFontLite", "important");

					// 4. 使用 html-to-image 转换为Canvas
					const tToCanvas = performance.now();
					const canvas = await toCanvas(wrapper, {
						backgroundColor: undefined,
						pixelRatio: 2,
						canvasWidth: wrapper.clientWidth,
						canvasHeight: wrapper.clientHeight,
						style: {
							transform: "none",
							transformOrigin: "top left",
						},
					});
					resolve(canvas);
				} catch (error) {
					reject(error);
				} finally {
					cleanup();
				}
			});
		});
	}

	/**
	 * 等待图片加载完成
	 */
	private static waitForImages(element: HTMLElement): Promise<void> {
		const images = element.querySelectorAll("img");
		const promises = Array.from(images).map((img) => {
			if (img.complete) {
				return Promise.resolve();
			}
			return new Promise<void>((resolve) => {
				img.onload = () => resolve();
				img.onerror = () => {
					console.warn(`[ChanceCardTextureGenerator] 图片加载失败: ${img.src}`);
					resolve();
				};
				// 超时保护
				setTimeout(() => resolve(), 1000);
			});
		});
		return Promise.all(promises).then(() => {});
	}

	/**
	 * 预加载所有图标图片到浏览器缓存
	 * 后续渲染时 waitForImages 中的 img.complete 会直接为 true，消除超时等待
	 */
	static preloadIcons(iconUrls: string[]): Promise<void> {
		const uniqueUrls = [...new Set(iconUrls.filter(Boolean))];
		const promises = uniqueUrls.map(url => {
			if (this.iconCache.has(url)) return Promise.resolve();
			return new Promise<void>((resolve) => {
				const img = new Image();
				img.crossOrigin = "anonymous";
				img.onload = () => {
					this.iconCache.set(url, img);
					resolve();
				};
				img.onerror = () => resolve();
				img.src = url;
			});
		});
		return Promise.all(promises).then(() => {});
	}

	/**
	 * 并发预加载纹理，带进度回调
	 * @param cards - 机会卡数据数组
	 * @param concurrency - 最大并发数（默认4）
	 * @param onProgress - 进度回调 (已完成数, 总数, 卡名)
	 */
	static async preloadTexturesConcurrent(
		cards: Array<{ card: ChanceCardInfo; iconUrl: string }>,
		concurrency: number = 4,
		onProgress?: (completed: number, total: number, cardName: string) => void
	): Promise<void> {
		const total = cards.length;
		let completed = 0;
		let index = 0;

		const processNext = async (): Promise<void> => {
			while (index < cards.length) {
				const currentIndex = index++;
				const { card, iconUrl } = cards[currentIndex];

				try {
					await this.generateTexture(card, iconUrl);
				} catch (error) {
					console.error(`[ChanceCardTextureGenerator] 预加载失败: ${card.name}`, error);
				}

				completed++;
				onProgress?.(completed, total, card.name);
			}
		}

		const workers = Array.from(
			{ length: Math.min(concurrency, total) },
			() => processNext()
		);
		await Promise.all(workers);

	}

	/**
	 * 清理纹理缓存
	 */
	static clearCache() {
		this.textureCache.forEach((texture) => {
			texture.dispose();
		});
		this.textureCache.clear();
		this.iconCache.clear();

		// 清理渲染容器
		if (this.renderContainer && document.body.contains(this.renderContainer)) {
			document.body.removeChild(this.renderContainer);
			this.renderContainer = null;
		}
	}
}

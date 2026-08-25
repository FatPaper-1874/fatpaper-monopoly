import * as THREE from "three";
import gsap from "gsap";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
	ChanceCardInfo,
	ChatMessage,
	ChatMessageType,
	MapItemType,
	MapItem,
	PlayerInfo,
	PropertyInfo,
	GameMap,
	DiceResult,
	MapMovementSegment,
} from "@mine-monopoly/types";
import { useChat, useDeviceStatus, useLoading, useSettig, useUtil } from "@src/store";
import { getCurrentClientPlayerId } from "@src/store/local-party";
import { Component, ComponentPublicInstance, createApp, watch, WatchStopHandle } from "vue";
import { loadItemTypeModules } from "@src/utils/three/itemtype-loader";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer";
import PropertyInfoCard from "@src/views/game/utils/components/property-info-card.vue";
import MapEventCard from "@src/views/game/utils/components/map-event-card.vue";
import moneyPopTip from "@src/views/game/components/money-pop-tip.vue";
import MoneyParticle3D from "@src/views/game/components/money-particle-3d.vue";
import PlayerSpeechBubble3D from "@src/views/game/components/player-speech-bubble-3d.vue";
import { loadHouseModels } from "@src/views/game/utils/house-loader";
import { debounce, getScreenPosition, isMobileDevice, throttle } from "@src/utils";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass";
import useEventBus from "@src/utils/event-bus";
import { GammaCorrectionShader } from "three/examples/jsm/shaders/GammaCorrectionShader";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { storeToRefs } from "pinia";
import { __PROTOCOL__ } from "@src/../global.config";
import { TextSprite } from "../three/TextSprite";
import { ChanceCard3D } from "../three/ChanceCard3D";
import { ChanceCardTextureGenerator } from "../three/ChanceCardTextureGenerator";
import { useGameData, useMapData, useResourceStore } from "@src/store/game";
import { useAudioManager } from "@src/utils/audio/AudioManager";
import { SoundName } from "@src/utils/audio/types";
import { getModelById } from "@src/utils/file/game-map";
import { PlayerModel, AnimationManager } from "@mine-monopoly/utils";
import { DiceManager } from "./DiceManager";
import { loadModel } from "@src/utils/three/model-loader";
import { type GameInitStage, wrapGameInitError } from "@src/utils/game-init-diagnostics";
import { clone } from "lodash";
import { getDracoLoader } from "@src/utils/draco/draco";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { MapPathChoiceSceneController, setMapPathChoiceArrowFactory } from "./MapPathChoiceSceneController";

const PLAY_MODEL_SIZE = 0.7;
const loadingMask = useLoading();
const SPEECH_BUBBLE_ANCHOR_Y = PLAY_MODEL_SIZE * 1.6;
const SPEECH_BUBBLE_MARGIN = 18;
const SPEECH_BUBBLE_STACK_GAP = 10;
const SPEECH_BUBBLE_SCREEN_OFFSET_Y = 4;
const MIN_SPEECH_BUBBLE_WIDTH = 120;
const MIN_SPEECH_BUBBLE_HEIGHT = 56;

type SpeechBubbleEdge = "top" | "right" | "bottom" | "left";

type ActiveSpeechBubble = {
	containerEl: HTMLDivElement;
	rootEl: HTMLElement;
	unmount: () => void;
	timeoutId: number;
};

type ActiveThinkingMarker = {
	sprite: THREE.Sprite;
	spinTween: gsap.core.Tween;
};

type SpeechBubblePlacement = {
	playerId: string;
	containerEl: HTMLDivElement;
	rootEl: HTMLElement;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
	offscreen: boolean;
	edge: SpeechBubbleEdge;
};

export class GameRenderer {
	private mapData: GameMap;
	private container: HTMLDivElement;
	private canvas: HTMLCanvasElement;
	private renderer: THREE.WebGLRenderer;
	private popElementRenderer: CSS2DRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private composer: EffectComposer;
	private renderPass: RenderPass;
	private chanceCardTargetOutlinePass: OutlinePass;
	private playerInRoundOutlinePass: OutlinePass;
	private controls: OrbitControls;
	private pathChoiceController!: MapPathChoiceSceneController;
	private isLowEnd: boolean;

	private mapContainer: THREE.Group = new THREE.Group();
	private mapModules: Map<
		string,
		{
			scene: THREE.Group;
			gltf: any;
			hasAnimations: boolean;
		}
	> = new Map();
	private mapItemsInScene: Map<string, THREE.Group> = new Map<string, THREE.Group>();

	private playerEntities: Map<string, PlayerModel> = new Map<string, PlayerModel>();
	private housesModules: Map<string, THREE.Group> = new Map<string, THREE.Group>();
	private housesItems: Map<string, { group: THREE.Group; textSprite: TextSprite }> = new Map<
		string,
		{ group: THREE.Group; textSprite: TextSprite }
	>();
	private arrivedEventIcons: Map<string, THREE.Mesh> = new Map<string, THREE.Mesh>(); // key = mapItemId
	private playerPosition: Map<string, string> = new Map<string, string>();
	private playerPendingWalks: Map<string, string> = new Map<string, string>(); // 防止同一玩家的走路动画并发执行
	private requestAnimationFrameId: number = -1;

	private playerWatchers: Map<
		string,
		{
			InfoWatcher: WatchStopHandle | undefined;
			bankruptWatcher: WatchStopHandle | undefined;
		}
	> = new Map();
	private commonWatchers: WatchStopHandle[] = [];

	private isLockingRole: boolean = false;
	private isLockingRoleFromSetting: boolean = useSettig().lockRole;
	private isTurnFocusEnabled: boolean = useSettig().enableTurnFocus;

	private currentFocusModule: THREE.Object3D | null = null;

	private propertyInfoLabel: CSS2DObject;
	private propertyInfoLabelInstance: ComponentPublicInstance;

	private arrivedEventInfoLabel: CSS2DObject;
	private arrivedEventInfoLabelInstance: ComponentPublicInstance;

	private diceManager: DiceManager | null = null;
	private activeMoneyParticles: Map<string, CSS2DObject[]> = new Map();
	private activeSpeechBubbles: Map<string, ActiveSpeechBubble> = new Map();
	private activeThinkingMarkers: Map<string, ActiveThinkingMarker> = new Map();
	private isRenderDice = false;
	private diceRollQueue: DiceResult[][] = []; // 骰子动画队列
	private isProcessingDiceRoll: boolean = false; // 是否正在处理骰子动画
	private chanceCardAnimationQueue: Array<{
		animationId: string;
		chanceCard: ChanceCardInfo;
		sourcePlayerId: string;
		targetIdList: string[];
	}> = []; // 机会卡动画队列
	private isProcessingChanceCardAnimation: boolean = false; // 是否正在处理机会卡动画
	private activeChanceCard3Ds: ChanceCard3D[] = []; // 活跃的3D卡片

	// FPS 计算相关
	private lastFrameTime: number = performance.now();
	private frameCount: number = 0;
	private fpsUpdateInterval: number = 1000; // 每1秒更新一次FPS
	private lastFpsUpdateTime: number = performance.now();

	// GLB 模型动画管理
	private animationManager: AnimationManager = new AnimationManager();
	private clock: THREE.Clock = new THREE.Clock();

	constructor(canvas: HTMLCanvasElement, container: HTMLDivElement, mapData: GameMap) {
		this.mapData = mapData;
		this.container = container;
		this.canvas = canvas;

		try {
			// 初始化画质设置（必须在 WebGLRenderer 之前，决定 antialias 等）
			const settingStore = useSettig();
			settingStore.initGraphicQuality();
			const isLowEnd = settingStore.graphicQuality === "low";
			this.isLowEnd = isLowEnd;

			try {
				this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLowEnd });
				this.renderer.outputColorSpace = THREE.SRGBColorSpace;
				this.renderer.setClearAlpha(0);

				// 应用初始像素比
				const initialPixelRatio = settingStore.getPixelRatio();
				console.log("[画质设置] 初始化像素比:", initialPixelRatio);
				this.renderer.setPixelRatio(initialPixelRatio);

				// 初始化阴影设置
				console.log("[阴影设置] 初始化阴影设置:", settingStore.enableShadow ? "开启" : "关闭");
				this.renderer.toneMapping = THREE.LinearToneMapping;
				this.renderer.toneMappingExposure = 1.1;
				this.renderer.shadowMap.enabled = settingStore.enableShadow;
				this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
			} catch (error) {
				throw wrapGameInitError("webgl-renderer", error);
			}

			try {
				this.scene = new THREE.Scene();
				this.camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 1000);
				this.composer = new EffectComposer(this.renderer);
				this.renderPass = new RenderPass(this.scene, this.camera);
				this.chanceCardTargetOutlinePass = new OutlinePass(
					new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
					this.scene,
					this.camera,
				);
				this.playerInRoundOutlinePass = new OutlinePass(
					new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
					this.scene,
					this.camera,
				);

				this.composer.addPass(this.renderPass);
				this.composer.addPass(this.chanceCardTargetOutlinePass);
				this.composer.addPass(this.playerInRoundOutlinePass);
				const gammaPass = new ShaderPass(GammaCorrectionShader);
				this.composer.addPass(gammaPass);

				const { css2DObject: propertyCSS2DObject, appInstance: propertyInfoLabelInstance } = createCSS2DObjectFromVue(
					PropertyInfoCard,
					{
						property: null,
					},
				);
				this.propertyInfoLabel = propertyCSS2DObject;
				this.propertyInfoLabelInstance = propertyInfoLabelInstance;

				const { css2DObject: arrivedEventCSS2DObject, appInstance: arrivedEventLabelInstance } =
					createCSS2DObjectFromVue(MapEventCard, {
						property: null,
					});
				this.arrivedEventInfoLabel = arrivedEventCSS2DObject;
				this.arrivedEventInfoLabelInstance = arrivedEventLabelInstance;

				this.scene.add(this.propertyInfoLabel);
				this.scene.add(this.arrivedEventInfoLabel);

				this.popElementRenderer = new CSS2DRenderer();
				this.popElementRenderer.setSize(container.clientWidth, container.clientHeight);
				this.popElementRenderer.domElement.style.position = "absolute";
				this.popElementRenderer.domElement.style.left = "0";
				this.popElementRenderer.domElement.style.top = "0";
				this.popElementRenderer.domElement.style.pointerEvents = "none";
				this.popElementRenderer.domElement.style.zIndex = "var(--z-ui)";
				container.appendChild(this.popElementRenderer.domElement);

				const controls = new OrbitControls(this.camera, this.canvas);
				controls.enableDamping = true;
				controls.maxDistance = 30;
				controls.minDistance = 1;
				controls.maxPolarAngle = Math.PI / 2;
				controls.minPolarAngle = Math.PI / 3;
				controls.update();
				this.controls = controls;
				this.pathChoiceController = new MapPathChoiceSceneController({
					scene: this.scene,
					camera: this.camera,
					controls: this.controls,
					canvas: this.canvas,
					getMapItemAnchor: (mapItemId) => this.getMapPathChoiceAnchor(mapItemId),
					getMapItemFootprintRadius: (mapItemId, direction) => this.getMapPathChoiceFootprintRadius(mapItemId, direction),
					getMapItemLabel: (mapItemId) => this.getMapPathChoiceLabel(mapItemId),
				});

				const handleResize = () => {
					this.camera.aspect = container.clientWidth / container.clientHeight; //相机视角长宽比
					this.camera.updateProjectionMatrix();
					this.renderer.setSize(container.clientWidth, container.clientHeight);
					this.renderPass.setSize(container.clientWidth, container.clientHeight);
					this.composer.setSize(container.clientWidth, container.clientHeight);
					this.popElementRenderer.setSize(container.clientWidth, container.clientHeight);
					this.diceManager && this.diceManager.updateAspect(container.clientWidth / container.clientHeight);
				};

				window.addEventListener("resize", debounce(handleResize.bind(this), 500));

				handleResize();
			} catch (error) {
				throw wrapGameInitError("scene-overlay", error);
			}
		} catch (error) {
			throw wrapGameInitError("scene-overlay", error);
		}
	}

	public async init() {
		await this.runInitStage("dice-model", () => this.initDiceManager());

		loadingMask.loading = true;
		loadingMask.text = "正在进行初始化加载：地图数据";
		//加载地图
		await this.runInitStage("map-data", () => this.initMap());

		loadingMask.text = "正在进行初始化加载：背景";
		//加载背景
		await this.runInitStage("background", async () => {
			this.initBackground();
		});

		loadingMask.text = "正在进行初始化加载：玩家数据";
		//加载玩家模型
		await this.runInitStage("player-models", () => this.initPlayer());

		loadingMask.text = "正在进行初始化加载：机会卡、场景设置";
		await this.runInitStage("chance-card-assets", () => this.initChanceCard());
		await this.initMapPathChoiceArrowModel();
		await this.runInitStage("scene-effects", async () => {
			this.initLight();
			this.initOutlinePass();
			this.initEventListener();
		});

		this.focusMe();
		this.pathChoiceController.setRequest(useGameData().mapPathChoiceRequest);


		//添加光线投射用于选择对象
		const propertyRaycaster = new THREE.Raycaster();
		const arrivedEventRaycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();

		// 创建轨道控制器

		const updatePointer = (clientX: number, clientY: number) => {
			// 1. 获取 Canvas 在视口中的精确位置和尺寸
			const rect = this.canvas.getBoundingClientRect();

			// 2. 计算相对于 Canvas 左上角的坐标 (0,0 在 Canvas 左上角)
			const xInCanvas = clientX - rect.left;
			const yInCanvas = clientY - rect.top;

			// 3. 归一化为设备坐标 (NDC) -> x: [-1, 1], y: [1, -1]
			pointer.x = (xInCanvas / rect.width) * 2 - 1;
			pointer.y = -(yInCanvas / rect.height) * 2 + 1;
		};

		// 检查事件目标是否在 canvas 内（不在 UI 上）
		const isTargetOnCanvas = (target: EventTarget | null): boolean => {
			if (!target || !(target instanceof Element)) return false;
			// 检查是否是 canvas 本身或是 canvas 的子元素
			return target === this.canvas || this.canvas.contains(target);
		};

		if (isMobileDevice()) {
			const onPointerMove = (event: TouchEvent) => {
				// 阻止默认滚动行为（可选，视需求而定）
				// event.preventDefault();
				// 只有当触摸目标在 canvas 上时才更新指针
				if (!isTargetOnCanvas(event.target)) return;
				const touch = event.touches[0];
				updatePointer(touch.clientX, touch.clientY);
			};
			window.addEventListener("touchmove", onPointerMove, { passive: false });
		} else {
			const onPointerMove = (event: MouseEvent) => {
				// 只有当鼠标目标在 canvas 上时才更新指针
				if (!isTargetOnCanvas(event.target)) return;
				updatePointer(event.clientX, event.clientY);
			};
			window.addEventListener("pointermove", onPointerMove);
		}

		await this.runInitStage("render-loop", async () => {
			const loop = () => {
				this.requestAnimationFrameId = requestAnimationFrame(loop);

				// 更新 GLB 模型动画
				const delta = this.clock.getDelta();
				this.animationManager.update(delta);

				this.handlePropertyRaycaster(propertyRaycaster, pointer);
				this.handleMapEventRaycaster(propertyRaycaster, pointer);
				this.pathChoiceController.update();

				if (
					!this.pathChoiceController.isActive &&
					!this.pathChoiceController.isCameraTransitioning &&
					this.isLockingRole &&
					this.isLockingRoleFromSetting &&
					this.currentFocusModule
				) {
					// 持续跟随必须在单帧内完成；在渲染循环里创建 GSAP tween 会导致多个 tween 同时争抢相机状态。
					this.followCamera(this.controls, this.currentFocusModule, 7, 30, delta);
				}
				if (!this.pathChoiceController.isCameraTransitioning) {
					this.controls.update(delta);
				}

				Array.from(this.playerEntities.values()).forEach((player) => {
					player.update(this.camera);
				});

				// 1. 关闭自动清除，完全由我们接管
				this.renderer.autoClear = false;

				// 2. 每一帧开始时，手动清除颜色、深度、模板缓冲区
				this.renderer.clear();

				// 3. 渲染主场景
				if (this.isLowEnd) {
					// 移动端跳过 EffectComposer（省去 3 次全屏后处理 pass）
					this.renderer.render(this.scene, this.camera);
				} else {
					this.composer.render();
				}

				this.popElementRenderer.render(this.scene, this.camera);
				this.updateActiveSpeechBubbleLayout();

				if (this.isRenderDice && this.diceManager) {
					this.diceManager.update();
					this.renderer.clearDepth();
					this.renderer.render(this.diceManager.getScene(), this.diceManager.getCamera());
				}

				// 计算 FPS
				this.updateFPS();
			};

			loop();
		});
	}

	private async runInitStage<T>(stage: GameInitStage, fn: () => Promise<T> | T): Promise<T> {
		try {
			return await fn();
		} catch (error) {
			throw wrapGameInitError(stage, error);
		}
	}

	private async initMapPathChoiceArrowModel() {
		try {
			const arrowTemplate = (await loadModel("arrow.glb")).scene;
			setMapPathChoiceArrowFactory(() => {
				const arrow = arrowTemplate.clone(true);
				arrow.scale.setScalar(0.4); // 小一点；1 为模型原始大小
				return arrow;
			});
		} catch (error) {
			console.warn("[渲染器] 分叉选路箭头模型加载失败，将使用默认箭头。", error);
		}
	}

	private async initDiceManager() {
		const diceModel = (await loadModel("dice.glb")).scene;
		diceModel.scale.set(0.8, 0.8, 0.8);
		this.diceManager = new DiceManager(diceModel);
		this.diceManager.updateAspect(this.container.clientWidth / this.container.clientHeight);
	}

	private initBackground() {
		const bgTextureLoader = new THREE.TextureLoader();
		const bgResource = useResourceStore().getRecourceById(this.mapData.info.backgroundImageId);
		if (!bgResource) return;

		const bgTexture = bgTextureLoader.load(bgResource.url);

		this.scene.background = bgTexture;
		this.scene.add(this.mapContainer);
	}

	private async initMap() {
		await this.initMapModels();
		await this.initMapItems();
		await this.initProperties();
	}

	private async initMapModels() {
		const modelResourcesList = Array.from(useResourceStore().recourceMap.values()).filter((r) => r.type === "model");
		const enableShadow = useSettig().enableShadow;
		for await (const modelResource of modelResourcesList) {
			const gltf = await getModelById(modelResource.id);
			const model = gltf.scene;
			enableShadows(model, enableShadow);

			// Store model with animation info
			this.mapModules.set(modelResource.id, {
				scene: model,
				gltf: gltf,
				hasAnimations: gltf.animations && gltf.animations.length > 0,
			});
		}
	}

	private async initMapItems() {
		const textureLoader = new THREE.TextureLoader();

		const mapItems = this.mapData.mapItems;
		for (const mapItem of mapItems) {
			const modelData = this.mapModules.get(mapItem.type.modelId);
			if (!modelData) throw Error("加载MapItem时找不到模型");

			// Handle animated models differently
			let mapItemModel: THREE.Group;
			let originalY = 0;

			if (modelData.hasAnimations) {
				// Deep clone for animated models to preserve bone structure
				mapItemModel = modelData.scene.clone(true) as THREE.Group;
				originalY = mapItemModel.position.y;

				// Only register animation if enabled in settings
				if (useSettig().enableModelAnimation) {
					const instanceId = `${mapItem.type.modelId}_${mapItem.id}`;
					this.animationManager.registerModel(instanceId, modelData.gltf, mapItemModel, {
						autoPlay: true,
						loop: THREE.LoopRepeat,
					});
				}
			} else {
				// Shallow copy for non-animated models
				mapItemModel = new THREE.Group().copy(modelData.scene);
				originalY = modelData.scene.position.y;
			}

			mapItemModel.userData["position"] = { x: mapItem.x, y: mapItem.y };
			mapItemModel.userData["rotation"] = mapItem.rotation;
			mapItemModel.userData["id"] = mapItem.id;
			mapItemModel.userData["isMapItem"] = true;
			if (mapItem.mapEventId) {
				const mapEvent = useMapData().getMapEventById(mapItem.mapEventId);
				if (mapEvent) mapItemModel.userData["mapEvent"] = clone(mapEvent);
			}

			// 使用原始模型的Y偏移来放置地皮
			this.setItemPositionOnMap(mapItemModel, mapItem.x, mapItem.y, mapItem.rotation, originalY);
			this.mapItemsInScene.set(mapItem.id, mapItemModel);
			this.mapContainer.add(mapItemModel);

			// [修改] 如果有事件图标，需要计算当前格子的表面高度来放置图标
			if (mapItem.mapEventId) {
				const arrivedEvent = useMapData().getMapEventById(mapItem.mapEventId);
				if (!arrivedEvent) continue;
				const iconUrl = useResourceStore().getRecourceById(arrivedEvent.iconId)?.url;
				if (!iconUrl) continue;
				const texture = await textureLoader.loadAsync(iconUrl);
				texture.colorSpace = THREE.SRGBColorSpace;
				const planeGeometry = new THREE.PlaneGeometry(1, 1);
				const planeMaterial = new THREE.MeshBasicMaterial({
					map: texture,
					side: THREE.DoubleSide,
					transparent: true,
					depthTest: true,
					depthWrite: false,
				});
				const iconPlane = new THREE.Mesh(planeGeometry, planeMaterial);
				iconPlane.rotateX(-Math.PI / 2);
				iconPlane.renderOrder = 1;
				this.arrivedEventIcons.set(mapItem.id, iconPlane);
				this.mapContainer.add(iconPlane);

				// 获取格子表面高度
				const surfaceY = this.getMapItemSurfaceHeight(mapItemModel);
				// 放在表面上方一点点，防止 Z-fighting
				this.setItemPositionOnMap(iconPlane, mapItem.x, mapItem.y, 0, surfaceY + 0.01);
			}
		}
	}

	private async initProperties() {
		//加载地皮
		const gameInfo = useGameData();
		gameInfo.properties.forEach((property) => {
			const textSprite = new TextSprite(
				`${property.name}\n可购买: ${Math.round(property.sellCost)}￥`,
				64,
				"#000000",
				10,
				82,
			);
			// textSprite.getSprite().scale.set(2.5, 2.5, 2.5);
			this.housesItems.set(property.id, {
				group: new THREE.Group(),
				textSprite: textSprite,
			});
			this.updateBuilding(property);
		});
	}

	private async initPlayer() {
		const playersList = useGameData().players.filter((player) => !player.isBankrupted);
		await this.loadPlayersModules(playersList);
		playersList.forEach((player) => {
			this.updatePlayerPosition(player);
		});
	}

	private async initChanceCard() {
		try {
			// 预加载所有机会卡纹理
			const mapData = useMapData();
			const resourceStore = useResourceStore();

			// 获取所有机会卡
			const allChanceCards = mapData.chanceCards || [];

			if (allChanceCards.length === 0) {
				console.log("[机会卡] 没有找到机会卡数据，跳过预加载");
				return;
			}

			// 准备预加载数据
			const preloadData = allChanceCards.map((card: ChanceCardInfo) => {
				const iconUrl = resourceStore.getRecourceById(card.iconId)?.url || "";
				return { card, iconUrl };
			});

			const total = preloadData.length;
			const t0 = performance.now();

			// 0. 确保字体加载完成，避免渲染时重复等待字体解析
			await document.fonts.ready;
			console.log(`[机会卡性能] fonts.ready: ${performance.now() - t0}ms`);

			// 1. 并发预加载所有图标（预热浏览器缓存，消除后续1s超时等待）
			const allIconUrls = preloadData.map((d) => d.iconUrl);
			loadingMask.text = `正在预加载机会卡图标...`;
			const t1 = performance.now();
			await ChanceCardTextureGenerator.preloadIcons(allIconUrls);
			console.log(`[机会卡性能] preloadIcons (${allIconUrls.length}张): ${performance.now() - t1}ms`);

			// 2. 并发生成纹理（4张同时处理）
			await ChanceCardTextureGenerator.preloadLiteFont();
			const t2 = performance.now();
			await ChanceCardTextureGenerator.preloadTexturesConcurrent(preloadData, 4, (completed, total, cardName) => {
				loadingMask.text = `正在预加载机会卡 (${completed}/${total}): ${cardName}`;
			});
			console.log(`[机会卡性能] preloadTextures (${total}张): ${performance.now() - t2}ms`);
			console.log(`[机会卡性能] 总耗时: ${performance.now() - t0}ms`);

			loadingMask.text = "机会卡纹理预加载完成";
		} catch (error) {
			console.error("[机会卡] 预加载失败:", error);
			// 预加载失败不影响游戏继续进行
			loadingMask.text = "机会卡预加载失败，继续初始化...";
		}
	}

	private initLight() {
		const centerPos = this.getGroupCenter(this.mapContainer);
		const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
		this.scene.add(ambientLight);
		const skyColor = 0xffffff;
		const groundColor = 0xeef1f5;
		const hemisphereLight = new THREE.HemisphereLight(skyColor, groundColor, 0.9);
		hemisphereLight.position.set(0, 50, 0);
		this.scene.add(hemisphereLight);

		const dirLight = new THREE.DirectionalLight(0xffffff, 2);
		dirLight.position.set(-40, 100, -40);
		dirLight.target.position.copy(centerPos);

		this.scene.add(dirLight);
		this.scene.add(dirLight.target);

		// 从设置中读取阴影开关
		const enableShadow = useSettig().enableShadow;
		dirLight.castShadow = enableShadow;

		if (enableShadow) {
			// 提高阴影贴图分辨率以获得更清晰的阴影
			dirLight.shadow.mapSize.width = 4096;
			dirLight.shadow.mapSize.height = 4096;

			// 调整阴影偏移以减少伪影
			dirLight.shadow.bias = -0.0005;
			dirLight.shadow.normalBias = 0.02;

			// 设置阴影半径以软化边缘（PCFSoftShadowMap）
			dirLight.shadow.radius = 2;

			// 调整阴影相机范围
			const d = 100;
			dirLight.shadow.camera.left = -d;
			dirLight.shadow.camera.right = d;
			dirLight.shadow.camera.top = d;
			dirLight.shadow.camera.bottom = -d;
			dirLight.shadow.camera.near = 0.1;
			dirLight.shadow.camera.far = 500;
		}
	}

	private initOutlinePass() {}

	/**
	 * 将机会卡动画添加到队列
	 */
	public queueChanceCardAnimation(
		animationId: string,
		chanceCard: ChanceCardInfo,
		sourcePlayerId: string,
		targetIdList: string[],
	) {
		this.chanceCardAnimationQueue.push({
			animationId,
			chanceCard,
			sourcePlayerId,
			targetIdList,
		});

		// 如果当前没有正在处理的动画，开始处理队列
		if (!this.isProcessingChanceCardAnimation) {
			this.processChanceCardAnimationQueue();
		}
	}

	/**
	 * 处理机会卡动画队列（确保动画按顺序执行，不会并发）
	 */
	private async processChanceCardAnimationQueue(): Promise<void> {
		if (this.isProcessingChanceCardAnimation || this.chanceCardAnimationQueue.length === 0) {
			return;
		}

		this.isProcessingChanceCardAnimation = true;

		try {
			while (this.chanceCardAnimationQueue.length > 0) {
				const animationTask = this.chanceCardAnimationQueue.shift();
				if (!animationTask) break;

				try {
					const { animationId, chanceCard, sourcePlayerId, targetIdList } = animationTask;

					// 获取源玩家位置
					const sourcePlayer = this.playerEntities.get(sourcePlayerId);
					if (!sourcePlayer) {
						console.warn("[机会卡动画] 找不到源玩家:", sourcePlayerId);
						continue;
					}

					// 计算目标位置
					const targetPositions = this.getTargetPositions(chanceCard.type, targetIdList);

					// 播放飞行动画
					await this.playChanceCardFlyAnimation(chanceCard, sourcePlayer.model.position, targetPositions);

					// 通知服务器动画完成
					const monopolyClient = useMonopolyClient();
					monopolyClient && monopolyClient.AnimationComplete(animationId);
				} catch (error) {
					console.error("[机会卡动画] 执行失败:", error);
				}
			}
		} finally {
			this.isProcessingChanceCardAnimation = false;
		}
	}

	/**
	 * 根据目标类型计算目标位置列表
	 */
	private getTargetPositions(targetType: string, targetIdList: string[]): THREE.Vector3[] {
		const positions: THREE.Vector3[] = [];

		switch (targetType) {
			case "ToSelf": {
				// 自己
				const playerId = targetIdList[0];
				const player = this.playerEntities.get(playerId);
				if (player) {
					positions.push(player.model.position.clone());
				}
				break;
			}
			case "ToPlayer": {
				// 指定玩家
				for (const playerId of targetIdList) {
					const player = this.playerEntities.get(playerId);
					if (player) {
						positions.push(player.model.position.clone());
					}
				}
				break;
			}
			case "ToOtherPlayer": {
				// 其他玩家
				for (const playerId of targetIdList) {
					const player = this.playerEntities.get(playerId);
					if (player) {
						positions.push(player.model.position.clone());
					}
				}
				break;
			}
			case "ToProperty": {
				// 地皮
				const mapInfo = useMapData();
				for (const propertyId of targetIdList) {
					const mapItemData = mapInfo.getMapItemByPropertyId(propertyId);
					if (mapItemData) {
						const mapItem = this.mapItemsInScene.get(mapItemData.id);
						if (mapItem) {
							positions.push(mapItem.position.clone());
						}
					}
				}
				break;
			}
			case "ToMapItem": {
				// 地图格子
				for (const mapItemId of targetIdList) {
					const mapItem = this.mapItemsInScene.get(mapItemId);
					if (mapItem) {
						positions.push(mapItem.position.clone());
					}
				}
				break;
			}
			default:
				console.warn("[机会卡动画] 未知的目标类型:", targetType);
		}

		return positions;
	}

	/**
	 * 创建机会卡 3D 对象
	 */
	private async createChanceCard3D(chanceCard: ChanceCardInfo): Promise<ChanceCard3D> {
		// 获取图标URL
		const resourceStore = useResourceStore();
		const iconUrl = resourceStore.getRecourceById(chanceCard.iconId)?.url || "";

		// 创建3D卡片对象
		const card3d = new ChanceCard3D(chanceCard, iconUrl, this.scene);
		await card3d.createCard();

		return card3d;
	}

	/**
	 * 播放机会卡飞行动画
	 */
	private async playChanceCardFlyAnimation(
		chanceCard: ChanceCardInfo,
		sourcePosition: THREE.Vector3,
		targetPositions: THREE.Vector3[],
	): Promise<void> {
		// 保存原始摄像机状态
		const originalCameraPosition = this.camera.position.clone();
		const originalControlsTarget = this.controls.target.clone();

		// 创建3D机会卡对象
		const card3d = await this.createChanceCard3D(chanceCard);
		this.activeChanceCard3Ds.push(card3d);

		const mesh = card3d.getMesh();
		const pivot = card3d.getPivot();

		if (!mesh) {
			console.error("[机会卡动画] 无法创建3D卡片对象");
			return;
		}

		// 设置初始位置（玩家中心）
		pivot.position.copy(sourcePosition);
		pivot.position.y += 0.5; // 玩家中心位置

		// 初始缩放为0
		mesh.scale.set(0, 0, 0);

		// 显示卡片
		card3d.show();

		// 计算所有动画关键点的包围盒中心（用于摄像机聚焦）
		const allPoints = [sourcePosition.clone(), ...targetPositions];
		const boundingBox = new THREE.Box3();
		allPoints.forEach((point) => boundingBox.expandByPoint(point));
		const focusCenter = new THREE.Vector3();
		boundingBox.getCenter(focusCenter);

		// 计算包围盒的大小，用于确定摄像机距离
		const boundingBoxSize = new THREE.Vector3();
		boundingBox.getSize(boundingBoxSize);
		const maxDimension = Math.max(boundingBoxSize.x, boundingBoxSize.z);

		// 计算摄像机新位置（在焦点上方，保持俯视角度）
		const cameraDistance = Math.max(15, maxDimension * 2); // 根据包围盒大小动态调整距离
		const newCameraPosition = new THREE.Vector3(
			focusCenter.x,
			focusCenter.y + cameraDistance * 0.6,
			focusCenter.z + cameraDistance * 0.8,
		);

		// 平滑移动摄像机和焦点
		await Promise.all([
			gsap.to(this.camera.position, {
				x: newCameraPosition.x,
				y: newCameraPosition.y,
				z: newCameraPosition.z,
				duration: 0.5,
				ease: "power2.out",
			}),
			gsap.to(this.controls.target, {
				x: focusCenter.x,
				y: focusCenter.y,
				z: focusCenter.z,
				duration: 0.5,
				ease: "power2.out",
			}),
		]);

		// 计算屏幕中心位置（使用射线投射到y=1的平面）
		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
		const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
		const screenCenterPos = new THREE.Vector3();
		raycaster.ray.intersectPlane(plane, screenCenterPos);

		// 创建动画时间线
		const timeline = gsap.timeline({
			onComplete: () => {
				void (async () => {
					// 动画完成后清理
					card3d.dispose();
					this.activeChanceCard3Ds = this.activeChanceCard3Ds.filter((c) => c !== card3d);

					// 恢复摄像机位置
					await Promise.all([
						gsap.to(this.camera.position, {
							x: originalCameraPosition.x,
							y: originalCameraPosition.y,
							z: originalCameraPosition.z,
							duration: 0.5,
							ease: "power2.inOut",
						}),
						gsap.to(this.controls.target, {
							x: originalControlsTarget.x,
							y: originalControlsTarget.y,
							z: originalControlsTarget.z,
							duration: 0.5,
							ease: "power2.inOut",
						}),
					]);
				})();
			},
		});

		// ===== 阶段1：放大到屏幕中央（带随机方向的抛物线运动）=====
		// ⭐ 强制重置pivot的旋转为初始状态
		pivot.rotation.set(0, 0, 0);

		// ⭐ 生成随机方向（0到2π之间的随机角度）
		const randomAngle = Math.random() * Math.PI * 2;
		const horizontalOffset = 5; // 水平偏移量

		// ⭐ 位置动画：带随机方向大幅度弧度的运动（向上 + 随机水平方向）
		// 计算中间点（抛物线顶点）
		const midPoint = new THREE.Vector3(
			(sourcePosition.x + screenCenterPos.x) / 2 + Math.cos(randomAngle) * horizontalOffset, // ⭐ X轴随机偏移
			Math.max(sourcePosition.y, screenCenterPos.y) + 6, // ⭐ 向上弧度6个单位
			(sourcePosition.z + screenCenterPos.z) / 2 + Math.sin(randomAngle) * horizontalOffset, // ⭐ Z轴随机偏移
		);

		// 使用贝塞尔曲线路径创建弧度运动
		const curve = new THREE.QuadraticBezierCurve3(
			sourcePosition.clone().add(new THREE.Vector3(0, 0.5, 0)), // 起点（玩家位置+0.5）
			midPoint, // 控制点（随机方向的高点）
			screenCenterPos, // 终点（屏幕中心）
		);

		// 创建路径动画对象
		const pathProgress = { value: 0 };
		timeline.to(
			pathProgress,
			{
				value: 1,
				duration: 0.5,
				ease: "power2.out",
				onUpdate: () => {
					const point = curve.getPoint(pathProgress.value);
					pivot.position.copy(point);
					// ⭐ 不使用pivot.lookAt，保持pivot.rotation不变
				},
			},
			0,
		);

		// 缩放动画：0 → 2倍（使用临时对象避免GSAP从0开始的问题）
		const scaleObj = { value: 0 };
		timeline.to(
			scaleObj,
			{
				value: 2,
				duration: 0.5,
				ease: "back.out(1.7)", // 弹性效果
				onUpdate: () => {
					mesh.scale.set(scaleObj.value, scaleObj.value, scaleObj.value);
				},
			},
			0,
		); // 与位置动画同时进行

		// ⭐ 阶段1也添加旋转动画（只有Y轴）
		timeline.to(
			mesh.rotation,
			{
				x: 0, // ⭐ X轴不旋转
				y: Math.PI * 2, // ⭐ Y轴旋转360度
				z: 0, // Z轴保持0，不影响朝向
				duration: 0.5,
				ease: "power2.out",
			},
			0,
		); // 与位置动画同时进行

		// ===== 阶段2：停留展示 =====
		// ⭐ 停留时平滑转向摄像机
		// 保存当前旋转状态
		const currentQuaternion = pivot.quaternion.clone();

		// 使用 lookAt 计算目标朝向
		const dummyPivot = pivot.clone();
		dummyPivot.position.copy(pivot.position);
		dummyPivot.lookAt(this.camera.position);
		const targetQuaternion = dummyPivot.quaternion.clone();

		// 创建临时对象用于四元数插值
		const rotationObj = { value: 0 };
		const tempQuaternion = new THREE.Quaternion();

		timeline.to(rotationObj, {
			value: 1,
			duration: 0.2, // 旋转过渡时间（加快速度）
			ease: "power2.inOut",
			onUpdate: () => {
				// 球面线性插值（slerp）实现平滑旋转
				// 手动实现插值：先复制起始四元数，然后向目标插值
				pivot.quaternion.copy(currentQuaternion).slerp(targetQuaternion, rotationObj.value);
			},
		});

		// 停留一段时间（旋转完成后）
		timeline.to(
			{},
			{
				duration: 1, // 停留时间
			},
		);

		// ===== 阶段3：3D翻转 + 曲线飞向目标 =====
		for (let i = 0; i < targetPositions.length; i++) {
			const targetPos = targetPositions[i];
			const isLastTarget = i === targetPositions.length - 1;

			// ⭐ 第一个目标时，添加pivot旋转回初始状态的过渡动画
			if (i === 0) {
				const resetRotationObj = { value: 0 };
				const resetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));

				timeline.to(
					resetRotationObj,
					{
						value: 1,
						duration: 0.8, // 与整个飞行动画同步，0.8秒
						ease: "power2.inOut", // 使用和飞行动画一样的缓动函数
						onUpdate: () => {
							// 从面向摄像机的状态过渡回初始状态
							pivot.quaternion.copy(targetQuaternion).slerp(resetQuaternion, resetRotationObj.value);
						},
					},
					`target${i}`,
				); // 与位置动画完全同步
			}

			// ⭐ 为每个目标生成随机方向
			const randomAngle = Math.random() * Math.PI * 2;
			const horizontalOffset = 3; // ⭐ 飞行时的水平偏移量（比出现时小一些）

			// ⭐ 计算当前曲线的中间控制点
			// 对于第一个目标，明确使用screenCenterPos作为起点，避免瞬移
			const currentPos = i === 0 ? screenCenterPos.clone() : pivot.position.clone();
			const curveMidPoint = new THREE.Vector3(
				(currentPos.x + targetPos.x) / 2 + Math.cos(randomAngle) * horizontalOffset,
				Math.max(currentPos.y, targetPos.y) + 3, // ⭐ 向上弧度3个单位
				(currentPos.z + targetPos.z) / 2 + Math.sin(randomAngle) * horizontalOffset,
			);

			// ⭐ 使用贝塞尔曲线创建随机方向的弧线运动
			const flyCurve = new THREE.QuadraticBezierCurve3(
				currentPos, // 起点（当前位置）
				curveMidPoint, // 控制点（随机方向的弧线顶点）
				targetPos, // 终点（目标位置）
			);

			// 位置动画：沿曲线飞向目标（不改变pivot的旋转）
			const flyProgress = { value: 0 };
			timeline.to(
				flyProgress,
				{
					value: 1,
					duration: 0.8,
					ease: "power2.inOut",
					onUpdate: () => {
						// ⭐ 沿曲线移动
						const point = flyCurve.getPoint(flyProgress.value);
						pivot.position.copy(point);
						// ⭐ 不使用pivot.lookAt，保持pivot.rotation不变，避免倾斜
					},
				},
				`target${i}`,
			);

			// 缩放动画：2倍 → 1倍（使用临时对象）
			const scaleObj2 = { value: 2 };
			timeline.to(
				scaleObj2,
				{
					value: 1,
					duration: 0.8,
					ease: "power2.inOut",
					onUpdate: () => {
						mesh.scale.set(scaleObj2.value, scaleObj2.value, scaleObj2.value);
					},
				},
				`target${i}`,
			); // 与位置动画同时进行

			// ⭐ 3D翻转动画：继续旋转360度（从当前值继续）
			// 阶段1已经旋转到Math.PI * 2，所以阶段3继续旋转到Math.PI * 4
			timeline.to(
				mesh.rotation,
				{
					x: 0, // ⭐ X轴不旋转（始终保持0）
					y: Math.PI * 4, // ⭐ 从Math.PI*2继续旋转到Math.PI*4（再转360度）
					z: 0, // Z轴保持0，不影响朝向
					duration: 0.8,
					ease: "power2.inOut",
				},
				`target${i}`,
			); // 与位置动画同时进行

			if (isLastTarget) {
				// ===== 阶段4：淡出消失 =====
				const scaleObj3 = { value: 1 };
				timeline.to(scaleObj3, {
					value: 0,
					duration: 0.2,
					ease: "power2.in",
					onUpdate: () => {
						mesh.scale.set(scaleObj3.value, scaleObj3.value, scaleObj3.value);
					},
				});
			} else {
				// 不是最后一个目标：短暂停顿后继续
				timeline.to({}, { duration: 0.2 });
			}
		}

		// 等待动画完成
		await timeline;
	}

	private initEventListener() {
		// 监听当前回合玩家变化
		useEventBus().on("game-currentPlayerIdInRound", (newPlayerId: string, oldPlayerId: string) => {
			if (!this.isTurnFocusEnabled || !newPlayerId || newPlayerId === oldPlayerId) return;
			console.log("[相机] 回合切换:", oldPlayerId, "->", newPlayerId);
			this.focusPlayerById(newPlayerId);
		});

		const mapDataStore = useMapData();

		// 监听画质变化事件
		useEventBus().on("graphics:quality:change", ({ quality }: { quality: "low" | "medium" | "high" }) => {
			console.log("[画质设置] 接收到画质变化事件:", quality);
			const ratioMap = { low: 0.85, medium: 1.0, high: 2.0 };
			const newPixelRatio = window.devicePixelRatio * ratioMap[quality];
			this.applyPixelRatio(newPixelRatio);
		});

		// 监听阴影变化事件
		useEventBus().on("graphics:shadow:change", ({ enable }: { enable: boolean }) => {
			console.log("[阴影设置] 接收到阴影变化事件:", enable);
			this.applyShadowSetting(enable);
		});

		// 监听视角锁定变化事件
		useEventBus().on("graphics:lockRole:change", ({ lockRole }: { lockRole: boolean }) => {
			console.log("[视角设置] 接收到视角锁定变化事件:", lockRole);
			this.isLockingRoleFromSetting = lockRole;
		});

		useEventBus().on("graphics:turnFocus:change", ({ enable }: { enable: boolean }) => {
			console.log("[相机] 接收到回合切换聚焦设置变化:", enable);
			this.isTurnFocusEnabled = enable;
			if (enable) {
				const currentPlayerId = useGameData().currentPlayerIdInRound;
				if (currentPlayerId) {
					this.focusPlayerById(currentPlayerId);
				}
			}
		});

		// 监听模型动画变化事件
		useEventBus().on("graphics:animation:change", ({ enable }: { enable: boolean }) => {
			console.log("[动画设置] 接收到模型动画变化事件:", enable);
			this.applyModelAnimationSetting(enable);
		});

		// 监听相机回归视角事件
		useEventBus().on("camera:focus:self", () => {
			this.focusOnSelf();
		});

		// 监听窗口恢复焦点事件
		useEventBus().on("window:focus-restored", () => {
			console.log("[渲染器] 窗口恢复焦点，重新渲染场景");
			this.reloadScene();
		});

		this.commonWatchers.push(
			watch(
				() => useChat().newMessage,
				(message) => {
					if (!message || useSettig().chatRenderMode !== "bubble") return;
					this.showPlayerSpeechBubble(message);
				},
			),
		);

		this.commonWatchers.push(
			watch(
				() => useSettig().chatRenderMode,
				(mode) => {
					if (mode !== "bubble") {
						this.clearAllSpeechBubbles();
					}
				},
			),
		);

		this.commonWatchers.push(
			watch(
				() => useGameData().mapPathChoiceRequest,
				(request) => this.pathChoiceController.setRequest(request),
			),
		);

		useEventBus().on("player-isThinking", (playerId: string, _oldValue: boolean, newValue: boolean) => {
			this.syncPlayerThinkingMarker(playerId, Boolean(newValue));
		});

		useEventBus().on(
			"player-walk",
			async (
				walkPlayerId: string,
				step: number,
				walkId: string,
				totalSteps?: number,
				startStep?: number,
				segment?: MapMovementSegment,
			) => {
				// 等待前一个动画完成，防止并发执行
				const pendingWalk = this.playerPendingWalks.get(walkPlayerId);
				if (pendingWalk) {
					// 等待前一个动画完成
					await new Promise<void>((resolve) => {
						const checkPending = () => {
							const currentPending = this.playerPendingWalks.get(walkPlayerId);
							if (!currentPending) {
								resolve();
							} else {
								// 继续等待，使用 setTimeout 避免阻塞
								setTimeout(checkPending, 50);
							}
						};
						checkPending();
					});
				}

				// 标记动画开始
				this.playerPendingWalks.set(walkPlayerId, walkId);

				const playerEntity = this.playerEntities.get(walkPlayerId);
				if (playerEntity) {
					const model = this.playerEntities.get(walkPlayerId)?.model;
					if (model) this.currentFocusModule = model;
					this.isLockingRole = true;
					gsap.to(playerEntity.model.scale, {
						x: Math.sign(playerEntity.model.scale.x),
						y: Math.sign(playerEntity.model.scale.y),
						z: Math.sign(playerEntity.model.scale.z),
					});

					try {
						if (segment) {
							await this.updatePlayerPositionBySegment(walkPlayerId, segment, totalSteps, startStep);
							this.playerPosition.set(walkPlayerId, segment.toMapItemId);
						} else {
							const sourcePosition = this.getLegacyPositionIndex(walkPlayerId);
							const mapIndexLength = mapDataStore.mapIndex.length;
							if (sourcePosition === undefined || mapIndexLength <= 0) {
								console.warn(`[渲染器] 无法解析旧版走路起点: ${walkPlayerId}`);
							} else {
								const endIndex = (((sourcePosition + step) % mapIndexLength) + mapIndexLength) % mapIndexLength;
								await this.updatePlayerPositionByStep(
									walkPlayerId,
									sourcePosition,
									step,
									mapIndexLength,
									totalSteps ?? Math.abs(step),
									startStep ?? 1,
								);
								const endMapItemId = this.getMapItemIdByIndex(endIndex);
								if (endMapItemId) this.playerPosition.set(walkPlayerId, endMapItemId);
							}
						}
					} catch (error) {
						console.error(`[渲染器] 玩家移动动画失败: ${walkPlayerId}`, error);
					} finally {
						this.playerPendingWalks.delete(walkPlayerId);
					}

					this.currentFocusModule = null;
					this.isLockingRole = false;
					if (!this.pathChoiceController.isActive && !this.pathChoiceController.isCameraTransitioning) {
						this.controls.enabled = true;
					}

					// 拆散重叠的玩家模型
					this.breakUpPlayersInSameMapItem();
					const monopolyClient = useMonopolyClient();
					monopolyClient && monopolyClient.AnimationComplete(walkId);
				}
			},
		);
		useEventBus().on(
			"player-tp",
			async (tpPlayerId: string, positionIndex: number, walkId: string, mapItemId?: string) => {
				const playerEntity = this.getPlayerEntity(tpPlayerId);

				if (playerEntity) {
					const model = playerEntity.model;
					const body = playerEntity.bodyMesh; // 获取 bodyMesh

					this.currentFocusModule = model;
					this.isLockingRole = true;

					if (!body) return;
					// 1. 记录原始朝向
					const originalDir = Math.sign(body.scale.x) || 1;

					// 2. 消失动画
					await gsap.to(body.scale, {
						x: 0,
						duration: 0.5,
						ease: "back.in(1.7)",
					});

					// 3. 执行位移 (瞬间) - 修复高度问题
					const resolvedMapItemId = mapItemId ?? this.getMapItemIdByIndex(positionIndex);
					const mapItem = mapItemId ? this.getMapItemById(mapItemId) : this.getMapItem(positionIndex);
					if (mapItem) {
						const { x, z } = mapItem.position;
						const surfaceY = this.getMapItemSurfaceHeight(mapItem);
						model.position.set(x, surfaceY, z);
					}
					if (resolvedMapItemId) this.playerPosition.set(tpPlayerId, resolvedMapItemId);

					// 4. 出现动画
					await gsap.to(body.scale, {
						x: originalDir,
						duration: 0.5,
						delay: 0.1,
						ease: "back.out(1.7)",
					});

					this.currentFocusModule = null;
					this.isLockingRole = false;
					if (!this.pathChoiceController.isActive && !this.pathChoiceController.isCameraTransitioning) {
						this.controls.enabled = true;
					}
					this.breakUpPlayersInSameMapItem();
					const monopolyClient = useMonopolyClient();
					monopolyClient && monopolyClient.AnimationComplete(walkId);
				}
			},
		);

		useEventBus().on("player-money", async (playerId: string, oldMoney: number, newMoney: number) => {
			const moneyDiff = newMoney - oldMoney;
			this.spawnMoneyParticleOnPlayer(playerId, moneyDiff);
		});
		useEventBus().on("player-isBankrupted", (playerId: string, oldValue: boolean, newValue: boolean) => {
			if (!oldValue && newValue) {
				this.removePlayerEntity(playerId);
			}
		});
		for (const key of ["level", "owner", "costList"]) {
			useEventBus().on(`property-${key}`, async (propertyId: string) => {
				console.log("🚀 ~ GameRenderer ~ initEventListener ~ property-${key}:", `${key} --- ${propertyId}`)
				this.updateBuilding(useGameData().getPropertyById(propertyId)!);
			});
		}

		useEventBus().on("dice-roll", async (diceRes: DiceResult[]) => {
			if (!this.diceManager) return;

			// 将请求加入队列
			this.diceRollQueue.push(diceRes);

			// 如果当前没有正在处理的动画，开始处理队列
			if (!this.isProcessingDiceRoll) {
				await this._processDiceRollQueue();
			}
		});

		// 监听机会卡使用事件
		useEventBus().on(
			"chance-card-use",
			async (animationInfo: {
				animationId: string;
				chanceCard: ChanceCardInfo;
				sourcePlayerId: string;
				targetIdList: string[];
			}) => {
				const { animationId, chanceCard, sourcePlayerId, targetIdList } = animationInfo;
				this.queueChanceCardAnimation(animationId, chanceCard, sourcePlayerId, targetIdList);
			},
		);
	}

	/**
	 * 处理骰子动画队列（确保动画按顺序执行，不会并发）
	 */
	private async _processDiceRollQueue(): Promise<void> {
		if (this.isProcessingDiceRoll || this.diceRollQueue.length === 0) {
			return;
		}

		this.isProcessingDiceRoll = true;

		while (this.diceRollQueue.length > 0) {
			const diceRes = this.diceRollQueue.shift();
			if (!diceRes) break;

			try {
				this.diceManager!.setDiceCount(diceRes.length);
				this.isRenderDice = true;
				await this.diceManager!.roll(diceRes);
				this.isRenderDice = false;
			} catch (error) {
				console.error("[骰子动画] 执行失败:", error);
			}
		}

		this.isProcessingDiceRoll = false;
	}

	private handlePropertyRaycaster(raycaster: THREE.Raycaster, pointer: THREE.Vector2) {
		// 通过摄像机和鼠标位置更新射线
		raycaster.setFromCamera(pointer, this.camera);

		const intersects = raycaster.intersectObjects(Array.from(this.housesItems.values()).map((h) => h.group));
		if (intersects.length > 0) {
			const intersect = intersects[0];
			const target = intersect.object.parent as THREE.Group;
			const propertyInfo = target.userData as any;
			if (propertyInfo.isProperty) {
				this.propertyInfoLabel.position.copy(target.position);
				this.propertyInfoLabel.position.y += new THREE.Box3().setFromObject(target).max.y;
				//@ts-ignore
				this.propertyInfoLabelInstance.updateProperty(propertyInfo);
			}
		} else {
			//@ts-ignore
			this.propertyInfoLabelInstance.updateProperty(null);
		}
	}

	private handleMapEventRaycaster(raycaster: THREE.Raycaster, pointer: THREE.Vector2) {
		// 通过摄像机和鼠标位置更新射线
		raycaster.setFromCamera(pointer, this.camera);

		const intersects = raycaster.intersectObjects(Array.from(this.mapItemsInScene.values()));
		if (intersects.length > 0) {
			const firstInstance = intersects[0];
			let target: THREE.Object3D | null = firstInstance.object;
			while (target) {
				if (target.userData.isMapItem) {
					break;
				} else {
					target = target.parent;
				}
			}
			if (target && target.userData.mapEvent) {
				const mapEvent = target.userData.mapEvent;

				this.arrivedEventInfoLabel.position.copy(target.position);
				// this.arrivedEventInfoLabel.position.y += 2.2;
				//@ts-ignore
				this.arrivedEventInfoLabelInstance.updateArrivedEvent(mapEvent);
			} else {
				//@ts-ignore
				this.arrivedEventInfoLabelInstance.updateArrivedEvent(null);
			}
		} else {
			//@ts-ignore
			this.arrivedEventInfoLabelInstance.updateArrivedEvent(null);
		}
	}

	public destroy() {
		cancelAnimationFrame(this.requestAnimationFrameId);
		Array.from(this.playerWatchers.values()).forEach((watchers) => {
			watchers.InfoWatcher && watchers.InfoWatcher();
			// watchers.moneyWatcher && watchers.moneyWatcher();
			watchers.bankruptWatcher && watchers.bankruptWatcher();
		});
		useEventBus().removeAll();
		this.commonWatchers.forEach((f) => f());
		this.clearAllSpeechBubbles();
		this.clearAllThinkingMarkers();
		this.pathChoiceController?.dispose();
		this.diceManager && this.diceManager.dispose();
		// 释放动画管理器
		this.animationManager.dispose();
		this.scene.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				object.geometry?.dispose();
				if (Array.isArray(object.material)) {
					object.material.forEach((m) => m.dispose());
				} else {
					object.material?.dispose();
				}
			}
		});
		this.scene.clear();

		// 释放 WebGL 渲染器
		this.renderer.dispose();
		this.renderer.renderLists.dispose();

		// EffectComposer 没有 dispose()，手动清理 render target
		this.composer.renderTarget1.dispose();
		this.composer.renderTarget2.dispose();
		this.composer.passes = [];

		// 轨道控制器
		this.controls.dispose();

		// CSS2DRenderer DOM 清理
		if (this.popElementRenderer.domElement?.parentElement) {
			this.popElementRenderer.domElement.parentElement.removeChild(this.popElementRenderer.domElement);
		}
	}

	/**
	 * 更新 FPS 计算
	 */
	private updateFPS() {
		const now = performance.now();
		this.frameCount++;

		// 每隔 fpsUpdateInterval 毫秒更新一次 FPS
		if (now - this.lastFpsUpdateTime >= this.fpsUpdateInterval) {
			const elapsed = now - this.lastFpsUpdateTime;
			const fps = Math.round((this.frameCount * 1000) / elapsed);

			// 更新 store 中的 FPS 值
			useUtil().fps = fps;

			// 重置计数器
			this.frameCount = 0;
			this.lastFpsUpdateTime = now;
		}
	}

	private async loadPlayersModules(playerList: Array<PlayerInfo>) {
		for await (const playerInfo of playerList) {
			try {
				const mapItemId = this.resolvePlayerMapItemId(playerInfo);
				if (mapItemId) {
					this.playerPosition.set(playerInfo.id, mapItemId);
				}
				const role = useMapData().getRoleById(playerInfo.user.roleId);
				if (!role) throw Error("初始化玩家模型时: 找不到角色信息");
				const modelResource = useResourceStore().getRecourceById(role.imageId);
				if (!modelResource) throw Error("初始化玩家模型时: 找不到模型文件");
				const playerEntity = new PlayerModel();
				await playerEntity.load(modelResource.url, modelResource.fileType);
				this.playerEntities.set(playerInfo.id, playerEntity);
				const textSprite = new TextSprite(
					`${playerInfo.user.username}${playerInfo.user.userId === getCurrentClientPlayerId() ? " (你)" : ""}`,
					32,
					playerInfo.user.color,
					5,
					0,
				);
				const nameSprite = textSprite.getSprite();
				nameSprite.renderOrder = 999;
				nameSprite.position.set(0, PLAY_MODEL_SIZE * 1.5, 0);
				playerEntity.model.add(nameSprite);
				playerEntity.model.scale.set(PLAY_MODEL_SIZE, PLAY_MODEL_SIZE, PLAY_MODEL_SIZE);
				this.scene.add(playerEntity.model);
				this.syncPlayerThinkingMarker(playerInfo.id, playerInfo.isThinking);
			} catch (e) {
				console.error("🚀 ~ GameRenderer ~ loadPlayersModules ~ e:", e);
			}
		}
	}

	/**
	 * 持续跟随角色。该方法由 render loop 调用，因此只能直接更新当前帧状态，
	 * 不能创建 GSAP tween，否则每帧都会累积多个相机动画并产生抖动。
	 */
	private followCamera(
		controls: OrbitControls,
		targetObject: THREE.Object3D,
		followDistance: number,
		followAngleY: number,
		delta: number,
	) {
		controls.enabled = false;
		const targetPos = targetObject.position;
		const cameraFaceVector = controls.object.getWorldDirection(new THREE.Vector3());
		if (Math.abs(cameraFaceVector.x) + Math.abs(cameraFaceVector.z) < 0.000001) return;

		// 保持原有的水平取景距离计算，只替换 tween 驱动方式，避免改变既有镜头构图。
		const coefficient = followDistance / cameraFaceVector.length();
		const followPos = targetPos.clone();
		followPos.x -= cameraFaceVector.x * coefficient;
		followPos.y = targetPos.y + followDistance * Math.tan(THREE.MathUtils.degToRad(followAngleY));
		followPos.z -= cameraFaceVector.z * coefficient;

		const alpha = 1 - Math.exp(-10 * delta);
		controls.target.lerp(targetPos, alpha);
		controls.object.position.lerp(followPos, alpha);
	}

	/**
	 * 一次性聚焦（例如点击“回归视角”）。只允许保留一个显式相机 tween。
	 */
	private updateCamera(
		controls: OrbitControls,
		targetObject: THREE.Object3D,
		followDistance: number,
		followAngleY: number,
	) {
		if (!targetObject) return;
		controls.enabled = false;
		const targetPos = targetObject.position;
		const cameraFaceVector = controls.object.getWorldDirection(new THREE.Vector3());
		if (Math.abs(cameraFaceVector.x) + Math.abs(cameraFaceVector.z) < 0.000001) return;

		// 保持原有的水平取景距离计算，只替换 tween 驱动方式，避免改变既有镜头构图。
		const coefficient = followDistance / cameraFaceVector.length();
		const followPos = targetPos.clone();
		followPos.x -= cameraFaceVector.x * coefficient;
		followPos.y = targetPos.y + followDistance * Math.tan(THREE.MathUtils.degToRad(followAngleY));
		followPos.z -= cameraFaceVector.z * coefficient;

		gsap.killTweensOf([controls.target, controls.object.position]);
		const timeline = gsap.timeline({
			onComplete: () => {
				controls.enabled = true;
			},
		});
		timeline.to(controls.target, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 0.5, ease: "power2.out" }, 0);
		timeline.to(
			controls.object.position,
			{ x: followPos.x, y: followPos.y, z: followPos.z, duration: 0.5, ease: "power2.out" },
			0,
		);
	}

	private outlineModels(models: THREE.Object3D[]) {
		this.chanceCardTargetOutlinePass.selectedObjects = models;
	}

	private async updateBuilding(newProperty: PropertyInfo) {
		const oldModel = this.housesItems.get(newProperty.id);
		if (oldModel) {
			await gsap.to(oldModel.group.scale, { x: 0, y: 0, z: 0, duration: 0.2 });
			this.mapContainer.remove(oldModel.group);
		}
		const mapInfo = useMapData();
		const targetMapItem = mapInfo.getMapItemByPropertyId(newProperty.id);
		if (!targetMapItem) return;
		const targetMapItemModel = this.mapItemsInScene.get(targetMapItem?.id);
		if (!targetMapItemModel) return;

		// [修改] 获取目标格子的表面高度
		const surfaceY = this.getMapItemSurfaceHeight(targetMapItemModel);

		const modelIdList = newProperty.buildingModelIdList ?? mapInfo.buildingModelIdList;
		if (!modelIdList || modelIdList.length === 0) return;
		const getModel = (index: number) => {
			const id = modelIdList[index];
			const modelData = id ? this.mapModules.get(id) : undefined;
			return modelData?.scene;
		};
		const buildModel = getModel(newProperty.level) ?? getModel(modelIdList.length - 1);

		if (!buildModel) return;
		const propertyBuildModel = buildModel.clone();
		propertyBuildModel.position.copy(targetMapItemModel.position);
		// [修改] 设置为表面高度，替代 BLOCK_HEIGHT
		propertyBuildModel.position.y = surfaceY;
		propertyBuildModel.scale.copy(targetMapItemModel.scale);
		propertyBuildModel.userData = { ...newProperty, isProperty: true };
		propertyBuildModel.traverse((object) => {
			if (object.userData.name) {
				const meshName = object.userData.name as string;
				if (meshName.includes("color")) {
					object.traverse((o) => {
						//@ts-ignore
						if (o.isMesh) {
							const basicMaterial = new THREE.MeshStandardMaterial();
							if (newProperty.owner) {
								basicMaterial.color = new THREE.Color(Number(newProperty.owner.color.replace("#", "0x")));
							} else {
								basicMaterial.color.set("#cccccc");
							}
							(<THREE.Mesh>o).material = basicMaterial;
						}
					});
				}
			}
		});
		const linkMapItem = mapInfo.mapItems.find((item) => {
			if (!item.linkto) return false;
			if (item.linkto === targetMapItem.id) return true;
		});
		if (linkMapItem && this.mapItemsInScene.has(linkMapItem.id)) {
			const linkItem = this.mapItemsInScene.get(linkMapItem.id)!;
			// [修改] LookAt 的高度也基于目标表面
			const linkSurfaceY = this.getMapItemSurfaceHeight(linkItem);

			const lookat = new THREE.Vector3();
			lookat.copy(linkItem.position);
			lookat.setY(linkSurfaceY);
			propertyBuildModel.lookAt(lookat);
			// propertyBuildModel.rotateY(-Math.PI / 2);
		}
		propertyBuildModel.scale.set(0, 0, 0);
		this.mapContainer.add(propertyBuildModel);
		gsap.to(propertyBuildModel.scale, {
			x: 1,
			y: 1,
			z: 1,
			duration: 0.4,
			onComplete: () => {
				const houseItem = this.housesItems.get(newProperty.id);
				if (houseItem) {
					const costList = newProperty.costList;
					if (newProperty.owner) {
						houseItem.textSprite.updateText(
							`${newProperty.name}\n过路费: ${Math.round(
								costList[newProperty.level] * useGameData().currentMultiplier,
							)}￥`,
							newProperty.owner.color,
						);
					} else {
						houseItem.textSprite.updateText(
							`${newProperty.name}\n可购买: ${Math.round(newProperty.sellCost)}￥`,
							"#000000",
						);
					}
					const textSpriteModel = houseItem.textSprite.getSprite();
					const box = new THREE.Box3().setFromObject(propertyBuildModel);
					// 计算边界框的高度
					const size = box.getSize(new THREE.Vector3());
					textSpriteModel.position.y = 1;
					propertyBuildModel.add(textSpriteModel);
					houseItem.group = propertyBuildModel;
				}
			},
		});
	}

	private async updatePlayerPositionBySegment(
		playerId: string,
		segment: MapMovementSegment,
		totalSteps?: number,
		startStep?: number,
	) {
		const playerEntity = this.playerEntities.get(playerId);
		if (!playerEntity) return;

		const fromMapItem = this.getMapItemById(segment.fromMapItemId);
		const toMapItem = this.getMapItemById(segment.toMapItemId);
		if (!toMapItem) {
			console.warn(`[渲染器] MapPath V2 移动目标不存在: ${segment.toMapItemId} (${segment.direction})`);
			return;
		}

		const playerModel = playerEntity.model;
		const playerBody = playerEntity.bodyMesh;
		if (fromMapItem) {
			const { x, z } = fromMapItem.position;
			playerModel.position.set(x, this.getMapItemSurfaceHeight(fromMapItem), z);
		} else {
			console.warn(`[渲染器] MapPath V2 移动起点不存在: ${segment.fromMapItemId} (${segment.direction})`);
		}

		const { x: targetX, z: targetZ } = toMapItem.position;
		const targetY = this.getMapItemSurfaceHeight(toMapItem);
		if (!useDeviceStatus().isFocus) {
			playerModel.position.set(targetX, targetY, targetZ);
			return;
		}

		const actualTotalSteps = totalSteps ?? 1;
		const actualStartStep = startStep ?? 1;
		const initialRemaining = Math.max(0, actualTotalSteps - actualStartStep + 1);
		const stepTextSprite = new TextSprite(initialRemaining.toString(), 64, "#ffb84d", 8, 0);
		const stepMesh = stepTextSprite.getSprite();
		stepMesh.position.set(0.5, PLAY_MODEL_SIZE - 0.3, 0);
		stepMesh.scale.set(3, 3, 3);
		stepMesh.renderOrder = 9999999;
		playerBody?.add(stepMesh);

		try {
			useAudioManager().playSound(SoundName.PLAYER_STEP);
			const animation = gsap.timeline();
			if (playerBody) {
				const fromScreenX = getScreenPosition(fromMapItem ?? playerModel, this.camera).x;
				const toScreenX = getScreenPosition(toMapItem, this.camera).x;
				const targetDir =
					toScreenX > fromScreenX ? 1 : toScreenX < fromScreenX ? -1 : Math.sign(playerBody.scale.x) || 1;
				animation.to(playerBody.scale, { x: targetDir, duration: 0.1 }, 0);
				animation.to(
					playerBody.scale,
					{
						y: 0.98,
						duration: 0.08,
						ease: "power2.in",
						onComplete: () => stepTextSprite.updateText(Math.max(0, initialRemaining - 1).toString()),
					},
					0.175,
				);
				animation.to(playerBody.scale, { y: 1, duration: 0.08, ease: "sine.out" }, 0.27);
			}
			animation.to(
				playerModel.position,
				{
					x: targetX,
					y: targetY,
					z: targetZ,
					duration: 0.35,
					ease: "power2.inOut",
				},
				0,
			);
			await animation;
		} finally {
			playerBody?.remove(stepMesh);
			stepMesh.geometry.dispose();
			if (Array.isArray(stepMesh.material)) {
				stepMesh.material.forEach((material) => material.dispose());
			} else {
				stepMesh.material.dispose();
			}
		}
	}
	private async updatePlayerPositionByStep(
		playerId: string,
		sourceIndex: number,
		stepNum: number,
		total: number,
		totalSteps?: number,
		startStep?: number,
	) {
		if (!this.playerEntities.has(playerId)) return;

		// 向后兼容：如果没有提供 totalSteps，使用当前步数
		const actualTotalSteps = totalSteps ?? Math.abs(stepNum);
		const actualStartStep = startStep ?? 1;

		// 动画执行次数基于这一段的步数，而不是总步数
		const animationSteps = Math.abs(stepNum);

		// 不提前设置 playerPosition，由服务器通过 GameData 统一控制
		const endIndex = (((sourceIndex + stepNum) % total) + total) % total;

		const playerEntity = this.playerEntities.get(playerId);

		if (playerEntity) {
			const playerModule = playerEntity.model;
			const playerBody = playerEntity.bodyMesh;

			// 初始显示剩余步数
			const initialRemaining = actualTotalSteps - actualStartStep + 1;
			const stepTextSprite = new TextSprite(initialRemaining.toString(), 64, "#ffb84d", 8, 0);
			const stepMesh = stepTextSprite.getSprite();
			stepMesh.position.set(0.5, PLAY_MODEL_SIZE - 0.3, 0);
			stepMesh.scale.set(3, 3, 3);
			stepMesh.renderOrder = 9999999;
			playerBody && playerBody.add(stepMesh);
			// ----------------------------

			const deviceStatusStore = useDeviceStatus();

			try {
				for (let i = 1; i <= animationSteps; i++) {
					const nextMapItem = this.getMapItem((((sourceIndex + Math.sign(stepNum) * i) % total) + total) % total);

					if (nextMapItem) {
						// 播放走路音效
						useAudioManager().playSound(SoundName.PLAYER_STEP);

						let currentAnimation: gsap.core.Timeline | null = null;

						// 检查是否失焦，如果是则跳到当前步目标位置后继续
						if (!deviceStatusStore.isFocus) {
							const nextSurfaceY = this.getMapItemSurfaceHeight(nextMapItem);
							const { x, z } = nextMapItem.position;

							playerModule.position.set(x, nextSurfaceY, z);
							if (playerBody) {
								const { x: nextMapItemScreenX } = getScreenPosition(nextMapItem, this.camera);
								const { x: playerScreenX } = getScreenPosition(playerModule, this.camera);
								const targetDir =
									nextMapItemScreenX > playerScreenX
										? 1
										: nextMapItemScreenX < playerScreenX
											? -1
											: Math.sign(playerBody.scale.x);
								playerBody.scale.set(targetDir, 1, 1);

								const remaining = actualTotalSteps - (actualStartStep + i);
								if (remaining >= 0) {
									stepTextSprite.updateText(remaining.toString());
								}
							}
							continue;
						}

						const { x: nextMapItemScreenX } = getScreenPosition(nextMapItem, this.camera);
						const { x: playerScreenX } = getScreenPosition(playerModule, this.camera);

						currentAnimation = gsap.timeline();
						const duration = 0.35;

						const nextSurfaceY = this.getMapItemSurfaceHeight(nextMapItem);

						// --- 1. 方向翻转 ---
						if (playerBody) {
							let targetDir = Math.sign(playerBody.scale.x);
							if (nextMapItemScreenX > playerScreenX) targetDir = 1;
							else if (nextMapItemScreenX < playerScreenX) targetDir = -1;

							currentAnimation.to(playerBody.scale, { x: targetDir, duration: 0.1 }, 0);
						}

						// --- 2. 整体位移 ---
						const { x, z } = nextMapItem.position;
						currentAnimation.to(
							playerModule.position,
							{
								x,
								y: nextSurfaceY,
								z,
								duration: duration,
								ease: "power2.inOut",
							},
							0,
						);

						// --- 3. 动态形变 ---
						if (playerBody) {
							currentAnimation.to(
								playerBody.scale,
								{
									y: 0.98,
									duration: duration * 0.2,
									ease: "power2.in",
									onComplete: () => {
										// 计算剩余步数：总步数 - (起始步数 + 当前步索引 - 1)
										const remaining = actualTotalSteps - (actualStartStep + i - 1);
										if (remaining >= 0) {
											stepTextSprite.updateText(remaining.toString());
										}
									},
								},
								duration * 0.5,
							);

							currentAnimation.to(
								nextMapItem.scale,
								{
									x: 0.95,
									y: 0.95,
									z: 0.95,
									duration: duration * 0.2,
									ease: "power2.in",
								},
								duration * 0.5,
							);

							currentAnimation.to(
								playerBody.scale,
								{
									y: 1.02,
									duration: duration * 0.5,
									ease: "power2.out",
								},
								0,
							);

							currentAnimation.to(
								nextMapItem.scale,
								{
									x: 1.05,
									y: 1.05,
									z: 1.05,
									duration: duration * 0.5,
									ease: "power2.out",
								},
								duration * 0.5,
							);

							currentAnimation.to(
								playerBody.scale,
								{
									y: 1,
									duration: duration * 0.2,
									ease: "sine.out",
								},
								duration * 0.9,
							);

							currentAnimation.to(
								nextMapItem.scale,
								{
									x: 1,
									y: 1,
									z: 1,
									duration: duration * 0.2,
									ease: "sine.out",
								},
								duration * 0.9,
							);
						}

						await currentAnimation;
					} else {
						throw new Error("MapItem error");
					}
				}
			} finally {
				// --- [新增] 清理资源 ---
				// 动画结束或中断后，移除并销毁步数文字
				playerBody && playerBody.remove(stepMesh);
				stepMesh.geometry.dispose();
				if (Array.isArray(stepMesh.material)) {
					stepMesh.material.forEach((m) => m.dispose());
				} else {
					stepMesh.material.dispose();
				}
				// -------------------
			}
		}
	}

	/**
	 * 重新加载场景（类似重新初始化渲染器）
	 * 用于窗口恢复焦点时完全重新渲染
	 */
	public async reloadScene() {
		// 1. 取消所有动画
		this.playerPendingWalks.clear();
		this.clearAllThinkingMarkers();

		// 2. 清空场景动态对象
		this.playerEntities.forEach((player) => this.scene.remove(player.model));
		this.playerEntities.clear();
		this.playerPosition.clear();

		this.housesItems.forEach((houseItem) => {
			this.mapContainer.remove(houseItem.group);
			houseItem.group.traverse((object) => {
				// @ts-ignore
				if (object.isMesh) {
					const mesh = object as THREE.Mesh;
					if (Array.isArray(mesh.material)) {
						mesh.material.forEach((m) => m.dispose());
					} else {
						mesh.material?.dispose();
					}
					mesh.geometry?.dispose();
				}
			});
		});
		this.housesItems.clear();

		// 3. 重新初始化玩家
		await this.initPlayer();

		// 4. 重新初始化建筑
		await this.initProperties();
	}

	private removePlayerEntity(playerId: string) {
		const playerEntity = this.playerEntities.get(playerId);
		if (!playerEntity) return;

		this.clearSpeechBubble(playerId);
		this.clearThinkingMarker(playerId);
		this.playerPendingWalks.delete(playerId);
		this.playerPosition.delete(playerId);
		if (this.currentFocusModule === playerEntity.model) {
			this.currentFocusModule = null;
			this.isLockingRole = false;
		}
		this.scene.remove(playerEntity.model);
		this.playerEntities.delete(playerId);
	}

	private updatePlayerPosition(playerInfo: PlayerInfo) {
		const mapItemId = this.resolvePlayerMapItemId(playerInfo);
		const mapItem = this.getMapItemById(mapItemId);
		if (!mapItem) {
			if (mapItemId) console.warn(`[渲染器] 未找到玩家初始位置地图项: ${mapItemId}`);
			return;
		}

		this.playerPosition.set(playerInfo.id, mapItemId!);
		const player = this.playerEntities.get(playerInfo.id);
		if (!player) return;
		const { x, z } = mapItem.position;
		player.model.position.set(x, this.getMapItemSurfaceHeight(mapItem), z);
	}

	private getMapPathChoiceAnchor(mapItemId: string): THREE.Vector3 | undefined {
		const mapItem = this.getMapItemById(mapItemId);
		if (!mapItem) return undefined;
		const anchor = mapItem.getWorldPosition(new THREE.Vector3());
		anchor.y = this.getMapItemSurfaceHeight(mapItem);
		return anchor;
	}

	private getMapPathChoiceFootprintRadius(mapItemId: string, direction: THREE.Vector3): number {
		const mapItem = this.getMapItemById(mapItemId);
		if (!mapItem) return 0.6;

		const box = new THREE.Box3().setFromObject(mapItem);
		if (box.isEmpty()) return 0.6;
		const size = box.getSize(new THREE.Vector3());
		// 计算模型外接矩形在分支方向上的半径，使箭头紧贴模型外围而不是固定偏移。
		return Math.max(0.35, Math.abs(direction.x) * size.x * 0.5 + Math.abs(direction.z) * size.z * 0.5);
	}

	private getMapPathChoiceLabel(mapItemId: string): string {
		const mapItem = this.mapData.mapItems.find((item) => item.id === mapItemId);
		if (!mapItem) return mapItemId;
		const mapEvent = mapItem.mapEventId
			? this.mapData.mapEvents.find((event) => event.id === mapItem.mapEventId)
			: undefined;
		return mapItem.property?.name || mapEvent?.name || mapItem.type.name || mapItem.id;
	}

	private getMapItemIdByIndex(index: number | undefined): string | undefined {
		if (index === undefined || !Number.isInteger(index)) return undefined;
		return useMapData().mapIndex[index];
	}

	private getMapItemById(mapItemId: string | undefined): THREE.Group | undefined {
		return mapItemId ? this.mapItemsInScene.get(mapItemId) : undefined;
	}

	private resolvePlayerMapItemId(playerInfo: PlayerInfo): string | undefined {
		return playerInfo.positionMapItemId || this.getMapItemIdByIndex(playerInfo.positionIndex);
	}

	private getLegacyPositionIndex(playerId: string): number | undefined {
		const mapItemId = this.playerPosition.get(playerId);
		if (mapItemId) {
			const index = useMapData().mapIndex.indexOf(mapItemId);
			if (index >= 0) return index;
		}
		return useGameData().players.find((player) => player.id === playerId)?.positionIndex;
	}

	private getMapItemPosition(index: number) {
		return this.getMapItem(index)?.position ?? new THREE.Vector3(0, 0, 0);
	}

	private getPlayerEntity(id: string) {
		return this.playerEntities.get(id);
	}

	/** 旧 positionIndex/mapIndex 协议的兼容回退。 */
	private getMapItem(index: number) {
		return this.getMapItemById(this.getMapItemIdByIndex(index));
	}

	/**
	 * 获取指定 MapItem 模型的表面高度 (世界坐标 Y)
	 * 优先查找名为 'Floor'/'Base'/'Ground' 的子Mesh作为地面基准
	 * @param mapItem 格子的 Group 对象
	 */
	private getMapItemSurfaceHeight(mapItem: THREE.Object3D): number {
		if (!mapItem) return 0;

		let target: THREE.Object3D | null = null;
		// 1. 尝试寻找明确标记为地面的子对象
		mapItem.traverse((child) => {
			const name = child.name.toLowerCase();
			if (name.includes("floor") || name.includes("base") || name.includes("ground")) {
				// 简单的启发式：通常地面是 Mesh
				//@ts-ignore
				if (child.isMesh) {
					target = child;
				}
			}
		});

		// 2. 如果没找到特定地面，就计算整体包围盒
		if (!target) target = mapItem;

		const box = new THREE.Box3().setFromObject(target);

		// 3. 安全检查：如果包围盒无效，回退到物体原点
		if (box.isEmpty()) return mapItem.position.y;

		return box.max.y;
	}

	private getGroupCenter(group: THREE.Group) {
		if (group.children.length === 0) return new THREE.Vector3(0, 0, 0);
		const centerPoint = new THREE.Vector3();
		group.children.forEach(function (child) {
			centerPoint.add(child.position);
		});
		const numChildren = group.children.length;
		centerPoint.divideScalar(numChildren);
		return centerPoint;
	}

	private setItemPositionOnMap(object: THREE.Object3D, x: number, z: number, rotation = 0, y: number = 0) {
		object.position.set(x + 0.5, y, z + 0.5);
		object.rotation.y = (Math.PI / 2) * rotation;
	}

	/**
	 * 动态添加地图事件图标到场景
	 * @param mapItemId 地块 ID
	 * @param mapEvent 地图事件（含 iconId）
	 */
	public async addEventIcon(mapItemId: string, mapEvent: { id: string; iconId: string }): Promise<void> {
		// 如果该地块上已经有图标，先移除（同一地块只允许一个事件图标）
		if (this.arrivedEventIcons.has(mapItemId)) {
			this.removeEventIcon(mapItemId);
		}

		const mapItemModel = this.mapItemsInScene.get(mapItemId);
		if (!mapItemModel) return;

		const iconUrl = useResourceStore().getRecourceById(mapEvent.iconId)?.url;
		if (!iconUrl) return;

		// 立即设置占位，防止并发重复加载
		const placeholder = new THREE.Mesh();
		this.arrivedEventIcons.set(mapItemId, placeholder);

		const textureLoader = new THREE.TextureLoader();
		const texture = await textureLoader.loadAsync(iconUrl);
		texture.colorSpace = THREE.SRGBColorSpace;

		// 检查是否在加载期间被移除（unlink/remove 先于加载完成到达）
		if (this.arrivedEventIcons.get(mapItemId) !== placeholder) {
			placeholder.geometry?.dispose();
			(placeholder.material as THREE.Material)?.dispose();
			return;
		}

		const planeGeometry = new THREE.PlaneGeometry(1, 1);
		const planeMaterial = new THREE.MeshBasicMaterial({
			map: texture,
			side: THREE.DoubleSide,
			transparent: true,
			depthTest: true,
			depthWrite: false,
		});
		const iconPlane = new THREE.Mesh(planeGeometry, planeMaterial);
		iconPlane.rotateX(-Math.PI / 2);
		iconPlane.renderOrder = 1;
		// 替换占位
		this.mapContainer.remove(placeholder);
		this.arrivedEventIcons.set(mapItemId, iconPlane);
		this.mapContainer.add(iconPlane);

		const surfaceY = this.getMapItemSurfaceHeight(mapItemModel);
		const mapItem = this.mapData.mapItems.find((m) => m.id === mapItemId);
		if (mapItem) {
			this.setItemPositionOnMap(iconPlane, mapItem.x, mapItem.y, 0, surfaceY + 0.01);
		}
	}

	/**
	 * 动态移除地图事件图标
	 * @param mapEventId 事件 ID
	 */
	public removeEventIcon(mapItemId: string): void {
		const icon = this.arrivedEventIcons.get(mapItemId);
		if (icon) {
			// 移除（可能是真实图标或加载中的占位 mesh）
			this.mapContainer.remove(icon);
			icon.geometry?.dispose();
			if (Array.isArray(icon.material)) {
				icon.material.forEach((m) => m.dispose());
			} else {
				(icon.material as THREE.Material)?.dispose();
			}
			this.arrivedEventIcons.delete(mapItemId);
		}
	}

	/**
	 * 更新地图块模型上的事件 userData（控制 hover 提示）
	 * @param mapItemId 地块 ID
	 * @param mapEvent 事件对象，传 null 清除
	 */
	public setMapItemEventUserData(
		mapItemId: string,
		mapEvent: { id: string; name: string; description: string } | null,
	): void {
		const mapItemModel = this.mapItemsInScene.get(mapItemId);
		if (!mapItemModel) return;
		if (mapEvent) {
			mapItemModel.userData["mapEvent"] = clone(mapEvent);
		} else {
			delete mapItemModel.userData["mapEvent"];
		}
	}

	private breakUpPlayersInSameMapItem() {
		// 动画可能先于 GameData 同步；以渲染缓存的 mapItemId 为准，缺失时才回退玩家状态。
		const groups = new Map<string, PlayerInfo[]>();
		for (const player of useGameData().players) {
			const mapItemId = this.playerPosition.get(player.id) ?? this.resolvePlayerMapItemId(player);
			if (!mapItemId) continue;
			const players = groups.get(mapItemId) ?? [];
			players.push(player);
			groups.set(mapItemId, players);
		}

		for (const [mapItemId, players] of groups) {
			const mapItem = this.getMapItemById(mapItemId);
			if (!mapItem) {
				console.warn(`[渲染器] 无法叠放玩家，地图项不存在: ${mapItemId}`);
				continue;
			}
			const { x, z } = mapItem.position;
			const surfaceY = this.getMapItemSurfaceHeight(mapItem);
			if (players.length > 1) {
				const offsets = generateCirclePointsOffset(x, z, 0.5, players.length);
				offsets.forEach((offset, index) => {
					const playerEntity = this.getPlayerEntity(players[index].id);
					if (!playerEntity) return;
					playerEntity.model.position.set(x + offset.offsetX, surfaceY, z + offset.offsetY);
					const scale = 1 - 1 / players.length;
					gsap.to(playerEntity.model.scale, {
						x: Math.sign(playerEntity.model.scale.x) * scale,
						y: Math.sign(playerEntity.model.scale.y) * scale,
						z: Math.sign(playerEntity.model.scale.z) * scale,
					});
				});
			} else {
				const playerEntity = this.getPlayerEntity(players[0].id);
				if (!playerEntity) continue;
				playerEntity.model.position.set(x, surfaceY, z);
				gsap.to(playerEntity.model.scale, {
					x: Math.sign(playerEntity.model.scale.x),
					y: Math.sign(playerEntity.model.scale.y),
					z: Math.sign(playerEntity.model.scale.z),
				});
			}
		}

		function generateCirclePointsOffset(
			x: number,
			y: number,
			r: number,
			n: number,
		): Array<{ offsetX: number; offsetY: number }> {
			const points: Array<{ offsetX: number; offsetY: number }> = [];
			const radius = r - PLAY_MODEL_SIZE / 2;
			const angleStep = (2 * Math.PI) / n;
			for (let i = 0; i < n; i++) {
				const angle = i * angleStep;
				points.push({
					offsetX: radius * Math.cos(angle),
					offsetY: radius * Math.sin(angle),
				});
			}
			return points;
		}
	}

	public toggleLockCamera() {
		this.isLockingRole = !this.isLockingRole;
		return this.isLockingRole;
	}

	private resolvePreferredFocusPlayerId(): string | null {
		const userId = getCurrentClientPlayerId();
		if (this.playerEntities.has(userId)) {
			return userId;
		}
		const gameData = useGameData();
		if (gameData.currentPlayerIdInRound && this.playerEntities.has(gameData.currentPlayerIdInRound)) {
			return gameData.currentPlayerIdInRound;
		}
		const firstPlayer = gameData.players.find((player) => this.playerEntities.has(player.id));
		return firstPlayer?.id ?? Array.from(this.playerEntities.keys())[0] ?? null;
	}

	/**
	 * 将相机回归到自己的视角
	 */
	public focusOnSelf() {
		const focusPlayerId = this.resolvePreferredFocusPlayerId();
		if (!focusPlayerId) {
			console.warn("[相机] 未找到可聚焦的玩家模型");
			return;
		}
		const playerEntity = this.playerEntities.get(focusPlayerId);
		if (!playerEntity) {
			console.warn(`[相机] 未找到可聚焦的玩家模型: ${focusPlayerId}`);
			return;
		}

		this.currentFocusModule = playerEntity.model;
		this.updateCamera(this.controls, this.currentFocusModule, 8, 30);
		this.controls.update();

		console.log(`[相机] 相机已聚焦到 ${focusPlayerId === getCurrentClientPlayerId() ? "自己的" : "观战目标"} 视角`);
	}

	private createPopoverOnPlayerTop(
		playerId: string,
		component: Component,
		props?: Record<string, any>,
		delay?: number,
	) {
		const playerEntity = this.playerEntities.get(playerId);
		if (!playerEntity) return;
		const position = new THREE.Vector3();
		position.copy(playerEntity.model.position);

		const { css2DObject, appInstance, unmount } = createCSS2DObjectFromVue(component, props);
		css2DObject.position.copy(position);
		this.scene.add(css2DObject);
		if (delay)
			gsap.to(css2DObject.position, {
				x: position.x + (Math.random() - 0.5),
				y: position.y + (Math.random() - 0.5),
				z: position.z + (Math.random() - 0.5),
				duration: delay / 1000,
			});
		delay && setTimeout(unmount, delay);
	}

	private showPlayerSpeechBubble(message: ChatMessage) {
		if (message.type !== ChatMessageType.Text) return;
		const playerId = message.user.userId;
		if (!this.playerEntities.has(playerId) || !message.content?.trim()) return;

		this.clearSpeechBubble(playerId);

		const { containerEl, unmount } = createCSS2DObjectFromVue(PlayerSpeechBubble3D, {
			username: message.user.username,
			color: message.user.color,
			content: message.content.trim(),
		});
		const rootEl = containerEl.firstElementChild instanceof HTMLElement ? containerEl.firstElementChild : containerEl;
		containerEl.style.position = "absolute";
		containerEl.style.left = "0";
		containerEl.style.top = "0";
		containerEl.style.pointerEvents = "none";
		containerEl.style.willChange = "transform";
		containerEl.style.zIndex = "2";
		rootEl.dataset.tail = "bottom";
		rootEl.dataset.offscreen = "false";
		this.popElementRenderer.domElement.appendChild(containerEl);

		const timeoutId = window.setTimeout(() => {
			this.clearSpeechBubble(playerId);
		}, 3600);

		this.activeSpeechBubbles.set(playerId, {
			containerEl,
			rootEl,
			unmount,
			timeoutId,
		});
		this.updateActiveSpeechBubbleLayout();
	}

	private clearSpeechBubble(playerId: string) {
		const activeBubble = this.activeSpeechBubbles.get(playerId);
		if (!activeBubble) return;

		window.clearTimeout(activeBubble.timeoutId);
		activeBubble.containerEl.parentElement?.removeChild(activeBubble.containerEl);
		activeBubble.unmount();
		this.activeSpeechBubbles.delete(playerId);
	}

	private clearAllSpeechBubbles() {
		Array.from(this.activeSpeechBubbles.keys()).forEach((playerId) => this.clearSpeechBubble(playerId));
	}

	private syncPlayerThinkingMarker(playerId: string, isThinking: boolean) {
		if (isThinking) {
			this.showThinkingMarker(playerId);
			return;
		}
		this.clearThinkingMarker(playerId);
	}

	private showThinkingMarker(playerId: string) {
		if (this.activeThinkingMarkers.has(playerId)) return;
		const playerEntity = this.playerEntities.get(playerId);
		if (!playerEntity) return;
		const sprite = createThinkingSpinnerSprite();
		const parent = playerEntity.bodyMesh ?? playerEntity.model;
		const baseScale = 0.42;

		sprite.position.set(0.5, PLAY_MODEL_SIZE - 0.28, 0);
		sprite.scale.set(baseScale, baseScale, baseScale);
		sprite.renderOrder = 9999998;
		parent.add(sprite);

		const material = sprite.material as THREE.SpriteMaterial;
		const spinTween = gsap.to(material, {
			rotation: Math.PI * 2,
			duration: 1.25,
			ease: "none",
			repeat: -1,
		});

		this.activeThinkingMarkers.set(playerId, { sprite, spinTween });
	}

	private clearThinkingMarker(playerId: string) {
		const marker = this.activeThinkingMarkers.get(playerId);
		if (!marker) return;

		marker.spinTween.kill();
		marker.sprite.parent?.remove(marker.sprite);
		marker.sprite.geometry?.dispose();
		const material = marker.sprite.material;
		if (Array.isArray(material)) {
			material.forEach((item) => {
				item.map?.dispose();
				item.dispose();
			});
		} else {
			material.map?.dispose();
			material.dispose();
		}
		this.activeThinkingMarkers.delete(playerId);
	}

	private clearAllThinkingMarkers() {
		Array.from(this.activeThinkingMarkers.keys()).forEach((playerId) => this.clearThinkingMarker(playerId));
	}

	private updateActiveSpeechBubbleLayout() {
		if (this.activeSpeechBubbles.size === 0) return;

		const viewportWidth = this.container.clientWidth;
		const viewportHeight = this.container.clientHeight;
		if (viewportWidth <= 0 || viewportHeight <= 0) return;

		const placements: SpeechBubblePlacement[] = [];

		for (const [playerId, activeBubble] of this.activeSpeechBubbles) {
			const anchorWorldPos = this.getSpeechBubbleAnchorWorldPosition(playerId);
			if (!anchorWorldPos) {
				activeBubble.containerEl.style.opacity = "0";
				continue;
			}

			const width = Math.max(activeBubble.containerEl.offsetWidth, MIN_SPEECH_BUBBLE_WIDTH);
			const height = Math.max(activeBubble.containerEl.offsetHeight, MIN_SPEECH_BUBBLE_HEIGHT);
			const projection = this.projectWorldPosition(anchorWorldPos);

			if (projection.isOnScreen) {
				placements.push({
					playerId,
					containerEl: activeBubble.containerEl,
					rootEl: activeBubble.rootEl,
					width,
					height,
					centerX: THREE.MathUtils.clamp(
						projection.screenX,
						SPEECH_BUBBLE_MARGIN + width / 2,
						viewportWidth - SPEECH_BUBBLE_MARGIN - width / 2,
					),
					centerY: THREE.MathUtils.clamp(
						projection.screenY - height / 2 - SPEECH_BUBBLE_SCREEN_OFFSET_Y,
						SPEECH_BUBBLE_MARGIN + height / 2,
						viewportHeight - SPEECH_BUBBLE_MARGIN - height / 2,
					),
					offscreen: false,
					edge: "bottom",
				});
				continue;
			}

			placements.push(
				this.getOffscreenSpeechBubblePlacement(
					playerId,
					activeBubble,
					width,
					height,
					projection.ndc,
					projection.cameraSpace,
					viewportWidth,
					viewportHeight,
				),
			);
		}

		this.resolveOffscreenSpeechBubbleOverlaps(placements, viewportWidth, viewportHeight);
		placements.forEach((placement) => this.applySpeechBubblePlacement(placement));
	}

	private getSpeechBubbleAnchorWorldPosition(playerId: string): THREE.Vector3 | null {
		const playerEntity = this.playerEntities.get(playerId);
		if (!playerEntity) return null;
		return playerEntity.model.localToWorld(new THREE.Vector3(0, SPEECH_BUBBLE_ANCHOR_Y, 0));
	}

	private projectWorldPosition(worldPos: THREE.Vector3) {
		const ndc = worldPos.clone().project(this.camera);
		const cameraSpace = worldPos.clone().applyMatrix4(this.camera.matrixWorldInverse);
		const screenX = (ndc.x * 0.5 + 0.5) * this.container.clientWidth;
		const screenY = (-(ndc.y * 0.5) + 0.5) * this.container.clientHeight;
		const isInFront = cameraSpace.z < 0;
		const isOnScreen = isInFront && ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1;

		return { ndc, cameraSpace, screenX, screenY, isInFront, isOnScreen };
	}

	private getOffscreenSpeechBubblePlacement(
		playerId: string,
		activeBubble: ActiveSpeechBubble,
		width: number,
		height: number,
		ndc: THREE.Vector3,
		cameraSpace: THREE.Vector3,
		viewportWidth: number,
		viewportHeight: number,
	): SpeechBubblePlacement {
		let directionX = ndc.x;
		let directionY = ndc.y;

		if (cameraSpace.z >= 0) {
			directionX = -directionX;
			directionY = -directionY;
		}

		if (Math.abs(directionX) < 0.001 && Math.abs(directionY) < 0.001) {
			directionY = cameraSpace.y >= 0 ? 1 : -1;
		}

		const xLimit = Math.max(0.08, 1 - ((SPEECH_BUBBLE_MARGIN + width / 2) * 2) / viewportWidth);
		const yLimit = Math.max(0.08, 1 - ((SPEECH_BUBBLE_MARGIN + height / 2) * 2) / viewportHeight);
		const xRatio = Math.abs(directionX) / xLimit;
		const yRatio = Math.abs(directionY) / yLimit;
		const scale = 1 / Math.max(xRatio, yRatio, 1);
		const clampedX = THREE.MathUtils.clamp(directionX * scale, -xLimit, xLimit);
		const clampedY = THREE.MathUtils.clamp(directionY * scale, -yLimit, yLimit);
		const projectedX = (clampedX * 0.5 + 0.5) * viewportWidth;
		const projectedY = (-(clampedY * 0.5) + 0.5) * viewportHeight;

		let edge: SpeechBubbleEdge;
		let centerX = projectedX;
		let centerY = projectedY;

		if (xRatio > yRatio) {
			edge = clampedX >= 0 ? "right" : "left";
			centerX = edge === "right" ? viewportWidth - SPEECH_BUBBLE_MARGIN - width / 2 : SPEECH_BUBBLE_MARGIN + width / 2;
		} else {
			edge = clampedY >= 0 ? "top" : "bottom";
			centerY = edge === "top" ? SPEECH_BUBBLE_MARGIN + height / 2 : viewportHeight - SPEECH_BUBBLE_MARGIN - height / 2;
		}

		return {
			playerId,
			containerEl: activeBubble.containerEl,
			rootEl: activeBubble.rootEl,
			width,
			height,
			centerX,
			centerY,
			offscreen: true,
			edge,
		};
	}

	private resolveOffscreenSpeechBubbleOverlaps(
		placements: SpeechBubblePlacement[],
		viewportWidth: number,
		viewportHeight: number,
	) {
		const placementsByEdge = new Map<SpeechBubbleEdge, SpeechBubblePlacement[]>([
			["top", []],
			["right", []],
			["bottom", []],
			["left", []],
		]);

		placements
			.filter((placement) => placement.offscreen)
			.forEach((placement) => placementsByEdge.get(placement.edge)?.push(placement));

		placementsByEdge.forEach((edgePlacements, edge) => {
			if (edgePlacements.length <= 1) return;

			const isVerticalEdge = edge === "left" || edge === "right";
			edgePlacements.sort((a, b) => (isVerticalEdge ? a.centerY - b.centerY : a.centerX - b.centerX));

			for (let index = 0; index < edgePlacements.length; index += 1) {
				const current = edgePlacements[index];
				if (isVerticalEdge) {
					const minCenter = SPEECH_BUBBLE_MARGIN + current.height / 2;
					current.centerY = Math.max(current.centerY, minCenter);
					if (index > 0) {
						const prev = edgePlacements[index - 1];
						const minGap = (prev.height + current.height) / 2 + SPEECH_BUBBLE_STACK_GAP;
						current.centerY = Math.max(current.centerY, prev.centerY + minGap);
					}
				} else {
					const minCenter = SPEECH_BUBBLE_MARGIN + current.width / 2;
					current.centerX = Math.max(current.centerX, minCenter);
					if (index > 0) {
						const prev = edgePlacements[index - 1];
						const minGap = (prev.width + current.width) / 2 + SPEECH_BUBBLE_STACK_GAP;
						current.centerX = Math.max(current.centerX, prev.centerX + minGap);
					}
				}
			}

			for (let index = edgePlacements.length - 1; index >= 0; index -= 1) {
				const current = edgePlacements[index];
				if (isVerticalEdge) {
					const maxCenter = viewportHeight - SPEECH_BUBBLE_MARGIN - current.height / 2;
					current.centerY = Math.min(current.centerY, maxCenter);
					if (index < edgePlacements.length - 1) {
						const next = edgePlacements[index + 1];
						const minGap = (next.height + current.height) / 2 + SPEECH_BUBBLE_STACK_GAP;
						current.centerY = Math.min(current.centerY, next.centerY - minGap);
					}
				} else {
					const maxCenter = viewportWidth - SPEECH_BUBBLE_MARGIN - current.width / 2;
					current.centerX = Math.min(current.centerX, maxCenter);
					if (index < edgePlacements.length - 1) {
						const next = edgePlacements[index + 1];
						const minGap = (next.width + current.width) / 2 + SPEECH_BUBBLE_STACK_GAP;
						current.centerX = Math.min(current.centerX, next.centerX - minGap);
					}
				}
			}
		});
	}

	private applySpeechBubblePlacement(placement: SpeechBubblePlacement) {
		placement.containerEl.style.opacity = "1";
		placement.containerEl.style.left = `${placement.centerX}px`;
		placement.containerEl.style.top = `${placement.centerY}px`;
		placement.containerEl.style.transform = "translate(-50%, -50%)";
		placement.rootEl.dataset.tail = placement.edge;
		placement.rootEl.dataset.offscreen = placement.offscreen ? "true" : "false";
	}

	//让摄像机看自己
	private focusMe() {
		const focusPlayerId = this.resolvePreferredFocusPlayerId();
		if (focusPlayerId) {
			this.focusPlayerById(focusPlayerId);
		}
	}

	private focusPlayerById(id: string) {
		const playerEntity = this.playerEntities.get(id);
		if (!playerEntity) {
			console.warn(`[相机] 无法聚焦玩家: 找不到 ID 为 ${id} 的玩家实体`);
			return;
		}

		this.currentFocusModule = playerEntity.model;
		this.updateCamera(this.controls, this.currentFocusModule, 8, 30);
		this.controls.update();
	}

	/**
	 * 将世界坐标转换为屏幕坐标
	 */
	private getWorldToScreenPosition(worldPos: THREE.Vector3): { x: number; y: number } {
		const vector = worldPos.clone();
		vector.project(this.camera);

		const screenX = (vector.x * 0.5 + 0.5) * this.container.clientWidth;
		const screenY = (-(vector.y * 0.5) + 0.5) * this.container.clientHeight;

		return { x: screenX, y: screenY };
	}

	/**
	 * 在玩家头顶创建钱币动画（使用 CSS2DObject）
	 */
	private spawnMoneyParticleOnPlayer(playerId: string, amount: number) {
		const playerEntity = this.playerEntities.get(playerId);
		if (!playerEntity) return;

		const position = playerEntity.model.position.clone();
		position.y += 1; // 角色头顶上方
		// position.x += 0.3; // 右上角偏移

		const size = this.getParticleSize(amount);

		const { css2DObject, unmount } = createCSS2DObjectFromVue(MoneyParticle3D, {
			amount,
			size,
			onComplete: () => {
				unmount();
				this.scene.remove(css2DObject);
				// 从活跃列表中移除
				const particles = this.activeMoneyParticles.get(playerId);
				if (particles) {
					const index = particles.indexOf(css2DObject);
					if (index > -1) particles.splice(index, 1);
				}
			},
		});

		css2DObject.position.copy(position);
		this.scene.add(css2DObject);

		// 追踪活跃粒子
		if (!this.activeMoneyParticles.has(playerId)) {
			this.activeMoneyParticles.set(playerId, []);
		}
		this.activeMoneyParticles.get(playerId)!.push(css2DObject);
	}

	/**
	 * 根据金额获取粒子尺寸
	 */
	private getParticleSize(amount: number): "sm" | "md" | "lg" | "xl" {
		const absAmount = Math.abs(amount);
		if (absAmount < 100) return "sm";
		if (absAmount < 500) return "md";
		if (absAmount < 1000) return "lg";
		return "xl";
	}
	/**
	 * 应用新的像素比
	 */
	private applyPixelRatio(newPixelRatio: number) {
		console.log("[画质设置] 应用像素比:", newPixelRatio);
		console.log("[画质设置] 设置前 Canvas:", this.canvas.width, "x", this.canvas.height);

		// 设置所有像素比
		this.renderer.setPixelRatio(newPixelRatio);
		this.composer.setPixelRatio(newPixelRatio);

		// 更新相机和尺寸
		this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
		this.renderPass.setSize(this.container.clientWidth, this.container.clientHeight);
		this.composer.setSize(this.container.clientWidth, this.container.clientHeight);
		this.popElementRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
		this.diceManager && this.diceManager.updateAspect(this.container.clientWidth / this.container.clientHeight);

		console.log("[画质设置] 设置后 Canvas:", this.canvas.width, "x", this.canvas.height);
		console.log("[画质设置] 像素比生效:", this.renderer.getPixelRatio());
	}

	/**
	 * 应用阴影设置
	 */
	private applyShadowSetting(enable: boolean) {
		console.log("[阴影设置] 应用阴影设置:", enable);

		// 设置渲染器阴影开关
		this.renderer.shadowMap.enabled = enable;

		// 遍历场景中所有对象，更新阴影属性
		this.scene.traverse((object) => {
			if ((object as THREE.Mesh).isMesh) {
				(object as THREE.Mesh).castShadow = enable;
				(object as THREE.Mesh).receiveShadow = enable;
			}
		});

		// 更新灯光阴影
		this.scene.traverse((object) => {
			if ((object as THREE.DirectionalLight).isDirectionalLight) {
				const light = object as THREE.DirectionalLight;
				light.castShadow = enable;
			}
		});

		console.log("[阴影设置] 阴影设置已应用");
	}

	/**
	 * 应用模型动画设置
	 * 动态注册或注销所有已加载模型的动画
	 */
	private applyModelAnimationSetting(enable: boolean) {
		console.log("[动画设置] 应用模型动画设置:", enable ? "开启" : "关闭");

		const mapData = useMapData();

		for (const mapItem of mapData.mapItems) {
			const modelData = this.mapModules.get(mapItem.type.modelId);
			const mapItemModel = this.mapItemsInScene.get(mapItem.id);

			if (!modelData || !mapItemModel) continue;
			if (!modelData.hasAnimations) continue;

			const instanceId = `${mapItem.type.modelId}_${mapItem.id}`;

			if (enable) {
				// 注册动画
				if (!this.animationManager.hasAnimation(instanceId)) {
					this.animationManager.registerModel(instanceId, modelData.gltf, mapItemModel, {
						autoPlay: true,
						loop: THREE.LoopRepeat,
					});
				}
			} else {
				// 注销动画
				if (this.animationManager.hasAnimation(instanceId)) {
					this.animationManager.unregisterModel(instanceId);
				}
			}
		}

		console.log("[动画设置] 模型动画设置已应用");
	}
}

function createCSS2DObjectFromVue(rootComponent: Component, rootProps?: Record<string, any>) {
	// 创建Vue应用程序实例
	const app = createApp(rootComponent, rootProps);

	// 创建一个div元素，并将应用程序实例挂载到该元素上
	const containerEl = document.createElement("div");
	const appInstance = app.mount(containerEl);

	// 创建CSS2DObject，并将包含组件DOM的div元素作为参数传递
	const css2DObject = new CSS2DObject(containerEl);

	function unmount() {
		app.unmount();
	}

	// 返回CSS2DObject
	return { css2DObject, appInstance, containerEl, unmount };
}

function createThinkingSpinnerSprite(): THREE.Sprite {
	const canvas = document.createElement("canvas");
	canvas.width = 192;
	canvas.height = 192;
	const context = canvas.getContext("2d");
	if (!context) {
		const fallback = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
		return fallback;
	}

	const center = canvas.width / 2;
	const spokeCount = 9;
	const orbitRadius = 40;
	const spokeWidth = 14;
	const spokeHeight = 30;
	const rgb = { r: 150, g: 150, b: 150 };

	context.clearRect(0, 0, canvas.width, canvas.height);
	context.translate(center, center);

	for (let i = 0; i < spokeCount; i++) {
		const angle = (Math.PI * 2 * i) / spokeCount;
		const alpha = 0.18 + (0.82 * (i + 1)) / spokeCount;

		context.save();
		context.rotate(angle);
		context.beginPath();
		context.roundRect(-spokeWidth / 2, -orbitRadius - spokeHeight / 2, spokeWidth, spokeHeight, spokeWidth / 2);
		context.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`;
		context.fill();
		context.lineWidth = 5;
		context.strokeStyle = `rgba(255,255,255,${Math.min(0.98, alpha + 0.2).toFixed(3)})`;
		context.stroke();
		context.restore();
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;

	const material = new THREE.SpriteMaterial({
		map: texture,
		depthWrite: false,
		transparent: true,
	});

	return new THREE.Sprite(material);
}

function enableShadows(object: THREE.Object3D, enable: boolean) {
	object.traverse((child) => {
		if ((child as THREE.Mesh).isMesh) {
			child.castShadow = enable;
			child.receiveShadow = enable;
		}
	});
}

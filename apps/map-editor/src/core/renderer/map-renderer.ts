import { GameMap, MapPath } from "@mine-monopoly/types";
import { debounce, ThreeSceneBase, AnimationManager } from "@mine-monopoly/utils";
import { CameraMode, OperationMode } from "@src/enums";
import { useEditorStore, useMapDataStore, useResourceStore } from "@src/stores";
import { eventBus, type Events } from "@src/utils/event-bus";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { LoopRepeat, Clock } from "three";
import { MapItem, MapItemType } from "@mine-monopoly/types/interfaces/game/item";
import { applyOpacityToObject, createDynamicLine, createMultiLine, DynamicLine, getModelById } from "@src/utils/three";
import { render } from "vue";
import { SolidOutlinePass } from "@src/utils/three/passes/SolidOutLinePass";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { GammaCorrectionShader } from "three/examples/jsm/shaders/GammaCorrectionShader";
import { message } from "ant-design-vue";
import { BoxSelector, projectToScreen, isPointInRect } from "@src/utils/three/box-selector";
import { generateMapItemId } from "@src/utils/map-item-id";

interface MapItemTypeWithModel extends MapItemType {
	model: THREE.Object3D;
	gltf?: Awaited<ReturnType<typeof getModelById>>;
	hasAnimations?: boolean;
}

interface RenderedMapPath {
	visual: THREE.Group;
	hit: THREE.Mesh;
}

export class MapRenderer {
	private canvasEl: HTMLCanvasElement;
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.Camera;
	private requestAnimationFrameId: number = -1;
	private resizeObserver: ResizeObserver | undefined;

	private controls!: OrbitControls;
	private cameraTarget = new THREE.Vector3(0, 0, 0);
	private currentRotation: 0 | 1 | 2 | 3 = 0;
	private outlinePass: SolidOutlinePass;
	private linkOutlinePass: SolidOutlinePass;
	private multiSelectOutlinePass: SolidOutlinePass;
	private composer!: EffectComposer;

	private itemTypesCache: Map<string, MapItemTypeWithModel> = new Map();

	// GLB 模型动画管理
	private animationManager: AnimationManager | null = null;
	private clock: Clock | null = null;

	private raycaster: THREE.Raycaster = new THREE.Raycaster();
	private point: THREE.Vector2 = new THREE.Vector2(0, 0);
	private plane: THREE.Mesh;
	private previewBoxInCreate: THREE.Object3D | undefined;
	private mapItemsInScene: Map<string, THREE.Object3D> = new Map();
	private mapItemGroup: THREE.Group = new THREE.Group();
	private mapIndexLineGroup: THREE.Group = new THREE.Group();
	private mapPathGroup: THREE.Group = new THREE.Group();
	private mapPathHitGroup: THREE.Group = new THREE.Group();
	private mapPathsInScene: Map<string, RenderedMapPath> = new Map();
	private activeMapPathId?: string;
	private hoveredMapPathId?: string;
	private pathDraftLine: THREE.Line;
	private pathDraftStartPoint: THREE.Mesh;
	private pathDraftEndPoint: THREE.Mesh;
	private linkLineInScene: Map<string, THREE.Object3D> = new Map();
	private linkLineGroup: THREE.Group = new THREE.Group();
	private mapEventInScene: Map<string, THREE.Object3D> = new Map();
	private mapEventGroup: THREE.Group = new THREE.Group();
	private linkHelperLine: DynamicLine;
	private boxSelector: BoxSelector;
	private justCompletedBoxSelect: boolean = false;
	private gridHelper: THREE.GridHelper;
	private axesHelper: THREE.AxesHelper;
	private previewRequestId = 0;
	private readonly eventBusCleanups: Array<() => void> = [];
	private readonly onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
	private readonly onMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
	private readonly onMouseUp = (event: MouseEvent) => this.handleMouseUp(event);
	private readonly onMouseClick = (event: MouseEvent) => this.handleMouseClick(event);
	private readonly onContextMenu = (event: MouseEvent) => this.handleContextMenu(event);
	private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyPress(event);
	private readonly onWindowResize = () => this.handleResize();
	private readonly onContainerResize = () => this.handleResize();
	private readonly onFullscreenChange = () => requestAnimationFrame(() => this.handleResize());

	constructor(canvasEl: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, preserveDrawingBuffer: true });
		this.canvasEl = canvasEl;
		this.canvasEl.style.width = "100%";
		this.canvasEl.style.height = "100%";
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(75, this.canvasEl.clientWidth / this.canvasEl.clientHeight, 0.1, 100);
		// this.renderLoop();
		this.renderer.setSize(this.canvasEl.clientWidth, this.canvasEl.clientHeight, false);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;

		this.scene.background = new THREE.Color(0xbbbbbb);
		this.requestAnimationFrameId = -1;

		// 链接辅助线
		this.linkHelperLine = createDynamicLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
		this.scene.add(this.linkHelperLine.line);

		// 路径编辑草稿线
		this.pathDraftLine = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
			new THREE.LineBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.75,
				depthTest: false,
				depthWrite: false,
			}),
		);
		this.pathDraftLine.renderOrder = 11;
		this.pathDraftLine.visible = false;
		this.scene.add(this.pathDraftLine);
		this.pathDraftStartPoint = new THREE.Mesh(
			new THREE.SphereGeometry(0.06, 12, 8),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.75,
				depthTest: false,
				depthWrite: false,
			}),
		);
		this.pathDraftStartPoint.renderOrder = 11;
		this.pathDraftStartPoint.visible = false;
		this.scene.add(this.pathDraftStartPoint);
		this.pathDraftEndPoint = new THREE.Mesh(
			new THREE.SphereGeometry(0.06, 12, 8),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.75,
				depthTest: false,
				depthWrite: false,
			}),
		);
		this.pathDraftEndPoint.renderOrder = 11;
		this.pathDraftEndPoint.visible = false;
		this.scene.add(this.pathDraftEndPoint);

		// 相机初始位置
		this.camera.position.set(0, 10, 0);

		// 轨道控制器
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.target.copy(this.cameraTarget);
		this.controls.update();

		// 网格
		this.gridHelper = new THREE.GridHelper(10000, 10000, 0x6666ff);
		this.scene.add(this.gridHelper);

		// 坐标轴
		this.axesHelper = new THREE.AxesHelper(5);
		this.scene.add(this.axesHelper);

		const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
		const planeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0, transparent: true });
		this.plane = new THREE.Mesh(planeGeometry, planeMaterial);
		this.plane.rotateX(-Math.PI / 2);
		this.plane.position.set(0, 0, 0);

		this.scene.add(this.plane);

		//加载物块容器
		this.scene.add(this.mapItemGroup);

		//加载辅助线
		this.scene.add(this.linkLineGroup);

		//加载地图事件图标
		this.scene.add(this.mapEventGroup);

		//加载地图索引路径
		this.scene.add(this.mapIndexLineGroup);
		this.scene.add(this.mapPathGroup);
		this.scene.add(this.mapPathHitGroup);

		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		const size = new THREE.Vector2(canvasEl.clientWidth, canvasEl.clientHeight);

		this.outlinePass = new SolidOutlinePass(size, this.scene, this.camera);
		this.outlinePass.edgeStrength = 10;
		this.outlinePass.edgeThickness = 1.5;
		this.outlinePass.visibleEdgeColor.set(0xffffff);
		this.outlinePass.hiddenEdgeColor.set(0xffffff);
		this.composer.addPass(this.outlinePass);

		this.linkOutlinePass = new SolidOutlinePass(size, this.scene, this.camera);
		this.linkOutlinePass.edgeStrength = 8;
		this.linkOutlinePass.edgeThickness = 1.5;
		this.linkOutlinePass.visibleEdgeColor.set(0x6611ff);
		this.linkOutlinePass.hiddenEdgeColor.set(0x6611ff);
		this.composer.addPass(this.linkOutlinePass);

		// 初始化框选高亮 Pass
		this.multiSelectOutlinePass = new SolidOutlinePass(size, this.scene, this.camera);
		this.multiSelectOutlinePass.edgeStrength = 10;
		this.multiSelectOutlinePass.edgeThickness = 2.0; // 更粗的边框
		this.multiSelectOutlinePass.visibleEdgeColor.set(0x00ff00); // 绿色高亮，便于区分
		this.multiSelectOutlinePass.hiddenEdgeColor.set(0x00ff00);
		this.multiSelectOutlinePass.enabled = true; // 确保启用
		this.composer.addPass(this.multiSelectOutlinePass);

		console.log('框选高亮 Pass 已初始化');

		const gammaPass = new ShaderPass(GammaCorrectionShader);
		this.composer.addPass(gammaPass);

		this.switchCameraMode(useEditorStore().currentCameraMode);

		// 灯光
		this.initLight();

		// 初始化框选器
		this.boxSelector = new BoxSelector(canvasEl, this.scene);

		window.addEventListener("resize", this.onWindowResize);
		document.addEventListener("fullscreenchange", this.onFullscreenChange);
		this.resizeObserver = new ResizeObserver(this.onContainerResize);
		this.resizeObserver.observe(this.canvasEl.parentElement ?? this.canvasEl);
		this.handleResize();
		this.initEventListeners();
		eventBus.emit("renderer-ready");

		// 初始化动画管理器
		this.animationManager = new AnimationManager();
		this.clock = new Clock();

		// 渲染循环
		const loop = () => {
			this.requestAnimationFrameId = requestAnimationFrame(loop);

			// 更新 GLB 模型动画
			if (this.animationManager && this.clock) {
				const delta = this.clock.getDelta();
				this.animationManager.update(delta);
			}

			this.controls.update();
			this.composer.render();
		};
		loop();
	}

	// 在你的类中
	private initLight() {
		function getGroupCenter(group: THREE.Group) {
			if (group.children.length === 0) return new THREE.Vector3(0, 0, 0);
			const box = new THREE.Box3().setFromObject(group);
			const center = new THREE.Vector3();
			box.getCenter(center);
			return center;
		}
		const centerPos = getGroupCenter(this.mapItemGroup);

		// 1. 环境光 (AmbientLight) - 全局提亮，消除死角
		// 颜色：纯白 | 强度：0.9 (很高，保证画面明亮)
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
		this.scene.add(ambientLight);

		// 2. 半球光 (HemisphereLight) - 增加卡通层次感
		// 天空：纯白 | 地面：淡灰色 (模拟漫反射，不要太暖以免发黄)
		// 强度：1.0
		const skyColor = 0xffffff;
		const groundColor = 0xeeeeee; // 极淡的灰，保持干净
		const hemisphereLight = new THREE.HemisphereLight(skyColor, groundColor, 1.0);
		hemisphereLight.position.set(0, 50, 0);
		this.scene.add(hemisphereLight);

		// 3. 平行光 (DirectionalLight) - 主光源 (产生阴影)
		// 颜色：纯白 (去黄) | 强度：2.5 (大幅提升亮度)
		const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);

		// 位置：拉高一点，让影子短一点，显得更清爽
		dirLight.position.set(-50, 100, -50);
		dirLight.target.position.copy(centerPos);
		this.scene.add(dirLight);
		this.scene.add(dirLight.target);

		// 4. 阴影配置 (保持柔和)
		dirLight.castShadow = true;
		dirLight.shadow.mapSize.width = 2048;
		dirLight.shadow.mapSize.height = 2048;
		dirLight.shadow.normalBias = 0.05; // 修复条纹
		dirLight.shadow.bias = -0.0005; // 微调贴合度

		// 扩大阴影相机范围，防止地图边缘阴影被切断
		const d = 100;
		dirLight.shadow.camera.left = -d;
		dirLight.shadow.camera.right = d;
		dirLight.shadow.camera.top = d;
		dirLight.shadow.camera.bottom = -d;
		dirLight.shadow.camera.near = 0.1;
		dirLight.shadow.camera.far = 500;
	}

	private initEventListeners() {
		this.onEvent("map-loaded", async (mapData) => {
			await this.loadMap(mapData);
		});

		this.onEvent("map-background-update", () => {
			this.loadMapBackground();
		});

		this.onEvent("change-operation-mode", (newMode) => {
			if (newMode !== OperationMode.Select) {
				this.clearPathDraft();
				this.setActiveMapPath(undefined);
			}
			switch (newMode) {
				case OperationMode.Edit:
					this.outlinePass.selectedObjects = [];
					this.linkOutlinePass.selectedObjects = [];
					this.multiSelectOutlinePass.selectedObjects = [];
					break;
				case OperationMode.Select:
					useEditorStore().currentMapItemTypeId = "";
					this.updatePreviewBox();
					break;
			}
			useEditorStore().currentMapItemId = "";
			useEditorStore().isLinkMode = false;
		});

		this.onEvent("change-camera-mode", (newMode) => {
			this.switchCameraMode(newMode);
		});

		this.onEvent("change-link-mode", (isLinkMode) => {
			if (!isLinkMode) {
				this.outlinePass.selectedObjects = [];
				this.linkOutlinePass.selectedObjects = [];
				this.multiSelectOutlinePass.selectedObjects = [];
			}
		});

		this.onEvent("map-item-link", (id) => {
			this.handleMapItemLink(id);
		});

		this.onEvent("map-item-unlink", (id) => {
			this.handleMapItemUnLink(id);
		});

		this.onEvent("map-event-link", (id) => {
			this.handleMapEventLink(id);
		});

		this.onEvent("map-event-unlink", (id) => {
			this.handleMapEventUnLink(id);
		});

		this.onEvent("map-index-update", (indexList) => {
			this.updateMapIndex([...indexList]);
		});

		this.onEvent("map-path-added", (pathId) => {
			this.renderMapPath(pathId);
		});
		this.onEvent("map-path-updated", (pathId) => {
			this.refreshMapPath(pathId);
		});
		this.onEvent("map-path-removed", (pathId) => {
			this.removeMapPathFromScene(pathId);
			if (this.activeMapPathId === pathId) this.setActiveMapPath(undefined);
		});
		this.onEvent("map-paths-for-map-item-updated", (mapItemId) => {
			this.refreshMapPathsForMapItem(mapItemId);
		});
		this.onEvent("map-paths-replaced", () => {
			if (this.activeMapPathId && !useMapDataStore().findMapPathById(this.activeMapPathId)) {
				this.setActiveMapPath(undefined);
			}
			this.rebuildMapPaths();
		});
		this.onEvent("map-path-selected", (pathId) => {
			this.setActiveMapPath(pathId);
		});

		this.onEvent("map-item-type-selected", (itemTypeId) => {
			this.updatePreviewBox(itemTypeId);
		});

		this.onEvent("map-item-deleted", (mapItemId) => {
			this.removeMapItem(mapItemId);
		});

		this.onEvent("toggle-box-select-mode", () => {
			this.handleBoxSelectModeToggle();
		});

		this.onEvent("toggle-indicators", () => {
			const visible = !this.gridHelper.visible;
			this.gridHelper.visible = visible;
			this.axesHelper.visible = visible;
			this.mapIndexLineGroup.visible = visible;
			this.mapPathGroup.visible = visible;
			this.mapPathHitGroup.visible = visible;
			this.linkLineGroup.visible = visible;
			this.linkHelperLine.line.visible = visible;
		});

		this.onEvent("map-item-updated", (id: string) => {
			this.handleMapItemUpdated(id);
		});

		this.onEvent("batch-move-map-items", (data: { ids: string[], deltaX: number, deltaY: number }) => {
			console.log('[渲染器] 收到批量移动事件:', data);
			this.handleBatchMoveMapItems(data.ids, data.deltaX, data.deltaY);
		});

		this.onEvent("batch-delete-map-items", async (ids: string[]) => {
			console.log('[渲染器] 收到批量删除事件:', ids);
			await this.handleBatchDeleteMapItems(ids);
		});

			this.onEvent("batch-rotate-map-items", async (data: { ids: string[], direction: 1 | -1 }) => {
				console.log('[渲染器] 收到批量旋转事件:', data);
				await this.handleBatchRotateMapItems(data.ids, data.direction);
			});

		this.onEvent("batch-select-all", () => {
			console.log('[渲染器] 收到全选事件');
			this.handleBatchSelectAll();
		});

		this.onEvent("clear-selection", () => {
			console.log('[渲染器] 收到清空选择事件');
			this.clearMultiSelect();
		});

		this.onEvent("undo-delete", async () => {
			console.log('[渲染器] 收到撤销删除事件');
			await this.handleUndoDelete();
		});

		console.log('[渲染器初始化] 批量操作事件监听器已设置完成');

		this.onEvent("change-model", async (modelId: string) => {
			await this.handleModelChanged(modelId);
		});

		this.initMouseListener();
		this.initKeyBoardListener();
	}

	private initMouseListener() {
		this.canvasEl.addEventListener("mousemove", this.onMouseMove);
		this.canvasEl.addEventListener("mousedown", this.onMouseDown);
		this.canvasEl.addEventListener("mouseup", this.onMouseUp);
		this.canvasEl.addEventListener("click", this.onMouseClick);
		this.canvasEl.addEventListener("contextmenu", this.onContextMenu);
	}

	private initKeyBoardListener() {
		document.addEventListener("keydown", this.onKeyDown);
	}

	private onEvent<Key extends keyof Events>(event: Key, handler: (payload: Events[Key]) => void) {
		eventBus.on(event, handler);
		this.eventBusCleanups.push(() => eventBus.off(event, handler));
	}

	private handleResize() {
		const parent = this.canvasEl.parentElement;
		this.canvasEl.style.width = "100%";
		this.canvasEl.style.height = "100%";
		const width = parent?.clientWidth || this.canvasEl.clientWidth;
		const height = parent?.clientHeight || this.canvasEl.clientHeight;
		if (width === 0 || height === 0) return;

		if (this.camera instanceof THREE.PerspectiveCamera) {
			this.camera.aspect = width / height;
		} else if (this.camera instanceof THREE.OrthographicCamera) {
			const frustumHeight = this.camera.top - this.camera.bottom;
			const halfWidth = (frustumHeight * width) / height / 2;
			this.camera.left = -halfWidth;
			this.camera.right = halfWidth;
		}
		(this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).updateProjectionMatrix();
		this.renderer.setSize(width, height, false);
		this.composer.setSize(width, height);
		this.outlinePass.setSize(width, height);
		this.linkOutlinePass.setSize(width, height);
		this.multiSelectOutlinePass.setSize(width, height);
	}

	private handleMouseMove(event: MouseEvent) {
		const mouseX = (event.offsetX / this.canvasEl.clientWidth) * 2 - 1;
		const mouseY = -(event.offsetY / this.canvasEl.clientHeight) * 2 + 1;

		this.point.set(mouseX, mouseY);
		this.raycaster.setFromCamera(this.point, this.camera);

		// 框选模式处理
		if (useEditorStore().isBoxSelectMode && useEditorStore().isBoxSelecting) {
			const store = useEditorStore();
			if (store.boxSelectStart) {
				this.boxSelector.show(
					store.boxSelectStart.x,
					store.boxSelectStart.y,
					event.offsetX,
					event.offsetY
				);
			}
			return;
		}

		// 原有的鼠标移动逻辑
		switch (useEditorStore().currentEditMode) {
			case OperationMode.Edit:
				this.handleMouseMoveInCreate();
				break;
			case OperationMode.Select:
				this.handleMouseMoveInSelect();
				break;
			default:
				this.handleMouseMoveInMove();
				break;
		}
	}

	private handleMouseMoveInCreate() {
		const throughInstances = this.raycaster.intersectObjects([this.plane], false);
		// console.log(throughInstances);
		if (throughInstances.length > 0) {
			const firstInstance = throughInstances[0];
			const x = Math.floor(firstInstance.point.x);
			const z = Math.floor(firstInstance.point.z);
			//旋转TODO
			if (this.previewBoxInCreate) this.setItemPositionOnMap(this.previewBoxInCreate, x, z, this.currentRotation);
		}
	}

	private handleMouseMoveInSelect() {
		const editorStore = useEditorStore();
		const hit = this.raycaster.intersectObjects(this.mapPathHitGroup.children, true)[0];
		const pathId = hit?.object.userData.mapPathId as string | undefined;
		this.setHoveredMapPath(pathId);

		const hoveredMapItemId = editorStore.pathDraftSourceId ? this.getMapItemIdFromRaycast() : undefined;
		const hoveredMapItem =
			hoveredMapItemId && hoveredMapItemId !== editorStore.pathDraftSourceId
				? this.mapItemsInScene.get(hoveredMapItemId)
				: undefined;
		this.linkOutlinePass.selectedObjects = hoveredMapItem ? [hoveredMapItem] : [];

		this.updatePathDraft();
		this.canvasEl.style.cursor = editorStore.pathDraftSourceId
			? hoveredMapItem
				? "pointer"
				: "crosshair"
			: pathId
				? "pointer"
				: "default";
	}

	private handleMouseMoveInMove() {}

	private handleMouseClick(event: MouseEvent) {
		// 如果刚刚完成了框选操作，忽略 click 事件
		if (this.justCompletedBoxSelect) {
			console.log('[点击处理] 跳过 click 事件，刚刚完成了框选');
			return;
		}

		const mouseX = (event.offsetX / this.canvasEl.clientWidth) * 2 - 1;
		const mouseY = -(event.offsetY / this.canvasEl.clientHeight) * 2 + 1;

		this.point.set(mouseX, mouseY);

		this.raycaster.setFromCamera(this.point, this.camera);

		switch (useEditorStore().currentEditMode) {
			case OperationMode.Edit:
				const modeSwitched = this.handleMouseClickInCreate();
				// 只有在没有切换模式时才清空高亮
				if (!modeSwitched) {
					this.outlinePass.selectedObjects = [];
				}
				break;
			case OperationMode.Select:
				this.handleMouseClickInSelect(event);
				break;
		}
	}

	private handleContextMenu(event: MouseEvent) {
		if (!useEditorStore().pathDraftSourceId) return;
		event.preventDefault();
		this.clearPathDraft();
	}

	private handleMouseClickInCreate(): boolean {
		const currentItemType = useEditorStore().currentMapItemType;

		// 如果没有选择 mapItemType，尝试点击已存在的 mapitem
		if (!currentItemType) {
			const mapItemInstances = this.raycaster.intersectObjects(Array.from(this.mapItemsInScene.values()), true);
			if (mapItemInstances.length > 0) {
				// 点击到了 mapitem，切换到选择模式并选中
				const firstInstance = mapItemInstances[0];
				const target = firstInstance.object;

				let temp: THREE.Object3D | null = target;
				while (temp) {
					if (temp.userData.id && temp.userData.position) {
						const id = temp.userData.id;

						// 清空预览框（选择模式不需要预览）
						this.updatePreviewBox();

						// 切换到选择模式
						useEditorStore().currentEditMode = OperationMode.Select;
						useEditorStore().isLinkMode = false;

						// 清空其他高亮
						this.linkOutlinePass.selectedObjects = [];
						this.multiSelectOutlinePass.selectedObjects = [];

						// 选中该 mapitem
						useEditorStore().setSelectedMapItemIds([id]);
						useEditorStore().currentMapItemId = id;
						this.outlinePass.selectedObjects = [temp];

						// 高亮绑定的另一方
						const mapItem = useMapDataStore().findMapItemById(id);
						if (mapItem) {
							const targetId = mapItem.beLinked || mapItem.linkto || "";
							const targetObject = this.mapItemsInScene.get(targetId);
							if (targetObject) {
								this.linkOutlinePass.selectedObjects = [targetObject];
							}
						}

						message.info("已切换到选择模式", 1);
						console.log('[创造模式] 自动切换到选择模式并选中:', id);
						return true; // 返回 true 表示切换了模式
					}
					temp = temp.parent;
				}
			}
			// 没有点击到 mapitem，不做任何操作
			return false;
		}

		// 有选择 mapItemType，执行创建操作
		const throughInstances = this.raycaster.intersectObjects([this.plane], false);
		if (throughInstances.length > 0) {
			const firstInstance = throughInstances[0];
			const x = Math.floor(firstInstance.point.x);
			const z = Math.floor(firstInstance.point.z);
			const rotation = this.currentRotation;
			this.createMapItem(x, z, rotation, currentItemType);
		}
		return false; // 返回 false 表示没有切换模式
	}

	private handleMouseClickInSelect(event: MouseEvent) {
		const editorStore = useEditorStore();
		const mapItemId = this.getMapItemIdFromRaycast();
		if (editorStore.pathDraftSourceId && mapItemId) {
			this.handlePathMapItemClick(mapItemId);
			return;
		}

		const pathHit = this.raycaster.intersectObjects(this.mapPathHitGroup.children, true)[0];
		const pathId = pathHit?.object.userData.mapPathId as string | undefined;
		if (pathId) {
			const isLinkMode = editorStore.isLinkMode;
			this.clearPathDraft();
			this.clearMultiSelect();
			editorStore.currentMapItemId = "";
			eventBus.emit("other-map-item-selected", "");
			if (isLinkMode) {
				editorStore.isLinkMode = false;
				eventBus.emit("change-link-mode", false);
			}
			this.setActiveMapPath(pathId);
			return;
		}

		if (editorStore.pathDraftSourceId) return;

		const throughInstances = this.raycaster.intersectObjects(Array.from(this.mapItemsInScene.values()), true);
		if (throughInstances.length > 0) {
			const firstInstance = throughInstances[0];
			const target = firstInstance.object;

			let temp: THREE.Object3D | null = target;
			while (temp) {
				if (temp.userData.id && temp.userData.position) {
					this.setActiveMapPath(undefined);
					const isLinkMode = editorStore.isLinkMode;
					const currentMapItemId = editorStore.currentMapItemId;
					const id = temp.userData.id as string;
					this.linkOutlinePass.selectedObjects = [];

					if (isLinkMode) {
						if (!currentMapItemId) {
							editorStore.isLinkMode = false;
							eventBus.emit("change-link-mode", false);
						} else {
							this.linkOutlinePass.selectedObjects = [temp];
							eventBus.emit("other-map-item-selected", id);
							break;
						}
					}

					if (this.isModKey(event)) {
						if (editorStore.selectedMapItemIds.includes(id)) editorStore.removeSelectedMapItemId(id);
						else editorStore.addSelectedMapItemId(id);
						this.updateSelectionHighlightWithObjects(editorStore.selectedMapItemIds);
					} else {
						editorStore.setSelectedMapItemIds([id]);
						this.itemSelected(id);
						this.outlinePass.selectedObjects = [temp];
						const mapItem = useMapDataStore().findMapItemById(id);
						if (mapItem) {
							const targetId = mapItem.beLinked || mapItem.linkto || "";
							const targetObject = this.mapItemsInScene.get(targetId);
							if (targetObject) this.linkOutlinePass.selectedObjects = [targetObject];
						}
					}
					break;
				}
				temp = temp.parent;
			}
		} else {
			const isLinkMode = editorStore.isLinkMode;
			this.clearMultiSelect();
			eventBus.emit("other-map-item-selected", "");
			if (isLinkMode) {
				editorStore.isLinkMode = false;
				eventBus.emit("change-link-mode", false);
			}
		}
	}
	private getMapItemIdFromRaycast(): string | undefined {
		const hit = this.raycaster.intersectObjects(Array.from(this.mapItemsInScene.values()), true)[0];
		let target: THREE.Object3D | null = hit?.object ?? null;
		while (target) {
			if (target.userData.id && target.userData.position) return target.userData.id as string;
			target = target.parent;
		}
		return undefined;
	}

	private handlePathMapItemClick(mapItemId: string) {
		const editorStore = useEditorStore();
		const sourceId = editorStore.pathDraftSourceId;
		this.setActiveMapPath(undefined);
		if (!sourceId) {
			editorStore.setPathDraftSource(mapItemId);
			editorStore.setSelectedMapItemIds([mapItemId]);
			this.outlinePass.selectedObjects = [this.mapItemsInScene.get(mapItemId)!];
			return;
		}

		try {
			const path = useMapDataStore().addMapPath({ fromMapItemId: sourceId, toMapItemId: mapItemId, initEnable: true });
			this.clearPathDraft();
			this.setActiveMapPath(path.id);
		} catch (error: any) {
			message.warning(error.message || "无法创建路径", 1.5);
		}
	}

	/** 检查是否按下了修饰键（Windows: Ctrl, macOS: Cmd） */
	private isModKey(event: KeyboardEvent | MouseEvent): boolean {
		return event.ctrlKey || event.metaKey;
	}

	private async handleKeyPress(event: KeyboardEvent) {
		// 检查当前焦点是否在输入元素上，如果是则不处理快捷键
		const target = event.target as HTMLElement;
		const isInputFocused =
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.tagName === "SELECT" ||
			target.isContentEditable;

		// 如果焦点在输入元素上，除了 Ctrl+S (保存) 外，不处理其他快捷键
		if (isInputFocused) {
			if (this.isModKey(event) && event.code === "KeyS") {
				event.preventDefault();
				eventBus.emit("request-save");
			}
			return;
		}

		if (this.isModKey(event) && event.code === "KeyS") {
			event.preventDefault();
			eventBus.emit("request-save");
		}

		const store = useEditorStore();
		if (this.isModKey(event) && (event.code === "KeyZ" || event.code === "KeyY")) {
			event.preventDefault();
			const wantsRedo = event.code === "KeyY" || event.shiftKey;
			if (store.activeMapPathId) {
				const changed = wantsRedo ? useMapDataStore().redoMapPathChange() : useMapDataStore().undoMapPathChange();
				if (!changed) message.info(wantsRedo ? "没有可重做的路径操作" : "没有可撤销的路径操作", 1);
				return;
			}
			if (!wantsRedo && store.canUndoDelete) {
				eventBus.emit("undo-delete");
			} else if (!wantsRedo) {
				message.info("没有可撤销的删除记录", 1);
			}
			return;
		}


		if (!this.isModKey(event) && event.code === "KeyV") {
			event.preventDefault();
			const mapDataStore = useMapDataStore();
			const validationResults = mapDataStore.validateMapPaths();
			const errorCount = validationResults.filter((result) => result.level === "error").length;
			const warningCount = validationResults.length - errorCount;
			const pathNodeCount = mapDataStore.getPathMapItems().length;
			const summary = `路径校验：${pathNodeCount} 个路径节点，${errorCount} 个错误，${warningCount} 个警告`;
			if (errorCount > 0) message.error(summary, 3);
			else if (warningCount > 0) message.warning(summary, 3);
			else message.success(`路径校验通过：${pathNodeCount} 个路径节点`, 2);
			return;
		}

		if (store.pathDraftSourceId && event.code === "Escape") {
			event.preventDefault();
			this.clearPathDraft();
			return;
		}

		if ((event.code === "Delete" || event.code === "Backspace") && store.activeMapPathId) {
			event.preventDefault();
			useMapDataStore().removeMapPath(store.activeMapPathId);
			return;
		}

		// 框选模式快捷键
		if (event.code === "KeyB") {
			event.preventDefault();
			eventBus.emit("toggle-box-select-mode");
			return;
		}

		if (event.code === "Escape") {
			event.preventDefault();
			const store = useEditorStore();
			if (store.isBoxSelectMode) {
				eventBus.emit("toggle-box-select-mode");
			} else {
				// 通过事件总线触发清空选择，保持代码一致性
				eventBus.emit("clear-selection");
			}
			return;
		}

		// Ctrl+A 全选
		if (this.isModKey(event) && event.code === "KeyA") {
			event.preventDefault();
			// 通过事件总线触发全选，保持代码一致性
			eventBus.emit("batch-select-all");
			return;
		}

		// Delete/Backspace 批量删除
		if (event.code === "Delete" || event.code === "Backspace") {
			event.preventDefault();
			const store = useEditorStore();
			if (store.selectedMapItemIds.length > 0) {
				// 通过事件总线触发删除，与 UI 按钮走相同的代码路径
				eventBus.emit("batch-delete-map-items", store.selectedMapItemIds);
			} else {
				message.info("未选中任何 MapItem", 1);
			}
			return;
		}

		// 方向键批量移动
		if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
			event.preventDefault();
			const store = useEditorStore();
			if (store.selectedMapItemIds.length > 0) {
				let deltaX = 0;
				let deltaY = 0;

				switch (event.code) {
					case "ArrowUp":
						deltaY = -1;
						break;
					case "ArrowDown":
						deltaY = 1;
						break;
					case "ArrowLeft":
						deltaX = -1;
						break;
					case "ArrowRight":
						deltaX = 1;
						break;
				}

				// 通过事件总线触发移动，与 UI 按钮走相同的代码路径
				eventBus.emit("batch-move-map-items", {
					ids: store.selectedMapItemIds,
					deltaX,
					deltaY
				});
			}
			return;
		}

		if (useEditorStore().currentEditMode !== OperationMode.Edit || !this.previewBoxInCreate) return;
		if (event.code === "KeyR") {
			this.currentRotation = (++this.currentRotation % 4) as 0 | 1 | 2 | 3;
			this.previewBoxInCreate.rotation.y = (Math.PI / 2) * this.currentRotation;
		}
		if (event.code === "KeyQ") {
			useEditorStore().currentMapItemTypeId = "";
			this.updatePreviewBox();
		}
	}

	private handleBoxSelectModeToggle() {
		const store = useEditorStore();
		if (!store.isBoxSelectMode) {
			// 进入框选模式
			try {
				store.toggleBoxSelectMode();
				this.controls.enabled = false;
				this.canvasEl.style.cursor = "crosshair";
				message.info("已进入框选模式，拖拽鼠标框选，Esc 退出", 2);
			} catch (e: any) {
				message.error(e.message, 2);
			}
		} else {
			// 退出框选模式
			store.exitBoxSelectMode();
			this.controls.enabled = true;
			this.canvasEl.style.cursor = "default";
			this.boxSelector.hide();
			this.clearMultiSelect();
		}
	}

	private handleMouseDown(event: MouseEvent) {
		if (!useEditorStore().isBoxSelectMode) return;

		const x = event.offsetX;
		const y = event.offsetY;

		useEditorStore().startBoxSelect(x, y);
		this.boxSelector.show(x, y, x, y);
	}

	private handleMouseUp(event: MouseEvent) {
		if (!useEditorStore().isBoxSelectMode || !useEditorStore().isBoxSelecting) return;

		const store = useEditorStore();
		if (!store.boxSelectStart) return;

		const startX = store.boxSelectStart.x;
		const startY = store.boxSelectStart.y;
		const currentX = event.offsetX;
		const currentY = event.offsetY;

		this.performBoxSelection(startX, startY, currentX, currentY);
		this.boxSelector.hide();
		store.endBoxSelect();

		// 标记刚刚完成了框选
		this.justCompletedBoxSelect = true;

		// 短暂延迟后重置标记（防止 click 事件中误判）
		setTimeout(() => {
			this.justCompletedBoxSelect = false;
		}, 100);
	}

	private performBoxSelection(startX: number, startY: number, currentX: number, currentY: number) {
		const canvasSize = {
			width: this.canvasEl.clientWidth,
			height: this.canvasEl.clientHeight,
		};

		// 计算选择矩形
		const rect = {
			minX: Math.min(startX, currentX),
			maxX: Math.max(startX, currentX),
			minY: Math.min(startY, currentY),
			maxY: Math.max(startY, currentY),
		};

		// 找出所有在框内的 MapItem
		const selectedIds: string[] = [];
		for (const [id, object] of this.mapItemsInScene) {
			const screenPos = projectToScreen(object.position, this.camera, canvasSize);
			if (isPointInRect(screenPos, rect)) {
				selectedIds.push(id);
			}
		}

		console.log('框选结果:', selectedIds.length, '个 MapItem');

		// 先设置状态
		useEditorStore().setSelectedMapItemIds(selectedIds);

		// 立即更新高亮（不使用 setTimeout），直接传入 selectedIds
		this.updateSelectionHighlightWithObjects(selectedIds);

		if (selectedIds.length > 0) {
			message.success(`已选中 ${selectedIds.length} 个 MapItem`, 1);
		}
	}

	private updateSelectionHighlight() {
		const selectedIds = useEditorStore().selectedMapItemIds;
		const selectedObjects: THREE.Object3D[] = [];

		console.log('[高亮系统] 开始更新高亮');
		console.log('[高亮系统] 选中ID数量:', selectedIds.length);
		console.log('[高亮系统] 选中IDs:', selectedIds);
		console.log('[高亮系统] 场景中对象数量:', this.mapItemsInScene.size);

		selectedIds.forEach(id => {
			const object = this.mapItemsInScene.get(id);
			if (object) {
				console.log('[高亮系统] 找到对象:', id, object.name || object.type);
				selectedObjects.push(object);
			} else {
				console.warn('[高亮系统] 未找到对象:', id);
			}
		});

		console.log('[高亮系统] 准备高亮的对象数量:', selectedObjects.length);
		console.log('[高亮系统] outlinePass 实例:', this.outlinePass);
		console.log('[高亮系统] outlinePass.selectedObjects 之前:', this.outlinePass.selectedObjects.length);

		// 清空 linkOutlinePass，避免干扰
		this.linkOutlinePass.selectedObjects = [];

		// 设置要高亮的对象
		this.outlinePass.selectedObjects = selectedObjects;

		console.log('[高亮系统] outlinePass.selectedObjects 之后:', this.outlinePass.selectedObjects.length);

		// 确保 composer 正确配置
		console.log('[高亮系统] composer passes:', this.composer.passes.length);

		// 尝试强制更新（某些 Three.js 版本需要）
		if (this.composer.renderer) {
			console.log('[高亮系统] 强制渲染一帧');
			this.composer.render();
		}

		console.log('[高亮系统] 高亮更新完成');
	}

	/**
	 * 同步更新高亮，直接传入选中的ID列表
	 * 用于解决响应式状态更新延迟导致的高亮不同步问题
	 */
	private updateSelectionHighlightWithObjects(selectedIds: string[]) {
		const selectedObjects: THREE.Object3D[] = [];

		console.log('[框选高亮] 开始更新高亮');
		console.log('[框选高亮] 传入ID数量:', selectedIds.length);

		selectedIds.forEach(id => {
			const object = this.mapItemsInScene.get(id);
			if (object) {
				console.log('[框选高亮] 找到对象:', id, object.name || object.type);
				selectedObjects.push(object);
			} else {
				console.warn('[框选高亮] 未找到对象:', id);
			}
		});

		console.log('[框选高亮] 准备高亮的对象数量:', selectedObjects.length);
		console.log('[框选高亮] multiSelectOutlinePass:', this.multiSelectOutlinePass);

		// 清空其他高亮 Pass，避免干扰
		this.outlinePass.selectedObjects = [];
		this.linkOutlinePass.selectedObjects = [];

		// 使用专门的框选高亮 Pass
		this.multiSelectOutlinePass.selectedObjects = selectedObjects;

		console.log('[框选高亮] multiSelectOutlinePass.selectedObjects:', this.multiSelectOutlinePass.selectedObjects.length);
		console.log('[框选高亮] 更新完成');
	}

	private clearMultiSelect() {
		useEditorStore().clearSelectedMapItemIds();
		this.setActiveMapPath(undefined);
		this.outlinePass.selectedObjects = [];
		this.linkOutlinePass.selectedObjects = [];
		this.multiSelectOutlinePass.selectedObjects = []; // 清空框选高亮
	}

	private itemSelected(id: string) {
		useEditorStore().currentMapItemId = id;
	}

	// private handleLinkLine() {
	// 	const editorStore = useEditorStore();
	// 	if (editorStore.isLinkMode) {
	// 		const start = editorStore.currentMapItem;
	// 		if (!start) throw Error("在链接模式时没有选中MapItem");
	// 		const end = this.raycaster;
			//		console.log("🚀 ~ MapRenderer ~ handleLinkLine ~ end:", end);
	// 	}
	// }

	private switchCameraMode(newMode: CameraMode) {
		const width = this.canvasEl.clientWidth;
		const height = this.canvasEl.clientHeight;
		const aspect = width / height;
		const distance = this.camera.position.distanceTo(this.cameraTarget);

		let newCamera: THREE.Camera;

		if (newMode === CameraMode.Perspective) {
			newCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
		} else {
			const frustumSize = distance * 2;
			newCamera = new THREE.OrthographicCamera(
				(frustumSize * aspect) / -2,
				(frustumSize * aspect) / 2,
				frustumSize / 2,
				frustumSize / -2,
				0.1,
				50,
			);
		}

		// 替换相机
		this.camera = newCamera;

		// 重建 OrbitControls
		this.controls.dispose();
		this.controls = new OrbitControls(this.camera, this.canvasEl);
		this.controls.target.copy(this.cameraTarget);

		// 控制器限制
		if (newMode === CameraMode.Orthographic) {
			// this.controls.maxPolarAngle = Math.PI / 2;
			// this.controls.minPolarAngle = Math.PI / 2;
			this.controls.enableRotate = false;
			this.controls.enablePan = true;
			// 鼠标左键也用于平移
			this.controls.mouseButtons = {
				LEFT: THREE.MOUSE.PAN,
				MIDDLE: THREE.MOUSE.DOLLY,
				RIGHT: THREE.MOUSE.PAN,
			};
		} else {
			this.controls.maxPolarAngle = Math.PI;
			this.controls.minPolarAngle = 0;
			this.controls.enableRotate = true;
			this.controls.enablePan = true;
			this.controls.mouseButtons = {
				LEFT: THREE.MOUSE.ROTATE,
				MIDDLE: THREE.MOUSE.DOLLY,
				RIGHT: THREE.MOUSE.PAN,
			};
		}

		this.controls.update();

		// 俯视动画（XZ 平面）
		const targetPos = {
			x: this.cameraTarget.x,
			y: this.cameraTarget.y + distance,
			z: this.cameraTarget.z,
		};

		// 直接设置位置
		this.camera.position.set(targetPos.x, targetPos.y, targetPos.z);
		this.camera.up.set(0, 1, 0);
		this.camera.lookAt(this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z);

		this.outlinePass.renderCamera = this.camera;
		this.linkOutlinePass.renderCamera = this.camera;
		this.multiSelectOutlinePass.renderCamera = this.camera;
		this.composer.passes.forEach((pass) => {
			const cameraAwarePass = pass as typeof pass & { camera?: THREE.Camera };
			if ("camera" in cameraAwarePass) {
				cameraAwarePass.camera = this.camera;
			}
		});
		this.lookAtCenter();

		this.controls.update();
	}

	private setItemPositionOnMap(object: THREE.Object3D, x: number, z: number, rotation = 0, y: number = 0) {
		object.position.set(x + 0.5, y, z + 0.5);
		object.rotation.y = (Math.PI / 2) * rotation;
	}

	public setCameraTarget(x: number, y: number, z: number) {
		this.cameraTarget.set(x, y, z);
		this.controls.target.copy(this.cameraTarget);
		this.controls.update();
	}

	private async createMapItem(x: number, y: number, rotation: 0 | 1 | 2 | 3, currentItemType: MapItemType) {
		const newMapItem: MapItem = {
			id: generateMapItemId(),
			x,
			y,
			rotation,
			type: currentItemType,
		};
		if (useMapDataStore().hasMapItemRepeatCoord(x, y)) {
			message.error("这个坐标已经有一个MapItem了", 1);
			return;
		}
		useMapDataStore().addMapItem(newMapItem);
		await this.renderMapItemToMap(newMapItem);
	}

	private removeMapItem(id: string) {
		const mapItem = this.mapItemsInScene.get(id);
		if (!mapItem) throw Error("编辑器中找不到这个MapItem");
		this.mapItemGroup.remove(mapItem);
		this.mapItemsInScene.delete(id);
	}

	private async renderMapItemToMap(mapItem: MapItem) {
		let itemTypeCache = this.itemTypesCache.get(mapItem.type.id);

		if (!itemTypeCache) {
			const gltf = await getModelById(mapItem.type.modelId);
			const model = gltf.scene;
			const hasAnimations = gltf.animations && gltf.animations.length > 0;

			const createdCache: MapItemTypeWithModel = {
				...mapItem.type,
				model,
				gltf,
				hasAnimations,
			};

			this.itemTypesCache.set(mapItem.type.id, createdCache);
			itemTypeCache = createdCache;
		}
		if (!itemTypeCache) throw new Error(`找不到地图元素类型缓存: ${mapItem.type.id}`);
		const hasAnimations = itemTypeCache.hasAnimations || false;

		// For animated models, use clone(true) deep copy to preserve bone structure
		// Then register animation for each instance separately
		let mapItemModel: THREE.Object3D;
		if (hasAnimations && itemTypeCache.gltf) {
			mapItemModel = itemTypeCache.model.clone(true);

			// Register animation for this instance
			if (this.animationManager) {
				const instanceId = `${mapItem.type.modelId}_${mapItem.id}`;
				this.animationManager.registerModel(instanceId, itemTypeCache.gltf, mapItemModel, {
					autoPlay: true,
					loop: LoopRepeat
				});
			}
		} else {
			// Non-animated model, use shallow copy
			mapItemModel = new THREE.Object3D().copy(itemTypeCache.model);
		}

		mapItemModel.userData["position"] = { x: mapItem.x, y: mapItem.y };
		mapItemModel.userData["rotation"] = mapItem.rotation;
		mapItemModel.userData["id"] = mapItem.id;
		this.setItemPositionOnMap(mapItemModel, mapItem.x, mapItem.y, mapItem.rotation);
		this.mapItemsInScene.set(mapItem.id, mapItemModel);
		this.mapItemGroup.add(mapItemModel);
	}

	public async loadMap(mapData: GameMap) {
		mapData = { ...mapData };
		useEditorStore().setLoading(true, "渲染地图中...");
		this.scene.background = new THREE.Color(0xbbbbbb);
		this.mapItemGroup.clear();
		this.itemTypesCache.clear();
		this.linkLineGroup.clear();
		this.mapEventGroup.clear();
 		this.mapItemsInScene.clear();
 		this.linkLineInScene.clear();
 		this.mapEventInScene.clear();
 		this.mapIndexLineGroup.clear();
		const mapItemList = mapData.mapItems;
		//加载MapItem
		for (const mapItem of mapItemList) {
			await this.renderMapItemToMap(mapItem);
		}
		//加载MapItem连接
		for (const mapItem of mapItemList) {
			this.addLinkLine(mapItem);
		}
		//加载事件icon
		for (const mapItem of mapItemList) {
			await this.addMapEventIcon(mapItem);
		}

		this.loadMapBackground();
		// mapPaths 是编辑器中的路径真相源；mapIndex 仅保留兼容可视化。
		this.rebuildMapPaths();
		this.updateMapIndex([...mapData.mapIndex]);
		const editorStore = useEditorStore();
		editorStore.clearMapPathHistory();
		this.clearPathDraft();
		this.setActiveMapPath(undefined);
		//TODO
		useEditorStore().setLoading(false);
		this.lookAtCenter();
	}

	private async loadMapBackground() {
		const imageResourceId = useMapDataStore().info.backgroundImageId;
		const imageResource = useResourceStore().findImageById(imageResourceId);
		if (!imageResource) return;
		const imageUrl = imageResource.url;
		const textureLoader = new THREE.TextureLoader();
		const texture = await textureLoader.loadAsync(imageUrl);
		texture.colorSpace = THREE.SRGBColorSpace;
		this.scene.background = texture;
	}

	private handleMapItemLink(id: string) {
		const mapItem = useMapDataStore().findMapItemById(id);
		if (!mapItem) return;
		this.addLinkLine(mapItem);
		this.clearSelect();
	}

	private handleMapItemUnLink(id: string) {
		this.removeLinkLine(id);
		this.clearSelect();
	}

	private handleMapEventLink(id: string) {
		const mapItem = useMapDataStore().findMapItemById(id);
		if (!mapItem) return;
		this.addMapEventIcon(mapItem);
		this.clearSelect();
	}

	private handleMapEventUnLink(id: string) {
		this.removeMapEventIcon(id);
		this.clearSelect();
	}

	private handleMapItemUpdated(id: string) {
		const mapItem = useMapDataStore().findMapItemById(id);
		const object = this.mapItemsInScene.get(id);

		if (mapItem && object) {
			this.setItemPositionOnMap(object, mapItem.x, mapItem.y, mapItem.rotation);
		}
		this.refreshMapPathsForMapItem(id);
	}

	private async handleModelChanged(modelId: string) {
		console.log('[渲染器] 检测到模型变化:', modelId);

		// 1. 清除受影响的物块类型缓存
		const affectedItemTypes: string[] = [];
		this.itemTypesCache.forEach((value, key) => {
			if (value.modelId === modelId) {
				this.itemTypesCache.delete(key);
				affectedItemTypes.push(key);
			}
		});

		// 2. 重新渲染使用该模型的 MapItem
		const mapDataStore = useMapDataStore();
		const affectedMapItems = mapDataStore.mapItems.filter(
			item => item.type.modelId === modelId
		);

		console.log('[渲染器] 重新渲染', affectedMapItems.length, '个受影响的 MapItem');

		for (const mapItem of affectedMapItems) {
			await this.rerenderMapItem(mapItem.id);
		}

		// 3. 如果当前预览框正在显示该模型，更新预览框
		const currentItemTypeId = useEditorStore().currentMapItemTypeId;
		if (currentItemTypeId) {
			const currentItemType = mapDataStore.findMapItemTypeById(currentItemTypeId);
			if (currentItemType && currentItemType.modelId === modelId) {
				await this.updatePreviewBox(currentItemTypeId);
			}
		}
	}

	private async rerenderMapItem(mapItemId: string) {
		// 1. 从场景中移除旧的模型
		const oldObject = this.mapItemsInScene.get(mapItemId);
		if (oldObject) {
			this.mapItemGroup.remove(oldObject);
			this.mapItemsInScene.delete(mapItemId);
		}

		// 2. 从 mapDataStore 获取最新的 MapItem 数据
		const mapItem = useMapDataStore().findMapItemById(mapItemId);
		if (!mapItem) {
			console.warn('[渲染器] 找不到 MapItem:', mapItemId);
			return;
		}

		// 3. 重新渲染该 MapItem
		await this.renderMapItemToMap(mapItem);
	}

	private async handleBatchMoveMapItems(ids: string[], deltaX: number, deltaY: number) {
		try {
			console.log('[批量移动] 开始移动', ids.length, '个 MapItem, 方向:', deltaX, deltaY);

			useMapDataStore().batchMoveMapItem(ids, deltaX, deltaY);

			// 更新 3D 对象位置
			ids.forEach(id => {
				const object = this.mapItemsInScene.get(id);
				const mapItem = useMapDataStore().findMapItemById(id);
				if (object && mapItem) {
					this.setItemPositionOnMap(object, mapItem.x, mapItem.y, mapItem.rotation);
					console.log('[批量移动] 更新对象位置:', id, '→', mapItem.x, mapItem.y);
				}
			});

			// 刷新相关的视觉元素（使用 await）
			await this.refreshRelatedElements(ids);

			message.success('移动成功', 1);
		} catch (e: any) {
			console.error('[批量移动] 错误:', e);
			message.error(e.message, 2);
		}
	}

	private async handleBatchRotateMapItems(ids: string[], direction: 1 | -1) {
		try {
			console.log('[批量旋转] 开始旋转', ids.length, ' 个 MapItem, 方向:', direction === 1 ? '顺时针' : '逆时针');

			useMapDataStore().batchRotateMapItem(ids, direction);

			// 更新 3D 对象旋转
			ids.forEach(id => {
				const object = this.mapItemsInScene.get(id);
				const mapItem = useMapDataStore().findMapItemById(id);
				if (object && mapItem) {
					this.setItemPositionOnMap(object, mapItem.x, mapItem.y, mapItem.rotation);
					console.log('[批量旋转] 更新对象旋转:', id, '→', mapItem.rotation);
				}
			});

			message.success('旋转成功', 1);
		} catch (e: any) {
			console.error('[批量旋转] 错误:', e);
			message.error(e.message, 2);
		}
	}

	private async handleBatchDeleteMapItems(ids: string[]) {
		try {
			console.log('[批量删除] 开始删除', ids.length, '个 MapItem');

			const store = useEditorStore();

			// 执行删除操作
			useMapDataStore().batchRemoveMapItem(ids);

			// 刷新相关视觉元素（事件图标、连接线、索引路径）
			await this.refreshRelatedElements(ids);

			// 清空选中状态
			store.clearSelectedMapItemIds();
			this.updateSelectionHighlight();

			message.success(`删除成功`, 1);
		} catch (e: any) {
			console.error('[批量删除] 错误:', e);
			message.error(e.message, 2);
		}
	}

	/**
	 * 处理全选操作
	 */
	private handleBatchSelectAll() {
		const allIds = Array.from(this.mapItemsInScene.keys());
		useEditorStore().setSelectedMapItemIds(allIds);
		this.updateSelectionHighlightWithObjects(allIds);
		message.success(`已全选 ${allIds.length} 个 MapItem`, 1);
	}

	/**
	 * 处理撤销删除操作
	 */
	private async handleUndoDelete() {
		try {
			const editorStore = useEditorStore();
			const mapDataStore = useMapDataStore();

			if (!editorStore.canUndoDelete) {
				message.info("没有可撤销的删除记录", 1);
				return;
			}

			// 获取最近一次删除的 mapitem（一个批次）
			const deletedItems = editorStore.popLastDeletedBatch();
			console.log('[撤销删除] 开始恢复最近一次删除', deletedItems.length, '个 MapItem');

			// 恢复最近一次删除的 mapitem
			const restoredIds: string[] = [];
			const relatedIds = new Set<string>(); // 记录所有需要刷新的相关 ID

			for (const item of deletedItems) {
				// 检查位置是否已被占用
				if (mapDataStore.hasMapItemRepeatCoord(item.x, item.y)) {
					message.warning(`位置 (${item.x}, ${item.y}) 已被占用，跳过恢复`, 2);
					continue;
				}

				// 恢复连接关系
				if (item.beLinked) {
					// 这个 mapitem 是主地皮，需要恢复被绑定方的 linkto 和 property
					const linkedItem = mapDataStore.findMapItemById(item.beLinked);
					if (linkedItem) {
						linkedItem.linkto = item.id;
						// 恢复地皮信息
						if (item.property) {
							linkedItem.property = item.property;
						}
						// 记录需要刷新的关联 ID
						relatedIds.add(item.beLinked);
						console.log('[撤销删除] 恢复绑定关系:', item.id, '->', linkedItem.id);
					}
				}

				if (item.linkto) {
					// 这个 mapitem 是被绑定方，需要恢复主地皮的 beLinked
					const linkingItem = mapDataStore.findMapItemById(item.linkto);
					if (linkingItem) {
						linkingItem.beLinked = item.id;
						// 记录需要刷新的关联 ID
						relatedIds.add(item.linkto);
						console.log('[撤销删除] 恢复绑定关系:', item.id, '<-', linkingItem.id);
					}
				}

				// 重新添加到 mapItems
				mapDataStore.addMapItem(item);

				// 渲染到场景
				await this.renderMapItemToMap(item);

				restoredIds.push(item.id);
			}

			// 收集所有需要刷新的 ID（恢复的 mapitem + 它们的关联对象）
			const allIdsToRefresh = [...restoredIds, ...relatedIds];
			console.log('[撤销删除] 需要刷新的元素:', allIdsToRefresh);

			// 刷新所有相关视觉元素（连接线、事件图标、索引路径）
			if (allIdsToRefresh.length > 0) {
				await this.refreshRelatedElements(allIdsToRefresh);
			}

			// 选中恢复的 mapitem
			if (restoredIds.length > 0) {
				editorStore.setSelectedMapItemIds(restoredIds);
				this.updateSelectionHighlightWithObjects(restoredIds);

				message.success(`已恢复 ${restoredIds.length} 个 MapItem 及其关联信息`, 2);
			} else {
				message.warning("没有可恢复的 MapItem", 2);
			}
		} catch (e: any) {
			console.error('[撤销删除] 错误:', e);
			message.error(e.message, 2);
		}
	}

	/**
	 * 刷新与指定 MapItem 相关的所有视觉元素
	 * 包括：地图事件图标、连接线、地图索引路径
	 */
	private async refreshRelatedElements(ids: string[]) {
		console.log('[刷新元素] 开始刷新相关元素，数量:', ids.length);

		// 1. 刷新地图事件图标位置
		await this.refreshMapEventIcons(ids);

		// 2. 刷新连接线
		this.refreshLinkLines(ids);

		// 3. 刷新地图索引路径
		this.refreshMapIndexPath();

		console.log('[刷新元素] 刷新完成');
	}

	/**
	 * 刷新地图事件图标
	 * 注意：事件图标需要重新创建，不能简单地更新位置
	 */
	private async refreshMapEventIcons(ids: string[]) {
		console.log('[刷新图标] 开始刷新图标，数量:', ids.length);

		for (const id of ids) {
			const mapItem = useMapDataStore().findMapItemById(id);
			
			// 移除旧的事件图标
			const existingIcon = this.mapEventInScene.get(id);
			if (existingIcon) {
				console.log('[刷新图标] 移除旧图标:', id);
				this.mapEventGroup.remove(existingIcon);
				this.mapEventInScene.delete(id);
			}
			
			if (!mapItem || !mapItem.mapEventId) {
				console.log('[刷新图标] 跳过，没有事件:', id);
				continue;
			}


			// 重新创建事件图标（使用 addMapEventIcon）
			console.log('[刷新图标] 重新创建图标:', id);
			await this.addMapEventIcon(mapItem);
		}

		console.log('[刷新图标] 图标刷新完成');
	}

	/**
	 * 刷新连接线
	 * 需要移除旧连接线并重新创建
	 */
	private refreshLinkLines(ids: string[]) {
		// 收集需要刷新连接线的所有 MapItem（包括相关的连接）
		const itemsToRefresh = new Set<string>(ids);

		// 添加链接到这些项的其他项
		ids.forEach(id => {
			const mapItem = useMapDataStore().findMapItemById(id);
			if (mapItem) {
				if (mapItem.linkto && !ids.includes(mapItem.linkto)) {
					itemsToRefresh.add(mapItem.linkto);
				}
				if (mapItem.beLinked && !ids.includes(mapItem.beLinked)) {
					itemsToRefresh.add(mapItem.beLinked);
				}
			}
		});

		// 移除所有相关的旧连接线
		itemsToRefresh.forEach(id => {
			this.removeLinkLine(id);
		});

		// 重新创建所有相关的连接线
		itemsToRefresh.forEach(id => {
			const mapItem = useMapDataStore().findMapItemById(id);
			if (mapItem) {
				this.addLinkLine(mapItem);
			}
		});

		console.log('[刷新元素] 刷新了', itemsToRefresh.size, '个连接线');
	}

	/**
	 * 刷新地图索引路径
	 * 完全重新绘制路径
	 */
	private refreshMapIndexPath() {
		// mapPaths 是编辑器的路径真相源；旧 mapIndex 仅在无 mapPaths 的兼容场景下显示。
		this.mapIndexLineGroup.clear();
		const mapDataStore = useMapDataStore();
		if (mapDataStore.mapPaths.length > 0) return;

		const mapIndex = mapDataStore.mapIndex;
		if (mapIndex.length === 0) return;

		// 接头
		const indexList = [...mapIndex, mapIndex[0]];
		const mapItemPositionList = indexList.map((mapItemId) => {
			const mapItem = this.mapItemsInScene.get(mapItemId);
			if (mapItem) {
				const p = new THREE.Vector3();
				p.copy(mapItem.position);
				p.y = 0.1;
				return p;
			} else {
				throw new Error("错误的路径");
			}
		});

		const line = createMultiLine(mapItemPositionList, {
			color: 0x009ad6,
			dashed: true,
			dashScale: 3,
			dashSize: 0.2,
			gapSize: 0.2,
		});

		this.mapIndexLineGroup.add(line);
		console.log('[刷新元素] 地图索引路径已更新');
	}

	private clearSelect() {
		useEditorStore().currentMapItemId = "";
		this.setActiveMapPath(undefined);
		useEditorStore().isLinkMode = false;
		this.outlinePass.selectedObjects = [];
		this.linkOutlinePass.selectedObjects = [];
		this.multiSelectOutlinePass.selectedObjects = [];
	}

	private async updatePreviewBox(itemTypeId?: string) {
		const requestId = ++this.previewRequestId;
		this.clearPreviewBox();
		if (!itemTypeId) return;
		const itemType = useMapDataStore().findMapItemTypeById(itemTypeId);
		if (!itemType) return;

		try {
			const gltf = await getModelById(itemType.modelId);
			const newPreviewModel = gltf.scene.clone(true);
			applyOpacityToObject(newPreviewModel, 0.5);

			const editorStore = useEditorStore();
			const shouldDiscard =
				requestId !== this.previewRequestId ||
				editorStore.currentEditMode !== OperationMode.Edit ||
				editorStore.currentMapItemTypeId !== itemTypeId;
			if (shouldDiscard) {
				this.disposePreviewBox(newPreviewModel);
				return;
			}

			this.previewBoxInCreate = newPreviewModel;
			this.scene.add(newPreviewModel);
		} catch (error) {
			if (requestId === this.previewRequestId) {
				console.error("[地图编辑器] 预览模型加载失败:", error);
			}
		}
	}

	private clearPreviewBox() {
		if (!this.previewBoxInCreate) return;
		this.scene.remove(this.previewBoxInCreate);
		this.disposePreviewBox(this.previewBoxInCreate);
		this.previewBoxInCreate = undefined;
	}

	private disposePreviewBox(object: THREE.Object3D) {
		object.traverse((child) => {
			if (!(child instanceof THREE.Mesh)) return;
			child.geometry.dispose();
			if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
			else child.material.dispose();
		});
	}

	private addLinkLine(mapItem: MapItem) {
		if (!mapItem.linkto) return;
		const startMapItem = this.mapItemsInScene.get(mapItem.id);
		const endMapItem = this.mapItemsInScene.get(mapItem.linkto);
		if (startMapItem && endMapItem) {
			const startPoint = new THREE.Vector3().copy(startMapItem.position);
			const endPoint = new THREE.Vector3().copy(endMapItem.position);
			startPoint.y = startPoint.y + 0.1;
			endPoint.y = endPoint.y + 0.1;
			const line = createMultiLine([startPoint, endPoint], {
				color: 0x8844ff,
				dashed: true,
				dashScale: 1,
				dashSize: 0.1,
				gapSize: 0.1,
			});
			this.linkLineInScene.set(mapItem.id, line);
			this.linkLineGroup.add(line);
		}
	}

	private removeLinkLine(mapItemId: string) {
		const line = this.linkLineInScene.get(mapItemId);
		if (line) {
			this.linkLineInScene.delete(mapItemId);
			this.linkLineGroup.remove(line);
		}
	}

	private async addMapEventIcon(mapItem: MapItem) {
		const textureLoader = new THREE.TextureLoader();
		if (!mapItem.mapEventId) return;
		const mapEvent = useMapDataStore().findMapEventById(mapItem.mapEventId);
		if (!mapEvent) throw Error(`没找到Id为 "${mapItem.id}" 的事件`);
		const imageInfo = useResourceStore().findImageById(mapEvent.iconId);
		if (!imageInfo) throw Error(`没找到事件 "${mapEvent.name}" 的icon资源`);
		const texture = await textureLoader.loadAsync(imageInfo.url);
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
		this.mapEventInScene.set(mapItem.id, iconPlane);
		this.mapEventGroup.add(iconPlane);

		// 获取 mapItem 模型
		const mapItemModel = this.mapItemsInScene.get(mapItem.id);
		if (mapItemModel) {
			// 获取格子表面高度
			const surfaceY = this.getMapItemSurfaceHeight(mapItemModel);
			// 放在表面上方
			this.setItemPositionOnMap(iconPlane, mapItem.x, mapItem.y, undefined, surfaceY + 0.01);
		} else {
			// 回退方案：如果找不到模型，使用默认高度
			this.setItemPositionOnMap(iconPlane, mapItem.x, mapItem.y, undefined, 0.1);
		}
	}

	private removeMapEventIcon(mapItemId: string) {
		const mapEventIcon = this.mapEventInScene.get(mapItemId);
		if (mapEventIcon) {
			this.mapEventInScene.delete(mapItemId);
			this.mapEventGroup.remove(mapEventIcon);
		}
	}

	private clearPathDraft() {
		useEditorStore().setPathDraftSource(undefined);
		this.pathDraftLine.visible = false;
		this.pathDraftStartPoint.visible = false;
		this.pathDraftEndPoint.visible = false;
	}

	private setActiveMapPath(pathId?: string) {
		const previous = this.activeMapPathId;
		this.activeMapPathId = pathId;
		useEditorStore().setActiveMapPath(pathId);
		if (previous) this.refreshMapPath(previous);
		if (pathId && pathId !== previous) this.refreshMapPath(pathId);
	}

	private setHoveredMapPath(pathId?: string) {
		if (this.hoveredMapPathId === pathId) return;
		const previous = this.hoveredMapPathId;
		this.hoveredMapPathId = pathId;
		if (previous) this.refreshMapPath(previous);
		if (pathId) this.refreshMapPath(pathId);
	}

	private updatePathDraft() {
		const sourceId = useEditorStore().pathDraftSourceId;
		if (!sourceId) {
			this.pathDraftLine.visible = false;
			this.pathDraftStartPoint.visible = false;
			this.pathDraftEndPoint.visible = false;
			return;
		}
		const source = this.getMapItemCenter(sourceId);
		const hit = this.raycaster.intersectObject(this.plane, false)[0];
		if (!source || !hit) {
			this.pathDraftLine.visible = false;
			this.pathDraftStartPoint.visible = false;
			this.pathDraftEndPoint.visible = false;
			return;
		}
		const target = hit.point.clone();
		target.y = source.y;
		this.pathDraftLine.geometry.dispose();
		this.pathDraftLine.geometry = new THREE.BufferGeometry().setFromPoints([source, target]);
		this.pathDraftStartPoint.position.copy(source);
		this.pathDraftEndPoint.position.copy(target);
		this.pathDraftLine.visible = true;
		this.pathDraftStartPoint.visible = true;
		this.pathDraftEndPoint.visible = true;
	}

	private getMapItemCenter(mapItemId: string): THREE.Vector3 | undefined {
		const mapItemModel = this.mapItemsInScene.get(mapItemId);
		if (mapItemModel) {
			const box = new THREE.Box3().setFromObject(mapItemModel);
			if (!box.isEmpty()) return box.getCenter(new THREE.Vector3());
			return mapItemModel.getWorldPosition(new THREE.Vector3());
		}

		const item = useMapDataStore().findMapItemById(mapItemId);
		return item ? new THREE.Vector3(item.x + 0.5, 0, item.y + 0.5) : undefined;
	}

	private getMapPathSegment(path: MapPath): { start: THREE.Vector3; end: THREE.Vector3 } | undefined {
		const start = this.getMapItemCenter(path.fromMapItemId);
		const end = this.getMapItemCenter(path.toMapItemId);
		return start && end ? { start, end } : undefined;
	}

	private rebuildMapPaths() {
		this.clearMapPaths();
		for (const path of useMapDataStore().mapPaths) this.renderMapPath(path.id);
	}

	private renderMapPath(pathId: string) {
		this.removeMapPathFromScene(pathId);
		const path = useMapDataStore().findMapPathById(pathId);
		if (!path) return;
		const segment = this.getMapPathSegment(path);
		if (!segment) return;
		const { start, end } = segment;
		const length = start.distanceTo(end);

		const isActive = this.activeMapPathId === path.id;
		const isHovered = this.hoveredMapPathId === path.id;
		const disabled = path.initEnable === false;
		const color = isActive ? 0x65ff75 : isHovered ? 0xffca3a : disabled ? 0x8f5353 : 0x18b7d5;
		const lineRadius = isActive || isHovered ? 0.045 : 0.032;
		const line = new THREE.Mesh(
			new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 1, lineRadius, 8, false),
			new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				opacity: disabled ? 0.7 : 0.95,
				depthTest: false,
				depthWrite: false,
			}),
		);
		line.renderOrder = 10;

		const endpointRadius = isActive || isHovered ? 0.09 : 0.07;
		const createEndpoint = (position: THREE.Vector3) => {
			const endpoint = new THREE.Mesh(
				new THREE.SphereGeometry(endpointRadius, 12, 8),
				new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity: disabled ? 0.7 : 1,
					depthTest: false,
					depthWrite: false,
				}),
			);
			endpoint.position.copy(position);
			endpoint.renderOrder = 10;
			return endpoint;
		};

		const visual = new THREE.Group();
		visual.renderOrder = 10;
		visual.userData.mapPathId = path.id;
		visual.add(line, createEndpoint(start), createEndpoint(end));

		// 箭头尖端朝向终点，明确表示路径从 fromMapItemId 指向 toMapItemId。
		if (length > 0.001) {
			const direction = end.clone().sub(start).normalize();
			const arrowLength = Math.min(0.3, Math.max(0.14, length * 0.24));
			const arrow = new THREE.Mesh(
				new THREE.ConeGeometry(arrowLength * 0.35, arrowLength, 16),
				new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity: disabled ? 0.7 : 1,
					depthTest: false,
					depthWrite: false,
				}),
			);
			// ConeGeometry 默认沿 +Y 轴；旋转后使锥尖指向路径终点。
			arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
			arrow.position.copy(end).addScaledVector(direction, -arrowLength / 2);
			arrow.renderOrder = 11;
			visual.add(arrow);
		}
		const hit = length < 0.001
			? new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
			: new THREE.Mesh(
				new THREE.TubeGeometry(new THREE.LineCurve3(start, end), Math.max(8, Math.ceil(length * 16)), 0.13, 6, false),
				new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
			);
		if (length < 0.001) hit.position.copy(start);
		hit.userData.mapPathId = path.id;
		this.mapPathGroup.add(visual);
		this.mapPathHitGroup.add(hit);
		this.mapPathsInScene.set(path.id, { visual, hit });
	}

	private refreshMapPath(pathId: string) {
		this.renderMapPath(pathId);
	}

	private refreshMapPathsForMapItem(mapItemId: string) {
		for (const path of useMapDataStore().mapPaths) {
			if (path.fromMapItemId === mapItemId || path.toMapItemId === mapItemId) this.refreshMapPath(path.id);
		}
	}

	private removeMapPathFromScene(pathId: string) {
		const rendered = this.mapPathsInScene.get(pathId);
		if (!rendered) return;
		this.mapPathGroup.remove(rendered.visual);
		this.mapPathHitGroup.remove(rendered.hit);
		this.disposeObjectResources(rendered.visual);
		this.disposeObjectResources(rendered.hit);
		this.mapPathsInScene.delete(pathId);
	}

	private clearMapPaths() {
		for (const pathId of [...this.mapPathsInScene.keys()]) this.removeMapPathFromScene(pathId);
	}

	private disposeObjectResources(object: THREE.Object3D) {
		object.traverse((child) => {
			if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
				child.geometry.dispose();
				const materials = Array.isArray(child.material) ? child.material : [child.material];
				for (const material of materials) material.dispose();
			}
		});
	}

	private updateMapIndex(indexList: string[]) {
		if (useMapDataStore().mapPaths.length > 0) {
			this.mapIndexLineGroup.clear();
			return;
		}
		if (indexList.length === 0) {
			this.mapIndexLineGroup.clear();
			return;
		}
		//接头
		indexList.push(indexList[0]);
		const mapItemPositionList = indexList.map((mapItemId) => {
			const mapItem = this.mapItemsInScene.get(mapItemId);
			if (mapItem) {
				const p = new THREE.Vector3();
				p.copy(mapItem.position);
				p.y = 0.1;
				return p;
			} else {
				throw new Error("错误的路径");
			}
		});
		const line = createMultiLine(mapItemPositionList, {
			color: 0x009ad6,
			dashed: true,
			dashScale: 3,
			dashSize: 0.2,
			gapSize: 0.2,
		});
		this.mapIndexLineGroup.add(line);
	}

	public lookAtCenter() {
		if (this.mapItemGroup.children.length <= 0) return;
		// 获取场景中所有对象的中心点和最大高度
		const bbox = new THREE.Box3().setFromObject(this.mapItemGroup);

		const center = bbox.getCenter(new THREE.Vector3());
		const size = bbox.getSize(new THREE.Vector3());

		const maxSize = Math.max(...[size.x, size.z]);

		// 将相机移到合适的位置
		let distance = 0;
		if (this.camera instanceof THREE.PerspectiveCamera) {
			distance = maxSize * Math.tan(this.camera.fov / 2) * 4;
		} else if (this.camera instanceof THREE.OrthographicCamera) {
			// 获取渲染器的宽高比
			const aspect = this.renderer.domElement.width / this.renderer.domElement.height;

			// 根据宽高比调整正交相机的边界
			distance = maxSize * 1.2;
			const halfHeight = distance / 2;
			const halfWidth = halfHeight * aspect;

			this.camera.left = -halfWidth;
			this.camera.right = halfWidth;
			this.camera.top = halfHeight;
			this.camera.bottom = -halfHeight;
			this.camera.near = 0.1;
			this.camera.far = center.y + distance * 2;
			this.camera.updateProjectionMatrix();
			}

		this.camera.position.set(center.x, center.y + Math.abs(distance) * 1.2, center.z);
		// this.camera.up.set(0, 0, -1);
		this.camera.lookAt(center);
		this.controls.target.set(center.x, center.y, center.z);
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

	public destroy(): void {
		++this.previewRequestId;
		this.clearPreviewBox();
		this.eventBusCleanups.splice(0).forEach((cleanup) => cleanup());
		window.removeEventListener("resize", this.onWindowResize);
		document.removeEventListener("fullscreenchange", this.onFullscreenChange);
		this.canvasEl.removeEventListener("mousemove", this.onMouseMove);
		this.canvasEl.removeEventListener("mousedown", this.onMouseDown);
		this.canvasEl.removeEventListener("mouseup", this.onMouseUp);
		this.canvasEl.removeEventListener("click", this.onMouseClick);
		this.canvasEl.removeEventListener("contextmenu", this.onContextMenu);
		document.removeEventListener("keydown", this.onKeyDown);

		// 释放动画管理器
		this.animationManager?.dispose();

		this.resizeObserver && this.resizeObserver.disconnect();
		cancelAnimationFrame(this.requestAnimationFrameId);
		this.scene.traverse((object) => {
			//@ts-ignore
			object.geometry && object.geometry.dispose();
			//@ts-ignore
			object.texture && object.texture.dispose();
			//@ts-ignore
			object.material && object.material.dispose();
		});
		this.scene.clear();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
		let gl = this.renderer.domElement.getContext("webgl");
		if (gl) {
			const e = gl.getExtension("WEBGL_lose_context");
			e && e.loseContext();
		}
		// 清理框选高亮 Pass
		this.composer.removePass(this.multiSelectOutlinePass);
		this.multiSelectOutlinePass.dispose();

		// 清理框选器
		this.boxSelector.destroy();
	}
}

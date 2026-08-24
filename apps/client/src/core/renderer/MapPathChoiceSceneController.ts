import * as THREE from "three";
import gsap from "gsap";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import type { MapPathChoiceCandidate, MapPathChoiceRequest } from "@mine-monopoly/types";
import { useMonopolyClient } from "@src/core/monopoly-client/MonopolyClient";
import { getCurrentClientPlayerId } from "@src/store/local-party";
import { TextSprite } from "../three/TextSprite";

export type MapPathChoiceArrowFactory = () => THREE.Object3D;

type MapPathChoiceSceneControllerOptions = {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	canvas: HTMLCanvasElement;
	getMapItemAnchor: (mapItemId: string) => THREE.Vector3 | undefined;
	getMapItemFootprintRadius: (mapItemId: string, direction: THREE.Vector3) => number;
	getMapItemLabel: (mapItemId: string) => string;
};

type PathChoiceEntry = {
	candidate: MapPathChoiceCandidate;
	line: THREE.Group;
	lineMaterial: THREE.MeshBasicMaterial;
	arrow: THREE.Group;
	label: THREE.Sprite;
	labelHitArea: THREE.Sprite;
	labelText: TextSprite;
	labelColor: string;
	targetHighlight: THREE.Group;
	targetHighlightFill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
	targetHighlightRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
};

type ArrowMaterial = THREE.Material & {
	color?: THREE.Color;
	emissive?: THREE.Color;
	emissiveIntensity?: number;
};

type ArrowMaterialState = {
	color?: THREE.Color;
	emissive?: THREE.Color;
	emissiveIntensity?: number;
};

type CameraSnapshot = {
	position: THREE.Vector3;
	target: THREE.Vector3;
	up: THREE.Vector3;
	controlsEnabled: boolean;
	enableRotate: boolean;
	enablePan: boolean;
	enableZoom: boolean;
	mouseButtons: {
		left: THREE.MOUSE | null | undefined;
		middle: THREE.MOUSE | null | undefined;
		right: THREE.MOUSE | null | undefined;
	};
	minDistance: number;
	maxDistance: number;
	minPolarAngle: number;
	maxPolarAngle: number;
};

const DEFAULT_ARROW_HEAD_GEOMETRY = new THREE.ConeGeometry(0.34, 0.84, 4);
DEFAULT_ARROW_HEAD_GEOMETRY.rotateX(Math.PI / 2);
const DEFAULT_ARROW_HEAD_MATERIAL = new THREE.MeshStandardMaterial({
	color: 0xffd166,
	emissive: 0x5c3d00,
	emissiveIntensity: 0.7,
	roughness: 0.35,
	metalness: 0.2,
});
const DEFAULT_ARROW_SHAFT_GEOMETRY = new THREE.CylinderGeometry(0.12, 0.12, 0.54, 12);
DEFAULT_ARROW_SHAFT_GEOMETRY.rotateX(Math.PI / 2);
const DEFAULT_ARROW_SHAFT_MATERIAL = new THREE.MeshStandardMaterial({
	color: 0xffd166,
	emissive: 0x5c3d00,
	emissiveIntensity: 0.55,
	roughness: 0.4,
	metalness: 0.15,
});
const PATH_HOVER_COLOR = new THREE.Color(0x8ff0a4);
const PATH_LABEL_COLOR = "#f38b11";
const PATH_HOVER_LABEL_COLOR = "#8ff0a4";

let mapPathChoiceArrowFactory: MapPathChoiceArrowFactory = createDefaultMapPathChoiceArrow;

/**
 * 配置分支选择箭头的工厂函数。工厂必须为每个分支返回一个新的 Object3D；
 * 可在 GameRenderer 初始化前提供已加载 GLB 的 clone，从而替换默认几何箭头。
 */
export function setMapPathChoiceArrowFactory(factory: MapPathChoiceArrowFactory): void {
	mapPathChoiceArrowFactory = factory;
}

function createDefaultMapPathChoiceArrow(): THREE.Group {
	const arrow = new THREE.Group();
	arrow.name = "MapPathChoiceDefaultArrow";

	const shaft = new THREE.Mesh(DEFAULT_ARROW_SHAFT_GEOMETRY, DEFAULT_ARROW_SHAFT_MATERIAL);
	shaft.position.z = -0.26;
	arrow.add(shaft);

	const head = new THREE.Mesh(DEFAULT_ARROW_HEAD_GEOMETRY, DEFAULT_ARROW_HEAD_MATERIAL);
	head.position.z = 0.24;
	arrow.add(head);
	return arrow;
}

export class MapPathChoiceSceneController {
	private readonly group = new THREE.Group();
	private readonly entries = new Map<string, PathChoiceEntry>();
	private readonly interactiveObjects: THREE.Object3D[] = [];
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private readonly arrowMaterialStates = new WeakMap<THREE.Material, ArrowMaterialState>();

	private request: MapPathChoiceRequest | null = null;
	private submittedRequestId: string | null = null;
	private hoveredPathId: string | null = null;
	private cameraSnapshot: CameraSnapshot | null = null;
	private cameraTween: gsap.core.Animation | null = null;
	private pointerDownPosition: THREE.Vector2 | null = null;
	private isPointerDragging = false;

	public constructor(private readonly options: MapPathChoiceSceneControllerOptions) {
		this.group.name = "MapPathChoiceScene";
		this.options.scene.add(this.group);
		this.options.canvas.addEventListener("pointerdown", this.handlePointerDown);
		this.options.canvas.addEventListener("pointermove", this.handlePointerMove);
		this.options.canvas.addEventListener("pointerleave", this.handlePointerLeave);
		this.options.canvas.addEventListener("pointerup", this.handlePointerUp);
		window.addEventListener("keydown", this.handleKeyDown);
	}

	public get isActive(): boolean {
		return this.request !== null;
	}

	public get isCameraTransitioning(): boolean {
		return this.cameraTween !== null;
	}

	public setRequest(request: MapPathChoiceRequest | null): void {
		if (!request) {
			this.clear();
			return;
		}
		if (this.request?.requestId === request.requestId) return;

		this.clear();
		this.request = request;
		this.submittedRequestId = null;
		this.createEntries(request);
		this.focusChoiceArea(request);
	}

	public update(): void {
		if (!this.request) return;
		this.updateTargetHighlights();
		if (!this.isMyChoice()) return;

		this.raycaster.setFromCamera(this.pointer, this.options.camera);
		const intersections = this.raycaster.intersectObjects(this.interactiveObjects, true);
		const pathId = intersections.length > 0 ? this.getPathIdFromIntersection(intersections[0].object) : null;
		if (pathId !== this.hoveredPathId) {
			this.hoveredPathId = pathId;
			this.refreshVisualState();
		}
	}

	public dispose(): void {
		this.options.canvas.removeEventListener("pointerdown", this.handlePointerDown);
		this.options.canvas.removeEventListener("pointermove", this.handlePointerMove);
		this.options.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
		this.options.canvas.removeEventListener("pointerup", this.handlePointerUp);
		window.removeEventListener("keydown", this.handleKeyDown);
		this.clear(false);
		this.options.scene.remove(this.group);
	}

	private createEntries(request: MapPathChoiceRequest): void {
		const from = this.options.getMapItemAnchor(request.currentMapItemId);
		if (!from) {
			console.warn("[路径选择] 找不到分叉点模型，无法渲染场景内选择", request.currentMapItemId);
			return;
		}

		for (const candidate of request.candidates) {
			const to = this.options.getMapItemAnchor(candidate.targetMapItemId);
			if (!to) {
				console.warn("[路径选择] 找不到分支目标模型", candidate.targetMapItemId);
				continue;
			}

			const direction = to.clone().sub(from);
			direction.y = 0;
			if (direction.lengthSq() < 0.0001) continue;
			direction.normalize();

			const roadStart = from.clone();
			const roadEnd = to.clone();
			// 路线稍贴近地面；箭头模型底部高于路线，避免两者发生深度冲突。
			roadStart.y += 0.08;
			roadEnd.y += 0.08;

			const arrow = new THREE.Group();
			arrow.name = `MapPathChoiceArrow:${candidate.pathId}`;
			arrow.userData.pathId = candidate.pathId;
			// 箭头从分叉起点模型的外沿起飞，避免与起点模型重叠。
			const footprintRadius = this.options.getMapItemFootprintRadius(request.currentMapItemId, direction);
			const arrowPosition = from.clone().addScaledVector(direction, footprintRadius + 0.18);
			arrowPosition.y = Math.max(from.y, to.y) + 0.2;
			arrow.position.copy(arrowPosition);
			arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);

			const arrowModel = mapPathChoiceArrowFactory();
			this.isolateArrowMaterials(arrowModel);
			arrow.add(arrowModel);
			// 虚线会在箭头占用的空间留白，而不是仅依靠透明物体的绘制顺序覆盖。
			const arrowLineGap = this.getArrowLineGap(arrow, roadStart, direction, roadStart.distanceTo(roadEnd));
			const { line, lineMaterial } = this.createDashedPathLine(roadStart, roadEnd, direction, arrowLineGap);

			const targetHighlightRadius = THREE.MathUtils.clamp(from.distanceTo(to) * 0.22, 0.52, 1.1);
			const targetHighlight = new THREE.Group();
			targetHighlight.name = `MapPathChoiceTargetHighlight:${candidate.pathId}`;
			targetHighlight.userData.pathId = candidate.pathId;
			targetHighlight.position.copy(to);
			targetHighlight.position.y += 0.16;
			// 不在父 Group 上设置 renderOrder；Group 的 groupOrder 会优先于文字自身的 renderOrder，
			// 反而可能让圆圈整体在文字之后绘制。
			targetHighlight.renderOrder = 0;

			const targetHighlightFill = new THREE.Mesh(
				new THREE.CircleGeometry(targetHighlightRadius * 0.72, 36),
				new THREE.MeshBasicMaterial({
					color: 0xffd166,
					transparent: true,
					opacity: 0.2,
					depthTest: false,
					depthWrite: false,
				}),
			);
			targetHighlightFill.rotation.x = -Math.PI / 2;
			targetHighlightFill.renderOrder = 1001;

			const targetHighlightRing = new THREE.Mesh(
				new THREE.RingGeometry(targetHighlightRadius * 0.78, targetHighlightRadius, 40),
				new THREE.MeshBasicMaterial({
					color: 0xffd166,
					transparent: true,
					opacity: 0.96,
					depthTest: false,
					depthWrite: false,
				}),
			);
			targetHighlightRing.rotation.x = -Math.PI / 2;
			targetHighlightRing.renderOrder = 1002;
			targetHighlight.add(targetHighlightFill, targetHighlightRing);

			const pathLabel = this.getPathLabel(candidate);
			const labelText = new TextSprite(
				pathLabel,
				36,
				PATH_LABEL_COLOR,
				6,
				42,
			);
			const labelSprite = labelText.getSprite();
			labelSprite.position.copy(to);
			labelSprite.position.y += 1.45;
			labelSprite.scale.set(2.4, 2.4, 2.4);

			// Sprite 默认会用整张纹理画布（当前为正方形）进行射线检测，
			// 这里单独创建一个与实际文字包围盒一致的透明 Sprite 作为交互区域。
			const labelBounds = labelText.getTextBoundsInCanvas(pathLabel);
			const labelHitArea = new THREE.Sprite(
				new THREE.SpriteMaterial({
					transparent: true,
					opacity: 0,
					depthTest: false,
					depthWrite: false,
				}),
			);
			labelHitArea.userData.pathId = candidate.pathId;
			labelHitArea.position.copy(labelSprite.position);
			labelHitArea.scale.set(
				Math.max(labelBounds.width * labelSprite.scale.x, 0.05),
				Math.max(labelBounds.height * labelSprite.scale.y, 0.05),
				1,
			);

			// 文字始终盖在目标格高亮之上，避免高亮圆圈因忽略深度测试而遮挡说明。
			labelSprite.material.depthTest = false;
			labelSprite.material.depthWrite = false;
			labelSprite.renderOrder = 1004;

			this.group.add(line, arrow, targetHighlight, labelSprite, labelHitArea);
			this.interactiveObjects.push(arrow, targetHighlight, labelHitArea);
			this.entries.set(candidate.pathId, {
				candidate,
				line,
				lineMaterial,
				arrow,
				label: labelSprite,
				labelHitArea,
				labelText,
				labelColor: PATH_LABEL_COLOR,
				targetHighlight,
				targetHighlightFill,
				targetHighlightRing,
			});
		}
		this.refreshVisualState();
	}

	private getPathLabel(candidate: MapPathChoiceCandidate): string {
		return [candidate.name, candidate.description]
			.filter((text) => Boolean(text?.trim()))
			.join("\n") || "未命名路径";
	}

	private focusChoiceArea(request: MapPathChoiceRequest): void {
		const forkAnchor = this.options.getMapItemAnchor(request.currentMapItemId);
		if (!forkAnchor) return;

		const controlsEnabled = this.options.controls.enabled;
		// 先冻结所有外部相机动画并同步 OrbitControls，再记录快照；
		// 否则选路镜头会从角色跟随 tween 互相覆盖时的中间态开始，表现为轻微抖动。
		this.options.controls.enabled = false;
		gsap.killTweensOf([this.options.controls.target, this.options.controls.object.position]);
		this.options.controls.update();
		this.cameraSnapshot = {
			position: this.options.camera.position.clone(),
			target: this.options.controls.target.clone(),
			up: this.options.camera.up.clone(),
			controlsEnabled,
			enableRotate: this.options.controls.enableRotate,
			enablePan: this.options.controls.enablePan,
			enableZoom: this.options.controls.enableZoom,
			mouseButtons: {
				left: this.options.controls.mouseButtons.LEFT,
				middle: this.options.controls.mouseButtons.MIDDLE,
				right: this.options.controls.mouseButtons.RIGHT,
			},
			minDistance: this.options.controls.minDistance,
			maxDistance: this.options.controls.maxDistance,
			minPolarAngle: this.options.controls.minPolarAngle,
			maxPolarAngle: this.options.controls.maxPolarAngle,
		};

		// 正上方鸟瞰：视线和画面中心都锁定分叉点。取景同时覆盖完整分支路线、
		// 路线终点的高亮和“前往：下一格”标签，避免远处目标格被裁出画面。
		const target = forkAnchor.clone();
		const framingPoints: Array<{ position: THREE.Vector3; padding: number }> = [{ position: target, padding: 0.8 }];
		for (const entry of this.entries.values()) {
			// 路线是从分叉点到目标格的直线，纳入目标端点即可覆盖整条路线。
			framingPoints.push(
				{ position: entry.arrow.getWorldPosition(new THREE.Vector3()), padding: 0.9 },
				{ position: entry.targetHighlight.getWorldPosition(new THREE.Vector3()), padding: 1.6 },
				{ position: entry.label.getWorldPosition(new THREE.Vector3()), padding: 2.6 },
			);
		}
		const halfVerticalFov = THREE.MathUtils.degToRad(this.options.camera.fov / 2);
		const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * Math.max(this.options.camera.aspect, 0.1));
		let requiredHeight = 0;
		for (const { position, padding } of framingPoints) {
			const horizontalOffset = Math.abs(position.x - target.x) + padding;
			const verticalOffset = Math.abs(position.z - target.z) + padding;
			requiredHeight = Math.max(
				requiredHeight,
				horizontalOffset / Math.tan(halfHorizontalFov),
				verticalOffset / Math.tan(halfVerticalFov),
			);
		}

		const cameraHeight = Math.max(6, requiredHeight * 1.08);
		// 从正上方改为与地图平面成 75° 的俯视角，并保持分叉点处于画面中心。
		const elevationAngle = THREE.MathUtils.degToRad(75);
		const cameraDistance = cameraHeight / Math.sin(elevationAngle);
		const targetPosition = target.clone().add(
			new THREE.Vector3(0, cameraDistance * Math.sin(elevationAngle), cameraDistance * Math.cos(elevationAngle)),
		);
		// 位置与焦点一起插值，确保从当前游戏视角进入选路镜头是连续平滑的。
		this.tweenCamera(targetPosition, target, 0.7, () => {
			this.applyChoiceControlConstraints();
			this.options.controls.enabled = true;
			this.options.controls.update();
		});
	}

	private applyChoiceControlConstraints(): void {
		// 选路时锁定为鸟瞰角度：允许拖拽平移和缩放查看其他区域，但不允许绕地图旋转。
		this.options.controls.enableRotate = false;
		this.options.controls.enablePan = true;
		this.options.controls.enableZoom = true;
		this.options.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
		this.options.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
		this.options.controls.minDistance = 0.1;
		this.options.controls.maxDistance = Infinity;
		// OrbitControls 的 polar angle 从竖直向下开始计算；15° 对应与地图平面成 75° 的俯视镜头。
		const choicePolarAngle = THREE.MathUtils.degToRad(15);
		this.options.controls.minPolarAngle = choicePolarAngle;
		this.options.controls.maxPolarAngle = choicePolarAngle;
	}

	private clear(restoreCamera = true): void {
		if (!this.request && this.entries.size === 0) return;
		this.cameraTween?.kill();
		this.cameraTween = null;
		this.hoveredPathId = null;
		this.submittedRequestId = null;
		this.request = null;

		for (const entry of this.entries.values()) {
			entry.line.traverse((object) => {
				if (object instanceof THREE.Mesh) object.geometry.dispose();
			});
			entry.lineMaterial.dispose();
			this.disposeArrowMaterials(entry.arrow);
			entry.targetHighlightFill.geometry.dispose();
			entry.targetHighlightFill.material.dispose();
			entry.targetHighlightRing.geometry.dispose();
			entry.targetHighlightRing.material.dispose();
			const labelMaterial = entry.label.material;
			labelMaterial.map?.dispose();
			labelMaterial.dispose();
			entry.labelHitArea.material.dispose();
		}
		this.entries.clear();
		this.interactiveObjects.length = 0;
		this.group.clear();
		this.options.canvas.style.cursor = "";

		if (restoreCamera) {
			this.restoreCamera();
		} else if (this.cameraSnapshot) {
			this.restoreControlConstraints(this.cameraSnapshot);
			this.options.camera.up.copy(this.cameraSnapshot.up);
			this.options.camera.lookAt(this.cameraSnapshot.target);
			this.options.controls.enabled = this.cameraSnapshot.controlsEnabled;
			this.cameraSnapshot = null;
		}
	}

	private restoreCamera(): void {
		const snapshot = this.cameraSnapshot;
		if (!snapshot) return;
		this.cameraSnapshot = null;
		this.tweenCamera(snapshot.position, snapshot.target, 0.4, () => {
			this.restoreControlConstraints(snapshot);
			this.options.camera.up.copy(snapshot.up);
			this.options.camera.lookAt(snapshot.target);
			this.options.controls.enabled = snapshot.controlsEnabled;
		});
	}

	private restoreControlConstraints(snapshot: CameraSnapshot): void {
		this.options.controls.enableRotate = snapshot.enableRotate;
		this.options.controls.enablePan = snapshot.enablePan;
		this.options.controls.enableZoom = snapshot.enableZoom;
		this.options.controls.mouseButtons.LEFT = snapshot.mouseButtons.left;
		this.options.controls.mouseButtons.MIDDLE = snapshot.mouseButtons.middle;
		this.options.controls.mouseButtons.RIGHT = snapshot.mouseButtons.right;
		this.options.controls.minDistance = snapshot.minDistance;
		this.options.controls.maxDistance = snapshot.maxDistance;
		this.options.controls.minPolarAngle = snapshot.minPolarAngle;
		this.options.controls.maxPolarAngle = snapshot.maxPolarAngle;
	}

	private tweenCamera(position: THREE.Vector3, target: THREE.Vector3, duration: number, onComplete?: () => void): void {
		this.cameraTween?.kill();
		const tweenTarget = { x: this.options.controls.target.x, y: this.options.controls.target.y, z: this.options.controls.target.z };
		const tweenPosition = { x: this.options.camera.position.x, y: this.options.camera.position.y, z: this.options.camera.position.z };
		const timeline = gsap.timeline({
			onUpdate: () => {
				this.options.camera.position.set(tweenPosition.x, tweenPosition.y, tweenPosition.z);
				this.options.controls.target.set(tweenTarget.x, tweenTarget.y, tweenTarget.z);
				this.options.camera.lookAt(this.options.controls.target);
			},
			onComplete: () => {
				this.cameraTween = null;
				onComplete?.();
			},
		});
		timeline.to(tweenPosition, { ...position, duration, ease: "power2.inOut" }, 0);
		timeline.to(tweenTarget, { ...target, duration, ease: "power2.inOut" }, 0);
		this.cameraTween = timeline;
	}

	private handlePointerDown = (event: PointerEvent): void => {
		if (!this.request || !this.isMyChoice() || event.button !== 0) return;
		this.pointerDownPosition = new THREE.Vector2(event.clientX, event.clientY);
		this.isPointerDragging = false;
	};

	private handlePointerMove = (event: PointerEvent): void => {
		if (!this.request || !this.isMyChoice()) return;
		if (this.pointerDownPosition && this.pointerDownPosition.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 6) {
			this.isPointerDragging = true;
		}
		this.setPointerFromClientPosition(event.clientX, event.clientY);
	};

	private handlePointerLeave = (): void => {
		if (!this.hoveredPathId) return;
		this.hoveredPathId = null;
		this.refreshVisualState();
	};

	private handlePointerUp = (event: PointerEvent): void => {
		const wasDragging = this.isPointerDragging;
		this.pointerDownPosition = null;
		this.isPointerDragging = false;
		if (event.button !== 0 || wasDragging || !this.request || !this.isMyChoice()) return;
		this.setPointerFromClientPosition(event.clientX, event.clientY);
		this.update();
		if (this.hoveredPathId) this.choosePath(this.hoveredPathId);
	};

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.request || !this.isMyChoice() || this.isEditableTarget(event.target)) return;
		const choiceIndex = Number(event.key) - 1;
		if (!Number.isInteger(choiceIndex) || choiceIndex < 0) return;
		const candidate = this.request.candidates[choiceIndex];
		if (!candidate || !this.entries.has(candidate.pathId)) return;
		event.preventDefault();
		this.choosePath(candidate.pathId);
	};

	private choosePath(pathId: string): void {
		const request = this.request;
		if (!request || this.submittedRequestId === request.requestId || !this.entries.has(pathId)) return;
		const client = useMonopolyClient();
		if (!client) return;

		this.submittedRequestId = request.requestId;
		this.hoveredPathId = pathId;
		this.refreshVisualState();
		client.chooseMapPath(request.requestId, pathId);
	}

	private refreshVisualState(): void {
		const selectable = this.isMyChoice() && this.submittedRequestId !== this.request?.requestId;
		for (const [pathId, entry] of this.entries) {
			const isHovered = selectable && pathId === this.hoveredPathId;
			const isSubmitted = pathId === this.hoveredPathId && this.submittedRequestId === this.request?.requestId;
			const color = selectable ? (isHovered || isSubmitted ? 0x8ff0a4 : 0xffd166) : 0x9ca3af;
			entry.lineMaterial.color.setHex(color);
			entry.lineMaterial.opacity = selectable ? (isHovered || isSubmitted ? 1 : 0.82) : 0.45;
			this.setArrowHighlight(entry.arrow, isHovered || isSubmitted);
			const labelColor = isHovered || isSubmitted ? PATH_HOVER_LABEL_COLOR : PATH_LABEL_COLOR;
			if (entry.labelColor !== labelColor) {
				entry.labelText.updateText(this.getPathLabel(entry.candidate), labelColor);
				entry.labelColor = labelColor;
			}
			entry.targetHighlightRing.material.color.setHex(color);
			entry.targetHighlightRing.material.opacity = selectable ? (isHovered || isSubmitted ? 1 : 0.9) : 0.45;
			entry.targetHighlightFill.material.color.setHex(color);
			entry.targetHighlightFill.material.opacity = selectable ? (isHovered || isSubmitted ? 0.34 : 0.2) : 0.08;
			entry.arrow.scale.setScalar(isHovered ? 1.18 : 1);
		}
		this.options.canvas.style.cursor = selectable && this.hoveredPathId ? "pointer" : "";
	}

	private createDashedPathLine(
		roadStart: THREE.Vector3,
		roadEnd: THREE.Vector3,
		direction: THREE.Vector3,
		excludedRange: { start: number; end: number },
	): { line: THREE.Group; lineMaterial: THREE.MeshBasicMaterial } {
		const line = new THREE.Group();
		line.name = "MapPathChoiceDashedLine";
		const lineMaterial = new THREE.MeshBasicMaterial({
			color: 0xffd166,
			transparent: true,
			opacity: 0.82,
			// 路线提示始终显示在地图模型上方；箭头区域已在生成虚线时留空。
			depthTest: false,
			depthWrite: false,
		});
		const roadLength = roadStart.distanceTo(roadEnd);
		const dashLength = 0.2;
		const gapLength = 0.15;
		const dashRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
		const addDash = (start: number, end: number) => {
			if (end - start < 0.02) return;
			const length = end - start;
			const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, length), lineMaterial);
			const progress = (start + length / 2) / roadLength;
			dash.position.lerpVectors(roadStart, roadEnd, progress);
			dash.position.y += 0.02;
			dash.quaternion.copy(dashRotation);
			line.add(dash);
		};

		// 以箭头留白边界作为虚线节奏的对齐点。
		// 旧逻辑始终从道路起点开始计算 dash，箭头边界落在 gap 中时，
		// 调整 margin 可能看起来完全没有变化。现在让箭头前的最后一段虚线
		// 精确结束在 excludedRange.start，margin 会直接反映到画面上。
		for (let end = excludedRange.start; end > 0; end -= dashLength + gapLength) {
			addDash(Math.max(0, end - dashLength), end);
		}
		for (let start = excludedRange.end; start < roadLength; start += dashLength + gapLength) {
			addDash(start, Math.min(start + dashLength, roadLength));
		}

		return { line, lineMaterial };
	}

	private getArrowLineGap(
		arrow: THREE.Group,
		roadStart: THREE.Vector3,
		direction: THREE.Vector3,
		roadLength: number,
	): { start: number; end: number } {
		arrow.updateWorldMatrix(true, true);
		const box = new THREE.Box3().setFromObject(arrow);
		const corners = [
			new THREE.Vector3(box.min.x, box.min.y, box.min.z),
			new THREE.Vector3(box.min.x, box.min.y, box.max.z),
			new THREE.Vector3(box.min.x, box.max.y, box.min.z),
			new THREE.Vector3(box.min.x, box.max.y, box.max.z),
			new THREE.Vector3(box.max.x, box.min.y, box.min.z),
			new THREE.Vector3(box.max.x, box.min.y, box.max.z),
			new THREE.Vector3(box.max.x, box.max.y, box.min.z),
			new THREE.Vector3(box.max.x, box.max.y, box.max.z),
		];
		const distances = corners.map((corner) => corner.sub(roadStart).dot(direction));
		const margin = 0.03;
		return {
			start: THREE.MathUtils.clamp(Math.min(...distances) - margin, 0, roadLength),
			end: THREE.MathUtils.clamp(Math.max(...distances) + margin, 0, roadLength),
		};
	}

	private isolateArrowMaterials(root: THREE.Object3D): void {
		root.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
			const clonedMaterials = sourceMaterials.map((material) => this.cloneArrowMaterial(material));
			object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0];
			// 保留 GLB 材质原有的深度与透明设置，避免强行放入透明队列破坏遮挡关系。
		});
	}

	private cloneArrowMaterial(material: THREE.Material): THREE.Material {
		const cloned = material.clone() as ArrowMaterial;
		this.arrowMaterialStates.set(cloned, {
			color: cloned.color?.clone(),
			emissive: cloned.emissive?.clone(),
			emissiveIntensity: cloned.emissiveIntensity,
		});
		return cloned;
	}

	private setArrowHighlight(arrow: THREE.Group, isHighlighted: boolean): void {
		arrow.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const materials = Array.isArray(object.material) ? object.material : [object.material];
			for (const material of materials) {
				const coloredMaterial = material as ArrowMaterial;
				const original = this.arrowMaterialStates.get(material);
				if (!original) continue;
				if (coloredMaterial.color && original.color) {
					coloredMaterial.color.copy(isHighlighted ? PATH_HOVER_COLOR : original.color);
				}
				if (coloredMaterial.emissive && original.emissive) {
					coloredMaterial.emissive.copy(isHighlighted ? PATH_HOVER_COLOR : original.emissive);
					if (original.emissiveIntensity !== undefined) {
						coloredMaterial.emissiveIntensity = isHighlighted
							? Math.max(original.emissiveIntensity, 0.85)
							: original.emissiveIntensity;
					}
				}
			}
		});
	}

	private disposeArrowMaterials(arrow: THREE.Group): void {
		arrow.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const materials = Array.isArray(object.material) ? object.material : [object.material];
			for (const material of materials) material.dispose();
		});
	}

	private updateTargetHighlights(): void {
		const pulse = (Math.sin(performance.now() * 0.006) + 1) / 2;
		const selectable = this.isMyChoice() && this.submittedRequestId !== this.request?.requestId;
		for (const [pathId, entry] of this.entries) {
			const isHovered = selectable && pathId === this.hoveredPathId;
			const isSubmitted = pathId === this.hoveredPathId && this.submittedRequestId === this.request?.requestId;
			const baseRingOpacity = selectable ? (isHovered || isSubmitted ? 0.9 : 0.78) : 0.35;
			const baseFillOpacity = selectable ? (isHovered || isSubmitted ? 0.26 : 0.14) : 0.06;
			entry.targetHighlight.scale.setScalar(1 + (isHovered ? 0.08 : 0) + pulse * 0.1);
			entry.targetHighlightRing.material.opacity = Math.min(1, baseRingOpacity + pulse * 0.1);
			entry.targetHighlightFill.material.opacity = Math.min(0.42, baseFillOpacity + pulse * 0.06);
		}
	}

	private isMyChoice(): boolean {
		return this.request?.playerId === getCurrentClientPlayerId();
	}

	private getPathIdFromIntersection(object: THREE.Object3D): string | null {
		let target: THREE.Object3D | null = object;
		while (target) {
			if (typeof target.userData.pathId === "string") return target.userData.pathId;
			target = target.parent;
		}
		return null;
	}

	private setPointerFromClientPosition(clientX: number, clientY: number): void {
		const rect = this.options.canvas.getBoundingClientRect();
		this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
	}

	private isEditableTarget(target: EventTarget | null): boolean {
		return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
	}
}

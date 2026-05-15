import * as THREE from "three";
import { KnotDiagram } from "../knot/crossings";
import {
  Vec2,
  Vec3,
  add3,
  dot3,
  scale3,
  vec2,
  vec3
} from "../knot/curve";
import type { RopeScreenPoint, RopeSelectionHighlight } from "../rope/ropeSelection";
import type { RopeState, ViewportId } from "../rope/ropeTypes";
import { DiagramCanvas } from "./shadowDiagram";
import { RopeTubeKind, RopeTubeRenderer } from "./ropeTube";

export type TrefoilPaneKind = "perspective" | "top" | "front";

interface FourPaneCanvases {
  perspective: HTMLCanvasElement;
  diagram: HTMLCanvasElement;
  top: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

export class FourPaneViewports {
  readonly diagram: DiagramCanvas;
  private readonly paneMap: Record<TrefoilPaneKind, TrefoilPane>;

  constructor(canvases: FourPaneCanvases, rope: RopeState) {
    this.paneMap = {
      perspective: new TrefoilPane(canvases.perspective, "perspective", rope),
      top: new TrefoilPane(canvases.top, "top", rope),
      front: new TrefoilPane(canvases.front, "front", rope)
    };
    this.diagram = new DiagramCanvas(canvases.diagram);
  }

  setProjectionNormal(normal: Vec3): void {
    Object.values(this.paneMap).forEach((pane) => pane.setProjectionNormal(normal));
  }

  setRope(rope: RopeState, highlight: RopeSelectionHighlight | null): void {
    Object.values(this.paneMap).forEach((pane) => pane.updateRope(rope, highlight));
  }

  drawDiagram(projection: KnotDiagram, highlight: RopeSelectionHighlight | null): void {
    this.diagram.draw(projection, highlight);
  }

  eventToCanvasPoint(paneId: ViewportId, event: PointerEvent | MouseEvent): Vec2 {
    return paneId === "diagram"
      ? this.diagram.eventToCanvasPoint(event)
      : this.paneMap[paneId].eventToCanvasPoint(event);
  }

  screenPointsForPane(paneId: ViewportId, rope: RopeState, projection: KnotDiagram): RopeScreenPoint[] {
    if (paneId === "diagram") {
      return projection.points.map((projected) => ({
        particleId: projected.sample.index,
        point: this.diagram.toScreen(projected.point),
        depth: projected.depth
      }));
    }

    const pane = this.paneMap[paneId];
    return rope.particles.map((particle) => ({
      particleId: particle.id,
      point: pane.worldToCanvas(particle.p)
    }));
  }

  screenToWorldTarget(
    paneId: ViewportId,
    screenPoint: Vec2,
    referencePoint: Vec3,
    projection: KnotDiagram,
    referenceDepth: number
  ): Vec3 {
    if (paneId === "diagram") {
      const point = this.diagram.screenToDiagram(screenPoint);
      return add3(
        add3(scale3(projection.basis.u, point.x), scale3(projection.basis.v, point.y)),
        scale3(projection.normal, referenceDepth)
      );
    }

    const pane = this.paneMap[paneId];
    return pane.screenToWorldOnPlane(screenPoint, referencePoint, pane.dragPlaneNormal());
  }
}

class TrefoilPane {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private readonly arrow: THREE.ArrowHelper;
  private readonly plane: THREE.Mesh | null;
  private readonly resizeObserver: ResizeObserver;
  private readonly ropeRenderer: RopeTubeRenderer;

  constructor(readonly canvas: HTMLCanvasElement, private readonly kind: TrefoilPaneKind, rope: RopeState) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setClearColor(new THREE.Color("#0b1115"), 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera = this.createCamera();
    this.plane = kind === "perspective" ? createProjectionPlane() : null;
    this.ropeRenderer = new RopeTubeRenderer(kind as RopeTubeKind);
    this.ropeRenderer.update(rope);
    this.scene.add(createGrid(kind));
    this.scene.add(this.ropeRenderer.group);
    this.scene.add(createAxes());
    this.scene.add(createLights());
    if (this.plane) {
      this.scene.add(this.plane);
    }
    this.arrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 1, 1).normalize(),
      new THREE.Vector3(0, 0, 0),
      2.8,
      0xffd166,
      0.22,
      0.12
    );
    this.scene.add(this.arrow);
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(canvas);
    this.render();
  }

  setProjectionNormal(normal: Vec3): void {
    const direction = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
    this.arrow.setDirection(direction);
    if (this.plane) {
      this.plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }
    this.render();
  }

  updateRope(rope: RopeState, highlight: RopeSelectionHighlight | null): void {
    this.ropeRenderer.update(rope, highlight);
    this.render();
  }

  eventToCanvasPoint(event: PointerEvent | MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return vec2(event.clientX - rect.left, event.clientY - rect.top);
  }

  worldToCanvas(point: Vec3): Vec2 {
    this.prepareCamera();
    const projected = new THREE.Vector3(point.x, point.y, point.z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return vec2((projected.x * 0.5 + 0.5) * rect.width, (-projected.y * 0.5 + 0.5) * rect.height);
  }

  screenToWorldOnPlane(screenPoint: Vec2, planePoint: Vec3, planeNormal: Vec3): Vec3 {
    this.prepareCamera();
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((screenPoint.x / rect.width) * 2 - 1, -(screenPoint.y / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const normal = new THREE.Vector3(planeNormal.x, planeNormal.y, planeNormal.z).normalize();
    const point = new THREE.Vector3(planePoint.x, planePoint.y, planePoint.z);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, target);
    return hit ? vec3(target.x, target.y, target.z) : planePoint;
  }

  dragPlaneNormal(): Vec3 {
    if (this.kind === "top") {
      return vec3(0, 0, 1);
    }
    if (this.kind === "front") {
      return vec3(0, 1, 0);
    }
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    return vec3(direction.x, direction.y, direction.z);
  }

  render(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.renderer.setSize(width, height, false);
    this.updateCamera(width / height);
    this.renderer.render(this.scene, this.camera);
  }

  private prepareCamera(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.updateCamera(width / height);
    this.camera.updateMatrixWorld(true);
  }

  private createCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    if (this.kind === "perspective") {
      const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
      camera.position.set(6, 5, 4.5);
      camera.lookAt(0, 0, 0);
      return camera;
    }
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    if (this.kind === "top") {
      camera.position.set(0, 0, 9);
      camera.up.set(0, 1, 0);
    } else {
      camera.position.set(0, -9, 0);
      camera.up.set(0, 0, 1);
    }
    camera.lookAt(0, 0, 0);
    return camera;
  }

  private updateCamera(aspect: number): void {
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      return;
    }

    const baseSize = 7.2;
    if (aspect >= 1) {
      this.camera.left = (-baseSize * aspect) / 2;
      this.camera.right = (baseSize * aspect) / 2;
      this.camera.top = baseSize / 2;
      this.camera.bottom = -baseSize / 2;
    } else {
      this.camera.left = -baseSize / 2;
      this.camera.right = baseSize / 2;
      this.camera.top = baseSize / (2 * aspect);
      this.camera.bottom = -baseSize / (2 * aspect);
    }
    this.camera.updateProjectionMatrix();
  }
}

const createLights = (): THREE.Group => {
  const group = new THREE.Group();
  group.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 6, 5);
  group.add(key);
  const rim = new THREE.DirectionalLight(0x80c7ff, 0.8);
  rim.position.set(-4, -3, 5);
  group.add(rim);
  return group;
};

const createAxes = (): THREE.Group => {
  const group = new THREE.Group();
  group.add(axisLine(new THREE.Vector3(-3.4, 0, 0), new THREE.Vector3(3.4, 0, 0), 0xff6b6b));
  group.add(axisLine(new THREE.Vector3(0, -3.4, 0), new THREE.Vector3(0, 3.4, 0), 0x7bd88f));
  group.add(axisLine(new THREE.Vector3(0, 0, -2.0), new THREE.Vector3(0, 0, 2.0), 0x6aa9ff));
  return group;
};

const axisLine = (start: THREE.Vector3, end: THREE.Vector3, color: number): THREE.Line => {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.62 }));
};

const createGrid = (kind: TrefoilPaneKind): THREE.LineSegments => {
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const size = 6;
  const divisions = 12;
  const step = size / divisions;
  for (let i = 0; i <= divisions; i += 1) {
    const value = -size / 2 + i * step;
    if (kind === "front") {
      vertices.push(-size / 2, 0, value, size / 2, 0, value);
      vertices.push(value, 0, -size / 2, value, 0, size / 2);
    } else {
      vertices.push(-size / 2, value, 0, size / 2, value, 0);
      vertices.push(value, -size / 2, 0, value, size / 2, 0);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x5d7280, transparent: true, opacity: 0.2 })
  );
};

const createProjectionPlane = (): THREE.Mesh => {
  const geometry = new THREE.PlaneGeometry(5.6, 5.6, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  return new THREE.Mesh(geometry, material);
};

import * as THREE from "three";
import type { RopeSelectionHighlight } from "../rope/ropeSelection";
import type { RopeState } from "../rope/ropeTypes";

export type RopeTubeKind = "perspective" | "top" | "front";

export class RopeTubeRenderer {
  readonly group = new THREE.Group();
  private tube: THREE.Mesh | null = null;
  private line: THREE.Line | null = null;
  private highlightLine: THREE.Line | null = null;
  private readonly bead: THREE.Mesh;

  constructor(private readonly kind: RopeTubeKind) {
    this.bead = new THREE.Mesh(
      new THREE.SphereGeometry(kind === "perspective" ? 0.12 : 0.095, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffd166,
        emissive: 0xffb84d,
        emissiveIntensity: 0.35,
        roughness: 0.32
      })
    );
    this.bead.visible = false;
    this.group.add(this.bead);
  }

  update(rope: RopeState, highlight: RopeSelectionHighlight | null = null): void {
    const points = rope.particles.map((particle) => new THREE.Vector3(particle.p.x, particle.p.y, particle.p.z));
    if (points.length < 4) {
      return;
    }

    const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.5);
    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      Math.max(96, points.length),
      this.kind === "perspective" ? 0.065 : 0.046,
      this.kind === "perspective" ? 16 : 10,
      true
    );
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: this.kind === "perspective" ? 0x69d2a6 : 0x5fb7c8,
      roughness: 0.42,
      metalness: 0.08,
      emissive: highlight?.active ? 0x11382c : 0x000000,
      emissiveIntensity: highlight?.active ? 0.35 : 0
    });
    replaceObject(this.group, this.tube, new THREE.Mesh(tubeGeometry, tubeMaterial));
    this.tube = this.group.children[this.group.children.length - 1] as THREE.Mesh;

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xe7f7f2,
      transparent: true,
      opacity: 0.52
    });
    replaceObject(this.group, this.line, new THREE.Line(lineGeometry, lineMaterial));
    this.line = this.group.children[this.group.children.length - 1] as THREE.Line;

    this.updateHighlight(rope, highlight);
  }

  private updateHighlight(rope: RopeState, highlight: RopeSelectionHighlight | null): void {
    if (!highlight || highlight.particleId === undefined) {
      this.bead.visible = false;
      replaceObject(this.group, this.highlightLine, null);
      this.highlightLine = null;
      return;
    }

    const particle = rope.particles[highlight.particleId];
    if (particle) {
      this.bead.visible = true;
      this.bead.position.set(particle.p.x, particle.p.y, particle.p.z);
      this.bead.scale.setScalar(highlight.active ? 1.25 : 1);
    }

    const ids = localIds(rope.particles.length, highlight.particleId, 5);
    const points = ids.map((id) => {
      const p = rope.particles[id].p;
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: highlight.active ? 0xffd166 : 0x9fe2c5,
      transparent: true,
      opacity: highlight.active ? 0.92 : 0.68
    });
    replaceObject(this.group, this.highlightLine, new THREE.Line(geometry, material));
    this.highlightLine = this.group.children[this.group.children.length - 1] as THREE.Line;
  }
}

const replaceObject = (
  group: THREE.Group,
  oldObject: THREE.Object3D | null,
  newObject: THREE.Object3D | null
): void => {
  if (oldObject) {
    group.remove(oldObject);
    disposeObject(oldObject);
  }
  if (newObject) {
    group.add(newObject);
  }
};

const disposeObject = (object: THREE.Object3D): void => {
  const maybeMesh = object as THREE.Mesh | THREE.Line;
  maybeMesh.geometry?.dispose();
  const material = maybeMesh.material;
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
  } else {
    material?.dispose();
  }
};

const localIds = (count: number, center: number, radius: number): number[] => {
  const ids: number[] = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    ids.push((center + offset + count) % count);
  }
  return ids;
};

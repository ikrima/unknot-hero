import type { KnotDiagram } from "../knot/crossings";
import { Vec2, Vec3, dot3, vec2 } from "../knot/curve";
import { localParticleIds } from "../rope/ropeSelection";
import type { ProbeHint, ProbeState, RopeState } from "../rope/ropeTypes";
import { clampOverlayPosition, hintColor, modeClassName } from "./overlays";

export class ProbeLens {
  private readonly context: CanvasRenderingContext2D;
  private readonly size = 132;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Probe lens canvas could not create a 2D context.");
    }
    this.context = context;
    this.canvas.width = this.size * window.devicePixelRatio;
    this.canvas.height = this.size * window.devicePixelRatio;
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;
    this.context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  draw(probe: ProbeState, rope: RopeState, diagram: KnotDiagram): void {
    if (!probe.active || probe.nearestParticleId === undefined) {
      this.canvas.className = "probe-lens is-hidden";
      return;
    }

    const position = clampOverlayPosition(probe.screenX + 18, probe.screenY + 18, this.size, this.size);
    this.canvas.style.transform = `translate(${position.x}px, ${position.y}px)`;
    this.canvas.className = `probe-lens ${modeClassName(probe.mode)}`;

    const context = this.context;
    context.clearRect(0, 0, this.size, this.size);
    context.save();
    context.beginPath();
    context.arc(this.size / 2, this.size / 2, this.size / 2 - 3, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "rgba(7, 12, 15, 0.94)";
    context.fillRect(0, 0, this.size, this.size);
    this.drawGrid();
    this.drawLocalStrand(probe, rope, diagram);
    this.drawGlyph(probe.hint ?? "none", probe.confidence ?? 0);
    context.restore();
    this.drawRing(probe.hint ?? "none", probe.confidence ?? 0);
  }

  private drawGrid(): void {
    const context = this.context;
    context.save();
    context.strokeStyle = "rgba(142, 188, 202, 0.14)";
    context.lineWidth = 1;
    for (let x = 18; x < this.size; x += 24) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, this.size);
      context.stroke();
    }
    for (let y = 18; y < this.size; y += 24) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(this.size, y);
      context.stroke();
    }
    context.restore();
  }

  private drawLocalStrand(probe: ProbeState, rope: RopeState, diagram: KnotDiagram): void {
    const centerId = probe.nearestParticleId ?? 0;
    const ids = localParticleIds(rope.particles.length, centerId, 8);
    const points = ids.map((id) => projectForProbe(rope.particles[id].p, probe, diagram));
    const fitted = fitPoints(points, 24, this.size - 24);
    const selectedIndex = ids.indexOf(centerId);
    const color = hintColor(probe.hint);

    const context = this.context;
    context.save();
    context.lineWidth = 8;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "rgba(11, 17, 21, 0.92)";
    strokePolyline(context, fitted);
    context.lineWidth = 4;
    context.strokeStyle = color;
    strokePolyline(context, fitted);
    if (selectedIndex >= 0) {
      const selected = fitted[selectedIndex];
      context.beginPath();
      context.arc(selected.x, selected.y, 7, 0, Math.PI * 2);
      context.fillStyle = "#f7fbf9";
      context.fill();
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.stroke();
    }
    context.restore();
  }

  private drawGlyph(hint: ProbeHint, confidence: number): void {
    const context = this.context;
    const color = hintColor(hint);
    context.save();
    context.translate(this.size - 34, 34);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2.4;
    if (hint === "r1") {
      context.beginPath();
      for (let t = 0; t < Math.PI * 2.2; t += 0.18) {
        const r = 2 + t * 1.55;
        const x = Math.cos(t) * r;
        const y = Math.sin(t) * r;
        if (t === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.stroke();
    } else if (hint === "r2") {
      context.strokeRect(-14, -10, 9, 20);
      context.strokeRect(5, -10, 9, 20);
      context.beginPath();
      context.moveTo(-5, 0);
      context.lineTo(5, 0);
      context.stroke();
    } else if (hint === "r3") {
      context.beginPath();
      context.moveTo(0, -15);
      context.lineTo(15, 12);
      context.lineTo(-15, 12);
      context.closePath();
      context.stroke();
    } else if (hint === "flip") {
      context.beginPath();
      context.moveTo(-13, 13);
      context.lineTo(13, -13);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(0, 0, 8, 0, Math.PI * 2);
      context.stroke();
    }
    context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.fillText(`${Math.round(confidence * 100)}%`, 0, 27);
    context.restore();
  }

  private drawRing(hint: ProbeHint, confidence: number): void {
    const context = this.context;
    const radius = this.size / 2 - 4;
    context.save();
    context.beginPath();
    context.arc(this.size / 2, this.size / 2, radius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(227, 236, 239, 0.16)";
    context.lineWidth = 4;
    context.stroke();
    context.beginPath();
    context.arc(this.size / 2, this.size / 2, radius, -Math.PI / 2, -Math.PI / 2 + confidence * Math.PI * 2);
    context.strokeStyle = hintColor(hint);
    context.lineWidth = 4;
    context.stroke();
    context.restore();
  }
}

const projectForProbe = (point: Vec3, probe: ProbeState, diagram: KnotDiagram): Vec2 => {
  if (probe.paneId === "top") {
    return vec2(point.x, point.y);
  }
  if (probe.paneId === "front") {
    return vec2(point.x, point.z);
  }
  return vec2(dot3(point, diagram.basis.u), dot3(point, diagram.basis.v));
};

const fitPoints = (points: Vec2[], min: number, max: number): Vec2[] => {
  const bounds = points.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      maxX: Math.max(current.maxX, point.x),
      minY: Math.min(current.minY, point.y),
      maxY: Math.max(current.maxY, point.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);
  const scale = Math.min((max - min) / width, (max - min) / height);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const targetCenter = (min + max) / 2;
  return points.map((point) => vec2(targetCenter + (point.x - centerX) * scale, targetCenter - (point.y - centerY) * scale));
};

const strokePolyline = (context: CanvasRenderingContext2D, points: Vec2[]): void => {
  if (points.length === 0) {
    return;
  }
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();
};

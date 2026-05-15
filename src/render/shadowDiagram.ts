import { Crossing, KnotDiagram } from "../knot/crossings";
import { Vec2, normalize2, sub2, vec2 } from "../knot/curve";
import { CrossingMarker } from "../input/slashDetector";
import type { RopeSelectionHighlight } from "../rope/ropeSelection";
import { hintColor } from "./overlays";

export class DiagramCanvas {
  private readonly context: CanvasRenderingContext2D;
  private projection: KnotDiagram | null = null;
  private markers: CrossingMarker[] = [];
  private slashTrail: Vec2[] = [];
  private highlight: RopeSelectionHighlight | null = null;
  private scale = 1;
  private offset = vec2(0, 0);
  private readonly resizeObserver: ResizeObserver;

  constructor(readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Diagram canvas could not create a 2D context.");
    }
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.projection) {
        this.draw(this.projection, this.highlight);
      }
    });
    this.resizeObserver.observe(canvas);
  }

  getMarkers(): CrossingMarker[] {
    return this.markers;
  }

  setSlashTrail(points: Vec2[]): void {
    this.slashTrail = points;
    if (this.projection) {
      this.draw(this.projection, this.highlight);
    }
  }

  clearSlashTrail(): void {
    this.slashTrail = [];
    if (this.projection) {
      this.draw(this.projection, this.highlight);
    }
  }

  draw(projection: KnotDiagram, highlight: RopeSelectionHighlight | null = this.highlight): void {
    this.projection = projection;
    this.highlight = highlight;
    const { width, height } = this.prepareCanvas();
    const context = this.context;
    const padding = 38;
    const boundsWidth = Math.max(0.001, projection.bounds.maxX - projection.bounds.minX);
    const boundsHeight = Math.max(0.001, projection.bounds.maxY - projection.bounds.minY);
    this.scale = Math.min((width - padding * 2) / boundsWidth, (height - padding * 2) / boundsHeight);
    const centerX = (projection.bounds.minX + projection.bounds.maxX) / 2;
    const centerY = (projection.bounds.minY + projection.bounds.maxY) / 2;
    this.offset = vec2(width / 2 - centerX * this.scale, height / 2 + centerY * this.scale);

    context.fillStyle = "#0b1115";
    context.fillRect(0, 0, width, height);
    this.drawGrid(width, height);
    this.drawCurve(projection);
    this.drawHighlight(projection);
    this.markers = projection.crossings.map((crossing) => ({
      crossing,
      center: this.toScreen(crossing.point),
      radius: 13
    }));
    projection.crossings.forEach((crossing) => this.drawCrossing(projection, crossing));
    this.drawSlashTrail();
  }

  eventToCanvasPoint(event: PointerEvent | MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return vec2(event.clientX - rect.left, event.clientY - rect.top);
  }

  toScreen(point: Vec2): Vec2 {
    return vec2(point.x * this.scale + this.offset.x, -point.y * this.scale + this.offset.y);
  }

  screenToDiagram(point: Vec2): Vec2 {
    return vec2((point.x - this.offset.x) / this.scale, -(point.y - this.offset.y) / this.scale);
  }

  private prepareCanvas(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.floor(width * dpr);
    const pixelHeight = Math.floor(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  private drawGrid(width: number, height: number): void {
    const context = this.context;
    context.save();
    context.strokeStyle = "rgba(133, 166, 177, 0.12)";
    context.lineWidth = 1;
    const spacing = 36;
    for (let x = 0; x <= width; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += spacing) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.restore();
  }

  private drawCurve(projection: KnotDiagram): void {
    const context = this.context;
    context.save();
    context.beginPath();
    projection.points.forEach((projected, index) => {
      const point = this.toScreen(projected.point);
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    const first = this.toScreen(projection.points[0].point);
    context.lineTo(first.x, first.y);
    context.strokeStyle = "#64a9c3";
    context.lineWidth = 2.2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
    context.restore();
  }

  private drawHighlight(projection: KnotDiagram): void {
    if (!this.highlight || projection.points.length === 0) {
      return;
    }
    const context = this.context;
    const color = hintColor(this.highlight.hint);
    const count = projection.points.length;
    const center = this.highlight.particleId;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = color;
    context.globalAlpha = this.highlight.active ? 0.8 : 0.48;
    context.lineWidth = this.highlight.active ? 7 : 5;
    context.beginPath();
    for (let offset = -5; offset <= 5; offset += 1) {
      const id = (center + offset + count) % count;
      const point = this.toScreen(projection.points[id].point);
      if (offset === -5) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }
    context.stroke();
    const bead = this.toScreen(projection.points[center].point);
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(bead.x, bead.y, this.highlight.active ? 6.5 : 5, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.restore();
  }

  private drawCrossing(projection: KnotDiagram, crossing: Crossing): void {
    const context = this.context;
    const center = this.toScreen(crossing.point);
    const overSegment = crossing.over === "a" ? crossing.segmentA : crossing.segmentB;
    const underSegment = crossing.over === "a" ? crossing.segmentB : crossing.segmentA;
    const overDirection = this.segmentDirection(projection, overSegment);
    const underDirection = this.segmentDirection(projection, underSegment);

    context.save();
    context.lineCap = "round";
    context.strokeStyle = "#0b1115";
    context.lineWidth = 9;
    drawCenteredLine(context, center, underDirection, 24);
    context.strokeStyle = "#2f5360";
    context.lineWidth = 3;
    drawCenteredLine(context, center, underDirection, 21);
    context.strokeStyle = crossing.flipped ? "#ff5c8a" : "#ffd166";
    context.lineWidth = 4.5;
    drawCenteredLine(context, center, overDirection, 26);
    context.beginPath();
    context.arc(center.x, center.y, 7.5, 0, Math.PI * 2);
    context.fillStyle = "rgba(11, 17, 21, 0.74)";
    context.fill();
    context.strokeStyle = crossing.flipped ? "#ff5c8a" : "#f6c95f";
    context.lineWidth = 1.6;
    context.stroke();
    context.restore();
  }

  private segmentDirection(projection: KnotDiagram, segmentIndex: number): Vec2 {
    const start = this.toScreen(projection.points[segmentIndex].point);
    const end = this.toScreen(projection.points[(segmentIndex + 1) % projection.points.length].point);
    return normalize2(sub2(end, start));
  }

  private drawSlashTrail(): void {
    if (this.slashTrail.length < 2) {
      return;
    }
    const context = this.context;
    context.save();
    context.beginPath();
    this.slashTrail.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.strokeStyle = "#ff5c8a";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
    context.restore();
  }
}

const drawCenteredLine = (
  context: CanvasRenderingContext2D,
  center: Vec2,
  direction: Vec2,
  length: number
): void => {
  const half = length / 2;
  context.beginPath();
  context.moveTo(center.x - direction.x * half, center.y - direction.y * half);
  context.lineTo(center.x + direction.x * half, center.y + direction.y * half);
  context.stroke();
};

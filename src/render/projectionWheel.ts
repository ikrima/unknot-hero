import { Vec2, Vec3, normalize3, rotateAroundAxis, vec2, vec3 } from "../knot/curve";

interface ProjectionWheelOptions {
  onPreview: (normal: Vec3) => void;
  onCommit: (normal: Vec3) => void;
}

export class ProjectionWheel {
  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private normal = normalize3(vec3(1, 1, 1));
  private dragging = false;
  private moved = false;
  private lastPointer = vec2(0, 0);

  constructor(readonly canvas: HTMLCanvasElement, private readonly options: ProjectionWheelOptions) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Projection wheel canvas could not create a 2D context.");
    }
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
    this.installPointerHandlers();
    this.draw();
  }

  setNormal(normal: Vec3): void {
    this.normal = normalize3(normal);
    this.draw();
  }

  private installPointerHandlers(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.moved = false;
      this.lastPointer = this.eventToCanvasPoint(event);
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) {
        return;
      }
      const point = this.eventToCanvasPoint(event);
      const rect = this.canvas.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.38);
      const dx = (point.x - this.lastPointer.x) / radius;
      const dy = (point.y - this.lastPointer.y) / radius;
      if (Math.abs(dx) + Math.abs(dy) > 0.001) {
        this.moved = true;
      }
      this.normal = normalize3(rotateAroundAxis(this.normal, vec3(0, 1, 0), dx * 1.35));
      this.normal = normalize3(rotateAroundAxis(this.normal, vec3(1, 0, 0), dy * 1.35));
      this.lastPointer = point;
      this.options.onPreview(this.normal);
      this.draw();
    });
    this.canvas.addEventListener("pointerup", (event) => this.finishDrag(event));
    this.canvas.addEventListener("pointercancel", (event) => this.finishDrag(event));
  }

  private finishDrag(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.moved) {
      this.options.onCommit(this.normal);
    }
  }

  private eventToCanvasPoint(event: PointerEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return vec2(event.clientX - rect.left, event.clientY - rect.top);
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

  private draw(): void {
    const { width, height } = this.prepareCanvas();
    const context = this.context;
    const radius = Math.min(width, height) * 0.38;
    const center = vec2(width / 2, height / 2);
    const dot = vec2(center.x + this.normal.x * radius, center.y - this.normal.y * radius);

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0f171c";
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(center.x, center.y);
    context.strokeStyle = "rgba(144, 176, 186, 0.18)";
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(0, 0, radius, radius * 0.34, 0, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(-radius, 0);
    context.lineTo(radius, 0);
    context.moveTo(0, -radius);
    context.lineTo(0, radius);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.strokeStyle = "#66808a";
    context.lineWidth = 1.4;
    context.stroke();
    context.restore();

    context.save();
    context.strokeStyle = "#ffd166";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.lineTo(dot.x, dot.y);
    context.stroke();
    context.beginPath();
    context.arc(dot.x, dot.y, 7 + Math.max(0, this.normal.z) * 3, 0, Math.PI * 2);
    context.fillStyle = this.normal.z >= 0 ? "#ffd166" : "#0f171c";
    context.fill();
    context.strokeStyle = this.normal.z >= 0 ? "#ffe6a3" : "#ffd166";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#dce8ec";
    context.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText("X", center.x + radius + 10, center.y + 4);
    context.fillText("Y", center.x - 4, center.y - radius - 10);
    context.fillText("Z depth", 12, height - 14);
    context.restore();
  }
}

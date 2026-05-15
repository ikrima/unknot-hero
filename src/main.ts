import "./styles.css";
import { buildExportDocument } from "./app/exportState";
import { createInitialState, reduceKnotState } from "./app/actions";
import type { KnotAction } from "./app/actions";
import type { CrossingFlipSource } from "./app/state";
import { createGestureInput } from "./input/gestureInput";
import type { HandSignal, HandTrackingStatus, RightHandCursor } from "./input/gestureInput";
import { createMouseFallback } from "./input/mouseFallback";
import { crossingsAlongSlashSegment, hitCrossingMarker } from "./input/slashDetector";
import { projectCurveDiagram } from "./knot/crossings";
import type { Crossing, KnotDiagram } from "./knot/crossings";
import { Vec2, Vec3, distance2, formatVec3, normalize3, sampleTrefoil, vec3 } from "./knot/curve";
import { hasGrabConstraint } from "./rope/constraints";
import type { RopeSelectionHighlight } from "./rope/ropeSelection";
import { solveRope } from "./rope/ropeSolver";
import { ropeToCurveSamples } from "./rope/ropeToCurve";
import type { ViewportId } from "./rope/ropeTypes";
import { ProjectionWheel } from "./render/projectionWheel";
import { ProbeLens } from "./render/probeLens";
import { FourPaneViewports } from "./render/viewports";

const sampleCount = 360;
const trefoilSamples = sampleTrefoil(sampleCount);
const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

root.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <strong>Knot Hero</strong>
        <span>Direct Rope v0</span>
      </div>
      <div class="mode-toggle" aria-label="Input mode">
        <button type="button" class="mode-button is-active" data-input-mode="mouse">Mouse Mode</button>
        <button type="button" class="mode-button" data-input-mode="hand">Hand Mode</button>
      </div>
      <div class="snap-controls" aria-label="Projection normal presets">
        <button type="button" class="snap-button" data-snap="XY">XY</button>
        <button type="button" class="snap-button" data-snap="XZ">XZ</button>
        <button type="button" class="snap-button" data-snap="YZ">YZ</button>
        <button type="button" class="snap-button" data-snap="Iso">Iso</button>
      </div>
      <button type="button" class="export-button" id="export-button">Export JSON</button>
    </header>
    <main class="workspace">
      <section class="viewport-grid" aria-label="Synchronized knot viewports">
        <section class="pane">
          <div class="pane-title">Perspective</div>
          <canvas id="perspective-pane"></canvas>
        </section>
        <section class="pane">
          <div class="pane-title">Shadow / Diagram</div>
          <canvas id="diagram-pane"></canvas>
          <div id="right-hand-cursor" class="hand-cursor is-hidden" aria-hidden="true"></div>
        </section>
        <section class="pane">
          <div class="pane-title">Top / XY</div>
          <canvas id="top-pane"></canvas>
        </section>
        <section class="pane">
          <div class="pane-title">Front / XZ</div>
          <canvas id="front-pane"></canvas>
        </section>
      </section>
      <aside class="control-rail" aria-label="Projection and trace controls">
        <section class="rail-section wheel-section">
          <div class="section-label">Projection Normal</div>
          <canvas id="projection-wheel"></canvas>
          <dl class="readout-grid">
            <div>
              <dt>n</dt>
              <dd id="normal-readout"></dd>
            </div>
            <div>
              <dt>crossings</dt>
              <dd id="crossing-count"></dd>
            </div>
          </dl>
          <div class="hand-status" aria-live="polite">
            <div class="hand-status-message" id="hand-status-message">Mouse Mode active.</div>
            <div class="hand-status-row" id="left-hand-status">
              <span class="confidence-dot"></span>
              <span>Left</span>
              <code>none</code>
            </div>
            <div class="hand-status-row" id="right-hand-status">
              <span class="confidence-dot"></span>
              <span>Right</span>
              <code>none</code>
            </div>
          </div>
        </section>
        <section class="rail-section trace-section">
          <div class="section-label">Trace</div>
          <ol id="trace-list" class="trace-list"></ol>
        </section>
      </aside>
      <canvas id="probe-lens" class="probe-lens is-hidden" aria-hidden="true"></canvas>
    </main>
    <video id="hand-video" class="hand-video" playsinline muted></video>
  </div>
`;

const getElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}.`);
  }
  return element as T;
};

const perspectiveCanvas = getElement<HTMLCanvasElement>("perspective-pane");
const diagramCanvasElement = getElement<HTMLCanvasElement>("diagram-pane");
const topCanvas = getElement<HTMLCanvasElement>("top-pane");
const frontCanvas = getElement<HTMLCanvasElement>("front-pane");
const wheelCanvas = getElement<HTMLCanvasElement>("projection-wheel");
const probeCanvas = getElement<HTMLCanvasElement>("probe-lens");
const normalReadout = getElement<HTMLElement>("normal-readout");
const crossingCount = getElement<HTMLElement>("crossing-count");
const traceList = getElement<HTMLOListElement>("trace-list");
const exportButton = getElement<HTMLButtonElement>("export-button");
const handVideo = getElement<HTMLVideoElement>("hand-video");
const rightHandCursor = getElement<HTMLDivElement>("right-hand-cursor");
const handStatusMessage = getElement<HTMLDivElement>("hand-status-message");
const leftHandStatus = getElement<HTMLDivElement>("left-hand-status");
const rightHandStatus = getElement<HTMLDivElement>("right-hand-status");
const snapButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-snap]"));
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-input-mode]"));

let state = createInitialState(trefoilSamples);
let projection: KnotDiagram = projectCurveDiagram(ropeToCurveSamples(state.rope), state.projectionNormal, state.crossingOverrides);
let ropeHighlight: RopeSelectionHighlight | null = null;
let slashClearTimer = 0;
let handSlashClearTimer = 0;
let handSlashConsumedIds = new Set<string>();
let handSlashFlippedIds: string[] = [];
let inputMode: "mouse" | "hand" = "mouse";
let relaxUntilMs = 0;
let lastFrameMs = performance.now();

const viewports = new FourPaneViewports(
  {
    perspective: perspectiveCanvas,
    diagram: diagramCanvasElement,
    top: topCanvas,
    front: frontCanvas
  },
  state.rope
);
const probeLens = new ProbeLens(probeCanvas);

const gestureInput = createGestureInput({
  video: handVideo,
  diagramCanvas: diagramCanvasElement,
  getProjectionNormal: () => state.projectionNormal,
  onProjectionNormal: (normal) => {
    dispatch({
      type: "projection/set",
      normal,
      source: "drag",
      label: "Hand",
      trace: false
    });
  },
  onProjectionCommit: (normal) => {
    dispatch({
      type: "projection/set",
      normal,
      source: "drag",
      label: "Hand",
      trace: true
    });
  },
  onRightCursor: updateRightHandCursor,
  onRightSlashSegment: handleHandSlashSegment,
  onRightSlashEnd: finishHandSlash,
  onStatus: updateHandStatus
});

const mouseRope = createMouseFallback({
  getRope: () => state.rope,
  getDiagram: () => projection,
  getCrossingMarkers: () => viewports.diagram.getMarkers(),
  getScreenPoints: (paneId) => viewports.screenPointsForPane(paneId, state.rope, projection),
  eventToCanvasPoint: (paneId, event) => viewports.eventToCanvasPoint(paneId, event),
  screenToWorldTarget: (paneId, screenPoint, referencePoint, referenceDepth) =>
    viewports.screenToWorldTarget(paneId, screenPoint, referencePoint, projection, referenceDepth),
  onProbe: (probe) => dispatch({ type: "probe/set", probe }),
  onHighlight: (highlight) => {
    ropeHighlight = highlight;
    render();
  },
  onGrabStart: (particleId, paneId, target) => {
    relaxUntilMs = Number.POSITIVE_INFINITY;
    dispatch({
      type: "rope/grab-start",
      particleId,
      paneId,
      target,
      timestampMs: performance.now()
    });
  },
  onGrabMove: (particleId, paneId, target, sampled) => {
    relaxUntilMs = Number.POSITIVE_INFINITY;
    dispatch({
      type: "rope/grab-move",
      particleId,
      paneId,
      target,
      sampled,
      timestampMs: performance.now()
    });
  },
  onGrabEnd: (particleId, paneId) => {
    relaxUntilMs = performance.now() + 1200;
    dispatch({
      type: "rope/grab-end",
      particleId,
      paneId,
      timestampMs: performance.now()
    });
  }
});

const wheel = new ProjectionWheel(wheelCanvas, {
  onPreview: (normal) => {
    dispatch({
      type: "projection/set",
      normal,
      source: "drag",
      trace: false
    });
  },
  onCommit: (normal) => {
    dispatch({
      type: "projection/set",
      normal,
      source: "drag",
      trace: true
    });
  }
});

const presets: Record<string, Vec3> = {
  XY: vec3(0, 0, 1),
  XZ: vec3(0, 1, 0),
  YZ: vec3(1, 0, 0),
  Iso: normalize3(vec3(1, 1, 1))
};

snapButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.dataset.snap ?? "Iso";
    dispatch({
      type: "projection/set",
      normal: presets[label] ?? presets.Iso,
      source: "snap",
      label,
      trace: true
    });
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextMode = button.dataset.inputMode === "hand" ? "hand" : "mouse";
    setInputMode(nextMode);
  });
});

interface SlashState {
  pointerId: number;
  points: Vec2[];
  totalDistance: number;
  consumedIds: Set<string>;
  flippedIds: string[];
}

let slashState: SlashState | null = null;

installRopePane(perspectiveCanvas, "perspective");
installRopePane(topCanvas, "top");
installRopePane(frontCanvas, "front");

diagramCanvasElement.addEventListener("pointerdown", (event) => {
  window.clearTimeout(slashClearTimer);
  const point = viewports.diagram.eventToCanvasPoint(event);
  const crossing = hitCrossingMarker(viewports.diagram.getMarkers(), point);
  if (!crossing && mouseRope.pointerDown("diagram", event)) {
    return;
  }
  startSlash(event, point);
});

diagramCanvasElement.addEventListener("pointermove", (event) => {
  if (mouseRope.isDragging()) {
    mouseRope.pointerMove(event);
    return;
  }
  if (!slashState || slashState.pointerId !== event.pointerId) {
    mouseRope.hover("diagram", event);
    return;
  }
  const previous = slashState.points[slashState.points.length - 1];
  const point = viewports.diagram.eventToCanvasPoint(event);
  slashState.points.push(point);
  slashState.totalDistance += distance2(previous, point);

  if (slashState.totalDistance > 6) {
    const hits = crossingsAlongSlashSegment(viewports.diagram.getMarkers(), previous, point, slashState.consumedIds);
    hits.forEach((crossing) => {
      slashState?.consumedIds.add(crossing.id);
      slashState?.flippedIds.push(crossing.id);
      flipCrossing(crossing, "slash");
    });
  }

  viewports.diagram.setSlashTrail(slashState.points);
});

diagramCanvasElement.addEventListener("pointerup", (event) => {
  if (mouseRope.isDragging()) {
    mouseRope.pointerUp(event);
    return;
  }
  finishSlash(event);
});
diagramCanvasElement.addEventListener("pointercancel", (event) => {
  if (mouseRope.isDragging()) {
    mouseRope.pointerUp(event);
    return;
  }
  finishSlash(event);
});
diagramCanvasElement.addEventListener("pointerleave", () => mouseRope.clearHover());

exportButton.addEventListener("click", () => {
  dispatch({
    type: "trace/log",
    kind: "export.download",
    payload: {
      crossingCount: projection.crossings.length,
      traceCount: state.trace.length + 1
    }
  });
  const samples = ropeToCurveSamples(state.rope);
  const exportDoc = buildExportDocument(samples, projection, state);
  const blob = new Blob([JSON.stringify(exportDoc, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "knot-hero-direct-rope-v0.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    mouseRope.cancel();
  }
});

function installRopePane(canvas: HTMLCanvasElement, paneId: ViewportId): void {
  canvas.addEventListener("pointerdown", (event) => {
    mouseRope.pointerDown(paneId, event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (mouseRope.isDragging()) {
      mouseRope.pointerMove(event);
    } else {
      mouseRope.hover(paneId, event);
    }
  });
  canvas.addEventListener("pointerup", (event) => mouseRope.pointerUp(event));
  canvas.addEventListener("pointercancel", (event) => mouseRope.pointerUp(event));
  canvas.addEventListener("pointerleave", () => mouseRope.clearHover());
}

function startSlash(event: PointerEvent, point: Vec2): void {
  slashState = {
    pointerId: event.pointerId,
    points: [point],
    totalDistance: 0,
    consumedIds: new Set(),
    flippedIds: []
  };
  diagramCanvasElement.setPointerCapture(event.pointerId);
  viewports.diagram.setSlashTrail([point]);
}

function finishSlash(event: PointerEvent): void {
  if (!slashState || slashState.pointerId !== event.pointerId) {
    return;
  }

  const finalPoint = viewports.diagram.eventToCanvasPoint(event);
  const wasClick = slashState.totalDistance < 6;
  const finishedSlash = slashState;
  if (diagramCanvasElement.hasPointerCapture(event.pointerId)) {
    diagramCanvasElement.releasePointerCapture(event.pointerId);
  }
  slashState = null;

  if (wasClick) {
    const crossing = hitCrossingMarker(viewports.diagram.getMarkers(), finalPoint);
    if (crossing) {
      flipCrossing(crossing, "click");
    }
  } else {
    dispatch({
      type: "trace/log",
      kind: "diagram.slash",
      payload: {
        flipped: finishedSlash.flippedIds
      }
    });
  }

  viewports.diagram.setSlashTrail(finishedSlash.points);
  slashClearTimer = window.setTimeout(() => {
    viewports.diagram.clearSlashTrail();
  }, 420);
}

function handleHandSlashSegment(start: Vec2, end: Vec2, trail: Vec2[]): void {
  window.clearTimeout(handSlashClearTimer);
  const hits = crossingsAlongSlashSegment(viewports.diagram.getMarkers(), start, end, handSlashConsumedIds);
  hits.forEach((crossing) => {
    handSlashConsumedIds.add(crossing.id);
    handSlashFlippedIds.push(crossing.id);
    flipCrossing(crossing, "slash");
  });
  viewports.diagram.setSlashTrail(trail);
}

function finishHandSlash(trail: Vec2[]): void {
  if (trail.length > 1) {
    dispatch({
      type: "trace/log",
      kind: "diagram.slash",
      payload: {
        source: "hand",
        flipped: handSlashFlippedIds
      }
    });
    viewports.diagram.setSlashTrail(trail);
    handSlashClearTimer = window.setTimeout(() => {
      viewports.diagram.clearSlashTrail();
    }, 420);
  }
  handSlashConsumedIds = new Set();
  handSlashFlippedIds = [];
}

function flipCrossing(crossing: Crossing, source: CrossingFlipSource): void {
  dispatch({
    type: "crossing/flip",
    crossing,
    source,
    timestampMs: performance.now()
  });
}

function dispatch(action: KnotAction): void {
  state = reduceKnotState(state, action);
  render();
}

function render(): void {
  const samples = ropeToCurveSamples(state.rope);
  projection = projectCurveDiagram(samples, state.projectionNormal, state.crossingOverrides);
  viewports.setProjectionNormal(state.projectionNormal);
  viewports.setRope(state.rope, ropeHighlight);
  viewports.drawDiagram(projection, ropeHighlight);
  probeLens.draw(state.probe, state.rope, projection);
  wheel.setNormal(state.projectionNormal);
  normalReadout.textContent = formatVec3(state.projectionNormal);
  crossingCount.textContent = String(projection.crossings.length);
  renderTrace();
  renderSnapState();
}

function renderTrace(): void {
  traceList.replaceChildren();
  state.trace
    .slice(-18)
    .reverse()
    .forEach((event) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const payload = document.createElement("code");
      label.textContent = `${event.step}. ${event.kind}`;
      payload.textContent = compactPayload(event.payload);
      item.append(label, payload);
      traceList.append(item);
    });
}

function renderSnapState(): void {
  snapButtons.forEach((button) => {
    const label = button.dataset.snap ?? "";
    const preset = presets[label];
    const active =
      preset &&
      Math.abs(preset.x - state.projectionNormal.x) < 0.001 &&
      Math.abs(preset.y - state.projectionNormal.y) < 0.001 &&
      Math.abs(preset.z - state.projectionNormal.z) < 0.001;
    button.classList.toggle("is-active", Boolean(active));
  });
}

function setInputMode(nextMode: "mouse" | "hand"): void {
  if (inputMode === nextMode) {
    return;
  }
  inputMode = nextMode;
  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.inputMode === inputMode);
  });
  dispatch({
    type: "trace/log",
    kind: "input.mode",
    payload: {
      mode: inputMode
    }
  });

  if (inputMode === "hand") {
    void gestureInput.start();
  } else {
    gestureInput.stop();
    updateRightHandCursor({
      point: vec3(0, 0, 0),
      confidence: 0,
      confidenceLevel: "none",
      visible: false
    });
    updateHandStatus({
      available: false,
      running: false,
      message: "Mouse Mode active.",
      left: emptyHandSignal("left"),
      right: emptyHandSignal("right")
    });
  }
}

function updateRightHandCursor(cursor: RightHandCursor): void {
  rightHandCursor.classList.toggle("is-hidden", !cursor.visible);
  rightHandCursor.classList.toggle("is-high", cursor.confidenceLevel === "high");
  rightHandCursor.classList.toggle("is-low", cursor.confidenceLevel === "low");
  rightHandCursor.style.transform = `translate(${cursor.point.x}px, ${cursor.point.y}px) translate(-50%, -50%)`;
}

function updateHandStatus(status: HandTrackingStatus): void {
  handStatusMessage.textContent = status.message;
  renderHandSignal(leftHandStatus, status.left);
  renderHandSignal(rightHandStatus, status.right);
}

function renderHandSignal(element: HTMLElement, signal: HandSignal): void {
  element.classList.toggle("is-high", signal.confidenceLevel === "high");
  element.classList.toggle("is-low", signal.confidenceLevel === "low");
  element.classList.toggle("is-none", signal.confidenceLevel === "none");
  const code = element.querySelector("code");
  if (code) {
    code.textContent = signal.present
      ? `${signal.gesture} ${Math.round(signal.confidence * 100)}%`
      : "none";
  }
}

function emptyHandSignal(side: HandSignal["side"]): HandSignal {
  return {
    side,
    present: false,
    confidence: 0,
    confidenceLevel: "none",
    gesture: "none"
  };
}

function compactPayload(payload: Record<string, unknown>): string {
  const text = JSON.stringify(payload);
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function tick(now: number): void {
  const dt = Math.max(1 / 120, Math.min(1 / 24, (now - lastFrameMs) / 1000));
  lastFrameMs = now;
  if (hasGrabConstraint(state.rope) || now < relaxUntilMs) {
    state = reduceKnotState(state, {
      type: "rope/set",
      rope: solveRope(state.rope, { dt })
    });
    render();
  }
  window.requestAnimationFrame(tick);
}

window.addEventListener("beforeunload", () => gestureInput.stop());
render();
window.requestAnimationFrame(tick);

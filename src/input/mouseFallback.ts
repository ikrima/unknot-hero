import { KnotDiagram } from "../knot/crossings";
import { Vec2, Vec3, dot3 } from "../knot/curve";
import { CrossingMarker, hitCrossingMarker } from "./slashDetector";
import { nearestRopeSelection, RopeSelectionHighlight, RopeScreenPoint } from "../rope/ropeSelection";
import { chooseProbeMode, createProbeState, inactiveProbe } from "../rope/ropeProbe";
import type { ProbeHint, ProbeState, RopeState, ViewportId } from "../rope/ropeTypes";
import { particlePositionOrOrigin } from "../rope/ropeState";
import { strongestNearMoveCandidate } from "../topology/nearMoves";

export interface MouseFallbackOptions {
  getRope: () => RopeState;
  getDiagram: () => KnotDiagram;
  getCrossingMarkers: () => CrossingMarker[];
  getScreenPoints: (paneId: ViewportId) => RopeScreenPoint[];
  eventToCanvasPoint: (paneId: ViewportId, event: PointerEvent | MouseEvent) => Vec2;
  screenToWorldTarget: (
    paneId: ViewportId,
    screenPoint: Vec2,
    referencePoint: Vec3,
    referenceDepth: number
  ) => Vec3;
  onProbe: (probe: ProbeState) => void;
  onHighlight: (highlight: RopeSelectionHighlight | null) => void;
  onGrabStart: (particleId: number, paneId: ViewportId, target: Vec3) => void;
  onGrabMove: (particleId: number, paneId: ViewportId, target: Vec3, sampled: boolean) => void;
  onGrabEnd: (particleId: number, paneId: ViewportId) => void;
}

export interface MouseFallback {
  hover: (paneId: ViewportId, event: PointerEvent | MouseEvent) => void;
  pointerDown: (paneId: ViewportId, event: PointerEvent) => boolean;
  pointerMove: (event: PointerEvent) => void;
  pointerUp: (event: PointerEvent) => void;
  clearHover: () => void;
  cancel: () => void;
  isDragging: () => boolean;
}

interface ActiveDrag {
  pointerId: number;
  paneId: ViewportId;
  particleId: number;
  referencePoint: Vec3;
  referenceDepth: number;
  target: EventTarget | null;
  lastTraceMs: number;
}

const selectionThresholdPx = 24;
const moveTraceIntervalMs = 96;

export const createMouseFallback = (options: MouseFallbackOptions): MouseFallback => {
  let drag: ActiveDrag | null = null;

  const resolveHint = (paneId: ViewportId, canvasPoint: Vec2, particleId?: number): { hint: ProbeHint; confidence: number } => {
    if (paneId === "diagram") {
      const crossing = hitCrossingMarker(options.getCrossingMarkers(), canvasPoint, 17);
      if (crossing) {
        return { hint: "flip", confidence: 1 };
      }
    }

    const candidate = strongestNearMoveCandidate({
      rope: options.getRope(),
      diagram: options.getDiagram(),
      particleId
    });
    if (candidate && candidate.confidence >= 0.38) {
      return { hint: candidate.hint, confidence: candidate.confidence };
    }
    return { hint: "none", confidence: 0 };
  };

  const publishHover = (paneId: ViewportId, event: PointerEvent | MouseEvent, active: boolean): void => {
    const canvasPoint = options.eventToCanvasPoint(paneId, event);
    const selection = nearestRopeSelection(options.getScreenPoints(paneId), canvasPoint, selectionThresholdPx);
    if (!selection) {
      options.onProbe(inactiveProbe());
      options.onHighlight(null);
      return;
    }

    const hint = resolveHint(paneId, canvasPoint, selection.particleId);
    const screenPoint = { x: event.clientX, y: event.clientY };
    const mode = chooseProbeMode(active, hint.hint, Math.max(hint.confidence, selection.confidence));
    options.onProbe(
      createProbeState(selection, screenPoint, mode, hint.hint, Math.max(hint.confidence, selection.confidence), paneId)
    );
    options.onHighlight({
      ...selection,
      paneId,
      active,
      hint: hint.hint
    });
  };

  return {
    hover: (paneId, event) => {
      if (drag) {
        return;
      }
      publishHover(paneId, event, false);
    },
    pointerDown: (paneId, event) => {
      if (drag) {
        return false;
      }
      const canvasPoint = options.eventToCanvasPoint(paneId, event);
      const selection = nearestRopeSelection(options.getScreenPoints(paneId), canvasPoint, selectionThresholdPx);
      if (!selection) {
        return false;
      }

      const referencePoint = particlePositionOrOrigin(options.getRope(), selection.particleId);
      const referenceDepth = dot3(referencePoint, options.getDiagram().normal);
      const target = options.screenToWorldTarget(paneId, canvasPoint, referencePoint, referenceDepth);
      drag = {
        pointerId: event.pointerId,
        paneId,
        particleId: selection.particleId,
        referencePoint,
        referenceDepth,
        target: event.currentTarget,
        lastTraceMs: 0
      };
      (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      options.onGrabStart(selection.particleId, paneId, target);
      publishHover(paneId, event, true);
      return true;
    },
    pointerMove: (event) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      const canvasPoint = options.eventToCanvasPoint(drag.paneId, event);
      const target = options.screenToWorldTarget(drag.paneId, canvasPoint, drag.referencePoint, drag.referenceDepth);
      const now = performance.now();
      const sampled = now - drag.lastTraceMs >= moveTraceIntervalMs;
      if (sampled) {
        drag.lastTraceMs = now;
      }
      options.onGrabMove(drag.particleId, drag.paneId, target, sampled);
      publishHover(drag.paneId, event, true);
    },
    pointerUp: (event) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      const finished = drag;
      (finished.target as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
      drag = null;
      options.onGrabEnd(finished.particleId, finished.paneId);
      publishHover(finished.paneId, event, false);
    },
    clearHover: () => {
      if (!drag) {
        options.onProbe(inactiveProbe());
        options.onHighlight(null);
      }
    },
    cancel: () => {
      if (!drag) {
        options.onProbe(inactiveProbe());
        options.onHighlight(null);
        return;
      }
      const finished = drag;
      drag = null;
      options.onGrabEnd(finished.particleId, finished.paneId);
      options.onProbe(inactiveProbe());
      options.onHighlight(null);
    },
    isDragging: () => Boolean(drag)
  };
};

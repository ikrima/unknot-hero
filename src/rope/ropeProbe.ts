import type { Vec2 } from "../knot/curve";
import type { RopeSelection } from "./ropeSelection";
import type { ProbeHint, ProbeMode, ProbeState, ViewportId } from "./ropeTypes";

export const inactiveProbe = (): ProbeState => ({
  active: false,
  screenX: 0,
  screenY: 0,
  mode: "inspect",
  hint: "none",
  confidence: 0
});

export const createProbeState = (
  selection: RopeSelection,
  screenPoint: Vec2,
  mode: ProbeMode,
  hint: ProbeHint = "none",
  confidence = selection.confidence,
  paneId?: ViewportId
): ProbeState => ({
  active: true,
  screenX: screenPoint.x,
  screenY: screenPoint.y,
  nearestParticleId: selection.particleId,
  nearestSegmentId: selection.segmentId,
  mode,
  hint,
  confidence,
  paneId
});

export const probeActivatesNearRope = (
  selection: RopeSelection | null,
  minimumConfidence = 0.08
): boolean => Boolean(selection && selection.confidence >= minimumConfidence);

export const chooseProbeMode = (
  dragging: boolean,
  hint: ProbeHint,
  confidence: number
): ProbeMode => {
  if (hint !== "none" && confidence >= 0.5) {
    return "suggest";
  }
  return dragging ? "grab" : "inspect";
};

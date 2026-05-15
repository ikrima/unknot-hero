import { CrossingOver } from "../knot/crossings";
import { CurveSample, Vec3, normalize3, sampleTrefoil, vec3 } from "../knot/curve";
import { createRopeStateFromSamples } from "../rope/ropeState";
import type { ProbeState, RopeState } from "../rope/ropeTypes";
import { inactiveProbe } from "../rope/ropeProbe";

export type ProjectionSource = "snap" | "drag";
export type CrossingFlipSource = "click" | "slash";
export type CrossingOverUnderState = CrossingOver;

export interface TraceEvent {
  step: number;
  kind: string;
  payload: Record<string, unknown>;
}

export interface KnotState {
  projectionNormal: Vec3;
  crossingOverrides: Record<string, CrossingOver>;
  rope: RopeState;
  probe: ProbeState;
  trace: TraceEvent[];
  nextTraceStep: number;
}

export const createEmptyState = (samples: CurveSample[] = sampleTrefoil(360)): KnotState => ({
  projectionNormal: normalize3(vec3(1, 1, 1)),
  crossingOverrides: {},
  rope: createRopeStateFromSamples(samples),
  probe: inactiveProbe(),
  trace: [],
  nextTraceStep: 0
});

import { Crossing, CrossingOver } from "../knot/crossings";
import { CurveSample, Vec3, formatVec3, normalize3 } from "../knot/curve";
import { updateGrabTarget, withGrabConstraint, withoutGrabConstraints } from "../rope/constraints";
import type { ProbeHint, ProbeState, RopeState, ViewportId } from "../rope/ropeTypes";
import { appendTraceEvent } from "./trace";
import { CrossingFlipSource, KnotState, ProjectionSource, createEmptyState } from "./state";

export type KnotAction =
  | {
      type: "projection/set";
      normal: Vec3;
      source: ProjectionSource;
      label?: string;
      trace: boolean;
    }
  | {
      type: "crossing/flip";
      crossing: Crossing;
      source: CrossingFlipSource;
      timestampMs: number;
    }
  | {
      type: "rope/grab-start";
      particleId: number;
      paneId: ViewportId;
      target: Vec3;
      timestampMs: number;
    }
  | {
      type: "rope/grab-move";
      particleId: number;
      paneId: ViewportId;
      target: Vec3;
      sampled: boolean;
      timestampMs: number;
    }
  | {
      type: "rope/grab-end";
      particleId: number;
      paneId: ViewportId;
      timestampMs: number;
    }
  | {
      type: "rope/set";
      rope: RopeState;
    }
  | {
      type: "probe/set";
      probe: ProbeState;
    }
  | {
      type: "layout-snap";
      hint: Exclude<ProbeHint, "flip" | "none">;
      confidence: number;
      timestampMs: number;
    }
  | {
      type: "trace/log";
      kind: string;
      payload: Record<string, unknown>;
    };

export const createInitialState = (samples?: CurveSample[]): KnotState => {
  const state = createEmptyState(samples);
  return appendTraceEvent(state, "session.init", {
    knot: "trefoil",
    projectionNormal: formatVec3(state.projectionNormal)
  });
};

export const reduceKnotState = (state: KnotState, action: KnotAction): KnotState => {
  switch (action.type) {
    case "projection/set": {
      const projectionNormal = normalize3(action.normal);
      const next = {
        ...state,
        projectionNormal
      };
      if (!action.trace) {
        return next;
      }
      return appendTraceEvent(next, `projection.${action.source}`, {
        label: action.label ?? action.source,
        normal: normalPayload(projectionNormal)
      });
    }
    case "crossing/flip":
      return flipCrossing(state, action.crossing, action.source, action.timestampMs);
    case "rope/grab-start":
      return appendTraceEvent(
        {
          ...state,
          rope: withGrabConstraint(state.rope, action.particleId, action.target)
        },
        "rope-grab-start",
        {
          particleId: action.particleId,
          paneId: action.paneId,
          timestampMs: traceTimestampMs(action.timestampMs)
        }
      );
    case "rope/grab-move": {
      const next = {
        ...state,
        rope: updateGrabTarget(state.rope, action.particleId, action.target)
      };
      if (!action.sampled) {
        return next;
      }
      return appendTraceEvent(next, "rope-grab-move", {
        particleId: action.particleId,
        paneId: action.paneId,
        target: normalPayload(action.target),
        sampled: true,
        timestampMs: traceTimestampMs(action.timestampMs)
      });
    }
    case "rope/grab-end":
      return appendTraceEvent(
        {
          ...state,
          rope: withoutGrabConstraints(state.rope)
        },
        "rope-grab-end",
        {
          particleId: action.particleId,
          paneId: action.paneId,
          timestampMs: traceTimestampMs(action.timestampMs)
        }
      );
    case "rope/set":
      return {
        ...state,
        rope: action.rope
      };
    case "probe/set":
      return {
        ...state,
        probe: action.probe
      };
    case "layout-snap":
      return appendTraceEvent(state, "layout-snap", {
        hint: action.hint,
        confidence: rounded(action.confidence),
        certified: false,
        timestampMs: traceTimestampMs(action.timestampMs)
      });
    case "trace/log":
      return appendTraceEvent(state, action.kind, action.payload);
    default:
      return state;
  }
};

export const flipCrossing = (
  state: KnotState,
  crossing: Crossing,
  source: CrossingFlipSource,
  timestampMs = 0
): KnotState => {
  const previous = crossing.over;
  const nextOver: CrossingOver = previous === "a" ? "b" : "a";
  const next = {
    ...state,
    crossingOverrides: {
      ...state.crossingOverrides,
      [crossing.id]: nextOver
    }
  };
  return appendTraceEvent(next, "crossing-flip", {
    crossingId: crossing.id,
    input: source,
    projectionNormal: normalPayload(state.projectionNormal),
    before: previous,
    after: nextOver,
    segmentA: crossing.segmentA,
    segmentB: crossing.segmentB,
    timestampMs: traceTimestampMs(timestampMs)
  });
};

const rounded = (value: number): number => Number(value.toFixed(4));

const traceTimestampMs = (timestampMs: number): number => Math.max(0, Math.round(timestampMs));

const normalPayload = (normalInput: Vec3): number[] => [
  rounded(normalInput.x),
  rounded(normalInput.y),
  rounded(normalInput.z)
];

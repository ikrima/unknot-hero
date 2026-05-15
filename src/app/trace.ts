import { KnotState, TraceEvent } from "./state";

export const createTraceEvent = (
  step: number,
  kind: string,
  payload: Record<string, unknown>
): TraceEvent => ({
  step,
  kind,
  payload
});

export const appendTraceEvent = (
  state: KnotState,
  kind: string,
  payload: Record<string, unknown>
): KnotState => ({
  ...state,
  trace: [...state.trace, createTraceEvent(state.nextTraceStep, kind, payload)],
  nextTraceStep: state.nextTraceStep + 1
});

export { buildExportDocument } from "./exportState";

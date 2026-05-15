import type { KnotDiagram } from "../knot/crossings";
import type { CurveSample, Vec2, Vec3 } from "../knot/curve";
import { summarizeRopeConstraints } from "../rope/constraints";
import type { ProbeState, RopeState } from "../rope/ropeTypes";
import type { KnotState } from "./state";

export const buildExportDocument = (
  samples: CurveSample[],
  projection: KnotDiagram,
  state: KnotState
): Record<string, unknown> => ({
  schema: "knot-hero/direct-rope-v0",
  encoding: "edn-shaped-json",
  "app/version": "0.1.0",
  "knot/id": "trefoil-parametric-v0",
  "knot/kind": "trefoil",
  "knot/sample-count": samples.length,
  "projection/normal": vec3Payload(projection.normal),
  "projection/basis": {
    u: vec3Payload(projection.basis.u),
    v: vec3Payload(projection.basis.v)
  },
  "rope/particles": serializeRopeParticles(state.rope),
  "rope/constraints": summarizeRopeConstraints(state.rope),
  "crossings/items": projection.crossings.map((crossing) => ({
    id: crossing.id,
    point: vec2Payload(crossing.point),
    segments: [crossing.segmentA, crossing.segmentB],
    parameters: [rounded(crossing.tA), rounded(crossing.tB)],
    depths: [rounded(crossing.depthA), rounded(crossing.depthB)],
    naturalOver: crossing.naturalOver,
    over: crossing.over,
    flipped: crossing.flipped
  })),
  "probe/state": serializeProbe(state.probe),
  "trace/events": state.trace
});

const serializeRopeParticles = (rope: RopeState): Record<string, unknown>[] =>
  rope.particles.map((particle) => ({
    id: particle.id,
    p: vec3Payload(particle.p),
    prev: vec3Payload(particle.prev),
    invMass: rounded(particle.invMass),
    pinned: Boolean(particle.pinned)
  }));

const serializeProbe = (probe: ProbeState): Record<string, unknown> => ({
  active: probe.active,
  screen: [rounded(probe.screenX), rounded(probe.screenY)],
  nearestParticleId: probe.nearestParticleId,
  nearestSegmentId: probe.nearestSegmentId,
  mode: probe.mode,
  hint: probe.hint ?? "none",
  confidence: rounded(probe.confidence ?? 0),
  paneId: probe.paneId
});

const vec2Payload = (value: Vec2): number[] => [rounded(value.x), rounded(value.y)];
const vec3Payload = (value: Vec3): number[] => [rounded(value.x), rounded(value.y), rounded(value.z)];
const rounded = (value: number): number => Number(value.toFixed(6));

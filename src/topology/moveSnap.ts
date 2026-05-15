import { add3, lerp3, scale3 } from "../knot/curve";
import { cloneVec3 } from "../rope/constraints";
import { cloneRopeState } from "../rope/ropeState";
import type { RopeState } from "../rope/ropeTypes";
import type { NearMoveCandidate } from "./nearMoves";

export interface LayoutSnapResult {
  rope: RopeState;
  applied: boolean;
}

export const shouldApplyLayoutSnap = (candidate: NearMoveCandidate | null): boolean =>
  Boolean(candidate && candidate.confidence >= 0.88 && candidate.hint !== "r3");

export const applyLayoutSnap = (
  rope: RopeState,
  candidate: NearMoveCandidate | null
): LayoutSnapResult => {
  if (!shouldApplyLayoutSnap(candidate) || candidate?.particleId === undefined) {
    return { rope, applied: false };
  }

  const next = cloneRopeState(rope);
  const count = next.particles.length;
  const center = candidate.particleId;
  for (let offset = -3; offset <= 3; offset += 1) {
    const id = (center + offset + count) % count;
    const before = next.particles[(id - 1 + count) % count];
    const particle = next.particles[id];
    const after = next.particles[(id + 1) % count];
    const midpoint = scale3(add3(before.p, after.p), 0.5);
    particle.p = lerp3(particle.p, midpoint, 0.28);
    particle.prev = cloneVec3(particle.p);
  }

  return { rope: next, applied: true };
};

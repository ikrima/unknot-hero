import type { Crossing, KnotDiagram } from "../knot/crossings";
import { Vec2, distance2, distance3, dot3, length3, normalize3, sub3 } from "../knot/curve";
import { localParticleIds } from "../rope/ropeSelection";
import type { ProbeHint, RopeState } from "../rope/ropeTypes";

export interface NearMoveCandidate {
  hint: Exclude<ProbeHint, "flip" | "none">;
  confidence: number;
  certified: false;
  particleId?: number;
  crossingIds?: string[];
  reason: string;
}

export interface NearMoveQuery {
  rope: RopeState;
  diagram: KnotDiagram;
  particleId?: number;
}

export const detectNearMoveCandidates = (query: NearMoveQuery): NearMoveCandidate[] => {
  const candidates = [
    detectR1Candidate(query),
    detectR2Candidate(query),
    detectR3Candidate(query)
  ].filter((candidate): candidate is NearMoveCandidate => Boolean(candidate));

  return candidates.sort((a, b) => b.confidence - a.confidence);
};

export const strongestNearMoveCandidate = (query: NearMoveQuery): NearMoveCandidate | null =>
  detectNearMoveCandidates(query)[0] ?? null;

const detectR1Candidate = ({ rope, diagram, particleId }: NearMoveQuery): NearMoveCandidate | null => {
  if (particleId === undefined || rope.particles.length < 12) {
    return null;
  }

  const count = rope.particles.length;
  const center = rope.particles[particleId];
  const before = rope.particles[(particleId - 4 + count) % count];
  const after = rope.particles[(particleId + 4) % count];
  if (!center || !before || !after) {
    return null;
  }

  const incoming = normalize3(sub3(center.p, before.p));
  const outgoing = normalize3(sub3(after.p, center.p));
  const turn = Math.max(0, Math.min(1, (1 - dot3(incoming, outgoing)) * 0.5));
  const window = localParticleIds(count, particleId, 5);
  const arcLength = window.reduce((total, id, index) => {
    if (index === 0) {
      return total;
    }
    return total + distance3(rope.particles[window[index - 1]].p, rope.particles[id].p);
  }, 0);
  const chord = distance3(rope.particles[window[0]].p, rope.particles[window[window.length - 1]].p);
  const curl = arcLength > 1e-6 ? Math.max(0, Math.min(1, 1 - chord / arcLength)) : 0;
  const approach = nearestExternalProjectedApproach(diagram, particleId, 8);
  const confidence = clamp01(turn * 0.42 + curl * 0.38 + approach * 0.2);

  return confidence >= 0.34
    ? {
        hint: "r1",
        confidence,
        certified: false,
        particleId,
        reason: "short high-curvature arc with local self-approach"
      }
    : null;
};

const detectR2Candidate = ({ diagram, particleId }: NearMoveQuery): NearMoveCandidate | null => {
  if (diagram.crossings.length < 2) {
    return null;
  }

  let best:
    | {
        a: Crossing;
        b: Crossing;
        confidence: number;
      }
    | null = null;

  for (let i = 0; i < diagram.crossings.length; i += 1) {
    for (let j = i + 1; j < diagram.crossings.length; j += 1) {
      const a = diagram.crossings[i];
      const b = diagram.crossings[j];
      if (particleId !== undefined && !crossingNearParticle(a, particleId, diagram.points.length, 18)) {
        if (!crossingNearParticle(b, particleId, diagram.points.length, 18)) {
          continue;
        }
      }

      const d = distance2(a.point, b.point);
      const closeScore = clamp01(1 - d / 0.78);
      const pairedScore = sharedStrandScore(a, b, diagram.points.length);
      const oppositeScore = a.over === b.over ? 0.35 : 0.7;
      const confidence = clamp01(closeScore * 0.54 + pairedScore * 0.31 + oppositeScore * 0.15);
      if (!best || confidence > best.confidence) {
        best = { a, b, confidence };
      }
    }
  }

  return best && best.confidence >= 0.42
    ? {
        hint: "r2",
        confidence: best.confidence,
        certified: false,
        particleId,
        crossingIds: [best.a.id, best.b.id],
        reason: "nearby paired crossings form a gate-like region"
      }
    : null;
};

const detectR3Candidate = ({ diagram }: NearMoveQuery): NearMoveCandidate | null => {
  if (diagram.crossings.length < 3) {
    return null;
  }

  let best: { crossings: Crossing[]; confidence: number } | null = null;
  for (let i = 0; i < diagram.crossings.length; i += 1) {
    for (let j = i + 1; j < diagram.crossings.length; j += 1) {
      for (let k = j + 1; k < diagram.crossings.length; k += 1) {
        const crossings = [diagram.crossings[i], diagram.crossings[j], diagram.crossings[k]];
        const area = triangleArea(crossings[0].point, crossings[1].point, crossings[2].point);
        const perimeter =
          distance2(crossings[0].point, crossings[1].point) +
          distance2(crossings[1].point, crossings[2].point) +
          distance2(crossings[2].point, crossings[0].point);
        const compact = clamp01(1 - perimeter / 2.4);
        const nonCollinear = clamp01(area / 0.08);
        const confidence = clamp01(compact * 0.72 + nonCollinear * 0.28) * 0.72;
        if (!best || confidence > best.confidence) {
          best = { crossings, confidence };
        }
      }
    }
  }

  return best && best.confidence >= 0.5
    ? {
        hint: "r3",
        confidence: best.confidence,
        certified: false,
        crossingIds: best.crossings.map((crossing) => crossing.id),
        reason: "three crossings form a compact triangular chamber"
      }
    : null;
};

const nearestExternalProjectedApproach = (
  diagram: KnotDiagram,
  particleId: number,
  excludedRadius: number
): number => {
  const center = diagram.points[particleId]?.point;
  if (!center) {
    return 0;
  }
  let nearest = Number.POSITIVE_INFINITY;
  diagram.points.forEach((point, index) => {
    const wrapped = circularDistance(index, particleId, diagram.points.length);
    if (wrapped <= excludedRadius) {
      return;
    }
    nearest = Math.min(nearest, distance2(center, point.point));
  });
  return Number.isFinite(nearest) ? clamp01(1 - nearest / 0.48) : 0;
};

const crossingNearParticle = (
  crossing: Crossing,
  particleId: number,
  count: number,
  radius: number
): boolean =>
  circularDistance(crossing.segmentA, particleId, count) <= radius ||
  circularDistance(crossing.segmentB, particleId, count) <= radius;

const sharedStrandScore = (a: Crossing, b: Crossing, count: number): number => {
  const distances = [
    circularDistance(a.segmentA, b.segmentA, count),
    circularDistance(a.segmentA, b.segmentB, count),
    circularDistance(a.segmentB, b.segmentA, count),
    circularDistance(a.segmentB, b.segmentB, count)
  ];
  return clamp01(1 - Math.min(...distances) / 22);
};

const circularDistance = (a: number, b: number, count: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, count - d);
};

const triangleArea = (a: Vec2, b: Vec2, c: Vec2): number =>
  Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) * 0.5);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

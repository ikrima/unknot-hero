import { Vec2, Vec3, cross2, lerp, lerp2, sub2 } from "./curve";
import { ProjectedCurve, ProjectedSample, projectCurve } from "./projection";
import { CurveSample, TrefoilSample } from "./curve";

export type CrossingOver = "a" | "b";
export type CrossingOverrides = Record<string, CrossingOver>;

export interface SegmentHit {
  t: number;
  u: number;
  point: Vec2;
}

export interface Crossing {
  id: string;
  point: Vec2;
  segmentA: number;
  segmentB: number;
  tA: number;
  tB: number;
  depthA: number;
  depthB: number;
  naturalOver: CrossingOver;
  over: CrossingOver;
  flipped: boolean;
}

export interface KnotDiagram extends ProjectedCurve {
  crossings: Crossing[];
}

export const projectTrefoilDiagram = (
  samples: TrefoilSample[],
  normalInput: Vec3,
  overrides: CrossingOverrides
): KnotDiagram => projectCurveDiagram(samples, normalInput, overrides);

export const projectCurveDiagram = (
  samples: CurveSample[],
  normalInput: Vec3,
  overrides: CrossingOverrides
): KnotDiagram => {
  const projected = projectCurve(samples, normalInput);
  return {
    ...projected,
    crossings: detectCrossings(projected.points, overrides)
  };
};

export const segmentIntersection = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): SegmentHit | null => {
  const r = sub2(b, a);
  const s = sub2(d, c);
  const denominator = cross2(r, s);
  if (Math.abs(denominator) < 1e-8) {
    return null;
  }

  const cMinusA = sub2(c, a);
  const t = cross2(cMinusA, s) / denominator;
  const u = cross2(cMinusA, r) / denominator;
  const endpointMargin = 0.025;
  if (t <= endpointMargin || t >= 1 - endpointMargin || u <= endpointMargin || u >= 1 - endpointMargin) {
    return null;
  }

  return {
    t,
    u,
    point: lerp2(a, b, t)
  };
};

export const detectCrossings = (
  points: ProjectedSample[],
  overrides: CrossingOverrides = {}
): Crossing[] => {
  const crossings: Crossing[] = [];
  const count = points.length;

  for (let segmentA = 0; segmentA < count; segmentA += 1) {
    const a0 = points[segmentA];
    const a1 = points[(segmentA + 1) % count];

    for (let segmentB = segmentA + 1; segmentB < count; segmentB += 1) {
      if (areAdjacentSegments(segmentA, segmentB, count)) {
        continue;
      }

      const b0 = points[segmentB];
      const b1 = points[(segmentB + 1) % count];
      const hit = segmentIntersection(a0.point, a1.point, b0.point, b1.point);
      if (!hit) {
        continue;
      }

      const depthA = lerp(a0.depth, a1.depth, hit.t);
      const depthB = lerp(b0.depth, b1.depth, hit.u);
      const naturalOver = depthA >= depthB ? "a" : "b";
      const id = `x-${segmentA}-${segmentB}`;
      const over = overrides[id] ?? naturalOver;
      crossings.push({
        id,
        point: hit.point,
        segmentA,
        segmentB,
        tA: hit.t,
        tB: hit.u,
        depthA,
        depthB,
        naturalOver,
        over,
        flipped: over !== naturalOver
      });
    }
  }

  return crossings.sort((a, b) => a.segmentA - b.segmentA || a.segmentB - b.segmentB);
};

const areAdjacentSegments = (a: number, b: number, count: number): boolean => {
  const distance = Math.abs(a - b);
  return Math.min(distance, count - distance) <= 2;
};

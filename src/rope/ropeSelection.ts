import { Vec2, distance2, lerp2, vec2 } from "../knot/curve";
import type { ProbeHint, ViewportId } from "./ropeTypes";

export interface RopeScreenPoint {
  particleId: number;
  point: Vec2;
  depth?: number;
}

export interface RopeSelection {
  particleId: number;
  segmentId: number;
  segmentT: number;
  distancePx: number;
  confidence: number;
  point: Vec2;
}

export interface RopeSelectionHighlight extends RopeSelection {
  paneId: ViewportId;
  active: boolean;
  hint?: ProbeHint;
}

export const nearestRopeSelection = (
  points: RopeScreenPoint[],
  screenPoint: Vec2,
  thresholdPx = 22
): RopeSelection | null => {
  if (points.length < 2) {
    return null;
  }

  let best:
    | {
        segmentId: number;
        segmentT: number;
        distancePx: number;
        point: Vec2;
      }
    | null = null;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index].point;
    const end = points[(index + 1) % points.length].point;
    const closest = closestPointOnSegment(screenPoint, start, end);
    const distancePx = distance2(screenPoint, closest.point);
    if (!best || distancePx < best.distancePx) {
      best = {
        segmentId: index,
        segmentT: closest.t,
        distancePx,
        point: closest.point
      };
    }
  }

  if (!best || best.distancePx > thresholdPx) {
    return null;
  }

  const nextIndex = (best.segmentId + 1) % points.length;
  const particleId = best.segmentT < 0.5 ? points[best.segmentId].particleId : points[nextIndex].particleId;
  return {
    ...best,
    particleId,
    confidence: Math.max(0, Math.min(1, 1 - best.distancePx / thresholdPx))
  };
};

export const closestPointOnSegment = (
  point: Vec2,
  start: Vec2,
  end: Vec2
): { point: Vec2; t: number } => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-8) {
    return { point: start, t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return {
    point: lerp2(start, end, t),
    t
  };
};

export const localParticleIds = (count: number, centerId: number, radius: number): number[] => {
  if (count <= 0) {
    return [];
  }
  const ids: number[] = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    ids.push((centerId + offset + count) % count);
  }
  return ids;
};

export const emptyScreenPoint = (): Vec2 => vec2(0, 0);

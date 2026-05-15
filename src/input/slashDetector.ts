import { Crossing } from "../knot/crossings";
import { Vec2, distance2, vec2 } from "../knot/curve";

export interface CrossingMarker {
  crossing: Crossing;
  center: Vec2;
  radius: number;
}

export const hitCrossingMarker = (
  markers: CrossingMarker[],
  screenPoint: Vec2,
  radius = 15
): Crossing | null => {
  let closest: CrossingMarker | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const marker of markers) {
    const d = distance2(screenPoint, marker.center);
    if (d <= radius && d < closestDistance) {
      closest = marker;
      closestDistance = d;
    }
  }

  return closest?.crossing ?? null;
};

export const crossingsAlongSlashSegment = (
  markers: CrossingMarker[],
  start: Vec2,
  end: Vec2,
  consumedIds: Set<string>,
  radius = 13
): Crossing[] => {
  return markers
    .filter((marker) => !consumedIds.has(marker.crossing.id))
    .map((marker) => ({
      marker,
      distance: pointToSegmentDistance(marker.center, start, end)
    }))
    .filter((hit) => hit.distance <= Math.max(radius, hit.marker.radius))
    .sort((a, b) => a.distance - b.distance)
    .map((hit) => hit.marker.crossing);
};

export const pointToSegmentDistance = (point: Vec2, start: Vec2, end: Vec2): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLengthSquared = dx * dx + dy * dy;
  if (segmentLengthSquared === 0) {
    return distance2(point, start);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / segmentLengthSquared));
  return distance2(point, vec2(start.x + dx * t, start.y + dy * t));
};

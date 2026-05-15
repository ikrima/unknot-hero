import { CurveSample, Vec2, Vec3, cross3, dot3, normalize3, vec2, vec3 } from "./curve";

export interface ProjectionBasis {
  u: Vec3;
  v: Vec3;
}

export interface ProjectedSample {
  sample: CurveSample;
  point: Vec2;
  depth: number;
}

export interface ProjectionBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ProjectedCurve {
  normal: Vec3;
  basis: ProjectionBasis;
  points: ProjectedSample[];
  bounds: ProjectionBounds;
}

export const projectionBasis = (normalInput: Vec3): ProjectionBasis => {
  const n = normalize3(normalInput);
  const seed = Math.abs(n.z) < 0.92 ? vec3(0, 0, 1) : vec3(0, 1, 0);
  const u = normalize3(cross3(seed, n));
  const v = normalize3(cross3(n, u));
  return { u, v };
};

export const projectPoint = (point: Vec3, basis: ProjectionBasis): Vec2 => {
  return vec2(dot3(point, basis.u), dot3(point, basis.v));
};

export const projectCurve = (samples: CurveSample[], normalInput: Vec3): ProjectedCurve => {
  const normal = normalize3(normalInput);
  const basis = projectionBasis(normal);
  const points = samples.map((sample) => ({
    sample,
    point: projectPoint(sample.position, basis),
    depth: dot3(sample.position, normal)
  }));

  return {
    normal,
    basis,
    points,
    bounds: measureBounds(points)
  };
};

export const measureBounds = (points: ProjectedSample[]): ProjectionBounds => {
  return points.reduce(
    (bounds, projected) => ({
      minX: Math.min(bounds.minX, projected.point.x),
      maxX: Math.max(bounds.maxX, projected.point.x),
      minY: Math.min(bounds.minY, projected.point.y),
      maxY: Math.max(bounds.maxY, projected.point.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
};

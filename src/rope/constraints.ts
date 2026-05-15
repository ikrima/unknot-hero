import { Vec3, distance3, vec3 } from "../knot/curve";
import type { RopeConstraint, RopeState } from "./ropeTypes";

export interface RopeConstraintSummary {
  distance: number;
  bend: number;
  grab: number;
}

export const createClosedDistanceConstraints = (
  points: Vec3[],
  stiffness = 0.82
): RopeConstraint[] => {
  const count = points.length;
  return points.map((point, index) => ({
    type: "distance" as const,
    a: index,
    b: (index + 1) % count,
    restLength: distance3(point, points[(index + 1) % count]),
    stiffness
  }));
};

export const createClosedBendConstraints = (
  count: number,
  stiffness = 0.018
): RopeConstraint[] =>
  Array.from({ length: count }, (_, index) => ({
    type: "bend" as const,
    a: (index - 1 + count) % count,
    b: index,
    c: (index + 1) % count,
    stiffness
  }));

export const createStructuralConstraints = (
  points: Vec3[],
  distanceStiffness = 0.82,
  bendStiffness = 0.018
): RopeConstraint[] => [
  ...createClosedDistanceConstraints(points, distanceStiffness),
  ...createClosedBendConstraints(points.length, bendStiffness)
];

export const withGrabConstraint = (
  rope: RopeState,
  particle: number,
  target: Vec3,
  stiffness = 0.92
): RopeState => ({
  ...rope,
  constraints: [
    ...rope.constraints.filter((constraint) => constraint.type !== "grab"),
    { type: "grab", particle, target: cloneVec3(target), stiffness }
  ]
});

export const updateGrabTarget = (rope: RopeState, particle: number, target: Vec3): RopeState => ({
  ...rope,
  constraints: rope.constraints.map((constraint) =>
    constraint.type === "grab" && constraint.particle === particle
      ? { ...constraint, target: cloneVec3(target) }
      : constraint
  )
});

export const withoutGrabConstraints = (rope: RopeState): RopeState => ({
  ...rope,
  constraints: rope.constraints.filter((constraint) => constraint.type !== "grab")
});

export const hasGrabConstraint = (rope: RopeState): boolean =>
  rope.constraints.some((constraint) => constraint.type === "grab");

export const summarizeRopeConstraints = (rope: RopeState): RopeConstraintSummary =>
  rope.constraints.reduce(
    (summary, constraint) => ({
      ...summary,
      [constraint.type]: summary[constraint.type] + 1
    }),
    { distance: 0, bend: 0, grab: 0 }
  );

export const cloneVec3 = (value: Vec3): Vec3 => vec3(value.x, value.y, value.z);

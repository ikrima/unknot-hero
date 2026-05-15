import type { CurveSample, Vec3 } from "../knot/curve";
import { vec3 } from "../knot/curve";
import { cloneVec3, createStructuralConstraints } from "./constraints";
import type { RopeParticle, RopeState } from "./ropeTypes";

export interface RopeStateOptions {
  solverIterations?: number;
  distanceStiffness?: number;
  bendStiffness?: number;
}

export const createRopeStateFromSamples = (
  samples: CurveSample[],
  options: RopeStateOptions = {}
): RopeState => createRopeStateFromPoints(samples.map((sample) => sample.position), options);

export const createRopeStateFromPoints = (
  points: Vec3[],
  options: RopeStateOptions = {}
): RopeState => {
  if (points.length < 4) {
    throw new Error("A closed rope needs at least four particles.");
  }

  const particles: RopeParticle[] = points.map((point, index) => ({
    id: index,
    p: cloneVec3(point),
    prev: cloneVec3(point),
    invMass: 1
  }));

  return {
    particles,
    constraints: createStructuralConstraints(
      points,
      options.distanceStiffness ?? 0.82,
      options.bendStiffness ?? 0.018
    ),
    closed: true,
    solverIterations: options.solverIterations ?? 7
  };
};

export const cloneRopeState = (rope: RopeState): RopeState => ({
  ...rope,
  particles: rope.particles.map((particle) => ({
    ...particle,
    p: cloneVec3(particle.p),
    prev: cloneVec3(particle.prev)
  })),
  constraints: rope.constraints.map((constraint) =>
    constraint.type === "grab" ? { ...constraint, target: cloneVec3(constraint.target) } : { ...constraint }
  )
});

export const zeroRopeVelocity = (rope: RopeState): RopeState => ({
  ...rope,
  particles: rope.particles.map((particle) => ({
    ...particle,
    prev: cloneVec3(particle.p)
  }))
});

export const particlePositionOrOrigin = (rope: RopeState, particleId: number): Vec3 => {
  const particle = rope.particles[particleId];
  return particle ? particle.p : vec3(0, 0, 0);
};

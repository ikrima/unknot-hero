import { Vec3, add3, lerp3, length3, scale3, sub3 } from "../knot/curve";
import { cloneVec3 } from "./constraints";
import { cloneRopeState } from "./ropeState";
import type { RopeConstraint, RopeParticle, RopeState } from "./ropeTypes";

export interface RopeSolverOptions {
  dt?: number;
  damping?: number;
  maxParticleStep?: number;
}

export const solveRope = (
  rope: RopeState,
  options: RopeSolverOptions = {}
): RopeState => {
  const next = cloneRopeState(rope);
  const damping = options.damping ?? 0.965;
  const dtScale = Math.max(0.2, Math.min(1.8, (options.dt ?? 1 / 60) * 60));
  const maxParticleStep = options.maxParticleStep ?? 0.18;
  const grabbedParticles = new Set(
    next.constraints
      .filter((constraint): constraint is Extract<RopeConstraint, { type: "grab" }> => constraint.type === "grab")
      .map((constraint) => constraint.particle)
  );

  next.particles.forEach((particle) => {
    if (particle.pinned || particle.invMass === 0 || grabbedParticles.has(particle.id)) {
      particle.prev = cloneVec3(particle.p);
      return;
    }
    const velocity = scale3(sub3(particle.p, particle.prev), damping * dtScale);
    particle.prev = cloneVec3(particle.p);
    particle.p = add3(particle.p, clampStep(velocity, maxParticleStep));
  });

  const iterations = Math.max(1, next.solverIterations);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    next.constraints.forEach((constraint) => {
      if (constraint.type === "distance") {
        projectDistance(next.particles, constraint);
      } else if (constraint.type === "bend") {
        projectBend(next.particles, constraint);
      } else {
        projectGrab(next.particles, constraint);
      }
    });
  }

  next.particles.forEach((particle) => {
    if (!isFiniteVec3(particle.p)) {
      particle.p = cloneVec3(particle.prev);
    }
  });

  return next;
};

const projectDistance = (
  particles: RopeParticle[],
  constraint: Extract<RopeConstraint, { type: "distance" }>
): void => {
  const a = particles[constraint.a];
  const b = particles[constraint.b];
  if (!a || !b) {
    return;
  }

  const delta = sub3(b.p, a.p);
  const length = length3(delta);
  if (length < 1e-7) {
    return;
  }

  const wA = a.pinned ? 0 : a.invMass;
  const wB = b.pinned ? 0 : b.invMass;
  const weight = wA + wB;
  if (weight <= 0) {
    return;
  }

  const correction = scale3(delta, ((length - constraint.restLength) / length) * constraint.stiffness);
  if (wA > 0) {
    a.p = add3(a.p, scale3(correction, wA / weight));
  }
  if (wB > 0) {
    b.p = sub3(b.p, scale3(correction, wB / weight));
  }
};

const projectBend = (
  particles: RopeParticle[],
  constraint: Extract<RopeConstraint, { type: "bend" }>
): void => {
  const a = particles[constraint.a];
  const b = particles[constraint.b];
  const c = particles[constraint.c];
  if (!a || !b || !c || b.pinned || b.invMass === 0) {
    return;
  }

  const midpoint = scale3(add3(a.p, c.p), 0.5);
  b.p = lerp3(b.p, midpoint, constraint.stiffness * b.invMass);
};

const projectGrab = (
  particles: RopeParticle[],
  constraint: Extract<RopeConstraint, { type: "grab" }>
): void => {
  const particle = particles[constraint.particle];
  if (!particle || particle.pinned || particle.invMass === 0) {
    return;
  }
  particle.p = lerp3(particle.p, constraint.target, constraint.stiffness);
  particle.prev = cloneVec3(particle.p);
};

const clampStep = (step: Vec3, maxLength: number): Vec3 => {
  const length = length3(step);
  if (length <= maxLength || length < 1e-7) {
    return step;
  }
  return scale3(step, maxLength / length);
};

const isFiniteVec3 = (value: Vec3): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

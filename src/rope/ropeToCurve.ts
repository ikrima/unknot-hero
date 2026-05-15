import type { CurveSample } from "../knot/curve";
import { cloneVec3 } from "./constraints";
import type { RopeState } from "./ropeTypes";

export const ropeToCurveSamples = (rope: RopeState): CurveSample[] => {
  const count = rope.particles.length;
  return rope.particles.map((particle, index) => ({
    index: particle.id,
    t: count > 0 ? (index / count) * Math.PI * 2 : 0,
    position: cloneVec3(particle.p)
  }));
};

import type { Vec3 } from "../knot/curve";

export type ViewportId = "perspective" | "diagram" | "top" | "front";

export type ProbeMode = "inspect" | "grab" | "suggest" | "commit";
export type ProbeHint = "r1" | "r2" | "r3" | "flip" | "none";

export type RopeParticle = {
  id: number;
  p: Vec3;
  prev: Vec3;
  invMass: number;
  pinned?: boolean;
};

export type RopeConstraint =
  | { type: "distance"; a: number; b: number; restLength: number; stiffness: number }
  | { type: "bend"; a: number; b: number; c: number; stiffness: number }
  | { type: "grab"; particle: number; target: Vec3; stiffness: number };

export type RopeState = {
  particles: RopeParticle[];
  constraints: RopeConstraint[];
  closed: true;
  solverIterations: number;
};

export type ProbeState = {
  active: boolean;
  screenX: number;
  screenY: number;
  nearestParticleId?: number;
  nearestSegmentId?: number;
  mode: ProbeMode;
  hint?: ProbeHint;
  confidence?: number;
  paneId?: ViewportId;
};

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CurveSample {
  index: number;
  t: number;
  position: Vec3;
}

export interface TrefoilSample extends CurveSample {}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add2 = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);
export const sub2 = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);
export const scale2 = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s);
export const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length2 = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance2 = (a: Vec2, b: Vec2): number => length2(sub2(a, b));
export const normalize2 = (a: Vec2): Vec2 => {
  const len = length2(a);
  return len === 0 ? vec2(0, 0) : scale2(a, 1 / len);
};

export const add3 = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const distance3 = (a: Vec3, b: Vec3): number => length3(sub3(a, b));
export const normalize3 = (a: Vec3): Vec3 => {
  const len = length3(a);
  return len === 0 ? vec3(0, 0, 1) : scale3(a, 1 / len);
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  vec3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

export const rotateAroundAxis = (point: Vec3, axis: Vec3, radians: number): Vec3 => {
  const k = normalize3(axis);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const termA = scale3(point, cos);
  const termB = scale3(cross3(k, point), sin);
  const termC = scale3(k, dot3(k, point) * (1 - cos));
  return add3(add3(termA, termB), termC);
};

export const trefoilAt = (t: number): Vec3 => {
  const x = Math.sin(t) + 2 * Math.sin(2 * t);
  const y = Math.cos(t) - 2 * Math.cos(2 * t);
  const z = -Math.sin(3 * t);
  return vec3(x, y, z);
};

export const sampleTrefoil = (count: number): TrefoilSample[] => {
  return Array.from({ length: count }, (_, index) => {
    const t = (index / count) * Math.PI * 2;
    return {
      index,
      t,
      position: trefoilAt(t)
    };
  });
};

export const formatVec3 = (v: Vec3): string => `[${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}]`;

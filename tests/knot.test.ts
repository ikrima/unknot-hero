import { describe, expect, it } from "vitest";
import { flipCrossing, reduceKnotState } from "../src/app/actions";
import { buildExportDocument } from "../src/app/exportState";
import { createEmptyState } from "../src/app/state";
import { appendTraceEvent } from "../src/app/trace";
import { projectCurveDiagram, segmentIntersection } from "../src/knot/crossings";
import type { Crossing } from "../src/knot/crossings";
import { distance3, dot3, length3, normalize3, sampleTrefoil, vec2, vec3 } from "../src/knot/curve";
import { projectCurve, projectionBasis } from "../src/knot/projection";
import { createClosedDistanceConstraints, withGrabConstraint } from "../src/rope/constraints";
import { createProbeState, probeActivatesNearRope } from "../src/rope/ropeProbe";
import { nearestRopeSelection } from "../src/rope/ropeSelection";
import { solveRope } from "../src/rope/ropeSolver";
import { createRopeStateFromPoints, createRopeStateFromSamples } from "../src/rope/ropeState";
import { ropeToCurveSamples } from "../src/rope/ropeToCurve";

const closeTo = (actual: number, expected: number, precision = 6): void => {
  expect(actual).toBeCloseTo(expected, precision);
};

describe("projection math", () => {
  it("builds an orthonormal projection basis", () => {
    const normal = normalize3(vec3(1, 2, 3));
    const basis = projectionBasis(normal);

    closeTo(length3(basis.u), 1);
    closeTo(length3(basis.v), 1);
    closeTo(dot3(basis.u, basis.v), 0);
    closeTo(dot3(basis.u, normal), 0);
    closeTo(dot3(basis.v, normal), 0);
  });

  it("projects trefoil samples into non-empty 2D samples", () => {
    const samples = sampleTrefoil(48);
    const projected = projectCurve(samples, vec3(1, 1, 1));

    expect(projected.points).toHaveLength(samples.length);
    expect(projected.points.length).toBeGreaterThan(0);
    expect(projected.points.every((point) => Number.isFinite(point.point.x) && Number.isFinite(point.point.y))).toBe(
      true
    );
  });
});

describe("crossing detection primitives", () => {
  it("detects a known segment crossing", () => {
    const hit = segmentIntersection(vec2(0, 0), vec2(2, 2), vec2(0, 2), vec2(2, 0));

    expect(hit).not.toBeNull();
    closeTo(hit?.point.x ?? 0, 1);
    closeTo(hit?.point.y ?? 0, 1);
    closeTo(hit?.t ?? 0, 0.5);
    closeTo(hit?.u ?? 0, 0.5);
  });
});

describe("rope state and solver", () => {
  it("initializes trefoil samples as a closed rope loop", () => {
    const samples = sampleTrefoil(64);
    const rope = createRopeStateFromSamples(samples);
    const distanceConstraints = rope.constraints.filter((constraint) => constraint.type === "distance");

    expect(rope.closed).toBe(true);
    expect(rope.particles).toHaveLength(samples.length);
    expect(distanceConstraints).toHaveLength(samples.length);
    expect(distanceConstraints.at(-1)).toMatchObject({
      a: samples.length - 1,
      b: 0
    });
  });

  it("distance projection approximately preserves rest length", () => {
    const rope = createRopeStateFromPoints([vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(0, 1, 0)], {
      solverIterations: 10,
      bendStiffness: 0
    });
    const stretched = {
      ...rope,
      particles: rope.particles.map((particle, index) =>
        index === 1 ? { ...particle, p: vec3(1.8, 0, 0) } : particle
      )
    };
    const solved = solveRope(stretched, { dt: 1 / 60 });
    const constraints = createClosedDistanceConstraints([vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(0, 1, 0)]);
    const firstLength = distance3(solved.particles[0].p, solved.particles[1].p);

    expect(Math.abs(firstLength - constraints[0].restLength)).toBeLessThan(0.22);
  });

  it("grab constraint pulls a particle toward the target without opening the loop", () => {
    const rope = createRopeStateFromSamples(sampleTrefoil(48));
    const grabbed = withGrabConstraint(rope, 7, vec3(2, 2, 1), 1);
    const solved = solveRope(grabbed, { dt: 1 / 60 });

    expect(distance3(solved.particles[7].p, vec3(2, 2, 1))).toBeLessThan(0.08);
    expect(solved.constraints.filter((constraint) => constraint.type === "distance")).toHaveLength(48);
  });
});

describe("rope selection and probe", () => {
  it("returns a plausible nearest segment and particle", () => {
    const selection = nearestRopeSelection(
      [
        { particleId: 0, point: vec2(0, 0) },
        { particleId: 1, point: vec2(10, 0) },
        { particleId: 2, point: vec2(10, 10) },
        { particleId: 3, point: vec2(0, 10) }
      ],
      vec2(4, 2),
      8
    );

    expect(selection).not.toBeNull();
    expect(selection?.segmentId).toBe(0);
    expect(selection?.particleId).toBe(0);
  });

  it("activates probe state near rope", () => {
    const selection = nearestRopeSelection(
      [
        { particleId: 0, point: vec2(0, 0) },
        { particleId: 1, point: vec2(12, 0) },
        { particleId: 2, point: vec2(12, 12) },
        { particleId: 3, point: vec2(0, 12) }
      ],
      vec2(5, 1),
      8
    );

    expect(probeActivatesNearRope(selection)).toBe(true);
    const probe = createProbeState(selection!, vec2(50, 60), "inspect", "none", selection!.confidence, "diagram");
    expect(probe.active).toBe(true);
    expect(probe.nearestSegmentId).toBe(0);
  });

  it("projects finite points after rope deformation", () => {
    const rope = createRopeStateFromSamples(sampleTrefoil(48));
    const moved = {
      ...rope,
      particles: rope.particles.map((particle, index) =>
        index === 5 ? { ...particle, p: vec3(particle.p.x + 0.4, particle.p.y - 0.2, particle.p.z + 0.1) } : particle
      )
    };
    const projected = projectCurve(ropeToCurveSamples(moved), vec3(1, 1, 1));

    expect(projected.points).toHaveLength(48);
    expect(projected.points.every((point) => Number.isFinite(point.point.x) && Number.isFinite(point.point.y))).toBe(
      true
    );
  });
});

describe("state actions", () => {
  it("flipping a crossing updates only that crossing override", () => {
    const crossing = makeCrossing("x-1-4", "a");
    const initial = {
      ...createEmptyState(),
      crossingOverrides: {
        "x-0-3": "b" as const
      }
    };

    const next = flipCrossing(initial, crossing, "click", 120.6);

    expect(next.crossingOverrides).toEqual({
      "x-0-3": "b",
      "x-1-4": "b"
    });
    expect(next.projectionNormal).toEqual(initial.projectionNormal);
    expect(next.trace.at(-1)).toMatchObject({
      kind: "crossing-flip",
      payload: {
        crossingId: "x-1-4",
        input: "click",
        before: "a",
        after: "b",
        timestampMs: 121
      }
    });
  });

  it("trace log appends deterministic events", () => {
    const initial = createEmptyState();

    const first = appendTraceEvent(initial, "test.first", { value: 1 });
    const second = appendTraceEvent(first, "test.second", { value: 2 });

    expect(second.trace).toEqual([
      { step: 0, kind: "test.first", payload: { value: 1 } },
      { step: 1, kind: "test.second", payload: { value: 2 } }
    ]);
    expect(second.nextTraceStep).toBe(2);
  });

  it("coalesces unsampled rope moves and leaves crossing overrides untouched", () => {
    const initial = {
      ...createEmptyState(sampleTrefoil(24)),
      crossingOverrides: {
        "x-0-3": "b" as const
      }
    };
    const started = reduceKnotState(initial, {
      type: "rope/grab-start",
      particleId: 3,
      paneId: "diagram",
      target: vec3(1, 2, 3),
      timestampMs: 10.2
    });
    const unsampled = reduceKnotState(started, {
      type: "rope/grab-move",
      particleId: 3,
      paneId: "diagram",
      target: vec3(1.11111, 2.22222, 3.33333),
      sampled: false,
      timestampMs: 20.8
    });
    const sampled = reduceKnotState(unsampled, {
      type: "rope/grab-move",
      particleId: 3,
      paneId: "diagram",
      target: vec3(1.11111, 2.22222, 3.33333),
      sampled: true,
      timestampMs: 31.6
    });

    expect(unsampled.trace).toHaveLength(started.trace.length);
    expect(sampled.trace).toHaveLength(started.trace.length + 1);
    expect(sampled.crossingOverrides).toEqual(initial.crossingOverrides);
    expect(sampled.trace.at(-1)).toMatchObject({
      kind: "rope-grab-move",
      payload: {
        target: [1.1111, 2.2222, 3.3333],
        sampled: true,
        timestampMs: 32
      }
    });
  });

  it("exports namespaced rope, probe, crossing, and trace state", () => {
    const state = reduceKnotState(createEmptyState(sampleTrefoil(24)), {
      type: "probe/set",
      probe: {
        active: true,
        screenX: 44,
        screenY: 55,
        nearestParticleId: 2,
        nearestSegmentId: 2,
        mode: "inspect",
        hint: "r1",
        confidence: 0.6,
        paneId: "diagram"
      }
    });
    const samples = ropeToCurveSamples(state.rope);
    const diagram = projectCurveDiagram(samples, state.projectionNormal, state.crossingOverrides);
    const exportDocument = buildExportDocument(samples, diagram, state);

    expect(exportDocument["app/version"]).toBe("0.1.0");
    expect(exportDocument["rope/particles"]).toHaveLength(24);
    expect(exportDocument["rope/constraints"]).toMatchObject({
      distance: 24,
      bend: 24
    });
    expect(exportDocument["probe/state"]).toMatchObject({
      active: true,
      nearestParticleId: 2,
      hint: "r1"
    });
    expect(Array.isArray(exportDocument["crossings/items"])).toBe(true);
    expect(Array.isArray(exportDocument["trace/events"])).toBe(true);
  });
});

const makeCrossing = (id: string, over: "a" | "b"): Crossing => ({
  id,
  point: vec2(0, 0),
  segmentA: 1,
  segmentB: 4,
  tA: 0.5,
  tB: 0.5,
  depthA: 1,
  depthB: 0,
  naturalOver: "a",
  over,
  flipped: over !== "a"
});

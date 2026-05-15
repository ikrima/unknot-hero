# Knot Hero: Direct Rope v0

A deterministic TypeScript + Vite + Three.js prototype for touching a knot as a closed rope, reading its analytic shadow diagram, rotating projection space, flipping crossings explicitly, and exporting a replayable trace.

## Setup

```bash
npm install
npm run dev
```

The app will run through Vite, usually at `http://localhost:5173`.

With the dev server running, canvas rendering can be checked with:

```bash
npm run verify:canvases
```

Unit tests can be run with:

```bash
npm test
```

## What Is Implemented

- Four synchronized panes: perspective, analytic shadow diagram, top / XY, and front / XZ.
- A closed rope particle chain initialized from the trefoil embedding.
- Mouse-first rope hover, grab, drag, release, and short relaxation.
- PBD-style distance, bend, and grab constraints for responsive layout deformation.
- Live analytic projection and crossing detection from the current rope particles.
- A local circular probe lens on hover and grab with local strand focus, confidence ring, and move-hint glyphs.
- Heuristic R1, R2, and experimental R3 candidate hints.
- A projection wheel for rotating the projection normal `n in S^2`.
- Snap presets for `XY`, `XZ`, `YZ`, and `Iso`.
- Click and slash interactions for explicit crossing flips.
- Deterministic trace logging for projection changes, rope grabs, sampled rope drag targets, crossing flips, slash gestures, and export.
- EDN-shaped JSON export with namespaced keys for app, knot, projection, rope, crossings, probe, and trace data.

## Controls

- Perspective pane: hover a strand to inspect it; left-drag near the rope to grab and pull it in the view plane.
- Shadow / Diagram pane: hover or left-drag near the projected rope to manipulate the corresponding rope region in the current projection plane.
- Shadow / Diagram pane: click a crossing marker to flip it.
- Shadow / Diagram pane: drag a slash trail through crossing markers to flip them explicitly.
- Projection wheel: drag to rotate projection space.
- Projection snap buttons: set the projection normal to `XY`, `XZ`, `YZ`, or `Iso`.
- `Esc`: cancel the current rope drag.

Top / XY and Front / XZ also support simple rope dragging in their support planes.

## Architecture

- `src/app/state.ts`, `src/app/actions.ts`, `src/app/trace.ts`, and `src/app/exportState.ts` hold canonical state, reducer actions, trace events, and export shaping.
- `src/knot/projection.ts` and `src/knot/crossings.ts` compute projection basis, 3D-to-2D samples, and approximate segment crossings analytically.
- `src/rope/*` contains rope particle types, initialization, constraints, solver, selection, probe state, and rope-to-curve conversion.
- `src/topology/nearMoves.ts` contains heuristic-only local move hints.
- `src/render/viewports.ts`, `src/render/ropeTube.ts`, `src/render/shadowDiagram.ts`, and `src/render/probeLens.ts` render the synchronized panes, dynamic rope tube, formal diagram, and probe lens.
- `src/input/mouseFallback.ts` handles mouse-first direct rope manipulation.
- `src/input/slashDetector.ts` keeps crossing flips as explicit click/slash actions.

The Three.js views are visual support only. The shadow diagram, crossings, probe hints, and export are derived from explicit rope particles and projection math rather than rendered pixels.

## Mathematical Status

Direct Rope Manipulation v0 is a visual and layout interaction prototype. Rope dragging deforms the embedding and updates the projected diagram, but it does not certify Reidemeister moves or prove unknotting number bounds.

Near-move hints and any layout snap plumbing are heuristic UI affordances. They are exported and traced honestly as candidates or `layout-snap` events with `certified: false`, not as certified R1, R2, or R3 moves.

Crossing changes are explicit paid moves only. Rope dragging does not silently flip over/under state; crossings flip only through crossing-marker clicks or slash gestures.

MediaPipe work is not part of this milestone. The current task is mouse-first rope manipulation before hand-tracking polish.

## v0 Boundaries

This version intentionally does not implement full Reidemeister validation, real unknot verification, a backend Python verifier, leaderboards, audio/rhythm systems, production self-collision, a ClojureScript port, or Lean export.

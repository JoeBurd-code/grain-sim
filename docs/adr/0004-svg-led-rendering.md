# SVG-led rendering, not Canvas 2D

Rendering is SVG over a large pan/zoomable scene (`viewBox`-driven), with machines
as reusable SVG symbols and native per-element click handling. This reverses an
earlier decision to use Canvas 2D, which had been chosen on the assumption that
canvas would animate dense moving grain more cheaply. Two facts removed that
advantage before implementation started: there is no particle simulation (only a
few flowing streams plus fill-level shapes), and every machine must be natively
clickable to open its popup. For a clickable, pan/zoom technical schematic with no
particles, SVG needs native hit-testing for free and animates the "flowing grain"
effect via `stroke-dashoffset`, where canvas would need manual hit-testing and
per-frame redraws for the same result.

## Considered options

Canvas 2D (the original choice) and a hybrid SVG-bodies-plus-canvas-overlay
approach (kept in reserve only if dense shimmer is ever wanted later).

## Consequences

The sim engine, behavior primitives, control logic, and tests are all
rendering-agnostic, so this flip touched only the rendering and selection
modules — not the sim core. Anyone tempted to move dense visual effects back to
canvas should re-check whether particle simulation is actually back in scope
first; if not, this reasoning still holds.

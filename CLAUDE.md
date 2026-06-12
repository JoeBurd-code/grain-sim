# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Vite HMR)
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm run lint      # ESLint check
```

No test suite is configured.

## Architecture

This is a single-component React app. The entire simulation lives in `src/GrainFlowSim.jsx`; `src/App.jsx` just re-exports it.

### Simulation engine (`step` function)

A pure finite-volume belt model running at `DT = 0.05 s` per tick:

1. **Advect** — grain moves downstream through `N_CELLS = 24` belt segments; each cell has a capacity of `area × (length / N_CELLS)` m³. Backpressure is modelled: if a downstream cell is full, the move is rejected and grain backs up.
2. **Feed** — valve injects `valveRate × DT` m³ into cell 0 each tick. Excess that won't fit is counted as `feedSpill`.
3. **Free-fall** — the last cell's discharge enters an `inFlight` queue with a fixed `FALL_TIME = sqrt(2×1/g) ≈ 0.45 s` delay before reaching the bucket.
4. **Bucket** — fills continuously; emptied on a cyclic `emptyInterval` timer. Overflow past `bucketCap` accumulates as `bucketSpill`.

`stateRef.current` holds the live mutable state; `snap` (React state) is a shallow snapshot published at ~10 fps for React rendering. The canvas runs at full 60 fps via `requestAnimationFrame`, calling `drawRef.current()` directly without going through React.

### Render / timing model

- `loopRef.current` is the rAF callback. It accumulates a real-time budget (`budgetRef`) scaled by `speedRef` (1×/5×/20×), then drains it in `DT`-sized sim steps up to `MAX_STEPS_PER_FRAME = 60`.
- Canvas draw (`drawRef.current`) runs every frame.
- React state (`setSnap`) is throttled to every 100 ms to keep chart and stat panel updates cheap.
- Speed multiplier works by scaling how much sim time to consume per wall-clock second, not by changing `DT`.

### Presets

Three named presets (`bucket`, `belt`, `balanced`) in the `PRESETS` object demonstrate the three key failure modes. Applying a preset resets the sim state.

### Styling

All styles are inline CSS-in-JS. The colour palette is the `C` constant object. Fonts: `Anton` (display headings) and `JetBrains Mono` (data/labels), loaded from Google Fonts at runtime.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues in `JoeBurd-code/grain-sim` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

# Grain Flow Simulator

A node-graph visualizer of an already-engineered grain production line, built to demo
to stakeholders how grain flows through the line and how it behaves under fault
conditions — trips, backpressure, transport lag, controlled stops.

Live demo: [grain-sim.vercel.app](https://grain-sim.vercel.app) (password protected).

## Architecture

- **`src/line/`** — the line as data: every machine, zone, and connection.
- **`src/sim/`** — the simulation engine: a fixed-timestep loop over a set of
  registered machine behaviours (accumulators, batch cycles, transport lag,
  interlocks, trips).
- **`src/scene/`** — SVG rendering of the graph, pan/zoom, and flow animation,
  driven off the engine's state.
- **`src/app/`** — UI chrome: transport controls, plant controls, machine popups,
  charts, event log.

Design rationale for the bigger calls (hybrid sim model, volume as the primary
currency, data-described topology, SVG-led rendering, the stop mechanisms) is in
[`docs/adr/`](docs/adr/).

## Commands

```bash
npm run dev       # start dev server (Vite HMR)
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm run lint      # ESLint check
npm test          # Vitest, single run
npm run test:watch
npm run census    # print the behaviour census: ENGINED/CONFIRMED counts per behaviour kind
```

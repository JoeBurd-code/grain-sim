# Grain Flow Simulator

This app shows a grain production line as a node graph. It simulates the line in
real time. It shows how grain flows through the line. It also shows how the line
behaves under fault conditions, such as trips, backpressure, transport lag, and
controlled stops.

Live demo: [grain-sim.vercel.app](https://grain-sim.vercel.app). The demo needs a
password.

## Architecture

- **`src/line/`**: the line as data. It lists every machine, zone, and connection.
- **`src/sim/`**: the simulation engine. It runs a fixed-timestep loop over a set of
  machine behaviours. These behaviours include accumulators, batch cycles,
  transport lag, interlocks, and trips.
- **`src/scene/`**: SVG rendering of the graph. It handles pan, zoom, and flow
  animation. It reads its state from the engine.
- **`src/app/`**: the UI. It includes transport controls, plant controls, machine
  popups, charts, and the event log.

The `docs/adr/` folder explains the main design decisions. These include the
hybrid sim model, volume as the primary currency, data-described topology,
SVG-led rendering, and the stop mechanisms.

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

# Grain Flow Simulator — Project Brief

> **How to use this doc:** Paste or reference it at the start of a new session to
> restore full context. It is the single source of truth for *why* we're building
> this, *what* was decided, and *what's next*. Decisions in §3 are locked; revisit
> them only deliberately. The roadmap in §5 is a live checklist — tick items as they
> land.

---

## 1. One-paragraph summary

Expand the existing single-file mock (`src/GrainFlowSim.jsx`) into a **node-graph
visualizer of one specific, already-engineered grain production line**. It is a
**demo for stakeholders** (the user's boss) that shows, in real time, how grain
flows through the line and how the line behaves under fault conditions. It is **not**
a general-purpose platform — no drag-and-drop editor, no machine palette, no plugin
system. There are **no artificial limits on internal code structure** (internal code
reuse is encouraged; only *user-facing* platform features are out of scope).

**Current state (2026-06-17):** The meeting frontend (SVG walkthrough of the real
Treater Line 2) is built and shipped (`main`). UI scaffolding is complete (scene,
popup, chart dock, transport stubs). The sim engine (Phase 0) is the next major
body of work.

## 2. The thesis (what the demo must prove)

> **Transport lag plus control-response latency means a safety trip doesn't take
> effect instantly — so even a well-instrumented line can still back up and spill,
> which is why sensor placement and response timing matter.**

When a sensor trips a stop, the effect is *delayed*: grain already on belts keeps
travelling, grain free-falling keeps falling, machines take time to spin down, and
the stop signal itself propagates with latency. The demo makes these delays visible
and tunable so a viewer can ask "what if the sensor were further upstream?" or "what
if response were faster?" and watch the answer unfold.

## 3. Locked decisions

| # | Area | Decision |
|---|------|----------|
| 1 | **Sim model** | Hybrid. Conserved material exists as **continuous belt flow**, an **accumulated batch** (bucket / vessel / bucket-elevator bucket), or an **in-flight free-falling parcel**. The mock already embodies all three: belt cells, `bucket`, and the `inFlight` queue. |
| 2 | **Units** | **Volume (m³) is the primary conserved currency** (keeps belt physics + fill-height visuals). Each stream carries a **bulk density**, so `mass = volume × density` is computed only where read — sensors, or a machine that deliberately changes density (e.g. a dryer removing moisture). Most machines pass density through untouched. |
| 3 | **Line = data** | The line is a **data-described graph**: one config object lists this line's machines, their ports, parameters, and connections. A small set of **shared internal behavior functions** interpret that data to simulate and draw. **No editor** — the data file is hand-authored by us. Today's `PRESETS` object is the embryo of this idea. |
| 4 | **Ports** | Machines have **typed input/output ports**. Example: a seed treater = **1 input → 2 outputs** (waste + product). |
| 5 | **Rendering** | **SVG-led** scene over a large line; pan/zoom via the SVG **`viewBox`**. Machines are reusable **SVG symbols/components**; **clicking is native** (per-element events) → opens the popup. Keep the **visual language**: fill-level encoded by a shape's height + the `ratioColor` ramp, plus flowing grain via animated **`stroke-dashoffset`** along connection paths and free-falls. **No particle simulation.** *Optional later:* go **hybrid** (SVG bodies + a single canvas overlay) only if dense shimmer is ever wanted. **(Flipped from an earlier Canvas-2D decision — see §8.)** |
| 6 | **React boundary** | React renders the **SVG scene *structure*** (machine symbols + connection paths) declaratively, but **only when the topology changes**. **Per-frame dynamic attributes** (fill height, color, flow dash-offset, status) are mutated **imperatively via refs / CSS animation — never through React reconciliation.** UI chrome (popups, panels, chart) is ordinary React. The principle survives the canvas→SVG flip: *never reconcile the whole tree every frame* (this is what "don't refresh the whole frame" actually meant). |
| 7 | **Failure behavior** | When flow blocks, grain **backs up and can spill** (at feed/overflow points), **or** an **interlock stops** machines — **selectable per scenario**. |
| 8 | **Delay model** | Stops are **not instant**. Model three sources of delay, all tunable per machine: (a) **in-transit grain** keeps moving — automatic from conservation; (b) **signal/response latency** sensor→actuator; (c) **mechanical ramp-down** — belts/machines decelerate over a settable time. |
| 9 | **Control logic** | **Declarative threshold rules + interlock chains.** A rule = *"when [sensor] crosses [threshold] (optional debounce), [stop / start / set-speed] [target machine(s)] after [signal delay]."* A machine declares which **upstream feeders it interlocks**, each link with its own delay, so a single trip **ripples up the line over time.** Authored as data. |
| 10 | **Machine popup** | Click a machine → floating panel with: **auto-generated sliders** (from its data definition) + **that machine's own event log** + a **"plot this machine" toggle**. |
| 11 | **Shared chart** | A **single chart docked at the bottom** overlays the time-series of only the **toggled** machines, color-matched to each. Purpose: compare points on the line and **literally see transport/control delay** (the same pulse arriving later downstream). The toggle keeps the chart readable at 7+ machines. Default plotted metric ≈ throughput or fill (TBD). |
| 12 | **Scenarios** | **Named presets** (a full parameter set + initial state, like today's `PRESETS`) **plus live fault injection** — click a machine mid-run and **jam / stop / block-output** to watch the cascade. Built for a live presentation. |
| 13 | **Migration** | **Build the new core fresh** (graph model, generalized sim engine, camera renderer, control layer, popup + chart UI) and **transplant the proven, tuned pieces** from the mock: belt advection-with-backpressure, free-fall queue, bucket accumulator, the rAF budget loop, the ~10 fps publish throttle, the fill-block draw style + color ramp. **The current mock stays untouched as a working reference/oracle.** |

## 4. Reusable physics already proven in the mock

These are in `src/GrainFlowSim.jsx` today and should be **lifted, not rewritten** — they are **rendering-agnostic** (the canvas→SVG flip in §3.5 does not touch them). The one exception is the canvas *drawing calls*, which are replaced by SVG; the visual *language* (fill-level + color ramp) carries over conceptually.

- **Belt advection with backpressure** — `step()`: downstream→upstream pass, rejected volume backs up toward the feed.
- **Throughput ceiling** — `area × beltSpeed` caps volume past any point per step.
- **Free-fall transport delay** — `inFlight` queue with `FALL_TIME = sqrt(2h/g)` arrival.
- **Batch accumulator** — `bucket` fills continuously, empties on a cyclic timer, overflows past `bucketCap` into `bucketSpill`.
- **Feed-point spill** — inflow that won't fit cell 0 is counted as `feedSpill`.
- **rAF budget loop** — accumulates real-time × speed multiplier, drains in fixed `DT` steps (`MAX_STEPS_PER_FRAME` cap).
- **Publish throttle** — imperative canvas at 60 fps, React `setSnap` at ~10 fps.
- **Color ramp + palette** — `ratioColor` (green→amber→red interpolation) and the `C` palette are **pure** and reused as-is (color strings drop straight into SVG fills). The fill-level/animated-flow *idea* carries over; the canvas `fillRect`/path calls are re-expressed as SVG shapes + `stroke-dashoffset`.

## 5. Roadmap — checklist

### Pre-Phase — Meeting frontend (COMPLETE 2026-06-17, issues #4–#10)
- [x] Line-data schema (`src/line/lineData.js`): 40 machines, 3 zones, 40 connections, typed ports, anchors, specs, open questions. Validator + reachability tests passing.
- [x] SVG scene with pan/zoom (`useViewport`, `Scene`), 20 machine silhouettes, 3 stream kinds, flow arrows, TBC dashed connections.
- [x] Machine popup: live-look sliders (stub), event log (stub), "from the drawings" specs, "open questions" per machine.
- [x] Meeting chrome: transport controls, zone buttons, FIT ALL, shared chart dock scaffold, selection readout.
- [x] Vitest suite: 15 tests (validator, bounds, viewport math, line data integrity, reachability).

### Phase 0 — Core engine (no UI)
- [ ] Define the **stream** type: volume + density (mass derived).
- [ ] Extract reusable **behavior primitives** from the mock:
  - [ ] Source / valve (feed)
  - [ ] Conveyor (advection + backpressure + ceiling)
  - [ ] Accumulator (batch / bucket / vessel)
  - [ ] Free-fall (delay queue)
  - [ ] **Splitter** (1→N by ratio — the seed-treater waste/product case)
  - [ ] Merger (N→1)
  - [ ] Transformer (changes density / rejects waste)
  - [ ] Sink (bin / output)
  - [ ] Sensor (reads mass / level / flow / running-state)
- [ ] **Graph step engine**: per-tick local push/pull conservation across the graph; handles loops; conserves in-transit grain.
- [ ] Port the **rAF budget loop + publish throttle** unchanged.
- [ ] Unit-check conservation: total in = on-graph + delivered + spilled (no grain created/destroyed).

### Phase 1 — SVG scene + viewport
- [ ] **Viewport**: pan (drag) + zoom (wheel) via the SVG `viewBox`.
- [ ] **Machine symbols**: each machine type as a reusable SVG component, placed at its world coords; fill-level shape + `ratioColor`.
- [ ] **Native selection**: per-element `onClick` → select machine (no manual hit-testing).
- [ ] **Flow animation**: grain-in-transit and free-fall via animated `stroke-dashoffset` along connection paths.
- [ ] **Imperative per-frame updates**: dynamic attributes (fill, color, status) mutated via refs / CSS, bypassing React reconciliation; scene structure re-rendered only on topology change.
- [ ] Build a **fabricated stand-in line** that exercises every primitive: feed → belt → seed-treater split (waste + product) → bucket elevator → bin, with at least one loop.

### Phase 2 — Interaction + instrumentation
- [ ] Click machine → **popup**: auto-generated sliders (from machine data) that apply **live**.
- [ ] **Per-machine event log** in the popup.
- [ ] **"Plot this machine" toggle** in the popup.
- [ ] **Shared bottom chart** overlaying toggled machines' series, color-matched.
- [ ] Retain global controls: run / pause / step / speed (1×/5×/20×) / reset.

### Phase 3 — Control + delay
- [ ] **Sensors** reading mass / fill % / flow / running-state.
- [ ] **Declarative threshold rules** (condition → action, optional debounce).
- [ ] **Interlock chains** — machine declares upstream feeders it stops, each with its own delay.
- [ ] **Signal latency** sensor→actuator.
- [ ] **Mechanical ramp-down** — settable deceleration time per machine.
- [ ] **Spill vs interlock-stop** accounting, selectable per scenario.
- [ ] Verify the **delayed cascade** is visible and the knobs change its outcome.

### Phase 4 — Scenarios + fault injection
- [ ] **Scenario presets**: named parameter sets + initial state (e.g. "normal", "overfed", "no safeties", "with interlocks").
- [ ] **Live fault injection**: click machine → jam / stop / block-output mid-run.
- [ ] **Storytelling polish**: event highlighting, spill counters, clear "where did it spill and why" readout.

### Phase 5 — Real specs integration (PARTIALLY COMPLETE)
- [x] Real engineering drawings received and deciphered (2026-06-12, `docs/REAL_LINE_SPECS.md`).
- [x] Real topology plugged into `lineData.js` (40 machines, full Treater Line 2 DAG).
- [x] Confirmed: treater changes composition (adds chemical); line is a DAG (no recirculation).
- [ ] Engineer meeting outcomes (2026-06-16) incorporated — per-machine behaviour, motor ratings, open [MED]/[LOW] items in REAL_LINE_SPECS.md §12.
- [ ] Per-machine behaviour functions authored once engine primitives exist.
- [ ] Parameters tuned to match reality.
- [ ] Default plotted metric decided per machine.

## 6. Tech notes / constraints

- Stack: **React 19 + Vite 8**, deps `lucide-react`, `recharts`. ESLint flat config. No test runner yet — add a lightweight one (e.g. Vitest) when Phase 0 conservation checks need it.
- Keep the **sim state in refs** (mutable, fast) with a **throttled React snapshot** for UI — the pattern the mock already uses.
- Commands: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.
- See `CLAUDE.md` for architecture orientation and `docs/agents/` for issue-tracker / triage / domain-doc conventions.

## 7. Open questions (deferred, not blocking)

- Engineer meeting outcomes (2026-06-16) — per-machine behaviour, confirmed motor ratings, resolution of [MED]/[LOW] items in `docs/REAL_LINE_SPECS.md` §12. Ask user at start of next session.
- Default time-series metric for the shared chart (throughput vs fill level).
- Whether mass must be tracked independently once the treater adds chemical (composition changes but the primary unit is still volume for belt physics).
- Instrument code meanings that are still unclear from the drawings — user may have answers from the engineer meeting.

## 8. Decision history

- **Rendering: Canvas 2D → SVG-led (flipped).** Originally locked as Canvas 2D, largely because canvas animates dense moving grain cheaply. Two later facts removed that advantage: (a) **no particle simulation** — only fill-level shapes + a few flowing streams; (b) **every machine must be clickable** → popup. For a clickable, pan/zoom **technical schematic** with no particles, SVG is less work and a more natural fit: machine bodies are reusable vector symbols (authorable in a drawing tool or from standard equipment-symbol sets), clicks are native element events, pan/zoom is one `viewBox`, and the "flowing grain" effect is an animated `stroke-dashoffset`. Crucially, **rendering is a swappable layer** — the sim engine, behavior primitives, control logic, and all tests are rendering-agnostic, so the flip touches only the rendering + selection modules, not the sim core or Phase 0. Keep **hybrid** (SVG bodies + a single canvas overlay) in reserve only if dense shimmer is ever wanted.

- **Meeting frontend built ahead of sim engine (2026-06-12 to 2026-06-17).** The real engineering drawings arrived earlier than expected, unlocking Phase 5 topology work before Phases 0–4 were started. Rather than continue with a fabricated stand-in, we built a **static SVG walkthrough** of the real Treater Line 2 as an engineer-meeting prop (issues #4–#10). This was the right call: it proved the SVG scene + viewport architecture works on the real topology, produced a demoable artefact for the meeting, and surfaced the actual machine roster that the sim engine will eventually drive. The sim engine (Phase 0) is the next body of work.

- **Display: name only on the scene canvas.** No machine tags, no status chips (NEW/RELOCATED), no title bar, no stub suffixes. Everything lives in the popup. Principle: demo tool, not engineering drawing — identify by shape + machine name; clutter distracts. Applied consistently across `symbols.jsx`, `MachinePopup.jsx`, `MeetingApp.jsx`, `ChartDock.jsx`.

- **Pan tracking: window-level listeners, not pointer capture.** `setPointerCapture` on the SVG element redirected all subsequent pointer events (including the click that ends a drag) to the SVG, so per-machine `onClick` handlers never fired and the popup never opened. Fixed by attaching `pointermove` / `pointerup` to `window` in a `useEffect` instead. Click-vs-drag disambiguation is done with a 4 px `DRAG_THRESHOLD_PX` and a `didDragRef` boolean checked in each machine's click handler via `wasDrag()`.

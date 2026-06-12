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
| 5 | **Rendering** | **Canvas 2D + a camera** (pan/zoom via `ctx` transform) over a large line. Keep the **existing visual language**: fill-level blocks whose height/color encode volume & fill-ratio, plus animated dashed streams for grain in transit / free-fall. **No particle simulation.** Click a machine = manual hit-test → opens its popup. |
| 6 | **React boundary** | React renders **UI chrome only** (popups, panels, charts) and changes rarely. The **live scene is drawn imperatively to canvas**. The two **never meet on the per-frame hot path.** (This is what "don't refresh the whole frame" actually meant: avoid full React re-render — canvas redraw is cheap and fine.) |
| 7 | **Failure behavior** | When flow blocks, grain **backs up and can spill** (at feed/overflow points), **or** an **interlock stops** machines — **selectable per scenario**. |
| 8 | **Delay model** | Stops are **not instant**. Model three sources of delay, all tunable per machine: (a) **in-transit grain** keeps moving — automatic from conservation; (b) **signal/response latency** sensor→actuator; (c) **mechanical ramp-down** — belts/machines decelerate over a settable time. |
| 9 | **Control logic** | **Declarative threshold rules + interlock chains.** A rule = *"when [sensor] crosses [threshold] (optional debounce), [stop / start / set-speed] [target machine(s)] after [signal delay]."* A machine declares which **upstream feeders it interlocks**, each link with its own delay, so a single trip **ripples up the line over time.** Authored as data. |
| 10 | **Machine popup** | Click a machine → floating panel with: **auto-generated sliders** (from its data definition) + **that machine's own event log** + a **"plot this machine" toggle**. |
| 11 | **Shared chart** | A **single chart docked at the bottom** overlays the time-series of only the **toggled** machines, color-matched to each. Purpose: compare points on the line and **literally see transport/control delay** (the same pulse arriving later downstream). The toggle keeps the chart readable at 7+ machines. Default plotted metric ≈ throughput or fill (TBD). |
| 12 | **Scenarios** | **Named presets** (a full parameter set + initial state, like today's `PRESETS`) **plus live fault injection** — click a machine mid-run and **jam / stop / block-output** to watch the cascade. Built for a live presentation. |
| 13 | **Migration** | **Build the new core fresh** (graph model, generalized sim engine, camera renderer, control layer, popup + chart UI) and **transplant the proven, tuned pieces** from the mock: belt advection-with-backpressure, free-fall queue, bucket accumulator, the rAF budget loop, the ~10 fps publish throttle, the fill-block draw style + color ramp. **The current mock stays untouched as a working reference/oracle.** |

## 4. Reusable physics already proven in the mock

These are in `src/GrainFlowSim.jsx` today and should be **lifted, not rewritten**:

- **Belt advection with backpressure** — `step()`: downstream→upstream pass, rejected volume backs up toward the feed.
- **Throughput ceiling** — `area × beltSpeed` caps volume past any point per step.
- **Free-fall transport delay** — `inFlight` queue with `FALL_TIME = sqrt(2h/g)` arrival.
- **Batch accumulator** — `bucket` fills continuously, empties on a cyclic timer, overflows past `bucketCap` into `bucketSpill`.
- **Feed-point spill** — inflow that won't fit cell 0 is counted as `feedSpill`.
- **rAF budget loop** — accumulates real-time × speed multiplier, drains in fixed `DT` steps (`MAX_STEPS_PER_FRAME` cap).
- **Publish throttle** — imperative canvas at 60 fps, React `setSnap` at ~10 fps.
- **Visual language** — fill-block height/color (`ratioColor` green→amber→red ramp), animated dashed flow streams, color palette `C`.

## 5. Roadmap — checklist

### Phase 0 — Core engine (no UI)
- [ ] Define the **line-data schema**: machines (nodes) with typed in/out ports + params; connections (edges); control rules; scenarios.
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

### Phase 1 — Camera renderer
- [ ] **Camera**: pan (drag) + zoom (wheel) via `ctx.translate`/`ctx.scale`.
- [ ] **Per-node draw**: each machine draws itself in world coords using the fill-block style.
- [ ] **Hit-testing**: screen→world → point-in-machine, for click selection.
- [ ] Render **animated dashed streams** along connections (transit) and free-falls.
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

### Phase 5 — GATED on real specs (next grilling session)
- [ ] **Second grilling session** to capture the actual machine roster + per-machine behaviors.
- [ ] Plug engineering's **real topology** into the line-data file.
- [ ] **Tune parameters** to match reality.
- [ ] Decide **default plotted metric** per machine; confirm whether any machine **changes density** (dryer); confirm whether the line **recirculates** (loops already handled either way).

> **Phases 0–4 need nothing from engineering** — they run entirely on the fabricated
> stand-in line. Phase 5 is the only gated work.

## 6. Tech notes / constraints

- Stack: **React 19 + Vite 8**, deps `lucide-react`, `recharts`. ESLint flat config. No test runner yet — add a lightweight one (e.g. Vitest) when Phase 0 conservation checks need it.
- Keep the **sim state in refs** (mutable, fast) with a **throttled React snapshot** for UI — the pattern the mock already uses.
- Commands: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.
- See `CLAUDE.md` for architecture orientation and `docs/agents/` for issue-tracker / triage / domain-doc conventions.

## 7. Open questions (deferred, not blocking)

- Actual machine roster and per-machine behavior (Phase 5 — awaiting engineering).
- Default time-series metric for the shared chart (throughput vs fill).
- Whether any machine changes density (dryer) and whether mass must then be tracked independently.
- Whether the real line recirculates.

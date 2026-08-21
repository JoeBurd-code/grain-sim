# Open questions register

One row per gap the sim engine actually reads, generated as the build trips
over it — not a wishlist. Per issue #15's user stories: nothing here blocks
work; each gap is assumed with a recorded rationale, and this register
doubles as the message to the engineer if a **load-bearing** gap ever needs
raising. Plant-behaviour questions are logged here, never put to the
project owner as a decision.

Columns:
- **Machine** — the `lineData.js` machine id.
- **Gap** — what isn't known.
- **Assumption in use** — the value the engine runs with today, and where in
  the code it lives.
- **Expected from** — engineer follow-up, the ~600-page operational spec, or
  neither (a demo-only choice with no real-world answer to absorb).
- **Load bearing?** — no if the assumption is insensitive across its
  plausible range (outcome doesn't change), yes if it is. Only load-bearing
  gaps are worth raising with the engineer.

---

## Engineer follow-up: the short list (issue #52)

Everything below this point is the full register — every gap the sim has ever
tripped over, most of them **not** load-bearing (the demo's point holds
regardless of the exact number). This section is the other filter: only the
rows marked **Yes** under "Load bearing?", the ones actually worth an
engineer's time, pulled into one place so the register can double as the
message to send rather than something he'd have to read end to end. Each
line names the one question to ask; the full reasoning for why it's
load-bearing stays on the row itself.

1. **`treatDrumFeeder` (`52.505.L00`)** — is the real percentage-opening →
   flow-rate mapping linear, and is it even a continuous dial or a
   two-position selector (`ZS13`/`ZS14` driving `XV4`/`XV5`, per the FD)?
   *(Machine 2 section)*
2. **`treatingElevatorRunningAutoStart` interlock** — what rate does the
   drum feeder actually auto-start at, within its confirmed 2-20 t/h range?
   *(Newly raised by the FD section)*
3. **`treatingElevator` / `pendulumConveyor` (`52.506.E00` / `52.604.E00`)**
   — one question resolves both: is the shared sheet 52-13 chain speed
   10.08 m/min or ~20.5 m/min, or is the bucket pitch finer than the
   drawing's own bucket count implies? *(Machine 3 and Machine 8 sections)*
4. **`batchTreater` (`52.508.T00`)** — is 40 s the batch's own cycle time,
   or does it already net in downtime the line's separately-quoted 12 t/h
   sustained rate has accounted for and 40 s hasn't? *(Machine 5 section)*
5. **`flexiconFillingHead` (`52.703.L00`)** — the Flexicon package's real
   rated bag size. *(Machine 10 section)*
6. **`concettiScale` (`TBC-16`)** — the Concetti package's real rated bag
   size. *(Machine 11 section)*

## 2026-08-05: the Functional Description arrived, and it was the control document

The PLC & SCADA Functional Description (A2653FSD001 V1.0) landed and was analysed
in full; the durable record is `docs/PLC_FUNCTIONAL_DESCRIPTION.md`. **It is the
document this register was waiting for.** The "operational spec" that most rows
below name as their source turns out to have been the wrong thing to wait for on
control questions: interlocks, trip delays and start/stop ordering are all here,
and they are now facts rather than assumptions.

**Three findings change what the engine should do, not just what we know:**

1. **The buffer bin's trip delay is ~7 s, not 3 s.** The real chain is
   `52.502.H00.LSH0` → **5 s** → trip elevator `52.414.E00` → **1 s** → vibratory
   feeders lose their interlock → **1 s** → yellow bin outlet valves close. The
   assumption had the right shape and about half the magnitude.

2. **There is no automatic reopen.** A high-level event is a **trip**, and the FD
   is explicit that a tripped device needs a **SCADA reset** before it can start
   again. The buffer bin's `LSL0` is an *Information* alarm only and appears in no
   interlock or trip table. The sim's auto-reopen at `lowSetpoint` is a modelling
   convenience, not plant behaviour, and a presenter should not claim otherwise.
   This is the one item here that is a correctness problem rather than a
   precision problem.

3. **The set points and delays have no fixed plant values to absorb.** The SCADA
   faceplates expose monitoring time, feedback validation, start/stop delays,
   speed-switch monitoring delay, and analog failure/interlock set points as
   **per-device operator-adjustable parameters**. That is why nobody could quote
   them: they are commissioning configuration. Several rows below therefore move
   from "expected from: operational spec" to "nothing to absorb", and the sim's
   choice to expose them as sliders turns out to mirror the real HMI.

Rows below are annotated **[FD 2026-08-05]** where this changed them.

## Machine 1: source valve → metal remover → treater buffer bin (issue #18)

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treaterBufferBin` | LSH (level switch high) set point — the real trip point may sit below 100% of working volume, not at the physical cap | Reject only once fully full (100% of the 7.7 m³ working volume); no separate switch threshold yet — `src/sim/behaviors.js` `capacityAvailableAccumulator` | ~~Operational spec~~ **Nothing to absorb [FD 2026-08-05]**: SCADA analog faceplates expose interlock set points as operator-adjustable configuration | No — the demo's point is the fill/reject behaviour, not the exact percentage it trips at; issue #19 (the control interlock) is where the switch's own set point starts to matter |
| `treaterBufferBin` | LSL (level switch low) set point | Not read yet; nothing in issue #18 consumes it (it gates the downstream drum feeder's start, added in #20) | **Nothing to absorb [FD 2026-08-05]**, same reason | No, for this machine's scope |
| `upstreamStub` (in-sim stand-in for the real yellow-bin valve, which is itself out of sim scope) | Close time of the real yellow-bin valve once the buffer bin signals full | Instantaneous (0 s) — modelled as synchronous backpressure at `upstreamStub`, not a timed close (`src/sim/engine.js` reverse-pass capacity check) | **Partly answered [FD 2026-08-05]**: the *signal* path is 5 s + 1 s + 1 s (PLC_FD §5); the valve's own travel time is a commissioning parameter | No — issue #19 is where a nonzero close time would first change on-screen behaviour (the delayed-cascade demo hinges on interlock latency, not this valve's own close time) |
| `treaterBufferBin` | Demo starting fill level | **Resolved (issue #55)**: every bin, buffer and belt on the line starts empty (0%) on page load and RESTART — no `sim.initialLevelFraction` authored; the presenter's own level-jump slider or CLEAR PLANT stages any other level | Neither — demo-only choice, nothing to absorb from the spec | No |
| `treaterBufferBin` | Working-volume→mass conversion, needed the moment any readout is in tonnes | **Already resolved by issue #18, not by the FD.** `BULK_DENSITY_T_PER_M3 = 0.72` has been in `src/sim/units.js` since #18 merged, derived from the buffer bin and bin segment (both confirmed 2026-06-30). This row was left open in error; the FD (2026-08-05) adds a third independent bin agreeing to within 1%, corroborating the value already in code | Resolved (was resolved in #18; this register just wasn't updated to say so) | No, and never was |
| `upstreamStub` | Authored default source rate. Confirmed at **12 t/h** (SCADA-commanded yellow-bin pan feeders, `REAL_LINE_SPECS.md` §5) since issue #18, unchanged for years | **Overridden to 15 t/h, assumed, issue #60**, a deliberate departure from the confirmed figure: the graded feed schedule's boost band (issue #56) needs 14 t/h, and a source capped at 12 structurally can't ever supply that — confirmed live, the elevator's own measured throughput saturated at 12 t/h, not 14, with the confirmed default in place. 15 t/h clears boost with margin, the same number and the same reasoning the old #42 auto-start interlock used before issue #60 replaced it | Nothing to absorb — this is a demo-fidelity trade-off against a real, unambiguous confirmed figure, not an open engineering question | **Yes** — unlike most of this line's assumed values, the exact number matters here: anything at or below 14 t/h leaves boost permanently source-starved, the same "anything at or below the draw rate" sensitivity the drum feeder's own #42 auto-start row already flagged |

## Machine 1 control: buffer bin closes the source valve, late (issue #19)

The engineer confirmed the interlock itself (buffer bin full → close the yellow-bin valve). Its timing values were not asked about, since #18 already logged the LSH/LSL set points as low-sensitivity. They matter more now that the demo's whole point is the size of the overshoot they produce, but the *behaviour* (a trip closes late and overshoots) holds across the whole plausible range of each value, so none of these block building — only the exact on-screen overshoot size would move.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treaterBufferBin` | LSH set point (supersedes the #18 row above, now that #19 reads it) | 85% of the 7.7 m³ working volume; live slider, `lineData.js` `interlocks[].highSetpoint`, `provenance: "assumed"` | **Nothing to absorb [FD 2026-08-05]**: operator-adjustable on the SCADA analog faceplate, so "assumed" is as good as it gets and the slider is the honest representation | No — the demo's point is that a trip overshoots, not the exact percentage; dragging the slider is the presenter's answer to "what if the sensor were further upstream" |
| `treaterBufferBin` | LSL set point (supersedes the #18 row above) | 35% of working volume; live slider, `lineData.js` `interlocks[].lowSetpoint`, `provenance: "assumed"` | **Nothing to absorb [FD 2026-08-05]**, same reason, but see the reopen row below, which questions whether this set point should drive anything at all | No, same reasoning as LSH |
| `bufferBinHighTrip` interlock | Signal delay — the real PLC scan interval plus any deliberate alarm debounce between the level switch tripping and the yellow-bin valve receiving a close command | **7 s (applied 2026-08-05)**; live slider, `lineData.js` `interlocks[].signalDelaySec`, `provenance: "confirmed"` | **ANSWERED [FD 2026-08-05]: ~7 s.** `LSH0` → **5 s** → elevator `52.414.E00` trips → **1 s** → vibratory feeders trip → **1 s** → bin outlet valves close (PLC_FD §5) | No — the demo's point is that overshoot grows with delay, not this specific value; the default was wrong by half and has been corrected |
| `bufferBinHighTrip` interlock | ~~Reopen (low-trip) signal delay~~ ~~Superseded: whether an automatic reopen exists at all~~ **Resolved, issue #45** | **Fixed.** All four of the treating zone's interlocks now latch: a trip's commanded machine stays stopped once the level clears, and only the plant control's own RESET TRIPS command (`src/sim/control.js` `resetTrips`, one dispatch per rule kind) releases it — gated on the same high-side setpoint that armed the trip, so a reset pressed while still tripped re-latches instead of flapping. `lowSetpoint` is now display-only (the LSL instrument dot), matching the FD's classification of it as an information alarm | **ANSWERED, and the answer is no [FD 2026-08-05].** A high-level event is a **trip**; the FD states a tripped device "needs to be reset via the SCADA before the device will be able to start again". The buffer bin's `LSL0` is an *Information* alarm and appears in no interlock or trip table. The real line stays stopped until an operator intervenes | Resolved — the demo previously showed an automatic reopen the plant does not have; the honest story ("it trips, it overshoots, and it *stays* down until reset") is the stronger delayed-cascade narrative, and is now what the sim actually does |
| `upstreamStub` (in-sim stand-in for the real yellow-bin valve) | Close/open ramp time — how long the valve's actuator takes to fully shut or reopen once commanded | 6 s, shared by both directions; `lineData.js` `interlocks[].action.rampTimeSec`, `provenance: "assumed"` — not yet exposed as a slider, since the acceptance criteria only calls for signal delay and the two set points to be live | **Nothing to absorb [FD 2026-08-05]** — start/stop delays and monitoring times are per-device commissioning parameters on the faceplate; there is no single documented figure | No — the demo's point is that *some* nonzero ramp time exists and lets material keep arriving, not its exact duration |

## Machine 2: inlet drum feeder meters the buffer bin's discharge (issue #20)

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treatDrumFeeder` (real tag now known: **`52.505.L00`**) | Percentage-opening → flow-rate mapping. The engineer was explicit the real drum feeder is not proportional — ten percent opening does not mean ten percent of range, and forty percent might land around 12 t/h — and referred to a spreadsheet of estimated values that was never sent | Linear opening → rate mapping assumed across the confirmed 2-20 t/h range; the sim exposes the feeder as a direct rate control rather than a percentage dial. Documented in `lineData.js`'s `treatDrumFeeder` comment (not a numbered field, so not under `sim.provenance`) | The engineer's spreadsheet of estimated values (referenced, not yet sent). **[FD 2026-08-05] explains the mechanism but gives no numbers**: two actuators A/B (`ZS13`/`ZS14`) driving **two discrete opening-degree positions** (`XV4`/`XV5`). So the real control may not be a continuous dial at all, but a two-position selector | **Yes, still the line's one genuinely load-bearing gap**, and the FD sharpens it: if the feeder really has only two discrete positions, a continuous 2-20 t/h slider is the wrong *control affordance*, not just the wrong curve. Worth asking alongside the spreadsheet |
| `treatDrumFeeder` | Start condition — the engineer confirmed the real feeder starts as soon as the bucket elevator is confirmed running | **Modelled, issue #42**: `treatingElevatorRunningAutoStart` interlock (`src/line/lineData.js`, kind `autoStartOnRunning`, `src/sim/control.js`) commands the feeder to a configured rate the instant the elevator reads as running, replacing the staged rate-slider workaround | **Confirmed exactly [FD 2026-08-05]**: process interlock "Simatek Bucket Elevator (`52.506.E00`) not Running" on `52.505.L00`, with a 1 s failure delay. The engineer's recollection was precise | No — the demo's point for #20 is the fill/draw balance, not the auto-start trigger |
| `treatingElevatorRunningAutoStart` interlock | **"Confirmed running" signal** — the FD names the interlock's existence and its 1 s failure delay (for the elevator *stopping*, which trips the feeder off — still unmodelled), but never says what actually asserts "running" in the first place: an immediate command-issued flag, a motor run-proof switch, or something that only asserts once the chain reaches full commanded speed | **Assumed [#42]**: the elevator's own commanded speed (manual VFD dial × interlock throttle) settled at a nonzero value — `confirmedRunning` in `src/sim/behaviors.js`. In practice this means "elevator running" from t=0 (both fractions default to 1, already settled), the same instant the elevator would be confirmed running on a real cold start with nothing holding it back | Engineer, one line: what is the actual "elevator confirmed running" signal at 52.505.L00's PLC input? | No — every plausible reading of "running" (command-issued, run-proof switch, settled speed) agrees on the ordinary case this demo shows: the elevator is running well before the feeder would ever need to start, so the auto-start fires effectively immediately regardless of which signal is the real one |
| `treatingElevatorRunningAutoStart` interlock | Auto-start rate — no engineer-given number for what rate the feeder auto-starts at, only the confirmed 2-20 t/h operating range | **15 t/h, assumed [#42, revised]**; `lineData.js` `interlocks[].rateM3PerSec`, `provenance: "assumed"`. Originally set to 12 t/h to match the line's own confirmed "sustained" rate (REAL_LINE_SPECS.md §9-10) — wrong: the batch treater's own modelled draw is ~14.4 t/h (Machine 5 row below, "the 14.4 vs 12 t/h mismatch"), so a 12 t/h feeder leaves the pre-bin in permanent, structural deficit rather than a transient one — its LSL never clears, confirmed live. 15 t/h clears the treater's draw with margin, matching the "well supplied" rate already used throughout this line's own test suite (e.g. issue #40's reproduction) | Engineer or the spreadsheet of estimated values referenced in the drum feeder's own row above; also resolved outright if the 14.4-vs-12 mismatch above (Machine 5) is ever resolved | **Yes, revised from "No"**: unlike most of this line's assumed values, this one is not insensitive across its plausible range — anything at or below ~14.4 t/h starves the pre-bin continuously rather than merely picking a different overshoot size, so the exact number materially changes whether the demo looks healthy |

## Newly raised by the Functional Description (issue #21+ territory)

Not gaps in what the engine reads today, but things the engine will have to
decide about as soon as the treating elevator and treater land. Logged here so
they are not rediscovered later.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| (whole line) | Three **utility sequences** (red dust filter `52.808.S00`, cyclofan `52.807.S00`, conditioning compressor `51.900.S00`) are hard prerequisites; any one stopping trips the entire line at 1 s | **Modelled by aggregate consequence only, issue #51.** The three sequences themselves are still not machines in `lineData.js` and deliberately never will be — no product flows through them, so modelling the equipment would buy the demo nothing. What's modelled instead is what happens when any one of them fails: a single presenter-facing UTILITIES toggle (`src/sim/utilitiesTrip.js`, wired into the plant-control cluster, `PlantControls.jsx`) that, 1 s after being set unhealthy, trips every actuator on the line at once — total and immediate, not a drain, so product is left stranded wherever it was. It latches like any other trip in `control.js` and needs the same RESET TRIPS command, gated on utilities health having actually been restored first | Resolved — the FD was already complete on the *cause and effect*; this closes the *consequence* side, which was the only part the sim engine hadn't built | No — this was already flagged "not load-bearing" before it was built, and remains so: the demo's point is that a utilities failure is instant and total (unlike the other two failure modes), which holds regardless of which of the three real sequences a presenter narrates as the cause |
| ~~`batchTreater` (`52.508.T00`) | Batch phase breakdown (fill / treat / discharge split of the ~40 s cycle) and what happens to a batch mid-cycle when downstream blocks~~ | ~~Modelled as a steady 14.4 t/h rate, not a batch cycle~~ | **Superseded, issue #24 — see the dedicated section below.** The treater is now sim-enabled as a real batch cycle; the phase breakdown itself is still open, and downstream-blocked behaviour is now built (the discharge pulse waits rather than losing the charge) | Superseded |
| `treatingElevator` (`52.506.E00`) | ~~Transport lag: carrying-side transit is either ~3 min or ~6 min~~ **Landed 2026-08-05, issue #21 — see the dedicated section below.** | Now modelled: `distanceM: 8.731`, `speedMPerMin: 10.08` (the drawing's stated figure, not the ~20.5 m/min alternate) | See below | Superseded by the row below, which is more precise now the machine is built |
| ~~`topConveyor`~~ `pendulumConveyor` | ~~Whether it exists as a separate machine at all, or is the upper horizontal run of pendulum conveyor `52.604.E00` with pneumatically selected outlets~~ **Resolved, issue #44.** | **Merged 2026-08-12**: the former `liftConveyor` and `topConveyor` are now one machine, `pendulumConveyor`, tagged `52.604.E00`, with two infeed ports and the three pneumatically-selected outlet ports. Closes register item 26 (`REAL_LINE_SPECS.md` §12) | **Resolved by the mimic** — the Packaging SCADA mimic (`PLC_FUNCTIONAL_DESCRIPTION.md` §8.3) shows one continuous path carrying one set of drive instruments and no drive symbol anywhere on the upper run: not inference, a reading of the mimic itself | Resolved — was "yes for the scene"; the scene now matches |
| `concettiMetalRemover` | Whether it exists | **Removed from `lineData.js` on 2026-08-05.** Its connections were rerouted so `concettiSampler` feeds `concettiPreBin` directly | **Resolved: it does not exist [FD 2026-08-05].** Two independent sources now agree with the engineer against the sheet 52-14 cross-reference | No — already done |

## Machine 3: treating bucket elevator carries grain with a real transport delay (issue #21)

The engine now has a generic `transportDelay` behaviour (`src/sim/behaviors.js`) and
`treatingElevator` is sim-enabled with it. Two things the parent issue named
explicitly as open rather than resolved:

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treatingElevator` (`52.506.E00`) | Bucket count, bucket volume and chain length — the engineer said on the 2026-06-30 worksheet he would need to check these (`REAL_LINE_SPECS.md` §8: ~176 buckets, 20.5 L/bucket, ~105 m chain, all flagged MED/LOW) | Not used at all: the transport delay is derived purely from rise height (8.731 m) and chain speed (10.08 m/min) ≈ 52 s, per the parent issue. Bucket geometry would only matter for a chain-capacity model (see the row below), which this build doesn't attempt | Engineer follow-up (still outstanding since 2026-06-30) | No for the delay itself (already derived without this data); yes if a future build wants a precise in-chain capacity rather than the simplified "any backlog blocks new infeed" stand-in `capacityAvailableTransportDelay` uses today |
| `treatingElevator` (`52.506.E00`) | **Capacity reconciliation.** Working the drawing's own geometry (176 buckets, 0.61 m pitch, 10.08 m/min, 50% fill, 0.72 t/m³) gives ≈7.5 t/h — well below the line's sustained ~12 t/h and the treater's 14.4 t/h bottleneck rate (`REAL_LINE_SPECS.md` §8, "the §8 anomaly"). Either the chain speed is really ~20.5 m/min or the bucket pitch is finer than 176-buckets-over-105 m implies | **Not resolved, deliberately not quietly picked.** `ceilingM3PerSec` in `lineData.js` is set to 20 t/h — an equipment-nameplate figure matching the sibling packaging elevator and the inlet drum feeders' upper range, not a derivation from this elevator's own bucket geometry | Engineer, one line (same ask as the §8 row above): is the chain speed 10.08 m/min or ~20.5 m/min? Resolving that resolves this row too, since the ceiling would then derive cleanly from geometry instead of being assumed | **Yes.** If the geometry-derived ~7.5 t/h is actually right, the treating elevator — not the treater — is the line's true bottleneck, which changes the choke-point story in `REAL_LINE_SPECS.md` §9-10 |

## Machine 4: treater pre-bin slows the elevator, then stops it (issue #22)

The pre-bin reuses the accumulator behaviour unchanged (issue #18's material physics, configured, not rewritten). What's new is `twoStageThrottle`, a second control-rule kind alongside `thresholdTrip` (`src/sim/control.js`), and the elevator's own interlock-commandable throttle (`src/sim/behaviors.js`). The stop stage has a real FD number behind it; the slow stage — the engineer's own addition on top of what the FD calls a single "trip" — does not.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treaterPreBin` | Working volume | **1.63 m³ / 1.17 t** [CONFIRMED, FD 2026-08-05 Treating mimic label, `PLC_FUNCTIONAL_DESCRIPTION.md` §3] | Resolved | No |
| `treaterPreBin` | LSH0/LSL0 set points | 85% / 35%; live sliders, `interlocks[].lowSetpoint`, `provenance: "assumed"`. Demo starting fill level: **resolved (issue #55)** — starts empty (0%), no `sim.initialLevelFraction` authored | **Nothing to absorb [FD 2026-08-05]**, same reasoning as the buffer bin (issue #19): operator-adjustable SCADA configuration | No — same reasoning as the buffer bin's own LSH/LSL rows |
| `preBinSlowStopTrip` interlock | Stop stage set point and delay | Set point 85% (assumed, mirrors LSH0's role); delay **5 s [CONFIRMED, FD 2026-08-05]**: `52.507.H00.LSH0` → 5 s → elevator `52.506.E00` (`PLC_FUNCTIONAL_DESCRIPTION.md` §5) | Set point: nothing to absorb (operator-adjustable). Delay: answered | No |
| `preBinSlowStopTrip` interlock | Slow stage set point, delay, target speed and ramp time | Set point 60%, delay 3 s, target 50% speed, ramp 4 s — all assumed; `lineData.js` `interlocks[].slow`, `provenance: "assumed"` | **Engineer's own worksheet answer names the response ("first slow down, then stop") but no number** (`docs/treater-line2-filled-20260630 (1) (1).md` §6); the FD doesn't separate a slow stage from the trip at all, calling the whole thing one event | No — the demo's point is that a graduated response overshoots less than a hard stop, which holds across the plausible range of the slow stage's own numbers; only the on-screen timing would move |
| `preBinSlowStopTrip` interlock | Recovery ramp time (elevator back to full speed once the bin drains) | 5 s, assumed. **Confirmed applicable, issue #45**: the buffer bin's reopen row's prediction was right — both the slow and stop stages now latch exactly like the buffer bin's trip, and this ramp time only ever plays once the plant control's RESET TRIPS command clears the latch, never automatically | Neither — demo-only choice | No |

## Machine 5: batch treater takes 160 kg every 40 seconds (issue #24)

The treater reuses no existing behaviour — it's the first machine on a new primitive, `batchCycle` (`src/sim/behaviors.js`), the one the parent spec (issue #15) names as the largest reuse win: the same behaviour is meant to serve the Concetti bagging scale, the Concetti filler and the Flexicon big-bag filling head later. Two items are recorded here rather than resolved, exactly per the parent issue's instruction not to invent a phase split or quietly pick a number for the rate mismatch.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `batchTreater` (`52.508.T00`) | Fill / treat / discharge phase breakdown of the ~48 s cycle | Modelled as a single unsplit phase — `lineData.js` `sim.phases` holds exactly one entry, and the `batchCycle` behaviour only ever sums the array, never reads an individual phase, so a future split is a data edit, not a restructuring | **Supplier (Niklas), not the engineer [FD 2026-08-05, carried over from the "Newly raised by FD" section above]**: the PLC treats the treater as a plain start/stop object with a pressure transmitter, so batching is entirely internal to the machine. Stop asking the engineer for this | Not yet — the demo's point is that a batch pulses in and out, which holds however the cycle is internally divided; becomes load-bearing only if a future demo wants to show a specific sub-phase (e.g. "still treating, won't accept a new charge yet") |
| `batchTreater` (`52.508.T00`) | ~~**The 14.4 vs 12 t/h mismatch.** 160 kg every ~40 s is ≈14.4 t/h, but the engineer separately named ~12 t/h as the line's sustained rate with the treater as the slowest point (`REAL_LINE_SPECS.md` §9-10, "the choke-point story"). Both of the engineer's own confirmed figures were used unchanged and literally; the gap was not split, averaged, or resolved by picking one number over the other.~~ **Resolved, issue #60, by explicit product decision (not a re-interpretation of the engineer's own words).** Issue #60 wired the graded feed schedule's own boost band (14 t/h, issue #56's own table) onto the real elevator/feeder, and with it the mismatch stopped being cosmetic: a treater drawing ~14.4 t/h faster than boost's own 14 t/h ceiling structurally starves the pre-bin, and its LSL never clears — confirmed live. `phases[0].durationSec` is now **48 s, derived** from the "~12 t/h sustained" reading (160 kg / 12 t/h = 48 s) rather than the raw "~40 s" one; `provenance: "derived"`, not `"confirmed"`, in `lineData.js` — this is a deliberate choice between the engineer's two disagreeing figures, not new information from him | Engineer, still: is 48 s (or 40 s) the batch's own cycle time, or does either already include periodic downtime the other doesn't? Genuinely open regardless of which reading this repo now runs with | **No longer for the pre-bin's own bounce** (that's what issue #60 fixed) — still yes for the exact on-screen cadence if the engineer's eventual answer picks the other reading |

## Machine 6: treater after-bin holds the next batch (issue #25)

The after-bin reuses the accumulator behaviour unchanged (the third reuse; `src/sim/behaviors.js` gained nothing new for it) and introduces `holdNextBatch`, the third distinct response to a full bin on this line, alongside `thresholdTrip` (#19) and `twoStageThrottle` (#22). The FD independently confirms both the interlock and its trip delay, which is more than either of the other two bins' trips had at build time.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treaterAfterBin` | Working volume | **0.67 m³** [CONFIRMED 2026-06-30, `REAL_LINE_SPECS.md` §5] | Resolved | No |
| `treaterAfterBin` | LSH0/LSL0 set points | 60% / 20%; live sliders, `interlocks[].lowSetpoint`, `provenance: "assumed"`. Demo starting fill level: **resolved (issue #55)** — starts empty (0%), no `sim.initialLevelFraction` authored | **Nothing to absorb [FD 2026-08-05]**, same reasoning as the buffer bin (#19) and pre-bin (#22): operator-adjustable SCADA configuration | No, with one caveat below — unlike the other two bins, 60% isn't an arbitrary echo of the buffer bin's 85%: a single charge (0.222 m³) is ~33% of this bin's own capacity, so an 85%-style set point would leave less headroom than one in-flight charge needs, and the accumulator's own backpressure (not a spill, but a stall) would kick in on every trip. 60% keeps the acceptance criterion ("never interrupts a batch part way through") true at the *default* charge size; a much larger batch size dragged live via the treater's own slider could still shrink that headroom below one charge — not tested, and not asked, since the demo's point (a full after-bin holds the next batch, not the current one) holds regardless of the exact number |
| `afterBinHoldTreater` interlock | Signal delay | **5 s [CONFIRMED, FD 2026-08-05]**: `52.601.H00.LSH0` → 5 s → treater `52.508.T00` stops accepting batches (`PLC_FUNCTIONAL_DESCRIPTION.md` §5) | Resolved | No |
| `treaterAfterBin` | ~~No live discharge yet: the scalping screen (`52.602.F00`) downstream isn't sim-enabled~~ **Resolved, issue #26.** | The scalping screen is now a real (splitter) downstream; the after-bin genuinely discharges into it every tick, bounded by the screen's own ceiling | Resolved | No |

## Machine 7: scalping screen splits product from oversize, completing the treating zone (issue #26)

The screen reuses no existing behaviour — it's the first `splitter` on the
line, the primitive the parent spec (issue #15) names for reuse by the metal
removers and both auto samplers later. The discard bin is likewise the
line's first `terminalSink`. Both machines' own working figures were already
confirmed on 2026-06-30 (`REAL_LINE_SPECS.md` §5); what's genuinely open is
the split fraction itself and what happens on overload, neither of which the
engineer had a number for.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `scalpingScreen` | Actual oversize fraction — the engineer confirmed the 16mm aperture and that waste is "tiny," not a percentage | 3%; live slider, `lineData.js` `sim.wasteFraction`, `provenance: "assumed"` | Engineer or the operational spec: a real measured reject rate, if one is tracked | No — the demo's point is that a splitter divides a stream into two reconciling totals, which holds at any fraction; only the on-screen discard-bin fill rate would move |
| `scalpingScreen` | Overload behaviour — the engineer was unsure what happens past the screen's rated capacity, suggesting the drive would trip (`REAL_LINE_SPECS.md` §5/§12 item 10) | Not modelled: `ceilingM3PerSec` (64.4 t/h, confirmed) caps throughput and backs material up against the after-bin exactly like any other ceiling (`transportDelay`'s own convention) — no trip, no drive-fault state | Engineer, one line: is a genuine trip (stop, needs a SCADA reset) the right model, or does the real screen just choke and keep running? | No — nothing upstream of the screen can organically reach 64.4 t/h in the first place (the treating elevator's own ceiling tops out at 20 t/h), so this gap is unreachable at any of the line's own confirmed rates; it would only matter if a future machine fed the screen faster than that |

## Packaging topology correction: the phantom elevator goes, the grain break loses its parent (issue #44)

Data-only correction, no engine work: the FD's Packaging mimic settles register item 26
(`REAL_LINE_SPECS.md` §12) — `pendulumConveyor` (`52.604.E00`) is one machine, not a lift
plus a separate top conveyor, and the packaging bucket elevator `52.702.U00` it implied
does not exist. Removing that elevator strands the grain break, which had been hung off
its discharge with no position of its own ever confirmed.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `grainBreak` | Exact position along the line — the engineer confirmed the grain break itself exists, as an unpowered cascade chute, but never placed it; the FD doesn't mention it at all (consistent with an unpowered device, nothing to trip or command) | Re-sited onto `pendulumConveyor`'s discharge into the outload buffer bin (`lineData.js`, x:1656/y:190) — the one place upstream of the bin a cascade chute plausibly sits now that its old parent (the phantom elevator) is gone, but this is a placement of convenience, not a plant fact | Engineer, one line: where does the grain break actually sit on branch B? | No — engined since issue #46 as `passThrough`, exactly the "pass-through, no holdup" shape `REAL_LINE_SPECS.md` §6 already expected (`lineData.js` `sim: { kind: "passThrough" }`, no capacity or holdup fields to place wrong); this row previously said it wasn't engined yet, which was stale — caught while bringing the register current for issue #52. Wherever it actually sits between the pendulum conveyor and the outload buffer bin changes nothing about how material moves, only where the symbol is drawn |

## Machine 8: the packaging conveyor carries product to the outload buffer bin (issue #46)

The pendulum conveyor (`52.604.E00`) is the first packaging machine engined, reusing
`transportDelay` unchanged (issue #21). Its `distanceM`/`speedMPerMin`/`ceilingM3PerSec`
are all derived from the sheet 52-13 spec block (`REAL_LINE_SPECS.md` §8, PDF text-layer
exact) rather than tuned — the two rows below record where that derivation sits relative
to the treating elevator's own, already-shipped numbers, since the two machines' figures
now come from the same table but were built by different methods a build apart.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `pendulumConveyor` (`52.604.E00`) | The same §8 factor-of-two geometry anomaly the treating elevator already carries applies here too, and more directly: this conveyor's own bucket pitch (120 m / 196 buckets ≈ 0.61 m) and chain speed (10.08 m/min) imply ≈16.5 buckets/min, but its own confirmed operating-output table (70% fill, 100% speed: 20.84 t/h) implies ≈33.6 buckets/min at 0.72 t/m³ — the same ≈2.04× gap `REAL_LINE_SPECS.md` §8 already documents for the treating elevator, now confirmed to originate in this machine's own spec block (§8's correction note: the block was misread against a phantom elevator tag until issue #44) | `ceilingM3PerSec` is taken from the confirmed operating-output table (20.84 t/h) rather than the disputed bucket-pass-rate geometry, so the anomaly is not re-imported into the ceiling; `distanceM`/`speedMPerMin` don't depend on bucket count or pitch at all, so the anomaly doesn't touch the transit-lag derivation either. Nothing here is silently resolved — both readings stay on record | Engineer, one line (same ask as the treating elevator's own Machine 3 row): is the chain speed 10.08 m/min or ~20.5 m/min, or is the bucket pitch finer than 196-over-120m implies? Resolving it resolves both machines' rows at once, since they share the one spec block | No — `ceilingM3PerSec` and the transit lag are both derived independently of the disputed bucket-pass-rate figure (see "Assumption in use"), so this conveyor's own modelled behaviour doesn't move either way |
| `pendulumConveyor` (`52.604.E00`) | Derivation-method inconsistency with `treatingElevator`, both now sourced from the same sheet 52-13 spec block | `treatingElevator`'s own `distanceM` (8.731 m) is the rise alone — built first, from a low-confidence screenshot reading that never captured the block's horizontal runs (`REAL_LINE_SPECS.md` §8, "MED/LOW, screenshot-sourced"). `pendulumConveyor`'s `distanceM` (31.087 m) is the full carrying-side path — lower horizontal + rise + upper horizontal — because by the time this machine was built the same spec block was confirmed at PDF-text-layer confidence and gives all three run lengths, not just the height. Both are correct given what was known when each was written; nobody has gone back to redo the treating elevator's own figure now that the fuller reading exists | Nothing to ask the engineer — this is an internal modelling consistency question, not a plant fact. Whoever next touches `treatingElevator` should decide whether to re-derive its `distanceM` the same way (rise + both horizontals, using the treating elevator's own "not captured (cut off)" upper-horizontal gap in `REAL_LINE_SPECS.md` §8 — still genuinely missing, not just unused) | No for the demo itself — `treatingElevator`'s own transit (~52 s from rise alone) is unaffected either way, and both machines' current figures are internally consistent with their own provenance. **Yes** if a future reader assumes the two machines' `distanceM` fields are computed the same way and reconciles them without noticing this row |

## Machine 9: the outload branch completes — router, destination selector, metal bin trips (issue #47)

The outload diverter (`router`) and the packaging conveyor's own outlet selection
(`routedTransportDelay`) are new primitives; the two metal bins reuse the accumulator
behaviour unchanged (issue #18, a fifth and sixth configuration). What's genuinely open
is the same shape every other bin's own working volume gap has taken — no document
gives it — plus one item the FD is explicit was never captured at all.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `metalBin1` / `metalBin2` (`52.613.H00`/`H01`) | Working volume — the FD names an LT0 level transmitter on each bin but no capacity figure (`PLC_FUNCTIONAL_DESCRIPTION.md` §12: "Metal bin, Flexicon pre-bin, Concetti pre-bin working volumes: not given") | 6 m3 each, assumed; `lineData.js` `sim.capacityM3`, `provenance: "assumed"`. Larger than the outload buffer bin upstream (4.51 m3) since these are the line's own terminal storage awaiting a truck, not an in-process buffer — a demo-paced choice, not a plant fact | Engineer or the operational spec: a real working volume for either bin | No — the demo's point is that a full destination trips the conveyor and the cascade runs backward from there, which holds at any capacity; only the on-screen fill rate and time-to-trip would move |
| `metalBin1` / `metalBin2` | Discharge (truck loadout) — no document covers the gate logic, only that `52.613.V00`/`V01` are *inlet* gates (`REAL_LINE_SPECS.md` §12 item 3, `PLC_FUNCTIONAL_DESCRIPTION.md` §8.4) | Not modelled at all: both bins only ever fill (their own downstream, `dischargeStub1`/`dischargeStub2`, isn't sim-enabled, so the accumulator's own reverse-pass discharge cap is always 0). Emptying either bin is the presenter's own affordance (PlantControls.jsx's EMPTY BIN button, reusing `setAccumulatorLevel(sim, id, 0)` — the same call the level-jump slider already makes) | Engineer, one line: what actually discharges a full metal bin — a gate, a screw, gravity to a rail car? | No — out of scope by design; the acceptance criteria explicitly ask for a presenter affordance here, not modelled gate logic |
| `metalBin1HighTrip` / `metalBin2HighTrip` interlocks | Trip set point and ramp time | 85%/35% (mirrors every other bin's own LSH/LSL), signal delay **5 s [CONFIRMED, FD §5]**, ramp time 0.5 s — the FD classifies this a genuine **Trip** ("stops the device immediately, no shutdown procedure"), unlike the treater pre-bin's own engineer-described graduated VFD ramp, so a near-instant ramp is used rather than a multi-second one | Set point: nothing to absorb, same reasoning as every other bin's LSH/LSL (operator-adjustable SCADA configuration). Ramp time: no FD number for "immediately" in seconds; assumed near-zero | No — the demo's point is that the trip is abrupt compared to the pre-bin's own graduated response, which holds at any near-zero ramp |
| (whole outload branch) | Switching destination mid-run is a deliberate presenter affordance, off-spec: the real plant only selects a destination at sequence start (`PLC_FUNCTIONAL_DESCRIPTION.md` §4, the pre-checks) | Permitted at any time via `setDestination` (engine.js); recorded here the same way the auto-reopen convention was (see the buffer bin's own resolved row above) — a presenter should not claim this reflects real plant operation | Neither — a deliberate, documented departure from the real sequence, made for the transport-lag demonstration it enables | No — this is a presenter feature, not a plant-behaviour claim |
| `pendulumConveyor` (`52.604.E00`) | Per-outlet transit distance — the three pneumatically selected outlets sit at different points along the belt's own carrying-side run (`outBuffer`, `outBinSeg`, `outConcetti` anchor at x:240/1120/1745 of 1750 in `lineData.js`, roughly a quarter, two-thirds and the full length along), but no document gives each outlet's own physical distance from the infeed — caught while asserting whole-line conservation across every route at once (issue #52), not by any one branch's own build | `routedTransportDelay` (`src/sim/behaviors.js`) uses a single `distanceM` (31.087 m, the full carrying-side path) for every packet regardless of which outlet it's routed to — so material bound for `outBuffer`, physically the nearest outlet, is modelled with the same transit lag as material bound for `outConcetti`, the farthest. Conservation still holds either way (issue #52's own whole-line test exercises all three), only the relative timing between destinations is off | Engineer or the operational spec: each outlet's own along-belt distance from the infeed, so a per-port `distanceM` could replace the single shared one | No for the demo's own point (every destination still receives everything fed to it, correctly delayed, and switching destinations mid-run still conserves) — **would become load-bearing** if a future demo wants to show the three destinations arriving at visibly different, physically-derived lag times rather than all three sharing one number |

## Machine 10: the Flexicon big-bag branch completes (issue #48)

Almost every machine on this branch is configuration of an existing behaviour: the
auto sampler reuses `passThrough` (issue #22's own reuse claim), the pre-bin reuses
`accumulator` (issue #18, a seventh configuration), the vibrating conveyor reuses
`meteredFeeder` (issue #20), the roller-conveyor run reuses `passThrough` again, and
the terminus reuses `terminalSink` (issue #26), gaining an optional bag-counting field
(`bagSizeM3`, `src/sim/behaviors.js`) rather than a new kind. The one genuinely new
configuration is the filling head reusing `batchCycle` (issue #24) a third time
(after the batch treater and — not yet built — the Concetti filler), and the pre-bin's
own high-level trip reuses `thresholdStopTrip`/`armedWhen` (issue #47) with a single
arming condition instead of two. The Functional Description is a control document and
carries no equipment sizing for this package at all — it is explicitly out of the FD's
own scope — so every number below is assumed, not just imprecise.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `flexiconPreBin` (`52.701.H00`) | Working volume — the FD names an LT0/LSH0/LSL0 instrument set on this bin but no capacity, the same "not given" gap the two metal bins' own working volumes hit (`PLC_FUNCTIONAL_DESCRIPTION.md` §12) | 2.5 m3, assumed; `lineData.js` `sim.capacityM3`, `provenance: "assumed"`. Sized as an in-process buffer ahead of a discrete pull (the filling head's own one-bag charge), closer in scale to the treater pre-bin (1.63 m3) than to a 6 m3 metal bin — these aren't terminal storage awaiting a truck | Engineer or the operational spec: a real working volume for this bin | No — the demo's point (a full pre-bin trips the conveyor, the cascade runs backward from there) holds at any capacity; only the on-screen fill rate and time-to-trip would move |
| `flexiconPreBin` | LSH0/LSL0 set points | 85% / 35%; live sliders, `interlocks[].lowSetpoint`, `provenance: "assumed"`. Demo starting fill level: **resolved (issue #55)** — starts empty (0%), no `sim.initialLevelFraction` authored | **Nothing to absorb [FD 2026-08-05]**, same reasoning as every other bin on the line: operator-adjustable SCADA configuration | No, same reasoning as every other bin's LSH/LSL |
| `flexiconPreBinHighTrip` interlock | Trip set point and ramp time | 85%/35% (mirrors every other bin's own LSH/LSL), signal delay **5 s [CONFIRMED, FD §5]** — the FD's own cause-and-effect matrix names this exact row, `52.701.H00.LSH0` → conveyor `52.604.E00` "if selected" → 5 s → drum feeders, the third of the four destination interlocks the table lists (the first two, both metal bins, landed with issue #47) — ramp time 0.5 s, assumed near-zero, same reasoning as the metal bins' own trips | Set point: nothing to absorb. Delay: answered. Ramp time: no FD number for "immediately" in seconds; assumed | No — the demo's point is that the trip is abrupt, which holds at any near-zero ramp |
| `flexiconFillingHead` (`52.703.L00`) | Bag size — the Flexicon package sits entirely outside the FD's own scope; no document gives a real figure | 1.0 t (≈1.389 m3 at the confirmed 0.72 t/m3 bulk density), assumed; `lineData.js` `sim.chargeM3`, `provenance: "assumed"`. "One-tonne big bags" is a common real-world FIBC rating, not a plant fact sourced from any drawing or the FD | Engineer or the operational spec: the actual Flexicon package's rated bag size | **Yes** — unlike most of this line's assumed capacities, the charge size directly sets how much material one discharge pulse moves and how long charging takes at any given feed rate; a real bag size well off 1.0 t would change the on-screen fill cadence, not just a fill-rate cosmetic |
| `flexiconFillingHead` | Fill time — the actual dwell a real filling head needs (settle, weigh, tie) beyond the raw material transfer already modelled by the pre-bin/conveyor's own physics | 45 s, assumed; `lineData.js` `sim.phases[0].durationSec`, `provenance: "assumed"` — same single-unsplit-phase shape the batch treater's own `phases` array already uses (issue #24), chosen so a future breakdown is a data edit, not a restructuring | Engineer or the operational spec, or (per the batch treater's own precedent) ultimately the equipment supplier, since the PLC treats a filling head as a start/stop object internally, the same reasoning `batchTreater`'s own Machine 5 row gives | No — the demo's point is that a batch pulses in and out on a real dwell, which holds across the plausible range of this number; only the on-screen cadence would move |
| `flexiconFillingHead` | Bag-change dead time — the seconds a real operator/mechanism loses swapping an empty bag onto the head before the next charge can start | **Explicitly out of scope for this ticket, not modelled at all.** `batchCycle`'s own discharge-to-charging transition is already immediate (`src/sim/behaviors.js` `applyBatchCycle`), so the head fills continuously rather than losing any time between bags — a deliberate simplification, not an oversight | Engineer, if a future ticket wants to model it: how long does a real bag change actually take, and does the head accept a fresh charge before or only after a new bag is fitted? | No for this ticket, by its own acceptance criteria — would become load-bearing the moment a future demo wants to show bag-to-bag cadence realistically, since continuous filling currently overstates real throughput by however long a bag change actually takes |
| `bigBagStub` (branch terminus) | Presenter-facing display capacity, for the fill bar's own 0..1 scale (no physical meaning — same convention as `discardBin`'s own `displayCapacityM3`, issue #26) | 10 m3 (a handful of bags), assumed; `lineData.js` `sim.displayCapacityM3`, `provenance: "assumed"` | Neither — demo-only choice, nothing to absorb | No |
| `vibratingConveyor` (`52.702.C00`) | Rate range — no document gives this conveyor's own metering range | 0-20 t/h, the drum feeders' own confirmed range reused as a plausible presenter-settable band, default 10 t/h; `lineData.js` `sim.rateM3PerSec`, `provenance: "assumed"` | Engineer or the operational spec | No — the demo's point is that a metered feeder draws at a settable rate, which holds at any range; only the on-screen fill cadence would move |

## Machine 11: the Concetti bagging branch completes (issue #49)

The fourth and last outload destination, closing every route on the line. The auto
sampler, the filling & sewing head and the palletiser all reuse `passThrough` (issue
#22's own reuse claim, a fourth/fifth/sixth application), the pre-bin reuses
`accumulator` (issue #18, an eighth configuration), the bagging scale reuses
`batchCycle` (issue #24) a fourth time, and the terminus reuses `terminalSink`'s
bag-counting field (issue #48's own `bagSizeM3` addition). The pre-bin's own
high-level trip is the fourth and last row of the FD's own destination-interlock
table (`PLC_FUNCTIONAL_DESCRIPTION.md` §5) — the cascade the parent spec (#43) names
as the whole project's central argument. As the FD itself states, the Concetti line
past its own pre-bin `52.705.H00` is a vendor package entirely outside this PLC's
scope (`PLC_FUNCTIONAL_DESCRIPTION.md` §12: "Concetti sustained bagging rate: not
given"), so — as with the Flexicon branch — every number below is assumed or, at
best, an unconfirmed worksheet figure, not a document fact.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `concettiPreBin` (`52.705.H00`) | Working volume — sheet 52-14 gives a drawing reading of ~0.72 m3, but flagged **LOW confidence** on the worksheet itself, not a document-confirmed figure the way the metal bins' tags are (`REAL_LINE_SPECS.md` §7) | 0.72 m3, used as the assumed value per the parent issue's own instruction to assume it and flag it, rather than trusted as confirmed; `lineData.js` `sim.capacityM3`, `provenance: "assumed"` | Engineer or the operational spec: a real working volume for this bin | No — the demo's point (a full pre-bin trips the conveyor, the cascade runs backward from there) holds at any capacity; only the on-screen fill rate and time-to-trip would move |
| `concettiPreBin` | LSH0/LSL0 set points | 85% / 35%; live sliders, `interlocks[].lowSetpoint`, `provenance: "assumed"`. Demo starting fill level: **resolved (issue #55)** — starts empty (0%), no `sim.initialLevelFraction` authored | **Nothing to absorb**, same reasoning as every other bin on the line: operator-adjustable SCADA configuration | No, same reasoning as every other bin's LSH/LSL |
| `concettiPreBinHighTrip` interlock | Trip set point and ramp time | 85%/35% (mirrors every other bin's own LSH/LSL), signal delay **5 s [CONFIRMED, FD §5, line 269]** — the FD's own cause-and-effect matrix names this exact row, `52.705.H00.LSH0` → conveyor `52.604.E00` "if selected" → 5 s → drum feeders, the fourth and last of the four destination interlocks the table lists (the first three landed with issues #47 and #48) — ramp time 0.5 s, assumed near-zero, same reasoning as every other bin's own trip on this conveyor | Set point: nothing to absorb. Delay: answered. Ramp time: no FD number for "immediately" in seconds; assumed | No — the demo's point is that the trip is abrupt, which holds at any near-zero ramp |
| `concettiScale` (bagging scale, `TBC-16`) | Bag size — the Concetti package sits entirely outside the FD's own scope (`PLC_FUNCTIONAL_DESCRIPTION.md` §12); no document gives a real figure | 50 kg (≈0.069 m3 at the confirmed 0.72 t/m3 bulk density), assumed; `lineData.js` `sim.chargeM3`, `provenance: "assumed"`. A plausible small-bag rating for treated seed, deliberately distinct in scale from the Flexicon head's own 1 t big-bag charge (`flexiconFillingHead`, issue #48) — "small bags" is the parent issue's own wording for this branch | Engineer or the operational spec: the actual Concetti package's rated bag size | **Yes** — the charge size directly sets how much material one discharge pulse moves and how long charging takes at any given feed rate; a real bag size well off 50 kg would change the on-screen fill cadence, not just a cosmetic |
| `concettiScale` | Sustained bagging rate — sheet 52-14 gives ~12 t/h, but flagged unconfirmed on the worksheet itself (`REAL_LINE_SPECS.md` §7: "rate unconfirmed on worksheet... no longer believed to be the line bottleneck — the treater is") | 12 t/h, used as the assumed value per the parent issue's own instruction. Cycle time is *derived* from this rate against the assumed 50 kg bag size (50 kg / 12 t/h = 15 s), not independently assumed; `lineData.js` `sim.phases[0].durationSec`, `provenance: "derived"` | Engineer or the operational spec: a confirmed sustained bagging rate | No — the treater, not this scale, is the line's own confirmed bottleneck (`REAL_LINE_SPECS.md` §7), so the demo's point doesn't depend on this rate being exact; only the on-screen cadence would move |
| `concettiScale` | Bag-change dead time — the seconds a real operator/mechanism loses swapping an empty bag onto the scale before the next charge can start | **Explicitly out of scope for this ticket, not modelled at all**, the same treatment as the Flexicon filling head's own equivalent row. `batchCycle`'s own discharge-to-charging transition is already immediate (`src/sim/behaviors.js` `applyBatchCycle`), so the scale cycles continuously rather than losing any time between bags | Engineer, if a future ticket wants to model it | No for this ticket, by its own acceptance criteria — same reasoning as the Flexicon head's own row |
| `palletStub` (branch terminus) | Presenter-facing display capacity, for the fill bar's own 0..1 scale (no physical meaning — same convention as `discardBin`'s and `bigBagStub`'s own `displayCapacityM3`) | Ten bags' worth (≈0.69 m3), assumed; `lineData.js` `sim.displayCapacityM3`, `provenance: "assumed"` | Neither — demo-only choice, nothing to absorb | No |

## Machine 12: Simatek elevator feed-rate formula constant (issue #57)

Issue #56 specifies `TPH = Speed% x Gate% x k`, matching the plant's own commissioning
spreadsheet (`Elevator_Feed_Rate_Calculator_v4_UPDATED.xlsx`, user-supplied 2026-08-19,
read-only, not to be edited) and gives two of the spreadsheet's own worked examples
(85%x55% ~= 13.92 TPH on the Yellow Bin/treating sheet; 95%x65% ~= 18.38 TPH on the Red
Bin/Concetti sheet) plus the claim that `k` is the exact same constant on both sheets —
an artifact of the spreadsheet hardcoding its own "buckets per metre" constant
identically on both despite their differing actual bucket pitch. The xlsx itself was
never attached to this repo, only quoted in the issue, so `k` couldn't be read off the
sheet directly.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treatDrumFeeder`/`inletDrumFeeder1`/`inletDrumFeeder2` (`simatekFeedRateTph`, `src/sim/units.js`) | The exact value of `k` | **29.77, derived, not read off the sheet.** It's the constant that reproduces both of the issue's own worked examples to the 2 decimal places quoted (13.92 and 18.38) — any value in roughly [29.7647, 29.7733) rounds the same way, and 29.77 is the tidy point in that range. `src/sim/units.js` `SIMATEK_FEED_RATE_K` | Engineer or the source spreadsheet itself, attached to the repo | No for issue #57 — this ticket only establishes the formula and its test fixtures, wiring nothing live yet. **Possibly yes once #56 wires the band schedule**: the derived per-band (Speed%, Gate%) pairs all scale off this same `k`, so a materially different real `k` would shift every band's actual commanded gate/speed position, though not the target TPH each band demonstrates (that's fixed by the schedule table, independent of `k`) |

## Machine 4 update: the treater pre-bin's graded feed schedule replaces the two-stage throttle and the feeder auto-start (issue #60)

Wires #58's `gradedFeedSchedule` rule kind and #59's continuous rate derivation onto the real `treaterPreBin`/`treatingElevator`/`treatDrumFeeder` triple, superseding both `preBinSlowStopTrip` (`twoStageThrottle`, Machine 4 above) and `treatingElevatorRunningAutoStart` (`autoStartOnRunning`, Machine 2 above) — the old auto-start rate row's own "load-bearing" flag (Machine 2, and the 14.4-vs-12-t/h row under Machine 5) is now moot: nothing auto-starts the feeder at a flat rate any more, the schedule commands the elevator's speed and the feeder's gate continuously from t=0. Both superseded rule kinds stay in `src/sim/control.js` as generic, independently tested primitives (`control.test.js`); only `lineData.js`'s own use of them changed.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `preBinFeedSchedule` interlock | LSL/LSH/LSHH set points | 35% / 85% / 95%, **confirmed sensor positions per issue #56 directly** (`lineData.js` `interlocks[].lowSetpoint`/`highSetpoint`/`highHighSetpoint`) — LSH's own value is unchanged from the old `stop.setpoint` it replaces as a control input; it now backs only the schedule's own normal↔throttle band boundary and its own display-only instrument dot, no separate action | Resolved | No |
| `preBinFeedSchedule` interlock | Each band's own signal delay and ramp time (boost/normal/throttle, 3 s / 4 s each) | Assumed, carried over unchanged from the old slow stage's own assumed figures (Machine 4 above) — no FD or worksheet number backs any of the three bands' own timing, same as the two-stage throttle's slow stage it replaces | Engineer, if ever asked | No — same reasoning as the old slow stage's own row: only the on-screen timing would move |
| `preBinFeedSchedule` interlock | Trip delay and ramp time (LSHH → elevator stop) | Delay **5 s, confirmed**, re-sensored unchanged from the old stop stage's own FD-backed figure (`52.507.H00.LSH0` → 5 s → elevator `52.506.E00`); ramp **6 s, assumed**, also carried over unchanged | Resolved (delay); demo-only (ramp) | No |
| `preBinFeedSchedule` interlock | Each band's own (Speed%, Gate%) pair | **Derived**, not independently assumed: the pre-bin's own nominal (85% speed / 55% gate, per issue #56) scaled by `sqrt(targetTph / nominalTph)` for each band's own target (14/12/6 TPH) — reproduced exactly by `units.test.js`'s own worked band examples, so a future change to the nominal point or to `k` (Machine 12 above) propagates by re-deriving these, not hand-editing them | Resolved (formula); the nominal point and `k` remain the underlying assumptions (see Machine 12 above and issue #56 itself) | Only as load-bearing as the nominal point and `k` already are |

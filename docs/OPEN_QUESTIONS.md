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
| `treaterBufferBin` | Demo starting fill level (55%) | Not a plant fact — chosen so the bin visibly has both headroom and stock at t=0; `lineData.js` `sim.initialLevelFraction`, `provenance: "assumed"` | Neither — demo-only choice, nothing to absorb from the spec | No |
| `treaterBufferBin` | Working-volume→mass conversion, needed the moment any readout is in tonnes | **Already resolved by issue #18, not by the FD.** `BULK_DENSITY_T_PER_M3 = 0.72` has been in `src/sim/units.js` since #18 merged, derived from the buffer bin and bin segment (both confirmed 2026-06-30). This row was left open in error; the FD (2026-08-05) adds a third independent bin agreeing to within 1%, corroborating the value already in code | Resolved (was resolved in #18; this register just wasn't updated to say so) | No, and never was |

## Machine 1 control: buffer bin closes the source valve, late (issue #19)

The engineer confirmed the interlock itself (buffer bin full → close the yellow-bin valve). Its timing values were not asked about, since #18 already logged the LSH/LSL set points as low-sensitivity. They matter more now that the demo's whole point is the size of the overshoot they produce, but the *behaviour* (a trip closes late and overshoots) holds across the whole plausible range of each value, so none of these block building — only the exact on-screen overshoot size would move.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treaterBufferBin` | LSH set point (supersedes the #18 row above, now that #19 reads it) | 85% of the 7.7 m³ working volume; live slider, `lineData.js` `interlocks[].highSetpoint`, `provenance: "assumed"` | **Nothing to absorb [FD 2026-08-05]**: operator-adjustable on the SCADA analog faceplate, so "assumed" is as good as it gets and the slider is the honest representation | No — the demo's point is that a trip overshoots, not the exact percentage; dragging the slider is the presenter's answer to "what if the sensor were further upstream" |
| `treaterBufferBin` | LSL set point (supersedes the #18 row above) | 35% of working volume; live slider, `lineData.js` `interlocks[].lowSetpoint`, `provenance: "assumed"` | **Nothing to absorb [FD 2026-08-05]**, same reason, but see the reopen row below, which questions whether this set point should drive anything at all | No, same reasoning as LSH |
| `bufferBinHighTrip` interlock | Signal delay — the real PLC scan interval plus any deliberate alarm debounce between the level switch tripping and the yellow-bin valve receiving a close command | **7 s (applied 2026-08-05)**; live slider, `lineData.js` `interlocks[].signalDelaySec`, `provenance: "confirmed"` | **ANSWERED [FD 2026-08-05]: ~7 s.** `LSH0` → **5 s** → elevator `52.414.E00` trips → **1 s** → vibratory feeders trip → **1 s** → bin outlet valves close (PLC_FD §5) | No — the demo's point is that overshoot grows with delay, not this specific value; the default was wrong by half and has been corrected |
| `bufferBinHighTrip` interlock | ~~Reopen (low-trip) signal delay~~ **Superseded: whether an automatic reopen exists at all** | The sim reopens the valve when the level falls past `lowSetpoint`, sharing the single `signalDelaySec` | **ANSWERED, and the answer is no [FD 2026-08-05].** A high-level event is a **trip**; the FD states a tripped device "needs to be reset via the SCADA before the device will be able to start again". The buffer bin's `LSL0` is an *Information* alarm and appears in no interlock or trip table. The real line stays stopped until an operator intervenes | **Yes: this is a correctness gap, not a precision gap.** The auto-reopen is a modelling convenience. It should either be relabelled as an operator reset in the UI, or the presenter should be briefed not to describe it as automatic. The honest story ("it trips, it overshoots, and it *stays* down") is a stronger delayed-cascade narrative, not a weaker one |
| `upstreamStub` (in-sim stand-in for the real yellow-bin valve) | Close/open ramp time — how long the valve's actuator takes to fully shut or reopen once commanded | 6 s, shared by both directions; `lineData.js` `interlocks[].action.rampTimeSec`, `provenance: "assumed"` — not yet exposed as a slider, since the acceptance criteria only calls for signal delay and the two set points to be live | **Nothing to absorb [FD 2026-08-05]** — start/stop delays and monitoring times are per-device commissioning parameters on the faceplate; there is no single documented figure | No — the demo's point is that *some* nonzero ramp time exists and lets material keep arriving, not its exact duration |

## Machine 2: inlet drum feeder meters the buffer bin's discharge (issue #20)

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treatDrumFeeder` (real tag now known: **`52.505.L00`**) | Percentage-opening → flow-rate mapping. The engineer was explicit the real drum feeder is not proportional — ten percent opening does not mean ten percent of range, and forty percent might land around 12 t/h — and referred to a spreadsheet of estimated values that was never sent | Linear opening → rate mapping assumed across the confirmed 2-20 t/h range; the sim exposes the feeder as a direct rate control rather than a percentage dial. Documented in `lineData.js`'s `treatDrumFeeder` comment (not a numbered field, so not under `sim.provenance`) | The engineer's spreadsheet of estimated values (referenced, not yet sent). **[FD 2026-08-05] explains the mechanism but gives no numbers**: two actuators A/B (`ZS13`/`ZS14`) driving **two discrete opening-degree positions** (`XV4`/`XV5`). So the real control may not be a continuous dial at all, but a two-position selector | **Yes, still the line's one genuinely load-bearing gap**, and the FD sharpens it: if the feeder really has only two discrete positions, a continuous 2-20 t/h slider is the wrong *control affordance*, not just the wrong curve. Worth asking alongside the spreadsheet |
| `treatDrumFeeder` | Start condition — the engineer confirmed the real feeder starts as soon as the bucket elevator is confirmed running | **Modelled, issue #42**: `treatingElevatorRunningAutoStart` interlock (`src/line/lineData.js`, kind `autoStartOnRunning`, `src/sim/control.js`) commands the feeder to a configured rate the instant the elevator reads as running, replacing the staged rate-slider workaround | **Confirmed exactly [FD 2026-08-05]**: process interlock "Simatek Bucket Elevator (`52.506.E00`) not Running" on `52.505.L00`, with a 1 s failure delay. The engineer's recollection was precise | No — the demo's point for #20 is the fill/draw balance, not the auto-start trigger |
| `treatingElevatorRunningAutoStart` interlock | **"Confirmed running" signal** — the FD names the interlock's existence and its 1 s failure delay (for the elevator *stopping*, which trips the feeder off — still unmodelled), but never says what actually asserts "running" in the first place: an immediate command-issued flag, a motor run-proof switch, or something that only asserts once the chain reaches full commanded speed | **Assumed [#42]**: the elevator's own commanded speed (manual VFD dial × interlock throttle) settled at a nonzero value — `confirmedRunning` in `src/sim/behaviors.js`. In practice this means "elevator running" from t=0 (both fractions default to 1, already settled), the same instant the elevator would be confirmed running on a real cold start with nothing holding it back | Engineer, one line: what is the actual "elevator confirmed running" signal at 52.505.L00's PLC input? | No — every plausible reading of "running" (command-issued, run-proof switch, settled speed) agrees on the ordinary case this demo shows: the elevator is running well before the feeder would ever need to start, so the auto-start fires effectively immediately regardless of which signal is the real one |
| `treatingElevatorRunningAutoStart` interlock | Auto-start rate — no engineer-given number for what rate the feeder auto-starts at, only the confirmed 2-20 t/h operating range | 12 t/h, assumed [#42], matching the line's own confirmed sustained rate (REAL_LINE_SPECS.md §9-10) rather than an arbitrary point in the range; `lineData.js` `interlocks[].rateM3PerSec`, `provenance: "assumed"` | Engineer or the spreadsheet of estimated values referenced in the drum feeder's own row above | No — the demo's point is that the feeder starts itself, not the exact rate it starts at; a presenter's own rate slider (`setFeederRate`) still overrides it live |

## Newly raised by the Functional Description (issue #21+ territory)

Not gaps in what the engine reads today, but things the engine will have to
decide about as soon as the treating elevator and treater land. Logged here so
they are not rediscovered later.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| (whole line) | Three **utility sequences** (red dust filter `52.808.S00`, cyclofan `52.807.S00`, conditioning compressor `51.900.S00`) are hard prerequisites; any one stopping trips the entire line at 1 s | Not modelled at all; no utility machines exist in `lineData.js` | Nothing further needed, the FD is complete on this | No for now, but it is a ready-made second interlock story if the demo ever wants one that is not level-driven |
| ~~`batchTreater` (`52.508.T00`) | Batch phase breakdown (fill / treat / discharge split of the ~40 s cycle) and what happens to a batch mid-cycle when downstream blocks~~ | ~~Modelled as a steady 14.4 t/h rate, not a batch cycle~~ | **Superseded, issue #24 — see the dedicated section below.** The treater is now sim-enabled as a real batch cycle; the phase breakdown itself is still open, and downstream-blocked behaviour is now built (the discharge pulse waits rather than losing the charge) | Superseded |
| `treatingElevator` (`52.506.E00`) | ~~Transport lag: carrying-side transit is either ~3 min or ~6 min~~ **Landed 2026-08-05, issue #21 — see the dedicated section below.** | Now modelled: `distanceM: 8.731`, `speedMPerMin: 10.08` (the drawing's stated figure, not the ~20.5 m/min alternate) | See below | Superseded by the row below, which is more precise now the machine is built |
| `topConveyor` | Whether it exists as a separate machine at all, or is the upper horizontal run of pendulum conveyor `52.604.E00` with pneumatically selected outlets | **Retagged 2026-08-05** from `52.605.X00` (reassigned in code to `concettiSampler`, matching the FD) to a placeholder `TBC-21`, pending this question. Still modelled as a distinct conveyor in the scene graph — topology unchanged, only the tag was corrected | Engineer, one line. See `PLC_FUNCTIONAL_DESCRIPTION.md` §8.3 | **Yes for the scene**, no for the flow: it changes what is drawn and how the three branches are labelled, not how material moves |
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
| `treaterPreBin` | LSH0/LSL0 set points, demo starting fill level (40%) | 85% / 35% / 40%; live sliders, `lineData.js` `sim.initialLevelFraction` and `interlocks[].lowSetpoint`, `provenance: "assumed"` | **Nothing to absorb [FD 2026-08-05]**, same reasoning as the buffer bin (issue #19): operator-adjustable SCADA configuration | No — same reasoning as the buffer bin's own LSH/LSL rows |
| `preBinSlowStopTrip` interlock | Stop stage set point and delay | Set point 85% (assumed, mirrors LSH0's role); delay **5 s [CONFIRMED, FD 2026-08-05]**: `52.507.H00.LSH0` → 5 s → elevator `52.506.E00` (`PLC_FUNCTIONAL_DESCRIPTION.md` §5) | Set point: nothing to absorb (operator-adjustable). Delay: answered | No |
| `preBinSlowStopTrip` interlock | Slow stage set point, delay, target speed and ramp time | Set point 60%, delay 3 s, target 50% speed, ramp 4 s — all assumed; `lineData.js` `interlocks[].slow`, `provenance: "assumed"` | **Engineer's own worksheet answer names the response ("first slow down, then stop") but no number** (`docs/treater-line2-filled-20260630 (1) (1).md` §6); the FD doesn't separate a slow stage from the trip at all, calling the whole thing one event | No — the demo's point is that a graduated response overshoots less than a hard stop, which holds across the plausible range of the slow stage's own numbers; only the on-screen timing would move |
| `preBinSlowStopTrip` interlock | Recovery ramp time (elevator back to full speed once the bin drains) | 5 s, assumed; not backed by any number since, per the buffer bin's own reopen row, the FD's automatic-reopen caveat likely applies here too — a tripped device needs a SCADA reset, so this recovery is the same modelling convenience, not confirmed plant behaviour | Neither — demo-only choice | No |

## Machine 5: batch treater takes 160 kg every 40 seconds (issue #24)

The treater reuses no existing behaviour — it's the first machine on a new primitive, `batchCycle` (`src/sim/behaviors.js`), the one the parent spec (issue #15) names as the largest reuse win: the same behaviour is meant to serve the Concetti bagging scale, the Concetti filler and the Flexicon big-bag filling head later. Two items are recorded here rather than resolved, exactly per the parent issue's instruction not to invent a phase split or quietly pick a number for the rate mismatch.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `batchTreater` (`52.508.T00`) | Fill / treat / discharge phase breakdown of the ~40 s cycle | Modelled as a single unsplit phase — `lineData.js` `sim.phases` holds exactly one entry (`{ name: "cycle", durationSec: 40 }`), and the `batchCycle` behaviour only ever sums the array, never reads an individual phase, so a future split is a data edit, not a restructuring | **Supplier (Niklas), not the engineer [FD 2026-08-05, carried over from the "Newly raised by FD" section above]**: the PLC treats the treater as a plain start/stop object with a pressure transmitter, so batching is entirely internal to the machine. Stop asking the engineer for this | Not yet — the demo's point is that a batch pulses in and out, which holds however the 40 s is internally divided; becomes load-bearing only if a future demo wants to show a specific sub-phase (e.g. "still treating, won't accept a new charge yet") |
| `batchTreater` (`52.508.T00`) | **The 14.4 vs 12 t/h mismatch.** 160 kg every ~40 s is ≈14.4 t/h, but the engineer separately named ~12 t/h as the line's sustained rate with the treater as the slowest point (`REAL_LINE_SPECS.md` §9-10, "the choke-point story") | Both of the engineer's own confirmed figures are used unchanged and literally: `chargeM3` (0.16 t / 0.72 t/m³ ≈ 0.222 m³) and `phases[0].durationSec` (40 s) reproduce the 14.4 t/h reading exactly; nothing is derated to force a 12 t/h average. The gap is not split, averaged, or resolved by picking one number over the other | Engineer, one line: is 40 s the batch's own cycle time, or does it already include periodic downtime (waiting on the pre-bin, chemical dosing, downstream blocking) that the 12 t/h figure has already netted in and the 40 s figure hasn't? | **Yes.** If 12 t/h is the real ceiling, either the cycle is longer than 40 s in practice or the charge is smaller than 160 kg on average — either way the on-screen batch cadence would need to change to match; today's model runs faster than the line's own stated sustained rate |

## Machine 6: treater after-bin holds the next batch (issue #25)

The after-bin reuses the accumulator behaviour unchanged (the third reuse; `src/sim/behaviors.js` gained nothing new for it) and introduces `holdNextBatch`, the third distinct response to a full bin on this line, alongside `thresholdTrip` (#19) and `twoStageThrottle` (#22). The FD independently confirms both the interlock and its trip delay, which is more than either of the other two bins' trips had at build time.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treaterAfterBin` | Working volume | **0.67 m³** [CONFIRMED 2026-06-30, `REAL_LINE_SPECS.md` §5] | Resolved | No |
| `treaterAfterBin` | LSH0/LSL0 set points, demo starting fill level (30%) | 60% / 20% / 30%; live sliders, `lineData.js` `sim.initialLevelFraction` and `interlocks[].lowSetpoint`, `provenance: "assumed"` | **Nothing to absorb [FD 2026-08-05]**, same reasoning as the buffer bin (#19) and pre-bin (#22): operator-adjustable SCADA configuration | No, with one caveat below — unlike the other two bins, 60% isn't an arbitrary echo of the buffer bin's 85%: a single charge (0.222 m³) is ~33% of this bin's own capacity, so an 85%-style set point would leave less headroom than one in-flight charge needs, and the accumulator's own backpressure (not a spill, but a stall) would kick in on every trip. 60% keeps the acceptance criterion ("never interrupts a batch part way through") true at the *default* charge size; a much larger batch size dragged live via the treater's own slider could still shrink that headroom below one charge — not tested, and not asked, since the demo's point (a full after-bin holds the next batch, not the current one) holds regardless of the exact number |
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

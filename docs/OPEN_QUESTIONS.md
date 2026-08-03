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

## Machine 1: source valve → metal remover → treater buffer bin (issue #18)

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treaterBufferBin` | LSH (level switch high) set point — the real trip point may sit below 100% of working volume, not at the physical cap | Reject only once fully full (100% of the 7.7 m³ working volume); no separate switch threshold yet — `src/sim/behaviors.js` `capacityAvailableAccumulator` | Operational spec | No — the demo's point is the fill/reject behaviour, not the exact percentage it trips at; issue #19 (the control interlock) is where the switch's own set point starts to matter |
| `treaterBufferBin` | LSL (level switch low) set point | Not read yet; nothing in issue #18 consumes it (it gates the downstream drum feeder's start, added in #20) | Operational spec | No, for this machine's scope |
| `upstreamStub` (in-sim stand-in for the real yellow-bin valve, which is itself out of sim scope) | Close time of the real yellow-bin valve once the buffer bin signals full | Instantaneous (0 s) — modelled as synchronous backpressure at `upstreamStub`, not a timed close (`src/sim/engine.js` reverse-pass capacity check) | Operational spec | No — issue #19 is where a nonzero close time would first change on-screen behaviour (the delayed-cascade demo hinges on interlock latency, not this valve's own close time) |
| `treaterBufferBin` | Demo starting fill level (55%) | Not a plant fact — chosen so the bin visibly has both headroom and stock at t=0; `lineData.js` `sim.initialLevelFraction`, `provenance: "assumed"` | Neither — demo-only choice, nothing to absorb from the spec | No |

## Machine 1 control: buffer bin closes the source valve, late (issue #19)

The engineer confirmed the interlock itself (buffer bin full → close the yellow-bin valve). Its timing values were not asked about, since #18 already logged the LSH/LSL set points as low-sensitivity. They matter more now that the demo's whole point is the size of the overshoot they produce, but the *behaviour* (a trip closes late and overshoots) holds across the whole plausible range of each value, so none of these block building — only the exact on-screen overshoot size would move.

| Machine | Gap | Assumption in use | Expected from | Load bearing? |
|---|---|---|---|---|
| `treaterBufferBin` | LSH set point (supersedes the #18 row above, now that #19 reads it) | 85% of the 7.7 m³ working volume; live slider, `lineData.js` `interlocks[].highSetpoint`, `provenance: "assumed"` | Operational spec | No — the demo's point is that a trip overshoots, not the exact percentage; dragging the slider is the presenter's answer to "what if the sensor were further upstream" |
| `treaterBufferBin` | LSL set point (supersedes the #18 row above) | 35% of working volume; live slider, `lineData.js` `interlocks[].lowSetpoint`, `provenance: "assumed"` | Operational spec | No, same reasoning as LSH |
| `bufferBinHighTrip` interlock | Signal delay — the real PLC scan interval plus any deliberate alarm debounce between the level switch tripping and the yellow-bin valve receiving a close command | 3 s; live slider, `lineData.js` `interlocks[].signalDelaySec`, `provenance: "assumed"` | Operational spec | No — the demo's point is that overshoot grows with delay, not this specific value; dragging the slider is the presenter's answer to "what if response were faster" |
| `bufferBinHighTrip` interlock | Reopen (low-trip) signal delay — whether the real PLC applies the same delay to the reopen command as to the close command, or none at all | Assumed to share the single `signalDelaySec` above rather than have its own value — simplest reading of "a signal delay" as one property of the interlock's signal path, not two | Operational spec | No — issue #19 only requires that the valve reopens when the level falls past the low switch, not the reopen's own latency |
| `upstreamStub` (in-sim stand-in for the real yellow-bin valve) | Close/open ramp time — how long the valve's actuator takes to fully shut or reopen once commanded | 6 s, shared by both directions; `lineData.js` `interlocks[].action.rampTimeSec`, `provenance: "assumed"` — not yet exposed as a slider, since the acceptance criteria only calls for signal delay and the two set points to be live | Operational spec | No — the demo's point is that *some* nonzero ramp time exists and lets material keep arriving, not its exact duration |

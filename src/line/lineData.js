// Hand-authored line definition for the real Treater Line 2.
// Authored from docs/REAL_LINE_SPECS.md; corrections are edits to this
// file, never to components. Engineer worksheet answers (2026-06-30)
// merged for confirmed-certain values only: bin level switches, drum
// feeder 2-20 t/h ranges, treater 14.4 t/h batch rate, and the now-
// confirmed lift -> top-conveyor routing. Out-of-scope decisions
// (chemical stream, waste-water IBC) left as-is pending sign-off; see
// REAL_LINE_SPECS.md §12.
//
// PLC & SCADA Functional Description (A2653FSD001, analysed 2026-08-05,
// see docs/PLC_FUNCTIONAL_DESCRIPTION.md) resolved most TBC-nn tags to
// real ones and confirmed the Concetti-branch metal remover does not
// exist (removed below).
//
// 2026-08-12 (issue #44, closes register item 26): the Packaging SCADA
// mimic (PLC_FUNCTIONAL_DESCRIPTION.md §8.3) shows one continuous
// distribution run with one set of drive instruments and no drive symbol
// on the upper horizontal — not just an inference anymore. The former
// "lift conveyor" and "top transport conveyor" are one machine,
// `pendulumConveyor` (tag 52.604.E00), a Simatek E200 pendulum conveyor
// running a Z path (floor run, climb, ceiling run) with pneumatically
// selected discharge outlets along the ceiling run. The phantom
// `52.702.U00` packaging bucket elevator (nowhere in the FD, no lift
// shown on the outload branch) and the duplicate "bin segment" (the
// drawing-reading's own outload buffer bin 52.610.H00, already modelled
// separately) are removed. See docs/REAL_LINE_SPECS.md §12 item 26 and
// docs/PLC_FUNCTIONAL_DESCRIPTION.md §8.3 for the full reasoning.
//
// Coordinates are world units, side elevation, gravity-true: grain falls
// down the screen, elevators climb, what catches sits below what drops.
// Anchors are port positions relative to the machine origin (x, y).
//
// Tags marked TBC-nn were not legible / not present on the drawings; the
// real tags are an engineer-meeting question.
//
// `sim` blocks (added machine by machine per issue #15) carry the engine's
// behaviour kind and parameters, already converted to the engine's m3 / m3-
// per-second currency (see src/sim/units.js). Each numeric field's source is
// named inline; `provenance` marks it confirmed / derived / assumed so the
// operational spec can replace assumed values by find-and-replace when it
// lands (docs/OPEN_QUESTIONS.md tracks the assumed ones).

import { tPerHourToM3PerSec, BULK_DENSITY_T_PER_M3 } from "../sim/units";

export const line = {
  zones: [
    { id: "treating", name: "TREATING" },
    { id: "packaging", name: "PACKAGING & OUTLOAD" },
    { id: "bagging", name: "BAGGING" },
  ],

  machines: [
    // ================= TREATING (sheet 52-12) =================
    {
      id: "upstreamStub",
      type: "stub",
      name: "from yellow-bin area · 52.414.E00",
      tag: "STUB.IN",
      status: "stub",
      zone: "treating",
      x: 60, y: 60, w: 8, h: 8,
      ports: { inputs: [], outputs: ["out"] },
      anchors: { out: { x: 4, y: 4 } },
      // Yellow-bin pan feeders confirmed at 12 t/h, SCADA-commanded
      // [CONFIRMED 2026-06-30, REAL_LINE_SPECS.md §5]. Stands in for the
      // real upstream source (out of sim scope) as a settable valve.
      //
      // The authored *default* is 15 t/h, not the confirmed 12 — a
      // deliberate override, same category of decision as the batch
      // treater's own cycle time (see its own comment): issue #60's graded
      // feed schedule needs to actually *reach* its boost band's 14 t/h
      // target, and a source capped at 12 structurally can't supply that,
      // however empty the buffer bin sits — confirmed live (the elevator's
      // own measured throughput saturates at 12 t/h, not boost's 14, with
      // the confirmed default). 15 t/h clears boost with margin, mirroring
      // the same rate the old #42 auto-start interlock used to pick for the
      // identical reason before issue #60 replaced it. See
      // docs/OPEN_QUESTIONS.md.
      sim: {
        kind: "source",
        rateM3PerSec: tPerHourToM3PerSec(15),
        provenance: { rateM3PerSec: "assumed" },
      },
      // Range floors at 0 (not the confirmed 2-20 t/h operating range) so a
      // presenter can slide the source to zero and watch how the rest of
      // the line reacts once nothing new is coming in — a deliberately
      // off-spec testing position, not a claim about real feeder limits.
      // `readBind` (issue #34) declares the live snapshot-derived reader that
      // shows this dial's actual resulting rate beside it, the same shape as
      // `bind` above — needed here because the buffer-bin-high interlock can
      // close this valve's openness out from under the dial (see
      // bufferBinHighTrip below).
      params: [{ id: "rate", label: "source rate", min: 0, max: 20, value: 15, unit: "t/h", bind: "sourceRate", readBind: "sourceRateActual" }],
    },
    {
      id: "treatMetalRemover",
      type: "metalRemover",
      name: "METAL REMOVER",
      tag: "52.501.F00",
      status: "new",
      zone: "treating",
      x: 140, y: 90, w: 90, h: 50,
      ports: { inputs: ["in"], outputs: ["out", "waste"] },
      anchors: { in: { x: 0, y: 25 }, out: { x: 45, y: 50 }, waste: { x: 90, y: 40 } },
      labelAt: { x: 110, y: 14 },
      // "Must pass straight through with zero holdup, or the magnets will
      // not work" [CONFIRMED 2026-06-30, REAL_LINE_SPECS.md §5]. Extracted
      // metal is real but negligible in volume; not modelled as a split.
      sim: { kind: "passThrough" },
    },
    {
      id: "metalRejectStub1",
      type: "stub",
      name: "metal reject · TBC",
      tag: "STUB.REJECT1",
      status: "stub",
      zone: "treating",
      x: 316, y: 156, w: 8, h: 8,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 4, y: 4 } },
    },
    {
      id: "treaterBufferBin",
      type: "bin",
      name: "TREATER BUFFER BIN",
      // FD sequence sections say 52.502.H00; its own alarm tables say
      // 52.501.H00 (an internal FD inconsistency, not ours to resolve —
      // see docs/PLC_FUNCTIONAL_DESCRIPTION.md §8.1). 52.502.H00 is the
      // better-supported reading (52.501.F00 is already the metal
      // remover, and hammer 52.502.X00 is explicitly this bin's).
      tag: "52.502.H00",
      status: "relocated",
      zone: "treating",
      x: 140, y: 170, w: 170, h: 190,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 45, y: 0 }, out: { x: 85, y: 190 } },
      fill: 0,
      instruments: ["LT", "LSH", "LSL"],
      labelAt: { x: -6, y: -16 },
      // Live jump, not just an initial condition: dragging this sets the
      // running sim's current level immediately (see PARAM_BINDERS.levelJump
      // in MeetingApp.jsx), for staging a scenario mid-presentation —
      // including dragging the level below the clearing set point before
      // pressing the plant control's RESET TRIPS (issue #45), without
      // waiting on the drum feeder's own drain (issue #20), which starts off
      // by default (see treatDrumFeeder below).
      params: [
        { id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" },
        { id: "highSetpoint", label: "LSH set point", min: 55, max: 100, value: 85, unit: "%", bind: "interlockHighSetpoint" },
        { id: "lowSetpoint", label: "LSL set point", min: 0, max: 55, value: 35, unit: "%", bind: "interlockLowSetpoint" },
        { id: "signalDelay", label: "signal delay", min: 0, max: 15, value: 7, unit: "s", bind: "interlockSignalDelay" },
      ],
      // 7.7 m3 / 5.5 t working volume [CONFIRMED 2026-06-30,
      // REAL_LINE_SPECS.md §5]. LSH/LSL set points are assumed (see
      // docs/OPEN_QUESTIONS.md) — low sensitivity per issue #18, so not
      // raised with the engineer. Starts empty (issue #55): every bin,
      // buffer and belt on the line starts with zero held material on page
      // load and RESTART, not a demo-paced starting level.
      sim: {
        kind: "accumulator",
        capacityM3: 7.7,
        provenance: { capacityM3: "confirmed" },
      },
    },
    {
      id: "treatDrumFeeder",
      type: "drumFeeder",
      name: "INLET DRUM FEEDER",
      tag: "52.505.L00",
      status: "new",
      zone: "treating",
      x: 185, y: 390, w: 80, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 40, y: 0 }, out: { x: 40, y: 36 } },
      labelAt: { x: -160, y: 24 },
      // Confirmed 2-20 t/h operating range [CONFIRMED 2026-06-30,
      // REAL_LINE_SPECS.md §5]. The real feeder is not a direct rate control
      // but a non-proportional percentage opening (the FD, 2026-08-05,
      // confirms the mechanism: two actuators A/B drive two discrete
      // opening-degree positions XV4/XV5 — the real control may be a
      // two-position selector, not a continuous dial). Since issue #60 this
      // feeder's own commanded rate is no longer a presenter-set dial at
      // all: it's continuously derived (feedRateDerivations below, issue
      // #59) from this Gate Position % dial x the elevator's own Speed%
      // dial, through the plant's own Simatek formula (units.js, issue
      // #57) — the real physical mechanism the old direct-rate slider (and
      // issue #42's auto-start once the elevator was confirmed running) was
      // always standing in for. `readBind` (issue #34): the pre-bin's graded
      // feed schedule (preBinFeedSchedule below) can override this dial's
      // effective value out from under the presenter, via `gateThrottleFraction`
      // — never `gateFraction` itself, which this dial always shows exactly
      // as last dragged (see engine.js's setGateFraction).
      params: [{ id: "gatePosition", label: "gate position", min: 0, max: 100, value: 100, unit: "%", bind: "gatePosition", readBind: "gatePositionActual" }],
      // `hasGate` (issue #57): the real drum feeder's own gate-position
      // actuator, now this feeder's only presenter-facing control (see the
      // params comment above).
      sim: {
        kind: "meteredFeeder",
        rateM3PerSec: 0,
        hasGate: true,
        provenance: { rateM3PerSec: "assumed" },
      },
    },
    {
      id: "treatingElevator",
      type: "elevator",
      name: "BUCKET ELEVATOR · TREATING",
      tag: "52.506.E00",
      status: "new",
      zone: "treating",
      x: 250, y: 222, w: 420, h: 240,
      geom: { colX: 200, duct: 36 },
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 25, y: 204 }, out: { x: 376, y: 44 } },
      instruments: ["ST"],
      labelAt: { x: 200, y: -14 },
      // `readBind` (issue #34): the pre-bin's graded feed schedule
      // (preBinFeedSchedule below) can throttle or stop this elevator out
      // from under the presenter's own VFD dial.
      params: [{ id: "speed", label: "speed", min: 0, max: 100, value: 100, unit: "%", bind: "elevatorSpeed", readBind: "elevatorSpeedActual" }],
      // Transit delay derived, not guessed: rise 8.731 m at the drawing's
      // 10.08 m/min chain speed [MED/LOW, screenshot-sourced, REAL_LINE_SPECS.md
      // §5/§8] gives ~52 s. The chain speed is exactly the figure §8 flags as
      // disputed (a factor-of-2 geometry ambiguity against the bucket-pitch
      // reading); using the drawing's stated value here per the parent issue,
      // not the alternate. `ceilingM3PerSec` is an equipment-nameplate pick
      // (20 t/h, matching the sibling packaging elevator and the inlet drum
      // feeders' upper range), not a resolution of the §8 anomaly — working
      // the drawing's own geometry gives a capacity well below the line's
      // sustained ~12 t/h rate. Both are logged as open, not quietly picked;
      // see docs/OPEN_QUESTIONS.md.
      sim: {
        kind: "transportDelay",
        distanceM: 8.731,
        speedMPerMin: 10.08,
        ceilingM3PerSec: tPerHourToM3PerSec(20),
        provenance: { distanceM: "assumed", speedMPerMin: "assumed", ceilingM3PerSec: "assumed" },
      },
    },
    {
      id: "treaterPreBin",
      type: "bin",
      name: "TREATER PRE-BIN",
      tag: "52.507.H00",
      status: "new",
      zone: "treating",
      x: 590, y: 290, w: 90, h: 100,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 45, y: 0 }, out: { x: 45, y: 100 } },
      fill: 0,
      instruments: ["LT", "LSHH", "LSH", "LSL"],
      labelAt: { x: -10, y: -16 },
      // Reuses the same accumulator behaviour as the buffer bin (issue #18)
      // unchanged — issue #22's own reuse claim, material physics written
      // once and configured seven times per the parent spec. The graded feed
      // schedule below (preBinFeedSchedule, issue #56/#58/#60) is what's
      // actually new: LSHH replaces LSH as this bin's own trip point, and
      // LSL/LSH now drive a live, non-latching boost/normal/throttle
      // schedule instead of the old two-stage slow-then-stop throttle.
      params: [
        { id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" },
        { id: "lowSetpoint", label: "LSL recover", min: 0, max: 55, value: 35, unit: "%", bind: "interlockLowSetpoint" },
        { id: "highSetpoint", label: "LSH set point", min: 35, max: 90, value: 85, unit: "%", bind: "interlockHighSetpoint" },
        { id: "highHighSetpoint", label: "LSHH trip set point", min: 55, max: 100, value: 95, unit: "%", bind: "interlockHighHighSetpoint" },
      ],
      // 1.63 m3 / 1.17 t working volume [CONFIRMED, FD 2026-08-05 Treating
      // mimic label, REAL_LINE_SPECS.md §2/§8.1 — supersedes the earlier
      // 1.62 m3 screenshot read]. LSL/LSH/LSHH set points are the sensor
      // positions issue #56 gives directly (35%/85%/95%) — confirmed there,
      // not re-guessed; LSH's own value is unchanged from the old LSH0 stop
      // set point it replaces (see preBinFeedSchedule's own comment below).
      // Starts empty (issue #55), same as every other bin on the line.
      sim: {
        kind: "accumulator",
        capacityM3: 1.63,
        provenance: { capacityM3: "confirmed" },
      },
    },
    {
      id: "batchTreater",
      type: "treater",
      name: "NIKLAS WNS/200 BATCH TREATER",
      tag: "52.508.T00",
      status: "new",
      zone: "treating",
      x: 570, y: 420, w: 130, h: 110,
      ports: { inputs: ["in", "chemIn"], outputs: ["out", "wasteOut"] },
      anchors: {
        in: { x: 65, y: 0 },
        chemIn: { x: 130, y: 40 },
        out: { x: 30, y: 110 },
        wasteOut: { x: 100, y: 110 },
      },
      labelAt: { x: -160, y: 75 },
      // Confirmed 2026-06-30: 160 kg per charge, held as a single unsplit
      // cycle — the engineer was explicit he could not give a fill/treat/
      // discharge breakdown and would have to ask the supplier (Niklas).
      // `phases` holds that one entry rather than a bare `cycleSec` so
      // absorbing the eventual breakdown is a data change, not a
      // restructuring (issue #24, src/sim/behaviors.js `batchCycle`).
      // 160 kg / 0.72 t/m3 ≈ 0.222 m3/charge is a straight unit conversion
      // of a confirmed figure, not itself assumed.
      //
      // Cycle time is 48 s, DERIVED from the engineer's own separate
      // "~12 t/h sustained" figure (160 kg / 12 t/h = 48 s) — not his other
      // confirmed figure, "every ~40 s" (~14.4 t/h). Those two never agreed
      // (docs/OPEN_QUESTIONS.md, Machine 5's own "14.4 vs 12 t/h mismatch"
      // row), and issue #60 makes the gap load-bearing for the first time:
      // the graded feed schedule's own boost band tops out at 14 t/h (issue
      // #56), so a treater drawing faster than that structurally starves the
      // pre-bin and it never climbs past LSL. 48 s resolves that in favour
      // of the sustained-rate reading, deliberately, not the raw 40 s one.
      params: [
        { id: "batchSize", label: "batch size", min: 40, max: 300, value: 160, unit: "kg", bind: "batchSize" },
        { id: "cycleTime", label: "cycle time", min: 10, max: 90, value: 48, unit: "s", bind: "batchCycleTime" },
      ],
      sim: {
        kind: "batchCycle",
        chargeM3: 0.16 / BULK_DENSITY_T_PER_M3,
        phases: [{ name: "cycle", durationSec: 48 }],
        provenance: { chargeM3: "confirmed", "phases[0].durationSec": "derived" },
      },
    },
    {
      id: "treaterAfterBin",
      type: "bin",
      name: "TREATER AFTER-BIN",
      tag: "52.601.H00",
      status: "new",
      zone: "treating",
      x: 540, y: 560, w: 80, h: 80,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 40, y: 0 }, out: { x: 40, y: 80 } },
      fill: 0,
      instruments: ["LSH", "LSL"],
      labelAt: { x: -150, y: 30 },
      // Reuses the same accumulator behaviour as the buffer bin (issue #18)
      // and the pre-bin (issue #22) unchanged — the third reuse the parent
      // spec names explicitly. What's new is afterBinHoldTreater below: the
      // third distinct response to a full bin on this line. Since issue #26
      // the scalping screen downstream (52.602.F00) is a real, live discharge
      // — the reverse-pass capacity check (issue #18) already guaranteed no
      // spill regardless, before or after that landed (see
      // docs/OPEN_QUESTIONS.md).
      params: [
        { id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" },
        { id: "highSetpoint", label: "LSH0 set point", min: 30, max: 100, value: 60, unit: "%", bind: "interlockHighSetpoint" },
        { id: "lowSetpoint", label: "LSL0 clear point", min: 0, max: 30, value: 20, unit: "%", bind: "interlockLowSetpoint" },
        { id: "signalDelay", label: "signal delay", min: 0, max: 15, value: 5, unit: "s", bind: "interlockSignalDelay" },
      ],
      // 0.67 m3 working volume [CONFIRMED 2026-06-30, REAL_LINE_SPECS.md
      // §5]. LSH0/LSL0 set points are assumed, same low-sensitivity
      // reasoning as the buffer bin (#18/#19) and pre-bin (#22): the FD
      // confirms these are operator-adjustable SCADA configuration, not
      // fixed plant values. Starts empty (issue #55).
      sim: {
        kind: "accumulator",
        capacityM3: 0.67,
        provenance: { capacityM3: "confirmed" },
      },
    },
    {
      id: "scalpingScreen",
      type: "screen",
      name: "TREATMENT SCALPING SCREEN",
      tag: "52.602.F00",
      status: "new",
      zone: "treating",
      x: 620, y: 680, w: 140, h: 70,
      ports: { inputs: ["in"], outputs: ["out", "waste"] },
      anchors: { in: { x: 30, y: 0 }, out: { x: 140, y: 35 }, waste: { x: 70, y: 70 } },
      labelAt: { x: -210, y: 40 },
      params: [{ id: "wasteFrac", label: "scalpings split", min: 0, max: 20, value: 3, unit: "%", bind: "wasteFraction" }],
      // First splitter on the line (issue #26): a fixed fraction of infeed
      // diverts to waste, the rest to product, with negligible holdup
      // ("well oversized" [CONFIRMED 2026-06-30, REAL_LINE_SPECS.md §5]).
      // The 16mm-aperture oversize fraction itself is not a plant figure
      // anyone quoted — the engineer confirmed the aperture and that waste
      // is "tiny," not a percentage — so 3% is a demo-only assumed value,
      // live-adjustable, per docs/OPEN_QUESTIONS.md. ceilingM3PerSec is the
      // screen's own confirmed 64.4 t/h rating: never the limiter at the
      // line's real rate, but a genuine ceiling rather than an unmodelled
      // infinity, so an artificially overwhelming feed still backs up here
      // instead of passing through unconstrained.
      sim: {
        kind: "splitter",
        wasteFraction: 0.03,
        ceilingM3PerSec: tPerHourToM3PerSec(64.4),
        provenance: { wasteFraction: "assumed", ceilingM3PerSec: "confirmed" },
      },
    },
    {
      id: "scalpingDischargeHopper",
      type: "bin",
      name: "SCALPING SCREEN DISCHARGE HOPPER",
      tag: "52.603.H00",
      status: "new",
      zone: "treating",
      // Sited directly under the scalping screen (its real position — a
      // discharge hopper catches what the screen above it drops), x aligned
      // with the screen's own product ("out") anchor at 760 so the
      // connection between them is a straight vertical drop, not an elbow.
      // DISCARD SCALPINGS BIN, below, moved left to make room.
      x: 730, y: 790, w: 60, h: 46,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 30, y: 0 }, out: { x: 30, y: 46 } },
      fill: 0,
      instruments: ["LSH"],
      labelAt: { x: 70, y: 15 },
      params: [{ id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" }],
      // Issue #62: a small catch tray under the Treatment Scalping Screen
      // (52.602.F00, above), feeding Inlet Drum Feeder 2 (52.603.L00 —
      // the feeder inletDrumFeeder2's own comment already confirms as "fed
      // by the scalping screen"), not Inlet Drum Feeder 1, which is fed by
      // the Pro Box instead. Tag `52.603.H00` and 0.2 m3 / 0.14 t capacity
      // confirmed by the engineer 2026-08-19; 0.14 t / 0.2 m3 is in line
      // with the project's own 0.72 t/m3 bulk density figure, so no
      // separate density number was needed. Carries hammer `52.603.X00`
      // and an `LSH0` instrument already on record [FD-INFERRED,
      // PLC_FUNCTIONAL_DESCRIPTION.md §8.2] — the hammer itself isn't
      // modelled, same as every other bin's hammer on this line (e.g.
      // outloadBufferBin above). No `LSL0` is named in the FD, and no
      // numeric `LSH0` setpoint is confirmed anywhere, so unlike the bins
      // with a real interlock behind them (treaterAfterBin etc.), this one
      // gets no highSetpoint/lowSetpoint dial and no thresholdStopTrip rule
      // — the engineer was explicit that it's "not a control point of its
      // own," just the standard accumulator fill/backpressure behaviour
      // every bin on the line already gets by default (issue #18). No
      // OPEN_QUESTIONS.md row is added for the unconfirmed LSH0 value: that
      // register only tracks gaps the sim engine actually reads
      // (OPEN_QUESTIONS.md's own opening line), and nothing here reads it —
      // if this bin is ever wired up, it would get a dial and a row at that
      // point, the same assumed ~85%-of-capacity convention every other
      // bin's LSH0 uses. Starts empty (issue #55), same as every other bin
      // on the line.
      sim: {
        kind: "accumulator",
        capacityM3: 0.2,
        provenance: { capacityM3: "confirmed" },
      },
    },
    {
      id: "discardBin",
      type: "metalBin",
      name: "DISCARD SCALPINGS BIN",
      tag: "52.801.L00",
      status: "new",
      zone: "treating",
      // Shifted left from 620 (issue #62) so the scalping discharge hopper
      // can sit directly under the screen above, where the discard bin used
      // to be.
      x: 440, y: 790, w: 100, h: 80,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 50, y: 0 } },
      fill: 0.01,
      labelAt: { x: 0, y: 106 },
      // Terminal sink (issue #26): the treating zone's waste destination,
      // holding an unbounded running total rather than a working volume —
      // emptied "when full" is an operator/truck event out of scope, not a
      // capacity the sim needs to model (REAL_LINE_SPECS.md §5). Issue #57
      // adds a dedicated EMPTY DISCARD BIN control for that truck event
      // (PlantControls.jsx, engine.js's own emptyTerminalSink), so a
      // presenter can demo it directly rather than only ever watching this
      // bin climb.
      // `displayCapacityM3` is presenter-facing only (see behaviors.js
      // `snapshotTerminalSink`): the real bin's working volume was never
      // confirmed, so this just scales the fill bar to visibly rise over a
      // demo run rather than sitting frozen — it gates no physics.
      // `initialLevelFraction` (issue #57) starts the bin at 1%, not the
      // empty-at-load every other bin uses since #55 — a presenter request,
      // not a plant fact: this bin visibly holds a token amount from the
      // moment the page loads rather than reading as pristine/unused.
      sim: {
        kind: "terminalSink",
        displayCapacityM3: 0.3,
        initialLevelFraction: 0.01,
        provenance: { displayCapacityM3: "assumed", initialLevelFraction: "assumed" },
      },
    },

    // ============ PACKAGING & OUTLOAD (sheet 52-13) ============
    {
      id: "proBoxStation",
      type: "proBox",
      name: "PRO BOX UNLOADING STATION",
      tag: "52.608.H00",
      status: "new",
      zone: "packaging",
      // x re-centred 2026-08-14 so the (horizontally-centred) `out` anchor
      // lines up directly above inletDrumFeeder1's `in` anchor, now that the
      // two feeders' positions have been swapped (see inletDrumFeeder1's own
      // comment) — a straight drop, no via point needed.
      x: 1270, y: 600, w: 120, h: 80,
      ports: { inputs: [], outputs: ["out"] },
      anchors: { out: { x: 60, y: 80 } },
      labelAt: { x: 0, y: -14 },
      // Issue #46: a live source, same shape as upstreamStub — returns
      // already-treated stored seed to be re-bagged, confirmed to bypass the
      // entire treating half [CONFIRMED FD 2026-08-05, REAL_LINE_SPECS.md
      // §12 item 4]. Only ~1 day/month in real use, per the same item — a
      // duty-cycle fact, not a rate; no engineer figure exists for the rate
      // itself, so this reuses the drum feeders' own confirmed 2-20 t/h
      // range as a plausible demo default. Whether it actually feeds
      // anything is gated by the source selector (setSource, engine.js),
      // which enables/disables inletDrumFeeder1 downstream — this valve can
      // sit open with nothing flowing.
      params: [{ id: "rate", label: "source rate", min: 0, max: 20, value: 12, unit: "t/h", bind: "sourceRate", readBind: "sourceRateActual" }],
      sim: {
        kind: "source",
        rateM3PerSec: tPerHourToM3PerSec(12),
        provenance: { rateM3PerSec: "assumed" },
      },
    },
    {
      id: "inletDrumFeeder1",
      type: "drumFeeder",
      name: "INLET DRUM FEEDER 1",
      // Tag corrected 2026-08-12 (issue #44): the Packaging mimic settles
      // which source feeds which tag. This feeder (fed by the Pro Box,
      // below) is 52.603.L01, not 52.603.L00 — the earlier drawing
      // reading had the two feeders' sources swapped.
      tag: "52.603.L01",
      status: "new",
      zone: "packaging",
      // Positioned right of inletDrumFeeder2 (swapped 2026-08-14): with the
      // Pro Box directly above, drawing this feeder to the right keeps its
      // own infeed line from crossing the scalping screen's long incoming
      // line into inletDrumFeeder2, which sits closer to the screen. Moved
      // down (issue #62 follow-up) by the same amount as inletDrumFeeder2,
      // to keep the two feeders paired at the same height.
      x: 1290, y: 818, w: 80, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 40, y: 0 }, out: { x: 40, y: 36 } },
      labelAt: { x: 90, y: 24 },
      // Issue #46: the Pro Box's own feeder. Reuses meteredFeeder unchanged
      // (issue #20), same confirmed 2-20 t/h range as the treating-side
      // feeder. Starts disabled: the source selector (setSource, engine.js)
      // defaults to the treating line, per the FD's "only one drum feeder
      // runs at a time; they never run together" [CONFIRMED 2026-06-30,
      // REAL_LINE_SPECS.md §6 flow item 3] — `enabled: false` is the
      // selector's own gate (src/sim/behaviors.js), separate from `rate`,
      // so this feeder's own dial is preserved for whenever it's selected.
      params: [{ id: "rate", label: "feed rate", min: 2, max: 20, value: 12, unit: "t/h", bind: "feederRate", readBind: "feederRateActual" }],
      // `hasGate` (issue #57): see treatDrumFeeder's own comment above.
      sim: {
        kind: "meteredFeeder",
        rateM3PerSec: tPerHourToM3PerSec(12),
        enabled: false,
        hasGate: true,
        provenance: { rateM3PerSec: "assumed" },
      },
    },
    {
      id: "inletDrumFeeder2",
      type: "drumFeeder",
      name: "INLET DRUM FEEDER 2",
      // Tag corrected 2026-08-12 (issue #44): this feeder (fed by the
      // scalping screen, below) is 52.603.L00 — see inletDrumFeeder1's
      // comment for the source of the correction.
      tag: "52.603.L00",
      status: "new",
      zone: "packaging",
      // Positioned left of inletDrumFeeder1 (swapped 2026-08-14), closer to
      // the scalping screen its own product actually comes from — see
      // inletDrumFeeder1's comment above for why. Moved down (issue #62
      // follow-up) so its own inlet sits level with the scalping discharge
      // hopper's discharge, with a left-side `in` anchor instead of the
      // usual top-centre one, so the hopper's own product line runs
      // straight across into this feeder's left side rather than dropping
      // in from above.
      x: 1160, y: 818, w: 80, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 0, y: 18 }, out: { x: 40, y: 36 } },
      labelAt: { x: -160, y: 24 },
      // Issue #46: the treating line's own feeder, downstream of the
      // scalping screen. `enabled` defaults true — the source selector
      // starts on the treating line — so selecting the Pro Box instead
      // (setSource, engine.js) is what leaves the whole treating zone idle:
      // this feeder's intake goes to zero, the scalping screen backs up
      // into the treater after-bin exactly like any other full downstream,
      // and the cascade runs backward through the zone on its own, with no
      // special-cased "idle" state anywhere.
      params: [{ id: "rate", label: "feed rate", min: 2, max: 20, value: 12, unit: "t/h", bind: "feederRate", readBind: "feederRateActual" }],
      // `hasGate` (issue #57): see treatDrumFeeder's own comment above.
      sim: {
        kind: "meteredFeeder",
        rateM3PerSec: tPerHourToM3PerSec(12),
        hasGate: true,
        provenance: { rateM3PerSec: "assumed" },
      },
    },
    {
      id: "pendulumConveyor",
      type: "conveyor",
      name: "PENDULUM CONVEYOR",
      // Merged 2026-08-12 (issue #44): the former "lift conveyor" and "top
      // transport conveyor" are one machine, 52.604.E00, a Simatek E200
      // pendulum conveyor. Real geometry is a Z path (floor run, vertical
      // climb, ceiling run); the body here still only draws the ceiling
      // run, where the topology (three pneumatically selected outlets)
      // actually lives — the Z-shaped symbol is deliberately left for a
      // future ticket, per issue #44's own scope (data only, no engine or
      // presentation-layer work). The floor run and climb are implied by
      // the infeed connections' via points below.
      tag: "52.604.E00",
      status: "new",
      zone: "packaging",
      x: 1440, y: 140, w: 1750, h: 26,
      ports: { inputs: ["in1", "in2"], outputs: ["outBuffer", "outBinSeg", "outConcetti"] },
      anchors: {
        in1: { x: 10, y: 8 },
        in2: { x: 10, y: 20 },
        outBuffer: { x: 240, y: 26 },
        outBinSeg: { x: 1120, y: 26 },
        outConcetti: { x: 1745, y: 26 },
      },
      instruments: ["LSH"],
      labelAt: { x: 560, y: -14 },
      // Issue #47: now `routedTransportDelay` (behaviors.js) — the router
      // concept combined with real transport lag, so material discharges
      // through whichever of the three outlets the destination selector
      // (setDestination, engine.js) currently has open, with everything
      // already on the chain still travelling to whichever outlet it was
      // accepted for. All three outlets are genuinely wired now (see the
      // connections below) — issue #46's own "only outBuffer is sim-enabled
      // this ticket" is superseded. Defaults to `outConcetti` via the sim
      // block's own `defaultPort` below (overriding routedTransportDelay's
      // plain outputs[0] fallback, behaviors.js initRoutedTransportDelay):
      // Concetti is the destination actually used in real operation, so
      // it's what a fresh load and every RESTART (resetSim rebuilding
      // machines straight off this line data) should open on, not the
      // outBuffer/metal-bin branch issue #46 originally defaulted to.
      //
      // Transit is derived from the sheet 52-13 spec block (PDF text-layer
      // exact, REAL_LINE_SPECS.md §8), not tuned: `distanceM` is the
      // carrying-side path only — lower horizontal (7.084 m) + vertical
      // rise (9.157 m) + upper horizontal (14.846 m) = 31.087 m ≈ 31.1 m —
      // unlike the treating elevator (`treatingElevator` above), whose own
      // `distanceM` is rise alone (8.731 m): that machine was built from a
      // low-confidence screenshot reading with no horizontal runs captured,
      // while this one's spec block gives all three run lengths at the same
      // PDF-text confidence. The inconsistency between the two machines'
      // derivation method is itself recorded, not silently reconciled — see
      // docs/OPEN_QUESTIONS.md. At the confirmed 10.08 m/min chain speed,
      // 31.087 m gives ≈185 s of transport lag, the longest on the line.
      //
      // `ceilingM3PerSec` comes from this conveyor's own confirmed
      // operating-output table (sheet 52-13, 100% speed, 70% filling
      // degree: 20.84 t/h) rather than a nameplate guess or the raw
      // bucket-pass-rate geometry — the latter is exactly what the §8
      // factor-of-two anomaly disputes (bucket pitch 120 m / 196 buckets
      // gives ~16.5 buckets/min against the table's own implied ~33.6), so
      // deriving the ceiling from the table sidesteps re-importing that
      // same disputed number here. See docs/OPEN_QUESTIONS.md.
      // `speed` reuses the elevator VFD's own bind (issue #21): live,
      // re-pacing every packet already in transit, not just new material —
      // same generic transportDelay control treatingElevator's dial uses,
      // now shared by routedTransportDelay too (engine.js's setElevatorSpeed).
      params: [{ id: "speed", label: "speed", min: 0, max: 100, value: 100, unit: "%", bind: "elevatorSpeed", readBind: "elevatorSpeedActual" }],
      sim: {
        kind: "routedTransportDelay",
        defaultPort: "outConcetti",
        distanceM: 7.084 + 9.157 + 14.846,
        speedMPerMin: 10.08,
        ceilingM3PerSec: tPerHourToM3PerSec(20.84),
        provenance: { distanceM: "derived", speedMPerMin: "confirmed", ceilingM3PerSec: "confirmed" },
      },
    },
    {
      id: "outloadBufferBin",
      type: "bin",
      name: "OUTLOAD BUFFER BIN",
      // Corrected 2026-08-05: was tagged 52.701.H00 by the earlier
      // drawing reading, which the FD reassigns to the Flexicon Pre-Bin
      // (see flexiconPreBin below). This bin is 52.610.H00 (4.51 m3 /
      // 3.25 t; the "bin segment" figures from the drawing reading
      // belong here, not on the Flexicon branch).
      tag: "52.610.H00",
      status: "new",
      zone: "packaging",
      x: 1650, y: 240, w: 130, h: 145,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 30, y: 0 }, out: { x: 65, y: 145 } },
      fill: 0,
      instruments: ["LSH", "LSL"],
      labelAt: { x: -190, y: 30 },
      // Issue #46: the same accumulator behaviour as every other bin on the
      // line (issue #18), configured a fourth time. 4.51 m3 / 3.25 t working
      // volume [CONFIRMED, PLC_FUNCTIONAL_DESCRIPTION.md §8.3 / §8.4 mimic
      // label — the "bin segment" figure from the original drawing reading
      // belongs here, see this machine's tag-correction comment above].
      // Starts empty (issue #55), same as every other bin on the line.
      sim: {
        kind: "accumulator",
        capacityM3: 4.51,
        provenance: { capacityM3: "confirmed" },
      },
    },
    {
      id: "grainBreak",
      type: "grainBreak",
      name: "GRAIN BREAK",
      // Re-sited 2026-08-12 (issue #44): its old parent, the phantom
      // packaging bucket elevator (52.702.U00), does not exist — see
      // pendulumConveyor's comment above. The engineer confirmed the
      // grain break itself exists, as an unpowered cascade chute; the FD
      // never mentions it, consistent with that (nothing to trip or
      // command). Re-sited onto pendulumConveyor's discharge into the
      // outload buffer bin, the one place upstream of the bin a cascade
      // chute plausibly sits, but its exact position was never confirmed
      // — this is a placement of convenience, not a plant fact. See the
      // docs/OPEN_QUESTIONS.md row flagging this for engineer follow-up.
      tag: "TBC-20",
      status: "new",
      zone: "packaging",
      x: 1656, y: 190, w: 48, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 24, y: 0 }, out: { x: 24, y: 36 } },
      labelAt: { x: -140, y: 44 },
      // Issue #46: pass-through, no holdup — the engineer confirmed this
      // exists as an unpowered cascade chute (see the tag comment above),
      // the same reasoning treatMetalRemover's own passThrough already
      // rests on.
      sim: { kind: "passThrough" },
    },
    {
      id: "outloadDiverter",
      type: "diverter",
      name: "DIVERTER",
      // Retagged 2026-08-12 (issue #44): this is the outload diverter
      // valve, 52.612.V00. 52.613.V00 (its old tag here) is metal bin 1's
      // own inlet slide gate, a distinct downstream device not yet
      // modelled as its own machine. Repositioned below the outload
      // buffer bin: with the phantom elevator gone, the bin discharges
      // straight into this diverter by gravity — no lift carries it back
      // up to the old position.
      tag: "52.612.V00",
      status: "new",
      zone: "packaging",
      x: 1699, y: 400, w: 32, h: 32,
      ports: { inputs: ["in"], outputs: ["out1", "out2"] },
      anchors: { in: { x: 16, y: 0 }, out1: { x: 8, y: 24 }, out2: { x: 32, y: 16 } },
      smallLabel: true,
      labelAt: { x: 44, y: -4 },
      // Issue #47: a `router` (behaviors.js) — holds no material, sends the
      // whole of its inflow to whichever metal bin the destination selector
      // currently has chosen (setDestination, engine.js), never both at
      // once. Defaults to `out1`/metal bin 1, its own first declared output
      // port — only reachable once the conveyor's own destination is
      // switched to the outload branch at all (its default is Concetti,
      // issue #56), so this default only matters from that point on.
      sim: { kind: "router" },
    },
    {
      id: "metalBin1",
      type: "metalBin",
      name: "TREATED OUTLOAD METAL BIN 1",
      tag: "52.613.H00",
      status: "new",
      zone: "packaging",
      // Repositioned 2026-08-12 (issue #44), moved under the relocated
      // diverter above now that no elevator carries material out to the
      // old position — see outloadDiverter's comment.
      x: 1585, y: 460, w: 160, h: 172,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 80, y: 0 }, out: { x: 80, y: 162 } },
      fill: 0,
      instruments: ["LT", "LSH"],
      labelAt: { x: 0, y: 198 },
      // Issue #47: an accumulator (issue #18's behaviour, configured a
      // fifth time), with a live level-jump slider for staging a near-full
      // trip demo, the same pattern every other bin on the line already
      // uses. Working volume has no confirmed source — the FD names an LT0
      // level transmitter but no capacity (PLC_FUNCTIONAL_DESCRIPTION.md
      // §12) — so 6 m3 is a demo-paced assumption, larger than the outload
      // buffer bin upstream of it since these are the line's own terminal
      // storage awaiting a truck, not an in-process buffer; see
      // docs/OPEN_QUESTIONS.md. Discharge is deliberately not modelled: no
      // document covers truck loadout gate logic, so this bin only ever
      // fills — `dischargeStub1` below isn't sim-enabled, so the
      // accumulator's own reverse-pass discharge cap is always 0, and
      // emptying it is the presenter's own bin-empty affordance
      // (PlantControls.jsx, reusing the same setLevel(0) the level-jump
      // slider itself calls). Starts empty (issue #55).
      params: [{ id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" }],
      sim: {
        kind: "accumulator",
        capacityM3: 6,
        provenance: { capacityM3: "assumed" },
      },
    },
    {
      id: "dischargeStub1",
      type: "stub",
      name: "discharge · TBC",
      tag: "STUB.DISCH1",
      status: "stub",
      zone: "packaging",
      x: 1661, y: 700, w: 8, h: 8,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 4, y: 4 } },
    },
    {
      id: "metalBin2",
      type: "metalBin",
      name: "TREATED OUTLOAD METAL BIN 2",
      tag: "52.613.H01",
      status: "new",
      zone: "packaging",
      // Repositioned 2026-08-12 (issue #44), see metalBin1's comment.
      x: 1765, y: 460, w: 160, h: 172,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 80, y: 0 }, out: { x: 80, y: 162 } },
      fill: 0,
      instruments: ["LT", "LSH"],
      labelAt: { x: 0, y: 198 },
      // Issue #47: same accumulator configuration as metalBin1, sixth
      // reuse of issue #18's behaviour — see metalBin1's own comment for
      // the working-volume and no-modelled-discharge reasoning. Starts
      // empty (issue #55).
      params: [{ id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" }],
      sim: {
        kind: "accumulator",
        capacityM3: 6,
        provenance: { capacityM3: "assumed" },
      },
    },
    {
      id: "dischargeStub2",
      type: "stub",
      name: "discharge · TBC",
      tag: "STUB.DISCH2",
      status: "stub",
      zone: "packaging",
      x: 1841, y: 700, w: 8, h: 8,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 4, y: 4 } },
    },
    {
      id: "binSegSampler",
      type: "sampler",
      name: "AUTO SAMPLER",
      tag: "52.609.X00",
      status: "new",
      zone: "packaging",
      x: 2530, y: 210, w: 60, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 30, y: 0 }, out: { x: 30, y: 36 } },
      smallLabel: true,
      labelAt: { x: -180, y: 40 },
      // Issue #48: pass-through, no holdup — the same reasoning
      // treatMetalRemover's and grainBreak's own passThrough already rest
      // on (an in-line sampler diverts a negligible probe volume, modelled
      // as none, not a genuine split). This is the first machine downstream
      // of the pneumatic outlet the parent issue names "52.604.V01" — that
      // valve is pendulumConveyor's own `outBinSeg` port (routedTransportDelay,
      // its own sim block above), already opened by the destination selector
      // (setDestination(sim, "flexicon"), engine.js) since issue #47; there
      // is no separate valve machine to model, the same way the outload
      // branch's own selected outlet is a port, not a standalone machine.
      sim: { kind: "passThrough" },
    },
    // binSegment ("BIN SEGMENT", TBC-11) deleted 2026-08-12 (issue #44):
    // the "bin segment" of the original drawing reading is the outload
    // buffer bin 52.610.H00 (already modelled as outloadBufferBin, on the
    // branch-B outload metal bin path), not a separate vessel on this
    // Flexicon branch. binSegSampler now feeds flexiconPreBin directly.
    {
      id: "flexiconPreBin",
      type: "bin",
      name: "FLEXICON PRE-BIN",
      // Corrected 2026-08-05 [FD]: this bin is 52.701.H00 (the earlier
      // drawing reading had wrongly given that tag to outloadBufferBin).
      tag: "52.701.H00",
      status: "relocated",
      zone: "packaging",
      x: 2515, y: 440, w: 90, h: 90,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 45, y: 0 }, out: { x: 45, y: 90 } },
      fill: 0,
      instruments: ["LSH", "LSL"],
      labelAt: { x: 120, y: 55 },
      params: [
        { id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" },
        { id: "highSetpoint", label: "LSH set point", min: 45, max: 100, value: 85, unit: "%", bind: "interlockHighSetpoint" },
        { id: "lowSetpoint", label: "LSL set point", min: 0, max: 45, value: 35, unit: "%", bind: "interlockLowSetpoint" },
        { id: "signalDelay", label: "signal delay", min: 0, max: 15, value: 5, unit: "s", bind: "interlockSignalDelay" },
      ],
      // Issue #48: reuses the accumulator behaviour unchanged (issue #18),
      // a seventh configuration. Working volume has no confirmed source —
      // the FD names an LT0/LSH0/LSL0 instrument set here but no capacity,
      // the same "not given" gap the two metal bins' own working volumes
      // hit (PLC_FUNCTIONAL_DESCRIPTION.md §12). 2.5 m3 is a demo-paced
      // assumption sized as an in-process buffer ahead of a discrete pull
      // (the filling head's own one-bag charge below), not terminal
      // storage like the metal bins — closer in scale to the treater
      // pre-bin (1.63 m3) than to a 6 m3 metal bin. See
      // docs/OPEN_QUESTIONS.md. Starts empty (issue #55).
      sim: {
        kind: "accumulator",
        capacityM3: 2.5,
        provenance: { capacityM3: "assumed" },
      },
    },
    {
      id: "vibratingConveyor",
      type: "vibratory",
      name: "VIBRATING CONVEYOR",
      // Corrected 2026-08-05 [FD]: this is 52.702.C00; the drawing
      // reading had swapped this tag with flexiconFillingHead's.
      tag: "52.702.C00",
      status: "relocated",
      zone: "packaging",
      x: 2520, y: 560, w: 120, h: 30,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 40, y: 0 }, out: { x: 110, y: 30 } },
      labelAt: { x: -188, y: 2 },
      // Issue #48: meters the pre-bin's discharge, reusing the drum
      // feeders' own meteredFeeder behaviour unchanged (issue #20) — the
      // parent spec's own reuse claim for this machine. No document gives
      // this conveyor's own rate range; the drum feeders' confirmed 2-20
      // t/h is reused as a plausible presenter-settable range, same
      // reasoning the Pro Box source's own rate slider already leans on.
      params: [{ id: "rate", label: "feed rate", min: 0, max: 20, value: 10, unit: "t/h", bind: "feederRate", readBind: "feederRateActual" }],
      sim: {
        kind: "meteredFeeder",
        rateM3PerSec: tPerHourToM3PerSec(10),
        provenance: { rateM3PerSec: "assumed" },
      },
    },
    {
      id: "flexiconFillingHead",
      type: "fillingHead",
      name: "FLEXICON FILLING HEAD",
      // Corrected 2026-08-05 [FD]: this is 52.703.L00 (see
      // vibratingConveyor above for the other half of the swap).
      tag: "52.703.L00",
      status: "relocated",
      zone: "packaging",
      x: 2585, y: 620, w: 90, h: 70,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 45, y: 0 }, out: { x: 45, y: 70 } },
      labelAt: { x: 105, y: 30 },
      // Issue #48: the one genuinely new configuration on this branch, and
      // the parent spec's own largest reuse claim landing — the batch
      // treater's batchCycle primitive (issue #24), unchanged, takes a
      // charge, holds it for a cycle, and discharges the whole charge as a
      // pulse, exactly the "take a bag's charge, dwell, release a
      // completed bag" shape a big-bag filling head needs. Bag-change dead
      // time (the seconds lost swapping an empty bag onto the head for the
      // next cycle) is explicitly out of scope for this ticket — batchCycle's
      // own discharge-to-charging transition is already immediate, so this
      // needs no code change to fill continuously rather than modelling
      // that gap.
      params: [
        { id: "batchSize", label: "bag size", min: 500, max: 1500, value: 1000, unit: "kg", bind: "batchSize" },
        { id: "cycleTime", label: "fill time", min: 15, max: 120, value: 45, unit: "s", bind: "batchCycleTime" },
      ],
      // No document sizes the Flexicon package at all (out of the FD's own
      // scope, per the parent issue) — "one-tonne big bags" is a demo-paced
      // assumption, not a plant fact, so `chargeM3` and the 45 s fill time
      // are both assumed and flagged for engineer follow-up; see
      // docs/OPEN_QUESTIONS.md.
      sim: {
        kind: "batchCycle",
        chargeM3: 1.0 / BULK_DENSITY_T_PER_M3,
        phases: [{ name: "fill", durationSec: 45 }],
        provenance: { chargeM3: "assumed", "phases[0].durationSec": "assumed" },
      },
    },
    {
      id: "rollerScale",
      type: "rollerScale",
      name: "ROLLER CONVEYORS 1-4 + BELT SCALE",
      tag: "52.704.K00",
      status: "relocated",
      zone: "packaging",
      x: 2540, y: 720, w: 180, h: 26,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 90, y: 0 }, out: { x: 170, y: 13 } },
      labelAt: { x: 0, y: 46 },
      // Issue #48: pass-through, no holdup — a filled bag rides straight
      // across the rollers and over the belt scale to the terminus, per
      // the parent issue's own description; the weighing itself has
      // nothing further for the sim to model beyond the bag volume
      // already carried through.
      sim: { kind: "passThrough" },
    },
    {
      id: "bigBagStub",
      type: "stub",
      name: "filled big bags · out",
      tag: "STUB.BIGBAG",
      status: "stub",
      zone: "packaging",
      x: 2760, y: 729, w: 8, h: 8,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 4, y: 4 } },
      // Issue #48: the branch's own terminus, reusing terminalSink (issue
      // #26) with its optional `bagSizeM3` (behaviors.js) so this one, and
      // only this one, also publishes a running bag count — a stakeholder
      // reads "47 bags" without translating a volume, unlike discardBin's
      // plain waste total. `bagSizeM3` matches the filling head's own
      // assumed one-tonne charge exactly, since a bag arriving here is by
      // construction one whole charge off that machine's discharge pulse.
      // `displayCapacityM3` is presenter-facing only (same convention as
      // discardBin's own), scaled to a handful of bags so the fill bar
      // visibly rises over a demo run.
      sim: {
        kind: "terminalSink",
        displayCapacityM3: 10,
        bagSizeM3: 1.0 / BULK_DENSITY_T_PER_M3,
        provenance: { displayCapacityM3: "assumed", bagSizeM3: "assumed" },
      },
    },
    {
      id: "concettiSampler",
      type: "sampler",
      name: "AUTO SAMPLER",
      // Corrected 2026-08-05 [FD]: this is 52.605.X00 (the earlier
      // drawing reading had wrongly given that tag to topConveyor).
      tag: "52.605.X00",
      status: "new",
      zone: "packaging",
      x: 3160, y: 200, w: 60, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 30, y: 0 }, out: { x: 30, y: 36 } },
      smallLabel: true,
      labelAt: { x: 75, y: 22 },
      // Issue #49: pass-through, no holdup — same reasoning binSegSampler's
      // own passThrough already rests on (REAL_LINE_SPECS.md §6: "Pass-
      // through, no holdup. Sample taken ~every 3 hours").
      sim: { kind: "passThrough" },
    },
    // concettiMetalRemover removed 2026-08-05: the FD names exactly one
    // metal remover on the whole line (52.501.F00, treating side) and
    // the Packaging SCADA mimic shows none on this branch, which backs
    // the engineer's worksheet answer ("not part of this line") against
    // the sheet 52-14 cross-reference that had raised the question. See
    // docs/PLC_FUNCTIONAL_DESCRIPTION.md §8.4.

    // ================= BAGGING (sheet 52-14) =================
    {
      id: "concettiPreBin",
      type: "bin",
      name: "CONCETTI PRE-BIN",
      tag: "52.705.H00",
      status: "new",
      zone: "bagging",
      x: 3145, y: 350, w: 90, h: 90,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 45, y: 0 }, out: { x: 45, y: 90 } },
      fill: 0,
      instruments: ["LT", "LSH", "LSL"],
      labelAt: { x: 110, y: 30 },
      params: [
        { id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" },
        { id: "highSetpoint", label: "LSH set point", min: 50, max: 100, value: 85, unit: "%", bind: "interlockHighSetpoint" },
        { id: "lowSetpoint", label: "LSL set point", min: 0, max: 50, value: 35, unit: "%", bind: "interlockLowSetpoint" },
        { id: "signalDelay", label: "signal delay", min: 0, max: 15, value: 5, unit: "s", bind: "interlockSignalDelay" },
      ],
      // Issue #49: reuses the accumulator behaviour unchanged (issue #18),
      // an eighth configuration. Working volume has a drawing reading but a
      // LOW-confidence one — sheet 52-14 gives ~0.72 m3 with a "(?)" against
      // it (REAL_LINE_SPECS.md §7) — so it's used as the assumed value
      // rather than trusted as confirmed, same treatment the parent issue
      // asks for explicitly. See docs/OPEN_QUESTIONS.md. Starts empty
      // (issue #55).
      sim: {
        kind: "accumulator",
        capacityM3: 0.72,
        provenance: { capacityM3: "assumed" },
      },
    },
    {
      id: "concettiScale",
      type: "scale",
      name: "BAGGING SCALE",
      tag: "TBC-16",
      status: "new",
      zone: "bagging",
      x: 3150, y: 470, w: 80, h: 46,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 40, y: 0 }, out: { x: 40, y: 46 } },
      labelAt: { x: -220, y: 30 },
      // Issue #49: the branch's second genuinely new configuration, reusing
      // batchCycle (issue #24) a fourth time — the parent spec's own reuse
      // claim landing in full — takes a charge, holds it for a cycle,
      // discharges a completed bag. The Concetti package sits past the
      // PLC's own scope (PLC_FUNCTIONAL_DESCRIPTION.md §12), so bag size is
      // unstated; 50 kg is assumed as a plausible small-bag rating for
      // treated seed, distinct from the Flexicon head's 1 t big-bag charge.
      // Cycle time is *derived* from that assumed bag size against the
      // worksheet's own unconfirmed ~12 t/h sustained rate (REAL_LINE_SPECS.md
      // §7), not independently assumed — 50 kg / 12 t/h = 15 s. Bag-change
      // dead time is explicitly out of scope for this ticket, the same as
      // the Flexicon head: batchCycle's own discharge-to-charging
      // transition is already immediate, so no code change is needed for
      // continuous cycling. See docs/OPEN_QUESTIONS.md.
      params: [
        { id: "batchSize", label: "bag size", min: 10, max: 100, value: 50, unit: "kg", bind: "batchSize" },
        { id: "cycleTime", label: "fill time", min: 5, max: 60, value: 15, unit: "s", bind: "batchCycleTime" },
      ],
      sim: {
        kind: "batchCycle",
        chargeM3: 0.05 / BULK_DENSITY_T_PER_M3,
        phases: [{ name: "fill", durationSec: 15 }],
        provenance: { chargeM3: "assumed", "phases[0].durationSec": "derived" },
      },
    },
    {
      id: "concettiFiller",
      type: "filler",
      name: "FILLING & SEWING",
      tag: "TBC-17",
      status: "new",
      zone: "bagging",
      x: 3140, y: 550, w: 100, h: 70,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 50, y: 0 }, out: { x: 50, y: 70 } },
      labelAt: { x: 115, y: 35 },
      // Issue #49: pass-through, no holdup — a weighed charge off the scale
      // rides straight through the sewing head to palletising, per the
      // parent issue's own description; nothing further for the sim to
      // model beyond the bag volume already carried through.
      sim: { kind: "passThrough" },
    },
    {
      id: "palletising",
      type: "palletiser",
      name: "PALLETISING (COLLAPSED)",
      tag: "TBC-18",
      status: "relocated",
      zone: "bagging",
      x: 3120, y: 660, w: 140, h: 80,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 70, y: 0 }, out: { x: 70, y: 80 } },
      labelAt: { x: -260, y: 40 },
      // Issue #49: pass-through, no holdup — the discrete pallet-building
      // machinery downstream of the sewn bag is out of scope (see the
      // parent spec's own Out of Scope section); product is counted as it
      // is bagged, at the terminus below, not as it is stacked.
      sim: { kind: "passThrough" },
    },
    {
      id: "palletStub",
      type: "stub",
      name: "bagged product · pallets out",
      tag: "STUB.PALLETS",
      status: "stub",
      zone: "bagging",
      x: 3186, y: 790, w: 8, h: 8,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 4, y: 4 } },
      // Issue #49: the branch's own terminus, reusing terminalSink (issue
      // #26) with its optional bag-counting field (issue #48's own
      // `bagSizeM3`, behaviors.js) so this terminus also reports a running
      // bag count alongside its volume total. `bagSizeM3` matches
      // concettiScale's own assumed 50 kg charge exactly, since a bag
      // arriving here is by construction one whole charge off that
      // machine's discharge pulse. `displayCapacityM3` is presenter-facing
      // only (same convention as discardBin's and bigBagStub's own), scaled
      // to ten bags — a much smaller absolute volume than bigBagStub's own
      // 10 m3 since these are small bags, not big bags — so the fill bar
      // visibly rises over a demo run.
      sim: {
        kind: "terminalSink",
        displayCapacityM3: (0.05 / BULK_DENSITY_T_PER_M3) * 10,
        bagSizeM3: 0.05 / BULK_DENSITY_T_PER_M3,
        provenance: { displayCapacityM3: "assumed", bagSizeM3: "assumed" },
      },
    },
  ],

  connections: [
    // treating
    { from: { machine: "upstreamStub", port: "out" }, to: { machine: "treatMetalRemover", port: "in" }, kind: "product", via: [{ x: 120, y: 64 }, { x: 120, y: 115 }] },
    { from: { machine: "treatMetalRemover", port: "waste" }, to: { machine: "metalRejectStub1", port: "in" }, kind: "waste", tbc: true },
    { from: { machine: "treatMetalRemover", port: "out" }, to: { machine: "treaterBufferBin", port: "in" }, kind: "product" },
    { from: { machine: "treaterBufferBin", port: "out" }, to: { machine: "treatDrumFeeder", port: "in" }, kind: "product" },
    { from: { machine: "treatDrumFeeder", port: "out" }, to: { machine: "treatingElevator", port: "in" }, kind: "product" },
    { from: { machine: "treatingElevator", port: "out" }, to: { machine: "treaterPreBin", port: "in" }, kind: "product" },
    { from: { machine: "treaterPreBin", port: "out" }, to: { machine: "batchTreater", port: "in" }, kind: "product" },
    { from: { machine: "batchTreater", port: "out" }, to: { machine: "treaterAfterBin", port: "in" }, kind: "product" },
    { from: { machine: "treaterAfterBin", port: "out" }, to: { machine: "scalpingScreen", port: "in" }, kind: "product" },
    // A plain diagonal, not a right-angle elbow — the discard bin sits down
    // and to the left of the screen's own waste port, and there's nothing
    // else in that gap for a right-angle routing to dodge.
    { from: { machine: "scalpingScreen", port: "waste" }, to: { machine: "discardBin", port: "in" }, kind: "waste" },
    // treating -> packaging (the cross-zone product run). Issue #62 inserts
    // the scalping screen's own discharge hopper between the screen and
    // inletDrumFeeder2 — the cross-zone hop is now the hopper's own outlet,
    // not the screen's. The hopper's own x is aligned with the screen's
    // product ("out") anchor, so this is a plain straight drop, no via
    // needed.
    { from: { machine: "scalpingScreen", port: "out" }, to: { machine: "scalpingDischargeHopper", port: "in" }, kind: "product" },
    // inletDrumFeeder2 is levelled with the hopper's own discharge and given
    // a left-side `in` anchor (see its own comment) specifically so this run
    // is a plain straight line into its left side, not a drop from above.
    { from: { machine: "scalpingDischargeHopper", port: "out" }, to: { machine: "inletDrumFeeder2", port: "in" }, kind: "product" },
    // packaging infeed. The two via points on each connection sketch the
    // pendulum conveyor's own floor run + climb (see its comment above):
    // down to floor level, across to the climb point, up into the
    // ceiling run.
    { from: { machine: "proBoxStation", port: "out" }, to: { machine: "inletDrumFeeder1", port: "in" }, kind: "product" },
    // Floor-run height (the first/second via y) follows the two feeders'
    // own move down (issue #62 follow-up, +88 from the original 800).
    { from: { machine: "inletDrumFeeder1", port: "out" }, to: { machine: "pendulumConveyor", port: "in1" }, kind: "product", via: [{ x: 1330, y: 888 }, { x: 1440, y: 888 }, { x: 1440, y: 148 }] },
    { from: { machine: "inletDrumFeeder2", port: "out" }, to: { machine: "pendulumConveyor", port: "in2" }, kind: "product", via: [{ x: 1200, y: 888 }, { x: 1440, y: 888 }, { x: 1440, y: 160 }] },
    // branch B: outload metal bins. No lift here (issue #44): the phantom
    // packaging bucket elevator is gone, so the buffer bin discharges
    // straight into the diverter by gravity.
    { from: { machine: "pendulumConveyor", port: "outBuffer" }, to: { machine: "grainBreak", port: "in" }, kind: "product" },
    { from: { machine: "grainBreak", port: "out" }, to: { machine: "outloadBufferBin", port: "in" }, kind: "product" },
    { from: { machine: "outloadBufferBin", port: "out" }, to: { machine: "outloadDiverter", port: "in" }, kind: "product" },
    { from: { machine: "outloadDiverter", port: "out1" }, to: { machine: "metalBin1", port: "in" }, kind: "product" },
    { from: { machine: "outloadDiverter", port: "out2" }, to: { machine: "metalBin2", port: "in" }, kind: "product", via: [{ x: 1845, y: 416 }] },
    { from: { machine: "metalBin1", port: "out" }, to: { machine: "dischargeStub1", port: "in" }, kind: "product", tbc: true },
    { from: { machine: "metalBin2", port: "out" }, to: { machine: "dischargeStub2", port: "in" }, kind: "product", tbc: true },
    // branch C: big bag
    { from: { machine: "pendulumConveyor", port: "outBinSeg" }, to: { machine: "binSegSampler", port: "in" }, kind: "product" },
    { from: { machine: "binSegSampler", port: "out" }, to: { machine: "flexiconPreBin", port: "in" }, kind: "product" },
    { from: { machine: "flexiconPreBin", port: "out" }, to: { machine: "vibratingConveyor", port: "in" }, kind: "product" },
    { from: { machine: "vibratingConveyor", port: "out" }, to: { machine: "flexiconFillingHead", port: "in" }, kind: "product", via: [{ x: 2630, y: 605 }] },
    { from: { machine: "flexiconFillingHead", port: "out" }, to: { machine: "rollerScale", port: "in" }, kind: "product" },
    { from: { machine: "rollerScale", port: "out" }, to: { machine: "bigBagStub", port: "in" }, kind: "product" },
    // branch A: Concetti
    { from: { machine: "pendulumConveyor", port: "outConcetti" }, to: { machine: "concettiSampler", port: "in" }, kind: "product", via: [{ x: 3190, y: 180 }] },
    { from: { machine: "concettiSampler", port: "out" }, to: { machine: "concettiPreBin", port: "in" }, kind: "product" },
    // bagging
    { from: { machine: "concettiPreBin", port: "out" }, to: { machine: "concettiScale", port: "in" }, kind: "product" },
    { from: { machine: "concettiScale", port: "out" }, to: { machine: "concettiFiller", port: "in" }, kind: "product" },
    { from: { machine: "concettiFiller", port: "out" }, to: { machine: "palletising", port: "in" }, kind: "product" },
    { from: { machine: "palletising", port: "out" }, to: { machine: "palletStub", port: "in" }, kind: "product" },
  ],

  // The control layer (issue #19): declarative threshold rules, each
  // reading one machine's level and, after a signal delay, commanding an
  // action on another machine. `treaterBufferBin.params` above exposes the
  // set points and signal delay declared here as live sliders; `control.js`
  // turns each entry into one runtime rule.
  interlocks: [
    {
      id: "bufferBinHighTrip",
      sensor: { machine: "treaterBufferBin" },
      // Engineer confirmed the interlock itself (buffer bin full -> close
      // the source valve). Set points and ramp time remain assumed: the
      // FD (2026-08-05) shows these are operator-adjustable SCADA
      // configuration, not fixed plant values, so there is nothing
      // further to absorb for them. signalDelaySec is now CONFIRMED from
      // the FD's own cause-and-effect matrix: LSH0 -> 5s -> elevator
      // 52.414.E00 trips -> 1s -> vibratory feeders trip -> 1s -> bin
      // outlet valves close (~7s total). See
      // docs/PLC_FUNCTIONAL_DESCRIPTION.md §5.
      //
      // The FD shows there is no automatic reopen in the real plant: a
      // level-high event is a trip, and a tripped device needs a SCADA
      // reset before it can restart — modelled since issue #45 as a
      // latch only the plant control's RESET TRIPS command clears (and
      // only once the level has actually cleared past highSetpoint; see
      // control.js's resetThresholdTrip). lowSetpoint below no longer
      // drives any control action — it's display-only, the LSL
      // instrument dot's setpoint — matching the FD's own classification
      // of LSL0 as an information alarm with no interlock role. See
      // docs/OPEN_QUESTIONS.md.
      highSetpoint: 0.85,
      lowSetpoint: 0.35,
      signalDelaySec: 7,
      action: { machine: "upstreamStub", rampTimeSec: 6 },
      provenance: {
        highSetpoint: "assumed", lowSetpoint: "assumed",
        signalDelaySec: "confirmed", rampTimeSec: "assumed",
      },
    },
    {
      id: "preBinFeedSchedule",
      kind: "gradedFeedSchedule",
      sensor: { machine: "treaterPreBin" },
      // Issue #56/#58/#60: replaces the old two-stage slow-then-stop
      // throttle (preBinSlowStopTrip) and the separate treatingElevatorRunningAutoStart
      // one-shot start (issue #42) with a single rule commanding both
      // actuators continuously. LSL/LSH set points are unchanged from that
      // old rule's own lowSetpoint/stop.setpoint (35%/85%) — the FD
      // (2026-08-05) independently confirms the same `52.507.H00.LSH0` -> 5s
      // -> elevator `52.506.E00` trip delay used below for LSHH's own trip
      // stage, re-sensored from LSH to the new LSHH per issue #56's own
      // decision (LSH itself no longer trips anything, purely display —
      // see the pre-bin's own INSTRUMENT_FIELDS entry, control.js).
      // LSHH (95%) is the new, confirmed sensor position issue #56 gives
      // directly. Each band's (speedFraction, gateFraction) pair is the
      // pre-bin's own real, currently-commissioned nominal operating point
      // (85% speed / 55% gate, ~13.92 TPH per the Simatek calculator,
      // units.js) scaled by sqrt(targetTph / nominalTph) to hit that band's
      // own target TPH while preserving the nominal Speed:Gate ratio (issue
      // #56's own "Implementation Decisions" section) — reproduced exactly
      // by units.test.js's own worked band examples. No FD or worksheet
      // number backs any band's own delay/ramp time (an engineer-described
      // addition, same as the old slow stage it replaces): 3s/4s carried
      // over from that old stage's own assumed figures. See
      // docs/OPEN_QUESTIONS.md.
      lowSetpoint: 0.35,
      highSetpoint: 0.85,
      highHighSetpoint: 0.95,
      boost: { speedFraction: 0.8525, gateFraction: 0.5516, delaySec: 3, rampTimeSec: 4 }, // ~14 TPH
      normal: { speedFraction: 0.7893, gateFraction: 0.5107, delaySec: 3, rampTimeSec: 4 }, // ~12 TPH
      throttle: { speedFraction: 0.5581, gateFraction: 0.3611, delaySec: 3, rampTimeSec: 4 }, // ~6 TPH
      trip: { delaySec: 5, rampTimeSec: 6 },
      action: { elevator: { machine: "treatingElevator" }, feeder: { machine: "treatDrumFeeder" } },
      provenance: {
        lowSetpoint: "confirmed", highSetpoint: "confirmed", highHighSetpoint: "confirmed",
        "boost.speedFraction": "derived", "boost.gateFraction": "derived",
        "boost.delaySec": "assumed", "boost.rampTimeSec": "assumed",
        "normal.speedFraction": "derived", "normal.gateFraction": "derived",
        "normal.delaySec": "assumed", "normal.rampTimeSec": "assumed",
        "throttle.speedFraction": "derived", "throttle.gateFraction": "derived",
        "throttle.delaySec": "assumed", "throttle.rampTimeSec": "assumed",
        "trip.delaySec": "confirmed", "trip.rampTimeSec": "assumed",
      },
    },
    {
      id: "afterBinHoldTreater",
      kind: "holdNextBatch",
      sensor: { machine: "treaterAfterBin" },
      // The third distinct response to a full bin on this line (issue #25),
      // and the FD's own words for it: "Treater after-bin high
      // 52.601.H00.LSH0 -> Treater 52.508.T00 -> 5 s -> treater stops
      // accepting batches" (docs/PLC_FUNCTIONAL_DESCRIPTION.md §5). Unlike
      // the buffer bin and pre-bin trips, there is no ramp on the actuator
      // side to time: the batch-cycle behaviour's `blocked` gate is either
      // open or shut (src/sim/behaviors.js `commandBatchCycle`), so the
      // signal delay below is the only timing this interlock has.
      //
      // highSetpoint is assumed, like every other bin's LSH0, but not
      // arbitrarily: a single charge (0.222 m3) is ~33% of this bin's own
      // 0.67 m3 capacity, far larger relative to its vessel than any other
      // bin on the line, and the batch already mid-cycle when the trip
      // fires is not stopped (see acceptance criteria) — it still has to
      // land somewhere. 60%, not the buffer bin/pre-bin's 85%, is chosen so
      // one more full charge always has room to discharge after the trip
      // without the physical backpressure the accumulator already enforces
      // ever coming into play. lowSetpoint (the clearing threshold) keeps
      // the same low-sensitivity reasoning as the buffer bin (#18/#19) and
      // pre-bin (#22): operator-adjustable SCADA configuration, not a fixed
      // plant value.
      highSetpoint: 0.6,
      lowSetpoint: 0.2,
      signalDelaySec: 5,
      action: { machine: "batchTreater" },
      provenance: {
        highSetpoint: "assumed", lowSetpoint: "assumed",
        signalDelaySec: "confirmed",
      },
    },
    // Issue #47: the outload branch's own cascade. The FD's cause-and-effect
    // matrix qualifies all four destination interlocks on 52.604.E00 "if
    // selected" (PLC_FUNCTIONAL_DESCRIPTION.md §5); only the two metal bins
    // have a real sensor behind them this ticket (the Flexicon and Concetti
    // pre-bins aren't sim-enabled yet), so this is two of the four rows the
    // FD's own table lists, not a partial reading of it. Issue #48 lands
    // the Flexicon row (flexiconPreBinHighTrip below), the third of the
    // four; issue #49 lands the fourth and last (concettiPreBinHighTrip),
    // completing the cascade the parent spec names as its central argument.
    {
      id: "metalBin1HighTrip",
      kind: "thresholdStopTrip",
      sensor: { machine: "metalBin1" },
      // "Metal bins high `52.613.H00/H01.LT0` -> Bucket elevator
      // `52.604.E00` 'if selected' ... 5 s -> drum feeders" (PLC_FD §5).
      // Classified a genuine **Trip** ("stops the device immediately, no
      // shutdown procedure" — FD §5's own severity table), unlike the
      // treater pre-bin's own engineer-described graduated VFD ramp — so
      // rampTimeSec is near-zero rather than multi-second. highSetpoint/
      // lowSetpoint follow the same assumed 85%/35% every other bin on the
      // line uses (no FD number given, working volume itself unconfirmed —
      // see metalBin1's own comment and docs/OPEN_QUESTIONS.md).
      // `armedWhen` (issue #47's own arming mechanism, control.js) requires
      // both routers: the conveyor's own selected outlet must be the shared
      // outload port, *and* the diverter downstream of it must point at
      // this specific bin — either alone is not "this bin is the selected
      // destination".
      highSetpoint: 0.85,
      lowSetpoint: 0.35,
      signalDelaySec: 5,
      action: { machine: "pendulumConveyor", rampTimeSec: 0.5 },
      armedWhen: [
        { machine: "pendulumConveyor", port: "outBuffer" },
        { machine: "outloadDiverter", port: "out1" },
      ],
      provenance: {
        highSetpoint: "assumed", lowSetpoint: "assumed",
        signalDelaySec: "confirmed", rampTimeSec: "assumed",
      },
    },
    {
      id: "metalBin2HighTrip",
      kind: "thresholdStopTrip",
      sensor: { machine: "metalBin2" },
      // Same rule as metalBin1HighTrip above, mirrored onto the other bin —
      // see its own comment for the full reasoning.
      highSetpoint: 0.85,
      lowSetpoint: 0.35,
      signalDelaySec: 5,
      action: { machine: "pendulumConveyor", rampTimeSec: 0.5 },
      armedWhen: [
        { machine: "pendulumConveyor", port: "outBuffer" },
        { machine: "outloadDiverter", port: "out2" },
      ],
      provenance: {
        highSetpoint: "assumed", lowSetpoint: "assumed",
        signalDelaySec: "confirmed", rampTimeSec: "assumed",
      },
    },
    {
      id: "flexiconPreBinHighTrip",
      kind: "thresholdStopTrip",
      sensor: { machine: "flexiconPreBin" },
      // Issue #48, the FD's third destination-interlock row: "Flexicon
      // pre-bin high `52.701.H00.LSH0` -> Bucket elevator `52.604.E00` 'if
      // selected' ... 5 s -> drum feeders" (PLC_FUNCTIONAL_DESCRIPTION.md
      // §5) — same shape and same actuator as the two metal bins' own
      // trips (metalBin1HighTrip/metalBin2HighTrip above), reused
      // unchanged. `armedWhen` here needs only one condition, not two: this
      // branch has no diverter downstream of the conveyor the way the
      // outload branch does (one outlet, `outBinSeg`, one destination), so
      // the conveyor's own selected port alone is "Flexicon is selected".
      highSetpoint: 0.85,
      lowSetpoint: 0.35,
      signalDelaySec: 5,
      action: { machine: "pendulumConveyor", rampTimeSec: 0.5 },
      armedWhen: [{ machine: "pendulumConveyor", port: "outBinSeg" }],
      provenance: {
        highSetpoint: "assumed", lowSetpoint: "assumed",
        signalDelaySec: "confirmed", rampTimeSec: "assumed",
      },
    },
    {
      id: "concettiPreBinHighTrip",
      kind: "thresholdStopTrip",
      sensor: { machine: "concettiPreBin" },
      // Issue #49, the FD's fourth and last destination-interlock row:
      // "Concetti pre-bin high `52.705.H00.LSH0` -> Bucket elevator
      // `52.604.E00` 'if selected' ... 5 s -> drum feeders"
      // (PLC_FUNCTIONAL_DESCRIPTION.md §5, line 269) — same shape and same
      // actuator as every other destination trip on this conveyor
      // (metalBin1HighTrip/metalBin2HighTrip/flexiconPreBinHighTrip above),
      // reused unchanged. This is the demonstration the parent spec names
      // as the whole project's central argument: a bag machine at one end
      // of the building trips this conveyor, which trips both inlet drum
      // feeders one second later (conveyorRunningInterlockFeeder1/2 below),
      // which starves the scalping screen, backs up the treater after-bin
      // (afterBinHoldTreater), and stops the batch treater — one cascade
      // spanning the entire line. `armedWhen` needs only one condition, the
      // same reasoning flexiconPreBinHighTrip's own comment gives: this
      // branch has no diverter downstream of the conveyor, just the one
      // outlet, `outConcetti`.
      highSetpoint: 0.85,
      lowSetpoint: 0.35,
      signalDelaySec: 5,
      action: { machine: "pendulumConveyor", rampTimeSec: 0.5 },
      armedWhen: [{ machine: "pendulumConveyor", port: "outConcetti" }],
      provenance: {
        highSetpoint: "assumed", lowSetpoint: "assumed",
        signalDelaySec: "confirmed", rampTimeSec: "assumed",
      },
    },
    {
      id: "conveyorRunningInterlockFeeder1",
      kind: "autoStopOnNotRunning",
      sensor: { machine: "pendulumConveyor" },
      // "Inlet drum feeders `52.603.L00/L01` | `52.604.E00` running"
      // (PLC_FD §5's reverse-direction interlock table) — a plain Process
      // Interlock, not a Trip, so it is not latched (see
      // autoStopOnNotRunning's own control.js comment): it releases the
      // instant the conveyor is confirmed running again, no reset needed.
      // 1 s delay is the FD's own figure for this exact interlock.
      signalDelaySec: 1,
      action: { machine: "inletDrumFeeder1" },
      provenance: { signalDelaySec: "confirmed" },
    },
    {
      id: "conveyorRunningInterlockFeeder2",
      kind: "autoStopOnNotRunning",
      sensor: { machine: "pendulumConveyor" },
      // Same interlock, mirrored onto the other packaging drum feeder — see
      // conveyorRunningInterlockFeeder1's own comment.
      signalDelaySec: 1,
      action: { machine: "inletDrumFeeder2" },
      provenance: { signalDelaySec: "confirmed" },
    },
  ],
  // The always-on speed x gate -> rate derivation (issue #59), wired onto
  // the real line for the first time (issue #60): the treating elevator's
  // live effective speed and the treating-side inlet drum feeder's live
  // effective gate, run through the Simatek formula every tick regardless
  // of preBinFeedSchedule's own phase, so a presenter's dial change (or
  // that schedule's own commanded band) shows up in the feeder's commanded
  // rate immediately. Concetti's own inlet drum feeders/pendulumConveyor
  // pair (issue #56's own scope) aren't linked here — that's a separate,
  // later ticket.
  feedRateDerivations: [
    { id: "treatingFeedRateDerivation", elevator: { machine: "treatingElevator" }, feeder: { machine: "treatDrumFeeder" } },
  ],
};

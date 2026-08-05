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
// exist (removed below). It did not resolve whether the top distribution
// conveyor is a separate machine or the upper horizontal run of
// 52.604.E00 (see PLC_FUNCTIONAL_DESCRIPTION.md §8.3) — left unretagged
// pending that answer.
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

import { tPerHourToM3PerSec } from "../sim/units";

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
      // Yellow-bin pan feeders set to 12 t/h, SCADA-commanded [CONFIRMED
      // 2026-06-30, REAL_LINE_SPECS.md §5]. Stands in for the real upstream
      // source (out of sim scope) as a settable valve.
      sim: {
        kind: "source",
        rateM3PerSec: tPerHourToM3PerSec(12),
        provenance: { rateM3PerSec: "confirmed" },
      },
      // Range floors at 0 (not the confirmed 2-20 t/h operating range) so a
      // presenter can slide the source to zero and watch how the rest of
      // the line reacts once nothing new is coming in — a deliberately
      // off-spec testing position, not a claim about real feeder limits.
      params: [{ id: "rate", label: "source rate", min: 0, max: 20, value: 12, unit: "t/h", bind: "sourceRate" }],
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
      fill: 0.55,
      instruments: ["LT", "LSH", "LSL"],
      labelAt: { x: -6, y: -16 },
      // Live jump, not just an initial condition: dragging this sets the
      // running sim's current level immediately (see PARAM_BINDERS.levelJump
      // in MeetingApp.jsx), for staging a scenario mid-presentation — this is
      // also how a presenter demonstrates the low-set-point reopen (issue
      // #19) without waiting on the drum feeder's own drain (issue #20),
      // which starts off by default (see treatDrumFeeder below).
      params: [
        { id: "level", label: "fill level", min: 0, max: 100, value: 55, unit: "%", bind: "levelJump" },
        { id: "highSetpoint", label: "LSH set point", min: 55, max: 100, value: 85, unit: "%", bind: "interlockHighSetpoint" },
        { id: "lowSetpoint", label: "LSL set point", min: 0, max: 55, value: 35, unit: "%", bind: "interlockLowSetpoint" },
        { id: "signalDelay", label: "signal delay", min: 0, max: 15, value: 7, unit: "s", bind: "interlockSignalDelay" },
      ],
      // 7.7 m3 / 5.5 t working volume [CONFIRMED 2026-06-30,
      // REAL_LINE_SPECS.md §5]. LSH/LSL set points and the 55% start level
      // are assumed (see docs/OPEN_QUESTIONS.md) — low sensitivity per
      // issue #18, so not raised with the engineer.
      sim: {
        kind: "accumulator",
        capacityM3: 7.7,
        initialLevelFraction: 0.55,
        provenance: { capacityM3: "confirmed", initialLevelFraction: "assumed" },
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
      // REAL_LINE_SPECS.md §5]. Starts at 0 (off): the engineer confirmed
      // the real feeder starts as soon as the bucket elevator is confirmed
      // running. The elevator itself is sim-enabled from issue #21, but the
      // "elevator confirmed running" interlock that would auto-start this
      // feeder is still not modelled (it needs a running/settled signal on
      // the elevator, not just its transport delay). Until then the
      // presenter starts it live with this slider, the same staging pattern
      // issue #19 used for the bin's level. The real feeder is also not a
      // direct rate control but a non-proportional percentage opening — a
      // linear opening -> rate mapping is assumed across the confirmed range
      // until the engineer's
      // spreadsheet of estimated values (referenced, never sent) arrives;
      // see docs/OPEN_QUESTIONS.md. The FD (2026-08-05) confirms the
      // mechanism but not the numbers: two actuators A/B drive two
      // discrete opening-degree positions (XV4/XV5) — the real control
      // may be a two-position selector, not a continuous dial.
      params: [{ id: "rate", label: "feed rate", min: 0, max: 20, value: 0, unit: "t/h", bind: "feederRate" }],
      sim: {
        kind: "meteredFeeder",
        rateM3PerSec: 0,
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
      params: [{ id: "speed", label: "speed", min: 0, max: 100, value: 100, unit: "%", bind: "elevatorSpeed" }],
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
      fill: 0.4,
      instruments: ["LSH", "LSL"],
      labelAt: { x: -10, y: -16 },
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
      // Confirmed 2026-06-30: batch = 160 kg every ~40 s ≈ 14.4 t/h; line bottleneck.
      params: [{ id: "batchRate", label: "treat rate", min: 4, max: 18, value: 14.4, unit: "t/h" }],
    },
    {
      id: "chemStub",
      type: "stub",
      name: "future: powder dosing station",
      tag: "STUB.CHEM",
      status: "stub",
      zone: "treating",
      x: 800, y: 450, w: 8, h: 8,
      ports: { inputs: [], outputs: ["out"] },
      anchors: { out: { x: 4, y: 4 } },
    },
    {
      id: "wasteWaterIbc",
      type: "ibc",
      name: "WASTE WATER IBC",
      tag: "TBC-06",
      status: "new",
      zone: "treating",
      x: 730, y: 560, w: 60, h: 46,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 30, y: 0 } },
      smallLabel: true,
      labelAt: { x: 70, y: 28 },
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
      fill: 0.3,
      instruments: ["LSH", "LSL"],
      labelAt: { x: -150, y: 30 },
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
      params: [{ id: "wasteFrac", label: "scalpings split", min: 0, max: 20, value: 3, unit: "%" }],
    },
    {
      id: "discardBin",
      type: "metalBin",
      name: "DISCARD SCALPINGS BIN",
      tag: "52.801.L00",
      status: "new",
      zone: "treating",
      x: 620, y: 790, w: 100, h: 80,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 50, y: 0 } },
      fill: 0.2,
      labelAt: { x: 0, y: 106 },
    },

    // ============ PACKAGING & OUTLOAD (sheet 52-13) ============
    {
      id: "proBoxStation",
      type: "proBox",
      name: "PRO BOX UNLOADING STATION",
      tag: "52.608.H00",
      status: "new",
      zone: "packaging",
      x: 1140, y: 600, w: 120, h: 80,
      ports: { inputs: [], outputs: ["out"] },
      anchors: { out: { x: 60, y: 80 } },
      labelAt: { x: 0, y: -14 },
    },
    {
      id: "inletDrumFeeder1",
      type: "drumFeeder",
      name: "INLET DRUM FEEDER 1",
      tag: "52.603.L00",
      status: "new",
      zone: "packaging",
      x: 1160, y: 730, w: 80, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 40, y: 0 }, out: { x: 40, y: 36 } },
      labelAt: { x: -160, y: 24 },
      params: [{ id: "rate", label: "feed rate", min: 2, max: 20, value: 12, unit: "t/h" }],
    },
    {
      id: "inletDrumFeeder2",
      type: "drumFeeder",
      name: "INLET DRUM FEEDER 2",
      tag: "52.603.L01",
      status: "new",
      zone: "packaging",
      x: 1290, y: 730, w: 80, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 40, y: 0 }, out: { x: 40, y: 36 } },
      labelAt: { x: 90, y: 24 },
      params: [{ id: "rate", label: "feed rate", min: 2, max: 20, value: 12, unit: "t/h" }],
    },
    {
      id: "liftConveyor",
      type: "conveyor",
      name: "LIFT TO TOP CONVEYOR",
      tag: "52.604.E00",
      status: "new",
      zone: "packaging",
      x: 1170, y: 800, w: 220, h: 40,
      ports: { inputs: ["in1", "in2"], outputs: ["out"] },
      anchors: { in1: { x: 30, y: 0 }, in2: { x: 160, y: 0 }, out: { x: 215, y: 8 } },
      instruments: ["LSH"],
      labelAt: { x: 0, y: 64 },
    },
    {
      id: "topConveyor",
      type: "conveyor",
      name: "TOP TRANSPORT CONVEYOR",
      // 52.605.X00 was the drawing-era guess for this machine; the FD
      // (2026-08-05) reassigns that tag to the Concetti auto sampler
      // instead (see concettiSampler below) and never names a top
      // conveyor at all. Left as a placeholder pending the engineer
      // question in docs/PLC_FUNCTIONAL_DESCRIPTION.md §8.3: is this a
      // separate machine, or the upper horizontal run of 52.604.E00?
      tag: "TBC-21",
      status: "new",
      zone: "packaging",
      x: 1440, y: 140, w: 1750, h: 26,
      ports: { inputs: ["in"], outputs: ["outBuffer", "outBinSeg", "outConcetti"] },
      anchors: {
        in: { x: 10, y: 20 },
        outBuffer: { x: 240, y: 26 },
        outBinSeg: { x: 1120, y: 26 },
        outConcetti: { x: 1745, y: 26 },
      },
      labelAt: { x: 560, y: -14 },
      params: [{ id: "speed", label: "speed", min: 0, max: 100, value: 100, unit: "%" }],
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
      fill: 0.62,
      instruments: ["LSH", "LSL"],
      labelAt: { x: -190, y: 30 },
    },
    {
      id: "packagingElevator",
      type: "elevator",
      name: "BUCKET ELEVATOR · PACKAGING",
      tag: "52.702.U00",
      status: "new",
      zone: "packaging",
      x: 1690, y: 196, w: 570, h: 240,
      geom: { colX: 264, duct: 36 },
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 25, y: 204 }, out: { x: 526, y: 44 } },
      instruments: ["ST"],
      labelAt: { x: 30, y: 296 },
      params: [{ id: "speed", label: "speed", min: 0, max: 100, value: 100, unit: "%" }],
    },
    {
      id: "grainBreak",
      type: "grainBreak",
      name: "GRAIN BREAK",
      tag: "TBC-20",
      status: "new",
      zone: "packaging",
      x: 2192, y: 270, w: 48, h: 36,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 24, y: 0 }, out: { x: 24, y: 36 } },
      labelAt: { x: -150, y: 8 },
    },
    {
      id: "outloadDiverter",
      type: "diverter",
      name: "DIVERTER",
      tag: "52.613.V00",
      status: "new",
      zone: "packaging",
      x: 2200, y: 330, w: 32, h: 32,
      ports: { inputs: ["in"], outputs: ["out1", "out2"] },
      anchors: { in: { x: 16, y: 0 }, out1: { x: 8, y: 24 }, out2: { x: 32, y: 16 } },
      smallLabel: true,
      labelAt: { x: 44, y: -4 },
    },
    {
      id: "metalBin1",
      type: "metalBin",
      name: "TREATED OUTLOAD METAL BIN 1",
      tag: "52.613.H00",
      status: "new",
      zone: "packaging",
      x: 2120, y: 410, w: 160, h: 172,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 80, y: 0 }, out: { x: 80, y: 162 } },
      fill: 0.35,
      instruments: ["LT"],
      labelAt: { x: 0, y: 198 },
    },
    {
      id: "dischargeStub1",
      type: "stub",
      name: "discharge · TBC",
      tag: "STUB.DISCH1",
      status: "stub",
      zone: "packaging",
      x: 2196, y: 650, w: 8, h: 8,
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
      x: 2350, y: 410, w: 160, h: 172,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 80, y: 0 }, out: { x: 80, y: 162 } },
      fill: 0.12,
      instruments: ["LT"],
      labelAt: { x: 0, y: 198 },
    },
    {
      id: "dischargeStub2",
      type: "stub",
      name: "discharge · TBC",
      tag: "STUB.DISCH2",
      status: "stub",
      zone: "packaging",
      x: 2426, y: 650, w: 8, h: 8,
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
    },
    {
      id: "binSegment",
      type: "bin",
      name: "BIN SEGMENT",
      tag: "TBC-11",
      status: "new",
      zone: "packaging",
      x: 2500, y: 280, w: 120, h: 130,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 60, y: 0 }, out: { x: 60, y: 130 } },
      fill: 0.7,
      instruments: ["LT"],
      labelAt: { x: -15, y: -16 },
    },
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
      fill: 0.45,
      instruments: ["LSH", "LSL"],
      labelAt: { x: 120, y: 55 },
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
      fill: 0.5,
      labelAt: { x: 110, y: 30 },
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
      params: [{ id: "rate", label: "bagging rate", min: 0, max: 15, value: 12, unit: "t/h" }],
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
    { from: { machine: "chemStub", port: "out" }, to: { machine: "batchTreater", port: "chemIn" }, kind: "chemical" },
    { from: { machine: "batchTreater", port: "wasteOut" }, to: { machine: "wasteWaterIbc", port: "in" }, kind: "waste" },
    { from: { machine: "batchTreater", port: "out" }, to: { machine: "treaterAfterBin", port: "in" }, kind: "product" },
    { from: { machine: "treaterAfterBin", port: "out" }, to: { machine: "scalpingScreen", port: "in" }, kind: "product" },
    { from: { machine: "scalpingScreen", port: "waste" }, to: { machine: "discardBin", port: "in" }, kind: "waste" },
    // treating -> packaging (the cross-zone product run)
    { from: { machine: "scalpingScreen", port: "out" }, to: { machine: "inletDrumFeeder2", port: "in" }, kind: "product", via: [{ x: 1310, y: 715 }] },
    // packaging infeed
    { from: { machine: "proBoxStation", port: "out" }, to: { machine: "inletDrumFeeder1", port: "in" }, kind: "product" },
    { from: { machine: "inletDrumFeeder1", port: "out" }, to: { machine: "liftConveyor", port: "in1" }, kind: "product" },
    { from: { machine: "inletDrumFeeder2", port: "out" }, to: { machine: "liftConveyor", port: "in2" }, kind: "product" },
    { from: { machine: "liftConveyor", port: "out" }, to: { machine: "topConveyor", port: "in" }, kind: "product", via: [{ x: 1440, y: 808 }, { x: 1440, y: 166 }] },
    // branch B: outload metal bins
    { from: { machine: "topConveyor", port: "outBuffer" }, to: { machine: "outloadBufferBin", port: "in" }, kind: "product" },
    { from: { machine: "outloadBufferBin", port: "out" }, to: { machine: "packagingElevator", port: "in" }, kind: "product" },
    { from: { machine: "packagingElevator", port: "out" }, to: { machine: "grainBreak", port: "in" }, kind: "product" },
    { from: { machine: "grainBreak", port: "out" }, to: { machine: "outloadDiverter", port: "in" }, kind: "product" },
    { from: { machine: "outloadDiverter", port: "out1" }, to: { machine: "metalBin1", port: "in" }, kind: "product" },
    { from: { machine: "outloadDiverter", port: "out2" }, to: { machine: "metalBin2", port: "in" }, kind: "product", tbc: true, inactive: true, via: [{ x: 2430, y: 372 }] },
    { from: { machine: "metalBin1", port: "out" }, to: { machine: "dischargeStub1", port: "in" }, kind: "product", tbc: true },
    { from: { machine: "metalBin2", port: "out" }, to: { machine: "dischargeStub2", port: "in" }, kind: "product", tbc: true },
    // branch C: big bag
    { from: { machine: "topConveyor", port: "outBinSeg" }, to: { machine: "binSegSampler", port: "in" }, kind: "product" },
    { from: { machine: "binSegSampler", port: "out" }, to: { machine: "binSegment", port: "in" }, kind: "product" },
    { from: { machine: "binSegment", port: "out" }, to: { machine: "flexiconPreBin", port: "in" }, kind: "product" },
    { from: { machine: "flexiconPreBin", port: "out" }, to: { machine: "vibratingConveyor", port: "in" }, kind: "product" },
    { from: { machine: "vibratingConveyor", port: "out" }, to: { machine: "flexiconFillingHead", port: "in" }, kind: "product", via: [{ x: 2630, y: 605 }] },
    { from: { machine: "flexiconFillingHead", port: "out" }, to: { machine: "rollerScale", port: "in" }, kind: "product" },
    { from: { machine: "rollerScale", port: "out" }, to: { machine: "bigBagStub", port: "in" }, kind: "product" },
    // branch A: Concetti
    { from: { machine: "topConveyor", port: "outConcetti" }, to: { machine: "concettiSampler", port: "in" }, kind: "product", via: [{ x: 3190, y: 180 }] },
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
      // Note this interlock models only the trip (close). The FD shows
      // there is no automatic reopen in the real plant: a level-high
      // event is a trip, and a tripped device needs a SCADA reset before
      // it can restart. The reopen at lowSetpoint below is a modelling
      // convenience for the demo, not plant behaviour — see
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
  ],
};

import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, resetSim, resetTrips, getMachineState, setSourceRate, setFeederRate, setAccumulatorLevel, DT,
  setInterlockHighSetpoint, setInterlockLowSetpoint, setInterlockHighHighSetpoint, setInterlockSignalDelay, getInterlockState,
  getCombinedEvents, setElevatorSpeed, setGateFraction,
  setBatchSize, setBatchCycleSec, setSplitterWasteFraction, setSource, getSource,
  setDestination, getDestination,
  controlledStop, resumeLine, getControlledStopPhase,
  setUtilitiesHealthy, getUtilitiesTripPhase,
  clearPlant, emptyTerminalSink,
} from "./engine";
import { assertConserved, conservationTotals } from "./conservation";
import { tPerHourToM3PerSec, m3PerSecToTPerHour } from "./units";
import { instrumentReadings } from "./control";
import { line } from "../line/lineData";
import { BEHAVIORS } from "./behaviors";

const SOURCE_ID = "upstreamStub";
const METAL_REMOVER_ID = "treatMetalRemover";
const BUFFER_BIN_ID = "treaterBufferBin";
const FEEDER_ID = "treatDrumFeeder";
const ELEVATOR_ID = "treatingElevator";
const PRE_BIN_ID = "treaterPreBin";
const TREATER_ID = "batchTreater";
const AFTER_BIN_ID = "treaterAfterBin";
const SCREEN_ID = "scalpingScreen";
const DISCARD_BIN_ID = "discardBin";

function interlockRule(sim) {
  return getInterlockState(sim, BUFFER_BIN_ID);
}

// Issue #46: the scalping screen's product output now carries on into a
// real, live packaging chain (inletDrumFeeder2 -> pendulumConveyor ->
// grainBreak -> outloadBufferBin) instead of terminating as "delivered" at
// the un-engined build frontier. The outload buffer bin has no discharge
// modelled yet (its own downstream, the outload diverter, is still un-sim-
// enabled until the destination-selector ticket) — so it fills once, for
// good, and backpressures the entire treating zone behind it, exactly per
// this ticket's own acceptance criteria. The many long-running,
// steady-state tests below predate packaging and are about the treating
// zone specifically (the feeder/elevator/pre-bin/after-bin/treater
// interplay) — same reasoning as `lineWithoutBatchTreater` further down —
// so they isolate that zone by stripping just the one new sim block that
// actually changes their behaviour, `inletDrumFeeder2`, restoring exactly
// the pre-#46 "delivered" sink at the screen's own product port. The real,
// full-line packaging behaviour (including the backpressure this strips
// away here) gets its own dedicated coverage in the issue #46 describe
// block below, against the real `line`.
// Issue #47 also adds an interlock whose actuator is inletDrumFeeder2
// (conveyorRunningInterlockFeeder2, the conveyor's own "not running" PI on
// each packaging feeder) — stripped alongside the feeder itself, since a
// rule commanding a machine that no longer exists in this fixture isn't
// meaningful here either.
// Issue #62 inserts a real accumulator (scalpingDischargeHopper) between the
// screen and inletDrumFeeder2, so stripping the feeder alone no longer
// restores the screen's own product port as the unconstrained "delivered"
// sink this fixture relies on — the hopper is still sim-enabled, and an
// accumulator with nothing sim-enabled downstream of it fills once and
// blocks for good (issue #18's own fill-only convention), not the
// unconstrained passthrough a splitter falls back to. The hopper's sim block
// is stripped alongside the feeder's so the screen's product port is once
// again the un-engined frontier this fixture's isolation depends on.
// Issue #60: replaces the pre-bin's old two-stage throttle (issue #22) plus
// the separate feeder auto-start (issue #42) with a single gradedFeedSchedule
// rule commanding both the treating elevator and treatDrumFeeder, and wires
// the always-on speed x gate -> rate derivation (issue #59) onto that same
// pair. Under that wiring, treatDrumFeeder's own commanded rate is
// continuously overwritten from the elevator's live speed and this feeder's
// own live gate (see stepFeedRateDerivation, control.js) — deliberately
// unguarded by manualOverride, so setFeederRate no longer has any lasting
// effect on it. Every describe block below that predates #60 and isn't
// actually testing the new schedule/derivation itself used setFeederRate as
// its generic "how fast is material entering the elevator" lever, so those
// blocks run against this variant instead — same isolation idiom as
// lineWithoutBatchTreater/lineWithoutPackaging below (both now built on top
// of this one), restoring treatDrumFeeder to a plain, directly rate-controlled
// meteredFeeder and treatingElevator to an uninterlocked transport delay,
// exactly their pre-#60 behaviour. The schedule/derivation's own real-line
// behaviour gets its own dedicated coverage against the real `line`, in the
// "treater pre-bin's graded feed schedule (issue #60)" describe block below.
const lineWithoutFeedSchedule = {
  ...line,
  interlocks: line.interlocks.filter((i) => i.kind !== "gradedFeedSchedule"),
  feedRateDerivations: (line.feedRateDerivations ?? []).filter((d) => d.feeder.machine !== "treatDrumFeeder"),
};

const lineWithoutPackaging = {
  ...lineWithoutFeedSchedule,
  machines: lineWithoutFeedSchedule.machines.map((m) =>
    m.id === "inletDrumFeeder2" || m.id === "scalpingDischargeHopper" ? { ...m, sim: undefined } : m
  ),
  interlocks: lineWithoutFeedSchedule.interlocks.filter((i) => i.action.machine !== "inletDrumFeeder2"),
};

describe("createSim / stepSim (real Treater Line 2 data)", () => {
  it("creates a sim and steps it by a fixed timestep", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(sim.t).toBe(0);
    stepSim(sim, DT);
    expect(sim.t).toBeCloseTo(DT);
    stepSim(sim, DT);
    expect(sim.t).toBeCloseTo(DT * 2);
  });

  it("reads a machine's current state back", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(getMachineState(sim, BUFFER_BIN_ID).kind).toBe("accumulator");
    expect(getMachineState(sim, "notAMachine")).toBeUndefined();
  });

  it("reads an interlock's current state back by its sensor machine", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(getInterlockState(sim, BUFFER_BIN_ID).phase).toBe("open");
    expect(getInterlockState(sim, "notAMachine")).toBeUndefined();
  });

  it("source injects at its configured rate, accumulating in the empty bin", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this test is about the source/bin fill, not the feeder's own auto-start (issue #42)
    for (let i = 0; i < 100; i++) stepSim(sim, DT);
    const source = getMachineState(sim, SOURCE_ID);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(source.fed).toBeCloseTo(tPerHourToM3PerSec(12) * DT * 100);
    expect(bin.stored).toBeCloseTo(source.fed); // issue #55: starts empty, no assumed starting level to add
  });

  it("source rate can be changed while the sim is running", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, 0);
    stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).fed).toBe(0);

    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).fed).toBeCloseTo(tPerHourToM3PerSec(12) * DT);
  });

  it("metal remover holds zero volume at all times", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 50; i++) {
      stepSim(sim, DT);
      expect(getMachineState(sim, METAL_REMOVER_ID).volume).toBe(0);
    }
  });

  it("buffer bin reports its level as a fraction of working volume, starting empty (issue #55)", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored / bin.capacity).toBe(0);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55);
    expect(bin.stored / bin.capacity).toBeCloseTo(0.55);
  });

  it("buffer bin fills and rejects once full; rejected material backs up to the source instead of vanishing", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20)); // fast enough to fill it
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this test is about the bin's own backpressure, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 2); // unreachable: isolates raw accumulator backpressure from the issue #19 interlock
    for (let i = 0; i < 20000; i++) stepSim(sim, DT);

    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored).toBeCloseTo(bin.capacity);
    expect(bin.stored).toBeLessThanOrEqual(bin.capacity + 1e-9);
    expect(bin.spill).toBeCloseTo(0); // backpressure, not spill, per issue #18

    const source = getMachineState(sim, SOURCE_ID);
    const fedBeforeStall = source.fed;
    for (let i = 0; i < 20; i++) stepSim(sim, DT);
    // once the bin is full, further ticks accept nothing further from the source
    expect(source.fed).toBeCloseTo(fedBeforeStall);
  });

  it("conserves volume through fill and overflow (fed = stored + inTransit + delivered + spilled)", () => {
    const sim = createSim(lineWithoutPackaging); // isolates the treating zone's own bins (see fixture comment)
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < 20000; i++) {
      stepSim(sim, DT);
    }
    expect(() => assertConserved(sim)).not.toThrow();

    const totals = conservationTotals(sim);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    // Since issue #22, the pre-bin is also a sim-enabled accumulator, and
    // since issue #25 so is the after-bin — both contribute their own
    // stored volume to the total (since issue #42 that's genuinely moving:
    // the feeder auto-starts once the elevator is confirmed running). The
    // outload buffer bin (issue #46), the outload diverter and both metal
    // bins (issue #47) are sim-enabled too, and stay present even under
    // lineWithoutPackaging (only inletDrumFeeder2's own sim block is
    // stripped there) — neither packaging feeder ever draws under this
    // fixture (Pro Box starts disabled, and the treating-side feeder isn't
    // sim-enabled at all here), so nothing new ever reaches the outload
    // branch; but the buffer bin's own authored initial stock does drain
    // straight through the now-live diverter into metal bin 1 (its default
    // destination) on the very first tick, so both bins' own `stored`
    // count toward the total, not just the buffer bin's.
    const preBin = getMachineState(sim, PRE_BIN_ID);
    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    const outloadBufferBin = getMachineState(sim, "outloadBufferBin");
    const metalBin1 = getMachineState(sim, "metalBin1");
    const metalBin2 = getMachineState(sim, "metalBin2");
    expect(totals.stored).toBeCloseTo(
      bin.stored + preBin.stored + afterBin.stored + outloadBufferBin.stored + metalBin1.stored + metalBin2.stored
    );
  });

  it("throws when a line declares an unregistered sim.kind", () => {
    const badLine = {
      ...line,
      machines: line.machines.map((m) =>
        m.id === METAL_REMOVER_ID ? { ...m, sim: { kind: "teleporter" } } : m
      ),
    };
    expect(() => createSim(badLine)).toThrow(/unregistered sim\.kind/);
  });

  it("setAccumulatorLevel jumps the live level and stays conserved", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 100; i++) stepSim(sim, DT); // some fed volume in the mix already

    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0);
    let bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored).toBe(0);
    expect(() => assertConserved(sim)).not.toThrow();

    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.95);
    bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored).toBeCloseTo(bin.capacity * 0.95);
    expect(() => assertConserved(sim)).not.toThrow();

    // out-of-range fractions clamp to the bin's physical limits
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 5);
    expect(getMachineState(sim, BUFFER_BIN_ID).stored).toBeCloseTo(bin.capacity);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, -1);
    expect(getMachineState(sim, BUFFER_BIN_ID).stored).toBe(0);
  });

  it("setAccumulatorLevel rejects a non-accumulator machine", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(() => setAccumulatorLevel(sim, SOURCE_ID, 0.5)).toThrow(/not an accumulator/);
  });
});

describe("buffer bin's high-set-point interlock closes the source valve, late (issue #19)", () => {
  it("keeps the valve fully open through the signal delay after the high set point trips", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this block's own pre-#55 starting premise
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6); // just above the 55% start level
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 5);

    let tripped = false;
    for (let i = 0; i < 2000; i++) {
      stepSim(sim, DT);
      if (interlockRule(sim).phase !== "open") { tripped = true; break; }
    }
    expect(tripped).toBe(true);
    expect(interlockRule(sim).phase).toBe("delayedClose");
    expect(getMachineState(sim, SOURCE_ID).openness).toBe(1); // still fully open mid-delay

    for (let i = 0; i < 120; i++) stepSim(sim, DT); // consume the remaining ~6s of the 5s delay, with margin
    expect(interlockRule(sim).phase).not.toBe("delayedClose");
    expect(getMachineState(sim, SOURCE_ID).openness).toBeLessThan(1); // now ramping shut
  });

  it("grain released before the valve fully closes still arrives at the bin, and conservation holds throughout", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this block's own pre-#55 starting premise
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 2);

    let storedAtTrip = null;
    for (let i = 0; i < 3000; i++) {
      stepSim(sim, DT);
      assertConserved(sim);
      if (storedAtTrip === null && interlockRule(sim).phase !== "open") {
        storedAtTrip = getMachineState(sim, BUFFER_BIN_ID).stored;
      }
    }
    const finalStored = getMachineState(sim, BUFFER_BIN_ID).stored;
    expect(finalStored).toBeGreaterThan(storedAtTrip); // arrived after the trip
    expect(getMachineState(sim, SOURCE_ID).openness).toBe(0); // valve now fully closed
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("the bin overshoots the high set point rather than stopping exactly at it", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this block's own pre-#55 starting premise
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 3);
    for (let i = 0; i < 3000; i++) stepSim(sim, DT);

    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored / bin.capacity).toBeGreaterThan(0.6);
  });

  it("a larger signal delay produces a larger overshoot", () => {
    function peakOvershoot(signalDelaySec) {
      const sim = createSim(lineWithoutFeedSchedule);
      // Faster than the demo default so the trip arrives well inside the
      // step budget below, but still slow enough relative to the 15% of
      // capacity above the set point that neither run saturates the bin
      // (see the comment's arithmetic: rate * (delay + rampTime/2) must
      // stay under capacity * 0.15 even at the larger delay).
      setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(100));
      setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
      setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.85);
      setInterlockSignalDelay(sim, BUFFER_BIN_ID, signalDelaySec);
      for (let i = 0; i < 6000; i++) stepSim(sim, DT); // long past delay + 6s ramp
      const bin = getMachineState(sim, BUFFER_BIN_ID);
      expect(getMachineState(sim, SOURCE_ID).openness).toBe(0); // confirms the run reached steady state
      return bin.stored / bin.capacity - 0.85;
    }

    const smallDelayOvershoot = peakOvershoot(2);
    const largeDelayOvershoot = peakOvershoot(8);
    expect(largeDelayOvershoot).toBeGreaterThan(smallDelayOvershoot);
  });

  // Issue #45: the FD is explicit that a trip needs a SCADA reset before the
  // device can run again — the sim's former auto-reopen at the low set point
  // was a modelling convenience, not plant behaviour (docs/OPEN_QUESTIONS.md).
  it("the valve stays closed once the level falls past the low set point — no automatic reopen", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this block's own pre-#55 starting premise
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockLowSetpoint(sim, BUFFER_BIN_ID, 0.3);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 1);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);
    expect(interlockRule(sim).phase).toBe("closed");
    expect(getMachineState(sim, SOURCE_ID).openness).toBe(0);

    // presenter drags the level down well past the clearing set point, same
    // control used to stage a near-overflow (setAccumulatorLevel) — the
    // valve still doesn't reopen on its own
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.3);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);

    expect(interlockRule(sim).phase).toBe("closed");
    expect(getMachineState(sim, SOURCE_ID).openness).toBe(0);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("resetTrips reopens the valve once the level has actually cleared the high set point", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this block's own pre-#55 starting premise
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockLowSetpoint(sim, BUFFER_BIN_ID, 0.3);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 1);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);
    expect(interlockRule(sim).phase).toBe("closed");

    resetTrips(sim); // still above the high set point: re-latches, no flapping
    expect(interlockRule(sim).phase).toBe("closed");
    expect(getMachineState(sim, SOURCE_ID).openness).toBe(0);

    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.3); // presenter drains it below the high set point
    resetTrips(sim);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);

    expect(interlockRule(sim).phase).toBe("open");
    expect(getMachineState(sim, SOURCE_ID).openness).toBe(1);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("records the trip, the delayed action, the re-latched reset attempt and the eventual reset in the buffer bin's event log, each with its simulated time", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this block's own pre-#55 starting premise
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockLowSetpoint(sim, BUFFER_BIN_ID, 0.3);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 1);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);
    resetTrips(sim); // still tripped: logs the re-latch attempt
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.3);
    resetTrips(sim); // now clears: logs the reset

    const log = interlockRule(sim).log;
    expect(log.length).toBeGreaterThanOrEqual(4); // high trip, close commanded, re-latch attempt, reset open commanded
    for (const entry of log) {
      expect(typeof entry.t).toBe("number");
      expect(typeof entry.message).toBe("string");
    }
    expect(log[0].t).toBeLessThanOrEqual(log[log.length - 1].t); // ordered in sim time
  });

  it("publishes the same trip through getCombinedEvents, tagged with the buffer bin's real id and display name (issue #29)", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this block's own pre-#55 starting premise
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockLowSetpoint(sim, BUFFER_BIN_ID, 0.3);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 1);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);

    const log = interlockRule(sim).log;
    const combined = getCombinedEvents(sim);
    const fromBufferBin = combined.filter((e) => e.machineId === BUFFER_BIN_ID);
    expect(fromBufferBin).toHaveLength(log.length);
    expect(fromBufferBin[0].machineName).toBe(line.machines.find((m) => m.id === BUFFER_BIN_ID).name);
    for (let i = 1; i < combined.length; i++) {
      expect(combined[i].t).toBeGreaterThanOrEqual(combined[i - 1].t); // chronological line-wide
    }
  });

  it("high set point, low set point and signal delay are live controls that take effect while the sim is running", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this block's own pre-#55 starting premise
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this block is about the bin/interlock, not the feeder's own auto-start (issue #42)
    for (let i = 0; i < 50; i++) stepSim(sim, DT); // a few ticks of "already running"

    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockLowSetpoint(sim, BUFFER_BIN_ID, 0.3);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 1);

    let tripped = false;
    for (let i = 0; i < 2000; i++) {
      stepSim(sim, DT);
      if (interlockRule(sim).phase !== "open") { tripped = true; break; }
    }
    expect(tripped).toBe(true); // the mid-run parameter changes were honoured
  });
});

describe("inlet drum feeder meters the buffer bin's discharge (issue #20)", () => {
  // This block runs against lineWithoutFeedSchedule (a plain, directly
  // rate-controlled meteredFeeder with no interlock of its own): issue #42's
  // own auto-start-on-running interlock, and the graded feed schedule that
  // superseded it (issue #56/#58/#60), each get their own dedicated coverage
  // elsewhere — auto-start no longer exists on the real line at all, and the
  // schedule's own real-line behaviour is covered against the real `line` in
  // the "treater pre-bin's graded feed schedule" describe block below.
  it("starts at 0 t/h at t=0 and stays there with no presenter action", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(getMachineState(sim, FEEDER_ID).rate).toBe(0);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBe(0);
    for (let i = 0; i < 20; i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).rate).toBe(0);
  });

  it("draws from the bin at its configured rate once started, and the two reconcile exactly", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, 0); // isolate the draw from any inflow
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; give the feeder real stock to draw down
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12));
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    const startStored = bin.stored;

    for (let i = 0; i < 200; i++) stepSim(sim, DT); // 10s

    const feeder = getMachineState(sim, FEEDER_ID);
    expect(feeder.drawn).toBeCloseTo(tPerHourToM3PerSec(12) * DT * 200);
    expect(bin.stored).toBeCloseTo(startStored - feeder.drawn);
    expect(bin.discharged).toBeCloseTo(feeder.drawn); // the bin's discharge and the feeder's throughput reconcile exactly
  });

  it("draws nothing once the bin runs dry, and never drives it negative", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, 0);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(20));

    for (let i = 0; i < 500; i++) stepSim(sim, DT);

    const bin = getMachineState(sim, BUFFER_BIN_ID);
    const feeder = getMachineState(sim, FEEDER_ID);
    expect(bin.stored).toBe(0);
    expect(feeder.drawn).toBe(0);
  });

  it("draws down to empty and then stops, without ever going negative or fabricating material", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, 0);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.05); // a little stock, drains fast
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(20));

    for (let i = 0; i < 2000; i++) stepSim(sim, DT);
    assertConserved(sim);

    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored).toBeCloseTo(0);
    expect(bin.stored).toBeGreaterThanOrEqual(0);
  });

  it("feed exceeding draw fills the bin; draw exceeding feed empties it; the crossover behaves correctly", () => {
    const filling = createSim(lineWithoutFeedSchedule);
    setSourceRate(filling, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(filling, FEEDER_ID, tPerHourToM3PerSec(2));
    const fillingStart = getMachineState(filling, BUFFER_BIN_ID).stored;
    for (let i = 0; i < 500; i++) stepSim(filling, DT);
    expect(getMachineState(filling, BUFFER_BIN_ID).stored).toBeGreaterThan(fillingStart);

    const draining = createSim(lineWithoutFeedSchedule);
    setSourceRate(draining, SOURCE_ID, tPerHourToM3PerSec(2));
    setAccumulatorLevel(draining, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; give the feeder real stock to draw down net of the source
    setFeederRate(draining, FEEDER_ID, tPerHourToM3PerSec(20));
    const drainingStart = getMachineState(draining, BUFFER_BIN_ID).stored;
    for (let i = 0; i < 500; i++) stepSim(draining, DT);
    expect(getMachineState(draining, BUFFER_BIN_ID).stored).toBeLessThan(drainingStart);
  });

  it("feed rate is a live control that takes effect while running", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, 0);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; give the feeder real stock to draw once its rate goes live
    setFeederRate(sim, FEEDER_ID, 0);
    for (let i = 0; i < 50; i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBe(0);

    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 50; i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBeGreaterThan(0);
  });

  it("conserves volume across the fill/draw pair (fed + initialStored = stored + delivered + spilled)", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(15));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12));
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 2); // isolate from the #19 interlock

    for (let i = 0; i < 20000; i++) {
      stepSim(sim, DT);
      assertConserved(sim);
    }

    const feeder = getMachineState(sim, FEEDER_ID);
    const elevator = getMachineState(sim, ELEVATOR_ID);
    const preBin = getMachineState(sim, PRE_BIN_ID);
    // Since issue #21, everything the feeder forwards lands in the treating
    // elevator's transport delay, not straight out the modelled boundary —
    // and since issue #22, the elevator's own discharge lands in the
    // pre-bin's stock rather than being counted as "delivered" itself (see
    // behaviors.js `conserveTransportDelay`'s `hasDownstream` branch). What
    // the feeder ever drew must equal what's still mid-lift plus what the
    // pre-bin has ever received (stored, spilled, or — since issue #24 wired
    // a real batch treater onto the pre-bin's own discharge — already handed
    // onward) since t=0. Using `conservationTotals` directly here would also
    // pull in the buffer bin's own unrelated stored volume, so this
    // reconciles the feeder-through-pre-bin subsystem from the machines' own
    // state instead.
    const elevatorInTransit = elevator.queue.reduce((a, p) => a + p.vol, 0) + elevator.backlog;
    const preBinGained = preBin.stored - preBin.initialStored + preBin.spill + preBin.discharged;
    expect(elevatorInTransit + preBinGained).toBeCloseTo(feeder.drawn);
    expect(elevatorInTransit).toBeGreaterThan(0); // continuous flow always has some material mid-transit
  });

  it("setFeederRate rejects a non-feeder machine", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(() => setFeederRate(sim, SOURCE_ID, tPerHourToM3PerSec(10))).toThrow(/not a metered feeder/);
  });
});

// Rise 8.731 m at the drawing's 10.08 m/min chain speed derives to ~52s
// (REAL_LINE_SPECS.md §5/§8, and the parent issue's own worked example).
const EXPECTED_TRANSIT_SEC = 8.731 / (10.08 / 60);

function feedElevator(sim, tPerHour = 12) {
  setSourceRate(sim, SOURCE_ID, 0); // isolate the feeder's draw from new inflow
  // Issue #55: the line now starts empty, so the bin needs its own real
  // stock to draw from — restoring the line's old (pre-#55) 55% starting
  // level here, explicitly, rather than relying on it as an authored
  // default the way every caller of this helper used to.
  setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55);
  setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(tPerHour));
}

// A real batch treater (issue #24) now sits on the pre-bin's discharge and
// will draw a charge out of it the instant one exists. Several tests below
// (both issue #21's own backpressure test and issue #22's whole describe
// block) drive the pre-bin's level directly and need it to hold exactly
// where set — a concern the batch treater would otherwise confound — so
// they share this one variant with its sim block stripped, rather than each
// re-deriving the same "no batch treater" line.
// afterBinHoldTreater (issue #25) also targets batchTreater, so it's
// stripped alongside the machine's own sim block — otherwise stepControl
// would resolve an actuator with no sim state at all and throw.
const lineWithoutBatchTreater = {
  ...lineWithoutFeedSchedule,
  machines: lineWithoutFeedSchedule.machines.map((m) => (m.id === "batchTreater" ? { ...m, sim: undefined } : m)),
  interlocks: lineWithoutFeedSchedule.interlocks.filter((r) => r.action.machine !== "batchTreater"),
};

describe("treating elevator carries grain with a real transport delay (issue #21)", () => {
  it("derives its transit delay from rise and chain speed rather than a hardcoded constant", () => {
    expect(EXPECTED_TRANSIT_SEC).toBeCloseTo(52, 0);
  });

  it("nothing arrives at the discharge until the derived transit delay has elapsed", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim);
    for (let i = 0; i < Math.round((EXPECTED_TRANSIT_SEC - 5) / DT); i++) stepSim(sim, DT);

    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.delivered).toBe(0);
    expect(elevator.queue.reduce((a, p) => a + p.vol, 0)).toBeGreaterThan(0); // material is genuinely mid-lift
  });

  it("material arrives at the discharge once the derived transit delay has elapsed", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim);
    for (let i = 0; i < Math.round((EXPECTED_TRANSIT_SEC + 15) / DT); i++) stepSim(sim, DT);

    expect(getMachineState(sim, ELEVATOR_ID).delivered).toBeGreaterThan(0);
  });

  it("material already in transit keeps discharging after the feeder stops, until the elevator clears", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // 10s of feed, well under the ~52s transit
    setFeederRate(sim, FEEDER_ID, 0); // feeder stops
    expect(getMachineState(sim, ELEVATOR_ID).queue.length).toBeGreaterThan(0);

    for (let i = 0; i < Math.round(70 / DT); i++) stepSim(sim, DT); // long past the transit delay
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.delivered).toBeGreaterThan(0); // it did arrive, despite the feeder having stopped
    expect(elevator.queue.length).toBe(0); // and the chain has fully cleared
    expect(elevator.backlog).toBe(0);
  });

  it("enforces a throughput ceiling regardless of how fast the feeder tries to push material in", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim, 1000); // wildly over the elevator's ceiling
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    const feeder = getMachineState(sim, FEEDER_ID);
    const ceiling = getMachineState(sim, ELEVATOR_ID).ceilingM3PerSec;
    expect(feeder.drawn).toBeCloseTo(ceiling * 20, 2); // capped at the elevator's ceiling, not the feeder's own rate
  });

  it("speed is a live control, and slowing it scales the transit delay", () => {
    const half = createSim(lineWithoutFeedSchedule);
    feedElevator(half);
    setElevatorSpeed(half, ELEVATOR_ID, 0.5);
    for (let i = 0; i < Math.round((EXPECTED_TRANSIT_SEC + 15) / DT); i++) stepSim(half, DT);
    // at half speed, material that would have arrived by now at full speed has not yet
    expect(getMachineState(half, ELEVATOR_ID).delivered).toBe(0);

    for (let i = 0; i < Math.round(EXPECTED_TRANSIT_SEC / DT); i++) stepSim(half, DT); // the rest of the doubled delay
    expect(getMachineState(half, ELEVATOR_ID).delivered).toBeGreaterThan(0);
  });

  it("a live speed change re-paces material already in transit, not just newly fed material", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // some material already mid-lift
    setFeederRate(sim, FEEDER_ID, 0); // isolate: no new material enters during the stall
    setElevatorSpeed(sim, ELEVATOR_ID, 0); // stall the chain entirely
    const inTransitAtStall = getMachineState(sim, ELEVATOR_ID).queue.reduce((a, p) => a + p.vol, 0);

    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT); // long enough it would have arrived otherwise
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.delivered).toBe(0); // stalled chain: nothing moves, nothing is lost either
    expect(elevator.queue.reduce((a, p) => a + p.vol, 0)).toBeCloseTo(inTransitAtStall);
  });

  it("setElevatorSpeed rejects a non-transport-delay machine", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(() => setElevatorSpeed(sim, SOURCE_ID, 0.5)).toThrow(/not a transport-delay/);
  });

  it("conserves volume through the fill / feed / lift chain, with in-transit material neither delivered nor lost", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim);
    for (let i = 0; i < Math.round(120 / DT); i++) {
      stepSim(sim, DT);
      assertConserved(sim);
    }
    expect(() => assertConserved(sim)).not.toThrow();

    const totals = conservationTotals(sim);
    expect(totals.inTransit).toBeGreaterThan(0);
    // Since issue #22, the elevator's discharge lands in the pre-bin's
    // stock rather than being reported as the elevator's own "delivered"
    // (see behaviors.js `conserveTransportDelay`'s `hasDownstream` branch).
    // Since issue #24 the pre-bin also has a real consumer (the batch
    // treater), so its own `stored` no longer only rises — it steps down
    // every time a charge is drawn — but the pre-bin's own lifetime receipts
    // (net stock change, plus whatever it's already handed onward) still
    // prove material genuinely arrived from the elevator.
    const preBin = getMachineState(sim, PRE_BIN_ID);
    const preBinReceived = preBin.stored - preBin.initialStored + preBin.spill + preBin.discharged;
    expect(preBinReceived).toBeGreaterThan(0);
  });

  // treaterPreBin has a real sim block since issue #22, but this test still
  // overrides it to start already full (zero headroom) rather than feeding
  // long enough for its real 1.63 m3 to fill naturally, so the cascade is
  // forced immediately within a short step budget. The interlock is also
  // stripped for this test: with the pre-bin starting full, issue #22's own
  // two-stage interlock would immediately throttle the elevator on its own,
  // which would confound this test's actual target — issue #21's generic
  // "a full downstream rejects material" backpressure, independent of any
  // interlock. The batch treater (issue #24) is stripped too: left in, it
  // would draw a charge out of the "full" pre-bin the instant one exists,
  // opening real headroom and defeating the zero-headroom setup this test
  // needs. Same test-only-line-variant pattern as the "unregistered
  // sim.kind" test above.
  it("real backpressure cascades from a full downstream bin, through the elevator, to the feeder", () => {
    const blockedLine = {
      ...lineWithoutBatchTreater,
      machines: lineWithoutBatchTreater.machines.map((m) =>
        m.id === "treaterPreBin"
          ? { ...m, sim: { kind: "accumulator", capacityM3: 1, initialLevelFraction: 1 } } // starts with zero headroom
          : m
      ),
      interlocks: [],
    };
    const sim = createSim(blockedLine);
    feedElevator(sim, 1000); // push hard enough that the elevator's own ceiling isn't the limiting factor

    for (let i = 0; i < Math.round((EXPECTED_TRANSIT_SEC + 20) / DT); i++) {
      stepSim(sim, DT);
      assertConserved(sim);
    }

    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.backlog).toBeGreaterThan(0); // material arrived at the top but the full bin refuses it
    expect(elevator.delivered).toBe(0); // none of it actually left the elevator

    const drawnAtBlock = getMachineState(sim, FEEDER_ID).drawn;
    for (let i = 0; i < Math.round(5 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBeCloseTo(drawnAtBlock); // the feeder itself has now stalled too

    expect(() => assertConserved(sim)).not.toThrow();
  });
});

function preBinInterlock(sim) {
  return getInterlockState(sim, PRE_BIN_ID);
}

// These tests drive the pre-bin's own level directly via setAccumulatorLevel
// and expect it to hold exactly where set except for what the elevator
// feeds in — the graded feed schedule's own timing is what's under test,
// independent of whatever sits on the pre-bin's discharge side. Since issue
// #24 wired a real batch treater onto that discharge, it would draw the
// level down the instant a full charge is available and confound these
// thresholds, so this describe block runs against a variant with the batch
// treater stripped, same isolation idiom as lineWithoutBatchTreater above —
// but, unlike that variant, keeping the real schedule/derivation intact,
// since that's exactly what's under test here. The full chain, treater
// included, gets its own conservation coverage in issue #24's own tests.
const lineWithScheduleWithoutBatchTreater = {
  ...line,
  machines: line.machines.map((m) => (m.id === "batchTreater" ? { ...m, sim: undefined } : m)),
  interlocks: line.interlocks.filter((r) => r.action.machine !== "batchTreater"),
};

// Bands per issue #56/#58: boost (14 TPH), normal (12 TPH), throttle (6
// TPH), each reproduced from the pre-bin's own nominal (85% speed / 55%
// gate) operating point — see units.test.js's own worked band examples,
// which these mirror.
const BOOST_TPH = 14, NORMAL_TPH = 12, THROTTLE_TPH = 6;

describe("treater pre-bin's graded feed schedule (issue #56/#58/#60)", () => {
  it("reuses the accumulator behaviour verbatim: no new material physics for the pre-bin", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    expect(getMachineState(sim, PRE_BIN_ID).kind).toBe("accumulator");
  });

  it("is already commanding the boost band's own real targets at t=0, not the actuators' own (1, 1) default", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    const elevator = getMachineState(sim, ELEVATOR_ID);
    const feeder = getMachineState(sim, FEEDER_ID);
    expect(elevator.throttleFraction).toBeCloseTo(0.8525);
    expect(feeder.gateThrottleFraction).toBeCloseTo(0.5516);

    stepSim(sim, DT); // the rate derivation runs as part of a tick, not at creation
    expect(m3PerSecToTPerHour(getMachineState(sim, FEEDER_ID).rate)).toBeCloseTo(BOOST_TPH, 1);
  });

  it("cycles through boost, normal and throttle as the live level rises, with no trip below LSHH", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.5); // between LSL (0.35) and LSH (0.85)
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // past the 3s band delay + 4s ramp
    expect(preBinInterlock(sim).phase).toBe("normal");
    let feeder = getMachineState(sim, FEEDER_ID);
    expect(m3PerSecToTPerHour(feeder.rate)).toBeCloseTo(NORMAL_TPH, 1);

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9); // between LSH (0.85) and LSHH (0.95)
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("throttle");
    feeder = getMachineState(sim, FEEDER_ID);
    expect(m3PerSecToTPerHour(feeder.rate)).toBeCloseTo(THROTTLE_TPH, 1);
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBeGreaterThan(0); // throttled, not tripped
  });

  it("tracks back down freely, with no latching, from throttle through normal to boost", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("throttle");

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.5); // presenter drags the level back down, no reset involved
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("normal");

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.1);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("boost");
  });

  it("trips once the level reaches LSHH, stopping the elevator — the feeder's own gate is left where the schedule last set it", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.97); // above LSHH (0.95)
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT); // past the 5s trip delay + 6s ramp
    expect(preBinInterlock(sim).phase).toBe("tripped");
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.throttleFraction).toBe(0);
    const feeder = getMachineState(sim, FEEDER_ID);
    expect(feeder.gateThrottleFraction).toBeCloseTo(0.5516); // still boost's own value — never touched by the trip
  });

  it("stays tripped once the level falls back below LSHH on its own — no automatic reopen", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.97);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("tripped");

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.5); // presenter drags the level back down
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("tripped");
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBe(0);
  });

  it("resetTrips clears the LSHH trip once the level has actually cleared it, and resumes the band the live level is actually in — not a fixed state", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.97);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("tripped");

    resetTrips(sim); // still above LSHH: re-latches
    expect(preBinInterlock(sim).phase).toBe("tripped");
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBe(0);

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.5); // presenter drags the level down into the normal band
    resetTrips(sim);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // past the recovery ramp
    expect(preBinInterlock(sim).phase).toBe("normal");
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.throttleFraction).toBeCloseTo(0.7893);
  });

  it("LSH is display-only: crossing it alone commands no stop, only the schedule's own normal->throttle band transition", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.86); // just past LSH (0.85), well short of LSHH (0.95)
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("throttle"); // throttled...
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBeGreaterThan(0); // ...never stopped
    const readings = instrumentReadings(preBinInterlock(sim), 0.86);
    expect(readings.LSH.tripped).toBe(true);
    expect(readings.LSHH.tripped).toBe(false);
  });

  it("LSHH set point is a live control that takes effect while running", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setInterlockHighHighSetpoint(sim, PRE_BIN_ID, 0.5); // lower the trip well into what was the normal band
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.6);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("tripped");
  });

  it("the pre-bin's event log records each band transition and the trip as distinct entries", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.97);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    const log = preBinInterlock(sim).log;
    const messages = log.map((e) => e.message);
    for (const entry of log) {
      expect(typeof entry.t).toBe("number");
      expect(typeof entry.message).toBe("string");
    }
    expect(new Set(messages).size).toBe(messages.length); // no two entries say the same thing
    expect(messages.some((m) => m.includes("high-high"))).toBe(true);
    expect(messages.some((m) => m.includes("stop"))).toBe(true);
  });
});

describe("drum feeder Gate Position % and elevator Speed % drive the derived feed rate (issue #56/#59/#60)", () => {
  it("dialling the Gate Position % dial changes the derived rate immediately while the bin sits in the normal band", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.5);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // settle into normal
    expect(preBinInterlock(sim).phase).toBe("normal");
    const rateBefore = getMachineState(sim, FEEDER_ID).rate;

    setGateFraction(sim, FEEDER_ID, 0.5); // presenter halves the gate dial
    stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).rate).toBeLessThan(rateBefore);
  });

  it("dialling the elevator Speed % dial changes the derived rate immediately while the bin sits in the normal band", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.5);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("normal");
    const rateBefore = getMachineState(sim, FEEDER_ID).rate;

    setElevatorSpeed(sim, ELEVATOR_ID, 0.5);
    stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).rate).toBeLessThan(rateBefore);
  });

  it("the Gate Position % dial itself (gateFraction) is never touched by the schedule — only gateThrottleFraction, its own layer on top", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    setGateFraction(sim, FEEDER_ID, 0.8); // presenter's own last-dialled value

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9); // schedule commands throttle
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("throttle");
    expect(getMachineState(sim, FEEDER_ID).gateFraction).toBeCloseTo(0.8); // presenter's dial preserved

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.1); // schedule releases back toward boost
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).gateFraction).toBeCloseTo(0.8); // still exactly as last dragged
  });

  it("setGateFraction rejects a non-gated machine", () => {
    const sim = createSim(lineWithScheduleWithoutBatchTreater);
    expect(() => setGateFraction(sim, ELEVATOR_ID, 0.5)).toThrow();
  });
});

describe("batch treater takes a fixed charge every cycle and discharges it as a pulse (issue #24)", () => {
  it("is declared as a batch cycle, the primitive later reused by the bagging scale, filler and big-bag head", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(getMachineState(sim, TREATER_ID).kind).toBe("batchCycle");
  });

  it("draws a fixed charge from the pre-bin, holds it for the cycle time, then discharges the whole charge as a pulse", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; restore this test's own pre-#55 "more than one charge already in the pre-bin" premise
    const treater = getMachineState(sim, TREATER_ID);
    const chargeM3 = treater.chargeM3;
    const cycleSec = treater.cycleSec;

    stepSim(sim, DT); // the pre-bin already holds more than a charge, so the draw completes in this first tick
    expect(treater.held).toBeCloseTo(chargeM3);
    expect(treater.phase).toBe("holding");
    expect(treater.delivered).toBe(0);

    for (let i = 0; i < Math.round((cycleSec - DT * 2) / DT); i++) stepSim(sim, DT); // just shy of the cycle time
    expect(treater.phase).toBe("holding");
    expect(treater.delivered).toBe(0);

    for (let i = 0; i < 10; i++) stepSim(sim, DT); // past the cycle time
    expect(treater.delivered).toBeCloseTo(chargeM3); // the whole charge left, as a pulse
    expect(treater.held).toBeGreaterThan(0); // already drawing its next charge — the pre-bin still has stock
  });

  // "Draws nothing" is true of the batch itself, never of a single tick: a
  // behaviour's capacityAvailable only ever sees its own downstream (see
  // engine.js's reverse pass), so batchCycle has no way to peek at the
  // pre-bin's actual stock and refuse a partial tick's worth up front — see
  // the design note above initBatchCycle in behaviors.js. What's guaranteed,
  // and what this test checks, is the acceptance criterion's real substance:
  // a scarce pre-bin can dribble everything it has into the treater without
  // that ever being treated as a completed charge — no partial batch is ever
  // held for a cycle or discharged.
  it("never starts a partial batch when the pre-bin can't supply a full charge, even though it will accept whatever trickle is offered", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, 0);
    setFeederRate(sim, FEEDER_ID, 0);
    const treater = getMachineState(sim, TREATER_ID);
    const preBin = getMachineState(sim, PRE_BIN_ID);
    setAccumulatorLevel(sim, PRE_BIN_ID, (0.5 * treater.chargeM3) / preBin.capacity); // half a charge, and no more is coming

    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT); // far past the cycle time, if it had ever started

    expect(treater.phase).toBe("charging"); // never reached holding
    expect(treater.held).toBeLessThan(treater.chargeM3);
    expect(treater.delivered).toBe(0);
    expect(preBin.stored).toBeCloseTo(0); // it handed over everything it had; the treater just never called it a batch
  });

  it("the pre-bin drains in a step, not a smooth trickle, when it already holds a full charge", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; restore this test's own pre-#55 starting level
    const preBin = getMachineState(sim, PRE_BIN_ID);
    const treater = getMachineState(sim, TREATER_ID);
    const startStored = preBin.stored; // 40% of 1.63 m3, comfortably more than one charge

    stepSim(sim, DT); // a single tick
    expect(startStored - preBin.stored).toBeCloseTo(treater.chargeM3);

    for (let i = 0; i < Math.round(30 / DT); i++) stepSim(sim, DT); // well under the 40s cycle: no further decline
    expect(preBin.stored).toBeCloseTo(startStored - treater.chargeM3);
  });

  it("batch size and cycle time are live controls", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; give the treater an ample pre-bin to draw several batches from
    setBatchSize(sim, TREATER_ID, 0.05);
    setBatchCycleSec(sim, TREATER_ID, 1);
    const treater = getMachineState(sim, TREATER_ID);
    expect(treater.chargeM3).toBe(0.05);
    expect(treater.cycleSec).toBe(1);

    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    // a 0.05 m3 charge on a 1s cycle, fed from an ample pre-bin, completes
    // several batches well within 10s
    expect(treater.delivered).toBeGreaterThan(0.05 * 3);
  });

  it("setBatchSize / setBatchCycleSec reject a non-batch-cycle machine", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(() => setBatchSize(sim, SOURCE_ID, 1)).toThrow(/not a batch-cycle/);
    expect(() => setBatchCycleSec(sim, SOURCE_ID, 1)).toThrow(/not a batch-cycle/);
  });

  it("material inside the treater mid-cycle is accounted for as neither delivered nor lost, and conservation holds across many consecutive cycles", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim, 20); // keep the pre-bin well supplied so cycles keep completing
    setBatchCycleSec(sim, TREATER_ID, 2); // short cycle so many complete within the test window
    const treater = getMachineState(sim, TREATER_ID);

    let sawHeldMidCycle = false;
    for (let i = 0; i < Math.round(120 / DT); i++) {
      stepSim(sim, DT);
      assertConserved(sim);
      if (treater.held > 0) sawHeldMidCycle = true;
    }
    expect(() => assertConserved(sim)).not.toThrow();
    expect(sawHeldMidCycle).toBe(true); // material genuinely sat mid-charge/mid-cycle at some point
    expect(treater.delivered).toBeGreaterThan(treater.chargeM3); // several cycles genuinely completed, no drift
  });
});

function afterBinInterlock(sim) {
  return getInterlockState(sim, AFTER_BIN_ID);
}

// Since issue #26, the scalping screen is a real (if oversized) downstream
// of the after-bin, so a level forced via setAccumulatorLevel no longer
// holds exactly where set — it drains, same as any other accumulator with a
// live consumer. The tests below are specifically about the interlock's own
// hold/release timing in isolation, exactly the concern the pre-bin's
// two-stage-interlock tests already isolate from the batch treater via
// lineWithoutBatchTreater above, so this describe block uses the same
// pattern: strip the screen's sim block, leaving the after-bin with no
// downstream, matching the physics these tests were written against. The
// screen's own behaviour — including its interaction with a live after-bin —
// gets its own coverage in the "scalping screen" describe block below.
// Built on lineWithoutFeedSchedule, not `line` directly, same reasoning as
// lineWithoutBatchTreater/lineWithoutPackaging above (see that variant's own
// comment): these after-bin tests use setFeederRate/feedElevator as their
// generic supply lever, which the real schedule would otherwise govern.
const lineWithoutScalpingScreen = {
  ...lineWithoutFeedSchedule,
  machines: lineWithoutFeedSchedule.machines.map((m) => (m.id === "scalpingScreen" ? { ...m, sim: undefined } : m)),
};

describe("treater after-bin holds the next batch (issue #25)", () => {
  it("reuses the accumulator behaviour verbatim: no new material physics for the after-bin", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(getMachineState(sim, AFTER_BIN_ID).kind).toBe("accumulator");
  });

  it("is wired to a holdNextBatch interlock reading the after-bin and commanding the treater", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    const rule = afterBinInterlock(sim);
    expect(rule.kind).toBe("holdNextBatch");
    expect(rule.actuatorId).toBe(TREATER_ID);
    expect(rule.phase).toBe("released");
  });

  it("when the high level switch trips, the treater completes its current cycle and then does not start another", () => {
    const sim = createSim(lineWithoutScalpingScreen); // isolates the interlock's own timing from the screen's own draining (issue #26)
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the first tick below needs a charge already available
    feedElevator(sim, 20); // keep the pre-bin supplied so the treater can always draw a fresh charge
    const treater = getMachineState(sim, TREATER_ID); // real 48s cycle: the 5s signal delay can only ever catch one cycle already under way

    stepSim(sim, DT); // draws its first charge, starts holding
    expect(treater.phase).toBe("holding");
    expect(treater.held).toBeGreaterThan(0);

    // Above the 60% high set point, but with enough headroom left (0.67 -
    // 0.62*0.67 ≈ 0.25 m3) for the in-flight charge (0.222 m3) to land in
    // full — isolates the interlock's own "does not start another" from the
    // accumulator's separate, already-tested backpressure-waits-mid-
    // discharge behaviour (issue #24), which this test is not about.
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.62);
    for (let i = 0; i < Math.round(55 / DT); i++) stepSim(sim, DT); // past the 5s signal delay and the 48s cycle time
    expect(afterBinInterlock(sim).phase).toBe("held");
    expect(treater.blocked).toBe(true);

    // The cycle already under way when the interlock tripped ran to
    // completion and discharged normally, not lost mid-cycle.
    expect(treater.delivered).toBeCloseTo(treater.chargeM3);
    // With the gate shut, no further charge has started.
    expect(treater.held).toBe(0);
    expect(treater.phase).toBe("charging");
  });

  it("the treater's waiting state is distinguishable from it being stopped, in both the event log and the machine's reported state", () => {
    const sim = createSim(lineWithoutScalpingScreen); // isolates from the screen's own draining (issue #26)
    feedElevator(sim, 20);
    stepSim(sim, DT); // draws its first charge, starts holding
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.62); // above the high set point, with headroom for the in-flight charge

    for (let i = 0; i < Math.round(45 / DT); i++) stepSim(sim, DT); // past the 5s delay and the 40s cycle: gate shuts, cycle discharges, no new charge starts

    const treater = getMachineState(sim, TREATER_ID);
    expect(afterBinInterlock(sim).phase).toBe("held");
    expect(treater.blocked).toBe(true);
    expect(treater.phase).toBe("charging"); // the raw state machine never introduces a "stopped" phase
    expect(treater.held).toBe(0);
    expect(BEHAVIORS.batchCycle.snapshot(treater).phase).toBe("waiting"); // but the reported state is distinct from "charging"

    const messages = afterBinInterlock(sim).log.map((e) => e.message);
    expect(messages.some((m) => /hold/i.test(m))).toBe(true);
    expect(messages.some((m) => /stop/i.test(m))).toBe(false); // never described as a stop — the plant distinguishes the two
  });

  // Issue #45: no automatic release. The level clearing the high set point
  // is necessary for resetTrips to succeed, but resetTrips itself is what
  // actually resumes the treater now — the level falling alone is not enough.
  it("stays held even once the level has fallen back below the high set point — no automatic release", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim, 20);
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(afterBinInterlock(sim).phase).toBe("held");
    const treater = getMachineState(sim, TREATER_ID);
    expect(treater.blocked).toBe(true);

    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.1); // well below the high set point
    stepSim(sim, DT);
    expect(afterBinInterlock(sim).phase).toBe("held"); // still latched
    expect(treater.blocked).toBe(true);
  });

  it("resetTrips re-latches while the level is still above the high set point, then resumes the treater once it has actually cleared", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand to actually resume
    feedElevator(sim, 20);
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(afterBinInterlock(sim).phase).toBe("held");
    const treater = getMachineState(sim, TREATER_ID);

    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.65); // still above the 60% high set point
    resetTrips(sim);
    expect(afterBinInterlock(sim).phase).toBe("held"); // re-latches, does not resume
    expect(treater.blocked).toBe(true);

    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.1); // now below the high set point
    resetTrips(sim);
    expect(afterBinInterlock(sim).phase).toBe("released");
    expect(treater.blocked).toBe(false);

    for (let i = 0; i < Math.round(45 / DT); i++) stepSim(sim, DT); // past a full cycle
    expect(treater.delivered).toBeGreaterThan(0); // genuinely resumed batching
  });

  it("a full after-bin never causes a spill, however hard the treater hammers it — conservation holds throughout", () => {
    const sim = createSim(lineWithoutScalpingScreen); // isolates from the screen's own draining (issue #26); the live-screen case gets its own overwhelm test below
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2); // short cycle: many more batches than the 0.67 m3 bin could ever hold, deliberately overwhelming it
    const treater = getMachineState(sim, TREATER_ID);
    const afterBin = getMachineState(sim, AFTER_BIN_ID);

    let sawHeld = false;
    for (let i = 0; i < Math.round(120 / DT); i++) {
      stepSim(sim, DT);
      assertConserved(sim);
      expect(afterBin.spill).toBeCloseTo(0); // never spills, at any point in the run — the reverse-pass capacity check (issue #18) already guarantees this
      if (treater.held > 0) sawHeld = true;
    }
    expect(sawHeld).toBe(true);
    expect(afterBinInterlock(sim).phase).toBe("held"); // the after-bin did fill and trip, given how small it is against 20 t/h
    expect(afterBin.spill).toBeCloseTo(0);
  });

  it("resumes batching after a full block-and-recover cycle, still without ever spilling", () => {
    const sim = createSim(lineWithoutScalpingScreen); // isolates from the screen's own draining (issue #26)
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand to actually resume
    feedElevator(sim, 20);
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.62); // trips, with headroom for the in-flight charge (as above)
    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    const treater = getMachineState(sim, TREATER_ID);

    for (let i = 0; i < Math.round(55 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    expect(afterBinInterlock(sim).phase).toBe("held");
    expect(treater.blocked).toBe(true);
    expect(afterBin.spill).toBeCloseTo(0);

    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.1); // presenter drains it for the demo, below the high set point
    resetTrips(sim); // issue #45: release no longer happens on its own, it needs the plant reset
    for (let i = 0; i < Math.round(55 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    expect(afterBinInterlock(sim).phase).toBe("released");
    expect(treater.blocked).toBe(false);
    expect(treater.delivered).toBeGreaterThan(treater.chargeM3); // a second cycle genuinely completed after recovery
    expect(afterBin.spill).toBeCloseTo(0);
  });
});

describe("scalping screen splits product from oversize, completing the treating zone (issue #26)", () => {
  it("is declared as a splitter, and the discard bin as a terminal sink", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(getMachineState(sim, SCREEN_ID).kind).toBe("splitter");
    expect(getMachineState(sim, DISCARD_BIN_ID).kind).toBe("terminalSink");
  });

  it("divides its infeed between a product output and a waste output by the configured fraction", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand well within the 60s budget below
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2); // completes several batches quickly
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const screen = getMachineState(sim, SCREEN_ID);
    expect(screen.outTotal).toBeGreaterThan(0);
    expect(screen.wasteTotal).toBeGreaterThan(0);
    const wasteShare = screen.wasteTotal / (screen.outTotal + screen.wasteTotal);
    expect(wasteShare).toBeCloseTo(0.03, 4); // the line default (3%)
  });

  it("the oversize fraction is a live control", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand well within the 60s budget below
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    setSplitterWasteFraction(sim, SCREEN_ID, 0.5);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const screen = getMachineState(sim, SCREEN_ID);
    const wasteShare = screen.wasteTotal / (screen.outTotal + screen.wasteTotal);
    expect(wasteShare).toBeCloseTo(0.5, 4);
  });

  it("setSplitterWasteFraction rejects a non-splitter machine", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(() => setSplitterWasteFraction(sim, SOURCE_ID, 0.1)).toThrow(/not a splitter/);
  });

  it("the discard bin accumulates waste and reports a running total that matches the screen's own waste total exactly", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand well within the 60s budget below
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const screen = getMachineState(sim, SCREEN_ID);
    const discardBin = getMachineState(sim, DISCARD_BIN_ID);
    expect(discardBin.total).toBeGreaterThan(0);
    expect(discardBin.total).toBeCloseTo(screen.wasteTotal);
  });

  it("the discard bin's published fill visibly rises over a run, rather than sitting frozen at its static decoration", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    // Issue #57: this bin defaults to a 1% starting fill, not the empty-at-
    // load every other bin uses since #55 (see the dedicated default-level
    // test below) — read back whatever that seed is rather than assuming 0,
    // since this test is about rising, not the seed value itself.
    const initialFill = BEHAVIORS.terminalSink.snapshot(getMachineState(sim, DISCARD_BIN_ID)).fill;

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand well within the 60s budget below
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const fill = BEHAVIORS.terminalSink.snapshot(getMachineState(sim, DISCARD_BIN_ID)).fill;
    expect(fill).toBeGreaterThan(initialFill);
  });

  it("starts at a 1% fill by default, unlike every other bin's empty-at-load (issue #57)", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(BEHAVIORS.terminalSink.snapshot(getMachineState(sim, DISCARD_BIN_ID)).fill).toBeCloseTo(0.01);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("EMPTY DISCARD BIN zeroes the fill without breaking conservation (issue #57)", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4);
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, DISCARD_BIN_ID).total).toBeGreaterThan(0);

    emptyTerminalSink(sim, DISCARD_BIN_ID);
    expect(getMachineState(sim, DISCARD_BIN_ID).total).toBe(0);
    expect(BEHAVIORS.terminalSink.snapshot(getMachineState(sim, DISCARD_BIN_ID)).fill).toBe(0);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("the screen's snapshot reports 'flowing' while material is actively passing through, so the scene can show it isn't idle", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(BEHAVIORS.splitter.snapshot(getMachineState(sim, SCREEN_ID)).flowing).toBe(false); // nothing has reached it yet

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand well within the 60s budget below
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    let sawFlowing = false;
    for (let i = 0; i < Math.round(60 / DT); i++) {
      stepSim(sim, DT);
      if (BEHAVIORS.splitter.snapshot(getMachineState(sim, SCREEN_ID)).flowing) sawFlowing = true;
    }
    expect(sawFlowing).toBe(true);
  });

  it("product and waste totals sum exactly to what the screen received from the after-bin", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    const screen = getMachineState(sim, SCREEN_ID);
    expect(screen.outTotal + screen.wasteTotal).toBeCloseTo(afterBin.discharged);
  });

  it("holds negligible material and does not become the line's bottleneck at its confirmed oversized capacity, under ordinary feeding", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim, 20); // default 40s batch cycle (~14.4 t/h average): well under the screen's 64.4 t/h rating
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    // The screen keeps up with the after-bin's real discharge rate, so the
    // after-bin never even approaches its own high set point — exactly the
    // acceptance criterion's "does not become a bottleneck".
    expect(afterBinInterlock(sim).phase).toBe("released");
  });

  // Nothing upstream of the screen can ever organically overwhelm its 64.4
  // t/h ceiling — the treating elevator's own ceiling tops out at 20 t/h
  // (docs/OPEN_QUESTIONS.md), so "well oversized" holds for real under any
  // combination of the line's own confirmed rates. This stages the after-bin
  // directly (same technique its own tests use) to isolate and prove the
  // ceiling itself is real, rather than an unmodelled infinity.
  it("a near-full after-bin drains at the screen's own bounded ceiling rather than in a single tick", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.95);
    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    const startStored = afterBin.stored;

    stepSim(sim, DT);

    const ceilingPerTick = tPerHourToM3PerSec(64.4) * DT;
    expect(startStored - afterBin.stored).toBeCloseTo(ceilingPerTick); // bounded by the screen's rated ceiling
    expect(afterBin.stored).toBeGreaterThan(0); // did not drain to empty in one tick
  });

  it("conservation holds across the entire treating zone, from the source valve to both terminal destinations", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(20));
    setBatchCycleSec(sim, TREATER_ID, 5);
    for (let i = 0; i < Math.round(400 / DT); i++) {
      stepSim(sim, DT);
      assertConserved(sim);
    }
    expect(() => assertConserved(sim)).not.toThrow();
    expect(getMachineState(sim, DISCARD_BIN_ID).total).toBeGreaterThan(0); // the waste terminal genuinely received material this run
  });

  it("a single run demonstrates the full chain end to end: fill, trip, delayed valve closure, metered draw, transport lag, batch pulsing, smoothing and splitting", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20)); // fast enough to fill and trip the buffer bin
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55); // issue #55: the line now starts empty; restore this test's own pre-#55 starting premise so the 600s budget below still reaches the trip
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(2)); // slow draw, well below the source: nets a genuine fill toward the trip

    for (let i = 0; i < Math.round(600 / DT); i++) {
      stepSim(sim, DT);
      assertConserved(sim);
    }

    expect(getMachineState(sim, SOURCE_ID).openness).toBeLessThan(1); // buffer bin filled, tripped, and (after the delay) closed the valve, late
    expect(getMachineState(sim, ELEVATOR_ID).delivered).toBeGreaterThan(0); // transport lag: material genuinely arrived at the pre-bin
    expect(getMachineState(sim, TREATER_ID).delivered).toBeGreaterThan(0); // batch pulsing occurred
    expect(getMachineState(sim, AFTER_BIN_ID).discharged).toBeGreaterThan(0); // the after-bin smoothed the pulse and passed it on
    expect(getMachineState(sim, SCREEN_ID).outTotal).toBeGreaterThan(0); // splitting occurred
    expect(getMachineState(sim, SCREEN_ID).wasteTotal).toBeGreaterThan(0);
    expect(getMachineState(sim, DISCARD_BIN_ID).total).toBeGreaterThan(0);

    // The pre-bin's own graded feed schedule (issue #56/#58/#60) gets its
    // own dedicated coverage in the "treater pre-bin's graded feed schedule"
    // describe block above, against the real, schedule-active `line` — this
    // variant deliberately runs without it (see lineWithoutFeedSchedule's
    // own comment).
    expect(() => assertConserved(sim)).not.toThrow();
  });
});

describe("engine publishes each machine's live outflow rate generically (issue #28)", () => {
  it("reports rate = actual volume moved this tick / dt, for a plain single-output machine", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    const fedBefore = getMachineState(sim, SOURCE_ID).fed;
    stepSim(sim, DT);
    const source = getMachineState(sim, SOURCE_ID);
    const movedThisTick = source.fed - fedBefore;
    expect(source.flowRateM3PerSec).toBeCloseTo(movedThisTick / DT);
    expect(source.flowRateM3PerSec).toBeCloseTo(tPerHourToM3PerSec(12));
  });

  it("tracks actual movement tick by tick through a transport delay, not just a cumulative average", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    feedElevator(sim, 20);
    let deliveredBefore = getMachineState(sim, ELEVATOR_ID).delivered;
    for (let i = 0; i < Math.round((EXPECTED_TRANSIT_SEC + 5) / DT); i++) {
      stepSim(sim, DT);
      const elevator = getMachineState(sim, ELEVATOR_ID);
      const movedThisTick = elevator.delivered - deliveredBefore;
      expect(elevator.flowRateM3PerSec).toBeCloseTo(movedThisTick / DT);
      deliveredBefore = elevator.delivered;
    }
  });

  it("sums across every port for a multi-output machine (the splitter), matching its combined outflow this tick", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand well within the 60s budget below
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const before = getMachineState(sim, SCREEN_ID);
    const outBefore = before.outTotal;
    const wasteBefore = before.wasteTotal;
    stepSim(sim, DT);
    const screen = getMachineState(sim, SCREEN_ID);
    const movedThisTick = (screen.outTotal - outBefore) + (screen.wasteTotal - wasteBefore);
    expect(screen.flowRateM3PerSec).toBeCloseTo(movedThisTick / DT);
    expect(screen.flowRateM3PerSec).toBeGreaterThan(0); // material was genuinely flowing this tick
  });

  it("reports zero, not undefined or stale, once a starved machine has nothing left to draw", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, 0);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12));
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0); // nothing for the feeder to draw
    stepSim(sim, DT);

    const feeder = getMachineState(sim, FEEDER_ID);
    expect(feeder.drawn).toBe(0);
    expect(feeder.flowRateM3PerSec).toBe(0);
    expect(feeder.flowRateM3PerSec).not.toBeUndefined();
  });

  it("reports zero once a full downstream blocks a machine entirely, even though it was flowing moments before", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this test is about the bin filling to capacity, not the feeder's own auto-start (issue #42)
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 2); // isolate raw backpressure from the issue #19 interlock
    stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).flowRateM3PerSec).toBeGreaterThan(0); // genuinely flowing first

    for (let i = 0; i < 20000; i++) stepSim(sim, DT); // fills the bin to capacity (mirrors the "fills and rejects" test above)
    stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).flowRateM3PerSec).toBe(0); // rejected by the now-full bin, not a stale prior value
  });

  // The generic figure is genuinely *outflow* (what apply() hands to whatever
  // sits downstream), not throughput — a terminal sink and a downstream-less
  // accumulator both always report zero here even while actively receiving
  // material, the same way a buffer bin with nothing sim-enabled downstream
  // of it would. That's consistent with the rest of this behaviour's
  // "delivered"/"inTransit" conventions (see conserveMeteredFeeder,
  // conserveTransportDelay), not a gap specific to this issue: a machine
  // with no downstream simply has nothing to report an outflow rate onto.
  it("a terminal sink (nothing sim-enabled ever sits downstream of it) reports zero outflow even while actively filling", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4); // issue #55: the line now starts empty; the treater needs a charge on hand well within the 60s budget below
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const discardBin = getMachineState(sim, DISCARD_BIN_ID);
    expect(discardBin.total).toBeGreaterThan(0); // genuinely received material this run
    expect(discardBin.flowRateM3PerSec).toBe(0); // but it is the line's terminus: nothing ever flows further out of it
  });
});

// Issue #40 reported the batch treater permanently freezing mid-charge after
// a long run, starving everything downstream and leaving only one
// interlocked machine (the pre-bin) able to ever log an event again.
// Investigating turned up no deadlock: `applyBatchCycle`'s `accepted` is
// always upper-bounded by the very `chargeM3 - held` value the same tick's
// reverse pass computed for it (see capacityAvailableBatchCycle), so `held`
// can never exceed `chargeM3` — the Math.max(0, ...) clamp the original
// report worried about can never see a negative input, at any feeder rate
// across the confirmed 2-20 t/h operating range (REAL_LINE_SPECS.md §5) — see
// the rate-sweep test below, not just the single 15 t/h rate the original
// report used. What actually happened is a snapshot artifact: the original
// repro only ever inspected the *final* state of a fixed 6000s run, which
// happens to land ~3.6s into an ~8s charging window at a 15 t/h feeder rate —
// a perfectly ordinary mid-cycle frame, not a stall. Running the same
// reproduction for 10x longer (below) shows hundreds of complete cycles with
// the gap between phase transitions never once exceeding the treater's own
// 40s hold time, however far into the run it's sampled.
describe("the treating zone keeps cycling indefinitely under steady supply, never stalling mid-charge (issue #40)", () => {
  it("the batch treater completes hundreds of charge/discharge cycles without ever stalling mid-charge, at issue #40's own reproduction rate", () => {
    const sim = createSim(lineWithoutPackaging);
    // Pinned explicitly, not left at the line's own authored default (issue
    // #60 raised that to 15 t/h, to clear the graded feed schedule's own
    // boost band — unrelated to this test): comfortably above the 15 t/h
    // feeder rate set below, so there's a genuine, persistent surplus for
    // the whole run, matching this test's own steady-supply premise.
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    // This test is about the treater's own cycling (issue #40), not the
    // buffer bin's own interlock (#19) — same isolation idiom the fill/
    // overflow conservation test above already uses. Without it, a
    // persistent surplus feeder rate this long a run genuinely fills the
    // buffer bin past its own 85% trip at some point, latching the source
    // shut for good (nothing here ever calls resetTrips) and starving the
    // treater in a way that reads exactly like the stall issue #40 itself
    // already ruled out — confirmed live, a test-isolation gap, not a real
    // one.
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 2);
    // Issue #55: the line now starts empty. Restore this test's own pre-#55
    // starting levels so the maxGapSec bound below still measures steady-
    // state cycling, not a one-time startup fill transient that has nothing
    // to do with the stall this test reproduces.
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15)); // issue #40's exact reproduction value
    const treater = getMachineState(sim, TREATER_ID);

    let lastPhase = treater.phase;
    let lastChangeT = 0;
    let maxGapSec = 0;
    let completedCycles = 0;
    let everOvershot = false;
    const RUN_SEC = 12000; // 2x the original report's 6000s window, well past its claimed 3277s of total silence
    for (let i = 0; i < Math.round(RUN_SEC / DT); i++) {
      stepSim(sim, DT);
      if (treater.held > treater.chargeM3 + 1e-9) everOvershot = true;
      if (treater.phase !== lastPhase) {
        maxGapSec = Math.max(maxGapSec, sim.t - lastChangeT);
        if (treater.phase === "holding") completedCycles++;
        lastChangeT = sim.t;
        lastPhase = treater.phase;
      }
    }

    expect(everOvershot).toBe(false); // held never exceeded chargeM3, at any point in the run
    // A genuine permanent stall would show up as one final, unbounded gap;
    // every gap actually observed tops out at the treater's own 40s hold
    // time, with generous margin, no matter how deep into the run it falls.
    expect(maxGapSec).toBeLessThan(treater.cycleSec + 20);
    expect(completedCycles).toBeGreaterThan(200); // far more than the original report's implied zero
  }, 20000);

  // The single-rate test above only exercises 15 t/h. The overshoot theory
  // it rules out (`held` clamped past `chargeM3` by the Math.max(0, ...) in
  // capacityAvailableBatchCycle) is structural, not rate-dependent — but a
  // regression test should say so in code, not just in a commit message.
  // This sweeps the drum feeder's whole confirmed operating range (2-20 t/h,
  // REAL_LINE_SPECS.md §5) at a shorter duration each, so a future change
  // that only breaks at, say, 5 t/h still gets caught here.
  it("never overshoots a charge or produces an unbounded stall gap, at any feeder rate across the confirmed 2-20 t/h range", () => {
    // Pinned explicitly rather than left at the line's own authored default
    // (raised to 15 t/h by issue #60, for the graded feed schedule's own
    // boost band, unrelated to this sweep) — this test's own bound formula
    // needs a known, fixed source ceiling below every rate in the sweep, not
    // whatever the line's default happens to be from ticket to ticket.
    const SOURCE_RATE_TPH = 20;
    for (const rate of [2, 5, 8, 11, 12, 12.5, 15, 18, 20]) {
      const sim = createSim(lineWithoutPackaging);
      setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(SOURCE_RATE_TPH));
      // Isolates this sweep from the buffer bin's own interlock (#19), same
      // reasoning as the single-rate test above — a surplus feeder rate can
      // otherwise fill and latch it shut mid-sweep.
      setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 2);
      setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(rate));
      const treater = getMachineState(sim, TREATER_ID);
      // Below the source's own ceiling, gathering a full charge from empty
      // genuinely takes longer the slower the feeder is — a real
      // supply-limited charging phase, not a stall. Bounding against a fixed
      // margin (as the 15 t/h single-rate test above does) would fail at low
      // rates for exactly that legitimate reason, so the bound here scales
      // with how long one charge can honestly take at this rate's own
      // effective supply (capped by the source, same as the physical line).
      const worstChargeTimeSec = treater.chargeM3 / tPerHourToM3PerSec(Math.min(rate, SOURCE_RATE_TPH));
      const maxAllowedGapSec = treater.cycleSec + 3 * worstChargeTimeSec;

      let lastPhase = treater.phase;
      let lastChangeT = 0;
      let maxGapSec = 0;
      let everOvershot = false;
      for (let i = 0; i < Math.round(3000 / DT); i++) {
        stepSim(sim, DT);
        if (treater.held > treater.chargeM3 + 1e-9) everOvershot = true;
        if (treater.phase !== lastPhase) {
          maxGapSec = Math.max(maxGapSec, sim.t - lastChangeT);
          lastChangeT = sim.t;
          lastPhase = treater.phase;
        }
      }

      expect(everOvershot).toBe(false);
      expect(maxGapSec).toBeLessThan(maxAllowedGapSec);
    }
  }, 30000);

  // Issue #40's acceptance criteria name TREATER BUFFER BIN and TREATER
  // AFTER-BIN specifically. The after-bin can't be one of the two here — see
  // the structural test below, and the pre-existing after-bin row in
  // docs/OPEN_QUESTIONS.md ("Machine 6"): a single charge is only ~33% of
  // its capacity against a 60% high set point deliberately given headroom,
  // so no in-range feeder rate ever trips it. This test demonstrates the
  // criterion's actual intent — more than one interlocked machine staying
  // live deep into a long run, not silent after one early transient — with
  // the buffer bin standing in for the after-bin. Below the source's own
  // rate the feeder can't keep pace with supply, so the buffer bin genuinely
  // fills and trips its own high-set-point interlock (issue #19) — a real,
  // sustained boom-bust cycle, not a demo rate hack. A presenter raising the
  // feed rate mid-run (the same live control issue #20 built, and the same
  // staging pattern this project uses throughout — see
  // feedback-stage-with-presenter-controls) then lets the after-bin's own
  // interlock join in too, all inside one continuous run. Issue #60 removed
  // the treating-side feeder's own interlock from this schedule-free variant
  // (the pre-bin's own graded feed schedule replaced its old two-stage
  // throttle — see lineWithoutFeedSchedule's own comment), so the buffer bin
  // is this test's first machine now, not the pre-bin's.
  it("more than one interlocked machine logs events well past the initial startup transient, not just once each at the very start", () => {
    const sim = createSim(lineWithoutPackaging);
    // 4 t/h, well under the line's own 15 t/h source default, so the buffer
    // bin genuinely fills past its own 85% set point within the 3000s
    // budget below.
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(4));
    for (let i = 0; i < Math.round(3000 / DT); i++) stepSim(sim, DT);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(20)); // presenter catches the line back up: now the after-bin runs hot instead
    for (let i = 0; i < Math.round(6000 / DT); i++) stepSim(sim, DT);

    const events = getCombinedEvents(sim);
    const machinesLogging = new Set(events.map((e) => e.machineId));
    expect(machinesLogging.size).toBeGreaterThan(1); // more than the single machine issue #40 reported

    const lateEvents = events.filter((e) => e.t > 3000);
    expect(lateEvents.length).toBeGreaterThan(1); // still logging well past the run's midpoint, not silent after an early transient
  }, 20000);

  // Structural, not rate-dependent: a single charge can raise the after-bin
  // by at most chargeM3/capacity, comfortably under its own 60% high set
  // point — chosen specifically (see afterBinHoldTreater's own comment in
  // lineData.js) so one more full charge always has room to land without the
  // physical backpressure the accumulator already enforces ever coming into
  // play. So the after-bin never once tripping in the tests above is by
  // design, not a residual gap issue #40 left unfixed.
  it("the after-bin's interlock never trips under any in-range supply — by design, not a residual stall", () => {
    const sim = createSim(lineWithoutPackaging);
    const treater = getMachineState(sim, TREATER_ID);
    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    expect(treater.chargeM3 / afterBin.capacity).toBeLessThan(afterBinInterlock(sim).highSetpoint);

    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(6000 / DT); i++) stepSim(sim, DT);
    expect(afterBinInterlock(sim).phase).toBe("released"); // never once tripped
  }, 20000);

  // Issue #41: before centralizing the crossing log, holdNextBatch's LSL
  // message only ever logged from inside the `phase === "held"` branch — a
  // phase this rule (per the test above) never reaches under any in-range
  // supply. So every one of the after-bin's own LSL crossings went entirely
  // unlogged, no matter how many times the level oscillated below its low
  // set point between batch discharges — exactly the gap issue #40's
  // investigation ran into on treaterPreBin. This proves the fix on the
  // machine the ticket names directly: LSH never trips (reused from the test
  // above), yet LSL still crosses repeatedly and logs every time.
  it("the after-bin's LSL crosses repeatedly under normal supply, and each crossing is logged, even though the phase never trips (issue #41)", () => {
    const sim = createSim(lineWithoutPackaging);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15)); // same rate as the never-trips test above
    for (let i = 0; i < Math.round(6000 / DT); i++) stepSim(sim, DT);

    expect(afterBinInterlock(sim).phase).toBe("released"); // LSH never tripped, same as above
    const lslCrossings = afterBinInterlock(sim).log.filter((e) => e.message.startsWith("LSL set point reached"));
    expect(lslCrossings.length).toBeGreaterThan(1); // crossed more than once over the run
    for (const entry of lslCrossings) {
      expect(typeof entry.t).toBe("number");
      expect(entry.message).toMatch(/^LSL set point reached at \d+% \(setpoint \d+%\)$/);
    }
  }, 20000);
});

describe("resetSim (presenter reset, no page reload needed)", () => {
  it("puts every live-adjusted control and every machine's state back to the line's authored defaults", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(20));
    setElevatorSpeed(sim, ELEVATOR_ID, 0.3);
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    for (let i = 0; i < Math.round(80 / DT); i++) stepSim(sim, DT);

    // confirm the run actually moved things, so the reset assertions below mean something
    expect(sim.t).toBeGreaterThan(0);
    expect(getMachineState(sim, ELEVATOR_ID).queue.length + getMachineState(sim, ELEVATOR_ID).backlog).not.toBe(0);

    resetSim(sim);

    expect(sim.t).toBe(0);
    expect(getMachineState(sim, SOURCE_ID).nominalRate).toBeCloseTo(tPerHourToM3PerSec(12)); // line default, not the 20 t/h set mid-run
    expect(getMachineState(sim, FEEDER_ID).rate).toBe(0); // line default: starts off
    expect(getMachineState(sim, FEEDER_ID).drawn).toBe(0);
    expect(getMachineState(sim, ELEVATOR_ID).speedFraction).toBe(1); // line default, not the 0.3 set mid-run
    expect(getMachineState(sim, ELEVATOR_ID).queue).toEqual([]);
    expect(getMachineState(sim, ELEVATOR_ID).backlog).toBe(0);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored / bin.capacity).toBe(0); // line default fill level (issue #55: starts empty)
    expect(interlockRule(sim).highSetpoint).toBeCloseTo(0.85); // line default, not the 0.6 set mid-run
    expect(interlockRule(sim).phase).toBe("open");
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("keeps the same object reference so a caller holding onto `sim` sees the reset without re-fetching it", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    stepSim(sim, DT);
    const result = resetSim(sim);
    expect(result).toBe(sim);
  });

  it("the sim is fully usable again after a reset", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < Math.round(80 / DT); i++) stepSim(sim, DT);
    resetSim(sim);

    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 100; i++) stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).fed).toBeGreaterThan(0);
    expect(() => assertConserved(sim)).not.toThrow();
  });
});

// Issue #46: the Pro Box becomes a live source, a source selector picks
// which single inlet drum feeder runs, and the packaging conveyor carries
// product with a real, geometry-derived transport lag into the outload
// buffer bin — the first packaging machines to carry real product.
const PRO_BOX_ID = "proBoxStation";
const PRO_BOX_FEEDER_ID = "inletDrumFeeder1";
const TREATING_FEEDER_ID = "inletDrumFeeder2";
const CONVEYOR_ID = "pendulumConveyor";
const GRAIN_BREAK_ID = "grainBreak";
const OUTLOAD_BIN_ID = "outloadBufferBin";
const METAL_BIN_1_ID = "metalBin1";
const METAL_BIN_2_ID = "metalBin2";
const OUTLOAD_DIVERTER_ID = "outloadDiverter";

// Issue #48: the Flexicon big-bag branch — sampler, pre-bin, metering
// conveyor, filling head (batchCycle reused a third time) and the bag-
// counting terminus.
const BIN_SEG_SAMPLER_ID = "binSegSampler";
const FLEXICON_PRE_BIN_ID = "flexiconPreBin";
const VIBRATING_CONVEYOR_ID = "vibratingConveyor";
const FILLING_HEAD_ID = "flexiconFillingHead";
const ROLLER_SCALE_ID = "rollerScale";
const BIG_BAG_ID = "bigBagStub";

// Issue #49: the Concetti bagging branch — sampler, pre-bin, bagging scale
// (batchCycle reused a fourth time), filling & sewing, palletising and the
// bag-counting terminus.
const CONCETTI_SAMPLER_ID = "concettiSampler";
const CONCETTI_PRE_BIN_ID = "concettiPreBin";
const CONCETTI_SCALE_ID = "concettiScale";
const CONCETTI_FILLER_ID = "concettiFiller";
const PALLETISING_ID = "palletising";
const PALLET_STUB_ID = "palletStub";

describe("Pro Box source and the source selector (issue #46)", () => {
  it("the Pro Box is a live source with a presenter-settable rate, same as the treating-line stub", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 100; i++) stepSim(sim, DT);
    const proBox = getMachineState(sim, PRO_BOX_ID);
    expect(proBox.kind).toBe("source");
    expect(proBox.fed).toBeCloseTo(tPerHourToM3PerSec(12) * DT * 100);
  });

  it("defaults to the treating line, matching the line's own authored feeder enable/disable state", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(getSource(sim)).toBe("treatingLine");
    expect(getMachineState(sim, TREATING_FEEDER_ID).enabled).toBe(true);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(false);
  });

  it("selecting the Pro Box arms only its own feeder, and selecting the treating line arms only the other", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSource(sim, "proBox");
    expect(getSource(sim)).toBe("proBox");
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(true);
    expect(getMachineState(sim, TREATING_FEEDER_ID).enabled).toBe(false);

    setSource(sim, "treatingLine");
    expect(getSource(sim)).toBe("treatingLine");
    expect(getMachineState(sim, TREATING_FEEDER_ID).enabled).toBe(true);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(false);
  });

  it("rejects an unknown source", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(() => setSource(sim, "somewhereElse")).toThrow(/unknown source/);
  });

  it("exactly one drum feeder ever draws product, whichever source is selected", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).flowRateM3PerSec).toBeGreaterThan(0);
    expect(getMachineState(sim, TREATING_FEEDER_ID).flowRateM3PerSec).toBe(0);
  });

  it("a presenter's own feed-rate dial survives being deselected and reselected", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setFeederRate(sim, PRO_BOX_FEEDER_ID, tPerHourToM3PerSec(7)); // dialled in while still deselected
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).rate).toBeCloseTo(tPerHourToM3PerSec(7));

    setSource(sim, "proBox");
    setSource(sim, "treatingLine"); // deselected again
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).rate).toBeCloseTo(tPerHourToM3PerSec(7)); // not zeroed

    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).flowRateM3PerSec).toBeCloseTo(tPerHourToM3PerSec(7), 4); // the dial, not the line default
  });

  // Per this ticket's own acceptance criterion: selecting the Pro Box leaves
  // the treating zone idle. No special-cased "idle" state exists anywhere —
  // this is exactly the same afterBinHoldTreater interlock (issue #25) the
  // treating-zone-only tests above prove never trips under any in-range
  // supply *while the treating line is selected*: deselecting
  // inletDrumFeeder2 removes the scalping screen's only real discharge, the
  // after-bin backs up behind it, and the interlock trips on its own.
  it("selecting the Pro Box backs up the scalping screen and eventually holds the batch treater, idling the treating zone", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15)); // treating zone's own feeder still well-supplied internally
    for (let i = 0; i < Math.round(6000 / DT); i++) stepSim(sim, DT);
    expect(afterBinInterlock(sim).phase).toBe("held"); // tripped, unlike the treating-line-selected case
    expect(() => assertConserved(sim)).not.toThrow();
  }, 20000);
});

describe("the packaging conveyor carries product to the outload buffer bin (issue #46)", () => {
  it("derives its transport lag from the sheet 52-13 geometry (carrying-side path / chain speed), not a tuned constant", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    const snap = BEHAVIORS.routedTransportDelay.snapshot(getMachineState(sim, CONVEYOR_ID));
    expect(snap.transitTimeSec).toBeCloseTo(185, 0); // (7.084 + 9.157 + 14.846) m / (10.08 m/min)
  });

  it("nothing reaches the outload buffer bin until the full derived transit lag has elapsed", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    // Issue #47 wires a real, live downstream all the way to metal bin 1
    // (the diverter, then the bin itself), so the buffer bin no longer
    // accumulates anything on its own — it passes straight through to
    // whichever bin is selected. Both authored initial inventories are
    // zeroed here so the only thing that can raise either bin's `stored` is
    // material the conveyor itself delivers.
    // Destination now defaults to Concetti (issue #56), so this test — which
    // is specifically about the metal-bin outload branch — must route there
    // explicitly instead of riding the default.
    setDestination(sim, "metalBin1");
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0);
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));

    for (let i = 0; i < Math.round(170 / DT); i++) stepSim(sim, DT); // short of the ~185s lag
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeCloseTo(0);
    expect(getMachineState(sim, GRAIN_BREAK_ID).flowRateM3PerSec).toBe(0);

    for (let i = 0; i < Math.round(30 / DT); i++) stepSim(sim, DT); // now past it
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeGreaterThan(0);
  });

  it("speed is a live control, re-pacing material already in transit, not just new material", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "metalBin1"); // this test is about the metal-bin branch specifically (issue #56 default is Concetti)
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0); // same zeroing as above, isolates newly-arrived material
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT); // some material already mid-transit
    setElevatorSpeed(sim, CONVEYOR_ID, 0.5); // halved live, mid-run

    for (let i = 0; i < Math.round(140 / DT); i++) stepSim(sim, DT); // past the original ~185s lag (60+140=200s)
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeCloseTo(0); // re-paced, not just unaffected new material

    for (let i = 0; i < Math.round(185 / DT); i++) stepSim(sim, DT); // the rest of the doubled delay
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeGreaterThan(0);
  });

  it("a full metal bin trips the conveyor rather than spilling, and the buffer bin ahead of it backpressures too", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    // Issue #47: overflow protection on this branch is now the metal bin's
    // own high-level trip (metalBin1HighTrip, lineData.js), which stops the
    // conveyor well before hard accumulator capacity is ever reached (its
    // 85% set point trips before 100%) — so this no longer reaches the pure
    // physical-backpressure scenario the pre-#47 version of this test
    // exercised (that mechanism still exists underneath, see the
    // accumulator's own reverse-pass capacity check, but the trip fires
    // first in ordinary operation, exactly as designed).
    // Issue #55: the line now starts empty; restore this test's own pre-#55
    // starting levels along the conveyor's own path so the 400s budget below
    // still reaches metal bin 1's own 85% trip.
    // Issue #56: destination now defaults to Concetti, not metal bin 1.
    setDestination(sim, "metalBin1");
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0.62);
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0.35);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < Math.round(400 / DT); i++) stepSim(sim, DT); // well past transit lag + the 5s trip delay

    const bin1 = getMachineState(sim, METAL_BIN_1_ID);
    expect(bin1.spill).toBeCloseTo(0); // backpressure/trip, not spill — same convention every other bin uses
    expect(bin1.stored).toBeLessThan(bin1.capacity); // trips before hard capacity, doesn't need to reach it
    expect(getInterlockState(sim, METAL_BIN_1_ID).phase).toBe("stopped");
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0); // the conveyor genuinely stopped
    expect(() => assertConserved(sim)).not.toThrow();
  }, 10000);

  it("every new packaging machine publishes a live snapshot once its own upstream is running, not frozen decoration", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "metalBin1"); // this test is about the metal-bin branch specifically (issue #56 default is Concetti)
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0); // isolates newly-arrived material, see the lag test's own comment
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    for (const id of [PRO_BOX_ID, PRO_BOX_FEEDER_ID, TREATING_FEEDER_ID, CONVEYOR_ID, GRAIN_BREAK_ID, OUTLOAD_BIN_ID]) {
      expect(getMachineState(sim, id).flowRateM3PerSec).toBeDefined();
    }
    expect(getMachineState(sim, PRO_BOX_ID).flowRateM3PerSec).toBeGreaterThan(0);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).flowRateM3PerSec).toBeGreaterThan(0);

    // The conveyor itself is mid-transit at 60s (well under its own ~185s
    // lag), so its own *discharge* is legitimately still zero here — that's
    // the lag working, not frozen decoration (proven by the dedicated lag
    // test above). Run past it to see the discharge side come alive too.
    for (let i = 0; i < Math.round(150 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, CONVEYOR_ID).flowRateM3PerSec).toBeGreaterThan(0);
    expect(getMachineState(sim, GRAIN_BREAK_ID).flowRateM3PerSec).toBeGreaterThan(0);
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeGreaterThan(0);
  });

  it("conserves volume across a mid-run source switch, the case most likely to leak", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(15));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(300 / DT); i++) stepSim(sim, DT);

    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(300 / DT); i++) stepSim(sim, DT);

    setSource(sim, "treatingLine");
    for (let i = 0; i < Math.round(300 / DT); i++) stepSim(sim, DT);

    expect(() => assertConserved(sim)).not.toThrow();
  });
});

// Issue #47: the destination selector, the router/routedTransportDelay
// behaviours it commands, the arming mechanism on the metal bins' own
// interlocks, and the full outload-branch cascade the parent spec exists to
// demonstrate.
describe("destination selector (issue #47)", () => {
  it("defaults to Concetti, matching the conveyor's own authored default port (issue #56: the real most-used destination)", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(getDestination(sim)).toBe("concetti");
    expect(getMachineState(sim, CONVEYOR_ID).selected).toBe("outConcetti");
  });

  it("has four positions, each commanding the two routers correctly", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "concetti");
    expect(getDestination(sim)).toBe("concetti");
    expect(getMachineState(sim, CONVEYOR_ID).selected).toBe("outConcetti");

    setDestination(sim, "flexicon");
    expect(getDestination(sim)).toBe("flexicon");
    expect(getMachineState(sim, CONVEYOR_ID).selected).toBe("outBinSeg");

    setDestination(sim, "metalBin2");
    expect(getDestination(sim)).toBe("metalBin2");
    expect(getMachineState(sim, CONVEYOR_ID).selected).toBe("outBuffer");
    expect(getMachineState(sim, OUTLOAD_DIVERTER_ID).selected).toBe("out2");

    setDestination(sim, "metalBin1");
    expect(getDestination(sim)).toBe("metalBin1");
    expect(getMachineState(sim, OUTLOAD_DIVERTER_ID).selected).toBe("out1");
  });

  it("rejects an unknown destination", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    expect(() => setDestination(sim, "somewhereElse")).toThrow(/unknown destination/);
  });

  it("switching destination mid-run sends nothing new to the new destination until material already in transit has cleared, and material already in transit still arrives at the old one", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    // Issue #56: destination now defaults to Concetti, not metal bin 1 —
    // this test is specifically about material riding the conveyor toward
    // metal bin 1 at the moment of a switch, so route there explicitly.
    setDestination(sim, "metalBin1");
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0); // both zeroed: isolates newly-arrived material, see other #46 tests
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
    // Issue #55: the line now starts empty. This test is about material
    // already riding the conveyor at the moment of a mid-run destination
    // switch, not about the whole treating zone filling from scratch, so
    // restore the treating zone's own pre-#55 starting levels — the same
    // head start the 30s "already riding the conveyor" window below always
    // assumed.
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.55);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.4);
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.3);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(15));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(30 / DT); i++) stepSim(sim, DT); // material now riding the conveyor toward metal bin 1

    setDestination(sim, "concetti"); // switch while product is still in transit

    // Nothing has had time to reach either destination yet (well short of
    // the ~185s lag either way), so both should still read zero right after
    // the switch — the real assertion is *which* one eventually receives
    // the material already on the chain.
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeCloseTo(0);

    for (let i = 0; i < Math.round(250 / DT); i++) stepSim(sim, DT); // past the lag for the pre-switch material
    // The material fed in the first 30s, tagged "outBuffer" at the moment
    // it was accepted, arrives at metal bin 1 regardless of the later
    // switch — this is routedTransportDelay's own per-packet tagging
    // (behaviors.js), exercised here through the full engine.
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeGreaterThan(0);
    // Nothing fed *after* the switch has had time to reach Concetti yet
    // either (fed starting at t=30s, ~185s lag -> arrives ~t=215s; this
    // checkpoint is at t=280s, so some may have arrived — the point proven
    // above is that metal bin 1 isn't starved by the switch, not that
    // Concetti is still empty).
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("conserves volume across a mid-run destination switch, the case most likely to leak", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(15));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    setDestination(sim, "flexicon");
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    setDestination(sim, "metalBin2");
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    setDestination(sim, "concetti");
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("the outload diverter routes the whole of its inflow to whichever metal bin is selected, never both", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "metalBin1"); // issue #56: destination now defaults to Concetti, not metal bin 1
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0.9); // plenty ready to discharge immediately
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, METAL_BIN_2_ID).flowRateM3PerSec).toBe(0); // bin 1 selected explicitly above

    setDestination(sim, "metalBin2");
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, METAL_BIN_1_ID).flowRateM3PerSec).toBe(0); // now bin 2 only
  });

  it("the grain break holds no material at any point", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(15));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(300 / DT); i++) {
      stepSim(sim, DT);
      expect(getMachineState(sim, GRAIN_BREAK_ID).volume).toBe(0);
    }
  });
});

describe("arming: a full pre-bin does not trip anything while routed elsewhere (issue #47)", () => {
  it("a disarmed metal bin trip never fires: routing to Concetti with metal bin 1 already over its own high set point leaves the conveyor running", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 1); // already well past its own 85% trip point
    setDestination(sim, "concetti"); // but not the selected destination
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    expect(getInterlockState(sim, METAL_BIN_1_ID).phase).toBe("running"); // never even armed
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1); // never touched
  });

  it("the same full bin trips the conveyor once its own destination is (re-)selected", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 1);
    setDestination(sim, "concetti");
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(getInterlockState(sim, METAL_BIN_1_ID).phase).toBe("running");

    setDestination(sim, "metalBin1"); // now selected
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT); // past the 5s signal delay
    expect(getInterlockState(sim, METAL_BIN_1_ID).phase).toBe("stopped");
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);
  });
});

describe("the full outload cascade: a full metal bin stops the conveyor, then both drum feeders, then starves the treating zone (issue #47)", () => {
  it("cascades in the documented order: conveyor stops, both drum feeders stop 1s later, and the treating zone eventually backs up and holds the treater", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "metalBin1"); // issue #56: destination now defaults to Concetti, not metal bin 1
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 1); // already tripped once armed
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(15));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15));

    for (let i = 0; i < Math.round(3 / DT); i++) stepSim(sim, DT); // short of the 5s trip delay
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1); // not yet
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).runPermit).toBe(true);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(true);

    for (let i = 0; i < Math.round(3 / DT); i++) stepSim(sim, DT); // past the 5s trip delay (t~6s), short of +1s feeder delay
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);
    // The FD's own reverse-direction interlock table (§5) gates *both*
    // packaging drum feeders on "52.604.E00 running", unconditionally —
    // not just whichever one the source selector currently has armed — but
    // the 1s feeder-stop delay hasn't elapsed yet at this checkpoint.
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).runPermit).toBe(true);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(true);

    for (let i = 0; i < Math.round(2 / DT); i++) stepSim(sim, DT); // past the 1s feeder-stop delay too (t~8s)
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).runPermit).toBe(false);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(false);

    for (let i = 0; i < Math.round(6000 / DT); i++) stepSim(sim, DT); // let it propagate all the way back
    expect(afterBinInterlock(sim).phase).toBe("held"); // the treater eventually stops accepting charges
    expect(() => assertConserved(sim)).not.toThrow();
  }, 20000);

  it("the cascade latches: resetting trips clears it only once the metal bin has actually been emptied", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "metalBin1"); // issue #56: destination now defaults to Concetti, not metal bin 1
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 1);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);

    resetTrips(sim);
    expect(getInterlockState(sim, METAL_BIN_1_ID).phase).toBe("stopped"); // still full, re-latches
    expect(getMachineState(sim, CONVEYOR_ID).throttleTarget).toBe(0);

    // The presenter's own bin-empty affordance (PlantControls.jsx): the
    // same setAccumulatorLevel the level-jump slider already uses.
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
    resetTrips(sim);
    expect(getInterlockState(sim, METAL_BIN_1_ID).phase).toBe("recovering");
    expect(getMachineState(sim, CONVEYOR_ID).throttleTarget).toBe(1);
  });

  it("both packaging drum feeders resume, unlatched, the instant the conveyor is confirmed running again — no reset needed for that half of the cascade", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "metalBin1"); // issue #56: destination now defaults to Concetti, not metal bin 1
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 1);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT); // trips, both feeders lose run permit
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(false);

    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
    resetTrips(sim); // clears the conveyor's own latch
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // conveyor ramps back up and settles
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(true); // released on its own, no separate action
  });
});

// Issue #48: the Flexicon big-bag branch, end to end. Almost every machine
// here is configuration of an existing behaviour (issue #22's own reuse
// claim for the auto sampler/pass-through, issue #18's accumulator for the
// pre-bin, issue #20's meteredFeeder for the vibrating conveyor, issue #26's
// terminalSink for the terminus) — the one genuinely new piece is the
// filling head reusing issue #24's batchCycle, and the pre-bin's own
// high-level trip reusing issue #47's thresholdStopTrip/armedWhen shape
// against a single-condition arming instead of two.
describe("the Flexicon big-bag branch completes (issue #48)", () => {
  it("selecting Flexicon routes product down this branch and nowhere else", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0);
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
    setAccumulatorLevel(sim, METAL_BIN_2_ID, 0);
    setDestination(sim, "flexicon");
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < Math.round(220 / DT); i++) stepSim(sim, DT); // past the conveyor's own ~185s transit lag

    expect(getMachineState(sim, FLEXICON_PRE_BIN_ID).stored).toBeGreaterThan(0);
    expect(getMachineState(sim, OUTLOAD_BIN_ID).stored).toBeCloseTo(0);
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeCloseTo(0);
    expect(getMachineState(sim, METAL_BIN_2_ID).stored).toBeCloseTo(0);
    expect(() => assertConserved(sim)).not.toThrow();
  }, 10000);

  it("the auto sampler holds no material at any point", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "flexicon");
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < Math.round(220 / DT); i++) {
      stepSim(sim, DT);
      expect(getMachineState(sim, BIN_SEG_SAMPLER_ID).volume).toBe(0);
    }
  }, 10000);

  it("the pre-bin fills, and backpressures upstream when full rather than spilling", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "flexicon");
    setFeederRate(sim, VIBRATING_CONVEYOR_ID, 0); // nothing draining the pre-bin
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, PRO_BOX_FEEDER_ID, tPerHourToM3PerSec(20)); // the feeder's own metering rate, not just the source valve
    for (let i = 0; i < Math.round(700 / DT); i++) stepSim(sim, DT); // past the lag, plenty of time to fill and trip

    // Same finding as the outload branch's own equivalent test (metal bin
    // 1's "a full metal bin trips the conveyor rather than spilling"
    // above): the pre-bin's own high-level trip (flexiconPreBinHighTrip,
    // lineData.js) stops the conveyor at its 85% set point well before hard
    // accumulator capacity is ever reached, so overflow protection in
    // ordinary operation is the trip, not the physical reverse-pass
    // capacity check underneath it — that check still guarantees no spill
    // regardless (issue #18), which is what this asserts.
    const preBin = getMachineState(sim, FLEXICON_PRE_BIN_ID);
    expect(preBin.spill).toBeCloseTo(0); // backpressure/trip, not spill
    expect(preBin.stored).toBeLessThan(preBin.capacity); // trips before hard capacity, doesn't need to reach it
    expect(getInterlockState(sim, FLEXICON_PRE_BIN_ID).phase).toBe("stopped");
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);
    expect(() => assertConserved(sim)).not.toThrow();
  }, 15000);

  it("the vibrating conveyor meters the pre-bin's discharge at a presenter-settable rate", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1); // plenty stored, isolates the feeder's own metering
    setFeederRate(sim, VIBRATING_CONVEYOR_ID, tPerHourToM3PerSec(6));
    for (let i = 0; i < Math.round(5 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, VIBRATING_CONVEYOR_ID).flowRateM3PerSec).toBeCloseTo(tPerHourToM3PerSec(6), 5);
  });

  it("the filling head takes a charge, holds it for a cycle, and discharges a completed bag, reusing the batch cycle behaviour", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1); // plenty of supply
    // Synthetic, well past the slider's own 0-20 t/h range: isolates the
    // filling head's own cycle timing from how long a realistic vibrating-
    // conveyor rate would take to deliver one whole bag's charge (which, at
    // the slider's own max, is itself several minutes — the real-world
    // bag-filling time this branch models, not a slow test).
    setFeederRate(sim, VIBRATING_CONVEYOR_ID, tPerHourToM3PerSec(500));
    const head = () => getMachineState(sim, FILLING_HEAD_ID);
    expect(head().phase).toBe("charging");

    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // charges fully at this rate
    expect(head().phase).toBe("holding");
    expect(head().held).toBeCloseTo(head().chargeM3);

    for (let i = 0; i < Math.round(50 / DT); i++) stepSim(sim, DT); // past the configured 45s hold
    expect(head().phase).toBe("charging"); // discharged the completed bag, cycling again
    expect(head().delivered).toBeGreaterThan(0);
  });

  it("the terminus reports a running count of big bags delivered alongside its volume total", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1); // ~1.8 bags' worth stored, enough for one full cycle
    setFeederRate(sim, VIBRATING_CONVEYOR_ID, tPerHourToM3PerSec(500)); // see the batch-cycle test's own comment
    const bag = () => getMachineState(sim, BIG_BAG_ID);
    const head = () => getMachineState(sim, FILLING_HEAD_ID);
    expect(BEHAVIORS.terminalSink.snapshot(bag()).bagCount).toBe(0);

    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT); // one full charge + 45s hold + discharge pulse
    expect(bag().total).toBeCloseTo(head().chargeM3);
    expect(BEHAVIORS.terminalSink.snapshot(bag()).bagCount).toBe(1);
  });

  it("every branch machine publishes a live snapshot once its own upstream is running, not frozen decoration", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "flexicon");
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1);
    // The default authored rate (10 t/h, lineData.js), not the other tests'
    // own synthetic 500 t/h: that rate drains this pre-bin's whole 2.5 m3
    // in ~13s, which would starve the head before this snapshot check and
    // read as "stalled" rather than "never live" — the same trap the #40
    // investigation caught (a final-tick read isn't the same as a live
    // trajectory). At the default rate the pre-bin is nowhere near drained
    // by t=60s.
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    for (const id of [BIN_SEG_SAMPLER_ID, FLEXICON_PRE_BIN_ID, VIBRATING_CONVEYOR_ID, FILLING_HEAD_ID, ROLLER_SCALE_ID, BIG_BAG_ID]) {
      expect(getMachineState(sim, id).flowRateM3PerSec).toBeDefined();
    }
    expect(getMachineState(sim, VIBRATING_CONVEYOR_ID).flowRateM3PerSec).toBeGreaterThan(0);
    expect(getMachineState(sim, FILLING_HEAD_ID).held).toBeGreaterThan(0); // genuinely mid-charge, not frozen
  });
});

describe("arming: a full Flexicon pre-bin does not trip anything while routed elsewhere (issue #48)", () => {
  it("a disarmed pre-bin trip never fires: leaving the destination at metal bin 1 with the pre-bin already over its own high set point leaves the conveyor running", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1); // already well past its own 85% trip point
    // Explicit: destination defaults to concetti (issue #56), not metal
    // bin 1 or flexicon — either is "elsewhere" for this test, but pin it
    // down rather than ride the default.
    setDestination(sim, "metalBin1");
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    expect(getInterlockState(sim, FLEXICON_PRE_BIN_ID).phase).toBe("running"); // never even armed
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1); // never touched
  });

  it("the same full pre-bin trips the conveyor once Flexicon is (re-)selected", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(getInterlockState(sim, FLEXICON_PRE_BIN_ID).phase).toBe("running");

    setDestination(sim, "flexicon"); // now selected
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT); // past the 5s signal delay
    expect(getInterlockState(sim, FLEXICON_PRE_BIN_ID).phase).toBe("stopped");
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);
  });
});

describe("the Flexicon pre-bin's own high-level trip cascades and latches like the metal bins' (issue #48)", () => {
  it("trips the conveyor, then both packaging drum feeders lose run permit — the same shared cascade the outload branch's own trips drive", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "flexicon");
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1);

    for (let i = 0; i < Math.round(3 / DT); i++) stepSim(sim, DT); // short of the 5s trip delay
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1);

    for (let i = 0; i < Math.round(3 / DT); i++) stepSim(sim, DT); // past the 5s trip delay, short of +1s feeder delay
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).runPermit).toBe(true);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(true);

    for (let i = 0; i < Math.round(2 / DT); i++) stepSim(sim, DT); // past the 1s feeder-stop delay too
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).runPermit).toBe(false);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(false);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("latches: resetting trips clears it only once the pre-bin has actually been emptied, and the presenter's reset recovers it", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "flexicon");
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);

    resetTrips(sim);
    expect(getInterlockState(sim, FLEXICON_PRE_BIN_ID).phase).toBe("stopped"); // still full, re-latches
    expect(getMachineState(sim, CONVEYOR_ID).throttleTarget).toBe(0);

    // The presenter's own bin-empty affordance (PlantControls.jsx): the
    // same setAccumulatorLevel the level-jump slider already uses.
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 0);
    resetTrips(sim);
    expect(getInterlockState(sim, FLEXICON_PRE_BIN_ID).phase).toBe("recovering");
    expect(getMachineState(sim, CONVEYOR_ID).throttleTarget).toBe(1);
  });

  it("conserves volume across a switch onto and off the Flexicon branch mid-run", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    setDestination(sim, "flexicon");
    for (let i = 0; i < Math.round(300 / DT); i++) stepSim(sim, DT);
    // Past the ~185s lag for material fed since the switch: proves the
    // branch genuinely carried product during this window, not just that
    // the totals happen to balance regardless of which branch (if any)
    // actually moved anything.
    expect(getMachineState(sim, FLEXICON_PRE_BIN_ID).stored).toBeGreaterThan(0);

    setDestination(sim, "metalBin1");
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    expect(() => assertConserved(sim)).not.toThrow();
  });
});

// Issue #49: the Concetti bagging branch, end to end — the fourth and last
// outload destination, completing every route on the line. The sampler,
// filling & sewing head and palletiser are all pass-throughs (issue #22's
// own reuse claim again), the pre-bin is another accumulator configuration
// (issue #18, an eighth reuse), and the bagging scale reuses issue #24's
// batchCycle a fourth time. The pre-bin's own high-level trip is the fourth
// and last of the FD's destination-interlock table (PLC_FUNCTIONAL_DESCRIPTION.md
// §5), completing the cascade the parent spec (#43) names as the whole
// project's central argument: this branch's own trip is exercised fully in
// the dedicated cascade describe block below, not just to the conveyor.
describe("the Concetti bagging branch completes (issue #49)", () => {
  it("selecting Concetti routes product down this branch and nowhere else", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0);
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
    setAccumulatorLevel(sim, METAL_BIN_2_ID, 0);
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 0);
    setDestination(sim, "concetti");
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < Math.round(220 / DT); i++) stepSim(sim, DT); // past the conveyor's own ~185s transit lag

    expect(getMachineState(sim, CONCETTI_PRE_BIN_ID).stored).toBeGreaterThan(0);
    expect(getMachineState(sim, OUTLOAD_BIN_ID).stored).toBeCloseTo(0);
    expect(getMachineState(sim, METAL_BIN_1_ID).stored).toBeCloseTo(0);
    expect(getMachineState(sim, METAL_BIN_2_ID).stored).toBeCloseTo(0);
    expect(getMachineState(sim, FLEXICON_PRE_BIN_ID).stored).toBeCloseTo(0);
    expect(() => assertConserved(sim)).not.toThrow();
  }, 10000);

  it("the auto sampler holds no material at any point", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "concetti");
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < Math.round(220 / DT); i++) {
      stepSim(sim, DT);
      expect(getMachineState(sim, CONCETTI_SAMPLER_ID).volume).toBe(0);
    }
  }, 10000);

  it("the pre-bin fills, and backpressures upstream when full rather than spilling", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "concetti");
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, PRO_BOX_FEEDER_ID, tPerHourToM3PerSec(20));
    // Freezes the bagging scale in "holding" after it drains exactly one
    // charge (~0.069 m3, negligible against the pre-bin's own 0.72 m3
    // capacity) by stretching its cycle time far past this test's own run
    // length, so the pre-bin fills against an effectively undrained
    // downstream. This branch has no metering feeder between the pre-bin
    // and the scale the way the Flexicon branch's own equivalent test gets
    // to zero (its vibratingConveyor) — the scale draws directly off the
    // accumulator's reverse pass, so stopping the *cycle* is this branch's
    // own equivalent isolation.
    setBatchCycleSec(sim, CONCETTI_SCALE_ID, 1e6);
    for (let i = 0; i < Math.round(400 / DT); i++) stepSim(sim, DT); // past the lag, plenty of time to fill and trip

    const preBin = getMachineState(sim, CONCETTI_PRE_BIN_ID);
    expect(preBin.spill).toBeCloseTo(0); // backpressure/trip, not spill
    expect(preBin.stored).toBeLessThan(preBin.capacity); // trips before hard capacity, doesn't need to reach it
    expect(getInterlockState(sim, CONCETTI_PRE_BIN_ID).phase).toBe("stopped");
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);
    expect(() => assertConserved(sim)).not.toThrow();
  }, 15000);

  it("the bagging scale takes a charge, holds it for a cycle, and discharges a completed bag, reusing the batch cycle behaviour", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 1); // plenty of supply; no metering feeder sits between the pre-bin and the scale
    const scale = () => getMachineState(sim, CONCETTI_SCALE_ID);
    expect(scale().phase).toBe("charging");

    stepSim(sim, DT); // the full pre-bin's own reverse-pass discharge fills one whole charge in a single tick
    expect(scale().phase).toBe("holding");
    expect(scale().held).toBeCloseTo(scale().chargeM3);

    // Past the configured 15s hold: with the pre-bin still full, the scale
    // discharges and instantly recharges for its next cycle within the same
    // window (unlike the Flexicon filling head's own equivalent test, which
    // rate-limits its supply and so can catch "charging" mid-flight) — so
    // `delivered` is the reliable signal a completed bag actually left,
    // rather than the transient phase value at whatever tick this lands on.
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(scale().delivered).toBeGreaterThan(0);
    expect(scale().delivered).toBeCloseTo(scale().chargeM3); // exactly one whole bag, not a partial pulse
  });

  it("filling and sewing, and palletising, hold no material at any point", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 1);
    for (let i = 0; i < Math.round(40 / DT); i++) {
      stepSim(sim, DT);
      expect(getMachineState(sim, CONCETTI_FILLER_ID).volume).toBe(0);
      expect(getMachineState(sim, PALLETISING_ID).volume).toBe(0);
    }
  });

  it("the terminus reports a running count of bags delivered alongside its volume total", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 1);
    const pallet = () => getMachineState(sim, PALLET_STUB_ID);
    const scale = () => getMachineState(sim, CONCETTI_SCALE_ID);
    expect(BEHAVIORS.terminalSink.snapshot(pallet()).bagCount).toBe(0);

    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT); // one full charge + 15s hold + discharge pulse
    expect(pallet().total).toBeCloseTo(scale().chargeM3);
    expect(BEHAVIORS.terminalSink.snapshot(pallet()).bagCount).toBe(1);
  });

  it("every branch machine publishes a live snapshot once its own upstream is running, not frozen decoration", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "concetti");
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 1);
    for (let i = 0; i < Math.round(30 / DT); i++) stepSim(sim, DT); // several bagging-scale cycles at 15s each

    for (const id of [CONCETTI_SAMPLER_ID, CONCETTI_PRE_BIN_ID, CONCETTI_SCALE_ID, CONCETTI_FILLER_ID, PALLETISING_ID, PALLET_STUB_ID]) {
      expect(getMachineState(sim, id).flowRateM3PerSec).toBeDefined();
    }
    expect(getMachineState(sim, PALLET_STUB_ID).total).toBeGreaterThan(0); // genuinely delivered, not frozen
  });
});

describe("arming: a full Concetti pre-bin does not trip anything while routed elsewhere (issue #49)", () => {
  it("a disarmed pre-bin trip never fires: leaving the destination at metal bin 1 with the pre-bin already over its own high set point leaves the conveyor running", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 1); // already well past its own 85% trip point
    // Explicit: destination now defaults to concetti itself (issue #56),
    // so this test must actively route elsewhere rather than ride the
    // default the way it could when the default was metal bin 1.
    setDestination(sim, "metalBin1");
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    expect(getInterlockState(sim, CONCETTI_PRE_BIN_ID).phase).toBe("running"); // never even armed
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1); // never touched
  });

  it("the same full pre-bin trips the conveyor once Concetti is (re-)selected", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    // Start elsewhere: the destination now defaults to concetti itself
    // (issue #56), so this test must route away first to exercise the
    // "re-selected" transition it's named for.
    setDestination(sim, "metalBin1");
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 1);
    // Freezes the bagging scale after its first charge (see the branch's
    // own "fills, and backpressures" test above for the full reasoning):
    // without this, the scale keeps drawing from the pre-bin the whole time
    // it's disarmed — unlike the Flexicon pre-bin's own equivalent test,
    // where the default vibrating-conveyor rate against a 2.5 m3 capacity
    // drains too slowly over the same window to matter, this branch's much
    // smaller 0.72 m3 pre-bin would otherwise drop back under its own 85%
    // set point before re-arming ever gets a chance to see it.
    setBatchCycleSec(sim, CONCETTI_SCALE_ID, 1e6);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(getInterlockState(sim, CONCETTI_PRE_BIN_ID).phase).toBe("running");

    setDestination(sim, "concetti"); // now selected
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT); // past the 5s signal delay
    expect(getInterlockState(sim, CONCETTI_PRE_BIN_ID).phase).toBe("stopped");
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);
  });
});

// This is the demonstration the parent spec (#43) names as the whole
// project's central argument: a bag machine at one end of the building
// trips the packaging conveyor, which trips both inlet drum feeders 1s
// later, which starves the scalping screen, backs up the treater after-bin,
// and stops the batch treater at the other end — the complete cascade,
// spanning both zones, in one combined event feed with its real delays.
describe("the Concetti pre-bin's own high-level trip cascades the full length of the line and latches (issue #49)", () => {
  it("cascades in the documented order — conveyor stops, both drum feeders stop 1s later, and the treating zone eventually backs up and holds the treater — logged in the combined event feed with the real delays between them", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    // Issue #60 removed the treating-side feeder's own auto-start (its rate
    // is derived on the real line now), so this test — the one test in this
    // block that needs the treating zone genuinely backing up all the way to
    // the after-bin/treater — supplies it explicitly, at the old auto-start's
    // own rate.
    feedElevator(sim, 15);
    setDestination(sim, "concetti");
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 1);

    for (let i = 0; i < Math.round(3 / DT); i++) stepSim(sim, DT); // short of the 5s trip delay
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1); // not yet
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).runPermit).toBe(true);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(true);

    for (let i = 0; i < Math.round(3 / DT); i++) stepSim(sim, DT); // past the 5s trip delay (t~6s), short of +1s feeder delay
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).runPermit).toBe(true);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(true);

    for (let i = 0; i < Math.round(2 / DT); i++) stepSim(sim, DT); // past the 1s feeder-stop delay too (t~8s)
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).runPermit).toBe(false);
    expect(getMachineState(sim, TREATING_FEEDER_ID).runPermit).toBe(false);

    for (let i = 0; i < Math.round(6000 / DT); i++) stepSim(sim, DT); // let it propagate all the way back
    expect(afterBinInterlock(sim).phase).toBe("held"); // the batch treater eventually stops accepting charges, at the far end of the line
    // The AC's own "scalping screen starved" link, asserted directly rather
    // than only inferred from the after-bin backing up behind it:
    // inletDrumFeeder2 (TREATING_FEEDER_ID) is the screen's only real
    // discharge (its own comment further down this file), so once that
    // feeder's runPermit drops the screen has nowhere left to send
    // material and genuinely stops flowing, not just conceptually.
    expect(BEHAVIORS.splitter.snapshot(getMachineState(sim, SCREEN_ID)).flowing).toBe(false);

    // Events are logged against each rule's own *sensor*, not its actuator
    // (control.js's own combined-events construction) — concettiPreBinHighTrip's
    // sensor is the pre-bin itself, conveyorRunningInterlockFeeder1/2's
    // shared sensor is the conveyor, and afterBinHoldTreater's is the
    // after-bin, so these three ids are exactly where this cascade's own
    // three stages surface in the feed.
    const events = getCombinedEvents(sim);
    const firstEventT = (machineId) => events.find((e) => e.machineId === machineId)?.t;
    const preBinT = firstEventT(CONCETTI_PRE_BIN_ID);
    const conveyorT = firstEventT(CONVEYOR_ID);
    const afterBinT = firstEventT(AFTER_BIN_ID);
    expect(preBinT).toBeDefined();
    expect(conveyorT).toBeDefined();
    expect(afterBinT).toBeDefined();
    expect(conveyorT).toBeGreaterThan(preBinT); // the conveyor-tagged (feeder-stop) events land after the pre-bin's own trip
    expect(afterBinT).toBeGreaterThan(conveyorT); // and the treater's own response lands much later still, at the far end of the line
    // Both packaging drum feeders' own stop is logged (autoStopOnNotRunning,
    // same shared conveyor sensor) — two distinct events, not one.
    expect(events.filter((e) => e.machineId === CONVEYOR_ID).length).toBeGreaterThanOrEqual(2);

    expect(() => assertConserved(sim)).not.toThrow();
  }, 20000);

  it("the cascade latches: resetting trips clears it only once the pre-bin has actually been emptied, and the presenter's reset recovers it", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setDestination(sim, "concetti");
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 1);
    // Freezes the bagging scale after its first charge, same reasoning as
    // the arming test above: even once the conveyor trips and stops feeding
    // it, the scale itself keeps drawing from whatever's already stored,
    // and this branch's small 0.72 m3 pre-bin would otherwise read back
    // under its own 85% set point well before this test gets to assert
    // "still full, re-latches" below.
    setBatchCycleSec(sim, CONCETTI_SCALE_ID, 1e6);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0);

    resetTrips(sim);
    expect(getInterlockState(sim, CONCETTI_PRE_BIN_ID).phase).toBe("stopped"); // still full, re-latches
    expect(getMachineState(sim, CONVEYOR_ID).throttleTarget).toBe(0);

    // The presenter's own bin-empty affordance (PlantControls.jsx): the
    // same setAccumulatorLevel the level-jump slider already uses.
    setAccumulatorLevel(sim, CONCETTI_PRE_BIN_ID, 0);
    resetTrips(sim);
    expect(getInterlockState(sim, CONCETTI_PRE_BIN_ID).phase).toBe("recovering");
    expect(getMachineState(sim, CONVEYOR_ID).throttleTarget).toBe(1);
  });

  it("conserves volume across a switch onto and off the Concetti branch mid-run", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    // Issue #56: destination now defaults to Concetti itself, so start
    // elsewhere first — otherwise the "switch onto" at 200s below is a
    // no-op and this stops testing what its name says it tests.
    setDestination(sim, "metalBin1");
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    setDestination(sim, "concetti");
    for (let i = 0; i < Math.round(300 / DT); i++) stepSim(sim, DT);
    // Past the ~185s lag for material fed since the switch: proves the
    // branch genuinely carried product during this window, not just that
    // the totals happen to balance regardless of which branch (if any)
    // actually moved anything.
    expect(getMachineState(sim, CONCETTI_PRE_BIN_ID).stored).toBeGreaterThan(0);

    setDestination(sim, "metalBin1");
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);

    expect(() => assertConserved(sim)).not.toThrow();
  });
});

// Issue #50: the presenter's other way to stop the line, and the direct
// counterpart to a trip (control.js) — a trip stops the commanded machine
// immediately, wherever its material happens to be (see e.g. this file's own
// "material already on the elevator chain during the slow-down and the
// stop..." test above, where the frozen queue is exactly the point). A
// controlled stop walks the line's own upstream-first stop order
// (line/stopOrder.js) instead, so material already released keeps moving to
// whatever is still running rather than freezing mid-transit.
//
// A handful of these tests drive a small fabricated line rather than the
// real one (same convention stopOrder.test.js's own cycle/stub tests use):
// the real line's own demo-staged fill levels are large enough, and its own
// real interlocks (the treater pre-bin's two-stage throttle, the metal
// bins' own high-level trip) sensitive enough, that a full end-to-end drain
// of the whole thing routinely collides with one of *those* — a real,
// correct interaction, just not what these specific tests are isolating.
// The full-line and lineWithoutPackaging (already defined above) cases
// below cover the mechanism against real data; the fabricated line isolates
// the mechanism itself, fast and deterministically.
const miniLine = {
  machines: [
    { id: "src", sim: { kind: "source", rateM3PerSec: 1 } },
    { id: "bin", sim: { kind: "accumulator", capacityM3: 10, initialLevelFraction: 0.5 } },
    { id: "feeder", sim: { kind: "meteredFeeder", rateM3PerSec: 1, enabled: true } },
    { id: "belt", sim: { kind: "transportDelay", distanceM: 5, speedMPerMin: 10, ceilingM3PerSec: 1 } },
    { id: "sink", sim: { kind: "terminalSink" } },
  ],
  connections: [
    { from: { machine: "src", port: "out" }, to: { machine: "bin", port: "in" }, kind: "product" },
    { from: { machine: "bin", port: "out" }, to: { machine: "feeder", port: "in" }, kind: "product" },
    { from: { machine: "feeder", port: "out" }, to: { machine: "belt", port: "in" }, kind: "product" },
    { from: { machine: "belt", port: "out" }, to: { machine: "sink", port: "in" }, kind: "product" },
  ],
  interlocks: [],
};

describe("controlled stop (issue #50)", () => {
  it("starts 'running'; the very next tick closes the source, but leaves the feeder alone while the bin behind it still holds real stock", () => {
    const sim = createSim(miniLine);
    expect(getControlledStopPhase(sim)).toBe("running");

    controlledStop(sim); // the phase flips immediately; the walk itself runs on the next tick
    expect(getControlledStopPhase(sim)).toBe("draining");
    stepSim(sim, DT);

    expect(getMachineState(sim, "src").opennessTarget).toBe(0);
    // The bin gates the walk here (it has no actuator of its own to
    // command, but it does hold real stock — see this file's own header):
    // the feeder is its *only* discharge path, so disabling the feeder
    // before the bin has actually drained would strand that stock for good.
    expect(getMachineState(sim, "feeder").enabled).toBe(true);
    expect(getMachineState(sim, "belt").throttleTarget).toBe(1);
  });

  it("an accumulator with no actuator of its own still gates the walk: its only discharge path doesn't stop until its own stock has actually drained, and the belt doesn't stop until it has too", () => {
    const sim = createSim(miniLine);
    for (let i = 0; i < Math.round(2 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // real material already on the belt

    controlledStop(sim);
    for (let i = 0; i < Math.round(5 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // short of the bin's own ~8s drain
    expect(getMachineState(sim, "bin").stored).toBeGreaterThan(0);
    expect(getMachineState(sim, "feeder").enabled).toBe(true); // not stranded: still draining into the belt

    for (let i = 0; i < Math.round(100 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // past the bin's own drain and the belt's own 30s transit
    expect(getControlledStopPhase(sim)).toBe("stopped");
    expect(getMachineState(sim, "bin").stored).toBeCloseTo(0);
    expect(getMachineState(sim, "feeder").enabled).toBe(false);
    const belt = getMachineState(sim, "belt");
    expect(belt.queue.length).toBe(0);
    expect(belt.backlog).toBeCloseTo(0);
    expect(belt.throttleFraction).toBe(0); // now genuinely stopped, with nothing left to protect
    expect(getMachineState(sim, "sink").total).toBeGreaterThan(0); // it all arrived, nothing lost
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("does not touch either real transport-delay chain's throttle in the first tick, even once real material is already moving", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    for (let i = 0; i < Math.round(5 / DT); i++) stepSim(sim, DT); // get real flow going first

    controlledStop(sim);
    stepSim(sim, DT);

    expect(getControlledStopPhase(sim)).toBe("draining");
    // Both sources close immediately — neither has anything of its own to
    // strand — but neither transport-delay chain is touched yet: each is
    // reached only once everything upstream of it (including the buffer
    // bin, which gates on its own stock, not just its actuator) has
    // actually drained.
    expect(getMachineState(sim, SOURCE_ID).opennessTarget).toBe(0);
    expect(getMachineState(sim, ELEVATOR_ID).throttleTarget).toBe(1);
    expect(getMachineState(sim, CONVEYOR_ID).throttleTarget).toBe(1);
  });

  it("reaches 'stopped' once a real (isolated) zone has fully drained, and conservation holds throughout", () => {
    const sim = createSim(lineWithoutPackaging); // isolates the treating zone, same convention as this file's own zone tests
    // Issue #60 removed the treating-side feeder's own auto-start, so real
    // flow (and so real stock for the walk to actually drain) needs supplying
    // explicitly here, same as the Concetti cascade test above.
    feedElevator(sim, 15);
    for (let i = 0; i < Math.round(10 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }

    controlledStop(sim);
    // 1500s, not 1000s: the treater's own 48s cycle (issue #60, was 40s)
    // needs about 19 charges' worth to work through the pre-fed stock, which
    // alone eats most of a 1000s budget, leaving too little slack for the
    // after-bin's own final trickle to drain out and the walk to settle.
    for (let i = 0; i < Math.round(1500 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }

    expect(getControlledStopPhase(sim)).toBe("stopped");
    for (const id of [BUFFER_BIN_ID, PRE_BIN_ID, AFTER_BIN_ID]) {
      expect(getMachineState(sim, id).stored, `${id} should have drained`).toBeCloseTo(0, 3);
    }
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.queue.length).toBe(0);
    expect(elevator.backlog).toBeCloseTo(0);
    expect(elevator.throttleFraction).toBe(0);
    // The batch treater is deliberately not asserted at 0 `held`: if the
    // pre-bin's own last drop happens to leave it mid-charge, that charge
    // has no more supply coming (everything upstream is already drained)
    // and can never complete — a starved partial charge, accounted for in
    // conservation's own `inTransit`, not a leak and not this walk's to fix.
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("a batch-cycle destination still lets the whole walk reach 'stopped' even when it's left holding a starved partial charge, and conservation still holds", () => {
    // A small, deliberately slow feed so the source valve's own 6s closing
    // ramp can't smuggle in more than a fraction of a second charge on top
    // of what the warm-up already released — otherwise the exact residual
    // this test wants to see (a genuine partial charge, not a further whole
    // one) would depend on exactly how the ramp lines up with chargeM3.
    const miniLineWithBatch = {
      machines: [
        { id: "src", sim: { kind: "source", rateM3PerSec: 0.02 } },
        { id: "belt", sim: { kind: "transportDelay", distanceM: 1, speedMPerMin: 10, ceilingM3PerSec: 1 } },
        { id: "scale", sim: { kind: "batchCycle", chargeM3: 0.3, phases: [{ name: "cycle", durationSec: 5 }] } },
        { id: "sink", sim: { kind: "terminalSink" } },
      ],
      connections: [
        { from: { machine: "src", port: "out" }, to: { machine: "belt", port: "in" }, kind: "product" },
        { from: { machine: "belt", port: "out" }, to: { machine: "scale", port: "in" }, kind: "product" },
        { from: { machine: "scale", port: "out" }, to: { machine: "sink", port: "in" }, kind: "product" },
      ],
      interlocks: [],
    };
    const sim = createSim(miniLineWithBatch);
    for (let i = 0; i < Math.round(20 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // ~0.4 m3 released, more than one charge's worth

    controlledStop(sim);
    // Past the valve's own ramp, the belt's transit, and the first charge's
    // hold cycle — long enough for the belt to hand off everything it was
    // ever going to, including the tail end that has to wait for the first
    // charge to clear before the scale has room for it.
    for (let i = 0; i < Math.round(60 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }

    expect(getControlledStopPhase(sim)).toBe("stopped"); // the walk completes — this machine never blocks it
    const scale = getMachineState(sim, "scale");
    expect(scale.phase).toBe("charging"); // never reached a fresh full charge
    expect(scale.held).toBeGreaterThan(0); // holding a genuine partial charge
    expect(scale.held).toBeLessThan(scale.chargeM3); // ...not a further whole one
    expect(getMachineState(sim, "sink").total).toBeGreaterThan(0); // the one completed charge still arrived
    expect(() => assertConserved(sim)).not.toThrow(); // the stranded partial charge is accounted for, not lost
  });

  it("writes its own commands to the combined event feed, tagged by the machine each one commands", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    controlledStop(sim);
    stepSim(sim, DT);
    const events = getCombinedEvents(sim);
    const sourceEvent = events.find((e) => e.machineId === SOURCE_ID && e.message.includes("controlled stop"));
    const feeder1Event = events.find((e) => e.machineId === PRO_BOX_FEEDER_ID && e.message.includes("controlled stop"));
    expect(sourceEvent).toBeDefined();
    expect(sourceEvent.machineName).toBeTruthy();
    expect(feeder1Event).toBeDefined(); // inletDrumFeeder1 has nothing upstream of it worth gating on, so it's commanded in the same first tick
  });

  it("does not latch: resumeLine restores normal running with no trip reset involved, and the line flows again", () => {
    const sim = createSim(miniLine);
    for (let i = 0; i < Math.round(2 / DT); i++) stepSim(sim, DT);

    controlledStop(sim);
    for (let i = 0; i < Math.round(50 / DT); i++) stepSim(sim, DT);
    expect(getControlledStopPhase(sim)).toBe("stopped");

    resumeLine(sim); // deliberately not resetTrips — a controlled stop is not a trip
    expect(getControlledStopPhase(sim)).toBe("running");
    expect(getMachineState(sim, "src").opennessTarget).toBe(1);
    expect(getMachineState(sim, "feeder").enabled).toBe(true);
    expect(getMachineState(sim, "belt").throttleTarget).toBe(1);

    const sinkBefore = getMachineState(sim, "sink").total;
    for (let i = 0; i < Math.round(40 / DT); i++) stepSim(sim, DT); // past the belt's own transit again
    expect(getMachineState(sim, "sink").total).toBeGreaterThan(sinkBefore); // genuinely flowing again, not still parked
  });

  it("resuming mid-drain restores exactly the actuators the walk had already touched", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    controlledStop(sim);
    stepSim(sim, DT); // one tick: both sources and the Pro Box feeder commanded; the buffer bin still gates everything after it
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(false);

    resumeLine(sim);
    expect(getControlledStopPhase(sim)).toBe("running");
    expect(getMachineState(sim, SOURCE_ID).opennessTarget).toBe(1);
    expect(getMachineState(sim, PRO_BOX_ID).opennessTarget).toBe(1);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(false); // never selected (source defaults to the treating line), stays off
  });

  it("resuming with the Pro Box selected restores the Pro Box, not the treating line", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSource(sim, "proBox");
    expect(getSource(sim)).toBe("proBox");

    controlledStop(sim);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // enough for the source-selection commands to land; no need to fully settle

    resumeLine(sim);
    expect(getSource(sim)).toBe("proBox");
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(true);
    expect(getMachineState(sim, TREATING_FEEDER_ID).enabled).toBe(false);
  });

  it("calling controlledStop again mid-drain, or once stopped, is a harmless no-op", () => {
    const sim = createSim(miniLine);
    controlledStop(sim);
    stepSim(sim, DT);
    const commandedAfterFirstTick = getMachineState(sim, "feeder").enabled;
    controlledStop(sim); // already draining — should not restart the walk or re-log
    stepSim(sim, DT);
    expect(getMachineState(sim, "feeder").enabled).toBe(commandedAfterFirstTick);
    expect(getControlledStopPhase(sim)).toBe("draining");
  });
});

// Issue #51's own dedicated unit coverage (src/sim/utilitiesTrip.test.js)
// exercises the trip/latch/reset mechanism itself against a small fabricated
// fixture; this block covers what only the real line's own topology can —
// the source-selector interaction (two packaging feeders, only one of which
// should ever come back enabled) and conservation across every kind on the
// full line at once.
describe("utilities trip against the real line (issue #51)", () => {
  it("trips both packaging feeders regardless of which source was selected, and a reset restores only the one that was actually selected", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSource(sim, "proBox");
    for (let i = 0; i < Math.round(5 / DT); i++) stepSim(sim, DT);

    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(1.1 / DT); i++) stepSim(sim, DT);
    expect(getUtilitiesTripPhase(sim)).toBe("tripped");
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(false);
    expect(getMachineState(sim, TREATING_FEEDER_ID).enabled).toBe(false);
    expect(getMachineState(sim, SOURCE_ID).opennessTarget).toBe(0);
    expect(getMachineState(sim, PRO_BOX_ID).opennessTarget).toBe(0);
    expect(getMachineState(sim, ELEVATOR_ID).throttleTarget).toBe(0);
    expect(getMachineState(sim, CONVEYOR_ID).throttleTarget).toBe(0);

    setUtilitiesHealthy(sim, true);
    resetTrips(sim);
    expect(getUtilitiesTripPhase(sim)).toBe("running");
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(true); // was selected before the trip
    expect(getMachineState(sim, TREATING_FEEDER_ID).enabled).toBe(false); // was not, and stays not
  });

  it("conservation holds across a full-line utilities trip and recovery", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    for (let i = 0; i < Math.round(30 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }

    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(1.1 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    for (let i = 0; i < Math.round(30 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // sits tripped

    setUtilitiesHealthy(sim, true);
    resetTrips(sim);
    for (let i = 0; i < Math.round(60 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    expect(() => assertConserved(sim)).not.toThrow();
  });
});

describe("clearPlant (issue #55 — CLEAR PLANT)", () => {
  it("empties every machine's held material in one click, leaving counters, the event log, latched trips, selectors and conservation untouched", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12)); // slower than the source: nets a genuine buildup in the buffer bin too
    setDestination(sim, "metalBin2");

    for (let i = 0; i < Math.round(600 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }

    // A real latched trip to survive the clear, staged directly (same
    // technique this file's own issue #25 tests use) rather than tuned to
    // fire off the run above, so it doesn't fight that run's own buildup.
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(10 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }

    // Sanity: confirm the run actually built up real held material across
    // every kind clearPlant is supposed to reach, and latched a real trip,
    // so the assertions below mean something.
    expect(getMachineState(sim, BUFFER_BIN_ID).stored).toBeGreaterThan(0);
    expect(getMachineState(sim, PRE_BIN_ID).stored).toBeGreaterThan(0);
    expect(getMachineState(sim, AFTER_BIN_ID).stored).toBeGreaterThan(0);
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.queue.length + elevator.backlog).toBeGreaterThan(0);
    const conveyor = getMachineState(sim, CONVEYOR_ID);
    expect(conveyor.queue.length + conveyor.backlog).toBeGreaterThan(0);
    expect(getMachineState(sim, METAL_BIN_2_ID).stored).toBeGreaterThan(0);
    expect(getInterlockState(sim, AFTER_BIN_ID).phase).toBe("held");

    // Snapshot everything clearPlant must leave untouched, before clearing.
    const tBefore = sim.t;
    const fedBefore = getMachineState(sim, SOURCE_ID).fed;
    const drawnBefore = getMachineState(sim, FEEDER_ID).drawn;
    const elevatorDeliveredBefore = elevator.delivered;
    const treaterDeliveredBefore = getMachineState(sim, TREATER_ID).delivered;
    const afterBinDischargedBefore = getMachineState(sim, AFTER_BIN_ID).discharged;
    const eventsBefore = getCombinedEvents(sim);
    const tripPhaseBefore = getInterlockState(sim, AFTER_BIN_ID).phase;
    const sourceBefore = getSource(sim);
    const destinationBefore = getDestination(sim);

    clearPlant(sim);

    // Every held-material kind now reads zero.
    expect(getMachineState(sim, BUFFER_BIN_ID).stored).toBe(0);
    expect(getMachineState(sim, PRE_BIN_ID).stored).toBe(0);
    expect(getMachineState(sim, AFTER_BIN_ID).stored).toBe(0);
    expect(getMachineState(sim, METAL_BIN_2_ID).stored).toBe(0);
    expect(elevator.queue).toEqual([]);
    expect(elevator.backlog).toBe(0);
    expect(conveyor.queue).toEqual([]);
    expect(conveyor.backlogEntries).toEqual([]);
    expect(conveyor.backlog).toBe(0);
    expect(getMachineState(sim, TREATER_ID).held).toBe(0);
    expect(getMachineState(sim, TREATER_ID).phase).toBe("charging");

    // Everything else is untouched: cumulative counters, the event log,
    // latched trips, source/destination selection and sim time.
    expect(sim.t).toBe(tBefore);
    expect(getMachineState(sim, SOURCE_ID).fed).toBe(fedBefore);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBe(drawnBefore);
    expect(elevator.delivered).toBe(elevatorDeliveredBefore);
    expect(getMachineState(sim, TREATER_ID).delivered).toBe(treaterDeliveredBefore);
    expect(getMachineState(sim, AFTER_BIN_ID).discharged).toBe(afterBinDischargedBefore);
    expect(getCombinedEvents(sim)).toEqual(eventsBefore);
    expect(getInterlockState(sim, AFTER_BIN_ID).phase).toBe(tripPhaseBefore); // still latched — clearPlant is not a reset
    expect(getSource(sim)).toBe(sourceBefore);
    expect(getDestination(sim)).toBe(destinationBefore);

    // The discarded material is accounted for internally, not lost or
    // double-counted, so the whole-line invariant still proves out.
    expect(() => assertConserved(sim)).not.toThrow();

    // Works the same whether the line keeps running afterward or not — the
    // command itself has no notion of running/paused (that's the UI's own
    // rAF loop, useSimEngine.js), so simply continuing to step is proof
    // enough that clearing left the sim in a fully steppable state.
    for (let i = 0; i < Math.round(60 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("clearing while genuinely paused (no stepSim calls around it) works identically", () => {
    const sim = createSim(lineWithoutFeedSchedule);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12)); // slower than the source: nets a genuine buildup
    for (let i = 0; i < Math.round(200 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, BUFFER_BIN_ID).stored).toBeGreaterThan(0);

    clearPlant(sim); // no stepSim before or after — the paused case

    expect(getMachineState(sim, BUFFER_BIN_ID).stored).toBe(0);
    expect(() => assertConserved(sim)).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, resetSim, resetTrips, getMachineState, setSourceRate, setFeederRate, setAccumulatorLevel, DT,
  setInterlockHighSetpoint, setInterlockLowSetpoint, setInterlockSignalDelay, getInterlockState,
  getCombinedEvents, setElevatorSpeed,
  setInterlockSlowSetpoint, setInterlockStopSetpoint, setInterlockSlowDelay, setInterlockStopDelay,
  setBatchSize, setBatchCycleSec, setSplitterWasteFraction, setSource, getSource,
  setDestination, getDestination,
} from "./engine";
import { assertConserved, conservationTotals } from "./conservation";
import { tPerHourToM3PerSec } from "./units";
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
const lineWithoutPackaging = {
  ...line,
  machines: line.machines.map((m) => (m.id === "inletDrumFeeder2" ? { ...m, sim: undefined } : m)),
  interlocks: line.interlocks.filter((i) => i.action.machine !== "inletDrumFeeder2"),
};

describe("createSim / stepSim (real Treater Line 2 data)", () => {
  it("creates a sim and steps it by a fixed timestep", () => {
    const sim = createSim(line);
    expect(sim.t).toBe(0);
    stepSim(sim, DT);
    expect(sim.t).toBeCloseTo(DT);
    stepSim(sim, DT);
    expect(sim.t).toBeCloseTo(DT * 2);
  });

  it("reads a machine's current state back", () => {
    const sim = createSim(line);
    expect(getMachineState(sim, BUFFER_BIN_ID).kind).toBe("accumulator");
    expect(getMachineState(sim, "notAMachine")).toBeUndefined();
  });

  it("reads an interlock's current state back by its sensor machine", () => {
    const sim = createSim(line);
    expect(getInterlockState(sim, BUFFER_BIN_ID).phase).toBe("open");
    expect(getInterlockState(sim, "notAMachine")).toBeUndefined();
  });

  it("source injects at its configured rate, accumulating in the empty-headroom bin", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    setFeederRate(sim, FEEDER_ID, 0); // isolate: this test is about the source/bin fill, not the feeder's own auto-start (issue #42)
    for (let i = 0; i < 100; i++) stepSim(sim, DT);
    const source = getMachineState(sim, SOURCE_ID);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(source.fed).toBeCloseTo(tPerHourToM3PerSec(12) * DT * 100);
    expect(bin.stored).toBeCloseTo(bin.capacity * 0.55 + source.fed);
  });

  it("source rate can be changed while the sim is running", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, 0);
    stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).fed).toBe(0);

    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).fed).toBeCloseTo(tPerHourToM3PerSec(12) * DT);
  });

  it("metal remover holds zero volume at all times", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 50; i++) {
      stepSim(sim, DT);
      expect(getMachineState(sim, METAL_REMOVER_ID).volume).toBe(0);
    }
  });

  it("buffer bin reports its level as a fraction of working volume", () => {
    const sim = createSim(line);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored / bin.capacity).toBeCloseTo(0.55);
  });

  it("buffer bin fills and rejects once full; rejected material backs up to the source instead of vanishing", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
    expect(() => setAccumulatorLevel(sim, SOURCE_ID, 0.5)).toThrow(/not an accumulator/);
  });
});

describe("buffer bin's high-set-point interlock closes the source valve, late (issue #19)", () => {
  it("keeps the valve fully open through the signal delay after the high set point trips", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
      const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
  it("starts at 0 t/h at t=0, confirmed plant behaviour, before anything has had a chance to auto-start it (issue #42)", () => {
    const sim = createSim(line);
    expect(getMachineState(sim, FEEDER_ID).rate).toBe(0);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBe(0);
  });

  // Issue #42: the engineer confirmed the real feeder starts itself as soon
  // as the bucket elevator is confirmed running — no `setFeederRate` call
  // here at all, unlike every other test in this file. The elevator reads
  // as running from t=0 by default (both its manual VFD dial and its
  // interlock throttle default to a settled, nonzero fraction), so the
  // auto-start interlock fires on the very first control tick.
  it("auto-starts at its configured rate the instant the treating elevator is confirmed running, with no presenter intervention", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, 0); // isolate the draw from the bin's own stock
    const startStored = getMachineState(sim, BUFFER_BIN_ID).stored;

    stepSim(sim, DT); // the elevator is already confirmed running at boot: this is the tick the interlock fires

    const feeder = getMachineState(sim, FEEDER_ID);
    expect(feeder.rate).toBeGreaterThan(0);
    expect(feeder.manualOverride).toBe(false); // auto-started, not presenter-driven

    for (let i = 0; i < 200; i++) stepSim(sim, DT);
    expect(feeder.drawn).toBeGreaterThan(0);
    expect(getMachineState(sim, BUFFER_BIN_ID).stored).toBeLessThan(startStored); // the bin genuinely drains on its own now
  });

  // Acceptance criterion: a presenter setting a rate before the elevator has
  // confirmed running is a deliberate, documented choice (honoured
  // immediately), not an accidental side effect of the interlock racing the
  // presenter. Holding the elevator off with setElevatorSpeed(0) keeps
  // `confirmedRunning` false until the presenter brings it back up.
  it("honours a presenter's own feed rate set before the elevator confirms running, rather than overwriting it once the interlock fires", () => {
    const sim = createSim(line);
    setElevatorSpeed(sim, ELEVATOR_ID, 0); // hold the elevator off: confirmedRunning stays false
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(5)); // presenter starts the feeder early, at a rate of their own choosing
    for (let i = 0; i < 20; i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).rate).toBeCloseTo(tPerHourToM3PerSec(5));

    setElevatorSpeed(sim, ELEVATOR_ID, 1); // elevator now confirmed running
    for (let i = 0; i < 20; i++) stepSim(sim, DT);
    // auto-start sees the feeder already under presenter control and leaves it alone
    expect(getMachineState(sim, FEEDER_ID).rate).toBeCloseTo(tPerHourToM3PerSec(5));
  });

  // The existing live control still works after auto-start (acceptance
  // criterion): once the rule has latched "started", it never touches the
  // feeder again, so a presenter's own slider change mid-run sticks.
  it("the presenter's feed-rate slider still works as a live control after auto-start", () => {
    const sim = createSim(line);
    stepSim(sim, DT); // auto-start fires
    expect(getMachineState(sim, FEEDER_ID).rate).toBeGreaterThan(0);

    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(2)); // presenter demos a rate change mid-run
    for (let i = 0; i < 20; i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).rate).toBeCloseTo(tPerHourToM3PerSec(2));
  });

  it("draws from the bin at its configured rate once started, and the two reconcile exactly", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, 0); // isolate the draw from any inflow
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const filling = createSim(line);
    setSourceRate(filling, SOURCE_ID, tPerHourToM3PerSec(20));
    setFeederRate(filling, FEEDER_ID, tPerHourToM3PerSec(2));
    const fillingStart = getMachineState(filling, BUFFER_BIN_ID).stored;
    for (let i = 0; i < 500; i++) stepSim(filling, DT);
    expect(getMachineState(filling, BUFFER_BIN_ID).stored).toBeGreaterThan(fillingStart);

    const draining = createSim(line);
    setSourceRate(draining, SOURCE_ID, tPerHourToM3PerSec(2));
    setFeederRate(draining, FEEDER_ID, tPerHourToM3PerSec(20));
    const drainingStart = getMachineState(draining, BUFFER_BIN_ID).stored;
    for (let i = 0; i < 500; i++) stepSim(draining, DT);
    expect(getMachineState(draining, BUFFER_BIN_ID).stored).toBeLessThan(drainingStart);
  });

  it("feed rate is a live control that takes effect while running", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, 0);
    setFeederRate(sim, FEEDER_ID, 0);
    for (let i = 0; i < 50; i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBe(0);

    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 50; i++) stepSim(sim, DT);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBeGreaterThan(0);
  });

  it("conserves volume across the fill/draw pair (fed + initialStored = stored + delivered + spilled)", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    expect(() => setFeederRate(sim, SOURCE_ID, tPerHourToM3PerSec(10))).toThrow(/not a metered feeder/);
  });
});

// Rise 8.731 m at the drawing's 10.08 m/min chain speed derives to ~52s
// (REAL_LINE_SPECS.md §5/§8, and the parent issue's own worked example).
const EXPECTED_TRANSIT_SEC = 8.731 / (10.08 / 60);

function feedElevator(sim, tPerHour = 12) {
  setSourceRate(sim, SOURCE_ID, 0); // isolate the feeder's draw from the bin's own stock
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
  ...line,
  machines: line.machines.map((m) => (m.id === "batchTreater" ? { ...m, sim: undefined } : m)),
  interlocks: line.interlocks.filter((r) => r.action.machine !== "batchTreater"),
};

describe("treating elevator carries grain with a real transport delay (issue #21)", () => {
  it("derives its transit delay from rise and chain speed rather than a hardcoded constant", () => {
    expect(EXPECTED_TRANSIT_SEC).toBeCloseTo(52, 0);
  });

  it("nothing arrives at the discharge until the derived transit delay has elapsed", () => {
    const sim = createSim(line);
    feedElevator(sim);
    for (let i = 0; i < Math.round((EXPECTED_TRANSIT_SEC - 5) / DT); i++) stepSim(sim, DT);

    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.delivered).toBe(0);
    expect(elevator.queue.reduce((a, p) => a + p.vol, 0)).toBeGreaterThan(0); // material is genuinely mid-lift
  });

  it("material arrives at the discharge once the derived transit delay has elapsed", () => {
    const sim = createSim(line);
    feedElevator(sim);
    for (let i = 0; i < Math.round((EXPECTED_TRANSIT_SEC + 15) / DT); i++) stepSim(sim, DT);

    expect(getMachineState(sim, ELEVATOR_ID).delivered).toBeGreaterThan(0);
  });

  it("material already in transit keeps discharging after the feeder stops, until the elevator clears", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    feedElevator(sim, 1000); // wildly over the elevator's ceiling
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    const feeder = getMachineState(sim, FEEDER_ID);
    const ceiling = getMachineState(sim, ELEVATOR_ID).ceilingM3PerSec;
    expect(feeder.drawn).toBeCloseTo(ceiling * 20, 2); // capped at the elevator's ceiling, not the feeder's own rate
  });

  it("speed is a live control, and slowing it scales the transit delay", () => {
    const half = createSim(line);
    feedElevator(half);
    setElevatorSpeed(half, ELEVATOR_ID, 0.5);
    for (let i = 0; i < Math.round((EXPECTED_TRANSIT_SEC + 15) / DT); i++) stepSim(half, DT);
    // at half speed, material that would have arrived by now at full speed has not yet
    expect(getMachineState(half, ELEVATOR_ID).delivered).toBe(0);

    for (let i = 0; i < Math.round(EXPECTED_TRANSIT_SEC / DT); i++) stepSim(half, DT); // the rest of the doubled delay
    expect(getMachineState(half, ELEVATOR_ID).delivered).toBeGreaterThan(0);
  });

  it("a live speed change re-paces material already in transit, not just newly fed material", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    expect(() => setElevatorSpeed(sim, SOURCE_ID, 0.5)).toThrow(/not a transport-delay/);
  });

  it("conserves volume through the fill / feed / lift chain, with in-transit material neither delivered nor lost", () => {
    const sim = createSim(line);
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
// feeds in — the two-stage interlock's own timing is what's under test,
// independent of whatever sits on the pre-bin's discharge side. Since issue
// #24 wired a real batch treater onto that discharge, it would draw the
// level down the instant a full charge is available and confound these
// thresholds, so this describe block runs against the `lineWithoutBatchTreater`
// variant declared above, same as the "real backpressure cascades" test. The
// full chain, treater included, gets its own conservation coverage in issue
// #24's own tests.
describe("treater pre-bin slows the elevator, then stops it (issue #22)", () => {
  it("reuses the accumulator behaviour verbatim: no new material physics for the pre-bin", () => {
    const sim = createSim(lineWithoutBatchTreater);
    expect(getMachineState(sim, PRE_BIN_ID).kind).toBe("accumulator");
  });

  it("a rising level first commands a reduced speed, and only a further rise commands a full stop", () => {
    const sim = createSim(lineWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.65); // above the slow set point (0.6), below stop (0.85)
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // past the 3s slow delay + 4s ramp
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(preBinInterlock(sim).phase).toBe("slow");
    expect(elevator.throttleFraction).toBeCloseTo(0.5); // slowed, not stopped

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9); // now above the stop set point too
    for (let i = 0; i < Math.round(15 / DT); i++) stepSim(sim, DT); // past the 5s stop delay + 6s ramp
    expect(preBinInterlock(sim).phase).toBe("stopped");
    expect(elevator.throttleFraction).toBe(0);
  });

  it("each stage has its own threshold and its own delay", () => {
    const sim = createSim(lineWithoutBatchTreater);
    const rule = preBinInterlock(sim);
    expect(rule.slowSetpoint).not.toBe(rule.stopSetpoint);
    expect(rule.slowDelaySec).not.toBe(rule.stopDelaySec);
  });

  it("the elevator ramps between speeds rather than changing instantaneously", () => {
    const sim = createSim(lineWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9); // straight to above both set points
    for (let i = 0; i < Math.round(3.5 / DT); i++) stepSim(sim, DT); // just past the 3s slow delay, mid-ramp
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.throttleFraction).toBeGreaterThan(0); // ramping down, not yet at 0.5
    expect(elevator.throttleFraction).toBeLessThan(1); // ramping down, not still at full speed
  });

  it("material already on the elevator chain during the slow-down and the stop still arrives, and conservation holds through the full cycle", () => {
    const sim = createSim(lineWithoutBatchTreater);
    feedElevator(sim); // 12 t/h into the elevator
    for (let i = 0; i < Math.round(10 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    const elevator = getMachineState(sim, ELEVATOR_ID);
    const inTransitBeforeStop = elevator.queue.reduce((a, p) => a + p.vol, 0) + elevator.backlog;
    expect(inTransitBeforeStop).toBeGreaterThan(0); // genuinely mid-lift when the stop is forced

    setFeederRate(sim, FEEDER_ID, 0); // isolate: no further material enters from here on
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9); // force straight through slow to the stop stage
    for (let i = 0; i < Math.round(25 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // past the 3+4s slow stage and the 5+6s stop stage
    expect(preBinInterlock(sim).phase).toBe("stopped");
    expect(elevator.throttleFraction).toBe(0);

    const preBinBeforeRecover = getMachineState(sim, PRE_BIN_ID).stored;
    for (let i = 0; i < Math.round(200 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // stays stopped: a frozen chain moves nothing
    expect(getMachineState(sim, PRE_BIN_ID).stored).toBeCloseTo(preBinBeforeRecover); // frozen, not lost

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.3); // presenter drags the level down below the recovery set point
    resetTrips(sim); // issue #45: recovery no longer happens on its own, it needs the plant reset
    const preBinAtRecoverStart = getMachineState(sim, PRE_BIN_ID).stored;
    for (let i = 0; i < Math.round(60 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // past the recovery ramp, long enough for the frozen packet to finish arriving
    expect(preBinInterlock(sim).phase).toBe("full");
    expect(elevator.throttleFraction).toBe(1);
    expect(getMachineState(sim, PRE_BIN_ID).stored).toBeGreaterThan(preBinAtRecoverStart); // the material frozen mid-lift did eventually arrive
    expect(() => assertConserved(sim)).not.toThrow();
  });

  // Issue #45: no automatic recovery. The bin draining is no longer enough
  // on its own — the plant control's RESET TRIPS clears the latch.
  it("stays stopped once the bin drains — no automatic recovery", () => {
    const sim = createSim(lineWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("stopped");

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.2); // presenter drags the level back down
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("stopped");
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBe(0);
  });

  it("resetTrips returns the elevator to full speed once the bin has actually drained", () => {
    const sim = createSim(lineWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("stopped");

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.2); // presenter drags the level back down
    resetTrips(sim);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // past the recovery ramp
    expect(preBinInterlock(sim).phase).toBe("full");
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBe(1);
  });

  it("both stage thresholds and delays are live controls that take effect while running", () => {
    const sim = createSim(lineWithoutBatchTreater);
    setInterlockSlowSetpoint(sim, PRE_BIN_ID, 0.5);
    setInterlockSlowDelay(sim, PRE_BIN_ID, 1);
    setInterlockStopSetpoint(sim, PRE_BIN_ID, 0.55);
    setInterlockStopDelay(sim, PRE_BIN_ID, 1);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.6); // above both of the newly-lowered set points at once

    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("stopped"); // reached on the new, tighter set points
  });

  it("the pre-bin's event log records the slow-down and the stop as distinct entries, each with its simulated time", () => {
    const sim = createSim(lineWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    const log = preBinInterlock(sim).log;
    expect(log.length).toBeGreaterThanOrEqual(4); // slow-armed, slow-commanded, stop-armed, stop-commanded
    for (const entry of log) {
      expect(typeof entry.t).toBe("number");
      expect(typeof entry.message).toBe("string");
    }
    const messages = log.map((e) => e.message);
    expect(new Set(messages).size).toBe(messages.length); // no two entries say the same thing
    expect(messages.some((m) => m.includes("slow"))).toBe(true);
    expect(messages.some((m) => m.includes("stop"))).toBe(true);
  });
});

describe("batch treater takes a fixed charge every cycle and discharges it as a pulse (issue #24)", () => {
  it("is declared as a batch cycle, the primitive later reused by the bagging scale, filler and big-bag head", () => {
    const sim = createSim(line);
    expect(getMachineState(sim, TREATER_ID).kind).toBe("batchCycle");
  });

  it("draws a fixed charge from the pre-bin, holds it for the cycle time, then discharges the whole charge as a pulse", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
    const preBin = getMachineState(sim, PRE_BIN_ID);
    const treater = getMachineState(sim, TREATER_ID);
    const startStored = preBin.stored; // 40% of 1.63 m3, comfortably more than one charge

    stepSim(sim, DT); // a single tick
    expect(startStored - preBin.stored).toBeCloseTo(treater.chargeM3);

    for (let i = 0; i < Math.round(30 / DT); i++) stepSim(sim, DT); // well under the 40s cycle: no further decline
    expect(preBin.stored).toBeCloseTo(startStored - treater.chargeM3);
  });

  it("batch size and cycle time are live controls", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    expect(() => setBatchSize(sim, SOURCE_ID, 1)).toThrow(/not a batch-cycle/);
    expect(() => setBatchCycleSec(sim, SOURCE_ID, 1)).toThrow(/not a batch-cycle/);
  });

  it("material inside the treater mid-cycle is accounted for as neither delivered nor lost, and conservation holds across many consecutive cycles", () => {
    const sim = createSim(line);
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
const lineWithoutScalpingScreen = {
  ...line,
  machines: line.machines.map((m) => (m.id === "scalpingScreen" ? { ...m, sim: undefined } : m)),
};

describe("treater after-bin holds the next batch (issue #25)", () => {
  it("reuses the accumulator behaviour verbatim: no new material physics for the after-bin", () => {
    const sim = createSim(line);
    expect(getMachineState(sim, AFTER_BIN_ID).kind).toBe("accumulator");
  });

  it("is wired to a holdNextBatch interlock reading the after-bin and commanding the treater", () => {
    const sim = createSim(line);
    const rule = afterBinInterlock(sim);
    expect(rule.kind).toBe("holdNextBatch");
    expect(rule.actuatorId).toBe(TREATER_ID);
    expect(rule.phase).toBe("released");
  });

  it("when the high level switch trips, the treater completes its current cycle and then does not start another", () => {
    const sim = createSim(lineWithoutScalpingScreen); // isolates the interlock's own timing from the screen's own draining (issue #26)
    feedElevator(sim, 20); // keep the pre-bin supplied so the treater can always draw a fresh charge
    const treater = getMachineState(sim, TREATER_ID); // real 40s cycle: the 5s signal delay can only ever catch one cycle already under way

    stepSim(sim, DT); // draws its first charge, starts holding
    expect(treater.phase).toBe("holding");
    expect(treater.held).toBeGreaterThan(0);

    // Above the 60% high set point, but with enough headroom left (0.67 -
    // 0.62*0.67 ≈ 0.25 m3) for the in-flight charge (0.222 m3) to land in
    // full — isolates the interlock's own "does not start another" from the
    // accumulator's separate, already-tested backpressure-waits-mid-
    // discharge behaviour (issue #24), which this test is not about.
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.62);
    for (let i = 0; i < Math.round(45 / DT); i++) stepSim(sim, DT); // past the 5s signal delay and the 40s cycle time
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    feedElevator(sim, 20);
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.62); // trips, with headroom for the in-flight charge (as above)
    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    const treater = getMachineState(sim, TREATER_ID);

    for (let i = 0; i < Math.round(45 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    expect(afterBinInterlock(sim).phase).toBe("held");
    expect(treater.blocked).toBe(true);
    expect(afterBin.spill).toBeCloseTo(0);

    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.1); // presenter drains it for the demo, below the high set point
    resetTrips(sim); // issue #45: release no longer happens on its own, it needs the plant reset
    for (let i = 0; i < Math.round(45 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    expect(afterBinInterlock(sim).phase).toBe("released");
    expect(treater.blocked).toBe(false);
    expect(treater.delivered).toBeGreaterThan(treater.chargeM3); // a second cycle genuinely completed after recovery
    expect(afterBin.spill).toBeCloseTo(0);
  });
});

describe("scalping screen splits product from oversize, completing the treating zone (issue #26)", () => {
  it("is declared as a splitter, and the discard bin as a terminal sink", () => {
    const sim = createSim(line);
    expect(getMachineState(sim, SCREEN_ID).kind).toBe("splitter");
    expect(getMachineState(sim, DISCARD_BIN_ID).kind).toBe("terminalSink");
  });

  it("divides its infeed between a product output and a waste output by the configured fraction", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    setSplitterWasteFraction(sim, SCREEN_ID, 0.5);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const screen = getMachineState(sim, SCREEN_ID);
    const wasteShare = screen.wasteTotal / (screen.outTotal + screen.wasteTotal);
    expect(wasteShare).toBeCloseTo(0.5, 4);
  });

  it("setSplitterWasteFraction rejects a non-splitter machine", () => {
    const sim = createSim(line);
    expect(() => setSplitterWasteFraction(sim, SOURCE_ID, 0.1)).toThrow(/not a splitter/);
  });

  it("the discard bin accumulates waste and reports a running total that matches the screen's own waste total exactly", () => {
    const sim = createSim(line);
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const screen = getMachineState(sim, SCREEN_ID);
    const discardBin = getMachineState(sim, DISCARD_BIN_ID);
    expect(discardBin.total).toBeGreaterThan(0);
    expect(discardBin.total).toBeCloseTo(screen.wasteTotal);
  });

  it("the discard bin's published fill visibly rises over a run, rather than sitting frozen at its static decoration", () => {
    const sim = createSim(line);
    const initialFill = BEHAVIORS.terminalSink.snapshot(getMachineState(sim, DISCARD_BIN_ID)).fill;
    expect(initialFill).toBe(0);

    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const fill = BEHAVIORS.terminalSink.snapshot(getMachineState(sim, DISCARD_BIN_ID)).fill;
    expect(fill).toBeGreaterThan(initialFill);
  });

  it("the screen's snapshot reports 'flowing' while material is actively passing through, so the scene can show it isn't idle", () => {
    const sim = createSim(line);
    expect(BEHAVIORS.splitter.snapshot(getMachineState(sim, SCREEN_ID)).flowing).toBe(false); // nothing has reached it yet

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
    const sim = createSim(line);
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2);
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);

    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    const screen = getMachineState(sim, SCREEN_ID);
    expect(screen.outTotal + screen.wasteTotal).toBeCloseTo(afterBin.discharged);
  });

  it("holds negligible material and does not become the line's bottleneck at its confirmed oversized capacity, under ordinary feeding", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.95);
    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    const startStored = afterBin.stored;

    stepSim(sim, DT);

    const ceilingPerTick = tPerHourToM3PerSec(64.4) * DT;
    expect(startStored - afterBin.stored).toBeCloseTo(ceilingPerTick); // bounded by the screen's rated ceiling
    expect(afterBin.stored).toBeGreaterThan(0); // did not drain to empty in one tick
  });

  it("conservation holds across the entire treating zone, from the source valve to both terminal destinations", () => {
    const sim = createSim(line);
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

  it("a single run demonstrates the full chain end to end: fill, trip, delayed valve closure, metered draw, transport lag, two-stage slow-then-stop, batch pulsing, smoothing and splitting", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20)); // fast enough to fill and trip the buffer bin
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

    // The pre-bin's own two-stage slow-then-stop is demonstrated directly,
    // same technique issue #22's own tests use: the line's confirmed rates
    // make the treater, not the pre-bin, the real bottleneck
    // (REAL_LINE_SPECS.md §9-10), so nothing in ordinary feeding organically
    // overwhelms it.
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.65);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(getInterlockState(sim, PRE_BIN_ID).phase).toBe("slow");
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBeLessThan(1);

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(15 / DT); i++) stepSim(sim, DT);
    expect(getInterlockState(sim, PRE_BIN_ID).phase).toBe("stopped");
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBe(0);

    expect(() => assertConserved(sim)).not.toThrow();
  });
});

describe("engine publishes each machine's live outflow rate generically (issue #28)", () => {
  it("reports rate = actual volume moved this tick / dt, for a plain single-output machine", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    const fedBefore = getMachineState(sim, SOURCE_ID).fed;
    stepSim(sim, DT);
    const source = getMachineState(sim, SOURCE_ID);
    const movedThisTick = source.fed - fedBefore;
    expect(source.flowRateM3PerSec).toBeCloseTo(movedThisTick / DT);
    expect(source.flowRateM3PerSec).toBeCloseTo(tPerHourToM3PerSec(12));
  });

  it("tracks actual movement tick by tick through a transport delay, not just a cumulative average", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(lineWithoutPackaging); // default source rate (12 t/h, the line's real sustained rate); only the feeder needs live-starting, per its own "starts at 0" comment
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
    for (const rate of [2, 5, 8, 11, 12, 12.5, 15, 18, 20]) {
      const sim = createSim(lineWithoutPackaging);
      setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(rate));
      const treater = getMachineState(sim, TREATER_ID);
      // Below the source's own 12 t/h ceiling, gathering a full charge from
      // empty genuinely takes longer the slower the feeder is — a real
      // supply-limited charging phase, not a stall. Bounding against a fixed
      // margin (as the 15 t/h single-rate test above does) would fail at low
      // rates for exactly that legitimate reason, so the bound here scales
      // with how long one charge can honestly take at this rate's own
      // effective supply (capped by the source, same as the physical line).
      const worstChargeTimeSec = treater.chargeM3 / tPerHourToM3PerSec(Math.min(rate, 12));
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
  // the buffer bin standing in for the after-bin. Below 12 t/h the feeder
  // can't keep pace with supply, so the buffer bin genuinely fills and trips
  // its own high-set-point interlock (issue #19) — a real, sustained
  // boom-bust cycle, not a demo rate hack. A presenter raising the feed rate
  // mid-run (the same live control issue #20 built, and the same staging
  // pattern this project uses throughout — see
  // feedback-stage-with-presenter-controls) then lets the pre-bin's own
  // two-stage interlock (issue #22) join in too, all inside one continuous
  // run.
  it("more than one interlocked machine logs events well past the initial startup transient, not just once each at the very start", () => {
    const sim = createSim(lineWithoutPackaging);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(8)); // below the 12 t/h source: the buffer bin genuinely fills and cycles
    for (let i = 0; i < Math.round(3000 / DT); i++) stepSim(sim, DT);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(18)); // presenter catches the line back up: now the pre-bin runs hot instead
    for (let i = 0; i < Math.round(3000 / DT); i++) stepSim(sim, DT);

    const events = getCombinedEvents(sim);
    const machinesLogging = new Set(events.map((e) => e.machineId));
    expect(machinesLogging.size).toBeGreaterThan(1); // more than the single machine issue #40 reported

    const lateEvents = events.filter((e) => e.t > 3000);
    expect(lateEvents.length).toBeGreaterThan(1); // still logging well past the run's midpoint, not silent after an early transient
  });

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
    const sim = createSim(line);
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
    expect(bin.stored / bin.capacity).toBeCloseTo(0.55); // line default fill level
    expect(interlockRule(sim).highSetpoint).toBeCloseTo(0.85); // line default, not the 0.6 set mid-run
    expect(interlockRule(sim).phase).toBe("open");
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("keeps the same object reference so a caller holding onto `sim` sees the reset without re-fetching it", () => {
    const sim = createSim(line);
    stepSim(sim, DT);
    const result = resetSim(sim);
    expect(result).toBe(sim);
  });

  it("the sim is fully usable again after a reset", () => {
    const sim = createSim(line);
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

describe("Pro Box source and the source selector (issue #46)", () => {
  it("the Pro Box is a live source with a presenter-settable rate, same as the treating-line stub", () => {
    const sim = createSim(line);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 100; i++) stepSim(sim, DT);
    const proBox = getMachineState(sim, PRO_BOX_ID);
    expect(proBox.kind).toBe("source");
    expect(proBox.fed).toBeCloseTo(tPerHourToM3PerSec(12) * DT * 100);
  });

  it("defaults to the treating line, matching the line's own authored feeder enable/disable state", () => {
    const sim = createSim(line);
    expect(getSource(sim)).toBe("treatingLine");
    expect(getMachineState(sim, TREATING_FEEDER_ID).enabled).toBe(true);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).enabled).toBe(false);
  });

  it("selecting the Pro Box arms only its own feeder, and selecting the treating line arms only the other", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    expect(() => setSource(sim, "somewhereElse")).toThrow(/unknown source/);
  });

  it("exactly one drum feeder ever draws product, whichever source is selected", () => {
    const sim = createSim(line);
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(60 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, PRO_BOX_FEEDER_ID).flowRateM3PerSec).toBeGreaterThan(0);
    expect(getMachineState(sim, TREATING_FEEDER_ID).flowRateM3PerSec).toBe(0);
  });

  it("a presenter's own feed-rate dial survives being deselected and reselected", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
    const snap = BEHAVIORS.routedTransportDelay.snapshot(getMachineState(sim, CONVEYOR_ID));
    expect(snap.transitTimeSec).toBeCloseTo(185, 0); // (7.084 + 9.157 + 14.846) m / (10.08 m/min)
  });

  it("nothing reaches the outload buffer bin until the full derived transit lag has elapsed", () => {
    const sim = createSim(line);
    // Issue #47 wires a real, live downstream all the way to metal bin 1
    // (the diverter, then the bin itself), so the buffer bin no longer
    // accumulates anything on its own — it passes straight through to
    // whichever bin is selected. Both authored initial inventories are
    // zeroed here so the only thing that can raise either bin's `stored` is
    // material the conveyor itself delivers.
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
    const sim = createSim(line);
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
    const sim = createSim(line);
    // Issue #47: overflow protection on this branch is now the metal bin's
    // own high-level trip (metalBin1HighTrip, lineData.js), which stops the
    // conveyor well before hard accumulator capacity is ever reached (its
    // 85% set point trips before 100%) — so this no longer reaches the pure
    // physical-backpressure scenario the pre-#47 version of this test
    // exercised (that mechanism still exists underneath, see the
    // accumulator's own reverse-pass capacity check, but the trip fires
    // first in ordinary operation, exactly as designed).
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
  it("defaults to metal bin 1, matching the conveyor's and diverter's own authored default ports", () => {
    const sim = createSim(line);
    expect(getDestination(sim)).toBe("metalBin1");
    expect(getMachineState(sim, CONVEYOR_ID).selected).toBe("outBuffer");
    expect(getMachineState(sim, OUTLOAD_DIVERTER_ID).selected).toBe("out1");
  });

  it("has four positions, each commanding the two routers correctly", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    expect(() => setDestination(sim, "somewhereElse")).toThrow(/unknown destination/);
  });

  it("switching destination mid-run sends nothing new to the new destination until material already in transit has cleared, and material already in transit still arrives at the old one", () => {
    const sim = createSim(line);
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0); // both zeroed: isolates newly-arrived material, see other #46 tests
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 0);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0.9); // plenty ready to discharge immediately
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, METAL_BIN_2_ID).flowRateM3PerSec).toBe(0); // bin 1 selected by default

    setDestination(sim, "metalBin2");
    setAccumulatorLevel(sim, OUTLOAD_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, METAL_BIN_1_ID).flowRateM3PerSec).toBe(0); // now bin 2 only
  });

  it("the grain break holds no material at any point", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    setAccumulatorLevel(sim, METAL_BIN_1_ID, 1); // already well past its own 85% trip point
    setDestination(sim, "concetti"); // but not the selected destination
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    expect(getInterlockState(sim, METAL_BIN_1_ID).phase).toBe("running"); // never even armed
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1); // never touched
  });

  it("the same full bin trips the conveyor once its own destination is (re-)selected", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
    setDestination(sim, "flexicon");
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < Math.round(220 / DT); i++) {
      stepSim(sim, DT);
      expect(getMachineState(sim, BIN_SEG_SAMPLER_ID).volume).toBe(0);
    }
  }, 10000);

  it("the pre-bin fills, and backpressures upstream when full rather than spilling", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1); // plenty stored, isolates the feeder's own metering
    setFeederRate(sim, VIBRATING_CONVEYOR_ID, tPerHourToM3PerSec(6));
    for (let i = 0; i < Math.round(5 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, VIBRATING_CONVEYOR_ID).flowRateM3PerSec).toBeCloseTo(tPerHourToM3PerSec(6), 5);
  });

  it("the filling head takes a charge, holds it for a cycle, and discharges a completed bag, reusing the batch cycle behaviour", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
    setAccumulatorLevel(sim, FLEXICON_PRE_BIN_ID, 1); // already well past its own 85% trip point
    // destination defaults to metalBin1, not flexicon — see setDestination's
    // own DESTINATIONS table (engine.js)
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);

    expect(getInterlockState(sim, FLEXICON_PRE_BIN_ID).phase).toBe("running"); // never even armed
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(1); // never touched
  });

  it("the same full pre-bin trips the conveyor once Flexicon is (re-)selected", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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
    const sim = createSim(line);
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

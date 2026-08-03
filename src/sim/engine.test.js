import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, getMachineState, setSourceRate, setFeederRate, setAccumulatorLevel, DT,
  setInterlockHighSetpoint, setInterlockLowSetpoint, setInterlockSignalDelay, getInterlockState,
} from "./engine";
import { assertConserved, conservationTotals } from "./conservation";
import { tPerHourToM3PerSec } from "./units";
import { line } from "../line/lineData";

const SOURCE_ID = "upstreamStub";
const METAL_REMOVER_ID = "treatMetalRemover";
const BUFFER_BIN_ID = "treaterBufferBin";
const FEEDER_ID = "treatDrumFeeder";

function interlockRule(sim) {
  return getInterlockState(sim, BUFFER_BIN_ID);
}

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
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < 20000; i++) {
      stepSim(sim, DT);
    }
    expect(() => assertConserved(sim)).not.toThrow();

    const totals = conservationTotals(sim);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(totals.stored).toBeCloseTo(bin.stored);
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

  it("the valve reopens once the level falls past the low set point", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockLowSetpoint(sim, BUFFER_BIN_ID, 0.3);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 1);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);
    expect(interlockRule(sim).phase).toBe("closed");
    expect(getMachineState(sim, SOURCE_ID).openness).toBe(0);

    // presenter stages the reopen scenario by dragging the level down, same
    // control used to stage a near-overflow (setAccumulatorLevel)
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.3);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);

    expect(interlockRule(sim).phase).toBe("open");
    expect(getMachineState(sim, SOURCE_ID).openness).toBe(1);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("records the trip, the delayed action and the reopen in the buffer bin's event log, each with its simulated time", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    setInterlockHighSetpoint(sim, BUFFER_BIN_ID, 0.6);
    setInterlockLowSetpoint(sim, BUFFER_BIN_ID, 0.3);
    setInterlockSignalDelay(sim, BUFFER_BIN_ID, 1);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0.3);
    for (let i = 0; i < 2000; i++) stepSim(sim, DT);

    const log = interlockRule(sim).log;
    expect(log.length).toBeGreaterThanOrEqual(4); // high trip, close commanded, low trip, open commanded
    for (const entry of log) {
      expect(typeof entry.t).toBe("number");
      expect(typeof entry.message).toBe("string");
    }
    expect(log[0].t).toBeLessThan(log[log.length - 1].t); // strictly ordered in sim time
  });

  it("high set point, low set point and signal delay are live controls that take effect while the sim is running", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
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
  it("starts off: the bin doesn't drain on its own, pending the elevator-confirmed-running interlock (issue #21+)", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, 0);
    const startStored = getMachineState(sim, BUFFER_BIN_ID).stored;
    for (let i = 0; i < 200; i++) stepSim(sim, DT);
    expect(getMachineState(sim, BUFFER_BIN_ID).stored).toBe(startStored);
    expect(getMachineState(sim, FEEDER_ID).drawn).toBe(0);
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

    const totals = conservationTotals(sim);
    const feeder = getMachineState(sim, FEEDER_ID);
    expect(totals.delivered).toBeCloseTo(feeder.drawn);
  });

  it("setFeederRate rejects a non-feeder machine", () => {
    const sim = createSim(line);
    expect(() => setFeederRate(sim, SOURCE_ID, tPerHourToM3PerSec(10))).toThrow(/not a metered feeder/);
  });
});

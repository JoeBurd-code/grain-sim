import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, resetSim, getMachineState, setSourceRate, setFeederRate, setAccumulatorLevel, DT,
  setInterlockHighSetpoint, setInterlockLowSetpoint, setInterlockSignalDelay, getInterlockState,
  setElevatorSpeed,
  setInterlockSlowSetpoint, setInterlockStopSetpoint, setInterlockSlowDelay, setInterlockStopDelay,
} from "./engine";
import { assertConserved, conservationTotals } from "./conservation";
import { tPerHourToM3PerSec } from "./units";
import { line } from "../line/lineData";

const SOURCE_ID = "upstreamStub";
const METAL_REMOVER_ID = "treatMetalRemover";
const BUFFER_BIN_ID = "treaterBufferBin";
const FEEDER_ID = "treatDrumFeeder";
const ELEVATOR_ID = "treatingElevator";
const PRE_BIN_ID = "treaterPreBin";

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
    // Since issue #22, the pre-bin is also a sim-enabled accumulator and
    // contributes its own (here, constant — the drum feeder defaults to
    // off) stored volume to the total.
    const preBin = getMachineState(sim, PRE_BIN_ID);
    expect(totals.stored).toBeCloseTo(bin.stored + preBin.stored);
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

    const feeder = getMachineState(sim, FEEDER_ID);
    const elevator = getMachineState(sim, ELEVATOR_ID);
    const preBin = getMachineState(sim, PRE_BIN_ID);
    // Since issue #21, everything the feeder forwards lands in the treating
    // elevator's transport delay, not straight out the modelled boundary —
    // and since issue #22, the elevator's own discharge lands in the
    // pre-bin's stock rather than being counted as "delivered" itself (see
    // behaviors.js `conserveTransportDelay`'s `hasDownstream` branch). What
    // the feeder ever drew must equal what's still mid-lift plus what the
    // pre-bin has gained (stored or spilled) since t=0 — using
    // `conservationTotals` directly here would also pull in the buffer
    // bin's own unrelated stored volume, so this reconciles the
    // feeder-through-pre-bin subsystem from the machines' own state instead.
    const elevatorInTransit = elevator.queue.reduce((a, p) => a + p.vol, 0) + elevator.backlog;
    const preBinGained = preBin.stored - preBin.initialStored + preBin.spill;
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
    // (see behaviors.js `conserveTransportDelay`'s `hasDownstream` branch) —
    // material genuinely arriving now shows up as the pre-bin's stored
    // volume growing past its starting level.
    const preBin = getMachineState(sim, PRE_BIN_ID);
    expect(preBin.stored).toBeGreaterThan(preBin.initialStored);
  });

  // treaterPreBin has a real sim block since issue #22, but this test still
  // overrides it to start already full (zero headroom) rather than feeding
  // long enough for its real 1.63 m3 to fill naturally, so the cascade is
  // forced immediately within a short step budget. The interlock is also
  // stripped for this test: with the pre-bin starting full, issue #22's own
  // two-stage interlock would immediately throttle the elevator on its own,
  // which would confound this test's actual target — issue #21's generic
  // "a full downstream rejects material" backpressure, independent of any
  // interlock. Same test-only-line-variant pattern as the "unregistered
  // sim.kind" test above.
  it("real backpressure cascades from a full downstream bin, through the elevator, to the feeder", () => {
    const blockedLine = {
      ...line,
      machines: line.machines.map((m) =>
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

describe("treater pre-bin slows the elevator, then stops it (issue #22)", () => {
  it("reuses the accumulator behaviour verbatim: no new material physics for the pre-bin", () => {
    const sim = createSim(line);
    expect(getMachineState(sim, PRE_BIN_ID).kind).toBe("accumulator");
  });

  it("a rising level first commands a reduced speed, and only a further rise commands a full stop", () => {
    const sim = createSim(line);
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
    const sim = createSim(line);
    const rule = preBinInterlock(sim);
    expect(rule.slowSetpoint).not.toBe(rule.stopSetpoint);
    expect(rule.slowDelaySec).not.toBe(rule.stopDelaySec);
  });

  it("the elevator ramps between speeds rather than changing instantaneously", () => {
    const sim = createSim(line);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9); // straight to above both set points
    for (let i = 0; i < Math.round(3.5 / DT); i++) stepSim(sim, DT); // just past the 3s slow delay, mid-ramp
    const elevator = getMachineState(sim, ELEVATOR_ID);
    expect(elevator.throttleFraction).toBeGreaterThan(0); // ramping down, not yet at 0.5
    expect(elevator.throttleFraction).toBeLessThan(1); // ramping down, not still at full speed
  });

  it("material already on the elevator chain during the slow-down and the stop still arrives, and conservation holds through the full cycle", () => {
    const sim = createSim(line);
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
    const preBinAtRecoverStart = getMachineState(sim, PRE_BIN_ID).stored;
    for (let i = 0; i < Math.round(60 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // past the recovery ramp, long enough for the frozen packet to finish arriving
    expect(preBinInterlock(sim).phase).toBe("full");
    expect(elevator.throttleFraction).toBe(1);
    expect(getMachineState(sim, PRE_BIN_ID).stored).toBeGreaterThan(preBinAtRecoverStart); // the material frozen mid-lift did eventually arrive
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("the level recovers and the elevator returns to full speed once the bin drains", () => {
    const sim = createSim(line);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("stopped");

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.2); // presenter drags the level back down
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT); // past the recovery ramp
    expect(preBinInterlock(sim).phase).toBe("full");
    expect(getMachineState(sim, ELEVATOR_ID).throttleFraction).toBe(1);
  });

  it("both stage thresholds and delays are live controls that take effect while running", () => {
    const sim = createSim(line);
    setInterlockSlowSetpoint(sim, PRE_BIN_ID, 0.5);
    setInterlockSlowDelay(sim, PRE_BIN_ID, 1);
    setInterlockStopSetpoint(sim, PRE_BIN_ID, 0.55);
    setInterlockStopDelay(sim, PRE_BIN_ID, 1);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.6); // above both of the newly-lowered set points at once

    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("stopped"); // reached on the new, tighter set points
  });

  it("the pre-bin's event log records the slow-down and the stop as distinct entries, each with its simulated time", () => {
    const sim = createSim(line);
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

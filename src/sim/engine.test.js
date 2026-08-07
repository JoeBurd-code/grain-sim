import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, resetSim, getMachineState, setSourceRate, setFeederRate, setAccumulatorLevel, DT,
  setInterlockHighSetpoint, setInterlockLowSetpoint, setInterlockSignalDelay, getInterlockState,
  setElevatorSpeed,
  setInterlockSlowSetpoint, setInterlockStopSetpoint, setInterlockSlowDelay, setInterlockStopDelay,
  setBatchSize, setBatchCycleSec, setSplitterWasteFraction,
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
    // Since issue #22, the pre-bin is also a sim-enabled accumulator, and
    // since issue #25 so is the after-bin — both contribute their own
    // (here, constant — the drum feeder defaults to off, so nothing moves
    // past the buffer bin) stored volume to the total.
    const preBin = getMachineState(sim, PRE_BIN_ID);
    const afterBin = getMachineState(sim, AFTER_BIN_ID);
    expect(totals.stored).toBeCloseTo(bin.stored + preBin.stored + afterBin.stored);
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
    const preBinAtRecoverStart = getMachineState(sim, PRE_BIN_ID).stored;
    for (let i = 0; i < Math.round(60 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // past the recovery ramp, long enough for the frozen packet to finish arriving
    expect(preBinInterlock(sim).phase).toBe("full");
    expect(elevator.throttleFraction).toBe(1);
    expect(getMachineState(sim, PRE_BIN_ID).stored).toBeGreaterThan(preBinAtRecoverStart); // the material frozen mid-lift did eventually arrive
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("the level recovers and the elevator returns to full speed once the bin drains", () => {
    const sim = createSim(lineWithoutBatchTreater);
    setAccumulatorLevel(sim, PRE_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT);
    expect(preBinInterlock(sim).phase).toBe("stopped");

    setAccumulatorLevel(sim, PRE_BIN_ID, 0.2); // presenter drags the level back down
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

  it("the treater resumes only once the level has fallen back below the clearing threshold", () => {
    const sim = createSim(line);
    feedElevator(sim, 20);
    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.9);
    for (let i = 0; i < Math.round(10 / DT); i++) stepSim(sim, DT);
    expect(afterBinInterlock(sim).phase).toBe("held");
    const treater = getMachineState(sim, TREATER_ID);
    expect(treater.blocked).toBe(true);

    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.5); // still above the 20% clearing threshold
    stepSim(sim, DT);
    expect(afterBinInterlock(sim).phase).toBe("held"); // does not resume yet
    expect(treater.blocked).toBe(true);

    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.1); // now below the clearing threshold
    stepSim(sim, DT);
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

    setAccumulatorLevel(sim, AFTER_BIN_ID, 0.1); // presenter drains it for the demo, below the clearing threshold
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

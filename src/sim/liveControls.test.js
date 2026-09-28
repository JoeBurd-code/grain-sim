import { describe, it, expect } from "vitest";
import { setLiveControl, readLiveControl } from "./liveControls";
import { createSim, stepSim, getMachineState, DT } from "./engine";
import { BEHAVIORS } from "./behaviors";
import { line } from "../line/lineData";
import { tPerHourToM3PerSec, BULK_DENSITY_T_PER_M3 } from "./units";

// Every popup slider the real line declares, as [machineId, param].
const SLIDERS = line.machines.flatMap((m) => (m.params ?? []).filter((p) => p.bind).map((p) => [m.id, p]));

// The published snapshot, which is what the popup actually reads — never the
// raw machine state (a raw-state read is how an earlier trace asserted
// nothing at all, see pendulumConveyorGrain.test.js).
function published(sim, id) {
  const state = getMachineState(sim, id);
  return BEHAVIORS[state.kind].snapshot(state);
}

function firstWithBind(bind) {
  const hit = SLIDERS.find(([, p]) => p.bind === bind);
  if (!hit) throw new Error(`the real line has no slider bound to "${bind}"`);
  return hit[0];
}

describe("liveControls against the real line", () => {
  it("covers a real set of sliders", () => {
    expect(SLIDERS.length).toBeGreaterThan(30);
  });

  // validateLine catches an unknown bind name; this catches a known bind on
  // the wrong kind of machine, which only the engine's own setter can tell.
  it("every slider's bind accepts its authored default on its own machine, at both ends of its range", () => {
    const sim = createSim(line);
    for (const [id, p] of SLIDERS) {
      for (const v of [p.value, p.min, p.max]) {
        expect(() => setLiveControl(sim, id, p.bind, v), `${id}.${p.id} = ${v}`).not.toThrow();
      }
    }
    expect(() => stepSim(sim, DT)).not.toThrow();
  });

  it("every slider's readBind reads its machine's published snapshot", () => {
    const sim = createSim(line);
    stepSim(sim, DT);
    const readers = SLIDERS.filter(([, p]) => p.readBind);
    expect(readers.length).toBeGreaterThan(0);
    for (const [id, p] of readers) {
      const reading = readLiveControl(published(sim, id), p.readBind);
      expect(reading, `${id}.${p.readBind}`).not.toBeNull();
      expect(Number.isFinite(reading.actual)).toBe(true);
    }
  });
});

describe("liveControls unit conversions", () => {
  it("t/h rates reach the engine as m3/s", () => {
    const sim = createSim(line);
    const source = firstWithBind("sourceRate");
    setLiveControl(sim, source, "sourceRate", 12);
    expect(getMachineState(sim, source).nominalRate).toBeCloseTo(tPerHourToM3PerSec(12), 12);

    const feeder = firstWithBind("feederRate");
    setLiveControl(sim, feeder, "feederRate", 7);
    expect(getMachineState(sim, feeder).rate).toBeCloseTo(tPerHourToM3PerSec(7), 12);
  });

  it("the batch size reaches the engine as a volume from kg", () => {
    const sim = createSim(line);
    const treater = firstWithBind("batchSize");
    setLiveControl(sim, treater, "batchSize", 160);
    expect(getMachineState(sim, treater).chargeM3).toBeCloseTo(0.16 / BULK_DENSITY_T_PER_M3, 12);
  });

  it("percent sliders reach the engine as fractions", () => {
    const sim = createSim(line);
    const screen = firstWithBind("wasteFraction");
    setLiveControl(sim, screen, "wasteFraction", 3);
    expect(getMachineState(sim, screen).wasteFraction).toBeCloseTo(0.03, 12);

    const bin = SLIDERS.find(([id, p]) => p.bind === "levelJump" && getMachineState(sim, id).kind === "accumulator")[0];
    setLiveControl(sim, bin, "levelJump", 40);
    expect(published(sim, bin).fill).toBeCloseTo(0.4, 9);
  });

  it("seconds pass straight through", () => {
    const sim = createSim(line);
    const treater = firstWithBind("batchCycleTime");
    setLiveControl(sim, treater, "batchCycleTime", 33);
    expect(getMachineState(sim, treater).cycleSec).toBe(33);
  });
});

// A drag goes in through setLiveControl and comes back through
// readLiveControl, the same two calls PlantApp makes.
describe("liveControls dial round trip", () => {
  it("an elevator speed drag below the cap reads back as an override at the dragged value", () => {
    const sim = createSim(line);
    const elevator = firstWithBind("elevatorSpeed");
    stepSim(sim, DT);
    const governed = readLiveControl(published(sim, elevator), "elevatorSpeedActual");
    expect(governed.overriding).toBe(false);

    setLiveControl(sim, elevator, "elevatorSpeed", governed.cap - 20);
    const overridden = readLiveControl(published(sim, elevator), "elevatorSpeedActual");
    expect(overridden.overriding).toBe(true);
    expect(overridden.actual).toBeCloseTo(governed.cap - 20, 9);

    setLiveControl(sim, elevator, "elevatorSpeed", governed.cap + 1); // back onto the tick
    const released = readLiveControl(published(sim, elevator), "elevatorSpeedActual");
    expect(released.overriding).toBe(false);
    expect(released.actual).toBeCloseTo(governed.cap, 9);
  });

  it("a gate drag reads back as the effective gate", () => {
    const sim = createSim(line);
    const feeder = firstWithBind("gatePosition");
    setLiveControl(sim, feeder, "gatePosition", 20);
    const reading = readLiveControl(published(sim, feeder), "gatePositionActual");
    expect(reading.actual).toBeCloseTo(20, 9);
  });
});

describe("liveControls names", () => {
  it("throws on an unknown bind or readBind rather than silently doing nothing", () => {
    const sim = createSim(line);
    expect(() => setLiveControl(sim, SLIDERS[0][0], "noSuchBind", 1)).toThrow(/noSuchBind/);
    expect(() => readLiveControl({}, "noSuchRead")).toThrow(/noSuchRead/);
  });

  it("reads null for a param with no readBind", () => {
    expect(readLiveControl({ rate: 1 }, undefined)).toBeNull();
  });
});

// A valve's or drum feeder gate's starting position, set in Build mode: the
// position it starts at in the sim and its normal position, the one the
// popup slider overrides and every interlock letting go returns it to.
import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, DT, getMachineState, getInterlockState, setAccumulatorLevel, setUtilitiesHealthy, resetTrips,
} from "./engine";
import { tPerHourToM3PerSec } from "./units";
import { validateSentence } from "./sentenceInterlock";
import { BEHAVIORS } from "./behaviors";
import { setLiveControl, readLiveControl } from "./liveControls";

function machine(id, sim, inputs, outputs) {
  return {
    id, type: "box", name: id.toUpperCase(), tag: `T.${id}`, status: "new", zone: "all", x: 0, y: 0,
    ports: { inputs, outputs },
    anchors: Object.fromEntries([...inputs, ...outputs].map((p) => [p, { x: 0, y: 0 }])),
    sim,
  };
}

const VALVE_CEILING = tPerHourToM3PerSec(20);

// Grain in -> bin -> outlet valve -> bay. The bin starts full, so the valve
// is what limits the flow.
function valveLine(valveSim = {}, interlocks = []) {
  return {
    zones: [{ id: "all", name: "ALL" }],
    machines: [
      machine("grainIn", { kind: "source", rateM3PerSec: 0.02 }, [], ["out"]),
      machine("bin", { kind: "accumulator", capacityM3: 100, initialLevelFraction: 0.5 }, ["in"], ["out"]),
      machine("valve", { kind: "gateValve", ceilingM3PerSec: VALVE_CEILING, ...valveSim }, ["in"], ["out"]),
      machine("bay", { kind: "terminalSink" }, ["in"], []),
    ],
    connections: [
      { from: { machine: "grainIn", port: "out" }, to: { machine: "bin", port: "in" }, kind: "product" },
      { from: { machine: "bin", port: "out" }, to: { machine: "valve", port: "in" }, kind: "product" },
      { from: { machine: "valve", port: "out" }, to: { machine: "bay", port: "in" }, kind: "product" },
    ],
    interlocks,
  };
}

function run(sim, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepSim(sim, DT);
}

const flow = (sim, id) => getMachineState(sim, id).flowRateM3PerSec;

describe("an outlet valve's starting position", () => {
  it("starts the valve at that position, metering half its ceiling at 50%", () => {
    const sim = createSim(valveLine({ startFraction: 0.5 }));
    run(sim, 2);
    expect(flow(sim, "valve")).toBeCloseTo(VALVE_CEILING * 0.5, 9);
  });

  it("starts the valve shut at 0%", () => {
    const sim = createSim(valveLine({ startFraction: 0 }));
    run(sim, 2);
    expect(flow(sim, "valve")).toBe(0);
  });

  it("starts fully open with no starting position, as before", () => {
    const sim = createSim(valveLine());
    run(sim, 2);
    expect(flow(sim, "valve")).toBeCloseTo(VALVE_CEILING, 9);
  });
});

// When the bin is above `setpoint`, the valve is set to `fraction`; auto reset.
function setWhenAbove(id, setpoint, fraction, extra = {}) {
  return {
    id, kind: "sentence",
    when: { machine: "bin", condition: "above", setpoint, delaySec: 0 },
    then: [{ action: "set", machine: "valve", fraction }],
    reset: "auto",
    ...extra,
  };
}

const opening = (sim) => getMachineState(sim, "valve").openness;

describe("an interlock setting a valve to a position", () => {
  it("opens a valve that starts shut to the position it sets", () => {
    const sim = createSim(valveLine({ startFraction: 0 }, [setWhenAbove("open60", 0.4, 0.6)]));
    run(sim, 1);
    expect(opening(sim)).toBeCloseTo(0.6, 9);
    expect(flow(sim, "valve")).toBeCloseTo(VALVE_CEILING * 0.6, 9);
  });

  it("returns the valve to its starting position when it lets go", () => {
    const sim = createSim(valveLine({ startFraction: 0.5 }, [setWhenAbove("open80", 0.4, 0.8)]));
    run(sim, 1);
    expect(opening(sim)).toBeCloseTo(0.8, 9);
    setAccumulatorLevel(sim, "bin", 0.1);
    run(sim, 1);
    expect(opening(sim)).toBeCloseTo(0.5, 9);
  });

  it("holds the lowest position while two interlocks both set it", () => {
    const sim = createSim(valveLine({ startFraction: 0 }, [
      setWhenAbove("open80", 0.4, 0.8),
      setWhenAbove("open30", 0.3, 0.3),
    ]));
    run(sim, 1);
    expect(opening(sim)).toBeCloseTo(0.3, 9);
  });

  it("ramps to the position over its ramp time", () => {
    const sim = createSim(valveLine({ startFraction: 0 }, [
      setWhenAbove("open60", 0.4, 0.6, { then: [{ action: "set", machine: "valve", fraction: 0.6, rampTimeSec: 10 }] }),
    ]));
    run(sim, 5);
    expect(opening(sim)).toBeGreaterThan(0.2);
    expect(opening(sim)).toBeLessThan(0.6);
    run(sim, 10);
    expect(opening(sim)).toBeCloseTo(0.6, 9);
  });

  it("logs the position it set", () => {
    const sim = createSim(valveLine({ startFraction: 0 }, [setWhenAbove("open60", 0.4, 0.6)]));
    run(sim, 1);
    expect(getInterlockState(sim, "bin").log.map((e) => e.message).join("\n")).toMatch(/VALVE set to 60%/);
  });
});

const FEEDER_RATE = tPerHourToM3PerSec(10);

// Grain in -> bin -> drum feeder (gated) -> bay.
function feederLine(feederSim = {}, interlocks = []) {
  const line = valveLine({}, interlocks);
  line.machines[2] = machine("feeder", { kind: "meteredFeeder", rateM3PerSec: FEEDER_RATE, hasGate: true, ...feederSim }, ["in"], ["out"]);
  line.connections[1].to.machine = "feeder";
  line.connections[2].from.machine = "feeder";
  return line;
}

describe("a drum feeder gate's starting position", () => {
  it("starts the gate at that position, feeding half its rate at 50%", () => {
    const sim = createSim(feederLine({ startFraction: 0.5 }));
    run(sim, 2);
    expect(flow(sim, "feeder")).toBeCloseTo(FEEDER_RATE * 0.5, 9);
  });

  it("is set by an interlock's \"set\" step, and goes back to its starting position after", () => {
    const sentence = {
      id: "gate70", kind: "sentence",
      when: { machine: "bin", condition: "above", setpoint: 0.4, delaySec: 0 },
      then: [{ action: "set", machine: "feeder", fraction: 0.7 }],
      reset: "auto",
    };
    const sim = createSim(feederLine({ startFraction: 0.2 }, [sentence]));
    run(sim, 1);
    expect(flow(sim, "feeder")).toBeCloseTo(FEEDER_RATE * 0.7, 9);
    setAccumulatorLevel(sim, "bin", 0.1);
    run(sim, 1);
    expect(flow(sim, "feeder")).toBeCloseTo(FEEDER_RATE * 0.2, 9);
  });
});

describe("checking a \"set\" step", () => {
  const machines = (line) => new Map(line.machines.map((m) => [m.id, m]));
  const setStep = (step) => ({
    id: "s", kind: "sentence",
    when: { machine: "bin", condition: "above", setpoint: 0.4, delaySec: 0 },
    then: [{ action: "set", ...step }],
    reset: "auto",
  });

  it("accepts a valve or a gated drum feeder at a position from 0 to 100 %", () => {
    expect(validateSentence(setStep({ machine: "valve", fraction: 0.6 }), machines(valveLine()))).toEqual([]);
    expect(validateSentence(setStep({ machine: "feeder", fraction: 0 }), machines(feederLine()))).toEqual([]);
  });

  it("refuses a step with no position, or one past 100 %", () => {
    expect(validateSentence(setStep({ machine: "valve" }), machines(valveLine()))).toEqual(['interlock "s": step 1 needs a position']);
    expect(validateSentence(setStep({ machine: "valve", fraction: 1.2 }), machines(valveLine())))
      .toEqual(['interlock "s": step 1 needs a position from 0 to 100 %']);
  });

  it("refuses a feeder with no gate", () => {
    expect(validateSentence(setStep({ machine: "feeder", fraction: 0.5 }), machines(feederLine({ hasGate: false }))))
      .toEqual(['interlock "s": step 1 cannot set machine "feeder"']);
  });

  it("lets a later \"open\" in the same sentence undo it", () => {
    const rule = { ...setStep({ machine: "valve", fraction: 0.6 }), whenClears: { then: [{ action: "open", machine: "valve" }] } };
    expect(validateSentence(rule, machines(valveLine()))).toEqual([]);
  });
});

const valveReading = (sim) => readLiveControl(BEHAVIORS.gateValve.snapshot(getMachineState(sim, "valve")), "valvePositionActual");
const gateReading = (sim) => readLiveControl(BEHAVIORS.meteredFeeder.snapshot(getMachineState(sim, "feeder")), "gatePositionActual");

describe("the popup slider on an outlet valve", () => {
  it("shows the starting position as the normal position, not overriding", () => {
    const sim = createSim(valveLine({ startFraction: 0.5 }));
    run(sim, 1);
    expect(valveReading(sim)).toEqual({ actual: 50, cap: 50, overridable: true, overriding: false });
  });

  it("overrides the starting position when dragged off it, and runs the valve there", () => {
    const sim = createSim(valveLine({ startFraction: 0.5 }));
    setLiveControl(sim, "valve", "valvePosition", 80);
    run(sim, 1);
    expect(valveReading(sim)).toMatchObject({ actual: 80, cap: 50, overriding: true });
    expect(flow(sim, "valve")).toBeCloseTo(VALVE_CEILING * 0.8, 9);
  });

  it("goes back to normal when set back to the starting position", () => {
    const sim = createSim(valveLine({ startFraction: 0.5 }));
    setLiveControl(sim, "valve", "valvePosition", 80);
    run(sim, 1);
    setLiveControl(sim, "valve", "valvePosition", valveReading(sim).cap);
    run(sim, 1);
    expect(valveReading(sim)).toMatchObject({ actual: 50, overriding: false });
    expect(flow(sim, "valve")).toBeCloseTo(VALVE_CEILING * 0.5, 9);
  });

  it("opens a valve whose starting position is 0 %", () => {
    const sim = createSim(valveLine({ startFraction: 0 }));
    setLiveControl(sim, "valve", "valvePosition", 40);
    run(sim, 1);
    expect(valveReading(sim)).toMatchObject({ overridable: true, overriding: true });
    expect(flow(sim, "valve")).toBeCloseTo(VALVE_CEILING * 0.4, 9);
  });

  it("overrides an interlock's \"set to X%\"", () => {
    const sim = createSim(valveLine({ startFraction: 0 }, [setWhenAbove("open60", 0.4, 0.6)]));
    run(sim, 1);
    expect(valveReading(sim)).toMatchObject({ cap: 60, overriding: false });
    setLiveControl(sim, "valve", "valvePosition", 90);
    run(sim, 1);
    expect(flow(sim, "valve")).toBeCloseTo(VALVE_CEILING * 0.9, 9);
  });

  it("never overrides an interlock's close", () => {
    const sim = createSim(valveLine({ startFraction: 0.5 }, [setWhenAbove("shut", 0.4, 0)]));
    run(sim, 1);
    setLiveControl(sim, "valve", "valvePosition", 90);
    run(sim, 1);
    expect(valveReading(sim)).toMatchObject({ overridable: false, overriding: false });
    expect(flow(sim, "valve")).toBe(0);
  });
});

describe("the popup slider on a drum feeder gate", () => {
  it("opens a gate whose starting position is 0 %", () => {
    const sim = createSim(feederLine({ startFraction: 0 }));
    setLiveControl(sim, "feeder", "gatePosition", 40);
    run(sim, 1);
    expect(gateReading(sim)).toMatchObject({ cap: 0, overridable: true, overriding: true });
    expect(flow(sim, "feeder")).toBeCloseTo(FEEDER_RATE * 0.4, 9);
  });
});

describe("a utilities trip on a valve with a starting position", () => {
  it("shuts the valve, and puts it back to its starting position after the reset", () => {
    const sim = createSim(valveLine({ startFraction: 0.5 }));
    run(sim, 1);
    setUtilitiesHealthy(sim, false);
    run(sim, 10);
    expect(opening(sim)).toBe(0);
    setUtilitiesHealthy(sim, true);
    resetTrips(sim);
    run(sim, 30);
    expect(opening(sim)).toBeCloseTo(0.5, 9);
  });
});

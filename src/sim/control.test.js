// Unit tests over control.js's pure state machine, exercised the same way
// behaviors.test.js exercises a behaviour: fabricated machine states and a
// fabricated sim shell, no real line data, no engine.js involved.
import { describe, it, expect } from "vitest";
import { initControl, stepControl } from "./control";
import { BEHAVIORS } from "./behaviors";

const RULE_CFG = {
  id: "testTrip",
  sensor: { machine: "bin" },
  highSetpoint: 0.8,
  lowSetpoint: 0.3,
  signalDelaySec: 3,
  action: { machine: "valve", rampTimeSec: 2 },
};

function makeSim(fillFraction) {
  const capacity = 10;
  const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
  const valve = BEHAVIORS.source.init({ sim: { rateM3PerSec: 5 } });
  const machines = new Map([["bin", bin], ["valve", valve]]);
  const control = initControl({ interlocks: [RULE_CFG] });
  return { t: 0, machines, control };
}

// Mirrors what engine.js's stepSim actually does each tick: run the
// machine behaviours (here, only the valve's apply() needs to move —
// the bin's level is driven directly by the tests via `stored`), advance
// t, then run the control layer. stepControl only issues commands; the
// commanded machine's own apply() is what makes the command take effect.
function step(sim, dt, n = 1) {
  for (let i = 0; i < n; i++) {
    BEHAVIORS.source.apply(sim.machines.get("valve"), dt, 0, Infinity);
    sim.t += dt;
    stepControl(sim);
  }
}

describe("initControl", () => {
  it("builds one runtime rule per declared interlock, starting in the open phase", () => {
    const sim = makeSim(0.5);
    expect(sim.control).toHaveLength(1);
    expect(sim.control[0].phase).toBe("open");
    expect(sim.control[0].log).toEqual([]);
  });
});

describe("stepControl", () => {
  it("does nothing while the sensor's level stays below the high set point", () => {
    const sim = makeSim(0.5);
    step(sim, 0.05, 200); // 10s
    expect(sim.control[0].phase).toBe("open");
    expect(sim.machines.get("valve").openness).toBe(1);
    expect(sim.control[0].log).toEqual([]);
  });

  it("arms a delayed close the instant level reaches the high set point, logging the trip", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05);
    expect(sim.control[0].phase).toBe("delayedClose");
    expect(sim.control[0].log).toHaveLength(1);
    expect(sim.control[0].log[0].t).toBeCloseTo(0.05);
  });

  it("does not command the valve until the signal delay elapses", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05); // trips at t=0.05, fires at t=3.05
    step(sim, 1); // t ~= 1.05
    expect(sim.machines.get("valve").openness).toBe(1);
    expect(sim.control[0].phase).toBe("delayedClose");
  });

  it("commands the valve closed once the delay elapses, logging the action, then ramps to fully closed", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05); // trip at t=0.05
    step(sim, 0.05, 62); // consume the 3s delay (t ~= 3.15)
    expect(sim.control[0].phase).toBe("closing");
    expect(sim.control[0].log).toHaveLength(2);
    expect(sim.machines.get("valve").opennessTarget).toBe(0);

    step(sim, 0.05, 42); // 2.1s more, ramp time is 2s
    expect(sim.machines.get("valve").openness).toBe(0);
    expect(sim.control[0].phase).toBe("closed");
  });

  it("does not re-arm while already delayed-close or closing (latches, does not re-trigger)", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05, 200); // well past trip, delay and ramp
    expect(sim.control[0].phase).toBe("closed");
    expect(sim.control[0].log).toHaveLength(2); // trip + action, no duplicates
  });

  it("arms a delayed open once level falls to the low set point while closed, then commands the valve open", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05, 200); // reach "closed"
    sim.machines.get("bin").stored = 0.3 * 10; // presenter drags the level down (setAccumulatorLevel)
    step(sim, 0.05);
    expect(sim.control[0].phase).toBe("delayedOpen");
    expect(sim.control[0].log).toHaveLength(3);

    step(sim, 0.05, 62); // consume delay
    expect(sim.control[0].phase).toBe("opening");
    expect(sim.machines.get("valve").opennessTarget).toBe(1);
    expect(sim.control[0].log).toHaveLength(4);

    step(sim, 0.05, 42); // consume ramp
    expect(sim.machines.get("valve").openness).toBe(1);
    expect(sim.control[0].phase).toBe("open");
  });
});

describe("live parameter changes", () => {
  it("a larger signal delay set on the rule takes effect on the next trip", () => {
    const sim = makeSim(0.5);
    sim.control[0].signalDelaySec = 10;
    sim.machines.get("bin").stored = 0.8 * 10;
    step(sim, 0.05); // trips, fireAt should be based on the new delay
    expect(sim.control[0].fireAt).toBeCloseTo(0.05 + 10);
  });

  it("changing the high set point changes when the next trip arms", () => {
    const sim = makeSim(0.5);
    sim.control[0].highSetpoint = 0.4;
    step(sim, 0.05);
    expect(sim.control[0].phase).toBe("delayedClose");
  });
});

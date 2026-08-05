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

// twoStageThrottle (issue #22 — the treater pre-bin slows the elevator,
// then stops it): same shape of test as thresholdTrip above, fabricated
// machine states and a fabricated sim shell, no real line data.
const TWO_STAGE_CFG = {
  id: "testThrottle",
  kind: "twoStageThrottle",
  sensor: { machine: "bin" },
  lowSetpoint: 0.3,
  slow: { setpoint: 0.6, delaySec: 2, speedFraction: 0.5, rampTimeSec: 1 },
  stop: { setpoint: 0.85, delaySec: 3, rampTimeSec: 2 },
  recoverRampTimeSec: 1,
  action: { machine: "elevator" },
};

function makeTwoStageSim(fillFraction) {
  const capacity = 10;
  const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
  const elevator = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
  const machines = new Map([["bin", bin], ["elevator", elevator]]);
  const control = initControl({ interlocks: [TWO_STAGE_CFG] });
  return { t: 0, machines, control };
}

// Mirrors `step` above: runs the elevator's own apply() (so its throttle
// ramp actually advances), advances t, then runs the control layer.
function stepThrottle(sim, dt, n = 1) {
  for (let i = 0; i < n; i++) {
    BEHAVIORS.transportDelay.apply(sim.machines.get("elevator"), dt, 0, Infinity);
    sim.t += dt;
    stepControl(sim);
  }
}

describe("initControl (twoStageThrottle)", () => {
  it("builds a twoStageThrottle rule starting in the full phase", () => {
    const sim = makeTwoStageSim(0.5);
    expect(sim.control).toHaveLength(1);
    expect(sim.control[0].kind).toBe("twoStageThrottle");
    expect(sim.control[0].phase).toBe("full");
    expect(sim.control[0].log).toEqual([]);
  });
});

describe("stepControl (twoStageThrottle)", () => {
  it("does nothing while the level stays below the slow set point", () => {
    const sim = makeTwoStageSim(0.5);
    stepThrottle(sim, 0.05, 200); // 10s
    expect(sim.control[0].phase).toBe("full");
    expect(sim.machines.get("elevator").throttleFraction).toBe(1);
    expect(sim.control[0].log).toEqual([]);
  });

  it("arms a delayed slow-down the instant level reaches the slow set point", () => {
    const sim = makeTwoStageSim(0.65);
    stepThrottle(sim, 0.05);
    expect(sim.control[0].phase).toBe("armSlow");
    expect(sim.control[0].log).toHaveLength(1);
  });

  it("does not command the elevator until the slow delay elapses", () => {
    const sim = makeTwoStageSim(0.65);
    stepThrottle(sim, 0.05); // arms at t=0.05, fires at t=2.05
    stepThrottle(sim, 1); // t ~= 1.05
    expect(sim.machines.get("elevator").throttleFraction).toBe(1);
    expect(sim.control[0].phase).toBe("armSlow");
  });

  it("commands the elevator to the slow fraction once the delay elapses, then ramps it there", () => {
    const sim = makeTwoStageSim(0.65);
    stepThrottle(sim, 0.05); // arms at t=0.05
    stepThrottle(sim, 0.05, 42); // consume the 2s delay (t ~= 2.15)
    expect(sim.control[0].phase).toBe("slowing");
    expect(sim.control[0].log).toHaveLength(2);
    expect(sim.machines.get("elevator").throttleTarget).toBe(0.5);

    stepThrottle(sim, 0.05, 22); // 1.1s more, ramp time is 1s
    expect(sim.machines.get("elevator").throttleFraction).toBeCloseTo(0.5);
    expect(sim.control[0].phase).toBe("slow");
  });

  it("a further rise to the stop set point arms, then commands, a full stop — distinct from the slow-down", () => {
    const sim = makeTwoStageSim(0.9); // above both set points from the start
    stepThrottle(sim, 0.05); // arms slow at t=0.05
    stepThrottle(sim, 0.05, 42); // consume the 2s slow delay -> "slowing"
    stepThrottle(sim, 0.05, 22); // consume the 1s slow ramp -> settles to "slow"
    stepThrottle(sim, 0.05); // stop-arm check now sees "slow" with level still above stopSetpoint
    expect(sim.control[0].phase).toBe("armStop");

    stepThrottle(sim, 0.05, 62); // consume the 3s stop delay
    expect(sim.control[0].phase).toBe("stopping");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0);

    stepThrottle(sim, 0.05, 42); // 2.1s more, stop ramp time is 2s
    expect(sim.machines.get("elevator").throttleFraction).toBe(0);
    expect(sim.control[0].phase).toBe("stopped");

    const messages = sim.control[0].log.map((e) => e.message);
    expect(messages.some((m) => m.includes("slow"))).toBe(true);
    expect(messages.some((m) => m.includes("stop"))).toBe(true);
    expect(new Set(messages).size).toBe(messages.length); // each stage logs its own distinct message
  });

  it("does not re-arm while already armed, slowing or stopping (latches, does not re-trigger)", () => {
    const sim = makeTwoStageSim(0.9);
    stepThrottle(sim, 0.05, 400); // well past both trips, delays and ramps
    expect(sim.control[0].phase).toBe("stopped");
    expect(sim.control[0].log).toHaveLength(4); // slow-armed, slow-commanded, stop-armed, stop-commanded — no duplicates
  });

  it("recovers to full speed once the level falls to the low set point, immediately (no arm/delay phase)", () => {
    const sim = makeTwoStageSim(0.9);
    stepThrottle(sim, 0.05, 400); // reach "stopped"
    sim.machines.get("bin").stored = 0.3 * 10; // presenter drags the level down
    stepThrottle(sim, 0.05);

    expect(sim.control[0].phase).toBe("recovering"); // commanded the same tick, no arm phase
    expect(sim.machines.get("elevator").throttleTarget).toBe(1);

    stepThrottle(sim, 0.05, 42); // consume the 1s recovery ramp
    expect(sim.machines.get("elevator").throttleFraction).toBe(1);
    expect(sim.control[0].phase).toBe("full");
  });

  it("conserves through the full slow / stop / recover cycle: the elevator never loses in-flight material", () => {
    const sim = makeTwoStageSim(0.9);
    const elevator = sim.machines.get("elevator");
    BEHAVIORS.transportDelay.apply(elevator, 0.05, 5, 5); // one packet already on the chain
    stepThrottle(sim, 0.05, 400); // slows, then stops
    expect(sim.control[0].phase).toBe("stopped");
    const inTransitAtStop = elevator.queue.reduce((a, p) => a + p.vol, 0) + elevator.backlog;
    expect(inTransitAtStop).toBeCloseTo(5); // frozen, not lost

    sim.machines.get("bin").stored = 0.3 * 10;
    stepThrottle(sim, 0.05, 2000); // recover and let the frozen packet resume and arrive
    expect(elevator.delivered).toBeGreaterThan(0);
    const stillInTransit = elevator.queue.reduce((a, p) => a + p.vol, 0) + elevator.backlog;
    expect(stillInTransit + elevator.delivered).toBeCloseTo(5); // nothing created or destroyed
  });
});

describe("live parameter changes (twoStageThrottle)", () => {
  it("a larger slow delay set on the rule takes effect on the next arm", () => {
    const sim = makeTwoStageSim(0.5);
    sim.control[0].slowDelaySec = 10;
    sim.machines.get("bin").stored = 0.65 * 10;
    stepThrottle(sim, 0.05);
    expect(sim.control[0].fireAt).toBeCloseTo(0.05 + 10);
  });

  it("changing the slow set point changes when the next arm fires", () => {
    const sim = makeTwoStageSim(0.5);
    sim.control[0].slowSetpoint = 0.4;
    stepThrottle(sim, 0.05);
    expect(sim.control[0].phase).toBe("armSlow");
  });

  it("changing the stop set point changes when the stop stage arms", () => {
    const sim = makeTwoStageSim(0.65);
    stepThrottle(sim, 0.05); // arms slow
    stepThrottle(sim, 0.05, 42); // consume the 2s slow delay -> "slowing"
    stepThrottle(sim, 0.05, 22); // consume the 1s slow ramp -> "slow"
    expect(sim.control[0].phase).toBe("slow");
    sim.control[0].stopSetpoint = 0.6; // below the current 0.65 level
    stepThrottle(sim, 0.05);
    expect(sim.control[0].phase).toBe("armStop");
  });
});

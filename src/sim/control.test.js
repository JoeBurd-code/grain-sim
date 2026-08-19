// Unit tests over control.js's pure state machine, exercised the same way
// behaviors.test.js exercises a behaviour: fabricated machine states and a
// fabricated sim shell, no real line data, no engine.js involved.
import { describe, it, expect } from "vitest";
import { initControl, stepControl, resetTrips, combineEventLogs, instrumentReadings, primeInstruments } from "./control";
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

  // Issue #45: no automatic reopen. The FD is explicit that a trip needs a
  // SCADA reset before the device can run again; only resetTrips (tested in
  // its own describe block below) ever moves a rule out of "closed" now.
  it("stays closed once the level falls past the low set point — no automatic reopen", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05, 200); // reach "closed"
    sim.machines.get("bin").stored = 0.3 * 10; // presenter drags the level down (setAccumulatorLevel)
    step(sim, 0.05, 200);
    expect(sim.control[0].phase).toBe("closed");
    expect(sim.machines.get("valve").openness).toBe(0);
  });
});

describe("resetTrips (thresholdTrip) — issue #45", () => {
  it("is a no-op outside the closed phase", () => {
    const sim = makeSim(0.5); // still "open", never tripped
    const logLenBefore = sim.control[0].log.length;
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("open");
    expect(sim.control[0].log).toHaveLength(logLenBefore);
  });

  it("re-latches rather than opening while the level is still above the high set point, logging the attempt", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05, 200); // reach "closed"
    const logLenBefore = sim.control[0].log.length;
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("closed");
    expect(sim.machines.get("valve").openness).toBe(0);
    expect(sim.control[0].log).toHaveLength(logLenBefore + 1);
    expect(sim.control[0].log.at(-1).message).toMatch(/remains latched/);
  });

  it("commands the valve open once the level has actually cleared the high set point, then ramps it there", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05, 200); // reach "closed"
    sim.machines.get("bin").stored = 0.3 * 10; // level clears, but stays latched with no reset
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("opening");
    expect(sim.machines.get("valve").opennessTarget).toBe(1);

    step(sim, 0.05, 42); // consume the ramp
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
    expect(sim.control[0].log).toHaveLength(4); // LSH crossing, slow-armed, slow-commanded, stop-commanded — no duplicates
  });

  // Issue #45: no automatic recovery. Both "slow" and "stopped" are
  // terminal now; only resetTrips (tested in its own describe block below)
  // ever moves a rule out of either.
  it("stays stopped once the level falls past the low set point — no automatic recovery", () => {
    const sim = makeTwoStageSim(0.9);
    stepThrottle(sim, 0.05, 400); // reach "stopped"
    sim.machines.get("bin").stored = 0.3 * 10; // presenter drags the level down
    stepThrottle(sim, 0.05, 400);

    expect(sim.control[0].phase).toBe("stopped");
    expect(sim.machines.get("elevator").throttleFraction).toBe(0);
  });

  it("conserves through the full slow / stop / reset-recover cycle: the elevator never loses in-flight material", () => {
    const sim = makeTwoStageSim(0.9);
    const elevator = sim.machines.get("elevator");
    BEHAVIORS.transportDelay.apply(elevator, 0.05, 5, 5); // one packet already on the chain
    stepThrottle(sim, 0.05, 400); // slows, then stops
    expect(sim.control[0].phase).toBe("stopped");
    const inTransitAtStop = elevator.queue.reduce((a, p) => a + p.vol, 0) + elevator.backlog;
    expect(inTransitAtStop).toBeCloseTo(5); // frozen, not lost

    sim.machines.get("bin").stored = 0.3 * 10;
    resetTrips(sim); // presenter clears the latch now that the level has cleared
    stepThrottle(sim, 0.05, 2000); // let the frozen packet resume and arrive
    expect(elevator.delivered).toBeGreaterThan(0);
    const stillInTransit = elevator.queue.reduce((a, p) => a + p.vol, 0) + elevator.backlog;
    expect(stillInTransit + elevator.delivered).toBeCloseTo(5); // nothing created or destroyed
  });
});

describe("resetTrips (twoStageThrottle) — issue #45", () => {
  it("is a no-op outside the slow/stopped phases", () => {
    const sim = makeTwoStageSim(0.5); // still "full", never tripped
    const logLenBefore = sim.control[0].log.length;
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("full");
    expect(sim.control[0].log).toHaveLength(logLenBefore);
  });

  it("re-latches from the slow phase while the level is still above the slow set point, logging the attempt", () => {
    const sim = makeTwoStageSim(0.65); // above slow (0.6), below stop (0.85)
    stepThrottle(sim, 0.05, 100); // reach "slow"
    expect(sim.control[0].phase).toBe("slow");
    const logLenBefore = sim.control[0].log.length;

    resetTrips(sim);
    expect(sim.control[0].phase).toBe("slow"); // re-latched, not flapped back to full
    expect(sim.machines.get("elevator").throttleFraction).toBeCloseTo(0.5);
    expect(sim.control[0].log).toHaveLength(logLenBefore + 1);
    expect(sim.control[0].log.at(-1).message).toMatch(/remains latched/);
  });

  it("re-latches from the stopped phase while the level is still above the stop set point, distinct from the slow set point", () => {
    const sim = makeTwoStageSim(0.9);
    stepThrottle(sim, 0.05, 400); // reach "stopped"
    const logLenBefore = sim.control[0].log.length;

    resetTrips(sim);
    expect(sim.control[0].phase).toBe("stopped");
    expect(sim.control[0].log).toHaveLength(logLenBefore + 1);
    expect(sim.control[0].log.at(-1).message).toMatch(/remains latched/);
  });

  it("recovers to full speed, immediately (no arm/delay phase), once the level has actually cleared the stop set point", () => {
    const sim = makeTwoStageSim(0.9);
    stepThrottle(sim, 0.05, 400); // reach "stopped"
    sim.machines.get("bin").stored = 0.3 * 10; // level clears, but stays latched with no reset
    resetTrips(sim);

    expect(sim.control[0].phase).toBe("recovering"); // commanded the same tick, no arm phase
    expect(sim.machines.get("elevator").throttleTarget).toBe(1);

    stepThrottle(sim, 0.05, 42); // consume the 1s recovery ramp
    expect(sim.machines.get("elevator").throttleFraction).toBe(1);
    expect(sim.control[0].phase).toBe("full");
  });

  it("clearing from stopped while still above the slow set point goes straight to the slow stage, never forcing full speed first", () => {
    const sim = makeTwoStageSim(0.9);
    stepThrottle(sim, 0.05, 400); // reach "stopped"
    sim.machines.get("bin").stored = 0.7 * 10; // below stopSetpoint (0.85) but still above slowSetpoint (0.6)
    resetTrips(sim);

    expect(sim.control[0].phase).toBe("slowing");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0.5); // never commanded to full speed

    stepThrottle(sim, 0.05, 22); // consume the slow ramp
    expect(sim.control[0].phase).toBe("slow");
    expect(sim.machines.get("elevator").throttleFraction).toBeCloseTo(0.5);
  });
});

// holdNextBatch (issue #25 — the treater after-bin holds the next batch):
// same shape of test as the two kinds above, fabricated machine states and a
// fabricated sim shell, no real line data. The actuator here is a batchCycle
// machine rather than a source or a transportDelay.
const HOLD_NEXT_BATCH_CFG = {
  id: "testHold",
  kind: "holdNextBatch",
  sensor: { machine: "bin" },
  highSetpoint: 0.8,
  lowSetpoint: 0.3,
  signalDelaySec: 5,
  action: { machine: "treater" },
};

function makeHoldNextBatchSim(fillFraction, { chargeM3 = 1, cycleSec = 40 } = {}) {
  const capacity = 10;
  const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
  const treater = BEHAVIORS.batchCycle.init({ sim: { chargeM3, phases: [{ name: "cycle", durationSec: cycleSec }] } });
  const machines = new Map([["bin", bin], ["treater", treater]]);
  const control = initControl({ interlocks: [HOLD_NEXT_BATCH_CFG] });
  return { t: 0, machines, control };
}

describe("initControl (holdNextBatch)", () => {
  it("builds a holdNextBatch rule starting in the released phase", () => {
    const sim = makeHoldNextBatchSim(0.5);
    expect(sim.control).toHaveLength(1);
    expect(sim.control[0].kind).toBe("holdNextBatch");
    expect(sim.control[0].phase).toBe("released");
    expect(sim.control[0].log).toEqual([]);
  });
});

describe("stepControl (holdNextBatch)", () => {
  it("does nothing while the level stays below the high set point", () => {
    const sim = makeHoldNextBatchSim(0.5);
    for (let i = 0; i < 200; i++) { sim.t += 0.05; stepControl(sim); }
    expect(sim.control[0].phase).toBe("released");
    expect(sim.machines.get("treater").blocked).toBe(false);
    expect(sim.control[0].log).toEqual([]);
  });

  it("arms a delayed hold the instant level reaches the high set point, logging the trip", () => {
    const sim = makeHoldNextBatchSim(0.8);
    sim.t += 0.05; stepControl(sim);
    expect(sim.control[0].phase).toBe("armed");
    expect(sim.control[0].log).toHaveLength(1);
    expect(sim.control[0].log[0].t).toBeCloseTo(0.05);
  });

  it("does not command the treater until the signal delay elapses", () => {
    const sim = makeHoldNextBatchSim(0.8);
    sim.t += 0.05; stepControl(sim); // arms at t=0.05, fires at t=5.05
    for (let i = 0; i < 20; i++) { sim.t += 0.05; stepControl(sim); } // t ~= 1.05
    expect(sim.machines.get("treater").blocked).toBe(false);
    expect(sim.control[0].phase).toBe("armed");
  });

  it("commands the treater to hold once the delay elapses — immediately, no ramp to wait on", () => {
    const sim = makeHoldNextBatchSim(0.8);
    sim.t += 0.05; stepControl(sim); // trip at t=0.05
    for (let i = 0; i < 105; i++) { sim.t += 0.05; stepControl(sim); } // consume the 5s delay (t ~= 5.3)
    expect(sim.control[0].phase).toBe("held");
    expect(sim.control[0].log).toHaveLength(2);
    expect(sim.machines.get("treater").blocked).toBe(true);
  });

  it("does not re-arm while already armed or held (latches, does not re-trigger)", () => {
    const sim = makeHoldNextBatchSim(0.8);
    for (let i = 0; i < 400; i++) { sim.t += 0.05; stepControl(sim); } // well past trip and delay
    expect(sim.control[0].phase).toBe("held");
    expect(sim.control[0].log).toHaveLength(2); // trip + hold, no duplicates
  });

  it("does not interrupt a batch already under way: a charge held mid-cycle when the hold commands keeps its held volume", () => {
    const sim = makeHoldNextBatchSim(0.5, { chargeM3: 1, cycleSec: 40 });
    const treater = sim.machines.get("treater");
    BEHAVIORS.batchCycle.apply(treater, 0.05, 0.4, 0.4); // mid-charge before the trip
    sim.machines.get("bin").stored = 0.8 * 10;
    for (let i = 0; i < 200; i++) { sim.t += 0.05; stepControl(sim); } // trips and holds
    expect(treater.blocked).toBe(true);
    expect(treater.held).toBeCloseTo(0.4); // untouched — the interlock only gates new capacity, apply() is what moves material
  });

  // Issue #45: no automatic release. "held" is terminal now; only
  // resetTrips (tested in its own describe block below) ever releases it.
  it("stays held once the level falls past the low set point — no automatic release", () => {
    const sim = makeHoldNextBatchSim(0.8);
    for (let i = 0; i < 400; i++) { sim.t += 0.05; stepControl(sim); } // reach "held"
    sim.machines.get("bin").stored = 0.3 * 10; // presenter drags the level down
    for (let i = 0; i < 400; i++) { sim.t += 0.05; stepControl(sim); }

    expect(sim.control[0].phase).toBe("held");
    expect(sim.machines.get("treater").blocked).toBe(true);
  });
});

describe("resetTrips (holdNextBatch) — issue #45", () => {
  it("is a no-op outside the held phase", () => {
    const sim = makeHoldNextBatchSim(0.5); // still "released", never tripped
    const logLenBefore = sim.control[0].log.length;
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("released");
    expect(sim.control[0].log).toHaveLength(logLenBefore);
  });

  it("re-latches rather than releasing while the level is still above the high set point, logging the attempt", () => {
    const sim = makeHoldNextBatchSim(0.8);
    for (let i = 0; i < 400; i++) { sim.t += 0.05; stepControl(sim); } // reach "held"
    const logLenBefore = sim.control[0].log.length;
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("held");
    expect(sim.machines.get("treater").blocked).toBe(true);
    expect(sim.control[0].log).toHaveLength(logLenBefore + 1);
    expect(sim.control[0].log.at(-1).message).toMatch(/remains latched/);
  });

  it("releases the treater, immediately (no arm/delay phase), once the level has actually cleared the high set point", () => {
    const sim = makeHoldNextBatchSim(0.8);
    for (let i = 0; i < 400; i++) { sim.t += 0.05; stepControl(sim); } // reach "held"
    sim.machines.get("bin").stored = 0.3 * 10; // level clears, but stays latched with no reset
    resetTrips(sim);

    expect(sim.control[0].phase).toBe("released");
    expect(sim.machines.get("treater").blocked).toBe(false);
    // LSH crossing, hold commanded, reset release — no LSL crossing logged
    // here since the level jump bypassed stepControl (only resetTrips ran).
    expect(sim.control[0].log).toHaveLength(3);
  });
});

describe("resetTrips (autoStartOnRunning) — issue #45", () => {
  it("is a no-op: nothing to latch or unlatch on a one-shot auto-start rule, even after it has fired", () => {
    const cfg = {
      id: "testAutoStart", kind: "autoStartOnRunning", sensor: { machine: "elevator" },
      rateM3PerSec: 1, action: { machine: "feeder" },
    };
    const elevator = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
    const feeder = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 0 } });
    const machines = new Map([["elevator", elevator], ["feeder", feeder]]);
    const control = initControl({ interlocks: [cfg] });
    const sim = { t: 0, machines, control };

    stepControl(sim); // the elevator is confirmed running by default: fires immediately
    expect(sim.control[0].phase).toBe("started");
    const logLenBefore = sim.control[0].log.length;

    resetTrips(sim);
    expect(sim.control[0].phase).toBe("started");
    expect(sim.control[0].log).toHaveLength(logLenBefore);
  });
});

// thresholdStopTrip (issue #47 — the metal bins' own high-level trips):
// same fabricated-sim shape as the kinds above, except the actuator is a
// routedTransportDelay machine (the packaging conveyor) rather than a
// source, so the rule commands a speed fraction, not open/close.
const STOP_TRIP_CFG = {
  id: "testStopTrip",
  kind: "thresholdStopTrip",
  sensor: { machine: "bin" },
  highSetpoint: 0.8,
  lowSetpoint: 0.3,
  signalDelaySec: 5,
  action: { machine: "conveyor", rampTimeSec: 0 },
};

function makeStopTripSim(fillFraction) {
  const capacity = 10;
  const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
  const conveyor = BEHAVIORS.routedTransportDelay.init({
    sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 },
    ports: { outputs: ["a"] },
  });
  const machines = new Map([["bin", bin], ["conveyor", conveyor]]);
  const control = initControl({ interlocks: [STOP_TRIP_CFG] });
  return { t: 0, machines, control };
}

// Mirrors the file's own top-level step() helper: the conveyor's own
// apply() is what actually slews throttleFraction toward whatever
// stepControl last commanded — stepControl only issues the command.
function stepConveyor(sim, dt, n = 1) {
  for (let i = 0; i < n; i++) {
    BEHAVIORS.routedTransportDelay.apply(sim.machines.get("conveyor"), dt, 0, Infinity);
    sim.t += dt;
    stepControl(sim);
  }
}

describe("initControl (thresholdStopTrip)", () => {
  it("builds a thresholdStopTrip rule starting in the running phase", () => {
    const sim = makeStopTripSim(0.5);
    expect(sim.control).toHaveLength(1);
    expect(sim.control[0].kind).toBe("thresholdStopTrip");
    expect(sim.control[0].phase).toBe("running");
  });
});

describe("stepControl (thresholdStopTrip)", () => {
  it("does nothing while the level stays below the high set point", () => {
    const sim = makeStopTripSim(0.5);
    for (let i = 0; i < 200; i++) { sim.t += 0.05; stepControl(sim); }
    expect(sim.control[0].phase).toBe("running");
    expect(sim.machines.get("conveyor").throttleTarget).toBe(1);
  });

  it("commands the conveyor to a stop once the signal delay elapses, and it latches settled", () => {
    const sim = makeStopTripSim(0.8);
    stepConveyor(sim, 0.05, 200); // well past the 5s delay
    expect(sim.control[0].phase).toBe("stopped");
    expect(sim.machines.get("conveyor").throttleTarget).toBe(0);
  });

  it("stays stopped once the level falls back past the low set point — no automatic reopen", () => {
    const sim = makeStopTripSim(0.8);
    stepConveyor(sim, 0.05, 200);
    sim.machines.get("bin").stored = 0.2 * 10;
    stepConveyor(sim, 0.05, 200);
    expect(sim.control[0].phase).toBe("stopped");
  });
});

describe("resetTrips (thresholdStopTrip) — issue #45", () => {
  it("re-latches while the level is still tripped, then recovers once it has actually cleared", () => {
    const sim = makeStopTripSim(0.8);
    stepConveyor(sim, 0.05, 200); // reach "stopped"

    resetTrips(sim);
    expect(sim.control[0].phase).toBe("stopped"); // still above highSetpoint, re-latches
    expect(sim.control[0].log.at(-1).message).toMatch(/remains latched/);

    sim.machines.get("bin").stored = 0.3 * 10;
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("recovering");
    expect(sim.machines.get("conveyor").throttleTarget).toBe(1);
  });
});

// autoStopOnNotRunning (issue #47 — the FD's own reverse-direction PI
// "conveyor not running" on both packaging drum feeders): the mirror of
// autoStartOnRunning, driven off `confirmedRunning` rather than a level.
function makeAutoStopSim() {
  const cfg = {
    id: "testAutoStop", kind: "autoStopOnNotRunning", sensor: { machine: "conveyor" },
    signalDelaySec: 1, action: { machine: "feeder" },
  };
  const conveyor = BEHAVIORS.routedTransportDelay.init({
    sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 },
    ports: { outputs: ["a"] },
  });
  const feeder = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 1 } });
  const machines = new Map([["conveyor", conveyor], ["feeder", feeder]]);
  const control = initControl({ interlocks: [cfg] });
  return { t: 0, machines, control };
}

describe("stepControl (autoStopOnNotRunning)", () => {
  it("does nothing while the conveyor is confirmed running", () => {
    const sim = makeAutoStopSim();
    for (let i = 0; i < 60; i++) { sim.t += 0.05; stepControl(sim); }
    expect(sim.control[0].phase).toBe("running");
    expect(sim.machines.get("feeder").runPermit).toBe(true);
  });

  it("stops the feeder's run permit 1s after the conveyor stops being confirmed running", () => {
    const sim = makeAutoStopSim();
    const conveyor = sim.machines.get("conveyor");
    BEHAVIORS.routedTransportDelay.command(conveyor, 0, 0); // instantly not running
    for (let i = 0; i < 19; i++) { sim.t += 0.05; stepControl(sim); } // 0.95s, short of the 1s delay
    expect(sim.machines.get("feeder").runPermit).toBe(true);

    for (let i = 0; i < 5; i++) { sim.t += 0.05; stepControl(sim); } // past 1s
    expect(sim.machines.get("feeder").runPermit).toBe(false);
    expect(sim.control[0].phase).toBe("stopped");
  });

  it("re-enables the feeder the instant the conveyor is confirmed running again — no reset needed (a plain PI, not a trip)", () => {
    const sim = makeAutoStopSim();
    const conveyor = sim.machines.get("conveyor");
    BEHAVIORS.routedTransportDelay.command(conveyor, 0, 0);
    for (let i = 0; i < 40; i++) { sim.t += 0.05; stepControl(sim); } // stopped
    expect(sim.machines.get("feeder").runPermit).toBe(false);

    BEHAVIORS.routedTransportDelay.command(conveyor, 1, 0);
    sim.t += 0.05; stepControl(sim);
    expect(sim.machines.get("feeder").runPermit).toBe(true);
    expect(sim.control[0].phase).toBe("running");
  });

  it("never touches the feeder's own `enabled` gate — that stays the source selector's alone", () => {
    const sim = makeAutoStopSim();
    sim.machines.get("feeder").enabled = false; // e.g. deselected by the source selector
    const conveyor = sim.machines.get("conveyor");
    BEHAVIORS.routedTransportDelay.command(conveyor, 0, 0);
    for (let i = 0; i < 40; i++) { sim.t += 0.05; stepControl(sim); }
    expect(sim.machines.get("feeder").enabled).toBe(false); // untouched
    expect(sim.machines.get("feeder").runPermit).toBe(false); // this rule's own gate did move
  });
});

describe("resetTrips (autoStopOnNotRunning) — issue #45", () => {
  it("is a no-op: a plain PI has nothing for a SCADA reset to latch or unlatch", () => {
    const sim = makeAutoStopSim();
    const conveyor = sim.machines.get("conveyor");
    BEHAVIORS.routedTransportDelay.command(conveyor, 0, 0);
    for (let i = 0; i < 40; i++) { sim.t += 0.05; stepControl(sim); }
    const logLenBefore = sim.control[0].log.length;
    resetTrips(sim);
    expect(sim.control[0].log).toHaveLength(logLenBefore);
    expect(sim.machines.get("feeder").runPermit).toBe(false); // still gated by the live condition, not by reset
  });
});

// Arming (issue #47): a rule's own `armedWhen` gates whether stepControl
// evaluates it at all, generically, for any rule kind — exercised here
// against thresholdStopTrip since that's the kind the real line actually
// arms, but the mechanism itself (isArmed, control.js) doesn't know or care
// which kind it's guarding.
describe("arming (armedWhen)", () => {
  function makeArmedStopTripSim(fillFraction, selectedPort) {
    const capacity = 10;
    const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
    const conveyor = BEHAVIORS.routedTransportDelay.init({
      sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 },
      ports: { outputs: ["metalBin1", "metalBin2"] },
    });
    const router = BEHAVIORS.router.init({ sim: {}, ports: { outputs: ["metalBin1", "metalBin2"] } });
    BEHAVIORS.router.selectPort(router, selectedPort);
    const cfg = { ...STOP_TRIP_CFG, armedWhen: [{ machine: "router", port: "metalBin1" }] };
    const machines = new Map([["bin", bin], ["conveyor", conveyor], ["router", router]]);
    const control = initControl({ interlocks: [cfg] });
    return { t: 0, machines, control };
  }

  it("a disarmed rule never trips, however high the level runs", () => {
    const sim = makeArmedStopTripSim(0.95, "metalBin2"); // router points elsewhere
    for (let i = 0; i < 400; i++) { sim.t += 0.05; stepControl(sim); }
    expect(sim.control[0].phase).toBe("running"); // never even armed
    expect(sim.control[0].log).toEqual([]); // and never logged
    expect(sim.machines.get("conveyor").throttleTarget).toBe(1);
  });

  it("an armed rule trips exactly as an unarmed-concept thresholdStopTrip would", () => {
    const sim = makeArmedStopTripSim(0.95, "metalBin1"); // router points at this rule's own port
    stepConveyor(sim, 0.05, 200);
    expect(sim.control[0].phase).toBe("stopped");
    expect(sim.machines.get("conveyor").throttleTarget).toBe(0);
  });

  it("becoming disarmed mid-trip freezes the rule's own phase but does not touch what it already commanded", () => {
    const sim = makeArmedStopTripSim(0.95, "metalBin1");
    stepConveyor(sim, 0.05, 200); // trips and stops the conveyor
    expect(sim.control[0].phase).toBe("stopped");

    BEHAVIORS.router.selectPort(sim.machines.get("router"), "metalBin2"); // presenter switches away
    stepConveyor(sim, 0.05, 200); // now disarmed
    expect(sim.control[0].phase).toBe("stopped"); // frozen, not auto-cleared
    expect(sim.machines.get("conveyor").throttleTarget).toBe(0); // the trip's own command still stands
  });

  // Code-review finding on issue #47's own first landing: `fireAt` is an
  // absolute simulated-time deadline. Disarming mid-countdown (before it
  // ever fires) used to just freeze the rule in "armed" with that deadline
  // still sitting in the past by the time it was re-armed later, so the
  // very next tick after re-arming would fire immediately instead of
  // waiting a fresh signalDelaySec — see disarmThresholdStopTrip's own
  // comment in control.js.
  it("disarming before the delay has elapsed cancels the pending timer, so re-arming later waits a fresh full delay rather than firing instantly", () => {
    const sim = makeArmedStopTripSim(0.95, "metalBin1"); // armed from t=0, fireAt ~= 5.05
    stepConveyor(sim, 0.05, 40); // 2s in, still short of the 5s delay
    expect(sim.control[0].phase).toBe("armed");

    BEHAVIORS.router.selectPort(sim.machines.get("router"), "metalBin2"); // disarm mid-countdown
    stepConveyor(sim, 0.05, 160); // 8s more (10s total) — well past where the frozen fireAt would have fired
    expect(sim.control[0].phase).toBe("running"); // cancelled, not just frozen mid-"armed"
    expect(sim.machines.get("conveyor").throttleTarget).toBe(1); // never actually commanded

    BEHAVIORS.router.selectPort(sim.machines.get("router"), "metalBin1"); // re-arm
    stepConveyor(sim, 0.05, 80); // 4s — short of a *fresh* 5s delay
    expect(sim.control[0].phase).toBe("armed"); // still counting down, not already fired
    expect(sim.machines.get("conveyor").throttleTarget).toBe(1);

    stepConveyor(sim, 0.05, 40); // past the fresh 5s (9s since re-arming) — fires and settles (near-instant ramp)
    expect(sim.control[0].phase).toBe("stopped");
    expect(sim.machines.get("conveyor").throttleTarget).toBe(0);
  });

  it("a rule with no armedWhen at all is always armed, unchanged from every rule authored before issue #47", () => {
    const sim = makeSim(0.9); // the plain thresholdTrip fixture at the top of this file, no armedWhen
    step(sim, 0.05, 200);
    expect(sim.control[0].phase).not.toBe("open"); // it tripped normally
  });

  it("armedWhen with multiple conditions requires all of them, matching a metal bin's real two-router arming", () => {
    const capacity = 10;
    const bin = { kind: "accumulator", capacity, stored: 0.95 * capacity, initialStored: 0, spill: 0 };
    const conveyor = BEHAVIORS.routedTransportDelay.init({
      sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 },
      ports: { outputs: ["outBuffer", "outConcetti"] },
    });
    const diverter = BEHAVIORS.router.init({ sim: {}, ports: { outputs: ["out1", "out2"] } });
    const cfg = {
      ...STOP_TRIP_CFG,
      armedWhen: [{ machine: "conveyor", port: "outBuffer" }, { machine: "diverter", port: "out1" }],
    };
    const machines = new Map([["bin", bin], ["conveyor", conveyor], ["diverter", diverter]]);
    const control = initControl({ interlocks: [cfg] });
    const sim = { t: 0, machines, control };

    // conveyor routed to outBuffer (satisfies one condition), diverter still
    // defaulted to out1 (satisfies the other) -> armed.
    BEHAVIORS.routedTransportDelay.selectPort(conveyor, "outBuffer");
    for (let i = 0; i < 200; i++) { sim.t += 0.05; stepControl(sim); } // armed, delay elapses, command fires
    expect(sim.control[0].phase).toBe("stopping"); // both conditions hold: it did trip
    expect(sim.machines.get("conveyor").throttleTarget).toBe(0);

    // Now point the conveyor at Concetti instead: only one of the two
    // conditions holds, so the rule must disarm even though the diverter
    // itself still points at bin 1 (a presenter staging a bin's level while
    // routed elsewhere must never trip the conveyor).
    const sim2 = (() => {
      const bin2 = { kind: "accumulator", capacity, stored: 0.95 * capacity, initialStored: 0, spill: 0 };
      const conveyor2 = BEHAVIORS.routedTransportDelay.init({
        sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 },
        ports: { outputs: ["outBuffer", "outConcetti"] },
      });
      BEHAVIORS.routedTransportDelay.selectPort(conveyor2, "outConcetti");
      const diverter2 = BEHAVIORS.router.init({ sim: {}, ports: { outputs: ["out1", "out2"] } });
      const machines2 = new Map([["bin", bin2], ["conveyor", conveyor2], ["diverter", diverter2]]);
      const control2 = initControl({ interlocks: [cfg] });
      return { t: 0, machines: machines2, control: control2 };
    })();
    for (let i = 0; i < 200; i++) { sim2.t += 0.05; stepControl(sim2); }
    expect(sim2.control[0].phase).toBe("running"); // never armed
  });
});

describe("live parameter changes (holdNextBatch)", () => {
  it("a larger signal delay set on the rule takes effect on the next trip", () => {
    const sim = makeHoldNextBatchSim(0.5);
    sim.control[0].signalDelaySec = 10;
    sim.machines.get("bin").stored = 0.8 * 10;
    sim.t += 0.05; stepControl(sim);
    expect(sim.control[0].fireAt).toBeCloseTo(0.05 + 10);
  });

  it("changing the high set point changes when the next trip arms", () => {
    const sim = makeHoldNextBatchSim(0.5);
    sim.control[0].highSetpoint = 0.4;
    sim.t += 0.05; stepControl(sim);
    expect(sim.control[0].phase).toBe("armed");
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

// Issue #29: the combined, machine-tagged event list is a pure derivation
// over fabricated rule logs, same shape of test as the rest of this file,
// no engine.js, no real line data, no sim stepping needed.
describe("combineEventLogs", () => {
  it("merges every rule's log into one chronological list, each entry tagged with its source machine", () => {
    const rules = [
      {
        sensorId: "bufferBin",
        log: [
          { t: 5, message: "high set point reached at 60%, closing signal armed" },
          { t: 12, message: "valve commanded closed (ramping over 2s)" },
        ],
      },
      {
        sensorId: "preBin",
        log: [{ t: 8, message: "slow set point reached at 65%, slow-down signal armed" }],
      },
    ];
    const machineNames = new Map([["bufferBin", "TREATER BUFFER BIN"], ["preBin", "TREATER PRE-BIN"]]);

    const combined = combineEventLogs(rules, machineNames);

    expect(combined.map((e) => e.t)).toEqual([5, 8, 12]);
    expect(combined[0]).toMatchObject({
      machineId: "bufferBin",
      machineName: "TREATER BUFFER BIN",
      message: "high set point reached at 60%, closing signal armed",
    });
    expect(combined[1]).toMatchObject({ machineId: "preBin", machineName: "TREATER PRE-BIN" });
    expect(combined[2]).toMatchObject({ machineId: "bufferBin", machineName: "TREATER BUFFER BIN" });
  });

  it("returns an empty list when no rule has logged anything", () => {
    const rules = [{ sensorId: "bufferBin", log: [] }, { sensorId: "preBin", log: [] }];
    expect(combineEventLogs(rules, new Map())).toEqual([]);
  });

  it("preserves each rule log's own entries untouched, only adding machine tags", () => {
    const entry = { t: 3, message: "level cleared" };
    const rules = [{ sensorId: "afterBin", log: [entry] }];
    const [combined] = combineEventLogs(rules, new Map([["afterBin", "TREATER AFTER-BIN"]]));
    expect(combined.t).toBe(3);
    expect(combined.message).toBe("level cleared");
  });
});

// Issue #30: per-instrument (LT/LSH/LSL) live state — setpoint, tripped,
// and the pulse-animation edge counter — derived from a rule's own fields
// and its sensor's current level. Same fabricated-rule-state pattern as the
// phase-machine tests above: no engine.js, no real line data, no rendering.
describe("instrumentReadings", () => {
  it("is a pure function of rule state and level: LSH trips at-or-above its high set point", () => {
    const rule = { kind: "thresholdTrip", highSetpoint: 0.85, lowSetpoint: 0.35 };
    expect(instrumentReadings(rule, 0.5).LSH).toEqual({ setpoint: 0.85, tripped: false });
    expect(instrumentReadings(rule, 0.85).LSH).toEqual({ setpoint: 0.85, tripped: true });
    expect(instrumentReadings(rule, 0.9).LSH).toEqual({ setpoint: 0.85, tripped: true });
  });

  it("LSL trips at-or-below its low set point", () => {
    const rule = { kind: "thresholdTrip", highSetpoint: 0.85, lowSetpoint: 0.35 };
    expect(instrumentReadings(rule, 0.5).LSL).toEqual({ setpoint: 0.35, tripped: false });
    expect(instrumentReadings(rule, 0.35).LSL).toEqual({ setpoint: 0.35, tripped: true });
    expect(instrumentReadings(rule, 0.1).LSL).toEqual({ setpoint: 0.35, tripped: true });
  });

  it("ignores phase/fireAt entirely: a rule mid-delay still reads tripped straight off the current level", () => {
    const rule = { kind: "thresholdTrip", highSetpoint: 0.85, lowSetpoint: 0.35, phase: "delayedClose", fireAt: 999 };
    expect(instrumentReadings(rule, 0.9).LSH.tripped).toBe(true);
  });

  it("twoStageThrottle's LSH reads the stop set point, not the slow set point — the FD names LSH0 as the stop stage's switch", () => {
    const rule = { kind: "twoStageThrottle", lowSetpoint: 0.35, slowSetpoint: 0.6, stopSetpoint: 0.85 };
    expect(instrumentReadings(rule, 0.7)).toEqual({
      LSH: { setpoint: 0.85, tripped: false },
      LSL: { setpoint: 0.35, tripped: false },
    });
    expect(instrumentReadings(rule, 0.85).LSH.tripped).toBe(true); // stop set point crossed
  });

  it("holdNextBatch reads highSetpoint/lowSetpoint directly, same as thresholdTrip", () => {
    const rule = { kind: "holdNextBatch", highSetpoint: 0.6, lowSetpoint: 0.2 };
    expect(instrumentReadings(rule, 0.65).LSH.tripped).toBe(true);
    expect(instrumentReadings(rule, 0.15).LSL.tripped).toBe(true);
  });

  it("returns no entries for a rule kind with no declared instrument fields", () => {
    expect(instrumentReadings({ kind: "unknownKind" }, 0.5)).toEqual({});
  });
});

describe("stepControl publishes rule.instruments with a one-time pulse edge", () => {
  it("primes tripped=false and pulseGen=0 on a rule that starts below both set points", () => {
    const sim = makeSim(0.5);
    step(sim, 0.05);
    expect(sim.control[0].instruments.LSH).toEqual({ code: "LSH", setpoint: 0.8, tripped: false, pulseGen: 0 });
    expect(sim.control[0].instruments.LSL).toEqual({ code: "LSL", setpoint: 0.3, tripped: false, pulseGen: 0 });
  });

  it("increments pulseGen exactly once on the tick the level crosses the high set point, independent of the signal delay", () => {
    const sim = makeSim(0.5);
    step(sim, 0.05, 10); // still below the set point
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(0);

    sim.machines.get("bin").stored = 0.8 * 10; // presenter drags the level straight to the trip point
    step(sim, 0.05); // LSH trips this tick; the actuator's own close is still 3s away
    expect(sim.control[0].instruments.LSH.tripped).toBe(true);
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(1);
    expect(sim.control[0].phase).toBe("delayedClose"); // the slow actuator path, unaffected

    step(sim, 0.05, 10); // stays tripped — no second pulse while it holds
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(1);
  });

  it("un-trips (and is ready to pulse again) the instant the level recrosses back, with no memory of the delayed actuator phase", () => {
    const sim = makeSim(0.8);
    step(sim, 0.05); // trips
    expect(sim.control[0].instruments.LSH.tripped).toBe(true);

    sim.machines.get("bin").stored = 0.5 * 10; // recrosses before the 3s signal delay even elapses
    step(sim, 0.05);
    expect(sim.control[0].instruments.LSH.tripped).toBe(false);
    expect(sim.control[0].phase).toBe("delayedClose"); // the latched actuator command still fires later

    sim.machines.get("bin").stored = 0.8 * 10; // trips again
    step(sim, 0.05);
    expect(sim.control[0].instruments.LSH.tripped).toBe(true);
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(2); // second distinct trip, second pulse
  });
});

describe("primeInstruments", () => {
  it("seeds every rule's instrument state from the sensor's initial level before any tick, with no pulse even if it starts already tripped", () => {
    const capacity = 10;
    const bin = { kind: "accumulator", capacity, stored: 0.9 * capacity, initialStored: 0, spill: 0 };
    const machines = new Map([["bin", bin], ["valve", BEHAVIORS.source.init({ sim: { rateM3PerSec: 5 } })]]);
    const control = initControl({ interlocks: [RULE_CFG] });

    primeInstruments(control, machines);

    expect(control[0].instruments.LSH).toEqual({ code: "LSH", setpoint: 0.8, tripped: true, pulseGen: 0 });
  });

  it("a subsequent real step does not re-pulse a rule primed already-tripped, since nothing changed", () => {
    const capacity = 10;
    const bin = { kind: "accumulator", capacity, stored: 0.9 * capacity, initialStored: 0, spill: 0 };
    const valve = BEHAVIORS.source.init({ sim: { rateM3PerSec: 5 } });
    const machines = new Map([["bin", bin], ["valve", valve]]);
    const control = initControl({ interlocks: [RULE_CFG] });
    primeInstruments(control, machines);

    const sim = { t: 0, machines, control };
    step(sim, 0.05);

    expect(sim.control[0].instruments.LSH).toEqual({ code: "LSH", setpoint: 0.8, tripped: true, pulseGen: 0 });
  });
});

// gradedFeedSchedule (issue #58 — the graded feed-rate schedule + latched
// LSHH trip): same fabricated-sim shape as the kinds above, but this rule
// commands two actuators (an elevator's speed throttle, a feeder's gate
// throttle) to one of three non-latching bands, plus one latched trip phase
// on top — the real Speed% x Gate% mechanism issues #56/#57 introduced. No
// engine.js, no real line data, standalone per issue #58's own scope.
const GRADED_FEED_SCHEDULE_CFG = {
  id: "testSchedule",
  kind: "gradedFeedSchedule",
  sensor: { machine: "bin" },
  lowSetpoint: 0.35,
  highSetpoint: 0.85,
  highHighSetpoint: 0.95,
  boost: { speedFraction: 1, gateFraction: 1, delaySec: 1, rampTimeSec: 1 },
  normal: { speedFraction: 0.85, gateFraction: 0.55, delaySec: 1, rampTimeSec: 1 },
  throttle: { speedFraction: 0.6, gateFraction: 0.4, delaySec: 1, rampTimeSec: 1 },
  trip: { delaySec: 2, rampTimeSec: 1 },
  action: { elevator: { machine: "elevator" }, feeder: { machine: "feeder" } },
};

function makeGradedFeedScheduleSim(fillFraction) {
  const capacity = 10;
  const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
  const elevator = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
  const feeder = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 1, hasGate: true } });
  const machines = new Map([["bin", bin], ["elevator", elevator], ["feeder", feeder]]);
  const control = initControl({ interlocks: [GRADED_FEED_SCHEDULE_CFG] });
  return { t: 0, machines, control };
}

// Mirrors the file's own top-level step()/stepThrottle() helpers: both
// actuators' own apply() are what actually slew their throttle fractions
// toward whatever stepControl last commanded.
function stepSchedule(sim, dt, n = 1) {
  for (let i = 0; i < n; i++) {
    BEHAVIORS.transportDelay.apply(sim.machines.get("elevator"), dt, 0, Infinity);
    BEHAVIORS.meteredFeeder.apply(sim.machines.get("feeder"), dt, 0, Infinity);
    sim.t += dt;
    stepControl(sim);
  }
}

describe("initControl (gradedFeedSchedule)", () => {
  it("builds a gradedFeedSchedule rule starting in the boost band — the band level 0 always falls in", () => {
    const sim = makeGradedFeedScheduleSim(0.1);
    expect(sim.control).toHaveLength(1);
    expect(sim.control[0].kind).toBe("gradedFeedSchedule");
    expect(sim.control[0].phase).toBe("boost");
    expect(sim.control[0].log).toEqual([]);
  });
});

describe("stepControl (gradedFeedSchedule) — non-latching bands", () => {
  it("does nothing while the level stays in the boost band, already matching both actuators' defaults", () => {
    const sim = makeGradedFeedScheduleSim(0.1); // below lowSetpoint (0.35): the first tick logs the LSL crossing itself, nothing else
    stepSchedule(sim, 0.05, 200);
    expect(sim.control[0].phase).toBe("boost");
    expect(sim.control[0].log).toHaveLength(1);
    expect(sim.control[0].log[0].message).toMatch(/LSL set point reached/);
    expect(sim.machines.get("elevator").throttleTarget).toBe(1);
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(1);
  });

  it("arms toward normal the instant the level enters the low-high band, then commands both actuators once the delay elapses", () => {
    const sim = makeGradedFeedScheduleSim(0.5); // between lowSetpoint (0.35) and highSetpoint (0.85)
    stepSchedule(sim, 0.05);
    expect(sim.control[0].phase).toBe("armingNormal");
    expect(sim.control[0].log).toHaveLength(1);

    stepSchedule(sim, 0.05, 22); // consume the 1s band delay
    expect(sim.control[0].phase).toBe("normal");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0.85);
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(0.55);

    stepSchedule(sim, 0.05, 22); // consume the 1s ramp
    expect(sim.machines.get("elevator").throttleFraction).toBeCloseTo(0.85);
    expect(sim.machines.get("feeder").gateThrottleFraction).toBeCloseTo(0.55);
  });

  it("arms toward throttle the instant the level rises above the high set point, then commands it", () => {
    const sim = makeGradedFeedScheduleSim(0.9); // above highSetpoint (0.85), below highHighSetpoint (0.95)
    stepSchedule(sim, 0.05);
    expect(sim.control[0].phase).toBe("armingThrottle");

    stepSchedule(sim, 0.05, 22);
    expect(sim.control[0].phase).toBe("throttle");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0.6);
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(0.4);
  });

  it("tracks back down freely: throttle -> normal -> boost, with no latching between bands", () => {
    const sim = makeGradedFeedScheduleSim(0.9);
    stepSchedule(sim, 0.05, 80); // settles at throttle
    expect(sim.control[0].phase).toBe("throttle");

    sim.machines.get("bin").stored = 0.5 * 10; // presenter drags the level back down into normal
    stepSchedule(sim, 0.05, 80);
    expect(sim.control[0].phase).toBe("normal");
    expect(sim.machines.get("elevator").throttleFraction).toBeCloseTo(0.85);
    expect(sim.machines.get("feeder").gateThrottleFraction).toBeCloseTo(0.55);

    sim.machines.get("bin").stored = 0.1 * 10; // further down into boost
    stepSchedule(sim, 0.05, 80);
    expect(sim.control[0].phase).toBe("boost");
    expect(sim.machines.get("elevator").throttleFraction).toBeCloseTo(1);
    expect(sim.machines.get("feeder").gateThrottleFraction).toBeCloseTo(1);
  });

  it("cancels an in-flight arm instantly, with no actuator command ever issued, if the level returns to the already-settled band before the delay elapses", () => {
    const sim = makeGradedFeedScheduleSim(0.1); // settled at boost
    sim.machines.get("bin").stored = 0.5 * 10; // rises into normal
    stepSchedule(sim, 0.05); // arms toward normal
    expect(sim.control[0].phase).toBe("armingNormal");

    sim.machines.get("bin").stored = 0.1 * 10; // drops back to boost before the 1s delay elapses
    stepSchedule(sim, 0.05);
    expect(sim.control[0].phase).toBe("boost"); // reverted instantly, not still counting down
    // The cancel itself is silent (no "commanded to ..." entry) — only the
    // arm itself and the LSL/LSH instrument dot's own crossings ever log
    // here, same as any other tick that moves the live level.
    expect(sim.control[0].log.some((e) => e.message.includes("commanded"))).toBe(false);
    expect(sim.machines.get("elevator").throttleTarget).toBe(1); // never actually commanded to normal
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(1);
  });

  it("re-targets an in-flight arm with a fresh delay if the level moves to a third band before it fires", () => {
    const sim = makeGradedFeedScheduleSim(0.1); // settled at boost
    sim.machines.get("bin").stored = 0.5 * 10; // rises into normal
    stepSchedule(sim, 0.05); // arms toward normal, fireAt ~= 1.05
    expect(sim.control[0].phase).toBe("armingNormal");
    stepSchedule(sim, 0.05, 4); // 0.2s more, still short of the 1s delay, level unchanged

    sim.machines.get("bin").stored = 0.9 * 10; // carries on up into throttle before normal ever fired
    stepSchedule(sim, 0.05);
    expect(sim.control[0].phase).toBe("armingThrottle"); // re-targeted, not fired toward normal
    expect(sim.machines.get("elevator").throttleTarget).toBe(1); // normal was never actually commanded

    stepSchedule(sim, 0.05, 22); // consume the fresh 1s delay
    expect(sim.control[0].phase).toBe("throttle");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0.6);
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(0.4);
  });
});

describe("stepControl (gradedFeedSchedule) — latched LSHH trip", () => {
  it("commands the elevator to a full stop once the trip delay elapses, and latches once settled — the feeder gate is left untouched", () => {
    const sim = makeGradedFeedScheduleSim(0.97); // above highHighSetpoint (0.95)
    stepSchedule(sim, 0.05, 200); // well past the 2s trip delay and 1s ramp
    expect(sim.control[0].phase).toBe("tripped");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0);
    expect(sim.machines.get("elevator").throttleFraction).toBe(0);
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(1); // never touched by the trip
    expect(sim.machines.get("feeder").gateThrottleFraction).toBe(1);
  });

  it("an armed trip immediately cancels an in-flight band arm and always wins over the bands underneath it", () => {
    const sim = makeGradedFeedScheduleSim(0.5);
    stepSchedule(sim, 0.05); // arms toward normal
    expect(sim.control[0].phase).toBe("armingNormal");
    stepSchedule(sim, 0.05, 4); // 0.2s more, well short of the 1s band delay

    sim.machines.get("bin").stored = 0.97 * 10; // level jumps straight to the high-high set point
    stepSchedule(sim, 0.05);
    expect(sim.control[0].phase).toBe("armingTrip"); // cancels the band arm outright

    stepSchedule(sim, 0.05, 80); // consume the 2s trip delay and 1s ramp
    expect(sim.control[0].phase).toBe("tripped");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0);
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(1); // normal was never actually committed
  });

  it("stays tripped once the level falls back below high-high — no automatic reopen or resumed band", () => {
    const sim = makeGradedFeedScheduleSim(0.97);
    stepSchedule(sim, 0.05, 200); // reach "tripped"
    sim.machines.get("bin").stored = 0.5 * 10; // presenter drags the level back down
    stepSchedule(sim, 0.05, 200);
    expect(sim.control[0].phase).toBe("tripped");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0);
  });
});

describe("resetTrips (gradedFeedSchedule) — issue #58", () => {
  it("is a no-op outside the tripped phase", () => {
    const sim = makeGradedFeedScheduleSim(0.5); // still tracking bands, never tripped
    const logLenBefore = sim.control[0].log.length;
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("boost");
    expect(sim.control[0].log).toHaveLength(logLenBefore);
  });

  it("re-latches rather than resuming while the level is still at/above high-high, logging the attempt", () => {
    const sim = makeGradedFeedScheduleSim(0.97);
    stepSchedule(sim, 0.05, 200); // reach "tripped"
    const logLenBefore = sim.control[0].log.length;
    resetTrips(sim);
    expect(sim.control[0].phase).toBe("tripped");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0);
    expect(sim.control[0].log).toHaveLength(logLenBefore + 1);
    expect(sim.control[0].log.at(-1).message).toMatch(/remains latched/);
  });

  it("resumes the band the live level currently falls into once cleared — normal, not a fixed boost state", () => {
    const sim = makeGradedFeedScheduleSim(0.97);
    stepSchedule(sim, 0.05, 200); // reach "tripped"
    sim.machines.get("bin").stored = 0.5 * 10; // clears highHigh, lands in the normal band
    resetTrips(sim);

    expect(sim.control[0].phase).toBe("recovering");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0.85);
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(0.55);

    stepSchedule(sim, 0.05, 22); // consume the ramp
    expect(sim.control[0].phase).toBe("normal");
  });

  it("resumes into throttle when the level clears high-high but is still above the high set point", () => {
    const sim = makeGradedFeedScheduleSim(0.97);
    stepSchedule(sim, 0.05, 200); // reach "tripped"
    sim.machines.get("bin").stored = 0.9 * 10; // below highHighSetpoint (0.95), above highSetpoint (0.85)
    resetTrips(sim);

    expect(sim.control[0].phase).toBe("recovering");
    expect(sim.machines.get("elevator").throttleTarget).toBe(0.6);
    expect(sim.machines.get("feeder").gateThrottleTarget).toBe(0.4);

    stepSchedule(sim, 0.05, 22);
    expect(sim.control[0].phase).toBe("throttle");
  });
});

describe("instrumentReadings (gradedFeedSchedule)", () => {
  it("reads three codes — LSL, LSH, LSHH — LSHH tripping at-or-above its own set point, distinct from LSH", () => {
    const rule = { kind: "gradedFeedSchedule", lowSetpoint: 0.35, highSetpoint: 0.85, highHighSetpoint: 0.95 };
    expect(instrumentReadings(rule, 0.9)).toEqual({
      LSL: { setpoint: 0.35, tripped: false },
      LSH: { setpoint: 0.85, tripped: true },
      LSHH: { setpoint: 0.95, tripped: false },
    });
    expect(instrumentReadings(rule, 0.95).LSHH.tripped).toBe(true);
  });
});

// Arming (gradedFeedSchedule): same armedWhen mechanism exercised in the
// "arming (armedWhen)" describe block above (thresholdStopTrip), but this
// kind has several distinct pending-timer phases of its own (three band
// arms, plus the trip arm) — disarmGradedFeedSchedule must cancel any of
// them, not just one. Not used by the real line yet (issue #58 is
// standalone), but declared defensively, same as every other cancellable-arm
// kind in this file.
function makeArmedGradedFeedScheduleSim(fillFraction, selectedPort) {
  const capacity = 10;
  const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
  const elevator = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
  const feeder = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 1, hasGate: true } });
  const router = BEHAVIORS.router.init({ sim: {}, ports: { outputs: ["thisBin", "elsewhere"] } });
  BEHAVIORS.router.selectPort(router, selectedPort);
  const cfg = { ...GRADED_FEED_SCHEDULE_CFG, armedWhen: [{ machine: "router", port: "thisBin" }] };
  const machines = new Map([["bin", bin], ["elevator", elevator], ["feeder", feeder], ["router", router]]);
  const control = initControl({ interlocks: [cfg] });
  return { t: 0, machines, control };
}

describe("arming (armedWhen) — gradedFeedSchedule", () => {
  it("disarming mid band-arm cancels the pending arm back to the settled band, with no command ever issued", () => {
    const sim = makeArmedGradedFeedScheduleSim(0.5, "thisBin");
    stepSchedule(sim, 0.05); // arms toward normal
    expect(sim.control[0].phase).toBe("armingNormal");

    BEHAVIORS.router.selectPort(sim.machines.get("router"), "elsewhere"); // disarm mid-countdown
    stepSchedule(sim, 0.05, 40); // 2s more — well past where the frozen fireAt would have fired
    expect(sim.control[0].phase).toBe("boost"); // cancelled, not just frozen mid-"armingNormal"
    expect(sim.machines.get("elevator").throttleTarget).toBe(1); // never actually commanded

    BEHAVIORS.router.selectPort(sim.machines.get("router"), "thisBin"); // re-arm
    stepSchedule(sim, 0.05); // level is still 0.5: arms fresh, not already past a stale fireAt
    expect(sim.control[0].phase).toBe("armingNormal");
    stepSchedule(sim, 0.05, 22);
    expect(sim.control[0].phase).toBe("normal");
  });

  it("disarming mid trip-arm cancels the pending trip back to the settled band", () => {
    const sim = makeArmedGradedFeedScheduleSim(0.97, "thisBin"); // above highHighSetpoint
    stepSchedule(sim, 0.05); // arms the trip
    expect(sim.control[0].phase).toBe("armingTrip");

    BEHAVIORS.router.selectPort(sim.machines.get("router"), "elsewhere");
    stepSchedule(sim, 0.05, 80); // well past where the frozen trip would have fired
    expect(sim.control[0].phase).toBe("boost"); // cancelled, never actually tripped
    expect(sim.machines.get("elevator").throttleTarget).toBe(1);
  });

  it("disarming once already tripped freezes the rule, leaving the latched command untouched", () => {
    const sim = makeArmedGradedFeedScheduleSim(0.97, "thisBin");
    stepSchedule(sim, 0.05, 200); // reach "tripped"
    expect(sim.control[0].phase).toBe("tripped");

    BEHAVIORS.router.selectPort(sim.machines.get("router"), "elsewhere");
    stepSchedule(sim, 0.05, 200);
    expect(sim.control[0].phase).toBe("tripped"); // frozen, not auto-cleared
    expect(sim.machines.get("elevator").throttleTarget).toBe(0); // the trip's own command still stands
  });
});

// Unit tests over control.js's pure state machine, exercised the same way
// behaviors.test.js exercises a behaviour: fabricated machine states and a
// fabricated sim shell, no real line data, no engine.js involved.
import { describe, it, expect } from "vitest";
import {
  initControl, stepControl, resetTrips, hasLatchedTrip, combineEventLogs, instrumentReadings, primeInstruments,
  primeFeedSchedules, initFeedRateDerivations, stepFeedRateDerivation,
} from "./control";
import { BEHAVIORS } from "./behaviors";
import { SPEED_DIAL, GATE_DIAL, setDial } from "./dial";
import { simatekFeedRateTph, tPerHourToM3PerSec } from "./units";

// holdNextBatch (issue #25 — the treater after-bin holds the next batch), a
// machine rule: fabricated machine states and a fabricated sim shell, no
// real line data. The actuator is a batchCycle machine.
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
  const control = initControl({ machineRules: [HOLD_NEXT_BATCH_CFG] });
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

  it("reports itself latched while held, and not once reset", () => {
    const sim = makeHoldNextBatchSim(0.8);
    expect(hasLatchedTrip(sim)).toBe(false);
    for (let i = 0; i < 400; i++) { sim.t += 0.05; stepControl(sim); }
    expect(hasLatchedTrip(sim)).toBe(true);
    sim.machines.get("bin").stored = 0.3 * 10;
    resetTrips(sim);
    expect(hasLatchedTrip(sim)).toBe(false);
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

// Issue #30: per-instrument (LT/LSH/LSL) live state — setpoint, signal,
// alarm role, and the pulse-animation edge counter — derived from a rule's
// own fields and its sensor's current level. Same fabricated-rule-state
// pattern as the phase-machine tests above: no engine.js, no real line data,
// no rendering. An interlock sentence's own switches are covered in
// sentenceInterlock.test.js.
function tick(sim, n = 1) {
  for (let i = 0; i < n; i++) { sim.t += 0.05; stepControl(sim); }
}

describe("instrumentReadings", () => {
  it("is a pure function of rule state and level: LSH signals at-or-above its high set point", () => {
    const rule = { kind: "holdNextBatch", highSetpoint: 0.6, lowSetpoint: 0.2 };
    expect(instrumentReadings(rule, 0.5).LSH).toEqual({ setpoint: 0.6, signal: false, alarm: true });
    expect(instrumentReadings(rule, 0.6).LSH).toEqual({ setpoint: 0.6, signal: true, alarm: true });
    expect(instrumentReadings(rule, 0.9).LSH).toEqual({ setpoint: 0.6, signal: true, alarm: true });
  });

  // Issue #72: the low switch reads the same direction as the high one. It
  // is a probe at a fixed height that signals when grain covers it, so a
  // *stocked* bin asserts LSL and an empty one does not — the reverse of
  // this file's original reading.
  it("LSL signals at-or-above its low set point, the same direction as LSH", () => {
    const rule = { kind: "holdNextBatch", highSetpoint: 0.6, lowSetpoint: 0.2 };
    expect(instrumentReadings(rule, 0.15).LSL).toEqual({ setpoint: 0.2, signal: false, alarm: false });
    expect(instrumentReadings(rule, 0.2).LSL).toEqual({ setpoint: 0.2, signal: true, alarm: false });
    expect(instrumentReadings(rule, 0.5).LSL).toEqual({ setpoint: 0.2, signal: true, alarm: false });
  });

  it("signals LSL and LSH together once the level is above both — no arbitration, the bands come from the raw level (issue #72)", () => {
    const rule = { kind: "holdNextBatch", highSetpoint: 0.6, lowSetpoint: 0.2 };
    const readings = instrumentReadings(rule, 0.9);
    expect(readings.LSL.signal).toBe(true);
    expect(readings.LSH.signal).toBe(true);
  });

  it("ignores phase/fireAt entirely: a rule mid-delay still reads its contacts straight off the current level", () => {
    const rule = { kind: "holdNextBatch", highSetpoint: 0.6, lowSetpoint: 0.2, phase: "armed", fireAt: 999 };
    expect(instrumentReadings(rule, 0.9).LSH.signal).toBe(true);
  });

  it("returns no entries for a rule kind with no declared instrument fields", () => {
    expect(instrumentReadings({ kind: "unknownKind" }, 0.5)).toEqual({});
  });
});

// Issue #72: pins the colour role for every code on every machine rule
// kind. The obvious "tidy-up" is to derive the colour from the code's
// letters, which would quietly turn the machines whose LSH *is* the latched
// trip green at the exact moment they stop the line. The real-line half of
// this guard is in engine.test.js. See docs/adr/0007.
describe("instrumentReadings alarm role", () => {
  const ALARM_BY_KIND = [
    ["holdNextBatch", { kind: "holdNextBatch", highSetpoint: 0.6, lowSetpoint: 0.2 }, "LSH"],
    ["gradedFeedSchedule", { kind: "gradedFeedSchedule", lowSetpoint: 0.35, highSetpoint: 0.85, highHighSetpoint: 0.95 }, "LSHH"],
  ];

  it.each(ALARM_BY_KIND)("%s marks exactly one code as the alarm: %#", (_kind, rule, alarmCode) => {
    const readings = instrumentReadings(rule, 0.5);
    const alarms = Object.entries(readings).filter(([, r]) => r.alarm).map(([code]) => code);
    expect(alarms).toEqual([alarmCode]);
  });

  it("gives LSH opposite roles on the two kinds that both expose it, which is the whole point of keying on the rule kind", () => {
    const hold = { kind: "holdNextBatch", highSetpoint: 0.6, lowSetpoint: 0.2 };
    const schedule = { kind: "gradedFeedSchedule", lowSetpoint: 0.35, highSetpoint: 0.85, highHighSetpoint: 0.95 };
    expect(instrumentReadings(hold, 0.5).LSH.alarm).toBe(true);
    expect(instrumentReadings(schedule, 0.5).LSH.alarm).toBe(false);
  });

  it("never marks a low switch as an alarm on any kind", () => {
    for (const [, rule] of ALARM_BY_KIND) {
      expect(instrumentReadings(rule, 0.5).LSL.alarm).toBe(false);
    }
  });
});

describe("stepControl publishes rule.instruments with a one-time pulse edge", () => {
  it("primes signal=false and pulseGen=0 on a rule whose level is below its high set point", () => {
    const sim = makeHoldNextBatchSim(0.5);
    tick(sim);
    expect(sim.control[0].instruments.LSH).toEqual({ code: "LSH", setpoint: 0.8, signal: false, alarm: true, pulseGen: 0 });
    // Issue #72: 0.5 is above the 0.3 low probe, so LSL is covered and signals.
    expect(sim.control[0].instruments.LSL).toEqual({ code: "LSL", setpoint: 0.3, signal: true, alarm: false, pulseGen: 0 });
  });

  it("increments pulseGen exactly once on the tick the level crosses the high set point, independent of the signal delay", () => {
    const sim = makeHoldNextBatchSim(0.5);
    tick(sim, 10); // still below the set point
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(0);

    sim.machines.get("bin").stored = 0.8 * 10; // presenter drags the level straight to the trip point
    tick(sim); // LSH makes this tick; the hold itself is still 5s away
    expect(sim.control[0].instruments.LSH.signal).toBe(true);
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(1);
    expect(sim.control[0].phase).toBe("armed"); // the slow actuator path, unaffected

    tick(sim, 10); // stays made — no second pulse while it holds
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(1);
  });

  it("breaks (and is ready to pulse again) the instant the level recrosses back, with no memory of the delayed actuator phase", () => {
    const sim = makeHoldNextBatchSim(0.8);
    tick(sim); // makes
    expect(sim.control[0].instruments.LSH.signal).toBe(true);

    sim.machines.get("bin").stored = 0.5 * 10; // recrosses before the 5s signal delay even elapses
    tick(sim);
    expect(sim.control[0].instruments.LSH.signal).toBe(false);
    expect(sim.control[0].phase).toBe("armed"); // the latched hold still fires later

    sim.machines.get("bin").stored = 0.8 * 10; // makes again
    tick(sim);
    expect(sim.control[0].instruments.LSH.signal).toBe(true);
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(2); // second distinct trip, second pulse
  });

  // Issue #72: the ring is reserved for the code that actually stops the
  // line. A green schedule switch lights and holds without animating, so a
  // ring on screen means exactly one thing.
  it("never pulses a non-alarm code, however many times it makes and breaks", () => {
    const sim = makeHoldNextBatchSim(0.1); // below the 0.3 low probe: LSL starts silent
    tick(sim);
    expect(sim.control[0].instruments.LSL.signal).toBe(false);

    for (const fill of [0.5, 0.1, 0.5, 0.1]) {
      sim.machines.get("bin").stored = fill * 10;
      tick(sim);
    }
    expect(sim.control[0].instruments.LSL.pulseGen).toBe(0);
    expect(sim.control[0].instruments.LSH.pulseGen).toBe(0); // never reached 0.8 either
  });
});

describe("primeInstruments", () => {
  it("seeds every rule's instrument state from the sensor's initial level before any tick, with no pulse even if it starts already signalling", () => {
    const sim = makeHoldNextBatchSim(0.9);
    primeInstruments(sim.control, sim.machines);
    expect(sim.control[0].instruments.LSH).toEqual({ code: "LSH", setpoint: 0.8, signal: true, alarm: true, pulseGen: 0 });
  });

  it("a subsequent real step does not re-pulse a rule primed already-signalling, since nothing changed", () => {
    const sim = makeHoldNextBatchSim(0.9);
    primeInstruments(sim.control, sim.machines);
    tick(sim);
    expect(sim.control[0].instruments.LSH).toEqual({ code: "LSH", setpoint: 0.8, signal: true, alarm: true, pulseGen: 0 });
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
  const control = initControl({ machineRules: [GRADED_FEED_SCHEDULE_CFG] });
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

// primeFeedSchedules (issue #60): the rule starts already "in" boost without
// ever arming into it (see initGradedFeedSchedule's own comment), so without
// this the actuators would sit at their own generic (1, 1) default instead
// of boost's real target until the level first left and re-entered boost.
describe("primeFeedSchedules", () => {
  it("snaps both actuators straight to the starting band's own targets, settled, no ramp", () => {
    // Boost deliberately set away from both actuators' own (1, 1) default —
    // GRADED_FEED_SCHEDULE_CFG's own boost band happens to equal that
    // default, which would let this test pass even unprimed.
    const capacity = 10;
    const bin = { kind: "accumulator", capacity, stored: 0.1 * capacity, initialStored: 0, spill: 0 };
    const elevator = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
    const feeder = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 1, hasGate: true } });
    const machines = new Map([["bin", bin], ["elevator", elevator], ["feeder", feeder]]);
    const cfg = { ...GRADED_FEED_SCHEDULE_CFG, boost: { speedFraction: 0.7, gateFraction: 0.6, delaySec: 1, rampTimeSec: 1 } };
    const control = initControl({ machineRules: [cfg] });

    primeFeedSchedules(control, machines);

    expect(elevator.throttleFraction).toBe(0.7);
    expect(elevator.throttleTarget).toBe(0.7);
    expect(feeder.gateThrottleFraction).toBe(0.6);
    expect(feeder.gateThrottleTarget).toBe(0.6);
  });

  it("leaves every other rule kind's actuators untouched", () => {
    const capacity = 10;
    const bin = { kind: "accumulator", capacity, stored: 0, initialStored: 0, spill: 0 };
    const valve = BEHAVIORS.source.init({ sim: { rateM3PerSec: 1 } });
    const machines = new Map([["bin", bin], ["valve", valve]]);
    const control = initControl({
      interlocks: [{
        id: "r", kind: "sentence", when: { machine: "bin", condition: "above", setpoint: 0.85, delaySec: 1 },
        then: [{ action: "close", machine: "valve", rampTimeSec: 1 }], reset: "latched",
      }],
    });
    primeFeedSchedules(control, machines);
    expect(valve.openness).toBe(1);
    expect(valve.opennessTarget).toBe(1);
  });
});

// Issue #61: the Concetti pre-bin's own schedule commands two feeders
// (inletDrumFeeder1/2) uniformly, since only one is ever `enabled` at a time
// (the source selector, issue #46) — `action.feeder` accepts an array of
// `{ machine }` for exactly this, standalone here per this file's own
// "verified independent of the real line" convention (see
// GRADED_FEED_SCHEDULE_CFG's own comment).
describe("stepControl / primeFeedSchedules (gradedFeedSchedule) — array-valued action.feeder (issue #61)", () => {
  function makeTwoFeederSim(fillFraction) {
    const capacity = 10;
    const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
    const elevator = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
    const feeder1 = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 1, hasGate: true } });
    const feeder2 = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 1, hasGate: true, enabled: false } });
    const machines = new Map([["bin", bin], ["elevator", elevator], ["feeder1", feeder1], ["feeder2", feeder2]]);
    const cfg = { ...GRADED_FEED_SCHEDULE_CFG, action: { elevator: { machine: "elevator" }, feeder: [{ machine: "feeder1" }, { machine: "feeder2" }] } };
    const control = initControl({ machineRules: [cfg] });
    return { t: 0, machines, control };
  }
  function stepTwoFeederSchedule(sim, dt, n = 1) {
    for (let i = 0; i < n; i++) {
      BEHAVIORS.transportDelay.apply(sim.machines.get("elevator"), dt, 0, Infinity);
      BEHAVIORS.meteredFeeder.apply(sim.machines.get("feeder1"), dt, 0, Infinity);
      BEHAVIORS.meteredFeeder.apply(sim.machines.get("feeder2"), dt, 0, Infinity);
      sim.t += dt;
      stepControl(sim);
    }
  }

  it("primes every feeder in the array to the starting band's own gate target", () => {
    const sim = makeTwoFeederSim(0.1);
    expect(sim.machines.get("feeder1").gateThrottleFraction).toBe(1);
    expect(sim.machines.get("feeder2").gateThrottleFraction).toBe(1);
  });

  it("commands every feeder in the array uniformly, whether or not it's the currently enabled one", () => {
    const sim = makeTwoFeederSim(0.5); // between lowSetpoint (0.35) and highSetpoint (0.85)
    stepTwoFeederSchedule(sim, 0.05); // arms toward normal
    stepTwoFeederSchedule(sim, 0.05, 22); // consume the 1s band delay
    expect(sim.control[0].phase).toBe("normal");
    expect(sim.machines.get("feeder1").gateThrottleTarget).toBe(0.55);
    expect(sim.machines.get("feeder2").gateThrottleTarget).toBe(0.55); // disabled feeder commanded too, harmlessly
  });

  it("only reports settled once every feeder in the array has actually ramped to target", () => {
    const sim = makeTwoFeederSim(0.5);
    stepTwoFeederSchedule(sim, 0.05); // arms toward normal
    stepTwoFeederSchedule(sim, 0.05, 22); // commanded, ramp in flight
    expect(sim.machines.get("feeder1").gateThrottleFraction).not.toBeCloseTo(0.55);
    stepTwoFeederSchedule(sim, 0.05, 22); // consume the 1s ramp
    expect(sim.machines.get("feeder1").gateThrottleFraction).toBeCloseTo(0.55);
    expect(sim.machines.get("feeder2").gateThrottleFraction).toBeCloseTo(0.55);
  });
});

describe("stepControl (gradedFeedSchedule) — non-latching bands", () => {
  it("does nothing while the level stays in the boost band, already matching both actuators' defaults", () => {
    // Issue #72: below lowSetpoint (0.35) the low probe is uncovered, so
    // every switch is silent and nothing crosses. Under the old backwards
    // reading this same start logged an LSL make on its first tick.
    const sim = makeGradedFeedScheduleSim(0.1);
    stepSchedule(sim, 0.05, 200);
    expect(sim.control[0].phase).toBe("boost");
    expect(sim.control[0].log).toHaveLength(0);
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
  it("reads three codes — LSL, LSH, LSHH — LSHH signalling at-or-above its own set point, distinct from LSH", () => {
    const rule = { kind: "gradedFeedSchedule", lowSetpoint: 0.35, highSetpoint: 0.85, highHighSetpoint: 0.95 };
    // Issue #72: at 0.9 the level covers both the low and the high probe, so
    // both signal at once. LSHH is the only alarm code here (issue #58 made
    // it the sole latched trip and demoted LSH to a schedule boundary).
    expect(instrumentReadings(rule, 0.9)).toEqual({
      LSL: { setpoint: 0.35, signal: true, alarm: false },
      LSH: { setpoint: 0.85, signal: true, alarm: false },
      LSHH: { setpoint: 0.95, signal: false, alarm: true },
    });
    expect(instrumentReadings(rule, 0.95).LSHH.signal).toBe(true);
  });
});

// Arming (gradedFeedSchedule): the armedWhen mechanism a sentence uses too
// (sentenceInterlock.test.js), but this kind has several distinct pending-timer
// phases of its own (three band arms, plus the trip arm) —
// disarmGradedFeedSchedule must cancel any of them, not just one. Not used by
// the real line yet (issue #58 is standalone), but declared defensively, same
// as every other cancellable-arm kind in this file.
function makeArmedGradedFeedScheduleSim(fillFraction, selectedPort) {
  const capacity = 10;
  const bin = { kind: "accumulator", capacity, stored: fillFraction * capacity, initialStored: 0, spill: 0 };
  const elevator = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
  const feeder = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 1, hasGate: true } });
  const router = BEHAVIORS.router.init({ sim: {}, ports: { outputs: ["thisBin", "elsewhere"] } });
  BEHAVIORS.router.selectPort(router, selectedPort);
  const cfg = { ...GRADED_FEED_SCHEDULE_CFG, armedWhen: [{ machine: "router", port: "thisBin" }] };
  const machines = new Map([["bin", bin], ["elevator", elevator], ["feeder", feeder], ["router", router]]);
  const control = initControl({ machineRules: [cfg] });
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

// Continuous feed-rate derivation (issue #59): unlike every kind above, this
// has no sensor, no setpoint, no phase — just an elevator/feeder pair, read
// and re-commanded fresh every call. Verified standalone against a fabricated
// elevator (transportDelay) and gated feeder (meteredFeeder), with no
// gradedFeedSchedule rule and no `sim.control` at all, per issue #59's own
// "independent of the rule kind in #58" acceptance criterion.
const FEED_RATE_DERIVATION_CFG = {
  id: "testDerivation",
  elevator: { machine: "elevator" },
  feeder: { machine: "feeder" },
};

function makeFeedRateDerivationSim() {
  const elevator = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
  const feeder = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 0, hasGate: true } });
  const machines = new Map([["elevator", elevator], ["feeder", feeder]]);
  const feedRateDerivations = initFeedRateDerivations({ feedRateDerivations: [FEED_RATE_DERIVATION_CFG] });
  return { t: 0, machines, feedRateDerivations };
}

describe("initFeedRateDerivations", () => {
  it("builds one runtime link per declared config, resolving the elevator/feeder machine ids", () => {
    const sim = makeFeedRateDerivationSim();
    expect(sim.feedRateDerivations).toEqual([{ id: "testDerivation", elevatorId: "elevator", feederId: "feeder" }]);
  });
});

describe("stepFeedRateDerivation", () => {
  it("commands the feeder's rate from the elevator's and feeder's dials, matching the #57 formula exactly", () => {
    const sim = makeFeedRateDerivationSim();
    setDial(sim.machines.get("elevator"), SPEED_DIAL, 0.85);
    setDial(sim.machines.get("feeder"), GATE_DIAL, 0.55);
    stepFeedRateDerivation(sim);
    const expectedTph = simatekFeedRateTph(0.85, 0.55);
    expect(sim.machines.get("feeder").rate).toBeCloseTo(tPerHourToM3PerSec(expectedTph), 8);
  });

  // Untouched dials: each actuator runs at its interlock's own cap alone
  // (dial.js). The old dial x throttle product only ever agreed with this
  // because an untouched dial sits at 1.
  it("matches the formula across a range of governed speed/gate caps, dials untouched (issue #63: no override armed)", () => {
    const sim = makeFeedRateDerivationSim();
    const cases = [
      { throttleFraction: 1, gateThrottleFraction: 1 },
      { throttleFraction: 0.95, gateThrottleFraction: 0.65 },
      { throttleFraction: 0.6, gateThrottleFraction: 0.4 }, // e.g. gradedFeedSchedule's own throttle band
      { throttleFraction: 0.5, gateThrottleFraction: 0.25 },
    ];
    for (const c of cases) {
      const elevator = sim.machines.get("elevator");
      const feeder = sim.machines.get("feeder");
      elevator.throttleFraction = elevator.throttleTarget = c.throttleFraction;
      feeder.gateThrottleFraction = feeder.gateThrottleTarget = c.gateThrottleFraction;
      stepFeedRateDerivation(sim);
      const expectedTph = simatekFeedRateTph(c.throttleFraction, c.gateThrottleFraction);
      expect(feeder.rate).toBeCloseTo(tPerHourToM3PerSec(expectedTph), 8);
    }
  });

  // Issue #63: a presenter dragging a dial past the interlock's own live cap
  // bypasses that multiplicand's throttle factor entirely (uses the dial
  // alone), independent of whatever the other actuator's own dial/throttle
  // pair is doing — see dial.js. Gated
  // on speedDialTouched/gateDialTouched (stamped only by setElevatorSpeed/
  // setGateFraction, engine.js): gradedFeedSchedule's own calibrated bands
  // are always below the dial's untouched default of 1, so an ungated
  // "dial > throttle" compare alone would read every such actuator as
  // overridden from the moment its schedule engaged.
  describe("manual override (issue #63)", () => {
    it("bypasses the elevator's own throttle when its touched dial is dragged past it, leaving an ungoverned gate unaffected", () => {
      const sim = makeFeedRateDerivationSim();
      const elevator = sim.machines.get("elevator");
      const feeder = sim.machines.get("feeder");
      elevator.speedFraction = 1;
      elevator.speedDialTouched = true;
      elevator.throttleFraction = 0.6;
      elevator.throttleTarget = 0.6; // interlock has capped the elevator at 60%, dial dragged past it
      feeder.gateThrottleFraction = 0.4;
      feeder.gateThrottleTarget = 0.4; // gate dial untouched — governed by its own cap
      stepFeedRateDerivation(sim);
      const expectedTph = simatekFeedRateTph(1, 0.4); // elevator: dial alone; gate: its cap
      expect(feeder.rate).toBeCloseTo(tPerHourToM3PerSec(expectedTph), 8);
    });

    it("bypasses the gate's own throttle when its touched dial is dragged past it, leaving an ungoverned elevator unaffected", () => {
      const sim = makeFeedRateDerivationSim();
      const elevator = sim.machines.get("elevator");
      const feeder = sim.machines.get("feeder");
      elevator.throttleFraction = 0.9;
      elevator.throttleTarget = 0.9; // elevator dial untouched — governed by its own cap
      feeder.gateFraction = 1;
      feeder.gateDialTouched = true;
      feeder.gateThrottleFraction = 0.4;
      feeder.gateThrottleTarget = 0.4; // gate dragged past its own 40% cap
      stepFeedRateDerivation(sim);
      const expectedTph = simatekFeedRateTph(0.9, 1); // elevator: its cap; gate: dial alone
      expect(feeder.rate).toBeCloseTo(tPerHourToM3PerSec(expectedTph), 8);
    });

    it("does not arm just because a dial sits above its cap — it must actually have been touched (e.g. a fresh gradedFeedSchedule band)", () => {
      const sim = makeFeedRateDerivationSim();
      const elevator = sim.machines.get("elevator");
      const feeder = sim.machines.get("feeder");
      elevator.speedFraction = 1; // untouched default
      elevator.throttleFraction = 0.8525; // e.g. the real boost band's own speed target
      elevator.throttleTarget = 0.8525;
      feeder.gateFraction = 1; // untouched default
      feeder.gateThrottleFraction = 0.5516; // e.g. the real boost band's own gate target
      feeder.gateThrottleTarget = 0.5516;
      stepFeedRateDerivation(sim);
      const expectedTph = simatekFeedRateTph(0.8525, 0.5516); // fully governed — dial's untouched default has no effect
      expect(feeder.rate).toBeCloseTo(tPerHourToM3PerSec(expectedTph), 8);
    });

    it("never overrides a full stop (throttleTarget 0), however far above 0 a touched dial sits", () => {
      const sim = makeFeedRateDerivationSim();
      const elevator = sim.machines.get("elevator");
      const feeder = sim.machines.get("feeder");
      elevator.speedFraction = 1;
      elevator.speedDialTouched = true;
      elevator.throttleFraction = 0;
      elevator.throttleTarget = 0; // interlock has fully stopped the elevator
      feeder.gateFraction = 1;
      feeder.gateThrottleFraction = 1;
      feeder.gateThrottleTarget = 1;
      stepFeedRateDerivation(sim);
      expect(feeder.rate).toBe(0); // effectiveSpeed stays 0 — a full stop is never overridable
    });
  });

  it("updates the commanded rate on the very next call after either dial changes, with no band transition or interlock rule involved at all", () => {
    const sim = makeFeedRateDerivationSim();
    sim.machines.get("elevator").speedFraction = 1;
    sim.machines.get("feeder").gateFraction = 1;
    stepFeedRateDerivation(sim);
    const initialRate = sim.machines.get("feeder").rate;

    setDial(sim.machines.get("elevator"), SPEED_DIAL, 0.5); // presenter drags the elevator speed dial alone
    stepFeedRateDerivation(sim);
    expect(sim.machines.get("feeder").rate).toBeCloseTo(tPerHourToM3PerSec(simatekFeedRateTph(0.5, 1)), 8);
    expect(sim.machines.get("feeder").rate).not.toBeCloseTo(initialRate, 5);

    setDial(sim.machines.get("elevator"), SPEED_DIAL, 1); // back on the cap: released
    setDial(sim.machines.get("feeder"), GATE_DIAL, 0.3); // then the feeder gate dial alone
    stepFeedRateDerivation(sim);
    expect(sim.machines.get("feeder").rate).toBeCloseTo(tPerHourToM3PerSec(simatekFeedRateTph(1, 0.3)), 8);
  });
});

// Issues #82 and #83: the interlock sentence parts built so far, each on a
// small line run through the engine: the stopped and running conditions, the
// level above and below a set point, the stop, close and open actions, the
// signal delay, "when it clears", auto and latched reset, arming on a
// selector position, and import refusing a malformed sentence.
import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, DT, getMachineState, getInterlockState, setElevatorSpeed, releaseElevatorSpeed,
  setAccumulatorLevel, resetTrips, hasAnyTripLatched, setSelection, setInterlockHighSetpoint,
  setInterlockLowSetpoint, setInterlockSignalDelay,
} from "./engine";
import { exportLine, importLine } from "../line/lineDocument";

function machine(id, sim, inputs, outputs) {
  return {
    id, type: "box", name: id.toUpperCase(), tag: `T.${id}`, status: "new", zone: "all", x: 0, y: 0,
    ports: { inputs, outputs },
    anchors: Object.fromEntries([...inputs, ...outputs].map((p) => [p, { x: 0, y: 0 }])),
    sim,
  };
}

// Grain in -> feeder -> conveyor -> bin, with the given interlocks.
function smallLine(interlocks) {
  return {
    zones: [{ id: "all", name: "ALL" }],
    machines: [
      machine("grainIn", { kind: "source", rateM3PerSec: 0.01 }, [], ["out"]),
      machine("feeder", { kind: "meteredFeeder", rateM3PerSec: 0.005 }, ["in"], ["out"]),
      machine("conveyor", { kind: "transportDelay", distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 }, ["in"], ["out"]),
      machine("bin", { kind: "accumulator", capacityM3: 100 }, ["in"], []),
    ],
    connections: [
      { from: { machine: "grainIn", port: "out" }, to: { machine: "feeder", port: "in" }, kind: "product" },
      { from: { machine: "feeder", port: "out" }, to: { machine: "conveyor", port: "in" }, kind: "product" },
      { from: { machine: "conveyor", port: "out" }, to: { machine: "bin", port: "in" }, kind: "product" },
    ],
    interlocks,
  };
}

function sentence(id, condition, delaySec, extra = {}) {
  return {
    id, kind: "sentence",
    when: { machine: "conveyor", condition, delaySec },
    then: [{ action: "stop", machine: "feeder" }],
    reset: "auto",
    ...extra,
  };
}

function run(sim, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepSim(sim, DT);
}

const permit = (sim) => getMachineState(sim, "feeder").runPermit;

describe("interlock sentence: the stopped condition, the stop action and the signal delay", () => {
  it("stops the feeder only once the conveyor has been stopped for the whole signal delay", () => {
    const sim = createSim(smallLine([sentence("feederStop", "stopped", 2)]));
    run(sim, 5);
    expect(permit(sim)).toBe(true);

    setElevatorSpeed(sim, "conveyor", 0);
    run(sim, 1.9);
    expect(permit(sim)).toBe(true);
    run(sim, 0.2);
    expect(permit(sim)).toBe(false);
  });

  it("stops grain at the feeder: the stopped feeder moves nothing", () => {
    const sim = createSim(smallLine([sentence("feederStop", "stopped", 1)]));
    run(sim, 5);
    expect(getMachineState(sim, "feeder").flowRateM3PerSec).toBeGreaterThan(0);
    setElevatorSpeed(sim, "conveyor", 0);
    run(sim, 2);
    expect(getMachineState(sim, "feeder").flowRateM3PerSec).toBe(0);
  });

  it("cancels without a stop when the condition clears inside the signal delay", () => {
    const sim = createSim(smallLine([sentence("feederStop", "stopped", 2)]));
    setElevatorSpeed(sim, "conveyor", 0);
    run(sim, 1.5);
    releaseElevatorSpeed(sim, "conveyor");
    run(sim, 5);
    expect(permit(sim)).toBe(true);
    expect(getInterlockState(sim, "conveyor").log).toEqual([]);
  });

  it("auto reset: releases the feeder the tick the conveyor runs again, with no RESET TRIPS", () => {
    const sim = createSim(smallLine([sentence("feederStop", "stopped", 1)]));
    setElevatorSpeed(sim, "conveyor", 0);
    run(sim, 3);
    expect(permit(sim)).toBe(false);
    releaseElevatorSpeed(sim, "conveyor");
    run(sim, DT);
    expect(permit(sim)).toBe(true);
    const log = getInterlockState(sim, "conveyor").log.map((e) => e.message);
    expect(log).toEqual(["not running for 1s, FEEDER stopped", "running again, FEEDER released"]);
  });
});

describe("interlock sentence: the running condition", () => {
  it("stops the feeder once the conveyor has been running for the signal delay, and releases it when it stops", () => {
    const sim = createSim(smallLine([sentence("feederStopWhileRunning", "running", 3)]));
    run(sim, 2.9);
    expect(permit(sim)).toBe(true);
    run(sim, 0.2);
    expect(permit(sim)).toBe(false);

    setElevatorSpeed(sim, "conveyor", 0);
    run(sim, DT);
    expect(permit(sim)).toBe(true);
  });
});

describe("interlock sentence: command slots", () => {
  it("one sentence releasing its stop never releases another sentence's stop on the same machine", () => {
    const sim = createSim(smallLine([
      sentence("stopWhenStopped", "stopped", 1),
      sentence("stopWhenRunning", "running", 1),
    ]));
    run(sim, 2); // running: the second sentence holds the feeder
    expect(permit(sim)).toBe(false);
    setElevatorSpeed(sim, "conveyor", 0);
    run(sim, 0.5); // the second sentence releases, the first is still in its delay
    expect(permit(sim)).toBe(true);
    run(sim, 1); // the first sentence stops it
    expect(permit(sim)).toBe(false);
  });
});

describe("interlock sentence: beside a coded interlock on the same line", () => {
  it("a coded trip stops the conveyor, then the sentence stops the feeder", () => {
    const binTrip = {
      id: "binHighTrip", kind: "thresholdStopTrip", sensor: { machine: "bin" },
      highSetpoint: 0.85, lowSetpoint: 0.35, signalDelaySec: 5, action: { machine: "conveyor", rampTimeSec: 0 },
    };
    const sim = createSim(smallLine([binTrip, sentence("feederStop", "stopped", 1)]));
    run(sim, 2);
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 5.5);
    expect(getMachineState(sim, "conveyor").throttleTarget).toBe(0);
    expect(permit(sim)).toBe(true);
    run(sim, 1.1);
    expect(permit(sim)).toBe(false);
  });
});

describe("interlock sentence in the line document", () => {
  it("round trips through export and import", () => {
    const line = smallLine([sentence("feederStop", "stopped", 1)]);
    const result = importLine(exportLine(line, "small"));
    expect(result.errors ?? []).toEqual([]);
    expect(result.line.interlocks).toEqual(line.interlocks);
  });

  const malformed = [
    ["no when part", { when: undefined }, /missing its "when" part/],
    ["an unknown sensor machine", { when: { machine: "nowhere", condition: "stopped", delaySec: 1 } }, /unknown machine "nowhere"/],
    ["an unknown condition", { when: { machine: "conveyor", condition: "sideways", delaySec: 1 } }, /unknown condition "sideways"/],
    ["a condition the machine cannot have", { when: { machine: "bin", condition: "stopped", delaySec: 1 } }, /machine "bin" cannot be "stopped"/],
    ["a negative signal delay", { when: { machine: "conveyor", condition: "stopped", delaySec: -1 } }, /signal delay/],
    ["no steps", { then: [] }, /at least one step/],
    ["an unknown action", { then: [{ action: "explode", machine: "feeder" }] }, /unknown action "explode"/],
    ["an action the machine cannot take", { then: [{ action: "stop", machine: "bin" }] }, /cannot stop machine "bin"/],
    ["an unknown action machine", { then: [{ action: "stop", machine: "nowhere" }] }, /unknown machine "nowhere"/],
    ["an unknown reset", { reset: "sometimes" }, /reset "sometimes"/],
    ["a level condition with no set point", { when: { machine: "bin", condition: "above", delaySec: 1 } }, /set point/],
    ["a set point over 100 %", { when: { machine: "bin", condition: "above", setpoint: 1.5, delaySec: 1 } }, /set point/],
    ["a level condition on a machine with no level", { when: { machine: "conveyor", condition: "above", setpoint: 0.5, delaySec: 1 } }, /machine "conveyor" cannot be "above"/],
    ["an unknown level switch", { when: { machine: "bin", condition: "above", setpoint: 0.5, switch: "LXX", delaySec: 1 } }, /switch "LXX"/],
    ["a negative ramp time", { then: [{ action: "stop", machine: "feeder", rampTimeSec: -1 }] }, /ramp time/],
    ["a when it clears part that is not a part", { whenClears: [] }, /"when it clears" part/],
    ["a when it clears part with no steps", { whenClears: { condition: "running", delaySec: 1, then: [] } }, /at least one step after "when it clears"/],
    ["a when it clears part with an unknown condition", { whenClears: { condition: "sideways", delaySec: 1, then: [{ action: "stop", machine: "feeder" }] } }, /unknown condition "sideways"/],
    ["arming on an unknown machine", { armedWhen: [{ machine: "nowhere", port: "a" }] }, /armed on unknown machine "nowhere"/],
    ["arming on a port the machine cannot select", { armedWhen: [{ machine: "feeder", port: "nope" }] }, /cannot select port "nope"/],
  ];
  for (const [what, change, message] of malformed) {
    it(`refuses a sentence with ${what}, with a message`, () => {
      const line = smallLine([sentence("broken", "stopped", 1, change)]);
      const result = importLine(exportLine(line, "small"));
      expect(result.ok).toBe(false);
      expect(result.errors.join("\n")).toMatch(message);
      expect(result.errors.join("\n")).toContain('interlock "broken"');
    });
  }
});

// Grain in -> conveyor -> bin, for the level conditions.
function binLine(interlocks) {
  return {
    zones: [{ id: "all", name: "ALL" }],
    machines: [
      machine("grainIn", { kind: "source", rateM3PerSec: 0.01 }, [], ["out"]),
      machine("conveyor", { kind: "transportDelay", distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 }, ["in"], ["out"]),
      machine("bin", { kind: "accumulator", capacityM3: 100 }, ["in"], []),
    ],
    connections: [
      { from: { machine: "grainIn", port: "out" }, to: { machine: "conveyor", port: "in" }, kind: "product" },
      { from: { machine: "conveyor", port: "out" }, to: { machine: "bin", port: "in" }, kind: "product" },
    ],
    interlocks,
  };
}

function levelSentence(id, when, then, extra = {}) {
  return { id, kind: "sentence", when: { machine: "bin", delaySec: 1, ...when }, then, reset: "auto", ...extra };
}

const openness = (sim) => getMachineState(sim, "grainIn").opennessTarget;
const throttle = (sim) => getMachineState(sim, "conveyor").throttleTarget;
const closeGrainIn = [{ action: "close", machine: "grainIn" }];
const stopConveyor = [{ action: "stop", machine: "conveyor" }];

describe("interlock sentence: level above, and the close action", () => {
  it("closes the source once the bin has been above the set point for the signal delay", () => {
    const sim = createSim(binLine([levelSentence("high", { condition: "above", setpoint: 0.8, delaySec: 2 }, closeGrainIn)]));
    run(sim, 1);
    expect(openness(sim)).toBe(1);
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 1.9);
    expect(openness(sim)).toBe(1);
    run(sim, 0.2);
    expect(openness(sim)).toBe(0);
  });

  it("does nothing while the bin stays below the set point", () => {
    const sim = createSim(binLine([levelSentence("high", { condition: "above", setpoint: 0.8 }, closeGrainIn)]));
    setAccumulatorLevel(sim, "bin", 0.79);
    run(sim, 5);
    expect(openness(sim)).toBe(1);
  });

  it("moves the valve over the step's ramp time", () => {
    const sim = createSim(binLine([levelSentence("high", { condition: "above", setpoint: 0.8, delaySec: 0 },
      [{ action: "close", machine: "grainIn", rampTimeSec: 4 }])]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 2);
    expect(getMachineState(sim, "grainIn").openness).toBeCloseTo(0.5, 1);
    run(sim, 3);
    expect(getMachineState(sim, "grainIn").openness).toBe(0);
  });

  it("auto reset with no when it clears part: opens again once the bin is below the set point", () => {
    const sim = createSim(binLine([levelSentence("high", { condition: "above", setpoint: 0.8 }, closeGrainIn)]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 2);
    expect(openness(sim)).toBe(0);
    setAccumulatorLevel(sim, "bin", 0.7);
    run(sim, DT);
    expect(openness(sim)).toBe(1);
  });
});

describe("interlock sentence: level below, and the stop action on a conveyor", () => {
  it("stops the conveyor while the bin is below the set point, and starts it again above it", () => {
    const sim = createSim(binLine([levelSentence("low", { condition: "below", setpoint: 0.2 }, stopConveyor)]));
    run(sim, 0.9);
    expect(throttle(sim)).toBe(1);
    run(sim, 0.2);
    expect(throttle(sim)).toBe(0);
    setAccumulatorLevel(sim, "bin", 0.5);
    run(sim, DT);
    expect(throttle(sim)).toBe(1);
  });
});

describe("interlock sentence: when it clears, and the open action", () => {
  // The buffer bin's form: close above the high set point, open again only
  // below the low one.
  const banded = () => levelSentence(
    "band",
    { condition: "above", setpoint: 0.8, delaySec: 2 },
    closeGrainIn,
    { whenClears: { condition: "below", setpoint: 0.3, delaySec: 2, then: [{ action: "open", machine: "grainIn" }] } },
  );

  it("stays closed between the two set points, and opens by itself after the low one", () => {
    const sim = createSim(binLine([banded()]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 3);
    expect(openness(sim)).toBe(0);

    setAccumulatorLevel(sim, "bin", 0.5);
    run(sim, 10);
    expect(openness(sim)).toBe(0);

    setAccumulatorLevel(sim, "bin", 0.2);
    run(sim, 1.9);
    expect(openness(sim)).toBe(0);
    run(sim, 0.2);
    expect(openness(sim)).toBe(1);
    expect(hasAnyTripLatched(sim)).toBe(false);
  });

  it("cancels the reopen when the level rises again inside the clear delay", () => {
    const sim = createSim(binLine([banded()]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 3);
    setAccumulatorLevel(sim, "bin", 0.2);
    run(sim, 1);
    setAccumulatorLevel(sim, "bin", 0.5);
    run(sim, 5);
    expect(openness(sim)).toBe(0);
  });

  it("closes again on the next rise past the high set point", () => {
    const sim = createSim(binLine([banded()]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 3);
    setAccumulatorLevel(sim, "bin", 0.2);
    run(sim, 3);
    expect(openness(sim)).toBe(1);
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 2.1);
    expect(openness(sim)).toBe(0);
  });
});

describe("interlock sentence: latched reset", () => {
  const trip = () => levelSentence("trip", { condition: "above", setpoint: 0.8 }, stopConveyor, { reset: "latched" });

  it("stays stopped after the level clears, until RESET TRIPS", () => {
    const sim = createSim(binLine([trip()]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 2);
    expect(throttle(sim)).toBe(0);
    expect(hasAnyTripLatched(sim)).toBe(true);

    setAccumulatorLevel(sim, "bin", 0.1);
    run(sim, 10);
    expect(throttle(sim)).toBe(0);
    expect(hasAnyTripLatched(sim)).toBe(true);

    resetTrips(sim);
    run(sim, DT);
    expect(throttle(sim)).toBe(1);
    expect(hasAnyTripLatched(sim)).toBe(false);
  });

  it("stays latched when RESET TRIPS is pressed while the level is still above the set point", () => {
    const sim = createSim(binLine([trip()]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 2);
    resetTrips(sim);
    run(sim, 5);
    expect(throttle(sim)).toBe(0);
    expect(hasAnyTripLatched(sim)).toBe(true);
    expect(getInterlockState(sim, "bin").log.at(-1).message).toMatch(/remains latched/);
  });

  it("can trip again after a reset", () => {
    const sim = createSim(binLine([trip()]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 2);
    setAccumulatorLevel(sim, "bin", 0.1);
    resetTrips(sim);
    run(sim, 1);
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 1.1);
    expect(throttle(sim)).toBe(0);
  });

  it("is not latched until the stopped machine has settled", () => {
    const sim = createSim(binLine([levelSentence("trip", { condition: "above", setpoint: 0.8, delaySec: 0 },
      [{ action: "stop", machine: "conveyor", rampTimeSec: 2 }], { reset: "latched" })]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 1);
    expect(hasAnyTripLatched(sim)).toBe(false);
    run(sim, 1.5);
    expect(hasAnyTripLatched(sim)).toBe(true);
  });
});

// Grain in -> diverter -> bin A or bin B, for arming.
function divertedLine(interlocks) {
  return {
    zones: [{ id: "all", name: "ALL" }],
    machines: [
      machine("grainIn", { kind: "source", rateM3PerSec: 0.01 }, [], ["out"]),
      machine("diverter", { kind: "router" }, ["in"], ["a", "b"]),
      machine("binA", { kind: "accumulator", capacityM3: 100 }, ["in"], []),
      machine("binB", { kind: "accumulator", capacityM3: 100 }, ["in"], []),
    ],
    connections: [
      { from: { machine: "grainIn", port: "out" }, to: { machine: "diverter", port: "in" }, kind: "product" },
      { from: { machine: "diverter", port: "a" }, to: { machine: "binA", port: "in" }, kind: "product" },
      { from: { machine: "diverter", port: "b" }, to: { machine: "binB", port: "in" }, kind: "product" },
    ],
    interlocks,
  };
}

describe("interlock sentence: arming on a selector position", () => {
  const binBTrip = () => ({
    id: "binBTrip", kind: "sentence",
    when: { machine: "binB", condition: "above", setpoint: 0.8, delaySec: 2 },
    then: closeGrainIn,
    reset: "latched",
    armedWhen: [{ machine: "diverter", port: "b" }],
  });

  it("does not fire while the diverter points at the other bin", () => {
    const sim = createSim(divertedLine([binBTrip()]));
    setSelection(sim, "diverter", "a");
    setAccumulatorLevel(sim, "binB", 1);
    run(sim, 10);
    expect(openness(sim)).toBe(1);
    expect(getInterlockState(sim, "binB").log).toEqual([]);
  });

  it("fires a full signal delay after the diverter is pointed at its bin", () => {
    const sim = createSim(divertedLine([binBTrip()]));
    setSelection(sim, "diverter", "a");
    setAccumulatorLevel(sim, "binB", 1);
    run(sim, 10);
    setSelection(sim, "diverter", "b");
    run(sim, 1.9);
    expect(openness(sim)).toBe(1);
    run(sim, 0.2);
    expect(openness(sim)).toBe(0);
  });

  it("forgets a pending clear delay when the diverter moves away before it ends", () => {
    const sim = createSim(divertedLine([{
      ...binBTrip(),
      reset: "auto",
      whenClears: { condition: "below", setpoint: 0.3, delaySec: 2, then: [{ action: "open", machine: "grainIn" }] },
    }]));
    setSelection(sim, "diverter", "b");
    setAccumulatorLevel(sim, "binB", 1);
    run(sim, 2.1);
    expect(openness(sim)).toBe(0);
    setAccumulatorLevel(sim, "binB", 0.2);
    run(sim, 1.5);
    setSelection(sim, "diverter", "a");
    run(sim, 5);
    setSelection(sim, "diverter", "b");
    run(sim, DT);
    expect(openness(sim)).toBe(0); // a fresh clear delay, not the stale one
    run(sim, 2.1);
    expect(openness(sim)).toBe(1);
  });

  it("forgets a pending delay when the diverter moves away before it fires", () => {
    const sim = createSim(divertedLine([binBTrip()]));
    setSelection(sim, "diverter", "b");
    setAccumulatorLevel(sim, "binB", 1);
    run(sim, 1.5);
    setSelection(sim, "diverter", "a");
    run(sim, 5);
    setSelection(sim, "diverter", "b");
    run(sim, DT);
    expect(openness(sim)).toBe(1);
  });
});

describe("interlock sentence: level switches and the popup set point sliders", () => {
  const banded = () => levelSentence(
    "band",
    { condition: "above", setpoint: 0.8, switch: "LSH", delaySec: 2 },
    closeGrainIn,
    { whenClears: { condition: "below", setpoint: 0.3, switch: "LSL", delaySec: 2, then: [{ action: "open", machine: "grainIn" }] } },
  );
  const tripped = () => levelSentence("trip", { condition: "above", setpoint: 0.9, switch: "LSHH", delaySec: 2 },
    closeGrainIn, { reset: "latched" });

  it("publishes each named switch as an instrument, red only for the latched sentence's switch", () => {
    const sim = createSim(binLine([banded(), tripped()]));
    setAccumulatorLevel(sim, "bin", 0.85);
    run(sim, DT);
    const instruments = Object.assign({}, ...sim.control.map((r) => r.instruments));
    expect(instruments.LSH).toMatchObject({ setpoint: 0.8, signal: true, alarm: false });
    expect(instruments.LSL).toMatchObject({ setpoint: 0.3, signal: true, alarm: false });
    expect(instruments.LSHH).toMatchObject({ setpoint: 0.9, signal: false, alarm: true });
  });

  it("the LSH slider moves the set point of a running sentence", () => {
    const sim = createSim(binLine([banded()]));
    setInterlockHighSetpoint(sim, "bin", 0.5);
    setAccumulatorLevel(sim, "bin", 0.6);
    run(sim, 2.1);
    expect(openness(sim)).toBe(0);
  });

  it("the LSL slider moves the set point of the when it clears part", () => {
    const sim = createSim(binLine([banded()]));
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 3);
    setInterlockLowSetpoint(sim, "bin", 0.6);
    setAccumulatorLevel(sim, "bin", 0.5);
    run(sim, 2.1);
    expect(openness(sim)).toBe(1);
  });

  it("the signal delay slider moves the delay of both parts", () => {
    const sim = createSim(binLine([banded()]));
    setInterlockSignalDelay(sim, "bin", 4);
    setAccumulatorLevel(sim, "bin", 0.9);
    run(sim, 3.9);
    expect(openness(sim)).toBe(1);
    run(sim, 0.2);
    expect(openness(sim)).toBe(0);
    setAccumulatorLevel(sim, "bin", 0.2);
    run(sim, 3.9);
    expect(openness(sim)).toBe(0);
    run(sim, 0.2);
    expect(openness(sim)).toBe(1);
  });

  it("a bin's display-only level switch lights and follows its slider, with no interlock behind it", () => {
    const line = binLine([]);
    line.machines.find((m) => m.id === "bin").sim.levelSwitches = { LSL: 0.35 };
    const sim = createSim(line);
    setAccumulatorLevel(sim, "bin", 0.4);
    run(sim, DT);
    expect(getInterlockState(sim, "bin").instruments.LSL).toMatchObject({ setpoint: 0.35, signal: true, alarm: false });
    setInterlockLowSetpoint(sim, "bin", 0.5);
    run(sim, DT);
    expect(getInterlockState(sim, "bin").instruments.LSL).toMatchObject({ setpoint: 0.5, signal: false });
  });
});

describe("interlock sentence with every part, in the line document", () => {
  it("round trips through export and import", () => {
    const line = binLine([
      levelSentence("band", { condition: "above", setpoint: 0.8, switch: "LSH", delaySec: 2 },
        [{ action: "close", machine: "grainIn", rampTimeSec: 6 }],
        { whenClears: { condition: "below", setpoint: 0.3, switch: "LSL", delaySec: 2, then: [{ action: "open", machine: "grainIn", rampTimeSec: 6 }] } }),
      levelSentence("trip", { condition: "above", setpoint: 0.9, switch: "LSHH" }, stopConveyor, { reset: "latched" }),
    ]);
    const result = importLine(exportLine(line, "small"));
    expect(result.errors ?? []).toEqual([]);
    expect(result.line.interlocks).toEqual(line.interlocks);
  });
});

// Issue #82: the interlock sentence parts built so far, each on a small line
// run through the engine: the stopped and running conditions, the stop
// action, the signal delay, auto reset, and import refusing a malformed
// sentence.
import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, DT, getMachineState, getInterlockState, setElevatorSpeed, releaseElevatorSpeed,
  setAccumulatorLevel,
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
    ["a when it clears part", { whenClears: [] }, /when it clears/],
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

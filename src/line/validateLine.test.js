import { describe, it, expect } from "vitest";
import { validateLine, wiringGaps } from "./validateLine";
import { isRuleOff } from "./interlocks";

// Minimal well-formed line: one source stub feeding one bin, in one zone.
function makeValidLine(overrides = {}) {
  return {
    zones: [{ id: "packaging", name: "Packaging & Outload" }],
    machines: [
      {
        id: "feedStub",
        type: "stub",
        name: "FROM UPSTREAM",
        tag: "STUB.IN",
        status: "stub",
        zone: "packaging",
        x: 0,
        y: 0,
        ports: { inputs: [], outputs: ["out"] },
        anchors: { out: { x: 0, y: 0 } },
      },
      {
        id: "bufferBin",
        type: "bin",
        name: "OUTLOAD BUFFER BIN",
        tag: "52.701.H00",
        status: "new",
        zone: "packaging",
        x: 100,
        y: 100,
        ports: { inputs: ["in"], outputs: ["out"] },
        anchors: { in: { x: 50, y: 0 }, out: { x: 50, y: 120 } },
        sim: { kind: "accumulator", capacityM3: 1 },
      },
    ],
    connections: [
      {
        from: { machine: "feedStub", port: "out" },
        to: { machine: "bufferBin", port: "in" },
        kind: "product",
      },
    ],
    ...overrides,
  };
}

describe("validateLine", () => {
  it("accepts a valid line definition", () => {
    const result = validateLine(makeValidLine());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects duplicate machine tags, naming the tag", () => {
    const line = makeValidLine();
    line.machines[0].tag = "52.701.H00"; // collides with bufferBin
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("52.701.H00");
  });

  it("rejects a connection referencing a machine that does not exist", () => {
    const line = makeValidLine();
    line.connections.push({
      from: { machine: "bufferBin", port: "out" },
      to: { machine: "ghostElevator", port: "in" },
      kind: "product",
    });
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("ghostElevator");
  });

  it("rejects a connection using a port the machine does not declare", () => {
    const line = makeValidLine();
    line.connections[0].to.port = "wasteOut"; // bufferBin has no such input
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("wasteOut");
    expect(result.errors.join("\n")).toContain("bufferBin");
  });

  // Issue #87: a machine just added in Build mode has no connections yet,
  // and the line must still load. The gap is reported, not refused.
  it("accepts an orphan machine that no connection touches, and reports it as a wiring gap", () => {
    const line = makeValidLine();
    line.machines.push({
      id: "lonelyBin",
      type: "bin",
      name: "LONELY BIN",
      tag: "52.999.H00",
      status: "new",
      zone: "packaging",
      x: 500,
      y: 500,
      ports: { inputs: ["in"], outputs: ["out"] },
      anchors: { in: { x: 0, y: 0 }, out: { x: 0, y: 50 } },
      sim: { kind: "accumulator", capacityM3: 1 },
    });
    expect(validateLine(line).errors).toEqual([]);
    expect(wiringGaps(line).join("\n")).toContain("lonelyBin");
  });

  // Issue #87: a built line has no zones, and two new machines both have an
  // empty tag.
  it("accepts machines with no zone and machines with an empty tag", () => {
    const line = makeValidLine();
    line.zones = [];
    for (const m of line.machines) {
      delete m.zone;
      m.tag = "";
    }
    expect(validateLine(line).errors).toEqual([]);
  });

  it("rejects a machine assigned to a zone that is not declared", () => {
    const line = makeValidLine();
    line.machines[1].zone = "atlantis";
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("atlantis");
    expect(result.errors.join("\n")).toContain("bufferBin");
  });

  it("rejects a machine declaring an unregistered sim.kind", () => {
    const line = makeValidLine();
    line.machines[1].sim = { kind: "teleporter" };
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("teleporter");
    expect(result.errors.join("\n")).toContain("bufferBin");
  });

  it("accepts a machine declaring a registered sim.kind", () => {
    const line = makeValidLine();
    line.machines[1].sim = { kind: "accumulator", capacityM3: 1 };
    const result = validateLine(line);
    expect(result.ok).toBe(true);
  });

  it("checks sim.kind on stub machines too (a stub can carry real sim behaviour, e.g. a source)", () => {
    const line = makeValidLine();
    line.machines[0].sim = { kind: "teleporter" };
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("teleporter");
  });

  // Issue #52: the census (behaviorCensus.js) is only honest about "not yet
  // engined" reaching zero if the validator enforces the same rule, rather
  // than letting a real machine quietly ship with no sim block at all.
  it("rejects a non-stub, non-exempt machine that declares no sim.kind", () => {
    const line = makeValidLine();
    delete line.machines[1].sim; // bufferBin: a real machine, not a stub, not marked out of scope
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("bufferBin");
  });

  it("accepts a stub machine (type: \"stub\") that declares no sim.kind", () => {
    const line = makeValidLine();
    // feedStub (machines[0]) is already type "stub" with no sim block.
    const result = validateLine(line);
    expect(result.ok).toBe(true);
  });

  it("accepts a machine marked simExempt that declares no sim.kind", () => {
    const line = makeValidLine();
    delete line.machines[1].sim;
    line.machines[1].simExempt = true; // e.g. the waste-water IBC: real and visible, deliberately never simulated
    const result = validateLine(line);
    expect(result.ok).toBe(true);
  });

  it("accepts a machine rule whose sensor and actuator both reference real machines", () => {
    const line = makeValidLine();
    line.machines[0].sim = { kind: "source", rateM3PerSec: 1 }; // feedStub
    line.machineRules = [{
      id: "trip", kind: "holdNextBatch", sensor: { machine: "bufferBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "feedStub", rampTimeSec: 5 },
    }];
    const result = validateLine(line);
    expect(result.ok).toBe(true);
  });

  // Issue #87: a machine rule that names a machine the line does not have
  // (the user deleted it) is off, not refused, so the line still loads.
  it.each([
    ["sensor", { machine: "ghostBin" }, { machine: "feedStub", rampTimeSec: 5 }],
    ["action", { machine: "bufferBin" }, { machine: "ghostValve", rampTimeSec: 5 }],
  ])("accepts a machine rule whose %s names a machine the line does not have, and turns it off", (_what, sensor, action) => {
    const line = makeValidLine();
    line.machineRules = [{
      id: "trip", kind: "holdNextBatch", sensor, highSetpoint: 0.9, lowSetpoint: 0.3, signalDelaySec: 3, action,
    }];
    expect(validateLine(line).errors).toEqual([]);
    expect(isRuleOff(line, line.machineRules[0])).toBe(true);
  });

  it("rejects a machine rule whose action targets a machine that cannot be commanded", () => {
    const line = makeValidLine();
    line.machines[1].sim = { kind: "accumulator", capacityM3: 1 }; // bufferBin: no `command` behaviour method
    line.machineRules = [{
      id: "trip", kind: "holdNextBatch", sensor: { machine: "bufferBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "bufferBin", rampTimeSec: 5 },
    }];
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("bufferBin");
  });

  it("accepts a machine rule whose action targets a source (which can be commanded)", () => {
    const line = makeValidLine();
    line.machines[0].sim = { kind: "source", rateM3PerSec: 1 }; // feedStub
    line.machines[1].sim = { kind: "accumulator", capacityM3: 1 };
    line.machineRules = [{
      id: "trip", kind: "holdNextBatch", sensor: { machine: "bufferBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "feedStub", rampTimeSec: 5 },
    }];
    const result = validateLine(line);
    expect(result.ok).toBe(true);
  });

  // Issue #85: every interlock is a sentence. A coded rule kind left in
  // `interlocks` is refused, and so is a machine rule of a kind that is not one.
  it("rejects an interlock that is not a sentence", () => {
    const line = makeValidLine();
    line.machines[0].sim = { kind: "source", rateM3PerSec: 1 };
    line.interlocks = [{
      id: "trip", kind: "thresholdTrip", sensor: { machine: "bufferBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "feedStub", rampTimeSec: 5 },
    }];
    expect(validateLine(line).errors.join("\n")).toMatch(/interlock "trip" has kind "thresholdTrip"; every interlock is a sentence/);
  });

  it("rejects a machine rule of an unknown kind", () => {
    const line = makeValidLine();
    line.machineRules = [{ id: "odd", kind: "sentence", when: { machine: "bufferBin", condition: "above", setpoint: 0.9, delaySec: 1 } }];
    expect(validateLine(line).errors.join("\n")).toMatch(/machine rule "odd" has unknown kind "sentence"/);
  });

  it.each([
    ["an unknown switch", [{ switch: "LSX", label: "x", min: 0, max: 100 }], /unknown level switch "LSX"/],
    ["the same switch twice", [{ switch: "LSH", label: "a", min: 0, max: 100 }, { switch: "LSH", label: "b", min: 0, max: 100 }], /two set point sliders for "LSH"/],
    ["no label", [{ switch: "LSH", min: 0, max: 100 }], /slider "LSH" needs a label/],
    ["limits the wrong way round", [{ switch: "LSH", label: "a", min: 90, max: 30 }], /slider "LSH" needs limits from 0 to 100 %/],
    ["limits past 100 %", [{ switch: "LSH", label: "a", min: 0, max: 120 }], /slider "LSH" needs limits from 0 to 100 %/],
  ])("rejects set point slider limits with %s", (_what, sliders, message) => {
    const line = makeValidLine();
    line.machines[1].setpointSliders = sliders;
    expect(validateLine(line).errors.join("\n")).toMatch(message);
  });

  // Issue #47: a router (or routedTransportDelay) machine's declared output
  // ports are its own selectable destinations — a port with nowhere to go,
  // or a default naming a port that doesn't exist, is a real authoring bug.
  function makeRouterLine() {
    const line = makeValidLine();
    line.machines.push({
      id: "diverter",
      type: "diverter",
      name: "DIVERTER",
      tag: "TEST.DIV",
      status: "new",
      zone: "packaging",
      x: 200, y: 200,
      ports: { inputs: ["in"], outputs: ["out1", "out2"] },
      anchors: { in: { x: 0, y: 0 }, out1: { x: 0, y: 0 }, out2: { x: 0, y: 0 } },
      sim: { kind: "router" },
    });
    line.machines.push({
      id: "binA",
      type: "bin",
      name: "BIN A",
      tag: "TEST.BINA",
      status: "new",
      zone: "packaging",
      x: 300, y: 200,
      ports: { inputs: ["in"], outputs: [] },
      anchors: { in: { x: 0, y: 0 } },
      sim: { kind: "terminalSink" },
    });
    line.connections.push(
      { from: { machine: "bufferBin", port: "out" }, to: { machine: "diverter", port: "in" }, kind: "product" },
      { from: { machine: "diverter", port: "out1" }, to: { machine: "binA", port: "in" }, kind: "product" },
      { from: { machine: "diverter", port: "out2" }, to: { machine: "binA", port: "in" }, kind: "product" },
    );
    return line;
  }

  it("accepts a router whose every declared output port is connected", () => {
    const result = validateLine(makeRouterLine());
    expect(result.ok).toBe(true);
  });

  it("accepts a router with a declared output port that no connection routes anywhere, and reports it as a wiring gap", () => {
    const line = makeRouterLine();
    line.machines.find((m) => m.id === "diverter").ports.outputs.push("out3"); // declared, never wired
    expect(validateLine(line).errors).toEqual([]);
    const gaps = wiringGaps(line).join("\n");
    expect(gaps).toContain("out3");
    expect(gaps).toContain("diverter");
  });

  it("rejects a router whose defaultPort names a port it never declares", () => {
    const line = makeRouterLine();
    line.machines.find((m) => m.id === "diverter").sim.defaultPort = "outGhost";
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("outGhost");
    expect(result.errors.join("\n")).toContain("diverter");
  });

  it("rejects a param whose bind or readBind names no live control, naming both", () => {
    const line = makeValidLine();
    line.machines[1].params = [
      { id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJmup" },
      { id: "rate", label: "rate", min: 0, max: 20, value: 0, unit: "t/h", bind: "feederRate", readBind: "feederRateActaul" },
    ];
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("levelJmup");
    expect(result.errors.join("\n")).toContain("feederRateActaul");
  });

  it("accepts params with known binds, and display-only params with none", () => {
    const line = makeValidLine();
    line.machines[1].params = [
      { id: "level", label: "fill level", min: 0, max: 100, value: 0, unit: "%", bind: "levelJump" },
      { id: "cap", label: "capacity", min: 0, max: 10, value: 1, unit: "m3" },
    ];
    expect(validateLine(line).errors).toEqual([]);
  });

  // Issue #83: a bin's display-only level switches (control.js initLevelSwitches).
  it("accepts a bin's display-only level switch", () => {
    const line = makeValidLine();
    line.machines[1].sim.levelSwitches = { LSL: 0.35 };
    expect(validateLine(line).errors).toEqual([]);
  });

  const badSwitches = [
    ["an unknown switch code", { LXX: 0.35 }, /level switch "LXX"/],
    ["a set point over 100 %", { LSL: 1.2 }, /LSL set point/],
  ];
  for (const [what, levelSwitches, message] of badSwitches) {
    it(`rejects a display-only level switch with ${what}`, () => {
      const line = makeValidLine();
      line.machines[1].sim.levelSwitches = levelSwitches;
      const result = validateLine(line);
      expect(result.ok).toBe(false);
      expect(result.errors.join("\n")).toMatch(message);
    });
  }

  it("rejects display-only level switches on a machine with no level", () => {
    const line = makeValidLine();
    line.machines[1].sim = { kind: "passThrough", levelSwitches: { LSL: 0.35 } };
    expect(validateLine(line).errors.join("\n")).toMatch(/bufferBin" has level switches but no level/);
  });

  it("rejects a display-only level switch that an interlock on the same bin also names", () => {
    const line = makeValidLine();
    line.machines[1].sim.levelSwitches = { LSH: 0.85 };
    line.machines.push({
      id: "valve", type: "box", name: "VALVE", tag: "V", status: "new", zone: "packaging", x: 0, y: 0,
      ports: { inputs: [], outputs: [] }, anchors: {}, sim: { kind: "source", rateM3PerSec: 0 },
    });
    line.interlocks = [{
      id: "high", kind: "sentence",
      when: { machine: "bufferBin", condition: "above", setpoint: 0.85, switch: "LSH", delaySec: 1 },
      then: [{ action: "close", machine: "valve" }], reset: "auto",
    }];
    expect(validateLine(line).errors.join("\n")).toMatch(/bufferBin" level switch "LSH" is also named by interlock "high"/);
  });
});

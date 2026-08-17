import { describe, it, expect } from "vitest";
import { validateLine } from "./validateLine";

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

  it("rejects an orphan machine that no connection touches", () => {
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
    });
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("lonelyBin");
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

  it("accepts an interlock whose sensor and actuator both reference real machines", () => {
    const line = makeValidLine();
    line.machines[0].sim = { kind: "source", rateM3PerSec: 1 }; // feedStub
    line.interlocks = [{
      id: "trip", sensor: { machine: "bufferBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "feedStub", rampTimeSec: 5 },
    }];
    const result = validateLine(line);
    expect(result.ok).toBe(true);
  });

  it("rejects an interlock whose sensor references an unknown machine", () => {
    const line = makeValidLine();
    line.interlocks = [{
      id: "trip", sensor: { machine: "ghostBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "feedStub", rampTimeSec: 5 },
    }];
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("ghostBin");
  });

  it("rejects an interlock whose action references an unknown machine", () => {
    const line = makeValidLine();
    line.interlocks = [{
      id: "trip", sensor: { machine: "bufferBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "ghostValve", rampTimeSec: 5 },
    }];
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("ghostValve");
  });

  it("rejects an interlock whose action targets a machine that cannot be commanded", () => {
    const line = makeValidLine();
    line.machines[1].sim = { kind: "accumulator", capacityM3: 1 }; // bufferBin: no `command` behaviour method
    line.interlocks = [{
      id: "trip", sensor: { machine: "bufferBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "bufferBin", rampTimeSec: 5 },
    }];
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("bufferBin");
  });

  it("accepts an interlock whose action targets a source (which can be commanded)", () => {
    const line = makeValidLine();
    line.machines[0].sim = { kind: "source", rateM3PerSec: 1 }; // feedStub
    line.machines[1].sim = { kind: "accumulator", capacityM3: 1 };
    line.interlocks = [{
      id: "trip", sensor: { machine: "bufferBin" }, highSetpoint: 0.9, lowSetpoint: 0.3,
      signalDelaySec: 3, action: { machine: "feedStub", rampTimeSec: 5 },
    }];
    const result = validateLine(line);
    expect(result.ok).toBe(true);
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

  it("rejects a router with a declared output port that no connection routes anywhere", () => {
    const line = makeRouterLine();
    line.machines.find((m) => m.id === "diverter").ports.outputs.push("out3"); // declared, never wired
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("out3");
    expect(result.errors.join("\n")).toContain("diverter");
  });

  it("rejects a router whose defaultPort names a port it never declares", () => {
    const line = makeRouterLine();
    line.machines.find((m) => m.id === "diverter").sim.defaultPort = "outGhost";
    const result = validateLine(line);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("outGhost");
    expect(result.errors.join("\n")).toContain("diverter");
  });
});

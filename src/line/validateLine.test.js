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
});

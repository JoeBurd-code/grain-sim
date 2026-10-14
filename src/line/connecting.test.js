// Issue #88: connecting and disconnecting ports are pure line document
// functions, like addMachine/deleteMachine/moveMachine.
import { describe, it, expect } from "vitest";
import { connectPorts, disconnectConnection, connectionKey, addMachine, emptyLine } from "./lineDocument";
import { validateLine } from "./validateLine";
import { goldenLine } from "./goldenLine";

function add(line, itemId, pos) {
  const result = addMachine(line, itemId, pos);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}

function connect(line, a, b) {
  const result = connectPorts(line, a, b);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}

describe("connectPorts", () => {
  it("connects an output to an input as a product connection", () => {
    let line = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    line = add(line, "metal-bin", { x: 0, y: 200 });
    const result = connectPorts(line, { machine: "grain-in-1", port: "out" }, { machine: "metal-bin-1", port: "in" });
    expect(result.ok).toBe(true);
    expect(result.line.connections).toEqual([
      { from: { machine: "grain-in-1", port: "out" }, to: { machine: "metal-bin-1", port: "in" }, kind: "product" },
    ]);
    // The line it was given is untouched.
    expect(line.connections).toEqual([]);
  });

  it("connects just as well dragged the other way, input to output", () => {
    let line = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    line = add(line, "metal-bin", { x: 0, y: 200 });
    const result = connectPorts(line, { machine: "metal-bin-1", port: "in" }, { machine: "grain-in-1", port: "out" });
    expect(result.ok).toBe(true);
    expect(result.line.connections[0]).toMatchObject({
      from: { machine: "grain-in-1", port: "out" },
      to: { machine: "metal-bin-1", port: "in" },
    });
  });

  it("makes a waste connection from a waste port, whatever its exact name", () => {
    // treatMetalRemover's "waste" port.
    let line = add(goldenLine, "grain-out", { x: 0, y: -400 });
    let result = connectPorts(line, { machine: "treatMetalRemover", port: "waste" }, { machine: "grain-out-1", port: "in" });
    expect(result.ok).toBe(false); // already wired to metalRejectStub1 on the golden line
    line = add(line, "grain-out", { x: 400, y: -400 });
    // batchTreater's "wasteOut" port: chemical/wastewater out of scope, so it
    // is unconnected on the golden line.
    result = connectPorts(line, { machine: "batchTreater", port: "wasteOut" }, { machine: "grain-out-2", port: "in" });
    expect(result.ok).toBe(true);
    expect(result.line.connections.find((c) => c.from.machine === "batchTreater" && c.from.port === "wasteOut").kind)
      .toBe("waste");
  });

  it("refuses output to output", () => {
    const result = connectPorts(goldenLine, { machine: "treaterBufferBin", port: "out" }, { machine: "treatMetalRemover", port: "out" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/output/i);
  });

  it("refuses input to input", () => {
    const result = connectPorts(goldenLine, { machine: "treatDrumFeeder", port: "in" }, { machine: "treaterAfterBin", port: "in" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/input/i);
  });

  it("refuses an output port that already has a connection", () => {
    const line = add(goldenLine, "grain-out", { x: 0, y: -400 });
    // treaterBufferBin's "out" already feeds treatDrumFeeder.
    const result = connectPorts(line, { machine: "treaterBufferBin", port: "out" }, { machine: "grain-out-1", port: "in" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already connects/);
  });

  it("allows a second output onto an input that already has one, as a router's own two outlets may", () => {
    const line = add(goldenLine, "grain-in", { x: 400, y: -400 });
    // treatDrumFeeder's "in" already takes from treaterBufferBin; a second
    // source landing on the same input is not refused — only an output
    // feeding two places at once is (validateLine.test.js's router fixture
    // relies on exactly this).
    const result = connectPorts(line, { machine: "grain-in-1", port: "out" }, { machine: "treatDrumFeeder", port: "in" });
    expect(result.ok).toBe(true);
  });

  it("refuses a port connecting to itself", () => {
    const result = connectPorts(goldenLine, { machine: "treaterBufferBin", port: "out" }, { machine: "treaterBufferBin", port: "out" });
    expect(result.ok).toBe(false);
  });

  it("refuses an unknown machine or an unknown port", () => {
    expect(connectPorts(goldenLine, { machine: "ghost", port: "out" }, { machine: "treatDrumFeeder", port: "in" }).ok).toBe(false);
    expect(connectPorts(goldenLine, { machine: "treaterBufferBin", port: "ghost" }, { machine: "treatDrumFeeder", port: "in" }).ok).toBe(false);
  });

  it("never changes the line it is given", () => {
    const before = structuredClone(goldenLine);
    let line = add(goldenLine, "grain-out", { x: 0, y: -400 });
    connect(line, { machine: "batchTreater", port: "wasteOut" }, { machine: "grain-out-1", port: "in" });
    expect(goldenLine).toEqual(before);
  });
});

describe("disconnectConnection", () => {
  it("removes the one connection from the named output port", () => {
    const result = disconnectConnection(goldenLine, { machine: "treaterBufferBin", port: "out" });
    expect(result.ok).toBe(true);
    expect(result.line.connections.some((c) => c.from.machine === "treaterBufferBin")).toBe(false);
    expect(result.line.connections).toHaveLength(goldenLine.connections.length - 1);
    expect(validateLine(result.line).errors).toEqual([]);
    expect(goldenLine.connections.some((c) => c.from.machine === "treaterBufferBin")).toBe(true);
  });

  it("refuses an output port with no connection", () => {
    const result = disconnectConnection(goldenLine, { machine: "batchTreater", port: "wasteOut" });
    expect(result.ok).toBe(false);
  });

  it("round-trips with connectPorts", () => {
    // The reconnected one lands at the end of the list rather than back in
    // its original position, so this compares the set of connections, not
    // the whole line's array order.
    const from = { machine: "treaterBufferBin", port: "out" };
    const to = { machine: "treatDrumFeeder", port: "in" };
    const disconnected = disconnectConnection(goldenLine, from).line;
    const reconnected = connect(disconnected, from, to);
    expect(reconnected.machines).toEqual(goldenLine.machines);
    expect(new Set(reconnected.connections.map((c) => JSON.stringify(c))))
      .toEqual(new Set(goldenLine.connections.map((c) => JSON.stringify(c))));
  });
});

describe("connectionKey", () => {
  it("identifies a connection by its output end", () => {
    const c = goldenLine.connections.find((x) => x.from.machine === "treaterBufferBin");
    expect(connectionKey(c)).toBe("treaterBufferBin:out");
  });
});

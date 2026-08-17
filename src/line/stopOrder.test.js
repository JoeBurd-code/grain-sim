import { describe, it, expect } from "vitest";
import { line } from "./lineData";
import { computeStopOrder } from "./stopOrder";

describe("computeStopOrder (pure, no sim run required)", () => {
  it("includes every sim-enabled machine exactly once", () => {
    const order = computeStopOrder(line);
    const simEnabledIds = line.machines.filter((m) => m.sim).map((m) => m.id);
    expect(order.length).toBe(simEnabledIds.length);
    expect(new Set(order).size).toBe(order.length); // no duplicates
    for (const id of simEnabledIds) expect(order).toContain(id);
  });

  it("orders every connected pair of sim-enabled machines upstream before downstream", () => {
    const order = computeStopOrder(line);
    const position = new Map(order.map((id, i) => [id, i]));
    for (const c of line.connections) {
      if (!position.has(c.from.machine) || !position.has(c.to.machine)) continue;
      expect(
        position.get(c.from.machine),
        `${c.from.machine} should stop before ${c.to.machine}`
      ).toBeLessThan(position.get(c.to.machine));
    }
  });

  it("puts the line's real sources first", () => {
    const order = computeStopOrder(line);
    expect(order[0]).toBe("upstreamStub");
    expect(order.indexOf("proBoxStation")).toBeLessThan(order.indexOf("inletDrumFeeder1"));
  });

  it("stops the packaging conveyor before either destination it can feed", () => {
    const order = computeStopOrder(line);
    const conveyor = order.indexOf("pendulumConveyor");
    expect(conveyor).toBeGreaterThanOrEqual(0);
    expect(conveyor).toBeLessThan(order.indexOf("outloadBufferBin"));
    expect(conveyor).toBeLessThan(order.indexOf("binSegSampler"));
    expect(conveyor).toBeLessThan(order.indexOf("concettiSampler"));
  });

  it("is a pure function: the same line always yields the same order", () => {
    expect(computeStopOrder(line)).toEqual(computeStopOrder(line));
  });

  it("throws on a cycle among sim-enabled machines", () => {
    const cyclic = {
      ...line,
      machines: [
        { id: "a", sim: { kind: "passThrough" } },
        { id: "b", sim: { kind: "passThrough" } },
      ],
      connections: [
        { from: { machine: "a", port: "out" }, to: { machine: "b", port: "in" }, kind: "product" },
        { from: { machine: "b", port: "out" }, to: { machine: "a", port: "in" }, kind: "product" },
      ],
    };
    expect(() => computeStopOrder(cyclic)).toThrow(/cycle/);
  });

  it("ignores a connection touching a machine with no sim block", () => {
    const withStub = {
      ...line,
      machines: [
        { id: "a", sim: { kind: "passThrough" } },
        { id: "stub" }, // no `sim` — decorative only
      ],
      connections: [
        { from: { machine: "a", port: "out" }, to: { machine: "stub", port: "in" }, kind: "product" },
      ],
    };
    expect(computeStopOrder(withStub)).toEqual(["a"]);
  });
});

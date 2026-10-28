// Issue #155: flipping a machine left to right in Build mode. The flip is a
// flag; everything that depends on left and right reads it and mirrors
// across the vertical line through the machine's own centre.
import { describe, it, expect } from "vitest";
import { flipMachine, anchorPoint, machineFootprint, overlappingMachine } from "./layout";
import { portSide, connectionPoints } from "./routing";
import { setAdjustableValue } from "./adjustableFields";
import { diffFromBase, applyChanges, exportLine, importLine } from "./lineDocument";
import { validateLine } from "./validateLine";
import { goldenLine } from "./goldenLine";
import { createSim, stepSim, getMachineState, DT } from "../sim/engine";

const byId = (line, id) => line.machines.find((m) => m.id === id);
const box = (id, x, y, w, h, extra = {}) => ({
  id, name: id, type: "bin", x, y, w, h,
  ports: { inputs: ["in"], outputs: ["out"] },
  anchors: { in: { x: 5, y: 0 }, out: { x: w, y: h / 2 } },
  ...extra,
});

function flip(line, id) {
  const result = flipMachine(line, id);
  expect(result.ok, result.error).toBe(true);
  return result.line;
}

// The machine on its own, so no neighbour moves it aside.
const alone = (id) => ({ ...goldenLine, machines: [byId(goldenLine, id)], connections: [] });

describe("flipMachine", () => {
  it("sets a flag and leaves the stored geometry as it is", () => {
    const before = byId(goldenLine, "treatingElevator");
    const { flipped, ...rest } = byId(flip(alone("treatingElevator"), "treatingElevator"), "treatingElevator");
    expect(flipped).toBe(true);
    expect(rest).toEqual(before);
  });

  it("clears the flag when a flipped machine is flipped again", () => {
    const line = alone("treatingElevator");
    expect(flip(flip(line, "treatingElevator"), "treatingElevator")).toEqual(line);
  });

  it("never changes the line it is given", () => {
    const snapshot = structuredClone(goldenLine);
    flip(goldenLine, "treatingElevator");
    expect(goldenLine).toEqual(snapshot);
  });

  it("refuses a machine the line does not have", () => {
    expect(flipMachine(goldenLine, "nope")).toMatchObject({ ok: false });
  });
});

describe("mirroring a flipped machine", () => {
  it("mirrors each anchor across the machine's centre", () => {
    const m = byId(goldenLine, "treatingElevator");
    const f = byId(flip(goldenLine, m.id), m.id);
    for (const port of Object.keys(m.anchors)) {
      expect(anchorPoint(m, port)).toEqual(m.anchors[port]);
      expect(anchorPoint(f, port)).toEqual({ x: m.w - m.anchors[port].x, y: m.anchors[port].y });
    }
  });

  it("mirrors the footprint, so a Z-shaped duct's climb moves to the other side", () => {
    // An L: floor run along the bottom, mast and ceiling run on the right.
    const m = box("a", 100, 0, 100, 100, { geom: { colX: 80, duct: 20 } });
    expect(machineFootprint({ ...m, flipped: true })).toEqual([
      { x: 100, y: 80, w: 100, h: 20 },
      { x: 100, y: 0, w: 20, h: 100 },
      { x: 100, y: 0, w: 20, h: 20 },
    ]);
  });

  it("puts a port on the mirrored side", () => {
    const m = box("a", 0, 0, 40, 40);
    expect(portSide(m, "out")).toBe("right");
    expect(portSide({ ...m, flipped: true }, "out")).toBe("left");
  });

  it("re-routes attached connections to the mirrored ports, dropping bends and coupling", () => {
    const line = {
      machines: [box("a", 0, 0, 40, 40), box("b", 200, 0, 40, 40)],
      connections: [{ from: { machine: "a", port: "out" }, to: { machine: "b", port: "in" }, kind: "product", via: [{ x: 1, y: 1 }], coupling: true }],
    };
    const next = flip(line, "a");
    const c = next.connections[0];
    expect(c.via).toBeUndefined();
    expect(c.coupling).toBeUndefined();
    expect(connectionPoints(next, c)[0]).toEqual({ x: 0, y: 20 });
  });

  it("moves a flip that would overlap a neighbour to the nearest free spot", () => {
    // `a` is an L: a floor run along the bottom and a mast up its right
    // side, with `b` in the free corner top left. Flipped, the mast moves to
    // the left side, through `b`.
    const a = box("a", 0, 0, 100, 100, { geom: { colX: 80, duct: 20 } });
    const b = box("b", 0, 0, 60, 60);
    const line = { machines: [a, b], connections: [] };
    expect(overlappingMachine(line, "a", a)).toBeNull();
    const next = flip(line, "a");
    const moved = byId(next, "a");
    expect(moved.flipped).toBe(true);
    expect({ x: moved.x, y: moved.y }).not.toEqual({ x: 0, y: 0 });
    expect(overlappingMachine(next, "a", moved)).toBeNull();
  });

  it("keeps a flipped pendulum conveyor's floor run in place when its path is lengthened", () => {
    const flipped = flip(alone("pendulumConveyor"), "pendulumConveyor");
    const world = (line, port) => {
      const m = byId(line, "pendulumConveyor");
      const a = anchorPoint(m, port);
      return { x: m.x + a.x, y: m.y + a.y };
    };
    const result = setAdjustableValue(flipped, "pendulumConveyor", "pathLength", 40);
    expect(result.ok, result.error).toBe(true);
    expect(world(result.line, "in1").x).toBeCloseTo(world(flipped, "in1").x, 9);
    expect(world(result.line, "in1").y).toBeCloseTo(world(flipped, "in1").y, 9);
    expect(world(result.line, "outConcetti").x).toBeCloseTo(world(flipped, "outConcetti").x, 9);
    expect(world(result.line, "outConcetti").y).toBeLessThan(world(flipped, "outConcetti").y);
  });
});

describe("a flipped line", () => {
  it("gives the same sim results as the unflipped one", () => {
    const run = (line) => {
      const sim = createSim(line);
      for (let i = 0; i < Math.round(120 / DT); i++) stepSim(sim, DT);
      return line.machines.map((m) => getMachineState(sim, m.id));
    };
    const flipped = flip(flip(goldenLine, "treatingElevator"), "pendulumConveyor");
    expect(run(flipped)).toEqual(run(goldenLine));
  });

  it("passes validateLine, which refuses a flag that is not true or false", () => {
    expect(validateLine(flip(goldenLine, "treatingElevator")).ok).toBe(true);
    const bad = { ...goldenLine, machines: goldenLine.machines.map((m) => (m.id === "treatingElevator" ? { ...m, flipped: "yes" } : m)) };
    const result = validateLine(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/flipped/);
  });

  it("round-trips through SAVE/OPEN", () => {
    const flipped = flip(goldenLine, "treatingElevator");
    const opened = importLine(exportLine(flipped, "test"));
    expect(opened.ok, opened.error).toBe(true);
    expect(byId(opened.line, "treatingElevator").flipped).toBe(true);
  });

  it("round-trips through the browser autosave's changes", () => {
    const flipped = flip(goldenLine, "treatingElevator");
    const changes = diffFromBase(goldenLine, flipped);
    expect(changes).toContainEqual({ machine: "treatingElevator", flipped: true });
    expect(applyChanges(goldenLine, JSON.parse(JSON.stringify(changes)))).toEqual(flipped);
  });
});

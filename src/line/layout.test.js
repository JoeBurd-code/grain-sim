// Issue #86: moving a machine in Build mode is a pure line document function.
import { describe, it, expect } from "vitest";
import { snapPosition, machineFootprint } from "./layout";
import { moveMachine, applyGeometryEdit } from "./lineDocument";
import { goldenLine } from "./goldenLine";
import { elevatorChain } from "../scene/elevatorMotion";

const byId = (line, id) => line.machines.find((m) => m.id === id);
const connectionsOf = (line, id) =>
  line.connections.filter((c) => c.from.machine === id || c.to.machine === id);

function move(line, id, pos) {
  const result = moveMachine(line, id, pos);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}

describe("applyGeometryEdit (issue #154)", () => {
  const box = (id, x, y, w, h) => ({ id, name: id, x, y, w, h, anchors: {} });
  const line = {
    machines: [box("a", 0, 0, 20, 20), box("b", 40, 0, 20, 20)],
    connections: [{ from: { machine: "a", port: "out" }, to: { machine: "b", port: "in" }, via: [{ x: 1, y: 1 }] }],
  };
  const widen = (w) => (l, m) => { m.w = w; };

  it("keeps the machine in place when the new shape overlaps nothing", () => {
    const result = applyGeometryEdit(line, "a", widen(40));
    expect(result.ok).toBe(true);
    expect(byId(result.line, "a")).toMatchObject({ x: 0, y: 0, w: 40 });
  });

  it("moves an overlapping machine to the nearest free spot and re-routes its connections", () => {
    const result = applyGeometryEdit(line, "a", widen(50));
    expect(result.ok).toBe(true);
    const a = byId(result.line, "a");
    expect(a.w).toBe(50);
    expect({ x: a.x, y: a.y }).toEqual({ x: -10, y: 0 });
    expect(result.line.connections[0].via).toBeUndefined();
    expect(byId(line, "a")).toMatchObject({ x: 0, w: 20 });
  });

  it("refuses when no free spot is in range, leaving the line unchanged", () => {
    // Walls flush around `a`'s current box: it fits now, and only the edit
    // pushes it into a wall wherever the search tries it.
    const T = 5000;
    const walled = {
      ...line,
      machines: [
        line.machines[0],
        box("top", -T, -T, 20 + 2 * T, T), box("bottom", -T, 20, 20 + 2 * T, T),
        box("left", -T, 0, T, 20), box("right", 20, 0, T, 20),
      ],
    };
    const snapshot = structuredClone(walled);
    expect(applyGeometryEdit(walled, "a", widen(20)).ok).toBe(true);
    const result = applyGeometryEdit(walled, "a", widen(30));
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/no free place/);
    expect(walled).toEqual(snapshot);
  });
});

describe("snapPosition", () => {
  it("snaps to the 10 px grid", () => {
    expect(snapPosition({ x: 144, y: 156 })).toEqual({ x: 140, y: 160 });
    expect(snapPosition({ x: -14, y: 5 })).toEqual({ x: -10, y: 10 });
  });

  it("places to the whole unit when snapping is off", () => {
    expect(snapPosition({ x: 144.2, y: 473.00006 }, false)).toEqual({ x: 144, y: 473 });
  });
});

describe("machineFootprint", () => {
  it("is the machine's box for a plain machine", () => {
    const m = byId(goldenLine, "treaterBufferBin");
    expect(machineFootprint(m)).toEqual([{ x: m.x, y: m.y, w: m.w, h: m.h }]);
  });

  // Checked against the chain path the scene draws, so the footprint and
  // the drawing cannot drift apart.
  it("covers the drawn duct of a Z-shaped machine, and leaves its open corners free", () => {
    for (const id of ["treatingElevator", "pendulumConveyor"]) {
      const m = byId(goldenLine, id);
      const rects = machineFootprint(m);
      const inside = (x, y) => rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      const { points } = elevatorChain(m);
      for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1], [x1, y1] = points[i];
        for (let t = 0; t <= 1; t += 0.05) {
          expect(inside(m.x + x0 + (x1 - x0) * t, m.y + y0 + (y1 - y0) * t), `${id} chain point`).toBe(true);
        }
      }
      // Above the floor run, left of the climb; below the ceiling run, right of it.
      expect(inside(m.x + 10, m.y + 10)).toBe(false);
      expect(inside(m.x + m.w - 10, m.y + m.h - 10)).toBe(false);
    }
  });
});

describe("moveMachine", () => {
  it("moves the machine and nothing else", () => {
    const moved = move(goldenLine, "discardBin", { x: 300, y: 900 });
    expect(byId(moved, "discardBin")).toMatchObject({ x: 300, y: 900 });
    for (const m of goldenLine.machines) {
      if (m.id !== "discardBin") expect(byId(moved, m.id)).toEqual(m);
    }
  });

  it("never changes the line it was given", () => {
    const before = structuredClone(goldenLine);
    move(goldenLine, "discardBin", { x: 300, y: 900 });
    expect(goldenLine).toEqual(before);
  });

  it("drops the hand-placed bend points of the moved machine's connections only", () => {
    // The screen's waste line to the discard bin is hand-routed, and so is
    // the drum feeder's line into the treating elevator.
    const waste = connectionsOf(goldenLine, "discardBin")[0];
    expect(waste.via).toBeDefined();
    const moved = move(goldenLine, "discardBin", { x: 300, y: 900 });
    expect(connectionsOf(moved, "discardBin")[0].via).toBeUndefined();
    const feeder = (line) => line.connections.find((c) => c.from.machine === "treatDrumFeeder");
    expect(feeder(moved)).toEqual(feeder(goldenLine));
    expect(feeder(moved).via).toBeDefined();
  });

  it("drops the coupling mark too, since the two ends no longer touch", () => {
    const coupled = (line) => line.connections.find((c) => c.from.machine === "treaterAfterBin");
    expect(coupled(goldenLine).coupling).toBe(true);
    const moved = move(goldenLine, "afterBinOutletValve", { x: 400, y: 700 });
    expect(coupled(moved).coupling).toBeUndefined();
  });

  it("returns the same line for a move to where the machine already is", () => {
    const m = byId(goldenLine, "discardBin");
    expect(moveMachine(goldenLine, "discardBin", { x: m.x, y: m.y })).toEqual({ ok: true, line: goldenLine });
  });

  it("refuses a position on top of another machine", () => {
    const bin = byId(goldenLine, "treaterBufferBin");
    const result = moveMachine(goldenLine, "discardBin", { x: bin.x + 10, y: bin.y + 10 });
    expect(result.ok).toBe(false);
    expect(result.overlaps).toBe("treaterBufferBin");
  });

  it("allows a machine to touch another along an edge", () => {
    const bin = byId(goldenLine, "discardBin");
    // The after-bin's outlet valve hangs right under it, touching.
    expect(moveMachine(goldenLine, "discardBin", { x: bin.x, y: bin.y + 5 }).ok).toBe(true);
    const after = byId(goldenLine, "treaterAfterBin");
    const valve = byId(goldenLine, "afterBinOutletValve");
    expect(moveMachine(goldenLine, "afterBinOutletValve", { x: valve.x + 10, y: after.y + after.h }).ok).toBe(true);
  });

  it("allows a machine inside the open part of a Z-shaped duct", () => {
    // The buffer bin sits inside the treating elevator's bounding box but
    // clear of its duct.
    const bin = byId(goldenLine, "treaterBufferBin");
    expect(moveMachine(goldenLine, "treaterBufferBin", { x: bin.x + 10, y: bin.y }).ok).toBe(true);
  });

  it("refuses a position on the duct of a Z-shaped machine", () => {
    const elevator = byId(goldenLine, "treatingElevator");
    const { colX } = elevator.geom;
    const result = moveMachine(goldenLine, "discardBin", { x: elevator.x + colX - 20, y: elevator.y + 50 });
    expect(result).toMatchObject({ ok: false, overlaps: "treatingElevator" });
  });

  it("refuses an unknown machine and a position that is not a number", () => {
    expect(moveMachine(goldenLine, "noSuchMachine", { x: 0, y: 0 }).ok).toBe(false);
    expect(moveMachine(goldenLine, "discardBin", { x: "a", y: 0 }).ok).toBe(false);
    expect(moveMachine(goldenLine, "discardBin", { x: NaN, y: 0 }).ok).toBe(false);
    expect(moveMachine(goldenLine, "discardBin", null).ok).toBe(false);
  });
});

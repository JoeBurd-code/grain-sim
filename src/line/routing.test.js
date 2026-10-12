// Issue #86: a connection with no bend points is routed with right-angle
// bends between its two port anchors.
import { describe, it, expect } from "vitest";
import { connectionPoints, portSide } from "./routing";
import { moveMachine } from "./lineDocument";
import { goldenLine } from "./goldenLine";

function move(line, id, pos) {
  const result = moveMachine(line, id, pos);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}

const byId = (line, id) => line.machines.find((m) => m.id === id);
const anchor = (line, end) => {
  const m = byId(line, end.machine);
  return { x: m.x + m.anchors[end.port].x, y: m.y + m.anchors[end.port].y };
};
const connectionInto = (line, id) => line.connections.find((c) => c.to.machine === id);

function expectRightAngles(points) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    expect(a.x === b.x || a.y === b.y, `segment ${i} is diagonal`).toBe(true);
  }
}

// The unit direction of the segment from a to b.
const dir = (a, b) => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });

describe("portSide", () => {
  it("is the footprint edge the anchor sits on", () => {
    const line = goldenLine;
    expect(portSide(byId(line, "treaterBufferBin"), "in")).toBe("top");
    expect(portSide(byId(line, "treaterBufferBin"), "out")).toBe("bottom");
    expect(portSide(byId(line, "batchTreater"), "out")).toBe("left");
    expect(portSide(byId(line, "outloadDiverter"), "out2")).toBe("right");
  });

  it("reads a Z-shaped duct by the run the port is on, not the bounding box", () => {
    // The elevator's inlet is on top of its floor run, at the bottom of its box.
    expect(portSide(byId(goldenLine, "treatingElevator"), "in")).toBe("top");
    expect(portSide(byId(goldenLine, "pendulumConveyor"), "outBuffer")).toBe("bottom");
  });

  it("falls back to outputs leaving downward and inputs arriving from above at a point-sized stub", () => {
    expect(portSide(byId(goldenLine, "upstreamStub"), "out")).toBe("bottom");
    expect(portSide(byId(goldenLine, "palletStub"), "in")).toBe("top");
  });
});

describe("connectionPoints", () => {
  it("keeps a connection's hand-placed bend points", () => {
    const c = connectionInto(goldenLine, "discardBin");
    expect(connectionPoints(goldenLine, c)).toEqual([anchor(goldenLine, c.from), ...c.via, anchor(goldenLine, c.to)]);
  });

  it("draws every golden line connection exactly as written until a machine moves", () => {
    for (const c of goldenLine.connections) {
      expect(connectionPoints(goldenLine, c), `${c.from.machine} to ${c.to.machine}`)
        .toEqual([anchor(goldenLine, c.from), ...(c.via ?? []), anchor(goldenLine, c.to)]);
    }
  });

  it("draws a straight drop when the two ports line up", () => {
    const c = connectionInto(goldenLine, "concettiScale");
    expect(c.via).toBeUndefined();
    expect(connectionPoints(goldenLine, c)).toEqual([anchor(goldenLine, c.from), anchor(goldenLine, c.to)]);
  });

  it("routes a moved machine's connection with right-angle bends, leaving and arriving through the ports' own sides", () => {
    const line = move(goldenLine, "discardBin", { x: 300, y: 900 });
    const c = connectionInto(line, "discardBin");
    const points = connectionPoints(line, c);
    expect(points[0]).toEqual(anchor(line, c.from));
    expect(points.at(-1)).toEqual(anchor(line, c.to));
    expect(points.length).toBeGreaterThan(2);
    expectRightAngles(points);
    // Out of the screen's waste port downward, into the bin's top downward.
    expect(dir(points[0], points[1])).toEqual({ x: 0, y: 1 });
    expect(dir(points.at(-2), points.at(-1))).toEqual({ x: 0, y: 1 });
  });

  it("leaves a side port sideways", () => {
    const line = move(goldenLine, "treaterAfterBin", { x: 400, y: 600 });
    const c = connectionInto(line, "treaterAfterBin");
    expect(c.from).toEqual({ machine: "batchTreater", port: "out" });
    const points = connectionPoints(line, c);
    expectRightAngles(points);
    expect(dir(points[0], points[1])).toEqual({ x: -1, y: 0 });
    expect(dir(points.at(-2), points.at(-1))).toEqual({ x: 0, y: 1 });
  });

  it("has no repeated or straight-through points", () => {
    const line = move(goldenLine, "discardBin", { x: 300, y: 900 });
    const points = connectionPoints(line, connectionInto(line, "discardBin"));
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      expect(a.x === b.x && b.x === c.x).toBe(false);
      expect(a.y === b.y && b.y === c.y).toBe(false);
    }
  });

  it("routes every connection on a line whose every machine moved", () => {
    let line = goldenLine;
    for (const m of goldenLine.machines) line = move(line, m.id, { x: m.x + 2000, y: m.y + 3000 });
    for (const c of line.connections) {
      const points = connectionPoints(line, c);
      expectRightAngles(points);
      expect(points[0]).toEqual(anchor(line, c.from));
      expect(points.at(-1)).toEqual(anchor(line, c.to));
    }
  });
});

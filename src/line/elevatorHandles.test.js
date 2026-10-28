// Issue #157: drag handles reshape a bucket elevator's zigzag within its
// path length (issue #156).
import { describe, it, expect } from "vitest";
import {
  zHandles, segmentsAfterDrag, previewReshape, reshapeZ, PX_PER_M, MIN_COLUMN_M, MIN_RUN_M,
} from "./zShape";
import { flipMachine, overlappingMachine, anchorWorld } from "./layout";
import { diffFromBase, applyChanges } from "./lineChanges";
import { setAdjustableValue } from "./adjustableFields";
import { validateLine } from "./validateLine";
import { goldenLine } from "./goldenLine";

const ID = "treatingElevator";
const byId = (line, id) => line.machines.find((m) => m.id === id);
const sumOf = (s) => s.floor + s.column + s.head;
const alone = (line = goldenLine) => structuredClone({
  zones: line.zones, machines: [byId(line, ID)], connections: [], interlocks: [], machineRules: [],
});
// The golden elevator with room in both runs: floor 2, column 5.731, head 1.
function roomy(line = alone()) {
  const result = reshapeZ(line, ID, { floor: 2, column: 5.731, head: 1 });
  expect(result.ok, result.error).toBe(true);
  return result.line;
}
const handle = (m, id) => zHandles(m).find((h) => h.id === id);
const world = (m, h) => ({ x: m.x + h.x, y: m.y + h.y });

describe("the handles", () => {
  it("are the floor run's end, the head run's end and the column's top", () => {
    const m = byId(roomy(), ID);
    const { colX, duct } = m.geom;
    expect(zHandles(m).map((h) => h.id).sort()).toEqual(["column", "floor", "head"]);
    expect(handle(m, "floor")).toMatchObject({ x: 0, y: m.h - duct / 2, axis: "x" });
    expect(handle(m, "head")).toMatchObject({ x: m.w, y: duct / 2, axis: "x" });
    expect(handle(m, "column")).toMatchObject({ x: colX + duct / 2, y: 0, axis: "y" });
  });

  it("sit on the mirrored positions of a flipped elevator", () => {
    const plain = byId(roomy(), ID);
    const flipped = byId(flipMachine(roomy(), ID).line, ID);
    for (const id of ["floor", "head", "column"]) {
      expect(handle(flipped, id).x).toBeCloseTo(plain.w - handle(plain, id).x, 9);
      expect(handle(flipped, id).y).toBeCloseTo(handle(plain, id).y, 9);
    }
  });

  it("are none on a machine that is not a bucket elevator", () => {
    const bin = goldenLine.machines.find((m) => m.type === "bin");
    expect(zHandles(bin)).toEqual([]);
  });
});

describe("dragging a handle", () => {
  const m = () => byId(roomy(), ID);

  it("out along the floor lengthens the floor run and shortens the column by as much", () => {
    const s = segmentsAfterDrag(m(), "floor", { x: -30, y: 0 });
    expect(s.floor).toBeCloseTo(3, 9);
    expect(s.column).toBeCloseTo(4.731, 9);
    expect(s.head).toBe(1);
    expect(sumOf(s)).toBeCloseTo(8.731, 9);
  });

  it("out sideways lengthens the head run from the column, and back in returns it", () => {
    const out = segmentsAfterDrag(m(), "head", { x: 15, y: 0 });
    expect(out).toMatchObject({ floor: 2, head: 1.5 });
    expect(out.column).toBeCloseTo(5.231, 9);
    const back = segmentsAfterDrag(m(), "head", { x: -15, y: 0 });
    expect(back).toMatchObject({ floor: 2, head: 0.5 });
    expect(back.column).toBeCloseTo(6.231, 9);
  });

  it("the column top up lengthens the column from the head run, and down gives it back", () => {
    const up = segmentsAfterDrag(m(), "column", { x: 0, y: -15 });
    expect(up).toMatchObject({ floor: 2, head: 0.5 });
    expect(up.column).toBeCloseTo(6.231, 9);
    const down = segmentsAfterDrag(m(), "column", { x: 0, y: 30 });
    expect(down).toMatchObject({ floor: 2, head: 2 });
    expect(down.column).toBeCloseTo(4.731, 9);
  });

  it("stops at the segment minimums", () => {
    expect(segmentsAfterDrag(m(), "floor", { x: -3000, y: 0 }).column).toBe(MIN_COLUMN_M);
    expect(segmentsAfterDrag(m(), "floor", { x: 3000, y: 0 }).floor).toBe(MIN_RUN_M);
    expect(segmentsAfterDrag(m(), "column", { x: 0, y: -3000 }).head).toBe(MIN_RUN_M);
    expect(segmentsAfterDrag(m(), "column", { x: 0, y: 3000 }).column).toBe(MIN_COLUMN_M);
  });

  it("moves in 0.1 m steps, or 0.01 m when fine", () => {
    expect(segmentsAfterDrag(m(), "floor", { x: -4, y: 0 }).floor).toBe(2.1);
    expect(segmentsAfterDrag(m(), "floor", { x: -4, y: 0 }, { fine: true }).floor).toBe(2.13);
  });

  it("drags the mirrored way on a flipped elevator", () => {
    const flipped = byId(flipMachine(roomy(), ID).line, ID);
    expect(segmentsAfterDrag(flipped, "floor", { x: 30, y: 0 }).floor).toBeCloseTo(3, 9);
    expect(segmentsAfterDrag(flipped, "head", { x: -15, y: 0 }).head).toBeCloseTo(1.5, 9);
  });
});

describe("the reshaped elevator", () => {
  it("keeps its boot, and the dragged handle follows the pointer along its axis", () => {
    const line = roomy();
    const before = byId(line, ID);
    for (const [id, delta] of [["floor", { x: -30, y: 0 }], ["head", { x: 30, y: 0 }], ["column", { x: 0, y: -15 }]]) {
      const after = byId(previewReshape(line, ID, segmentsAfterDrag(before, id, delta)), ID);
      const { axis } = handle(before, id);
      expect(world(after, handle(after, id))[axis]).toBeCloseTo(world(before, handle(before, id))[axis] + delta[axis], 9);
      expect(after.y + after.h).toBeCloseTo(before.y + before.h, 9);
    }
  });

  it("is drawn from its new segments, its path length unchanged", () => {
    const line = roomy();
    const s = segmentsAfterDrag(byId(line, ID), "floor", { x: -30, y: 0 });
    const result = reshapeZ(line, ID, s);
    expect(result.ok, result.error).toBe(true);
    const after = byId(result.line, ID);
    expect(after.geom.segmentsM).toEqual(s);
    expect(after.sim.distanceM).toBeCloseTo(8.731, 9);
    expect(after.h).toBeCloseTo(s.column * PX_PER_M, 9);
    expect(validateLine(result.line).ok).toBe(true);
  });

  it("previews over a neighbour, then settles into the nearest free spot on release", () => {
    const m = byId(roomy(), ID);
    // A block just above the head run: a taller column grows into it.
    const block = { id: "block", name: "block", type: "bin", x: m.x, y: m.y - 60, w: m.w, h: 50, ports: { inputs: [], outputs: [] }, anchors: {} };
    const line = { ...alone(), machines: [m, block] };
    const s = segmentsAfterDrag(m, "column", { x: 0, y: -15 });
    const preview = previewReshape(line, ID, s);
    expect(overlappingMachine(preview, ID, byId(preview, ID))).toBe("block");
    const result = reshapeZ(line, ID, s);
    expect(result.ok, result.error).toBe(true);
    expect(overlappingMachine(result.line, ID, byId(result.line, ID))).toBeNull();
    expect(byId(result.line, ID).geom.segmentsM).toEqual(s);
  });

  it("re-routes its connections on release", () => {
    const line = structuredClone(goldenLine);
    const touching = line.connections.find((c) => c.from.machine === ID || c.to.machine === ID);
    touching.via = [{ x: 0, y: 0 }];
    const s = segmentsAfterDrag(byId(line, ID), "floor", { x: -30, y: 0 });
    const result = reshapeZ(line, ID, s);
    expect(result.ok, result.error).toBe(true);
    const after = result.line.connections.find((c) => c.from.machine === touching.from.machine && c.to.machine === touching.to.machine);
    expect(after.via).toBeUndefined();
  });

  it("refuses segments that don't add up to the path length", () => {
    const result = reshapeZ(roomy(), ID, { floor: 2, column: 6, head: 1 });
    expect(result.ok).toBe(false);
  });

  it("refuses a machine that is not a bucket elevator", () => {
    const bin = goldenLine.machines.find((m) => m.type === "bin");
    expect(reshapeZ(goldenLine, bin.id, { floor: 1, column: 6, head: 1 }).ok).toBe(false);
  });
});

describe("saved golden line changes", () => {
  it("keep a reshaped elevator's segments", () => {
    const s = segmentsAfterDrag(byId(goldenLine, ID), "column", { x: 0, y: 30 });
    const line = reshapeZ(goldenLine, ID, s).line;
    const changes = diffFromBase(goldenLine, line);
    expect(changes).toContainEqual({ machine: ID, segments: s });
    const back = applyChanges(goldenLine, JSON.parse(JSON.stringify(changes)));
    expect(byId(back, ID).geom.segmentsM).toEqual(s);
    const [was, now] = [anchorWorld(byId(line, ID), "out"), anchorWorld(byId(back, ID), "out")];
    expect(now.x).toBeCloseTo(was.x, 9);
    expect(now.y).toBeCloseTo(was.y, 9);
  });

  it("keep a reshape made after a new path length", () => {
    const longer = setAdjustableValue(goldenLine, ID, "pathLength", 12).line;
    const s = segmentsAfterDrag(byId(longer, ID), "floor", { x: -30, y: 0 });
    const line = reshapeZ(longer, ID, s).line;
    const back = applyChanges(goldenLine, diffFromBase(goldenLine, line));
    expect(byId(back, ID).geom.segmentsM).toEqual(s);
    expect(byId(back, ID).sim.distanceM).toBeCloseTo(12, 9);
  });

  it("list no segments for a new path length alone", () => {
    const longer = setAdjustableValue(goldenLine, ID, "pathLength", 12).line;
    expect(diffFromBase(goldenLine, longer).some((c) => c.segments)).toBe(false);
  });
});

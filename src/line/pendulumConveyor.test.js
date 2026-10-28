// Issue #160: the pendulum conveyor joins the bucket elevator's Z-shape
// model (zShape.js): three segments in metres, drawn at the shared scale,
// with its ports at their shares of their runs.
import { describe, it, expect } from "vitest";
import {
  PX_PER_M, INLET_INSET, MIN_RUN_M, MIN_COLUMN_M, drawZ, zHandles, segmentLabels, segmentsAfterDrag, reshapeZ,
  changesFromLengthModel,
} from "./zShape";
import { setAdjustableValue, adjustableFields } from "./adjustableFields";
import { flipMachine, overlappingMachine, anchorWorld } from "./layout";
import { connectionPoints } from "./routing";
import { diffFromBase, applyChanges } from "./lineChanges";
import { exportLine, importLine } from "./lineDocument";
import { validateLine } from "./validateLine";
import { goldenLine } from "./goldenLine";
import { catalogueItem, drawnItem } from "../catalogue/catalogue";
import { loadSavedWork, SAVED_WORK_KEY } from "../app/savedWork";

const ID = "pendulumConveyor";
const SPEC = { floor: 7.084, column: 9.157, head: 14.846 };
const byId = (line, id) => line.machines.find((m) => m.id === id);
const sumOf = (s) => s.floor + s.column + s.head;
const alone = (line = goldenLine) => structuredClone({
  zones: line.zones, machines: [byId(line, ID)], connections: [], interlocks: [], machineRules: [],
});
function boot(m) {
  const centre = m.geom.colX + m.geom.duct / 2;
  return { x: m.x + (m.flipped ? m.w - centre : centre), y: m.y + m.h };
}
// A port's share of its run, measured from the column, read off its anchor.
function shareOf(m, port) {
  const { colX, duct, segmentsM: s } = m.geom;
  const a = m.anchors[port];
  return m.ports.inputs.includes(port) ? (colX - a.x) / (s.floor * PX_PER_M) : (a.x - colX - duct) / (s.head * PX_PER_M);
}

// The golden pendulum conveyor as a line saved before issue #160 held it:
// drawn 2030 x 780 px with its climb at 280, a "length" field, and its
// outlets' distances apportioned over the head run alone.
function lengthModelPendulum(length = 31.087) {
  const m = structuredClone(byId(goldenLine, ID));
  const ratio = length / 31.087;
  delete m.geom.segmentsM;
  delete m.geom.portShares;
  Object.assign(m, { x: 1160, y: 140, w: 2030 * ratio, h: 780 });
  m.geom.colX = 280;
  m.anchors = {
    in1: { x: 170, y: 744 }, in2: { x: 40, y: 744 },
    outBuffer: { x: 520 + 2030 * (ratio - 1), y: 26 }, outBinSeg: { x: 1400 + 2030 * (ratio - 1), y: 26 }, outConcetti: { x: 2025 + 2030 * (ratio - 1), y: 26 },
  };
  m.sim.distanceM = length;
  m.sim.portDistanceM = { outBuffer: length * (240 / 1745), outBinSeg: length * (1120 / 1745), outConcetti: length };
  m.adjustable = m.adjustable.map((a) => (a.bind === "pathLength"
    ? { id: "length", label: "length", unit: "m", kind: "number", min: 15, max: 60, default: 31.087, bind: "length" }
    : a));
  return m;
}

describe("the golden line's pendulum conveyor", () => {
  it("stores the spec block's segments, drawn at the shared true scale", () => {
    const m = byId(goldenLine, ID);
    expect(m.geom.segmentsM).toEqual(SPEC);
    expect(m.sim.distanceM).toBe(31.087);
    expect(m.h).toBeCloseTo(SPEC.column * PX_PER_M, 9);
    expect(m.geom.colX - INLET_INSET).toBeCloseTo(SPEC.floor * PX_PER_M, 9);
    expect(m.anchors.outConcetti.x - m.geom.colX - m.geom.duct).toBeCloseTo(SPEC.head * PX_PER_M, 9);
  });

  it("is stored exactly as its segments and port shares draw it", () => {
    const m = byId(goldenLine, ID);
    const drawn = structuredClone(m);
    drawZ(drawn, m.geom.segmentsM);
    expect(drawn.w).toBeCloseTo(m.w, 9);
    expect(drawn.h).toBeCloseTo(m.h, 9);
    for (const [port, a] of Object.entries(m.anchors)) {
      expect(drawn.anchors[port].x, port).toBeCloseTo(a.x, 9);
      expect(drawn.anchors[port].y, port).toBeCloseTo(a.y, 9);
    }
    for (const [port, d] of Object.entries(m.sim.portDistanceM)) {
      expect(drawn.sim.portDistanceM[port], port).toBeCloseTo(d, 9);
    }
  });

  it("reads its path length in the panel, with the old length's limits", () => {
    const fields = adjustableFields(byId(goldenLine, ID));
    expect(fields.find((f) => f.id === "pathLength")).toMatchObject({ label: "path length", unit: "m", min: 15, max: 60, default: 31.087 });
    expect(fields.some((f) => f.id === "length")).toBe(false);
  });

  it("is the same shape in the catalogue", () => {
    const item = catalogueItem("pendulum-conveyor").machine;
    const m = byId(goldenLine, ID);
    expect(item.geom.segmentsM).toEqual(SPEC);
    expect(item.geom.portShares).toEqual(m.geom.portShares);
    expect(item.w).toBeCloseTo(m.w, 9);
    expect(item.h).toBeCloseTo(m.h, 9);
    for (const [port, a] of Object.entries(m.anchors)) expect(item.anchors[port].x, port).toBeCloseTo(a.x, 9);
    expect(item.adjustable.find((a) => a.bind === "pathLength")).toBeDefined();
  });

  it("sends each outlet its real distance along the path", () => {
    const { portDistanceM } = byId(goldenLine, ID).sim;
    const toHead = SPEC.floor + SPEC.column;
    expect(portDistanceM.outBuffer).toBeCloseTo(toHead + 0.1375 * SPEC.head, 9);
    expect(portDistanceM.outBinSeg).toBeCloseTo(toHead + 0.6418 * SPEC.head, 9);
    expect(portDistanceM.outConcetti).toBe(31.087);
    // About 18.3 m and 25.8 m, where the head run alone gave 4.3 m and 20.0 m.
    expect(portDistanceM.outBuffer).toBeCloseTo(18.3, 1);
    expect(portDistanceM.outBinSeg).toBeCloseTo(25.8, 1);
    // Each inlet's is how far out along the floor run it sits.
    expect(portDistanceM.in1).toBeCloseTo(SPEC.floor / 2, 9);
    expect(portDistanceM.in2).toBe(0);
  });
});

describe("the golden line's packaging area", () => {
  it("passes validateLine, with no machine overlapping another", () => {
    expect(validateLine(goldenLine)).toEqual({ ok: true, errors: [] });
    for (const m of goldenLine.machines) expect(overlappingMachine(goldenLine, m.id, m), m.id).toBeNull();
  });

  it.each([
    ["inletDrumFeeder1", "out", "in1"],
    ["inletDrumFeeder2", "out", "in2"],
  ])("drops %s straight onto the floor run", (feeder, out, port) => {
    const from = anchorWorld(byId(goldenLine, feeder), out);
    const to = anchorWorld(byId(goldenLine, ID), port);
    expect(from.x).toBeCloseTo(to.x, 6);
    expect(from.y).toBeLessThan(to.y);
  });

  it.each([
    ["outBuffer", "grainBreak"],
    ["outBinSeg", "binSegSampler"],
    ["outConcetti", "concettiSampler"],
  ])("drops %s straight onto %s", (port, machine) => {
    const from = anchorWorld(byId(goldenLine, ID), port);
    const to = anchorWorld(byId(goldenLine, machine), "in");
    expect(from.x).toBeCloseTo(to.x, 3);
    expect(from.y).toBeLessThan(to.y);
  });

  it("feeds the buffer bin, the bin seg and the Concetti from left to right under the head run", () => {
    const x = (port) => anchorWorld(byId(goldenLine, ID), port).x;
    expect(x("outBuffer")).toBeLessThan(x("outBinSeg"));
    expect(x("outBinSeg")).toBeLessThan(x("outConcetti"));
  });
});

describe("a selected pendulum conveyor's handles (issue #157)", () => {
  const m = () => byId(goldenLine, ID);

  it("are the same three as the elevator's, with its segment labels", () => {
    expect(zHandles(m()).map((h) => h.id).sort()).toEqual(["column", "floor", "head"]);
    expect(segmentLabels(m()).map((l) => l.text)).toEqual(["7.084 m", "9.157 m", "14.846 m", "31.087 m total"]);
  });

  it("trade lengths and stop at the minimums", () => {
    const longer = segmentsAfterDrag(m(), "floor", { x: -30, y: 0 });
    expect(longer.floor).toBeCloseTo(8.084, 9);
    expect(longer.column).toBeCloseTo(8.157, 9);
    expect(sumOf(longer)).toBeCloseTo(31.087, 9);
    const shortest = segmentsAfterDrag(m(), "head", { x: -100000, y: 0 });
    expect(shortest.head).toBe(MIN_RUN_M);
    const tallest = segmentsAfterDrag(m(), "column", { x: 0, y: -100000 });
    expect(tallest.head).toBe(MIN_RUN_M);
    expect(segmentsAfterDrag(m(), "floor", { x: -100000, y: 0 }).column).toBe(MIN_COLUMN_M);
  });

  it("settle on release keeping the boot and the total, flipped or not", () => {
    for (const line of [alone(), flipMachine(alone(), ID).line]) {
      const before = byId(line, ID);
      const result = reshapeZ(line, ID, { floor: 5, column: 11.241, head: 14.846 });
      expect(result.ok, result.error).toBe(true);
      const after = byId(result.line, ID);
      expect(after.sim.distanceM).toBe(31.087);
      expect(boot(after).x).toBeCloseTo(boot(before).x, 9);
      expect(boot(after).y).toBeCloseTo(boot(before).y, 9);
    }
  });

  it("are one change, stored and reproduced", () => {
    const result = reshapeZ(goldenLine, ID, { floor: 5, column: 11.241, head: 14.846 });
    expect(result.ok, result.error).toBe(true);
    expect(applyChanges(goldenLine, diffFromBase(goldenLine, result.line))).toEqual(result.line);
  });
});

describe("ports along a run", () => {
  it("keep their share of their run when it changes length", () => {
    const before = byId(goldenLine, ID);
    const result = reshapeZ(alone(), ID, { floor: 4, column: 7.087, head: 20 });
    expect(result.ok, result.error).toBe(true);
    const after = byId(result.line, ID);
    for (const port of ["in1", "in2", "outBuffer", "outBinSeg", "outConcetti"]) {
      expect(shareOf(after, port), port).toBeCloseTo(shareOf(before, port), 9);
    }
    expect(after.sim.portDistanceM.outBinSeg).toBeCloseTo(4 + 7.087 + 0.6418 * 20, 9);
  });

  it("re-route their connections when the run changes", () => {
    const result = reshapeZ(goldenLine, ID, { floor: 7.084, column: 11.157, head: 12.846 });
    expect(result.ok, result.error).toBe(true);
    const line = result.line;
    for (const c of line.connections.filter((x) => x.from.machine === ID || x.to.machine === ID)) {
      expect(c.via).toBeUndefined();
      const points = connectionPoints(line, c);
      expect(points[0]).toEqual(anchorWorld(byId(line, c.from.machine), c.from.port));
      expect(points.at(-1)).toEqual(anchorWorld(byId(line, c.to.machine), c.to.port));
    }
  });

  it("keep their order along the head run: a shorter one never puts outBinSeg past outConcetti (#129)", () => {
    const result = reshapeZ(alone(), ID, { floor: 7.084, column: 23.503, head: 0.5 });
    expect(result.ok, result.error).toBe(true);
    const a = byId(result.line, ID).anchors;
    expect(a.outBuffer.x).toBeLessThan(a.outBinSeg.x);
    expect(a.outBinSeg.x).toBeLessThan(a.outConcetti.x);
  });
});

describe("a new path length", () => {
  it("changes only the column, keeping the runs and the boot", () => {
    const line = alone();
    const before = byId(line, ID);
    const result = setAdjustableValue(line, ID, "pathLength", 40);
    expect(result.ok, result.error).toBe(true);
    const after = byId(result.line, ID);
    expect(after.geom.segmentsM).toEqual({ floor: 7.084, column: 18.07, head: 14.846 });
    expect(after.sim.distanceM).toBe(40);
    expect(boot(after).x).toBeCloseTo(boot(before).x, 9);
    expect(boot(after).y).toBeCloseTo(boot(before).y, 9);
  });

  it("is refused where the runs leave the column short of its minimum", () => {
    const result = setAdjustableValue(alone(), ID, "pathLength", 20);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 25\.93 m/);
  });
});

describe("work saved before issue #160", () => {
  it("opens an old pendulum conveyor migrated, the spec block's proportions of its length, its boot kept", () => {
    const old = lengthModelPendulum(40);
    const oldBoot = { x: old.x + old.geom.colX + old.geom.duct / 2, y: old.y + old.h };
    const result = importLine(exportLine({ ...alone(), machines: [old] }, "old"));
    expect(result.ok, result.errors?.join("; ")).toBe(true);
    const m = byId(result.line, ID);
    expect(m.sim.distanceM).toBeCloseTo(40, 9);
    expect(m.geom.segmentsM.floor).toBeCloseTo((40 * 7.084) / 31.087, 9);
    expect(m.geom.segmentsM.head).toBeCloseTo((40 * 14.846) / 31.087, 9);
    expect(m.geom.portShares).toEqual(byId(goldenLine, ID).geom.portShares);
    expect(adjustableFields(m).find((f) => f.id === "pathLength")).toMatchObject({ min: 15, max: 60, default: 31.087 });
    expect(boot(m).x).toBeCloseTo(oldBoot.x, 9);
    expect(boot(m).y).toBeCloseTo(oldBoot.y, 9);
  });

  it("opens the whole old golden line, settling an overlapping result into a free spot", () => {
    const old = structuredClone(goldenLine);
    old.machines = old.machines.map((m) => (m.id === ID ? lengthModelPendulum() : m));
    const result = importLine(exportLine(old, "old"));
    expect(result.ok, result.errors?.join("; ")).toBe(true);
    expect(overlappingMachine(result.line, ID, byId(result.line, ID))).toBeNull();
  });

  it("reads an old saved length change as the path length and its proportional segments", () => {
    const changes = changesFromLengthModel(goldenLine, [{ machine: ID, field: "length", value: 40 }]);
    const line = applyChanges(goldenLine, changes);
    const m = byId(line, ID);
    expect(m.sim.distanceM).toBeCloseTo(40, 9);
    expect(m.geom.segmentsM.column).toBeCloseTo((40 * 9.157) / 31.087, 9);
  });

  it("never refuses an old saved length too short for the golden runs", () => {
    const changes = changesFromLengthModel(goldenLine, [{ machine: ID, field: "length", value: 15 }]);
    const m = byId(applyChanges(goldenLine, changes), ID);
    expect(m.sim.distanceM).toBeCloseTo(15, 9);
  });

  it("keeps a moved old pendulum's boot where the old drawing had it", () => {
    const position = { x: -3000, y: -3000 };
    const changes = changesFromLengthModel(goldenLine, [{ machine: ID, position }]);
    const m = byId(applyChanges(goldenLine, changes), ID);
    expect(boot(m).x).toBeCloseTo(position.x + 280 + 18, 9);
    expect(boot(m).y).toBeCloseTo(position.y + 780, 9);
  });

  it("loads version 2 saved work through the conversion", () => {
    const storage = new Map();
    const getStorage = () => ({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) });
    storage.set(SAVED_WORK_KEY, JSON.stringify({ version: 2, kind: "changes", changes: [{ machine: ID, field: "length", value: 40 }] }));
    const loaded = loadSavedWork({ line: goldenLine, name: "golden line", fromFile: false }, getStorage);
    expect(byId(loaded.line, ID).sim.distanceM).toBeCloseTo(40, 9);
  });

  it("brings back an added old pendulum, migrated", () => {
    const old = { ...lengthModelPendulum(), id: "pendulum-2", tag: "", x: 0, y: -3000 };
    const line = applyChanges(goldenLine, [{ add: old }]);
    const m = byId(line, "pendulum-2");
    expect(m.geom.segmentsM.floor).toBeCloseTo(7.084, 9);
    expect(validateLine(line).errors).toEqual([]);
  });
});

describe("a new Z-shaped catalogue item", () => {
  it("needs only its JSON: segments and its ports' shares give the shape, handles and labels", () => {
    const item = drawnItem({
      id: "test-z",
      machine: {
        type: "conveyor",
        geom: { duct: 30, segmentsM: { floor: 2, column: 5, head: 3 }, portShares: { in: 1, a: 0.5, b: 1 } },
        ports: { inputs: ["in"], outputs: ["a", "b"] },
        sim: { kind: "routedTransportDelay", speedMPerMin: 10 },
      },
    });
    const m = { ...item.machine, id: "z", name: "Z", x: 0, y: 0 };
    expect(m.sim.distanceM).toBe(10);
    expect(m.h).toBeCloseTo(5 * PX_PER_M, 9);
    expect(m.anchors.a.x).toBeCloseTo(m.geom.colX + 30 + 1.5 * PX_PER_M, 9);
    expect(m.sim.portDistanceM).toEqual({ in: 0, a: 8.5, b: 10 });
    expect(zHandles(m)).toHaveLength(3);
    expect(segmentLabels(m).map((l) => l.text)).toEqual(["2.0 m", "5.0 m", "3.0 m", "10.0 m total"]);
    const line = { zones: [], machines: [m], connections: [], interlocks: [], machineRules: [] };
    expect(validateLine(line).errors).toEqual([]);
  });

  it("is refused by validateLine with a share outside its run", () => {
    const m = structuredClone(byId(goldenLine, ID));
    m.geom.portShares = { ...m.geom.portShares, outBuffer: 1.5 };
    expect(validateLine({ ...alone(), machines: [m] }).errors.join(" ")).toMatch(/share of 1.5 for port "outBuffer"/);
  });
});

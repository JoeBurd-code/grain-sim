// Issue #156: a bucket elevator's adjustable height becomes its path
// length, three segments (floor run, column, head run) that add up to the
// sim's transit distance and draw the machine at the true scale.
import { describe, it, expect } from "vitest";
import { setAdjustableValue, readAdjustableValue, adjustableFields } from "./adjustableFields";
import { PX_PER_M, MIN_TOTAL_M } from "./elevatorPath";
import { flipMachine, overlappingMachine, anchorWorld } from "./layout";
import { exportLine, importLine } from "./lineDocument";
import { validateLine } from "./validateLine";
import { goldenLine } from "./goldenLine";
import { heightModelLine } from "./heightModelFixture";
import { catalogueItem } from "../catalogue/catalogue";

const ID = "treatingElevator";
const byId = (line, id) => line.machines.find((m) => m.id === id);
const sumOf = (s) => s.floor + s.column + s.head;
// The elevator on its own, so no neighbour moves it aside.
const alone = (line = goldenLine) => structuredClone({
  zones: line.zones, machines: [byId(line, ID)], connections: [], interlocks: [], machineRules: [],
});

function set(line, value, id = ID) {
  const result = setAdjustableValue(line, id, "pathLength", value);
  expect(result.ok, result.error).toBe(true);
  return result.line;
}

// The bottom of the column's centre line, in world space.
function boot(m) {
  const centre = m.geom.colX + m.geom.duct / 2;
  return { x: m.x + (m.flipped ? m.w - centre : centre), y: m.y + m.h };
}

describe("the golden line's treating elevator", () => {
  it("keeps 8.731 m, read in the panel as its path length", () => {
    const m = byId(goldenLine, ID);
    const field = adjustableFields(m).find((f) => f.id === "pathLength");
    expect(field).toMatchObject({ label: "path length", unit: "m", min: 5, max: 20 });
    expect(adjustableFields(m).some((f) => f.id === "height")).toBe(false);
    expect(m.sim.distanceM).toBe(8.731);
    expect(readAdjustableValue(goldenLine, ID, "pathLength")).toBeCloseTo(8.731, 9);
    expect(sumOf(m.geom.segmentsM)).toBeCloseTo(8.731, 9);
  });

  it("is drawn from its segments at the true scale", () => {
    const m = byId(goldenLine, ID);
    const { floor, column, head } = m.geom.segmentsM;
    const { colX, duct } = m.geom;
    expect(m.h).toBeCloseTo(column * PX_PER_M, 9);
    expect(colX - m.anchors.in.x).toBeCloseTo(floor * PX_PER_M, 9);
    expect(m.anchors.out.x - (colX + duct)).toBeCloseTo(head * PX_PER_M, 9);
    expect(m.anchors.in.y).toBeCloseTo(m.h - duct, 9);
  });

  it("passes validateLine, and overlaps nothing", () => {
    expect(validateLine(goldenLine).ok).toBe(true);
    expect(overlappingMachine(goldenLine, ID, byId(goldenLine, ID))).toBeNull();
  });
});

describe("typing a new path length", () => {
  it("changes only the column, keeping the runs and the boot", () => {
    const line = alone();
    const before = byId(line, ID);
    const after = byId(set(line, 12), ID);
    expect(after.geom.segmentsM.floor).toBe(before.geom.segmentsM.floor);
    expect(after.geom.segmentsM.head).toBe(before.geom.segmentsM.head);
    expect(sumOf(after.geom.segmentsM)).toBeCloseTo(12, 9);
    expect(after.sim.distanceM).toBeCloseTo(12, 9);
    expect(after.h).toBeCloseTo(after.geom.segmentsM.column * PX_PER_M, 9);
    expect(boot(after).x).toBeCloseTo(boot(before).x, 9);
    expect(boot(after).y).toBeCloseTo(boot(before).y, 9);
  });

  it("keeps the inlet's height and moves the outlet with the column", () => {
    const line = alone();
    const before = byId(line, ID);
    const after = byId(set(line, 12), ID);
    expect(anchorWorld(after, "in").y).toBeCloseTo(anchorWorld(before, "in").y, 9);
    expect(anchorWorld(after, "out").y).toBeCloseTo(anchorWorld(before, "out").y - (12 - 8.731) * PX_PER_M, 9);
  });

  it("keeps a flipped elevator's boot too", () => {
    const flipped = flipMachine(alone(), ID).line;
    const before = byId(flipped, ID);
    const after = byId(set(flipped, 12), ID);
    expect(boot(after).x).toBeCloseTo(boot(before).x, 9);
    expect(boot(after).y).toBeCloseTo(boot(before).y, 9);
  });

  it("refuses a total outside the E200's 5 to 20 m", () => {
    for (const value of [4.9, 20.1]) {
      const result = setAdjustableValue(goldenLine, ID, "pathLength", value);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/between 5 and 20 m/);
    }
  });

  it("refuses a total too short for both runs plus the column's minimum", () => {
    const line = alone();
    const m = byId(line, ID);
    m.geom = { ...m.geom, segmentsM: { floor: 3, column: 4, head: 3 } };
    m.sim = { ...m.sim, distanceM: 10 };
    const result = setAdjustableValue(line, ID, "pathLength", 9);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 10 m/);
  });

  it("moves an elevator whose new shape overlaps a neighbour to the nearest free spot", () => {
    // A block sitting just above the head run: a taller column grows into it.
    const m = byId(goldenLine, ID);
    const block = { id: "block", name: "block", type: "bin", x: m.x, y: m.y - 60, w: m.w, h: 50, ports: { inputs: [], outputs: [] }, anchors: {} };
    const line = { ...alone(), machines: [m, block] };
    expect(overlappingMachine(line, ID, m)).toBeNull();
    const next = set(line, 12);
    const after = byId(next, ID);
    expect(overlappingMachine(next, ID, after)).toBeNull();
    expect(boot(after)).not.toEqual(boot(m));
  });
});

describe("the catalogue's bucket elevators", () => {
  it("limits the E200 to 5 to 20 m and opens the Custom one wide", () => {
    const field = (itemId) => catalogueItem(itemId).machine.adjustable.find((a) => a.id === "pathLength");
    expect(field("bucket-elevator")).toMatchObject({ min: 5, max: 20, default: 8.731 });
    const custom = field("custom-bucket-elevator");
    expect(custom.min).toBe(MIN_TOTAL_M);
    expect(custom.max).toBeGreaterThanOrEqual(50);
  });

  it("each draws from segments that add up to its path length", () => {
    for (const itemId of ["bucket-elevator", "custom-bucket-elevator"]) {
      const m = catalogueItem(itemId).machine;
      expect(sumOf(m.geom.segmentsM)).toBeCloseTo(m.sim.distanceM, 9);
      expect(m.h).toBeCloseTo(m.geom.segmentsM.column * PX_PER_M, 9);
    }
  });
});

describe("validateLine", () => {
  const withSegments = (segmentsM) => ({
    ...goldenLine,
    machines: goldenLine.machines.map((m) => (m.id === ID ? { ...m, geom: { ...m.geom, segmentsM } } : m)),
  });

  it("refuses segments that don't add up to the path length", () => {
    const result = validateLine(withSegments({ floor: 0.5, column: 7, head: 0.5 }));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/adding up to 8 m/);
  });

  it("refuses segments below their minimums", () => {
    expect(validateLine(withSegments({ floor: 0.2, column: 8.031, head: 0.5 })).errors.join("\n")).toMatch(/floor run .* below/);
    expect(validateLine(withSegments({ floor: 2.5, column: 3.731, head: 2.5 })).errors.join("\n")).toMatch(/column .* below/);
  });
});

describe("opening a line saved under the old height model", () => {
  it("makes the old height the total path length, with the runs at their default share", () => {
    const opened = importLine(exportLine(heightModelLine(10), "old"));
    expect(opened.ok, opened.errors?.join("\n")).toBe(true);
    const m = byId(opened.line, ID);
    expect(m.sim.distanceM).toBeCloseTo(10, 9);
    expect(sumOf(m.geom.segmentsM)).toBeCloseTo(10, 9);
    expect(m.geom.segmentsM.floor).toBeCloseTo(m.geom.segmentsM.head, 9);
    expect(m.geom.segmentsM.floor).toBeGreaterThan(0.5);
    expect(adjustableFields(m).find((f) => f.id === "pathLength")).toMatchObject({ label: "path length", min: 5, max: 20 });
    expect(overlappingMachine(opened.line, ID, m)).toBeNull();
  });

  it("keeps the boot exactly where it was when nothing is in the way", () => {
    const old = alone(heightModelLine(10));
    const was = boot(byId(old, ID));
    const opened = importLine(exportLine(old, "old"));
    expect(opened.ok, opened.errors?.join("\n")).toBe(true);
    const m = byId(opened.line, ID);
    expect(boot(m).x).toBeCloseTo(was.x, 9);
    expect(boot(m).y).toBeCloseTo(was.y, 9);
  });

  it("raises a height below the new minimum to it rather than refusing the line", () => {
    const opened = importLine(exportLine(alone(heightModelLine(4.2)), "old"));
    expect(opened.ok, opened.errors?.join("\n")).toBe(true);
    expect(byId(opened.line, ID).sim.distanceM).toBeCloseTo(MIN_TOTAL_M, 9);
  });
});

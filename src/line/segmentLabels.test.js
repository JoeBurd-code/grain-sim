// Issue #159: a selected bucket elevator's segment lengths, shown on the
// canvas in Build mode.
import { describe, it, expect } from "vitest";
import { segmentLabels, metresLabel, reshapeElevator, previewReshape, segmentsAfterDrag } from "./elevatorPath";
import { setAdjustableValue } from "./adjustableFields";
import { flipMachine } from "./layout";
import { goldenLine } from "./goldenLine";

const ID = "treatingElevator";
const byId = (line, id) => line.machines.find((m) => m.id === id);
const alone = () => structuredClone({
  zones: goldenLine.zones, machines: [byId(goldenLine, ID)], connections: [], interlocks: [], machineRules: [],
});
function roomy() {
  const result = reshapeElevator(alone(), ID, { floor: 2, column: 5.731, head: 1 });
  expect(result.ok, result.error).toBe(true);
  return result.line;
}
const label = (labels, id) => labels.find((l) => l.id === id);

describe("metresLabel", () => {
  it("shows a whole or tenth-step length to one decimal", () => {
    expect(metresLabel(2)).toBe("2.0 m");
    expect(metresLabel(2.3)).toBe("2.3 m");
  });

  it("shows a finer length to as many decimals as it has, free of float noise", () => {
    expect(metresLabel(2.35)).toBe("2.35 m");
    expect(metresLabel(5.731)).toBe("5.731 m");
    expect(metresLabel(0.1 + 0.2)).toBe("0.3 m");
    expect(metresLabel(5.731 + 0.1)).toBe("5.831 m");
  });
});

describe("segmentLabels", () => {
  it("labels the floor run, column, head run and total of a bucket elevator", () => {
    const m = byId(roomy(), ID);
    const labels = segmentLabels(m);
    expect(labels.map((l) => [l.id, l.text])).toEqual([
      ["floor", "2.0 m"], ["column", "5.731 m"], ["head", "1.0 m"], ["total", "8.731 m total"],
    ]);
  });

  it("matches the saved segments and path length exactly", () => {
    const m = byId(roomy(), ID);
    const labels = segmentLabels(m);
    expect(label(labels, "column").text).toBe(`${m.geom.segmentsM.column} m`);
    expect(label(labels, "total").text).toBe(`${m.sim.distanceM} m total`);
  });

  it("shows a path length typed in the panel, and the column it gives", () => {
    // A path length typed in the panel changes the column alone.
    const shaped = reshapeElevator(alone(), ID, { floor: 0.5, column: 7.731, head: 0.5 }).line;
    const result = setAdjustableValue(shaped, ID, "pathLength", 8.73);
    expect(result.ok, result.error).toBe(true);
    const labels = segmentLabels(byId(result.line, ID));
    expect(label(labels, "column").text).toBe("7.73 m");
    expect(label(labels, "total").text).toBe("8.73 m total");
  });

  it("places each beside its own run", () => {
    const m = byId(roomy(), ID);
    const { colX, duct } = m.geom;
    const labels = segmentLabels(m);
    const floor = label(labels, "floor");
    // Under the floor duct, between the inlet end and the column.
    expect(floor.x).toBeGreaterThan(0);
    expect(floor.x).toBeLessThan(colX);
    expect(floor.y).toBeGreaterThan(m.h);
    // Beside the column, halfway up.
    const column = label(labels, "column");
    expect(column.x).toBeGreaterThan(colX + duct);
    expect(column.y).toBeGreaterThan(duct);
    expect(column.y).toBeLessThan(m.h - duct);
    // Above the head duct, over the head run.
    const head = label(labels, "head");
    expect(head.x).toBeGreaterThan(colX + duct);
    expect(head.x).toBeLessThan(m.w);
    expect(head.y).toBeLessThan(0);
    // Near the column's top, on the side away from the head run.
    const total = label(labels, "total");
    expect(total.x).toBeLessThan(colX);
    expect(total.anchor).toBe("end");
    expect(total.y).toBeLessThan(duct);
  });

  it("sits on the mirrored sides of a flipped elevator, anchored to read normally", () => {
    const plain = segmentLabels(byId(roomy(), ID));
    const m = byId(flipMachine(roomy(), ID).line, ID);
    const flipped = segmentLabels(m);
    const mirror = { start: "end", end: "start", middle: "middle" };
    for (const p of plain) {
      const f = label(flipped, p.id);
      expect(f.text).toBe(p.text);
      expect(f.x).toBeCloseTo(m.w - p.x, 9);
      expect(f.y).toBeCloseTo(p.y, 9);
      expect(f.anchor).toBe(mirror[p.anchor]);
    }
  });

  it("highlights the two segments the dragged handle trades between", () => {
    const m = byId(roomy(), ID);
    const lit = (handleId) => segmentLabels(m, { handleId }).filter((l) => l.highlighted).map((l) => l.id).sort();
    expect(lit("floor")).toEqual(["column", "floor"]);
    expect(lit("head")).toEqual(["column", "head"]);
    expect(lit("column")).toEqual(["column", "head"]);
    expect(segmentLabels(m).some((l) => l.highlighted)).toBe(false);
  });

  it("follows a handle's preview, keeping the total", () => {
    const line = roomy();
    const m = byId(line, ID);
    const segments = segmentsAfterDrag(m, "floor", { x: -15, y: 0 }, { fine: true });
    const shown = byId(previewReshape(line, ID, segments), ID);
    const labels = segmentLabels(shown, { handleId: "floor" });
    expect(label(labels, "floor").text).toBe("2.5 m");
    expect(label(labels, "column").text).toBe("5.231 m");
    expect(label(labels, "total").text).toBe("8.731 m total");
  });

  it("is none on a machine that is not a bucket elevator with a path", () => {
    const bin = goldenLine.machines.find((m) => m.type === "bin");
    expect(segmentLabels(bin)).toEqual([]);
    const unshaped = structuredClone(byId(goldenLine, ID));
    delete unshaped.geom.segmentsM;
    expect(segmentLabels(unshaped)).toEqual([]);
  });
});

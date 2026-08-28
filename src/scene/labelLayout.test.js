import { describe, it, expect } from "vitest";
import { line } from "../line/lineData";
import {
  wrapLabel, labelPlacement, LABEL_GAP, INSTRUMENT_GUTTER, CAP_HEIGHT, LINE_HEIGHT, WRAP_BUDGET,
} from "./labelLayout";

// A machine's own footprint, with everything placement reads off it.
const machine = (over = {}) => ({ id: "m", name: "PUMP", w: 100, h: 60, ...over });

// The label's ink box in the machine's local coordinates, given how the
// renderer anchors it (symbols.jsx MachineLabel). `width` stands in for the
// rendered text width, which placement is deliberately independent of.
function inkBox(m, width) {
  const { x, y, anchor, lines, lineHeight, size } = labelPlacement(m);
  const left = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
  return {
    x0: left,
    x1: left + width,
    y0: y - CAP_HEIGHT[size],
    y1: y + (lines.length - 1) * lineHeight,
  };
}

describe("wrapLabel", () => {
  it("leaves a name inside the budget on one line", () => {
    expect(wrapLabel("TREATER BUFFER BIN")).toEqual(["TREATER BUFFER BIN"]);
  });

  it("breaks a long name so neither line dominates", () => {
    // The greedy split would be "NIKLAS WNS/200 BATCH" + "TREATER" (20 vs 7).
    expect(wrapLabel("NIKLAS WNS/200 BATCH TREATER")).toEqual(["NIKLAS WNS/200", "BATCH TREATER"]);
    expect(wrapLabel("ROLLER CONVEYORS 1-4 + BELT SCALE")).toEqual(["ROLLER CONVEYORS", "1-4 + BELT SCALE"]);
  });

  it("prefers the author's own middot separator and drops it", () => {
    expect(wrapLabel("BUCKET ELEVATOR · TREATING")).toEqual(["BUCKET ELEVATOR", "TREATING"]);
  });

  it("leaves an unbreakable name alone rather than cutting a word", () => {
    const long = "SUPERCALIFRAGILISTICEXPIALIDOCIOUS";
    expect(wrapLabel(long)).toEqual([long]);
  });
});

describe("labelPlacement", () => {
  it("holds the gap on the left edge whatever the name's width", () => {
    const short = inkBox(machine({ name: "BIN", label: { side: "left" } }), 20);
    const long = inkBox(machine({ name: "BIN", label: { side: "left" } }), 200);
    // The gap is what stays fixed — that is the whole point of anchoring `end`.
    expect(short.x1).toBe(-LABEL_GAP);
    expect(long.x1).toBe(-LABEL_GAP);
  });

  it("centres a label on the edge it hangs off", () => {
    const box = inkBox(machine({ label: { side: "left" } }), 80);
    expect((box.y0 + box.y1) / 2).toBeCloseTo(60 / 2, 6);
    const above = inkBox(machine({ label: { side: "above" } }), 80);
    expect((above.x0 + above.x1) / 2).toBeCloseTo(100 / 2, 6);
    expect(above.y1).toBe(-LABEL_GAP);
    const below = inkBox(machine({ label: { side: "below" } }), 80);
    expect(below.y0).toBe(60 + LABEL_GAP);
  });

  it("clears the instrument stack on the right, and only there", () => {
    const bare = labelPlacement(machine({ label: { side: "right" } }));
    const dotted = labelPlacement(machine({ label: { side: "right" }, instruments: ["LT", "LSH"] }));
    expect(bare.x).toBe(100 + LABEL_GAP);
    expect(dotted.x).toBe(100 + INSTRUMENT_GUTTER);
    // the same machine's left-hand gap is untouched by its instruments
    expect(labelPlacement(machine({ label: { side: "left" }, instruments: ["LT"] })).x).toBe(-LABEL_GAP);
  });

  it("keeps a wrapped block flush with the edge it is aligned to", () => {
    const m = machine({ name: "NIKLAS WNS/200 BATCH TREATER", label: { side: "left", align: "bottom" } });
    const box = inkBox(m, 90);
    expect(box.y1).toBe(60);
    expect(box.y1 - box.y0).toBeCloseTo(LINE_HEIGHT.display + CAP_HEIGHT.display, 6);
    expect(inkBox(machine({ ...m, label: { side: "left", align: "top" } }), 90).y0).toBe(0);
  });

  it("applies a nudge on top of a real placement, not instead of one", () => {
    const plain = labelPlacement(machine({ label: { side: "below" } }));
    const nudged = labelPlacement(machine({ label: { side: "below", nudge: { x: 5, y: 30 } } }));
    expect(nudged.x - plain.x).toBe(5);
    expect(nudged.y - plain.y).toBe(30);
  });
});

describe("the real line's labels", () => {
  const labelled = line.machines.filter((m) => m.type !== "stub");

  it("declares a placement for every machine that renders a name", () => {
    const missing = labelled.filter((m) => !m.label?.side);
    expect(missing.map((m) => m.id)).toEqual([]);
  });

  it("uses only sides and alignments placement understands", () => {
    const sides = new Set(["left", "right", "above", "below"]);
    const aligns = new Set(["top", "center", "bottom", "start", "end"]);
    const bad = labelled.filter((m) => !sides.has(m.label.side) || !aligns.has(m.label.align));
    expect(bad.map((m) => m.id)).toEqual([]);
  });

  it("never wraps a line wider than the budget when a break exists", () => {
    const over = labelled
      .map((m) => ({ id: m.id, lines: labelPlacement(m).lines }))
      .filter(({ lines }) => lines.length > 1 && lines.some((l) => l.length > WRAP_BUDGET));
    expect(over).toEqual([]);
  });

  it("keeps nudges rare and small — they are an escape hatch, not the norm", () => {
    const nudged = labelled.filter((m) => m.label.nudge);
    expect(nudged.length).toBeLessThanOrEqual(3);
    for (const m of nudged) {
      expect(Math.abs(m.label.nudge.x ?? 0)).toBeLessThanOrEqual(60);
      expect(Math.abs(m.label.nudge.y ?? 0)).toBeLessThanOrEqual(60);
    }
  });
});

// Issue #158: a machine's name label dragged anywhere in Build mode. A drag
// sets the label's nudge; its side and alignment stay as declared.
import { describe, it, expect } from "vitest";
import { moveLabel, resetLabel, defaultLabel, isDefaultLabel } from "./labels";
import { flipMachine } from "./layout";
import { reshapeElevator } from "./elevatorPath";
import { addMachine, diffFromBase, applyChanges, exportLine, importLine } from "./lineDocument";
import { goldenLine } from "./goldenLine";
import { catalogueItem } from "../catalogue/catalogue";
import { labelPlacement } from "../scene/labelLayout";

const byId = (line, id) => line.machines.find((m) => m.id === id);

// The scene's label position for `id`, in world units.
function labelAt(line, id) {
  const m = byId(line, id);
  const p = labelPlacement(m);
  return { x: m.x + p.x, y: m.y + p.y };
}

describe("moveLabel", () => {
  it("moves the label by the drag and stores it as the nudge, side and align unchanged", () => {
    const before = byId(goldenLine, "metalBin1");
    const result = moveLabel(goldenLine, "metalBin1", { x: 40, y: -25 });
    expect(result.ok).toBe(true);
    const after = byId(result.line, "metalBin1");
    expect(after.label).toEqual({ ...before.label, nudge: { x: 40, y: -25 } });
    expect(labelAt(result.line, "metalBin1")).toEqual({
      x: labelAt(goldenLine, "metalBin1").x + 40,
      y: labelAt(goldenLine, "metalBin1").y - 25,
    });
  });

  it("moves only the label: the machine, its connections and every other machine stay put", () => {
    const { line } = moveLabel(goldenLine, "metalBin1", { x: 40, y: -25 });
    const m = byId(line, "metalBin1");
    expect([m.x, m.y]).toEqual([byId(goldenLine, "metalBin1").x, byId(goldenLine, "metalBin1").y]);
    expect(line.connections).toBe(goldenLine.connections);
    for (const other of line.machines.filter((x) => x.id !== "metalBin1")) {
      expect(other).toBe(byId(goldenLine, other.id));
    }
  });

  it("adds to a nudge the label already has", () => {
    const { line } = moveLabel(goldenLine, "inletDrumFeeder1", { x: 10, y: 5 });
    expect(byId(line, "inletDrumFeeder1").label.nudge).toEqual({ x: 10, y: 35 });
  });

  it("drops onto anything: no overlap check runs", () => {
    // Straight onto the middle of a neighbouring machine.
    const target = byId(goldenLine, "metalBin2");
    const from = labelAt(goldenLine, "metalBin1");
    const delta = { x: Math.round(target.x + target.w / 2 - from.x), y: Math.round(target.y + target.h / 2 - from.y) };
    const result = moveLabel(goldenLine, "metalBin1", delta);
    expect(result.ok).toBe(true);
    expect(labelAt(result.line, "metalBin1")).toEqual({ x: from.x + delta.x, y: from.y + delta.y });
  });

  it("rounds to whole units and drops a nudge that comes back to nothing", () => {
    const { line } = moveLabel(goldenLine, "metalBin1", { x: 3.4, y: -1.6 });
    expect(byId(line, "metalBin1").label.nudge).toEqual({ x: 3, y: -2 });
    const back = moveLabel(line, "metalBin1", { x: -3, y: 2 }).line;
    expect(byId(back, "metalBin1").label).toEqual(byId(goldenLine, "metalBin1").label);
  });

  it("gives a machine with no declared label a nudge off the default side", () => {
    const line = { ...goldenLine, machines: goldenLine.machines.map((m) => (m.id === "metalBin1" ? { ...m, label: undefined } : m)) };
    const { line: moved } = moveLabel(line, "metalBin1", { x: 5, y: 6 });
    expect(byId(moved, "metalBin1").label).toEqual({ nudge: { x: 5, y: 6 } });
  });

  it("refuses a machine the line does not have", () => {
    expect(moveLabel(goldenLine, "nope", { x: 1, y: 1 }).ok).toBe(false);
  });
});

describe("a dragged label keeps its offset from its declared side", () => {
  it("when the machine is resized", () => {
    const { line } = moveLabel(goldenLine, "metalBin1", { x: 40, y: -25 });
    const m = byId(line, "metalBin1");
    const bigger = { ...m, w: m.w + 60, h: m.h + 30 };
    const plain = { ...bigger, label: { ...bigger.label, nudge: undefined } };
    const offset = { x: labelPlacement(bigger).x - labelPlacement(plain).x, y: labelPlacement(bigger).y - labelPlacement(plain).y };
    expect(offset).toEqual({ x: 40, y: -25 });
  });

  it("when a bucket elevator is reshaped", () => {
    const { line } = moveLabel(goldenLine, "treatingElevator", { x: -20, y: 15 });
    const reshaped = reshapeElevator(line, "treatingElevator", { floor: 2, column: 5.731, head: 1 });
    expect(reshaped.ok).toBe(true);
    const m = byId(reshaped.line, "treatingElevator");
    expect(m.w).not.toBe(byId(line, "treatingElevator").w);
    expect(m.label.nudge).toEqual({ x: -20, y: 15 });
    const plain = { ...m, label: { ...m.label, nudge: undefined } };
    expect(labelPlacement(m).x - labelPlacement(plain).x).toBe(-20);
    expect(labelPlacement(m).y - labelPlacement(plain).y).toBe(15);
  });

  it("when the machine is flipped", () => {
    const { line } = moveLabel(goldenLine, "metalBin1", { x: 40, y: -25 });
    const flipped = flipMachine(line, "metalBin1");
    expect(flipped.ok).toBe(true);
    const m = byId(flipped.line, "metalBin1");
    expect(m.label.nudge).toEqual({ x: 40, y: -25 });
    const plain = { ...m, label: { ...m.label, nudge: undefined } };
    expect(labelPlacement(m).x - labelPlacement(plain).x).toBe(40);
    expect(labelPlacement(m).y - labelPlacement(plain).y).toBe(-25);
  });
});

describe("resetLabel", () => {
  it("puts a golden line machine's label back to the line's authored placement, nudge and all", () => {
    const { line } = moveLabel(goldenLine, "inletDrumFeeder1", { x: 80, y: -12 });
    const reset = resetLabel(line, "inletDrumFeeder1", goldenLine);
    expect(reset.ok).toBe(true);
    expect(byId(reset.line, "inletDrumFeeder1").label).toEqual({ side: "below", align: "center", nudge: { y: 30 } });
  });

  it("puts a catalogue machine's label back to the catalogue item's placement", () => {
    const added = addMachine(goldenLine, "metal-bin", { x: 4000, y: 4000 });
    const { line } = moveLabel(added.line, added.id, { x: 15, y: 15 });
    const reset = resetLabel(line, added.id, goldenLine);
    expect(byId(reset.line, added.id).label).toEqual(catalogueItem("metal-bin").machine.label);
  });

  it("treats a pasted copy of a golden machine as a catalogue machine", () => {
    const copy = { ...byId(goldenLine, "inletDrumFeeder1"), id: "drum-feeder-1", x: 4000, y: 4000 };
    expect(defaultLabel(copy, goldenLine)).toEqual(catalogueItem("drum-feeder").machine.label);
  });

  it("says whether a label is at its default", () => {
    expect(isDefaultLabel(byId(goldenLine, "inletDrumFeeder1"), goldenLine)).toBe(true);
    const { line } = moveLabel(goldenLine, "inletDrumFeeder1", { x: 1, y: 0 });
    expect(isDefaultLabel(byId(line, "inletDrumFeeder1"), goldenLine)).toBe(false);
  });
});

describe("a dragged label is saved", () => {
  it("round-trips through SAVE/OPEN", () => {
    const { line } = moveLabel(goldenLine, "metalBin1", { x: 40, y: -25 });
    const opened = importLine(exportLine(line, "mine"));
    expect(opened.ok).toBe(true);
    expect(byId(opened.line, "metalBin1").label).toEqual(byId(line, "metalBin1").label);
  });

  it("round-trips through browser autosave as one change, and a reset leaves none", () => {
    const { line } = moveLabel(goldenLine, "metalBin1", { x: 40, y: -25 });
    const changes = diffFromBase(goldenLine, line);
    expect(changes).toEqual([{ machine: "metalBin1", label: byId(line, "metalBin1").label }]);
    expect(byId(applyChanges(goldenLine, changes), "metalBin1").label).toEqual(byId(line, "metalBin1").label);
    expect(diffFromBase(goldenLine, resetLabel(line, "metalBin1", goldenLine).line)).toEqual([]);
  });

  it("autosaves a golden label moved back off its authored nudge", () => {
    const { line } = moveLabel(goldenLine, "inletDrumFeeder1", { x: 0, y: -30 });
    expect(byId(line, "inletDrumFeeder1").label.nudge).toBeUndefined();
    const restored = applyChanges(goldenLine, diffFromBase(goldenLine, line));
    expect(byId(restored, "inletDrumFeeder1").label).toEqual(byId(line, "inletDrumFeeder1").label);
  });
});

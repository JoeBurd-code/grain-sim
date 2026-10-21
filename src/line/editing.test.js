// Issue #87: adding and deleting machines, and a new empty line, are pure
// line document functions.
import { describe, it, expect } from "vitest";
import { addMachine, deleteMachine, emptyLine, exportLine, importLine, setAdjustableValue } from "./lineDocument";
import { readAdjustableValue } from "./adjustableFields";
import { overlappingMachine } from "./layout";
import { validateLine } from "./validateLine";
import { isRuleOff } from "./interlocks";
import { lineBounds } from "./bounds";
import { goldenLine } from "./goldenLine";
import { CATALOGUE, catalogueItem } from "../catalogue/catalogue";
import { createSim, stepSim, DT } from "../sim/engine";

const byId = (line, id) => line.machines.find((m) => m.id === id);

function add(line, itemId, pos) {
  const result = addMachine(line, itemId, pos);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function remove(line, id) {
  const result = deleteMachine(line, id);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}

describe("emptyLine", () => {
  it("is a line with nothing on it that loads and has a view to fit", () => {
    const line = emptyLine();
    expect(line.machines).toEqual([]);
    expect(line.connections).toEqual([]);
    expect(validateLine(line).errors).toEqual([]);
    expect(importLine(exportLine(line, "new line")).ok).toBe(true);
    expect(Object.values(lineBounds(line)).every(Number.isFinite)).toBe(true);
  });
});

describe("addMachine", () => {
  it("places the catalogue item with its defaults, an automatic name, an empty tag and its item id", () => {
    const { line, id } = add(emptyLine(), "treater-buffer-bin", { x: 103, y: 208 });
    const m = byId(line, id);
    const item = catalogueItem("treater-buffer-bin");
    expect(m).toMatchObject({ ...item.machine, item: "treater-buffer-bin", name: "TREATER BUFFER BIN 1", tag: "", x: 100, y: 210 });
    expect(m.zone).toBeUndefined();
  });

  it("places off the grid when snapping is off", () => {
    const { line, id } = add(emptyLine(), "grain-in", { x: 103.4, y: 208, snap: false });
    expect(byId(line, id)).toMatchObject({ x: 103, y: 208 });
  });

  it("never changes the line it is given, or the catalogue", () => {
    const before = structuredClone(goldenLine);
    const itemBefore = structuredClone(catalogueItem("metal-bin"));
    const { line, id } = add(goldenLine, "metal-bin", { x: 0, y: -1000 });
    expect(goldenLine).toEqual(before);
    byId(line, id).sim.capacityM3 = 99;
    expect(catalogueItem("metal-bin")).toEqual(itemBefore);
  });

  it("never hands a deleted machine's id to a new machine a rule still names (#147)", () => {
    // C5's shape: a bin carries an interlock, the bin is deleted, and the
    // orphaned rule keeps naming it. The freed id must not be handed to the
    // next bin of the same kind, or the orphan silently attaches to it and a
    // rule meant for the deleted machine runs against the new one.
    let line = emptyLine();
    const first = add(line, "custom-bin", { x: 100, y: 200 });
    line = first.line;
    const rule = { id: "interlock-1", kind: "sentence",
      when: { machine: first.id, condition: "above", percent: 85, seconds: 5 },
      then: [] };
    line = { ...line, interlocks: [...line.interlocks, rule] };
    line = remove(line, first.id);
    expect(isRuleOff(line, rule)).toBe(true); // the interlock lost its machine
    const second = add(line, "custom-bin", { x: 100, y: 260 });
    expect(second.id).not.toBe(first.id); // the freed id is not handed back
    expect(second.id).toBe("custom-bin-2");
    expect(isRuleOff(second.line, rule)).toBe(true); // it did not silently re-attach
  });

  it("gives each new machine a name and id no other machine has", () => {
    let line = emptyLine();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const result = add(line, "metal-bin", { x: i * 300, y: 0 });
      line = result.line;
      ids.push(result.id);
    }
    expect(new Set(ids).size).toBe(3);
    expect(line.machines.map((m) => m.name)).toEqual(["METAL BIN 1", "METAL BIN 2", "METAL BIN 3"]);

    // A deleted number is used again; a name the user already has is skipped.
    line = remove(line, ids[1]);
    const again = add(line, "metal-bin", { x: 0, y: 400 });
    expect(byId(again.line, again.id).name).toBe("METAL BIN 2");
    line = again.line;
    line.machines[0].name = "METAL BIN 4";
    const refilled = add(line, "metal-bin", { x: 0, y: 800 });
    expect(byId(refilled.line, refilled.id).name).toBe("METAL BIN 1");
    const fifth = add(refilled.line, "metal-bin", { x: 0, y: 1200 });
    expect(byId(fifth.line, fifth.id).name).toBe("METAL BIN 5");
  });

  it("names a machine on the golden line apart from the golden line's own names", () => {
    const { line, id } = add(goldenLine, "diverter", { x: 0, y: -500 });
    expect(byId(line, id).name).toBe("DIVERTER 1");
    expect(goldenLine.machines.some((m) => m.id === id)).toBe(false);
  });

  it("moves a drop on top of another machine to the nearest free place", () => {
    const first = add(emptyLine(), "metal-bin", { x: 0, y: 0 });
    const second = add(first.line, "metal-bin", { x: 20, y: 20 });
    const m = byId(second.line, second.id);
    expect(overlappingMachine(second.line, m.id, m)).toBeNull();
    expect(m.x % 10).toBe(0);
    expect(m.y % 10).toBe(0);
    expect(Math.hypot(m.x - 20, m.y - 20)).toBeLessThan(200);
  });

  it("refuses an item the catalogue does not have", () => {
    const result = addMachine(emptyLine(), "flux-capacitor", { x: 0, y: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/flux-capacitor/);
  });

  it("gives a machine whose values can be edited", () => {
    const { line, id } = add(emptyLine(), "treater-buffer-bin", { x: 0, y: 0 });
    expect(readAdjustableValue(line, id, "capacity")).toBe(7.7);
    const edited = setAdjustableValue(line, id, "capacity", 10);
    expect(edited.ok).toBe(true);
    expect(readAdjustableValue(edited.line, id, "capacity")).toBe(10);
  });

  // Every item, unconnected, on a line of its own: the line loads, survives
  // SAVE and OPEN, and runs.
  it.each(CATALOGUE.map((item) => [item.id]))("adds %s to a line that loads and runs", (itemId) => {
    const { line } = add(emptyLine(), itemId, { x: 0, y: 0 });
    expect(validateLine(line).errors).toEqual([]);
    const reopened = importLine(exportLine(line, "new line"));
    expect(reopened.errors).toBeUndefined();
    expect(reopened.line).toEqual(line);
    const sim = createSim(line);
    for (let i = 0; i < 200; i++) stepSim(sim, DT);
  });
});

describe("deleteMachine", () => {
  it("removes the machine and every connection to it, and nothing else", () => {
    const line = remove(goldenLine, "treaterPreBin");
    expect(byId(line, "treaterPreBin")).toBeUndefined();
    expect(line.machines).toHaveLength(goldenLine.machines.length - 1);
    expect(line.connections.some((c) => c.from.machine === "treaterPreBin" || c.to.machine === "treaterPreBin")).toBe(false);
    expect(line.connections).toHaveLength(goldenLine.connections.filter(
      (c) => c.from.machine !== "treaterPreBin" && c.to.machine !== "treaterPreBin").length);
    expect(byId(goldenLine, "treaterPreBin")).toBeDefined();
  });

  it("keeps an interlock that named the machine, and turns it off", () => {
    const named = goldenLine.interlocks.filter((r) => JSON.stringify(r).includes('"treaterBufferBin"'));
    expect(named.length).toBeGreaterThan(0);
    const line = remove(goldenLine, "treaterBufferBin");
    for (const rule of named) {
      const kept = line.interlocks.find((r) => r.id === rule.id);
      expect(kept).toEqual(rule);
      expect(isRuleOff(line, kept)).toBe(true);
    }
    expect(goldenLine.interlocks.every((r) => !isRuleOff(goldenLine, r))).toBe(true);
  });

  it("drops a plant control's commands on the machine", () => {
    const line = remove(goldenLine, "outloadDiverter");
    const destination = line.plantControls.selectors.find((s) => s.id === "destination");
    expect(JSON.stringify(destination)).not.toContain('"outloadDiverter"');
    expect(destination.options.map((o) => o.id)).toEqual(["concetti", "flexicon", "metalBin1", "metalBin2"]);

    const noFeeders = remove(remove(goldenLine, "inletDrumFeeder1"), "inletDrumFeeder2");
    expect(noFeeders.plantControls.selectors.map((s) => s.id)).toEqual(["destination"]);
  });

  it("refuses a machine the line does not have", () => {
    const result = deleteMachine(goldenLine, "ghost");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ghost/);
  });

  // Whatever the user deletes from the golden line, the line still loads,
  // survives SAVE and OPEN, and runs. Grain that reaches an output the
  // delete left unconnected is not yet held there: that is issue #88.
  it.each(goldenLine.machines.map((m) => [m.id]))("leaves a golden line without %s that loads and runs", (id) => {
    const line = remove(goldenLine, id);
    expect(validateLine(line).errors).toEqual([]);
    expect(importLine(exportLine(line, "golden line")).ok).toBe(true);
    const sim = createSim(line);
    for (let i = 0; i < Math.round(120 / DT); i++) stepSim(sim, DT);
  });
});

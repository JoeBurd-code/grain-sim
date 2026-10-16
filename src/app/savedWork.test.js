// Issue #79: browser autosave. Edits to the golden line are stored as
// changes; an opened file is stored whole, with its name; an untouched
// golden line stores nothing. Storage that throws means "no saved work".
import { describe, it, expect } from "vitest";
import { loadSavedWork, storeWork, clearSavedWork, hasUnsavedWork, SAVED_WORK_KEY } from "./savedWork";
import { goldenLine, GOLDEN_LINE_NAME } from "../line/goldenLine";
import { setAdjustableValue, readAdjustableValue } from "../line/adjustableFields";
import {
  exportLine, moveMachine, addMachine, deleteMachine, emptyLine, copyMachines, pasteMachines,
} from "../line/lineDocument";
import { ruleMachines } from "../line/interlocks";

const GOLDEN = { line: goldenLine, name: GOLDEN_LINE_NAME, fromFile: false };

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => { items.set(k, String(v)); },
    removeItem: (k) => { items.delete(k); },
  };
}

function blocked() {
  throw new Error("SecurityError: storage is blocked");
}
const throwingStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };

function edit(line, machine, field, value) {
  const result = setAdjustableValue(line, machine, field, value);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}

describe("storeWork", () => {
  it("stores nothing for the untouched golden line, and removes earlier work", () => {
    const storage = memoryStorage();
    storage.setItem(SAVED_WORK_KEY, "old work");
    storeWork(GOLDEN, GOLDEN, () => storage);
    expect(storage.items.size).toBe(0);
  });

  it("stores only the changes for an edited golden line", () => {
    const storage = memoryStorage();
    const line = edit(goldenLine, "treaterBufferBin", "capacity", 10);
    storeWork(GOLDEN, { ...GOLDEN, line }, () => storage);
    const stored = JSON.parse(storage.getItem(SAVED_WORK_KEY));
    expect(stored.changes).toEqual([{ machine: "treaterBufferBin", field: "capacity", value: 10 }]);
    expect(stored.line).toBeUndefined();
  });
});

describe("a write that fails", () => {
  it("removes older work, so a reload never brings back something older than what was on screen", () => {
    const storage = memoryStorage();
    storeWork(GOLDEN, { ...GOLDEN, line: edit(goldenLine, "metalBin1", "capacity", 9) }, () => storage);
    expect(storage.items.size).toBe(1);
    const full = { ...storage, setItem: () => { throw new Error("QuotaExceededError"); } };
    storeWork(GOLDEN, { line: goldenLine, name: "big file", fromFile: true }, () => full);
    expect(storage.items.size).toBe(0);
  });
});

describe("clearSavedWork (START OVER)", () => {
  it("removes stored work, and does not throw when storage is blocked", () => {
    const storage = memoryStorage();
    storeWork(GOLDEN, { ...GOLDEN, line: edit(goldenLine, "metalBin1", "capacity", 9) }, () => storage);
    clearSavedWork(() => storage);
    expect(loadSavedWork(GOLDEN, () => storage)).toBeNull();
    expect(() => clearSavedWork(() => throwingStorage)).not.toThrow();
  });
});

describe("loadSavedWork", () => {
  it("finds no saved work in empty storage", () => {
    expect(loadSavedWork(GOLDEN, () => memoryStorage())).toBeNull();
  });

  it("brings back edits to the golden line after a reload", () => {
    const storage = memoryStorage();
    const line = edit(goldenLine, "treaterBufferBin", "capacity", 10);
    storeWork(GOLDEN, { ...GOLDEN, line }, () => storage);
    const loaded = loadSavedWork(GOLDEN, () => storage);
    expect(loaded).toEqual({ line, name: GOLDEN_LINE_NAME, fromFile: false });
  });

  it("brings back moved golden line machines after a reload", () => {
    const storage = memoryStorage();
    const moved = moveMachine(goldenLine, "discardBin", { x: 300, y: 900 });
    expect(moved.ok).toBe(true);
    storeWork(GOLDEN, { ...GOLDEN, line: moved.line }, () => storage);
    expect(loadSavedWork(GOLDEN, () => storage)).toEqual({ ...GOLDEN, line: moved.line });
  });

  it("applies the stored changes to the golden line as it is now", () => {
    const storage = memoryStorage();
    storeWork(GOLDEN, { ...GOLDEN, line: edit(goldenLine, "treaterBufferBin", "capacity", 10) }, () => storage);
    const updated = { ...GOLDEN, line: edit(goldenLine, "metalBin1", "capacity", 12) };
    const loaded = loadSavedWork(updated, () => storage);
    expect(readAdjustableValue(loaded.line, "metalBin1", "capacity")).toBe(12);
    expect(readAdjustableValue(loaded.line, "treaterBufferBin", "capacity")).toBe(10);
  });

  it("brings back an opened file and its name after a reload", () => {
    const storage = memoryStorage();
    const line = edit(goldenLine, "metalBin2", "capacity", 9);
    storeWork(GOLDEN, { line, name: "client trial", fromFile: true }, () => storage);
    const loaded = loadSavedWork(GOLDEN, () => storage);
    expect(loaded.name).toBe("client trial");
    expect(loaded.fromFile).toBe(true);
    expect(loaded.line).toEqual(JSON.parse(exportLine(line, "client trial")).line);
  });

  // Issue #87.
  it("brings back a new line of unconnected machines after a reload", () => {
    const storage = memoryStorage();
    let line = emptyLine();
    for (const [item, x] of [["grain-in", 0], ["metal-bin", 200], ["grain-out", 500]]) line = addMachine(line, item, { x, y: 0 }).line;
    storeWork(GOLDEN, { line, name: "new line", fromFile: true }, () => storage);
    const loaded = loadSavedWork(GOLDEN, () => storage);
    expect(loaded).toMatchObject({ name: "new line", fromFile: true });
    expect(loaded.line).toEqual(line);
  });

  it("brings back added and deleted golden line machines after a reload", () => {
    const storage = memoryStorage();
    const added = addMachine(deleteMachine(goldenLine, "grainBreak").line, "metal-bin", { x: 0, y: -600 });
    storeWork(GOLDEN, { ...GOLDEN, line: added.line }, () => storage);
    const loaded = loadSavedWork(GOLDEN, () => storage);
    expect(loaded.fromFile).toBe(false);
    expect(loaded.line).toEqual(added.line);
  });

  // Issue #95: a pasted group brings its interlocks, and on the golden line
  // they come back after a reload with the machines and connections.
  it("brings back a pasted golden line group with its interlocks after a reload", () => {
    const rule = goldenLine.interlocks.find((r) => {
      const named = ruleMachines(r);
      return named.length > 1 && named.every((id) => goldenLine.machines.some((m) => m.id === id));
    });
    const pasted = pasteMachines(goldenLine, copyMachines(goldenLine, ruleMachines(rule)), { x: 0, y: -3000 });
    expect(pasted.ok).toBe(true);
    expect(pasted.line.interlocks.length).toBeGreaterThan(goldenLine.interlocks.length);
    const storage = memoryStorage();
    storeWork(GOLDEN, { ...GOLDEN, line: pasted.line }, () => storage);
    expect(loadSavedWork(GOLDEN, () => storage).line).toEqual(pasted.line);
  });

  it("brings back a pasted golden lane's feed schedule and feed rate link after a reload", () => {
    const lane = ["treaterBufferBin", "treatDrumFeeder", "treatingElevator", "treaterPreBin"];
    const pasted = pasteMachines(goldenLine, copyMachines(goldenLine, lane), { x: 0, y: -3000 });
    expect(pasted.line.machineRules.length).toBeGreaterThan(goldenLine.machineRules.length);
    const storage = memoryStorage();
    storeWork(GOLDEN, { ...GOLDEN, line: pasted.line }, () => storage);
    expect(loadSavedWork(GOLDEN, () => storage).line).toEqual(pasted.line);
  });

  it("does not take a later golden line fix into an opened file", () => {
    const storage = memoryStorage();
    storeWork(GOLDEN, { line: goldenLine, name: "client trial", fromFile: true }, () => storage);
    const updated = { ...GOLDEN, line: edit(goldenLine, "metalBin1", "capacity", 12) };
    expect(readAdjustableValue(loadSavedWork(updated, () => storage).line, "metalBin1", "capacity")).toBe(6);
  });

  it.each([
    ["text that is not JSON", "{not json"],
    ["an unknown kind", JSON.stringify({ version: 1, kind: "other" })],
    ["a newer version", JSON.stringify({ version: 2, kind: "changes", changes: [] })],
    ["a damaged file", JSON.stringify({ version: 1, kind: "file", file: "{}" })],
    ["JSON null", "null"],
  ])("treats %s as no saved work", (_, text) => {
    const storage = memoryStorage();
    storage.setItem(SAVED_WORK_KEY, text);
    expect(loadSavedWork(GOLDEN, () => storage)).toBeNull();
  });
});

describe("blocked or unavailable storage", () => {
  it("means no saved work, and saving does nothing, without throwing", () => {
    expect(loadSavedWork(GOLDEN, () => throwingStorage)).toBeNull();
    expect(() => storeWork(GOLDEN, { ...GOLDEN, line: edit(goldenLine, "metalBin1", "capacity", 9) }, () => throwingStorage)).not.toThrow();
  });

  it("covers storage that cannot even be reached", () => {
    expect(loadSavedWork(GOLDEN, blocked)).toBeNull();
    expect(() => storeWork(GOLDEN, GOLDEN, blocked)).not.toThrow();
    expect(loadSavedWork(GOLDEN, () => undefined)).toBeNull();
  });
});

// Issue #87: NEW LINE asks first when there is work to lose.
describe("hasUnsavedWork", () => {
  it("is false for the untouched golden line and an empty new line", () => {
    expect(hasUnsavedWork(GOLDEN, GOLDEN)).toBe(false);
    expect(hasUnsavedWork(GOLDEN, { line: emptyLine(), name: "new line", fromFile: true })).toBe(false);
  });

  it("is true for a changed golden line and for a line with machines on it", () => {
    expect(hasUnsavedWork(GOLDEN, { ...GOLDEN, line: deleteMachine(goldenLine, "grainBreak").line })).toBe(true);
    const line = addMachine(emptyLine(), "grain-in", { x: 0, y: 0 }).line;
    expect(hasUnsavedWork(GOLDEN, { line, name: "new line", fromFile: true })).toBe(true);
  });
});

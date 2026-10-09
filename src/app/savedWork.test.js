// Issue #79: browser autosave. Edits to the golden line are stored as
// changes; an opened file is stored whole, with its name; an untouched
// golden line stores nothing. Storage that throws means "no saved work".
import { describe, it, expect } from "vitest";
import { loadSavedWork, storeWork, clearSavedWork, SAVED_WORK_KEY } from "./savedWork";
import { goldenLine, GOLDEN_LINE_NAME } from "../line/goldenLine";
import { setAdjustableValue, readAdjustableValue } from "../line/adjustableFields";
import { exportLine } from "../line/lineDocument";

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

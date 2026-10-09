// Issue #79: a user's work on the golden line is stored as the changes they
// made, not as a copy of the line, so every value they never touched comes
// fresh from the golden line on the next load.
import { describe, it, expect } from "vitest";
import { diffFromBase, applyChanges, setAdjustableValue } from "./lineDocument";
import { readAdjustableValue } from "./adjustableFields";
import { goldenLine } from "./goldenLine";

function edit(line, ...edits) {
  return edits.reduce((l, [machine, field, value]) => {
    const result = setAdjustableValue(l, machine, field, value);
    if (!result.ok) throw new Error(result.error);
    return result.line;
  }, line);
}

describe("diffFromBase", () => {
  it("finds no changes in an untouched line", () => {
    expect(diffFromBase(goldenLine, goldenLine)).toEqual([]);
  });

  it("lists each changed field once, in plant units", () => {
    const edited = edit(goldenLine,
      ["treaterBufferBin", "capacity", 10],
      ["upstreamStub", "rate", 13],
      ["upstreamStub", "rate", 14]);
    expect(diffFromBase(goldenLine, edited)).toEqual([
      { machine: "upstreamStub", field: "rate", value: 14 },
      { machine: "treaterBufferBin", field: "capacity", value: 10 },
    ]);
  });

  it("lists nothing for a field changed and then set back", () => {
    const edited = edit(goldenLine, ["metalBin1", "capacity", 9], ["metalBin1", "capacity", 6]);
    expect(diffFromBase(goldenLine, edited)).toEqual([]);
  });
});

describe("applyChanges", () => {
  it("reproduces the edited line from the base and its changes", () => {
    const edited = edit(goldenLine,
      ["treaterBufferBin", "capacity", 10],
      ["treaterBufferBin", "signalDelay", 3],
      ["batchTreater", "batchSize", 200],
      ["scalpingScreen", "wasteFrac", 4]);
    const changes = diffFromBase(goldenLine, edited);
    expect(changes).toHaveLength(4);
    expect(applyChanges(goldenLine, changes)).toEqual(edited);
  });

  it("never changes the base it was given", () => {
    const before = structuredClone(goldenLine);
    applyChanges(goldenLine, [{ machine: "metalBin1", field: "capacity", value: 9 }]);
    expect(goldenLine).toEqual(before);
  });

  it("applies set point changes whose order matters", () => {
    // LSL first to 20, then LSH down to 35. The diff lists LSH first, and LSH
    // 35 is refused while LSL is still 35, so the order must not matter.
    const edited = edit(goldenLine,
      ["treaterBufferBin", "lowSetpoint", 20],
      ["treaterBufferBin", "highSetpoint", 35]);
    const changes = diffFromBase(goldenLine, edited);
    expect(changes.map((c) => c.field)).toEqual(["highSetpoint", "lowSetpoint"]);
    expect(applyChanges(goldenLine, changes)).toEqual(edited);
  });

  it("takes every value the user never touched from the base, so a changed golden line default comes through", () => {
    const edited = edit(goldenLine, ["treaterBufferBin", "capacity", 10]);
    const changes = diffFromBase(goldenLine, edited);
    expect(changes.some((c) => c.machine === "metalBin1")).toBe(false);

    // A later golden line with a bigger metal bin.
    const updatedGolden = edit(goldenLine, ["metalBin1", "capacity", 12]);
    const loaded = applyChanges(updatedGolden, changes);
    expect(readAdjustableValue(loaded, "metalBin1", "capacity")).toBe(12);
    expect(readAdjustableValue(loaded, "treaterBufferBin", "capacity")).toBe(10);
  });

  it("ignores changes to a missing machine or field, bad values and malformed entries", () => {
    const changes = [
      { machine: "noSuchMachine", field: "capacity", value: 5 },
      { machine: "treaterBufferBin", field: "noSuchField", value: 5 },
      { machine: "treaterBufferBin", field: "capacity", value: 999 },
      null,
      "capacity",
      { machine: "metalBin2", field: "capacity", value: 9 },
    ];
    let loaded;
    expect(() => { loaded = applyChanges(goldenLine, changes); }).not.toThrow();
    expect(diffFromBase(goldenLine, loaded)).toEqual([{ machine: "metalBin2", field: "capacity", value: 9 }]);
  });

  it("treats a missing or non-list set of changes as no changes", () => {
    expect(applyChanges(goldenLine, undefined)).toEqual(goldenLine);
    expect(applyChanges(goldenLine, { machine: "metalBin1" })).toEqual(goldenLine);
  });
});

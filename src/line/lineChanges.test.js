// Issue #79: a user's work on the golden line is stored as the changes they
// made, not as a copy of the line, so every value they never touched comes
// fresh from the golden line on the next load.
import { describe, it, expect } from "vitest";
import {
  diffFromBase, applyChanges, setAdjustableValue, moveMachine, addMachine, deleteMachine,
  connectPorts, disconnectConnection, setMachineText,
} from "./lineDocument";
import { readAdjustableValue } from "./adjustableFields";
import { addInterlock, removeInterlock, setSentenceField, setSentenceReset } from "./sentenceEditor";
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

// Issue #86: a moved machine is a change too, stored as its new position.
describe("moves as changes", () => {
  function move(line, id, pos) {
    const result = moveMachine(line, id, pos);
    if (!result.ok) throw new Error(result.error);
    return result.line;
  }

  it("lists each moved machine's position, after the value changes", () => {
    const edited = move(edit(goldenLine, ["metalBin1", "capacity", 9]), "discardBin", { x: 300, y: 900 });
    expect(diffFromBase(goldenLine, edited)).toEqual([
      { machine: "metalBin1", field: "capacity", value: 9 },
      { machine: "discardBin", position: { x: 300, y: 900 } },
    ]);
  });

  it("reproduces the moved line, rerouted connections included", () => {
    const edited = move(move(goldenLine, "discardBin", { x: 300, y: 900 }), "concettiScale", { x: 3300, y: 470 });
    expect(applyChanges(goldenLine, diffFromBase(goldenLine, edited))).toEqual(edited);
  });

  it("applies moves that only fit in a different order than the one stored", () => {
    // The discard bin moves into the space the metal remover left.
    const remover = goldenLine.machines.find((m) => m.id === "treatMetalRemover");
    const edited = move(move(goldenLine, "treatMetalRemover", { x: 140, y: 1000 }), "discardBin", { x: remover.x, y: remover.y });
    const changes = diffFromBase(goldenLine, edited);
    expect(changes.map((c) => c.machine)).toEqual(["treatMetalRemover", "discardBin"]);
    expect(applyChanges(goldenLine, [...changes].reverse())).toEqual(edited);
  });

  it("ignores a move for a machine that no longer exists, and a move onto another machine", () => {
    const bin = goldenLine.machines.find((m) => m.id === "treaterBufferBin");
    const loaded = applyChanges(goldenLine, [
      { machine: "noSuchMachine", position: { x: 0, y: 0 } },
      { machine: "discardBin", position: { x: bin.x, y: bin.y } },
      { machine: "metalBin1", position: "here" },
      { machine: "concettiScale", position: { x: 3300, y: 470 } },
    ]);
    expect(diffFromBase(goldenLine, loaded)).toEqual([{ machine: "concettiScale", position: { x: 3300, y: 470 } }]);
  });

  it("brings a repo fix to every machine the user did not move", () => {
    const changes = diffFromBase(goldenLine, move(goldenLine, "discardBin", { x: 300, y: 900 }));
    const updatedGolden = move(goldenLine, "concettiScale", { x: 3300, y: 470 });
    const loaded = applyChanges(updatedGolden, changes);
    expect(loaded.machines.find((m) => m.id === "concettiScale")).toMatchObject({ x: 3300, y: 470 });
    expect(loaded.machines.find((m) => m.id === "discardBin")).toMatchObject({ x: 300, y: 900 });
  });
});

// Issue #90: name, tag, length and height are saved work on the golden
// line, like value edits, through the same diff/apply/saved-work pipeline.
describe("name, tag and resize as changes", () => {
  function rename(line, id, key, value) {
    const result = setMachineText(line, id, key, value);
    if (!result.ok) throw new Error(result.error);
    return result.line;
  }

  it("lists a changed name and tag, and nothing when set back", () => {
    const edited = rename(rename(goldenLine, "discardBin", "name", "WASTE BIN"), "discardBin", "tag", "99.000.H00");
    expect(diffFromBase(goldenLine, edited)).toEqual([
      { machine: "discardBin", text: "name", value: "WASTE BIN" },
      { machine: "discardBin", text: "tag", value: "99.000.H00" },
    ]);
    const reverted = rename(edited, "discardBin", "name", goldenLine.machines.find((m) => m.id === "discardBin").name);
    expect(diffFromBase(goldenLine, reverted)).toEqual([{ machine: "discardBin", text: "tag", value: "99.000.H00" }]);
  });

  it("reproduces a renamed line through diff and apply", () => {
    const edited = rename(rename(goldenLine, "discardBin", "name", "WASTE BIN"), "metalBin1", "tag", "X");
    expect(applyChanges(goldenLine, diffFromBase(goldenLine, edited))).toEqual(edited);
  });

  it("refuses a blank name but allows a blank tag", () => {
    expect(setMachineText(goldenLine, "discardBin", "name", "  ").ok).toBe(false);
    expect(setMachineText(goldenLine, "discardBin", "tag", "").ok).toBe(true);
  });

  it("lists and reproduces a resized conveyor's path length as a change, like any other adjustable field", () => {
    const resized = edit(goldenLine, ["pendulumConveyor", "pathLength", 40]);
    // Its boot stays put, so its top-left corner rises with the column.
    const m = resized.machines.find((x) => x.id === "pendulumConveyor");
    expect(diffFromBase(goldenLine, resized)).toEqual([
      { machine: "pendulumConveyor", field: "pathLength", value: 40 },
      { machine: "pendulumConveyor", position: { x: m.x, y: m.y } },
    ]);
    expect(applyChanges(goldenLine, diffFromBase(goldenLine, resized))).toEqual(resized);
  });
});

// Issue #87: an added machine is stored whole, and a deleted golden line
// machine as its id.
describe("adds and deletes as changes", () => {
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

  it("lists each deleted machine, then each added machine whole, after the moves", () => {
    const { line: added, id } = add(remove(edit(goldenLine, ["metalBin1", "capacity", 9]), "discardBin"), "grain-out", { x: 0, y: -400 });
    const changes = diffFromBase(goldenLine, added);
    expect(changes).toEqual([
      { machine: "metalBin1", field: "capacity", value: 9 },
      { delete: "discardBin" },
      { add: added.machines.find((m) => m.id === id) },
    ]);
  });

  it("stores no value changes or moves for an added machine: they are in the machine", () => {
    const { line, id } = add(goldenLine, "treater-buffer-bin", { x: 0, y: -600 });
    const edited = edit(line, [id, "capacity", 12]);
    const moved = moveMachine(edited, id, { x: 0, y: -900 }).line;
    const changes = diffFromBase(goldenLine, moved);
    expect(changes).toHaveLength(1);
    expect(changes[0].add).toMatchObject({ id, x: 0, y: -900, sim: { capacityM3: 12 } });
  });

  it("reproduces the line with its adds and deletes", () => {
    let line = remove(remove(goldenLine, "treaterPreBin"), "grainBreak");
    line = add(line, "metal-bin", { x: 0, y: -600 }).line;
    line = add(line, "grain-in", { x: 400, y: -600 }).line;
    expect(applyChanges(goldenLine, diffFromBase(goldenLine, line))).toEqual(line);
  });

  it("puts an added machine in the place a deleted one left", () => {
    const bin = goldenLine.machines.find((m) => m.id === "treaterBufferBin");
    const freed = remove(goldenLine, "treaterBufferBin");
    const { line } = add(freed, "treater-buffer-bin", { x: bin.x, y: bin.y });
    expect(line.machines.at(-1)).toMatchObject({ x: bin.x, y: bin.y });
    expect(applyChanges(goldenLine, diffFromBase(goldenLine, line))).toEqual(line);
  });

  it("ignores a delete of a machine the base does not have, and an add it cannot take", () => {
    const { line, id } = add(goldenLine, "metal-bin", { x: 0, y: -600 });
    const machine = line.machines.find((m) => m.id === id);
    const bin = goldenLine.machines.find((m) => m.id === "treaterBufferBin");
    const loaded = applyChanges(goldenLine, [
      { delete: "noSuchMachine" },
      { add: { ...machine, id: "treaterBufferBin" } },
      { add: { ...machine, id: "on-top", x: bin.x, y: bin.y } },
      { add: { id: "broken" } },
      { add: { ...machine, id: "no-kind", x: 1000, y: -600, sim: { kind: "teleporter" } } },
      { add: "nothing" },
      { add: machine },
    ]);
    expect(diffFromBase(goldenLine, loaded)).toEqual([{ add: machine }]);
  });

  it("brings a repo fix to every machine the user did not delete", () => {
    const changes = diffFromBase(goldenLine, remove(goldenLine, "discardBin"));
    const updatedGolden = edit(goldenLine, ["metalBin1", "capacity", 12]);
    const loaded = applyChanges(updatedGolden, changes);
    expect(loaded.machines.some((m) => m.id === "discardBin")).toBe(false);
    expect(readAdjustableValue(loaded, "metalBin1", "capacity")).toBe(12);
  });
});

// Issue #88: a rewiring on the golden line (a connect or a disconnect) is
// saved work too, like a move, an add or a delete.
describe("connects and disconnects as changes", () => {
  function connect(line, from, to) {
    const result = connectPorts(line, from, to);
    if (!result.ok) throw new Error(result.error);
    return result.line;
  }
  function disconnect(line, from) {
    const result = disconnectConnection(line, from);
    if (!result.ok) throw new Error(result.error);
    return result.line;
  }
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

  const bufferBinOut = { machine: "treaterBufferBin", port: "out" };
  const drumFeederIn = { machine: "treatDrumFeeder", port: "in" };
  const wasteOut = { machine: "batchTreater", port: "wasteOut" };

  it("lists a disconnect for a connection the user removed", () => {
    const edited = disconnect(goldenLine, bufferBinOut);
    expect(diffFromBase(goldenLine, edited)).toEqual([{ disconnect: { from: bufferBinOut } }]);
  });

  it("lists a connect for a connection the user made", () => {
    const edited = add(goldenLine, "grain-out", { x: 0, y: -400 });
    const line = connect(edited.line, wasteOut, { machine: edited.id, port: "in" });
    expect(diffFromBase(goldenLine, line)).toEqual([
      { add: line.machines.find((m) => m.id === edited.id) },
      { connect: { from: wasteOut, to: { machine: edited.id, port: "in" }, kind: "waste" } },
    ]);
  });

  it("lists nothing for a disconnect immediately reconnected the same way", () => {
    const edited = connect(disconnect(goldenLine, bufferBinOut), bufferBinOut, drumFeederIn);
    expect(diffFromBase(goldenLine, edited)).toEqual([]);
  });

  it("lists no disconnect for a connection lost only because its own machine was deleted", () => {
    const edited = remove(goldenLine, "treatDrumFeeder");
    const changes = diffFromBase(goldenLine, edited);
    expect(changes).toEqual([{ delete: "treatDrumFeeder" }]);
  });

  it("reproduces the rewired line from the base and its changes", () => {
    const added = add(goldenLine, "grain-out", { x: 0, y: -400 });
    const edited = connect(disconnect(added.line, bufferBinOut), bufferBinOut, { machine: added.id, port: "in" });
    const changes = diffFromBase(goldenLine, edited);
    expect(applyChanges(goldenLine, changes)).toEqual(edited);
  });
});

// Issue #95 follow-up: interlock edits on the golden line were never part
// of its saved changes, so every one was lost on reload. Each interlock is
// compared by id and stored whole when it is new or changed.
describe("interlocks, machine rules and feed rate links as changes", () => {
  const sentence = goldenLine.interlocks.find((r) => typeof r.when?.setpoint === "number");
  const ok = (result) => {
    if (!result.ok) throw new Error(result.error);
    return result.line;
  };
  const add = (line, itemId, pos) => {
    const result = addMachine(line, itemId, pos);
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  const connect = (line, from, to) => ok(connectPorts(line, from, to));

  it("finds no interlock changes in an untouched line", () => {
    expect(diffFromBase(goldenLine, goldenLine).filter((c) => c.list)).toEqual([]);
  });

  it("stores a changed golden line interlock whole", () => {
    const edited = ok(setSentenceReset(goldenLine, sentence.id, sentence.reset === "auto" ? "latched" : "auto"));
    const changes = diffFromBase(goldenLine, edited);
    expect(changes).toEqual([{ list: "interlocks", put: edited.interlocks.find((r) => r.id === sentence.id) }]);
    expect(applyChanges(goldenLine, changes)).toEqual(edited);
  });

  it("stores a set point a machine's field holds as that field only", () => {
    const edited = ok(setSentenceField(goldenLine, sentence.id, "when", "setpoint", 0.5));
    const changes = diffFromBase(goldenLine, edited);
    expect(changes.filter((c) => c.list)).toEqual([]);
    expect(applyChanges(goldenLine, changes)).toEqual(edited);
  });

  it("stores an added interlock and a deleted one, and reproduces both", () => {
    const added = addInterlock(goldenLine);
    const edited = ok(removeInterlock(added.line, sentence.id));
    const changes = diffFromBase(goldenLine, edited);
    expect(changes).toEqual([
      { list: "interlocks", put: edited.interlocks.find((r) => r.id === added.id) },
      { list: "interlocks", remove: sentence.id },
    ]);
    expect(applyChanges(goldenLine, changes)).toEqual(edited);
  });

  it("stores a dismissed suggestion, so it is not proposed again after a reload", () => {
    const edited = { ...goldenLine, dismissedSuggestions: ["suggested-high-a-b"] };
    const changes = diffFromBase(goldenLine, edited);
    expect(changes).toEqual([{ dismissSuggestion: "suggested-high-a-b" }]);
    expect(applyChanges(goldenLine, changes).dismissedSuggestions).toEqual(["suggested-high-a-b"]);
  });

  it("stores a changed machine rule and a deleted feed rate link", () => {
    const rule = { ...goldenLine.machineRules[0], signalDelaySec: 9 };
    const edited = {
      ...goldenLine,
      machineRules: goldenLine.machineRules.map((r) => (r.id === rule.id ? rule : r)),
      feedRateDerivations: goldenLine.feedRateDerivations.slice(1),
    };
    const changes = diffFromBase(goldenLine, edited);
    expect(changes).toEqual([
      { list: "machineRules", put: rule },
      { list: "feedRateDerivations", remove: goldenLine.feedRateDerivations[0].id },
    ]);
    expect(applyChanges(goldenLine, changes)).toEqual(edited);
  });

  it("ignores a remove of an interlock the base does not have, and malformed entries", () => {
    const line = applyChanges(goldenLine, [
      { list: "interlocks", remove: "no-such-interlock" },
      { list: "interlocks", put: "not a rule" },
      { list: "nonsense", put: { id: "x" } },
      { dismissSuggestion: 7 },
    ]);
    expect(line).toEqual(goldenLine);
  });

  it("keeps a pasted connection's bend points", () => {
    const a = add(goldenLine, "grain-in", { x: 0, y: -900 });
    const b = add(a.line, "grain-out", { x: 300, y: -900 });
    const wired = connect(b.line, { machine: a.id, port: "out" }, { machine: b.id, port: "in" });
    const via = [{ x: 200, y: -880 }];
    const edited = { ...wired, connections: wired.connections.map((c) => (c.from.machine === a.id ? { ...c, via } : c)) };
    expect(applyChanges(goldenLine, diffFromBase(goldenLine, edited))).toEqual(edited);
  });
});

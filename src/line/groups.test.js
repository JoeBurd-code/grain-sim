// Issue #95: several machines worked on together. Moving, deleting, copying
// and pasting a group are pure line document functions, like every other
// Build mode edit.
import { describe, it, expect } from "vitest";
import { emptyLine, addMachine, connectPorts } from "./lineDocument";
import { moveMachines, deleteMachines, copyMachines, pasteMachines, machinesInBox, pastePointBeside } from "./groups";
import { acceptSuggestion, pendingSuggestions } from "./suggestedInterlocks";
import { overlappingMachine } from "./layout";
import { validateLine } from "./validateLine";
import { ruleMachines } from "./interlocks";
import { goldenLine } from "./goldenLine";

const byId = (line, id) => line.machines.find((m) => m.id === id);

function add(line, itemId, pos) {
  const result = addMachine(line, itemId, pos);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function connect(line, a, b) {
  const result = connectPorts(line, a, b);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}
function ok(result) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

// Grain in, a metal bin, a drum feeder, a belt conveyor and Grain out, in a
// column, wired in order, with the bin's suggested high level interlock
// accepted (it stops Grain in), and one hand-made interlock that reaches
// from the feeder to Grain out.
function lane() {
  const ids = {};
  let line = emptyLine();
  for (const [key, item, y] of [["src", "grain-in", 0], ["bin", "metal-bin", 100], ["feeder", "drum-feeder", 320],
    ["belt", "belt-conveyor", 400], ["out", "grain-out", 480]]) {
    const r = add(line, item, { x: 0, y });
    line = r.line;
    ids[key] = r.id;
  }
  const chain = ["src", "bin", "feeder", "belt", "out"];
  for (let i = 0; i < chain.length - 1; i++) {
    line = connect(line, { machine: ids[chain[i]], port: "out" }, { machine: ids[chain[i + 1]], port: "in" });
  }
  const suggestion = pendingSuggestions(line).find((r) => r.when.machine === ids.bin);
  line = ok(acceptSuggestion(line, suggestion.id)).line;
  line = {
    ...line,
    interlocks: [...line.interlocks, {
      id: "interlock-reach", kind: "sentence",
      when: { machine: ids.feeder, condition: "stopped", delaySec: 1 },
      then: [{ action: "stop", machine: ids.src }], reset: "auto",
    }],
  };
  return { line, ids };
}

describe("moveMachines", () => {
  it("moves every machine in the group by the same step and leaves the rest", () => {
    const { line, ids } = lane();
    const next = ok(moveMachines(line, [ids.bin, ids.feeder], { x: 400, y: 30 })).line;
    expect(byId(next, ids.bin)).toMatchObject({ x: 400, y: 130 });
    expect(byId(next, ids.feeder)).toMatchObject({ x: 400, y: 350 });
    expect(byId(next, ids.belt)).toMatchObject({ x: 0, y: 400 });
  });

  it("lets machines in the group pass over each other's old places", () => {
    const { line, ids } = lane();
    // The feeder moves down onto where the belt was; the belt moves too.
    const next = ok(moveMachines(line, [ids.feeder, ids.belt, ids.out], { x: 0, y: 80 })).line;
    expect(byId(next, ids.feeder)).toMatchObject({ x: 0, y: 400 });
  });

  it("refuses a step that puts any machine of the group on a machine outside it", () => {
    const { line, ids } = lane();
    const result = moveMachines(line, [ids.feeder, ids.belt], { x: 0, y: -200 });
    expect(result.ok).toBe(false);
    expect(result.overlaps).toBe(ids.bin);
  });

  it("is the same line for a step of nothing, and never changes the line it is given", () => {
    const { line, ids } = lane();
    expect(ok(moveMachines(line, [ids.bin], { x: 0, y: 0 })).line).toBe(line);
    const before = structuredClone(line);
    moveMachines(line, [ids.bin, ids.feeder], { x: 500, y: 0 });
    expect(line).toEqual(before);
  });

  it("refuses a machine the line does not have", () => {
    const { line } = lane();
    expect(moveMachines(line, ["nope"], { x: 10, y: 0 }).ok).toBe(false);
  });
});

describe("deleteMachines", () => {
  it("deletes every machine in the group and every connection to them", () => {
    const { line, ids } = lane();
    const next = ok(deleteMachines(line, [ids.bin, ids.feeder])).line;
    expect(next.machines.map((m) => m.id)).toEqual([ids.src, ids.belt, ids.out]);
    expect(next.connections).toHaveLength(1);
    expect(next.connections[0].from.machine).toBe(ids.belt);
  });

  it("refuses a machine the line does not have, and changes nothing", () => {
    const { line, ids } = lane();
    expect(deleteMachines(line, [ids.bin, "nope"]).ok).toBe(false);
  });

  it("takes a machine named twice once", () => {
    const { line, ids } = lane();
    expect(ok(deleteMachines(line, [ids.bin, ids.bin])).line.machines).toHaveLength(4);
  });
});

describe("copyMachines and pasteMachines", () => {
  function pasteLane(groupKeys, at = { x: 600, y: 0 }) {
    const { line, ids } = lane();
    const group = groupKeys.map((k) => ids[k]);
    const clip = copyMachines(line, group);
    const result = ok(pasteMachines(line, clip, at));
    return { line, ids, group, clip, result };
  }

  it("never pastes a machine onto an id an orphaned rule still names (#147)", () => {
    // Paste allocates ids like addMachine does, so a deleted machine's freed id
    // must not come back here either: an orphaned rule naming it would attach
    // to the pasted copy without anyone pointing it there.
    let line = emptyLine();
    const placed = add(line, "custom-bin", { x: 100, y: 200 });
    const bin = placed.line.machines[0];
    const rule = { id: "interlock-1", kind: "sentence",
      when: { machine: placed.id, condition: "above", percent: 85, seconds: 5 },
      then: [] };
    line = { ...placed.line, interlocks: [...placed.line.interlocks, rule] };
    line = deleteMachines(line, [placed.id]).line;
    expect(ruleMachines(rule)).toContain(placed.id); // the orphan still names it
    const clip = { machines: [structuredClone(bin)], connections: [] };
    const result = ok(pasteMachines(line, clip, { x: 500, y: 200 }));
    expect(result.ids[0]).not.toBe(placed.id);
    expect(result.ids[0]).toBe("custom-bin-2");
  });

  it("pastes the group with new ids and new unique names", () => {
    const { line, result } = pasteLane(["bin", "feeder", "belt"]);
    expect(result.ids).toHaveLength(3);
    const oldIds = new Set(line.machines.map((m) => m.id));
    expect(result.ids.every((id) => !oldIds.has(id))).toBe(true);
    const names = result.line.machines.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(result.ids.map((id) => byId(result.line, id).name)).toEqual(["METAL BIN 2", "DRUM FEEDER 2", "BELT CONVEYOR 2"]);
  });

  it("keeps each machine's item, values and place in the group", () => {
    const { ids, result } = pasteLane(["bin", "feeder", "belt"]);
    const [bin, feeder] = result.ids.map((id) => byId(result.line, id));
    const { line } = lane();
    const original = byId(line, ids.bin);
    expect(bin).toMatchObject({ item: original.item, type: original.type, sim: original.sim, w: original.w, h: original.h });
    // The group's top-left lands on the paste point, every machine keeping
    // its offset from it.
    expect(bin).toMatchObject({ x: 600, y: 100 - 100 });
    expect(feeder).toMatchObject({ x: 600, y: 320 - 100 });
  });

  it("keeps the connections between the group's machines, and only those", () => {
    const { result } = pasteLane(["bin", "feeder", "belt"]);
    const [bin, feeder, belt] = result.ids;
    const pasted = result.line.connections.filter((c) => result.ids.includes(c.from.machine) || result.ids.includes(c.to.machine));
    expect(pasted.map((c) => [c.from.machine, c.to.machine])).toEqual([[bin, feeder], [feeder, belt]]);
  });

  it("brings the interlocks whose machines are all in the group, pointed at the new copies", () => {
    const { line, result } = pasteLane(["src", "bin", "feeder", "belt"]);
    const [src, bin, feeder] = result.ids;
    const added = result.line.interlocks.slice(line.interlocks.length);
    expect(added).toHaveLength(2);
    expect(added.map(ruleMachines)).toEqual([[bin, src], [feeder, src]]);
    const allIds = result.line.interlocks.map((r) => r.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("leaves behind the interlocks that reach outside the group", () => {
    const { line, result } = pasteLane(["bin", "feeder", "belt"]);
    // The bin's interlock stops Grain in, the hand-made one stops it too:
    // neither has every machine in the group.
    expect(result.line.interlocks).toHaveLength(line.interlocks.length);
  });

  it("gives a line that validates, with nothing overlapping", () => {
    const { result } = pasteLane(["src", "bin", "feeder", "belt", "out"]);
    expect(validateLine(result.line).errors).toEqual([]);
    for (const m of result.line.machines) expect(overlappingMachine(result.line, m.id, m)).toBeNull();
  });

  it("lands at the nearest free place when the paste point is taken", () => {
    const { line, result } = pasteLane(["feeder"], { x: 0, y: 320 });
    const m = byId(result.line, result.ids[0]);
    expect(overlappingMachine(result.line, m.id, m)).toBeNull();
    expect(line.machines).toHaveLength(result.line.machines.length - 1);
  });

  it("pastes the same group twice with different names", () => {
    const { line, ids } = lane();
    const clip = copyMachines(line, [ids.bin]);
    const once = ok(pasteMachines(line, clip, { x: 600, y: 0 }));
    const twice = ok(pasteMachines(once.line, clip, { x: 900, y: 0 }));
    expect(byId(twice.line, twice.ids[0]).name).toBe("METAL BIN 3");
  });

  it("copies the group, so a later change to the line does not reach the clipboard", () => {
    const { line, ids } = lane();
    const clip = copyMachines(line, [ids.bin]);
    byId(line, ids.bin).sim.capacityM3 = 99;
    expect(clip.machines[0].sim.capacityM3).not.toBe(99);
  });

  it("copies a golden line machine without its zone", () => {
    const m = goldenLine.machines.find((x) => x.zone !== undefined && x.type !== "stub");
    const clip = copyMachines(goldenLine, [m.id]);
    const result = ok(pasteMachines(goldenLine, clip, { x: 0, y: -3000 }));
    expect(byId(result.line, result.ids[0]).zone).toBeUndefined();
    expect(byId(result.line, result.ids[0]).tag).toBe("");
    expect(validateLine(result.line).errors).toEqual(validateLine(goldenLine).errors);
  });

  it("never changes the line it is given", () => {
    const { line, ids } = lane();
    const before = structuredClone(line);
    pasteMachines(line, copyMachines(line, [ids.bin, ids.feeder]), { x: 600, y: 0 });
    expect(line).toEqual(before);
  });

  it("refuses an empty clipboard", () => {
    expect(pasteMachines(emptyLine(), { machines: [], connections: [], interlocks: [] }, { x: 0, y: 0 }).ok).toBe(false);
  });
});

// The golden line's treating lane: the buffer bin, the drum feeder, the
// treating elevator and the pre-bin whose graded feed schedule drives the
// elevator and the feeder, with a feed rate link from the elevator to the
// feeder.
const TREATING = ["treaterBufferBin", "treatDrumFeeder", "treatingElevator", "treaterPreBin"];

describe("copying machine rules and feed rate links", () => {
  function pasteTreating() {
    const result = ok(pasteMachines(goldenLine, copyMachines(goldenLine, TREATING), { x: 0, y: -3000 }));
    const copyOf = new Map(TREATING.map((id, i) => [id, result.ids[i]]));
    return { result, copyOf };
  }

  it("brings a machine rule whose machines are all in the group, pointed at the copies", () => {
    const { result, copyOf } = pasteTreating();
    const added = result.line.machineRules.slice(goldenLine.machineRules.length);
    expect(added).toHaveLength(1);
    expect(added[0].kind).toBe("gradedFeedSchedule");
    expect(added[0].sensor.machine).toBe(copyOf.get("treaterPreBin"));
    expect(added[0].action.elevator.machine).toBe(copyOf.get("treatingElevator"));
    expect(added[0].action.feeder.machine).toBe(copyOf.get("treatDrumFeeder"));
    const ids = result.line.machineRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("brings a feed rate link whose machines are both in the group, pointed at the copies", () => {
    const { result, copyOf } = pasteTreating();
    const added = result.line.feedRateDerivations.slice(goldenLine.feedRateDerivations.length);
    expect(added).toHaveLength(1);
    expect(added[0].elevator.machine).toBe(copyOf.get("treatingElevator"));
    expect(added[0].feeder.machine).toBe(copyOf.get("treatDrumFeeder"));
    const ids = result.line.feedRateDerivations.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves behind the machine rules and feed rate links that reach outside the group", () => {
    const result = ok(pasteMachines(goldenLine, copyMachines(goldenLine, ["treatingElevator", "treaterPreBin"]), { x: 0, y: -3000 }));
    expect(result.line.machineRules).toHaveLength(goldenLine.machineRules.length);
    expect(result.line.feedRateDerivations).toHaveLength(goldenLine.feedRateDerivations.length);
  });

  it("gives a golden line that still validates", () => {
    const { result } = pasteTreating();
    expect(validateLine(result.line).errors).toEqual(validateLine(goldenLine).errors);
  });

  // A copied bin whose set points live in an interlock that stays behind
  // goes without those fields, instead of fields with nothing to adjust.
  it.each(goldenLine.machines.map((m) => m.id))("pastes golden line machine %s alone into a line that validates", (id) => {
    const result = ok(pasteMachines(goldenLine, copyMachines(goldenLine, [id]), { x: 0, y: -3000 }));
    expect(validateLine(result.line).errors).toEqual(validateLine(goldenLine).errors);
  });
});

describe("pastePointBeside", () => {
  it("is the gap to the right of the group's box, level with its top", () => {
    const { line, ids } = lane();
    const group = line.machines.filter((m) => [ids.bin, ids.belt].includes(m.id));
    // The belt is the widest, 300 wide at x 0; the bin is the highest, at y 100.
    expect(pastePointBeside(group, 60)).toEqual({ x: 360, y: 100 });
  });
});

describe("machinesInBox", () => {
  it("is every machine whose footprint the box touches", () => {
    const { line, ids } = lane();
    expect(machinesInBox(line, { x: -10, y: 90, w: 20, h: 250 })).toEqual([ids.bin, ids.feeder]);
    expect(machinesInBox(line, { x: 1000, y: 0, w: 10, h: 10 })).toEqual([]);
  });

  it("works with a box drawn from any corner", () => {
    const { line, ids } = lane();
    expect(machinesInBox(line, { x: 10, y: 340, w: -20, h: -250 })).toEqual([ids.bin, ids.feeder]);
  });
});

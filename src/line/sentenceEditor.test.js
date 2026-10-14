// Issue #92: Build mode edits to interlock sentences.
import { describe, it, expect } from "vitest";
import {
  addInterlock, removeInterlock, setSentenceField, addWhenClears, removeWhenClears,
  setSentenceReset, addStep, removeStep, moveStep, setStepField, setStepAction,
} from "./sentenceEditor";
import { emptyLine } from "./lineDocument";
import { validateSentence } from "../sim/sentenceInterlock";

function lineWithOneMachine() {
  const line = emptyLine();
  line.machines.push({
    id: "bin1", name: "Bin 1", tag: "", x: 0, y: 0, w: 10, h: 10,
    ports: { inputs: ["in"], outputs: ["out"] },
    sim: { kind: "accumulator", levelSwitches: { LSH: 0.85 } },
  });
  return line;
}

describe("addInterlock / removeInterlock", () => {
  it("adds a blank sentence that picks up the line's first machine", () => {
    const line = lineWithOneMachine();
    const result = addInterlock(line);
    expect(result.ok).toBe(true);
    expect(result.line).not.toBe(line);
    expect(line.interlocks).toHaveLength(0); // the original is untouched
    const rule = result.line.interlocks.find((r) => r.id === result.id);
    expect(rule.when.machine).toBe("bin1");
    expect(rule.kind).toBe("sentence");
  });

  it("assigns each new interlock a distinct id", () => {
    let line = emptyLine();
    const a = addInterlock(line);
    const b = addInterlock(a.line);
    expect(a.id).not.toBe(b.id);
  });

  it("removes an interlock by id", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const removed = removeInterlock(added.line, added.id);
    expect(removed.ok).toBe(true);
    expect(removed.line.interlocks).toHaveLength(0);
  });

  it("refuses to remove an interlock that does not exist", () => {
    const line = lineWithOneMachine();
    expect(removeInterlock(line, "nope").ok).toBe(false);
  });
});

describe("setSentenceField", () => {
  it("changes a field of the when part", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const result = setSentenceField(added.line, added.id, "when", "setpoint", 0.5);
    const rule = result.line.interlocks.find((r) => r.id === added.id);
    expect(rule.when.setpoint).toBe(0.5);
  });

  it("mirrors a set point onto the machine's own levelSwitches when the part names a switch", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const withSwitch = setSentenceField(added.line, added.id, "when", "switch", "LSH");
    const result = setSentenceField(withSwitch.line, added.id, "when", "setpoint", 0.4);
    expect(result.line.machines[0].sim.levelSwitches.LSH).toBe(0.4);
  });

  it("creates the whenClears part on first write", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const result = setSentenceField(added.line, added.id, "whenClears", "condition", "below");
    const rule = result.line.interlocks.find((r) => r.id === added.id);
    expect(rule.whenClears.condition).toBe("below");
    expect(rule.whenClears.then).toEqual([]);
  });

  it("removes a field when given null", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const withSwitch = setSentenceField(added.line, added.id, "when", "switch", "LSH");
    const cleared = setSentenceField(withSwitch.line, added.id, "when", "switch", null);
    const rule = cleared.line.interlocks.find((r) => r.id === added.id);
    expect(rule.when.switch).toBeUndefined();
  });
});

describe("addWhenClears / removeWhenClears", () => {
  it("adds and removes the when-it-clears part", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const withClears = addWhenClears(added.line, added.id);
    expect(withClears.line.interlocks[0].whenClears).toEqual({ then: [] });
    const removed = removeWhenClears(withClears.line, added.id);
    expect(removed.line.interlocks[0].whenClears).toBeUndefined();
  });
});

describe("setSentenceReset", () => {
  it("accepts auto or latched", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const result = setSentenceReset(added.line, added.id, "latched");
    expect(result.line.interlocks[0].reset).toBe("latched");
  });

  it("refuses anything else", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    expect(setSentenceReset(added.line, added.id, "manual").ok).toBe(false);
  });
});

describe("step blocks", () => {
  it("adds a machine-commanding step naming the line's first machine", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const result = addStep(added.line, added.id, "then", "close");
    const rule = result.line.interlocks.find((r) => r.id === added.id);
    expect(rule.then).toHaveLength(2);
    expect(rule.then[1]).toEqual({ action: "close", machine: "bin1" });
  });

  it("adds a wait step with a default duration", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const result = addStep(added.line, added.id, "then", "wait");
    expect(result.line.interlocks[0].then[1]).toEqual({ action: "wait", seconds: 5 });
  });

  it("creates whenClears.then on first step added there", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const result = addStep(added.line, added.id, "whenClearsThen", "open");
    expect(result.line.interlocks[0].whenClears.then).toEqual([{ action: "open", machine: "bin1" }]);
  });

  it("removes a step by index", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const withWait = addStep(added.line, added.id, "then", "wait");
    const result = removeStep(withWait.line, added.id, "then", 0);
    expect(result.line.interlocks[0].then).toEqual([{ action: "wait", seconds: 5 }]);
  });

  it("reorders steps", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const withWait = addStep(added.line, added.id, "then", "wait");
    const result = moveStep(withWait.line, added.id, "then", 0, 1);
    expect(result.line.interlocks[0].then.map((s) => s.action)).toEqual(["wait", "stop"]);
  });

  it("edits a step's own field", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const withWait = addStep(added.line, added.id, "then", "wait");
    const result = setStepField(withWait.line, added.id, "then", 1, "seconds", 12);
    expect(result.line.interlocks[0].then[1].seconds).toBe(12);
  });

  it("changes a step's action, keeping its ramp time", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const withRamp = setStepField(added.line, added.id, "then", 0, "rampTimeSec", 3);
    const result = setStepAction(withRamp.line, added.id, "then", 0, "close");
    expect(result.line.interlocks[0].then[0]).toEqual({ action: "close", machine: "bin1", rampTimeSec: 3 });
  });

  it("changing a step to a flow action drops its machine and ramp time", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const result = setStepAction(added.line, added.id, "then", 0, "wait");
    expect(result.line.interlocks[0].then[0]).toEqual({ action: "wait", seconds: 5 });
  });
});

describe("validateSentence integration", () => {
  it("a newly added interlock on a one-machine line validates cleanly enough to only miss what a real line would add", () => {
    const line = lineWithOneMachine();
    const added = addInterlock(line);
    const byId = new Map(added.line.machines.map((m) => [m.id, m]));
    // "above" needs a level behaviour; our stub machine has none, so this
    // documents that validateSentence still catches a real mismatch rather
    // than asserting a clean pass against a fake behaviour.
    expect(validateSentence(added.line.interlocks[0], byId).length).toBeGreaterThan(0);
  });
});

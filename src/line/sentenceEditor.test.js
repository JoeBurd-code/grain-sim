// Issue #92: Build mode edits to interlock sentences.
import { describe, it, expect } from "vitest";
import {
  addInterlock, removeInterlock, setSentenceField, setWhenClearsCondition, addWhenClears, removeWhenClears,
  setSentenceReset, addStep, removeStep, moveStep, setStepField, rewriteAsHold,
} from "./sentenceEditor";
import { emptyLine, addMachine, connectPorts } from "./lineDocument";
import { sentenceProblems, sentenceSummary, runStepHint } from "./sentenceOptions";
import { lineProblems } from "./problems";
import { createSim, stepSim, getMachineState, DT } from "../sim/engine";

function add(line, item, pos) {
  const r = addMachine(line, item, pos);
  if (!r.ok) throw new Error(r.error);
  return r;
}
function connect(line, a, b) {
  const r = connectPorts(line, a, b);
  if (!r.ok) throw new Error(r.error);
  return r.line;
}
function ok(result) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

// Grain in -> Concetti pre-bin -> drum feeder -> Grain out: the line from
// the issue #92 screenshot.
function binFeederLine() {
  const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
  const bin = add(grainIn.line, "concetti-pre-bin", { x: 0, y: 150 });
  const feeder = add(bin.line, "drum-feeder", { x: 0, y: 350 });
  const grainOut = add(feeder.line, "grain-out", { x: 0, y: 500 });
  let line = connect(grainOut.line, { machine: grainIn.id, port: "out" }, { machine: bin.id, port: "in" });
  line = connect(line, { machine: bin.id, port: "out" }, { machine: feeder.id, port: "in" });
  line = connect(line, { machine: feeder.id, port: "out" }, { machine: grainOut.id, port: "in" });
  return { line, grainIn: grainIn.id, bin: bin.id, feeder: feeder.id, grainOut: grainOut.id };
}

const ruleOf = (result, id) => result.line.interlocks.find((r) => r.id === id);

// Fills a blank interlock in, one blank at a time, as a user would:
// "When the bin is above 85 % for 5 s, close Grain in."
function filled() {
  const ids = binFeederLine();
  const { id, line: blank } = ok(addInterlock(ids.line));
  let line = blank;
  const edit = (r) => { line = ok(r).line; };
  edit(setSentenceField(line, id, "when", "machine", ids.bin));
  edit(setSentenceField(line, id, "when", "condition", "above"));
  edit(setSentenceField(line, id, "when", "setpoint", 0.85));
  edit(setSentenceField(line, id, "when", "delaySec", 5));
  edit(addStep(line, id, "then", "machine"));
  edit(setStepField(line, id, "then", 0, "machine", ids.grainIn));
  edit(setStepField(line, id, "then", 0, "action", "close"));
  return { ...ids, id, line };
}

describe("addInterlock", () => {
  it("adds a blank sentence that reads as blanks and does not run", () => {
    const ids = binFeederLine();
    const result = ok(addInterlock(ids.line));
    const rule = ruleOf(result, result.id);
    expect(rule.when).toEqual({ machine: null, condition: null });
    expect(rule.then).toEqual([]);
    expect(sentenceSummary(result.line, rule).map((s) => s.text ?? "[m]").join("")).toBe("When [m] is … for … s, ….");
    expect(sentenceProblems(result.line, rule)).toContain("needs a machine to watch");
    expect(lineProblems(result.line).some((p) => p.message.startsWith("New interlock: incomplete interlock"))).toBe(true);
    expect(createSim(result.line).control.some((r) => r.id === result.id)).toBe(false);
  });

  it("filled in, has no problems", () => {
    const s = filled();
    expect(sentenceProblems(s.line, s.line.interlocks[0])).toEqual([]);
  });

  it("never changes the line it is given, and gives each interlock its own id", () => {
    const ids = binFeederLine();
    const a = ok(addInterlock(ids.line));
    const b = ok(addInterlock(a.line));
    expect(ids.line.interlocks).toHaveLength(0);
    expect(a.id).not.toBe(b.id);
  });

  it("removes one by id, and refuses an unknown id", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    expect(ok(removeInterlock(added.line, added.id)).line.interlocks).toHaveLength(0);
    expect(removeInterlock(added.line, "nope").ok).toBe(false);
  });
});

describe("setSentenceField", () => {
  it("empties a condition the newly watched machine cannot have, with its set point", () => {
    const s = filled();
    const elevator = add(s.line, "bucket-elevator", { x: 400, y: 0 });
    const rule = ruleOf(ok(setSentenceField(elevator.line, s.id, "when", "machine", elevator.id)), s.id);
    expect(rule.when.condition).toBeNull();
    expect(rule.when.setpoint).toBeUndefined();
  });

  it("mirrors a switch's set point onto the machine's levelSwitches", () => {
    const s = filled();
    let result = ok(setSentenceField(s.line, s.id, "when", "switch", "LSH"));
    result.line.machines.find((m) => m.id === s.bin).sim.levelSwitches = { LSH: 0.85 };
    result = ok(setSentenceField(result.line, s.id, "when", "setpoint", 0.4));
    expect(result.line.machines.find((m) => m.id === s.bin).sim.levelSwitches.LSH).toBe(0.4);
  });

  it("removes a field when given null", () => {
    const s = filled();
    const withSwitch = ok(setSentenceField(s.line, s.id, "when", "switch", "LSH"));
    expect(ruleOf(ok(setSentenceField(withSwitch.line, s.id, "when", "switch", null)), s.id).when.switch).toBeUndefined();
  });
});

describe("when it clears", () => {
  it("starts by undoing every machine the then steps hold", () => {
    const s = filled();
    const result = ok(addWhenClears(s.line, s.id));
    const rule = ruleOf(result, s.id);
    expect(rule.whenClears).toEqual({ then: [{ action: "open", machine: s.grainIn }] });
    expect(sentenceProblems(result.line, rule)).toEqual([]);
  });

  it("can take its own opposite condition, and give it back", () => {
    const s = filled();
    const withClear = ok(addWhenClears(s.line, s.id));
    const on = ruleOf(ok(setWhenClearsCondition(withClear.line, s.id, true)), s.id);
    expect(on.whenClears).toMatchObject({ condition: "below", delaySec: 5 });
    expect(on.whenClears.setpoint).toBeCloseTo(0.65, 9);
    const off = ruleOf(ok(setWhenClearsCondition(withClear.line, s.id, false)), s.id);
    expect(off.whenClears.condition).toBeUndefined();
    expect(ruleOf(ok(removeWhenClears(withClear.line, s.id)), s.id).whenClears).toBeUndefined();
  });
});

describe("setSentenceReset", () => {
  it("accepts auto or latched, refuses anything else", () => {
    const s = filled();
    expect(ruleOf(ok(setSentenceReset(s.line, s.id, "latched")), s.id).reset).toBe("latched");
    expect(setSentenceReset(s.line, s.id, "manual").ok).toBe(false);
  });
});

describe("step blocks", () => {
  it("adds blank steps, which are problems until filled", () => {
    const s = filled();
    let result = ok(addStep(s.line, s.id, "then", "machine"));
    result = ok(addStep(result.line, s.id, "then", "wait"));
    const rule = ruleOf(result, s.id);
    expect(rule.then.slice(1)).toEqual([{ action: null, machine: null }, { action: "wait", seconds: null }]);
    expect(sentenceProblems(result.line, rule)).toEqual(["step 2 needs a machine", "step 3 needs a wait time"]);
  });

  it("reorders and removes steps", () => {
    const s = filled();
    let result = ok(addStep(s.line, s.id, "then", "wait"));
    result = ok(moveStep(result.line, s.id, "then", 0, 1));
    expect(ruleOf(result, s.id).then.map((x) => x.action)).toEqual(["wait", "close"]);
    result = ok(removeStep(result.line, s.id, "then", 0));
    expect(ruleOf(result, s.id).then.map((x) => x.action)).toEqual(["close"]);
  });

  it("empties the action when the new machine cannot take it", () => {
    const s = filled();
    const result = ok(setStepField(s.line, s.id, "then", 0, "machine", s.feeder));
    expect(ruleOf(result, s.id).then[0]).toEqual({ action: null, machine: s.feeder });
  });
});

// The screenshot on issue #92: "when the pre-bin is above 49 %, open the
// drum feeder" never ran.
describe("running a machine is rewritten as holding it", () => {
  function startWhenAbove() {
    const s = filled();
    let line = ok(setSentenceField(s.line, s.id, "when", "setpoint", 0.49)).line;
    line = ok(setStepField(line, s.id, "then", 0, "machine", s.feeder)).line;
    line = ok(setStepField(line, s.id, "then", 0, "action", "start")).line;
    return { ...s, line };
  }

  it("a start with nothing to undo is a problem, with a hint", () => {
    const s = startWhenAbove();
    const rule = s.line.interlocks[0];
    expect(sentenceProblems(s.line, rule).join()).toMatch(/cannot start DRUM FEEDER 1/);
    expect(runStepHint(s.line, rule)).toEqual({ index: 0, machine: s.feeder, action: "stop", condition: "below" });
  });

  it("the rewrite runs the feeder only once the bin is above 49 %", () => {
    const s = startWhenAbove();
    const line = ok(rewriteAsHold(s.line, s.id, 0)).line;
    const rule = line.interlocks[0];
    expect(rule.when).toMatchObject({ condition: "below", setpoint: 0.49 });
    expect(rule.then).toEqual([{ action: "stop", machine: s.feeder }]);
    expect(sentenceProblems(line, rule)).toEqual([]);

    const sim = createSim(line);
    for (let i = 0; i < Math.round(900 / DT); i++) stepSim(sim, DT);
    const bin = getMachineState(sim, s.bin);
    // Held stopped while filling, then running: the bin rides at about 49 %.
    expect(bin.stored / bin.capacity).toBeGreaterThan(0.45);
    expect(bin.stored / bin.capacity).toBeLessThan(0.55);
    expect(getMachineState(sim, s.grainOut).total).toBeGreaterThan(0);
  });
});

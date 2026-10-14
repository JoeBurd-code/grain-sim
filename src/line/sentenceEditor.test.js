// Issue #92: Build mode edits to interlock sentences.
import { describe, it, expect } from "vitest";
import {
  addInterlock, removeInterlock, setSentenceField, setWhenClearsCondition, addWhenClears, removeWhenClears,
  setSentenceReset, addStep, removeStep, moveStep, setStepField, rewriteAsHold,
} from "./sentenceEditor";
import { emptyLine, addMachine, connectPorts } from "./lineDocument";
import { sentenceProblems, runStepHint } from "./sentenceOptions";
import { validateSentence } from "../sim/sentenceInterlock";
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

describe("addInterlock", () => {
  it("starts valid: watches the bin, closes what feeds it", () => {
    const ids = binFeederLine();
    const result = ok(addInterlock(ids.line));
    const rule = ruleOf(result, result.id);
    expect(rule.when).toMatchObject({ machine: ids.bin, condition: "above", setpoint: 0.85 });
    expect(rule.then).toEqual([{ action: "close", machine: ids.grainIn }]);
    expect(sentenceProblems(result.line, rule)).toEqual([]);
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
  it("moves the condition to a valid one when the watched machine changes", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    const elevator = add(added.line, "bucket-elevator", { x: 400, y: 0 });
    const rule = ruleOf(ok(setSentenceField(elevator.line, added.id, "when", "machine", elevator.id)), added.id);
    // An elevator has no level; it can only be stopped or running.
    expect(rule.when.condition).toBe("stopped");
    expect(rule.when.setpoint).toBeUndefined();
  });

  it("mirrors a switch's set point onto the machine's levelSwitches", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    let result = ok(setSentenceField(added.line, added.id, "when", "switch", "LSH"));
    const bin = result.line.machines.find((m) => m.id === ids.bin);
    bin.sim.levelSwitches = { LSH: 0.85 };
    result = ok(setSentenceField(result.line, added.id, "when", "setpoint", 0.4));
    expect(result.line.machines.find((m) => m.id === ids.bin).sim.levelSwitches.LSH).toBe(0.4);
  });

  it("removes a field when given null", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    const withSwitch = ok(setSentenceField(added.line, added.id, "when", "switch", "LSH"));
    expect(ruleOf(ok(setSentenceField(withSwitch.line, added.id, "when", "switch", null)), added.id).when.switch).toBeUndefined();
  });
});

describe("when it clears", () => {
  it("starts by undoing every machine the then steps hold", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    const rule = ruleOf(ok(addWhenClears(added.line, added.id)), added.id);
    expect(rule.whenClears).toEqual({ then: [{ action: "open", machine: ids.grainIn }] });
    expect(validateSentence(rule, new Map(added.line.machines.map((m) => [m.id, m])))).toEqual([]);
  });

  it("can take its own opposite condition, and give it back", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    const withClear = ok(addWhenClears(added.line, added.id));
    const on = ruleOf(ok(setWhenClearsCondition(withClear.line, added.id, true)), added.id);
    expect(on.whenClears).toMatchObject({ condition: "below", delaySec: 5 });
    expect(on.whenClears.setpoint).toBeCloseTo(0.65, 9);
    const off = ruleOf(ok(setWhenClearsCondition(withClear.line, added.id, false)), added.id);
    expect(off.whenClears.condition).toBeUndefined();
    expect(ruleOf(ok(removeWhenClears(withClear.line, added.id)), added.id).whenClears).toBeUndefined();
  });
});

describe("setSentenceReset", () => {
  it("accepts auto or latched, refuses anything else", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    expect(ruleOf(ok(setSentenceReset(added.line, added.id, "latched")), added.id).reset).toBe("latched");
    expect(setSentenceReset(added.line, added.id, "manual").ok).toBe(false);
  });
});

describe("step blocks", () => {
  it("adds, reorders and removes steps", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    let result = ok(addStep(added.line, added.id, "then", "wait"));
    expect(ruleOf(result, added.id).then[1]).toEqual({ action: "wait", seconds: 5 });
    result = ok(moveStep(result.line, added.id, "then", 0, 1));
    expect(ruleOf(result, added.id).then.map((s) => s.action)).toEqual(["wait", "close"]);
    result = ok(removeStep(result.line, added.id, "then", 0));
    expect(ruleOf(result, added.id).then.map((s) => s.action)).toEqual(["close"]);
  });

  it("a new machine step holds what feeds the bin for above, what empties it for below", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    let result = ok(addStep(added.line, added.id, "whenClearsThen", "machine"));
    expect(ruleOf(result, added.id).whenClears.then).toEqual([{ action: "close", machine: ids.grainIn }]);
    result = ok(setSentenceField(added.line, added.id, "when", "condition", "below"));
    result = ok(addStep(result.line, added.id, "then", "machine"));
    expect(ruleOf(result, added.id).then[1]).toEqual({ action: "stop", machine: ids.feeder });
  });

  it("moves to the new machine's own action when it cannot take the old one", () => {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    let result = ok(setStepField(added.line, added.id, "then", 0, "action", "close"));
    result = ok(setStepField(result.line, added.id, "then", 0, "machine", ids.feeder));
    expect(ruleOf(result, added.id).then[0].action).toBe("stop");
  });
});

// The screenshot on issue #92: "when the pre-bin is above 49 %, open the
// drum feeder" never ran.
describe("running a machine is rewritten as holding it", () => {
  function startWhenAbove() {
    const ids = binFeederLine();
    const added = ok(addInterlock(ids.line));
    let line = ok(setSentenceField(added.line, added.id, "when", "setpoint", 0.49)).line;
    line = ok(setStepField(line, added.id, "then", 0, "machine", ids.feeder)).line;
    line = ok(setStepField(line, added.id, "then", 0, "action", "start")).line;
    return { ...ids, line, id: added.id };
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
    const levels = [];
    for (let i = 0; i < Math.round(900 / DT); i++) {
      stepSim(sim, DT);
      if (i % 20 === 0) levels.push(getMachineState(sim, s.bin));
    }
    const bin = getMachineState(sim, s.bin);
    // Held stopped while filling, then running: the bin rides at about 49 %.
    expect(bin.stored / bin.capacity).toBeGreaterThan(0.45);
    expect(bin.stored / bin.capacity).toBeLessThan(0.55);
    expect(getMachineState(sim, s.grainOut).total).toBeGreaterThan(0);
    expect(levels.length).toBeGreaterThan(0);
  });
});

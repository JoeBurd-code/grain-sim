// Build mode edits to interlock sentences (issue #92): add, change, delete
// an interlock, and add, remove or reorder its step blocks. This module
// never changes a line it is given: every function returns a new one, the
// same { ok: true, line } / { ok: false, error } shape as adjustableFields.js.
// A half-filled sentence is never refused here -- it is reported in the
// problems list by validateSentence (sentenceInterlock.js) instead. Where a
// choice would leave a blank invalid (a new machine that cannot be "above"),
// the blank moves to the first valid choice rather than stay broken.
import { RESETS, CONDITIONS } from "../sim/sentenceInterlock";
import { SWITCH_FIELDS } from "./interlocks";
import {
  conditionOptions, machineActionOptions, watchableMachines, holdAction, suggestedTarget, FLIPPED,
} from "./sentenceOptions";

const DEFAULT_SETPOINT = 0.85;

function refuse(error) {
  return { ok: false, error };
}
function okLine(line, extra) {
  return { ok: true, line, ...(extra ?? {}) };
}

function findRule(line, id) {
  return line.interlocks.find((r) => r.id === id);
}

function freshId(line) {
  const ids = new Set(line.interlocks.map((r) => r.id));
  let n = line.interlocks.length + 1;
  while (ids.has(`interlock-${n}`)) n += 1;
  return `interlock-${n}`;
}

function machineStep(line, machine) {
  return { action: holdAction(line, machine) ?? "stop", machine };
}

// A new interlock, already valid where the line allows: it watches the first
// machine with a level (or any it can watch) and stops the first machine
// that can be held.
export function addInterlock(line) {
  const watched = watchableMachines(line);
  const machine = (watched.find((m) => conditionOptions(line, m.id).includes("above")) ?? watched[0] ?? line.machines[0])?.id ?? "";
  const condition = conditionOptions(line, machine)[0] ?? "above";
  const when = { machine, condition, delaySec: 5 };
  if (CONDITIONS[condition]?.level) when.setpoint = DEFAULT_SETPOINT;
  const target = suggestedTarget(line, machine, condition);
  const rule = {
    id: freshId(line),
    kind: "sentence",
    when,
    then: target ? [machineStep(line, target)] : [],
    reset: "auto",
  };
  const next = structuredClone(line);
  next.interlocks = [...next.interlocks, rule];
  return okLine(next, { id: rule.id });
}

export function removeInterlock(line, id) {
  if (!findRule(line, id)) return refuse(`There is no interlock "${id}".`);
  const next = structuredClone(line);
  next.interlocks = next.interlocks.filter((r) => r.id !== id);
  return okLine(next);
}

function withRule(line, id, mutate) {
  if (!findRule(line, id)) return refuse(`There is no interlock "${id}".`);
  const next = structuredClone(line);
  mutate(findRule(next, id), next);
  return okLine(next);
}

// A level condition needs a set point; any other has none, and no switch.
function fitCondition(line, part, machine) {
  const options = conditionOptions(line, machine);
  if (!options.includes(part.condition)) part.condition = options[0] ?? part.condition;
  if (CONDITIONS[part.condition]?.level) {
    part.setpoint ??= DEFAULT_SETPOINT;
  } else {
    delete part.setpoint;
    delete part.switch;
  }
}

// A set point named by a level switch mirrors onto the machine's own
// display-only levelSwitches (issue #83) -- the canvas lamp and the Sim mode
// popup read that copy, so it tracks this edit as adjustableFields.js's
// holdersOf does.
function mirrorSwitch(next, rule, part) {
  if (!part.switch || !SWITCH_FIELDS[part.switch] || part.setpoint === undefined) return;
  const machine = next.machines.find((m) => m.id === rule.when.machine);
  if (machine?.sim?.levelSwitches) machine.sim.levelSwitches[part.switch] = part.setpoint;
}

// One field of the "when" or "whenClears" part: machine, condition,
// setpoint, switch or delaySec. `value: null` removes the field. Setting a
// field on "whenClears" creates that part the first time.
export function setSentenceField(line, id, part, field, value) {
  return withRule(line, id, (rule, next) => {
    if (part === "whenClears" && !rule.whenClears) rule.whenClears = { then: [] };
    const target = rule[part];
    if (value === null) delete target[field];
    else target[field] = value;
    if (field === "machine" || field === "condition") {
      fitCondition(next, target, rule.when.machine);
      // The clear part watches the same machine.
      if (part === "when" && rule.whenClears?.condition !== undefined) fitCondition(next, rule.whenClears, rule.when.machine);
    }
    mirrorSwitch(next, rule, target);
  });
}

// Gives the "when it clears" part a condition of its own (`on`), with the
// opposite level a little below the "when" set point, or takes it away so
// the clear steps run the moment the "when" condition stops holding.
export function setWhenClearsCondition(line, id, on) {
  return withRule(line, id, (rule, next) => {
    rule.whenClears ??= { then: [] };
    if (!on) {
      for (const key of ["condition", "setpoint", "switch", "delaySec"]) delete rule.whenClears[key];
      return;
    }
    const condition = FLIPPED[rule.when.condition] ?? rule.when.condition;
    Object.assign(rule.whenClears, { condition, delaySec: rule.when.delaySec ?? 0 });
    if (CONDITIONS[condition]?.level) {
      rule.whenClears.setpoint = Math.max(0, Math.min(1, (rule.when.setpoint ?? DEFAULT_SETPOINT) + (condition === "below" ? -0.2 : 0.2)));
    }
    fitCondition(next, rule.whenClears, rule.when.machine);
  });
}

// Adds the "when it clears" part, starting with the undo of every machine
// the "then" steps hold, which is what it is nearly always for.
export function addWhenClears(line, id) {
  return withRule(line, id, (rule) => {
    if (rule.whenClears) return;
    const undo = { stop: "start", close: "open" };
    rule.whenClears = {
      then: rule.then.filter((s) => undo[s.action]).map((s) => ({ ...s, action: undo[s.action] })),
    };
  });
}

export function removeWhenClears(line, id) {
  return withRule(line, id, (rule) => {
    delete rule.whenClears;
  });
}

export function setSentenceReset(line, id, reset) {
  if (!RESETS.includes(reset)) return refuse(`"${reset}" is not a reset.`);
  return withRule(line, id, (rule) => {
    rule.reset = reset;
  });
}

// `part` is "then" or "whenClearsThen" (created if needed).
function stepsOf(rule, part) {
  if (part === "then") return rule.then;
  rule.whenClears ??= { then: [] };
  return rule.whenClears.then;
}

// `kind` is "machine", "wait", "ifStillTrue" or "tripLine". A machine step
// starts on the first machine that can be held, held.
export function addStep(line, id, part, kind) {
  return withRule(line, id, (rule, next) => {
    let step;
    if (kind === "wait") step = { action: "wait", seconds: 5 };
    else if (kind === "ifStillTrue" || kind === "tripLine") step = { action: kind };
    else {
      step = machineStep(next, suggestedTarget(next, rule.when.machine, rule.when.condition) ?? "");
    }
    stepsOf(rule, part).push(step);
  });
}

export function removeStep(line, id, part, index) {
  return withRule(line, id, (rule) => {
    stepsOf(rule, part).splice(index, 1);
  });
}

// Moves the step at `fromIndex` to `toIndex`, the others shifting to make room.
export function moveStep(line, id, part, fromIndex, toIndex) {
  return withRule(line, id, (rule) => {
    const steps = stepsOf(rule, part);
    const [step] = steps.splice(fromIndex, 1);
    steps.splice(toIndex, 0, step);
  });
}

// One field of a step. A new machine keeps the step's action if it can take
// it, else moves to the machine's own hold action.
export function setStepField(line, id, part, index, field, value) {
  return withRule(line, id, (rule, next) => {
    const step = stepsOf(rule, part)[index];
    step[field] = value;
    if (field === "machine" && !machineActionOptions(next, value).includes(step.action)) {
      step.action = holdAction(next, value) ?? step.action;
    }
  });
}

export function setStepAction(line, id, part, index, action) {
  return setStepField(line, id, part, index, "action", action);
}

// Issue #92: "when the bin is above 49 %, start the feeder" can never work,
// since a sentence only holds machines stopped or closed. This rewrites it
// as what was meant: "when the bin is below 49 %, stop the feeder" -- the
// feeder then runs whenever the bin is above 49 %.
export function rewriteAsHold(line, id, index) {
  return withRule(line, id, (rule, next) => {
    const step = rule.then[index];
    const action = holdAction(next, step.machine);
    const flip = FLIPPED[rule.when.condition];
    if (!action || !flip) return;
    step.action = action;
    rule.when.condition = flip;
    if (rule.whenClears?.condition !== undefined) {
      rule.whenClears.condition = FLIPPED[rule.whenClears.condition] ?? rule.whenClears.condition;
    }
  });
}

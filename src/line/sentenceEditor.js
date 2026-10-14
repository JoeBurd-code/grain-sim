// Build mode edits to interlock sentences (issue #92): add, change, delete
// an interlock, and add, remove or reorder its step blocks. This module
// never changes a line it is given: every function returns a new one, the
// same { ok: true, line } / { ok: false, error } shape as adjustableFields.js.
// A half-filled sentence is never refused here -- it is reported in the
// problems list by validateSentence (sentenceInterlock.js) instead, same as
// a port left unconnected.
import { RESETS } from "../sim/sentenceInterlock";
import { SWITCH_FIELDS } from "./interlocks";

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

// A blank interlock, incomplete enough to need filling in: it shows up at
// once in the problems list until the user picks real values.
export function addInterlock(line) {
  const machine = line.machines[0]?.id ?? "";
  const rule = {
    id: freshId(line),
    kind: "sentence",
    when: { machine, condition: "above", setpoint: 0.85, delaySec: 5 },
    then: [{ action: "stop", machine }],
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

// One field of the "when" or "whenClears" part: machine, condition,
// setpoint, switch or delaySec. `value: null` removes the field (clearing a
// level switch name, for example). Setting a field on "whenClears" creates
// that part, with no steps of its own yet, the first time.
export function setSentenceField(line, id, part, field, value) {
  return withRule(line, id, (rule, next) => {
    if (part === "whenClears" && !rule.whenClears) rule.whenClears = { then: [] };
    const target = rule[part];
    if (value === null) delete target[field];
    else target[field] = value;
    // A set point named by a level switch mirrors onto the machine's own
    // display-only levelSwitches (issue #83) -- the canvas lamp and the Sim
    // mode popup read that copy, not the sentence, so it must track this
    // edit the same way adjustableFields.js's holdersOf does.
    if (field === "setpoint" && target.switch && SWITCH_FIELDS[target.switch]) {
      const machine = next.machines.find((m) => m.id === rule.when.machine);
      if (machine?.sim?.levelSwitches) machine.sim.levelSwitches[target.switch] = value;
    }
  });
}

// Adds the "when it clears" part with no condition of its own (issue #84):
// its steps run the tick the "when" condition stops holding.
export function addWhenClears(line, id) {
  return withRule(line, id, (rule) => {
    rule.whenClears ??= { then: [] };
  });
}

// Removes the "when it clears" part entirely, back to the plain auto/latched
// release of the "then" steps.
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

// `part` is "then" (the sentence's own steps) or "whenClearsThen" (the
// "when it clears" part's steps, created if needed).
function stepsOf(rule, part) {
  if (part === "then") return rule.then;
  rule.whenClears ??= { then: [] };
  return rule.whenClears.then;
}

function blankStep(action, firstMachine) {
  if (action === "wait") return { action, seconds: 5 };
  if (action === "ifStillTrue" || action === "tripLine") return { action };
  return { action, machine: firstMachine };
}

export function addStep(line, id, part, action) {
  return withRule(line, id, (rule) => {
    stepsOf(rule, part).push(blankStep(action, line.machines[0]?.id ?? ""));
  });
}

export function removeStep(line, id, part, index) {
  return withRule(line, id, (rule) => {
    stepsOf(rule, part).splice(index, 1);
  });
}

// Moves the step at `fromIndex` to `toIndex`, the other steps shifting to
// make room -- a drag-to-reorder.
export function moveStep(line, id, part, fromIndex, toIndex) {
  return withRule(line, id, (rule) => {
    const steps = stepsOf(rule, part);
    const [step] = steps.splice(fromIndex, 1);
    steps.splice(toIndex, 0, step);
  });
}

export function setStepField(line, id, part, index, field, value) {
  return withRule(line, id, (rule) => {
    stepsOf(rule, part)[index][field] = value;
  });
}

// Changes a step's action in place, keeping its ramp time (the only field
// the machine-commanding actions share) and dropping fields that make no
// sense for the new action (a wait's seconds, say).
export function setStepAction(line, id, part, index, action) {
  return withRule(line, id, (rule) => {
    const steps = stepsOf(rule, part);
    const old = steps[index];
    const next = blankStep(action, old.machine ?? line.machines[0]?.id ?? "");
    if (old.rampTimeSec !== undefined && next.machine !== undefined) next.rampTimeSec = old.rampTimeSec;
    steps[index] = next;
  });
}

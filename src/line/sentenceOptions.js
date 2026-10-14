// Issue #92: what each blank of a sentence may offer, so the Interlocks
// window only ever shows a choice that validateSentence would accept, and the
// plain-words reading of a sentence and its problems.
import { BEHAVIORS } from "../sim/behaviors";
import { CONDITIONS, ACTIONS, validateSentence } from "../sim/sentenceInterlock";
import { SWITCH_FIELDS } from "./interlocks";

export { CONDITIONS, ACTIONS };

function machineOf(line, id) {
  return line.machines.find((m) => m.id === id);
}
function behaviorOf(line, id) {
  return BEHAVIORS[machineOf(line, id)?.sim?.kind];
}
export function machineName(line, id) {
  return machineOf(line, id)?.name ?? "…";
}

// Every condition this machine's behaviour supports, in CONDITIONS's order.
export function conditionOptions(line, machineId) {
  const behavior = behaviorOf(line, machineId);
  return Object.keys(CONDITIONS).filter((key) => CONDITIONS[key].supports(behavior));
}

// Every action this machine's behaviour can take, in ACTIONS's order.
export function machineActionOptions(line, machineId) {
  const behavior = behaviorOf(line, machineId);
  return Object.keys(ACTIONS).filter((key) => Boolean(behavior?.[ACTIONS[key].verb]));
}

// The machines a sentence can watch, and the ones a step can act on.
export function watchableMachines(line) {
  return line.machines.filter((m) => conditionOptions(line, m.id).length > 0);
}
export function actionableMachines(line) {
  return line.machines.filter((m) => machineActionOptions(line, m.id).length > 0);
}

// The level switches drawn on this machine (its `instruments`), which a
// level condition can name so the lamp and popup slider follow it.
export function switchOptions(line, machineId) {
  const instruments = machineOf(line, machineId)?.instruments ?? [];
  return Object.keys(SWITCH_FIELDS).filter((code) => instruments.includes(code));
}

// The hold action for a machine: what a sentence actually does to it.
export function holdAction(line, machineId) {
  const options = machineActionOptions(line, machineId);
  return options.includes("stop") ? "stop" : options.includes("close") ? "close" : null;
}

const pct = (f) => (f == null ? "… %" : `${Math.round(f * 100)} %`);
const secs = (s) => (s == null ? "… s" : `${s} s`);

// The condition in words, without the machine: "above 85 %", "stopped".
export function conditionText(part) {
  if (!CONDITIONS[part.condition]) return "…";
  return CONDITIONS[part.condition].level ? `${part.condition} ${pct(part.setpoint)}` : part.condition;
}

function stepText(line, step) {
  if (step.action === "wait") return { text: `wait ${secs(step.seconds)}` };
  if (step.action === "ifStillTrue") return { text: "if still true" };
  if (step.action === "tripLine") return { text: "trip the whole line" };
  if (step.action === "alarm") return { text: "raise an alarm" };
  return { text: `${step.action ?? "…"} `, machine: step.machine };
}

// The sentence as segments, for its one-line summary: plain text, or a
// machine name to set off. "When BIN is above 85 % for 5 s, stop FEEDER."
export function sentenceSummary(line, rule) {
  const segs = [{ text: "When " }, { machine: rule.when.machine }, { text: ` is ${conditionText(rule.when)} for ${secs(rule.when.delaySec)}, ` }];
  const steps = (list) => list.forEach((step, i) => {
    if (i > 0) segs.push({ text: i === list.length - 1 ? " then " : ", " });
    const s = stepText(line, step);
    segs.push({ text: s.text });
    if (s.machine) segs.push({ machine: s.machine });
  });
  if (rule.then.length === 0) segs.push({ text: "…" });
  steps(rule.then);
  segs.push({ text: "." });
  if (rule.whenClears) {
    const own = rule.whenClears.condition !== undefined;
    segs.push({ text: own ? ` When ${conditionText(rule.whenClears)} for ${secs(rule.whenClears.delaySec)}, ` : " When it clears, " });
    steps(rule.whenClears.then);
    segs.push({ text: "." });
  }
  return segs;
}

// validateSentence's problems for one sentence, with machine names in place
// of ids and without the interlock id prefix the problems list needs.
export function sentenceProblems(line, rule) {
  const byId = new Map(line.machines.map((m) => [m.id, m]));
  const prefix = `interlock "${rule.id}": `;
  return validateSentence(rule, byId).map((message) => message
    .replace(prefix, "")
    .replace(/machine "([^"]*)"/g, (_, id) => machineName(line, id)));
}

// The first "then" step that tries to run a machine (start or open) with
// nothing in the sentence to undo -- the commonest mistake, since a sentence
// can only hold a machine stopped or closed. Null when there is none, or
// when the machine has no way to be held either.
export function runStepHint(line, rule) {
  const held = new Set();
  for (let i = 0; i < rule.then.length; i += 1) {
    const step = rule.then[i];
    if (step.action === "stop" || step.action === "close") held.add(step.machine);
    if ((step.action === "start" || step.action === "open") && !held.has(step.machine)) {
      const action = holdAction(line, step.machine);
      const flip = FLIPPED[rule.when.condition];
      return action && flip ? { index: i, machine: step.machine, action, condition: flip } : null;
    }
  }
  return null;
}

export const FLIPPED = { above: "below", below: "above", running: "stopped", stopped: "running" };

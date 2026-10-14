// Issue #92: what each blank of a sentence may offer, so the Interlocks
// window's dropdowns only ever show a choice that validateSentence would
// accept. Pure functions of the line, reusable by both the window and its
// tests.
import { BEHAVIORS } from "../sim/behaviors";
import { CONDITIONS, ACTIONS } from "../sim/sentenceInterlock";
import { SWITCH_FIELDS } from "./interlocks";

export function machineOptions(line) {
  return line.machines.map((m) => ({ id: m.id, name: m.name }));
}

function behaviorOf(line, machineId) {
  return BEHAVIORS[line.machines.find((m) => m.id === machineId)?.sim?.kind];
}

// Every condition this machine's behaviour supports, in CONDITIONS's own order.
export function conditionOptions(line, machineId) {
  const behavior = behaviorOf(line, machineId);
  return Object.keys(CONDITIONS).filter((key) => CONDITIONS[key].supports(behavior));
}

// Every action this machine's behaviour can take, in ACTIONS's own order.
export function machineActionOptions(line, machineId) {
  const behavior = behaviorOf(line, machineId);
  return Object.keys(ACTIONS).filter((key) => Boolean(behavior?.[ACTIONS[key].verb]));
}

// The step types a new step block can start as: every action a machine on
// this line can take, plus the flow steps -- "if still true" and "trip the
// whole line" only make sense after "then".
export function stepTypeOptions(line, after) {
  const machineActions = line.machines.some((m) => machineActionOptions(line, m.id).length > 0)
    ? Object.keys(ACTIONS)
    : [];
  const flow = after === "then" ? ["wait", "ifStillTrue", "tripLine"] : ["wait"];
  return [...machineActions, ...flow];
}

export const LEVEL_SWITCHES = Object.keys(SWITCH_FIELDS);

export { CONDITIONS, ACTIONS } from "../sim/sentenceInterlock";

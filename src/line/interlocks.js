// Read an interlock in a line document without knowing its shape. A coded
// rule kind names its sensor as `sensor.machine`; an interlock sentence
// (issue #82, sim/sentenceInterlock.js) names it as `when.machine`. Both
// shapes live on one line until every golden line interlock is converted.

export function isSentence(rule) {
  return rule.kind === "sentence";
}

// The machine the interlock watches.
export function interlockSensorMachine(rule) {
  return isSentence(rule) ? rule.when?.machine : rule.sensor?.machine;
}

// Every machine the interlock commands.
export function interlockCommandedMachines(rule) {
  if (isSentence(rule)) {
    return [...(rule.then ?? []), ...(rule.whenClears?.then ?? [])].map((step) => step?.machine);
  }
  const { action } = rule;
  if (!action) return [];
  if (rule.kind === "gradedFeedSchedule") {
    const feeders = Array.isArray(action.feeder) ? action.feeder : [action.feeder];
    return [action.elevator, ...feeders].map((t) => t?.machine);
  }
  if (rule.kind === "stagedPauseRestart") {
    return [action.treater, action.valve, action.conveyor].map((t) => t?.machine);
  }
  return [action.machine];
}

// Issue #83: a level condition can name the level switch that reads it, so
// the switch's lamp and its popup set point slider follow the sentence. The
// field is the name the coded rule kinds give that switch's set point, which
// the popup sliders and Build mode fields still address.
export const SWITCH_FIELDS = { LSL: "lowSetpoint", LSH: "highSetpoint", LSHH: "highHighSetpoint" };

// The sentence parts that can carry a level switch.
export function sentenceParts(rule) {
  return [rule.when, rule.whenClears].filter(Boolean);
}

// The value of a coded rule's field, or the same value on a sentence: a set
// point field is the set point of the part whose switch it names, and
// `signalDelaySec` is the delay of the "when" part.
export function interlockValue(rule, field) {
  if (!isSentence(rule)) return rule[field];
  if (field === "signalDelaySec") return rule.when?.delaySec;
  return sentenceParts(rule).find((part) => SWITCH_FIELDS[part.switch] === field)?.setpoint;
}

// Writes `interlockValue`'s field in place. A sentence's signal delay is the
// delay of both of its parts, as it is for the live slider (engine.js
// setInterlockSignalDelay).
export function putInterlockValue(rule, field, value) {
  if (!isSentence(rule)) {
    rule[field] = value;
  } else if (field === "signalDelaySec") {
    for (const part of sentenceParts(rule)) part.delaySec = value;
  } else {
    for (const part of sentenceParts(rule)) if (SWITCH_FIELDS[part.switch] === field) part.setpoint = value;
  }
}

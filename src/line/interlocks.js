// Read the rules in a line document without knowing their shape. Every
// interlock is a sentence (sim/sentenceInterlock.js, ADR 0009), which names
// its sensor as `when.machine`. A machine rule (`line.machineRules`, issue
// #85: the graded feed schedules and "hold the next batch") names it as
// `sensor.machine` and keeps its set points as fields.

export function isSentence(rule) {
  return rule.kind === "sentence";
}

// Every rule on the line: the interlocks, then the machine rules.
export function lineRules(line) {
  return [...(line.interlocks ?? []), ...(line.machineRules ?? [])];
}

// The machine the rule watches.
export function interlockSensorMachine(rule) {
  return isSentence(rule) ? rule.when?.machine : rule.sensor?.machine;
}

// Every machine the rule commands.
export function interlockCommandedMachines(rule) {
  if (isSentence(rule)) {
    // A wait, an "if still true" or a line trip names no machine.
    return [...(rule.then ?? []), ...(rule.whenClears?.then ?? [])]
      .filter((step) => step?.machine !== undefined).map((step) => step.machine);
  }
  const { action } = rule;
  if (!action) return [];
  if (rule.kind === "gradedFeedSchedule") {
    const feeders = Array.isArray(action.feeder) ? action.feeder : [action.feeder];
    return [action.elevator, ...feeders].map((t) => t?.machine);
  }
  return [action.machine];
}

// Issue #83: a level condition can name the level switch that reads it, so
// the switch's lamp and its popup set point slider follow the sentence. The
// field is the name a machine rule gives that switch's set point, which the
// popup sliders and Build mode fields still address.
export const SWITCH_FIELDS = { LSL: "lowSetpoint", LSH: "highSetpoint", LSHH: "highHighSetpoint" };

// The sentence parts that can carry a level switch.
export function sentenceParts(rule) {
  return [rule.when, rule.whenClears].filter(Boolean);
}

// The level switches the rule reads, by code.
export function ruleSwitches(rule) {
  if (isSentence(rule)) return sentenceParts(rule).map((part) => part.switch).filter((code) => SWITCH_FIELDS[code]);
  return Object.keys(SWITCH_FIELDS).filter((code) => rule[SWITCH_FIELDS[code]] != null);
}

// The value of a machine rule's field, or the same value on a sentence: a
// set point field is the set point of the part whose switch it names, and
// `signalDelaySec` is the delay of the "when" part.
export function interlockValue(rule, field) {
  if (!isSentence(rule)) return rule[field];
  if (field === "signalDelaySec") return rule.when?.delaySec;
  return sentenceParts(rule).find((part) => SWITCH_FIELDS[part.switch] === field)?.setpoint;
}

// Writes `interlockValue`'s field in place. A sentence's signal delay is the
// delay of both of its parts.
export function putInterlockValue(rule, field, value) {
  if (!isSentence(rule)) {
    rule[field] = value;
  } else if (field === "signalDelaySec") {
    for (const part of sentenceParts(rule)) part.delaySec = value;
  } else {
    for (const part of sentenceParts(rule)) if (SWITCH_FIELDS[part.switch] === field) part.setpoint = value;
  }
}

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
  if (isSentence(rule)) return (rule.then ?? []).map((step) => step?.machine);
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

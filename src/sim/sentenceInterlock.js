// Interlock sentences (issue #80, first built in #82): one interlock shape
// that a user can read and fill in, beside the coded rule kinds in
// control.js until every golden line interlock has been converted (#83,
// #84) and the coded kinds are deleted (#85).
//
//   When <machine> is <condition> for <delaySec> s,
//   then <steps, in order>.
//   When it clears (optional): when <machine> is <condition> for <delaySec> s,
//   then <steps, in order>.
//   Reset: <auto | latched>.
//
// In the line document:
//
//   {
//     id, kind: "sentence",
//     when: { machine, condition, setpoint, switch, delaySec },
//     then: [{ action, machine, rampTimeSec }, ...],
//     whenClears: { condition, setpoint, switch, delaySec, then: [...] },  // optional
//     reset: "auto" | "latched",
//     armedWhen: [{ machine, port }],  // optional, the same arming every rule has
//   }
//
// `setpoint` (a fraction) is only on the level conditions. `switch` (LSL,
// LSH or LSHH) is optional: it names the level switch that reads the
// condition, so that switch's lamp and popup slider follow this sentence.
// `rampTimeSec` is optional and defaults to 0.
//
// Issue #83 chose "when it clears" with its own condition for an auto reset
// interlock with a high and a low set point (the buffer bin's valve). It
// reads as one rule, and it is the only form that holds the valve shut
// between the two set points: a pair of sentences would each own a command
// slot, and the "close" sentence would let go at the high set point.
//
// Reset:
// - auto with no "when it clears": the steps are let go the tick the "when"
//   condition no longer holds.
// - auto with "when it clears": nothing is let go by itself. Once the clear
//   condition has held for its delay, its steps run, and they command
//   through this sentence's own slot, so "open" undoes "close".
// - latched: held until RESET TRIPS, which acts only once the stopped
//   machines have settled and the "when" condition no longer holds. Then the
//   "when it clears" steps run, or with none, the steps are let go.
//
// Only the parts the converted interlocks use are built so far. CONDITIONS
// and ACTIONS below are the vocabulary; each later conversion adds its own
// entries. A sentence that uses a part not built yet is refused at import
// (validateSentence), never silently ignored at run time.
//
// Each sentence commands through its own command slot (commandSlots.js),
// keyed by its id, so the most restrictive command on a machine still wins
// and releasing one sentence's stop never releases another authority's.
import { BEHAVIORS } from "./behaviors";
import { SWITCH_FIELDS } from "../line/interlocks";

const pct = (fraction) => `${(fraction * 100).toFixed(0)}%`;

// What a sentence can watch. `holds` is the condition's meaning; `fires` and
// `clears` are its event log wording. A `level` condition compares the
// machine's fill against the part's set point.
export const CONDITIONS = {
  stopped: {
    supports: (behavior) => Boolean(behavior?.confirmedRunning),
    holds: (state, behavior) => !behavior.confirmedRunning(state),
    fires: () => "not running",
    clears: () => "running again",
  },
  running: {
    supports: (behavior) => Boolean(behavior?.confirmedRunning),
    holds: (state, behavior) => behavior.confirmedRunning(state),
    fires: () => "running",
    clears: () => "no longer running",
  },
  above: {
    level: true,
    supports: (behavior) => Boolean(behavior?.level),
    holds: (state, behavior, setpoint) => behavior.level(state) >= setpoint,
    fires: (setpoint) => `above ${pct(setpoint)}`,
    clears: (setpoint) => `below ${pct(setpoint)} again`,
  },
  below: {
    level: true,
    supports: (behavior) => Boolean(behavior?.level),
    holds: (state, behavior, setpoint) => behavior.level(state) <= setpoint,
    fires: (setpoint) => `below ${pct(setpoint)}`,
    clears: (setpoint) => `above ${pct(setpoint)} again`,
  },
};

// What a sentence can do to a machine. `verb` is the behaviour's sentence
// verb (behaviors.js) and `value` what this action asks of it; letting a
// step go writes the verb's neutral value (false) to this sentence's slot,
// which can never override any other authority.
export const ACTIONS = {
  stop: { verb: "stop", value: true, done: "stopped" },
  close: { verb: "close", value: true, done: "closed" },
  open: { verb: "close", value: false, done: "opened" },
};

export const RESETS = ["auto", "latched"];

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const quoted = (list) => list.map((v) => `"${v}"`).join(", ");

// Every problem with one sentence, as messages for the user. `machinesById`
// maps a machine id to its line document entry. Never throws.
export function validateSentence(rule, machinesById) {
  const errors = [];
  const say = (text) => errors.push(`interlock "${rule.id}": ${text}`);
  const behaviorOf = (id) => BEHAVIORS[machinesById.get(id)?.sim?.kind];

  // One condition on `machine`, the "when" part's own or the clear part's.
  const checkCondition = (part, machine, delayText) => {
    const condition = CONDITIONS[part.condition];
    if (!machinesById.has(machine)) {
      say(`watches unknown machine "${machine}"`);
    } else if (!condition) {
      say(`has unknown condition "${part.condition}" (expected one of ${quoted(Object.keys(CONDITIONS))})`);
    } else if (!condition.supports(behaviorOf(machine))) {
      say(`machine "${machine}" cannot be "${part.condition}"`);
    }
    if (condition?.level && !(isFiniteNumber(part.setpoint) && part.setpoint >= 0 && part.setpoint <= 1)) {
      say(`"${part.condition}" needs a set point from 0 to 100 %`);
    }
    if (part.switch !== undefined && !SWITCH_FIELDS[part.switch]) {
      say(`names level switch "${part.switch}" (expected one of ${quoted(Object.keys(SWITCH_FIELDS))})`);
    }
    if (!isFiniteNumber(part.delaySec) || part.delaySec < 0) {
      say(`needs a ${delayText} of zero or more seconds`);
    }
  };

  const checkSteps = (steps, after) => {
    if (!Array.isArray(steps) || steps.length === 0) {
      say(`needs at least one step after "${after}"`);
      return;
    }
    steps.forEach((step, i) => {
      const where = `step ${i + 1}`;
      if (!isPlainObject(step)) {
        say(`${where} is not a step`);
        return;
      }
      const action = ACTIONS[step.action];
      if (!action) {
        say(`${where} has unknown action "${step.action}" (expected one of ${quoted(Object.keys(ACTIONS))})`);
      } else if (!machinesById.has(step.machine)) {
        say(`${where} commands unknown machine "${step.machine}"`);
      } else if (!behaviorOf(step.machine)?.[action.verb]) {
        say(`${where} cannot ${step.action} machine "${step.machine}"`);
      }
      if (step.rampTimeSec !== undefined && !(isFiniteNumber(step.rampTimeSec) && step.rampTimeSec >= 0)) {
        say(`${where} needs a ramp time of zero or more seconds`);
      }
    });
  };

  const { when } = rule;
  if (!isPlainObject(when)) {
    say("is missing its \"when\" part");
  } else {
    checkCondition(when, when.machine, "signal delay");
  }
  checkSteps(rule.then, "then");

  if (rule.whenClears !== undefined) {
    if (!isPlainObject(rule.whenClears)) {
      say("has a \"when it clears\" part that is not a part");
    } else {
      checkCondition(rule.whenClears, when?.machine, "clear delay");
      checkSteps(rule.whenClears.then, "when it clears");
    }
  }
  const switches = [when, rule.whenClears].filter(isPlainObject).map((part) => part.switch).filter(Boolean);
  if (new Set(switches).size < switches.length) {
    say("names the same level switch twice");
  }

  if (!RESETS.includes(rule.reset)) {
    say(`has reset "${rule.reset}" (expected one of ${quoted(RESETS)})`);
  }

  if (rule.armedWhen !== undefined) {
    if (!Array.isArray(rule.armedWhen)) {
      say("has an arming list that is not a list");
    } else {
      for (const { machine, port } of rule.armedWhen) {
        const m = machinesById.get(machine);
        if (!m) say(`is armed on unknown machine "${machine}"`);
        else if (!behaviorOf(machine)?.selectPort || !m.ports.outputs.includes(port)) {
          say(`is armed on machine "${machine}", which cannot select port "${port}"`);
        }
      }
    }
  }
  return errors;
}

function machineName(sim, id) {
  return sim.line?.machines?.find((m) => m.id === id)?.name ?? id;
}

function logEvent(rule, t, message) {
  rule.log.push({ t, message });
}

// The runtime form of one condition. A level condition's set point lives on
// the rule under `setpointKey`, the field the popup slider for its switch
// writes (engine.js setInterlockField), so a slider moves it mid run.
function initPart(rule, part, unnamedKey) {
  const runtime = { condition: part.condition, setpointKey: null };
  if (CONDITIONS[part.condition].level) {
    runtime.setpointKey = SWITCH_FIELDS[part.switch] ?? unnamedKey;
    rule[runtime.setpointKey] = part.setpoint;
    if (part.switch) rule.instrumentFields[part.switch] = runtime.setpointKey;
  }
  return runtime;
}

function setpointOf(rule, part) {
  return part.setpointKey ? rule[part.setpointKey] : undefined;
}

function holds(rule, part, sim) {
  const state = sim.machines.get(rule.sensorId);
  return CONDITIONS[part.condition].holds(state, BEHAVIORS[state.kind], setpointOf(rule, part));
}

function describe(rule, part, word) {
  return CONDITIONS[part.condition][word](setpointOf(rule, part));
}

// Commands each step's machine through this sentence's own slot: `value`
// true is the action, false lets it go.
function runSteps(rule, sim, steps, value, logText) {
  for (const step of steps) {
    const state = sim.machines.get(step.machine);
    const action = ACTIONS[step.action];
    BEHAVIORS[state.kind][action.verb](state, value ? action.value : false, step.rampTimeSec ?? 0, rule.id);
    logEvent(rule, sim.t, logText(step, action));
  }
}

function allSettled(rule, sim) {
  return rule.then.every((step) => {
    const state = sim.machines.get(step.machine);
    return BEHAVIORS[state.kind].isSettled?.(state) ?? true;
  });
}

// The way out of "active": the clear steps if there are any, else every
// "then" step let go.
function release(rule, sim, reason) {
  if (rule.whenClears) {
    runSteps(rule, sim, rule.whenClears.then, true, (step, action) => `${reason}, ${machineName(sim, step.machine)} ${action.done}`);
  } else {
    runSteps(rule, sim, rule.then, false, (step) => `${reason}, ${machineName(sim, step.machine)} released`);
  }
  rule.phase = "clear";
  rule.settled = false;
}

// clear -> [condition holds] -> arming -> [delay elapses, run the steps]
// -> active -> [reset] -> clear
// For an auto sentence with a "when it clears" part, active ->
// [clear condition holds] -> clearing -> [clear delay elapses, run the clear
// steps] -> clear. An arming sentence whose condition clears before the
// delay has commanded nothing yet, so it cancels silently; so does a
// clearing one.
function initSentence(cfg) {
  const rule = {
    kind: "sentence",
    id: cfg.id,
    sensorId: cfg.when.machine,
    // Level switches this sentence publishes (control.js instrumentReadings),
    // by code, to the field holding each one's set point.
    instrumentFields: {},
    // Named as every coded rule names it, so the live signal delay control
    // (engine.js setInterlockSignalDelay) reaches a sentence too.
    signalDelaySec: cfg.when.delaySec,
    then: cfg.then.map((step) => ({ ...step })),
    whenClears: null,
    reset: cfg.reset,
    phase: "clear",
    fireAt: null,
    clearAt: null,
    // Whether every stopped or closed machine has reached its target since
    // the steps ran. A latched sentence counts as latched only from then on,
    // as each coded trip kind's own latched phase is entered only once its
    // actuator settles.
    settled: false,
    log: [],
  };
  rule.when = initPart(rule, cfg.when, "whenSetpoint");
  if (cfg.whenClears) {
    rule.whenClears = { ...initPart(rule, cfg.whenClears, "clearSetpoint"), then: cfg.whenClears.then.map((step) => ({ ...step })) };
    // Moved by the same live signal delay control.
    rule.clearDelaySec = cfg.whenClears.delaySec;
  }
  // A latched sentence's switch is its trip: its lamp is red (ADR 0007).
  rule.alarmCode = cfg.reset === "latched" ? (cfg.when.switch ?? null) : null;
  if (Object.keys(rule.instrumentFields).length === 0) rule.instrumentFields = null;
  return rule;
}

function stepSentence(rule, sim) {
  // Before this tick's steps can run, so a machine commanded this tick is
  // judged settled on the next, the same order as the coded trip kinds.
  if (rule.phase !== "clear" && rule.phase !== "arming" && !rule.settled) {
    rule.settled = allSettled(rule, sim);
  }
  const whenHolds = holds(rule, rule.when, sim);

  if (rule.phase === "clear" && whenHolds) {
    rule.phase = "arming";
    rule.fireAt = sim.t + rule.signalDelaySec;
  }
  if (rule.phase === "arming") {
    if (!whenHolds) {
      rule.phase = "clear";
      rule.fireAt = null;
      return;
    }
    if (sim.t >= rule.fireAt) {
      const fires = `${describe(rule, rule.when, "fires")} for ${rule.signalDelaySec}s`;
      runSteps(rule, sim, rule.then, true, (step, action) => `${fires}, ${machineName(sim, step.machine)} ${action.done}`);
      rule.phase = "active";
      rule.fireAt = null;
    }
    return;
  }
  if (rule.reset !== "auto") return; // latched: only RESET TRIPS moves it now

  if (!rule.whenClears) {
    if (rule.phase === "active" && !whenHolds) release(rule, sim, describe(rule, rule.when, "clears"));
    return;
  }
  const clearHolds = holds(rule, rule.whenClears, sim);
  if (rule.phase === "active" && clearHolds) {
    rule.phase = "clearing";
    rule.clearAt = sim.t + rule.clearDelaySec;
  }
  if (rule.phase === "clearing") {
    if (!clearHolds) {
      rule.phase = "active";
      rule.clearAt = null;
    } else if (sim.t >= rule.clearAt) {
      rule.clearAt = null;
      release(rule, sim, `${describe(rule, rule.whenClears, "fires")} for ${rule.clearDelaySec}s`);
    }
  }
}

function isLatched(rule) {
  return rule.reset === "latched" && rule.phase === "active" && rule.settled;
}

// RESET TRIPS. A latched sentence whose machines are still moving is a
// command in flight and is not touched. One whose condition still holds
// stays latched, so a reset pressed while the bin is still full does not
// flap the machine on and straight back off.
function resetSentence(rule, sim) {
  if (!isLatched(rule)) return;
  if (holds(rule, rule.when, sim)) {
    logEvent(rule, sim.t, `reset commanded, still ${describe(rule, rule.when, "fires")}, remains latched`);
    return;
  }
  release(rule, sim, "reset");
}

// A disarmed sentence cancels a pending delay, the same as the coded kinds
// (see control.js disarmThresholdStopTrip): a stale `fireAt` would otherwise
// fire on the first tick after the sentence is armed again.
function disarmSentence(rule) {
  if (rule.phase === "arming") {
    rule.phase = "clear";
    rule.fireAt = null;
  } else if (rule.phase === "clearing") {
    rule.phase = "active";
    rule.clearAt = null;
  }
}

export const SENTENCE_KIND = {
  init: initSentence, step: stepSentence, reset: resetSentence, disarm: disarmSentence, latched: isLatched,
};

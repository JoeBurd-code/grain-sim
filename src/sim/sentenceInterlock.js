// Interlock sentences (issue #80, first built in #82): one interlock shape
// that a user can read and fill in, beside the coded rule kinds in
// control.js until every golden line interlock has been converted (#83,
// #84) and the coded kinds are deleted (#85).
//
//   When <machine> is <condition> for <delaySec> s,
//   then <steps, in order>.
//   When it clears (optional): [when <machine> is <condition> for <delaySec> s,]
//   then <steps, in order>.
//   Reset: <auto | latched>.
//
// In the line document:
//
//   {
//     id, kind: "sentence",
//     when: { machine, condition, setpoint, switch, delaySec },
//     then: [step, ...],
//     whenClears: { condition, setpoint, switch, delaySec, then: [step, ...] },  // optional
//     reset: "auto" | "latched",
//     armedWhen: [{ machine, port }],  // optional, the same arming every rule has
//   }
//
// A step is one of:
//   { action: "stop" | "start" | "close" | "open", machine, rampTimeSec }
//   { action: "wait", seconds }
//   { action: "ifStillTrue" }  // "then" only: ends the steps if "when" no longer holds
//   { action: "tripLine" }     // "then" only: trips the whole line
//
// `setpoint` (a fraction) is only on the level conditions. `switch` (LSL,
// LSH or LSHH) is optional: it names the level switch that reads the
// condition, so that switch's lamp and popup slider follow this sentence.
// `rampTimeSec` is optional and defaults to 0.
//
// The "when it clears" part's condition is optional (issue #84). With one,
// the part clears once that condition has held for its delay: issue #83
// chose this form for an auto reset interlock with a high and a low set
// point (the buffer bin's valve). It reads as one rule, and it is the only
// form that holds the valve shut between the two set points: a pair of
// sentences would each own a command slot, and the "close" sentence would
// let go at the high set point. With none, the part clears the tick the
// "when" condition stops holding (the Concetti pre-bin's ordered restart).
//
// Steps run top to bottom. A wait holds the steps after it, so a sequence
// can run for many ticks. A new sequence replaces the one running: when the
// "when" condition fires again part way through the "when it clears" steps,
// those steps stop and the "then" steps run again from the top, and the
// other way round.
//
// Reset:
// - auto with no "when it clears": the steps are let go the tick the "when"
//   condition no longer holds.
// - auto with "when it clears": nothing is let go by itself. Once the part
//   clears, its steps run, and they command through this sentence's own
//   slot, so "open" undoes "close".
// - latched: held until RESET TRIPS, which acts only once the stopped
//   machines have settled and the "when" condition no longer holds. Then the
//   "when it clears" steps run, or with none, the steps are let go.
// - A sentence that has tripped the whole line is held until RESET TRIPS
//   too, whatever its reset, because a line trip needs an operator. The same
//   reset releases it, from the moment of the press.
//
// CONDITIONS, ACTIONS and the flow steps below are the vocabulary; each
// conversion adds the entries it needs. A sentence that uses a part not
// built yet is refused at import (validateSentence), never silently ignored
// at run time.
//
// Each sentence commands through its own command slot (commandSlots.js),
// keyed by its id, so the most restrictive command on a machine still wins
// and releasing one sentence's stop never releases another authority's.
import { BEHAVIORS } from "./behaviors";
import { tripLineFromInterlock } from "./utilitiesTrip";
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
// which can never override any other authority. So "start" and "open" are
// the same write as letting a "stop" or a "close" go.
export const ACTIONS = {
  stop: { verb: "stop", value: true, done: "stopped" },
  start: { verb: "stop", value: false, done: "started" },
  close: { verb: "close", value: true, done: "closed" },
  open: { verb: "close", value: false, done: "opened" },
};

// Steps that command no machine. `thenOnly` steps read or act on the "when"
// condition firing, so they have no meaning after it clears.
const FLOW_STEPS = {
  wait: { name: "wait" },
  ifStillTrue: { name: "if still true", thenOnly: true },
  tripLine: { name: "trip the whole line", thenOnly: true },
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
      const flow = FLOW_STEPS[step.action];
      if (flow) {
        if (flow.thenOnly && after !== "then") say(`${where} can be "${flow.name}" only after "then"`);
        if (step.action === "wait" && !(isFiniteNumber(step.seconds) && step.seconds >= 0)) {
          say(`${where} needs a wait of zero or more seconds`);
        }
        return;
      }
      const action = ACTIONS[step.action];
      if (!action) {
        const expected = [...Object.keys(ACTIONS), ...Object.keys(FLOW_STEPS)];
        say(`${where} has unknown action "${step.action}" (expected one of ${quoted(expected)})`);
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
      if (rule.whenClears.condition !== undefined) checkCondition(rule.whenClears, when?.machine, "clear delay");
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

// Commands one machine step through this sentence's own slot: `value` true
// is the action, false lets it go.
function command(rule, sim, step, value) {
  const state = sim.machines.get(step.machine);
  const action = ACTIONS[step.action];
  BEHAVIORS[state.kind][action.verb](state, value ? action.value : false, step.rampTimeSec ?? 0, rule.id);
}

const commandSteps = (steps) => steps.filter((step) => ACTIONS[step.action]);

// Every machine step let go at once, with no sequence: an auto sentence
// with no "when it clears" part clearing, a latched one reset, or any auto
// sentence disarmed. A machine named by several steps is let go once.
function letGo(rule, sim, steps, reason) {
  const done = new Set();
  for (const step of commandSteps(steps)) {
    const key = `${step.machine} ${ACTIONS[step.action].verb}`;
    if (done.has(key)) continue;
    done.add(key);
    command(rule, sim, step, false);
    logEvent(rule, sim.t, `${reason}, ${machineName(sim, step.machine)} released`);
  }
}

function tripLine(rule, sim, reason) {
  rule.trippedLine = true;
  logEvent(rule, sim.t, `${reason}, entire line tripped, operator restart required`);
  tripLineFromInterlock(sim, {
    causeId: rule.sensorId,
    causeName: machineName(sim, rule.sensorId),
    holds: () => holds(rule, rule.when, sim),
    message: `${describe(rule, rule.when, "fires")} would not clear, entire line tripped, operator restart required`,
  });
}

// Starts `steps` as the running sequence, replacing any other. `start` is
// when the sequence began: a delay's due time rather than the tick that saw
// it pass, so a wait in the "then" steps counts from the moment the
// condition had held for its delay, and the escalation lands as long after
// the condition first held as the delay and the wait add up to.
function startSequence(rule, steps, start, reason) {
  rule.sequence = { steps, next: 0, clock: start, waitUntil: null, reason };
}

// Runs the sequence's steps until a wait that has not passed yet, or the
// end. After a wait, the clock moves to the tick that passed it, so the next
// wait counts from the step it follows.
function runSequence(rule, sim) {
  const seq = rule.sequence;
  while (seq.next < seq.steps.length) {
    const step = seq.steps[seq.next];
    if (step.action === "wait") {
      seq.waitUntil ??= seq.clock + step.seconds;
      if (sim.t < seq.waitUntil) return;
      seq.clock = sim.t;
      seq.waitUntil = null;
      seq.reason = `${step.seconds}s later`;
    } else if (step.action === "ifStillTrue") {
      if (!holds(rule, rule.when, sim)) {
        logEvent(rule, sim.t, `no longer ${describe(rule, rule.when, "fires")}, the steps end here`);
        break;
      }
      seq.reason = `still ${describe(rule, rule.when, "fires")}`;
    } else if (step.action === "tripLine") {
      tripLine(rule, sim, seq.reason);
    } else {
      command(rule, sim, step, true);
      logEvent(rule, sim.t, `${seq.reason}, ${machineName(sim, step.machine)} ${ACTIONS[step.action].done}`);
    }
    seq.next += 1;
  }
  rule.sequence = null;
}

function allSettled(rule, sim) {
  return commandSteps(rule.then).every((step) => {
    const state = sim.machines.get(step.machine);
    return BEHAVIORS[state.kind].isSettled?.(state) ?? true;
  });
}

// Back to "clear", with nothing pending and the line trip forgotten. The
// sequence is the caller's to set.
function toClear(rule) {
  rule.phase = "clear";
  rule.clearAt = null;
  rule.trippedLine = false;
  rule.settled = false;
}

// The way out of "active": the clear steps if there are any, else every
// "then" step let go. `start` is when the clear steps count from.
function release(rule, sim, start, reason) {
  toClear(rule);
  if (rule.whenClears) {
    startSequence(rule, rule.whenClears.then, start, reason);
  } else {
    rule.sequence = null;
    letGo(rule, sim, rule.then, reason);
  }
}

// clear -> [condition holds] -> arming -> [delay elapses, start the steps]
// -> active -> [clears, or reset] -> clear
// For an auto sentence whose "when it clears" part has its own condition,
// active -> [clear condition holds] -> clearing -> [clear delay elapses,
// start the clear steps] -> clear. An arming sentence whose condition
// clears before the delay has started nothing yet, so it cancels silently;
// so does a clearing one. The sequence the last transition started runs on
// beside these phases.
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
    // The steps running now: { steps, next, clock, waitUntil, reason }.
    sequence: null,
    // Whether a "trip the whole line" step has run since the last release.
    trippedLine: false,
    // Whether every stopped or closed machine has reached its target since
    // the steps ran. A latched sentence counts as latched only from then on,
    // as each coded trip kind's own latched phase is entered only once its
    // actuator settles.
    settled: false,
    log: [],
  };
  rule.when = initPart(rule, cfg.when, "whenSetpoint");
  if (cfg.whenClears) {
    const own = cfg.whenClears.condition !== undefined;
    rule.whenClears = {
      ...(own ? initPart(rule, cfg.whenClears, "clearSetpoint") : { condition: null }),
      then: cfg.whenClears.then.map((step) => ({ ...step })),
    };
    // Moved by the same live signal delay control. A part with no condition
    // of its own has no delay of its own either.
    if (own) rule.clearDelaySec = cfg.whenClears.delaySec;
  }
  // A switch whose sentence can hold the line until an operator resets it
  // is a trip: its lamp is red (ADR 0007).
  const trips = cfg.reset === "latched" || cfg.then.some((step) => step.action === "tripLine");
  rule.alarmCode = trips ? (cfg.when.switch ?? null) : null;
  if (Object.keys(rule.instrumentFields).length === 0) rule.instrumentFields = null;
  return rule;
}

// Whether this tick ends an active sentence, for an auto one that has not
// tripped the line. Steps the "clearing" phase for a part with its own
// condition.
function clearsNow(rule, sim, whenHolds) {
  if (!rule.whenClears?.condition) return !whenHolds;
  const clearHolds = holds(rule, rule.whenClears, sim);
  if (rule.phase === "active" && clearHolds) {
    rule.phase = "clearing";
    rule.clearAt = sim.t + rule.clearDelaySec;
  }
  if (rule.phase === "clearing" && !clearHolds) {
    rule.phase = "active";
    rule.clearAt = null;
  }
  return rule.phase === "clearing" && sim.t >= rule.clearAt;
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
      // Nothing started yet. A clear sequence part way through runs on.
      rule.phase = "clear";
      rule.fireAt = null;
    } else if (sim.t >= rule.fireAt) {
      startSequence(rule, rule.then, rule.fireAt, `${describe(rule, rule.when, "fires")} for ${rule.signalDelaySec}s`);
      rule.phase = "active";
      rule.fireAt = null;
    }
  } else if (rule.phase !== "clear" && rule.reset === "auto" && !rule.trippedLine && clearsNow(rule, sim, whenHolds)) {
    if (rule.whenClears?.condition) {
      release(rule, sim, rule.clearAt, `${describe(rule, rule.whenClears, "fires")} for ${rule.clearDelaySec}s`);
    } else {
      release(rule, sim, sim.t, describe(rule, rule.when, "clears"));
    }
  }
  if (rule.sequence) runSequence(rule, sim);
}

function isLatched(rule) {
  return rule.reset === "latched" && rule.phase === "active" && rule.settled;
}

// RESET TRIPS. A latched sentence whose machines are still moving is a
// command in flight and is not touched. One whose condition still holds
// stays latched, so a reset pressed while the bin is still full does not
// flap the machine on and straight back off. A sentence that tripped the
// line is reset by the same press, under the same condition: the line trip
// itself re-reads the same condition before it lets the line go
// (utilitiesTrip.js).
function resetSentence(rule, sim) {
  if (!rule.trippedLine && !isLatched(rule)) return;
  if (holds(rule, rule.when, sim)) {
    logEvent(rule, sim.t, `reset commanded, still ${describe(rule, rule.when, "fires")}, remains latched`);
    return;
  }
  release(rule, sim, sim.t, "reset");
  if (rule.sequence) runSequence(rule, sim);
}

// Disarmed. An auto sentence lets go of everything it commanded: the
// interlock no longer applies, so neither should anything it did, and
// nothing else would ever undo it while the sentence is not stepped (the
// Concetti pause leaving the conveyor stopped after the destination moves
// away). A latched one keeps its commands until RESET TRIPS, as a trip
// does, and only cancels a pending delay (see control.js
// disarmThresholdStopTrip): a stale `fireAt` would otherwise fire on the
// first tick after the sentence is armed again. Called every tick the
// sentence is disarmed, so both halves do nothing once done.
function disarmSentence(rule, sim) {
  if (rule.phase === "arming") {
    rule.phase = "clear";
    rule.fireAt = null;
  }
  if (rule.reset !== "auto" || (rule.phase === "clear" && !rule.sequence)) return;
  letGo(rule, sim, [...rule.then, ...(rule.whenClears?.then ?? [])], "no longer armed");
  toClear(rule);
  rule.sequence = null;
}

export const SENTENCE_KIND = {
  init: initSentence, step: stepSentence, reset: resetSentence, disarm: disarmSentence, latched: isLatched,
};

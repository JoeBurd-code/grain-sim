// Interlock sentences (issue #80, first built in #82): one interlock shape
// that a user can read and fill in, beside the coded rule kinds in
// control.js until every golden line interlock has been converted (#83,
// #84) and the coded kinds are deleted (#85).
//
//   When <machine> is <condition> for <delaySec> s,
//   then <steps, in order>.
//   Reset: <auto | latched>.
//
// In the line document:
//
//   {
//     id, kind: "sentence",
//     when: { machine, condition, delaySec },
//     then: [{ action, machine }, ...],
//     reset: "auto",
//     armedWhen: [{ machine, port }],  // optional, the same arming every rule has
//   }
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

// What a sentence can watch. `holds` is the condition's meaning; `fires` and
// `clears` are its event log wording.
export const CONDITIONS = {
  stopped: {
    supports: (behavior) => Boolean(behavior?.confirmedRunning),
    holds: (state, behavior) => !behavior.confirmedRunning(state),
    fires: "not running",
    clears: "running again",
  },
  running: {
    supports: (behavior) => Boolean(behavior?.confirmedRunning),
    holds: (state, behavior) => behavior.confirmedRunning(state),
    fires: "running",
    clears: "no longer running",
  },
};

// What a sentence can do to a machine. `apply` commands the machine in the
// sentence's own slot; `release` writes that slot back to its neutral
// value, which can never override any other authority.
export const ACTIONS = {
  stop: {
    supports: (behavior) => Boolean(behavior?.setRunPermit),
    apply: (state, behavior, authority) => behavior.setRunPermit(state, false, authority),
    release: (state, behavior, authority) => behavior.setRunPermit(state, true, authority),
    done: "stopped",
  },
};

export const RESETS = ["auto"];

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const quoted = (list) => list.map((v) => `"${v}"`).join(", ");

// Every problem with one sentence, as messages for the user. `machinesById`
// maps a machine id to its line document entry. Never throws.
export function validateSentence(rule, machinesById) {
  const errors = [];
  const say = (text) => errors.push(`interlock "${rule.id}": ${text}`);
  const behaviorOf = (id) => BEHAVIORS[machinesById.get(id)?.sim?.kind];

  const { when } = rule;
  if (!isPlainObject(when)) {
    say("is missing its \"when\" part");
  } else {
    const condition = CONDITIONS[when.condition];
    if (!machinesById.has(when.machine)) {
      say(`watches unknown machine "${when.machine}"`);
    } else if (!condition) {
      say(`has unknown condition "${when.condition}" (expected one of ${quoted(Object.keys(CONDITIONS))})`);
    } else if (!condition.supports(behaviorOf(when.machine))) {
      say(`machine "${when.machine}" cannot be "${when.condition}"`);
    }
    if (typeof when.delaySec !== "number" || !Number.isFinite(when.delaySec) || when.delaySec < 0) {
      say("needs a signal delay of zero or more seconds");
    }
  }

  if (!Array.isArray(rule.then) || rule.then.length === 0) {
    say("needs at least one step after \"then\"");
  } else {
    rule.then.forEach((step, i) => {
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
      } else if (!action.supports(behaviorOf(step.machine))) {
        say(`${where} cannot ${step.action} machine "${step.machine}"`);
      }
    });
  }

  if (rule.whenClears !== undefined) {
    say("has a \"when it clears\" part, which this app cannot run yet");
  }
  if (!RESETS.includes(rule.reset)) {
    say(`has reset "${rule.reset}" (expected one of ${quoted(RESETS)})`);
  }
  return errors;
}

function machineName(sim, id) {
  return sim.line?.machines?.find((m) => m.id === id)?.name ?? id;
}

function logEvent(rule, t, message) {
  rule.log.push({ t, message });
}

function conditionHolds(rule, sim) {
  const state = sim.machines.get(rule.sensorId);
  return CONDITIONS[rule.condition].holds(state, BEHAVIORS[state.kind]);
}

function eachStep(rule, sim, fn) {
  for (const step of rule.then) {
    const state = sim.machines.get(step.machine);
    fn(step, state, BEHAVIORS[state.kind]);
  }
}

// clear -> [condition holds] -> arming -> [delay elapses, run the steps]
// -> active -> [condition clears, reset auto] -> clear
// An arming sentence whose condition clears before the delay has commanded
// nothing yet, so it cancels silently.
function initSentence(cfg) {
  return {
    kind: "sentence",
    id: cfg.id,
    sensorId: cfg.when.machine,
    condition: cfg.when.condition,
    // Named as every coded rule names it, so the live signal delay control
    // (engine.js setInterlockSignalDelay) reaches a sentence too.
    signalDelaySec: cfg.when.delaySec,
    then: cfg.then.map((step) => ({ ...step })),
    reset: cfg.reset,
    phase: "clear",
    fireAt: null,
    log: [],
  };
}

function stepSentence(rule, sim) {
  const holds = conditionHolds(rule, sim);
  const fires = CONDITIONS[rule.condition].fires;

  if (rule.phase === "clear" && holds) {
    rule.phase = "arming";
    rule.fireAt = sim.t + rule.signalDelaySec;
  }
  if (rule.phase === "arming") {
    if (!holds) {
      rule.phase = "clear";
      rule.fireAt = null;
      return;
    }
    if (sim.t >= rule.fireAt) {
      eachStep(rule, sim, (step, state, behavior) => {
        ACTIONS[step.action].apply(state, behavior, rule.id);
        logEvent(rule, sim.t, `${fires} for ${rule.signalDelaySec}s, ${machineName(sim, step.machine)} ${ACTIONS[step.action].done}`);
      });
      rule.phase = "active";
      rule.fireAt = null;
    }
    return;
  }
  if (rule.phase === "active" && !holds && rule.reset === "auto") {
    eachStep(rule, sim, (step, state, behavior) => {
      ACTIONS[step.action].release(state, behavior, rule.id);
      logEvent(rule, sim.t, `${CONDITIONS[rule.condition].clears}, ${machineName(sim, step.machine)} released`);
    });
    rule.phase = "clear";
  }
}

// An auto reset sentence has nothing latched, so RESET TRIPS has nothing to
// do. Latched sentences come with the level trip conversions (#83).
function resetSentence() {}

// A disarmed sentence cancels a pending delay, the same as the coded kinds
// (see control.js disarmThresholdStopTrip): a stale `fireAt` would otherwise
// fire on the first tick after the sentence is armed again.
function disarmSentence(rule) {
  if (rule.phase === "arming") {
    rule.phase = "clear";
    rule.fireAt = null;
  }
}

export const SENTENCE_KIND = {
  init: initSentence, step: stepSentence, reset: resetSentence, disarm: disarmSentence,
};

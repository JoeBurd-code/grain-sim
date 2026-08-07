// The control layer: sensors reading an accumulator's level, declarative
// rules that fire delayed actions on a target machine, and the per-rule
// event log a machine's popup surfaces. One `line.interlocks` entry becomes
// one runtime rule instance here; engine.js calls `stepControl` once per
// tick, after the flow pass, so a command issued this tick affects the
// actuator's behaviour starting next tick — exactly like any other engine
// state change.
//
// A rule declares a `kind`, resolved against `CONTROL_KINDS` below exactly
// as a machine's `sim.kind` resolves against behaviors.js's `BEHAVIORS` —
// the parent spec's "material behaviour is shared, control behaviour is
// not" (issue #15) applies to interlocks too, so a second rule kind is a
// second entry here, not a branch bolted onto the first one. `kind` defaults
// to `thresholdTrip` so every interlock authored before this registry
// existed (issue #19) needs no `lineData.js` change.
import { BEHAVIORS } from "./behaviors";

function readLevel(machines, machineId) {
  const state = machines.get(machineId);
  const snap = BEHAVIORS[state.kind]?.snapshot?.(state);
  if (!snap || snap.fill == null) {
    throw new Error(`machine "${machineId}" has no readable level for a sensor`);
  }
  return snap.fill;
}

function logEvent(rule, t, message) {
  rule.log.push({ t, message });
}

function pct(level) {
  return `${(level * 100).toFixed(0)}%`;
}

function resolveActuator(rule, sim) {
  const actuator = sim.machines.get(rule.actuatorId);
  return { actuator, behavior: BEHAVIORS[actuator.kind] };
}

// Phase machine (issue #19 — the buffer bin closes the source valve, late):
//   open -> [level >= highSetpoint] -> delayedClose -> [delay elapses,
//   command close] -> closing -> [valve settles at 0] -> closed ->
//   [level <= lowSetpoint] -> delayedOpen -> [delay elapses, command open]
//   -> opening -> [valve settles at 1] -> open
// A trip latches: once armed, a delayed action always fires, even if the
// level recrosses the set point before the delay elapses (real interlocks
// don't cancel on a transient — and by design the level only keeps
// climbing during the closing delay, which is the overshoot this issue
// exists to demonstrate).
function initThresholdTrip(cfg) {
  return {
    kind: "thresholdTrip",
    id: cfg.id,
    sensorId: cfg.sensor.machine,
    actuatorId: cfg.action.machine,
    highSetpoint: cfg.highSetpoint,
    lowSetpoint: cfg.lowSetpoint,
    signalDelaySec: cfg.signalDelaySec,
    rampTimeSec: cfg.action.rampTimeSec,
    phase: "open",
    fireAt: null,
    log: [],
  };
}
function stepThresholdTrip(rule, sim) {
  const level = readLevel(sim.machines, rule.sensorId);
  const { actuator, behavior } = resolveActuator(rule, sim);

  if (rule.phase === "open" && level >= rule.highSetpoint) {
    logEvent(rule, sim.t, `high set point reached at ${pct(level)} — closing signal armed`);
    rule.phase = "delayedClose";
    rule.fireAt = sim.t + rule.signalDelaySec;
  } else if (rule.phase === "closed" && level <= rule.lowSetpoint) {
    logEvent(rule, sim.t, `low set point reached at ${pct(level)} — opening signal armed`);
    rule.phase = "delayedOpen";
    rule.fireAt = sim.t + rule.signalDelaySec;
  }

  if (rule.phase === "delayedClose" && sim.t >= rule.fireAt) {
    behavior.command(actuator, "close", rule.rampTimeSec);
    logEvent(rule, sim.t, `valve commanded closed (ramping over ${rule.rampTimeSec}s)`);
    rule.phase = "closing";
    rule.fireAt = null;
  } else if (rule.phase === "delayedOpen" && sim.t >= rule.fireAt) {
    behavior.command(actuator, "open", rule.rampTimeSec);
    logEvent(rule, sim.t, `valve commanded open (ramping over ${rule.rampTimeSec}s)`);
    rule.phase = "opening";
    rule.fireAt = null;
  }

  if (rule.phase === "closing" && behavior.isSettled(actuator)) {
    rule.phase = "closed";
  } else if (rule.phase === "opening" && behavior.isSettled(actuator)) {
    rule.phase = "open";
  }
}

// Phase machine (issue #22 — the treater pre-bin slows the elevator, then
// stops it): two independent rising thresholds, each with its own delay,
// each commanding the actuator to its own target speed fraction over its
// own ramp time — the engineer's "first slow, then stop" read literally
// rather than collapsed into one trip.
//   full -> [level >= slowSetpoint] -> armSlow -> [delay elapses, command
//   slow.speedFraction] -> slowing -> [settles] -> slow ->
//     [level >= stopSetpoint] -> armStop -> [delay elapses, command 0]
//     -> stopping -> [settles] -> stopped
//     [level <= lowSetpoint] -> recovering (commanded immediately: no FD or
//     worksheet number backs a delay on the recovery path, unlike the two
//     rising stages) -> [settles] -> full
// Recovery is armed from "slow" or "stopped" only (not mid-ramp), and a
// rise past stopSetpoint is armed from "slow" only — both mirror
// thresholdTrip's latch: once armed, a delayed action always fires, and a
// settled phase is what re-opens the sensor to its next possible crossing.
function initTwoStageThrottle(cfg) {
  return {
    kind: "twoStageThrottle",
    id: cfg.id,
    sensorId: cfg.sensor.machine,
    actuatorId: cfg.action.machine,
    lowSetpoint: cfg.lowSetpoint,
    slowSetpoint: cfg.slow.setpoint,
    slowDelaySec: cfg.slow.delaySec,
    slowFraction: cfg.slow.speedFraction,
    slowRampTimeSec: cfg.slow.rampTimeSec,
    stopSetpoint: cfg.stop.setpoint,
    stopDelaySec: cfg.stop.delaySec,
    stopRampTimeSec: cfg.stop.rampTimeSec,
    recoverRampTimeSec: cfg.recoverRampTimeSec,
    phase: "full",
    fireAt: null,
    log: [],
  };
}
function stepTwoStageThrottle(rule, sim) {
  const level = readLevel(sim.machines, rule.sensorId);
  const { actuator, behavior } = resolveActuator(rule, sim);

  if (rule.phase === "full" && level >= rule.slowSetpoint) {
    logEvent(rule, sim.t, `slow set point reached at ${pct(level)} — slow-down signal armed`);
    rule.phase = "armSlow";
    rule.fireAt = sim.t + rule.slowDelaySec;
  } else if (rule.phase === "slow" && level >= rule.stopSetpoint) {
    logEvent(rule, sim.t, `stop set point reached at ${pct(level)} — stop signal armed`);
    rule.phase = "armStop";
    rule.fireAt = sim.t + rule.stopDelaySec;
  } else if ((rule.phase === "slow" || rule.phase === "stopped") && level <= rule.lowSetpoint) {
    behavior.command(actuator, 1, rule.recoverRampTimeSec);
    logEvent(rule, sim.t, `level recovered to ${pct(level)} — elevator commanded back to full speed (ramping over ${rule.recoverRampTimeSec}s)`);
    rule.phase = "recovering";
  }

  if (rule.phase === "armSlow" && sim.t >= rule.fireAt) {
    behavior.command(actuator, rule.slowFraction, rule.slowRampTimeSec);
    logEvent(rule, sim.t, `elevator commanded to ${Math.round(rule.slowFraction * 100)}% speed (ramping over ${rule.slowRampTimeSec}s)`);
    rule.phase = "slowing";
    rule.fireAt = null;
  } else if (rule.phase === "armStop" && sim.t >= rule.fireAt) {
    behavior.command(actuator, 0, rule.stopRampTimeSec);
    logEvent(rule, sim.t, `elevator commanded to stop (ramping over ${rule.stopRampTimeSec}s)`);
    rule.phase = "stopping";
    rule.fireAt = null;
  }

  if (rule.phase === "slowing" && behavior.isSettled(actuator)) {
    rule.phase = "slow";
  } else if (rule.phase === "stopping" && behavior.isSettled(actuator)) {
    rule.phase = "stopped";
  } else if (rule.phase === "recovering" && behavior.isSettled(actuator)) {
    rule.phase = "full";
  }
}

// Hold-next-batch (issue #25 — the treater after-bin's response to a full
// bin): the third distinct response to a full bin on this line, after
// thresholdTrip's valve close (issue #19) and twoStageThrottle's slow-then-
// stop (issue #22). Unlike those two, the actuator here (a batchCycle
// machine's `blocked` gate, see behaviors.js) is a plain accept/block flag
// with no ramp to wait on, so this phase machine has no closing/opening or
// slowing/stopping equivalent — commanding it takes effect immediately, the
// same tick isSettled would otherwise have waited for.
//   released -> [level >= highSetpoint] -> armed -> [delay elapses, command
//   hold] -> held -> [level <= lowSetpoint] -> command release -> released
// Latches exactly like the other two kinds: once armed, the hold always
// fires, even if the level dips back below highSetpoint before the delay
// elapses. The batch-cycle behaviour itself is what guarantees a held gate
// never interrupts a batch already under way (see capacityAvailableBatchCycle) —
// this rule only ever decides when the gate opens and closes.
function initHoldNextBatch(cfg) {
  return {
    kind: "holdNextBatch",
    id: cfg.id,
    sensorId: cfg.sensor.machine,
    actuatorId: cfg.action.machine,
    highSetpoint: cfg.highSetpoint,
    lowSetpoint: cfg.lowSetpoint,
    signalDelaySec: cfg.signalDelaySec,
    phase: "released",
    fireAt: null,
    log: [],
  };
}
function stepHoldNextBatch(rule, sim) {
  const level = readLevel(sim.machines, rule.sensorId);
  const { actuator, behavior } = resolveActuator(rule, sim);

  if (rule.phase === "released" && level >= rule.highSetpoint) {
    logEvent(rule, sim.t, `high set point reached at ${pct(level)} — hold signal armed`);
    rule.phase = "armed";
    rule.fireAt = sim.t + rule.signalDelaySec;
  } else if (rule.phase === "held" && level <= rule.lowSetpoint) {
    behavior.command(actuator, false);
    logEvent(rule, sim.t, `level cleared to ${pct(level)} — treater released to start its next batch`);
    rule.phase = "released";
  }

  if (rule.phase === "armed" && sim.t >= rule.fireAt) {
    behavior.command(actuator, true);
    logEvent(rule, sim.t, `treater commanded to hold — will finish its current batch, then wait`);
    rule.phase = "held";
    rule.fireAt = null;
  }
}

const CONTROL_KINDS = {
  thresholdTrip: { init: initThresholdTrip, step: stepThresholdTrip },
  twoStageThrottle: { init: initTwoStageThrottle, step: stepTwoStageThrottle },
  holdNextBatch: { init: initHoldNextBatch, step: stepHoldNextBatch },
};

// Issue #29: one flat, chronological event list spanning every rule's log,
// each entry tagged with the id and display name of the sensor machine it
// came from. Pure derivation over the exact same rule.log arrays that
// already back each machine's own per-sensor log (see engine.js's
// getInterlockState and useSimEngine.js's publishSnap), so there is one
// source of truth for event history, not two that can drift apart.
export function combineEventLogs(control, machineNames) {
  const events = [];
  for (const rule of control) {
    for (const entry of rule.log) {
      events.push({ ...entry, machineId: rule.sensorId, machineName: machineNames.get(rule.sensorId) });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

export function initControl(line) {
  return (line.interlocks ?? []).map((cfg) => CONTROL_KINDS[cfg.kind ?? "thresholdTrip"].init(cfg));
}

export function stepControl(sim) {
  for (const rule of sim.control) {
    CONTROL_KINDS[rule.kind].step(rule, sim);
  }
}

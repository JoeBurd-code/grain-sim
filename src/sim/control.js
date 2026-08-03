// The control layer: sensors reading an accumulator's level, declarative
// threshold rules that fire a delayed action on a target machine, and the
// per-rule event log a machine's popup surfaces. One `line.interlocks`
// entry becomes one runtime rule instance here; engine.js calls
// `stepControl` once per tick, after the flow pass, so a command issued
// this tick affects the actuator's behaviour starting next tick — exactly
// like any other engine state change.
//
// Phase machine per rule (issue #19 — the buffer bin closes the source
// valve, late):
//   open -> [level >= highSetpoint] -> delayedClose -> [delay elapses,
//   command close] -> closing -> [valve settles at 0] -> closed ->
//   [level <= lowSetpoint] -> delayedOpen -> [delay elapses, command open]
//   -> opening -> [valve settles at 1] -> open
// A trip latches: once armed, a delayed action always fires, even if the
// level recrosses the set point before the delay elapses (real interlocks
// don't cancel on a transient — and by design the level only keeps
// climbing during the closing delay, which is the overshoot this issue
// exists to demonstrate).
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

export function initControl(line) {
  return (line.interlocks ?? []).map((cfg) => ({
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
  }));
}

export function stepControl(sim) {
  const { machines, control } = sim;
  for (const rule of control) {
    const level = readLevel(machines, rule.sensorId);
    const actuator = machines.get(rule.actuatorId);

    if (rule.phase === "open" && level >= rule.highSetpoint) {
      logEvent(rule, sim.t, `high set point reached at ${(level * 100).toFixed(0)}% — closing signal armed`);
      rule.phase = "delayedClose";
      rule.fireAt = sim.t + rule.signalDelaySec;
    } else if (rule.phase === "closed" && level <= rule.lowSetpoint) {
      logEvent(rule, sim.t, `low set point reached at ${(level * 100).toFixed(0)}% — opening signal armed`);
      rule.phase = "delayedOpen";
      rule.fireAt = sim.t + rule.signalDelaySec;
    }

    if (rule.phase === "delayedClose" && sim.t >= rule.fireAt) {
      BEHAVIORS[actuator.kind].command(actuator, "close", rule.rampTimeSec);
      logEvent(rule, sim.t, `valve commanded closed (ramping over ${rule.rampTimeSec}s)`);
      rule.phase = "closing";
      rule.fireAt = null;
    } else if (rule.phase === "delayedOpen" && sim.t >= rule.fireAt) {
      BEHAVIORS[actuator.kind].command(actuator, "open", rule.rampTimeSec);
      logEvent(rule, sim.t, `valve commanded open (ramping over ${rule.rampTimeSec}s)`);
      rule.phase = "opening";
      rule.fireAt = null;
    }

    if (rule.phase === "closing" && BEHAVIORS[actuator.kind].isSettled(actuator)) {
      rule.phase = "closed";
    } else if (rule.phase === "opening" && BEHAVIORS[actuator.kind].isSettled(actuator)) {
      rule.phase = "open";
    }
  }
}

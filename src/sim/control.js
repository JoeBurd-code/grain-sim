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
import { m3PerSecToTPerHour } from "./units";

function readLevel(machines, machineId) {
  const state = machines.get(machineId);
  const snap = BEHAVIORS[state.kind]?.snapshot?.(state);
  if (!snap || snap.fill == null) {
    throw new Error(`machine "${machineId}" has no readable level for a sensor`);
  }
  return snap.fill;
}

// Same defensive shape as readLevel above, for a rule kind (issue #42) whose
// sensor is read for a running/confirmed signal rather than a fill level.
function readConfirmedRunning(machines, machineId) {
  const state = machines.get(machineId);
  const confirmedRunning = BEHAVIORS[state.kind]?.confirmedRunning;
  if (!confirmedRunning) {
    throw new Error(`machine "${machineId}" has no readable running state for a sensor`);
  }
  return confirmedRunning(state);
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

// Issue #30: which of a rule's live setpoint fields backs each ISA
// instrument code it exposes. Direction (does the switch trip on a high
// level or a low one) is read off the code itself below, not off the rule
// kind, so this table only needs to say which field holds which code's
// setpoint. twoStageThrottle's `slowSetpoint` has no entry: the FD's own
// cause-and-effect matrix names LSH0 as the stop stage's switch (see
// preBinSlowStopTrip's own comment in lineData.js) — the slow stage is an
// engineer-described addition with no physical instrument tag of its own.
const INSTRUMENT_FIELDS = {
  thresholdTrip: { LSH: "highSetpoint", LSL: "lowSetpoint" },
  twoStageThrottle: { LSH: "stopSetpoint", LSL: "lowSetpoint" },
  holdNextBatch: { LSH: "highSetpoint", LSL: "lowSetpoint" },
  thresholdStopTrip: { LSH: "highSetpoint", LSL: "lowSetpoint" },
};

// Pure: which of a rule's instruments are tripped right now, given the
// sensor's current level. No memory of past state — a live setpoint or
// level change (e.g. a presenter's levelJump drag) is reflected the instant
// it's read, independent of `phase`/`fireAt`, which govern only the
// downstream actuator's delayed response.
export function instrumentReadings(rule, level) {
  const fields = INSTRUMENT_FIELDS[rule.kind] ?? {};
  const readings = {};
  for (const [code, field] of Object.entries(fields)) {
    const setpoint = rule[field];
    const tripped = code === "LSH" ? level >= setpoint : level <= setpoint;
    readings[code] = { setpoint, tripped };
  }
  return readings;
}

// Stateful: folds instrumentReadings into the rule's own `instruments`,
// stamping a `pulseGen` counter that increments on every false->true edge —
// the one-time trip-pulse animation's cue, kept here rather than recomputed
// by the render layer, since only this layer knows the *previous* tick's
// tripped state. Tolerates `rule.instruments` not existing yet (a rule's
// very first call, whether from initial priming or a fabricated test that
// never primes) by treating every code as previously untripped.
//
// Issue #41: that same false->true edge is also the one true moment an
// LSH/LSL "set point reached" event log entry belongs — logged here,
// centrally, once per crossing, independent of `rule.phase`. Before this,
// each phase machine below logged its own "set point reached" string from
// inside exactly one phase-gated branch (e.g. thresholdTrip's LSL only from
// `phase === "closed"`), so a rule whose high side never tripped — and so
// never reached the one phase its low side's branch required — logged
// nothing at all for a low-side crossing that happened dozens of times
// (confirmed on treaterPreBin during the #40 investigation). Centralizing
// here means every rule kind gets this for free, off the exact same table
// and edge-detection logic the dot (issue #30) already computes above, with
// no per-kind duplication. Each phase machine's own logEvent calls now
// describe only the *resulting action* (armed/commanded/released), never
// re-stating the crossing this function already logged the same tick.
function stepRuleInstruments(rule, level, sim) {
  const prevAll = rule.instruments ?? {};
  const next = {};
  for (const [code, reading] of Object.entries(instrumentReadings(rule, level))) {
    const prev = prevAll[code];
    const justTripped = reading.tripped && !prev?.tripped;
    const pulseGen = justTripped ? (prev?.pulseGen ?? 0) + 1 : (prev?.pulseGen ?? 0);
    next[code] = { code, ...reading, pulseGen };
    if (justTripped) {
      logEvent(rule, sim.t, `${code} set point reached at ${pct(level)} (setpoint ${pct(reading.setpoint)})`);
    }
  }
  rule.instruments = next;
}

// Seeds every rule's instrument state right after createSim builds `control`,
// so the very first published snapshot (before the sim has ever ticked)
// already shows correct setpoint/tripped values instead of nothing — the
// same reasoning as this file's own phase machines starting in a real,
// non-empty phase rather than an "uninitialized" one. Unlike stepRuleInstruments,
// this never stamps a pulse: starting the demo already past a set point is
// the initial condition, not a live trip the audience should see animate.
export function primeInstruments(control, machines) {
  for (const rule of control) {
    if (!INSTRUMENT_FIELDS[rule.kind]) continue;
    const level = readLevel(machines, rule.sensorId);
    const readings = instrumentReadings(rule, level);
    rule.instruments = Object.fromEntries(
      Object.entries(readings).map(([code, reading]) => [code, { code, ...reading, pulseGen: 0 }])
    );
  }
}

// Phase machine (issue #19 — the buffer bin closes the source valve, late):
//   open -> [level >= highSetpoint] -> delayedClose -> [delay elapses,
//   command close] -> closing -> [valve settles at 0] -> closed
// A trip latches twice over. First, once armed, a delayed action always
// fires, even if the level recrosses the set point before the delay
// elapses (real interlocks don't cancel on a transient — and by design the
// level only keeps climbing during the closing delay, which is the
// overshoot this issue exists to demonstrate). Second, and per issue #45:
// "closed" is a terminal state the level falling back past lowSetpoint no
// longer exits on its own — the FD is explicit that a trip requires a
// SCADA reset before the device can run again (docs/OPEN_QUESTIONS.md, the
// "no automatic reopen" finding). Only resetThresholdTrip below can move a
// rule out of "closed", and only when the level has actually cleared.
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
  stepRuleInstruments(rule, level, sim);
  const { actuator, behavior } = resolveActuator(rule, sim);

  if (rule.phase === "open" && level >= rule.highSetpoint) {
    rule.phase = "delayedClose";
    rule.fireAt = sim.t + rule.signalDelaySec;
  }

  if (rule.phase === "delayedClose" && sim.t >= rule.fireAt) {
    behavior.command(actuator, "close", rule.rampTimeSec);
    logEvent(rule, sim.t, `valve commanded closed (ramping over ${rule.rampTimeSec}s)`);
    rule.phase = "closing";
    rule.fireAt = null;
  }

  if (rule.phase === "closing" && behavior.isSettled(actuator)) {
    rule.phase = "closed";
  } else if (rule.phase === "opening" && behavior.isSettled(actuator)) {
    rule.phase = "open";
  }
}

// Reset (issue #45): the SCADA reset's one effect on this rule. Only
// "closed" — the latched, at-rest trip state — is ever eligible; a rule
// still mid-transition (delayedClose/closing) is a commitment already in
// flight (see this kind's own latch comment above) and isn't touched. Per
// the FD's own severity distinction (§5: a Trip needs a reset, but the
// level switch is also a Process Interlock that "prevents start"), a reset
// only clears the SCADA latch — the PI itself still blocks the valve from
// opening while the high set point remains tripped, so this re-reads the
// live level rather than unconditionally commanding open. That's what
// keeps a reset pressed while the bin is still full from flapping the
// valve open and immediately back shut.
function resetThresholdTrip(rule, sim) {
  if (rule.phase !== "closed") return;
  const level = readLevel(sim.machines, rule.sensorId);
  if (level >= rule.highSetpoint) {
    logEvent(rule, sim.t, `reset commanded — high set point still tripped at ${pct(level)}, remains latched`);
    return;
  }
  const { actuator, behavior } = resolveActuator(rule, sim);
  behavior.command(actuator, "open", rule.rampTimeSec);
  logEvent(rule, sim.t, `reset — valve commanded open (ramping over ${rule.rampTimeSec}s)`);
  rule.phase = "opening";
  rule.fireAt = null;
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
// A rise past stopSetpoint is armed from "slow" only, mirroring
// thresholdTrip's latch: once armed, a delayed action always fires, and a
// settled phase is what re-opens the sensor to its next possible crossing.
// "slow" and "stopped" are both terminal per issue #45: neither exits on
// its own anymore when the level falls back past lowSetpoint (that path
// was the same auto-reopen modelling convenience thresholdTrip's own
// bufferBinHighTrip had, per docs/OPEN_QUESTIONS.md — the FD's "no
// automatic reopen" finding applies just as much to a graduated throttle
// as to a hard close). Only resetTwoStageThrottle below moves a rule out
// of either, via a `recovering` phase (commanded immediately: no FD or
// worksheet number backs a delay on the recovery path, unlike the two
// rising stages) -> [settles] -> full.
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
  stepRuleInstruments(rule, level, sim);
  const { actuator, behavior } = resolveActuator(rule, sim);

  if (rule.phase === "full" && level >= rule.slowSetpoint) {
    // slowSetpoint has no LSH/LSL instrument backing it (see INSTRUMENT_FIELDS'
    // own comment above — the slow stage is an engineer-described addition
    // with no physical instrument tag), so stepRuleInstruments' centralized
    // crossing log never covers this moment; unlike every other arm branch
    // in this file, this one keeps its own logEvent so the crossing isn't
    // silently lost.
    logEvent(rule, sim.t, `slow set point reached at ${pct(level)} — slow-down signal armed`);
    rule.phase = "armSlow";
    rule.fireAt = sim.t + rule.slowDelaySec;
  } else if (rule.phase === "slow" && level >= rule.stopSetpoint) {
    rule.phase = "armStop";
    rule.fireAt = sim.t + rule.stopDelaySec;
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

// Reset (issue #45): eligible from either terminal phase, gated on the same
// setpoint that arms it — stopSetpoint for "stopped", slowSetpoint for
// "slow" — per the FD's Process Interlock wording (§5: the level switch
// "prevents start" independent of the Trip's own SCADA-reset requirement),
// so a reset pressed while still above that phase's own threshold re-latches
// rather than flapping the elevator. Clearing "stopped" checks slowSetpoint
// too: a level between slowSetpoint and stopSetpoint has cleared the stop
// trip but not the slow one, and the spec is explicit that "clearing a
// latch permits a machine to run again, it does not force it to run while
// its own interlock condition is still true" — commanding full speed here
// (even briefly, on the way to stepTwoStageThrottle noticing and re-arming
// a `slowDelaySec` later) would be exactly that forcing. Going straight to
// "slowing" instead means the reset never commands a speed the live level
// doesn't already warrant.
function resetTwoStageThrottle(rule, sim) {
  if (rule.phase !== "slow" && rule.phase !== "stopped") return;
  const level = readLevel(sim.machines, rule.sensorId);
  const stage = rule.phase === "stopped" ? "stop" : "slow";
  const setpoint = rule.phase === "stopped" ? rule.stopSetpoint : rule.slowSetpoint;
  if (level >= setpoint) {
    logEvent(rule, sim.t, `reset commanded — ${stage} set point still tripped at ${pct(level)}, remains latched`);
    return;
  }
  const { actuator, behavior } = resolveActuator(rule, sim);
  if (rule.phase === "stopped" && level >= rule.slowSetpoint) {
    behavior.command(actuator, rule.slowFraction, rule.slowRampTimeSec);
    logEvent(rule, sim.t, `reset — elevator commanded to ${Math.round(rule.slowFraction * 100)}% speed (ramping over ${rule.slowRampTimeSec}s) — slow set point still tripped`);
    rule.phase = "slowing";
    return;
  }
  behavior.command(actuator, 1, rule.recoverRampTimeSec);
  logEvent(rule, sim.t, `reset — elevator commanded back to full speed (ramping over ${rule.recoverRampTimeSec}s)`);
  rule.phase = "recovering";
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
//   hold] -> held
// Latches exactly like the other two kinds: once armed, the hold always
// fires, even if the level dips back below highSetpoint before the delay
// elapses. "held" is terminal per issue #45 — the level falling back past
// lowSetpoint no longer releases the gate on its own; only resetHoldNextBatch
// below does, and only once the level has actually cleared. The batch-cycle
// behaviour itself is what guarantees a held gate never interrupts a batch
// already under way (see capacityAvailableBatchCycle) — this rule only ever
// decides when the gate opens and closes.
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
  stepRuleInstruments(rule, level, sim);
  const { actuator, behavior } = resolveActuator(rule, sim);

  if (rule.phase === "released" && level >= rule.highSetpoint) {
    rule.phase = "armed";
    rule.fireAt = sim.t + rule.signalDelaySec;
  }

  if (rule.phase === "armed" && sim.t >= rule.fireAt) {
    behavior.command(actuator, true);
    logEvent(rule, sim.t, `treater commanded to hold — will finish its current batch, then wait`);
    rule.phase = "held";
    rule.fireAt = null;
  }
}

// Reset (issue #45): only "held" is eligible. Gated on highSetpoint, the
// same instrument that armed the hold — the FD's Process Interlock still
// prevents the treater from accepting a fresh batch while the after-bin
// reads full, independent of the Trip's own SCADA-reset requirement — so a
// reset pressed while the bin is still above highSetpoint re-latches rather
// than releasing and immediately re-holding.
function resetHoldNextBatch(rule, sim) {
  if (rule.phase !== "held") return;
  const level = readLevel(sim.machines, rule.sensorId);
  if (level >= rule.highSetpoint) {
    logEvent(rule, sim.t, `reset commanded — high set point still tripped at ${pct(level)}, remains latched`);
    return;
  }
  const { actuator, behavior } = resolveActuator(rule, sim);
  behavior.command(actuator, false);
  logEvent(rule, sim.t, `reset — treater released to start its next batch`);
  rule.phase = "released";
}

// Auto-start (issue #42 — the inlet drum feeder starts itself once the
// treating elevator is confirmed running, matching the real plant's own
// interlock; see the engineer's note preserved in lineData.js's
// `treatDrumFeeder` comment). Unlike the three kinds above, this rule's
// sensor isn't a fill level (no LSH/LSL, no INSTRUMENT_FIELDS entry, no
// stepRuleInstruments call) and its actuator isn't an interlock-latched
// device with a settle to wait on — it's a one-shot: the instant the
// elevator is confirmed running, the feeder is commanded to its configured
// rate exactly once, and the rule then steps out of the way for good.
//   waiting -> [elevator confirmedRunning] -> started
// A presenter's own feed-rate slider (setFeederRate) is always honoured
// immediately, whether set before or after the elevator comes up: this
// step only ever commands the feeder while its `manualOverride` flag is
// still unset, so a rate the presenter has already dialled in — including
// deliberately pausing at 0 — is never overwritten, and once "started" this
// rule never touches the feeder again regardless.
// Like every other rule kind here, the log this rule writes is attributed
// to `sensorId` (the elevator), not `actuatorId` (the feeder it commands) —
// same convention as e.g. preBinSlowStopTrip's "elevator commanded to 50%
// speed" living on the pre-bin's own popup, not the elevator's. A presenter
// looking for "why did the feeder start" finds it on the elevator's popup,
// since the elevator's own state is what the crossing/trip is about.
function initAutoStartOnRunning(cfg) {
  return {
    kind: "autoStartOnRunning",
    id: cfg.id,
    sensorId: cfg.sensor.machine,
    actuatorId: cfg.action.machine,
    rateM3PerSec: cfg.rateM3PerSec,
    phase: "waiting", // waiting -> started
    log: [],
  };
}
function stepAutoStartOnRunning(rule, sim) {
  if (rule.phase === "started") return;
  if (!readConfirmedRunning(sim.machines, rule.sensorId)) return;
  const { actuator, behavior } = resolveActuator(rule, sim);
  if (!actuator.manualOverride) {
    behavior.command(actuator, rule.rateM3PerSec);
    logEvent(rule, sim.t, `elevator confirmed running — feeder auto-started at ${m3PerSecToTPerHour(rule.rateM3PerSec).toFixed(1)} t/h`);
  }
  rule.phase = "started";
}
// Reset (issue #45): a no-op. This rule never stops the feeder — the FD
// names the elevator-stops-the-feeder half of this same interlock but it
// remains unmodelled (docs/OPEN_QUESTIONS.md, Machine 2) — so there is
// nothing here for a SCADA reset to latch or unlatch. Declared explicitly,
// rather than omitted, so resetTrips' dispatch table below stays one entry
// per kind with no per-kind branch of its own to skip a kind that has
// nothing to reset.
function resetAutoStartOnRunning() {}

// Threshold stop trip (issue #47 — the two metal bins' own high-level
// trips): the same single-threshold latched shape as thresholdTrip above,
// but commands a transport-delay-family actuator's speed fraction to 0 (the
// same `command(actuator, fraction, rampTimeSec)` shape twoStageThrottle
// already uses) rather than a source's open/close — thresholdTrip's own
// `command(actuator, "close", ...)` call is source-specific and can't drive
// the packaging conveyor. The FD classifies this as a genuine **Trip**
// ("stops the device immediately, no shutdown procedure" — §5), unlike the
// treater pre-bin's own graduated VFD ramp (an engineer-described addition
// with no FD backing), so the line data authors this with a near-zero ramp
// time rather than a multi-second one.
//   running -> [level >= highSetpoint] -> armed -> [delay elapses, command
//   stop] -> stopping -> [settles] -> stopped
// Latches exactly like thresholdTrip: only resetThresholdStopTrip below
// exits "stopped", and only once the level has actually cleared.
function initThresholdStopTrip(cfg) {
  return {
    kind: "thresholdStopTrip",
    id: cfg.id,
    sensorId: cfg.sensor.machine,
    actuatorId: cfg.action.machine,
    highSetpoint: cfg.highSetpoint,
    lowSetpoint: cfg.lowSetpoint,
    signalDelaySec: cfg.signalDelaySec,
    rampTimeSec: cfg.action.rampTimeSec,
    phase: "running",
    fireAt: null,
    log: [],
  };
}
function stepThresholdStopTrip(rule, sim) {
  const level = readLevel(sim.machines, rule.sensorId);
  stepRuleInstruments(rule, level, sim);
  const { actuator, behavior } = resolveActuator(rule, sim);

  if (rule.phase === "running" && level >= rule.highSetpoint) {
    rule.phase = "armed";
    rule.fireAt = sim.t + rule.signalDelaySec;
  }

  if (rule.phase === "armed" && sim.t >= rule.fireAt) {
    behavior.command(actuator, 0, rule.rampTimeSec);
    logEvent(rule, sim.t, `conveyor commanded to stop (ramping over ${rule.rampTimeSec}s)`);
    rule.phase = "stopping";
    rule.fireAt = null;
  }

  if (rule.phase === "stopping" && behavior.isSettled(actuator)) {
    rule.phase = "stopped";
  } else if (rule.phase === "recovering" && behavior.isSettled(actuator)) {
    rule.phase = "running";
  }
}
// Disarm (issue #47, code-review finding): `fireAt` is an absolute
// simulated-time deadline, computed once on entering "armed" and never
// revisited while stepControl's own isArmed gate keeps skipping this rule's
// step() — so a rule disarmed mid-countdown and re-armed later would find
// `sim.t >= fireAt` already true the instant it's re-evaluated, firing on
// the very next tick instead of waiting a fresh signalDelaySec. "armed" is
// the one phase this matters for: nothing observable has happened yet (no
// command issued, nothing logged), so cancelling the pending timer back to
// "running" here is silent and harmless — unlike "stopping"/"stopped",
// which represent a command already issued and must survive being
// disarmed unchanged (see this kind's own resetThresholdStopTrip below,
// and the "becoming disarmed mid-trip" test in engine.test.js). Every
// other rule kind has no `disarm` entry in CONTROL_KINDS below and needs
// none: none of them uses `armedWhen` today, and stepControl's own call is
// optional-chained, so a kind with nothing pending to cancel is untouched.
function disarmThresholdStopTrip(rule) {
  if (rule.phase === "armed") {
    rule.phase = "running";
    rule.fireAt = null;
  }
}

// Reset (issue #45's own latch convention, applied to this new kind): only
// "stopped" is eligible, gated on the same high set point that armed it —
// same shape as resetThresholdTrip.
function resetThresholdStopTrip(rule, sim) {
  if (rule.phase !== "stopped") return;
  const level = readLevel(sim.machines, rule.sensorId);
  if (level >= rule.highSetpoint) {
    logEvent(rule, sim.t, `reset commanded — high set point still tripped at ${pct(level)}, remains latched`);
    return;
  }
  const { actuator, behavior } = resolveActuator(rule, sim);
  behavior.command(actuator, 1, rule.rampTimeSec);
  logEvent(rule, sim.t, `reset — conveyor commanded back to full speed (ramping over ${rule.rampTimeSec}s)`);
  rule.phase = "recovering";
}

// Auto-stop on not running (issue #47 — the FD's own reverse-direction PI
// "52.604.E00 not running" on both packaging drum feeders, §5, 1 s delay):
// the mirror image of autoStartOnRunning above, and deliberately unlike
// every trip kind in this file — the FD classifies this as a plain Process
// Interlock ("prevents start"), not a Trip, so it is not latched: it
// toggles the feeder's run permit back on the instant the conveyor is
// confirmed running again, exactly the way the real PI would, with no
// operator reset in between. Commands `runPermit` (behaviors.js), never
// `enabled` — the source selector (setSource, engine.js) owns `enabled`
// exclusively, and layering this rule onto the same field would have the
// two silently fight over which feeder is actually meant to run.
//   running -> [conveyor not confirmedRunning] -> armed -> [delay elapses,
//   runPermit false] -> stopped -> [conveyor confirmedRunning again] -> running
function initAutoStopOnNotRunning(cfg) {
  return {
    kind: "autoStopOnNotRunning",
    id: cfg.id,
    sensorId: cfg.sensor.machine,
    actuatorId: cfg.action.machine,
    signalDelaySec: cfg.signalDelaySec,
    phase: "running",
    fireAt: null,
    log: [],
  };
}
function stepAutoStopOnNotRunning(rule, sim) {
  const running = readConfirmedRunning(sim.machines, rule.sensorId);
  const { actuator, behavior } = resolveActuator(rule, sim);

  if (running) {
    if (rule.phase !== "running") {
      behavior.setRunPermit(actuator, true);
      logEvent(rule, sim.t, `conveyor confirmed running — feeder re-enabled`);
    }
    rule.phase = "running";
    rule.fireAt = null;
    return;
  }

  if (rule.phase === "running") {
    rule.phase = "armed";
    rule.fireAt = sim.t + rule.signalDelaySec;
  }
  if (rule.phase === "armed" && sim.t >= rule.fireAt) {
    behavior.setRunPermit(actuator, false);
    logEvent(rule, sim.t, `conveyor not running — feeder stopped`);
    rule.phase = "stopped";
    rule.fireAt = null;
  }
}
// Reset: a no-op, same reasoning as resetAutoStartOnRunning — a plain PI
// self-clears the instant its own condition clears (see stepAutoStopOnNotRunning's
// own `running` branch), so there is nothing here for a SCADA reset to do.
function resetAutoStopOnNotRunning() {}

// One dispatch table entry per rule kind (issue #45's own instruction:
// latching belongs in the control layer once, so every kind inherits the
// reset mechanism through this registry rather than resetTrips branching on
// kind itself). Most kinds do real work in their `reset`; two (the pair of
// plain PIs, autoStartOnRunning and autoStopOnNotRunning) are a deliberate
// no-op, not a missing case.
const CONTROL_KINDS = {
  thresholdTrip: { init: initThresholdTrip, step: stepThresholdTrip, reset: resetThresholdTrip },
  twoStageThrottle: { init: initTwoStageThrottle, step: stepTwoStageThrottle, reset: resetTwoStageThrottle },
  holdNextBatch: { init: initHoldNextBatch, step: stepHoldNextBatch, reset: resetHoldNextBatch },
  autoStartOnRunning: { init: initAutoStartOnRunning, step: stepAutoStartOnRunning, reset: resetAutoStartOnRunning },
  thresholdStopTrip: {
    init: initThresholdStopTrip, step: stepThresholdStopTrip, reset: resetThresholdStopTrip,
    disarm: disarmThresholdStopTrip,
  },
  autoStopOnNotRunning: { init: initAutoStopOnNotRunning, step: stepAutoStopOnNotRunning, reset: resetAutoStopOnNotRunning },
};

// Arming (issue #47): the FD qualifies four of the packaging conveyor's own
// destination interlocks "if selected" (§5) — a full Concetti pre-bin must
// not trip anything while the line is running to the Flexicon. This is a
// property of the *rule* (an optional `armedWhen` on its line-data config),
// evaluated fresh against one or more named router-family machines' current
// `selected` port every tick, not a branch written inside any one rule
// kind's own step function — so any future interlock can opt in the same
// way, on any router or routedTransportDelay node, with no CONTROL_KINDS
// change. `armedWhen` is always a list of `{ machine, port }` conditions,
// ALL of which must currently hold — a metal bin's own trip needs this: it
// is only truly "selected" when *both* the conveyor's own outlet is the
// shared outload port *and* the diverter downstream of it points at that
// specific bin, since a presenter staging a bin's level via its own slider
// while routed to Concetti must never trip the (unrelated) conveyor. A rule
// with no `armedWhen` at all (every interlock that predates this) is always
// armed, unchanged.
function isArmed(rule, sim) {
  if (!rule.armedWhen) return true;
  return rule.armedWhen.every(({ machine, port }) => sim.machines.get(machine)?.selected === port);
}

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
  return (line.interlocks ?? []).map((cfg) => {
    const rule = CONTROL_KINDS[cfg.kind ?? "thresholdTrip"].init(cfg);
    // Carried onto the runtime rule unchanged (issue #47) rather than read
    // fresh off `cfg` each tick, matching every other config field this
    // file already copies into the rule at init time.
    if (cfg.armedWhen) rule.armedWhen = cfg.armedWhen;
    return rule;
  });
}

// A disarmed rule neither trips nor logs (issue #47's own acceptance
// criterion, read literally): skipping `step` entirely also skips
// stepRuleInstruments, so a disarmed rule's own LSH/LSL dot and "set point
// reached" log line freeze at whatever they last read while armed, rather
// than tracking a level the real PLC isn't scanning against either — the
// FD's own "if selected" wording describes the interlock not evaluating at
// all, not evaluating-but-suppressing its action.
//
// `disarm` (code-review finding on issue #47's own first landing): called
// every tick a rule is disarmed, not just on the falling edge — cheap and
// idempotent for every kind that implements it (see e.g.
// disarmThresholdStopTrip's own `if (rule.phase === "armed")` guard), so no
// separate "was this armed last tick" bookkeeping is needed here. Optional
// on CONTROL_KINDS: only a kind with a pending, not-yet-committed timer
// that `armedWhen` could freeze needs one at all (see disarmThresholdStopTrip's
// own comment for why that specific staleness is a real bug, not a
// theoretical one).
export function stepControl(sim) {
  for (const rule of sim.control) {
    if (!isArmed(rule, sim)) {
      CONTROL_KINDS[rule.kind].disarm?.(rule, sim);
      continue;
    }
    CONTROL_KINDS[rule.kind].step(rule, sim);
  }
}

// The SCADA reset (issue #45): a single command that sweeps every rule on
// the line, clearing whichever ones are currently latched — the plant
// control, distinct from resetSim's t=0 rebuild (engine.js), and the only
// way any of the four rule kinds above ever exits its own terminal phase
// now that none of them auto-recovers. Each kind's own `reset` decides for
// itself whether it has anything latched and whether the underlying
// condition has actually cleared; this just dispatches to all of them,
// exactly as stepControl dispatches `step` — one rule kind added here means
// one CONTROL_KINDS entry, never a branch added to this loop.
export function resetTrips(sim) {
  for (const rule of sim.control) {
    CONTROL_KINDS[rule.kind].reset(rule, sim);
  }
}

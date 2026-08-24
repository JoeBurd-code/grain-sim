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
import { m3PerSecToTPerHour, simatekFeedRateTph, tPerHourToM3PerSec } from "./units";

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
// cause-and-effect matrix names LSH0 as the stop stage's switch — the slow
// stage is an engineer-described addition with no physical instrument tag of
// its own (issue #22; superseded on the real line by gradedFeedSchedule,
// issue #60, but this kind stays a generic, independently reusable primitive).
const INSTRUMENT_FIELDS = {
  thresholdTrip: { LSH: "highSetpoint", LSL: "lowSetpoint" },
  twoStageThrottle: { LSH: "stopSetpoint", LSL: "lowSetpoint" },
  holdNextBatch: { LSH: "highSetpoint", LSL: "lowSetpoint" },
  thresholdStopTrip: { LSH: "highSetpoint", LSL: "lowSetpoint" },
  // Issue #58: the first rule kind with three instrument codes. LSHH sits
  // above LSH (see gradedFeedSchedule's own comment below) — both read
  // high-direction, handled by instrumentReadings' own `startsWith("LSH")`
  // check rather than an exact-match on "LSH" the way every earlier kind
  // only ever needed.
  gradedFeedSchedule: { LSL: "lowSetpoint", LSH: "highSetpoint", LSHH: "highHighSetpoint" },
  // bufferBinHighTrip's own LSH/LSL/LSHH split (on request), same three-code
  // shape as gradedFeedSchedule above but over hysteresisValve's binary
  // open/closed bands rather than continuous speed/gate ones.
  hysteresisValve: { LSL: "lowSetpoint", LSH: "highSetpoint", LSHH: "highHighSetpoint" },
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
    const tripped = code.startsWith("LSH") ? level >= setpoint : level <= setpoint;
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

// Issue #60: primes each gradedFeedSchedule rule's actuators (the elevator,
// plus one feeder or more — issue #61's own array-valued action.feeder) to
// its starting band's own (speedFraction, gateFraction) targets, snapped
// rather than ramped. Every other kind's fixed starting phase (thresholdTrip's
// "open", twoStageThrottle's "full", ...) happens to already match its
// actuator's own generic default (fully open / full speed), so nothing else
// in this file has ever needed a priming step for actuator state — only for
// instruments (primeInstruments above). gradedFeedSchedule breaks that
// coincidence: the bin always starts empty (issue #55), so the rule always
// starts already "in" the boost band (initGradedFeedSchedule's own comment)
// without ever arming into it, and boost's real target is the real line's
// own derived (speedFraction, gateFraction) pair, not the actuators' shared
// (1, 1) default. Without this, the elevator/feeder would sit at that (1, 1)
// default — and the continuous rate derivation (stepFeedRateDerivation
// below) would compute way more than the boost band's own intended TPH from
// it — until the level first crossed out of and back into boost for real.
export function primeFeedSchedules(control, machines) {
  for (const rule of control) {
    if (rule.kind !== "gradedFeedSchedule") continue;
    const band = rule[rule.phase];
    const elevator = machines.get(rule.actuatorId);
    elevator.throttleFraction = band.speedFraction;
    elevator.throttleTarget = band.speedFraction;
    for (const feederId of rule.feederIds) {
      const feeder = machines.get(feederId);
      feeder.gateThrottleFraction = band.gateFraction;
      feeder.gateThrottleTarget = band.gateFraction;
    }
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

// Hysteresis valve + latched high-high trip (bufferBinHighTrip, on request:
// LSH closes the valve live and non-latching, reopening again the instant
// the level clears LSL — ordinary bang-bang float-valve control, the
// opposite of thresholdTrip's own latch — while a new LSHH is the real
// trip, latched exactly like every other trip kind in this file, needing
// RESET TRIPS. Structurally this is gradedFeedSchedule's own two-tier shape
// (live bands underneath, one latched trip on top) collapsed from three
// continuous speed/gate bands down to two binary open/closed states on a
// single open/close valve — this kind's "band" is quantized to {open,
// closed}, and unlike gradedFeedSchedule's bandForLevel (a pure function of
// level: three fixed cutoffs always land the same band regardless of
// direction), a two-state open/closed valve needs actual hysteresis memory
// — hysteresisTarget below takes the *current* settled band as an input,
// not just the level, so the dead zone between LSL and LSH holds whichever
// state it was already in rather than being pinned to one side of a single
// cutoff.
//
//   open <-> closed -- [level >= highHighSetpoint, from any non-tripped
//   phase] --> armingTrip -> [delay elapses, command close] -> stopping ->
//   [settles] -> tripped
//
// Movement between open/closed arms through armingOpen/armingClose, exactly
// like gradedFeedSchedule's own armingBoost/armingNormal/armingThrottle:
// cancellable if the level recrosses back before the delay fires (nothing
// was ever actually commanded). Unlike gradedFeedSchedule's three bands,
// there's no third state to ever re-target an in-flight arm toward — with
// only {open, closed}, "the level moved again" and "the level returned to
// the settled band" are the same event, so this kind has no re-target
// branch. The LSHH trip is not cancellable — once armed, it always fires
// and then latches, the same convention every other trip kind in this file
// follows (ADR 0006).
function hysteresisTarget(rule, level, currentBand) {
  if (currentBand === "open" && level >= rule.highSetpoint) return "closed";
  if (currentBand === "closed" && level <= rule.lowSetpoint) return "open";
  return currentBand;
}
function initHysteresisValve(cfg) {
  return {
    kind: "hysteresisValve",
    id: cfg.id,
    sensorId: cfg.sensor.machine,
    actuatorId: cfg.action.machine,
    lowSetpoint: cfg.lowSetpoint,
    highSetpoint: cfg.highSetpoint,
    highHighSetpoint: cfg.highHighSetpoint,
    signalDelaySec: cfg.signalDelaySec,
    rampTimeSec: cfg.action.rampTimeSec,
    // The real line always starts empty (issue #55), so "open" — the band
    // level 0 falls in — is always the correct starting phase, same
    // reasoning gradedFeedSchedule's own fixed starting phase relies on.
    phase: "open",
    settledBand: "open",
    fireAt: null,
    log: [],
  };
}
function stepHysteresisValve(rule, sim) {
  const level = readLevel(sim.machines, rule.sensorId);
  stepRuleInstruments(rule, level, sim);

  if (rule.phase === "tripped") return; // latched; only resetTrips moves this rule now

  const { actuator, behavior } = resolveActuator(rule, sim);

  // LSHH always wins, immediately, from any non-tripped phase — including
  // cancelling a live open/close arm already in flight — same convention as
  // gradedFeedSchedule's own LSHH.
  if (level >= rule.highHighSetpoint && rule.phase !== "armingTrip" && rule.phase !== "stopping") {
    rule.phase = "armingTrip";
    rule.fireAt = sim.t + rule.signalDelaySec;
    logEvent(rule, sim.t, `high-high set point reached at ${pct(level)} — trip armed`);
  }

  if (rule.phase === "armingTrip") {
    if (sim.t >= rule.fireAt) {
      behavior.command(actuator, "close", rule.rampTimeSec);
      logEvent(rule, sim.t, `valve commanded closed (ramping over ${rule.rampTimeSec}s) — high-high trip`);
      rule.phase = "stopping";
      rule.fireAt = null;
    }
    return;
  }
  if (rule.phase === "stopping") {
    if (behavior.isSettled(actuator)) rule.phase = "tripped";
    return;
  }
  if (rule.phase === "recovering") {
    if (!behavior.isSettled(actuator)) return;
    rule.phase = rule.settledBand;
  }

  const targetBand = hysteresisTarget(rule, level, rule.settledBand);

  if (rule.phase === "open" || rule.phase === "closed") {
    if (targetBand !== rule.phase) {
      rule.phase = targetBand === "closed" ? "armingClose" : "armingOpen";
      rule.fireAt = sim.t + rule.signalDelaySec;
      logEvent(rule, sim.t, `${targetBand === "closed" ? "LSH" : "LSL"} set point reached at ${pct(level)} — valve ${targetBand === "closed" ? "close" : "reopen"} armed`);
    }
    return;
  }

  // armingClose / armingOpen: only {open, closed} exist, so the level
  // returning to the settled band is the only way to cancel — there's no
  // third band to ever re-target toward.
  if (targetBand === rule.settledBand) {
    // Nothing was ever actually commanded differently — cancel instantly and
    // silently, same reasoning as gradedFeedSchedule's own cancel branch.
    rule.phase = rule.settledBand;
    rule.fireAt = null;
    return;
  }
  if (sim.t >= rule.fireAt) {
    const armTarget = rule.phase === "armingClose" ? "closed" : "open";
    behavior.command(actuator, armTarget === "closed" ? "close" : "open", rule.rampTimeSec);
    logEvent(rule, sim.t, `valve commanded ${armTarget} (ramping over ${rule.rampTimeSec}s)`);
    rule.settledBand = armTarget;
    rule.phase = armTarget;
    rule.fireAt = null;
  }
}
// Reset (issue #45's own latch convention): only "tripped" is eligible,
// gated on the same high-high set point that armed it. Clearing it resumes
// whichever live band the level currently implies, treating the valve's own
// forced-closed state through the trip as if "closed" had been the settled
// band the whole time — so a level still sitting in the LSL..LSH dead zone
// stays closed on reset (matching a real bang-bang controller resuming from
// a hard stop: it doesn't reopen until the level actually clears LSL), while
// one that's already cleared LSL reopens immediately. Commanded immediately,
// no arm/delay phase, same reasoning as resetGradedFeedSchedule's own
// recovery path: no FD or worksheet number backs a delay here, unlike the
// rising trip itself.
function resetHysteresisValve(rule, sim) {
  if (rule.phase !== "tripped") return;
  const level = readLevel(sim.machines, rule.sensorId);
  if (level >= rule.highHighSetpoint) {
    logEvent(rule, sim.t, `reset commanded — high-high set point still tripped at ${pct(level)}, remains latched`);
    return;
  }
  const targetBand = hysteresisTarget(rule, level, "closed");
  const { actuator, behavior } = resolveActuator(rule, sim);
  behavior.command(actuator, targetBand === "closed" ? "close" : "open", rule.rampTimeSec);
  logEvent(rule, sim.t, `reset — valve commanded ${targetBand} (ramping over ${rule.rampTimeSec}s)`);
  rule.settledBand = targetBand;
  rule.phase = "recovering";
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
// same convention as any rule whose sensor and actuator are different
// machines (e.g. gradedFeedSchedule's own "elevator commanded to stop" living
// on the pre-bin's own popup, not the elevator's). A presenter looking for
// "why did the feeder start" finds it on the elevator's popup, since the
// elevator's own state is what the crossing/trip is about. (This kind's own
// real-line use, treatDrumFeeder auto-starting on treatingElevator, was
// superseded by gradedFeedSchedule's continuous feed-rate derivation —
// issue #60 — but it stays a generic, independently reusable primitive.)
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

// Graded feed-rate schedule + latched high-high trip (issue #58 — LSHH
// replaces LSH as the sole trip point on the Concetti/Treater pre-bins; LSL
// and LSH become a live, non-latching feed-rate schedule instead, issue #56).
// Three bands track the sensor's live level freely in *both* directions —
// boost below LSL, normal between LSL and LSH, throttle between LSH and
// LSHH — each commanding both actuators (the elevator's speed-fraction
// throttle and the feeder's gate-fraction throttle) to that band's own
// (speedFraction, gateFraction) pair: the real Speed% x Gate% mechanism the
// plant's own Simatek calculator models (units.js, issue #57), not an
// abstract rate. LSHH alone trips — an instant, latched command exactly like
// every other Trip kind in this file (ADR 0006) — commanding only the
// elevator to a full stop (the FD's own trip target, per issue #56; the
// gate is left wherever the schedule last set it). This is this file's first
// deliberate exception to ADR 0006's "everything latches": three of this
// kind's four phases don't, with one that still does layered on top.
//
//   boost <-> normal <-> throttle -- [level >= highHighSetpoint, from any
//   non-tripped phase] --> armingTrip -> [delay elapses, command elevator
//   stop] -> stopping -> [settles] -> tripped
//
// Movement between bands, either direction, arms through one of three
// "arming<Band>" phases (armingBoost/armingNormal/armingThrottle) rather
// than a phase per direction pair — since bands move freely both ways,
// "arming toward normal" means the same thing whether the level rose out of
// boost or fell out of throttle. Unlike every latching kind's own arm, this
// one is cancellable: `settledBand` remembers which band is actually
// commanded right now, so an arm whose target band matches it again before
// the delay fires never really changed anything and reverts instantly and
// silently (mirrors disarmThresholdStopTrip's own "nothing observable
// happened yet" reasoning), while an arm the level carries past to a third
// band re-targets with a fresh delay rather than firing toward a target the
// level has since left, or freezing.
const FEED_SCHEDULE_BANDS = ["boost", "normal", "throttle"];
const FEED_SCHEDULE_ARM_PHASE = { boost: "armingBoost", normal: "armingNormal", throttle: "armingThrottle" };
const FEED_SCHEDULE_ARM_TARGET = { armingBoost: "boost", armingNormal: "normal", armingThrottle: "throttle" };

function bandForLevel(rule, level) {
  if (level < rule.lowSetpoint) return "boost";
  if (level < rule.highSetpoint) return "normal";
  return "throttle";
}
// Issue #61: `rule.feederIds` holds one entry for every rule so far
// (`preBinFeedSchedule`'s single `treatDrumFeeder`), or two for the Concetti
// pre-bin's schedule, which commands both `inletDrumFeeder1`/`2` uniformly
// since only one is ever `enabled` at a time (the source selector, issue
// #46) — the disabled one's own `enabled: false` already zeroes its
// capacityAvailable regardless of gate, so commanding it too is harmless,
// and it's simpler than tracking which feeder is currently live here.
function resolveFeeders(rule, sim) {
  return rule.feederIds.map((feederId) => {
    const feeder = sim.machines.get(feederId);
    return { feeder, behavior: BEHAVIORS[feeder.kind] };
  });
}
// Shared by commandBand's own step-path wording and resetGradedFeedSchedule's
// "reset — " wording, so the two log messages' targets string never drifts
// apart from each other.
function formatBandTargets(band) {
  return `${Math.round(band.speedFraction * 100)}% speed / ${Math.round(band.gateFraction * 100)}% gate`;
}
// Issues both actuator commands for a band, returning the band config so the
// caller (commandBand below, or resetGradedFeedSchedule) can word its own
// log entry — split out so the reset path can prefix "reset —" rather than
// getting this function's own step-path wording.
function commandBandTargets(rule, sim, bandName) {
  const band = rule[bandName];
  const { actuator, behavior } = resolveActuator(rule, sim);
  behavior.command(actuator, band.speedFraction, band.rampTimeSec);
  for (const { feeder, behavior: feederBehavior } of resolveFeeders(rule, sim)) {
    feederBehavior.commandGate(feeder, band.gateFraction, band.rampTimeSec);
  }
  return band;
}
function commandBand(rule, sim, bandName) {
  const band = commandBandTargets(rule, sim, bandName);
  logEvent(rule, sim.t, `feed schedule commanded to ${bandName} (${formatBandTargets(band)})`);
}
function isBandSettled(rule, sim) {
  const { actuator, behavior } = resolveActuator(rule, sim);
  return (
    behavior.isSettled(actuator) &&
    resolveFeeders(rule, sim).every(({ feeder, behavior: feederBehavior }) => feederBehavior.isSettledGate(feeder))
  );
}
function initGradedFeedSchedule(cfg) {
  return {
    kind: "gradedFeedSchedule",
    id: cfg.id,
    sensorId: cfg.sensor.machine,
    actuatorId: cfg.action.elevator.machine,
    // Issue #61: `action.feeder` is a single `{ machine }` for every rule so
    // far, or an array of them for a schedule that must command more than
    // one feeder uniformly — see resolveFeeders' own comment above.
    feederIds: Array.isArray(cfg.action.feeder) ? cfg.action.feeder.map((f) => f.machine) : [cfg.action.feeder.machine],
    lowSetpoint: cfg.lowSetpoint,
    highSetpoint: cfg.highSetpoint,
    highHighSetpoint: cfg.highHighSetpoint,
    boost: { ...cfg.boost },
    normal: { ...cfg.normal },
    throttle: { ...cfg.throttle },
    trip: { ...cfg.trip },
    // The real line always starts empty (issue #55), so "boost" — the band
    // level 0 falls in — is always the correct starting phase, the same
    // reasoning every other kind's fixed starting phase above already
    // relies on (e.g. thresholdTrip's "open").
    phase: "boost",
    settledBand: "boost",
    fireAt: null,
    log: [],
  };
}
function stepGradedFeedSchedule(rule, sim) {
  const level = readLevel(sim.machines, rule.sensorId);
  stepRuleInstruments(rule, level, sim);

  if (rule.phase === "tripped") return; // latched; only resetTrips moves this rule now

  // Resolved once, up front, exactly like every other kind's own step
  // function — only the trip's two phases below actually need it, but
  // resolving it unconditionally here (rather than once per branch) matches
  // this file's established convention.
  const { actuator, behavior } = resolveActuator(rule, sim);

  // LSHH always wins, immediately, from any non-tripped phase — including
  // cancelling a band arm already in flight — exactly like every other Trip
  // kind in this file: once armed, a delayed action always fires, whatever
  // the bands underneath it are doing.
  if (level >= rule.highHighSetpoint && rule.phase !== "armingTrip" && rule.phase !== "stopping") {
    rule.phase = "armingTrip";
    rule.fireAt = sim.t + rule.trip.delaySec;
    logEvent(rule, sim.t, `high-high set point reached at ${pct(level)} — trip armed`);
  }

  if (rule.phase === "armingTrip") {
    if (sim.t >= rule.fireAt) {
      behavior.command(actuator, 0, rule.trip.rampTimeSec);
      logEvent(rule, sim.t, `elevator commanded to stop (ramping over ${rule.trip.rampTimeSec}s) — high-high trip`);
      rule.phase = "stopping";
      rule.fireAt = null;
    }
    return;
  }
  if (rule.phase === "stopping") {
    if (behavior.isSettled(actuator)) rule.phase = "tripped";
    return;
  }
  if (rule.phase === "recovering") {
    if (!isBandSettled(rule, sim)) return;
    rule.phase = rule.settledBand;
  }

  const targetBand = bandForLevel(rule, level);

  if (FEED_SCHEDULE_BANDS.includes(rule.phase)) {
    if (targetBand !== rule.phase) {
      rule.phase = FEED_SCHEDULE_ARM_PHASE[targetBand];
      rule.fireAt = sim.t + rule[targetBand].delaySec;
      logEvent(rule, sim.t, `${targetBand} band reached at ${pct(level)} — feed schedule armed`);
    }
    return;
  }

  const armTarget = FEED_SCHEDULE_ARM_TARGET[rule.phase];
  if (!armTarget) return; // defensive; every reachable phase is handled above
  if (targetBand === rule.settledBand) {
    // Nothing was ever actually commanded differently — cancel instantly and
    // silently, same reasoning as disarmThresholdStopTrip's own comment.
    rule.phase = rule.settledBand;
    rule.fireAt = null;
    return;
  }
  if (targetBand !== armTarget) {
    // The level moved again before this arm fired: re-target with a fresh
    // delay rather than firing toward a target it's since left.
    rule.phase = FEED_SCHEDULE_ARM_PHASE[targetBand];
    rule.fireAt = sim.t + rule[targetBand].delaySec;
    logEvent(rule, sim.t, `${targetBand} band reached at ${pct(level)} — feed schedule re-armed`);
    return;
  }
  if (sim.t >= rule.fireAt) {
    commandBand(rule, sim, armTarget);
    rule.settledBand = armTarget;
    rule.phase = armTarget;
    rule.fireAt = null;
  }
}
// Reset (issue #45's own latch convention, applied to this new kind): only
// "tripped" is eligible, gated on the same high-high set point that armed
// it. Clearing it resumes whichever band the live level currently falls
// into — most likely throttle, since LSHH's own clearing threshold sits
// above LSH — never a fixed "full"/"boost" state, per issue #58's own
// acceptance criteria. Commanded immediately, no arm/delay phase, same
// reasoning as resetTwoStageThrottle's own recovery path: no FD or
// worksheet number backs a delay here, unlike the rising trip itself.
function resetGradedFeedSchedule(rule, sim) {
  if (rule.phase !== "tripped") return;
  const level = readLevel(sim.machines, rule.sensorId);
  if (level >= rule.highHighSetpoint) {
    logEvent(rule, sim.t, `reset commanded — high-high set point still tripped at ${pct(level)}, remains latched`);
    return;
  }
  const targetBand = bandForLevel(rule, level);
  const band = commandBandTargets(rule, sim, targetBand);
  logEvent(rule, sim.t, `reset — feed schedule resumes at ${targetBand} (${formatBandTargets(band)})`);
  rule.settledBand = targetBand;
  rule.phase = "recovering";
}
// Disarm (mirrors disarmThresholdStopTrip's own reasoning): only the phases
// with a pending, not-yet-committed timer — the three band arms and the trip
// arm — have anything to cancel; "stopping"/"recovering"/"tripped" each
// represent a command already issued and must survive being disarmed
// unchanged. Not exercised by any `armedWhen` config on the real line (the
// real preBinFeedSchedule rule, issue #60, has none — nothing routes away
// from the treating zone's own dedicated upstream path), but every other
// kind with a cancellable arm declares this unconditionally rather than
// waiting for a config that happens to use it — see stepControl's own
// comment on why.
function disarmGradedFeedSchedule(rule) {
  if (FEED_SCHEDULE_ARM_TARGET[rule.phase] || rule.phase === "armingTrip") {
    rule.phase = rule.settledBand;
    rule.fireAt = null;
  }
}

// Continuous feed-rate derivation (issue #59): what actually makes a dial
// change visible in the feeder's commanded rate. Every rule kind above is a
// phase machine — a sensor crossing a setpoint arms a delayed command — but
// this isn't one: it has no sensor, no setpoint, no phase, and no delay. It
// reads two actuators' *live effective* values (issue #56's own wording:
// elevator speed dial x elevator interlock throttle, feeder gate dial x
// feeder interlock throttle — exactly the (speedFraction x throttleFraction,
// gateFraction x gateThrottleFraction) pair gradedFeedSchedule's own bands
// already command above) straight through #57's TPH formula, and writes the
// result as the feeder's commanded rate, unconditionally, every tick this
// function runs. That's why it's not folded into CONTROL_KINDS: stepControl's
// own dispatch loop below skips a disarmed rule's `step` entirely (isArmed),
// which is exactly the gating this derivation must never be subject to — a
// presenter's slider drag has to show up in the flow rate whether or not any
// interlock governing that elevator/feeder pair happens to be armed this
// tick. So it lives as its own top-level list on `sim`
// (`sim.feedRateDerivations`), stepped by stepFeedRateDerivation, called
// unconditionally from stepSim (engine.js) — never gated on a level
// threshold or a rule's phase.
//
// `line.feedRateDerivations` held no entries until issue #60 wired the real
// treatingElevator/treatDrumFeeder pair onto it — this function's own tests
// (control.test.js) still verify it against a fabricated elevator/feeder
// pair, with no gradedFeedSchedule rule involved at all, per issue #59's own
// "verified standalone, independent of the rule kind in #58" acceptance
// criterion; the real-line wiring gets its own coverage in engine.test.js.
export function initFeedRateDerivations(line) {
  return (line.feedRateDerivations ?? []).map((cfg) => ({
    id: cfg.id,
    elevatorId: cfg.elevator.machine,
    feederId: cfg.feeder.machine,
  }));
}

// Both transportDelay and routedTransportDelay (behaviors.js) carry the same
// speedFraction/throttleFraction pair, and a gated meteredFeeder carries the
// same-shaped gateFraction/gateThrottleFraction pair (issue #57) — one
// shared field convention across every kind this can ever link, so this
// reads the fields directly rather than through a per-kind behavior method,
// same as control.test.js's own fabricated shells already read them back
// directly to assert on.
//
// Deliberately unguarded by `manualOverride` — unlike stepAutoStartOnRunning
// above, the one other place this file commands a feeder's rate directly.
// That guard exists so a one-shot command doesn't clobber a presenter's own
// dial; this step is the opposite of one-shot; per issue #56's own wording
// it must overwrite the feeder's rate "with or without an active schedule
// band overriding anything", every tick, for as long as a link exists.
// Under this rule kind's own architecture the presenter's live dial is
// `gateFraction`, read on the line above, not the feeder's `rate` field
// this function writes — so there is no presenter intent here to protect.
// Nor does it log (contrast every other actuator command in this file):
// logging every tick would flood the presenter-facing event log with
// nothing new to report, so this is an intentional exception, not simply
// forgotten.
export function stepFeedRateDerivation(sim) {
  for (const link of sim.feedRateDerivations) {
    const elevator = sim.machines.get(link.elevatorId);
    const feeder = sim.machines.get(link.feederId);
    const effectiveSpeed = elevator.speedFraction * elevator.throttleFraction;
    const effectiveGate = feeder.gateFraction * feeder.gateThrottleFraction;
    const tph = simatekFeedRateTph(effectiveSpeed, effectiveGate);
    BEHAVIORS[feeder.kind].command(feeder, tPerHourToM3PerSec(tph));
  }
}

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
  gradedFeedSchedule: {
    init: initGradedFeedSchedule, step: stepGradedFeedSchedule, reset: resetGradedFeedSchedule,
    disarm: disarmGradedFeedSchedule,
  },
  hysteresisValve: { init: initHysteresisValve, step: stepHysteresisValve, reset: resetHysteresisValve },
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

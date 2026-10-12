// The control layer: sensors reading an accumulator's level, the line's
// interlocks and machine rules, and the per-rule event log a machine's popup
// surfaces. One `line.interlocks` or `line.machineRules` entry becomes one
// runtime rule instance here; engine.js calls `stepControl` once per tick,
// after the flow pass, so a command issued this tick affects the actuator's
// behaviour starting next tick, exactly like any other engine state change.
//
// A rule declares a `kind`, resolved against `CONTROL_KINDS` below exactly
// as a machine's `sim.kind` resolves against behaviors.js's `BEHAVIORS`.
// Every interlock is a sentence (sentenceInterlock.js, issue #85, ADR 0009).
// The two other kinds are machine rules, which a sentence cannot express:
// the graded feed schedule (gradedFeedSchedule) and the treater's "hold the
// next batch" (holdNextBatch). See docs/OPEN_QUESTIONS.md for why each stays.
import { BEHAVIORS } from "./behaviors";
import { SENTENCE_KIND } from "./sentenceInterlock";
import { SWITCH_FIELDS } from "../line/interlocks";
import { SPEED_DIAL, GATE_DIAL, dialEffective } from "./dial";
import { simatekFeedRateTph, tPerHourToM3PerSec } from "./units";

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

// Issue #30: which of a machine rule's set point fields backs each ISA
// instrument code it exposes. Every code reads the same direction (issue
// #72, see instrumentReadings below), so this table only needs to say which
// field holds which code's set point. A sentence lists its own
// (`instrumentFields`), from the switches its parts name.
const INSTRUMENT_FIELDS = {
  holdNextBatch: { LSH: "highSetpoint", LSL: "lowSetpoint" },
  // Issue #58: LSHH sits above LSH (see gradedFeedSchedule's own comment
  // below). Both read high-direction.
  gradedFeedSchedule: { LSL: "lowSetpoint", LSH: "highSetpoint", LSHH: "highHighSetpoint" },
};

// Issue #72: which one of a rule's codes is its *latched trip* — the switch
// whose signal actually stops something and needs a SCADA reset. Everything
// else a rule exposes is live schedule or hysteresis, information rather
// than alarm, exactly the way the FD classifies the buffer bin's own LSL0
// ("Information" alarm class, in no interlock and no trip table —
// docs/PLC_FUNCTIONAL_DESCRIPTION.md §"There is no automatic reopen").
//
// This is deliberately keyed on the rule (its kind here, or a sentence's
// reset), not on the code's letters, and that is the whole point: LSH means two
// different things on this line. On the three vessels that carry an LSHH (issue
// #58) LSH was demoted to a feed-schedule boundary and LSHH became the sole
// trip, so LSH there is information. On treaterAfterBin, flexiconPreBin and the
// two metal bins there is no LSHH at all and LSH *is* the latched trip.
// Colouring by the letters would leave those four machines with no alarm
// indication at all at the exact moment they stop the line. See docs/adr/0007.
const ALARM_CODE = {
  holdNextBatch: "LSH",
  gradedFeedSchedule: "LSHH",
};

// Pure: which of a rule's instruments are signalling right now, given the
// sensor's current level. No memory of past state — a live setpoint or
// level change (e.g. a presenter's levelJump drag) is reflected the instant
// it's read, independent of `phase`/`fireAt`, which govern only the
// downstream actuator's delayed response.
//
// Issue #72: `signal` is the switch's contact, not "something is wrong". A
// level switch is a physical probe at a fixed height. It signals when grain
// covers it and falls silent when grain leaves it, and that is true whether
// it is mounted low or high in the vessel — so every code reads the one
// direction, `level >= setpoint`. This file used to read LSL backwards
// (`level <= setpoint`), which made a *dry* bin assert its low switch. The
// consequence of the fix is that a stocked bin now signals LSL and LSH at
// once, which is correct and needs no arbitration: nothing downstream reads
// these flags, and the feed bands come from bandForLevel's own ordered
// comparison of the raw level (see gradedFeedSchedule below).
//
// `alarm` says whether this code is the rule's latched trip (ALARM_CODE
// above). It is carried on the reading rather than recomputed by the render
// layer because only this layer knows the rule kind. See docs/adr/0007.
//
// Issue #83: a rule that lists its own `instrumentFields` (an interlock
// sentence, or a bin's display-only level switches) carries its own
// `alarmCode` too, since its role comes from its reset, not its kind.
export function instrumentReadings(rule, level) {
  const fields = rule.instrumentFields ?? INSTRUMENT_FIELDS[rule.kind] ?? {};
  const alarmCode = rule.instrumentFields ? rule.alarmCode : ALARM_CODE[rule.kind];
  const readings = {};
  for (const [code, field] of Object.entries(fields)) {
    const setpoint = rule[field];
    // Issue #73: a kind's table lists every code any rule of that kind
    // *can* expose, not every code each one does. concettiFeedSchedule no
    // longer carries a high-high set point of its own (the staged pause
    // sequence on the same bin owns LSHH now), so a rule that has no value
    // for a listed field simply doesn't publish that switch, rather than
    // publishing one reading "-" and permanently silent.
    if (setpoint == null) continue;
    readings[code] = { setpoint, signal: level >= setpoint, alarm: code === alarmCode };
  }
  return readings;
}

// Issue #84: one machine's lamps, from the readings of every rule that
// reads it. Two rules can read the same switch (both Concetti pre-bin LSHH
// sentences); the trip's reading wins, so the lamp stays red.
export function mergeInstruments(merged, readings) {
  const next = { ...merged };
  for (const [code, reading] of Object.entries(readings ?? {})) {
    if (!next[code]?.alarm) next[code] = reading;
  }
  return next;
}

// Stateful: folds instrumentReadings into the rule's own `instruments`,
// stamping a `pulseGen` counter that increments on every false->true edge —
// the one-time trip-pulse animation's cue, kept here rather than recomputed
// by the render layer, since only this layer knows the *previous* tick's
// signal state. Tolerates `rule.instruments` not existing yet (a rule's
// very first call, whether from initial priming or a fabricated test that
// never primes) by treating every code as previously silent.
//
// Issue #41: that crossing is also the one true moment an LSH/LSL event log
// entry belongs — logged here,
// centrally, once per crossing, independent of `rule.phase`. Before this,
// each phase machine below logged its own "set point reached" string from
// inside exactly one phase-gated branch (e.g. the old buffer bin rule's LSL
// only from its "closed" phase), so a rule whose high side never tripped — and so
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
    const rose = reading.signal && !prev?.signal;
    const fell = !reading.signal && prev?.signal === true;
    // Issue #72: only an alarm code's own make is worth animating. Green
    // schedule switches light and hold; the expanding ring is reserved for
    // the one event that stops the line, so a ring on screen means exactly
    // one thing. (`fell` never pulses: a trip clearing is not a fresh trip.)
    const pulseGen = rose && reading.alarm ? (prev?.pulseGen ?? 0) + 1 : (prev?.pulseGen ?? 0);
    next[code] = { code, ...reading, pulseGen };
    // Issue #72: each switch logs the one edge that is news, so the log
    // keeps exactly the volume and timing it had before the polarity fix.
    // A high switch is news when it makes (the bin has filled to it); a low
    // switch is news when it breaks (the bin has drained past it). Under the
    // old backwards reading, LSL's *make* was that same falling crossing, so
    // this is the same entry on the same tick, reworded from "set point
    // reached" to the contact state it now describes.
    const logged = code.startsWith("LSH") ? rose : fell;
    if (logged) {
      logEvent(rule, sim.t, `${code} ${reading.signal ? "ON" : "OFF"} at ${pct(level)} (setpoint ${pct(reading.setpoint)})`);
    }
  }
  rule.instruments = next;
}

// Seeds every rule's instrument state right after createSim builds `control`,
// so the very first published snapshot (before the sim has ever ticked)
// already shows correct setpoint/signal values instead of nothing — the
// same reasoning as this file's own phase machines starting in a real,
// non-empty phase rather than an "uninitialized" one. Unlike stepRuleInstruments,
// this never stamps a pulse: starting the demo already past a set point is
// the initial condition, not a live trip the audience should see animate.
export function primeInstruments(control, machines) {
  for (const rule of control) {
    if (!rule.instrumentFields && !INSTRUMENT_FIELDS[rule.kind]) continue;
    const level = readLevel(machines, rule.sensorId);
    const readings = instrumentReadings(rule, level);
    rule.instruments = Object.fromEntries(
      Object.entries(readings).map(([code, reading]) => [code, { code, ...reading, pulseGen: 0 }])
    );
  }
}

// Issue #60: primes each gradedFeedSchedule rule's actuators (the elevator,
// plus one feeder or more — issue #61's own array-valued action.feeder) to its
// starting band's own (speedFraction, gateFraction) targets, snapped rather
// than ramped. Every other rule starts with its actuators at their own generic
// default (fully open / full speed), so nothing else in this file needs a
// priming step for actuator state, only for instruments (primeInstruments
// above). gradedFeedSchedule is different: the bin always starts empty (issue
// #55), so the rule always starts already "in" the boost band
// (initGradedFeedSchedule's own comment) without ever arming into it, and
// boost's real target is the real line's own derived (speedFraction,
// gateFraction) pair, not the actuators' shared (1, 1) default. Without this,
// the elevator/feeder would sit at that (1, 1) default — and the continuous
// rate derivation (stepFeedRateDerivation below) would compute way more than
// the boost band's own intended TPH from it — until the level first crossed out
// of and back into boost for real.
export function primeFeedSchedules(control, machines) {
  for (const rule of control) {
    if (rule.kind !== "gradedFeedSchedule") continue;
    const band = rule[rule.phase];
    const elevator = machines.get(rule.actuatorId);
    // Through the rule's own command slot (commandSlots.js), not a bare field
    // write: another authority's later command resolves against this one.
    BEHAVIORS[elevator.kind].command(elevator, band.speedFraction, 0, rule.id);
    elevator.throttleFraction = band.speedFraction;
    for (const feederId of rule.feederIds) {
      const feeder = machines.get(feederId);
      feeder.gateThrottleFraction = band.gateFraction;
      feeder.gateThrottleTarget = band.gateFraction;
    }
  }
}

// Hold-next-batch (issue #25, the treater after-bin's response to a full
// bin). A machine rule, not an interlock sentence (issue #85): see
// docs/OPEN_QUESTIONS.md. The actuator (a batchCycle machine's `blocked`
// gate, see behaviors.js) is a plain accept/block flag with no ramp to wait
// on, so commanding it takes effect immediately.
//   released -> [level >= highSetpoint] -> armed -> [delay elapses, command
//   hold] -> held
// Latches once armed: the hold always fires, even if the level dips back below
// highSetpoint before the delay elapses. "held" is terminal per issue #45 — the
// level falling back past lowSetpoint no longer releases the gate on its own;
// only resetHoldNextBatch below does, and only once the level has actually
// cleared. The batch-cycle behaviour itself is what guarantees a held gate
// never interrupts a batch already under way (see capacityAvailableBatchCycle)
// — this rule only ever decides when the gate opens and closes.
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
    behavior.command(actuator, true, rule.id); // issue #73: hold under this rule's own key
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
  behavior.command(actuator, false, rule.id);
  logEvent(rule, sim.t, `reset — treater released to start its next batch`);
  rule.phase = "released";
}

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
// "arming<Band>" phases (armingBoost/armingNormal/armingThrottle) rather than a
// phase per direction pair — since bands move freely both ways, "arming toward
// normal" means the same thing whether the level rose out of boost or fell out
// of throttle. Unlike every latching kind's own arm, this one is cancellable:
// `settledBand` remembers which band is actually commanded right now, so an arm
// whose target band matches it again before the delay fires never really
// changed anything and reverts instantly and silently (nothing observable has
// happened yet), while an arm the level carries past to a third band re-targets
// with a fresh delay rather than firing toward a target the level has since
// left, or freezing.
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
  behavior.command(actuator, band.speedFraction, band.rampTimeSec, rule.id);
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
    // Issue #73: absent on a schedule with no high-high stage — see
    // stepGradedFeedSchedule's own comment. Null rather than an empty
    // object so the guard there reads as "has a trip at all".
    trip: cfg.trip ? { ...cfg.trip } : null,
    // The real line always starts empty (issue #55), so "boost" — the band
    // level 0 falls in — is always the correct starting phase.
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
  // Issue #73: `trip` is now optional. The Concetti pre-bin's schedule has
  // no high-high stage of its own any more — its LSHH commands the staged
  // pause sequence (an interlock sentence since issue #84) on the same bin instead, which
  // stops the same conveyor but recovers by itself rather than latching.
  // The treater pre-bin's schedule is unchanged and still trips. A rule
  // with no `trip` simply never leaves its band machine, so every branch
  // below is unreachable for it.
  if (rule.trip && level >= rule.highHighSetpoint && rule.phase !== "armingTrip" && rule.phase !== "stopping") {
    rule.phase = "armingTrip";
    rule.fireAt = sim.t + rule.trip.delaySec;
    logEvent(rule, sim.t, `high-high set point reached at ${pct(level)} — trip armed`);
  }

  if (rule.phase === "armingTrip") {
    if (sim.t >= rule.fireAt) {
      behavior.command(actuator, 0, rule.trip.rampTimeSec, rule.id);
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
    // silently.
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
// Disarm: only the phases with a pending, not-yet-committed timer — the three
// band arms and the trip arm — have anything to cancel;
// "stopping"/"recovering"/"tripped" each represent a command already issued and
// must survive being disarmed unchanged. The real concettiFeedSchedule (issue
// #61) is disarmed whenever the conveyor routes away from Concetti, and the
// band it last commanded keeps holding in its own command slot on the new
// route. Whether it should release instead is an open question
// (docs/OPEN_QUESTIONS.md, "Command slots").
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
// This step overwrites the feeder's rate every tick: per issue #56's own wording
// it must overwrite the feeder's rate "with or without an active schedule
// band overriding anything", every tick, for as long as a link exists.
// Under this rule kind's own architecture the presenter's live dial is
// `gateFraction`, read on the line above, not the feeder's `rate` field
// this function writes — so there is no presenter intent here to protect.
// Nor does it log (contrast every other actuator command in this file):
// logging every tick would flood the presenter-facing event log with
// nothing new to report, so this is an intentional exception, not simply
// forgotten.
// Manual override (issue #63): each multiplicand resolves through its own
// dial independently (dial.js) — overriding the gate must not implicitly
// override the elevator's own effective speed, and vice versa, even though
// both feed into this one formula. The same `dialEffective` the elevator's
// own intake and chain speed use, so the feed rate and the chain always
// agree about how fast the elevator is running.
export function stepFeedRateDerivation(sim) {
  for (const link of sim.feedRateDerivations) {
    const elevator = sim.machines.get(link.elevatorId);
    const feeder = sim.machines.get(link.feederId);
    const effectiveSpeed = dialEffective(elevator, SPEED_DIAL);
    const effectiveGate = dialEffective(feeder, GATE_DIAL);
    const tph = simatekFeedRateTph(effectiveSpeed, effectiveGate);
    BEHAVIORS[feeder.kind].command(feeder, tPerHourToM3PerSec(tph));
  }
}

// Which phase(s) count as "latched, waiting on RESET TRIPS" per machine
// rule kind, the same phase each kind's `reset` checks at its top, exposed
// as a predicate so a presenter-facing "is anything tripped" indicator (the
// RESET TRIPS button's own pulse, issue #62) can ask without duplicating
// each kind's phase names. A sentence answers for itself (`latched`).
const LATCHED_PHASES = {
  holdNextBatch: new Set(["held"]),
  gradedFeedSchedule: new Set(["tripped"]),
};

// One dispatch table entry per rule kind (issue #45's own instruction:
// latching belongs in the control layer once, so every kind inherits the
// reset mechanism through this registry rather than resetTrips branching on
// kind itself).
const CONTROL_KINDS = {
  // Every interlock (sentenceInterlock.js, issue #82). Its level switches
  // (issue #83) are read here before it steps.
  sentence: {
    ...SENTENCE_KIND,
    step: (rule, sim) => {
      if (rule.instrumentFields) stepRuleInstruments(rule, readLevel(sim.machines, rule.sensorId), sim);
      SENTENCE_KIND.step(rule, sim);
    },
  },
  // The machine rules (`line.machineRules`).
  holdNextBatch: { init: initHoldNextBatch, step: stepHoldNextBatch, reset: resetHoldNextBatch },
  gradedFeedSchedule: {
    init: initGradedFeedSchedule, step: stepGradedFeedSchedule, reset: resetGradedFeedSchedule,
    disarm: disarmGradedFeedSchedule,
  },
  levelSwitches: { init: initLevelSwitches, step: stepLevelSwitches, reset: () => {} },
};

// Issue #83: a bin's level switches that no interlock reads, declared on the
// machine as `sim.levelSwitches: { LSL: 0.35 }`. The Flexicon pre-bin's LSL
// is one: the FD names the switch, but no interlock uses it. It still lights
// and logs like every other switch, and its popup slider still moves it, so
// it runs as a rule that only reads its switches and commands nothing.
function initLevelSwitches(machine) {
  const rule = {
    kind: "levelSwitches", id: `${machine.id}.levelSwitches`, sensorId: machine.id,
    instrumentFields: {}, alarmCode: null, phase: "clear", log: [],
  };
  for (const [code, setpoint] of Object.entries(machine.sim.levelSwitches)) {
    rule.instrumentFields[code] = SWITCH_FIELDS[code];
    rule[SWITCH_FIELDS[code]] = setpoint;
  }
  return rule;
}
function stepLevelSwitches(rule, sim) {
  stepRuleInstruments(rule, readLevel(sim.machines, rule.sensorId), sim);
}

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
  const seen = new Set();
  for (const rule of control) {
    for (const entry of rule.log) {
      const key = `${rule.sensorId} ${eventKey(entry)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ ...entry, machineId: rule.sensorId, machineName: machineNames.get(rule.sensorId) });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

// Issue #84: two rules that read one switch on one machine (both Concetti
// pre-bin LSHH sentences) each log its crossing, word for word, on the same
// tick. It is one event, so it is listed once.
const eventKey = (entry) => `${entry.t} ${entry.message}`;

// One machine's events, in time order, from the logs of every rule that
// reads it, with each event listed once.
export function mergeEvents(events, log) {
  const seen = new Set(events.map(eventKey));
  return [...events, ...log.filter((entry) => !seen.has(eventKey(entry)))].sort((a, b) => a.t - b.t);
}

// The machine rules first (issue #85), then the interlocks, then each bin's
// display-only level switches. A line arrives validated (validateLine), so
// every interlock is a sentence and every machine rule a known kind.
//
// Rules step in this order every tick, and a rule reads machine state that
// an earlier rule may have commanded the same tick. The machine rules go
// first because each is a setting the interlocks act on: a feed schedule's
// throttle is in place before the conveyor-running sentences read whether
// the conveyor runs, as it was before issue #85 moved the schedules out of
// `line.interlocks` (the golden line interlock baseline holds this order).
export function initControl(line) {
  const rules = [...(line.machineRules ?? []), ...(line.interlocks ?? [])].map((cfg) => {
    const rule = CONTROL_KINDS[cfg.kind].init(cfg);
    // Carried onto the runtime rule unchanged (issue #47) rather than read
    // fresh off `cfg` each tick, matching every other config field this
    // file already copies into the rule at init time.
    if (cfg.armedWhen) rule.armedWhen = cfg.armedWhen;
    return rule;
  });
  const switches = (line.machines ?? []).filter((m) => m.sim?.levelSwitches).map(initLevelSwitches);
  return [...rules, ...switches];
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
// idempotent for every kind that implements it, so no separate "was this
// armed last tick" bookkeeping is needed here. Optional on CONTROL_KINDS:
// only a kind with a pending, not-yet-committed timer that `armedWhen` could
// freeze needs one at all. A stale absolute `fireAt` would otherwise fire on
// the first tick after the rule is armed again.
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
// way a latched rule ever exits its own terminal phase. Each kind's own
// `reset` decides for
// itself whether it has anything latched and whether the underlying
// condition has actually cleared; this just dispatches to all of them,
// exactly as stepControl dispatches `step` — one rule kind added here means
// one CONTROL_KINDS entry, never a branch added to this loop.
export function resetTrips(sim) {
  for (const rule of sim.control) {
    CONTROL_KINDS[rule.kind].reset(rule, sim);
  }
}

// Read access (issue #62): whether any rule on the line is currently sitting
// in a latched phase — i.e. whether pressing RESET TRIPS would actually have
// something to do, per LATCHED_PHASES above. Purely a presenter-facing
// indicator (drives the RESET TRIPS button's own pulse); resetTrips itself
// never consults this, since each kind's own `reset` already re-checks the
// live condition regardless.
// A kind may instead answer for itself (`latched`, the interlock sentence).
export function hasLatchedTrip(sim) {
  return sim.control.some((rule) => CONTROL_KINDS[rule.kind].latched?.(rule) ?? LATCHED_PHASES[rule.kind]?.has(rule.phase));
}

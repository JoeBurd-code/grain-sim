// Utilities trip (issue #51): the plant-control cluster's third distinct way
// to stop the line, after a level-driven trip (control.js) and a presenter-
// initiated controlled stop (controlledStop.js). Three utility sequences —
// the red dust filter 52.808.S00, the cyclofan 52.807.S00 and the
// conditioning process compressor 51.900.S00 — are hard prerequisites for
// every machine on the line; any one of them stopping trips the whole line
// at 1 s. Modelling the three sequences themselves as machines would buy the
// demo nothing, since no product flows through them (docs/OPEN_QUESTIONS.md)
// — so this models only their aggregate consequence: a single presenter-
// facing health toggle, standing in for all three at once.
//
// Same latch shape as every trip in control.js (armed on the failing edge,
// always fires once armed, terminal until reset — see thresholdTrip's own
// header comment there) but aimed at *every* actuator on the line at once
// rather than one sensor's one actuator, which doesn't fit that file's
// one-rule-per-sensor/actuator shape — so this is its own module, the same
// way controlledStop.js is a second plant-control subsystem beside it. What
// it does share with control.js is the RESET TRIPS button itself
// (engine.js's resetTrips calls both) and the presenter's own mental model
// of "it latches, only a reset clears it" (issue #45).
//
// Unlike a controlled stop, this is total and immediate, not a drain: every
// actuator is commanded to stop in the same tick, wherever its material
// happens to be, exactly the FD's own definition of a trip (§5,
// docs/PLC_FUNCTIONAL_DESCRIPTION.md) — "product is left stranded wherever
// it is" is the acceptance criterion, not a bug to design around.
import { BEHAVIORS } from "./behaviors";

const TRIP_DELAY_SEC = 1; // FD: any one utility sequence stopping trips the line at 1 s
const TRIP_RAMP_SEC = 0; // immediate — a trip strands material, no ramp to protect
// Demo-pacing choice on the way back up, not an FD number — mirrors
// controlledStop.js's own VALVE_RAMP_SEC/THROTTLE_RAMP_SEC, reused here so a
// utilities recovery reads the same as every other plant-control resume on
// this line rather than snapping instantly back to full flow.
const RESUME_VALVE_RAMP_SEC = 6;
const RESUME_THROTTLE_RAMP_SEC = 2;

// One entry per actuator-bearing sim kind (the same five controlledStop.js
// names in its own header — accumulator/passThrough/splitter/router/
// terminalSink hold no actuator of their own and are untouched: freezing
// their neighbours freezes their throughput for free). `capture` reads
// whatever this kind's own "where should this actuator be, absent this
// trip" value is, *before* `stop` overwrites it, so `restore` can put it
// back exactly — not a blind "fully open/running" default the way
// controlledStop.js's own resume uses, because unlike a controlled stop
// (which never fires until everything upstream has already, genuinely
// drained) a utilities trip can catch an actuator mid-command from some
// other still-latched interlock, and restoring "fully running" regardless
// would silently un-latch that other trip too.
// Shared by transportDelay and routedTransportDelay (see their own TRIPPABLE
// entries below): both kinds' `command`/throttleTarget shape agrees exactly,
// so one factory produces both entries rather than the two being written out
// by hand — the same factoring controlledStop.js already applies to this
// identical pairing.
function chainTrippable(behaviorNS) {
  return {
    capture: (state) => ({ target: state.throttleTarget }),
    stop: (state) => behaviorNS.command(state, 0, TRIP_RAMP_SEC),
    restore: (state, prior) => behaviorNS.command(state, prior.target, RESUME_THROTTLE_RAMP_SEC),
  };
}

const TRIPPABLE = {
  source: {
    capture: (state) => ({ target: state.opennessTarget }),
    stop: (state) => BEHAVIORS.source.command(state, "close", TRIP_RAMP_SEC),
    restore: (state, prior) => BEHAVIORS.source.command(state, prior.target === 0 ? "close" : "open", RESUME_VALVE_RAMP_SEC),
  },
  meteredFeeder: {
    capture: (state) => ({ enabled: state.enabled }),
    stop: (state) => BEHAVIORS.meteredFeeder.setEnabled(state, false),
    restore: (state, prior) => BEHAVIORS.meteredFeeder.setEnabled(state, prior.enabled),
  },
  batchCycle: {
    // No prior state worth capturing: `stopped` (behaviors.js, issue #51) is
    // a flag this trip owns exclusively, independent of `blocked` (issue
    // #25's hold-next-batch gate) — resuming always just clears it.
    capture: () => ({}),
    stop: (state) => BEHAVIORS.batchCycle.setStopped(state, true),
    restore: (state) => BEHAVIORS.batchCycle.setStopped(state, false),
  },
  // transportDelay and routedTransportDelay share this shape verbatim (only
  // which BEHAVIORS namespace they call differs) — factored through
  // chainTrippable below rather than duplicated, the same reasoning
  // controlledStop.js already gives for its own identical pairing of these
  // two kinds.
  transportDelay: chainTrippable(BEHAVIORS.transportDelay),
  routedTransportDelay: chainTrippable(BEHAVIORS.routedTransportDelay),
};

// Tagged "utilities" rather than a real line machine id — the three utility
// sequences are deliberately not modelled as machines (this file's own
// header), so there is no real id for engine.js's own machineName lookup to
// resolve. engine.js supplies the display name directly instead of looking
// it up, the one place this log's shape differs from controlledStop.js's own.
const CAUSE_ID = "utilities";

function logEvent(ut, t, message) {
  ut.log.push({ t, message, machineId: CAUSE_ID });
}

export function initUtilitiesTrip() {
  return {
    healthy: true,
    phase: "running", // running -> armed -> tripped ; resetUtilitiesTrip always returns to running
    fireAt: null,
    commanded: new Map(), // id -> { kind, prior } — exactly what stop() touched, for restore()
    log: [],
  };
}

// The presenter's own toggle (issue #51's "a single toggle that stops
// everything, everywhere, at 1 s"). Arms the trip on the failing edge only —
// once armed, the trip always fires at fireAt regardless of whether health
// is restored before then, same latch convention every trip in control.js
// already documents (a transient blip still shows the full trip). Calling
// this with `healthy: true` while already armed or tripped does not itself
// undo anything; only resetUtilitiesTrip below can, and only once `healthy`
// is true at the moment of that call.
export function setUtilitiesHealthy(sim, healthy) {
  const ut = sim.utilitiesTrip;
  ut.healthy = healthy;
  if (!healthy && ut.phase === "running") {
    ut.phase = "armed";
    ut.fireAt = sim.t + TRIP_DELAY_SEC;
    logEvent(ut, sim.t, "utilities failure signalled — trip armed, line stops in 1s");
  }
}

// Stepped once per tick (engine.js's stepSim), after the flow, control and
// controlled-stop passes — a command issued this tick affects every
// actuator's behaviour starting next tick, the same immediacy convention
// control.js's own header documents.
export function stepUtilitiesTrip(sim) {
  const ut = sim.utilitiesTrip;
  if (ut.phase !== "armed" || sim.t < ut.fireAt) return;
  for (const [id, state] of sim.machines) {
    const tripper = TRIPPABLE[state.kind];
    if (!tripper) continue;
    ut.commanded.set(id, { kind: state.kind, prior: tripper.capture(state) });
    tripper.stop(state);
  }
  logEvent(ut, sim.t, "utilities failure — entire line tripped, no warning");
  ut.phase = "tripped";
  ut.fireAt = null;
}

// The SCADA reset's effect on this trip (issue #51's own "reuses the latch
// and reset machinery" instruction) — called from engine.js's resetTrips
// alongside control.js's own resetTrips, the same one RESET TRIPS button.
// Only "tripped" is ever eligible, and even then only once utilities health
// has actually been restored — restoring health alone never resumes the
// line, matching this ticket's own acceptance criterion and the same
// "re-reads the live condition, doesn't just trust the reset press" shape
// every trip kind in control.js already uses.
export function resetUtilitiesTrip(sim) {
  const ut = sim.utilitiesTrip;
  if (ut.phase !== "tripped") return;
  if (!ut.healthy) {
    logEvent(ut, sim.t, "reset commanded — utilities still failed, remains latched");
    return;
  }
  for (const [id, { kind, prior }] of ut.commanded) {
    const state = sim.machines.get(id);
    TRIPPABLE[kind].restore(state, prior);
  }
  ut.commanded = new Map();
  ut.phase = "running";
  logEvent(ut, sim.t, "reset — utilities restored, line resumed");
}

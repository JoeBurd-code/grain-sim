// The controlled stop (issue #50): the plant-control cluster's counterpart
// to a trip. A trip (control.js) stops the commanded machine immediately,
// wherever its material happens to be — the FD's own definition (§5,
// docs/PLC_FUNCTIONAL_DESCRIPTION.md). A controlled stop is the opposite:
// it walks the line's own upstream-first stop order (line/stopOrder.js) and
// only commands a machine to stop once nothing further will ever reach it,
// so material already released keeps moving to whatever is still running
// instead of freezing mid-transit.
//
// Only five sim kinds matter to this walk. Four have an actuator worth
// commanding (source, meteredFeeder, batchCycle, and the two transport-delay
// kinds); passThrough/splitter/router/terminalSink hold no material of their
// own and no actuator either, so the walk passes over those instantly.
// Accumulator is the odd one out: no actuator to command, but it does hold
// real material whose *only* way out is whatever machine sits right after it
// in this same order — commanding that next machine to stop before the
// accumulator behind it has actually drained would strand that stock for
// good (a real bug this file had until it was caught by the "material
// already released still arrives" test: disabling a drum feeder the instant
// its turn came up left the buffer bin upstream of it permanently full,
// since a meteredFeeder is that bin's *only* discharge path). So an
// accumulator gates the walk exactly like the two transport-delay kinds do,
// even though it has nothing of its own to command.
import { BEHAVIORS } from "./behaviors";
import { computeStopOrder } from "../line/stopOrder";

const EPS = 1e-9;

// Demo-pacing choice, not an FD number: no document describes a
// presenter-initiated controlled stop's own valve/throttle ramp. Reuses the
// same scale as the buffer bin's own interlock close (6s,
// bufferBinHighTrip in lineData.js) for the source valve, and a shorter
// ramp for a transport-delay machine's throttle, since by the time that
// command fires the chain is already confirmed empty — there's nothing left
// for the ramp to protect, only the demo's own sense of a smooth stop.
const VALVE_RAMP_SEC = 6;
const THROTTLE_RAMP_SEC = 2;

function isEmpty(vol) {
  return vol <= EPS;
}

// Whether `id` has a real, sim-enabled discharge path at all — the same
// fact engine.js's own hasSimDownstream exposes, reached here via `sim.
// downstream` directly (inlined, not imported, to avoid a circular import
// with engine.js, which itself imports this file). A node with no
// downstream — the two treated metal bins, whose own discharge is
// deliberately unmodelled (see metalBin1's own lineData.js comment) — can
// never drain by definition, and that's the acceptance criteria's own
// carve-out ("apart from anything with nowhere left to go"), not something
// this walk should ever wait on.
function hasRealDownstream(sim, id) {
  return sim.downstream.has(id);
}

// Shared by transportDelay and routedTransportDelay (see their own
// STOPPABLE entries below): a chain is drained once it has no real
// downstream to protect (the vacuous case above) or once both its queue and
// backlog genuinely read empty, off the same `inTransitVol`/`backlogVol`
// pair every transport-delay-family snapshot publishes (behaviors.js).
function transitDrained(behaviorNS, state, sim, id) {
  if (!hasRealDownstream(sim, id)) return true;
  const snap = behaviorNS.snapshot(state);
  return isEmpty(snap.inTransitVol) && isEmpty(snap.backlogVol);
}
function describeChainStop() {
  return `chain commanded to stop, drained — controlled stop`;
}
function describeChainResume() {
  return `chain commanded back to full speed — line resumed`;
}

const STOPPABLE = {
  source: {
    stop: (state) => BEHAVIORS.source.command(state, "close", VALVE_RAMP_SEC),
    isDrained: () => true, // a valve holds no material of its own
    resume: (state) => BEHAVIORS.source.command(state, "open", VALVE_RAMP_SEC),
    describeStop: () => `valve commanded closed (ramping over ${VALVE_RAMP_SEC}s) — controlled stop`,
    describeResume: () => `valve commanded open (ramping over ${VALVE_RAMP_SEC}s) — line resumed`,
  },
  meteredFeeder: {
    stop: (state) => BEHAVIORS.meteredFeeder.setEnabled(state, false),
    isDrained: () => true, // holds no material of its own
    resume: (state) => BEHAVIORS.meteredFeeder.setEnabled(state, true),
    describeStop: () => `feeder disabled — controlled stop`,
    describeResume: () => `feeder re-enabled — line resumed`,
  },
  batchCycle: {
    stop: (state) => BEHAVIORS.batchCycle.command(state, true),
    // A charge already accepting material keeps running to completion and
    // discharges normally regardless of `blocked` (capacityAvailableBatchCycle
    // only withholds a *fresh* charge) — so commanding this immediately never
    // freezes anything. Deliberately does *not* gate on `held` reaching zero
    // the way accumulator does below: by the time this index is reached,
    // everything upstream is already fully drained, so a charge sitting at
    // some fraction of chargeM3 has no more supply coming and can never
    // finish — waiting for it to reach zero would hang forever on a
    // perfectly legitimate outcome (a starved partial charge, accounted for
    // in conservation's own `inTransit`, not lost).
    isDrained: () => true,
    resume: (state) => BEHAVIORS.batchCycle.command(state, false),
    describeStop: () => `won't start a fresh charge — controlled stop`,
    describeResume: () => `released to start its next charge — line resumed`,
  },
  // transportDelay and routedTransportDelay share this entry's shape
  // verbatim (only which BEHAVIORS namespace they call differs) — factored
  // through transitDrained/describeChainStop/describeChainResume below
  // rather than duplicated, since the two kinds' `command`/`snapshot`
  // signatures already agree exactly (behaviors.js).
  transportDelay: {
    stop: (state) => BEHAVIORS.transportDelay.command(state, 0, THROTTLE_RAMP_SEC),
    isDrained: (state, sim, id) => transitDrained(BEHAVIORS.transportDelay, state, sim, id),
    resume: (state) => BEHAVIORS.transportDelay.command(state, 1, THROTTLE_RAMP_SEC),
    describeStop: describeChainStop,
    describeResume: describeChainResume,
  },
  routedTransportDelay: {
    stop: (state) => BEHAVIORS.routedTransportDelay.command(state, 0, THROTTLE_RAMP_SEC),
    isDrained: (state, sim, id) => transitDrained(BEHAVIORS.routedTransportDelay, state, sim, id),
    resume: (state) => BEHAVIORS.routedTransportDelay.command(state, 1, THROTTLE_RAMP_SEC),
    describeStop: describeChainStop,
    describeResume: describeChainResume,
  },
  // No actuator: nothing to `stop` or `resume`, and so never added to
  // `commanded` (see stepControlledStop below) — this entry exists purely
  // to gate the walk until real stock has actually drained through whatever
  // comes next, per this file's own header.
  //
  // `stored <= EPS` alone isn't enough (issue #55 surfaced this, though the
  // gap always existed): a bin whose feed and draw happen to be balanced —
  // the ordinary case once the line starts empty and a feeder's draw rate
  // usually outpaces the source feeding it — reads "empty" on every tick
  // even while real material is actively passing through it *this instant*.
  // Advancing past it there would disable its only discharge path (the next
  // actuator in the walk) while the still-ramping-shut valve upstream is
  // still emitting into it, stranding that trickle in the bin for good —
  // its only way out was the actuator this walk was about to disable.
  // `flowRateM3PerSec` (issue #28's generic per-tick outflow, set fresh
  // every tick before this walk ever runs) is the fact that tells the two
  // cases apart: it reads zero only once the bin has genuinely stopped
  // passing material through, not merely whenever its balance happens to
  // net to zero.
  accumulator: {
    isDrained: (state, sim, id) => {
      if (!hasRealDownstream(sim, id)) return true;
      if ((state.flowRateM3PerSec ?? 0) > EPS) return false; // still actively discharging
      // `atomicDischarge` (behaviors.js): this bin's only discharge path is
      // an all-or-nothing batch charge, so `stored <= EPS` is the wrong
      // floor for it — it can legitimately sit at, say, half empty with
      // flow reading zero for a tick simply because the batch machine
      // downstream is mid-hold on its *current* charge, not because this
      // bin has run dry; that's not stuck, it's between charges and the
      // walk must still wait for it. What actually marks it stuck is
      // holding *less than one whole charge*: by this point in the walk its
      // own inflow is already permanently zero (this function's caller
      // guarantees every upstream node is already drained and commanded
      // stopped first), so a remainder short of the downstream's own
      // `chargeM3` can never grow into a full charge and will never leave —
      // the same "starved partial charge, accounted for, not a leak"
      // carve-out batchCycle's own isDrained above already gives the
      // machine on the *other* side of this same edge, just with the bin
      // holding the remainder instead of the machine's own hopper.
      if (state.atomicDischarge) {
        const downstreamId = [...(sim.downstream.get(id)?.values() ?? [])][0];
        const chargeM3 = sim.machines.get(downstreamId)?.chargeM3 ?? 0;
        return state.stored < chargeM3 - EPS;
      }
      // An ordinary accumulator has no such floor: still only counts as
      // drained once genuinely empty (the balanced-flow race above is what
      // the flowRateM3PerSec check above already guards against).
      return state.stored <= EPS;
    },
  },
};

function logEvent(cs, t, machineId, message) {
  cs.log.push({ t, message, machineId });
}

// The stop order is computed once, off the line's own topology, and never
// recomputed mid-run — the line graph itself never changes after createSim
// (see line/stopOrder.js's own header: it's a fact about `lineData`, not
// about anything a presenter can mutate live).
export function initControlledStop(line) {
  return {
    phase: "running", // running -> draining -> stopped ; resumeControlledStop always returns to running
    order: computeStopOrder(line),
    index: 0,
    commanded: new Set(),
    log: [],
    // Issue #46/#50: which packaging feeder was selected right before this
    // walk began, captured (as a plain value handed in by the caller, never
    // read off `sim` here — see beginControlledStop below) because the walk
    // itself disables *every* meteredFeeder it reaches, including whichever
    // one the source selector had chosen, and there'd otherwise be nothing
    // left recording which one to restore on resume. Declared here, not
    // assigned from outside afterward, so this object's own shape is
    // complete the moment it's created.
    preStopSource: null,
  };
}

// Begins the walk. Idempotent: calling this again mid-drain, or once fully
// stopped, does nothing — there's exactly one active drain at a time, and
// resumeControlledStop below is the only way back to "running". `source` is
// whatever engine.js's own getSource(sim) read just before calling this —
// passed in rather than read here so this file stays free of the
// source-selection business logic that belongs to engine.js alone (see
// PACKAGING_FEEDERS there); only stored, on this object's own field, when a
// drain is actually starting.
export function beginControlledStop(sim, source) {
  const cs = sim.controlledStop;
  if (cs.phase !== "running") return;
  cs.phase = "draining";
  cs.preStopSource = source;
  logEvent(cs, sim.t, cs.order[0], `controlled stop initiated — draining upstream-first`);
}

// Stepped once per tick (engine.js's stepSim), after the flow and control
// passes. Walks `order` strictly in sequence: a topological order guarantees
// every predecessor of order[index] has a smaller index, so a node is only
// ever reached once every one of its own upstream predecessors has already
// been commanded to stop *and* drained — which is what makes each
// `isDrained` read race-free: by the time any node is checked, nothing
// upstream of it can supply so much as one more tick's worth of new
// material. Kinds with nothing to command, and the ones always safe to
// command immediately (isDrained always true), simply pass through the same
// tick, same loop iteration — there's no ramp to wait out here, only actual
// material.
export function stepControlledStop(sim) {
  const cs = sim.controlledStop;
  if (cs.phase !== "draining") return;
  while (cs.index < cs.order.length) {
    const id = cs.order[cs.index];
    const state = sim.machines.get(id);
    const stopper = STOPPABLE[state?.kind];
    if (stopper) {
      if (!stopper.isDrained(state, sim, id)) break; // material still moving through here — wait
      if (stopper.stop && !cs.commanded.has(id)) {
        stopper.stop(state);
        cs.commanded.add(id);
        logEvent(cs, sim.t, id, stopper.describeStop());
      }
    }
    cs.index++;
  }
  if (cs.index >= cs.order.length) cs.phase = "stopped";
}

// The undo (issue #50's own "does not latch" requirement): restores every
// actuator this walk touched back to its normal running command, regardless
// of how far the drain had gotten — a presenter changing their mind
// mid-drain gets the line back exactly as readily as one who let it fully
// settle. Only `commanded` machines are touched (accumulator, which is never
// added to `commanded`, has nothing to restore): nothing here claims to
// "resume" a machine the drain never actually reached. Deliberately generic
// (no source/destination-selection business logic) — engine.js's own
// resumeLine wraps this to also restore which packaging feeder was running
// before the stop, since disabling *both* feeders here would otherwise lose
// that fact (see engine.js).
export function resumeControlledStop(sim) {
  const cs = sim.controlledStop;
  if (cs.phase === "running") return;
  for (const id of cs.commanded) {
    const state = sim.machines.get(id);
    const stopper = STOPPABLE[state?.kind];
    stopper.resume(state);
    logEvent(cs, sim.t, id, stopper.describeResume());
  }
  cs.phase = "running";
  cs.index = 0;
  cs.commanded = new Set();
  cs.preStopSource = null;
}

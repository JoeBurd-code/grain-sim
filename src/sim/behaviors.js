// Behaviour primitives every sim-enabled machine's `sim.kind` resolves to.
// Each behaviour exposes the pure functions used by the engine's two-phase
// step (see engine.js) and by everything else that reads a machine's state
// generically instead of switching on kind: `capacityAvailable` (reverse
// pass, how much this machine can accept from upstream this tick, given
// what its own downstream can accept), `apply` (forward pass, move the
// volume and mutate state), `conserve` (this machine's contribution to the
// conservation totals, see conservation.js) and `snapshot` (its published
// dynamic render value, see useSimEngine.js — omitted where a kind has
// nothing to show). Adding a kind means adding one entry here; nothing
// downstream needs a matching switch/if. This is also the registry
// validateLine.js checks declared `sim.kind` values against.

// Shared by source and passThrough: neither holds any volume of its own, so
// what either can accept is exactly what its own downstream can accept.
function forwardDownstreamCapacity(state, dt, downstreamCap) {
  return downstreamCap;
}

// `openness` (0..1, the valve's actual position) slews toward
// `opennessTarget` at `opennessRampPerSec`, rather than snapping — this is
// what lets material already released keep arriving after a close command,
// the overshoot the control layer (control.js) exists to demonstrate.
// Defaults to fully open with an instant (infinite) slew rate so a source
// with nothing commanding it behaves exactly as before this existed.
function initSource(m) {
  return {
    kind: "source",
    nominalRate: m.sim.rateM3PerSec,
    openness: 1,
    opennessTarget: 1,
    opennessRampPerSec: Infinity,
    fed: 0,
  };
}
function applySource(state, dt, inflow, cap) {
  if (state.openness !== state.opennessTarget) {
    const step = state.opennessRampPerSec * dt;
    const diff = state.opennessTarget - state.openness;
    state.openness = Math.abs(diff) <= step ? state.opennessTarget : state.openness + Math.sign(diff) * step;
  }
  const out = Math.min(state.nominalRate * state.openness * dt, cap);
  state.fed += out;
  return out;
}
function conserveSource(state) {
  return { fed: state.fed };
}
// Commands the valve toward fully open or fully closed over `rampTimeSec`.
// The control layer is the only caller; a source with no interlock never
// has this invoked and keeps its default openness of 1.
function commandSource(state, direction, rampTimeSec) {
  state.opennessTarget = direction === "close" ? 0 : 1;
  state.opennessRampPerSec = rampTimeSec > 0 ? 1 / rampTimeSec : Infinity;
}
function isSettledSource(state) {
  return state.openness === state.opennessTarget;
}

// Holds zero volume at all times: whatever it can accept, it emits the same tick.
function initPassThrough() {
  return { kind: "passThrough", volume: 0 };
}
function applyPassThrough(state, dt, inflow, cap) {
  const out = Math.min(inflow, cap);
  state.volume = 0;
  return out;
}

function initAccumulator(m) {
  const capacity = m.sim.capacityM3;
  const stored = (m.sim.initialLevelFraction ?? 0) * capacity;
  // Pre-existing inventory at t=0 didn't come through any source's `fed`
  // counter this run; the conservation identity accounts for it separately.
  return { kind: "accumulator", capacity, stored, initialStored: stored, spill: 0, discharged: 0 };
}
// How much this accumulator can accept from upstream this tick is purely
// its own remaining headroom — independent of whatever's happening on the
// discharge side (see applyAccumulator), since filling and draining are two
// separate flows through the same vessel.
function capacityAvailableAccumulator(state) {
  return Math.max(0, state.capacity - state.stored);
}
// `downstreamCap` (issue #20) is the engine's forward-pass echo of the same
// value this accumulator's own capacityAvailable saw propagate in from its
// downstream during the reverse pass — for a metered feeder that's its
// configured draw rate this tick, already bounded by *its* own downstream.
// Defaults to 0 so a bin with nothing sim-enabled downstream of it (or a
// fabricated test state that never passes it) keeps issue #18's fill-only
// behaviour exactly.
function applyAccumulator(state, dt, inflow, cap, downstreamCap = 0) {
  const accepted = Math.min(inflow, cap);
  state.stored += accepted;
  state.spill += Math.max(0, inflow - accepted);
  const discharge = Math.min(state.stored, downstreamCap);
  state.stored -= discharge;
  state.discharged = (state.discharged ?? 0) + discharge;
  return discharge;
}
function conserveAccumulator(state) {
  return { initialStored: state.initialStored, stored: state.stored, spilled: state.spill };
}
function snapshotAccumulator(state) {
  return { fill: state.capacity > 0 ? state.stored / state.capacity : 0 };
}

// Metered feeder (issue #20): draws from whatever accumulator feeds it, at
// a settable rate, and holds no volume of its own — everything it accepts
// it forwards the same tick, like passThrough, except its intake is capped
// by `rate` rather than being unlimited. The real drum feeder is actually
// controlled by a non-proportional percentage opening, not a direct rate
// (see docs/OPEN_QUESTIONS.md); this behaviour assumes a linear opening ->
// rate mapping across the confirmed 2-20 t/h range until the engineer's
// spreadsheet of estimated values arrives.
function initMeteredFeeder(m) {
  return { kind: "meteredFeeder", rate: m.sim.rateM3PerSec, drawn: 0 };
}
// Reverse pass: how much this feeder can pull in this tick — its own
// metering rate, further bounded by whatever its own downstream can accept.
function capacityAvailableMeteredFeeder(state, dt, downstreamCap) {
  return Math.min(state.rate * dt, downstreamCap);
}
function applyMeteredFeeder(state, dt, inflow, cap) {
  const out = Math.min(inflow, cap);
  state.drawn += out;
  return out;
}

const EPS = 1e-9;

// `hasDownstream` (issue #21) is the engine's answer to "does a sim-enabled
// machine actually sit downstream of me", separate from the *value* of
// downstreamCap (which is legitimately 0 both when genuinely blocked and
// when nothing is modelled downstream — those two cases need different
// behaviour and can't be told apart from the number alone). Without it,
// wiring a real downstream onto a machine that used to report its own
// throughput as "delivered" (meteredFeeder; transportDelay below) would
// double-count every unit of volume against whatever the new downstream
// now separately accounts for in its own stored/inTransit.
function conserveMeteredFeeder(state, hasDownstream) {
  return hasDownstream ? {} : { delivered: state.drawn };
}

// Transport delay (issue #21): a FIFO pipe that holds material for a
// derived transit time before it can discharge — the primitive behind any
// device where infeed and discharge are genuinely decoupled in time (a
// bucket elevator's carrying run, and per the acceptance criteria, later a
// packaging elevator or a long conveyor). `distanceM` / `speedMPerMin` are
// named generically (not "riseHeightM" / "chainSpeedMPerMin") so the same
// behaviour serves a horizontal conveyor as well as an elevator's lift.
//
// Each queued packet tracks `progress` (0..1 of the transit) rather than a
// fixed arrival time, so a live speed change (the VFD) instantly re-paces
// every packet already in transit, not just newly accepted material — a
// real chain has one speed for everything riding it.
//
// Accept and discharge are bounded independently: accepting new material is
// gated only by the throughput ceiling and by `backlog` (material that has
// finished its transit but couldn't leave — the chain backing up at the
// head, per the acceptance criteria); discharging is bounded by the ceiling
// and, only when a sim-enabled machine is actually downstream, by that
// machine's own headroom. With no modelled downstream (the current line:
// nothing sits sim-enabled past the treating elevator yet) discharge is
// unconstrained by anything downstream, mirroring meteredFeeder's own
// "nothing sim-enabled downstream yet" convention — see conserve below.
function initTransportDelay(m) {
  return {
    kind: "transportDelay",
    distanceM: m.sim.distanceM,
    speedMPerMin: m.sim.speedMPerMin,
    ceilingM3PerSec: m.sim.ceilingM3PerSec,
    speedFraction: 1,
    queue: [],       // [{ progress, vol }] material past the infeed, still travelling
    backlog: 0,      // volume that finished transit but discharge hasn't taken it yet
    delivered: 0,
  };
}
function chainSpeedMPerSec(state) {
  return (state.speedMPerMin * state.speedFraction) / 60;
}
function queueVolume(state) {
  return state.queue.reduce((a, p) => a + p.vol, 0);
}
function capacityAvailableTransportDelay(state, dt) {
  // A backed-up discharge blocks new infeed too, a simplified stand-in for
  // the chain physically filling up — exact bucket count/volume/chain
  // length are still unconfirmed (see docs/OPEN_QUESTIONS.md), so this
  // doesn't attempt to track precise in-chain capacity.
  if (state.backlog > EPS) return 0;
  return state.ceilingM3PerSec * dt;
}
function applyTransportDelay(state, dt, inflow, cap, downstreamCap = 0, hasDownstream = false) {
  const accepted = Math.min(inflow, cap);
  if (accepted > 0) state.queue.push({ progress: 0, vol: accepted });

  const v = chainSpeedMPerSec(state);
  const progressStep = state.distanceM > 0 ? (v * dt) / state.distanceM : 0;
  const still = [];
  for (const pkt of state.queue) {
    const progress = pkt.progress + progressStep;
    if (progress >= 1) state.backlog += pkt.vol;
    else still.push({ progress, vol: pkt.vol });
  }
  state.queue = still;

  const dischargeCeiling = state.ceilingM3PerSec * dt;
  const dischargeCap = hasDownstream ? Math.min(dischargeCeiling, downstreamCap) : dischargeCeiling;
  const out = Math.min(state.backlog, dischargeCap);
  state.backlog -= out;
  state.delivered += out;
  return out;
}
function conserveTransportDelay(state, hasDownstream) {
  const inTransit = queueVolume(state) + state.backlog;
  return hasDownstream ? { inTransit } : { inTransit, delivered: state.delivered };
}
function snapshotTransportDelay(state) {
  const inTransitVol = queueVolume(state);
  const hasMaterial = state.queue.length > 0 || state.backlog > 0;
  // Leading/trailing progress bound the span of the chain currently
  // carrying material, so the scene can render the sweep from boot to
  // discharge on startup and the drain back to empty once feed stops.
  const leadingProgress = hasMaterial
    ? Math.max(state.backlog > 0 ? 1 : 0, 0, ...state.queue.map((p) => p.progress))
    : 0;
  const trailingProgress = state.queue.length > 0 ? Math.min(...state.queue.map((p) => p.progress)) : leadingProgress;
  const v = chainSpeedMPerSec(state);
  return {
    inTransitVol, backlogVol: state.backlog,
    leadingProgress, trailingProgress,
    transitTimeSec: v > 0 ? state.distanceM / v : Infinity,
    speedFraction: state.speedFraction,
  };
}

export const BEHAVIORS = {
  source: {
    init: initSource, capacityAvailable: forwardDownstreamCapacity, apply: applySource,
    conserve: conserveSource, command: commandSource, isSettled: isSettledSource,
  },
  passThrough: {
    init: initPassThrough, capacityAvailable: forwardDownstreamCapacity, apply: applyPassThrough,
  },
  accumulator: {
    init: initAccumulator, capacityAvailable: capacityAvailableAccumulator, apply: applyAccumulator,
    conserve: conserveAccumulator, snapshot: snapshotAccumulator,
  },
  meteredFeeder: {
    init: initMeteredFeeder, capacityAvailable: capacityAvailableMeteredFeeder, apply: applyMeteredFeeder,
    conserve: conserveMeteredFeeder,
  },
  transportDelay: {
    init: initTransportDelay, capacityAvailable: capacityAvailableTransportDelay, apply: applyTransportDelay,
    conserve: conserveTransportDelay, snapshot: snapshotTransportDelay,
  },
};

export const REGISTERED_KINDS = new Set(Object.keys(BEHAVIORS));

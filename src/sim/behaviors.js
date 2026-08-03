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
// Nothing sim-enabled sits downstream of this feeder yet, so whatever it
// draws leaves the modelled boundary here — the conservation identity's
// `delivered` bucket, not `stored` (this behaviour holds none).
function conserveMeteredFeeder(state) {
  return { delivered: state.drawn };
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
};

export const REGISTERED_KINDS = new Set(Object.keys(BEHAVIORS));

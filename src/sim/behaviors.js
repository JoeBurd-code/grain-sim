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
  return { kind: "accumulator", capacity, stored, initialStored: stored, spill: 0 };
}
// Terminal for now (nothing downstream of it is sim-enabled yet): the only
// constraint on what it can accept is its own remaining headroom.
function capacityAvailableAccumulator(state) {
  return Math.max(0, state.capacity - state.stored);
}
function applyAccumulator(state, dt, inflow, cap) {
  const accepted = Math.min(inflow, cap);
  state.stored += accepted;
  state.spill += Math.max(0, inflow - accepted);
  return 0; // no discharge behaviour modelled yet
}
function conserveAccumulator(state) {
  return { initialStored: state.initialStored, stored: state.stored, spilled: state.spill };
}
function snapshotAccumulator(state) {
  return { fill: state.capacity > 0 ? state.stored / state.capacity : 0 };
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
};

export const REGISTERED_KINDS = new Set(Object.keys(BEHAVIORS));

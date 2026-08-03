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

function initSource(m) {
  return { kind: "source", rate: m.sim.rateM3PerSec, fed: 0 };
}
function applySource(state, dt, inflow, cap) {
  const out = Math.min(state.rate * dt, cap);
  state.fed += out;
  return out;
}
function conserveSource(state) {
  return { fed: state.fed };
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
    conserve: conserveSource,
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

// The single entry point every test and every UI surface drives: create a
// sim from a line definition, step it by a fixed timestep, read a machine's
// state back. Internals (the two-phase step, how behaviours are wired) are
// not part of this seam.
import { BEHAVIORS, REGISTERED_KINDS } from "./behaviors";
import { initControl, stepControl } from "./control";

export const DT = 0.05; // s, fixed sim timestep (matches the proven mock)

// Builds the id -> id map of "the one sim-enabled machine this machine's
// product stream feeds", restricted to machines that both declare a `sim`
// block. Non-product edges (e.g. metal remover -> waste stub) and edges
// into not-yet-built machines are not part of the sim graph yet. Each node
// has at most one sim-enabled downstream edge until a splitter/merge
// behaviour exists (see issue #26) to make that meaningful.
function buildDownstreamMap(line, simEnabledIds) {
  const downstream = new Map();
  for (const c of line.connections) {
    if (c.kind !== "product") continue;
    if (!simEnabledIds.has(c.from.machine) || !simEnabledIds.has(c.to.machine)) continue;
    downstream.set(c.from.machine, c.to.machine);
  }
  return downstream;
}

// Kahn's algorithm over the sim-enabled subgraph. Throws on a cycle, which
// would mean a mis-wired line definition (recirculation is not part of this
// line, per REAL_LINE_SPECS.md §10 "Recirculation: NONE seen").
function topoOrder(simEnabledIds, downstream) {
  const indegree = new Map([...simEnabledIds].map((id) => [id, 0]));
  for (const to of downstream.values()) indegree.set(to, indegree.get(to) + 1);
  const queue = [...simEnabledIds].filter((id) => indegree.get(id) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    const next = downstream.get(id);
    if (next != null) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (order.length !== simEnabledIds.size) {
    throw new Error("sim graph has a cycle among sim-enabled machines");
  }
  return order;
}

export function createSim(line) {
  const machines = new Map();
  for (const m of line.machines) {
    if (!m.sim) continue;
    if (!REGISTERED_KINDS.has(m.sim.kind)) {
      throw new Error(`machine "${m.id}" declares unregistered sim.kind "${m.sim.kind}"`);
    }
    machines.set(m.id, BEHAVIORS[m.sim.kind].init(m));
  }
  const simEnabledIds = new Set(machines.keys());
  const downstream = buildDownstreamMap(line, simEnabledIds);
  const order = topoOrder(simEnabledIds, downstream);
  const control = initControl(line);
  return { t: 0, line, machines, downstream, order, control };
}

// Rebuilds `sim` from its own `line` and copies the result over the same
// object reference (rather than returning a new one), so a caller holding
// onto `sim` — the UI's useState value, never replaced via its setter — sees
// the reset without needing to know its identity changed. Every live
// control set during the run (rates, interlock set points, elevator speed)
// reverts to the line's authored defaults, same as a page reload.
export function resetSim(sim) {
  Object.assign(sim, createSim(sim.line));
  return sim;
}

// Whether a sim-enabled machine actually sits downstream of `id` — the one
// fact both the forward pass and conservationTotals need computed the same
// way, since a downstream *value* of 0 is ambiguous (genuinely full vs not
// modelled at all, see stepSim below) but this boolean isn't.
export function hasSimDownstream(sim, id) {
  return sim.downstream.has(id);
}

export function stepSim(sim, dt) {
  const { machines, order, downstream } = sim;

  // Reverse pass: how much can flow INTO each node this tick, given what
  // its own downstream can accept. Must run before the forward pass so
  // backpressure from a full accumulator is known before an upstream
  // pass-through or source decides how much to emit.
  const capAvail = new Map();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const state = machines.get(id);
    const downstreamId = downstream.get(id);
    const downstreamCap = downstreamId != null ? capAvail.get(downstreamId) : Infinity;
    capAvail.set(id, BEHAVIORS[state.kind].capacityAvailable(state, dt, downstreamCap));
  }

  // Forward pass: actually move volume, capped by the availability just computed.
  // `downstreamCap` re-derives the same value the reverse pass used as this
  // node's own downstream bound (see issue #20) — a node that both holds
  // and discharges (the accumulator) needs it to know how much it may push
  // out this tick, separately from `capAvail.get(id)` (how much it may
  // accept in). Nodes with nothing sim-enabled downstream get 0: nowhere
  // for them to discharge into. `hasDownstream` (issue #21) is passed
  // alongside the number itself, because 0 is also the legitimate value of
  // a genuinely full downstream — a behaviour that self-reports its output
  // as "delivered" when unconnected (meteredFeeder, transportDelay) needs
  // to tell those two cases apart, which the number alone can't do.
  const inflowOf = new Map();
  for (const id of order) {
    const state = machines.get(id);
    const inflow = inflowOf.get(id) ?? 0;
    const downstreamId = downstream.get(id);
    const hasDownstream = hasSimDownstream(sim, id);
    const downstreamCap = hasDownstream ? capAvail.get(downstreamId) : 0;
    const outflow = BEHAVIORS[state.kind].apply(state, dt, inflow, capAvail.get(id), downstreamCap, hasDownstream);
    if (downstreamId != null) {
      inflowOf.set(downstreamId, (inflowOf.get(downstreamId) ?? 0) + outflow);
    }
  }

  sim.t += dt;
  stepControl(sim);
  return sim;
}

export function getMachineState(sim, id) {
  return sim.machines.get(id);
}

// Read access to an interlock's runtime state (phase, event log, live
// parameters), keyed by its sensor machine — the same public seam
// getMachineState offers for a plain machine, so a test or the UI never
// needs to reach into `sim.control` directly.
export function getInterlockState(sim, sensorMachineId) {
  return sim.control.find((r) => r.sensorId === sensorMachineId);
}

export function setSourceRate(sim, id, rateM3PerSec) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "source") {
    throw new Error(`machine "${id}" is not a source`);
  }
  state.nominalRate = rateM3PerSec;
}

// Live control (issue #20): the drum feeder's metering rate takes effect on
// its very next capacityAvailable call, mid run — same immediacy as
// setSourceRate, no ramp modelled for the feeder itself.
export function setFeederRate(sim, id, rateM3PerSec) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "meteredFeeder") {
    throw new Error(`machine "${id}" is not a metered feeder`);
  }
  state.rate = rateM3PerSec;
}

// Live control (issue #21, the VFD): takes effect on the very next apply(),
// re-pacing every packet already in transit, not just newly accepted
// material — a real chain has one speed for everything riding it.
export function setElevatorSpeed(sim, id, fraction) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "transportDelay") {
    throw new Error(`machine "${id}" is not a transport-delay machine`);
  }
  state.speedFraction = Math.max(0, Math.min(1, fraction));
}

// Presenter/demo control: jump an accumulator straight to a given fill
// fraction, e.g. to stage a near-overflow scenario without waiting for the
// source to fill it there. This adds or removes volume from outside the
// modelled source, so it folds into `initialStored` (the same bucket the
// t=0 seed level uses) rather than `stored` alone, keeping the conservation
// identity (fed + initialStored = stored + ...) true afterwards.
export function setAccumulatorLevel(sim, id, fraction) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "accumulator") {
    throw new Error(`machine "${id}" is not an accumulator`);
  }
  const nextStored = Math.max(0, Math.min(state.capacity, fraction * state.capacity));
  state.initialStored += nextStored - state.stored;
  state.stored = nextStored;
}

function findInterlock(sim, sensorMachineId) {
  const rule = getInterlockState(sim, sensorMachineId);
  if (!rule) throw new Error(`machine "${sensorMachineId}" has no interlock`);
  return rule;
}

// Live controls (issue #19): the sensor's set points and the interlock's
// signal delay all take effect on the rule's very next tick, mid run —
// there's no need to touch the actuator directly, since a set point only
// changes when stepControl next compares the sensor's level against it.
export function setInterlockHighSetpoint(sim, sensorMachineId, fraction) {
  findInterlock(sim, sensorMachineId).highSetpoint = fraction;
}

export function setInterlockLowSetpoint(sim, sensorMachineId, fraction) {
  findInterlock(sim, sensorMachineId).lowSetpoint = fraction;
}

export function setInterlockSignalDelay(sim, sensorMachineId, seconds) {
  findInterlock(sim, sensorMachineId).signalDelaySec = seconds;
}

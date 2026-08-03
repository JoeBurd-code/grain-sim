// The single entry point every test and every UI surface drives: create a
// sim from a line definition, step it by a fixed timestep, read a machine's
// state back. Internals (the two-phase step, how behaviours are wired) are
// not part of this seam.
import { BEHAVIORS, REGISTERED_KINDS } from "./behaviors";

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
  return { t: 0, line, machines, downstream, order };
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
  const inflowOf = new Map();
  for (const id of order) {
    const state = machines.get(id);
    const inflow = inflowOf.get(id) ?? 0;
    const outflow = BEHAVIORS[state.kind].apply(state, dt, inflow, capAvail.get(id));
    const downstreamId = downstream.get(id);
    if (downstreamId != null) {
      inflowOf.set(downstreamId, (inflowOf.get(downstreamId) ?? 0) + outflow);
    }
  }

  sim.t += dt;
  return sim;
}

export function getMachineState(sim, id) {
  return sim.machines.get(id);
}

export function setSourceRate(sim, id, rateM3PerSec) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "source") {
    throw new Error(`machine "${id}" is not a source`);
  }
  state.rate = rateM3PerSec;
}

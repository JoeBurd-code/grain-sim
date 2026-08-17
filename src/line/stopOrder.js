// Issue #50: the controlled stop's own ordering, derived from the line graph
// rather than hand-authored — a machine added or rewired here is picked up
// automatically, so the drain order can never go stale the way a written-down
// list would. Upstream-first (source-first, sink-last) is just the ordinary
// topological order over the machine graph: the FD's own stop sequence
// closes the source first and works downstream (§4.2,
// docs/PLC_FUNCTIONAL_DESCRIPTION.md), which is the reverse of its
// destination-first start sequence, not a distinct traversal of its own.
//
// Deliberately independent of sim/behaviors.js (unlike engine.js's own
// topoOrder, which needs BEHAVIORS' `multiOutput` flag to know which ports
// carry real physics): this is a structural fact about the line topology —
// machines and connections — not a physics computation, so it stays testable
// against `lineData` alone, the same way reachability.test.js already
// traverses this exact data with no sim import at all.
//
// Restricted to sim-enabled machines (`m.sim` declared): only those are
// candidates for an actual runtime command (see sim/controlledStop.js), and
// a decorative stub has no connections to a real upstream/downstream chain
// worth ordering.
export function computeStopOrder(line) {
  const simEnabled = new Set(line.machines.filter((m) => m.sim).map((m) => m.id));

  const outEdges = new Map();
  const indegree = new Map([...simEnabled].map((id) => [id, 0]));
  for (const c of line.connections) {
    if (!simEnabled.has(c.from.machine) || !simEnabled.has(c.to.machine)) continue;
    if (!outEdges.has(c.from.machine)) outEdges.set(c.from.machine, new Set());
    const outs = outEdges.get(c.from.machine);
    if (!outs.has(c.to.machine)) {
      outs.add(c.to.machine);
      indegree.set(c.to.machine, indegree.get(c.to.machine) + 1);
    }
  }

  // Kahn's algorithm, same style as engine.js's own topoOrder — FIFO queue
  // seeded from `simEnabled`'s own iteration order (machine declaration
  // order in lineData.js), so ties among multiple zero-indegree machines
  // (the line's genuine sources) resolve deterministically rather than
  // depending on Set/Map internals.
  const queue = [...simEnabled].filter((id) => indegree.get(id) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of outEdges.get(id) ?? []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  if (order.length !== simEnabled.size) {
    throw new Error("stop order: sim-enabled machine graph has a cycle");
  }
  return order;
}

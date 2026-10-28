// How many inlets and outlets a Custom conveyor or bucket elevator has
// (issue #152), set in Build mode by its "inputs" and "outputs" fields
// (adjustableFields.js, binds "inputCount" and "outputCount"). One slot
// keeps its single name, "in" or "out"; more are named in1, in2, ... and
// out1, out2, ....
//
// The last slot on each side sits where the single port is, at the end of
// its run, and keeps that port's connection: shrinking or growing a side
// renames the ports from that end. A removed port that still has a
// connection is refused (portCountError), never silently dropped.
//
// Where the ports sit follows the machine's shape: a bucket elevator's
// along its floor and head runs (elevatorPath.js placeElevatorPorts), a
// straight conveyor's along its two halves (placeConveyorPorts below). Each
// is placed in the machine's unflipped shape, so a flip mirrors them like
// any other anchor.
import { isBucketElevator, placeElevatorPorts } from "./elevatorPath";

export const PORT_COUNT_MAX = 6;

// The bind of each count field, and the side of the machine it counts.
export const COUNT_SIDES = { inputCount: "inputs", outputCount: "outputs" };

const PREFIX = { inputs: "in", outputs: "out" };

function slotNames(side, n) {
  return n === 1 ? [PREFIX[side]] : Array.from({ length: n }, (_, i) => `${PREFIX[side]}${i + 1}`);
}

// Old name -> new name for each port that stays, matched from the run's
// end, and the old names that go.
function renaming(old, next) {
  const renamed = new Map();
  for (let j = 0; j < Math.min(old.length, next.length); j++) {
    renamed.set(old[old.length - 1 - j], next[next.length - 1 - j]);
  }
  return { renamed, removed: old.filter((p) => !renamed.has(p)) };
}

// Whether `m` places its own ports from its counts.
export function hasPortCounts(m) {
  return (m.adjustable ?? []).some((a) => COUNT_SIDES[a.bind] !== undefined);
}

// A straight conveyor's inlets spread along the infeed half of the belt
// and its outlets along the discharge half, the last of each at the belt's
// end. A port off the end sits on the belt's top (an inlet) or underside
// (an outlet). Like an elevator, each port's distance along the belt is
// its `sim.portDistanceM` once either side has more than one.
function placeConveyorPorts(m) {
  const L = m.sim.distanceM;
  const { inputs, outputs } = m.ports;
  const anchors = {};
  const distances = {};
  inputs.forEach((p, i) => {
    const along = (L / 2) * (inputs.length - 1 - i) / inputs.length;
    anchors[p] = along === 0 ? { x: 0, y: m.h / 2 } : { x: (m.w * along) / L, y: 0 };
    distances[p] = along;
  });
  outputs.forEach((p, i) => {
    const along = L / 2 + (L / 2) * (i + 1) / outputs.length;
    anchors[p] = i === outputs.length - 1 ? { x: m.w, y: m.h / 2 } : { x: (m.w * along) / L, y: m.h };
    distances[p] = i === outputs.length - 1 ? L : along;
  });
  m.anchors = anchors;
  if (inputs.length > 1 || outputs.length > 1) m.sim.portDistanceM = distances;
  else delete m.sim.portDistanceM;
}

// Places `m`'s ports for its shape. Changes `m` in place.
export function placePorts(m) {
  if (isBucketElevator(m) && m.geom.segmentsM) placeElevatorPorts(m);
  else if (m.type === "conveyor" && !m.geom) placeConveyorPorts(m);
}

const nameOf = (line, id) => line.machines.find((m) => m.id === id)?.name ?? id;

// Why `m` cannot have `n` ports on `side`, or null: a port it would lose
// still has a connection.
export function portCountError(line, m, side, n) {
  if (!Number.isInteger(n)) return `${m.name} needs a whole number of ${side}.`;
  const { removed } = renaming(m.ports[side], slotNames(side, n));
  const end = side === "inputs" ? "to" : "from";
  for (const c of line.connections) {
    if (c[end].machine !== m.id || !removed.includes(c[end].port)) continue;
    const link = side === "inputs"
      ? `the connection from ${nameOf(line, c.from.machine)} to ${m.name}'s ${c.to.port}`
      : `the connection from ${m.name}'s ${c.from.port} to ${nameOf(line, c.to.machine)}`;
    return `${m.name} cannot drop to ${n} ${side}: delete ${link} first.`;
  }
  return null;
}

// `m` (in `line`, both changed in place) with `n` ports on `side`, its
// connections following the renamed ports. `n` must pass portCountError.
export function setPortCount(line, m, side, n) {
  const next = slotNames(side, n);
  const { renamed } = renaming(m.ports[side], next);
  const end = side === "inputs" ? "to" : "from";
  line.connections = line.connections.map((c) => (
    c[end].machine === m.id && renamed.has(c[end].port)
      ? { ...c, [end]: { ...c[end], port: renamed.get(c[end].port) } }
      : c
  ));
  // Carried over for what placing keeps from them (an elevator's outlet height).
  const anchors = { ...m.anchors };
  for (const [was, now] of renamed) anchors[now] = m.anchors[was];
  m.anchors = anchors;
  if (side === "outputs" && m.sim?.defaultPort !== undefined) {
    m.sim.defaultPort = renamed.get(m.sim.defaultPort) ?? next.at(-1);
  }
  m.ports = { ...m.ports, [side]: next };
  placePorts(m);
}

// Connection routes (issue #86). A connection drawn in lineData.js may carry
// hand-placed bend points (`via`); those are kept until a machine at either
// end moves (layout.js drops them). A connection without them is routed
// here with right-angle bends: it leaves its output port through the side
// that port sits on, and arrives at its input port through that port's side.
import { anchorWorld, machineFootprint } from "./layout";

// How far a route runs straight out of a port before its first bend.
const LEAD = 20;

const OUTWARD = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// Edges in order of preference when an anchor is as near to one as to
// another: a point-sized stub sends grain down and takes it from above.
const OUTPUT_SIDES = ["bottom", "right", "left", "top"];
const INPUT_SIDES = ["top", "left", "right", "bottom"];

// The side of the machine a port sits on: the nearest footprint edge to its
// anchor. A Z-shaped duct's port is read against the run it is on, so the
// elevator's inlet is on top of its floor run.
export function portSide(m, port) {
  const a = anchorWorld(m, port);
  const sides = m.ports.outputs.includes(port) ? OUTPUT_SIDES : INPUT_SIDES;
  let best = { dist: Infinity, side: sides[0] };
  for (const r of machineFootprint(m)) {
    // Distance from the anchor to the nearest point of each edge segment.
    const cx = Math.max(r.x, Math.min(r.x + r.w, a.x));
    const cy = Math.max(r.y, Math.min(r.y + r.h, a.y));
    const dist = {
      top: Math.hypot(a.x - cx, a.y - r.y),
      bottom: Math.hypot(a.x - cx, a.y - (r.y + r.h)),
      left: Math.hypot(a.x - r.x, a.y - cy),
      right: Math.hypot(a.x - (r.x + r.w), a.y - cy),
    };
    for (const side of sides) {
      if (dist[side] < best.dist) best = { dist: dist[side], side };
    }
  }
  return best.side;
}

function anchorOf(byId, end) {
  return anchorWorld(byId.get(end.machine), end.port);
}

const plus = (p, d, k) => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;

// Drops repeated points and points a straight run passes through.
function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out.at(-2);
    if (prev && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) {
      out[out.length - 1] = p;
    } else {
      out.push(p);
    }
  }
  return out;
}

// The route from an output anchor leaving in direction `exit` to an input
// anchor whose side faces outward along `face`.
function route(from, exit, to, face) {
  // One bend, when the two directions cross and the corner lies ahead of
  // the output and outside the input.
  if (dot(exit, face) === 0) {
    const corner = exit.x !== 0 ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
    const ahead = dot({ x: corner.x - from.x, y: corner.y - from.y }, exit) > 0;
    const outside = dot({ x: corner.x - to.x, y: corner.y - to.y }, face) > 0;
    if (ahead && outside) return simplify([from, corner, to]);
  }
  // Otherwise out of each port by LEAD, then joined across the middle.
  const p = plus(from, exit, LEAD);
  const q = plus(to, face, LEAD);
  const middle = exit.x === 0
    ? [{ x: p.x, y: (p.y + q.y) / 2 }, { x: q.x, y: (p.y + q.y) / 2 }]
    : [{ x: (p.x + q.x) / 2, y: p.y }, { x: (p.x + q.x) / 2, y: q.y }];
  return simplify([from, p, ...middle, q, to]);
}

// The points a connection is drawn through, in world space, output first.
export function connectionPoints(line, c) {
  const byId = new Map(line.machines.map((m) => [m.id, m]));
  const from = anchorOf(byId, c.from);
  const to = anchorOf(byId, c.to);
  if (c.via) return [from, ...c.via, to];
  const exit = OUTWARD[portSide(byId.get(c.from.machine), c.from.port)];
  const face = OUTWARD[portSide(byId.get(c.to.machine), c.to.port)];
  return route(from, exit, to, face);
}

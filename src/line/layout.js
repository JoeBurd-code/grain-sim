// Where machines sit on the canvas (issue #86). Moving a machine is a pure
// line document function, like the Build mode value edits: it never changes
// the line it is given.
//
// Machines never overlap. Overlap is tested on each machine's footprint,
// not its bounding box: the treating elevator and the pendulum conveyor are
// Z-shaped ducts whose boxes hold half the plant, so a box test would refuse
// almost every move.

export const GRID = 10;

// With snapping off a machine still lands on a whole unit, so a position
// read back from the pointer carries no float noise into the line.
export function snapPosition(pos, snap = true) {
  const step = snap ? GRID : 1;
  return { x: Math.round(pos.x / step) * step, y: Math.round(pos.y / step) * step };
}

// The rects the machine covers, in world space. A machine with a duct `geom`
// covers the floor run, the climb and the ceiling run that ductBodyPaths
// (scene/elevatorMotion.js) draws.
export function machineFootprint(m) {
  if (!m.geom) return [{ x: m.x, y: m.y, w: m.w, h: m.h }];
  const { colX, duct } = m.geom;
  return [
    { x: m.x, y: m.y + m.h - duct, w: colX + duct, h: duct },
    { x: m.x + colX, y: m.y, w: duct, h: m.h },
    { x: m.x + colX, y: m.y, w: m.w - colX, h: duct },
  ];
}

// Touching along an edge is not an overlap: a valve hangs right under its bin.
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// How far from the drop point an overlapping drop looks for a free place.
const SEARCH_RINGS = 60;

// The place on the grid nearest `pos` that `fits` accepts, searched ring by
// ring outwards. Null when there is none within the search.
export function nearestFree(pos, fits) {
  if (fits(pos)) return pos;
  for (let ring = 1; ring <= SEARCH_RINGS; ring++) {
    const candidates = [];
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        candidates.push({ x: pos.x + i * GRID, y: pos.y + j * GRID });
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y));
    const free = candidates.find(fits);
    if (free) return free;
  }
  return null;
}

// The id of the first machine that `id` would overlap at `pos`, or null.
export function overlappingMachine(line, id, pos) {
  const m = line.machines.find((x) => x.id === id);
  const placed = machineFootprint({ ...m, x: pos.x, y: pos.y });
  const other = line.machines.find((o) => o.id !== id
    && machineFootprint(o).some((a) => placed.some((b) => rectsOverlap(a, b))));
  return other ? other.id : null;
}

// The line with the machine at `pos`, unchecked. The moved machine's
// connections lose their hand-placed bend points and their coupling mark,
// so the renderer routes them (routing.js). Every other connection keeps
// its drawing.
export function placeMachine(line, id, pos) {
  return {
    ...line,
    machines: line.machines.map((m) => (m.id === id ? { ...m, x: pos.x, y: pos.y } : m)),
    connections: line.connections.map((c) => {
      if (c.from.machine !== id && c.to.machine !== id) return c;
      if (c.via === undefined && c.coupling === undefined) return c;
      const rerouted = { ...c };
      delete rerouted.via;
      delete rerouted.coupling;
      return rerouted;
    }),
  };
}

// Returns { ok: true, line } or { ok: false, error, overlaps? }.
export function moveMachine(line, id, pos) {
  const m = line.machines.find((x) => x.id === id);
  if (!m) return { ok: false, error: `There is no machine "${id}" on this line.` };
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    return { ok: false, error: "A position must be two numbers." };
  }
  if (pos.x === m.x && pos.y === m.y) return { ok: true, line };
  const overlaps = overlappingMachine(line, id, pos);
  if (overlaps) {
    return { ok: false, error: `${m.name} would sit on top of another machine.`, overlaps };
  }
  return { ok: true, line: placeMachine(line, id, pos) };
}

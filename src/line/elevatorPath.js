// A bucket elevator's path (issue #156): the full distance grain travels,
// from the inlet along the floor run, up the column, and along the head run
// to the outlet. The machine stores each segment's length in metres as
// `geom.segmentsM: { floor, column, head }`, adding up to `sim.distanceM`.
// The drawing (w, h, geom.colX and the two port anchors) follows from the
// segments at the true scale, and is stored alongside them so every reader
// of a machine's shape (layout.js, routing.js, the symbols) stays as it is.
//
// The boot, where the floor run meets the column, stays fixed on the canvas
// when the segments change: the inlet moves out along the floor, and the
// head and outlet move up and down with the column.
import { applyGeometryEdit, rerouteConnections, settleMachine } from "./layout";
import { draggedLengths } from "./lengthHandles";

// The scale the old 264 px column for 8.731 m implied.
export const PX_PER_M = 30;
export const MIN_COLUMN_M = 4;
export const MIN_RUN_M = 0.5;
export const MIN_TOTAL_M = MIN_COLUMN_M + 2 * MIN_RUN_M;

// A run is measured from the column's face to its port, so a run of at
// least MIN_RUN_M keeps the port off the column. The duct runs on past
// each port by these fixed insets, the E200's own.
export const INLET_INSET = 25;
const OUTLET_INSET = 44;

// Each run's share of the total when a shape is made from a total alone
// (an old height-model elevator migrated).
const RUN_SHARE = 0.15;

// A bucket elevator drawn as a Z-shaped duct: one with a path (`segmentsM`),
// or one saved before issue #156 still waiting to be migrated to one.
export function isBucketElevator(m) {
  return m.type === "elevator" && m.geom !== undefined;
}

// The segments for `total` metres with each run at its default share, cut
// back toward MIN_RUN_M where the column would fall below MIN_COLUMN_M.
// `total` must be at least MIN_TOTAL_M.
export function segmentsForTotal(total) {
  const run = Math.max(MIN_RUN_M, Math.min(total * RUN_SHARE, (total - MIN_COLUMN_M) / 2));
  return { floor: run, column: total - 2 * run, head: run };
}

const sum = (s) => s.floor + s.column + s.head;
// The same tolerance as adjustableFields.closeTo, which imports this module.
const closeTo = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
// A length for a message, without float noise.
const metres = (v) => Number(v.toPrecision(12));

// Why `segments` cannot be this elevator's path of `distanceM`, or null.
export function segmentsError(segments, distanceM) {
  const isLength = (v) => typeof v === "number" && Number.isFinite(v);
  if (!segments || !["floor", "column", "head"].every((k) => isLength(segments[k]))) {
    return "has no floor run, column and head run lengths";
  }
  if (segments.column < MIN_COLUMN_M - 1e-9) return `has a column of ${segments.column} m, below the ${MIN_COLUMN_M} m minimum`;
  for (const run of ["floor", "head"]) {
    if (segments[run] < MIN_RUN_M - 1e-9) return `has a ${run} run of ${segments[run]} m, below the ${MIN_RUN_M} m minimum`;
  }
  if (!closeTo(sum(segments), distanceM)) {
    return `has segments adding up to ${metres(sum(segments))} m, not its path length of ${distanceM} m`;
  }
  return null;
}

// The boot, the bottom of the column's centre line, from the machine's
// top-left corner.
function bootOffset(m) {
  const centre = m.geom.colX + m.geom.duct / 2;
  return { x: m.flipped ? m.w - centre : centre, y: m.h };
}

// Shapes `m` (changed in place) to `segments`, with its boot where it was
// and `sim.distanceM` their total.
export function shapeElevator(m, segments) {
  const was = bootOffset(m);
  const boot = { x: m.x + was.x, y: m.y + was.y };
  const { duct } = m.geom;
  const colX = INLET_INSET + segments.floor * PX_PER_M;
  const h = segments.column * PX_PER_M;
  const outX = colX + duct + segments.head * PX_PER_M;
  m.geom = { ...m.geom, colX, segmentsM: { ...segments } };
  m.w = outX + OUTLET_INSET;
  m.h = h;
  m.sim.distanceM = sum(segments);
  placeElevatorPorts(m);
  const now = bootOffset(m);
  m.x = boot.x - now.x;
  m.y = boot.y - now.y;
}

// Issue #152: the ports on `m`'s runs, in its unflipped shape. The inlets
// are spaced evenly along the floor run and the outlets along the head run,
// the last of each at its run's end, where an elevator's single port is.
// With more than one port on either side, each port's distance along the
// path, from the floor run's end, is its `sim.portDistanceM`, so grain
// from a nearer inlet, or to a nearer outlet, has less path to travel.
// Changes `m` in place.
export function placeElevatorPorts(m) {
  const { colX, duct, segmentsM: s } = m.geom;
  const { inputs, outputs } = m.ports;
  const outY = outputs.map((p) => m.anchors[p]?.y).find(Number.isFinite) ?? duct + 8;
  const anchors = {};
  const distances = {};
  inputs.forEach((p, i) => {
    const along = (s.floor * (inputs.length - 1 - i)) / inputs.length;
    anchors[p] = { x: INLET_INSET + along * PX_PER_M, y: m.h - duct };
    distances[p] = along;
  });
  outputs.forEach((p, i) => {
    const along = (s.head * (i + 1)) / outputs.length;
    anchors[p] = { x: colX + duct + along * PX_PER_M, y: outY };
    distances[p] = s.floor + s.column + along;
  });
  m.anchors = anchors;
  if (inputs.length > 1 || outputs.length > 1) m.sim.portDistanceM = distances;
  else delete m.sim.portDistanceM;
}

// Why the path cannot be `total` metres long with `m`'s runs, or null.
export function pathLengthError(m, total) {
  const { floor, head } = m.geom.segmentsM;
  if (total - floor - head >= MIN_COLUMN_M - 1e-9) return null;
  return `${m.name} needs a path length of at least ${metres(floor + head + MIN_COLUMN_M)} m: `
    + `its floor run and head run take ${metres(floor + head)} m, and the column at least ${MIN_COLUMN_M} m.`;
}

// A new total changes only the column; the runs keep their lengths.
export function setPathLength(m, total) {
  const { floor, head } = m.geom.segmentsM;
  shapeElevator(m, { floor, column: total - floor - head, head });
}

// Issue #157: the handles that reshape a selected elevator in Build mode,
// in the machine's local space, mirrored on a flipped one (whose handles
// then drag the mirrored way). Each trades length between two segments
// (lengthHandles.js), so the path length never changes: the floor run's
// end, dragged out along the floor, and the head run's end, dragged out
// sideways, lengthen their run from the column; the column's top, dragged
// up, lengthens the column from the head run. None on any other machine.
const HANDLES = [
  { id: "floor", axis: "x", sign: -1, grows: "floor", takesFrom: "column", at: (m) => ({ x: 0, y: m.h - m.geom.duct / 2 }) },
  { id: "head", axis: "x", sign: 1, grows: "head", takesFrom: "column", at: (m) => ({ x: m.w, y: m.geom.duct / 2 }) },
  { id: "column", axis: "y", sign: -1, grows: "column", takesFrom: "head", at: (m) => ({ x: m.geom.colX + m.geom.duct / 2, y: 0 }) },
];
const MIN_SEGMENT_M = { floor: MIN_RUN_M, column: MIN_COLUMN_M, head: MIN_RUN_M };
// A drag moves in these steps of metres, or the fine ones with Alt held.
const DRAG_STEP_M = 0.1;
const FINE_STEP_M = 0.01;

const isShaped = (m) => isBucketElevator(m) && m.geom.segmentsM !== undefined;

export function elevatorHandles(m) {
  if (!isShaped(m)) return [];
  return HANDLES.map(({ at, ...handle }) => {
    const p = at(m);
    if (!m.flipped) return { ...handle, ...p };
    return { ...handle, x: m.w - p.x, y: p.y, sign: handle.axis === "x" ? -handle.sign : handle.sign };
  });
}

// The segments after handle `handleId` was dragged `deltaPx` ({ x, y }, in
// world space) from where the drag began.
export function segmentsAfterDrag(m, handleId, deltaPx, { fine = false } = {}) {
  const handle = elevatorHandles(m).find((h) => h.id === handleId);
  return draggedLengths(m.geom.segmentsM, handle, deltaPx, {
    pxPerM: PX_PER_M, step: fine ? FINE_STEP_M : DRAG_STEP_M, min: MIN_SEGMENT_M,
  });
}

// The line with elevator `id` shaped to `segments` and nothing else: the
// live preview while a handle is dragged, which may overlap other machines.
export function previewReshape(line, id, segments) {
  return {
    ...line,
    machines: line.machines.map((m) => {
      if (m.id !== id) return m;
      const shaped = structuredClone(m);
      shapeElevator(shaped, segments);
      return shaped;
    }),
    connections: rerouteConnections(line.connections, id),
  };
}

// A released handle: elevator `id` takes `segments`, which must add up to
// its path length, its connections re-routed and, if its new shape overlaps
// another machine, moved to the nearest free spot (issue #154). Returns
// { ok: true, line } or { ok: false, error }.
export function reshapeElevator(line, id, segments) {
  const m = line.machines.find((x) => x.id === id);
  if (!m) return { ok: false, error: `There is no machine "${id}" on this line.` };
  if (!isShaped(m)) return { ok: false, error: `${m.name} is not a bucket elevator with a path to reshape.` };
  const error = segmentsError(segments, m.sim.distanceM);
  if (error) return { ok: false, error: `${m.name} ${error}.` };
  return applyGeometryEdit(line, id, (next, machine) => {
    shapeElevator(machine, segments);
    // The total stays exactly as it was, free of the sum's float noise.
    machine.sim.distanceM = m.sim.distanceM;
    next.connections = rerouteConnections(next.connections, id);
  });
}

// An old height becomes the total path length, raised to MIN_TOTAL_M if
// shorter: work saved before issue #156 is never refused for it.
export function pathLengthFromHeight(height) {
  return Math.max(MIN_TOTAL_M, height);
}

// An elevator saved under the old height model, with `sim.distanceM`
// counting the column alone and a "height" field. The old height becomes
// the total path length, the runs take their default share and the boot
// stays where it was. The "height" field becomes "path length". Changes
// `m` in place; returns whether it needed migrating.
export function migrateElevator(m) {
  if (!isBucketElevator(m) || m.geom.segmentsM !== undefined || !m.sim) return false;
  shapeElevator(m, segmentsForTotal(pathLengthFromHeight(m.sim.distanceM)));
  if (m.adjustable) {
    m.adjustable = m.adjustable.map((a) => (a.bind !== "height" ? a : {
      ...a, id: "pathLength", label: "path length", bind: "pathLength",
      min: pathLengthFromHeight(a.min), max: pathLengthFromHeight(a.max), default: pathLengthFromHeight(a.default),
    }));
  }
  return true;
}

// `line` with machine `id` migrated if it needs it, its connections
// re-routed and, where its new shape overlaps something, moved to the
// nearest free spot. One with no free spot stays where the migration put
// it: saved work is never refused for this. `line` itself is unchanged.
export function migrateMachine(line, id) {
  const migrated = structuredClone(line);
  if (!migrateElevator(migrated.machines.find((m) => m.id === id))) return line;
  migrated.connections = rerouteConnections(migrated.connections, id);
  const settled = settleMachine(migrated, id);
  return settled.ok ? settled.line : migrated;
}

// The line with every old height-model elevator migrated: OPEN, and an
// opened file's saved work.
export function migrateHeightModel(line) {
  return line.machines.reduce((next, { id }) => migrateMachine(next, id), line);
}

// The golden line's E200 as drawn before issue #156, where a height edit
// scaled `h` and kept the top-left corner. Only the golden elevator can be
// a base machine in saved golden line changes.
const HEIGHT_MODEL_DRAWING = { w: 420, h: 264, colX: 200, duct: 36, distanceM: 8.731 };

// Golden line changes saved before issue #156 (savedWork.js version 1),
// for the line as it is now. A height change becomes a path length change.
// A moved elevator's position was its old drawing's top-left corner, so it
// becomes the position that puts the new shape's boot where the old one's
// was.
export function changesFromHeightModel(base, changes) {
  const lastFor = (id, key) => changes.filter((c) => c.machine === id && c[key] !== undefined).at(-1);
  const moved = new Map();
  for (const m of base.machines.filter((x) => isBucketElevator(x) && x.geom.segmentsM)) {
    const position = lastFor(m.id, "position")?.position;
    if (!position) continue;
    const heightChange = changes.filter((c) => c.machine === m.id && c.field === "height").at(-1);
    const height = heightChange?.value ?? HEIGHT_MODEL_DRAWING.distanceM;
    const flipped = lastFor(m.id, "flipped")?.flipped ?? Boolean(m.flipped);
    const drawn = HEIGHT_MODEL_DRAWING;
    const old = { w: drawn.w, h: drawn.h * (height / drawn.distanceM), geom: drawn, flipped };
    const now = structuredClone({ ...m, flipped });
    setPathLength(now, pathLengthFromHeight(height));
    const [oldBoot, newBoot] = [bootOffset(old), bootOffset(now)];
    moved.set(m.id, { x: position.x + oldBoot.x - newBoot.x, y: position.y + oldBoot.y - newBoot.y });
  }
  return changes.map((c) => {
    if (c.field === "height" && typeof c.value === "number") return { ...c, field: "pathLength", value: pathLengthFromHeight(c.value) };
    if (c.position && moved.has(c.machine)) return { ...c, position: moved.get(c.machine) };
    return c;
  });
}

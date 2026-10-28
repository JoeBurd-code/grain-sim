// A Z-shaped machine's path: the full distance grain travels, from the inlet
// along the floor run, up the column, and along the head run to the outlet.
// Issue #156 gave the bucket elevator this model, and issue #160 made it
// every Z shape's (any machine with a duct `geom`, today the bucket elevator
// and the pendulum conveyor), so a new Z-shaped catalogue item needs only
// its JSON. The machine stores each segment's length in metres as
// `geom.segmentsM: { floor, column, head }`, adding up to `sim.distanceM`.
// The drawing (w, h, geom.colX and the port anchors) follows from the
// segments at the true scale, and is stored alongside them so every reader
// of a machine's shape (layout.js, routing.js, the symbols) stays as it is.
//
// Inlets sit on the floor run and outlets on the head run. Each port keeps
// its share of its run, measured from the column (`geom.portShares`, 1 at
// the run's far end), when the run changes length.
//
// The boot, where the floor run meets the column, stays fixed on the canvas
// when the segments change: the inlets move out along the floor, and the
// head and outlets move up and down with the column.
import { applyGeometryEdit, rerouteConnections, settleMachine } from "./layout";
import { draggedLengths } from "./lengthHandles";

// The scale the old 264 px column for 8.731 m implied, shared by every Z
// shape so lengths compare honestly on screen.
export const PX_PER_M = 30;
export const MIN_COLUMN_M = 4;
export const MIN_RUN_M = 0.5;
export const MIN_TOTAL_M = MIN_COLUMN_M + 2 * MIN_RUN_M;
// A catalogue item may declare its own (`geom.minSegmentsM`).
const MIN_SEGMENT_M = { floor: MIN_RUN_M, column: MIN_COLUMN_M, head: MIN_RUN_M };

// A run is measured from the column's face to its last port, so a run of
// at least MIN_RUN_M keeps the port off the column. The duct runs on past
// each run's end by these fixed insets, the E200's own.
export const INLET_INSET = 25;
const OUTLET_INSET = 44;

// Each run's share of the total when an old height-model elevator migrates.
const RUN_SHARE = 0.15;

// Issue #160: the pendulum conveyor's segments, from the sheet 52-13 spec
// block, and where its ports sit along its runs: in1 halfway along the
// floor run under drum feeder 1, in2 at its end under drum feeder 2, and
// the outlets where the old drawn head run had them (240 and 1120 of its
// 1745 px, outConcetti at its end). An old pendulum migrates to these.
export const PENDULUM_SEGMENTS_M = { floor: 7.084, column: 9.157, head: 14.846 };
export const PENDULUM_PORT_SHARES = { in1: 0.5, in2: 1, outBuffer: 0.1375, outBinSeg: 0.6418, outConcetti: 1 };

// A machine drawn as a Z-shaped duct: one with a path (`segmentsM`), or one
// saved before its path was stored, still waiting to be migrated to one.
export function isZShape(m) {
  return m.geom?.duct !== undefined;
}

const isShaped = (m) => isZShape(m) && m.geom.segmentsM !== undefined;

export function minSegments(m) {
  return { ...MIN_SEGMENT_M, ...m.geom?.minSegmentsM };
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
// A length without float noise.
const metres = (v) => Number(v.toPrecision(12));

// Why `segments` cannot be a path of `distanceM` with minimums `min`, or null.
export function segmentsError(segments, distanceM, min = MIN_SEGMENT_M) {
  const isLength = (v) => typeof v === "number" && Number.isFinite(v);
  if (!segments || !["floor", "column", "head"].every((k) => isLength(segments[k]))) {
    return "has no floor run, column and head run lengths";
  }
  if (segments.column < min.column - 1e-9) return `has a column of ${segments.column} m, below the ${min.column} m minimum`;
  for (const run of ["floor", "head"]) {
    if (segments[run] < min[run] - 1e-9) return `has a ${run} run of ${segments[run]} m, below the ${min[run]} m minimum`;
  }
  if (!closeTo(sum(segments), distanceM)) {
    return `has segments adding up to ${metres(sum(segments))} m, not its path length of ${distanceM} m`;
  }
  return null;
}

// Why `m`'s `geom.portShares` cannot be its ports' shares of their runs, or null.
export function portSharesError(m) {
  const shares = m.geom.portShares;
  if (shares === undefined) return null;
  for (const [port, share] of Object.entries(shares)) {
    if (![...m.ports.inputs, ...m.ports.outputs].includes(port)) return `has a port share for "${port}", which is not one of its ports`;
    if (!(typeof share === "number" && share > 0 && share <= 1)) return `has a share of ${share} for port "${port}"; it must be above 0 and at most 1`;
  }
  return null;
}

// The boot, the bottom of the column's centre line, from the machine's
// top-left corner.
function bootOffset(m) {
  const centre = m.geom.colX + m.geom.duct / 2;
  return { x: m.flipped ? m.w - centre : centre, y: m.h };
}

// Draws `m` (changed in place) from `segments`: its size, its column, its
// ports and `sim.distanceM`, their total. Leaves its position alone, so a
// catalogue item, which has none, can be drawn too.
export function drawZ(m, segments) {
  const { duct } = m.geom;
  const colX = INLET_INSET + segments.floor * PX_PER_M;
  const outX = colX + duct + segments.head * PX_PER_M;
  m.geom = { ...m.geom, colX, segmentsM: { ...segments } };
  m.w = outX + OUTLET_INSET;
  m.h = segments.column * PX_PER_M;
  m.sim.distanceM = metres(sum(segments));
  placeZPorts(m);
}

// Shapes `m` (changed in place) to `segments`, with its boot where it was.
export function shapeZ(m, segments) {
  const was = bootOffset(m);
  const boot = { x: m.x + was.x, y: m.y + was.y };
  drawZ(m, segments);
  const now = bootOffset(m);
  m.x = boot.x - now.x;
  m.y = boot.y - now.y;
}

// The ports on `m`'s runs, in its unflipped shape: inlets on the floor run,
// outlets on the head run, each at its share of its run from the column
// (issue #160). A port with no share declared is spaced evenly along its
// run with the others on its side, the last at the run's far end (issue
// #152), where an elevator's single port is. With more than one port on
// either side, each port's distance along the path, from the floor run's
// far end, is its `sim.portDistanceM`, so grain from a nearer inlet, or to
// a nearer outlet, has less path to travel. Changes `m` in place.
export function placeZPorts(m) {
  const { colX, duct, segmentsM: s, portShares = {} } = m.geom;
  const { inputs, outputs } = m.ports;
  const outY = outputs.map((p) => m.anchors?.[p]?.y).find(Number.isFinite) ?? duct + 8;
  const share = (p, i, n) => portShares[p] ?? (i + 1) / n;
  const anchors = {};
  const distances = {};
  inputs.forEach((p, i) => {
    // From the floor run's far end, so the last inlet sits exactly there.
    const fromEnd = s.floor * (1 - share(p, i, inputs.length));
    anchors[p] = { x: INLET_INSET + fromEnd * PX_PER_M, y: m.h - duct };
    distances[p] = metres(fromEnd);
  });
  outputs.forEach((p, i) => {
    const along = s.head * share(p, i, outputs.length);
    anchors[p] = { x: colX + duct + along * PX_PER_M, y: outY };
    distances[p] = metres(s.floor + s.column + along);
  });
  m.anchors = anchors;
  if (inputs.length > 1 || outputs.length > 1) m.sim.portDistanceM = distances;
  else delete m.sim.portDistanceM;
}

// Why the path cannot be `total` metres long with `m`'s runs, or null.
export function pathLengthError(m, total) {
  const { floor, head } = m.geom.segmentsM;
  const minColumn = minSegments(m).column;
  if (total - floor - head >= minColumn - 1e-9) return null;
  return `${m.name} needs a path length of at least ${metres(floor + head + minColumn)} m: `
    + `its floor run and head run take ${metres(floor + head)} m, and the column at least ${minColumn} m.`;
}

// A new total changes only the column; the runs keep their lengths.
export function setPathLength(m, total) {
  const { floor, head } = m.geom.segmentsM;
  shapeZ(m, { floor, column: metres(total - floor - head), head });
}

// Issue #157: the handles that reshape a selected Z shape in Build mode,
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
// A drag moves in these steps of metres, or the fine ones with Alt held.
const DRAG_STEP_M = 0.1;
const FINE_STEP_M = 0.01;

export function zHandles(m) {
  if (!isShaped(m)) return [];
  return HANDLES.map(({ at, ...handle }) => {
    const p = at(m);
    if (!m.flipped) return { ...handle, ...p };
    return { ...handle, x: m.w - p.x, y: p.y, sign: handle.axis === "x" ? -handle.sign : handle.sign };
  });
}

// Issue #159: a length on the canvas, to one decimal (a drag's step) or to
// as many as it has (a finer drag, or a path length typed in the panel),
// free of float noise, so it reads as the panel and the saved segments do.
export function metresLabel(v) {
  const text = String(metres(v));
  return `${text.includes(".") ? text : `${text}.0`} m`;
}

// Issue #159: the lengths a lone selected Z shape shows on the canvas in
// Build mode, in the machine's local space: each segment's beside its own
// run (the floor run's under its duct, clear of the inlet dots on its top
// edge, the column's halfway up its head-run side, the head run's above
// its duct) and the total beside the column's top, away from the head run.
// On a flipped machine they sit on the mirrored sides, anchored so the
// text reads normally. While handle `handleId` is dragged the two segments
// it trades between are highlighted. None on any other machine.
const LABEL_GAP = 5;
// Half an 8 px label's cap height: a baseline this far below a point
// centres the text on it.
const HALF_CAP = 3;
export function segmentLabels(m, { handleId } = {}) {
  if (!isShaped(m)) return [];
  const { colX, duct, segmentsM: s } = m.geom;
  const headStart = colX + duct;
  const handle = HANDLES.find((h) => h.id === handleId);
  const traded = handle ? [handle.grows, handle.takesFrom] : [];
  const labels = [
    { id: "floor", text: metresLabel(s.floor), x: (INLET_INSET + colX) / 2, y: m.h + LABEL_GAP + 2 * HALF_CAP, anchor: "middle" },
    { id: "column", text: metresLabel(s.column), x: headStart + LABEL_GAP, y: m.h / 2 + HALF_CAP, anchor: "start" },
    { id: "head", text: metresLabel(s.head), x: headStart + (s.head * PX_PER_M) / 2, y: -LABEL_GAP, anchor: "middle" },
    { id: "total", text: `${metresLabel(m.sim.distanceM)} total`, x: colX - LABEL_GAP, y: duct / 2 + HALF_CAP, anchor: "end" },
  ];
  const mirror = { start: "end", end: "start", middle: "middle" };
  return labels.map((l) => ({
    ...l,
    ...(m.flipped && { x: m.w - l.x, anchor: mirror[l.anchor] }),
    highlighted: traded.includes(l.id),
  }));
}

// The segments after handle `handleId` was dragged `deltaPx` ({ x, y }, in
// world space) from where the drag began.
export function segmentsAfterDrag(m, handleId, deltaPx, { fine = false } = {}) {
  const handle = zHandles(m).find((h) => h.id === handleId);
  return draggedLengths(m.geom.segmentsM, handle, deltaPx, {
    pxPerM: PX_PER_M, step: fine ? FINE_STEP_M : DRAG_STEP_M, min: minSegments(m),
  });
}

// The line with Z shape `id` shaped to `segments` and nothing else: the
// live preview while a handle is dragged, which may overlap other machines.
export function previewReshape(line, id, segments) {
  return {
    ...line,
    machines: line.machines.map((m) => {
      if (m.id !== id) return m;
      const shaped = structuredClone(m);
      shapeZ(shaped, segments);
      return shaped;
    }),
    connections: rerouteConnections(line.connections, id),
  };
}

// Z shape `id` takes `segments`, its connections re-routed and, if its new
// shape overlaps another machine, moved to the nearest free spot (issue
// #154). With `keepTotal` the segments must add up to its path length.
// Returns { ok: true, line } or { ok: false, error }.
function setSegments(line, id, segments, { keepTotal }) {
  const m = line.machines.find((x) => x.id === id);
  if (!m) return { ok: false, error: `There is no machine "${id}" on this line.` };
  if (!isShaped(m)) return { ok: false, error: `${m.name} is not a Z-shaped machine with a path to reshape.` };
  const total = keepTotal ? m.sim.distanceM : sum(segments ?? {});
  const error = segmentsError(segments, total, minSegments(m));
  if (error) return { ok: false, error: `${m.name} ${error}.` };
  return applyGeometryEdit(line, id, (next, machine) => {
    shapeZ(machine, segments);
    // The total stays exactly as it was, free of the sum's float noise.
    if (keepTotal) machine.sim.distanceM = m.sim.distanceM;
    next.connections = rerouteConnections(next.connections, id);
  });
}

// A released handle: the segments must add up to the path length.
export function reshapeZ(line, id, segments) {
  return setSegments(line, id, segments, { keepTotal: true });
}

// Issue #160: a stored `{ machine, segments }` change sets the whole path,
// its total too, so it never depends on a path length change applied
// beside it, which the base's runs may leave too short a column for.
export function setZSegments(line, id, segments) {
  return setSegments(line, id, segments, { keepTotal: false });
}

// An old height becomes the total path length, raised to MIN_TOTAL_M if
// shorter: work saved before issue #156 is never refused for it.
export function pathLengthFromHeight(height) {
  return Math.max(MIN_TOTAL_M, height);
}

// Issue #160: an old pendulum conveyor's length, split in the spec block's
// proportions, raised where the column would fall below its minimum, so
// work saved before this issue is never refused for it.
export function pendulumSegmentsFor(length) {
  const spec = PENDULUM_SEGMENTS_M;
  const total = Math.max(length, (MIN_COLUMN_M * sum(spec)) / spec.column);
  const floor = metres((total * spec.floor) / sum(spec));
  const head = metres((total * spec.head) / sum(spec));
  return { floor, column: metres(total - floor - head), head };
}

// A Z shape saved before its path was stored, migrated: an elevator saved
// under the old height model (issue #156), with `sim.distanceM` counting
// the column alone and a "height" field, or a pendulum conveyor saved under
// the old length model (issue #160), drawn at its own scale with a "length"
// field. The old height or length becomes the total path length; an
// elevator's runs take their default share and a pendulum's split in the
// spec block's proportions, its ports at their shares of its runs. The
// boot stays where it was, and the field becomes "path length". Changes
// `m` in place; returns whether it needed migrating.
export function migrateZShape(m) {
  if (!isZShape(m) || m.geom.segmentsM !== undefined || !m.sim) return false;
  const elevator = m.type === "elevator";
  if (!elevator) {
    const ports = [...m.ports.inputs, ...m.ports.outputs];
    const shares = Object.fromEntries(Object.entries(PENDULUM_PORT_SHARES).filter(([p]) => ports.includes(p)));
    if (Object.keys(shares).length > 0) m.geom.portShares = shares;
  }
  shapeZ(m, elevator ? segmentsForTotal(pathLengthFromHeight(m.sim.distanceM)) : pendulumSegmentsFor(m.sim.distanceM));
  const oldBind = elevator ? "height" : "length";
  const total = elevator ? pathLengthFromHeight : (v) => v;
  if (m.adjustable) {
    m.adjustable = m.adjustable.map((a) => (a.bind !== oldBind ? a : {
      ...a, id: "pathLength", label: "path length", bind: "pathLength",
      min: total(a.min), max: total(a.max), default: total(a.default),
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
  if (!migrateZShape(migrated.machines.find((m) => m.id === id))) return line;
  migrated.connections = rerouteConnections(migrated.connections, id);
  const settled = settleMachine(migrated, id);
  return settled.ok ? settled.line : migrated;
}

// The line with every old Z shape migrated: OPEN, and an opened file's
// saved work.
export function migrateOldZShapes(line) {
  return line.machines.reduce((next, { id }) => migrateMachine(next, id), line);
}

// Where an old drawing's boot sat, from its top-left corner, and so the
// position that puts `now`'s boot there.
function positionKeepingBoot(position, old, now) {
  const [oldBoot, newBoot] = [bootOffset(old), bootOffset(now)];
  return { x: position.x + oldBoot.x - newBoot.x, y: position.y + oldBoot.y - newBoot.y };
}

const lastFor = (changes, id, key) => changes.filter((c) => c.machine === id && c[key] !== undefined).at(-1);

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
  const moved = new Map();
  for (const m of base.machines.filter((x) => x.type === "elevator" && isShaped(x))) {
    const position = lastFor(changes, m.id, "position")?.position;
    if (!position) continue;
    const heightChange = changes.filter((c) => c.machine === m.id && c.field === "height").at(-1);
    const height = heightChange?.value ?? HEIGHT_MODEL_DRAWING.distanceM;
    const flipped = lastFor(changes, m.id, "flipped")?.flipped ?? Boolean(m.flipped);
    const drawn = HEIGHT_MODEL_DRAWING;
    const old = { w: drawn.w, h: drawn.h * (height / drawn.distanceM), geom: drawn, flipped };
    const now = structuredClone({ ...m, flipped });
    setPathLength(now, pathLengthFromHeight(height));
    moved.set(m.id, positionKeepingBoot(position, old, now));
  }
  return changes.map((c) => {
    if (c.field === "height" && typeof c.value === "number") return { ...c, field: "pathLength", value: pathLengthFromHeight(c.value) };
    if (c.position && moved.has(c.machine)) return { ...c, position: moved.get(c.machine) };
    return c;
  });
}

// The golden line's pendulum conveyor as drawn before issue #160: a length
// edit scaled `w` and kept the near end, so the column never moved.
const LENGTH_MODEL_DRAWING = { w: 2030, h: 780, colX: 280, duct: 36, distanceM: 31.087 };

// Golden line changes saved before issue #160 (savedWork.js version 2),
// for the line as it is now. A pendulum's length change becomes a path
// length change and the segments the spec block's proportions give it, as
// a migrated file's pendulum gets, the segments first so the path length
// lands whatever the golden runs. A moved pendulum's position becomes the
// one that keeps its boot where the old drawing's was.
export function changesFromLengthModel(base, changes) {
  const pendulums = new Map(base.machines.filter((x) => x.type === "conveyor" && isShaped(x)).map((m) => [m.id, m]));
  const lengthOf = (id) => {
    const change = changes.filter((c) => c.machine === id && c.field === "length").at(-1);
    return typeof change?.value === "number" ? change.value : LENGTH_MODEL_DRAWING.distanceM;
  };
  const moved = new Map();
  for (const m of pendulums.values()) {
    const position = lastFor(changes, m.id, "position")?.position;
    if (!position) continue;
    const length = lengthOf(m.id);
    const flipped = lastFor(changes, m.id, "flipped")?.flipped ?? Boolean(m.flipped);
    const drawn = LENGTH_MODEL_DRAWING;
    const old = { w: drawn.w * (length / drawn.distanceM), h: drawn.h, geom: drawn, flipped };
    const now = structuredClone({ ...m, flipped });
    drawZ(now, pendulumSegmentsFor(length));
    moved.set(m.id, positionKeepingBoot(position, old, now));
  }
  return changes.flatMap((c) => {
    if (pendulums.has(c.machine) && c.field === "length" && typeof c.value === "number") {
      const segments = pendulumSegmentsFor(c.value);
      return [{ machine: c.machine, segments }, { ...c, field: "pathLength", value: metres(sum(segments)) }];
    }
    if (c.position && moved.has(c.machine)) return [{ ...c, position: moved.get(c.machine) }];
    return [c];
  });
}

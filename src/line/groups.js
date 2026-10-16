// Several machines worked on together in Build mode (issue #95): a group
// selected with a box or Shift+click is moved, deleted, copied and pasted
// as one edit. Like every other line document function, none of these ever
// changes the line it is given.
import { firstFree, deleteMachine } from "./editing";
import { machineFootprint, nearestFree, snapPosition } from "./layout";
import { ruleMachines } from "./interlocks";

// Touching along an edge is not an overlap, as in layout.js.
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function shifted(m, delta) {
  return { ...m, x: m.x + delta.x, y: m.y + delta.y };
}

// The id of the first machine outside `group` that a machine of the group
// would overlap once `group` has moved by `delta`, or null. Machines in the
// group never overlap each other: they keep their places in the group.
function groupOverlap(machines, group, delta) {
  const placed = machines.filter((m) => group.has(m.id)).flatMap((m) => machineFootprint(shifted(m, delta)));
  const other = machines.find((o) => !group.has(o.id)
    && machineFootprint(o).some((a) => placed.some((b) => rectsOverlap(a, b))));
  return other ? other.id : null;
}

// The id of the first machine outside the group that the group of `ids`
// would overlap once moved by `delta`, or null.
export function overlappingGroup(line, ids, delta) {
  return groupOverlap(line.machines, new Set(ids), delta);
}

function missing(line, ids) {
  const onLine = new Set(line.machines.map((m) => m.id));
  return ids.find((id) => !onLine.has(id));
}

// The line with every machine in `ids` moved by `delta`, unchecked. A
// connection with one end in the group loses its hand-placed bend points
// and its coupling mark, as placeMachine (layout.js) does for one machine.
// A connection with both ends in the group moves with it, drawing and all,
// so a valve bolted under its bin stays bolted.
export function placeMachines(line, ids, delta) {
  const group = new Set(ids);
  return {
    ...line,
    machines: line.machines.map((m) => (group.has(m.id) ? shifted(m, delta) : m)),
    connections: line.connections.map((c) => {
      const from = group.has(c.from.machine);
      const to = group.has(c.to.machine);
      if (!from && !to) return c;
      if (from && to) {
        return c.via ? { ...c, via: c.via.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })) } : c;
      }
      if (c.via === undefined && c.coupling === undefined) return c;
      const rerouted = { ...c };
      delete rerouted.via;
      delete rerouted.coupling;
      return rerouted;
    }),
  };
}

// Returns { ok: true, line } or { ok: false, error, overlaps? }.
export function moveMachines(line, ids, delta) {
  const absent = missing(line, ids);
  if (absent !== undefined) return { ok: false, error: `There is no machine "${absent}" on this line.` };
  if (!delta || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
    return { ok: false, error: "A step must be two numbers." };
  }
  if (delta.x === 0 && delta.y === 0) return { ok: true, line };
  const overlaps = groupOverlap(line.machines, new Set(ids), delta);
  if (overlaps) return { ok: false, error: "The group would sit on top of another machine.", overlaps };
  return { ok: true, line: placeMachines(line, ids, delta) };
}

// Each machine goes as deleteMachine (editing.js) takes it: with its
// connections, leaving the interlocks that name it off.
// Returns { ok: true, line } or { ok: false, error }.
export function deleteMachines(line, ids) {
  const absent = missing(line, ids);
  if (absent !== undefined) return { ok: false, error: `There is no machine "${absent}" on this line.` };
  let next = line;
  for (const id of ids) next = deleteMachine(next, id).line;
  return { ok: true, line: next };
}

// What Ctrl+C keeps: the machines, the connections between them and the
// interlocks whose machines are all among them, as copies. A golden line
// machine leaves its zone behind: a built machine has none (editing.js).
export function copyMachines(line, ids) {
  const group = new Set(ids);
  const machines = line.machines.filter((m) => group.has(m.id)).map((m) => {
    const copy = structuredClone(m);
    delete copy.zone;
    return copy;
  });
  const connections = line.connections
    .filter((c) => group.has(c.from.machine) && group.has(c.to.machine))
    .map((c) => structuredClone(c));
  const interlocks = (line.interlocks ?? []).filter((r) => {
    const named = ruleMachines(r);
    return named.length > 0 && named.every((id) => group.has(id));
  }).map((r) => structuredClone(r));
  return { machines, connections, interlocks };
}

// The top-left corner of the box around the machines.
export function groupCorner(machines) {
  return { x: Math.min(...machines.map((m) => m.x)), y: Math.min(...machines.map((m) => m.y)) };
}

// An id or name without the number a copy was given: "metal-bin-2" is a
// "metal-bin", "METAL BIN 1" is a "METAL BIN".
const withoutNumber = (text, sep) => text.replace(new RegExp(`${sep}\\d+$`), "");

function remapEnd(end, ids) {
  return { ...end, machine: ids.get(end.machine) };
}

// The rule with every machine it names swapped for its copy. A step that
// names no machine (a wait, an "if still true", a line trip) is unchanged.
function remapRule(rule, ids, id) {
  const swap = (part) => (part?.machine !== undefined ? { ...part, machine: ids.get(part.machine) ?? part.machine } : part);
  const next = { ...rule, id, when: swap(rule.when), then: (rule.then ?? []).map(swap) };
  if (rule.whenClears) next.whenClears = { ...swap(rule.whenClears), then: (rule.whenClears.then ?? []).map(swap) };
  if (rule.armedWhen) next.armedWhen = rule.armedWhen.map(swap);
  return next;
}

// Ctrl+V: the clipboard's machines placed with the top-left of their box at
// `pos` (snapped unless `pos.snap` is false), or at the nearest free place
// if that is taken. Each copy gets a new id and a new name, the
// connections between the copies are kept and the interlocks point at the
// copies. A copy's tag is blank, as a new machine's is: a tag names one
// machine on the plant drawings. Returns { ok: true, line, ids } or
// { ok: false, error }, `ids` in clipboard order.
export function pasteMachines(line, clipboard, pos) {
  if (!clipboard?.machines?.length) return { ok: false, error: "There is nothing to paste." };
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    return { ok: false, error: "A position must be two numbers." };
  }
  const corner = groupCorner(clipboard.machines);
  const target = snapPosition(pos, pos.snap !== false);
  const ghosts = clipboard.machines.map((m, i) => ({ ...m, id: `\0paste-${i}` }));
  const all = [...line.machines, ...ghosts];
  const group = new Set(ghosts.map((m) => m.id));
  const at = nearestFree(target, (p) => !groupOverlap(all, group, { x: p.x - corner.x, y: p.y - corner.y }));
  if (!at) return { ok: false, error: "There is no free place for the group here." };
  const delta = { x: at.x - corner.x, y: at.y - corner.y };

  const takenIds = new Set(line.machines.map((m) => m.id));
  const takenNames = new Set(line.machines.map((m) => m.name));
  const ids = new Map();
  const machines = clipboard.machines.map((m) => {
    const id = firstFree(withoutNumber(m.item ?? m.id, "-"), takenIds, "-");
    const name = firstFree(withoutNumber(m.name, " "), takenNames);
    takenIds.add(id);
    takenNames.add(name);
    ids.set(m.id, id);
    return { ...structuredClone(m), id, name, tag: "", x: m.x + delta.x, y: m.y + delta.y };
  });
  const connections = clipboard.connections.map((c) => {
    const copy = { ...structuredClone(c), from: remapEnd(c.from, ids), to: remapEnd(c.to, ids) };
    if (copy.via) copy.via = copy.via.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }));
    return copy;
  });
  const interlockIds = new Set((line.interlocks ?? []).map((r) => r.id));
  const interlocks = clipboard.interlocks.map((r) => {
    const id = firstFree("interlock", interlockIds, "-");
    interlockIds.add(id);
    return remapRule(structuredClone(r), ids, id);
  });
  return {
    ok: true,
    ids: [...ids.values()],
    line: {
      ...line,
      machines: [...line.machines, ...machines],
      connections: [...line.connections, ...connections],
      interlocks: [...(line.interlocks ?? []), ...interlocks],
    },
  };
}

// Every machine whose footprint the box touches, in line order. The box
// can be drawn from any corner, so `w` and `h` can be negative.
export function machinesInBox(line, box) {
  const rect = {
    x: Math.min(box.x, box.x + box.w), y: Math.min(box.y, box.y + box.h),
    w: Math.abs(box.w), h: Math.abs(box.h),
  };
  return line.machines.filter((m) => machineFootprint(m).some((r) => rectsOverlap(r, rect))).map((m) => m.id);
}

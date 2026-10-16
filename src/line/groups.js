// Several machines worked on together in Build mode (issue #95): a group
// selected with a box or Shift+click is moved, deleted, copied and pasted
// as one edit. Like every other line document function, none of these ever
// changes the line it is given.
import { firstFree, deleteMachine } from "./editing";
import { machineFootprint, nearestFree, rectsOverlap, snapPosition } from "./layout";
import { ruleMachines } from "./interlocks";
import { withHeldFields } from "./adjustableFields";

// A feed rate link names its elevator and its feeder.
const linkMachines = (link) => [link.elevator?.machine, link.feeder?.machine].filter((id) => typeof id === "string");

// Copies of the rules in `rules` whose machines are all in `group`.
function rulesInside(rules, group, machinesOf) {
  return (rules ?? []).filter((r) => {
    const named = machinesOf(r);
    return named.length > 0 && named.every((id) => group.has(id));
  }).map((r) => structuredClone(r));
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
// connections. The interlocks that name it stay on the line, and are off
// because a machine they name is missing (interlocks.js isRuleOff).
// Returns { ok: true, line } or { ok: false, error }.
export function deleteMachines(line, ids) {
  const absent = missing(line, ids);
  if (absent !== undefined) return { ok: false, error: `There is no machine "${absent}" on this line.` };
  let next = line;
  for (const id of new Set(ids)) next = deleteMachine(next, id).line;
  return { ok: true, line: next };
}

// What Ctrl+C keeps: the machines, the connections between them, and the
// interlocks, machine rules (the graded feed schedules, "hold the next
// batch") and feed rate links whose machines are all among them, as
// copies. A golden line machine leaves its zone behind: a built machine
// has none (editing.js). It also leaves behind any adjustable field whose
// value is in a rule that stays behind.
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
  const clip = {
    machines,
    connections,
    interlocks: rulesInside(line.interlocks, group, ruleMachines),
    machineRules: rulesInside(line.machineRules, group, ruleMachines),
    feedRateDerivations: rulesInside(line.feedRateDerivations, group, linkMachines),
  };
  return { ...clip, machines: machines.map((m) => withHeldFields(clip, m)) };
}

// The top-left corner of the box around the machines.
export function groupCorner(machines) {
  return { x: Math.min(...machines.map((m) => m.x)), y: Math.min(...machines.map((m) => m.y)) };
}

// Where a paste of `machines` goes by default: `gap` to the right of the
// box around them, level with its top, so a copied lane lands beside the
// lane as a second one.
export function pastePointBeside(machines, gap) {
  const corner = groupCorner(machines);
  return { x: Math.max(...machines.map((m) => m.x + m.w)) + gap, y: corner.y };
}

// An id or name without the number a copy was given: "metal-bin-2" is a
// "metal-bin", "METAL BIN 1" is a "METAL BIN".
const withoutNumber = (text, sep) => text.replace(new RegExp(`${sep}\\d+$`), "");

function remapEnd(end, ids) {
  return { ...end, machine: ids.get(end.machine) };
}

// `value` with every machine it names swapped for its copy. Every rule
// names a machine as a `machine` field, wherever in the rule it sits: a
// sentence's parts, steps and arming, a machine rule's sensor and actuators
// (one feeder or a list), a feed rate link's elevator and feeder. A step
// that names no machine (a wait, an "if still true", a line trip) is
// unchanged.
function remapMachines(value, ids) {
  if (Array.isArray(value)) return value.map((v) => remapMachines(v, ids));
  if (value === null || typeof value !== "object") return value;
  const next = {};
  for (const [key, v] of Object.entries(value)) {
    next[key] = key === "machine" && ids.has(v) ? ids.get(v) : remapMachines(v, ids);
  }
  return next;
}

// The clipboard's rules of one list, pointed at the copies, each with an id
// the line does not have: `${base}-${n}`, where an interlock's base is
// "interlock" (sentenceEditor.js) and any other rule's is its own id.
function pastedRules(existing, rules, ids, baseOf) {
  const taken = new Set((existing ?? []).map((r) => r.id));
  return (rules ?? []).map((r) => {
    const id = firstFree(baseOf(r), taken, "-");
    taken.add(id);
    return { ...remapMachines(r, ids), id };
  });
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
  const ownBase = (r) => withoutNumber(r.id, "-");
  const next = {
    ...line,
    machines: [...line.machines, ...machines],
    connections: [...line.connections, ...connections],
    interlocks: [...(line.interlocks ?? []), ...pastedRules(line.interlocks, clipboard.interlocks, ids, () => "interlock")],
  };
  // A line keeps no empty machine rule or feed rate link list it did not
  // have, so pasting a plain group leaves the line's own shape alone.
  for (const list of ["machineRules", "feedRateDerivations"]) {
    const pasted = pastedRules(line[list], clipboard[list], ids, ownBase);
    if (pasted.length > 0) next[list] = [...(line[list] ?? []), ...pasted];
  }
  return { ok: true, ids: [...ids.values()], line: next };
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

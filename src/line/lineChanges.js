// A user's work on a line as the changes they made to it (issue #79): a
// list of { machine, field, value }, with values in plant units, and (issue
// #86) { machine, position: { x, y } } for each machine the user moved, and
// (issue #87) { delete: id } for each machine the user deleted and
// { add: machine } for each machine the user added, stored whole, and
// (issue #88) { connect: { from, to, kind } } for each connection the user
// made and { disconnect: { from } } for each one they removed, and (issue
// #95) { list, put: rule } for each interlock, machine rule or feed rate
// link the user added or changed, stored whole, { list, remove: id } for
// each one they deleted, and { dismissSuggestion: id } for each suggested
// interlock they crossed out, and (issue #155) { machine, flipped } for each
// machine the user flipped, and (issue #157) { machine, segments } for each
// bucket elevator the user reshaped with its handles. Browser
// autosave stores this list for the golden line, never the whole line, so
// every value the user did not change comes from the golden line in the
// repo on the next load.
import { adjustableFields, readAdjustableValue, setAdjustableValue, closeTo } from "./adjustableFields";
import { moveMachine, overlappingMachine, setFlipped } from "./layout";
import { isBucketElevator, migrateMachine, reshapeElevator } from "./elevatorPath";
import { deleteMachine, setMachineText } from "./editing";
import { connectPorts, disconnectConnection } from "./connecting";
import { REGISTERED_KINDS } from "../sim/behaviors";

// A connection's identity for comparing a line against its base: its own
// from/to/kind, ignoring drawing-only fields (`via`, `tbc`, `coupling`) that
// a user-made connection never carries, so re-making the same connection by
// hand never diffs as changed just because the hand-authored one had a bend
// point.
function connectionSignature(c) {
  return `${c.from.machine}.${c.from.port}>${c.to.machine}.${c.to.port}:${c.kind}`;
}

function sameValue(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return closeTo(a, b);
  }
  return a === b;
}

// Every adjustable field whose value in `line` differs from `base`, in line
// order and declaration order, then each machine that moved, in line order,
// then each machine deleted, then each machine added. A machine the base
// does not have is stored whole, so its values and position are not listed
// apart.
export function diffFromBase(base, line) {
  const changes = [];
  const baseById = new Map(base.machines.map((m) => [m.id, m]));
  const kept = line.machines.filter((m) => baseById.has(m.id));
  for (const m of kept) {
    for (const f of adjustableFields(m)) {
      const value = readAdjustableValue(line, m.id, f.id);
      if (value === undefined) continue;
      if (!sameValue(value, readAdjustableValue(base, m.id, f.id))) {
        changes.push({ machine: m.id, field: f.id, value });
      }
    }
  }
  for (const m of kept) {
    const was = baseById.get(m.id);
    // Issue #157: a new path length alone changes only the column, so a
    // reshape shows in the runs. Stored whole, after the path length.
    const [segments, wasSegments] = [m.geom?.segmentsM, was.geom?.segmentsM];
    if (segments && wasSegments
      && !(closeTo(segments.floor, wasSegments.floor) && closeTo(segments.head, wasSegments.head))) {
      changes.push({ machine: m.id, segments: { ...segments } });
    }
    // Issue #155: before the position, since a flip can move the machine
    // aside and the stored position then puts it back where the user had it.
    if (Boolean(m.flipped) !== Boolean(was.flipped)) changes.push({ machine: m.id, flipped: Boolean(m.flipped) });
    if (m.x !== was.x || m.y !== was.y) {
      changes.push({ machine: m.id, position: { x: m.x, y: m.y } });
    }
    // Issue #90: name and tag are plain text, not adjustable fields.
    if (m.name !== was.name) changes.push({ machine: m.id, text: "name", value: m.name });
    if (m.tag !== was.tag) changes.push({ machine: m.id, text: "tag", value: m.tag });
  }
  const ids = new Set(line.machines.map((m) => m.id));
  for (const m of base.machines) {
    if (!ids.has(m.id)) changes.push({ delete: m.id });
  }
  for (const m of line.machines) {
    if (!baseById.has(m.id)) changes.push({ add: m });
  }

  // Issue #88: connections are compared by their own signature, not
  // position in the array, so a reconnect elsewhere in the list never
  // reads as every later connection having changed.
  const baseSignatures = new Set(base.connections.map(connectionSignature));
  const lineSignatures = new Set(line.connections.map(connectionSignature));
  for (const c of line.connections) {
    if (!baseSignatures.has(connectionSignature(c))) {
      // A pasted copy of a drawn connection keeps its bend points.
      changes.push({ connect: { from: c.from, to: c.to, kind: c.kind, ...(c.via ? { via: c.via } : {}) } });
    }
  }
  const machineIds = new Set(line.machines.map((m) => m.id));
  for (const c of base.connections) {
    if (lineSignatures.has(connectionSignature(c))) continue;
    // A connection lost only because one of its machines was deleted is
    // already accounted for by that machine's own `delete` change above.
    if (!machineIds.has(c.from.machine) || !machineIds.has(c.to.machine)) continue;
    changes.push({ disconnect: { from: c.from } });
  }

  // Rules are compared by id. One the base does not have, or has with
  // anything different, is stored whole, so a repo fix to a rule the user
  // changed never half-reaches it. A set point or delay the machine's own
  // fields hold is already a value change above, so rules are compared
  // against the base with those value changes made.
  const valued = applyChanges(base, changes.filter((c) => c.field !== undefined));
  for (const list of RULE_LISTS) {
    const baseRules = new Map((valued[list] ?? []).map((r) => [r.id, r]));
    const lineIds = new Set((line[list] ?? []).map((r) => r.id));
    for (const r of line[list] ?? []) {
      const was = baseRules.get(r.id);
      if (!was || JSON.stringify(was) !== JSON.stringify(r)) changes.push({ list, put: r });
    }
    for (const id of baseRules.keys()) {
      if (!lineIds.has(id)) changes.push({ list, remove: id });
    }
  }
  const baseDismissed = new Set(base.dismissedSuggestions ?? []);
  for (const id of line.dismissedSuggestions ?? []) {
    if (!baseDismissed.has(id)) changes.push({ dismissSuggestion: id });
  }
  return changes;
}

// The parts of a line that hold rules with ids, saved as changes the same
// way.
const RULE_LISTS = ["interlocks", "machineRules", "feedRateDerivations"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Enough of a machine to place, draw and run. Its values are the user's
// own, stored whole, so a repo fix never reaches them. Saved changes are
// not validated again on load, so a behaviour kind the engine does not
// know is refused here.
function isMachine(m) {
  return isObject(m) && typeof m.id === "string" && typeof m.type === "string"
    && ["x", "y", "w", "h"].every((k) => Number.isFinite(m[k]))
    && isObject(m.ports) && Array.isArray(m.ports.inputs) && Array.isArray(m.ports.outputs)
    && isObject(m.anchors) && (m.sim === undefined || REGISTERED_KINDS.has(m.sim?.kind));
}

function isEndpoint(end) {
  return isObject(end) && typeof end.machine === "string" && typeof end.port === "string";
}

const isPoint = (p) => isObject(p) && Number.isFinite(p.x) && Number.isFinite(p.y);

function isChange(c) {
  if (!isObject(c)) return false;
  if (c.list !== undefined) {
    if (!RULE_LISTS.includes(c.list)) return false;
    return c.put !== undefined ? isObject(c.put) && typeof c.put.id === "string" : typeof c.remove === "string";
  }
  if (c.dismissSuggestion !== undefined) return typeof c.dismissSuggestion === "string";
  if (c.delete !== undefined) return typeof c.delete === "string";
  if (c.add !== undefined) return isMachine(c.add);
  if (c.connect !== undefined) {
    return isEndpoint(c.connect.from) && isEndpoint(c.connect.to) && typeof c.connect.kind === "string"
      && (c.connect.via === undefined || (Array.isArray(c.connect.via) && c.connect.via.every(isPoint)));
  }
  if (c.disconnect !== undefined) return isEndpoint(c.disconnect.from);
  if (c.text !== undefined) return typeof c.machine === "string" && (c.text === "name" || c.text === "tag") && typeof c.value === "string";
  if (c.flipped !== undefined) return typeof c.machine === "string" && typeof c.flipped === "boolean";
  if (c.segments !== undefined) return typeof c.machine === "string" && isObject(c.segments);
  return typeof c.machine === "string" && (typeof c.field === "string" || isObject(c.position));
}

// An added machine goes on only where it overlaps nothing, and only if its
// id is free. An elevator stored before issue #156 is migrated to a path
// length and goes on whatever its new shape overlaps, settling into a free
// spot where there is one (elevatorPath.js migrateMachine).
function addStoredMachine(line, machine) {
  if (line.machines.some((m) => m.id === machine.id)) return { ok: false };
  const placed = { ...line, machines: [...line.machines, machine] };
  if (isBucketElevator(machine) && machine.geom.segmentsM === undefined) {
    return { ok: true, line: migrateMachine(placed, machine.id) };
  }
  if (overlappingMachine(placed, machine.id, machine)) return { ok: false };
  return { ok: true, line: placed };
}

// A stored rule replaces the line's rule with its id, or joins the end of
// the list. A rule that names a machine the line no longer has stays on
// the line, off (interlocks.js isRuleOff), as after a delete.
function putRule(line, list, rule) {
  const rules = line[list] ?? [];
  const at = rules.findIndex((r) => r.id === rule.id);
  const next = at === -1 ? [...rules, rule] : rules.map((r, i) => (i === at ? rule : r));
  return { ok: true, line: { ...line, [list]: next } };
}

function removeRule(line, list, id) {
  const rules = line[list] ?? [];
  if (!rules.some((r) => r.id === id)) return { ok: false };
  return { ok: true, line: { ...line, [list]: rules.filter((r) => r.id !== id) } };
}

function dismiss(line, id) {
  const dismissed = line.dismissedSuggestions ?? [];
  if (dismissed.includes(id)) return { ok: true, line };
  return { ok: true, line: { ...line, dismissedSuggestions: [...dismissed, id] } };
}

// connectPorts makes a connection with no drawing; a stored one with bend
// points gets them back.
function connectStored(line, connect) {
  const result = connectPorts(line, connect.from, connect.to);
  if (!result.ok || !connect.via) return result;
  const connections = result.line.connections.map((c, i, all) => (i === all.length - 1 ? { ...c, via: connect.via } : c));
  return { ok: true, line: { ...result.line, connections } };
}

function applyChange(line, c) {
  if (c.list !== undefined) return c.put !== undefined ? putRule(line, c.list, c.put) : removeRule(line, c.list, c.remove);
  if (c.dismissSuggestion !== undefined) return dismiss(line, c.dismissSuggestion);
  if (c.delete !== undefined) return deleteMachine(line, c.delete);
  if (c.add !== undefined) return addStoredMachine(line, c.add);
  if (c.connect !== undefined) return connectStored(line, c.connect);
  if (c.disconnect !== undefined) return disconnectConnection(line, c.disconnect.from);
  if (c.text !== undefined) return setMachineText(line, c.machine, c.text, c.value);
  if (c.flipped !== undefined) return setFlipped(line, c.machine, c.flipped);
  if (c.segments !== undefined) return reshapeElevator(line, c.machine, c.segments);
  if (c.position) return moveMachine(line, c.machine, c.position);
  return setAdjustableValue(line, c.machine, c.field, c.value);
}

// The base with the changes applied. A change the base refuses (a machine or
// field it no longer has, a value outside the field's limits, a position
// on top of another machine, or an added machine whose id is taken) is
// ignored, so a golden line update never breaks a stored set of changes.
// Set points are checked against each other, and a machine can move only
// into space another move cleared, so one change can be refused only until
// another lands; the changes are applied again until no more of them land.
export function applyChanges(base, changes) {
  let line = base;
  let pending = Array.isArray(changes) ? changes.filter(isChange) : [];
  let landed = true;
  while (pending.length > 0 && landed) {
    landed = false;
    const refused = [];
    for (const c of pending) {
      const result = applyChange(line, c);
      if (result.ok) {
        line = result.line;
        landed = true;
      } else {
        refused.push(c);
      }
    }
    pending = refused;
  }
  return line;
}

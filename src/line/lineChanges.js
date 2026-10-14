// A user's work on a line as the changes they made to it (issue #79): a
// list of { machine, field, value }, with values in plant units, and (issue
// #86) { machine, position: { x, y } } for each machine the user moved, and
// (issue #87) { delete: id } for each machine the user deleted and
// { add: machine } for each machine the user added, stored whole, and
// (issue #88) { connect: { from, to, kind } } for each connection the user
// made and { disconnect: { from } } for each one they removed. Browser
// autosave stores this list for the golden line, never the whole line, so
// every value the user did not change comes from the golden line in the
// repo on the next load.
import { adjustableFields, readAdjustableValue, setAdjustableValue, closeTo } from "./adjustableFields";
import { moveMachine, overlappingMachine } from "./layout";
import { deleteMachine } from "./editing";
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
    if (m.x !== was.x || m.y !== was.y) {
      changes.push({ machine: m.id, position: { x: m.x, y: m.y } });
    }
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
      changes.push({ connect: { from: c.from, to: c.to, kind: c.kind } });
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
  return changes;
}

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

function isChange(c) {
  if (!isObject(c)) return false;
  if (c.delete !== undefined) return typeof c.delete === "string";
  if (c.add !== undefined) return isMachine(c.add);
  if (c.connect !== undefined) {
    return isEndpoint(c.connect.from) && isEndpoint(c.connect.to) && typeof c.connect.kind === "string";
  }
  if (c.disconnect !== undefined) return isEndpoint(c.disconnect.from);
  return typeof c.machine === "string" && (typeof c.field === "string" || isObject(c.position));
}

// An added machine goes on only where it overlaps nothing, and only if its
// id is free.
function addStoredMachine(line, machine) {
  if (line.machines.some((m) => m.id === machine.id)) return { ok: false };
  const placed = { ...line, machines: [...line.machines, machine] };
  if (overlappingMachine(placed, machine.id, machine)) return { ok: false };
  return { ok: true, line: placed };
}

function applyChange(line, c) {
  if (c.delete !== undefined) return deleteMachine(line, c.delete);
  if (c.add !== undefined) return addStoredMachine(line, c.add);
  if (c.connect !== undefined) return connectPorts(line, c.connect.from, c.connect.to);
  if (c.disconnect !== undefined) return disconnectConnection(line, c.disconnect.from);
  return c.position ? moveMachine(line, c.machine, c.position) : setAdjustableValue(line, c.machine, c.field, c.value);
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

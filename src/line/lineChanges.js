// A user's work on a line as the changes they made to it (issue #79): a
// list of { machine, field, value }, with values in plant units. Browser
// autosave stores this list for the golden line, never the whole line, so
// every value the user did not change comes from the golden line in the
// repo on the next load.
import { adjustableFields, readAdjustableValue, setAdjustableValue, closeTo } from "./adjustableFields";

function sameValue(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return closeTo(a, b);
  }
  return a === b;
}

// Every adjustable field whose value in `line` differs from `base`, in line
// order and declaration order.
export function diffFromBase(base, line) {
  const changes = [];
  for (const m of line.machines) {
    for (const f of adjustableFields(m)) {
      const value = readAdjustableValue(line, m.id, f.id);
      if (value === undefined) continue;
      if (!sameValue(value, readAdjustableValue(base, m.id, f.id))) {
        changes.push({ machine: m.id, field: f.id, value });
      }
    }
  }
  return changes;
}

function isChange(c) {
  return c !== null && typeof c === "object" && typeof c.machine === "string" && typeof c.field === "string";
}

// The base with the changes applied. A change the base refuses (a machine or
// field it no longer has, or a value outside the field's limits) is ignored,
// so a golden line update never breaks a stored set of changes. Set points
// are checked against each other, so one change can be refused only until
// another lands; the changes are applied again until no more of them land.
export function applyChanges(base, changes) {
  let line = base;
  let pending = Array.isArray(changes) ? changes.filter(isChange) : [];
  let landed = true;
  while (pending.length > 0 && landed) {
    landed = false;
    const refused = [];
    for (const c of pending) {
      const result = setAdjustableValue(line, c.machine, c.field, c.value);
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

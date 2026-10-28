// A machine's name label moved by hand in Build mode (issue #158). A drag
// changes only the label's `nudge` (scene/labelLayout.js), an offset on top
// of its declared side and alignment, so a dragged label keeps its place
// relative to that side when the machine is resized, reshaped or flipped.
// Nothing checks what the label lands on. Like every other line edit, each
// function returns a new line and never changes the line it is given.
import { catalogueItem } from "../catalogue/catalogue";

// Labels compared as stored, an absent one the same as null.
export const sameLabel = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The line with machine `id`'s label set to `label`, or removed when
// `label` is undefined or null. Returns { ok: true, line } or { ok: false, error }.
export function setLabel(line, id, label) {
  if (!line.machines.some((m) => m.id === id)) return { ok: false, error: `There is no machine "${id}" on this line.` };
  const machines = line.machines.map((m) => {
    if (m.id !== id) return m;
    const next = { ...m };
    if (label == null) delete next.label;
    else next.label = label;
    return next;
  });
  return { ok: true, line: { ...line, machines } };
}

// Moves machine `id`'s label by `delta` world units, rounded to whole units.
// A nudge that comes back to nothing is dropped, so the label is again
// exactly its declared placement.
export function moveLabel(line, id, delta) {
  const m = line.machines.find((x) => x.id === id);
  if (!m) return { ok: false, error: `There is no machine "${id}" on this line.` };
  const x = Math.round((m.label?.nudge?.x ?? 0) + delta.x);
  const y = Math.round((m.label?.nudge?.y ?? 0) + delta.y);
  const label = { ...m.label };
  if (x === 0 && y === 0) delete label.nudge;
  else label.nudge = { x, y };
  return setLabel(line, id, Object.keys(label).length > 0 ? label : undefined);
}

// The label a machine starts with: the one `base` (the golden line) authors
// for a machine of the same id and catalogue item, else its catalogue
// item's. Undefined when neither declares one (labelLayout's own default).
export function defaultLabel(machine, base) {
  const authored = base?.machines.find((m) => m.id === machine.id && m.item === machine.item);
  if (authored) return authored.label;
  return catalogueItem(machine.item)?.machine.label;
}

export function isDefaultLabel(machine, base) {
  return sameLabel(machine.label, defaultLabel(machine, base));
}

// "Reset label": machine `id`'s label back to its default.
export function resetLabel(line, id, base) {
  const m = line.machines.find((x) => x.id === id);
  if (!m) return { ok: false, error: `There is no machine "${id}" on this line.` };
  const label = defaultLabel(m, base);
  return setLabel(line, id, label === undefined ? undefined : structuredClone(label));
}

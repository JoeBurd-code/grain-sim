// Adding and deleting machines, and a new empty line (issue #87). Like the
// value edits and moveMachine, each function returns a new line and never
// changes the line it is given.
import { catalogueItem } from "../catalogue/catalogue";
import { GRID, overlappingMachine, snapPosition } from "./layout";

// NEW LINE. A built line has no zones (FIT only) and no declared plant
// controls: its panel is generated (plantControls.js).
export function emptyLine() {
  return { zones: [], machines: [], connections: [], interlocks: [], machineRules: [] };
}

// The first `${base}${sep}${n}`, from n = 1, that `taken` does not hold.
function firstFree(base, taken, sep = " ") {
  let n = 1;
  while (taken.has(`${base}${sep}${n}`)) n += 1;
  return `${base}${sep}${n}`;
}

// How far from the drop point an overlapping drop looks for a free place.
const SEARCH_RINGS = 60;

// The free place on the grid nearest `pos`, searched ring by ring outwards.
// Null when there is none within the search.
function nearestFreePosition(line, machine, pos) {
  const withMachine = { ...line, machines: [...line.machines, machine] };
  const fits = (p) => !overlappingMachine(withMachine, machine.id, p);
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

// Adds a machine from catalogue item `itemId` with its top-left corner at
// `pos`, snapped to the grid unless `pos.snap` is false. It gets the item's
// defaults, an automatic name ("METAL BIN 2"), an empty tag and the item id.
// A drop on top of another machine lands at the nearest free place.
// Returns { ok: true, line, id } or { ok: false, error }.
export function addMachine(line, itemId, pos) {
  const item = catalogueItem(itemId);
  if (!item) return { ok: false, error: `The catalogue has no item "${itemId}".` };
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    return { ok: false, error: "A position must be two numbers." };
  }
  const id = firstFree(item.id, new Set(line.machines.map((m) => m.id)), "-");
  const name = firstFree(item.name.toUpperCase(), new Set(line.machines.map((m) => m.name)));
  const machine = { id, item: item.id, name, tag: "", ...structuredClone(item.machine) };
  const at = nearestFreePosition(line, machine, snapPosition(pos, pos.snap !== false));
  if (!at) return { ok: false, error: `There is no free place for ${name} here.` };
  return { ok: true, id, line: { ...line, machines: [...line.machines, { ...machine, x: at.x, y: at.y }] } };
}

// A declared plant control without its commands and EMPTY buttons on
// `id`. An option left with no commands goes, and so does a selector left
// with no options or an EMPTY button left with no machines.
function plantControlsWithout(plantControls, id) {
  if (!plantControls) return plantControls;
  const keepEmpty = (empty) => {
    const machines = empty.machines.filter((m) => m !== id);
    return machines.length > 0 ? { ...empty, machines } : undefined;
  };
  const selectors = (plantControls.selectors ?? []).map((s) => ({
    ...s,
    options: s.options
      .map((o) => {
        const option = { ...o, commands: o.commands.filter((c) => c.machine !== id) };
        if (o.empty) {
          const empty = keepEmpty(o.empty);
          if (empty) option.empty = empty;
          else delete option.empty;
        }
        return option;
      })
      .filter((o) => o.commands.length > 0),
  })).filter((s) => s.options.length > 0);
  const result = { ...plantControls, selectors };
  if (plantControls.emptyButtons) {
    result.emptyButtons = plantControls.emptyButtons.map(keepEmpty).filter(Boolean);
  }
  return result;
}

// Deletes the machine and every connection to it. The interlocks, machine
// rules and feed rate links that name it stay on the line, off
// (interlocks.js isRuleOff), so the user can see what it was protecting.
// Returns { ok: true, line } or { ok: false, error }.
export function deleteMachine(line, id) {
  if (!line.machines.some((m) => m.id === id)) {
    return { ok: false, error: `There is no machine "${id}" on this line.` };
  }
  const next = {
    ...line,
    machines: line.machines.filter((m) => m.id !== id),
    connections: line.connections.filter((c) => c.from.machine !== id && c.to.machine !== id),
  };
  if (line.plantControls) next.plantControls = plantControlsWithout(line.plantControls, id);
  return { ok: true, line: next };
}

// The machine catalogue (issue #87): every machine a user can add to a line.
// Each item is one JSON file in ./items, so a new item or a maker's change
// is one file. An item holds the catalogue name, the job group, the maker
// and model (empty for an item with no maker), and `machine`: the machine as
// it lands on a line, without the parts each machine on a line has for
// itself (id, name, tag and position). The behaviour kind is
// `machine.sim.kind`, and a user cannot change it (ADR 0008).
//
// The first items are the golden line's machines, plus Grain in and Grain
// out. The golden line's stubs stand for the plant's edges and are not
// items. An item drops the golden machine's set point and signal delay
// fields, because those values live on the interlocks, and an added machine
// has none yet.
//
// Each machine also has a custom version (issue #94), made here rather than
// kept as a file.

const files = import.meta.glob("./items/*.json", { eager: true, import: "default" });

// The panel shows the groups in this order.
export const CATALOGUE_GROUPS = [
  { id: "edges", name: "Edges" },
  { id: "storage", name: "Storage" },
  { id: "conveying", name: "Conveying" },
  { id: "treating", name: "Cleaning and treating" },
  { id: "packaging", name: "Packaging" },
];

const groupOrder = new Map(CATALOGUE_GROUPS.map((g, i) => [g.id, i]));

// Issue #94: each machine also comes as a custom item, the same machine
// with no maker, whose settings reach far past the real machine's own
// limits. A real item keeps the limits of the machine it stands for; a
// custom one is for a line that needs a machine no one has measured yet.
// Custom items are made here rather than kept as files, so a change to an
// item reaches its custom version too.
//
// The limits a custom machine's settings reach, by plant unit. A real limit
// already wider stays, and so does a minimum of 0. A percentage (speed,
// level, gate) keeps its real 0 to 100 limits.
const CUSTOM_LIMITS = {
  "t/h": { min: 0.5, max: 200 },
  "m³": { min: 0.01, max: 100 },
  "m/min": { min: 0.5, max: 120 },
  kg: { min: 1, max: 5000 },
  s: { min: 1, max: 600 },
};
// Length and height are both in metres but draw the machine at that size,
// so each has a limit of its own.
const CUSTOM_RESIZE_LIMITS = {
  length: { min: 1, max: 150 },
  height: { min: 2, max: 50 },
};

function widened(entry, limits) {
  if (!limits) return entry;
  return {
    ...entry,
    min: entry.min === 0 ? 0 : Math.min(entry.min, limits.min),
    max: Math.max(entry.max, limits.max),
  };
}

function customVersion(item) {
  const machine = structuredClone(item.machine);
  if (machine.params) machine.params = machine.params.map((p) => widened(p, CUSTOM_LIMITS[p.unit]));
  if (machine.adjustable) {
    machine.adjustable = machine.adjustable.map((a) => (
      a.kind === "number" ? widened(a, CUSTOM_RESIZE_LIMITS[a.bind] ?? CUSTOM_LIMITS[a.unit]) : a
    ));
  }
  return { ...item, id: `${item.id}-custom`, maker: "", model: "", customOf: item.id, machine };
}

const fileItems = Object.values(files);

// Grouped in panel order, then by name, each custom item right after the
// real one it copies.
export const CATALOGUE = [...fileItems, ...fileItems.filter((item) => item.group !== "edges").map(customVersion)].sort(
  (a, b) => groupOrder.get(a.group) - groupOrder.get(b.group)
    || a.name.localeCompare(b.name)
    || Number(a.customOf !== undefined) - Number(b.customOf !== undefined),
);

const byId = new Map(CATALOGUE.map((item) => [item.id, item]));

export function catalogueItem(id) {
  return byId.get(id);
}

// The maker line an item shows in the catalogue and the Build panel:
// "Custom" for a custom item, else its maker and model, empty when the item
// has neither.
export function makerLabel(item) {
  if (item.customOf !== undefined) return "Custom";
  return [item.maker, item.model].filter(Boolean).join(" ");
}

// The items whose name contains `query`, ignoring case.
export function searchCatalogue(query, items = CATALOGUE) {
  const q = query.trim().toLowerCase();
  if (q === "") return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

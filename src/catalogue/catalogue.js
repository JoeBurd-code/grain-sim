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

// Grouped in panel order, then by name.
export const CATALOGUE = Object.values(files).sort(
  (a, b) => groupOrder.get(a.group) - groupOrder.get(b.group) || a.name.localeCompare(b.name),
);

const byId = new Map(CATALOGUE.map((item) => [item.id, item]));

export function catalogueItem(id) {
  return byId.get(id);
}

// The items whose name contains `query`, ignoring case.
export function searchCatalogue(query, items = CATALOGUE) {
  const q = query.trim().toLowerCase();
  if (q === "") return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

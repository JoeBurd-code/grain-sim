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
// Each item with a maker also has a generic version (issue #94), made here
// rather than kept as a file.

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

// Issue #94: each item with a maker also comes as a generic item, the same
// machine with no maker or model, so a user can build a line without
// choosing a brand. Generic items are made here rather than kept as files,
// so a maker's change to an item reaches its generic version too.
function genericVersion(item) {
  return {
    ...item, id: `${item.id}-generic`, maker: "", model: "",
    genericOf: item.id, machine: structuredClone(item.machine),
  };
}

const fileItems = Object.values(files);

// Grouped in panel order, then by name, each generic item right after the
// branded one it copies.
export const CATALOGUE = [...fileItems, ...fileItems.filter((item) => item.maker !== "").map(genericVersion)].sort(
  (a, b) => groupOrder.get(a.group) - groupOrder.get(b.group)
    || a.name.localeCompare(b.name)
    || Number(a.genericOf !== undefined) - Number(b.genericOf !== undefined),
);

const byId = new Map(CATALOGUE.map((item) => [item.id, item]));

export function catalogueItem(id) {
  return byId.get(id);
}

// The maker line an item shows in the catalogue and the Build panel: its
// maker and model, or "Generic" for a machine with no maker. Grain in and
// Grain out are plant edges, not machines anyone makes, and show nothing.
export function makerLabel(item) {
  if (item.maker !== "") return [item.maker, item.model].filter(Boolean).join(" ");
  return item.group === "edges" ? "" : "Generic";
}

// The items whose name contains `query`, ignoring case.
export function searchCatalogue(query, items = CATALOGUE) {
  const q = query.trim().toLowerCase();
  if (q === "") return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

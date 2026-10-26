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
// Custom items (issue #94) are made here from the files, and some real items
// are not listed in the panel; see CUSTOM_ITEMS below.
import { MIN_TOTAL_M } from "../line/elevatorPath";

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

// Issue #94: a real item is a specific machine and keeps the limits of the
// machine it stands for. Each kind of machine also has one custom item: no
// maker, and settings that reach far past any real machine's limits, for a
// line that needs a machine no one has measured yet. A bin's a bin, so the
// seven golden bins share one custom Bin.
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
// A conveyor's length and an elevator's path length are both in metres but
// draw the machine at that size, so each has a limit of its own. A path
// length can be no shorter than its column's and runs' minimums allow
// (elevatorPath.js).
const CUSTOM_RESIZE_LIMITS = {
  length: { min: 1, max: 150 },
  pathLength: { min: MIN_TOTAL_M, max: 60 },
};

function widened(entry, limits) {
  if (!limits) return entry;
  return {
    ...entry,
    min: entry.min === 0 ? 0 : Math.min(entry.min, limits.min),
    max: Math.max(entry.max, limits.max),
  };
}

function customVersion(item, id, name) {
  const machine = structuredClone(item.machine);
  if (machine.params) machine.params = machine.params.map((p) => widened(p, CUSTOM_LIMITS[p.unit]));
  if (machine.adjustable) {
    machine.adjustable = machine.adjustable.map((a) => (
      a.kind === "number" ? widened(a, CUSTOM_RESIZE_LIMITS[a.bind] ?? CUSTOM_LIMITS[a.unit]) : a
    ));
  }
  return { ...item, id, name, maker: "", model: "", customFrom: item.id, machine };
}

// One custom item for each kind of machine: [the real item it is made from,
// its name]. The edges (Grain in, Grain out, the pro-box station) have
// none. Nor does the pendulum conveyor: its three routed outlets make
// it one plant's machine, and Conveyor covers a plain run.
const CUSTOM_ITEMS = [
  ["treater-pre-bin", "Bin"],
  ["metal-bin", "Metal bin"],
  ["discard-bin", "Discard bin"],
  ["belt-conveyor", "Conveyor"],
  ["bucket-elevator", "Bucket elevator"],
  ["vibrating-conveyor", "Vibrating conveyor"],
  ["drum-feeder", "Drum feeder"],
  ["diverter", "Diverter"],
  ["outlet-valve", "Outlet valve"],
  ["grain-break", "Grain break"],
  ["auto-sampler", "Auto sampler"],
  ["roller-conveyors", "Roller conveyors"],
  ["scalping-screen", "Scalping screen"],
  ["metal-remover", "Metal remover"],
  ["batch-treater", "Batch treater"],
  ["bagging-scale", "Bagging scale"],
  ["filling-head", "Big bag filling head"],
  ["filling-sewing", "Filling and sewing"],
  ["palletiser", "Palletiser"],
];

const fileItems = Object.values(files);
const fileById = new Map(fileItems.map((item) => [item.id, item]));
const customItems = CUSTOM_ITEMS.map(([from, name]) => (
  customVersion(fileById.get(from), `custom-${name.toLowerCase().replaceAll(" ", "-")}`, name)
));

// Every item a line can name: the real items and the custom ones.
export const ALL_ITEMS = [...fileItems, ...customItems];

// A real item is listed when it is a specific machine: it has a maker, or
// sensors. A plain one is listed only as its kind's custom item.
function listed(item) {
  if (item.customFrom !== undefined || item.group === "edges") return true;
  return item.maker !== "" || (item.machine.instruments ?? []).length > 0;
}

// The items the panel lists, grouped in panel order, then by name, a custom
// item after a real one of the same name.
export const CATALOGUE = ALL_ITEMS.filter(listed).sort(
  (a, b) => groupOrder.get(a.group) - groupOrder.get(b.group)
    || a.name.localeCompare(b.name)
    || Number(a.customFrom !== undefined) - Number(b.customFrom !== undefined),
);

// Every item, listed or not: a line made before an item stopped being
// listed, and the golden line itself, still name it.
const byId = new Map(ALL_ITEMS.map((item) => [item.id, item]));

export function catalogueItem(id) {
  return byId.get(id);
}

// The maker line an item shows in the catalogue and the Build panel:
// "Custom" for a custom item, else its maker and model, empty when the item
// has neither.
export function makerLabel(item) {
  if (item.customFrom !== undefined) return "Custom";
  return [item.maker, item.model].filter(Boolean).join(" ");
}

// The items whose name contains `query`, ignoring case.
export function searchCatalogue(query, items = CATALOGUE) {
  const q = query.trim().toLowerCase();
  if (q === "") return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

// Issue #87: the machine catalogue.
import { describe, it, expect } from "vitest";
import { ALL_ITEMS, CATALOGUE, CATALOGUE_GROUPS, catalogueItem, makerLabel, searchCatalogue } from "./catalogue";
import { goldenLine } from "../line/goldenLine";
import { adjustableFields } from "../line/adjustableFields";

describe("the catalogue", () => {
  it("has one item for each of its ids, in a known group, with a name and a maker and model", () => {
    const groups = new Set(CATALOGUE_GROUPS.map((g) => g.id));
    expect(new Set(ALL_ITEMS.map((i) => i.id)).size).toBe(ALL_ITEMS.length);
    for (const item of ALL_ITEMS) {
      expect(groups.has(item.group), item.id).toBe(true);
      expect(item.name, item.id).toMatch(/\S/);
      expect(typeof item.maker, item.id).toBe("string");
      expect(typeof item.model, item.id).toBe("string");
      expect(item.machine.sim?.kind, item.id).toBeDefined();
      for (const k of ["id", "name", "tag", "x", "y", "zone"]) expect(item.machine[k], `${item.id} ${k}`).toBeUndefined();
    }
  });

  it("has every golden line machine but the stubs, plus Grain in, Grain out, and the belt and chain conveyors", () => {
    const fromGolden = new Set(goldenLine.machines.filter((m) => m.type !== "stub").map((m) => m.item));
    // Issue #90: belt-conveyor and chain-conveyor are catalogue items not
    // used by the golden line itself, for a line built from scratch to use
    // alongside pendulumConveyor's own item. Issue #94's custom items are
    // left out here and tested below.
    expect(new Set(ALL_ITEMS.filter((i) => i.customFrom === undefined).map((i) => i.id)))
      .toEqual(new Set([...fromGolden, "grain-in", "grain-out", "belt-conveyor", "chain-conveyor"]));
    expect(catalogueItem("grain-in").machine.sim.kind).toBe("source");
    expect(catalogueItem("grain-out").machine.sim.kind).toBe("terminalSink");
    expect(CATALOGUE.some((i) => i.machine.type === "stub")).toBe(false);
  });

  it("names the makers and models the golden line names", () => {
    expect(catalogueItem("batch-treater")).toMatchObject({ maker: "Niklas", model: "WNS/200" });
    expect(catalogueItem("bucket-elevator")).toMatchObject({ maker: "Simatek", model: "E200" });
    expect(catalogueItem("pendulum-conveyor")).toMatchObject({ maker: "Simatek", model: "E200" });
    expect(catalogueItem("filling-head").maker).toBe("Flexicon");
    for (const id of ["bagging-scale", "filling-sewing", "palletiser"]) expect(catalogueItem(id).maker).toBe("Concetti");
  });

  it("lists the items by group in panel order", () => {
    const order = CATALOGUE_GROUPS.map((g) => g.id);
    const seen = CATALOGUE.map((i) => order.indexOf(i.group));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
});

// Issue #94: custom items. A real item is a specific machine, with its
// maker or its sensors, and keeps that machine's limits. Each kind of
// machine also has one custom item, with no maker and settings that reach
// far further. A plain real item, with no maker and no sensors, is listed
// only as its kind's custom item: a bin's a bin.
describe("custom items", () => {
  const real = ALL_ITEMS.filter((i) => i.customFrom === undefined);
  const custom = ALL_ITEMS.filter((i) => i.customFrom !== undefined);
  const kind = (item) => `${item.machine.type} ${item.machine.sim.kind}`;
  const specific = (item) => item.maker !== "" || (item.machine.instruments ?? []).length > 0;
  const machines = real.filter((i) => i.group !== "edges");
  const numberFields = (machine) => adjustableFields(machine).filter((f) => f.kind === "number" && f.setpoint === undefined);

  it("gives each kind of machine but the pendulum conveyor one custom item, and the edges none", () => {
    const kinds = new Set(machines.filter((i) => i.id !== "pendulum-conveyor").map(kind));
    expect(custom.map(kind).sort()).toEqual([...kinds].sort());
    expect(custom.every((i) => catalogueItem(i.customFrom) && kind(i) === kind(catalogueItem(i.customFrom)))).toBe(true);
  });

  it("lists one custom bin and one custom conveyor, not a copy of each real one", () => {
    expect(CATALOGUE.filter((i) => i.customFrom !== undefined && i.machine.type === "bin").map((i) => i.name)).toEqual(["Bin"]);
    expect(CATALOGUE.filter((i) => i.customFrom !== undefined && i.machine.type === "conveyor").map((i) => i.name)).toEqual(["Conveyor"]);
  });

  it("lists a real item only when it is specific, and every custom item", () => {
    const listed = new Set(CATALOGUE.map((i) => i.id));
    for (const item of machines) expect(listed.has(item.id), item.id).toBe(specific(item));
    for (const item of custom) expect(listed.has(item.id), item.id).toBe(true);
    expect(listed.has("grain-in") && listed.has("grain-out")).toBe(true);
    expect(listed.has("concetti-pre-bin") && listed.has("bucket-elevator")).toBe(true);
    expect(listed.has("diverter")).toBe(false);
  });

  it("still finds a real item that is not listed, for a line that uses it", () => {
    expect(catalogueItem("diverter").machine.type).toBe("diverter");
  });

  it("is its real item's machine with no maker or model", () => {
    for (const item of custom) {
      const from = catalogueItem(item.customFrom);
      expect(item, item.id).toMatchObject({ group: from.group, maker: "", model: "" });
      const { adjustable, params, ...rest } = item.machine;
      const { adjustable: a0, params: p0, ...rest0 } = from.machine;
      expect(rest, item.id).toEqual(rest0);
      expect(adjustable?.length, item.id).toBe(a0?.length);
      expect(params?.length, item.id).toBe(p0?.length);
    }
  });

  it("keeps every default, and widens every limit that is not a percentage", () => {
    let widened = 0;
    for (const item of custom) {
      const before = numberFields(catalogueItem(item.customFrom).machine);
      const after = numberFields(item.machine);
      expect(after.map((f) => f.id), item.id).toEqual(before.map((f) => f.id));
      before.forEach((f, i) => {
        const g = after[i];
        const at = `${item.id} ${f.id}`;
        expect(g.default, at).toBe(f.default);
        expect(g.min, at).toBeLessThanOrEqual(f.min);
        expect(g.max, at).toBeGreaterThanOrEqual(f.max);
        if (f.unit === "%") {
          expect([g.min, g.max], at).toEqual([f.min, f.max]);
        } else {
          expect(g.max, at).toBeGreaterThanOrEqual(f.max * 2);
          if (f.min > 0) expect(g.min, at).toBeLessThan(f.min);
          widened += 1;
        }
      });
    }
    expect(widened).toBeGreaterThan(8);
  });

  it("leaves the real item's own limits as they were", () => {
    const elevator = numberFields(catalogueItem("bucket-elevator").machine).find((f) => f.id === "ratedCapacity");
    expect([elevator.min, elevator.max]).toEqual([5, 40]);
  });

  it("shows Custom in place of a maker, and nothing for a real machine with no maker", () => {
    expect(makerLabel(catalogueItem("bucket-elevator"))).toBe("Simatek E200");
    expect(makerLabel(catalogueItem("filling-head"))).toBe("Flexicon");
    expect(makerLabel(catalogueItem("custom-bin"))).toBe("Custom");
    expect(makerLabel(catalogueItem("custom-diverter"))).toBe("Custom");
    expect(makerLabel(catalogueItem("metal-bin"))).toBe("");
    expect(makerLabel(catalogueItem("grain-in"))).toBe("");
  });

  it("is found by the same search as the real item", () => {
    expect(searchCatalogue("elevator").map((i) => i.id).sort()).toEqual(["bucket-elevator", "custom-bucket-elevator"]);
    expect(searchCatalogue("bin").map((i) => i.id)).toContain("custom-bin");
  });
});

describe("searchCatalogue", () => {
  it("filters by name, ignoring case, and gives everything for an empty search", () => {
    expect(searchCatalogue("")).toBe(CATALOGUE);
    expect(searchCatalogue("  BIN ").map((i) => i.id)).toContain("metal-bin");
    expect(searchCatalogue("bin").every((i) => i.name.toLowerCase().includes("bin"))).toBe(true);
    expect(searchCatalogue("simatek")).toEqual([]);
  });
});

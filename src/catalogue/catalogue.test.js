// Issue #87: the machine catalogue.
import { describe, it, expect } from "vitest";
import { CATALOGUE, CATALOGUE_GROUPS, catalogueItem, makerLabel, searchCatalogue } from "./catalogue";
import { goldenLine } from "../line/goldenLine";
import { adjustableFields } from "../line/adjustableFields";

describe("the catalogue", () => {
  it("has one item for each of its ids, in a known group, with a name and a maker and model", () => {
    const groups = new Set(CATALOGUE_GROUPS.map((g) => g.id));
    expect(new Set(CATALOGUE.map((i) => i.id)).size).toBe(CATALOGUE.length);
    for (const item of CATALOGUE) {
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
    // alongside pendulumConveyor's own item. Issue #94's custom versions
    // are left out here and tested below.
    expect(new Set(CATALOGUE.filter((i) => i.customOf === undefined).map((i) => i.id)))
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

// Issue #94: custom items. A real item keeps the limits of the machine it
// stands for; its custom version is the same machine with no maker, whose
// settings reach far further.
describe("custom items", () => {
  const real = CATALOGUE.filter((i) => i.customOf === undefined);
  const custom = CATALOGUE.filter((i) => i.customOf !== undefined);
  const machines = real.filter((i) => i.group !== "edges");
  const customOf = (id) => custom.find((i) => i.customOf === id);
  const numberFields = (machine) => adjustableFields(machine).filter((f) => f.kind === "number" && f.setpoint === undefined);

  it("gives every machine one custom version, and Grain in and Grain out none", () => {
    expect(custom.map((i) => i.customOf).sort()).toEqual(machines.map((i) => i.id).sort());
  });

  it("is the same machine, name and group with no maker or model", () => {
    for (const item of machines) {
      const copy = customOf(item.id);
      expect(copy.id, item.id).not.toBe(item.id);
      expect(catalogueItem(copy.id)).toBe(copy);
      expect(copy).toMatchObject({ name: item.name, group: item.group, maker: "", model: "" });
      const { adjustable, params, ...rest } = copy.machine;
      const { adjustable: a0, params: p0, ...rest0 } = item.machine;
      expect(rest, item.id).toEqual(rest0);
      expect(adjustable?.length, item.id).toBe(a0?.length);
      expect(params?.length, item.id).toBe(p0?.length);
    }
  });

  it("keeps every default, and widens every limit that is not a percentage", () => {
    let widened = 0;
    for (const item of machines) {
      const before = numberFields(item.machine);
      const after = numberFields(customOf(item.id).machine);
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
    expect(widened).toBeGreaterThan(10);
  });

  it("leaves the real item's own limits as they were", () => {
    const elevator = numberFields(catalogueItem("bucket-elevator").machine).find((f) => f.id === "ratedCapacity");
    expect([elevator.min, elevator.max]).toEqual([5, 40]);
  });

  it("lists each custom item right after its real one", () => {
    for (const item of machines) {
      const i = CATALOGUE.indexOf(item);
      expect(CATALOGUE[i + 1].customOf, item.id).toBe(item.id);
    }
  });

  it("shows Custom in place of a maker, and nothing for a real machine with no maker", () => {
    expect(makerLabel(catalogueItem("bucket-elevator"))).toBe("Simatek E200");
    expect(makerLabel(catalogueItem("filling-head"))).toBe("Flexicon");
    expect(makerLabel(customOf("bucket-elevator"))).toBe("Custom");
    expect(makerLabel(customOf("metal-bin"))).toBe("Custom");
    expect(makerLabel(catalogueItem("metal-bin"))).toBe("");
    expect(makerLabel(catalogueItem("grain-in"))).toBe("");
  });

  it("is found by the same search as the real item", () => {
    expect(searchCatalogue("elevator").map((i) => i.id).sort())
      .toEqual(["bucket-elevator", customOf("bucket-elevator").id].sort());
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

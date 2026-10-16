// Issue #87: the machine catalogue.
import { describe, it, expect } from "vitest";
import { CATALOGUE, CATALOGUE_GROUPS, catalogueItem, makerLabel, searchCatalogue } from "./catalogue";
import { goldenLine } from "../line/goldenLine";

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

  it("has every golden line machine but the stubs, plus Grain in, Grain out, and the generic conveyors", () => {
    const fromGolden = new Set(goldenLine.machines.filter((m) => m.type !== "stub").map((m) => m.item));
    // Issue #90: belt-conveyor and chain-conveyor are catalogue items not
    // used by the golden line itself, for a line built from scratch to use
    // alongside pendulumConveyor's own item. Issue #94's generic versions
    // are left out here and tested below.
    expect(new Set(CATALOGUE.filter((i) => i.genericOf === undefined).map((i) => i.id)))
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

// Issue #94: generic items, the same machine with no maker.
describe("generic items", () => {
  const branded = CATALOGUE.filter((i) => i.maker !== "");
  const generic = CATALOGUE.filter((i) => i.genericOf !== undefined);

  it("gives every item with a maker one generic version, and no other item one", () => {
    expect(branded.length).toBeGreaterThan(0);
    expect(generic.map((i) => i.genericOf).sort()).toEqual(branded.map((i) => i.id).sort());
  });

  it("is the same machine, name and group with no maker or model", () => {
    for (const item of branded) {
      const copy = generic.find((i) => i.genericOf === item.id);
      expect(copy.id, item.id).not.toBe(item.id);
      expect(catalogueItem(copy.id)).toBe(copy);
      expect(copy).toMatchObject({ name: item.name, group: item.group, maker: "", model: "" });
      expect(copy.machine, item.id).toEqual(item.machine);
      expect(copy.machine, item.id).not.toBe(item.machine);
    }
  });

  it("lists each generic item right after its branded one", () => {
    for (const item of branded) {
      const i = CATALOGUE.indexOf(item);
      expect(CATALOGUE[i + 1].genericOf, item.id).toBe(item.id);
    }
  });

  it("shows Generic in place of a maker, and nothing for the plant edges", () => {
    expect(makerLabel(catalogueItem("bucket-elevator"))).toBe("Simatek E200");
    expect(makerLabel(catalogueItem("filling-head"))).toBe("Flexicon");
    expect(makerLabel(catalogueItem("bucket-elevator-generic"))).toBe("Generic");
    expect(makerLabel(catalogueItem("metal-bin"))).toBe("Generic");
    expect(makerLabel(catalogueItem("grain-in"))).toBe("");
    expect(makerLabel(catalogueItem("grain-out"))).toBe("");
  });

  it("is found by the same search as the branded item", () => {
    expect(searchCatalogue("elevator").map((i) => i.id).sort())
      .toEqual(["bucket-elevator", generic.find((i) => i.genericOf === "bucket-elevator").id].sort());
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

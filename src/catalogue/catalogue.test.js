// Issue #87: the machine catalogue.
import { describe, it, expect } from "vitest";
import { CATALOGUE, CATALOGUE_GROUPS, catalogueItem, searchCatalogue } from "./catalogue";
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

  it("has every golden line machine but the stubs, plus Grain in and Grain out", () => {
    const fromGolden = new Set(goldenLine.machines.filter((m) => m.type !== "stub").map((m) => m.item));
    expect(new Set(CATALOGUE.map((i) => i.id))).toEqual(new Set([...fromGolden, "grain-in", "grain-out"]));
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

describe("searchCatalogue", () => {
  it("filters by name, ignoring case, and gives everything for an empty search", () => {
    expect(searchCatalogue("")).toBe(CATALOGUE);
    expect(searchCatalogue("  BIN ").map((i) => i.id)).toContain("metal-bin");
    expect(searchCatalogue("bin").every((i) => i.name.toLowerCase().includes("bin"))).toBe(true);
    expect(searchCatalogue("simatek")).toEqual([]);
  });
});

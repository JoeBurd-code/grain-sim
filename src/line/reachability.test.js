import { describe, it, expect } from "vitest";
import { line } from "./lineData";

// Follow connections forward from a set of start machines.
function reachableFrom(startIds) {
  const out = new Map();
  for (const c of line.connections) {
    if (!out.has(c.from.machine)) out.set(c.from.machine, []);
    out.get(c.from.machine).push(c.to.machine);
  }
  const seen = new Set(startIds);
  const stack = [...startIds];
  while (stack.length) {
    const id = stack.pop();
    for (const next of out.get(id) ?? []) {
      if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return seen;
}

const SOURCES = ["upstreamStub", "proBoxStation"];
const PRODUCT_ENDPOINTS = ["metalBin1", "metalBin2", "bigBagStub", "palletStub"];

describe("line reachability (trace by arrows alone)", () => {
  it("reaches every product endpoint from a source", () => {
    const reach = reachableFrom(SOURCES);
    for (const endpoint of PRODUCT_ENDPOINTS) {
      expect(reach.has(endpoint), `${endpoint} unreachable from sources`).toBe(true);
    }
  });

  it("leaves no machine stranded (every machine is on a source path)", () => {
    const reach = reachableFrom(SOURCES);
    // chemStub feeds in but is itself a source of chemical, not fed by product;
    // it is a legitimate scope-edge source.
    const exemptSources = new Set(["chemStub"]);
    const stranded = line.machines
      .filter((m) => !reach.has(m.id) && !exemptSources.has(m.id))
      .map((m) => m.id);
    expect(stranded).toEqual([]);
  });
});

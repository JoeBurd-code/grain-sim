import { describe, expect, it } from "vitest";
import { line as goldenLine } from "../line/lineData";
import { PLOT_COLORS, plotRosterOf } from "./plotColors";

describe("plotRosterOf", () => {
  it("lists the golden line's sim-enabled machines in declaration order", () => {
    const roster = plotRosterOf(goldenLine);
    expect(roster.machines.map((m) => m.id)).toEqual(
      goldenLine.machines.filter((m) => m.sim?.kind).map((m) => m.id),
    );
  });

  // A line built with NEW LINE has none of the golden line's machine ids, so
  // a roster fixed to the golden line left the chart unable to draw any of
  // its machines.
  it("lists the machines of a line other than the golden line", () => {
    const bin = goldenLine.machines.find((m) => m.sim?.kind);
    const built = { ...goldenLine, machines: [{ ...bin, id: "bin-a" }, { id: "edge", name: "Edge" }, { ...bin, id: "bin-b" }] };
    const roster = plotRosterOf(built);
    expect(roster.machines.map((m) => m.id)).toEqual(["bin-a", "bin-b"]);
    expect(roster.colorFor("bin-a")).toBe(PLOT_COLORS[0]);
    expect(roster.colorFor("bin-b")).toBe(PLOT_COLORS[1]);
  });

  it("gives a machine not on the line the first color", () => {
    expect(plotRosterOf(goldenLine).colorFor("not-a-machine")).toBe(PLOT_COLORS[0]);
  });
});

import { describe, it, expect } from "vitest";
import { conditionOptions, machineActionOptions, stepTypeOptions } from "./sentenceOptions";
import { emptyLine } from "./lineDocument";

function lineWithMachines() {
  const line = emptyLine();
  line.machines.push(
    { id: "bin1", name: "Bin 1", tag: "", x: 0, y: 0, w: 1, h: 1, ports: { inputs: [], outputs: [] }, sim: { kind: "accumulator" } },
    { id: "valve1", name: "Valve 1", tag: "", x: 0, y: 0, w: 1, h: 1, ports: { inputs: [], outputs: [] }, sim: { kind: "gateValve" } },
  );
  return line;
}

describe("conditionOptions", () => {
  it("offers above/below only for a machine with a level", () => {
    const line = lineWithMachines();
    expect(conditionOptions(line, "bin1")).toEqual(["above", "below"]);
  });

  it("offers stopped/running for a machine with confirmedRunning", () => {
    const line = lineWithMachines();
    expect(conditionOptions(line, "valve1")).toEqual(["stopped", "running"]);
  });
});

describe("machineActionOptions", () => {
  it("offers close/open for a valve, not stop/start", () => {
    const line = lineWithMachines();
    expect(machineActionOptions(line, "valve1")).toEqual(["close", "open"]);
  });

  it("offers nothing for a plain accumulator", () => {
    const line = lineWithMachines();
    expect(machineActionOptions(line, "bin1")).toEqual([]);
  });
});

describe("stepTypeOptions", () => {
  it("includes the flow steps only after then", () => {
    const line = lineWithMachines();
    expect(stepTypeOptions(line, "then")).toContain("tripLine");
    expect(stepTypeOptions(line, "whenClearsThen")).not.toContain("tripLine");
    expect(stepTypeOptions(line, "whenClearsThen")).not.toContain("ifStillTrue");
  });
});

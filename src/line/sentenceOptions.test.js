import { describe, it, expect } from "vitest";
import { conditionOptions, machineActionOptions, switchOptions, sentenceSummary, interlocksByMachine } from "./sentenceOptions";
import { binFeederTestLine } from "./testLines";
import { emptyLine } from "./lineDocument";

function lineWithMachines() {
  const line = emptyLine();
  line.machines.push(
    { id: "bin1", name: "Bin 1", instruments: ["LT", "LSH", "LSL"], ports: { inputs: [], outputs: [] }, sim: { kind: "accumulator" } },
    { id: "valve1", name: "Valve 1", ports: { inputs: [], outputs: [] }, sim: { kind: "gateValve" } },
  );
  return line;
}

describe("sentence options", () => {
  it("offers above/below only for a machine with a level", () => {
    expect(conditionOptions(lineWithMachines(), "bin1")).toEqual(["above", "below"]);
  });

  it("offers stopped/running for a machine that confirms running", () => {
    expect(conditionOptions(lineWithMachines(), "valve1")).toEqual(["stopped", "running"]);
  });

  it("offers close/open for a valve, and nothing for a bin", () => {
    expect(machineActionOptions(lineWithMachines(), "valve1")).toEqual(["close", "open"]);
    expect(machineActionOptions(lineWithMachines(), "bin1")).toEqual([]);
  });

  it("offers only the level switches drawn on the machine", () => {
    expect(switchOptions(lineWithMachines(), "bin1")).toEqual(["LSL", "LSH"]);
  });

  it("reads a sentence in plain words", () => {
    const rule = {
      when: { machine: "bin1", condition: "above", setpoint: 0.85, delaySec: 5 },
      then: [{ action: "close", machine: "valve1" }],
      reset: "auto",
    };
    const text = sentenceSummary(lineWithMachines(), rule).map((s) => s.text ?? `[${s.machine}]`).join("");
    expect(text).toBe("When [bin1] is above 85 % for 5 s, close [valve1].");
  });
});

describe("interlocksByMachine", () => {
  it("groups interlocks by watched machine, in line order, unwatched last", () => {
    const line = binFeederTestLine();
    const rule = (id, machine) => ({ id, kind: "sentence", when: { machine, condition: null }, then: [], reset: "auto" });
    line.interlocks = [rule("a", "splitValve"), rule("b", null), rule("c", "bin"), rule("d", "splitValve"), rule("e", "gone")];
    const suggestion = rule("s", "bin");
    expect(interlocksByMachine(line, [suggestion]).map((g) => [g.machine, g.rules.map((r) => r.id), g.suggestions.map((r) => r.id)]))
      .toEqual([["bin", ["c"], ["s"]], ["splitValve", ["a", "d"], []], [null, ["b", "e"], []]]);
  });
});

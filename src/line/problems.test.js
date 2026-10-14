// Issue #89: the Build mode problems list, one test per problem type on a
// small built line (the same construction buildModeLine.test.js uses).
import { describe, it, expect } from "vitest";
import { emptyLine, addMachine } from "./editing";
import { connectPorts } from "./connecting";
import { lineProblems, problemMachineIds, hasGrainIn } from "./problems";

function add(line, itemId, pos) {
  const result = addMachine(line, itemId, pos);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function connect(line, a, b) {
  const result = connectPorts(line, a, b);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}

describe("lineProblems", () => {
  it("reports an unconnected input and an unconnected output", () => {
    const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    const bin = add(grainIn.line, "metal-bin", { x: 0, y: 200 });

    const problems = lineProblems(bin.line);
    expect(problems).toContainEqual(expect.objectContaining({
      machineId: grainIn.id, message: expect.stringContaining("output not connected"),
    }));
    expect(problems).toContainEqual(expect.objectContaining({
      machineId: bin.id, message: expect.stringContaining("input not connected"),
    }));
  });

  it("reports no Grain in when the line has no source", () => {
    const bin = add(emptyLine(), "metal-bin", { x: 0, y: 0 });
    expect(hasGrainIn(bin.line)).toBe(false);
    expect(lineProblems(bin.line)).toContainEqual(expect.objectContaining({ message: "No Grain in on the line" }));
  });

  it("reports no Grain out when the line has no terminal sink", () => {
    const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    const bin = add(grainIn.line, "metal-bin", { x: 0, y: 200 });
    let line = connect(bin.line, { machine: grainIn.id, port: "out" }, { machine: bin.id, port: "in" });

    expect(lineProblems(line)).toContainEqual(expect.objectContaining({ message: "No Grain out on the line" }));
  });

  it("has neither Grain in/out problem on a line with both", () => {
    const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    const bin = add(grainIn.line, "metal-bin", { x: 0, y: 200 });
    const grainOut = add(bin.line, "grain-out", { x: 0, y: 400 });
    let line = connect(grainOut.line, { machine: grainIn.id, port: "out" }, { machine: bin.id, port: "in" });
    line = connect(line, { machine: bin.id, port: "out" }, { machine: grainOut.id, port: "in" });

    const messages = lineProblems(line).map((p) => p.message);
    expect(messages).not.toContain("No Grain in on the line");
    expect(messages).not.toContain("No Grain out on the line");
  });

  it("reports an incomplete interlock (a sentence missing its steps)", () => {
    const bin = add(emptyLine(), "metal-bin", { x: 0, y: 0 });
    const line = {
      ...bin.line,
      interlocks: [{
        id: "incompleteRule",
        kind: "sentence",
        when: { machine: bin.id, condition: "above", setpoint: 0.9, delaySec: 0 },
        reset: "auto",
        // no `then`: validateSentence refuses this
      }],
    };

    const problems = lineProblems(line);
    expect(problems).toContainEqual(expect.objectContaining({
      machineId: bin.id, message: expect.stringContaining("incomplete interlock"),
    }));
  });

  it("reports an interlock that lost a machine it depends on as off, not incomplete", () => {
    const bin = add(emptyLine(), "metal-bin", { x: 0, y: 0 });
    const line = {
      ...bin.line,
      interlocks: [{
        id: "orphanedRule",
        kind: "sentence",
        when: { machine: bin.id, condition: "above", setpoint: 0.9, delaySec: 0 },
        then: [{ action: "stop", machine: "ghostMachine" }],
        reset: "auto",
      }],
    };

    const problems = lineProblems(line);
    expect(problems).toContainEqual(expect.objectContaining({
      message: expect.stringContaining("interlock lost a machine it depends on"),
    }));
    // The rule is off (it names a machine the line does not have), so it is
    // never also reported as merely incomplete.
    expect(problems.some((p) => p.message.includes("incomplete interlock"))).toBe(false);
  });

  it("problemMachineIds names each problem machine once, even with more than one problem", () => {
    const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    const ids = problemMachineIds(grainIn.line);
    expect(ids.has(grainIn.id)).toBe(true);
    expect(ids.size).toBe(1);
  });
});

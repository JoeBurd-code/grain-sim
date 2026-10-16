// Issue #88: a line built entirely with line document functions (catalogue
// items, added and wired port to port, not hand-authored data) runs in the
// engine exactly like the golden line.
import { describe, it, expect } from "vitest";
import { emptyLine, addMachine, connectPorts, setAdjustableValue } from "../line/lineDocument";
import { validateLine } from "../line/validateLine";
import { createSim, stepSim, getMachineState, setGateFraction, DT } from "./engine";
import { assertConserved } from "./conservation";
import { CATALOGUE } from "../catalogue/catalogue";
import { adjustableFields } from "../line/adjustableFields";

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
function setField(line, id, field, value) {
  const result = setAdjustableValue(line, id, field, value);
  if (!result.ok) throw new Error(result.error);
  return result.line;
}
function run(sim, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepSim(sim, DT);
    assertConserved(sim);
  }
}

describe("a line built from the catalogue, port to port (issue #88)", () => {
  it("runs end to end and grain reaches Grain out, volume conserved", () => {
    const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    const bin = add(grainIn.line, "metal-bin", { x: 0, y: 200 });
    const elevator = add(bin.line, "bucket-elevator", { x: 0, y: 500 });
    const grainOut = add(elevator.line, "grain-out", { x: 500, y: 500 });

    let line = connect(grainOut.line, { machine: grainIn.id, port: "out" }, { machine: bin.id, port: "in" });
    line = connect(line, { machine: bin.id, port: "out" }, { machine: elevator.id, port: "in" });
    line = connect(line, { machine: elevator.id, port: "out" }, { machine: grainOut.id, port: "in" });

    expect(validateLine(line).errors).toEqual([]);

    const sim = createSim(line);
    run(sim, 300);

    expect(getMachineState(sim, grainOut.id).total).toBeGreaterThan(0);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  // Issue #94: a custom item at its defaults runs exactly like the real one
  // it copies.
  it("runs a custom elevator at its defaults the same as the real one", () => {
    const outAfter = (elevatorItem) => {
      const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
      const elevator = add(grainIn.line, elevatorItem, { x: 0, y: 200 });
      const grainOut = add(elevator.line, "grain-out", { x: 500, y: 200 });
      let line = connect(grainOut.line, { machine: grainIn.id, port: "out" }, { machine: elevator.id, port: "in" });
      line = connect(line, { machine: elevator.id, port: "out" }, { machine: grainOut.id, port: "in" });
      const sim = createSim(line);
      run(sim, 120);
      return getMachineState(sim, grainOut.id).total;
    };
    const branded = outAfter("bucket-elevator");
    expect(branded).toBeGreaterThan(0);
    expect(outAfter("bucket-elevator-custom")).toBe(branded);
  });

  // Issue #94: a custom machine's widened limits are values the engine can
  // run. Every custom field, at each end of its range, on a line of its own.
  const customFields = CATALOGUE
    .filter((item) => item.customOf !== undefined)
    .flatMap((item) => adjustableFields(item.machine)
      .filter((f) => f.kind === "number" && f.unit !== "%")
      .flatMap((f) => [[item.id, f.id, f.min], [item.id, f.id, f.max]]));

  it.each(customFields)("runs %s with %s at %s", (itemId, fieldId, value) => {
    const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    const machine = add(grainIn.line, itemId, { x: 0, y: 200 });
    let line = machine.line;
    const input = line.machines.find((m) => m.id === machine.id).ports.inputs[0];
    if (input) line = connect(line, { machine: grainIn.id, port: "out" }, { machine: machine.id, port: input });
    line = setField(line, machine.id, fieldId, value);
    expect(validateLine(line).errors).toEqual([]);
    run(createSim(line), 60);
  });

  // A drum feeder on a built line has no feed-rate derivation, so its gate
  // position dial must act on its own rate (found live on a user's line:
  // closing the gate left the bin above it at 0 %).
  describe("a drum feeder's gate, with no feed-rate derivation", () => {
    function feederLine() {
      const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
      const bin = add(grainIn.line, "metal-bin", { x: 0, y: 100 });
      const feeder = add(bin.line, "drum-feeder", { x: 0, y: 300 });
      const grainOut = add(feeder.line, "grain-out", { x: 0, y: 400 });
      let line = connect(grainOut.line, { machine: grainIn.id, port: "out" }, { machine: bin.id, port: "in" });
      line = connect(line, { machine: bin.id, port: "out" }, { machine: feeder.id, port: "in" });
      line = connect(line, { machine: feeder.id, port: "out" }, { machine: grainOut.id, port: "in" });
      return { line, bin: bin.id, feeder: feeder.id, grainOut: grainOut.id };
    }

    it("closed, stops the feeder, so the bin above it fills", () => {
      const ids = feederLine();
      const sim = createSim(ids.line);
      setGateFraction(sim, ids.feeder, 0);
      run(sim, 60);
      expect(getMachineState(sim, ids.feeder).flowRateM3PerSec).toBe(0);
      expect(getMachineState(sim, ids.grainOut).total).toBe(0);
      const bin = getMachineState(sim, ids.bin);
      expect(bin.stored).toBeCloseTo(getMachineState(sim, ids.feeder).rate * 60, 3);
    });

    it("half open, runs the feeder at half its rate", () => {
      const ids = feederLine();
      const sim = createSim(ids.line);
      setGateFraction(sim, ids.feeder, 0.5);
      run(sim, 60);
      const feeder = getMachineState(sim, ids.feeder);
      expect(feeder.flowRateM3PerSec).toBeCloseTo(feeder.rate * 0.5, 9);
    });

    it("untouched, runs the feeder at its full rate", () => {
      const ids = feederLine();
      const sim = createSim(ids.line);
      run(sim, 60);
      const feeder = getMachineState(sim, ids.feeder);
      expect(feeder.flowRateM3PerSec).toBeCloseTo(feeder.rate, 9);
    });
  });

  it("backs up into an unconnected output, and that machine's own upstream stops", () => {
    const grainIn = add(emptyLine(), "grain-in", { x: 0, y: 0 });
    const bin = add(grainIn.line, "metal-bin", { x: 0, y: 200 });
    // The bin's own minimum capacity and the source's own maximum rate,
    // so the bin fills (and the source stops) well inside the test run.
    let line = setField(bin.line, bin.id, "capacity", 1.5);
    line = setField(line, grainIn.id, "rate", 20);
    line = connect(line, { machine: grainIn.id, port: "out" }, { machine: bin.id, port: "in" });
    // The bin's own "out" is left unconnected.

    const sim = createSim(line);
    run(sim, 260);

    const binState = getMachineState(sim, bin.id);
    expect(binState.stored).toBeCloseTo(binState.capacity, 6);
    expect(getMachineState(sim, grainIn.id).flowRateM3PerSec).toBeLessThan(1e-6);
  });
});

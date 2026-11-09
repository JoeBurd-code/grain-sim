// Issue #127: the Custom Discard bin takes a capacity, so the user sets how
// long it takes to fill. The real Discard bin keeps its fixed one.
import { describe, it, expect } from "vitest";
import { addMachine, emptyLine } from "./editing";
import { connectPorts } from "./connecting";
import { setAdjustableValue, readAdjustableValue, adjustableFields } from "./adjustableFields";
import { exportLine, importLine } from "./lineDocument";
import { catalogueItem } from "../catalogue/catalogue";
import { createSim, stepSim, getMachineState, DT } from "../sim/engine";
import { BEHAVIORS } from "../sim/behaviors";

function add(line, itemId, pos) {
  const result = addMachine(line, itemId, pos);
  expect(result.ok, result.error).toBe(true);
  return result;
}

function set(line, id, field, value) {
  const result = setAdjustableValue(line, id, field, value);
  expect(result.ok, result.error).toBe(true);
  return result.line;
}

// Grain in → Discard bin, the S1 test's line for a terminal sink.
function grainInToBin(itemId) {
  const source = add(emptyLine(), "grain-in", { x: 400, y: 100 });
  const bin = add(source.line, itemId, { x: 400, y: 400 });
  const result = connectPorts(bin.line, { machine: source.id, port: "out" }, { machine: bin.id, port: "in" });
  expect(result.ok, result.error).toBe(true);
  return { line: result.line, id: bin.id };
}

// Seconds of 12 t/h until the bin reads full.
function secondsToFill(line, id) {
  const sim = createSim(line);
  const fill = () => BEHAVIORS.terminalSink.snapshot(getMachineState(sim, id)).fill;
  let t = 0;
  while (fill() < 1 && t < 3600) {
    stepSim(sim, DT);
    t += DT;
  }
  return t;
}

describe("the Custom Discard bin's capacity", () => {
  it("is a field in m³ reaching the custom range, defaulting to the real bin's 0.3 m³", () => {
    const field = adjustableFields(catalogueItem("custom-discard-bin").machine).find((f) => f.id === "capacity");
    expect(field).toMatchObject({ label: "capacity", unit: "m³", min: 0.01, max: 100, default: 0.3 });
  });

  it("is not on the real Discard bin", () => {
    expect(adjustableFields(catalogueItem("discard-bin").machine)).toEqual([]);
  });

  it("reads back what was set, and refuses a value outside 0.01–100 m³", () => {
    const { line, id } = grainInToBin("custom-discard-bin");
    expect(readAdjustableValue(line, id, "capacity")).toBe(0.3);
    expect(readAdjustableValue(set(line, id, "capacity", 2), id, "capacity")).toBe(2);
    for (const value of [0.001, 0, 101]) {
      expect(setAdjustableValue(line, id, "capacity", value).ok, value).toBe(false);
    }
  });

  it("sets how long the bin takes to fill in the sim", () => {
    const { line, id } = grainInToBin("custom-discard-bin");
    const small = secondsToFill(line, id);
    const big = secondsToFill(set(line, id, "capacity", 0.6), id);
    expect(small).toBeGreaterThan(0);
    // Twice the volume from the same 1 % seed takes about twice as long.
    expect(big / small).toBeCloseTo(2, 1);
  });

  it("survives SAVE and OPEN", () => {
    const { line, id } = grainInToBin("custom-discard-bin");
    const opened = importLine(exportLine(set(line, id, "capacity", 5), "S1"));
    expect(opened.ok, opened.error).toBe(true);
    expect(readAdjustableValue(opened.line, id, "capacity")).toBe(5);
  });
});

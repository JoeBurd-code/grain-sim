import { describe, it, expect } from "vitest";
import { createSim, stepSim, getMachineState, setSourceRate, DT } from "./engine";
import { assertConserved, conservationTotals } from "./conservation";
import { tPerHourToM3PerSec } from "./units";
import { line } from "../line/lineData";

const SOURCE_ID = "upstreamStub";
const METAL_REMOVER_ID = "treatMetalRemover";
const BUFFER_BIN_ID = "treaterBufferBin";

describe("createSim / stepSim (real Treater Line 2 data)", () => {
  it("creates a sim and steps it by a fixed timestep", () => {
    const sim = createSim(line);
    expect(sim.t).toBe(0);
    stepSim(sim, DT);
    expect(sim.t).toBeCloseTo(DT);
    stepSim(sim, DT);
    expect(sim.t).toBeCloseTo(DT * 2);
  });

  it("reads a machine's current state back", () => {
    const sim = createSim(line);
    expect(getMachineState(sim, BUFFER_BIN_ID).kind).toBe("accumulator");
    expect(getMachineState(sim, "notAMachine")).toBeUndefined();
  });

  it("source injects at its configured rate, accumulating in the empty-headroom bin", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 100; i++) stepSim(sim, DT);
    const source = getMachineState(sim, SOURCE_ID);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(source.fed).toBeCloseTo(tPerHourToM3PerSec(12) * DT * 100);
    expect(bin.stored).toBeCloseTo(bin.capacity * 0.55 + source.fed);
  });

  it("source rate can be changed while the sim is running", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, 0);
    stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).fed).toBe(0);

    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    stepSim(sim, DT);
    expect(getMachineState(sim, SOURCE_ID).fed).toBeCloseTo(tPerHourToM3PerSec(12) * DT);
  });

  it("metal remover holds zero volume at all times", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < 50; i++) {
      stepSim(sim, DT);
      expect(getMachineState(sim, METAL_REMOVER_ID).volume).toBe(0);
    }
  });

  it("buffer bin reports its level as a fraction of working volume", () => {
    const sim = createSim(line);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored / bin.capacity).toBeCloseTo(0.55);
  });

  it("buffer bin fills and rejects once full; rejected material backs up to the source instead of vanishing", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20)); // fast enough to fill it
    for (let i = 0; i < 20000; i++) stepSim(sim, DT);

    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(bin.stored).toBeCloseTo(bin.capacity);
    expect(bin.stored).toBeLessThanOrEqual(bin.capacity + 1e-9);
    expect(bin.spill).toBeCloseTo(0); // backpressure, not spill, per issue #18

    const source = getMachineState(sim, SOURCE_ID);
    const fedBeforeStall = source.fed;
    for (let i = 0; i < 20; i++) stepSim(sim, DT);
    // once the bin is full, further ticks accept nothing further from the source
    expect(source.fed).toBeCloseTo(fedBeforeStall);
  });

  it("conserves volume through fill and overflow (fed = stored + inTransit + delivered + spilled)", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20));
    for (let i = 0; i < 20000; i++) {
      stepSim(sim, DT);
    }
    expect(() => assertConserved(sim)).not.toThrow();

    const totals = conservationTotals(sim);
    const bin = getMachineState(sim, BUFFER_BIN_ID);
    expect(totals.stored).toBeCloseTo(bin.stored);
  });

  it("throws when a line declares an unregistered sim.kind", () => {
    const badLine = {
      ...line,
      machines: line.machines.map((m) =>
        m.id === METAL_REMOVER_ID ? { ...m, sim: { kind: "teleporter" } } : m
      ),
    };
    expect(() => createSim(badLine)).toThrow(/unregistered sim\.kind/);
  });
});

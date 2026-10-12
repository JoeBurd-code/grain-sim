// Issue #81: the generated plant controls work in the engine on any line,
// not only the golden line. Driven through the engine's public entry point
// and the line document's own plant control model.
import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, getMachineState, setSelection, getSelection, getSelections, emptyMachine, clearPlant,
  controlledStop, resumeLine, setAccumulatorLevel, DT,
} from "./engine";
import { assertConserved } from "./conservation";
import { plantControlsFor } from "../line/plantControls";
import { diverterTestLine } from "../line/testLines";
import { goldenLine } from "../line/goldenLine";
import { SOURCE_SELECTOR } from "./commandSlots";

function run(sim, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepSim(sim, DT);
    assertConserved(sim);
  }
}

const total = (sim, id) => getMachineState(sim, id).total;

describe("a small line with a Diverter and two terminal sinks", () => {
  it("runs: grain from the source reaches the selected sink", () => {
    const sim = createSim(diverterTestLine());
    run(sim, 60);
    expect(total(sim, "sinkA")).toBeGreaterThan(0.1);
    expect(total(sim, "sinkB")).toBe(0);
  });

  it("its one Diverter selector routes the grain to the sink each option names", () => {
    const line = diverterTestLine();
    const [selector] = plantControlsFor(line).selectors;
    const sim = createSim(line);
    expect(getSelection(sim, selector.id)).toBe("left");

    setSelection(sim, selector.id, "right");
    expect(getSelection(sim, selector.id)).toBe("right");
    expect(getSelections(sim)).toEqual({ [selector.id]: "right" });
    run(sim, 60);
    expect(total(sim, "sinkA")).toBe(0);
    expect(total(sim, "sinkB")).toBeGreaterThan(0.1);

    setSelection(sim, selector.id, "left");
    const bBefore = total(sim, "sinkB");
    run(sim, 60);
    expect(total(sim, "sinkA")).toBeGreaterThan(0.1);
    expect(total(sim, "sinkB")).toBeCloseTo(bBefore, 9);
  });

  it("refuses an unknown selector or option", () => {
    const sim = createSim(diverterTestLine());
    expect(() => setSelection(sim, "nope", "left")).toThrow(/unknown plant control selector "nope"/);
    expect(() => setSelection(sim, "splitValve", "middle")).toThrow(/unknown splitValve "middle"/);
  });

  it("each of its two EMPTY buttons empties its own sink and leaves the other", () => {
    const line = diverterTestLine();
    const { emptyButtons } = plantControlsFor(line);
    expect(emptyButtons).toHaveLength(2);
    const sim = createSim(line);
    run(sim, 30);
    setSelection(sim, "splitValve", "right");
    run(sim, 60);
    expect(total(sim, "sinkA")).toBeGreaterThan(0.05);
    expect(total(sim, "sinkB")).toBeGreaterThan(0.05);

    const bBefore = total(sim, "sinkB");
    for (const id of emptyButtons[0].machines) emptyMachine(sim, id);
    expect(total(sim, "sinkA")).toBe(0);
    expect(total(sim, "sinkB")).toBe(bBefore);
    assertConserved(sim);

    for (const id of emptyButtons[1].machines) emptyMachine(sim, id);
    expect(total(sim, "sinkB")).toBe(0);
    assertConserved(sim);
    run(sim, 10); // still steps cleanly afterwards
  });

  it("CLEAR PLANT empties its bin and both sinks", () => {
    const sim = createSim(diverterTestLine());
    run(sim, 30);
    setSelection(sim, "splitValve", "right");
    run(sim, 30);
    setAccumulatorLevel(sim, "bin", 0.6);
    expect(getMachineState(sim, "bin").stored).toBeGreaterThan(0);
    expect(total(sim, "sinkA")).toBeGreaterThan(0);
    expect(total(sim, "sinkB")).toBeGreaterThan(0);

    clearPlant(sim);
    expect(getMachineState(sim, "bin").stored).toBe(0);
    expect(total(sim, "sinkA")).toBe(0);
    expect(total(sim, "sinkB")).toBe(0);
    assertConserved(sim);
  });

  it("CONTROLLED STOP and RESUME work on it", () => {
    const sim = createSim(diverterTestLine());
    run(sim, 20);
    controlledStop(sim);
    run(sim, 120);
    expect(getMachineState(sim, "bin").stored).toBeLessThan(1e-6);
    const settled = total(sim, "sinkA");
    run(sim, 20);
    expect(total(sim, "sinkA")).toBeCloseTo(settled, 9);
    resumeLine(sim);
    run(sim, 20);
    expect(total(sim, "sinkA")).toBeGreaterThan(settled);
  });
});

describe("the golden line's declared selectors in the engine", () => {
  const feederOn = (sim, id) => getMachineState(sim, id).enableCommands[SOURCE_SELECTOR];
  const port = (sim, id) => getMachineState(sim, id).selected;

  it("SOURCE switches the same two drum feeders as before issue #81", () => {
    const sim = createSim(goldenLine);
    expect(getSelection(sim, "source")).toBe("treatingLine");
    setSelection(sim, "source", "proBox");
    expect([feederOn(sim, "inletDrumFeeder1"), feederOn(sim, "inletDrumFeeder2")]).toEqual([true, false]);
    expect(getSelection(sim, "source")).toBe("proBox");
    setSelection(sim, "source", "treatingLine");
    expect([feederOn(sim, "inletDrumFeeder1"), feederOn(sim, "inletDrumFeeder2")]).toEqual([false, true]);
    expect(getSelection(sim, "source")).toBe("treatingLine");
  });

  it("DESTINATION sets the same pendulum conveyor outlet and outload diverter port as before issue #81", () => {
    const sim = createSim(goldenLine);
    expect(getSelection(sim, "destination")).toBe("concetti");
    const expected = {
      flexicon: ["outBinSeg", "out1"],
      metalBin2: ["outBuffer", "out2"],
      concetti: ["outConcetti", "out2"], // the diverter keeps its last port
      metalBin1: ["outBuffer", "out1"],
    };
    for (const [option, [conveyorPort, diverterPort]] of Object.entries(expected)) {
      setSelection(sim, "destination", option);
      expect([option, port(sim, "pendulumConveyor"), port(sim, "outloadDiverter")]).toEqual([option, conveyorPort, diverterPort]);
      expect(getSelection(sim, "destination")).toBe(option);
    }
    // The wrapped Diverters get no plain selector of their own.
    expect(Object.keys(getSelections(sim))).toEqual(["source", "destination"]);
  });

  it("RESUME after a controlled stop puts back the source chosen before the stop", () => {
    const sim = createSim(goldenLine);
    setSelection(sim, "source", "proBox");
    controlledStop(sim);
    run(sim, 1);
    setSelection(sim, "source", "treatingLine");
    resumeLine(sim);
    expect(getSelection(sim, "source")).toBe("proBox");
  });
});

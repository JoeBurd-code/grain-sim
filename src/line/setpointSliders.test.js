// Issue #85: a machine popup's set point sliders are generated from the
// rules that read the machine, not hand-written on it.
import { describe, it, expect } from "vitest";
import { setpointSliders } from "./setpointSliders";
import { setAdjustableValue } from "./lineDocument";
import { goldenLine } from "./goldenLine";
import { binFeederTestLine } from "./testLines";

const slidersOf = (line, id) =>
  setpointSliders(line, id).map(({ id: sliderId, label, min, max, value, unit, bind }) => [sliderId, label, min, max, value, unit, bind]);

// Each golden line bin's set point sliders as they were hand-written before
// issue #85: [id, label, min, max, value, unit, bind].
const BEFORE = {
  treaterBufferBin: [
    ["highSetpoint", "LSH set point", 35, 90, 85, "%", "interlockHighSetpoint"],
    ["lowSetpoint", "LSL set point", 0, 55, 35, "%", "interlockLowSetpoint"],
    ["highHighSetpoint", "LSHH trip set point", 55, 100, 95, "%", "interlockHighHighSetpoint"],
  ],
  treaterPreBin: [
    ["lowSetpoint", "LSL recover", 0, 55, 35, "%", "interlockLowSetpoint"],
    ["highSetpoint", "LSH set point", 35, 90, 85, "%", "interlockHighSetpoint"],
    ["highHighSetpoint", "LSHH trip set point", 55, 100, 95, "%", "interlockHighHighSetpoint"],
  ],
  treaterAfterBin: [
    ["highSetpoint", "LSH0 set point", 30, 100, 60, "%", "interlockHighSetpoint"],
    ["lowSetpoint", "LSL0 clear point", 0, 30, 20, "%", "interlockLowSetpoint"],
  ],
  flexiconPreBin: [
    ["highSetpoint", "LSH set point", 45, 100, 85, "%", "interlockHighSetpoint"],
    ["lowSetpoint", "LSL set point", 0, 45, 35, "%", "interlockLowSetpoint"],
  ],
  concettiPreBin: [
    ["lowSetpoint", "LSL recover", 0, 55, 35, "%", "interlockLowSetpoint"],
    ["highSetpoint", "LSH set point", 35, 90, 85, "%", "interlockHighSetpoint"],
    ["highHighSetpoint", "LSHH trip set point", 55, 100, 95, "%", "interlockHighHighSetpoint"],
  ],
};

// A small built line with one interlock and no set point slider written
// anywhere.
function builtLine(interlock) {
  const line = binFeederTestLine();
  line.interlocks = [interlock];
  return line;
}

describe("setpointSliders on the golden line", () => {
  it.each(Object.keys(BEFORE))("%s shows the same sliders, labels and ranges as before", (id) => {
    expect(slidersOf(goldenLine, id)).toEqual(BEFORE[id]);
  });

  it("gives each metal bin an LSH slider from its trip sentence, at the default range", () => {
    for (const id of ["metalBin1", "metalBin2"]) {
      expect(slidersOf(goldenLine, id)).toEqual([["highSetpoint", "LSH set point", 0, 100, 85, "%", "interlockHighSetpoint"]]);
    }
  });

  it("gives a machine that no rule reads by level no set point slider", () => {
    for (const id of ["pendulumConveyor", "batchTreater", "outloadBufferBin", "treatDrumFeeder"]) {
      expect(setpointSliders(goldenLine, id)).toEqual([]);
    }
  });

  it("shows the line's value, so a Build mode change reaches the popup", () => {
    const result = setAdjustableValue(goldenLine, "treaterBufferBin", "highSetpoint", 70);
    expect(result.ok).toBe(true);
    expect(setpointSliders(result.line, "treaterBufferBin")[0].value).toBe(70);
  });
});

describe("setpointSliders on a small built line", () => {
  const trip = (when) => ({
    id: "binHigh", kind: "sentence", when: { machine: "bin", condition: "above", setpoint: 0.8, delaySec: 5, ...when },
    then: [{ action: "stop", machine: "feeder" }], reset: "latched",
  });

  it("gives a sentence's named level switch a slider with no hand-written param", () => {
    expect(slidersOf(builtLine(trip({ switch: "LSH" })), "bin"))
      .toEqual([["highSetpoint", "LSH set point", 0, 100, 80, "%", "interlockHighSetpoint"]]);
  });

  it("gives a level condition with no switch a slider that moves that one sentence's set point", () => {
    const [slider] = setpointSliders(builtLine(trip({})), "bin");
    expect(slider).toMatchObject({
      label: "above set point", min: 0, max: 100, value: 80, unit: "%",
      bind: "interlockPartSetpoint", target: { interlock: "binHigh", part: "when" },
    });
  });

  it("gives a condition with no % no slider", () => {
    const line = builtLine({
      id: "feederStopped", kind: "sentence", when: { machine: "feeder", condition: "stopped", delaySec: 1 },
      then: [{ action: "stop", machine: "grainIn" }], reset: "auto",
    });
    expect(setpointSliders(line, "feeder")).toEqual([]);
  });
});

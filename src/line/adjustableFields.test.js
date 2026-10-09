// Issue #77: the fields a user may change in Build mode, and the line
// document functions that change them. Values go in and come out in plant
// units (t/h, m³, %, s, kg); the line holds engine units.
import { describe, it, expect } from "vitest";
import { adjustableFields, readAdjustableValue } from "./adjustableFields";
import { setAdjustableValue, differsFromDefault } from "./lineDocument";
import { validateLine } from "./validateLine";
import { goldenLine } from "./goldenLine";
import { createSim, getMachineState, stepSim, DT } from "../sim/engine";
import { tPerHourToM3PerSec, BULK_DENSITY_T_PER_M3 } from "../sim/units";

// The table approved on issue #77: [machine, field, unit, min, max, default].
const APPROVED = [
  ["upstreamStub", "rate", "t/h", 0, 20, 15],
  ["proBoxStation", "rate", "t/h", 0, 20, 12],
  ["vibratingConveyor", "rate", "t/h", 0, 20, 10],
  ["treaterBufferBin", "highSetpoint", "%", 35, 90, 85],
  ["treaterBufferBin", "lowSetpoint", "%", 0, 55, 35],
  ["treaterBufferBin", "highHighSetpoint", "%", 55, 100, 95],
  ["treaterBufferBin", "signalDelay", "s", 0, 15, 7],
  ["treaterPreBin", "lowSetpoint", "%", 0, 55, 35],
  ["treaterPreBin", "highSetpoint", "%", 35, 90, 85],
  ["treaterPreBin", "highHighSetpoint", "%", 55, 100, 95],
  ["treaterAfterBin", "highSetpoint", "%", 30, 100, 60],
  ["treaterAfterBin", "lowSetpoint", "%", 0, 30, 20],
  ["treaterAfterBin", "signalDelay", "s", 0, 15, 5],
  ["flexiconPreBin", "highSetpoint", "%", 45, 100, 85],
  ["flexiconPreBin", "lowSetpoint", "%", 0, 45, 35],
  ["flexiconPreBin", "signalDelay", "s", 0, 15, 5],
  ["concettiPreBin", "lowSetpoint", "%", 0, 55, 35],
  ["concettiPreBin", "highSetpoint", "%", 35, 90, 85],
  ["concettiPreBin", "highHighSetpoint", "%", 55, 100, 95],
  ["batchTreater", "batchSize", "kg", 40, 300, 160],
  ["batchTreater", "cycleTime", "s", 10, 90, 48],
  ["flexiconFillingHead", "batchSize", "kg", 500, 1500, 1000],
  ["flexiconFillingHead", "cycleTime", "s", 15, 120, 45],
  ["concettiScale", "batchSize", "kg", 10, 100, 50],
  ["concettiScale", "cycleTime", "s", 5, 60, 15],
  ["scalpingScreen", "wasteFrac", "%", 0, 20, 1],
  ["treaterBufferBin", "capacity", "m³", 2, 20, 7.7],
  ["treaterPreBin", "capacity", "m³", 0.5, 5, 1.63],
  ["treaterAfterBin", "capacity", "m³", 0.2, 2, 0.67],
  ["scalpingDischargeHopper", "capacity", "m³", 0.05, 0.6, 0.2],
  ["outloadBufferBin", "capacity", "m³", 1, 15, 4.51],
  ["metalBin1", "capacity", "m³", 1.5, 18, 6],
  ["metalBin2", "capacity", "m³", 1.5, 18, 6],
  ["flexiconPreBin", "capacity", "m³", 0.6, 8, 2.5],
  ["concettiPreBin", "capacity", "m³", 0.2, 2, 0.72],
  ["treatingElevator", "ratedCapacity", "t/h", 5, 40, 20],
  ["treatingElevator", "chainSpeed", "m/min", 2, 30, 10.08],
  ["pendulumConveyor", "ratedCapacity", "t/h", 5, 40, 20.84],
  ["pendulumConveyor", "chainSpeed", "m/min", 2, 30, 10.08],
  ["afterBinOutletValve", "ratedCapacity", "t/h", 5, 40, 19.2],
  ["scalpingScreen", "ratedCapacity", "t/h", 10, 100, 64.4],
];

function machine(line, id) {
  return line.machines.find((m) => m.id === id);
}

function set(line, machineId, fieldId, value) {
  const result = setAdjustableValue(line, machineId, fieldId, value);
  expect(result.ok, result.error).toBe(true);
  return result.line;
}

describe("golden line declarations", () => {
  it("declares exactly the approved fields", () => {
    const declared = goldenLine.machines.flatMap((m) =>
      adjustableFields(m).map((f) => [m.id, f.id, f.unit, f.min, f.max, f.default]));
    const key = (row) => `${row[0]}.${row[1]}`;
    expect(declared.map(key).sort()).toEqual(APPROVED.map(key).sort());
    for (const row of APPROVED) {
      expect(declared.find((d) => key(d) === key(row))).toEqual(row);
    }
  });

  it("every field is a number field with a label", () => {
    for (const m of goldenLine.machines) {
      for (const f of adjustableFields(m)) {
        expect(f.kind).toBe("number");
        expect(f.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("every default is the value the golden line holds today", () => {
    for (const [machineId, fieldId, , , , value] of APPROVED) {
      expect(readAdjustableValue(goldenLine, machineId, fieldId), `${machineId}.${fieldId}`).toBeCloseTo(value, 9);
      expect(differsFromDefault(goldenLine, machineId, fieldId), `${machineId}.${fieldId}`).toBe(false);
    }
  });
});

describe("setAdjustableValue", () => {
  it("refuses a value outside the field's limits", () => {
    for (const value of [1.9, 20.1]) {
      const result = setAdjustableValue(goldenLine, "treaterBufferBin", "capacity", value);
      expect(result.ok).toBe(false);
      expect(result.line).toBeUndefined();
      expect(result.error).toMatch(/2.*20/);
    }
  });

  it("accepts the limits themselves", () => {
    expect(setAdjustableValue(goldenLine, "treaterBufferBin", "capacity", 2).ok).toBe(true);
    expect(setAdjustableValue(goldenLine, "treaterBufferBin", "capacity", 20).ok).toBe(true);
  });

  it("refuses a value that is not a finite number", () => {
    for (const value of [NaN, Infinity, "5", null]) {
      expect(setAdjustableValue(goldenLine, "treaterBufferBin", "capacity", value).ok).toBe(false);
    }
  });

  it("refuses a field the machine does not declare", () => {
    // The fill level slider is a live jump, not a design value.
    expect(setAdjustableValue(goldenLine, "treaterBufferBin", "level", 50).ok).toBe(false);
    // Values tied to the drawing are not adjustable.
    expect(setAdjustableValue(goldenLine, "pendulumConveyor", "distanceM", 10).ok).toBe(false);
    expect(setAdjustableValue(goldenLine, "nonexistentMachine", "capacity", 5).ok).toBe(false);
  });

  it("refuses any change to a machine's behaviour kind", () => {
    for (const fieldId of ["kind", "sim.kind"]) {
      const result = setAdjustableValue(goldenLine, "treaterBufferBin", fieldId, "transportDelay");
      expect(result.ok).toBe(false);
    }
  });

  it("never changes the line it was given", () => {
    const before = JSON.stringify(goldenLine);
    set(goldenLine, "treaterBufferBin", "capacity", 5);
    set(goldenLine, "concettiPreBin", "highSetpoint", 80);
    set(goldenLine, "flexiconFillingHead", "batchSize", 1200);
    setAdjustableValue(goldenLine, "treaterBufferBin", "capacity", 99);
    expect(JSON.stringify(goldenLine)).toBe(before);
  });

  it("returns a line that still validates", () => {
    const edited = set(set(goldenLine, "treaterBufferBin", "capacity", 5), "upstreamStub", "rate", 10);
    expect(validateLine(edited).errors).toEqual([]);
  });
});

describe("plant units in, engine units in the line", () => {
  it("converts a rate in t/h to m³/s and moves the slider default with it", () => {
    const edited = set(goldenLine, "upstreamStub", "rate", 10);
    const m = machine(edited, "upstreamStub");
    expect(m.sim.rateM3PerSec).toBeCloseTo(tPerHourToM3PerSec(10), 12);
    expect(m.params.find((p) => p.id === "rate").value).toBe(10);
    expect(readAdjustableValue(edited, "upstreamStub", "rate")).toBeCloseTo(10, 9);
  });

  it("stores a capacity in m³ as given", () => {
    const edited = set(goldenLine, "outloadBufferBin", "capacity", 3.5);
    expect(machine(edited, "outloadBufferBin").sim.capacityM3).toBe(3.5);
  });

  it("converts a batch size in kg to m³", () => {
    const edited = set(goldenLine, "batchTreater", "batchSize", 200);
    expect(machine(edited, "batchTreater").sim.chargeM3).toBeCloseTo(0.2 / BULK_DENSITY_T_PER_M3, 12);
  });

  it("converts a set point in % to a fraction on every rule that reads the bin", () => {
    // The Concetti pre-bin carries two rules with an LSH: the feed schedule
    // and the staged pause sequence. The live slider moves both.
    const edited = set(goldenLine, "concettiPreBin", "highSetpoint", 80);
    const rules = edited.interlocks.filter((r) => r.sensor.machine === "concettiPreBin" && r.highSetpoint !== undefined);
    expect(rules.length).toBe(2);
    for (const r of rules) expect(r.highSetpoint).toBeCloseTo(0.8, 12);
    expect(machine(edited, "concettiPreBin").params.find((p) => p.id === "highSetpoint").value).toBe(80);
  });

  it("converts a rated capacity in t/h and keeps a chain speed in m/min", () => {
    const edited = set(set(goldenLine, "treatingElevator", "ratedCapacity", 25), "treatingElevator", "chainSpeed", 12);
    const m = machine(edited, "treatingElevator");
    expect(m.sim.ceilingM3PerSec).toBeCloseTo(tPerHourToM3PerSec(25), 12);
    expect(m.sim.speedMPerMin).toBe(12);
  });

  it("stores a cycle time on the machine's one phase", () => {
    const edited = set(goldenLine, "concettiScale", "cycleTime", 20);
    expect(machine(edited, "concettiScale").sim.phases).toEqual([{ name: "fill", durationSec: 20 }]);
  });
});

describe("set points stay in order", () => {
  it("refuses an LSL at or above the LSH", () => {
    expect(setAdjustableValue(goldenLine, "treaterBufferBin", "lowSetpoint", 55).ok).toBe(true);
    const edited = set(goldenLine, "treaterBufferBin", "highSetpoint", 50);
    const result = setAdjustableValue(edited, "treaterBufferBin", "lowSetpoint", 50);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/LSL|order|below/i);
  });

  it("refuses an LSH at or above the LSHH", () => {
    // LSH starts at 85, so lowering LSHH to 80 alone is refused too.
    expect(setAdjustableValue(goldenLine, "treaterPreBin", "highHighSetpoint", 80).ok).toBe(false);
    const edited = set(set(goldenLine, "treaterPreBin", "highSetpoint", 70), "treaterPreBin", "highHighSetpoint", 80);
    expect(setAdjustableValue(edited, "treaterPreBin", "highSetpoint", 80).ok).toBe(false);
    expect(setAdjustableValue(edited, "treaterPreBin", "highSetpoint", 79).ok).toBe(true);
  });

  it("compares set points across every rule that reads the bin", () => {
    // Test line: the Concetti pre-bin's LSL stays on the feed schedule and
    // its LSH stays only on the pause sequence, so no one rule holds both.
    const line = structuredClone(goldenLine);
    delete line.interlocks.find((r) => r.id === "concettiFeedSchedule").highSetpoint;
    const lowered = set(line, "concettiPreBin", "lowSetpoint", 55);
    expect(setAdjustableValue(lowered, "concettiPreBin", "highSetpoint", 50).ok).toBe(false);
  });
});

describe("a bag size change updates the bag counter downstream", () => {
  it("moves the big bag counter with the Flexicon bag size", () => {
    const edited = set(goldenLine, "flexiconFillingHead", "batchSize", 1200);
    expect(machine(edited, "bigBagStub").sim.bagSizeM3).toBeCloseTo(1.2 / BULK_DENSITY_T_PER_M3, 12);
    expect(machine(edited, "palletStub").sim.bagSizeM3).toBe(machine(goldenLine, "palletStub").sim.bagSizeM3);
  });

  it("moves the pallet counter with the Concetti bag size", () => {
    const edited = set(goldenLine, "concettiScale", "batchSize", 25);
    expect(machine(edited, "palletStub").sim.bagSizeM3).toBeCloseTo(0.025 / BULK_DENSITY_T_PER_M3, 12);
  });

  it("touches no other machine when the batch treater's batch size changes", () => {
    const edited = set(goldenLine, "batchTreater", "batchSize", 200);
    for (const m of edited.machines) {
      if (m.id !== "batchTreater") expect(m).toEqual(machine(goldenLine, m.id));
    }
  });
});

describe("differsFromDefault", () => {
  it("is true after a change and false after setting the default back", () => {
    const changed = set(goldenLine, "upstreamStub", "rate", 11);
    expect(differsFromDefault(changed, "upstreamStub", "rate")).toBe(true);
    const restored = set(changed, "upstreamStub", "rate", 15);
    expect(differsFromDefault(restored, "upstreamStub", "rate")).toBe(false);
  });

  it("works the same for a capacity", () => {
    const changed = set(goldenLine, "treaterBufferBin", "capacity", 9);
    expect(differsFromDefault(changed, "treaterBufferBin", "capacity")).toBe(true);
    expect(differsFromDefault(changed, "treaterBufferBin", "highSetpoint")).toBe(false);
    expect(differsFromDefault(set(changed, "treaterBufferBin", "capacity", 7.7), "treaterBufferBin", "capacity")).toBe(false);
  });
});

describe("option fields", () => {
  // No golden line machine has an option it may safely switch (every gated
  // feeder is driven by a feed schedule), so this uses a test line.
  function lineWithGateOption() {
    const line = structuredClone(goldenLine);
    const m = machine(line, "vibratingConveyor");
    m.sim.hasGate = false;
    m.adjustable = [...(m.adjustable ?? []), {
      id: "gate", label: "inlet gate", unit: "", kind: "option", options: [true, false], default: false, bind: "hasGate",
    }];
    return line;
  }

  it("the test line validates", () => {
    expect(validateLine(lineWithGateOption()).errors).toEqual([]);
  });

  it("switches an option and refuses a value that is not one of its options", () => {
    const line = lineWithGateOption();
    const edited = set(line, "vibratingConveyor", "gate", true);
    expect(machine(edited, "vibratingConveyor").sim.hasGate).toBe(true);
    expect(differsFromDefault(edited, "vibratingConveyor", "gate")).toBe(true);
    expect(setAdjustableValue(line, "vibratingConveyor", "gate", "maybe").ok).toBe(false);
  });
});

describe("validateLine checks the declarations", () => {
  function withField(machineId, field) {
    const line = structuredClone(goldenLine);
    const m = machine(line, machineId);
    m.adjustable = [...(m.adjustable ?? []), field];
    return line;
  }

  it("refuses a field bound to nothing", () => {
    const line = withField("outloadBufferBin", { id: "x", label: "x", unit: "m³", kind: "number", min: 0, max: 1, default: 0, bind: "noSuchBind" });
    expect(validateLine(line).errors.some((e) => e.includes("noSuchBind"))).toBe(true);
  });

  it("refuses a default outside the field's limits", () => {
    const line = withField("outloadBufferBin", { id: "x", label: "x", unit: "m³", kind: "number", min: 5, max: 10, default: 4.51, bind: "capacity" });
    expect(validateLine(line).errors.some((e) => e.includes('"x"'))).toBe(true);
  });

  it("refuses a slider default that names no slider", () => {
    const line = withField("outloadBufferBin", { param: "noSuchParam", default: 1 });
    expect(validateLine(line).errors.some((e) => e.includes("noSuchParam"))).toBe(true);
  });

  it("refuses two fields with the same id", () => {
    const line = withField("outloadBufferBin", { id: "capacity", label: "c", unit: "m³", kind: "number", min: 1, max: 15, default: 4.51, bind: "capacity" });
    expect(validateLine(line).errors.some((e) => e.includes("capacity"))).toBe(true);
  });
});

describe("the engine builds the edited line", () => {
  it("a bin built from an edited line has the edited capacity", () => {
    const edited = set(goldenLine, "treaterBufferBin", "capacity", 4.2);
    const sim = createSim(edited);
    expect(getMachineState(sim, "treaterBufferBin").capacity).toBe(4.2);
    expect(getMachineState(createSim(goldenLine), "treaterBufferBin").capacity).toBe(7.7);
  });

  it("a source built from an edited line runs at the edited rate", () => {
    const edited = set(goldenLine, "upstreamStub", "rate", 6);
    const sim = createSim(edited);
    for (let i = 0; i < Math.round(30 / DT); i++) stepSim(sim, DT);
    const state = getMachineState(sim, "upstreamStub");
    expect(state.flowRateM3PerSec).toBeGreaterThan(0); // guard: the source really ran
    expect(state.nominalRate).toBeCloseTo(tPerHourToM3PerSec(6), 12);
  });
});

// The starting position of an outlet valve or a drum feeder gate, a Build
// mode field in %: where the valve starts in the sim and its normal position.
import { describe, it, expect } from "vitest";
import { adjustableFields, fieldLock, readAdjustableValue } from "./adjustableFields";
import { setAdjustableValue, addMachine, emptyLine } from "./lineDocument";
import { goldenLine } from "./goldenLine";
import { validateLine } from "./validateLine";
import { createSim, getMachineState } from "../sim/engine";

const field = (line, machineId) =>
  adjustableFields(line.machines.find((m) => m.id === machineId)).find((f) => f.id === "startPosition");

function added(itemId) {
  const result = addMachine(emptyLine(), itemId, { x: 0, y: 0 });
  expect(result.ok, result.error).toBe(true);
  return { line: result.line, id: result.line.machines[0].id };
}

describe("the starting position field", () => {
  it("is a whole % from 0 to 100 on the after-bin outlet valve, at 100 % today", () => {
    expect(field(goldenLine, "afterBinOutletValve")).toMatchObject({
      label: "starting position", unit: "%", min: 0, max: 100, default: 100, integer: true,
    });
    expect(readAdjustableValue(goldenLine, "afterBinOutletValve", "startPosition")).toBe(100);
  });

  it("starts the valve at the position it is set to", () => {
    const result = setAdjustableValue(goldenLine, "afterBinOutletValve", "startPosition", 50);
    expect(result.ok, result.error).toBe(true);
    expect(validateLine(result.line)).toEqual({ ok: true, errors: [] });
    expect(getMachineState(createSim(result.line), "afterBinOutletValve").openness).toBe(0.5);
  });

  it("refuses part of a %", () => {
    expect(setAdjustableValue(goldenLine, "afterBinOutletValve", "startPosition", 50.5).ok).toBe(false);
  });

  it("is locked on a drum feeder a feed schedule drives, saying why", () => {
    for (const id of ["treatDrumFeeder", "inletDrumFeeder1", "inletDrumFeeder2"]) {
      expect(field(goldenLine, id), id).toBeDefined();
      expect(fieldLock(goldenLine, id, "startPosition")).toBe("Set by the feed schedule.");
      expect(setAdjustableValue(goldenLine, id, "startPosition", 50)).toEqual({ ok: false, error: "Set by the feed schedule." });
    }
    expect(fieldLock(goldenLine, "afterBinOutletValve", "startPosition")).toBeNull();
  });

  it("comes with an outlet valve or a drum feeder added from the catalogue, unlocked", () => {
    for (const itemId of ["outlet-valve", "drum-feeder", "custom-outlet-valve", "custom-drum-feeder"]) {
      const { line, id } = added(itemId);
      expect(fieldLock(line, id, "startPosition"), itemId).toBeNull();
      const result = setAdjustableValue(line, id, "startPosition", 0);
      expect(result.ok, result.error).toBe(true);
      expect(readAdjustableValue(result.line, id, "startPosition")).toBe(0);
    }
  });

  it("gives an added outlet valve a position slider in the sim", () => {
    const { line, id } = added("outlet-valve");
    expect(line.machines.find((m) => m.id === id).params).toEqual([
      expect.objectContaining({ id: "valvePosition", bind: "valvePosition", readBind: "valvePositionActual", unit: "%" }),
    ]);
  });
});

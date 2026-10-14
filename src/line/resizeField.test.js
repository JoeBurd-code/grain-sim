// Issue #90: a conveyor's length or an elevator's height. One field drives
// both the drawn size and the sim's transit distance, so a test that reads
// only one of them and not the other would miss a regression that decouples
// them.
import { describe, it, expect } from "vitest";
import { setAdjustableValue, readAdjustableValue } from "./adjustableFields";
import { goldenLine } from "./goldenLine";
import { createSim, getMachineState } from "../sim/engine";

const byId = (line, id) => line.machines.find((m) => m.id === id);

function set(line, machineId, fieldId, value) {
  const result = setAdjustableValue(line, machineId, fieldId, value);
  expect(result.ok, result.error).toBe(true);
  return result.line;
}

describe("resize fields (length, height)", () => {
  it("scales the elevator's drawn height and its sim.distanceM by the same ratio", () => {
    const before = byId(goldenLine, "treatingElevator");
    const h0 = before.h;
    const d0 = before.sim.distanceM;
    const next = set(goldenLine, "treatingElevator", "height", 10);
    const after = byId(next, "treatingElevator");
    const ratio = 10 / d0;
    expect(after.sim.distanceM).toBeCloseTo(10, 9);
    expect(after.h / h0).toBeCloseTo(ratio, 9);
    expect(after.h / after.sim.distanceM).toBeCloseTo(h0 / d0, 9);
  });

  // Issue #90's own words: a port moves "with the machine's end", not
  // stretched proportionally from the origin. The boot (`in`, near the
  // bottom) is the end that moves as the column grows taller, and stays
  // exactly `duct` above the floor it sits on; the head discharge (`out`,
  // near the top) does not drift down with it — lineData.js's own comment
  // on treatingElevator explains why.
  it("moves only the elevator's far (boot) port when it grows taller, and keeps the near (head) port fixed", () => {
    const before = byId(goldenLine, "treatingElevator");
    const outY0 = before.anchors.out.y;
    const duct = before.geom.duct;
    const next = set(goldenLine, "treatingElevator", "height", 10);
    const after = byId(next, "treatingElevator");
    expect(after.anchors.out.y).toBe(outY0);
    expect(after.anchors.in.y).toBeCloseTo(after.h - duct, 9);
  });

  it("scales the conveyor's width, its sim.distanceM and every portDistanceM by the same ratio", () => {
    const before = byId(goldenLine, "pendulumConveyor");
    const w0 = before.w;
    const d0 = before.sim.distanceM;
    const portD0 = { ...before.sim.portDistanceM };
    const ratio = 40 / d0;

    const next = set(goldenLine, "pendulumConveyor", "length", 40);
    const after = byId(next, "pendulumConveyor");

    expect(after.sim.distanceM).toBeCloseTo(40, 9);
    expect(after.w / w0).toBeCloseTo(ratio, 9);
    for (const key of Object.keys(portD0)) {
      expect(after.sim.portDistanceM[key] / portD0[key]).toBeCloseTo(ratio, 9);
    }
  });

  // Same "moves with the machine's end" rule as the elevator: the climb
  // column and the infeed anchors sit on the conveyor's near (infeed) side
  // and stay put; only the far (discharge) side's own anchors move, by the
  // same pixel amount the belt grew by.
  it("moves only the conveyor's far (discharge) anchors when it grows longer, and keeps the near (infeed) side fixed", () => {
    const before = byId(goldenLine, "pendulumConveyor");
    const colX0 = before.geom.colX;
    const in1X0 = before.anchors.in1.x;
    const outConcettiX0 = before.anchors.outConcetti.x;
    const w0 = before.w;

    const next = set(goldenLine, "pendulumConveyor", "length", 40);
    const after = byId(next, "pendulumConveyor");
    const delta = after.w - w0;

    expect(after.geom.colX).toBe(colX0);
    expect(after.anchors.in1.x).toBe(in1X0);
    expect(after.anchors.outConcetti.x).toBeCloseTo(outConcettiX0 + delta, 9);
  });

  it("reads back through readAdjustableValue in metres, matching sim.distanceM", () => {
    const next = set(goldenLine, "treatingElevator", "height", 10);
    expect(readAdjustableValue(next, "treatingElevator", "height")).toBeCloseTo(10, 9);
    expect(byId(next, "treatingElevator").sim.distanceM).toBeCloseTo(10, 9);
  });

  it("refuses a resize that would make the machine overlap another", () => {
    // The elevator sits directly under the drum feeder that fills it
    // (lineData.js's own comment on treatingElevator's height); growing it
    // enough (still well inside the field's own 4-20 m limits) closes that
    // gap and must be refused, not silently resized.
    const result = setAdjustableValue(goldenLine, "treatingElevator", "height", 19);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/overlap/);
  });

  it("drops a connection's via/coupling on resize, the same as a move", () => {
    const withBend = {
      ...goldenLine,
      connections: goldenLine.connections.map((c) => (
        c.from.machine === "treatingElevator" ? { ...c, via: [{ x: 1, y: 1 }], coupling: true } : c
      )),
    };
    const touching = withBend.connections.find((c) => c.from.machine === "treatingElevator");
    expect(touching.via).toBeDefined();
    const next = set(withBend, "treatingElevator", "height", 9);
    const after = next.connections.find((c) => c.from.machine === "treatingElevator");
    expect(after.via).toBeUndefined();
    expect(after.coupling).toBeUndefined();
  });

  it("a taller elevator carries grain for proportionally longer (acceptance criterion)", () => {
    const tall = set(goldenLine, "treatingElevator", "height", 10);

    // engine.js's own initTransportDelay copies distanceM/speedMPerMin onto
    // the live machine state untouched; transit time is distance over
    // chain speed, the same arithmetic applyTransportDelay (behaviors.js)
    // uses tick by tick to advance a packet's own progress.
    const transitSeconds = (line) => {
      const sim = createSim(line);
      const state = getMachineState(sim, "treatingElevator");
      return state.distanceM / (state.speedMPerMin / 60);
    };

    const shortTransit = transitSeconds(goldenLine);
    const tallTransit = transitSeconds(tall);
    const ratio = 10 / byId(goldenLine, "treatingElevator").sim.distanceM;
    expect(tallTransit / shortTransit).toBeCloseTo(ratio, 9);
  });
});

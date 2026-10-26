// Issue #90: a conveyor's length, and (issue #156) a bucket elevator's path
// length. One field drives both the drawn size and the sim's transit
// distance, so a test that reads only one of them and not the other would
// miss a regression that decouples them. The elevator's own segment rules
// are in elevatorPath.test.js.
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

describe("conveyor length", () => {
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

  // A port moves "with the machine's end": the climb column and the infeed
  // anchors sit on the conveyor's near (infeed) side and stay put; only the
  // far (discharge) side's own anchors move, by the same pixel amount the
  // belt grew by.
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
});

describe("a resize that settles the machine (issue #154)", () => {
  it("refuses an overlapping resize when no free spot is in range, leaving the line unchanged", () => {
    // Four thick walls fence the elevator in at exactly its current box, so
    // any taller elevator overlaps a wall wherever the search tries it.
    const m = byId(goldenLine, "treatingElevator");
    const wall = (id, x, y, w, h) => ({ id, name: id, x, y, w, h, anchors: {} });
    const T = 5000;
    const fenced = {
      ...goldenLine,
      machines: [
        m,
        wall("wallTop", m.x - T, m.y - T, m.w + 2 * T, T),
        wall("wallBottom", m.x - T, m.y + m.h, m.w + 2 * T, T),
        wall("wallLeft", m.x - T, m.y, T, m.h),
        wall("wallRight", m.x + m.w, m.y, T, m.h),
      ],
      connections: [],
    };
    const snapshot = structuredClone(fenced);
    const result = setAdjustableValue(fenced, "treatingElevator", "pathLength", 12);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no free place/);
    expect(fenced).toEqual(snapshot);
  });

  it("drops a resized machine's connections' via/coupling, the same as a move", () => {
    const withBend = {
      ...goldenLine,
      connections: goldenLine.connections.map((c) => (
        c.from.machine === "treatingElevator" || c.to.machine === "treatingElevator"
          ? { ...c, via: [{ x: 1, y: 1 }], coupling: true }
          : c
      )),
    };
    const next = set(withBend, "treatingElevator", "pathLength", 12);
    const touching = next.connections.filter((c) => c.from.machine === "treatingElevator" || c.to.machine === "treatingElevator");
    expect(touching.length).toBe(2);
    for (const c of touching) {
      expect(c.via).toBeUndefined();
      expect(c.coupling).toBeUndefined();
    }
  });
});

describe("elevator path length", () => {
  it("reads back through readAdjustableValue in metres, matching sim.distanceM", () => {
    const next = set(goldenLine, "treatingElevator", "pathLength", 10);
    expect(readAdjustableValue(next, "treatingElevator", "pathLength")).toBeCloseTo(10, 9);
    expect(byId(next, "treatingElevator").sim.distanceM).toBeCloseTo(10, 9);
  });

  it("a longer path carries grain for proportionally longer", () => {
    const long = set(goldenLine, "treatingElevator", "pathLength", 10);

    // engine.js's own initTransportDelay copies distanceM/speedMPerMin onto
    // the live machine state untouched; transit time is distance over
    // chain speed, the same arithmetic applyTransportDelay (behaviors.js)
    // uses tick by tick to advance a packet's own progress.
    const transitSeconds = (line) => {
      const sim = createSim(line);
      const state = getMachineState(sim, "treatingElevator");
      return state.distanceM / (state.speedMPerMin / 60);
    };

    const ratio = 10 / byId(goldenLine, "treatingElevator").sim.distanceM;
    expect(transitSeconds(long) / transitSeconds(goldenLine)).toBeCloseTo(ratio, 9);
  });
});

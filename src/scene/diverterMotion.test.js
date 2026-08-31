import { describe, it, expect } from "vitest";
import { diverterFlapperPoint, diverterSwingPoint, DIVERTER_SWING_SEC } from "./diverterMotion";

describe("diverterFlapperPoint", () => {
  it("points out1 at the diamond's left vertex and out2 at the right, per lineData.js's own anchors (issue #44)", () => {
    const out1 = diverterFlapperPoint("out1");
    const out2 = diverterFlapperPoint("out2");
    expect(out1.y).toBeCloseTo(16, 6);
    expect(out2.y).toBeCloseTo(16, 6);
    expect(out1.x).toBeLessThan(16);
    expect(out2.x).toBeGreaterThan(16);
  });

  it("falls back to out1 for an unrecognized port", () => {
    expect(diverterFlapperPoint("outWhatever")).toEqual(diverterFlapperPoint("out1"));
  });
});

describe("diverterSwingPoint", () => {
  it("stays at `from` the instant the target changes (phase == changePhase)", () => {
    const from = diverterFlapperPoint("out1");
    const p = diverterSwingPoint(from, "out2", 10, 10);
    expect(p).toEqual(from);
  });

  it("reaches the target vertex exactly once the swing duration has elapsed", () => {
    const from = diverterFlapperPoint("out1");
    const p = diverterSwingPoint(from, "out2", 10 + DIVERTER_SWING_SEC, 10);
    const to = diverterFlapperPoint("out2");
    expect(p.x).toBeCloseTo(to.x, 6);
    expect(p.y).toBeCloseTo(to.y, 6);
  });

  it("stays pinned at the target past the swing duration, never overshooting", () => {
    const from = diverterFlapperPoint("out1");
    const to = diverterFlapperPoint("out2");
    const p = diverterSwingPoint(from, "out2", 10 + DIVERTER_SWING_SEC * 5, 10);
    expect(p).toEqual(to);
  });

  it("is partway between from and to mid-swing", () => {
    const from = diverterFlapperPoint("out1");
    const to = diverterFlapperPoint("out2");
    const p = diverterSwingPoint(from, "out2", 10 + DIVERTER_SWING_SEC / 2, 10);
    expect(p.x).toBeGreaterThan(from.x);
    expect(p.x).toBeLessThan(to.x);
  });
});

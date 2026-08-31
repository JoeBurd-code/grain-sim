import { describe, it, expect } from "vitest";
import {
  nextTreaterAnchor, treaterLit, TREATER_FAKE_DARK_SEC,
  vibratoryFlowing,
} from "./litState";

describe("nextTreaterAnchor", () => {
  it("latches the sim-time of the first-ever observed holding", () => {
    expect(nextTreaterAnchor("holding", null, 102.15)).toBe(102.15);
  });

  it("leaves an already-latched anchor alone on later holding observations", () => {
    expect(nextTreaterAnchor("holding", 102.15, 998)).toBe(102.15);
  });

  it("clears the anchor whenever charging is observed (boot or a RESET's re-prime)", () => {
    expect(nextTreaterAnchor("charging", 102.15, 998)).toBe(null);
  });

  it("stays null while charging with no anchor yet (ordinary boot ramp-up)", () => {
    expect(nextTreaterAnchor("charging", null, 40)).toBe(null);
  });

  it("leaves the anchor untouched through stopped/waiting so a resumed batch keeps its old phase", () => {
    expect(nextTreaterAnchor("stopped", 102.15, 500)).toBe(102.15);
    expect(nextTreaterAnchor("waiting", 102.15, 500)).toBe(102.15);
  });
});

describe("treaterLit", () => {
  it("is dark for stopped, waiting, and an undefined phase regardless of anchor", () => {
    for (const phase of ["stopped", "waiting", undefined]) {
      expect(treaterLit(phase, 48, 100, 200)).toBe(false);
    }
  });

  it("is dark before any batch has ever completed (no anchor yet)", () => {
    expect(treaterLit("charging", 48, null, 40)).toBe(false);
    expect(treaterLit("holding", 48, null, 40)).toBe(false);
  });

  it("is dark for the fake window right at the start of a period", () => {
    expect(treaterLit("holding", 48, 100, 100)).toBe(false); // sincePeriodStart = 0
    expect(treaterLit("holding", 48, 100, 100 + TREATER_FAKE_DARK_SEC - 0.5)).toBe(false);
  });

  it("lights up once the fake window has elapsed within a period", () => {
    expect(treaterLit("holding", 48, 100, 100 + TREATER_FAKE_DARK_SEC)).toBe(true);
    expect(treaterLit("holding", 48, 100, 145)).toBe(true);
  });

  it("goes dark again at the start of every subsequent period (wraps on cycleSec)", () => {
    expect(treaterLit("holding", 48, 100, 148)).toBe(false); // 100 + 48 = start of period 2
    expect(treaterLit("holding", 48, 100, 148 + TREATER_FAKE_DARK_SEC)).toBe(true);
    expect(treaterLit("holding", 48, 100, 100 + 2 * 48 + 1)).toBe(false); // start of period 3
  });

  it("treats a rare directly-observed charging tick mid-cycle the same as holding", () => {
    expect(treaterLit("charging", 48, 100, 145)).toBe(true);
  });

  it("stays lit rather than dividing by zero when cycleSec is missing or non-positive", () => {
    expect(treaterLit("holding", 0, 100, 145)).toBe(true);
    expect(treaterLit("holding", undefined, 100, 145)).toBe(true);
  });
});

describe("vibratoryFlowing", () => {
  it("is true for a genuine positive flow rate", () => {
    expect(vibratoryFlowing({ flowRateM3PerSec: 0.0023 })).toBe(true);
  });

  it("is false for exactly zero", () => {
    expect(vibratoryFlowing({ flowRateM3PerSec: 0 })).toBe(false);
  });

  it("is false when flowRateM3PerSec is undefined", () => {
    expect(vibratoryFlowing({ flowRateM3PerSec: undefined })).toBe(false);
  });

  it("is false when dynamic itself is undefined (machine not yet reached by the sim)", () => {
    expect(vibratoryFlowing(undefined)).toBe(false);
  });

  it("is false for floating-point residue below the flow threshold", () => {
    expect(vibratoryFlowing({ flowRateM3PerSec: 1e-9 })).toBe(false);
  });
});

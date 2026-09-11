import { describe, it, expect } from "vitest";
import {
  nextTreaterAnchor, treaterBatch,
  TREATER_CHARGE_FRACTION, TREATER_TREAT_FRACTION,
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

describe("treaterBatch", () => {
  const CYCLE = 48;
  // sim-time `t` seconds into the period that began at anchor 100
  const at = (t) => treaterBatch("holding", CYCLE, 100, 100 + t);

  it("draws an empty drum for every state that is not genuinely running", () => {
    for (const phase of ["stopped", "waiting", undefined, null]) {
      expect(treaterBatch(phase, CYCLE, 100, 200).fill).toBe(0);
    }
  });

  it("draws an empty drum until a real batch has completed at least once", () => {
    // True at boot and right after a RESTART: the whole chain primes from
    // empty, and the machine has genuinely not treated anything yet.
    expect(treaterBatch("charging", CYCLE, null, 40).fill).toBe(0);
    expect(treaterBatch("holding", CYCLE, null, 40).fill).toBe(0);
  });

  it("fills the drum through the charge window", () => {
    expect(at(0).fill).toBeCloseTo(0, 6);
    expect(at(CYCLE * TREATER_CHARGE_FRACTION * 0.5).fill).toBeCloseTo(0.5, 6);
    expect(at(CYCLE * TREATER_CHARGE_FRACTION * 0.999).fill).toBeCloseTo(1, 2);
  });

  it("holds a full drum through treatment, shifting toward the treated colour", () => {
    const early = at(CYCLE * (TREATER_CHARGE_FRACTION + 0.01));
    const late = at(CYCLE * (TREATER_TREAT_FRACTION - 0.01));
    expect(early.fill).toBe(1);
    expect(late.fill).toBe(1);
    expect(early.treat).toBeLessThan(0.1);
    expect(late.treat).toBeGreaterThan(0.9);
    expect(early.discharging).toBe(false);
  });

  it("empties the drum through the discharge window and flags the chute", () => {
    const start = at(CYCLE * TREATER_TREAT_FRACTION);
    const end = at(CYCLE * 0.999);
    expect(start.fill).toBeCloseTo(1, 6);
    expect(start.discharging).toBe(true);
    expect(end.fill).toBeLessThan(0.05);
    expect(end.discharging).toBe(true);
    expect(end.treat).toBe(1);
  });

  it("repeats on every subsequent period", () => {
    for (const period of [0, 1, 2, 7]) {
      const t = period * CYCLE;
      expect(at(t).fill).toBeCloseTo(0, 6);
      expect(at(t + CYCLE * 0.5).fill).toBe(1);
    }
  });

  it("phases off the anchor, not off zero", () => {
    // anchor 100, so t=100 is the start of a charge, not the middle of one
    expect(treaterBatch("holding", CYCLE, 100, 100).fill).toBeCloseTo(0, 6);
    expect(treaterBatch("holding", CYCLE, 0, 100).fill).not.toBeCloseTo(0, 6);
  });

  it("survives a `now` before the anchor rather than going negative", () => {
    const b = treaterBatch("holding", CYCLE, 100, 80);
    expect(b.fill).toBeGreaterThanOrEqual(0);
    expect(b.fill).toBeLessThanOrEqual(1);
  });

  it("holds a full drum when there is no known period, rather than dividing by zero", () => {
    expect(treaterBatch("holding", 0, 100, 145).fill).toBe(1);
    expect(treaterBatch("holding", undefined, 100, 145).fill).toBe(1);
  });

  it("never reports a fill outside 0..1 anywhere in the cycle", () => {
    let checked = 0;
    for (let t = 0; t < CYCLE * 3; t += 0.05) {
      const b = at(t);
      expect(b.fill).toBeGreaterThanOrEqual(0);
      expect(b.fill).toBeLessThanOrEqual(1);
      expect(b.treat).toBeGreaterThanOrEqual(0);
      expect(b.treat).toBeLessThanOrEqual(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(2000);   // the assertions above actually ran
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

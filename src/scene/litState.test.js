import { describe, it, expect } from "vitest";
import {
  treaterBatch,
  TREATER_CHARGE_FRACTION, TREATER_TREAT_FRACTION,
  vibratoryFlowing,
} from "./litState";

describe("treaterBatch", () => {
  const CYCLE = 48;
  const FULL = 1;
  // `at` = this far through the engine's own hold timer, drum holding a charge
  const at = (elapsed) => treaterBatch("holding", elapsed, CYCLE, FULL);

  it("draws an empty drum for every state that is not genuinely running", () => {
    for (const phase of ["stopped", "waiting", undefined, null]) {
      expect(treaterBatch(phase, 10, CYCLE, FULL).fill).toBe(0);
    }
  });

  it("draws an empty drum whenever the machine is holding nothing", () => {
    // True at boot and right after a RESTART: the chain primes from empty and
    // the machine has genuinely not been charged. `phase` alone cannot tell
    // that from mid-charge - both read "charging".
    for (const phase of ["charging", "holding", "discharging"]) {
      expect(treaterBatch(phase, 0, CYCLE, 0).fill).toBe(0);
      expect(treaterBatch(phase, 20, CYCLE, undefined).fill).toBe(0);
    }
  });

  it("starts filling exactly as the batch clock resets, which is when the pre-bin hands over", () => {
    expect(at(0).fill).toBeCloseTo(0, 6);
    expect(at(CYCLE * TREATER_CHARGE_FRACTION * 0.5).fill).toBeCloseTo(0.5, 6);
    expect(at(CYCLE * TREATER_CHARGE_FRACTION).fill).toBeCloseTo(1, 6);
  });

  it("finishes emptying exactly as the batch clock completes, which is when the after-bin receives", () => {
    expect(at(CYCLE).fill).toBeCloseTo(0, 6);
    expect(at(CYCLE * 0.999).fill).toBeLessThan(0.02);
    expect(at(CYCLE * TREATER_TREAT_FRACTION).fill).toBeCloseTo(1, 6);
    expect(at(CYCLE * TREATER_TREAT_FRACTION).discharging).toBe(true);
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

  it("tracks the engine's clock rather than a clock of its own", () => {
    // The whole point of the rework: the same elapsed reading always draws
    // the same charge, no matter what the sim's absolute time is or how many
    // batches have gone before.
    expect(at(12)).toEqual(at(12));
    expect(at(12).fill).not.toBeCloseTo(at(40).fill, 3);
  });

  it("clamps a clock that has run past the end rather than wrapping round", () => {
    // elapsedSec sits at or above cycleSec while a starved machine waits for
    // its next charge. That must read as an emptied drum, not as a fresh one.
    expect(at(CYCLE * 1.5).fill).toBeCloseTo(0, 6);
    expect(at(CYCLE * 20).fill).toBeCloseTo(0, 6);
  });

  it("survives a missing or negative clock rather than drawing nonsense", () => {
    expect(treaterBatch("holding", undefined, CYCLE, FULL).fill).toBeCloseTo(0, 6);
    expect(treaterBatch("holding", -5, CYCLE, FULL).fill).toBeCloseTo(0, 6);
  });

  it("holds a full drum when there is no known period, rather than dividing by zero", () => {
    expect(treaterBatch("holding", 10, 0, FULL).fill).toBe(1);
    expect(treaterBatch("holding", 10, undefined, FULL).fill).toBe(1);
  });

  it("never reports a fill outside 0..1 anywhere in the cycle", () => {
    let checked = 0;
    for (let t = -5; t < CYCLE * 2; t += 0.05) {
      const b = at(t);
      expect(b.fill).toBeGreaterThanOrEqual(0);
      expect(b.fill).toBeLessThanOrEqual(1);
      expect(b.treat).toBeGreaterThanOrEqual(0);
      expect(b.treat).toBeLessThanOrEqual(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(1800);   // the assertions above actually ran
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

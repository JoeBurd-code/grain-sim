import { describe, it, expect } from "vitest";
import {
  treaterMixing, nextTreaterLitState, INITIAL_TREATER_LIT_STATE, TREATER_MIN_DARK_SEC,
  vibratoryFlowing,
} from "./litState";

describe("treaterMixing", () => {
  it("is true only for holding", () => {
    expect(treaterMixing("holding")).toBe(true);
  });

  it("is false for charging, discharging, waiting, stopped, and undefined", () => {
    for (const phase of ["charging", "discharging", "waiting", "stopped", undefined]) {
      expect(treaterMixing(phase)).toBe(false);
    }
  });
});

describe("nextTreaterLitState", () => {
  it("lights up immediately on the very first mixing dwell (boot's offSince is -Infinity)", () => {
    const next = nextTreaterLitState(INITIAL_TREATER_LIT_STATE, true, 5);
    expect(next.lit).toBe(true);
  });

  it("stays dark while not mixing, without disturbing offSince once already off", () => {
    const off = { lit: false, offSince: 10, lastNow: 10 };
    const next = nextTreaterLitState(off, false, 12);
    expect(next).toEqual({ lit: false, offSince: 10, lastNow: 12 });
  });

  it("turns off the instant mixing ends, recording the current clock as offSince", () => {
    const lit = { lit: true, offSince: -Infinity, lastNow: 40 };
    const next = nextTreaterLitState(lit, false, 40.05);
    expect(next).toEqual({ lit: false, offSince: 40.05, lastNow: 40.05 });
  });

  it("withholds lighting back up until the minimum dark stretch has elapsed, even if mixing has resumed", () => {
    const off = { lit: false, offSince: 10, lastNow: 10 };
    const next = nextTreaterLitState(off, true, 10 + TREATER_MIN_DARK_SEC - 0.5);
    expect(next.lit).toBe(false);
    expect(next.offSince).toBe(10); // preserved, not reset by the retry
  });

  it("lights back up once the minimum dark stretch has elapsed", () => {
    const off = { lit: false, offSince: 10, lastNow: 10 };
    const next = nextTreaterLitState(off, true, 10 + TREATER_MIN_DARK_SEC + 0.5);
    expect(next.lit).toBe(true);
  });

  it("stays lit through a steady mixing dwell without touching offSince", () => {
    const lit = { lit: true, offSince: 5, lastNow: 20 };
    const next = nextTreaterLitState(lit, true, 20.05);
    expect(next).toEqual({ lit: true, offSince: 5, lastNow: 20.05 });
  });

  it("self-resets when the clock runs backward (a RESET / fresh sim)", () => {
    // stale state from a previous, longer-running session: still counting
    // down a dark window anchored to a clock value far ahead of the fresh
    // run's own timeline.
    const stale = { lit: false, offSince: 350, lastNow: 350 };
    const next = nextTreaterLitState(stale, true, 1);
    expect(next.lit).toBe(true); // lights immediately, not stuck dark until t=353
  });

  it("is idempotent under repeated application with the same inputs (safe under StrictMode double-invoke)", () => {
    const state = { lit: false, offSince: 10, lastNow: 10 };
    const once = nextTreaterLitState(state, true, 20);
    const twice = nextTreaterLitState(once, true, 20);
    expect(twice).toEqual(once);
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

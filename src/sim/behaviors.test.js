import { describe, it, expect } from "vitest";
import { BEHAVIORS, REGISTERED_KINDS } from "./behaviors";

describe("accumulator", () => {
  it("clamps inflow to remaining headroom and counts the excess as spill", () => {
    // Exercises the clamp directly: the real 3-machine chain never hits it
    // because the engine's reverse pass caps inflow at capacityAvailable
    // before apply() runs, but a future machine fed by more than one
    // upstream source could overshoot in a single tick.
    const state = { kind: "accumulator", capacity: 10, stored: 8, initialStored: 0, spill: 0 };
    const out = BEHAVIORS.accumulator.apply(state, 0.05, 5, 2); // cap says only 2 fits

    expect(out).toBe(0);
    expect(state.stored).toBe(10);
    expect(state.spill).toBe(3);
  });

  it("capacityAvailable reports remaining headroom, ignoring the downstream param", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 6 };
    expect(BEHAVIORS.accumulator.capacityAvailable(state)).toBe(4);
  });
});

describe("passThrough", () => {
  it("never holds volume and forwards exactly min(inflow, cap)", () => {
    const state = { kind: "passThrough", volume: 0 };
    expect(BEHAVIORS.passThrough.apply(state, 0.05, 5, 2)).toBe(2);
    expect(state.volume).toBe(0);
  });
});

describe("REGISTERED_KINDS", () => {
  it("lists exactly the behaviours with an entry in BEHAVIORS", () => {
    expect([...REGISTERED_KINDS].sort()).toEqual(Object.keys(BEHAVIORS).sort());
  });
});

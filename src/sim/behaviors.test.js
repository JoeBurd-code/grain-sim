import { describe, it, expect } from "vitest";
import { BEHAVIORS, REGISTERED_KINDS } from "./behaviors";

describe("source", () => {
  it("emits at its full nominal rate when fully open (openness defaults to 1)", () => {
    const state = BEHAVIORS.source.init({ sim: { rateM3PerSec: 10 } });
    const out = BEHAVIORS.source.apply(state, 0.05, 0, Infinity);
    expect(out).toBeCloseTo(0.5);
    expect(state.fed).toBeCloseTo(0.5);
  });

  it("command('close', rampTimeSec) slews openness to 0 over the ramp time, not instantly", () => {
    const state = BEHAVIORS.source.init({ sim: { rateM3PerSec: 10 } });
    BEHAVIORS.source.command(state, "close", 2); // 2s ramp -> 0.5/s slew
    BEHAVIORS.source.apply(state, 0.05, 0, Infinity);
    expect(state.openness).toBeCloseTo(1 - 0.5 * 0.05);
    expect(BEHAVIORS.source.isSettled(state)).toBe(false);

    for (let i = 0; i < 100; i++) BEHAVIORS.source.apply(state, 0.05, 0, Infinity);
    expect(state.openness).toBe(0);
    expect(BEHAVIORS.source.isSettled(state)).toBe(true);
  });

  it("output rate is nominalRate scaled by the current openness while ramping", () => {
    const state = BEHAVIORS.source.init({ sim: { rateM3PerSec: 10 } });
    BEHAVIORS.source.command(state, "close", 2);
    for (let i = 0; i < 20; i++) BEHAVIORS.source.apply(state, 0.05, 0, Infinity); // 1s elapsed, openness 0.5
    expect(state.openness).toBeCloseTo(0.5);
    const out = BEHAVIORS.source.apply(state, 0.05, 0, Infinity);
    expect(out).toBeCloseTo(10 * 0.475 * 0.05, 4); // openness has slewed a bit further this tick too
  });

  it("grain released while ramping is still counted as fed (conservation holds through a ramp)", () => {
    const state = BEHAVIORS.source.init({ sim: { rateM3PerSec: 10 } });
    BEHAVIORS.source.command(state, "close", 2);
    let totalOut = 0;
    for (let i = 0; i < 40; i++) totalOut += BEHAVIORS.source.apply(state, 0.05, 0, Infinity);
    expect(state.fed).toBeCloseTo(totalOut);
    expect(totalOut).toBeGreaterThan(0); // material kept arriving after the close command
  });

  it("command('open', rampTimeSec) slews openness back to 1", () => {
    const state = BEHAVIORS.source.init({ sim: { rateM3PerSec: 10 } });
    BEHAVIORS.source.command(state, "close", 1);
    for (let i = 0; i < 100; i++) BEHAVIORS.source.apply(state, 0.05, 0, Infinity);
    expect(state.openness).toBe(0);

    BEHAVIORS.source.command(state, "open", 1);
    expect(BEHAVIORS.source.isSettled(state)).toBe(false);
    for (let i = 0; i < 100; i++) BEHAVIORS.source.apply(state, 0.05, 0, Infinity);
    expect(state.openness).toBe(1);
    expect(BEHAVIORS.source.isSettled(state)).toBe(true);
  });

  it("cap still bounds output while ramped open", () => {
    const state = BEHAVIORS.source.init({ sim: { rateM3PerSec: 10 } });
    const out = BEHAVIORS.source.apply(state, 0.05, 0, 0.1); // cap tighter than 10*0.05=0.5
    expect(out).toBe(0.1);
  });
});

describe("accumulator", () => {
  it("clamps inflow to remaining headroom and counts the excess as spill", () => {
    // Exercises the clamp directly: the real 3-machine chain never hits it
    // because the engine's reverse pass caps inflow at capacityAvailable
    // before apply() runs, but a future machine fed by more than one
    // upstream source could overshoot in a single tick.
    const state = { kind: "accumulator", capacity: 10, stored: 8, initialStored: 0, spill: 0 };
    const out = BEHAVIORS.accumulator.apply(state, 0.05, 5, 2); // cap says only 2 fits, no downstream given

    expect(out).toBe(0);
    expect(state.stored).toBe(10);
    expect(state.spill).toBe(3);
  });

  it("capacityAvailable reports remaining headroom, ignoring the downstream param", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 6 };
    expect(BEHAVIORS.accumulator.capacityAvailable(state)).toBe(4);
  });

  it("discharges up to whatever the downstream can accept this tick, bounded by what's stored (issue #20)", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 3, initialStored: 0, spill: 0 };
    const out = BEHAVIORS.accumulator.apply(state, 0.05, 0, 10, 2); // downstreamCap = 2

    expect(out).toBe(2);
    expect(state.stored).toBe(1);
    expect(state.discharged).toBe(2);
  });

  it("never discharges more than it holds, even when downstream would accept more", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 1.5, initialStored: 0, spill: 0 };
    const out = BEHAVIORS.accumulator.apply(state, 0.05, 0, 10, 5); // downstream could take 5, only 1.5 stored

    expect(out).toBe(1.5);
    expect(state.stored).toBe(0);
  });

  it("fills and discharges in the same tick without double counting", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 5, initialStored: 0, spill: 0 };
    const out = BEHAVIORS.accumulator.apply(state, 0.05, 2, 10, 3); // +2 in, -3 out

    expect(out).toBe(3);
    expect(state.stored).toBe(4); // 5 + 2 - 3
  });

  it("with no downstream capacity given, discharges nothing (default behaviour unchanged from issue #18)", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 5, initialStored: 0, spill: 0 };
    const out = BEHAVIORS.accumulator.apply(state, 0.05, 0, 10);

    expect(out).toBe(0);
    expect(state.stored).toBe(5);
  });
});

describe("meteredFeeder (issue #20)", () => {
  it("draws at its configured rate, bounded by the tick's time step", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
    const wantsToDraw = BEHAVIORS.meteredFeeder.capacityAvailable(state, 0.05, Infinity);
    expect(wantsToDraw).toBeCloseTo(0.5); // 10 m3/s * 0.05s
  });

  it("draw demand is also bounded by whatever its own downstream can accept", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
    expect(BEHAVIORS.meteredFeeder.capacityAvailable(state, 0.05, 0.1)).toBe(0.1);
  });

  it("forwards exactly what it receives and holds no volume of its own", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
    const out = BEHAVIORS.meteredFeeder.apply(state, 0.05, 0.3, 0.5);
    expect(out).toBe(0.3);
    expect(state.drawn).toBeCloseTo(0.3);
  });

  it("draws nothing when nothing is fed to it (e.g. the upstream bin is empty)", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
    const out = BEHAVIORS.meteredFeeder.apply(state, 0.05, 0, 0.5);
    expect(out).toBe(0);
    expect(state.drawn).toBe(0);
  });

  it("reports its cumulative draw as delivered, for the conservation identity", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
    BEHAVIORS.meteredFeeder.apply(state, 0.05, 0.3, 0.5);
    expect(BEHAVIORS.meteredFeeder.conserve(state)).toEqual({ delivered: 0.3 });
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

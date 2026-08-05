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

describe("transportDelay (issue #21)", () => {
  // Default fixture: distance 10m at 60 m/min = 1 m/s -> 10s transit at full speed.
  function initState({ distanceM = 10, speedMPerMin = 60, ceilingM3PerSec = 1 } = {}) {
    return BEHAVIORS.transportDelay.init({ sim: { distanceM, speedMPerMin, ceilingM3PerSec } });
  }

  it("accepts material up to the throughput ceiling", () => {
    const state = initState({ ceilingM3PerSec: 2 });
    const cap = BEHAVIORS.transportDelay.capacityAvailable(state, 0.05);
    expect(cap).toBeCloseTo(0.1); // 2 m3/s * 0.05s
  });

  it("nothing discharges before the derived transit time elapses", () => {
    const state = initState();
    let totalOut = 0;
    for (let i = 0; i < 100; i++) { // 5s < 10s transit
      const cap = BEHAVIORS.transportDelay.capacityAvailable(state, 0.05);
      totalOut += BEHAVIORS.transportDelay.apply(state, 0.05, 1, cap);
    }
    expect(totalOut).toBe(0);
    expect(state.queue.reduce((a, p) => a + p.vol, 0)).toBeGreaterThan(0); // material is in flight
  });

  it("material arrives at the discharge once the derived transit time elapses", () => {
    const state = initState(); // 10s transit
    let totalOut = 0;
    for (let i = 0; i < 400; i++) { // 20s, well past transit
      const cap = BEHAVIORS.transportDelay.capacityAvailable(state, 0.05);
      totalOut += BEHAVIORS.transportDelay.apply(state, 0.05, 1, cap);
    }
    expect(totalOut).toBeGreaterThan(0);
  });

  it("material already in transit keeps discharging after infeed stops", () => {
    const state = initState(); // 10s transit
    for (let i = 0; i < 100; i++) { // 5s of feed
      const cap = BEHAVIORS.transportDelay.capacityAvailable(state, 0.05);
      BEHAVIORS.transportDelay.apply(state, 0.05, 1, cap);
    }
    expect(state.queue.length).toBeGreaterThan(0);

    let totalOut = 0;
    for (let i = 0; i < 400; i++) { // feed stops (inflow 0), but the chain keeps moving
      const cap = BEHAVIORS.transportDelay.capacityAvailable(state, 0.05);
      totalOut += BEHAVIORS.transportDelay.apply(state, 0.05, 0, cap);
    }
    expect(totalOut).toBeGreaterThan(0);
    expect(state.queue.length).toBe(0); // fully cleared
    expect(state.backlog).toBe(0);
  });

  it("live speed changes re-pace material already in transit, not just new infeed", () => {
    const fast = initState(); // 10s transit at full speed
    BEHAVIORS.transportDelay.apply(fast, 1, 1, 1); // feed 1 m3 at t=0, full speed
    let outAtHalfSpeed = 0;
    fast.speedFraction = 0.5; // halve the chain speed for everything already riding it
    for (let i = 0; i < 20; i++) { // 20s at half speed = 10m already covered at full + more
      outAtHalfSpeed += BEHAVIORS.transportDelay.apply(fast, 1, 0, 1);
    }
    expect(outAtHalfSpeed).toBeGreaterThan(0); // slower, but still arrives

    const stalled = initState();
    BEHAVIORS.transportDelay.apply(stalled, 1, 1, 1);
    stalled.speedFraction = 0; // chain stopped
    let outWhileStalled = 0;
    for (let i = 0; i < 50; i++) outWhileStalled += BEHAVIORS.transportDelay.apply(stalled, 1, 0, 1);
    expect(outWhileStalled).toBe(0); // nothing moves on a stopped chain
  });

  it("enforces its own throughput ceiling when draining a large backlog, even if downstream would accept more", () => {
    const state = initState({ distanceM: 1, speedMPerMin: 6000, ceilingM3PerSec: 0.5 }); // near-instant transit
    // Build up backlog while downstream is blocked (a large accepted batch,
    // simulated directly at the behaviour level; capacityAvailable itself
    // separately enforces the ceiling on the accept side).
    BEHAVIORS.transportDelay.apply(state, 1, 3, 3, 0, true);
    expect(state.backlog).toBeGreaterThan(0.5);

    // Downstream suddenly wide open; the elevator's own ceiling still caps
    // how much leaves in a single tick, not a downstream capacity number.
    const out = BEHAVIORS.transportDelay.apply(state, 1, 0, 1, 100, true);
    expect(out).toBeCloseTo(0.5); // ceilingM3PerSec * dt
    expect(state.backlog).toBeGreaterThan(0); // the rest waits for subsequent ticks
  });

  it("when connected downstream and blocked, backs up (backlog grows) instead of losing material", () => {
    const state = initState({ distanceM: 2, speedMPerMin: 60, ceilingM3PerSec: 1 }); // 1 m/s, 2s transit
    BEHAVIORS.transportDelay.apply(state, 1, 1, 1, 1, true); // tick 1: accept 1 m3, still mid-transit
    const out = BEHAVIORS.transportDelay.apply(state, 1, 0, 1, 0, true); // tick 2: transit completes, downstream refuses
    expect(out).toBe(0);
    expect(state.backlog).toBeCloseTo(1); // held, not discarded
  });

  it("a backed-up discharge blocks new infeed at the boot (capacityAvailable drops to 0)", () => {
    const state = initState({ distanceM: 2, speedMPerMin: 60, ceilingM3PerSec: 1 });
    BEHAVIORS.transportDelay.apply(state, 1, 1, 1, 1, true);
    BEHAVIORS.transportDelay.apply(state, 1, 0, 1, 0, true); // blocked downstream -> backlog builds
    expect(state.backlog).toBeGreaterThan(0);
    expect(BEHAVIORS.transportDelay.capacityAvailable(state, 1)).toBe(0);
  });

  it("holds no volume beyond what's genuinely in transit or backed up (conserve)", () => {
    const state = initState({ distanceM: 1, speedMPerMin: 60, ceilingM3PerSec: 1 });
    BEHAVIORS.transportDelay.apply(state, 0.3, 1, 1); // partway through transit
    const c = BEHAVIORS.transportDelay.conserve(state, false);
    expect(c.inTransit).toBeCloseTo(1);
    expect(c.delivered).toBe(0);
  });

  it("does not double-count delivered volume once a sim-enabled machine is downstream", () => {
    const state = initState({ distanceM: 1, speedMPerMin: 60, ceilingM3PerSec: 1 });
    BEHAVIORS.transportDelay.apply(state, 2, 1, 1, 1, true); // full transit + discharge, connected downstream
    const c = BEHAVIORS.transportDelay.conserve(state, true);
    expect(c.delivered).toBeUndefined(); // the downstream machine accounts for it instead
  });

  describe("interlock-commanded throttle (issue #22)", () => {
    it("command(target, rampTimeSec) slews the throttle toward target over the ramp time, not instantly", () => {
      const state = initState();
      BEHAVIORS.transportDelay.command(state, 0.5, 2); // 2s ramp from 1 to 0.5 -> 0.5/s slew
      BEHAVIORS.transportDelay.apply(state, 0.05, 0, 1);
      expect(state.throttleFraction).toBeCloseTo(1 - 0.5 * 0.05);
      expect(BEHAVIORS.transportDelay.isSettled(state)).toBe(false);

      for (let i = 0; i < 100; i++) BEHAVIORS.transportDelay.apply(state, 0.05, 0, 1);
      expect(state.throttleFraction).toBeCloseTo(0.5);
      expect(BEHAVIORS.transportDelay.isSettled(state)).toBe(true);
    });

    it("command(0, ...) ramps the chain to a full stop, freezing everything already queued", () => {
      const state = initState(); // 10s transit at full speed
      BEHAVIORS.transportDelay.apply(state, 1, 1, 1); // 1 m3 enters at t=0
      BEHAVIORS.transportDelay.command(state, 0, 1); // 1s ramp to stopped
      for (let i = 0; i < 20; i++) BEHAVIORS.transportDelay.apply(state, 0.05, 0, 1); // 1s: ramp completes
      expect(state.throttleFraction).toBe(0);

      const progressAtStop = state.queue[0].progress;
      for (let i = 0; i < 400; i++) BEHAVIORS.transportDelay.apply(state, 0.05, 0, 1); // 20s more, stopped
      expect(state.queue[0].progress).toBeCloseTo(progressAtStop); // frozen, not lost
      expect(state.backlog).toBe(0);
    });

    it("intake capacity scales with the throttle, independent of the manual speed dial", () => {
      const state = initState({ ceilingM3PerSec: 2 });
      BEHAVIORS.transportDelay.command(state, 0.5, 0); // instant (0s ramp -> infinite slew)
      BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity); // let the ramp settle this tick
      expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBeCloseTo(0.05); // half of 2*0.05

      BEHAVIORS.transportDelay.command(state, 0, 0);
      BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity);
      expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBe(0); // stopped: accepts nothing new
    });

    it("a throttled-down chain still delivers everything already queued once it recovers", () => {
      const state = initState({ distanceM: 1, speedMPerMin: 60, ceilingM3PerSec: 10 }); // 1s transit at full speed
      const fed = 10;
      BEHAVIORS.transportDelay.apply(state, 0.05, fed, fed); // one packet in (inflow == cap, so all of it is accepted)
      BEHAVIORS.transportDelay.command(state, 0, 0); // stop instantly
      for (let i = 0; i < 200; i++) BEHAVIORS.transportDelay.apply(state, 0.05, 0, 10); // 10s stopped: would have arrived otherwise
      expect(state.delivered).toBe(0);

      BEHAVIORS.transportDelay.command(state, 1, 0); // recover instantly
      let delivered = 0;
      for (let i = 0; i < 200; i++) delivered += BEHAVIORS.transportDelay.apply(state, 0.05, 0, 10);
      expect(delivered).toBeCloseTo(fed); // nothing lost across the stall
    });
  });
});

describe("REGISTERED_KINDS", () => {
  it("lists exactly the behaviours with an entry in BEHAVIORS", () => {
    expect([...REGISTERED_KINDS].sort()).toEqual(Object.keys(BEHAVIORS).sort());
  });
});

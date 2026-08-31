import { describe, it, expect } from "vitest";
import { BEHAVIORS, REGISTERED_KINDS, packetDensityProfile } from "./behaviors";

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

  it("atomicDischarge: withholds a partial discharge entirely rather than handing over what little it has", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 1.5, initialStored: 0, spill: 0, atomicDischarge: true };
    const out = BEHAVIORS.accumulator.apply(state, 0.05, 0, 10, 5); // downstream wants a full 5, only 1.5 stored

    expect(out).toBe(0);
    expect(state.stored).toBe(1.5); // held onto it instead of dribbling the 1.5 out
  });

  it("atomicDischarge: still discharges in full once it holds enough to satisfy the downstream's whole request", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 6, initialStored: 0, spill: 0, atomicDischarge: true };
    const out = BEHAVIORS.accumulator.apply(state, 0.05, 0, 10, 5);

    expect(out).toBe(5);
    expect(state.stored).toBe(1);
  });

  it("atomicDischarge defaults false, so a plain accumulator config keeps issue #18's dribble-what-you-have behaviour", () => {
    const state = BEHAVIORS.accumulator.init({ sim: { capacityM3: 10 } });
    expect(state.atomicDischarge).toBe(false);
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

  it("clear (issue #55) discards whatever is stored, returning the discarded volume, leaving initialStored/spill/discharged untouched", () => {
    const state = { kind: "accumulator", capacity: 10, stored: 6, initialStored: 4, spill: 1.5, discharged: 3 };
    const discarded = BEHAVIORS.accumulator.clear(state);

    expect(discarded).toBe(6);
    expect(state.stored).toBe(0);
    expect(state.initialStored).toBe(4); // cumulative starting-inventory term, not a counter clearPlant touches
    expect(state.spill).toBe(1.5);
    expect(state.discharged).toBe(3);
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

  // Issue #46: the source selector's own gate — separate from `rate` so a
  // presenter's dial survives being deselected and reselected.
  it("defaults enabled, matching every feeder built before the selector existed", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
    expect(state.enabled).toBe(true);
  });

  it("honours an authored `enabled: false` at init, for a feeder that starts deselected", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, enabled: false } });
    expect(state.enabled).toBe(false);
  });

  it("accepts nothing while disabled, regardless of rate or downstream headroom", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
    BEHAVIORS.meteredFeeder.setEnabled(state, false);
    expect(BEHAVIORS.meteredFeeder.capacityAvailable(state, 0.05, Infinity)).toBe(0);
  });

  it("setEnabled leaves `rate` untouched, so re-enabling restores the presenter's own dial", () => {
    const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
    BEHAVIORS.meteredFeeder.setEnabled(state, false);
    expect(state.rate).toBe(10);
    BEHAVIORS.meteredFeeder.setEnabled(state, true);
    expect(state.rate).toBe(10);
    expect(BEHAVIORS.meteredFeeder.capacityAvailable(state, 0.05, Infinity)).toBeCloseTo(0.5);
  });

  // Issue #57: gate-position state, opt-in via `hasGate`, mirroring how
  // transportDelay's own speedFraction/throttleFraction are tested above
  // (issue #21/#22) — no engine.js, no lineData, direct state and BEHAVIORS
  // calls only.
  describe("gate-position state (issue #57)", () => {
    it("a feeder with no `hasGate` carries none of the gate fields, and its snapshot omits them", () => {
      const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
      expect(state.gateFraction).toBeUndefined();
      expect(state.gateThrottleFraction).toBeUndefined();
      expect(BEHAVIORS.meteredFeeder.snapshot(state)).toEqual({ rate: 10, enabled: true, runPermit: true });
    });

    it("`hasGate: true` starts both gateFraction (manual dial) and gateThrottleFraction (interlock layer) fully open", () => {
      const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      expect(state.gateFraction).toBe(1);
      expect(state.gateThrottleFraction).toBe(1);
    });

    it("gateFraction is a plain presenter dial: setting it directly takes effect instantly, with no ramp", () => {
      const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      state.gateFraction = 0.55; // presenter drags the Gate Position % slider
      expect(state.gateFraction).toBe(0.55);
      expect(state.gateThrottleFraction).toBe(1); // the interlock layer is untouched by the manual dial
    });

    it("commandGate(target, rampTimeSec) slews gateThrottleFraction toward target over the ramp time, not instantly", () => {
      const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      BEHAVIORS.meteredFeeder.commandGate(state, 0.5, 2); // 2s ramp -> 0.5/s slew
      BEHAVIORS.meteredFeeder.apply(state, 0.05, 0, Infinity);
      expect(state.gateThrottleFraction).toBeCloseTo(1 - 0.5 * 0.05);
      expect(BEHAVIORS.meteredFeeder.isSettledGate(state)).toBe(false);

      for (let i = 0; i < 100; i++) BEHAVIORS.meteredFeeder.apply(state, 0.05, 0, Infinity);
      expect(state.gateThrottleFraction).toBeCloseTo(0.5);
      expect(BEHAVIORS.meteredFeeder.isSettledGate(state)).toBe(true);
    });

    it("commandGate(0, 0) closes the gate instantly (0s ramp -> infinite slew)", () => {
      const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      BEHAVIORS.meteredFeeder.commandGate(state, 0, 0);
      BEHAVIORS.meteredFeeder.apply(state, 0.05, 0, Infinity);
      expect(state.gateThrottleFraction).toBe(0);
      expect(BEHAVIORS.meteredFeeder.isSettledGate(state)).toBe(true);
    });

    it("gateFraction (manual dial) and gateThrottleFraction (interlock layer) coexist without one overwriting the other", () => {
      const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      state.gateFraction = 0.55; // presenter's own dial
      BEHAVIORS.meteredFeeder.commandGate(state, 0.5, 0); // interlock throttles instantly
      BEHAVIORS.meteredFeeder.apply(state, 0.05, 0, Infinity);
      expect(state.gateFraction).toBe(0.55); // untouched by the interlock
      expect(state.gateThrottleFraction).toBe(0.5); // untouched by the manual dial
    });

    it("snapshot publishes both gate fields once hasGate is set", () => {
      const state = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      state.gateFraction = 0.55;
      BEHAVIORS.meteredFeeder.commandGate(state, 0.5, 0);
      BEHAVIORS.meteredFeeder.apply(state, 0.05, 0, Infinity);
      expect(BEHAVIORS.meteredFeeder.snapshot(state)).toEqual({
        rate: 10, enabled: true, runPermit: true, gateFraction: 0.55, gateDialTouched: false,
        gateThrottleFraction: 0.5, gateThrottleTarget: 0.5,
      });
    });

    it("does not affect draw/forward behaviour: apply still forwards min(inflow, cap) unchanged", () => {
      const gated = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      const ungated = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10 } });
      gated.gateFraction = 0.2; // even a nearly-closed gate dial changes nothing yet — issue #56's own job
      const gatedOut = BEHAVIORS.meteredFeeder.apply(gated, 0.05, 0.3, 0.5);
      const ungatedOut = BEHAVIORS.meteredFeeder.apply(ungated, 0.05, 0.3, 0.5);
      expect(gatedOut).toBe(ungatedOut);
      expect(gatedOut).toBe(0.3);
    });

    it("independent per-machine: two gated feeders never share state", () => {
      const feeder1 = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      const feeder2 = BEHAVIORS.meteredFeeder.init({ sim: { rateM3PerSec: 10, hasGate: true } });
      feeder1.gateFraction = 0.55;
      BEHAVIORS.meteredFeeder.commandGate(feeder1, 0.2, 0);
      BEHAVIORS.meteredFeeder.apply(feeder1, 0.05, 0, Infinity);
      expect(feeder2.gateFraction).toBe(1);
      expect(feeder2.gateThrottleFraction).toBe(1);
    });
  });
});

describe("passThrough", () => {
  it("never holds volume and forwards exactly min(inflow, cap)", () => {
    const state = { kind: "passThrough", volume: 0 };
    expect(BEHAVIORS.passThrough.apply(state, 0.05, 5, 2)).toBe(2);
    expect(state.volume).toBe(0);
  });
});

describe("splitter (issue #26)", () => {
  function initState({ wasteFraction = 0.03, ceilingM3PerSec = Infinity } = {}) {
    return BEHAVIORS.splitter.init({ sim: { wasteFraction, ceilingM3PerSec } });
  }

  it("holds no material of its own", () => {
    const state = initState();
    expect(state.outTotal).toBe(0);
    expect(state.wasteTotal).toBe(0);
  });

  it("divides accepted inflow between its two ports by the configured fraction", () => {
    const state = initState({ wasteFraction: 0.1 });
    const hasDownstream = { out: false, waste: false };
    const out = BEHAVIORS.splitter.apply(state, 0.05, 1, 1, { out: Infinity, waste: Infinity }, hasDownstream);
    expect(out.waste).toBeCloseTo(0.1);
    expect(out.out).toBeCloseTo(0.9);
    expect(out.out + out.waste).toBeCloseTo(1); // nothing lost in the split itself
  });

  it("capacityAvailable is bounded by whichever branch is tightest, scaled back up to the whole inflow", () => {
    const state = initState({ wasteFraction: 0.1, ceilingM3PerSec: Infinity });
    // waste branch can only take 0.01 this tick -> at most 0.1 total can be
    // accepted (0.01 / 0.1), tighter than the product branch's own bound.
    const cap = BEHAVIORS.splitter.capacityAvailable(state, 0.05, { out: Infinity, waste: 0.01 });
    expect(cap).toBeCloseTo(0.1);
  });

  it("never exceeds its own throughput ceiling even with both downstream branches wide open", () => {
    const state = initState({ wasteFraction: 0.03, ceilingM3PerSec: 10 });
    const cap = BEHAVIORS.splitter.capacityAvailable(state, 0.05, { out: Infinity, waste: Infinity });
    expect(cap).toBeCloseTo(10 * 0.05);
  });

  it("clamps each branch's own flow to that branch's downstream capacity when supplied more than expected", () => {
    const state = initState({ wasteFraction: 0.1 });
    const hasDownstream = { out: true, waste: true };
    // Accepted (cap=1) implies a 0.1 want on waste, but its own downstream
    // only has 0.02 of headroom this tick.
    const out = BEHAVIORS.splitter.apply(state, 0.05, 1, 1, { out: Infinity, waste: 0.02 }, hasDownstream);
    expect(out.waste).toBeCloseTo(0.02);
    expect(out.out).toBeCloseTo(0.9); // the product branch is unaffected by the waste branch's own limit
  });

  it("reports a port with nothing sim-enabled downstream as delivered, per-port independently", () => {
    const state = initState({ wasteFraction: 0.1 });
    // waste is wired to a real sink; out isn't sim-enabled yet.
    BEHAVIORS.splitter.apply(state, 0.05, 1, 1, { out: Infinity, waste: Infinity }, { out: false, waste: true });
    expect(BEHAVIORS.splitter.conserve(state)).toEqual({ delivered: 0.9 }); // only the unwired "out" port counts as delivered here
  });

  it("live control: wasteFraction can be changed between ticks", () => {
    const state = initState({ wasteFraction: 0.1 });
    state.wasteFraction = 0.5;
    const out = BEHAVIORS.splitter.apply(state, 0.05, 1, 1, { out: Infinity, waste: Infinity }, { out: false, waste: false });
    expect(out.waste).toBeCloseTo(0.5);
  });

  it("reports 'flowing' true only on a tick where material actually passed through", () => {
    const state = initState({ wasteFraction: 0.1 });
    expect(BEHAVIORS.splitter.snapshot(state).flowing).toBe(false); // nothing has flowed yet

    BEHAVIORS.splitter.apply(state, 0.05, 1, 1, { out: Infinity, waste: Infinity }, { out: false, waste: false });
    expect(BEHAVIORS.splitter.snapshot(state).flowing).toBe(true);

    BEHAVIORS.splitter.apply(state, 0.05, 0, 0, { out: Infinity, waste: Infinity }, { out: false, waste: false }); // nothing offered this tick
    expect(BEHAVIORS.splitter.snapshot(state).flowing).toBe(false);
  });
});

describe("router (issue #47)", () => {
  function initState({ ports = ["a", "b"], defaultPort } = {}) {
    return BEHAVIORS.router.init({ sim: { defaultPort }, ports: { outputs: ports } });
  }

  it("defaults to its first declared output port", () => {
    const state = initState({ ports: ["a", "b"] });
    expect(state.selected).toBe("a");
  });

  it("routes the whole of its inflow to the selected port, nothing to the others", () => {
    const state = initState();
    const out = BEHAVIORS.router.apply(state, 0.05, 1, 1, { a: Infinity, b: Infinity }, { a: false, b: false });
    expect(out.a).toBeCloseTo(1);
    expect(out.b).toBeUndefined();
  });

  it("selectPort changes which port receives inflow from the next apply onward", () => {
    const state = initState();
    BEHAVIORS.router.selectPort(state, "b");
    const out = BEHAVIORS.router.apply(state, 0.05, 1, 1, { a: Infinity, b: Infinity }, { a: false, b: false });
    expect(out.b).toBeCloseTo(1);
    expect(out.a).toBeUndefined();
  });

  it("capacityAvailable is bounded only by the selected port's own downstream", () => {
    const state = initState();
    expect(BEHAVIORS.router.capacityAvailable(state, 0.05, { a: 0.02, b: Infinity })).toBeCloseTo(0.02);
    BEHAVIORS.router.selectPort(state, "b");
    expect(BEHAVIORS.router.capacityAvailable(state, 0.05, { a: 0.02, b: Infinity })).toBe(Infinity);
  });

  it("holds no material: nothing accepted this tick beyond what the selected port's downstream allows", () => {
    const state = initState();
    const out = BEHAVIORS.router.apply(state, 0.05, 1, 0.3, { a: 0.3, b: Infinity }, { a: true, b: false });
    expect(out.a).toBeCloseTo(0.3);
  });

  it("reports delivered only for a selected port with nothing sim-enabled downstream", () => {
    const state = initState();
    BEHAVIORS.router.apply(state, 0.05, 1, 1, { a: Infinity, b: Infinity }, { a: false, b: false });
    expect(BEHAVIORS.router.conserve(state)).toEqual({ delivered: 1 });
  });

  it("reports 'flowing' true only on a tick where material actually passed through the selected port", () => {
    const state = initState();
    expect(BEHAVIORS.router.snapshot(state).flowing).toBe(false);
    BEHAVIORS.router.apply(state, 0.05, 1, 1, { a: Infinity, b: Infinity }, { a: false, b: false });
    expect(BEHAVIORS.router.snapshot(state).flowing).toBe(true);
    BEHAVIORS.router.apply(state, 0.05, 0, 0, { a: Infinity, b: Infinity }, { a: false, b: false });
    expect(BEHAVIORS.router.snapshot(state).flowing).toBe(false);
  });
});

describe("terminalSink (issue #26)", () => {
  it("never backpressures", () => {
    const state = BEHAVIORS.terminalSink.init({ sim: { displayCapacityM3: 0.3 } });
    expect(BEHAVIORS.terminalSink.capacityAvailable(state)).toBe(Infinity);
  });

  it("accumulates everything it receives into a running total, with nothing further to discharge", () => {
    const state = BEHAVIORS.terminalSink.init({ sim: { displayCapacityM3: 0.3 } });
    const out1 = BEHAVIORS.terminalSink.apply(state, 0.05, 1, Infinity);
    const out2 = BEHAVIORS.terminalSink.apply(state, 0.05, 2, Infinity);
    expect(out1).toBe(0);
    expect(out2).toBe(0);
    expect(state.total).toBeCloseTo(3);
  });

  it("reports its running total as delivered for conservation, alongside any seeded initialStored", () => {
    const state = BEHAVIORS.terminalSink.init({ sim: { displayCapacityM3: 0.3 } });
    BEHAVIORS.terminalSink.apply(state, 0.05, 4.5, Infinity);
    expect(BEHAVIORS.terminalSink.conserve(state)).toEqual({ initialStored: 0, delivered: 4.5 });
  });

  // Issue #57: initialLevelFraction mirrors accumulator's own t=0 seed —
  // tracked separately as initialStored so the whole-line conservation
  // invariant (fed + initialStored = ...) stays true for a terminus that
  // starts non-empty, e.g. the discard bin's own 1% default (lineData.js).
  it("seeds a nonzero starting total from initialLevelFraction, tracked as initialStored", () => {
    const state = BEHAVIORS.terminalSink.init({ sim: { displayCapacityM3: 0.3, initialLevelFraction: 0.01 } });
    expect(state.total).toBeCloseTo(0.003);
    expect(BEHAVIORS.terminalSink.conserve(state)).toEqual({ initialStored: state.total, delivered: state.total });
  });

  it("reports a fill ratio scaled to its presenter-facing display capacity, saturating at 1", () => {
    const state = BEHAVIORS.terminalSink.init({ sim: { displayCapacityM3: 0.3 } });
    expect(BEHAVIORS.terminalSink.snapshot(state).fill).toBe(0);

    BEHAVIORS.terminalSink.apply(state, 0.05, 0.15, Infinity);
    expect(BEHAVIORS.terminalSink.snapshot(state).fill).toBeCloseTo(0.5);

    BEHAVIORS.terminalSink.apply(state, 0.05, 1, Infinity); // well past the display capacity
    expect(BEHAVIORS.terminalSink.snapshot(state).fill).toBe(1); // saturates, never exceeds 1
  });

  it("with no bagSizeM3 configured (discardBin's own shape), publishes no bagCount at all", () => {
    const state = BEHAVIORS.terminalSink.init({ sim: { displayCapacityM3: 0.3 } });
    BEHAVIORS.terminalSink.apply(state, 0.05, 4.5, Infinity);
    expect(BEHAVIORS.terminalSink.snapshot(state).bagCount).toBeUndefined();
  });

  it("issue #48: counts whole bags as the running total crosses each bagSizeM3 multiple", () => {
    const state = BEHAVIORS.terminalSink.init({ sim: { displayCapacityM3: 5, bagSizeM3: 1.4 } });
    expect(BEHAVIORS.terminalSink.snapshot(state).bagCount).toBe(0);

    BEHAVIORS.terminalSink.apply(state, 0.05, 1, Infinity); // short of one full bag
    expect(BEHAVIORS.terminalSink.snapshot(state).bagCount).toBe(0);

    BEHAVIORS.terminalSink.apply(state, 0.05, 0.4, Infinity); // total now 1.4, exactly one bag
    expect(BEHAVIORS.terminalSink.snapshot(state).bagCount).toBe(1);

    BEHAVIORS.terminalSink.apply(state, 0.05, 2.8, Infinity); // total now 4.2, exactly three bags
    expect(BEHAVIORS.terminalSink.snapshot(state).bagCount).toBe(3);
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

    it("intake capacity scales with the throttle, independent of the manual speed dial, as long as the dial has never been touched", () => {
      const state = initState({ ceilingM3PerSec: 2 });
      BEHAVIORS.transportDelay.command(state, 0.5, 0); // instant (0s ramp -> infinite slew)
      BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity); // let the ramp settle this tick
      expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBeCloseTo(0.05); // half of 2*0.05, speedFraction's own untouched default (1) has no effect

      BEHAVIORS.transportDelay.command(state, 0, 0);
      BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity);
      expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBe(0); // stopped: accepts nothing new
    });

    // Issue #63: dragging the dial past the throttle's own live cap swaps it
    // in as the real intake multiplier, so a presenter can deliberately push
    // more material past a governing interlock — see
    // capacityAvailableTransportDelay's own comment. Gated on
    // `speedDialTouched`, stamped only by setElevatorSpeed (engine.js): a
    // gradedFeedSchedule band's own calibrated speed target is always below
    // 1, so without this gate every such actuator would read as overridden
    // the instant its schedule engaged, dial untouched.
    describe("manual override (issue #63)", () => {
      it("swaps the dial in for the throttle once a touched dial is dragged past the throttle's own cap", () => {
        const state = initState({ ceilingM3PerSec: 2 });
        BEHAVIORS.transportDelay.command(state, 0.5, 0); // interlock caps the chain at 50%
        BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity); // let the ramp settle
        state.speedFraction = 1; // presenter drags the dial past the 50% cap
        state.speedDialTouched = true;
        expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBeCloseTo(0.1); // full ceiling, not throttled
      });

      it("does not arm just because the dial sits above the cap — it must actually have been touched", () => {
        const state = initState({ ceilingM3PerSec: 2 });
        BEHAVIORS.transportDelay.command(state, 0.5, 0);
        BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity);
        state.speedFraction = 1; // sitting above the cap, but never dragged there
        expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBeCloseTo(0.05); // still governed
      });

      it("disarms again once a touched dial is dragged back down to or below the cap", () => {
        const state = initState({ ceilingM3PerSec: 2 });
        BEHAVIORS.transportDelay.command(state, 0.5, 0);
        BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity);
        state.speedFraction = 0.5; // dragged back down to exactly the cap
        state.speedDialTouched = true;
        expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBeCloseTo(0.05); // governed again
      });

      it("never overrides a full stop, however far above 0 a touched dial sits", () => {
        const state = initState({ ceilingM3PerSec: 2 });
        BEHAVIORS.transportDelay.command(state, 0, 0); // interlock has fully stopped the chain
        BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity);
        state.speedFraction = 1;
        state.speedDialTouched = true;
        expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBe(0);
      });
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

  describe("bucket density (issue #31)", () => {
    it("packetDensityProfile bands the queue by progress and sums each band's volume", () => {
      const queue = [
        { progress: 0.12, vol: 2 },
        { progress: 0.18, vol: 3 }, // same band as above (0.1-0.2 with 10 bands)
        { progress: 0.55, vol: 1 },
        { progress: 0.91, vol: 4 },
      ];
      const profile = packetDensityProfile(queue, 10);
      expect(profile).toHaveLength(10);
      expect(profile[1]).toBe(5); // 0.12 + 0.18 band
      expect(profile[5]).toBe(1); // 0.55 band
      expect(profile[9]).toBe(4); // 0.91 band
      expect(profile[0]).toBe(0);
      expect(profile[3]).toBe(0);
    });

    it("packetDensityProfile reports higher relative density for a band carrying more volume", () => {
      const sparse = packetDensityProfile([{ progress: 0.5, vol: 1 }], 4);
      const dense = packetDensityProfile([{ progress: 0.5, vol: 1 }, { progress: 0.51, vol: 1 }, { progress: 0.52, vol: 1 }], 4);
      expect(dense[2]).toBeGreaterThan(sparse[2]);
    });

    it("packetDensityProfile ignores a negative progress but clamps progress 1 into the last band (the boundary applyTransportDelay never actually leaves in queue)", () => {
      const profile = packetDensityProfile([{ progress: 1, vol: 5 }, { progress: -0.1, vol: 5 }], 4);
      expect(profile).toEqual([0, 0, 0, 5]);
    });

    // Independent runs (not a live mid-flight speed change) so a comparison
    // isn't confounded by already-queued packets simply having travelled
    // further: each state is fed at a constant per-tick volume until well
    // past its own transit time (steady state, chain full end to end), then
    // the two profiles' average band density is compared directly.
    function runToSteadyState({ speedFraction = 1, feedPerTick, ticks }) {
      const state = initState({ ceilingM3PerSec: 2 });
      state.speedFraction = speedFraction;
      for (let i = 0; i < ticks; i++) BEHAVIORS.transportDelay.apply(state, 0.05, feedPerTick, feedPerTick);
      return BEHAVIORS.transportDelay.snapshot(state).densityProfile;
    }
    const avg = (profile) => profile.reduce((a, v) => a + v, 0) / profile.length;

    it("densityProfile thins (lower average density) when the chain speeds up but feed stays the same", () => {
      const slow = runToSteadyState({ speedFraction: 1, feedPerTick: 0.02, ticks: 600 }); // 10s transit, 3x margin
      const fast = runToSteadyState({ speedFraction: 2, feedPerTick: 0.02, ticks: 300 }); // 5s transit, 3x margin
      expect(avg(fast)).toBeGreaterThan(0);
      expect(avg(fast)).toBeLessThan(avg(slow));
    });

    it("densityProfile fills more (higher average density) when feed increases but chain speed stays the same", () => {
      const light = runToSteadyState({ speedFraction: 1, feedPerTick: 0.01, ticks: 600 });
      const heavy = runToSteadyState({ speedFraction: 1, feedPerTick: 0.05, ticks: 600 });
      expect(avg(heavy)).toBeGreaterThan(avg(light));
    });

    it("snapshot's chainSpeedMPerMin folds in both the manual VFD dial and the interlock throttle", () => {
      const state = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
      expect(BEHAVIORS.transportDelay.snapshot(state).chainSpeedMPerMin).toBeCloseTo(60);

      state.speedFraction = 0.5; // manual dial halved
      expect(BEHAVIORS.transportDelay.snapshot(state).chainSpeedMPerMin).toBeCloseTo(30);

      BEHAVIORS.transportDelay.command(state, 0.5, 0); // interlock throttle halves it again, instantly
      BEHAVIORS.transportDelay.apply(state, 0.05, 0, 1);
      expect(BEHAVIORS.transportDelay.snapshot(state).chainSpeedMPerMin).toBeCloseTo(15);
    });
  });

  it("clear (issue #55) discards both the in-transit queue and the backlog, returning their combined volume, leaving delivered untouched", () => {
    const state = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 } });
    state.queue = [{ progress: 0.2, vol: 1 }, { progress: 0.6, vol: 2 }];
    state.backlog = 0.5;
    state.delivered = 4;

    const discarded = BEHAVIORS.transportDelay.clear(state);

    expect(discarded).toBeCloseTo(3.5); // 1 + 2 + 0.5
    expect(state.queue).toEqual([]);
    expect(state.backlog).toBe(0);
    expect(state.delivered).toBe(4);
  });
});

describe("routedTransportDelay (issue #47)", () => {
  const B = BEHAVIORS.routedTransportDelay;
  function initState({ distanceM = 1, speedMPerMin = 60, ceilingM3PerSec = 10, ports = ["a", "b"], defaultPort, portDistanceM } = {}) {
    return B.init({ sim: { distanceM, speedMPerMin, ceilingM3PerSec, defaultPort, portDistanceM }, ports: { outputs: ports } });
  }

  it("defaults to its first declared output port", () => {
    expect(initState().selected).toBe("a");
  });

  it("tags each accepted packet with the port selected at the moment it entered, not whatever is selected later", () => {
    // 1 m/s chain, 1 m distance -> 1s transit; ceiling caps discharge at
    // 1 m3 per 1s tick so the two backlogged units drain one at a time,
    // strictly FIFO.
    const state = initState({ distanceM: 1, speedMPerMin: 60, ceilingM3PerSec: 1 });
    const hasDownstream = { a: true, b: true };
    const shut = { a: 0, b: 0 };
    B.apply(state, 1, 1, 1, shut, hasDownstream); // 1 m3 tagged "a", transits and jams at the shut discharge
    B.selectPort(state, "b");
    B.apply(state, 1, 1, 1, shut, hasDownstream); // 1 m3 tagged "b", same
    expect(state.backlog).toBeCloseTo(2);

    const open = { a: Infinity, b: Infinity };
    const out1 = B.apply(state, 1, 0, 1, open, hasDownstream);
    expect(out1.a).toBeCloseTo(1); // FIFO: the earlier, "a"-tagged packet drains first
    expect(out1.b ?? 0).toBeCloseTo(0);

    const out2 = B.apply(state, 1, 0, 1, open, hasDownstream);
    expect(out2.b).toBeCloseTo(1); // then the later, "b"-tagged packet — still routed to b
    expect(out2.a ?? 0).toBeCloseTo(0);
  });

  it("switching mid-run conserves: everything fed before and after the switch is eventually accounted for by port", () => {
    const state = initState({ distanceM: 1, speedMPerMin: 60, ceilingM3PerSec: 100 });
    for (let i = 0; i < 30; i++) { // 0.3 m3 tagged "a" (0.01 m3/tick, well under any cap)
      const cap = B.capacityAvailable(state, 0.01);
      B.apply(state, 0.01, 0.01, cap);
    }
    B.selectPort(state, "b");
    for (let i = 0; i < 30; i++) { // 0.3 m3 tagged "b"
      const cap = B.capacityAvailable(state, 0.01);
      B.apply(state, 0.01, 0.01, cap);
    }
    let deliveredA = 0, deliveredB = 0;
    for (let i = 0; i < 300; i++) {
      const cap = B.capacityAvailable(state, 0.01);
      const out = B.apply(state, 0.01, 0, cap, { a: Infinity, b: Infinity }, { a: true, b: true });
      deliveredA += out.a ?? 0;
      deliveredB += out.b ?? 0;
    }
    expect(deliveredA).toBeCloseTo(0.3);
    expect(deliveredB).toBeCloseTo(0.3);
  });

  it("a jam on the selected port's own downstream blocks new infeed, same as plain transportDelay", () => {
    const state = initState({ distanceM: 1, speedMPerMin: 60, ceilingM3PerSec: 10 });
    B.apply(state, 1, 3, 3, { a: 0, b: Infinity }, { a: true, b: true }); // full transit, discharge refused
    expect(state.backlog).toBeGreaterThan(0);
    expect(B.capacityAvailable(state, 1)).toBe(0);
  });

  it("command (the interlock throttle) and selectPort (destination) act independently, neither overwriting the other", () => {
    const state = initState();
    B.command(state, 0, 2); // interlock stops the chain over 2s
    B.selectPort(state, "b");
    expect(state.selected).toBe("b");
    expect(state.throttleTarget).toBe(0);
  });

  // Issue #63: same manual-override swap as plain transportDelay's own
  // capacityAvailableTransportDelay — the packaging elevator (pendulumConveyor)
  // is a routedTransportDelay, so it needs the identical fix.
  it("manual override: swaps a touched dial in for the throttle once dragged past its own cap, but never past a full stop", () => {
    const state = initState({ ceilingM3PerSec: 2 });
    B.command(state, 0.5, 0); // interlock caps the chain at 50%
    B.apply(state, 0.05, 0, Infinity, { a: Infinity, b: Infinity }, { a: true, b: true });
    state.speedFraction = 1; // presenter drags the dial past the 50% cap
    state.speedDialTouched = true;
    expect(B.capacityAvailable(state, 0.05)).toBeCloseTo(0.1); // full ceiling, not throttled

    B.command(state, 0, 0); // interlock now fully stops the chain
    B.apply(state, 0.05, 0, Infinity, { a: Infinity, b: Infinity }, { a: true, b: true });
    expect(B.capacityAvailable(state, 0.05)).toBe(0); // never overridable
  });

  it("isSettled/confirmedRunning mirror plain transportDelay's own semantics", () => {
    const state = initState();
    expect(B.confirmedRunning(state)).toBe(true); // full speed, settled, at t=0
    B.command(state, 0, 1);
    B.apply(state, 0.05, 0, 1);
    expect(B.isSettled(state)).toBe(false);
    for (let i = 0; i < 40; i++) B.apply(state, 0.05, 0, 1);
    expect(B.isSettled(state)).toBe(true);
    expect(B.confirmedRunning(state)).toBe(false);
  });

  it("conserves volume through fill, mid-run switch and discharge", () => {
    const state = initState({ distanceM: 1, speedMPerMin: 60, ceilingM3PerSec: 100 });
    let fed = 0;
    for (let i = 0; i < 50; i++) {
      const cap = B.capacityAvailable(state, 0.02);
      const accepted = Math.min(1, cap);
      fed += accepted;
      B.apply(state, 0.02, 1, cap);
      if (i === 20) B.selectPort(state, "b");
    }
    const c = B.conserve(state);
    expect(fed).toBeCloseTo(c.inTransit + c.delivered, 6);
  });

  it("clear (issue #55) discards the queue and every port's backlog entries, leaving `selected` (the destination) and delivered untouched", () => {
    const state = initState();
    state.selected = "b";
    state.queue = [{ progress: 0.3, vol: 1, port: "a" }];
    state.backlogEntries = [{ vol: 2, port: "a" }, { vol: 0.5, port: "b" }];
    state.backlog = 2.5;
    state.delivered = 7;

    const discarded = B.clear(state);

    expect(discarded).toBeCloseTo(3.5); // 1 + 2 + 0.5
    expect(state.queue).toEqual([]);
    expect(state.backlogEntries).toEqual([]);
    expect(state.backlog).toBe(0);
    expect(state.selected).toBe("b"); // destination selection, not held material
    expect(state.delivered).toBe(7);
  });

  // Issue #69: routedTransportDelay never published a densityProfile at all
  // before this — plain transportDelay's own (issue #31) is lifted across
  // via the shared band-computation helper rather than a second copy.
  it("publishes a densityProfile now, banded the same way plain transportDelay's own is", () => {
    const state = initState({ distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 1 });
    B.apply(state, 0.5, 5, 5); // half the run's worth of material, one packet
    const snap = B.snapshot(state);
    expect(Array.isArray(snap.densityProfile)).toBe(true);
    expect(snap.densityProfile.length).toBeGreaterThan(0);
    expect(snap.densityProfile.some((v) => v > 0)).toBe(true);
  });

  // Issue #69: each outlet's own along-belt distance from the infeed —
  // material bound for the nearer outlet arrives sooner than material bound
  // for the farther one, even though both ride the same physical chain at
  // the same live speed.
  it("paces each packet against its own destination's distance, not the machine's shared one", () => {
    const state = initState({
      distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 100, ports: ["near", "far"],
      portDistanceM: { near: 2, far: 10 },
    });
    // 1 m/s chain: "near" (2m) transits in 2s, "far" (10m) in 10s. No
    // sim-enabled downstream is passed to `apply` (hasDownstream defaults to
    // `{}`), so completed material lands in `delivered` (the same
    // no-downstream convention plain transportDelay uses) the instant it
    // finishes transit — a clean signal to assert on without also
    // exercising the discharge budget/stall machinery.
    B.selectPort(state, "near");
    B.apply(state, 0.01, 1, 1); // tags one packet "near"
    B.selectPort(state, "far");
    B.apply(state, 0.01, 1, 1); // tags one packet "far", same moment

    for (let i = 0; i < 100; i++) B.apply(state, 0.01, 0, 0); // ~1s: short of "near"'s own 2s
    expect(state.delivered).toBeCloseTo(0);

    for (let i = 0; i < 400; i++) B.apply(state, 0.01, 0, 0); // ~5s total: past "near"'s 2s, short of "far"'s 10s
    expect(state.delivered).toBeCloseTo(1); // "near"'s whole packet arrived, "far"'s did not
  });

  // Issue #69: a port with no entry in the line data's own `portDistanceM`
  // falls back to the shared `distanceM` — every routedTransportDelay
  // machine except the pendulum conveyor, so this keeps their timing
  // exactly as it was before per-outlet distance existed.
  it("falls back to the shared distanceM for a port with no per-port entry", () => {
    const state = initState({ distanceM: 5, speedMPerMin: 60, ceilingM3PerSec: 10, portDistanceM: { a: 2 } });
    B.selectPort(state, "b"); // no entry for "b"
    B.apply(state, 0.01, 1, 1);
    expect(state.queue[0].distanceM).toBe(5);
  });

  // Issue #69: the render must show grain terminating at whichever outlet
  // is currently selected, not shining through toward a farther one —
  // masking bands past the selected outlet's own position is what makes
  // that hold even though the per-packet distance above is what makes
  // packets actually arrive at the right time.
  it("masks the density profile past the selected outlet's own position", () => {
    const state = initState({
      distanceM: 10, speedMPerMin: 600, ceilingM3PerSec: 10, ports: ["near", "far"],
      portDistanceM: { near: 5, far: 10 }, // near sits at the run's own midpoint
    });
    B.selectPort(state, "near");
    for (let i = 0; i < 5; i++) B.apply(state, 0.01, 1, 1); // fill the near half with material
    const snap = B.snapshot(state);
    const bandCount = snap.densityProfile.length;
    const firstHalf = snap.densityProfile.slice(0, bandCount / 2);
    const secondHalf = snap.densityProfile.slice(bandCount / 2);
    expect(firstHalf.some((v) => v > 0)).toBe(true);
    expect(secondHalf.every((v) => v === 0)).toBe(true); // past "near" (the selected outlet): masked
  });
});

describe("batchCycle (issue #24)", () => {
  function initState({ chargeM3 = 1, cycleSec = 40 } = {}) {
    return BEHAVIORS.batchCycle.init({ sim: { chargeM3, phases: [{ name: "cycle", durationSec: cycleSec }] } });
  }

  it("sums every phase's duration into cycleSec, so a future multi-phase split needs no restructuring", () => {
    const state = BEHAVIORS.batchCycle.init({
      sim: { chargeM3: 1, phases: [{ name: "fill", durationSec: 5 }, { name: "treat", durationSec: 30 }, { name: "discharge", durationSec: 5 }] },
    });
    expect(state.cycleSec).toBe(40);
  });

  it("draws a full charge in a single tick when the upstream can supply it whole (accumulator's own discharge has no rate limit)", () => {
    const state = initState({ chargeM3: 1 });
    const cap = BEHAVIORS.batchCycle.capacityAvailable(state);
    expect(cap).toBe(1);
    const out = BEHAVIORS.batchCycle.apply(state, 0.05, 1, cap); // upstream hands over the whole charge at once
    expect(out).toBe(0); // nothing discharges yet — it just started holding
    expect(state.held).toBe(1);
    expect(state.phase).toBe("holding");
  });

  it("requests nothing once a charge is fully held: capacityAvailable drops to 0 through the hold", () => {
    const state = initState({ chargeM3: 1 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1);
    expect(state.phase).toBe("holding");
    expect(BEHAVIORS.batchCycle.capacityAvailable(state)).toBe(0);
  });

  it("holds the charge for the full cycle time before discharging anything", () => {
    const state = initState({ chargeM3: 1, cycleSec: 2 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1); // charge drawn instantly, hold begins
    let totalOut = 0;
    for (let i = 0; i < 30; i++) totalOut += BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0); // 1.5s, well under the 2s cycle
    expect(totalOut).toBe(0);
    expect(state.held).toBeCloseTo(1); // still fully inside, neither delivered nor lost
    expect(state.phase).toBe("holding");
  });

  it("discharges the whole charge as a single pulse once the cycle time elapses, not a trickle", () => {
    const state = initState({ chargeM3: 1, cycleSec: 2 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1);
    let totalOut = 0;
    let nonZeroTicks = 0;
    for (let i = 0; i < 60; i++) { // 3s, comfortably past the 2s cycle
      const out = BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0);
      totalOut += out;
      if (out > 0) nonZeroTicks++;
    }
    expect(totalOut).toBeCloseTo(1); // the entire charge left
    expect(nonZeroTicks).toBe(1); // in exactly one tick — a pulse, not a trickle
    expect(state.held).toBe(0);
    expect(state.phase).toBe("charging"); // immediately ready for the next charge
  });

  it("does not start a partial batch: an under-supplied upstream never begins the hold on less than a full charge", () => {
    const state = initState({ chargeM3: 1, cycleSec: 2 });
    // Upstream can only ever offer a fifth of a charge per tick, forever —
    // never a full charge in one go.
    for (let i = 0; i < 4; i++) {
      const cap = BEHAVIORS.batchCycle.capacityAvailable(state);
      BEHAVIORS.batchCycle.apply(state, 0.05, Math.min(0.2, cap), cap);
    }
    expect(state.held).toBeCloseTo(0.8);
    expect(state.phase).toBe("charging"); // not holding: the charge isn't complete yet
  });

  it("draws nothing at all once a charge is complete and a cycle is running, even if upstream offers plenty", () => {
    const state = initState({ chargeM3: 1, cycleSec: 40 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1); // charge completes, cycle starts
    const cap = BEHAVIORS.batchCycle.capacityAvailable(state);
    expect(cap).toBe(0);
    const out = BEHAVIORS.batchCycle.apply(state, 0.05, 5, cap); // upstream offers plenty more, but cap correctly admits none
    expect(out).toBe(0);
    expect(state.held).toBeCloseTo(1); // not 6 — the extra was never accepted
  });

  it("with nothing sim-enabled downstream, the discharge pulse is unconstrained and reports as delivered", () => {
    const state = initState({ chargeM3: 1, cycleSec: 2 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1);
    let out = 0;
    for (let i = 0; i < 60; i++) out += BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0, 0, false); // 3s, comfortably past the 2s cycle
    expect(out).toBeCloseTo(1);
    expect(state.delivered).toBeCloseTo(1);
  });

  it("with a sim-enabled downstream that's momentarily full, the discharge waits rather than losing the charge", () => {
    const state = initState({ chargeM3: 1, cycleSec: 2 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1);
    for (let i = 0; i < 30; i++) BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0, 0, true); // 1.5s, still well within the hold
    expect(state.phase).toBe("holding");

    for (let i = 0; i < 30; i++) BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0, 0, true); // now past the 2s cycle, downstream blocked throughout
    expect(state.phase).toBe("discharging");
    expect(state.held).toBeCloseTo(1); // still fully accounted for, just not yet handed over

    const out2 = BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0, 1, true); // downstream opens up
    expect(out2).toBeCloseTo(1);
    expect(state.phase).toBe("charging");
  });

  it("holds mid-charge and mid-cycle volume as inTransit, neither delivered nor lost", () => {
    const state = initState({ chargeM3: 1, cycleSec: 40 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 0.4, 0.4); // partway through charging
    const c = BEHAVIORS.batchCycle.conserve(state, false);
    expect(c.inTransit).toBeCloseTo(0.4);
    expect(c.delivered).toBe(0);
  });

  it("does not double-count delivered volume once a sim-enabled machine is downstream", () => {
    const state = initState({ chargeM3: 1, cycleSec: 2 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1, 1, true);
    for (let i = 0; i < 39; i++) BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0, 1, true);
    BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0, 1, true); // discharges into the connected downstream
    const c = BEHAVIORS.batchCycle.conserve(state, true);
    expect(c.delivered).toBeUndefined(); // the downstream machine accounts for it instead
  });

  it("conserves volume across many consecutive cycles with no drift", () => {
    const state = initState({ chargeM3: 0.222, cycleSec: 1 }); // short cycle to run many of them quickly
    let fed = 0;
    for (let i = 0; i < 4000; i++) { // 200s, far more than the 1s cycle
      const cap = BEHAVIORS.batchCycle.capacityAvailable(state);
      const inflow = Math.min(0.05, cap); // a generous but rate-limited upstream
      fed += inflow;
      BEHAVIORS.batchCycle.apply(state, 0.05, inflow, cap);
    }
    const c = BEHAVIORS.batchCycle.conserve(state, false);
    expect(state.delivered).toBeGreaterThan(0); // many cycles genuinely completed
    expect(fed).toBeCloseTo(c.delivered + c.inTransit); // nothing gained or lost across the whole run
  });

  it("reports a fill fraction and phase for the scene/chart to read", () => {
    const state = initState({ chargeM3: 2, cycleSec: 40 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 0.5, 0.5);
    let snap = BEHAVIORS.batchCycle.snapshot(state);
    expect(snap.fill).toBeCloseTo(0.25);
    expect(snap.phase).toBe("charging");

    BEHAVIORS.batchCycle.apply(state, 0.05, 1.5, 1.5); // completes the charge
    snap = BEHAVIORS.batchCycle.snapshot(state);
    expect(snap.fill).toBeCloseTo(1);
    expect(snap.phase).toBe("holding");
  });

  // Hold-next-batch gate (issue #25 — the treater after-bin's response to a
  // full bin). The interlock (control.js `holdNextBatch`) is what decides
  // *when* to command the gate; these tests only cover what the gate itself
  // does to capacityAvailable and the reported phase once commanded.
  describe("hold-next-batch gate (issue #25)", () => {
    it("defaults to unblocked, so a batch-cycle machine no interlock commands behaves exactly as issue #24 built it", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      expect(state.blocked).toBe(false);
      expect(BEHAVIORS.batchCycle.capacityAvailable(state)).toBe(1);
    });

    it("commandBatchCycle sets the blocked flag", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.command(state, true);
      expect(state.blocked).toBe(true);
      BEHAVIORS.batchCycle.command(state, false);
      expect(state.blocked).toBe(false);
    });

    it("withholds capacity for a fresh charge once blocked, before anything has been accepted", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.command(state, true);
      expect(BEHAVIORS.batchCycle.capacityAvailable(state)).toBe(0);
      const out = BEHAVIORS.batchCycle.apply(state, 0.05, 1, 0); // upstream offers, cap correctly admits none
      expect(out).toBe(0);
      expect(state.held).toBe(0);
    });

    it("does not interrupt a charge already under way: blocking mid-charge lets it keep accepting", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.apply(state, 0.05, 0.4, 0.4); // partway through charging, held > 0
      BEHAVIORS.batchCycle.command(state, true); // interlock trips mid-charge
      const cap = BEHAVIORS.batchCycle.capacityAvailable(state);
      expect(cap).toBeCloseTo(0.6); // still open for the rest of this charge
      BEHAVIORS.batchCycle.apply(state, 0.05, cap, cap);
      expect(state.held).toBeCloseTo(1);
      expect(state.phase).toBe("holding"); // reached the hold normally, not stalled
    });

    it("does not interrupt holding or discharging: a block commanded during either phase still lets the charge complete and discharge as a pulse", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1); // charge completes, holding begins
      BEHAVIORS.batchCycle.command(state, true); // interlock trips while holding
      let totalOut = 0;
      for (let i = 0; i < 60; i++) totalOut += BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0); // past the 2s cycle
      expect(totalOut).toBeCloseTo(1); // the whole charge still left, as a pulse
      expect(state.held).toBe(0);
    });

    it("blocks the very next charge from starting once the current one has fully discharged", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1);
      BEHAVIORS.batchCycle.command(state, true);
      for (let i = 0; i < 60; i++) BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0); // completes and discharges
      expect(state.phase).toBe("charging");
      expect(state.held).toBe(0);
      expect(BEHAVIORS.batchCycle.capacityAvailable(state)).toBe(0); // blocked, held===0: the next charge is withheld
      const out = BEHAVIORS.batchCycle.apply(state, 0.05, 1, 0); // upstream offers plenty, cap admits none
      expect(out).toBe(0);
      expect(state.held).toBe(0);
    });

    it("resumes accepting once released", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.command(state, true);
      expect(BEHAVIORS.batchCycle.capacityAvailable(state)).toBe(0);
      BEHAVIORS.batchCycle.command(state, false);
      expect(BEHAVIORS.batchCycle.capacityAvailable(state)).toBe(1);
      const out = BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1);
      expect(out).toBe(0);
      expect(state.held).toBe(1);
    });

    it("reports a distinct 'waiting' phase — not 'charging' and not a stop — while a fresh charge is withheld", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.command(state, true);
      expect(state.phase).toBe("charging"); // the raw state machine is unchanged
      expect(BEHAVIORS.batchCycle.snapshot(state).phase).toBe("waiting"); // but the reported phase is distinct
    });

    it("does not report 'waiting' once material is genuinely held, even while blocked (mid-charge/holding/discharging keep their own phase name)", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.apply(state, 0.05, 0.4, 0.4);
      BEHAVIORS.batchCycle.command(state, true);
      expect(BEHAVIORS.batchCycle.snapshot(state).phase).toBe("charging"); // mid-charge, not "waiting"
    });

    it("never causes a spill: withheld capacity means the accumulator upstream simply keeps what it holds", () => {
      const state = initState({ chargeM3: 1, cycleSec: 2 });
      BEHAVIORS.batchCycle.command(state, true);
      // capacityAvailable(0) is exactly what the engine's reverse pass hands
      // upstream as this machine's downstreamCap — an upstream accumulator
      // never even attempts to push more than that, so nothing is lost here.
      expect(BEHAVIORS.batchCycle.capacityAvailable(state)).toBe(0);
    });
  });

  it("clear (issue #55) discards whatever charge is held mid-cycle, resets to a fresh charging phase, and leaves blocked/stopped/delivered untouched", () => {
    const state = initState({ chargeM3: 1, cycleSec: 2 });
    BEHAVIORS.batchCycle.apply(state, 0.05, 1, 1); // charge drawn instantly, hold begins
    for (let i = 0; i < 10; i++) BEHAVIORS.batchCycle.apply(state, 0.05, 0, 0); // mid-hold, still fully held
    expect(state.phase).toBe("holding");
    expect(state.held).toBeCloseTo(1);
    state.blocked = true; // a latched interlock — must survive the clear
    state.delivered = 5;

    const discarded = BEHAVIORS.batchCycle.clear(state);

    expect(discarded).toBeCloseTo(1);
    expect(state.held).toBe(0);
    expect(state.phase).toBe("charging");
    expect(state.elapsedSec).toBe(0);
    expect(state.blocked).toBe(true); // latched trip state, not touched by clearPlant
    expect(state.delivered).toBe(5);
  });
});

// The after-bin's whole reason for existing (issue #25): it reuses the
// accumulator behaviour unmodified (no new material physics — acceptance
// criterion #1), fed by a batchCycle's pulsed discharge and drained at a
// steady downstreamCap standing in for the not-yet-sim-enabled scalping
// screen (see docs/OPEN_QUESTIONS.md). This drives the two existing
// behaviours together, fabricated states, no lineData — the same style
// control.test.js uses to prove a phase machine's shape without a full line.
describe("treater after-bin smooths the batch pulse (issue #25)", () => {
  it("traces a sawtooth under pulsed infeed against a steady draw: level rises on each pulse, falls between pulses", () => {
    const treater = BEHAVIORS.batchCycle.init({
      sim: { chargeM3: 0.222, phases: [{ name: "cycle", durationSec: 2 }] },
    });
    const afterBin = { kind: "accumulator", capacity: 0.67, stored: 0, initialStored: 0, spill: 0 };
    const steadyDrawM3PerSec = 0.05; // well below the pulse's own rate, well above the line's average, so it visibly drains between pulses

    const levels = [];
    for (let i = 0; i < 2000; i++) { // 100s, several batch cycles
      // Mirrors engine.js's own reverse-then-forward pass: the after-bin's
      // headroom is read before the treater's discharge is computed, and
      // the same value bounds both sides of the same edge.
      const treaterCap = BEHAVIORS.batchCycle.capacityAvailable(treater);
      const dischargeCap = BEHAVIORS.accumulator.capacityAvailable(afterBin);
      const pulse = BEHAVIORS.batchCycle.apply(treater, 0.05, Math.min(1, treaterCap), treaterCap, dischargeCap, true); // pre-bin never the limiter here
      BEHAVIORS.accumulator.apply(afterBin, 0.05, pulse, dischargeCap, steadyDrawM3PerSec * 0.05);
      levels.push(afterBin.stored);
    }

    const rising = levels.some((l, i) => i > 0 && l > levels[i - 1] + 1e-6);
    const falling = levels.some((l, i) => i > 0 && l < levels[i - 1] - 1e-6);
    expect(rising).toBe(true); // pulses land
    expect(falling).toBe(true); // steady draw drains between them
    expect(afterBin.spill).toBeCloseTo(0); // never overflows
  });

  it("discharges smoothly under a constant downstreamCap even though infeed is a pulse: output per tick never exceeds the steady draw rate", () => {
    const afterBin = { kind: "accumulator", capacity: 0.67, stored: 0.5, initialStored: 0.5, spill: 0 };
    const steadyDrawM3PerTick = 0.05 * 0.05; // rate * dt

    let sawNonZeroOutput = false;
    for (let i = 0; i < 20; i++) {
      const out = BEHAVIORS.accumulator.apply(afterBin, 0.05, 0, 10, steadyDrawM3PerTick); // no new pulse this stretch, just draining
      expect(out).toBeLessThanOrEqual(steadyDrawM3PerTick + 1e-12); // never a burst, always bounded by the steady rate
      if (out > 0) sawNonZeroOutput = true;
    }
    expect(sawNonZeroOutput).toBe(true);
  });
});

describe("REGISTERED_KINDS", () => {
  it("lists exactly the behaviours with an entry in BEHAVIORS", () => {
    expect([...REGISTERED_KINDS].sort()).toEqual(Object.keys(BEHAVIORS).sort());
  });
});

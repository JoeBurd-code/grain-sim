// Unit tests over plotHistory.js's pure state machine, exercised the same
// way control.test.js exercises the interlock state machine: fabricated
// state and a fabricated sequence of publish ticks, no engine.js, no
// rendering involved (issue #36's acceptance criteria).
import { describe, it, expect } from "vitest";
import {
  createPlotHistory, isSeriesPlotted, setSeriesPlotted, recordSample, sampleValueAt, RATE_EMA_TAU_SEC,
} from "./plotHistory";

// The exact single-step EMA update recordSample uses internally (see
// plotHistory.js's nextEma), reproduced here so tests can assert against the
// real formula's output instead of a value transcribed by hand.
function emaStep(prevValue, elapsed, instRate) {
  const alpha = 1 - Math.exp(-elapsed / RATE_EMA_TAU_SEC);
  return prevValue + alpha * (instRate - prevValue);
}

// `cumulativeOutM3` is the machine's running total volume discharged so far
// (engine.js's stepSim) -- what the rate series is now derived from, not an
// instantaneous flowRateM3PerSec.
function snap(fill, cumulativeOutM3) {
  return new Map([["bin", { fill, cumulativeOutM3 }]]);
}

describe("setSeriesPlotted", () => {
  it("starts an empty series when toggled on", () => {
    const h = setSeriesPlotted(createPlotHistory(), "bin", "level", true);
    expect(isSeriesPlotted(h, "bin", "level")).toBe(true);
    expect(h.get("bin").level).toEqual([]);
  });

  it("leaves the machine's other series untouched", () => {
    let h = setSeriesPlotted(createPlotHistory(), "bin", "level", true);
    h = setSeriesPlotted(h, "bin", "rate", true);
    expect(isSeriesPlotted(h, "bin", "level")).toBe(true);
    expect(isSeriesPlotted(h, "bin", "rate")).toBe(true);
  });

  it("removes the machine entirely once its last series is toggled off", () => {
    let h = setSeriesPlotted(createPlotHistory(), "bin", "level", true);
    h = setSeriesPlotted(h, "bin", "level", false);
    expect(h.has("bin")).toBe(false);
  });

  it("is a no-op that returns the same reference when the requested state already holds", () => {
    const empty = createPlotHistory();
    expect(setSeriesPlotted(empty, "bin", "level", false)).toBe(empty);
    const plotted = setSeriesPlotted(empty, "bin", "level", true);
    expect(setSeriesPlotted(plotted, "bin", "level", true)).toBe(plotted);
  });
});

describe("recordSample", () => {
  it("records nothing for a series that was never toggled on", () => {
    const h = recordSample(createPlotHistory(), 1, snap(0.5, 0.01));
    expect(h.size).toBe(0);
  });

  it("begins recording from the moment a series is toggled on, not retroactively", () => {
    let h = createPlotHistory();
    h = recordSample(h, 1, snap(0.2, 0.001)); // before toggle: nothing plotted yet
    h = setSeriesPlotted(h, "bin", "level", true);
    h = recordSample(h, 2, snap(0.3, 0.002));
    h = recordSample(h, 3, snap(0.4, 0.003));
    expect(h.get("bin").level).toEqual([{ t: 2, value: 0.3 }, { t: 3, value: 0.4 }]);
  });

  it("records level and rate independently per their own toggle", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    h = recordSample(h, 1, snap(0.5, 0.01)); // rate's first sample: no elapsed time to average over yet
    h = setSeriesPlotted(h, "bin", "level", true);
    h = recordSample(h, 2, snap(0.6, 0.03)); // +0.02 m3 over the 1s since the last rate sample
    expect(h.get("bin").rate).toHaveLength(2);
    expect(h.get("bin").rate[0]).toEqual({ t: 1, value: 0 });
    expect(h.get("bin").rate[1].t).toBe(2);
    expect(h.get("bin").rate[1].value).toBeCloseTo(emaStep(0, 1, 0.02));
    expect(h.get("bin").level).toEqual([{ t: 2, value: 0.6 }]);
  });

  it("discards a series' entire history the instant it's toggled off", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "level", true);
    h = recordSample(h, 1, snap(0.5, 0.01));
    h = recordSample(h, 2, snap(0.6, 0.01));
    expect(h.get("bin").level).toHaveLength(2);
    h = setSeriesPlotted(h, "bin", "level", false);
    expect(isSeriesPlotted(h, "bin", "level")).toBe(false);
  });

  it("starts a clean, empty series when re-plotted after being toggled off, not a gapped one", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "level", true);
    h = recordSample(h, 1, snap(0.5, 0.01));
    h = recordSample(h, 2, snap(0.6, 0.01));
    h = setSeriesPlotted(h, "bin", "level", false);
    h = setSeriesPlotted(h, "bin", "level", true);
    expect(h.get("bin").level).toEqual([]);
    h = recordSample(h, 5, snap(0.9, 0.01));
    expect(h.get("bin").level).toEqual([{ t: 5, value: 0.9 }]);
  });

  it("leaves a machine's series unchanged when its snapshot is absent from a given tick", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "level", true);
    h = recordSample(h, 1, snap(0.5, 0.01));
    h = recordSample(h, 2, new Map()); // no snapshot for "bin" this tick
    expect(h.get("bin").level).toEqual([{ t: 1, value: 0.5 }]);
  });

  it("despikes a level above 100% by repeating the last accepted value", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "level", true);
    h = recordSample(h, 1, snap(0.5, 0.01));
    h = recordSample(h, 2, snap(1.7, 0.01)); // spurious >100% fill
    h = recordSample(h, 3, snap(0.6, 0.01)); // back to normal
    expect(h.get("bin").level).toEqual([
      { t: 1, value: 0.5 },
      { t: 2, value: 0.5 },
      { t: 3, value: 0.6 },
    ]);
  });

  it("despikes a level spike with no prior sample to a hold of 0", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "level", true);
    h = recordSample(h, 1, snap(4, 0.01)); // spike on the very first sample
    expect(h.get("bin").level).toEqual([{ t: 1, value: 0 }]);
  });

  it("a single-tick discharge pulse only nudges the EMA by roughly volume/tau, not its raw instantaneous size", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    h = recordSample(h, 0, snap(0.5, 0)); // baseline
    h = recordSample(h, 0.05, snap(0.5, 0.2)); // a whole batch charge dumped in this one tick
    // The raw instantaneous rate this tick is 0.2/0.05 = 4 m3/s; an EMA's
    // response to a brief pulse is approximately volume/tau (the classic
    // low-pass-filter impulse response), not that raw size -- 4 m3/s would
    // be ~11500 t/h, but 0.2/48 is under 4.2 t/h-equivalent.
    expect(h.get("bin").rate.at(-1).value).toBeCloseTo(0.2 / RATE_EMA_TAU_SEC, 3);
  });

  it("decays a discharge pulse's contribution exponentially once no further volume moves", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    h = recordSample(h, 0, snap(0.5, 0));
    h = recordSample(h, 0.05, snap(0.5, 0.2)); // pulse
    const justAfterPulse = h.get("bin").rate.at(-1).value;
    h = recordSample(h, 30, snap(0.5, 0.2)); // 30s of no further discharge
    const decayed = h.get("bin").rate.at(-1).value;
    // With no new volume the instantaneous rate is 0, so the update reduces
    // to prevValue * exp(-elapsed / tau) exactly.
    expect(decayed).toBeCloseTo(justAfterPulse * Math.exp(-29.95 / RATE_EMA_TAU_SEC));
    expect(decayed).toBeLessThan(justAfterPulse);
  });

  it("decays smoothly toward zero over many time constants, with no sudden cliff", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    h = recordSample(h, 0, snap(0.5, 0));
    h = recordSample(h, 0.05, snap(0.5, 0.2)); // pulse, then nothing further ever moves
    const readings = [1, 10, 30, 60, 120, 5 * RATE_EMA_TAU_SEC].map((t) => {
      h = recordSample(h, t, snap(0.5, 0.2));
      return h.get("bin").rate.at(-1).value;
    });
    // Monotonically decreasing -- no cliff, no rebound.
    for (let i = 1; i < readings.length; i++) expect(readings[i]).toBeLessThan(readings[i - 1]);
    // Effectively fully decayed after several time constants.
    expect(readings.at(-1)).toBeLessThan(0.2 / RATE_EMA_TAU_SEC * 0.01);
  });

  it("starts a clean rate series and EMA baseline when re-plotted after being toggled off", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    h = recordSample(h, 0, snap(0.5, 0));
    h = recordSample(h, 10, snap(0.5, 5)); // a lot moved while first plotted
    h = setSeriesPlotted(h, "bin", "rate", false);
    h = setSeriesPlotted(h, "bin", "rate", true);
    expect(h.get("bin").rate).toEqual([]);
    // cumulativeOutM3 keeps counting the whole run regardless of plot state
    // -- re-plotting must not reuse the old baseline and read the gap as a
    // burst of new volume.
    h = recordSample(h, 100, snap(0.5, 5));
    expect(h.get("bin").rate).toEqual([{ t: 100, value: 0 }]);
  });
});

describe("sampleValueAt", () => {
  it("returns null for an empty series", () => {
    expect(sampleValueAt([], 5)).toBeNull();
  });

  it("clamps to the first sample's value before the recorded span", () => {
    const samples = [{ t: 10, value: 0.2 }, { t: 20, value: 0.4 }];
    expect(sampleValueAt(samples, 3)).toBe(0.2);
  });

  it("clamps to the last sample's value after the recorded span", () => {
    const samples = [{ t: 10, value: 0.2 }, { t: 20, value: 0.4 }];
    expect(sampleValueAt(samples, 99)).toBe(0.4);
  });

  it("returns a sample's exact value when t lands on it", () => {
    const samples = [{ t: 10, value: 0.2 }, { t: 20, value: 0.4 }];
    expect(sampleValueAt(samples, 20)).toBe(0.4);
  });

  it("linearly interpolates between the two samples straddling t", () => {
    const samples = [{ t: 10, value: 0.2 }, { t: 20, value: 0.6 }];
    expect(sampleValueAt(samples, 15)).toBeCloseTo(0.4);
  });

  it("interpolates within the correct segment of a longer series", () => {
    const samples = [{ t: 0, value: 0 }, { t: 10, value: 1 }, { t: 20, value: 0 }];
    expect(sampleValueAt(samples, 15)).toBeCloseTo(0.5);
  });
});

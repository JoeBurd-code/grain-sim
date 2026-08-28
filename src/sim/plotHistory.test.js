// Unit tests over plotHistory.js's pure state machine, exercised the same
// way control.test.js exercises the interlock state machine: fabricated
// state and a fabricated sequence of publish ticks, no engine.js, no
// rendering involved (issue #36's acceptance criteria).
import { describe, it, expect } from "vitest";
import {
  createPlotHistory, isSeriesPlotted, setSeriesPlotted, recordSample, sampleValueAt,
  RATE_EMA_TAU_SEC, RATE_EMA_STAGES,
} from "./plotHistory";

// The exact cascaded N-stage EMA update recordSample uses internally (see
// plotHistory.js's nextEma), replayed over a sequence of (t, cumulative)
// readings so tests can assert against the real formula's output instead of
// a value transcribed by hand. Returns the visible (last-stage) value after
// each reading, mirroring the `rate` series recordSample itself would
// produce.
function replayCascade(events) {
  let stages = new Array(RATE_EMA_STAGES).fill(0);
  let prevT = null;
  let prevCumulative = null;
  const values = [];
  for (const { t, cumulative } of events) {
    if (prevT != null && t > prevT) {
      const alpha = 1 - Math.exp(-(t - prevT) / RATE_EMA_TAU_SEC);
      let input = (cumulative - prevCumulative) / (t - prevT);
      stages = stages.map((stage) => {
        const next = stage + alpha * (input - stage);
        input = next;
        return next;
      });
    }
    values.push(stages.at(-1));
    prevT = t;
    prevCumulative = cumulative;
  }
  return values;
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
    expect(h.get("bin").rate[1].value).toBeCloseTo(replayCascade([{ t: 1, cumulative: 0.01 }, { t: 2, cumulative: 0.03 }]).at(-1));
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

  it("a single-tick discharge pulse barely registers at first -- cascading delays and damps a brief pulse further than fewer stages would", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    h = recordSample(h, 0, snap(0.5, 0)); // baseline
    h = recordSample(h, 0.05, snap(0.5, 0.2)); // a whole batch charge dumped in this one tick
    // The raw instantaneous rate this tick is 0.2/0.05 = 4 m3/s (~11500
    // t/h-equivalent). Each stage absorbs most of what the previous stage
    // just did, but the last (visible) stage has barely moved yet -- it
    // still has to catch up over the following samples (see the next test).
    expect(h.get("bin").rate.at(-1).value).toBeLessThan(0.2 / RATE_EMA_TAU_SEC / 100);
  });

  it("a single pulse's visible contribution rises to a peak around (stages-1)*tau later, then decays -- never an instant jump or a cliff", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    h = recordSample(h, 0, snap(0.5, 0));
    h = recordSample(h, 0.05, snap(0.5, 0.2)); // pulse, then nothing further ever moves
    // An N-stage cascade's impulse response peaks at t=(N-1)*tau, not at
    // tau itself -- each extra stage delays (and further damps) the peak.
    const peakT = (RATE_EMA_STAGES - 1) * RATE_EMA_TAU_SEC;
    const times = [0.05, 1, 5, 10, 20, 30, 40, peakT, 60, 80, 100, 120, 150, 10 * RATE_EMA_TAU_SEC]
      .filter((t, i, arr) => arr.indexOf(t) === i) // dedupe in case peakT collides with a fixed sample point
      .sort((a, b) => a - b);
    const readings = times.slice(1).map((t) => {
      h = recordSample(h, t, snap(0.5, 0.2));
      return h.get("bin").rate.at(-1).value;
    });
    readings.unshift(h.get("bin").rate[0].value);
    // Matches the exact formula (an N-pole impulse response), not just a
    // qualitative shape.
    const expected = replayCascade(times.map((t) => ({ t, cumulative: 0.2 })));
    readings.forEach((v, i) => expect(v).toBeCloseTo(expected[i]));
    // Unimodal: strictly rises to one peak, then strictly falls -- no cliff,
    // no rebound, no oscillation.
    const peakIndex = readings.indexOf(Math.max(...readings));
    expect(peakIndex).toBeGreaterThan(0);
    expect(peakIndex).toBeLessThan(readings.length - 1);
    for (let i = 1; i <= peakIndex; i++) expect(readings[i]).toBeGreaterThan(readings[i - 1]);
    for (let i = peakIndex + 1; i < readings.length; i++) expect(readings[i]).toBeLessThan(readings[i - 1]);
    // Effectively fully decayed after ten time constants.
    expect(readings.at(-1)).toBeLessThan(readings[peakIndex] * 0.01);
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

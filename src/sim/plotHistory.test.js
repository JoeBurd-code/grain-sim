// Unit tests over plotHistory.js's pure state machine, exercised the same
// way control.test.js exercises the interlock state machine: fabricated
// state and a fabricated sequence of publish ticks, no engine.js, no
// rendering involved (issue #36's acceptance criteria).
import { describe, it, expect } from "vitest";
import {
  createPlotHistory, isSeriesPlotted, setSeriesPlotted, recordSample, sampleValueAt,
} from "./plotHistory";
import { tPerHourToM3PerSec } from "./units";

function snap(fill, flowRateM3PerSec) {
  return new Map([["bin", { fill, flowRateM3PerSec }]]);
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
    h = recordSample(h, 1, snap(0.5, 0.01));
    h = setSeriesPlotted(h, "bin", "level", true);
    h = recordSample(h, 2, snap(0.6, 0.02));
    expect(h.get("bin").rate).toEqual([{ t: 1, value: 0.01 }, { t: 2, value: 0.02 }]);
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

  it("despikes a rate above 100 t/h by repeating the last accepted value", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    h = recordSample(h, 1, snap(0.5, 0.005)); // ~13 t/h, well under the cap
    h = recordSample(h, 2, snap(0.5, 5)); // absurd spike, e.g. flow blowing past 16000 t/h
    h = recordSample(h, 3, snap(0.5, 0.006));
    expect(h.get("bin").rate).toEqual([
      { t: 1, value: 0.005 },
      { t: 2, value: 0.005 },
      { t: 3, value: 0.006 },
    ]);
  });

  it("accepts a rate exactly at the 100 t/h cap", () => {
    let h = createPlotHistory();
    h = setSeriesPlotted(h, "bin", "rate", true);
    const capM3PerSec = tPerHourToM3PerSec(100);
    h = recordSample(h, 1, snap(0.5, capM3PerSec));
    expect(h.get("bin").rate).toEqual([{ t: 1, value: capM3PerSec }]);
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

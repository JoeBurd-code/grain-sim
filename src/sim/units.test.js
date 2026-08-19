// Unit tests over the pure feed-rate formula (issue #57): plain numeric
// assertions, no machine state, verifying it reproduces the spreadsheet's
// own worked examples and the eight per-band (Speed%, Gate%) pairs derived
// in issue #56 for both bins.
import { describe, it, expect } from "vitest";
import { simatekFeedRateTph } from "./units";

describe("simatekFeedRateTph", () => {
  it("reproduces the spreadsheet's Yellow Bin (treating) worked example: 85% speed x 55% gate ~= 13.92 TPH", () => {
    expect(simatekFeedRateTph(0.85, 0.55)).toBeCloseTo(13.92, 1);
  });

  it("reproduces the spreadsheet's Red Bin (Concetti) worked example: 95% speed x 65% gate ~= 18.38 TPH", () => {
    expect(simatekFeedRateTph(0.95, 0.65)).toBeCloseTo(18.38, 1);
  });

  // Each pair is the bin's own nominal (Speed%, Gate%) point scaled by
  // sqrt(targetTph / nominalTph), per issue #56's "Nominal reference
  // points" section -- preserving the nominal Speed:Gate ratio at every
  // band so no band ever commands a combination outside the validated
  // fill-degree range.
  describe("treater pre-bin bands (nominal 85% x 55% ~= 13.92 TPH)", () => {
    it("boost (target 14 TPH): 85.25% speed x 55.16% gate", () => {
      expect(simatekFeedRateTph(0.8525, 0.5516)).toBeCloseTo(14, 1);
    });
    it("normal (target 12 TPH): 78.93% speed x 51.07% gate", () => {
      expect(simatekFeedRateTph(0.7893, 0.5107)).toBeCloseTo(12, 1);
    });
    it("throttle (target 6 TPH): 55.81% speed x 36.11% gate", () => {
      expect(simatekFeedRateTph(0.5581, 0.3611)).toBeCloseTo(6, 1);
    });
    it("trip (target 0 TPH, full stop): 0% speed x 0% gate", () => {
      expect(simatekFeedRateTph(0, 0)).toBe(0);
    });
  });

  describe("Concetti pre-bin bands (nominal 95% x 65% ~= 18.38 TPH)", () => {
    it("boost (target 18 TPH): 94.01% speed x 64.32% gate", () => {
      expect(simatekFeedRateTph(0.9401, 0.6432)).toBeCloseTo(18, 1);
    });
    it("normal (target 14 TPH): 82.90% speed x 56.72% gate", () => {
      expect(simatekFeedRateTph(0.829, 0.5672)).toBeCloseTo(14, 1);
    });
    it("throttle (target 7 TPH): 58.62% speed x 40.11% gate", () => {
      expect(simatekFeedRateTph(0.5862, 0.4011)).toBeCloseTo(7, 1);
    });
    it("trip (target 0 TPH, full stop): 0% speed x 0% gate", () => {
      expect(simatekFeedRateTph(0, 0)).toBe(0);
    });
  });

  it("is zero whenever either speed or gate is zero, regardless of the other", () => {
    expect(simatekFeedRateTph(0, 0.65)).toBe(0);
    expect(simatekFeedRateTph(0.95, 0)).toBe(0);
  });

  it("scales linearly with each input independently", () => {
    const base = simatekFeedRateTph(0.5, 0.5);
    expect(simatekFeedRateTph(1, 0.5)).toBeCloseTo(base * 2);
    expect(simatekFeedRateTph(0.5, 1)).toBeCloseTo(base * 2);
  });
});

import { describe, it, expect } from "vitest";
import { rangeFromControls } from "./chartRange";

const bounds = { start: 100, end: 500 }; // 400s of recorded history
const minSpan = 10;

describe("rangeFromControls", () => {
  it("shows the full recorded history when fully zoomed out, regardless of shift", () => {
    expect(rangeFromControls(bounds, 0, 0, minSpan)).toEqual({ start: 100, end: 500 });
    expect(rangeFromControls(bounds, 0, 0.5, minSpan)).toEqual({ start: 100, end: 500 });
    expect(rangeFromControls(bounds, 0, 1, minSpan)).toEqual({ start: 100, end: 500 });
  });

  it("shrinks to minSpan when fully zoomed in", () => {
    const r = rangeFromControls(bounds, 1, 0, minSpan);
    expect(r.end - r.start).toBeCloseTo(minSpan, 6);
  });

  it("interpolates the span linearly between minSpan and the full data span", () => {
    // halfway zoomed: span should be halfway between minSpan(10) and dataSpan(400)
    const r = rangeFromControls(bounds, 0.5, 0, minSpan);
    expect(r.end - r.start).toBeCloseTo((minSpan + 400) / 2, 6);
  });

  it("shiftFrac 0 anchors the window to the oldest data", () => {
    const r = rangeFromControls(bounds, 1, 0, minSpan);
    expect(r.start).toBeCloseTo(bounds.start, 6);
  });

  it("shiftFrac 1 anchors the window to the newest data", () => {
    const r = rangeFromControls(bounds, 1, 1, minSpan);
    expect(r.end).toBeCloseTo(bounds.end, 6);
  });

  it("shiftFrac slides the window within the available slack at a fixed zoom", () => {
    // span = 100 (zoomFrac such that dataSpan - zoomFrac*(dataSpan-minSpan) = 100)
    const zoomFrac = (400 - 100) / (400 - minSpan);
    const slack = 400 - 100; // dataSpan - span
    const r = rangeFromControls(bounds, zoomFrac, 0.25, minSpan);
    expect(r.end - r.start).toBeCloseTo(100, 6);
    expect(r.start).toBeCloseTo(bounds.start + 0.25 * slack, 6);
  });

  it("collapses to the full bounds when the data span is already narrower than minSpan", () => {
    const narrow = { start: 0, end: 5 }; // 5s of data, less than minSpan(10)
    expect(rangeFromControls(narrow, 0, 0, minSpan)).toEqual({ start: 0, end: 5 });
    expect(rangeFromControls(narrow, 1, 1, minSpan)).toEqual({ start: 0, end: 5 });
  });

  it("never produces a window outside the recorded bounds", () => {
    for (const zoomFrac of [0, 0.2, 0.5, 0.8, 1]) {
      for (const shiftFrac of [0, 0.3, 0.7, 1]) {
        const r = rangeFromControls(bounds, zoomFrac, shiftFrac, minSpan);
        expect(r.start).toBeGreaterThanOrEqual(bounds.start - 1e-9);
        expect(r.end).toBeLessThanOrEqual(bounds.end + 1e-9);
      }
    }
  });
});

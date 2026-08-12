import { describe, it, expect } from "vitest";
import { timeAtPixel, spanFromDrag } from "./measureSpan";

const range = { start: 100, end: 300 }; // 200s visible window
const plotWidthPx = 400;

describe("timeAtPixel", () => {
  it("maps the plot's left edge to the range start", () => {
    expect(timeAtPixel(range, plotWidthPx, 0)).toBe(100);
  });

  it("maps the plot's right edge to the range end", () => {
    expect(timeAtPixel(range, plotWidthPx, 400)).toBe(300);
  });

  it("interpolates linearly in between", () => {
    expect(timeAtPixel(range, plotWidthPx, 100)).toBeCloseTo(150, 6);
    expect(timeAtPixel(range, plotWidthPx, 200)).toBeCloseTo(200, 6);
  });

  it("clamps pixels outside the plot to the range's own bounds", () => {
    expect(timeAtPixel(range, plotWidthPx, -50)).toBe(100);
    expect(timeAtPixel(range, plotWidthPx, 999)).toBe(300);
  });

  it("falls back to range.start when the plot has no measurable width", () => {
    expect(timeAtPixel(range, 0, 200)).toBe(100);
  });
});

describe("spanFromDrag", () => {
  it("orders the span low-to-high regardless of drag direction", () => {
    const forward = spanFromDrag(range, plotWidthPx, 100, 300);
    const backward = spanFromDrag(range, plotWidthPx, 300, 100);
    expect(forward).toEqual(backward);
    expect(forward.start).toBeCloseTo(150, 6);
    expect(forward.end).toBeCloseTo(250, 6);
  });

  it("produces a zero-width span when start and current pixels match", () => {
    const s = spanFromDrag(range, plotWidthPx, 120, 120);
    expect(s.end - s.start).toBeCloseTo(0, 9);
  });
});

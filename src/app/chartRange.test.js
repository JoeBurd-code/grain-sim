import { describe, it, expect } from "vitest";
import {
  screenToTime, timeToScreen, panBy, zoomAt, clampToBounds, fitToBounds,
} from "./chartRange";

const range = { start: 100, end: 300 }; // 200s window
const width = 800; // 0.25 s/px

describe("chart time-range math", () => {
  it("round-trips screen to time and back", () => {
    const screenX = 120;
    const t = screenToTime(range, width, screenX);
    expect(t).toBeCloseTo(130, 6);
    const back = timeToScreen(range, width, t);
    expect(back).toBeCloseTo(screenX, 6);
    // and a known point: screen 0 maps to range.start
    expect(screenToTime(range, width, 0)).toBe(100);
  });

  it("zoomAt keeps the time under the cursor fixed", () => {
    const cursorX = 600;
    const before = screenToTime(range, width, cursorX);
    const zoomed = zoomAt(range, width, cursorX, 2);
    const after = screenToTime(zoomed, width, cursorX);
    expect(after).toBeCloseTo(before, 6);
    // factor > 1 zooms in: the visible span shrinks
    expect(zoomed.end - zoomed.start).toBeCloseTo((range.end - range.start) / 2, 6);
  });

  it("panBy shifts the range opposite the drag, scaled to time units", () => {
    // dragging content right by 80px moves the range left (earlier in time)
    const panned = panBy(range, width, 80);
    const scale = (range.end - range.start) / width; // 0.25 s/px
    expect(panned.start).toBeCloseTo(range.start - 80 * scale, 6);
    expect(panned.end).toBeCloseTo(range.end - 80 * scale, 6);
    expect(panned.end - panned.start).toBeCloseTo(range.end - range.start, 6);
  });

  it("zoomAt clamps to the given span limits", () => {
    const limits = { minSpan: 50, maxSpan: 1000 };
    const cursorX = 400;
    // try to zoom in far past the limit: span stops at minSpan
    const zoomedIn = zoomAt(range, width, cursorX, 100, limits);
    expect(zoomedIn.end - zoomedIn.start).toBeCloseTo(limits.minSpan, 6);
    // try to zoom out far past the limit: span stops at maxSpan
    const zoomedOut = zoomAt(range, width, cursorX, 0.01, limits);
    expect(zoomedOut.end - zoomedOut.start).toBeCloseTo(limits.maxSpan, 6);
    // clamped zoom still keeps the cursor's time fixed
    const before = screenToTime(range, width, cursorX);
    const after = screenToTime(zoomedIn, width, cursorX);
    expect(after).toBeCloseTo(before, 6);
  });

  it("fitToBounds frames the bounds with a padding fraction, centred", () => {
    const bounds = { start: 10, end: 50 }; // 40s span
    const fitted = fitToBounds(bounds, 0.1);
    expect(fitted.start).toBeCloseTo(6, 6);
    expect(fitted.end).toBeCloseTo(54, 6);
    // no padding: exact bounds
    expect(fitToBounds(bounds)).toEqual({ start: 10, end: 50 });
  });

  describe("clampToBounds", () => {
    it("leaves a range untouched when it already sits inside the bounds", () => {
      const bounds = { start: 0, end: 1000 };
      const inside = { start: 100, end: 300 };
      expect(clampToBounds(inside, bounds)).toEqual(inside);
    });

    it("pulls a range that has panned before the bounds' start back in, keeping its span", () => {
      const bounds = { start: 50, end: 1000 };
      const clamped = clampToBounds({ start: -20, end: 180 }, bounds);
      expect(clamped.start).toBe(50);
      expect(clamped.end).toBe(250);
    });

    it("pulls a range that has panned past the bounds' end back in, keeping its span", () => {
      const bounds = { start: 0, end: 500 };
      const clamped = clampToBounds({ start: 450, end: 650 }, bounds);
      expect(clamped.end).toBe(500);
      expect(clamped.start).toBe(300);
    });

    it("collapses to the full bounds when the range's span is wider than the data itself", () => {
      const bounds = { start: 100, end: 200 }; // 100s of data
      const clamped = clampToBounds({ start: -500, end: 500 }, bounds); // 1000s window
      expect(clamped).toEqual({ start: 100, end: 200 });
    });
  });
});

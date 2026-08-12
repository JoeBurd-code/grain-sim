// Pure math for the chart's measure-mode drag-to-select (issue #39). Mirrors
// chartRange.js's shape -- a pure function over the chart's current time
// range plus plain pixel numbers, no DOM/React -- the same convention
// viewport.js uses for the scene's own screenToWorld.

// Converts one pixel x-coordinate (relative to the plot area's left edge)
// into a sim-time value under the chart's current visible range. Clamped to
// the plot's own width so a drag that runs past the plot's edge still
// reports a real in-range time instead of extrapolating into undefined time.
export function timeAtPixel(range, plotWidthPx, xPx) {
  if (plotWidthPx <= 0) return range.start;
  const frac = Math.min(1, Math.max(0, xPx / plotWidthPx));
  return range.start + frac * (range.end - range.start);
}

// Resolves a drag's start/current pixel positions into a time span, in the
// range's own natural order regardless of which direction the drag ran.
export function spanFromDrag(range, plotWidthPx, startXPx, currentXPx) {
  const a = timeAtPixel(range, plotWidthPx, startXPx);
  const b = timeAtPixel(range, plotWidthPx, currentXPx);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

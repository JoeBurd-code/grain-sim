// Pure time-range math for the chart dock's zoom/shift sliders. The visible
// window is a 1D range { start, end } in sim-seconds, derived from two
// independent 0..1 slider fractions against the full recorded data span:
// zoomFrac (0 = show all recorded history, 1 = the tightest window) and
// shiftFrac (0 = anchored to the oldest data, 1 = anchored to the newest).
// Replaces the drag-pan/wheel-zoom interaction this chart shipped with
// originally (issue #37) -- dragging directly on the chart didn't feel good,
// so explicit slider controls took its place.

export function rangeFromControls(bounds, zoomFrac, shiftFrac, minSpan) {
  const dataSpan = Math.max(0, bounds.end - bounds.start);
  const span = dataSpan <= minSpan ? dataSpan : dataSpan - zoomFrac * (dataSpan - minSpan);
  const slack = Math.max(0, dataSpan - span);
  const start = bounds.start + shiftFrac * slack;
  return { start, end: start + span };
}

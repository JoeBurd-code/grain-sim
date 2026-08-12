// Pure time-range math for the pan/zoom chart dock (issue #37). The visible
// window is a 1D range { start, end } in sim-seconds -- the time-axis
// analogue of the scene's 2D viewBox (see scene/viewport.js), with
// pan/zoom/scale functions mirroring that module's shape one dimension down.

export function screenToTime(range, width, screenX) {
  const scale = (range.end - range.start) / width;
  return range.start + screenX * scale;
}

export function timeToScreen(range, width, t) {
  const scale = (range.end - range.start) / width;
  return (t - range.start) / scale;
}

// Pan by a screen-pixel drag delta: content follows the cursor, so the range
// moves the opposite way, scaled into time units.
export function panBy(range, width, deltaScreenX) {
  const scale = (range.end - range.start) / width;
  const dt = deltaScreenX * scale;
  return { start: range.start - dt, end: range.end - dt };
}

// Zoom by factor (>1 = in) keeping the time under the cursor fixed. Optional
// limits clamp the resulting span so a runaway wheel can't zoom into a
// degenerate sliver or out past a useful range.
export function zoomAt(range, width, cursorX, factor, limits) {
  const span = range.end - range.start;
  if (limits) {
    const clampedSpan = Math.min(limits.maxSpan, Math.max(limits.minSpan, span / factor));
    factor = span / clampedSpan;
  }
  const anchor = screenToTime(range, width, cursorX);
  const newStart = anchor - (anchor - range.start) / factor;
  return { start: newStart, end: newStart + span / factor };
}

// Clamps a range so it never strays outside [bounds.start, bounds.end] -- the
// full recorded history -- keeping the range's span fixed unless the data
// span itself is narrower, in which case the range shrinks to fit it.
export function clampToBounds(range, bounds) {
  const span = range.end - range.start;
  const dataSpan = bounds.end - bounds.start;
  if (dataSpan <= span) return { start: bounds.start, end: bounds.end };
  let { start, end } = range;
  if (start < bounds.start) { start = bounds.start; end = start + span; }
  if (end > bounds.end) { end = bounds.end; start = end - span; }
  return { start, end };
}

// A range that frames [bounds.start, bounds.end] with a padding fraction of
// its span on each side. Used to reset to, or auto-follow, the full recorded
// history before the user's first pan/zoom.
export function fitToBounds(bounds, padFrac = 0) {
  const span = Math.max(bounds.end - bounds.start, 1e-6);
  const pad = span * padFrac;
  return { start: bounds.start - pad, end: bounds.end + pad };
}

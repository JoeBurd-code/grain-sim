// React glue for the chart's zoom/shift sliders: owns the two 0..1 slider
// fractions and derives the visible time range from them via the pure
// rangeFromControls (chartRange.js). No pointer/wheel/DOM plumbing needed --
// unlike the drag-pan/wheel-zoom version this replaced, sliders are plain
// controlled inputs, so the range is just a function of (dataBounds,
// zoomFrac, shiftFrac) recomputed on every render.
import { useState } from "react";
import { rangeFromControls } from "./chartRange";

const MIN_SPAN_SEC = 2;
const DEFAULT_ZOOM_FRAC = 0; // fully zoomed out: show the whole recorded history
const DEFAULT_SHIFT_FRAC = 1; // anchored to the newest data once zoomed in

export function useChartRange(dataBounds) {
  const [zoomFrac, setZoomFrac] = useState(DEFAULT_ZOOM_FRAC);
  const [shiftFrac, setShiftFrac] = useState(DEFAULT_SHIFT_FRAC);

  const range = rangeFromControls(dataBounds, zoomFrac, shiftFrac, MIN_SPAN_SEC);
  const shiftDisabled = range.end - range.start >= dataBounds.end - dataBounds.start;

  return { range, zoomFrac, setZoomFrac, shiftFrac, setShiftFrac, shiftDisabled };
}

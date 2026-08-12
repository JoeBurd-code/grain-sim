// React glue for the pure chart time-range math: owns the visible range
// state and exposes drag-pan / wheel-zoom handlers over it. Mirrors
// scene/useViewport.js one dimension down (viewBox -> time range), except it
// takes its container ref and measured width from the caller instead of
// measuring itself -- ChartDock already runs a ResizeObserver on its plot
// area for SVG canvas sizing, so this hook reuses that rather than doubling
// it up.
//
// `width` and `plotOffsetX` describe the plotted region in screen pixels,
// not the full measured container: ChartDock's plot area is inset by axis
// label margins, so a cursor position measured against the container's own
// left edge has to be shifted by `plotOffsetX` before it lines up with the
// pixel the chart actually draws that time value at -- otherwise the zoom
// anchor drifts off the cursor and pan distance stops tracking the drag 1:1.
//
// Auto-follow: until the user's first pan or zoom, the range tracks the full
// recorded data span (`dataBounds`) every render, so newly arriving samples
// stay in view -- the same "shows everything" feel the fixed-window chart had
// before this hook existed. The first manual gesture switches the chart to a
// frozen, user-controlled window; from then on every pan/zoom is clamped to
// `dataBounds` so the visible window can never stray into empty space, but it
// no longer auto-follows new samples.
import { useCallback, useEffect, useRef, useState } from "react";
import { clampToBounds, fitToBounds, panBy, zoomAt } from "./chartRange";

const DRAG_THRESHOLD_PX = 4;
const MIN_SPAN_SEC = 2;

export function useChartRange(dataBounds, containerRef, width, plotOffsetX = 0) {
  const widthRef = useRef(width);
  const plotOffsetXRef = useRef(plotOffsetX);
  const dataBoundsRef = useRef(dataBounds);
  const dragRef = useRef(null);
  const didDragRef = useRef(false);
  const manualRef = useRef(false);
  const [range, setRange] = useState(() => fitToBounds(dataBounds));

  useEffect(() => {
    widthRef.current = width;
    plotOffsetXRef.current = plotOffsetX;
  }, [width, plotOffsetX]);

  useEffect(() => {
    dataBoundsRef.current = dataBounds;
    if (manualRef.current) return;
    setRange(fitToBounds(dataBounds));
  }, [dataBounds]);

  // Wheel zoom needs a non-passive listener to preventDefault page scroll.
  // deltaY is normalised across deltaMode the same way useViewport.js does,
  // so the zoom speed feels the same regardless of how the OS/mouse reports it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const width = widthRef.current;
      if (!width) return;
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - plotOffsetXRef.current;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      const steps = (e.deltaY * unit) / 100;
      const factor = Math.exp(-steps * 0.28);
      manualRef.current = true;
      setRange((prev) => {
        if (!prev) return prev;
        const bounds = dataBoundsRef.current;
        const limits = { minSpan: MIN_SPAN_SEC, maxSpan: Math.max(bounds.end - bounds.start, MIN_SPAN_SEC) };
        return clampToBounds(zoomAt(prev, width, cursorX, factor, limits), bounds);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef]);

  // Pan tracking uses window listeners rather than pointer capture, matching
  // useViewport.js's rationale: capturing on the drag surface would redirect
  // later events to it, so a click ending a drag never has to fight for the
  // target it wants.
  useEffect(() => {
    const onMove = (e) => {
      const last = dragRef.current;
      if (!last) return;
      const dx = e.clientX - last.x;
      if (!didDragRef.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      didDragRef.current = true;
      dragRef.current = { x: e.clientX };
      const width = widthRef.current;
      if (!width) return;
      manualRef.current = true;
      setRange((prev) => (prev ? clampToBounds(panBy(prev, width, dx), dataBoundsRef.current) : prev));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX };
    didDragRef.current = false;
  }, []);

  const wasDrag = useCallback(() => didDragRef.current, []);

  return { range, wasDrag, handlers: { onPointerDown } };
}

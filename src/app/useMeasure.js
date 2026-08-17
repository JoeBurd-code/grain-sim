// React glue for the chart's measure mode (issue #39): owns whether measure
// mode is active and the currently-selected span, and derives the span from
// pointer drag events via the pure spanFromDrag (measureSpan.js) -- mirrors
// useChartRange's split of pure math vs React state, and useViewport's
// click-vs-drag threshold so a stray click while active doesn't clobber a
// measurement already on screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { spanFromDrag } from "./measureSpan";

const DRAG_THRESHOLD_PX = 3;

export function useMeasure() {
  const [active, setActive] = useState(false);
  const [span, setSpan] = useState(null);
  const dragRef = useRef(null); // { startXPx, range, rect, moved }

  const deactivate = useCallback(() => {
    dragRef.current = null;
    setSpan(null);
    setActive(false);
  }, []);

  const toggle = useCallback(() => {
    dragRef.current = null;
    setSpan(null);
    setActive((prev) => !prev);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && active) deactivate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, deactivate]);

  // Window-level pointermove/up, matching useViewport's own drag-tracking
  // convention -- pointer capture on the SVG would otherwise interfere with
  // the event-dot click handlers sharing the same surface.
  useEffect(() => {
    if (!active) return;
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const xPx = e.clientX - drag.rect.left;
      if (!drag.moved && Math.abs(xPx - drag.startXPx) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      setSpan(spanFromDrag(drag.range, drag.rect.width, drag.startXPx, xPx));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [active]);

  // `range` is the chart's current visible time range, captured fresh at
  // drag start so a mid-drag pan/zoom (or resize) can't retroactively
  // distort a measurement already in progress.
  const onPlotPointerDown = useCallback((e, range) => {
    if (!active || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startXPx: e.clientX - rect.left, range, rect, moved: false };
  }, [active]);

  return { active, toggle, span, onPlotPointerDown };
}

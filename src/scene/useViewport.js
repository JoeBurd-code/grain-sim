// React glue for the pure viewport math: measures the container, owns the
// viewBox state, and exposes drag-pan / wheel-zoom handlers plus fitTo().
// Click-vs-drag: a press that moves more than the threshold counts as a pan;
// wasDrag() lets click handlers ignore the click that ends a drag.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fitBounds, panBy, zoomAt } from "./viewport";

const FIT_PAD = 60;
const DRAG_THRESHOLD_PX = 4;

export function useViewport(homeBounds) {
  const containerRef = useRef(null);
  const dimsRef = useRef(null);
  const dragRef = useRef(null);
  const didDragRef = useRef(false);
  const [vb, setVb] = useState(null);

  const limits = useMemo(
    () => ({ minW: 200, maxW: Math.max(homeBounds.w, homeBounds.h) * 3 }),
    [homeBounds],
  );

  // Measure, fit initially, and re-aspect the current view on resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      dimsRef.current = { width: r.width, height: r.height };
      setVb((prev) =>
        prev
          ? fitBounds(prev, dimsRef.current, 0)
          : fitBounds(homeBounds, dimsRef.current, FIT_PAD),
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [homeBounds]);

  // Wheel zoom needs a non-passive listener to preventDefault page scroll.
  // deltaY is normalised across deltaMode (pixels vs lines vs pages) so the
  // zoom speed feels the same regardless of how the OS/mouse reports wheel.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const dims = dimsRef.current;
      if (!dims) return;
      const rect = el.getBoundingClientRect();
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      const steps = (e.deltaY * unit) / 100; // ~1 per wheel notch
      const factor = Math.exp(-steps * 0.28);
      setVb((prev) => (prev ? zoomAt(prev, dims, cursor, factor, limits) : prev));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [limits]);

  // Pan tracking uses window listeners rather than pointer capture: capturing
  // on the SVG would redirect the subsequent click to the SVG, so machine
  // clicks never reached their own handler and no popup opened.
  useEffect(() => {
    const onMove = (e) => {
      const last = dragRef.current;
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (!didDragRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      didDragRef.current = true;
      dragRef.current = { x: e.clientX, y: e.clientY };
      const dims = dimsRef.current;
      if (!dims) return;
      setVb((prev) => (prev ? panBy(prev, dims, { x: dx, y: dy }) : prev));
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
    dragRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
  }, []);

  const fitTo = useCallback((bounds) => {
    const dims = dimsRef.current;
    if (!dims) return;
    setVb(fitBounds(bounds, dims, FIT_PAD));
  }, []);

  const wasDrag = useCallback(() => didDragRef.current, []);

  return {
    containerRef,
    vb,
    fitTo,
    wasDrag,
    handlers: { onPointerDown },
  };
}

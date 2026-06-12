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
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const dims = dimsRef.current;
      if (!dims) return;
      const rect = el.getBoundingClientRect();
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = Math.exp(-e.deltaY * 0.0015);
      setVb((prev) => (prev ? zoomAt(prev, dims, cursor, factor, limits) : prev));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [limits]);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
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
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
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
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}

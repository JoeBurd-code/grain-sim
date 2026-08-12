// Drives the flow-overlay's per-frame stroke-dashoffset directly via refs —
// a second, independent requestAnimationFrame loop from the sim engine's own
// (useSimEngine.js): this loop only ever reads the latest published
// snapshot, it never steps the sim. Kept as its own hook, not folded into
// Scene's render, so Scene stays declarative scene structure and this stays
// the one place mutating per-frame attributes imperatively, per the locked
// architecture (see Scene.jsx's own header comment).
import { useEffect, useRef } from "react";
import { computeConnectionFlowRatios } from "./flowAnimation";

// Dash pattern for the flow overlay: short marks with a longer gap read as
// discrete travelling dots rather than a solid moving stripe. Exported so
// Scene's JSX and this loop's own DASH_CYCLE stay the one pattern, not two
// numbers that could quietly drift apart.
export const FLOW_DASH_PATTERN = "3 9";
const DASH_CYCLE = 3 + 9;
// Dash travel speed, in scene (viewBox) units per second, when a
// connection's live flow exactly matches its own nominal rate — an
// arbitrary render-pace pick (there's no physical belt speed to derive it
// from at this abstraction), tuned so a several-hundred-unit connection
// reads as visibly, continuously flowing rather than a slow crawl.
const PX_PER_SEC_AT_NOMINAL = 26;
const VISIBLE_OPACITY = 0.9;
const FLOWING_EPS = 1e-4;

export function useFlowAnimation(line, simSnap) {
  const pathRefs = useRef(new Map()); // connection index -> SVGPathElement
  const ratiosRef = useRef(new Map()); // connection index -> live/nominal ratio
  const offsetsRef = useRef(new Map()); // connection index -> current dash offset
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  useEffect(() => {
    ratiosRef.current = computeConnectionFlowRatios(line, simSnap);
  }, [line, simSnap]);

  useEffect(() => {
    function frame(ts) {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dtReal = Math.min(0.1, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      for (const [idx, el] of pathRefs.current) {
        const ratio = ratiosRef.current.get(idx) ?? 0;
        const flowing = ratio > FLOWING_EPS;
        // The base connection path (Scene.jsx) already carries the static
        // direction marker and stream styling, untouched by this loop — this
        // overlay only ever adds motion on top of it, and disappears
        // entirely rather than sitting frozen-but-visible when there is
        // nothing actually flowing (acceptance criterion: no motion, marker
        // still visible).
        el.setAttribute("opacity", flowing ? String(VISIBLE_OPACITY) : "0");
        if (flowing) {
          const prev = offsetsRef.current.get(idx) ?? 0;
          // Decreasing offset moves the dash pattern in the path's own
          // from -> to direction, the standard SVG "flowing dashes" trick.
          const next = (prev - ratio * PX_PER_SEC_AT_NOMINAL * dtReal) % DASH_CYCLE;
          offsetsRef.current.set(idx, next);
          el.setAttribute("stroke-dashoffset", String(next));
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Ref-callback factory handed to Scene's JSX, one per connection index —
  // registers/deregisters that path element in pathRefs without Scene ever
  // needing to know this hook's own internals.
  return (idx) => (el) => {
    if (el) pathRefs.current.set(idx, el);
    else pathRefs.current.delete(idx);
  };
}

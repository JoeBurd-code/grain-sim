// Build mode box select (issue #95). A press on empty canvas draws a box
// instead of panning the view; on release every machine the box touches is
// handed to `onSelectBox`, with `additive` set when Shift was held so the
// box adds to the selection instead of replacing it. While it is drawn,
// `box` holds it in world space for the scene to show.
//
// Like useMachineDrag, tracking uses window listeners, not pointer capture,
// so the click that ends a press still reaches the canvas.
import { useCallback, useEffect, useRef, useState } from "react";
import { machinesInBox } from "../line/groups";
import { toWorld } from "./useMachineDrag";

const DRAG_THRESHOLD_PX = 4;

export function useBoxSelect(line, onSelectBox) {
  const lineRef = useRef(line);
  const onSelectRef = useRef(onSelectBox);
  useEffect(() => {
    lineRef.current = line;
    onSelectRef.current = onSelectBox;
  }, [line, onSelectBox]);

  const pressRef = useRef(null);
  const boxRef = useRef(null);
  const [box, setBox] = useState(null);
  const showBox = (next) => {
    boxRef.current = next;
    setBox(next);
  };

  useEffect(() => {
    const onPointerMove = (e) => {
      const press = pressRef.current;
      if (!press || press.done) return;
      if (!press.moved && Math.hypot(e.clientX - press.screen.x, e.clientY - press.screen.y) < DRAG_THRESHOLD_PX) return;
      press.moved = true;
      const world = toWorld(press.svg, e);
      showBox({ x: press.start.x, y: press.start.y, w: world.x - press.start.x, h: world.y - press.start.y });
    };
    const onPointerUp = () => {
      const press = pressRef.current;
      if (!press || press.done) return;
      press.done = true;
      const last = boxRef.current;
      showBox(null);
      if (press.moved && last) onSelectRef.current(machinesInBox(lineRef.current, last), press.additive);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const onCanvasPointerDown = useCallback((e) => {
    const svg = e.currentTarget.ownerSVGElement ?? e.currentTarget;
    pressRef.current = {
      svg, start: toWorld(svg, e), screen: { x: e.clientX, y: e.clientY },
      additive: e.shiftKey, moved: false, done: false,
    };
  }, []);

  // Whether the last press drew a box, so the click that ends it does not
  // also clear the selection.
  const wasDrag = useCallback(() => Boolean(pressRef.current?.moved), []);

  return { box, onCanvasPointerDown, wasDrag };
}

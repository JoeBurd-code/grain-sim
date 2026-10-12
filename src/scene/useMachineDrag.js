// Build mode machine dragging (issue #86). A press on a machine drags that
// machine instead of panning the view. While it moves, `preview` holds where
// it would land (snapped to the grid unless Alt is held) and which machine
// it would sit on, if any. On release the move is handed to `onMove`; a
// drop on top of another machine lands at the last free position the drag
// passed through instead, and `flashId` outlines the machine in red for a
// moment.
//
// Like useViewport's pan, tracking uses window listeners, not pointer
// capture, so the click that ends a press still reaches the machine.
import { useCallback, useEffect, useRef, useState } from "react";
import { overlappingMachine, snapPosition } from "../line/layout";

const DRAG_THRESHOLD_PX = 4;
const FLASH_MS = 600;

// The pointer's position in the SVG's world (viewBox) space.
function toWorld(svg, e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

export function useMachineDrag(line, onMove) {
  const lineRef = useRef(line);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    lineRef.current = line;
    onMoveRef.current = onMove;
  }, [line, onMove]);

  const dragRef = useRef(null); // the drag in progress
  const pressRef = useRef(null); // the last press on a machine, kept after release
  const previewRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const flashTimerRef = useRef(0);
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  const showPreview = (next) => {
    previewRef.current = next;
    setPreview(next);
  };

  useEffect(() => {
    const onPointerMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.screen.x, e.clientY - drag.screen.y) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      const world = toWorld(drag.svg, e);
      const pos = snapPosition(
        { x: drag.origin.x + world.x - drag.start.x, y: drag.origin.y + world.y - drag.start.y },
        !e.altKey,
      );
      const overlaps = overlappingMachine(lineRef.current, drag.id, pos);
      if (!overlaps) drag.lastFree = pos;
      showPreview({ id: drag.id, pos, overlaps });
    };
    const onPointerUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      const last = previewRef.current;
      showPreview(null);
      if (!drag?.moved || !last) return;
      if (last.overlaps) {
        clearTimeout(flashTimerRef.current);
        setFlashId(drag.id);
        flashTimerRef.current = setTimeout(() => setFlashId(null), FLASH_MS);
      }
      onMoveRef.current(drag.id, last.overlaps ? drag.lastFree : last.pos);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const onMachinePointerDown = useCallback((e, machine) => {
    if (e.button !== 0) return;
    // Not a pan: the view stays where it is while a machine moves.
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement;
    const origin = { x: machine.x, y: machine.y };
    dragRef.current = {
      id: machine.id, svg, origin, lastFree: origin, moved: false,
      start: toWorld(svg, e), screen: { x: e.clientX, y: e.clientY },
    };
    pressRef.current = dragRef.current;
  }, []);

  // The click that ends a press is judged by what that press did. A press
  // on the canvas is useViewport's (a pan or a click); a press on a machine
  // is a click only when the machine did not move. `wasDrag` wraps the
  // viewport's own test so Scene's click handlers need only one.
  const onCanvasPointerDown = useCallback(() => { pressRef.current = null; }, []);
  const wasDrag = useCallback(
    (viewportWasDrag) => (pressRef.current ? pressRef.current.moved : viewportWasDrag()),
    [],
  );

  return { preview, flashId, onMachinePointerDown, onCanvasPointerDown, wasDrag };
}

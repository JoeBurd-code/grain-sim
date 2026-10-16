// Build mode machine dragging (issue #86). A press on a machine drags that
// machine instead of panning the view, or, when the machine is part of the
// selected group (issue #95), the whole group. While it moves, `preview`
// holds the ids moving and the step they would move by (snapped so the
// pressed machine lands on the grid unless Alt is held) and which machine
// they would sit on, if any. On release the move is handed to `onMove`; a
// drop on top of another machine lands at the last free step the drag
// passed through instead, and `flashIds` outlines the moved machines in
// red for a moment.
//
// Like useViewport's pan, tracking uses window listeners, not pointer
// capture, so the click that ends a press still reaches the machine.
import { useCallback, useEffect, useRef, useState } from "react";
import { snapPosition } from "../line/layout";
import { overlappingGroup } from "../line/groups";

const DRAG_THRESHOLD_PX = 4;
const FLASH_MS = 600;

// The pointer's position in the SVG's world (viewBox) space.
export function toWorld(svg, e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

export function useMachineDrag(line, onMove, selectedIds) {
  const lineRef = useRef(line);
  const onMoveRef = useRef(onMove);
  const selectedRef = useRef(selectedIds);
  useEffect(() => {
    lineRef.current = line;
    onMoveRef.current = onMove;
    selectedRef.current = selectedIds;
  }, [line, onMove, selectedIds]);

  const dragRef = useRef(null); // the drag in progress
  const pressRef = useRef(null); // the last press on a machine, kept after release
  const previewRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [flashIds, setFlashIds] = useState(null);
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
      const delta = { x: pos.x - drag.origin.x, y: pos.y - drag.origin.y };
      const overlaps = overlappingGroup(lineRef.current, drag.ids, delta);
      if (!overlaps) drag.lastFree = delta;
      showPreview({ ids: drag.ids, delta, overlaps });
    };
    const onPointerUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      const last = previewRef.current;
      showPreview(null);
      if (!drag?.moved || !last) return;
      if (last.overlaps) {
        clearTimeout(flashTimerRef.current);
        setFlashIds(drag.ids);
        flashTimerRef.current = setTimeout(() => setFlashIds(null), FLASH_MS);
      }
      onMoveRef.current(drag.ids, last.overlaps ? drag.lastFree : last.delta);
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
    const selected = selectedRef.current ?? [];
    const ids = selected.includes(machine.id) ? selected : [machine.id];
    dragRef.current = {
      ids, svg, origin, lastFree: { x: 0, y: 0 }, moved: false,
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

  return { preview, flashIds, onMachinePointerDown, onCanvasPointerDown, wasDrag };
}

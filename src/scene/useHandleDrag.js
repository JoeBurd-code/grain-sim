// Build mode length handles (issue #157): a press on a handle drawn over the
// selected machine drags it. While it moves, `preview` holds the machine,
// the handle, how far the pointer has moved in world space since the press
// and whether Alt is held (finer steps); the owner draws the machine
// reshaped from that. On release the drag is handed to `onRelease`, once,
// so one drag is one edit. What a handle changes is the owner's business
// (line/lengthHandles.js), so any machine's handles can use this.
//
// Like useMachineDrag, tracking uses window listeners, not pointer capture.
import { useCallback, useEffect, useRef, useState } from "react";
import { toWorld } from "./useMachineDrag";

// The click that ends a drag lands wherever the pointer was let go, often
// the canvas, whose click would clear the selection. It is stopped before
// it reaches anything; one that never comes stops nothing later.
function swallowClick() {
  const stop = (e) => e.stopPropagation();
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
}

export function useHandleDrag(onRelease) {
  const onReleaseRef = useRef(onRelease);
  useEffect(() => { onReleaseRef.current = onRelease; }, [onRelease]);

  const dragRef = useRef(null);
  const previewRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const showPreview = (next) => {
    previewRef.current = next;
    setPreview(next);
  };

  useEffect(() => {
    const onPointerMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const world = toWorld(drag.svg, e);
      showPreview({
        machineId: drag.machineId, handleId: drag.handleId,
        delta: { x: world.x - drag.start.x, y: world.y - drag.start.y }, fine: e.altKey,
      });
    };
    const onPointerUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const last = previewRef.current;
      showPreview(null);
      // A press that never moved is a click, left to reach what was
      // pressed: a click on a name label (issue #158) selects its machine.
      // A length handle stops its own click, so it never reselects.
      if (!last) return;
      swallowClick();
      onReleaseRef.current(last);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const onHandlePointerDown = useCallback((e, machineId, handleId) => {
    if (e.button !== 0) return;
    // Not a pan, a box select or a machine move.
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement;
    dragRef.current = { svg, machineId, handleId, start: toWorld(svg, e) };
  }, []);

  return { preview, onHandlePointerDown };
}

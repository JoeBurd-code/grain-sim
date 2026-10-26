// Build mode port-to-port connecting (issue #88). A press on a port dot
// drags a line instead of panning the view or moving a machine; on release,
// the nearest port under the pointer (if any, within PORT_HIT_RADIUS) is
// handed to `onConnect` along with the port the drag started from.
// `onConnect` returns { ok, error } the same shape every line document
// function does; a refusal shows as a transient message rather than
// silently doing nothing, the "clear feedback" issue #88 asks for.
//
// Like useMachineDrag, tracking uses window listeners, not pointer capture,
// and the drawn line (the `draft`) is plain React state: a drag update is
// not a per-frame animation, so there is no need for the imperative-ref
// pattern Scene's own per-tick motion uses.
import { useCallback, useEffect, useRef, useState } from "react";
import { toWorld } from "./useMachineDrag";
import { anchorWorld } from "../line/layout";

const PORT_HIT_RADIUS = 14;
const ERROR_MS = 2600;

// Every port on the line's machines, each with its world position, for
// hit-testing where a connection drag was released.
function allPorts(line) {
  const ports = [];
  for (const m of line.machines) {
    for (const port of [...m.ports.inputs, ...m.ports.outputs]) {
      ports.push({ machine: m.id, port, world: anchorWorld(m, port) });
    }
  }
  return ports;
}

function nearestPort(line, world) {
  let best = null;
  for (const p of allPorts(line)) {
    const dist = Math.hypot(p.world.x - world.x, p.world.y - world.y);
    if (dist <= PORT_HIT_RADIUS && (!best || dist < best.dist)) best = { ...p, dist };
  }
  return best;
}

export function useConnectionDrag(line, onConnect) {
  const lineRef = useRef(line);
  const onConnectRef = useRef(onConnect);
  useEffect(() => {
    lineRef.current = line;
    onConnectRef.current = onConnect;
  }, [line, onConnect]);

  const dragRef = useRef(null);
  const [draft, setDraft] = useState(null); // { from: {x,y}, to: {x,y} }
  const [error, setError] = useState(null);
  const errorTimerRef = useRef(0);
  useEffect(() => () => clearTimeout(errorTimerRef.current), []);

  const showError = (message) => {
    clearTimeout(errorTimerRef.current);
    setError(message);
    errorTimerRef.current = setTimeout(() => setError(null), ERROR_MS);
  };

  useEffect(() => {
    const onPointerMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      setDraft({ from: drag.from, to: toWorld(drag.svg, e) });
    };
    const onPointerUp = (e) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDraft(null);
      if (!drag) return;
      const world = toWorld(drag.svg, e);
      const target = nearestPort(lineRef.current, world);
      if (!target || (target.machine === drag.machine && target.port === drag.port)) return;
      const result = onConnectRef.current(
        { machine: drag.machine, port: drag.port },
        { machine: target.machine, port: target.port },
      );
      if (!result.ok) showError(result.error);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const onPortPointerDown = useCallback((e, machine, port) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement;
    const from = anchorWorld(machine, port);
    dragRef.current = { svg, machine: machine.id, port, from };
    setDraft({ from, to: toWorld(svg, e) });
  }, []);

  return { draft, error, onPortPointerDown };
}

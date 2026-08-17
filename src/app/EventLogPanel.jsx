// Left-side, toggleable drawer listing every machine's interlock events
// together (issue #33), tagged by source machine, newest at top. Reads the
// combined event list engine.js/control.js already publish (issue #29) —
// this panel is a pure view over that one source of truth, independent of
// each machine's own popup event log (MachinePopup.jsx), which is left as-is.
//
// Each machine's tag color comes from plotColorFor (plotColors.js), the same
// lookup ChartDock.jsx uses for that machine's line -- not a color list of
// this panel's own -- so a machine's tag here always matches its line color
// on the chart, letting a presenter associate the two at a glance.
//
// `jumpTo` (issue #38) is a `{ idx, token }` naming one entry's position in
// the untouched `events` list -- the same index a chart event dot's click
// reports (ChartDock.jsx). `token` changes on every click, including
// re-clicks of the same dot, so the scroll re-fires even when the target was
// already on screen. Jumping always shows the target regardless of the
// current per-machine filter: its machine is unhidden first if needed, via
// the "adjust state during render" pattern (not an effect) so the unhide is
// committed before this same render's `ordered` list and row refs are built
// -- see https://react.dev/learn/you-might-not-need-an-effect.
import { useLayoutEffect, useRef, useState } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";
import { plotColorFor } from "./plotColors";

export default function EventLogPanel({ machines, events, onClose, jumpTo }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [handledJumpToken, setHandledJumpToken] = useState(null);
  const scrollRef = useRef(null);
  const prevHeightRef = useRef(null);
  const rowRefs = useRef(new Map());
  const scrolledJumpTokenRef = useRef(null);

  const toggleMachine = (id) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (jumpTo && jumpTo.token !== handledJumpToken) {
    const target = events[jumpTo.idx];
    if (target && hidden.has(target.machineId)) {
      const next = new Set(hidden);
      next.delete(target.machineId);
      setHidden(next);
    }
    setHandledJumpToken(jumpTo.token);
  }

  // Tag with each event's position in the untouched chronological list so
  // React keys stay stable across re-filtering and reversal, then filter
  // and reverse for newest-at-top display.
  const ordered = events
    .map((e, i) => ({ ...e, _idx: i }))
    .filter((e) => !hidden.has(e.machineId))
    .reverse();

  // New events are prepended visually (newest at top). Left untouched,
  // that would leave scrollTop numerically unchanged while the content it
  // was anchored to shifts downward, reading as a jump to the reader.
  // Compensating scrollTop by the resulting height delta keeps whatever
  // was on screen in place regardless of where the reader had scrolled to.
  //
  // An unscrolled jumpTo takes priority over that compensation for this
  // render: scroll straight to the target row instead, and flash it (the
  // .event-row-flash keyframes, MeetingApp.jsx's shared stylesheet) so it's
  // obvious which entry the chart dot that was just clicked refers to. By
  // the time this effect runs, the render-time unhide above has already
  // committed and `ordered` reflects it, so the target row is in `rowRefs`
  // whenever the jump names a real event. The class is toggled off then
  // back on via a forced reflow (classList, not React state) so a re-click
  // of the same dot restarts the animation instead of it being a no-op --
  // scene/symbols.jsx's InstrumentDot gets the same restart for free by
  // remounting a fresh element (`key={pulseGen}`) instead, which isn't an
  // option here since this row's own key must stay stable (see above).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (jumpTo && jumpTo.token !== scrolledJumpTokenRef.current) {
      const row = rowRefs.current.get(jumpTo.idx);
      scrolledJumpTokenRef.current = jumpTo.token;
      if (row) {
        row.scrollIntoView({ block: "center" });
        row.classList.remove("event-row-flash");
        void row.offsetWidth;
        row.classList.add("event-row-flash");
        prevHeightRef.current = el.scrollHeight;
        return;
      }
    }
    if (prevHeightRef.current !== null) {
      const diff = el.scrollHeight - prevHeightRef.current;
      if (diff !== 0) el.scrollTop += diff;
    }
    prevHeightRef.current = el.scrollHeight;
  }, [events, hidden, jumpTo]);

  const sectionTitle = {
    fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: "uppercase",
    margin: "12px 0 6px", borderBottom: `1px solid ${C.line}`, paddingBottom: 4,
  };

  return (
    <div style={{
      position: "absolute", top: 12, left: 12, width: 300, maxHeight: "calc(100% - 24px)",
      // Issue #53: the chart dock became a fixed-position overlay (z-index 20/21)
      // instead of a layout sibling that shrank `main`, so a tall panel can now
      // reach behind it -- stay above so the dock's slide never covers it.
      zIndex: 30,
      display: "flex", flexDirection: "column", background: C.panel, border: `1px solid ${C.line}`,
      borderRadius: 8, padding: 14, fontFamily: FONT_MONO, boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flex: "none" }}>
        <div style={{ fontFamily: FONT_DISP, fontSize: 15, letterSpacing: 0.5, color: C.text, lineHeight: 1.2 }}>
          EVENT LOG
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent", color: C.muted, border: `1px solid ${C.line}`,
            borderRadius: 4, cursor: "pointer", fontFamily: FONT_MONO, fontSize: 11,
            lineHeight: 1, padding: "4px 7px",
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: "none" }}>
        <div style={sectionTitle}>machines</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {machines.map((m) => {
            const color = plotColorFor(m.id);
            const active = !hidden.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggleMachine(m.id)}
                style={{
                  background: active ? color : "transparent",
                  color: active ? "#1a1a14" : C.muted,
                  border: `1px solid ${active ? color : C.line}`,
                  borderRadius: 3, cursor: "pointer", fontFamily: FONT_MONO,
                  fontSize: 8, letterSpacing: 0.5, padding: "2px 6px",
                }}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...sectionTitle, flex: "none" }}>events</div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {ordered.length === 0 ? (
          <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", padding: "2px 0 4px" }}>
            no events yet
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {ordered.map((e) => {
              const color = plotColorFor(e.machineId);
              return (
                <div
                  key={e._idx}
                  ref={(el) => {
                    if (el) rowRefs.current.set(e._idx, el);
                    else rowRefs.current.delete(e._idx);
                  }}
                  style={{ fontSize: 10, lineHeight: 1.4, padding: "2px 4px", margin: "-2px -4px" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ color: C.wheat }}>{e.t.toFixed(1)}s</span>
                    <span style={{ color, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>
                      {e.machineName}
                    </span>
                  </div>
                  <div style={{ color: C.text }}>{e.message}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

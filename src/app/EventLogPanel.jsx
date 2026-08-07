// Left-side, toggleable drawer listing every machine's interlock events
// together (issue #33), tagged by source machine, newest at top. Reads the
// combined event list engine.js/control.js already publish (issue #29) —
// this panel is a pure view over that one source of truth, independent of
// each machine's own popup event log (MachinePopup.jsx), which is left as-is.
import { useLayoutEffect, useRef, useState } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

const TAG_COLORS = [C.wheat, C.green, "#5a9ea0", C.red, "#b07cc6", C.amber];

export default function EventLogPanel({ machines, events, onClose }) {
  const [hidden, setHidden] = useState(() => new Set());
  const scrollRef = useRef(null);
  const prevHeightRef = useRef(null);

  const toggleMachine = (id) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeightRef.current !== null) {
      const diff = el.scrollHeight - prevHeightRef.current;
      if (diff !== 0) el.scrollTop += diff;
    }
    prevHeightRef.current = el.scrollHeight;
  }, [events, hidden]);

  const sectionTitle = {
    fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: "uppercase",
    margin: "12px 0 6px", borderBottom: `1px solid ${C.line}`, paddingBottom: 4,
  };

  return (
    <div style={{
      position: "absolute", top: 12, left: 12, width: 300, maxHeight: "calc(100% - 24px)",
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
          {machines.map((m, i) => {
            const color = TAG_COLORS[i % TAG_COLORS.length];
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
              const idx = machines.findIndex((m) => m.id === e.machineId);
              const color = TAG_COLORS[(idx < 0 ? 0 : idx) % TAG_COLORS.length];
              return (
                <div key={e._idx} style={{ fontSize: 10, lineHeight: 1.4 }}>
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

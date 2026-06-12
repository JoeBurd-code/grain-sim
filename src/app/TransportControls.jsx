// Run / pause / step / speed controls as live-look stubs: state toggles
// visually so the final demo's chrome is shown, but nothing simulates yet.
import { useState } from "react";
import { C, FONT_MONO } from "../scene/theme";

const SPEEDS = [1, 5, 20];

function btnStyle(active) {
  return {
    background: active ? C.wheat : "transparent",
    color: active ? "#1a1a14" : C.muted,
    border: `1px solid ${active ? C.wheat : C.line}`,
    borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO,
    fontSize: 10, letterSpacing: "0.08em", cursor: "pointer",
  };
}

export default function TransportControls() {
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(5);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button style={btnStyle(running)} onClick={() => setRunning((r) => !r)}>
        {running ? "■ PAUSE" : "▶ RUN"}
      </button>
      <button style={btnStyle(false)} onClick={() => {}}>
        ⏭ STEP
      </button>
      <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
        {SPEEDS.map((s) => (
          <button key={s} style={btnStyle(speed === s)} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
      <span style={{ fontSize: 8, color: C.muted, fontStyle: "italic", marginLeft: 6 }}>
        engine<br />pending
      </span>
    </div>
  );
}

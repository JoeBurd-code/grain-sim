// Run / pause / step / speed controls, wired to the live sim engine (see
// src/sim/useSimEngine.js). Step is disabled while running since it has no
// meaning mid-loop. This cluster means "control the clock" — it never
// touches plant state beyond what running the clock naturally does. Plant
// state itself (issue #45's trip reset) lives in the separate PlantControls
// cluster, kept visually apart so a presenter reaching for "restart the
// run" and one reaching for "clear a trip" are never the same button.
import { C, FONT_MONO } from "../scene/theme";

const SPEEDS = [1, 5, 20];

function btnStyle(active, disabled) {
  return {
    background: active ? C.wheat : "transparent",
    color: active ? "#1a1a14" : C.muted,
    border: `1px solid ${active ? C.wheat : C.line}`,
    borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO,
    fontSize: 10, letterSpacing: "0.08em", cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}

// `runDisabledReason` (issue #89): the one problem that blocks RUN -- no
// Grain in (or other source) on the line. Null means RUN is not blocked.
export default function TransportControls({
  running, onStart, onPause, onStep, onRestart, speed, onSpeedChange, elapsed, runDisabledReason,
}) {
  const runBlocked = !running && Boolean(runDisabledReason);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        style={btnStyle(running, runBlocked)}
        onClick={running ? onPause : onStart}
        disabled={runBlocked}
        title={runBlocked ? runDisabledReason : undefined}
      >
        {running ? "■ PAUSE" : "▶ RUN"}
      </button>
      {runBlocked && (
        <span style={{ fontSize: 10, color: C.red, fontFamily: FONT_MONO, letterSpacing: "0.04em" }}>
          {runDisabledReason}
        </span>
      )}
      <button style={btnStyle(false, running)} onClick={onStep} disabled={running}>
        ⏭ STEP
      </button>
      <button style={btnStyle(false)} onClick={onRestart}>
        ↺ RESTART
      </button>
      <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
        {SPEEDS.map((s) => (
          <button key={s} style={btnStyle(speed === s)} onClick={() => onSpeedChange(s)}>
            {s}×
          </button>
        ))}
      </div>
      <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_MONO, letterSpacing: "0.08em", marginLeft: 4 }}>
        {elapsed.toFixed(1)}s elapsed
      </span>
    </div>
  );
}

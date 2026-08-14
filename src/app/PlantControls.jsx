// Plant-level controls, wired to the live sim engine (see
// src/sim/useSimEngine.js). This cluster means "control the plant" — the
// counterpart to TransportControls' "control the clock" — kept visually
// separate (a red-accented border, not the wheat/muted styling every other
// header button uses) so a presenter reaching for RESET TRIPS is never
// reaching for RESTART by mistake. The trip reset (issue #45) is its first
// occupant; a real SCADA panel groups plant-safety actions the same way.
//
// The source selector (issue #46) is its second: one click each, same as
// RESET TRIPS, per the parent spec's "every new control is a setter on the
// existing engine surface" instruction — no popup, no per-machine hunt.
import { C, FONT_MONO } from "../scene/theme";

const clusterStyle = {
  display: "flex", alignItems: "center", gap: 6,
  border: `1px solid ${C.red}`, borderRadius: 4, padding: "3px 6px",
};

const labelStyle = {
  fontSize: 9, letterSpacing: "0.08em", color: C.red, marginRight: 2,
};

const btnStyle = {
  background: "transparent", color: C.red, border: `1px solid ${C.red}`,
  borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO,
  fontSize: 10, letterSpacing: "0.08em", cursor: "pointer",
};

// Filled, not outlined, when its position is the one currently selected —
// the same "filled = active" convention MeetingApp's own EVENT LOG toggle
// already uses, just in the cluster's red rather than wheat.
const activeBtnStyle = {
  ...btnStyle, background: C.red, color: "#1a1a14",
};

const SOURCES = [
  { id: "treatingLine", label: "TREATING LINE" },
  { id: "proBox", label: "PRO BOX" },
];

export default function PlantControls({ onResetTrips, source, onSetSource }) {
  return (
    <div style={clusterStyle}>
      <span style={labelStyle}>PLANT</span>
      <span style={{ ...labelStyle, marginLeft: 4 }}>SOURCE</span>
      {SOURCES.map((s) => (
        <button
          key={s.id}
          style={source === s.id ? activeBtnStyle : btnStyle}
          onClick={() => onSetSource(s.id)}
        >
          {s.label}
        </button>
      ))}
      <button style={btnStyle} onClick={onResetTrips}>
        ⚠ RESET TRIPS
      </button>
    </div>
  );
}

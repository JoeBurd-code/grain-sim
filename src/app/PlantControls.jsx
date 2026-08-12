// Plant-level controls, wired to the live sim engine (see
// src/sim/useSimEngine.js). This cluster means "control the plant" — the
// counterpart to TransportControls' "control the clock" — kept visually
// separate (a red-accented border, not the wheat/muted styling every other
// header button uses) so a presenter reaching for RESET TRIPS is never
// reaching for RESTART by mistake. The trip reset (issue #45) is its first
// occupant; a real SCADA panel groups plant-safety actions the same way.
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

export default function PlantControls({ onResetTrips }) {
  return (
    <div style={clusterStyle}>
      <span style={labelStyle}>PLANT</span>
      <button style={btnStyle} onClick={onResetTrips}>
        ⚠ RESET TRIPS
      </button>
    </div>
  );
}

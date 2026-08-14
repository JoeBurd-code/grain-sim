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
//
// The destination selector and the bin-empty control (issue #47) are its
// third and fourth: same one-click shape, same cluster — the acceptance
// criteria are explicit that both live here, not in a per-machine popup.
// EMPTY BIN only renders while the current destination is actually a metal
// bin (the other two destinations have nothing this control could act on),
// so the cluster never shows a button with nothing to do.
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

// Four positions, one control (issue #47): the metal bin choice is part of
// choosing the destination, per the FD's own sequence pre-check ("select
// treated outlet metal bin no. when that destination is chosen") — not a
// separate dial alongside these four.
const DESTINATIONS = [
  { id: "concetti", label: "CONCETTI" },
  { id: "flexicon", label: "FLEXICON" },
  { id: "metalBin1", label: "METAL BIN 1" },
  { id: "metalBin2", label: "METAL BIN 2" },
];

// The two metal-bin destination ids double as their own machine ids
// (lineData.js), so EMPTY BIN needs only a membership check, not a lookup.
const METAL_BIN_DESTINATIONS = new Set(["metalBin1", "metalBin2"]);

export default function PlantControls({
  onResetTrips, source, onSetSource, destination, onSetDestination, onEmptyBin,
}) {
  const emptyableBinId = METAL_BIN_DESTINATIONS.has(destination) ? destination : null;
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
      <span style={{ ...labelStyle, marginLeft: 4 }}>DESTINATION</span>
      {DESTINATIONS.map((d) => (
        <button
          key={d.id}
          style={destination === d.id ? activeBtnStyle : btnStyle}
          onClick={() => onSetDestination(d.id)}
        >
          {d.label}
        </button>
      ))}
      {emptyableBinId && (
        <button style={btnStyle} onClick={() => onEmptyBin(emptyableBinId)}>
          EMPTY BIN
        </button>
      )}
      <button style={btnStyle} onClick={onResetTrips}>
        ⚠ RESET TRIPS
      </button>
    </div>
  );
}

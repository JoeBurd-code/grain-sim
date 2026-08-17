// Plant-level controls, wired to the live sim engine (see
// src/sim/useSimEngine.js). This cluster means "control the plant" — the
// counterpart to TransportControls' "control the clock". It lives on its own
// full-width row under the rest of the header (MeetingApp.jsx) rather than
// competing for space with transport/zone nav on one line, and is split into
// three labeled, bordered sections — SOURCE, DESTINATION, SAFETY — instead of
// one undifferentiated row (issue #54), so a presenter can scan by category
// instead of reading every button.
//
// Severity is what drives color, not membership in this component (issue
// #54): SOURCE/DESTINATION/EMPTY BIN are routine operating choices, styled
// neutral/wheat like every other non-danger header button (zonebtn,
// TransportControls). CONTROLLED STOP, RESET TRIPS, and UTILITIES are plant-
// safety actions and keep the original red accent so a presenter reaching
// for RESET TRIPS is never reaching for RESTART by mistake.
//
// The trip reset (issue #45) is the safety section's first occupant; a real
// SCADA panel groups plant-safety actions the same way.
//
// The source selector (issue #46) is the source section's occupant: one
// click each, per the parent spec's "every new control is a setter on the
// existing engine surface" instruction — no popup, no per-machine hunt.
//
// The destination selector and the bin-empty control (issue #47) share the
// destination section — the acceptance criteria are explicit that both live
// here, not in a per-machine popup. EMPTY BIN only renders while the current
// destination is actually a metal bin (the other two destinations have
// nothing this control could act on), so the section never shows a button
// with nothing to do.
//
// CONTROLLED STOP (issue #50) sits in the safety section: the demonstrable
// counterpart to RESET TRIPS — a trip strands product, a controlled stop
// drains the line — so it sits right beside it. One button, two states (the
// same toggle shape TransportControls' own RUN/PAUSE already uses):
// CONTROLLED STOP while running, RESUME LINE once a drain is in progress or
// has settled. It doesn't latch (sim/controlledStop.js), so resuming needs no
// trip reset.
//
// UTILITIES (issue #51) is the safety section's third occupant: the
// presenter's own single toggle standing in for the three utility sequences
// the line can't run without (sim/utilitiesTrip.js) — filled/active the
// instant health is toggled off, same convention as CONTROLLED STOP above,
// even though the actual trip doesn't land on every machine until 1s later.
// It does latch, like every trip in control.js, so bringing the line back is
// RESET TRIPS' job, not a second button of its own here.
import { C, FONT_MONO } from "../scene/theme";

const rowStyle = {
  display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap",
};

const sectionStyle = (accent) => ({
  display: "flex", flexDirection: "column", gap: 4,
  border: `1px solid ${accent}`, borderRadius: 4, padding: "4px 8px",
});

const sectionTitleStyle = (accent) => ({
  fontSize: 8, letterSpacing: "0.12em", color: accent, textTransform: "uppercase",
});

const sectionRowStyle = {
  display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
};

// Shape shared by every button in this component regardless of severity
// tier — only the idle/active colors differ below.
const buttonBase = {
  borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO,
  fontSize: 10, letterSpacing: "0.08em", cursor: "pointer",
};

// Neutral/wheat styling (issue #54): SOURCE, DESTINATION, and EMPTY BIN are
// routine operating choices, not safety actions — same look as MeetingApp's
// own zonebtn / EVENT LOG toggle (muted/line idle, filled wheat when active).
const neutralBtnStyle = {
  ...buttonBase, background: "transparent", color: C.muted, border: `1px solid ${C.line}`,
};

const neutralActiveBtnStyle = {
  ...neutralBtnStyle, background: C.wheat, color: "#1a1a14", border: `1px solid ${C.wheat}`,
};

// Red styling, unchanged from before issue #54: CONTROLLED STOP, RESET
// TRIPS, and UTILITIES are plant-safety actions, not routine choices — red
// even when idle, unlike the neutral family above.
const btnStyle = {
  ...buttonBase, background: "transparent", color: C.red, border: `1px solid ${C.red}`,
};

// Filled, not outlined, when active — the same "filled = active" convention
// MeetingApp's own EVENT LOG toggle already uses, just in red.
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
  controlledStopPhase, onControlledStop, onResumeLine,
  utilitiesHealthy, utilitiesTripPhase, onSetUtilitiesHealthy,
}) {
  const emptyableBinId = METAL_BIN_DESTINATIONS.has(destination) ? destination : null;
  // Issue #50: one button, two states — RUN/PAUSE's own toggle shape
  // (TransportControls.jsx), just in this cluster's red rather than wheat,
  // and filled whenever a drain is in progress or has settled ("draining"
  // or "stopped"), not just once it's fully finished, so the presenter sees
  // it engage the instant they press it rather than several seconds later.
  const stopping = controlledStopPhase !== "running";
  // Issue #51: the toggle's own position (`utilitiesHealthy`) and the trip's
  // own latch phase are two independent facts — a presenter can restore
  // health while the trip is still latched, tripped, waiting on RESET TRIPS
  // (utilitiesTrip.js's own "restoring health alone does not restart the
  // line"). Reading only `utilitiesHealthy` here would have the button go
  // dark the moment health is restored even though the line is still
  // stopped, which is exactly the false "we're fine" reading a presenter
  // must not get from this cluster — so both facts drive the button.
  const utilitiesLatched = utilitiesTripPhase !== "running";
  const utilitiesActive = !utilitiesHealthy || utilitiesLatched;
  const utilitiesLabel = !utilitiesHealthy
    ? "⚡ UTILITIES FAILED"
    : utilitiesLatched
      ? "⚡ TRIPPED — RESET NEEDED"
      : "⚡ TRIP UTILITIES";
  return (
    <div style={rowStyle}>
      <div style={sectionStyle(C.line)}>
        <span style={sectionTitleStyle(C.muted)}>SOURCE</span>
        <div style={sectionRowStyle}>
          {SOURCES.map((s) => (
            <button
              key={s.id}
              style={source === s.id ? neutralActiveBtnStyle : neutralBtnStyle}
              onClick={() => onSetSource(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionStyle(C.line)}>
        <span style={sectionTitleStyle(C.muted)}>DESTINATION</span>
        <div style={sectionRowStyle}>
          {DESTINATIONS.map((d) => (
            <button
              key={d.id}
              style={destination === d.id ? neutralActiveBtnStyle : neutralBtnStyle}
              onClick={() => onSetDestination(d.id)}
            >
              {d.label}
            </button>
          ))}
          {emptyableBinId && (
            <button style={neutralBtnStyle} onClick={() => onEmptyBin(emptyableBinId)}>
              EMPTY BIN
            </button>
          )}
        </div>
      </div>

      <div style={sectionStyle(C.red)}>
        <span style={sectionTitleStyle(C.red)}>SAFETY</span>
        <div style={sectionRowStyle}>
          <button style={stopping ? activeBtnStyle : btnStyle} onClick={stopping ? onResumeLine : onControlledStop}>
            {stopping ? "▶ RESUME LINE" : "⏻ CONTROLLED STOP"}
          </button>
          <button style={btnStyle} onClick={onResetTrips}>
            ⚠ RESET TRIPS
          </button>
          <button
            style={utilitiesActive ? activeBtnStyle : btnStyle}
            onClick={() => onSetUtilitiesHealthy(!utilitiesHealthy)}
          >
            {utilitiesLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

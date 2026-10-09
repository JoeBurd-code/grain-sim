// Build mode's one fixed panel on the right (issue #75). It shows the line
// settings (issue #76) or the selected machine, never both. Machine settings
// arrive with the adjustable fields work; for now the machine view shows
// only which machine is selected. One panel, always in the same place: Build
// mode never opens popups.
import { useState } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

const BUILD_PANEL_WIDTH = 280;

const btnStyle = {
  background: "transparent", color: C.wheat, border: `1px solid ${C.line}`,
  borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO, fontSize: 10,
  letterSpacing: "0.08em", cursor: "pointer",
};

const headingStyle = { fontFamily: FONT_DISP, fontSize: 16, color: C.wheat, letterSpacing: "0.04em" };

// START OVER asks before it discards: the first click only arms it. The
// confirmation is part of the panel, not a browser dialog.
function LineSettings({ lineName, onStartOver }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <div style={headingStyle}>LINE SETTINGS</div>
      <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{lineName}</div>
      <div style={{ marginTop: 18 }}>
        {confirming ? (
          <>
            <div style={{ fontSize: 10, color: C.text, marginBottom: 8 }}>
              Discard this line and load the golden line again?
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="zonebtn"
                style={{ ...btnStyle, color: C.red, borderColor: C.red }}
                onClick={() => {
                  setConfirming(false);
                  onStartOver();
                }}
              >
                DISCARD AND START OVER
              </button>
              <button className="zonebtn" style={{ ...btnStyle, color: C.muted }} onClick={() => setConfirming(false)}>
                CANCEL
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="zonebtn" style={btnStyle} onClick={() => setConfirming(true)}>
              START OVER
            </button>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 6 }}>
              Load the golden line again.
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function BuildPanel({ machine, settingsOpen, lineName, onStartOver }) {
  return (
    <aside style={{
      width: BUILD_PANEL_WIDTH, flex: "none", borderLeft: `1px solid ${C.line}`,
      background: C.panel, padding: "14px 16px", overflowY: "auto",
      fontFamily: FONT_MONO,
    }}>
      {settingsOpen ? (
        <LineSettings lineName={lineName} onStartOver={onStartOver} />
      ) : machine ? (
        <>
          <div style={headingStyle}>{machine.name}</div>
          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{machine.tag}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 16 }}>No adjustable settings yet.</div>
        </>
      ) : (
        <div style={{ fontSize: 10, color: C.muted }}>Select a machine to see its settings.</div>
      )}
    </aside>
  );
}

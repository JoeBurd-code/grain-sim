// Build mode's one fixed panel on the right (issue #75). Machine settings
// arrive with the adjustable fields work; for now the panel shows only which
// machine is selected. One panel, always in the same place: Build mode never
// opens popups.
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

const BUILD_PANEL_WIDTH = 280;

export default function BuildPanel({ machine }) {
  return (
    <aside style={{
      width: BUILD_PANEL_WIDTH, flex: "none", borderLeft: `1px solid ${C.line}`,
      background: C.panel, padding: "14px 16px", overflowY: "auto",
      fontFamily: FONT_MONO,
    }}>
      {machine ? (
        <>
          <div style={{ fontFamily: FONT_DISP, fontSize: 16, color: C.wheat, letterSpacing: "0.04em" }}>
            {machine.name}
          </div>
          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{machine.tag}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 16 }}>No adjustable settings yet.</div>
        </>
      ) : (
        <div style={{ fontSize: 10, color: C.muted }}>Select a machine to see its settings.</div>
      )}
    </aside>
  );
}

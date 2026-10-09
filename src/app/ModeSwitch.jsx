// SIM / BUILD switch (issue #75). The app is always in exactly one mode:
// Sim mode runs the line, Build mode designs it. PlantApp owns what a
// switch does (reset the sim, swap the chrome); this is only the control.
import { C, FONT_MONO } from "../scene/theme";

const MODES = [
  { id: "sim", label: "SIM" },
  { id: "build", label: "BUILD" },
];

function segStyle(active, first) {
  return {
    background: active ? C.wheat : "transparent",
    color: active ? "#1a1a14" : C.muted,
    border: `1px solid ${active ? C.wheat : C.line}`,
    borderRadius: first ? "4px 0 0 4px" : "0 4px 4px 0",
    marginLeft: first ? 0 : -1,
    padding: "4px 12px", fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600,
    letterSpacing: "0.12em", cursor: active ? "default" : "pointer",
  };
}

export default function ModeSwitch({ mode, onChange }) {
  return (
    <div style={{ display: "flex", flex: "none" }} role="group" aria-label="app mode">
      {MODES.map((m, i) => (
        <button
          key={m.id}
          style={segStyle(mode === m.id, i === 0)}
          aria-pressed={mode === m.id}
          onClick={() => mode !== m.id && onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

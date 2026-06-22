// Future-shape machine popup: the panel the final demo will have, with
// live-look controls (no engine behind them yet). Drawing facts and the
// per-machine confirmation questions now live in the engineer worksheet
// (docs/TREATER_LINE2_WORKSHEET.md), not in the app.
import { useEffect, useState } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";


function Slider({ param }) {
  const [value, setValue] = useState(param.value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginBottom: 3 }}>
        <span>{param.label}</span>
        <span style={{ color: C.text }}>{value} {param.unit}</span>
      </div>
      <input
        type="range"
        min={param.min}
        max={param.max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.wheat, height: 14 }}
      />
    </div>
  );
}

export default function MachinePopup({ machine: m, plotted, onTogglePlot, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isPlotted = plotted.has(m.id);

  const sectionTitle = {
    fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: "uppercase",
    margin: "14px 0 6px", borderBottom: `1px solid ${C.line}`, paddingBottom: 4,
  };

  return (
    <div style={{
      position: "absolute", top: 12, right: 12, width: 300, maxHeight: "calc(100% - 24px)",
      overflowY: "auto", background: C.panel, border: `1px solid ${C.line}`,
      borderRadius: 8, padding: 14, fontFamily: FONT_MONO, boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: FONT_DISP, fontSize: 15, letterSpacing: 0.5, color: C.text, lineHeight: 1.2 }}>
            {m.name}
          </div>
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

      {(m.params ?? []).length > 0 && (
        <>
          <div style={sectionTitle}>parameters</div>
          {m.params.map((p) => <Slider key={`${m.id}-${p.id}`} param={p} />)}
        </>
      )}

      <div style={sectionTitle}>event log</div>
      <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", padding: "2px 0 4px" }}>
        awaiting engine · events will appear here
      </div>
      {[64, 48, 56].map((w, i) => (
        <div key={i} style={{ height: 6, width: `${w}%`, background: C.panel2, borderRadius: 3, marginBottom: 5 }} />
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => onTogglePlot(m.id)}
          style={{
            background: isPlotted ? C.wheat : "transparent",
            color: isPlotted ? "#1a1a14" : C.muted,
            border: `1px solid ${isPlotted ? C.wheat : C.line}`,
            borderRadius: 4, cursor: "pointer", fontFamily: FONT_MONO,
            fontSize: 10, letterSpacing: 1, padding: "5px 10px",
          }}
        >
          {isPlotted ? "PLOTTED ✓" : "PLOT THIS MACHINE"}
        </button>
        <span style={{ fontSize: 9, color: C.muted, fontStyle: "italic" }}>engine pending</span>
      </div>
    </div>
  );
}

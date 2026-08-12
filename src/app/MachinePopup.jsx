// Future-shape machine popup: the panel the final demo will have, with
// live-look controls (no engine behind them yet). Drawing facts and the
// per-machine confirmation questions now live in the engineer worksheet
// (docs/TREATER_LINE2_WORKSHEET.md), not in the app.
import { useEffect, useState } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";
import { LEVEL_KINDS } from "../sim/behaviors";


// `actual` (issue #34) is a live, read-only figure resolved by the parent
// from the machine's published snapshot via `param.readBind` — see
// PARAM_READERS in MeetingApp.jsx. It's rendered beside the setpoint but
// never fed back into `value`: the setpoint slider always reflects exactly
// what the operator last dragged it to, with no fighting between manual
// input and live sim state. Hidden whenever the two already agree (rounded
// to the slider's own integer step) so normal operation stays quiet.
function Slider({ param, actual, onChange }) {
  const [value, setValue] = useState(param.value);
  const roundedActual = actual != null ? Math.round(actual) : null;
  const showActual = roundedActual != null && roundedActual !== value;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginBottom: 3 }}>
        <span>{param.label}</span>
        <span>
          <span style={{ color: C.text }}>{value} {param.unit}</span>
          {showActual && (
            <span style={{ color: C.wheat, marginLeft: 8 }}>actual {roundedActual} {param.unit}</span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={param.min}
        max={param.max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          setValue(v);
          onChange?.(v);
        }}
        style={{ width: "100%", accentColor: C.wheat, height: 14 }}
      />
    </div>
  );
}

// One of the two per-machine plot toggles (issue #36): level and rate are
// separate switches rather than a single "plot this machine" button, so a
// presenter can plot either or both. Colored with the machine's own stable
// chart color when active, matching how its line will actually render.
function PlotToggle({ active, color, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? color : "transparent",
        color: active ? "#1a1a14" : C.muted,
        border: `1px solid ${active ? color : C.line}`,
        borderRadius: 4, cursor: "pointer", fontFamily: FONT_MONO,
        fontSize: 10, letterSpacing: 1, padding: "5px 10px",
      }}
    >
      {active ? `${label} ✓` : `PLOT ${label}`}
    </button>
  );
}

export default function MachinePopup({
  machine: m, levelPlotted, ratePlotted, plotColor, onToggleSeries, onClose, onParamChange, onParamRead, events,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isSimEnabled = m.sim?.kind != null;
  const hasLevel = LEVEL_KINDS.has(m.sim?.kind);

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
          {m.params.map((p) => (
            <Slider
              key={`${m.id}-${p.id}`}
              param={p}
              actual={p.readBind ? onParamRead?.(m.id, p) : null}
              onChange={(v) => onParamChange?.(m.id, p, v)}
            />
          ))}
        </>
      )}

      <div style={sectionTitle}>event log</div>
      {(!events || events.length === 0) ? (
        <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", padding: "2px 0 4px" }}>
          no events yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[...events].reverse().map((e, i) => (
            <div key={i} style={{ fontSize: 10, lineHeight: 1.4 }}>
              <span style={{ color: C.wheat, fontFamily: FONT_MONO }}>{e.t.toFixed(1)}s</span>{" "}
              <span style={{ color: C.text }}>{e.message}</span>
            </div>
          ))}
        </div>
      )}

      {isSimEnabled && (
        <>
          <div style={sectionTitle}>shared chart</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {hasLevel && (
              <PlotToggle active={levelPlotted} color={plotColor} label="LEVEL" onClick={() => onToggleSeries("level")} />
            )}
            <PlotToggle active={ratePlotted} color={plotColor} label="RATE" onClick={() => onToggleSeries("rate")} />
          </div>
        </>
      )}
    </div>
  );
}

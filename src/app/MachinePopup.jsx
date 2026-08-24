// Future-shape machine popup: the panel the final demo will have, with
// live-look controls (no engine behind them yet). Drawing facts and the
// per-machine confirmation questions now live in the engineer worksheet
// (docs/TREATER_LINE2_WORKSHEET.md), not in the app.
import { useEffect } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";
import { LEVEL_KINDS } from "../sim/behaviors";


// `live` (issue #34, reshaped by issue #63) is resolved by the parent from
// the machine's published snapshot via `param.readBind` — see PARAM_READERS
// in PlantApp.jsx — as `{ actual, cap, overridable }`, or `null` for a param
// with no `readBind` at all. `live.actual` is issue #34's original figure
// (dial x throttle — still-governed mid-ramp lag); the slider's own thumb
// and its "actual X" text track it only while *not* armed — while armed,
// both instead show the dial itself (see `armed`'s own comment below: an
// override means the interlock's multiplier is exactly what's being
// bypassed, so displaying its still-throttled figure next to an OVERRIDE tag
// would flatly contradict it).
//
// `cap`/`overridable` are the live throttle band's own cap (in the same
// units as this slider) and whether that band is a genuine partial throttle
// (overridable) rather than a full stop (never overridable) — `cap` is
// `null` for a param with no throttle band of its own (sourceRate/
// feederRate), in which case no tick is drawn and override never arms.
//
// `touched` says whether the operator has ever actually dragged *this*
// slider (derived from PlantApp's own `paramValues`, cleared on RESTART) —
// override only ever arms once the dial has genuinely been set, never merely
// because it happens to be sitting at its untouched default above a live
// cap (see isThrottleOverridden's own comment, sim/behaviors.js, for why a
// gradedFeedSchedule band's always-below-100% targets make that gate
// necessary).
//
// Dragging a touched dial away from the cap — the machine's own "balanced"
// point, wherever the interlock alone would run it — arms a manual override
// (issue #63, point #2, refined in a follow-up grilling session 2026-08-24):
// implicit, no separate toggle, and in *either* direction, not only above the
// cap — the thumb, text and an "OVERRIDE" tag switch to the same warning red
// the RESET TRIPS button uses while tripped. A full stop (cap present but not
// overridable) instead clamps the input's own `max` to the cap, so the dial
// physically cannot be dragged away from it at all (point #3).
//
// `value` is a controlled prop, not local state: this popup unmounts
// entirely on close (PlantApp only renders it while a machine is
// selected), so any position held in a `useState` here reverts to
// `param.value` — the lineData default — the moment the popup reopens.
// The operator's last-dragged position instead lives in PlantApp, above
// the unmount boundary, so it survives close/reopen.
function Slider({ param, value, touched, live, onChange }) {
  const cap = live?.cap ?? null;
  const overridable = live?.overridable ?? false;
  // Grilled 2026-08-24: the tick is the machine's own "balanced" point — what
  // the interlock alone would run it at — so any touched dial that departs
  // from it, above *or* below, reads as a manual override, not only a value
  // dragged past the cap. (A full stop clamps `inputMax` to the cap, so the
  // dial can never actually diverge from it while `!overridable` — nothing
  // further to gate here for that case.)
  const armed = touched && cap != null && value !== Math.round(cap);
  // While armed, `actual` must read as the dial itself — the whole point of
  // an override is "run it at what I dialled, not what the interlock's own
  // cap/throttle multiplier would otherwise produce" — so showing PARAM_READERS'
  // still-throttled `live.actual` here (issue #34's old dial x throttle
  // figure) directly contradicted the OVERRIDE tag sitting right next to it.
  // Only the *not* armed case (untouched, or touched and parked exactly on
  // the tick) still shows that figure, which is where its own mid-ramp-lag
  // job (point #6) actually applies.
  const actual = armed ? value : live?.actual;
  const roundedActual = actual != null ? Math.round(actual) : null;
  const showActual = roundedActual != null && roundedActual !== value;

  const range = param.max - param.min;
  // A full stop physically caps how far the dial can be dragged; otherwise
  // the full range stays open, since dragging past the cap is exactly what
  // arms the override.
  const inputMax = cap != null && !overridable ? Math.max(param.min, Math.floor(cap)) : param.max;
  const thumbValue = Math.min(inputMax, roundedActual != null ? roundedActual : value);
  const capPct = cap != null && range > 0
    ? ((Math.min(param.max, Math.max(param.min, cap)) - param.min) / range) * 100
    : null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginBottom: 3 }}>
        <span>{param.label}</span>
        <span>
          <span style={{ color: armed ? C.red : C.text }}>{value} {param.unit}</span>
          {armed && <span style={{ color: C.red, marginLeft: 8, fontWeight: 600 }}>OVERRIDE</span>}
          {showActual && (
            <span style={{ color: C.wheat, marginLeft: 8 }}>actual {roundedActual} {param.unit}</span>
          )}
        </span>
      </div>
      <div style={{ position: "relative", height: 14 }}>
        <input
          type="range"
          min={param.min}
          max={inputMax}
          value={thumbValue}
          onChange={(e) => onChange?.(Number(e.target.value))}
          style={{ width: "100%", accentColor: armed ? C.red : C.wheat, height: 14 }}
        />
        {capPct != null && (
          <div
            title={`interlock cap: ${Math.round(cap)} ${param.unit}`}
            style={{
              position: "absolute", left: `${capPct}%`, top: 2, width: 2, height: 10,
              background: C.muted, pointerEvents: "none",
            }}
          />
        )}
      </div>
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
  machine: m, levelPlotted, ratePlotted, plotColor, onToggleSeries, onClose, paramValues, onParamChange, onParamRead, events,
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
      // Issue #53: the chart dock became a fixed-position overlay (z-index 20/21)
      // instead of a layout sibling that shrank `main`, so a tall popup can now
      // reach behind it -- stay above so the dock's slide never covers it.
      zIndex: 30,
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
              value={paramValues?.[m.id]?.[p.id] ?? p.value}
              touched={paramValues?.[m.id]?.[p.id] !== undefined}
              live={p.readBind ? onParamRead?.(m.id, p) : null}
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

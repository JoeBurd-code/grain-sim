// Future-shape machine popup: the panel the final demo will have, with
// live-look controls (no engine behind them yet). Drawing facts and the
// per-machine confirmation questions now live in the engineer worksheet
// (docs/TREATER_LINE2_WORKSHEET.md), not in the app.
import { useEffect } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";
import { LEVEL_KINDS } from "../sim/behaviors";
import { m3ToTonnes } from "../sim/units";


// `live` (issue #34, reshaped by issue #63) is resolved by the parent from
// the machine's published snapshot via `param.readBind` — see PARAM_READERS
// in PlantApp.jsx — as `{ actual, cap, overridable }`, or `null` for a param
// with no `readBind` at all. `cap`/`overridable` are the live throttle
// band's own cap (in the same units as this slider) and whether that band
// is a genuine partial throttle (overridable) rather than a full stop
// (never overridable) — `cap` is `null` for a param with no throttle band of
// its own (sourceRate/feederRate), in which case no tick is drawn and
// override never arms.
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
// cap — the thumb and text switch to the same warning red the RESET TRIPS
// button uses while tripped, with an "OVERRIDE" tag. A full stop (cap
// present but not overridable) instead clamps the input's own `max` to the
// cap, so the dial physically cannot be dragged away from it at all
// (point #3). Dragging a touched dial back onto the cap doesn't just disarm
// the display here — PlantApp's own onParamChange (issue #63 follow-up)
// treats that exact drop as "return to normal" and releases the dial
// entirely (engine.js's releaseElevatorSpeed/releaseGateFraction) rather
// than leaving it touched at a value that only coincidentally equals the
// cap right now, so it keeps tracking the live cap afterward instead of
// drifting (or spuriously re-arming) the next time the cap itself moves.
//
// There is only ever *one* number on display, not two: `displayValue` is
// the dial itself while armed (an override is defined as "run it at what I
// dialled, not what the interlock would otherwise produce"), or the live
// cap (`live.actual`, PlantApp.jsx) while governed — never the raw
// operator's dial in isolation. Showing the raw dial here (issue #63's
// first pass) is what made a fresh, untouched machine read "100%" in the
// text while its own thumb sat at 85% — and made a *touched* dial parked
// exactly on the tick still visually snap away to some other figure, since
// the thumb and the text disagreed about which of the two numbers to trust.
// A separate "actual X" annotation is no longer needed for these two
// params: text and thumb are now the same source, so there is nothing left
// for a second figure to add. (sourceRate/feederRate, whose `cap` is always
// `null`, keep showing their own live `actual` here unconditionally — see
// PARAM_READERS' own comment on why those two never arm.)
//
// `value` is a controlled prop, not local state: this popup unmounts
// entirely on close (PlantApp only renders it while a machine is
// selected), so any position held in a `useState` here reverts to
// `param.value` — the lineData default — the moment the popup reopens.
// The operator's last-dragged position instead lives in PlantApp, above
// the unmount boundary, so it survives close/reopen — and is still what
// `armed` compares against, even though it's no longer what's displayed.
// A native range input's click-to-position and drag both center the visible
// thumb under the cursor, but our own tick mark (`capPct` below) is drawn at
// a plain linear percentage of the track's full width — it never accounts
// for the thumb's own physical width, which the browser insets from both
// ends of the track when mapping a position to a value. The two disagree by
// roughly half the thumb's width in pixels, which is why clicking (or
// dragging) to what visually looks like dead-on the tick still lands `value`
// a point or two off it: the readout tracks the thumb's true native
// position, not the naively-drawn tick. Rather than chase the exact
// thumb-width math (OS/browser-themed, not something this app controls, at
// `appearance: auto`), both this arming check and PlantApp.jsx's own
// return-to-normal release in onParamChange snap within a small tolerance
// of the cap instead of requiring exact equality — the same fix on both
// ends of the one comparison they share.
// Exported so PlantApp.jsx's onParamChange snaps a return-to-normal release
// on the exact same window this file arms/disarms on — the two must agree,
// or a drag could read as "released" here while the engine below still
// thinks it's touched at an off-cap fraction, or vice versa.
export const OVERRIDE_SNAP = 2; // percentage points either side of the cap that still counts as "on it"

function Slider({ param, value, touched, live, onChange }) {
  const cap = live?.cap ?? null;
  const overridable = live?.overridable ?? false;
  // Grilled 2026-08-24: the tick is the machine's own "balanced" point — what
  // the interlock alone would run it at — so any touched dial that departs
  // from it, above *or* below, reads as a manual override, not only a value
  // dragged past the cap. (A full stop clamps `inputMax` to the cap, so the
  // dial can never actually diverge from it while `!overridable` — nothing
  // further to gate here for that case.) Snapped within OVERRIDE_SNAP above,
  // not exact equality — see that constant's own comment.
  const armed = touched && cap != null && Math.abs(value - cap) > OVERRIDE_SNAP;
  const displayValue = armed ? value : (live?.actual != null ? Math.round(live.actual) : value);

  const range = param.max - param.min;
  // A full stop physically caps how far the dial can be dragged; otherwise
  // the full range stays open, since dragging past the cap is exactly what
  // arms the override.
  const inputMax = cap != null && !overridable ? Math.max(param.min, Math.floor(cap)) : param.max;
  const thumbValue = Math.min(inputMax, displayValue);
  const capPct = cap != null && range > 0
    ? ((Math.min(param.max, Math.max(param.min, cap)) - param.min) / range) * 100
    : null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginBottom: 3 }}>
        <span>{param.label}</span>
        <span>
          <span style={{ color: armed ? C.red : C.text }}>{displayValue} {param.unit}</span>
          {armed && <span style={{ color: C.red, marginLeft: 8, fontWeight: 600 }}>OVERRIDE</span>}
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

// Current/capacity/percent together, plant-mimic style (grilled 2026-08-26):
// the diagram's LT dot and the shared chart's axis already show percentage
// alone, so this is the one surface with room to add the number those two
// can't -- the bin's own capacity, which is what makes "73%" mean something
// concrete rather than a value with no reference to compare it against.
function LevelReadout({ fill, capacityM3 }) {
  if (fill == null || capacityM3 == null) return null;
  const currentT = m3ToTonnes(fill * capacityM3);
  const capacityT = m3ToTonnes(capacityM3);
  return (
    <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>
      {currentT.toFixed(2)} / {capacityT.toFixed(2)} t{" "}
      <span style={{ color: C.muted, fontSize: 11 }}>· {Math.round(fill * 100)}%</span>
    </div>
  );
}

export default function MachinePopup({
  machine: m, dynamic, levelPlotted, ratePlotted, plotColor, onToggleSeries, onClose, paramValues, onParamChange, onParamRead, events,
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

      {hasLevel && m.sim?.capacityM3 != null && (
        <LevelReadout fill={dynamic?.fill} capacityM3={m.sim.capacityM3} />
      )}

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
        // Capped and independently scrollable (issue: a long event log was
        // growing the whole popup, pushing the "shared chart" plot toggles
        // below it down and off, since only the popup's own outer div had
        // overflowY:auto) -- same fixed-section-scrolls pattern as the
        // events list in EventLogPanel.jsx.
        <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
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

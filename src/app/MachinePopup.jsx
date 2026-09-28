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
// in PlantApp.jsx — as `{ actual, cap, overridable, overriding }`, or `null`
// for a param with no `readBind` at all. `cap` is where the interlock alone
// would run this actuator (the slider's tick), in the slider's own units, or
// `null` for a param with no throttle band of its own (sourceRate/
// feederRate), in which case no tick is drawn and override never arms.
//
// Whether the dial is overriding, and the one number to display, are the
// sim's own answer (sim/dial.js, published on the snapshot), never re-derived
// here: while overriding the readout and thumb turn the same warning red the
// RESET TRIPS button uses, with an "OVERRIDE" tag, and `actual` is the dial;
// while governed `actual` is the live cap. A full stop (`overridable` false)
// clamps the input's own `max` to the cap, so the dial cannot be dragged away
// from it at all. A drag that lands back on the cap is "return to normal":
// the sim's own setDial releases the dial rather than leaving it touched.
//
// `value` is a controlled prop, not local state: this popup unmounts
// entirely on close, so the operator's last-dragged position lives in
// PlantApp, above the unmount boundary. It is only what a param with no live
// reading displays.

// The tick's own pixel position needs the thumb's diameter to correct for
// the inset above — which means the thumb can no longer be left at its
// OS-themed default size (unmeasurable from CSS, and its vertical position
// within the input's box turned out not to be reliably centered either —
// confirmed live: a thumb sized only via ::-webkit-slider-thumb, with the
// runnable-track otherwise left native, rendered a few px lower than the
// input's own box center, throwing off any tick math that assumed it was).
// `.param-slider` (PlantApp.jsx's own global `<style>`) now styles both the
// thumb *and* the track explicitly on both engines — leaving one native and
// one custom is exactly what produced that unreliable vertical centering —
// so this geometry is deterministic instead of guessed at.
export const THUMB_PX = 14;
// The track itself is a slim bar, not the full 14px row height — sized
// deliberately less than THUMB_PX so the round thumb visibly sits proud of
// it, same as a native slider. `.param-slider`'s own thumb rule centers on
// this via `margin-top: (TRACK_PX - THUMB_PX) / 2`.
export const TRACK_PX = 6;

function Slider({ param, value, live, onChange }) {
  const cap = live?.cap ?? null;
  const overridable = live?.overridable ?? false;
  const armed = live?.overriding ?? false;
  const displayValue = live?.actual != null ? Math.round(live.actual) : value;

  const range = param.max - param.min;
  // A full stop physically caps how far the dial can be dragged; otherwise
  // the full range stays open, since dragging past the cap is exactly what
  // arms the override.
  const inputMax = cap != null && !overridable ? Math.max(param.min, Math.floor(cap)) : param.max;
  const thumbValue = Math.min(inputMax, displayValue);
  const capPct = cap != null && range > 0
    ? ((Math.min(param.max, Math.max(param.min, cap)) - param.min) / range) * 100
    : null;
  // A thumb's *center* travels only the track width minus its own diameter
  // — inset by half the thumb on each end, not the naive 0%/100% a plain
  // percentage-of-width assumes — for both engines, native or fully custom
  // alike. `insetPosition` is shared by the tick below and the fill-boundary
  // custom property passed to the input further down, so every piece of
  // this slider that needs to land "under the thumb" agrees on the same
  // geometry.
  const insetPosition = (pct, offsetPx = 0) =>
    `calc(${THUMB_PX / 2 + offsetPx}px + (100% - ${THUMB_PX}px) * ${pct / 100})`;
  // The -TICK_PX/2 is the marker div's own half-width (so its center, not
  // its left edge, is what lands on the thumb's center); the extra +2 is a
  // further live-rendered nudge (2026-08-26), same idea as the tick's own
  // vertical nudge above.
  const TICK_PX = 2;
  const capLeft = capPct != null ? insetPosition(capPct, -TICK_PX / 2 + 2) : null;
  const fillPct = range > 0 ? ((thumbValue - param.min) / range) * 100 : 0;
  const fillStop = insetPosition(fillPct);

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
          className="param-slider"
          min={param.min}
          max={inputMax}
          value={thumbValue}
          onChange={(e) => onChange?.(Number(e.target.value))}
          style={{
            width: "100%", height: 14,
            // `.param-slider`'s own track/thumb rules (PlantApp.jsx) read
            // these custom properties rather than hardcoded values — this is
            // the one place the armed/not-armed color, and where the filled
            // portion currently ends, are actually decided.
            "--slider-color": armed ? C.red : C.wheat,
            "--fill-stop": fillStop,
          }}
        />
        {capLeft != null && (
          <div
            title={`interlock cap: ${Math.round(cap)} ${param.unit}`}
            style={{
              // Doubled (was 10) and re-centered on the track's own
              // midline rather than just growing downward, so it still
              // reads as straddling the thumb rather than hanging off it.
              // Shifted down 2px (2026-08-26) against the live-rendered
              // thumb, which still sits a couple px below where the track's
              // own geometry alone would put it.
              position: "absolute", left: capLeft, top: -1, width: TICK_PX, height: 20,
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

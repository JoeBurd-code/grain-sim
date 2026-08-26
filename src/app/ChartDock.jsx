// Shared bottom chart dock (issue #36). Renders every currently-plotted
// machine's level and/or rate series live: level reads off a left 0-100% Y
// axis (solid lines), rate off a right t/h Y axis (dashed lines), both real
// absolute values -- no normalization. `history` is the sim engine hook's
// own recorded-series state (src/sim/plotHistory.js); this component is a
// pure view over it; it records nothing itself.
//
// The visible time window is controlled by two sliders (zoom + shift) driven
// by useChartRange, a thin hook over the pure chartRange.js module -- this
// replaced an earlier drag-pan/wheel-zoom interaction (issue #37) after user
// feedback that dragging directly on the chart didn't feel good. The dock
// itself (issue #53) is fixed-height and open by default; a pull tab pinned
// to the bottom-center of the viewport is the only control for showing or
// hiding it, sliding it in and out via a CSS transform transition rather
// than reserving/releasing layout space, so toggling never resizes the
// scene above it.
//
// Issue #38: each plotted machine's level line also gets a dot at every
// timestamp that machine logged an interlock event, sourced from the same
// combined `events` list (#29) the event log panel reads -- no second event
// path. Clicking a dot calls `onEventClick` with the event's index in that
// list; PlantApp uses it to open/focus the panel and scroll to it.
//
// Issue #39: a toggleable measure mode swaps the plot area's drag from doing
// nothing (panning is slider-driven now, see the #37 note above) to
// selecting a time span -- a shaded band with a live elapsed-time readout,
// left in place once released. useMeasure owns the mode/span state; the
// pure math lives in measureSpan.js, mirroring useChartRange/chartRange.js.
import { useEffect, useMemo, useRef, useState } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";
import { m3PerSecToTPerHour, m3ToTonnes } from "../sim/units";
import { sampleValueAt } from "../sim/plotHistory";
import { PLOTTABLE_MACHINES, plotColorFor } from "./plotColors";
import { useChartRange } from "./useChartRange";
import { useMeasure } from "./useMeasure";

const EVENT_DOT_RADIUS = 3.5;

// Silver-white, distinct from every plotted machine's own palette color
// (plotColors.js) and from the wheat accent the zoom/shift sliders use, so
// a measurement never reads as if it belongs to one particular machine.
const MEASURE_COLOR = "#e4e7ea";

const MARGIN = { left: 40, right: 44, top: 14, bottom: 24 };
const PLOT_PADDING_LEFT = 8;
const PLOT_PADDING_RIGHT = 14;
const MIN_RATE_AXIS_MAX_TPH = 5;
const DOCK_HEIGHT = 260;
const DOCK_TRANSITION = "transform 0.28s ease, bottom 0.28s ease";
// Tab sits one layer above the dock so it stays clickable/visible as the
// dock's fixed panel slides underneath it.
const DOCK_Z_INDEX = 20;
const TAB_Z_INDEX = DOCK_Z_INDEX + 1;

// Matches MachinePopup.jsx's Slider styling (label row + accent-colored
// range input) so the chart's controls read as the same widget family.
function RangeSlider({ label, value, onChange, disabled, formatValue }) {
  return (
    <div style={{ marginBottom: 10, opacity: disabled ? 0.4 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.muted, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: C.text }}>{formatValue(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ width: "100%", accentColor: C.wheat, height: 14 }}
      />
    </div>
  );
}

// Measure-mode toggle, styled like MachinePopup.jsx's PlotToggle so it reads
// as the same button family as the rest of the demo's on/off controls.
function MeasureToggle({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={active ? "exit measure mode (Esc)" : "drag to measure a time span"}
      style={{
        display: "block", width: "100%", marginBottom: 12,
        background: active ? MEASURE_COLOR : "transparent",
        color: active ? "#1a1a14" : C.muted,
        border: `1px solid ${active ? MEASURE_COLOR : C.line}`,
        borderRadius: 4, cursor: "pointer", fontFamily: FONT_MONO,
        fontSize: 10, letterSpacing: 1, padding: "6px 10px",
      }}
    >
      {active ? "MEASURING ✕" : "⟷ MEASURE"}
    </button>
  );
}

// Measures the plot area's real rendered pixel size so the SVG can use plain
// pixel coordinates for its polylines (the `points` list on <polyline> takes
// only unitless numbers, not percentages) and stay correct across resizes --
// the same ResizeObserver + getBoundingClientRect idiom useViewport.js uses
// for the scene.
function usePlotSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// Hover-to-inspect-value: mousing over a plotted line shows the nearest
// series' exact value, both as a docked readout (left column, doesn't move
// so it's easy to read) and inline on the chart itself (a highlight dot +
// value label next to it, with every other series dimmed so the hovered one
// pops). Chosen after prototyping a few presentations (floating tooltip,
// docked-only, dim-only) against the running chart -- this docked+dim combo
// is what stuck.
//
// Picking is nearest-point, not nearest-x: at the hovered time t, every
// active series' interpolated value (sampleValueAt) is projected to its own
// pixel Y via this component's own seriesY, and whichever is closest to the
// cursor's actual Y wins -- so hovering near the rate line's dashed trace
// reads that series even where a level line happens to cross the same x.
const HOVER_SNAP_PX = 14; // cursor must be within this many px of a series' point, or nothing is selected
// Rough width budget for the inline value label (e.g. "100.0% · 5.5 t"/
// "14.00 t/h" at fontSize 10 JetBrains Mono) -- once the dot is closer to
// the plot's right edge than this, the label flips to the dot's left
// instead of running past the edge.
const HOVER_LABEL_RESERVE_PX = 110;

export default function ChartDock({ history, events, onEventClick }) {
  const [plotRef, size] = usePlotSize();
  const [open, setOpen] = useState(true);
  const [hover, setHover] = useState(null); // { t, mx, my, tx, series, value, py } | null

  // Derived together, keyed only on `history` (referentially stable while
  // nothing is plotted -- see plotHistory.js's recordSample no-op fast path
  // -- and otherwise changes exactly when a new sample lands). `dataBounds`
  // needs a stable identity across renders that don't change its values: it
  // feeds useChartRange as an effect dependency (matching the useMemo'd
  // homeBounds PlantApp passes into useViewport), and a fresh object every
  // render would re-trigger that effect every render, looping forever.
  const { activeSeries, plottedMachines, dataBounds } = useMemo(() => {
    const series = [];
    for (const m of PLOTTABLE_MACHINES) {
      const entry = history.get(m.id);
      if (!entry) continue;
      const color = plotColorFor(m.id);
      if (entry.level) series.push({ machine: m, kind: "level", color, samples: entry.level });
      if (entry.rate) series.push({ machine: m, kind: "rate", color, samples: entry.rate });
    }
    const plotted = PLOTTABLE_MACHINES.filter((m) => history.has(m.id));

    let dataMin = Infinity, dataMax = -Infinity;
    for (const s of series) {
      for (const p of s.samples) {
        if (p.t < dataMin) dataMin = p.t;
        if (p.t > dataMax) dataMax = p.t;
      }
    }
    const bounds = dataMin > dataMax ? { start: 0, end: 1 } : { start: dataMin, end: dataMax };
    return { activeSeries: series, plottedMachines: plotted, dataBounds: bounds };
  }, [history]);

  // Issue #38: one dot per event, anchored to its own machine's level line --
  // interlock events are level-threshold crossings, so a rate-only view (no
  // level series recorded for that machine) has nowhere natural to place one
  // and is left without dots entirely, per the machine's own `entry.level`
  // check below. `idx` is the event's position in the combined `events` list
  // PlantApp also hands EventLogPanel, so a click can identify exactly
  // which event it was without a second event-fetching path of its own.
  const eventDots = useMemo(() => {
    if (!events || events.length === 0) return [];
    const dots = [];
    for (let idx = 0; idx < events.length; idx++) {
      const e = events[idx];
      const level = history.get(e.machineId)?.level;
      if (!level || level.length === 0) continue;
      // An event logged before this machine's level series started recording
      // (e.g. it tripped, then the presenter toggled level plotting on later)
      // has no real point on the drawn line to sit on -- sampleValueAt would
      // clamp it to the line's first sample, placing a dot at that flat
      // value out at the event's own (earlier) x, detached from where the
      // line actually starts. Skipping it here keeps every dot genuinely on
      // its machine's line rather than floating beside it.
      if (e.t < level[0].t || e.t > level[level.length - 1].t) continue;
      dots.push({ idx, t: e.t, value: sampleValueAt(level, e.t), color: plotColorFor(e.machineId) });
    }
    return dots;
  }, [events, history]);

  let rateMaxRawTph = 0;
  for (const s of activeSeries) {
    if (s.kind !== "rate") continue;
    for (const p of s.samples) rateMaxRawTph = Math.max(rateMaxRawTph, m3PerSecToTPerHour(p.value));
  }
  const rateAxisMax = Math.max(MIN_RATE_AXIS_MAX_TPH, Math.ceil((rateMaxRawTph * 1.15) / 5) * 5);

  const w = size.width, h = size.height;
  const plotLeft = MARGIN.left, plotRight = w - MARGIN.right;
  const plotTop = MARGIN.top, plotBottom = h - MARGIN.bottom;
  const plotW = Math.max(1, plotRight - plotLeft);
  const plotH = Math.max(1, plotBottom - plotTop);
  const ready = w > MARGIN.left + MARGIN.right && h > MARGIN.top + MARGIN.bottom;

  const { range, zoomFrac, setZoomFrac, shiftFrac, setShiftFrac, shiftDisabled } = useChartRange(dataBounds);
  const tMin = range.start, tMax = range.end;
  const tSpan = tMax - tMin || 1;

  const measure = useMeasure();

  const x = (t) => plotLeft + (plotW * (t - tMin)) / tSpan;
  const yLevel = (pct) => plotTop + plotH * (1 - pct / 100);
  const yRate = (rate) => plotTop + plotH * (1 - rate / rateAxisMax);
  const seriesY = (s, p) => (s.kind === "level" ? yLevel(p.value * 100) : yRate(m3PerSecToTPerHour(p.value)));

  const measureX1 = measure.span ? x(measure.span.start) : null;
  const measureX2 = measure.span ? x(measure.span.end) : null;

  function handlePlotMouseMove(e) {
    if (measure.active || !ready || activeSeries.length === 0) { setHover(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < plotLeft || mx > plotRight || my < plotTop || my > plotBottom) { setHover(null); return; }
    const t = tMin + (tSpan * (mx - plotLeft)) / plotW;
    let best = null;
    for (const s of activeSeries) {
      if (s.samples.length === 0) continue;
      const value = sampleValueAt(s.samples, t);
      if (value == null) continue;
      const py = seriesY(s, { value });
      const d = Math.abs(my - py);
      if (!best || d < best.d) best = { s, value, py, d };
    }
    if (!best || best.d > HOVER_SNAP_PX) { setHover(null); return; }
    setHover({ t, mx, my, tx: x(t), series: best.s, value: best.value, py: best.py });
  }
  function handlePlotMouseLeave() {
    setHover(null);
  }
  const hoverLabel = hover ? `${hover.series.machine.name} · ${hover.series.kind}` : null;
  // Level hover combines both readings in one string (grilled 2026-08-26):
  // the axis stays percentage-only, but the hovered value also converts to
  // tonnes off that series' own machine capacity, matching how the plant's
  // own mimic screens pair a fill with its tonnage rather than showing % in
  // isolation. Shared by both the docked left-panel readout and the inline
  // on-chart label below -- one string, two render sites.
  const hoverValueText = hover
    ? hover.series.kind === "level"
      ? `${(hover.value * 100).toFixed(1)}% · ${m3ToTonnes(hover.value * hover.series.machine.sim.capacityM3).toFixed(1)} t`
      : `${m3PerSecToTPerHour(hover.value).toFixed(2)} t/h`
    : null;

  return (
    <>
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, height: DOCK_HEIGHT,
        borderTop: `1px solid ${C.line}`, display: "flex", fontFamily: FONT_MONO,
        background: C.bg, zIndex: DOCK_Z_INDEX,
        transform: `translateY(${open ? "0" : "100%"})`, transition: DOCK_TRANSITION,
      }}>
        <div style={{ width: 190, flex: "none", padding: "12px 16px", borderRight: `1px solid ${C.line}` }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 13, letterSpacing: 0.5, color: C.text }}>SHARED CHART</div>
          <div style={{ fontSize: 9, color: C.muted, marginTop: 4, marginBottom: 12, lineHeight: 1.6 }}>
            level % · left axis, solid<br />rate t/h · right axis, dashed
          </div>
          <MeasureToggle active={measure.active} onClick={measure.toggle} />
          <RangeSlider
            label="zoom" value={zoomFrac} onChange={setZoomFrac}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <RangeSlider
            label="shift" value={shiftFrac} onChange={setShiftFrac} disabled={shiftDisabled}
            formatValue={(v) => (shiftDisabled ? "—" : `${Math.round(v * 100)}%`)}
          />
          <div style={{
            marginTop: 12, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6,
            padding: "6px 8px", fontSize: 9.5, minHeight: 34,
          }}>
            {hover ? (
              <>
                <div style={{ color: hover.series.color, fontWeight: 600, marginBottom: 2 }}>{hoverLabel}</div>
                <div style={{ display: "flex", justifyContent: "space-between", color: C.muted }}>
                  <span>t = {hover.t.toFixed(2)}s</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{hoverValueText}</span>
                </div>
              </>
            ) : (
              <span style={{ color: C.muted, fontStyle: "italic" }}>hover the chart to inspect a value</span>
            )}
          </div>
        </div>

        <div
          ref={plotRef}
          onMouseMove={handlePlotMouseMove}
          onMouseLeave={handlePlotMouseLeave}
          style={{
            flex: 1, minWidth: 0, position: "relative", overflow: "hidden",
            padding: `0 ${PLOT_PADDING_RIGHT}px 0 ${PLOT_PADDING_LEFT}px`,
            cursor: measure.active ? "crosshair" : "default",
            userSelect: "none", WebkitUserSelect: "none",
          }}
        >
          {ready && (
            <svg width={w} height={h}>
              <defs>
                <clipPath id="chartPlotClip">
                  <rect x={plotLeft} y={plotTop} width={plotW} height={plotH} />
                </clipPath>
              </defs>
              <line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} stroke={C.line} strokeWidth="1" />
              <line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke={C.line} strokeWidth="1" />
              <line x1={plotRight} y1={plotTop} x2={plotRight} y2={plotBottom} stroke={C.line} strokeWidth="1" />

              {[0, 25, 50, 75, 100].map((pct) => (
                <g key={`lvl${pct}`}>
                  <line x1={plotLeft - 4} y1={yLevel(pct)} x2={plotLeft} y2={yLevel(pct)} stroke={C.muted} strokeWidth="1" />
                  <text x={plotLeft - 7} y={yLevel(pct) + 3} fontFamily={FONT_MONO} fontSize="8" fill={C.muted} textAnchor="end">
                    {pct}
                  </text>
                </g>
              ))}
              {[0, rateAxisMax / 2, rateAxisMax].map((r) => (
                <g key={`rate${r}`}>
                  <line x1={plotRight} y1={yRate(r)} x2={plotRight + 4} y2={yRate(r)} stroke={C.muted} strokeWidth="1" />
                  <text x={plotRight + 7} y={yRate(r) + 3} fontFamily={FONT_MONO} fontSize="8" fill={C.muted}>
                    {Math.round(r)}
                  </text>
                </g>
              ))}
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <text
                  key={`t${f}`} x={x(tMin + tSpan * f)} y={plotBottom + 14}
                  fontFamily={FONT_MONO} fontSize="8" fill={C.muted} textAnchor="middle"
                >
                  {(tMin + tSpan * f).toFixed(0)}s
                </text>
              ))}
              <text x={plotLeft} y={plotTop - 3} fontFamily={FONT_MONO} fontSize="8" fill={C.muted}>%</text>
              <text x={plotRight} y={plotTop - 3} fontFamily={FONT_MONO} fontSize="8" fill={C.muted} textAnchor="end">t/h</text>

              {activeSeries.length === 0 && (
                <text
                  x={(plotLeft + plotRight) / 2} y={(plotTop + plotBottom) / 2}
                  fontFamily={FONT_MONO} fontSize="10" fill={C.muted} textAnchor="middle"
                >
                  no machines plotted · use “plot” in a machine's popup
                </text>
              )}

              <g clipPath="url(#chartPlotClip)">
                {measure.span && (
                  <rect
                    x={Math.min(measureX1, measureX2)}
                    y={plotTop}
                    width={Math.abs(measureX2 - measureX1)}
                    height={plotH}
                    fill={MEASURE_COLOR}
                    fillOpacity={0.15}
                    stroke={MEASURE_COLOR}
                    strokeOpacity={0.6}
                    strokeWidth="1"
                  />
                )}
                {activeSeries.map((s) => {
                  if (s.samples.length < 2) return null;
                  const points = s.samples.map((p) => `${x(p.t)},${seriesY(s, p)}`).join(" ");
                  // Dim every non-hovered series so the hovered one visually pops.
                  const isHovered = hover && hover.series.machine.id === s.machine.id && hover.series.kind === s.kind;
                  const dimmed = hover && !isHovered;
                  return (
                    <polyline
                      key={`${s.machine.id}-${s.kind}`}
                      points={points}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={isHovered ? "2.5" : "1.5"}
                      strokeOpacity={dimmed ? 0.22 : 1}
                      strokeDasharray={s.kind === "rate" ? "4 3" : undefined}
                    />
                  );
                })}
                {eventDots.map((d) => (
                  <circle
                    key={d.idx}
                    cx={x(d.t)}
                    cy={yLevel(d.value * 100)}
                    r={EVENT_DOT_RADIUS}
                    fill={d.color}
                    stroke={C.bg}
                    strokeWidth="1"
                    style={{ cursor: "pointer" }}
                    onClick={() => onEventClick?.(d.idx)}
                  >
                    <title>jump to event in log</title>
                  </circle>
                ))}
                {measure.span && (
                  <text
                    x={Math.min(Math.max((measureX1 + measureX2) / 2, plotLeft + 26), plotRight - 26)}
                    y={plotTop + 12}
                    fontFamily={FONT_MONO} fontSize="9" fill={MEASURE_COLOR} textAnchor="middle"
                  >
                    Δ {(measure.span.end - measure.span.start).toFixed(1)}s
                  </text>
                )}
                {/* Crosshair + highlight dot + inline value label for the hovered series */}
                {hover && (() => {
                  // Flip the label to the dot's left once there isn't room
                  // to the right (near the plot's right edge), so it never
                  // runs off/gets clipped instead of just clamping in place
                  // and overlapping the axis.
                  const fitsRight = hover.tx + 8 + HOVER_LABEL_RESERVE_PX <= plotRight;
                  return (
                    <>
                      <line x1={hover.tx} x2={hover.tx} y1={plotTop} y2={plotBottom} stroke={C.muted} strokeDasharray="3 3" strokeWidth="1" opacity={0.6} />
                      <circle cx={hover.tx} cy={hover.py} r={4.5} fill={hover.series.color} stroke={C.bg} strokeWidth="1.5" />
                      <text
                        x={fitsRight ? hover.tx + 8 : hover.tx - 8}
                        y={hover.py - 8}
                        textAnchor={fitsRight ? "start" : "end"}
                        fontFamily={FONT_MONO} fontSize="10" fontWeight="600" fill={hover.series.color}
                      >
                        {hoverValueText}
                      </text>
                    </>
                  );
                })()}
              </g>

              {/* Issue #39: transparent capture surface for measure-mode drag
                  -- only intercepts pointer events while measure mode is on,
                  so event-dot clicks above keep working the rest of the time. */}
              <rect
                x={plotLeft} y={plotTop} width={plotW} height={plotH}
                fill="transparent"
                pointerEvents={measure.active ? "all" : "none"}
                onPointerDown={(e) => measure.onPlotPointerDown(e, range)}
              />
            </svg>
          )}
        </div>

        <div style={{ width: 170, flex: "none", padding: "12px 16px", borderLeft: `1px solid ${C.line}`, fontSize: 8.5, color: C.muted, overflowY: "auto" }}>
          <div style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 8, marginBottom: 8 }}>key</div>
          {plottedMachines.length === 0 ? (
            <div style={{ fontStyle: "italic" }}>nothing plotted yet</div>
          ) : (
            plottedMachines.map((m) => {
              const entry = history.get(m.id);
              const color = plotColorFor(m.id);
              return (
                <div key={m.id} style={{ marginBottom: 8 }}>
                  <div style={{ color: C.text, fontSize: 9, marginBottom: 3 }}>{m.name}</div>
                  {entry.level && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ width: 22, height: 2, background: color, display: "inline-block" }} />
                      <span>level</span>
                    </div>
                  )}
                  {entry.rate && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 22, borderTop: `2px dashed ${color}`, display: "inline-block" }} />
                      <span>rate</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "collapse chart dock" : "expand chart dock"}
        aria-expanded={open}
        aria-label={open ? "collapse chart dock" : "expand chart dock"}
        style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)",
          bottom: open ? DOCK_HEIGHT : 0, transition: DOCK_TRANSITION,
          zIndex: TAB_Z_INDEX, width: 48, height: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: C.bg, border: `1px solid ${C.line}`,
          borderBottom: open ? "none" : `1px solid ${C.line}`,
          borderRadius: "5px 5px 0 0", color: C.muted, cursor: "pointer",
          fontFamily: FONT_MONO, fontSize: 10, lineHeight: 1, userSelect: "none",
        }}
      >
        {open ? "▼" : "▲"}
      </button>
    </>
  );
}

// Shared bottom chart dock (issue #36). Renders every currently-plotted
// machine's level and/or rate series live: level reads off a left 0-100% Y
// axis (solid lines), rate off a right t/h Y axis (dashed lines), both real
// absolute values -- no normalization. `history` is the sim engine hook's
// own recorded-series state (src/sim/plotHistory.js); this component is a
// pure view over it; it records nothing itself.
import { useEffect, useRef, useState } from "react";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";
import { m3PerSecToTPerHour } from "../sim/units";
import { PLOTTABLE_MACHINES, plotColorFor } from "./plotColors";

const MARGIN = { left: 40, right: 44, top: 14, bottom: 24 };
const MIN_RATE_AXIS_MAX_TPH = 5;

// Measures the plot area's real rendered pixel size so the SVG can use plain
// pixel coordinates for its polylines (the `points` list on <polyline> takes
// only unitless numbers, not percentages) and stay correct across resizes --
// the same ResizeObserver + getBoundingClientRect idiom useViewport.js uses
// for the scene, scoped locally here since the chart has no pan/zoom math of
// its own yet (that's issue #37).
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

export default function ChartDock({ history }) {
  const [plotRef, size] = usePlotSize();

  const activeSeries = [];
  for (const m of PLOTTABLE_MACHINES) {
    const entry = history.get(m.id);
    if (!entry) continue;
    const color = plotColorFor(m.id);
    if (entry.level) activeSeries.push({ machine: m, kind: "level", color, samples: entry.level });
    if (entry.rate) activeSeries.push({ machine: m, kind: "rate", color, samples: entry.rate });
  }
  const plottedMachines = PLOTTABLE_MACHINES.filter((m) => history.has(m.id));

  let tMin = Infinity, tMax = -Infinity;
  for (const s of activeSeries) {
    for (const p of s.samples) {
      if (p.t < tMin) tMin = p.t;
      if (p.t > tMax) tMax = p.t;
    }
  }
  if (tMin > tMax) { tMin = 0; tMax = 1; }
  const tSpan = tMax - tMin || 1;

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

  const x = (t) => plotLeft + (plotW * (t - tMin)) / tSpan;
  const yLevel = (pct) => plotTop + plotH * (1 - pct / 100);
  const yRate = (rate) => plotTop + plotH * (1 - rate / rateAxisMax);
  const seriesY = (s, p) => (s.kind === "level" ? yLevel(p.value * 100) : yRate(m3PerSecToTPerHour(p.value)));

  return (
    <div style={{
      flex: "none", height: 150, borderTop: `1px solid ${C.line}`,
      display: "flex", fontFamily: FONT_MONO, background: C.bg,
    }}>
      <div style={{ width: 190, flex: "none", padding: "12px 16px", borderRight: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: FONT_DISP, fontSize: 13, letterSpacing: 0.5, color: C.text }}>SHARED CHART</div>
        <div style={{ fontSize: 9, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>
          level % · left axis, solid<br />rate t/h · right axis, dashed
        </div>
      </div>

      <div ref={plotRef} style={{ flex: 1, minWidth: 0, position: "relative", padding: "0 14px 0 8px", overflow: "hidden" }}>
        {ready && (
          <svg width={w} height={h}>
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

            {activeSeries.map((s) => {
              if (s.samples.length < 2) return null;
              const points = s.samples.map((p) => `${x(p.t)},${seriesY(s, p)}`).join(" ");
              return (
                <polyline
                  key={`${s.machine.id}-${s.kind}`}
                  points={points}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.5"
                  strokeDasharray={s.kind === "rate" ? "4 3" : undefined}
                />
              );
            })}
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
  );
}

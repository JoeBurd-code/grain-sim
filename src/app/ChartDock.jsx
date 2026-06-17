// Shared bottom chart dock. Axes and the plotting area are drawn so the
// final chart's home is visible; data arrives with the engine. Machines
// toggled via "plot this machine" appear as colour-matched chips.
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

const PLOT_COLORS = [C.wheat, C.green, "#5a9ea0", C.red, "#b07cc6", C.amber];

export default function ChartDock({ machines, plotted }) {
  const plottedMachines = machines.filter((m) => plotted.has(m.id));

  return (
    <div style={{
      flex: "none", height: 150, borderTop: `1px solid ${C.line}`,
      display: "flex", fontFamily: FONT_MONO, background: C.bg,
    }}>
      <div style={{ width: 190, flex: "none", padding: "12px 16px", borderRight: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: FONT_DISP, fontSize: 13, letterSpacing: 0.5, color: C.text }}>SHARED CHART</div>
        <div style={{ fontSize: 9, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>
          overlay of plotted machines<br />engine pending
        </div>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {plottedMachines.map((m, i) => (
            <span key={m.id} style={{
              fontSize: 8, border: `1px solid ${PLOT_COLORS[i % PLOT_COLORS.length]}`,
              color: PLOT_COLORS[i % PLOT_COLORS.length],
              borderRadius: 3, padding: "1px 5px", letterSpacing: 0.5,
            }}>
              {m.name}
            </span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, position: "relative", padding: "10px 14px 8px 8px" }}>
        <svg width="100%" height="100%">
          {/* axes */}
          <line x1="34" y1="8" x2="34" y2="86%" stroke={C.line} strokeWidth="1" />
          <line x1="34" y1="86%" x2="99%" y2="86%" stroke={C.line} strokeWidth="1" />
          {/* y ticks */}
          {["20%", "45%", "70%"].map((y) => (
            <line key={y} x1="30" y1={y} x2="34" y2={y} stroke={C.muted} strokeWidth="1" />
          ))}
          {/* x ticks */}
          {["25%", "45%", "65%", "85%"].map((x) => (
            <line key={x} x1={x} y1="86%" x2={x} y2="90%" stroke={C.muted} strokeWidth="1" />
          ))}
          <text x="34" y="97%" fontFamily={FONT_MONO} fontSize="8" fill={C.muted}>t (s)</text>
          {plottedMachines.length === 0 && (
            <text x="50%" y="48%" fontFamily={FONT_MONO} fontSize="10" fill={C.muted} textAnchor="middle">
              no machines plotted · use “plot this machine” in a popup
            </text>
          )}
          {plottedMachines.length > 0 && (
            <text x="50%" y="48%" fontFamily={FONT_MONO} fontSize="10" fill={C.muted} textAnchor="middle">
              {plottedMachines.length} machine{plottedMachines.length > 1 ? "s" : ""} plotted · series arrive with the engine
            </text>
          )}
        </svg>
      </div>

      <div style={{ width: 170, flex: "none", padding: "12px 16px", borderLeft: `1px solid ${C.line}`, fontSize: 8.5, color: C.muted }}>
        <div style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 8, marginBottom: 8 }}>key</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
          <span style={{
            width: 64, height: 7, border: `1px solid ${C.line}`, display: "inline-block",
            background: `linear-gradient(90deg, ${C.green}, ${C.amber}, ${C.red})`,
          }} />
          <span>fill level</span>
        </div>
        <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
          <span style={{ border: `1px solid ${C.green}`, color: C.green, borderRadius: 3, padding: "0px 4px" }}>NEW</span>
          <span style={{ border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 3, padding: "0px 4px" }}>RELOCATED</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 30, height: 2, background: C.wheat, display: "inline-block" }} />
          <span>flow (temp arrows)</span>
        </div>
      </div>
    </div>
  );
}

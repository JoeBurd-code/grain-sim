// Meeting frontend shell. Renders the real Treater Line 2 scene from the
// line definition with pan/zoom navigation. The full header chrome (transport
// stubs, legend, chart dock) lands with issue #9; zone buttons here are the
// provisional form from issue #5.
import { useCallback, useMemo, useState } from "react";
import { line } from "../line/lineData";
import { validateLine } from "../line/validateLine";
import { lineBounds, zoneBounds } from "../line/bounds";
import Scene from "../scene/Scene";
import MachinePopup from "./MachinePopup";
import TransportControls from "./TransportControls";
import ChartDock from "./ChartDock";
import { useViewport } from "../scene/useViewport";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

const validation = validateLine(line);

const zoneBtnStyle = {
  background: "transparent", color: C.muted, border: `1px solid ${C.line}`,
  borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO, fontSize: 10,
  letterSpacing: "0.08em", cursor: "pointer",
};

export default function MeetingApp() {
  const [selectedId, setSelectedId] = useState(null);
  const [plotted, setPlotted] = useState(() => new Set());
  const selected = line.machines.find((m) => m.id === selectedId);

  const home = useMemo(() => lineBounds(line), []);
  const { containerRef, vb, fitTo, wasDrag, handlers } = useViewport(home);

  const togglePlot = useCallback((id) => {
    setPlotted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const closePopup = useCallback(() => setSelectedId(null), []);

  return (
    <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_MONO }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .machine { cursor: pointer; }
        .machine .body { transition: stroke .15s ease; }
        .machine:hover .body { stroke: #6e7a71; }
        .machine .mname { transition: fill .15s ease; }
        .machine:hover .mname { fill: #ffffff; }
        .zonebtn:hover { color: #d4dad0; border-color: #6e7a71; }
      `}</style>

      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px", borderBottom: `1px solid ${C.line}`, flex: "none", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: FONT_DISP, fontSize: 20, letterSpacing: 1, color: C.text }}>TREATER LINE 2</span>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 12, letterSpacing: 2, textTransform: "uppercase" }}>
            bayer thb tr&pu · 52-12/13/14
          </span>
        </div>
        <TransportControls />
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          {line.zones.map((z) => (
            <button key={z.id} className="zonebtn" style={zoneBtnStyle} onClick={() => fitTo(zoneBounds(line, z.id))}>
              {z.name}
            </button>
          ))}
          <button className="zonebtn" style={{ ...zoneBtnStyle, color: C.wheat }} onClick={() => fitTo(home)}>
            FIT ALL
          </button>
        </div>
        <div style={{ fontSize: 9, color: selected ? C.wheat : C.muted, textAlign: "right", minWidth: 170 }}>
          {selected ? `${selected.tag} · ${selected.name}` : "click a machine · drag to pan · wheel to zoom"}
        </div>
      </header>

      {validation.ok ? (
        <main ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
          {vb && (
            <Scene
              line={line}
              vb={vb}
              handlers={handlers}
              wasDrag={wasDrag}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {selected && (
            <MachinePopup
              key={selected.id}
              machine={selected}
              plotted={plotted}
              onTogglePlot={togglePlot}
              onClose={closePopup}
            />
          )}
        </main>
      ) : (
        <main style={{ padding: 24 }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 16, color: C.red, marginBottom: 10 }}>LINE DATA INVALID</div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>· {e}</div>
          ))}
        </main>
      )}

      {validation.ok && <ChartDock machines={line.machines} plotted={plotted} />}
    </div>
  );
}

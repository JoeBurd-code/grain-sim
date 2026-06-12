// Meeting frontend shell. Renders the real Treater Line 2 scene from the
// line definition with pan/zoom navigation. The full header chrome (transport
// stubs, legend, chart dock) lands with issue #9; zone buttons here are the
// provisional form from issue #5.
import { useMemo, useState } from "react";
import { line } from "../line/lineData";
import { validateLine } from "../line/validateLine";
import { lineBounds, zoneBounds } from "../line/bounds";
import Scene from "../scene/Scene";
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
  const selected = line.machines.find((m) => m.id === selectedId);

  const home = useMemo(() => lineBounds(line), []);
  const { containerRef, vb, fitTo, wasDrag, handlers } = useViewport(home);

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
        padding: "12px 20px", borderBottom: `1px solid ${C.line}`, flex: "none", gap: 16,
      }}>
        <div style={{ whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: FONT_DISP, fontSize: 20, letterSpacing: 1, color: C.text }}>TREATER LINE 2</span>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 14, letterSpacing: 2, textTransform: "uppercase" }}>
            meeting build
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          {line.zones.map((z) => (
            <button key={z.id} className="zonebtn" style={zoneBtnStyle} onClick={() => fitTo(zoneBounds(line, z.id))}>
              {z.name}
            </button>
          ))}
          <button className="zonebtn" style={{ ...zoneBtnStyle, color: C.wheat }} onClick={() => fitTo(home)}>
            FIT ALL
          </button>
        </div>
        <div style={{ fontSize: 10, color: selected ? C.wheat : C.muted, textAlign: "right", minWidth: 180 }}>
          {selected ? `${selected.tag} · ${selected.name}` : "click a machine · drag to pan · wheel to zoom"}
        </div>
      </header>

      {validation.ok ? (
        <main ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
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
        </main>
      ) : (
        <main style={{ padding: 24 }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 16, color: C.red, marginBottom: 10 }}>LINE DATA INVALID</div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>· {e}</div>
          ))}
        </main>
      )}
    </div>
  );
}

// Build mode's catalogue panel on the left (issue #87): every machine a
// user can add, in collapsible groups by job, with a search box that filters
// by name. Each item shows its real scene symbol, its name and its maker,
// and is dragged onto the canvas to add it (PlantApp's drop handler).
import { useState } from "react";
import { CATALOGUE, CATALOGUE_GROUPS, searchCatalogue } from "../catalogue/catalogue";
import { SYMBOLS } from "../scene/symbolMap";
import { FallbackSymbol } from "../scene/symbols";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

export const CATALOGUE_PANEL_WIDTH = 230;
// The drag data type that carries a catalogue item id.
export const CATALOGUE_DRAG_TYPE = "application/x-grain-sim-item";

const THUMB_W = 46;
const THUMB_H = 36;

// A symbol drawn outside the scene: nothing moves, so the motion clock only
// answers "phase 0" and keeps no frames.
const STILL = { setRate: () => {}, getPhase: () => 0, frameRef: () => () => {} };

function Thumbnail({ item }) {
  // A thumbnail id of its own, so a symbol's clip path never shares an id
  // with a machine on the canvas.
  const machine = { ...item.machine, id: `catalogue-${item.id}`, name: item.name };
  const Symbol = SYMBOLS[machine.type] ?? FallbackSymbol;
  const pad = Math.max(machine.w, machine.h) * 0.08;
  return (
    <svg
      className="catalogue-thumb" width={THUMB_W} height={THUMB_H} aria-hidden="true" style={{ flex: "none", overflow: "hidden" }}
      viewBox={`${-pad} ${-pad} ${machine.w + 2 * pad} ${machine.h + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <Symbol machine={machine} dynamic={{ fill: machine.fill }} motion={STILL} simTime={0} />
    </svg>
  );
}

function maker(item) {
  return [item.maker, item.model].filter(Boolean).join(" ");
}

function CatalogueItem({ item }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CATALOGUE_DRAG_TYPE, item.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      title={`Drag ${item.name} onto the canvas`}
      className="catalogue-item"
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 4,
        cursor: "grab", border: `1px solid transparent`,
      }}
    >
      <Thumbnail item={item} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.text }}>{item.name}</div>
        <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{maker(item) || "no maker"}</div>
      </div>
    </div>
  );
}

// The pull tab that hides and shows the panel, the same shape as the chart
// dock's tab (ChartDock.jsx) turned on its side. It hangs off the panel's
// right edge, halfway down, and stays on screen when the panel is hidden.
const SLIDE = "width 0.2s ease";

function PullTab({ open, onToggle }) {
  return (
    <button
      className="catalogue-handle"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "hide the catalogue" : "show the catalogue"}
      title={open ? "hide the catalogue" : "show the catalogue"}
      style={{
        position: "absolute", left: "100%", top: "50%", transform: "translateY(-50%)", zIndex: 5,
        width: 18, height: 48, padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: C.bg, border: `1px solid ${C.line}`, borderLeft: "none",
        borderRadius: "0 5px 5px 0", color: C.muted, cursor: "pointer",
        fontFamily: FONT_MONO, fontSize: 10, lineHeight: 1, userSelect: "none",
      }}
    >
      {open ? "◀" : "▶"}
    </button>
  );
}

// `open` and `onToggle` belong to PlantApp, so the panel stays hidden or
// shown across a switch to Sim mode and back.
export default function CataloguePanel({ open, onToggle }) {
  return (
    <div style={{ position: "relative", display: "flex", flex: "none", minHeight: 0, borderRight: `1px solid ${C.line}` }}>
      {/* Hidden, the list keeps its search and open groups, but Tab skips it. */}
      <div inert={!open} style={{ width: open ? CATALOGUE_PANEL_WIDTH : 0, overflow: "hidden", transition: SLIDE, display: "flex" }}>
        <CatalogueList />
      </div>
      <PullTab open={open} onToggle={onToggle} />
    </div>
  );
}

function CatalogueList() {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const items = searchCatalogue(query, CATALOGUE);
  const searching = query.trim() !== "";
  const toggle = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <aside style={{
      width: CATALOGUE_PANEL_WIDTH, flex: "none", boxSizing: "border-box",
      background: C.panel, padding: "14px 12px", overflowY: "auto", fontFamily: FONT_MONO,
    }}>
      <div style={{ fontFamily: FONT_DISP, fontSize: 16, color: C.wheat, letterSpacing: "0.04em" }}>CATALOGUE</div>
      <input
        type="search"
        placeholder="search by name"
        aria-label="search the catalogue"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", marginTop: 10, background: C.bg, color: C.text,
          border: `1px solid ${C.line}`, borderRadius: 4, padding: "4px 6px", fontFamily: FONT_MONO, fontSize: 11,
        }}
      />
      {items.length === 0 && (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 14 }}>No machine has that name.</div>
      )}
      {CATALOGUE_GROUPS.map((group) => {
        const inGroup = items.filter((item) => item.group === group.id);
        if (inGroup.length === 0) return null;
        // A search shows every match, collapsed group or not.
        const open = searching || !collapsed.has(group.id);
        return (
          <div key={group.id} style={{ marginTop: 14 }}>
            <button
              className="zonebtn"
              aria-expanded={open}
              onClick={() => toggle(group.id)}
              style={{
                display: "flex", width: "100%", justifyContent: "space-between", background: "transparent",
                border: "none", borderBottom: `1px solid ${C.line}`, padding: "2px 0 4px", cursor: "pointer",
                color: C.muted, fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.08em",
              }}
            >
              <span>{group.name.toUpperCase()}</span>
              <span>{open ? "−" : "+"} {inGroup.length}</span>
            </button>
            {open && inGroup.map((item) => <CatalogueItem key={item.id} item={item} />)}
          </div>
        );
      })}
    </aside>
  );
}

// Renders the line definition as an SVG scene: connection paths underneath,
// machine silhouettes + labels on top. Scene structure is declarative React
// (it only changes when the line data changes); per-frame animation (the
// flow-dash overlay, issue #35, via useFlowAnimation; machine motion like
// the bucket elevator's chain travel, issue #65, via useMachineMotion)
// mutates attributes imperatively via refs, per the locked architecture.
// `running`/`speed` (useSimEngine.js) are threaded through so machine
// motion freezes on pause and scales with the speed multiplier.
import { C, SELECT_STROKE } from "./theme";
import { MachineLabel } from "./symbols";
import { MirroredContext } from "./mirrored";
import { symbolFor } from "./symbolMap";
import { useFlowAnimation, FLOW_DASH_PATTERN } from "./useFlowAnimation";
import { useMachineMotion } from "./useMachineMotion";
import { connectionPoints } from "../line/routing";
import { anchorPoint, machineFootprint } from "../line/layout";
import { connectionKey } from "../line/connecting";
import { elevatorHandles } from "../line/elevatorPath";

// Port dots (issue #88): shown only in Build mode (`onPortPointerDown` set).
// An output port is filled solid (wheat, or the waste colour for a port
// whose name starts with "waste"); an input port is an open ring, so the
// two read apart from each other at a glance, the same way the stream style
// table below already tells a product line from a waste one.
const PORT_RADIUS = 3;
function PortDots({ machine: m, onPortPointerDown }) {
  const dot = (port, isOutput) => {
    const a = anchorPoint(m, port);
    const waste = isOutput && port.toLowerCase().startsWith("waste");
    const color = waste ? STREAM_STYLE.waste.stroke : C.wheat;
    return (
      <circle
        key={`${isOutput ? "out" : "in"}-${port}`}
        cx={a.x} cy={a.y} r={PORT_RADIUS}
        fill={isOutput ? color : C.bg}
        stroke={color}
        strokeWidth={isOutput ? 0 : 1.5}
        style={{ cursor: "crosshair" }}
        onPointerDown={(e) => onPortPointerDown(e, m, port)}
      />
    );
  };
  return (
    <>
      {m.ports.inputs.map((p) => dot(p, false))}
      {m.ports.outputs.map((p) => dot(p, true))}
    </>
  );
}

// Temporary direction markers: flip to false (or delete usages) when the
// animated flow shimmer replaces them. One flag = the one-step removal.
const SHOW_FLOW_ARROWS = true;

const STREAM_STYLE = {
  product: { stroke: C.wheat, width: 2, opacity: 0.85, marker: "arrProduct" },
  waste: { stroke: "#a05a50", width: 1.5, opacity: 0.8, marker: "arrWaste" },
  chemical: { stroke: "#5a9ea0", width: 1.5, opacity: 0.8, marker: "arrChemical" },
};

// Issue #86: hand-placed bend points where the line has them, otherwise a
// route with right-angle bends (line/routing.js).
function connectionPath(line, c) {
  return connectionPoints(line, c).map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

// Red outline on a machine's own footprint (a Z-shaped duct outlines its
// three runs), shown for a moment after a Build mode drop on top of another
// machine was refused (issue #86).
function OverlapOutline({ machine: m }) {
  return machineFootprint(m).map((r, i) => (
    <rect
      key={i} x={r.x - m.x - 4} y={r.y - m.y - 4} width={r.w + 8} height={r.h + 8}
      fill="none" stroke={C.red} strokeWidth="2" rx="3" pointerEvents="none"
    />
  ));
}

// Wheat, solid outline for a machine the Interlocks window's hovered
// sentence names (issue #92): no wires drawn to it, just this, so hovering
// never leaves anything permanent on the scene.
function HighlightOutline({ machine: m }) {
  return machineFootprint(m).map((r, i) => (
    <rect
      key={i} x={r.x - m.x - 6} y={r.y - m.y - 6} width={r.w + 12} height={r.h + 12}
      fill="none" stroke={C.wheat} strokeWidth="2.5" rx="4" pointerEvents="none"
    />
  ));
}

// Issue #155: the selected machine's buttons, in a row centred just above
// its dashed outline. A press never starts a machine drag or reselects.
const BUTTON_SIZE = 18;
const BUTTON_GAP = 6;

function CanvasButton({ x, y, title, color, onPress, children }) {
  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: "pointer" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onPress(); }}
    >
      <title>{title}</title>
      <rect width={BUTTON_SIZE} height={BUTTON_SIZE} rx="3" fill={C.panel} stroke={color} strokeWidth="1" />
      {children}
    </g>
  );
}

// Flip: two triangles mirrored across a dashed line. Delete: a bin.
function SelectionButtons({ machine: m, onFlip, onDelete }) {
  const s = BUTTON_SIZE;
  const buttons = [
    onFlip && {
      title: "Flip left to right", color: SELECT_STROKE, onPress: () => onFlip(m.id),
      glyph: (
        <>
          <path d={`M${s / 2 - 2},4 L3,${s - 4} H${s / 2 - 2} Z`} fill={C.wheat} />
          <path d={`M${s / 2 + 2},4 L${s - 3},${s - 4} H${s / 2 + 2} Z`} fill="none" stroke={C.wheat} strokeWidth="1" />
          <line x1={s / 2} y1="2" x2={s / 2} y2={s - 2} stroke={C.muted} strokeWidth="1" strokeDasharray="2 1.5" />
        </>
      ),
    },
    onDelete && {
      title: "Delete machine and its connections", color: C.red, onPress: () => onDelete(m.id),
      glyph: (
        <g fill="none" stroke={C.red} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M4,5.5 H14 M7.5,5.5 V4 H10.5 V5.5" />
          <path d="M5.5,5.5 L6.3,14.5 H11.7 L12.5,5.5" />
          <path d="M8,8 V12.5 M10,8 V12.5" />
        </g>
      ),
    },
  ].filter(Boolean);
  const row = buttons.length * s + (buttons.length - 1) * BUTTON_GAP;
  const y = -10 - 6 - s;
  return buttons.map((b, i) => (
    <CanvasButton key={b.title} x={m.w / 2 - row / 2 + i * (s + BUTTON_GAP)} y={y} title={b.title} color={b.color} onPress={b.onPress}>
      {b.glyph}
    </CanvasButton>
  ));
}

// Issue #157: the selected machine's length handles (line/elevatorPath.js
// elevatorHandles), pills on the machine's own outline with a pair of
// chevrons, < >, pointing the two ways each drags: across for a run, turned
// upright for the column. A press starts a handle drag (useHandleDrag.js),
// never a machine drag; its click never reselects.
const HANDLE_W = 20;
const HANDLE_H = 12;
// Drawn at this size, the pill and its chevrons together.
const HANDLE_SCALE = 0.8;
function LengthHandles({ machine: m, handles, onHandlePointerDown }) {
  return handles.map((h) => (
    <g
      key={h.id}
      transform={`translate(${h.x},${h.y})${h.axis === "y" ? " rotate(90)" : ""} scale(${HANDLE_SCALE})`}
      style={{ cursor: h.axis === "x" ? "ew-resize" : "ns-resize" }}
      onPointerDown={(e) => onHandlePointerDown(e, m.id, h.id)}
      onClick={(e) => e.stopPropagation()}
    >
      <rect
        x={-HANDLE_W / 2} y={-HANDLE_H / 2} width={HANDLE_W} height={HANDLE_H} rx={HANDLE_H / 2}
        fill={C.panel} stroke={SELECT_STROKE} strokeWidth="1"
      />
      <path
        d="M-3,-3.5 L-7,0 L-3,3.5 M3,-3.5 L7,0 L3,3.5"
        fill="none" stroke={C.wheat} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </g>
  ));
}

// Single point of resolution for a machine's dynamic (per-tick) values.
// `simSnap` is the live sim's published snapshot (Map<machineId, {...}>,
// shape varies per sim.kind's own `snapshot`, see behaviors.js); a machine
// the sim hasn't reached yet, or that has no dynamic value at all, falls
// back to the static `fill` authored in the line data so the scene never
// looks broken mid build. Every other live field (e.g. the transport
// delay's leadingProgress/trailingProgress, issue #21) passes through
// as-is, undefined where the sim hasn't published one — each symbol reads
// only the fields it understands.
function resolveDynamic(machine, simSnap) {
  const live = simSnap?.get(machine.id) ?? {};
  return { ...live, fill: live.fill ?? machine.fill };
}

// `onMachinePointerDown` and `onPortPointerDown` are set only in Build mode
// (useMachineDrag.js, useConnectionDrag.js); `overlapIds` names the machines
// to outline in red. `selectedIds` (issue #95) is every selected machine,
// and `onSelect` is told whether Shift was held, so a Shift+click can add
// to the selection; `selectionBox` is the box select being drawn, and
// `canvasCursor` shows what a press on empty canvas will do.
// `selectedConnectionKey`/`onSelectConnection` select a connection for
// deletion (issue #88), also Build mode only.
// `connectionDraft` is the in-progress drag's rubber-band line.
// `onFlipMachine` (issue #155) and `onDeleteMachine` (issue #87), Build
// mode only, show their buttons over a lone selected machine, and
// `onHandlePointerDown` (issue #157) its length handles, if it has any.
export default function Scene({
  line, vb, handlers, wasDrag, selectedIds, onSelect, simSnap, running, speed, simTime,
  onMachinePointerDown, overlapIds, onPortPointerDown, selectedConnectionKey, onSelectConnection, connectionDraft,
  highlightMachineIds, selectionBox, canvasCursor = "grab", onFlipMachine, onDeleteMachine, onHandlePointerDown,
}) {
  const flowPathRef = useFlowAnimation(line, simSnap);
  const motion = useMachineMotion(running, speed);
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{
        touchAction: "none",
        cursor: canvasCursor,
        display: "block",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      {...handlers}
      onClick={() => { if (!wasDrag()) onSelect(null); }}
    >
      <defs>
        <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        </pattern>
        {Object.entries(STREAM_STYLE).map(([kind, s]) => (
          <marker key={kind} id={s.marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 Z" fill={s.stroke} />
          </marker>
        ))}
        <marker id="arrMuted" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 Z" fill={C.muted} />
        </marker>
      </defs>

      <rect x="-5000" y="-5000" width="10000" height="10000" fill={C.bg} />
      <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" />

      {/* connections under the machines */}
      {line.connections.map((c, i) => {
        // Issue #73: a `coupling` is a physical bolted joint between two
        // machines that touch — the after-bin and the valve hanging off its
        // outlet — not a run of ducting. Its endpoints are the same world
        // point, so there is no path to draw and no direction for an arrow
        // head to take; drawing one would put a second arrow head on top of
        // the first. The graph edge itself is untouched and fully real: only
        // this render skips it. `flowPathRef` is keyed by connection index
        // (useFlowAnimation) so skipping one leaves every other index
        // exactly where it was.
        if (c.coupling) return null;
        const dim = c.tbc || c.inactive;
        const s = STREAM_STYLE[c.kind];
        const d = connectionPath(line, c);
        const key = connectionKey(c);
        const selected = key === selectedConnectionKey;
        return (
          <g key={i}>
            {selected && (
              <path d={d} fill="none" stroke={SELECT_STROKE} strokeWidth={s.width + 6} strokeLinecap="round" opacity="0.5" />
            )}
            <path
              d={d}
              fill="none"
              stroke={dim ? C.muted : s.stroke}
              strokeWidth={dim ? 1.5 : s.width}
              strokeDasharray={dim ? "4 4" : undefined}
              opacity={dim ? 0.7 : s.opacity}
              markerEnd={SHOW_FLOW_ARROWS ? `url(#${dim ? "arrMuted" : s.marker})` : undefined}
            />
            {/* Issue #35: moving-dash overlay, invisible until
                useFlowAnimation's rAF loop finds a live flow to animate —
                the path above (marker, colour, width) is otherwise
                untouched. Skipped for a dim (tbc/inactive) connection: those
                are already flagged as not-real/not-currently-active, and
                should never appear to carry live motion regardless of what
                the flow computation finds. */}
            {!dim && (
              <path
                ref={flowPathRef(i)}
                d={d}
                fill="none"
                stroke={s.stroke}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeDasharray={FLOW_DASH_PATTERN}
                opacity="0"
                pointerEvents="none"
              />
            )}
            {/* Issue #88: a wide, invisible stroke along the same path, so a
                thin 1.5-2px connection is still easy to click to select it.
                Build mode only — onSelectConnection is unset otherwise. */}
            {onSelectConnection && (
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); onSelectConnection(key); }}
              />
            )}
          </g>
        );
      })}

      {/* machines */}
      {line.machines.map((m) => {
        const Symbol = symbolFor(m.type);
        const selected = selectedIds?.includes(m.id);
        return (
          <g
            key={m.id}
            className="machine"
            transform={`translate(${m.x},${m.y})`}
            style={onMachinePointerDown ? { cursor: "move" } : undefined}
            onPointerDown={onMachinePointerDown ? (e) => onMachinePointerDown(e, m) : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (!wasDrag()) onSelect(m.id, e.shiftKey);
            }}
          >
            {selected && (
              <rect
                x="-10" y="-10" width={m.w + 20} height={m.h + 20}
                fill="none" stroke={SELECT_STROKE} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.9" rx="4"
              />
            )}
            {/* Issue #155: a flipped machine's symbol, moving parts and
                all, is mirrored across its own centre; its name label is
                outside the mirror and keeps its side. */}
            <MirroredContext.Provider value={Boolean(m.flipped)}>
              <g transform={m.flipped ? `translate(${m.w},0) scale(-1,1)` : undefined}>
                <Symbol machine={m} dynamic={resolveDynamic(m, simSnap)} motion={motion} simTime={simTime} />
              </g>
            </MirroredContext.Provider>
            {m.type !== "stub" && <MachineLabel machine={m} />}
            {overlapIds?.includes(m.id) && <OverlapOutline machine={m} />}
            {highlightMachineIds?.has(m.id) && <HighlightOutline machine={m} />}
            {onPortPointerDown && <PortDots machine={m} onPortPointerDown={onPortPointerDown} />}
            {selected && (onFlipMachine || onDeleteMachine) && selectedIds.length === 1 && (
              <SelectionButtons machine={m} onFlip={onFlipMachine} onDelete={onDeleteMachine} />
            )}
            {selected && onHandlePointerDown && selectedIds.length === 1 && (
              <LengthHandles machine={m} handles={elevatorHandles(m)} onHandlePointerDown={onHandlePointerDown} />
            )}
          </g>
        );
      })}

      {/* Issue #95: the box select being drawn. */}
      {selectionBox && (
        <rect
          x={Math.min(selectionBox.x, selectionBox.x + selectionBox.w)}
          y={Math.min(selectionBox.y, selectionBox.y + selectionBox.h)}
          width={Math.abs(selectionBox.w)} height={Math.abs(selectionBox.h)}
          fill={SELECT_STROKE} fillOpacity="0.08" stroke={SELECT_STROKE} strokeWidth="1"
          strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none"
        />
      )}

      {/* Issue #88: the rubber-band line while a port drag is in progress. */}
      {connectionDraft && (
        <path
          d={`M${connectionDraft.from.x},${connectionDraft.from.y} L${connectionDraft.to.x},${connectionDraft.to.y}`}
          fill="none" stroke={C.wheat} strokeWidth="2" strokeDasharray="4 4" opacity="0.8" pointerEvents="none"
        />
      )}
    </svg>
  );
}

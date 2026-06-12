// Renders the line definition as an SVG scene: connection paths underneath,
// machine silhouettes + labels on top. Scene structure is declarative React
// (it only changes when the line data changes); per-frame animation, when it
// arrives, will mutate attributes imperatively per the locked architecture.
import { C, SELECT_STROKE } from "./theme";
import {
  BinSymbol, MetalBinSymbol, ElevatorSymbol, DiverterSymbol,
  StubSymbol, FallbackSymbol, MachineLabel,
  ConveyorSymbol, DrumFeederSymbol, ScreenSymbol, TreaterSymbol,
  SamplerSymbol, GrainBreakSymbol, IbcSymbol, MetalRemoverSymbol,
  ProBoxSymbol, VibratorySymbol, FillingHeadSymbol, RollerScaleSymbol,
  ScaleSymbol, FillerSymbol, PalletiserSymbol,
} from "./symbols";

// Temporary direction markers: flip to false (or delete usages) when the
// animated flow shimmer replaces them. One flag = the one-step removal.
const SHOW_FLOW_ARROWS = true;

const SYMBOLS = {
  bin: BinSymbol,
  metalBin: MetalBinSymbol,
  elevator: ElevatorSymbol,
  diverter: DiverterSymbol,
  stub: StubSymbol,
  conveyor: ConveyorSymbol,
  drumFeeder: DrumFeederSymbol,
  screen: ScreenSymbol,
  treater: TreaterSymbol,
  sampler: SamplerSymbol,
  grainBreak: GrainBreakSymbol,
  ibc: IbcSymbol,
  metalRemover: MetalRemoverSymbol,
  proBox: ProBoxSymbol,
  vibratory: VibratorySymbol,
  fillingHead: FillingHeadSymbol,
  rollerScale: RollerScaleSymbol,
  scale: ScaleSymbol,
  filler: FillerSymbol,
  palletiser: PalletiserSymbol,
};

const STREAM_STYLE = {
  product: { stroke: C.wheat, width: 2, opacity: 0.85, marker: "arrProduct" },
  waste: { stroke: "#a05a50", width: 1.5, opacity: 0.8, marker: "arrWaste" },
  chemical: { stroke: "#5a9ea0", width: 1.5, opacity: 0.8, marker: "arrChemical" },
};

function anchorAbs(machine, port) {
  const a = machine.anchors[port];
  return { x: machine.x + a.x, y: machine.y + a.y };
}

function connectionPath(line, c) {
  const byId = new Map(line.machines.map((m) => [m.id, m]));
  const from = anchorAbs(byId.get(c.from.machine), c.from.port);
  const to = anchorAbs(byId.get(c.to.machine), c.to.port);
  const pts = [from, ...(c.via ?? []), to];
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

export default function Scene({ line, vb, handlers, wasDrag, selectedId, onSelect }) {
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ touchAction: "none", cursor: "grab", display: "block" }}
      {...handlers}
      onClick={() => { if (!wasDrag()) onSelect(null); }}
    >
      <defs>
        <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        </pattern>
        {Object.entries(STREAM_STYLE).map(([kind, s]) => (
          <marker key={kind} id={s.marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 Z" fill={s.stroke} />
          </marker>
        ))}
        <marker id="arrMuted" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 Z" fill={C.muted} />
        </marker>
      </defs>

      <rect x="-5000" y="-5000" width="10000" height="10000" fill={C.bg} />
      <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" />

      {/* connections under the machines */}
      {line.connections.map((c, i) => {
        const dim = c.tbc || c.inactive;
        const s = STREAM_STYLE[c.kind];
        return (
          <path
            key={i}
            d={connectionPath(line, c)}
            fill="none"
            stroke={dim ? C.muted : s.stroke}
            strokeWidth={dim ? 1.5 : s.width}
            strokeDasharray={dim ? "4 4" : undefined}
            opacity={dim ? 0.7 : s.opacity}
            markerEnd={SHOW_FLOW_ARROWS ? `url(#${dim ? "arrMuted" : s.marker})` : undefined}
          />
        );
      })}

      {/* machines */}
      {line.machines.map((m) => {
        const Symbol = SYMBOLS[m.type] ?? FallbackSymbol;
        const selected = m.id === selectedId;
        return (
          <g
            key={m.id}
            className="machine"
            transform={`translate(${m.x},${m.y})`}
            onClick={(e) => {
              e.stopPropagation();
              if (!wasDrag()) onSelect(m.id);
            }}
          >
            {selected && (
              <rect
                x="-10" y="-10" width={m.w + 20} height={m.h + 20}
                fill="none" stroke={SELECT_STROKE} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.9" rx="4"
              />
            )}
            <Symbol machine={m} />
            {m.type !== "stub" && <MachineLabel machine={m} />}
          </g>
        );
      })}
    </svg>
  );
}

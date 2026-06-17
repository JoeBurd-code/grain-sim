// Machine silhouettes. Construction rules per mockups/machine-style-snippet.html:
// flat fills, hairline strokes, fill level clipped inside the silhouette and
// coloured by ratioColor, no gradients. Every symbol draws in local coords;
// the Scene positions it at the machine's world (x, y).
import { C, FONT_DISP, FONT_MONO, ratioColor } from "./theme";


export function MachineLabel({ machine: m }) {
  const at = m.labelAt ?? { x: 0, y: m.h + 18 };
  if (m.smallLabel) {
    return (
      <text x={at.x} y={at.y} fontFamily={FONT_MONO} fontSize="8" fill={C.muted}>
        {m.name}
      </text>
    );
  }
  return (
    <g>
      <text className="mname" x={at.x} y={at.y} fontFamily={FONT_DISP} fontSize="13" letterSpacing="0.06em" fill={C.text}>
        {m.name}
      </text>
    </g>
  );
}

export function InstrumentDot({ x, y, code, leaderFrom }) {
  return (
    <g>
      {leaderFrom && <line x1={leaderFrom.x} y1={leaderFrom.y} x2={x - 9} y2={y} stroke={C.muted} strokeWidth="1" />}
      <circle cx={x} cy={y} r="9" fill={C.bg} stroke={C.muted} />
      <text x={x} y={y - 1} fontFamily={FONT_MONO} fontSize="6.5" fill={C.muted} textAnchor="middle">{code}</text>
      <text x={x} y={y + 6} fontFamily={FONT_MONO} fontSize="6" fill={C.muted} textAnchor="middle">0</text>
    </g>
  );
}

// Stacked ISA dots beside a machine for whatever instruments its data declares.
function Instruments({ machine: m, x, y }) {
  const list = m.instruments ?? [];
  return (
    <g>
      {list.map((code, i) => (
        <InstrumentDot
          key={code}
          x={x}
          y={y + i * 24}
          code={code}
          leaderFrom={i === 0 ? { x: m.w, y: y } : null}
        />
      ))}
    </g>
  );
}

// Fill level clipped inside an inner outline, with a lighter surface line.
function FillLevel({ clipId, innerPath, x, w, top, bottom, ratio }) {
  if (ratio == null) return null;
  const y = bottom - ratio * (bottom - top);
  return (
    <g>
      <clipPath id={clipId}>
        <path d={innerPath} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x={x} y={y} width={w} height={bottom - y} fill={ratioColor(ratio)} opacity="0.92" />
        <line x1={x} y1={y + 0.5} x2={x + w} y2={y + 0.5} stroke="#ffffff" strokeWidth="1" opacity="0.25" />
      </g>
    </g>
  );
}

// Trapezoid hopper bin, parameterized by the machine footprint (w x h).
export function BinSymbol({ machine: m }) {
  const { w, h } = m;
  const taper = Math.min(45, h * 0.32);
  const bodyH = h - taper;
  const cx = w / 2;
  const outer = `M0,0 H${w} V${bodyH} L${cx + 10},${h} H${cx - 10} L0,${bodyH} Z`;
  const inner = `M4,4 H${w - 4} V${bodyH - 2} L${cx + 7},${h - 4} H${cx - 7} L4,${bodyH - 2} Z`;
  return (
    <g>
      <path className="body" d={outer} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <FillLevel clipId={`fill-${m.id}`} innerPath={inner} x={0} w={w} top={4} bottom={h - 4} ratio={m.fill} />
      <Instruments machine={m} x={w + 25} y={20} />
    </g>
  );
}

// Rectangular bin on legs, parameterized by the machine footprint (w x h).
export function MetalBinSymbol({ machine: m }) {
  const { w, h } = m;
  const taper = Math.min(42, h * 0.28);
  const legH = Math.min(52, h * 0.3);
  const bodyH = h - taper - legH + 32; // taper overlaps the leg zone a little
  const cx = w / 2;
  const outer = `M0,0 H${w} V${bodyH} L${cx + 12},${bodyH + taper} H${cx - 12} L0,${bodyH} Z`;
  const inner = `M4,4 H${w - 4} V${bodyH - 2} L${cx + 9},${bodyH + taper - 4} H${cx - 9} L4,${bodyH - 2} Z`;
  return (
    <g>
      <line x1="8" y1={bodyH} x2="8" y2={h} stroke={C.line} strokeWidth="4" />
      <line x1={w - 8} y1={bodyH} x2={w - 8} y2={h} stroke={C.line} strokeWidth="4" />
      <path className="body" d={outer} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <FillLevel clipId={`fill-${m.id}`} innerPath={inner} x={0} w={w} top={4} bottom={bodyH + taper - 4} ratio={m.fill} />
      <Instruments machine={m} x={w + 25} y={20} />
    </g>
  );
}

// Simatek pendulum bucket elevator: lower horizontal run, climb, upper run.
// Geometry from machine data: w, h, geom.colX (column left edge), geom.duct.
export function ElevatorSymbol({ machine: m }) {
  const { w, h } = m;
  const { colX, duct } = m.geom;
  const gapX = w - 60;
  const chain = [
    [20, h - 18],
    [colX + 18, h - 18],
    [colX + 18, 18],
    [w - 20, 18],
  ];

  const buckets = [];
  const spacing = 26, size = 7;
  let carry = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const [x0, y0] = chain[i], [x1, y1] = chain[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = carry; d <= len; d += spacing) {
      const t = d / len;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      buckets.push({ x, y, empty: y <= 19 && x > gapX });
    }
    carry = spacing - ((len - carry) % spacing);
    if (carry === spacing) carry = 0;
  }

  return (
    <g>
      <path
        className="body"
        d={`M0,${h} H${colX + duct} V${duct} H${w} V0 H${colX} V${h - duct} H0 Z`}
        fill={C.panel} stroke={C.line} strokeWidth="1.5"
      />
      <path
        d={`M20,${h - 18} H${colX + 18} V18 H${w - 20}`}
        fill="none" stroke={C.line} strokeWidth="1.5" strokeDasharray="3 5"
      />
      {buckets.map((b, i) => (
        <rect
          key={i}
          x={(b.x - size / 2).toFixed(1)} y={(b.y - size / 2).toFixed(1)}
          width={size} height={size}
          fill={b.empty ? "none" : C.wheat} opacity={b.empty ? 1 : 0.9}
          stroke={C.line}
        />
      ))}
      {/* discharge gap in the duct floor */}
      <rect x={gapX} y={duct - 4} width="32" height="9" fill={C.bg} />
      {/* head motor */}
      <rect x={w + 2} y="6" width="30" height="26" fill={C.panel2} stroke={C.line} />
      <path d={`M${w + 6},10 L${w + 28},28 M${w + 6},28 L${w + 28},10`} stroke={C.line} strokeWidth="1" />
      <text x={w + 17} y="46" fontFamily={FONT_MONO} fontSize="8" fill={C.muted} textAnchor="middle">5,0 kW</text>
      {(m.instruments ?? []).includes("ST") && (
        <InstrumentDot x={w + 17} y={-22} code="ST" leaderFrom={{ x: w + 17, y: 4 }} />
      )}
    </g>
  );
}

// 2-way pneumatic diverter: diamond with a flapper showing the set route.
export function DiverterSymbol() {
  return (
    <g>
      <path className="body" d="M16,0 L32,16 L16,32 L0,16 Z" fill={C.panel2} stroke={C.line} strokeWidth="1.5" />
      <line x1="16" y1="16" x2="7" y2="26" stroke={C.wheat} strokeWidth="2" />
    </g>
  );
}

// Belt / transport conveyor: band with end rollers and segment ticks.
export function ConveyorSymbol({ machine: m }) {
  const { w, h } = m;
  const r = h / 2;
  const ticks = [];
  for (let x = 26; x < w - 8; x += 26) ticks.push(x);
  return (
    <g>
      <rect className="body" x="0" y="0" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      {ticks.map((x) => (
        <line key={x} x1={x} y1="2" x2={x} y2={h - 2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      <circle cx="0" cy={r} r={r + 2} fill={C.panel2} stroke={C.muted} strokeWidth="1" />
      <circle cx={w} cy={r} r={r + 2} fill={C.panel2} stroke={C.muted} strokeWidth="1" />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Drum feeder: housing with a rotary drum.
export function DrumFeederSymbol({ machine: m }) {
  const { w, h } = m;
  const r = h / 2 - 6;
  return (
    <g>
      <rect className="body" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <circle cx={w / 2} cy={h / 2} r={r} fill={C.panel2} stroke={C.muted} strokeWidth="1" />
      <line x1={w / 2} y1={h / 2} x2={w / 2 + r * 0.8} y2={h / 2 - r * 0.5} stroke={C.muted} strokeWidth="1.5" />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Scalping screen: housing with an inclined mesh deck.
export function ScreenSymbol({ machine: m }) {
  const { w, h } = m;
  const x0 = 10, y0 = 14, x1 = w - 10, y1 = h - 16;
  const segs = 6;
  let mesh = `M${x0},${y0}`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + (i % 2 ? 5 : -5);
    mesh += ` L${x},${y}`;
  }
  return (
    <g>
      <rect className="body" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <path d={mesh} fill="none" stroke={C.muted} strokeWidth="1.5" />
      <line x1={x0} y1={y0 + 14} x2={x1 - 18} y2={y1 + 6} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Batch treater: vessel with top motor and agitator paddles.
export function TreaterSymbol({ machine: m }) {
  const { w, h } = m;
  const cx = w / 2;
  return (
    <g>
      <rect className="body" x="0" y="16" width={w} height={h - 16} rx="14" fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <rect x={cx - 13} y="0" width="26" height="18" fill={C.panel2} stroke={C.line} />
      <line x1={cx} y1="18" x2={cx} y2={h - 30} stroke={C.muted} strokeWidth="1.5" />
      <line x1={cx - 26} y1={h - 38} x2={cx + 26} y2={h - 26} stroke={C.muted} strokeWidth="1.5" />
      <line x1={cx - 26} y1={h - 26} x2={cx + 26} y2={h - 38} stroke={C.muted} strokeWidth="1.5" />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Auto sampler: pass-through box with a side probe.
export function SamplerSymbol({ machine: m }) {
  const { w, h } = m;
  return (
    <g>
      <rect className="body" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <line x1={w} y1={h / 2} x2={w + 8} y2={h / 2} stroke={C.muted} strokeWidth="1" />
      <circle cx={w + 14} cy={h / 2} r="6" fill={C.panel2} stroke={C.muted} />
      <Instruments machine={m} x={w + 34} y={14} />
    </g>
  );
}

// Grain break: cascade chute with internal baffles.
export function GrainBreakSymbol({ machine: m }) {
  const { w, h } = m;
  return (
    <g>
      <rect className="body" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <path
        d={`M6,8 L${w - 10},12 M${w - 6},18 L10,22 M6,28 L${w - 10},32`}
        stroke={C.muted} strokeWidth="1.5" fill="none"
      />
    </g>
  );
}

// IBC tote: caged cube on a pallet base.
export function IbcSymbol({ machine: m }) {
  const { w, h } = m;
  return (
    <g>
      <rect className="body" width={w} height={h - 6} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <line x1={w / 3} y1="0" x2={w / 3} y2={h - 6} stroke="rgba(255,255,255,0.08)" />
      <line x1={(w / 3) * 2} y1="0" x2={(w / 3) * 2} y2={h - 6} stroke="rgba(255,255,255,0.08)" />
      <line x1="0" y1={(h - 6) / 2} x2={w} y2={(h - 6) / 2} stroke="rgba(255,255,255,0.08)" />
      <line x1="2" y1={h - 2} x2={w - 2} y2={h - 2} stroke={C.line} strokeWidth="4" />
    </g>
  );
}

// Metal remover: housing with a horseshoe magnet glyph.
export function MetalRemoverSymbol({ machine: m }) {
  const { w, h } = m;
  const cx = w / 2, cy = h / 2;
  return (
    <g>
      <rect className="body" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <path
        d={`M${cx - 10},${cy + 8} V${cy - 2} A10,10 0 0 1 ${cx + 10},${cy - 2} V${cy + 8}`}
        fill="none" stroke={C.muted} strokeWidth="3"
      />
      <line x1={cx - 12} y1={cy + 8} x2={cx - 8} y2={cy + 8} stroke={C.wheat} strokeWidth="2" />
      <line x1={cx + 8} y1={cy + 8} x2={cx + 12} y2={cy + 8} stroke={C.wheat} strokeWidth="2" />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Pro Box unloading station: gantry frame with a suspended box.
export function ProBoxSymbol({ machine: m }) {
  const { w, h } = m;
  const cx = w / 2;
  return (
    <g>
      <path className="body" d={`M4,${h} V6 H${w - 4} V${h}`} fill="none" stroke={C.line} strokeWidth="3" />
      <line x1={cx} y1="6" x2={cx} y2="26" stroke={C.muted} strokeWidth="1.5" />
      <rect x={cx - 22} y="26" width="44" height="34" fill={C.panel2} stroke={C.muted} strokeWidth="1.5" />
      <path d={`M${cx - 22},36 L${cx + 22},50`} stroke="rgba(255,255,255,0.08)" />
    </g>
  );
}

// Vibrating conveyor: tray on springs.
export function VibratorySymbol({ machine: m }) {
  const { w, h } = m;
  const trayH = h - 12;
  const springs = [w * 0.2, w * 0.5, w * 0.8];
  return (
    <g>
      <rect className="body" width={w} height={trayH} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      {springs.map((x) => (
        <path
          key={x}
          d={`M${x - 6},${trayH} l4,4 l-8,3 l8,3 l-4,2`}
          fill="none" stroke={C.muted} strokeWidth="1.2"
        />
      ))}
      <Instruments machine={m} x={w + 24} y={10} />
    </g>
  );
}

// Flexicon filling head: funnel down to a nozzle with bag clamps.
export function FillingHeadSymbol({ machine: m }) {
  const { w, h } = m;
  const cx = w / 2;
  const nozzleY = h - 22;
  return (
    <g>
      <path
        className="body"
        d={`M0,0 H${w} L${cx + 10},${nozzleY} V${h} H${cx - 10} V${nozzleY} Z`}
        fill={C.panel} stroke={C.line} strokeWidth="1.5"
      />
      <circle cx={cx - 16} cy={h - 8} r="5" fill={C.panel2} stroke={C.muted} />
      <circle cx={cx + 16} cy={h - 8} r="5" fill={C.panel2} stroke={C.muted} />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Motorised roller conveyors + inline belt scale (collapsed): roller row on a
// platform with a weigh wedge.
export function RollerScaleSymbol({ machine: m }) {
  const { w, h } = m;
  const r = 7;
  const rollers = [];
  for (let x = r + 4; x < w - r; x += r * 2 + 8) rollers.push(x);
  return (
    <g>
      <line x1="0" y1={h - 2} x2={w} y2={h - 2} stroke={C.line} strokeWidth="3" />
      {rollers.map((x) => (
        <circle key={x} cx={x} cy={r + 2} r={r} fill={C.panel2} stroke={C.muted} strokeWidth="1" />
      ))}
      <path className="body" d={`M${w / 2 - 12},${h - 2} L${w / 2},${h - 12} L${w / 2 + 12},${h - 2} Z`} fill={C.panel} stroke={C.muted} strokeWidth="1" />
    </g>
  );
}

// Bagging scale: weigh hopper on load cells.
export function ScaleSymbol({ machine: m }) {
  const { w, h } = m;
  return (
    <g>
      <rect className="body" width={w} height={h - 10} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <path d={`M10,${h - 10} L4,${h} M${w - 10},${h - 10} L${w - 4},${h}`} stroke={C.muted} strokeWidth="2" />
      <path d={`M8,8 L${w / 2},${h - 16} L${w - 8},8`} fill="none" stroke={C.muted} strokeWidth="1.2" />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Bag filling & sewing: cabinet with a bag hanging below.
export function FillerSymbol({ machine: m }) {
  const { w, h } = m;
  const cx = w / 2;
  const cabH = h - 28;
  return (
    <g>
      <rect className="body" width={w} height={cabH} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <path
        d={`M${cx - 13},${cabH} V${h - 6} Q${cx},${h + 2} ${cx + 13},${h - 6} V${cabH}`}
        fill={C.panel2} stroke={C.muted} strokeWidth="1.2"
      />
      <line x1={cx - 13} y1={cabH + 4} x2={cx + 13} y2={cabH + 4} stroke={C.muted} strokeWidth="1" strokeDasharray="2 2" />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Palletising (collapsed block): cabinet with stacked bags on a pallet.
export function PalletiserSymbol({ machine: m }) {
  const { w, h } = m;
  const px = w / 2 - 30;
  const slatY = h - 8;
  return (
    <g>
      <rect className="body" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect x={px} y={slatY - 14 - row * 11} width="28" height="9" rx="4" fill={C.panel2} stroke={C.muted} strokeWidth="0.8" />
          <rect x={px + 31} y={slatY - 14 - row * 11} width="28" height="9" rx="4" fill={C.panel2} stroke={C.muted} strokeWidth="0.8" />
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={px - 2 + i * 22} y={slatY - 4} width="18" height="4" fill={C.line} />
      ))}
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Off-scene scope edge (source/sink), drawn as a labelled point.
export function StubSymbol({ machine: m }) {
  return (
    <g>
      <text x="0" y="-10" fontFamily={FONT_MONO} fontSize="8" fill={C.muted}>
        {m.name} · out of frame
      </text>
      <circle cx="4" cy="4" r="3.5" fill={C.muted} />
    </g>
  );
}

// Placeholder silhouette for machine types whose final art lands with issue #8.
export function FallbackSymbol({ machine: m }) {
  return (
    <g>
      <rect className="body" width={m.w} height={m.h} fill={C.panel2} stroke={C.line} strokeWidth="1.5" strokeDasharray="3 3" />
      <Instruments machine={m} x={m.w + 22} y={14} />
    </g>
  );
}

// Machine silhouettes. Construction rules per mockups/machine-style-snippet.html:
// flat fills, hairline strokes, fill level clipped inside the silhouette and
// coloured by ratioColor, no gradients. Every symbol draws in local coords;
// the Scene positions it at the machine's world (x, y).
import { C, FONT_DISP, FONT_MONO, ratioColor } from "./theme";

const STATUS_CHIP = {
  new: { text: "NEW", color: C.green, w: 28 },
  relocated: { text: "RELOCATED", color: C.amber, w: 62 },
};

export function MachineLabel({ machine: m }) {
  const at = m.labelAt ?? { x: 0, y: m.h + 18 };
  if (m.smallLabel) {
    return (
      <text x={at.x} y={at.y} fontFamily={FONT_MONO} fontSize="8" fill={C.muted}>
        {m.name} · {m.tag}
      </text>
    );
  }
  const chip = STATUS_CHIP[m.status];
  const tagW = m.tag.length * 5.6;
  return (
    <g>
      <text className="mname" x={at.x} y={at.y} fontFamily={FONT_DISP} fontSize="13" letterSpacing="0.06em" fill={C.text}>
        {m.name}
      </text>
      <text x={at.x} y={at.y + 15} fontFamily={FONT_MONO} fontSize="9" fill={C.muted}>
        {m.tag}
      </text>
      {chip && (
        <g>
          <rect x={at.x + tagW + 8} y={at.y + 6} width={chip.w} height={12} rx="3" fill="none" stroke={chip.color} />
          <text x={at.x + tagW + 8 + chip.w / 2} y={at.y + 15} fontFamily={FONT_MONO} fontSize="7" fill={chip.color} textAnchor="middle" letterSpacing="0.08em">
            {chip.text}
          </text>
        </g>
      )}
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

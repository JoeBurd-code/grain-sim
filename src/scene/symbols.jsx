// Machine silhouettes. Construction rules per mockups/machine-style-snippet.html:
// flat fills, hairline strokes, fill level clipped inside the silhouette and
// coloured by ratioColor, no gradients. Every symbol draws in local coords;
// the Scene positions it at the machine's world (x, y).
import { useLayoutEffect, useRef, useState } from "react";
import { C, FONT_DISP, FONT_MONO, ratioColor } from "./theme";
import { labelPlacement } from "./labelLayout";
import { elevatorChain, chainSceneSpeed, computeElevatorBuckets, carryBucketLoads, bucketGeneration, BUCKET_SPACING, BUCKET_EMPTY_THRESHOLD } from "./elevatorMotion";
import { nextTreaterAnchor, treaterLit, vibratoryFlowing } from "./litState";
import { drumSpinDegPerSec, drumGateFraction } from "./drumFeederMotion";
import { diverterFlapperPoint, diverterSwingPoint } from "./diverterMotion";

// Halo width for the knockout stroke painted behind a label's glyphs. A
// connection path that has to run past a label reads as passing *behind* it
// rather than through it, which is what the old flat text could not do.
const LABEL_HALO = 3.5;

// A machine's name, placed by labelLayout from the side/alignment the machine
// data declares (never a hand-guessed pixel offset — see labelLayout.js).
export function MachineLabel({ machine: m }) {
  const { x, y, anchor, lines, lineHeight, size } = labelPlacement(m);
  const small = size === "small";
  return (
    <text
      className={small ? undefined : "mname"}
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={small ? FONT_MONO : FONT_DISP}
      fontSize={small ? 8 : 13}
      letterSpacing={small ? undefined : "0.06em"}
      fill={small ? C.muted : C.text}
      stroke={C.bg}
      strokeWidth={LABEL_HALO}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {lines.map((text, i) => (
        <tspan key={text} x={x} dy={i === 0 ? 0 : lineHeight}>
          {text}
        </tspan>
      ))}
    </text>
  );
}

// `value` is the digits shown under the code (LT: live measured level; LSH/
// LSL: their configured trip set point — a real limit switch is labelled by
// where it trips, not by a live reading). `tripped` fills the dot solid red
// and never applies to LT (issue #30 acceptance: the LT dot never shows a
// lit state). `pulseGen` is the rule's own edge counter (control.js's
// stepRuleInstruments) — keying the pulse ring on it makes the one-time
// animation replay exactly once per fresh trip, not on every re-render
// while a trip merely holds.
export function InstrumentDot({ x, y, code, leaderFrom, value = "–", tripped = false, pulseGen = 0 }) {
  return (
    <g>
      {leaderFrom && <line x1={leaderFrom.x} y1={leaderFrom.y} x2={x - 9} y2={y} stroke={C.muted} strokeWidth="1" />}
      {tripped && pulseGen > 0 && (
        <circle key={pulseGen} className="instrument-pulse" cx={x} cy={y} r="9" fill="none" stroke={C.red} strokeWidth="1.5" />
      )}
      <circle cx={x} cy={y} r="9" fill={tripped ? C.red : C.bg} stroke={tripped ? C.red : C.muted} />
      <text x={x} y={y - 1} fontFamily={FONT_MONO} fontSize="6.5" fill={tripped ? C.bg : C.muted} textAnchor="middle">{code}</text>
      <text x={x} y={y + 6} fontFamily={FONT_MONO} fontSize="6" fill={tripped ? C.bg : C.muted} textAnchor="middle">{value}</text>
    </g>
  );
}

// Reads one instrument code's live display value + trip state off a
// machine's resolved `dynamic` snapshot. LT reads the sensor's own live
// fill (already published by every level-bearing behaviour's snapshot());
// LSH/LSL read their rule's per-instrument state (control.js's
// stepRuleInstruments, published on the sensor's snapshot keyed by code —
// see useSimEngine.js's publishSnap). A code with no live data yet (the
// sim hasn't primed, or this machine has no interlock at all) falls back to
// the muted placeholder rather than fabricating a value.
function readInstrument(code, dynamic) {
  if (code === "LT") {
    return dynamic?.fill != null ? { value: Math.round(dynamic.fill * 100), tripped: false, pulseGen: 0 } : {};
  }
  const inst = dynamic?.instruments?.[code];
  if (!inst) return {};
  return { value: Math.round(inst.setpoint * 100), tripped: inst.tripped, pulseGen: inst.pulseGen };
}

// Stacked ISA dots beside a machine for whatever instruments its data declares.
function Instruments({ machine: m, x, y, dynamic }) {
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
          {...readInstrument(code, dynamic)}
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
export function BinSymbol({ machine: m, dynamic }) {
  const { w, h } = m;
  const taper = Math.min(45, h * 0.32);
  const bodyH = h - taper;
  const cx = w / 2;
  const outer = `M0,0 H${w} V${bodyH} L${cx + 10},${h} H${cx - 10} L0,${bodyH} Z`;
  const inner = `M4,4 H${w - 4} V${bodyH - 2} L${cx + 7},${h - 4} H${cx - 7} L4,${bodyH - 2} Z`;
  return (
    <g>
      <path className="body" d={outer} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <FillLevel clipId={`fill-${m.id}`} innerPath={inner} x={0} w={w} top={4} bottom={h - 4} ratio={dynamic.fill} />
      <Instruments machine={m} x={w + 25} y={20} dynamic={dynamic} />
    </g>
  );
}

// Rectangular bin on legs, parameterized by the machine footprint (w x h).
export function MetalBinSymbol({ machine: m, dynamic }) {
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
      <FillLevel clipId={`fill-${m.id}`} innerPath={inner} x={0} w={w} top={4} bottom={bodyH + taper - 4} ratio={dynamic.fill} />
      <Instruments machine={m} x={w + 25} y={20} dynamic={dynamic} />
    </g>
  );
}

// Bucket outline size for the live, density-driven treatment below — large
// enough to read as a real open-topped bucket (roughly 14x12) while still
// leaving about half of BUCKET_SPACING as a visible gap to the next one.
const BUCKET_W = 14;
const BUCKET_H = 12;
// Small inset so the grain rect never visually merges with the bucket's own
// outline stroke.
const BUCKET_GRAIN_INSET = 2;
const BUCKET_GRAIN_FLOOR_GAP = 1.5;
// Fixed opacity a loaded bucket used before density existed (issue #31) —
// kept as a literal for the legacy binary-fill paths below (decorative
// fallback, and the leadingProgress/trailingProgress sweep) now that the
// opacity-as-density trick itself (BUCKET_FILL_OPACITY_MIN/RANGE) is
// retired along with the density-driven fill it used to stand in for.
const LEGACY_BUCKET_OPACITY = 0.9;
const LEGACY_BUCKET_SIZE = 7;

// One pool slot's DOM refs for the live bucket-motion path — an outline
// path element and its own grain-level rect, both mutated in place by
// useMachineMotion's per-frame callback rather than re-rendered by React.
function ElevatorBuckets({ m, dynamic, motion }) {
  const { totalLen } = elevatorChain(m);
  // A couple of slots beyond the steady-state bucket count so a bucket
  // entering or leaving at the chain's own wrap point always has an
  // element to appear in/disappear from, rather than being clipped.
  const poolSize = Math.floor(totalLen / BUCKET_SPACING) + 3;
  const outlineRefs = useRef([]);
  const grainRefs = useRef([]);
  const mRef = useRef(m);
  const dynamicRef = useRef(dynamic);
  // Each physical bucket's carried load, keyed by bucketGeneration and kept
  // across frames — see carryBucketLoads (elevatorMotion.js) for why a
  // bucket's fill can't just be sampled at wherever it currently sits.
  const heldLoadsRef = useRef(new Map());

  // Runs every render (no deps): keeps the frame callback below reading the
  // latest machine/dynamic without re-registering it, and the live chain
  // speed can change on any publish tick (a cheap Map write, not a
  // subscription).
  useLayoutEffect(() => {
    mRef.current = m;
    dynamicRef.current = dynamic;
    motion.setRate(m.id, chainSceneSpeed(m, dynamic?.chainSpeedMPerMin));
  });

  useLayoutEffect(() => {
    const id = m.id;
    const slotUsed = new Array(poolSize);
    function applyFrame(phase) {
      const dyn = dynamicRef.current;
      const buckets = carryBucketLoads(
        computeElevatorBuckets(mRef.current, dyn, phase),
        phase,
        heldLoadsRef.current,
        {
          bandCount: dyn?.densityProfile?.length ?? 0,
          hasMaterial: dyn?.inTransitVol > 0 || dyn?.backlogVol > 0,
          // Issue #69: undefined for plain transportDelay's own snapshot
          // (treatingElevator) — no masking concept there, so no cutoff.
          cutoffFrac: dyn?.selectedSpanFraction,
        },
      );
      slotUsed.fill(false);
      // Keyed by bucketGeneration, not array index: a bucket's own array
      // index shifts by one every time a new bucket enters the boot or an
      // old one discharges off the head, which would otherwise hand an
      // unrelated bucket's fill to whatever DOM node used to occupy that
      // index mid-transit — the exact "front bucket keeps refilling" glitch
      // this replaced (see this symbol's own comment above).
      for (const b of buckets) {
        const gen = bucketGeneration(b.pos, phase);
        const slot = ((gen % poolSize) + poolSize) % poolSize;
        slotUsed[slot] = true;
        const outlineEl = outlineRefs.current[slot];
        const grainEl = grainRefs.current[slot];
        const left = b.x - BUCKET_W / 2, top = b.y - BUCKET_H / 2, bottom = b.y + BUCKET_H / 2, right = b.x + BUCKET_W / 2;
        outlineEl?.setAttribute("d", `M${left},${top} V${bottom} H${right} V${top}`);
        outlineEl?.setAttribute("opacity", "1");
        const filled = b.fillRatio > BUCKET_EMPTY_THRESHOLD;
        grainEl?.setAttribute("opacity", filled ? "1" : "0");
        if (filled) {
          const grainH = Math.min(1, b.fillRatio) * (BUCKET_H - BUCKET_GRAIN_FLOOR_GAP);
          grainEl?.setAttribute("x", (left + BUCKET_GRAIN_INSET).toFixed(1));
          grainEl?.setAttribute("width", (BUCKET_W - 2 * BUCKET_GRAIN_INSET).toFixed(1));
          grainEl?.setAttribute("y", (bottom - BUCKET_GRAIN_FLOOR_GAP - grainH).toFixed(1));
          grainEl?.setAttribute("height", grainH.toFixed(1));
        }
      }
      for (let slot = 0; slot < poolSize; slot++) {
        if (slotUsed[slot]) continue;
        outlineRefs.current[slot]?.setAttribute("opacity", "0");
        grainRefs.current[slot]?.setAttribute("opacity", "0");
      }
    }
    motion.frameRef(id)(applyFrame);
    applyFrame(motion.getPhase(id));
    return () => motion.frameRef(id)(null);
  }, [m.id, motion, poolSize]);

  return (
    <g>
      {Array.from({ length: poolSize }, (_, i) => (
        <g key={i}>
          <path ref={(el) => { outlineRefs.current[i] = el; }} fill="none" stroke={C.line} strokeWidth="1.5" opacity="0" />
          <rect ref={(el) => { grainRefs.current[i] = el; }} fill={C.wheat} opacity="0" />
        </g>
      ))}
    </g>
  );
}

// The pre-#65 static decoration: a binary full/empty sweep with no live
// motion, for a machine with no live transit data at all (not sim-enabled
// yet). Shared by ElevatorSymbol and ConveyorSymbol (issue #69) — both fall
// back to this exact treatment when `dynamic` carries no densityProfile.
function LegacyBuckets({ m, dynamic }) {
  return computeElevatorBuckets(m, dynamic, 0).map((b, i) => (
    <rect
      key={i}
      x={(b.x - LEGACY_BUCKET_SIZE / 2).toFixed(1)} y={(b.y - LEGACY_BUCKET_SIZE / 2).toFixed(1)}
      width={LEGACY_BUCKET_SIZE} height={LEGACY_BUCKET_SIZE}
      fill={b.fillRatio > BUCKET_EMPTY_THRESHOLD ? C.wheat : "none"}
      opacity={b.fillRatio > BUCKET_EMPTY_THRESHOLD ? LEGACY_BUCKET_OPACITY : 1}
      stroke={C.line}
    />
  ));
}

// Simatek pendulum bucket elevator: lower horizontal run, climb, upper run.
// Geometry from machine data: w, h, geom.colX (column left edge), geom.duct.
// `dynamic.densityProfile` (issue #31, transportDelay's snapshot) gives each
// bucket's fill a real local-density value instead of a binary full/empty
// split, so a mismatch between feed rate and chain speed shows up as
// buckets visibly thinning or filling, not just as a full/empty sweep; that
// same live data drives real chain travel (issue #65, useMachineMotion) —
// bucket positions advance at the live chainSpeedMPerMin, frozen while
// paused and scaled by the speed multiplier, wrapping every BUCKET_SPACING.
// Falls back to `leadingProgress`/`trailingProgress` (issue #21) for a
// binary, stationary sweep when no density profile is published yet, and to
// the original static half-loaded decoration when the machine has no live
// transit data at all (not sim-enabled yet, e.g. the packaging elevator) —
// both of those two fallbacks are untouched from before this issue.
export function ElevatorSymbol({ machine: m, dynamic, motion }) {
  const { w, h } = m;
  const { colX, duct } = m.geom;
  const gapX = w - 60;
  const bandCount = dynamic?.densityProfile?.length ?? 0;

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
      {bandCount > 0 ? (
        <ElevatorBuckets m={m} dynamic={dynamic} motion={motion} />
      ) : (
        <LegacyBuckets m={m} dynamic={dynamic} />
      )}
      {/* discharge gap in the duct floor; pulses while actively discharging */}
      <rect x={gapX} y={duct - 4} width="32" height="9" fill={dynamic?.backlogVol > 0 ? C.wheat : C.bg} opacity={dynamic?.backlogVol > 0 ? 0.5 : 1} />
      {/* head motor */}
      <rect x={w + 2} y="6" width="30" height="26" fill={C.panel2} stroke={C.line} />
      <path d={`M${w + 6},10 L${w + 28},28 M${w + 6},28 L${w + 28},10`} stroke={C.line} strokeWidth="1" />
      {/* live chain speed readout (issue #31), already folding in the manual VFD dial and any interlock throttle */}
      <text x={w + 17} y="46" fontFamily={FONT_MONO} fontSize="8" fill={C.muted} textAnchor="middle">
        {dynamic?.chainSpeedMPerMin != null ? `${dynamic.chainSpeedMPerMin.toFixed(1)} m/min` : "– m/min"}
      </text>
      {(m.instruments ?? []).includes("ST") && (
        <InstrumentDot
          x={w + 17} y={-22} code="ST" leaderFrom={{ x: w + 17, y: 4 }}
          value={dynamic?.chainSpeedMPerMin != null ? dynamic.chainSpeedMPerMin.toFixed(1) : "–"}
        />
      )}
    </g>
  );
}

// 2-way pneumatic diverter: diamond with a flapper that swings to the
// vertex matching the router's own live `selected` port (issue #68) — out1
// at the left vertex, out2 at the right, per the anchors lineData.js sets
// (issue #44). The swing eases over DIVERTER_SWING_SEC rather than snapping,
// so a route change is noticed rather than missed between publish ticks
// (useSimEngine's own throttle, see flowAnimation.js's own comment on this).
// Driven off useMachineMotion's shared per-machine clock (frozen while
// paused, scaled by the speed multiplier) via a plain 1-unit-per-sim-second
// rate, exactly the elapsed-time clock useMachineMotion.js's own comment
// earmarked for this.
export function DiverterSymbol({ machine: m, dynamic, motion }) {
  const selected = dynamic?.selected ?? "out1";
  const lineRef = useRef(null);
  const stateRef = useRef(null);
  if (stateRef.current === null) {
    stateRef.current = { port: selected, from: diverterFlapperPoint(selected), changePhase: 0 };
  }

  useLayoutEffect(() => {
    motion.setRate(m.id, 1);
  });

  useLayoutEffect(() => {
    const st = stateRef.current;
    if (st.port === selected) return;
    // Capture wherever the flapper is actually drawn right now (mid-swing or
    // settled) as the new swing's own starting point, so reversing the
    // selection mid-motion eases smoothly back rather than jumping.
    st.from = diverterSwingPoint(st.from, st.port, motion.getPhase(m.id), st.changePhase);
    st.port = selected;
    st.changePhase = motion.getPhase(m.id);
  }, [selected, motion, m.id]);

  useLayoutEffect(() => {
    const id = m.id;
    function applyFrame(phase) {
      const st = stateRef.current;
      const p = diverterSwingPoint(st.from, st.port, phase, st.changePhase);
      lineRef.current?.setAttribute("x2", p.x.toFixed(2));
      lineRef.current?.setAttribute("y2", p.y.toFixed(2));
    }
    motion.frameRef(id)(applyFrame);
    applyFrame(motion.getPhase(id));
    return () => motion.frameRef(id)(null);
  }, [m.id, motion]);

  const initial = diverterFlapperPoint(selected);
  return (
    <g>
      <path className="body" d="M16,0 L32,16 L16,32 L0,16 Z" fill={C.panel2} stroke={C.line} strokeWidth="1.5" />
      <line ref={lineRef} x1="16" y1="16" x2={initial.x} y2={initial.y} stroke={C.wheat} strokeWidth="2" />
    </g>
  );
}

// Belt / transport conveyor: band with end rollers and segment ticks.
// Issue #69: the pendulum conveyor (52.604.E00) is the only machine of this
// type, so it's safe to give it the same live, density-driven grain
// treatment #65 gave the treating elevator's own bucket chain — the two are
// physically the same Simatek pendulum-conveyor concept (lineData.js's own
// comment on it), reusing elevatorMotion.js's chain/bucket helpers
// unchanged (elevatorChain's own geom-less fallback draws a straight run
// here instead of the Z-shaped path a real `geom` block draws). No other
// machine renders through this symbol, so nothing here needs a fallback for
// a machine that legitimately has neither buckets nor a `selected` port.
// `dynamic.densityProfile` already arrives pre-masked past whichever outlet
// is currently selected (behaviors.js's own snapshotRoutedTransportDelay
// masking), so the buckets themselves need no awareness of the selection —
// only the discharge-gap indicator below reads `dynamic.selected`, to draw
// itself at the right outlet's own anchor position.
export function ConveyorSymbol({ machine: m, dynamic, motion }) {
  const { w, h } = m;
  const r = h / 2;
  const ticks = [];
  for (let x = 26; x < w - 8; x += 26) ticks.push(x);
  const bandCount = dynamic?.densityProfile?.length ?? 0;
  const dischargeAnchor = dynamic?.selected ? m.anchors?.[dynamic.selected] : null;
  return (
    <g>
      <rect className="body" x="0" y="0" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      {ticks.map((x) => (
        <line key={x} x1={x} y1="2" x2={x} y2={h - 2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {bandCount > 0 ? (
        <ElevatorBuckets m={m} dynamic={dynamic} motion={motion} />
      ) : (
        <LegacyBuckets m={m} dynamic={dynamic} />
      )}
      {/* discharge gap at the selected outlet's own anchor position; pulses while actively discharging */}
      {dischargeAnchor && (
        <rect
          x={(dischargeAnchor.x - 16).toFixed(1)} y={h - 9} width="32" height="9"
          fill={dynamic?.backlogVol > 0 ? C.wheat : C.bg}
          opacity={dynamic?.backlogVol > 0 ? 0.5 : 1}
        />
      )}
      <circle cx="0" cy={r} r={r + 2} fill={C.panel2} stroke={C.muted} strokeWidth="1" />
      <circle cx={w} cy={r} r={r + 2} fill={C.panel2} stroke={C.muted} strokeWidth="1" />
      {/* live chain speed readout, same treatment ElevatorSymbol's own gives */}
      {dynamic?.chainSpeedMPerMin != null && (
        <text x={w / 2} y={h + 14} fontFamily={FONT_MONO} fontSize="8" fill={C.muted} textAnchor="middle">
          {dynamic.chainSpeedMPerMin.toFixed(1)} m/min
        </text>
      )}
      <Instruments machine={m} x={w + 24} y={14} dynamic={dynamic} />
    </g>
  );
}

// Drum feeder: housing with a rotary drum. Two idioms, deliberately split
// (issue #67): spin (drumSpinDegPerSec, drumFeederMotion.js) says the drum
// is actually delivering, scaled by its live commanded rate; the outlet
// gate slot's two shutter leaves (drumGateFraction, same module) show the
// real gate actuator's live opening. Spin alone can't explain *why* the
// rate is what it is, and the gate alone can't say whether anything is
// moving right now — see drumFeederMotion.js for how each reads the
// snapshot.
const DRUM_TICK_ANGLES_DEG = [0, 120, 240];
const DRUM_GATE_SLOT_W = 28;
const DRUM_GATE_SLOT_H = 8;

export function DrumFeederSymbol({ machine: m, dynamic, motion }) {
  const { w, h } = m;
  const r = h / 2 - 6;
  const cx = w / 2, cy = h / 2;
  const tickGroupRef = useRef(null);

  // Runs every render (no deps), same as ElevatorBuckets above: keeps the
  // registered rate current on every publish tick without re-registering
  // the frame callback below.
  useLayoutEffect(() => {
    motion.setRate(m.id, drumSpinDegPerSec(dynamic));
  });

  useLayoutEffect(() => {
    const id = m.id;
    function applyFrame(phase) {
      tickGroupRef.current?.setAttribute("transform", `rotate(${phase % 360},${cx},${cy})`);
    }
    motion.frameRef(id)(applyFrame);
    applyFrame(motion.getPhase(id));
    return () => motion.frameRef(id)(null);
  }, [m.id, motion, cx, cy]);

  const gate = drumGateFraction(dynamic);
  const slotX = cx - DRUM_GATE_SLOT_W / 2, slotY = h - DRUM_GATE_SLOT_H - 2;
  const leafW = ((1 - gate) / 2) * DRUM_GATE_SLOT_W;

  return (
    <g>
      <rect className="body" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r} fill={C.panel2} stroke={C.muted} strokeWidth="1" />
      <g ref={tickGroupRef}>
        {DRUM_TICK_ANGLES_DEG.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={cx} y1={cy}
              x2={(cx + r * 0.8 * Math.cos(rad)).toFixed(1)}
              y2={(cy + r * 0.8 * Math.sin(rad)).toFixed(1)}
              stroke={C.muted} strokeWidth="1.5"
            />
          );
        })}
      </g>
      {/* outlet gate: two shutter leaves close in from each side as the live
          gateFraction falls, leaving a gap in the middle proportional to how
          open the real actuator is right now */}
      <rect x={slotX} y={slotY} width={DRUM_GATE_SLOT_W} height={DRUM_GATE_SLOT_H} fill={C.bg} stroke={C.muted} strokeWidth="1" />
      {leafW > 0 && <rect x={slotX} y={slotY} width={leafW.toFixed(1)} height={DRUM_GATE_SLOT_H} fill={C.muted} />}
      {leafW > 0 && <rect x={(slotX + DRUM_GATE_SLOT_W - leafW).toFixed(1)} y={slotY} width={leafW.toFixed(1)} height={DRUM_GATE_SLOT_H} fill={C.muted} />}
      <Instruments machine={m} x={w + 24} y={14} dynamic={dynamic} />
    </g>
  );
}

// Scalping screen: housing with an inclined mesh deck. The mesh and shake
// line pick up C.wheat while `dynamic.flowing` (issue #26, splitter's own
// snapshot) is true — a splitter holds no material for a fill bar to show,
// so this is its stand-in for "is it actually doing anything right now",
// the same role the elevator's discharge-gap pulse plays for backlogVol.
export function ScreenSymbol({ machine: m, dynamic }) {
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
  const flowing = dynamic?.flowing ?? false;
  return (
    <g>
      <rect className="body" width={w} height={h} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <path d={mesh} fill="none" stroke={flowing ? C.wheat : C.muted} strokeWidth={flowing ? 2 : 1.5} opacity={flowing ? 0.95 : 1} />
      <line x1={x0} y1={y0 + 14} x2={x1 - 18} y2={y1 + 6} stroke={flowing ? C.wheat : "rgba(255,255,255,0.07)"} strokeWidth="1" opacity={flowing ? 0.4 : 1} />
      <Instruments machine={m} x={w + 24} y={14} />
    </g>
  );
}

// Batch treater: vessel with top motor and agitator paddles. Lit only
// (issue #66, revised twice after review — no rotation, and no longer a
// real debounce): the working element — agitator shaft and paddle X, not
// the vessel housing — picks up a wheat tint on a faked periodic pulse
// (treaterLit, litState.js), not by tracking `batchCycle`'s real phase
// transitions directly. Why: useSimEngine.js only publishes a snapshot
// every 100ms of real time, but a well-stocked pre-bin's charge draw is
// atomic — the real "charging" tick between batches lasts a single 0.05s
// sim step and essentially never lands on a publish, so `dynamic.phase` in
// the running app never actually reads anything but "holding" once the
// first batch completes. There is no real transition left to observe, so
// this fakes one instead — signed off by the user after seeing the
// (correct, but visibly useless) real-transition version always read as
// on. `simTime` (Scene.jsx, ultimately `snap.t`) is what phases the fake
// pulse: sim time rather than useMachineMotion's rAF clock, so this
// freezes on pause and scales with the speed multiplier for free, and
// (being a plain state indicator, not motion) keeps updating under
// prefers-reduced-motion rather than incorrectly freezing under it.
export function TreaterSymbol({ machine: m, dynamic, simTime }) {
  const { w, h } = m;
  const cx = w / 2;
  const phase = dynamic?.phase;
  const now = simTime ?? 0;
  const [anchor, setAnchor] = useState(null);

  // "Adjust state during rendering" (React's own pattern, not an effect):
  // nextTreaterAnchor is a one-time-per-batch latch, and treaterLit below
  // needs this render's own fresh anchor immediately — an effect would only
  // apply it starting the *next* render, one throttled publish (~100ms)
  // late on every transition. Safe here (unlike a spread-object version of
  // this pattern shipped and reverted earlier in this same file's history)
  // because the anchor is a bare primitive (a number, or null): `!==`
  // compares by value, so a no-op call can never be mistaken for a change
  // the way a fresh `{ ...state }` copy was.
  const nextAnchor = nextTreaterAnchor(phase, anchor, now);
  if (nextAnchor !== anchor) setAnchor(nextAnchor);

  const agitatorColor = treaterLit(phase, dynamic?.cycleSec, nextAnchor, now) ? C.wheat : C.muted;

  return (
    <g>
      <rect className="body" x="0" y="16" width={w} height={h - 16} rx="14" fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <rect x={cx - 13} y="0" width="26" height="18" fill={C.panel2} stroke={C.line} />
      <line x1={cx} y1="18" x2={cx} y2={h - 30} stroke={agitatorColor} strokeWidth="1.5" />
      <line x1={cx - 26} y1={h - 38} x2={cx + 26} y2={h - 26} stroke={agitatorColor} strokeWidth="1.5" />
      <line x1={cx - 26} y1={h - 26} x2={cx + 26} y2={h - 38} stroke={agitatorColor} strokeWidth="1.5" />
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

// Vibrating conveyor: tray on springs. Lit (issue #66, same treatment the
// scalping screen established, issue #26): the material bed picks up
// C.wheat while it is actually conveying — read off the live
// flowRateM3PerSec rather than the commanded `rate`, so a conveyor dialed up
// but starved by an empty Flexicon pre-bin above it reads dark rather than
// running. Deliberately not a shake animation (rejected, see issue #64: the
// oscillation didn't look good at this scale) — lit only.
export function VibratorySymbol({ machine: m, dynamic }) {
  const { w, h } = m;
  const trayH = h - 12;
  const springs = [w * 0.2, w * 0.5, w * 0.8];
  const flowing = vibratoryFlowing(dynamic);
  return (
    <g>
      <rect className="body" width={w} height={trayH} fill={C.panel} stroke={C.line} strokeWidth="1.5" />
      <line
        x1="6" y1={trayH - 8} x2={w - 6} y2={trayH - 8}
        stroke={flowing ? C.wheat : "rgba(255,255,255,0.07)"}
        strokeWidth={flowing ? 3 : 1.5}
        opacity={flowing ? 0.85 : 1}
      />
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

// Off-scene scope edge (source/sink), drawn as a labelled point. A stub with
// nothing sim-enabled behind it (every stub but bigBagStub today) still just
// draws the label — `dynamic.bagCount` is only ever present once a stub's own
// `sim.kind` publishes one (terminalSink's optional `bagSizeM3`, issue #48),
// so this reads generically off whatever the snapshot happens to carry
// rather than special-casing any one stub by id.
// The caption clears the point itself horizontally: a stub is the end of a
// connection, so its own line arrives at (or leaves from) the dot's centre,
// and a caption starting at x=0 sat directly on that line wherever the run
// was vertical (both metal-bin discharges, the pallet outfeed).
const STUB_LABEL_X = 14;

export function StubSymbol({ machine: m, dynamic }) {
  const count = dynamic?.bagCount;
  const halo = { stroke: C.bg, strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" };
  return (
    <g>
      {count != null && (
        <text x={STUB_LABEL_X} y="-20" fontFamily={FONT_MONO} fontSize="8" fill={C.wheat} {...halo}>
          {count} bags
        </text>
      )}
      <text x={STUB_LABEL_X} y="-10" fontFamily={FONT_MONO} fontSize="8" fill={C.muted} {...halo}>
        {m.name}
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

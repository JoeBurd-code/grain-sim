// Pure geometry for the batch treater symbol, kept out of symbols.jsx so the
// projection maths is unit-testable without rendering — same reasoning as
// elevatorMotion.js's bucket geometry, drumFeederMotion.js's spin rate and
// litState.js's lit derivations.
//
// The machine is a vertical drum that turns like a top-loading washing
// machine, standing on a rectangular plinth: fed through its own open top
// (there is no inlet fitting — the mouth IS the inlet), discharging through
// a chute on the left face of the plinth. The weigh hopper the symbol used
// to draw is not part of this machine at all; that is the treater pre-bin
// above it.
//
// EVERY rotating mark sits on the same projection. A point at drum angle
// `th` is at (cx + rx·sin th, cy + ry·cos th) with ry about a quarter of rx,
// so marks bunch up and thin out approaching the left and right edges and
// spread out and thicken crossing the face. That foreshortening is the whole
// reason a flat shape reads as a turning cylinder rather than as stripes
// sliding sideways. Anything with cos th <= 0 is on the far side and is not
// drawn at all.

// Design footprint. Every coordinate below is authored in these units and
// scaled to whatever footprint the line data declares, so the drawing stays
// exactly the one that was signed off while still surviving a w/h change.
// Proportions are taken off the engineer's own sketch, not invented: drum
// height about 1.3x drum width, plinth about 1.6x drum width, cap ellipses
// at about 0.23 of the drum radius.
export const DESIGN = { w: 132, h: 110 };

const DRUM = { cx: 75, rx: 34, ry: 8, top: 8, bot: 80 };
const BASE = { x: 20, y: 78, w: 110, h: 28, r: 3 };
// Chute: roots 6 units inside the plinth's left face (so the plinth's own
// edge covers the join) and runs down-left to a mouth flush with the
// footprint. Its mid-height is the machine's `out` anchor.
const CHUTE = { rootX: 26, rootTop: 84, rootBot: 96, mouthTop: 92, mouthBot: 104 };
const FEET = [{ x: 36, w: 12 }, { x: 96, w: 12 }];
const FOOT_H = 4;
// Usable depth for the drawn charge. Slightly inside the shell top and
// bottom so a full drum still shows its own rim rather than painting over it.
const FILL_TOP = 10, FILL_BOT = 82;
// How far below the shell the batch rect is drawn before the clip takes
// over — past the lowest point of the lower cap, so a full drum has no
// unpainted crescent at the bottom.
const FILL_OVERRUN = 96;

export const DRUM_RIB_COUNT = 12;
export const DRUM_PRONG_COUNT = 3;

// Below this the mark is edge-on or behind the drum, and is not drawn. Not
// exactly 0: a mark at cos th = 0 is exactly side-on, zero-width ink on the
// silhouette itself, and drawing it just doubles the outline.
const FAR_SIDE_EPS = 0.03;

// Degrees per sim-second the drum turns while the machine is actually
// running. Legibility figure, not a plant one: no document we hold gives the
// Niklas machine's drum speed (docs/OPEN_QUESTIONS.md), and the PLC treats
// 52.508.T00 as a plain start/stop object. Registered with useMachineMotion
// as a per-SIM-second rate, same as drumFeederMotion's own, so it freezes on
// pause and scales with the speed multiplier like every other motion on the
// line. That does mean the drum aliases at 20x, the usual wagon-wheel
// effect; the alternative — a real-time rate — would have this one machine
// keep turning at full tilt while a paused line stood still, which is worse.
export const TREATER_DRUM_DEG_PER_SEC = 200;

// Scales the design drawing onto the authored footprint.
export function treaterGeometry(w = DESIGN.w, h = DESIGN.h) {
  const sx = w / DESIGN.w, sy = h / DESIGN.h;
  const X = (v) => v * sx, Y = (v) => v * sy;
  const d = { cx: X(DRUM.cx), rx: X(DRUM.rx), ry: Y(DRUM.ry), top: Y(DRUM.top), bot: Y(DRUM.bot) };
  const left = d.cx - d.rx, right = d.cx + d.rx;
  return {
    w, h, drum: d,
    // Shell silhouette: up the near-left side, over the BACK of the top rim,
    // down the right side, under the FRONT of the base. Sweep flags matter —
    // 1 over the top, 1 under the bottom, so the solid bulges both ways.
    shell: `M${left},${d.top} A${d.rx},${d.ry} 0 0 1 ${right},${d.top}`
         + ` V${d.bot} A${d.rx},${d.ry} 0 0 1 ${left},${d.bot} Z`,
    base: { x: X(BASE.x), y: Y(BASE.y), w: X(BASE.w), h: Y(BASE.h), r: BASE.r },
    chute: `M${X(CHUTE.rootX)},${Y(CHUTE.rootTop)} L0,${Y(CHUTE.mouthTop)}`
         + ` V${Y(CHUTE.mouthBot)} L${X(CHUTE.rootX)},${Y(CHUTE.rootBot)} Z`,
    chuteMouth: { top: Y(CHUTE.mouthTop), bottom: Y(CHUTE.mouthBot) },
    feet: FEET.map((f) => ({ x: X(f.x), y: Y(BASE.y + BASE.h), w: X(f.w), h: Y(FOOT_H) })),
    fillTop: Y(FILL_TOP), fillBottom: Y(FILL_BOT), fillOverrun: Y(FILL_OVERRUN),
    driveBox: { x: X(102), y: Y(85), w: X(22), h: Y(16) },
  };
}

// Surface height of the drawn charge, in local coords. A cylinder's cross
// section does not change with depth, so the surface ellipse keeps the drum's
// own radius at every level — which is itself a cylinder cue, for free.
export function drumFillY(g, fill) {
  const f = Math.max(0, Math.min(1, fill));
  return g.fillBottom - f * (g.fillBottom - g.fillTop);
}

// One rib per index, or null where that rib is currently round the back.
// Index-stable by design: the caller holds a fixed set of DOM nodes and
// hides the nulls, rather than adding and removing elements every frame.
export function drumRibs(g, deg, count = DRUM_RIB_COUNT) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const th = ((deg + (i * 360) / count) * Math.PI) / 180;
    const c = Math.cos(th);
    if (c <= FAR_SIDE_EPS) { out.push(null); continue; }
    out.push({
      x: g.drum.cx + g.drum.rx * Math.sin(th),
      y1: g.drum.top + g.drum.ry * c,
      y2: g.drum.bot + g.drum.ry * c,
      width: 0.6 + 1.3 * c,
      opacity: 0.3 + 0.45 * c,
    });
  }
  return out;
}

// The agitator seen through the open mouth, as tapered paddle outlines.
// THREE paddles, not four: with four, the opposite pair lines up into a
// single bar straight across the mouth every quarter turn — measured at 25
// units each, so a 50-unit bar on a 68-unit mouth — and the whole thing
// reads as a propeller rather than an agitator. Three can never line up.
// Returned far-paddle-first so a painter's-algorithm caller gets the depth
// order right without sorting.
export function drumProngs(g, deg, count = DRUM_PRONG_COUNT) {
  const hubX = g.drum.cx, hubY = g.drum.top;
  const rx = g.drum.rx * 0.676, ry = g.drum.ry * 0.675;   // inside the rim
  const blades = [];
  for (let i = 0; i < count; i++) {
    const th = ((deg + (i * 360) / count) * Math.PI) / 180;
    blades.push({ c: Math.cos(th), x: hubX + rx * Math.sin(th), y: hubY + ry * Math.cos(th) });
  }
  blades.sort((a, b) => a.c - b.c);
  return blades.map((b) => {
    const f = (b.c + 1) / 2;                               // 0 far, 1 near
    const dx = b.x - hubX, dy = b.y - hubY;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;                   // unit normal
    const hub = 0.6, tip = 1.1 + 1.1 * f;                  // half-widths
    return {
      d: `M${hubX + px * hub},${hubY + py * hub} L${b.x + px * tip},${b.y + py * tip}`
       + ` L${b.x - px * tip},${b.y - py * tip} L${hubX - px * hub},${hubY - py * hub} Z`,
      opacity: 0.6 + 0.4 * f,
    };
  });
}

// Spin rate for useMachineMotion. The drum turns whenever the machine is
// genuinely live. A utilities trip ("stopped") and a machine held off by the
// after-bin interlock ("waiting") both stand still, and so does a treater
// that has never completed a batch — at boot, or straight after a RESTART,
// the whole chain has to prime from empty and a drum spinning on nothing
// would claim the line was running before any seed reached it. That last
// gate is the same `firstMixingAt` latch the drawn batch is phased off
// (litState.js), so the two can never disagree.
export function treaterDrumDegPerSec(phase, firstMixingAt) {
  if (firstMixingAt == null) return 0;
  const live = phase === "charging" || phase === "holding" || phase === "discharging";
  return live ? TREATER_DRUM_DEG_PER_SEC : 0;
}

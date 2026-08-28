// Pure geometry + phase math for the bucket elevator chain (issue #65),
// split out of ElevatorSymbol (symbols.jsx) so the wrap arithmetic is
// unit-testable without a DOM — the same split flowAnimation.js/
// useFlowAnimation.js already use for the flow-dash overlay.

// Decorative bucket pitch along the chain path, and the true-empty cutoff
// below which a bucket renders as a bare outline rather than any fill —
// both pixel-space picks unrelated to the sim's own DENSITY_BANDS
// resolution (behaviors.js).
export const BUCKET_SPACING = 26;
export const BUCKET_EMPTY_THRESHOLD = 0.03;

// A bucket right at the sweep's edge would otherwise flicker between loaded
// and empty as floating-point progress crosses the boundary each tick —
// only matters for the binary leadingProgress/trailingProgress fallback.
const PROGRESS_BAND_SLACK = 0.02;

// The chain's three drawn segments (bottom run, climb, top run) and their
// total length, from machine geometry alone. Fixed for the life of the
// symbol, independent of live phase.
export function elevatorChain(m) {
  const { w, h } = m;
  const { colX } = m.geom;
  const points = [
    [20, h - 18],
    [colX + 18, h - 18],
    [colX + 18, 18],
    [w - 20, 18],
  ];
  const totalLen = points
    .slice(1)
    .reduce((a, [x1, y1], i) => a + Math.hypot(x1 - points[i][0], y1 - points[i][1]), 0);
  return { points, totalLen };
}

// Scene units the chain travels per second of sim time at the given live
// chain speed. Derived from the machine's own real-world transit distance
// (m.sim.distanceM) against the chain path's own scene length, rather than
// a second, separately-tuned "how fast should this look" constant that
// could quietly drift out of sync with symbols.jsx's pixel geometry. This
// mirrors the engine's own transportDelay physics (behaviors.js), which
// already treats the whole drawn chain (all of totalLen, not just the
// climb) as covering `distanceM` of real transit — the same assumption the
// pre-#65 leadingProgress/trailingProgress sweep and densityProfile bands
// already made. `distanceM`'s own real-world fidelity is a separately
// logged, pre-existing gap for one machine (treatingElevator's is rise-only,
// missing its horizontal runs — see lineData.js's own comment on it and
// docs/OPEN_QUESTIONS.md); not this function's or this issue's concern to
// resolve, only to stay consistent with.
// Returns 0 (no motion) whenever either figure is missing or non-positive —
// a stopped chain, or a machine with no live transit data at all.
export function chainSceneSpeed(m, chainSpeedMPerMin) {
  const distanceM = m.sim?.distanceM;
  if (!(distanceM > 0) || !(chainSpeedMPerMin > 0)) return 0;
  const { totalLen } = elevatorChain(m);
  return (chainSpeedMPerMin / 60) * (totalLen / distanceM);
}

// Bucket positions + fill ratios along the chain, offset by `phaseOffset`
// (scene units the chain has travelled so far). The bucket train is
// periodic with period BUCKET_SPACING, so only phaseOffset's remainder mod
// spacing actually matters — passing 0 (no motion) reproduces the original,
// pre-#65 static layout exactly, which is what the decorative fallback and
// the binary leadingProgress/trailingProgress path (issue #21) still use.
//
// Bucket *positions* move with phase; which density band a bucket samples
// stays a function of where it now sits on the path (pathFrac), not of the
// bucket's identity, so grain still reads as riding along with the chain
// rather than teleporting between fixed slots.
export function computeElevatorBuckets(m, dynamic, phaseOffset = 0) {
  const { points, totalLen } = elevatorChain(m);
  const { w } = m;
  const gapX = w - 60;

  const live = dynamic?.leadingProgress != null;
  const leading = dynamic?.leadingProgress ?? 0;
  const trailing = dynamic?.trailingProgress ?? 0;
  const density = dynamic?.densityProfile;
  const bandCount = density?.length ?? 0;

  const spacing = BUCKET_SPACING;
  const phase = ((phaseOffset % spacing) + spacing) % spacing;

  const buckets = [];
  let carry = phase, covered = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = carry; d <= len; d += spacing) {
      const t = d / len;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const pathFrac = totalLen > 0 ? (covered + d) / totalLen : 0;
      let fillRatio;
      if (bandCount > 0) {
        const idx = Math.min(bandCount - 1, Math.max(0, Math.floor(pathFrac * bandCount)));
        fillRatio = density[idx];
      } else if (live) {
        fillRatio = pathFrac < trailing - PROGRESS_BAND_SLACK || pathFrac > leading + PROGRESS_BAND_SLACK ? 0 : 1;
      } else {
        fillRatio = y <= 19 && x > gapX ? 0 : 1; // static decorative fallback, unchanged from before issue #21
      }
      buckets.push({ x, y, fillRatio });
    }
    carry = spacing - ((len - carry) % spacing);
    if (carry === spacing) carry = 0;
    covered += len;
  }
  return buckets;
}

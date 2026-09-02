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
//
// Issue #69: a machine with no `geom` gets a single straight segment instead
// of the Z-shaped path below, so every other helper in this module (bucket
// positions, chain speed, generation identity) applies unchanged to a flat
// belt as well as a real bucket elevator. Issue #70 gave the pendulum
// conveyor (the only other machine drawn through this module, physically
// the same Simatek pendulum-conveyor concept as `treatingElevator`) its own
// `geom` block too, so both machines now take the Z-shaped path below; the
// geom-less fallback remains for a hypothetical future machine drawn
// straight.
export function elevatorChain(m) {
  const { w, h } = m;
  if (!m.geom) {
    const points = [[20, h / 2], [w - 20, h / 2]];
    const totalLen = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
    return { points, totalLen };
  }
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

// Where an outlet port sits along the drawn chain path, as a fraction of
// its total length — the port's own anchor (machine-local coords, the same
// point the discharge-gap indicator draws itself at) projected onto the
// nearest point of the chain polyline.
//
// Issue #70 follow-up: this exists because a *drawn* position must be
// derived from drawn geometry. The render previously used the snapshot's
// own `selectedSpanFraction` (behaviors.js) for this, which is a fraction
// of the machine's real transit *distance* — `portDistanceM / distanceM`.
// The two agreed only by coincidence, and only while this machine was drawn
// as its ceiling run alone: `portDistanceM` was itself apportioned from
// those same ceiling-run anchor x-values, so a distance ratio and a pixel
// ratio happened to be the same number. Drawing the real Z path (floor run
// + climb, ~37% of the drawn length, carrying no outlets at all) broke that
// identity, and grain bound for the nearest outlet stopped partway up the
// climb — nowhere near the outlet it was drawn to leave by. The drawn
// segments' proportions do not match the real machine's either (drawn
// 10/27/63% against a real 23/29/48%), so the two fraction spaces are not
// interchangeable in general and neither can substitute for the other.
export function outletPathFraction(m, port) {
  const anchor = m.anchors?.[port];
  if (!anchor) return undefined;
  const { points, totalLen } = elevatorChain(m);
  if (!(totalLen > 0)) return undefined;
  let covered = 0;
  let best = { dist: Infinity, frac: 1 };
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      // Clamped so an anchor drawn slightly past a segment's own end (the
      // discharge outlet at the very tail of the run) lands on that end
      // rather than off the path.
      const t = Math.max(0, Math.min(1, ((anchor.x - x0) * dx + (anchor.y - y0) * dy) / (len * len)));
      const dist = Math.hypot(anchor.x - (x0 + dx * t), anchor.y - (y0 + dy * t));
      if (dist < best.dist) best = { dist, frac: (covered + len * t) / totalLen };
    }
    covered += len;
  }
  return best.frac;
}

// The Z-shaped duct housing's own SVG path data: a hollow outline (the
// machine's `body`) and a dashed centerline tracing the same three segments
// `elevatorChain` above already returns as points, at housing thickness
// `geom.duct`. Shared by ElevatorSymbol and ConveyorSymbol (issue #70) so
// the two symbols draw one real bucket elevator's duct shape identically
// rather than each hand-rolling the same path string.
export function ductBodyPaths(m) {
  const { w, h, geom } = m;
  const { colX, duct } = geom;
  return {
    outline: `M0,${h} H${colX + duct} V${duct} H${w} V0 H${colX} V${h - duct} H0 Z`,
    centerline: `M20,${h - 18} H${colX + 18} V18 H${w - 20}`,
  };
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

// Which physical bucket (a stable integer identity, constant for that
// bucket's entire transit) currently sits at scene position `pos` when the
// chain has travelled `phaseOffset` in total. A bucket entering the boot
// (pos 0) at cumulative travel P0 sits at `pos = phaseOffset - P0` once the
// chain has travelled `phaseOffset`, and buckets enter at regular
// BUCKET_SPACING intervals of travel, so P0 is always a multiple of
// spacing — solving for that multiple gives an identity that only changes
// once per full BUCKET_SPACING of travel, exactly when this bucket instance
// hands off to the next one. Used to key a stable DOM slot per physical
// bucket (see ElevatorBuckets, symbols.jsx) rather than a positional array
// index, which reshuffles every time a bucket enters or leaves the visible
// chain and would otherwise make an unrelated bucket's fill flash into an
// existing DOM node mid-transit.
export function bucketGeneration(pos, phaseOffset, spacing = BUCKET_SPACING) {
  return Math.round((phaseOffset - pos) / spacing);
}

// Bucket positions + fill ratios along the chain, offset by `phaseOffset`
// (scene units the chain has travelled so far). The bucket train is
// periodic with period BUCKET_SPACING, so only phaseOffset's remainder mod
// spacing actually matters for *positioning* — passing 0 (no motion)
// reproduces the original, pre-#65 static layout exactly, which is what the
// decorative fallback and the binary leadingProgress/trailingProgress path
// (issue #21) still use. Each bucket also carries its own raw path position
// (`pos`) so a caller can derive a stable identity via bucketGeneration
// above, using this same (un-wrapped) `phaseOffset`.
//
// Bucket *positions* move with phase; the fill this returns is the local
// density where the bucket now sits (pathFrac), which is only the raw
// sample — carryBucketLoads below turns that into the load a bucket
// actually scooped at the boot and carries up. Each bucket carries its own
// pathFrac as well as its raw path position (`pos`, for bucketGeneration).
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
      buckets.push({ x, y, fillRatio, pos: covered + d, pathFrac });
    }
    carry = spacing - ((len - carry) % spacing);
    if (carry === spacing) carry = 0;
    covered += len;
  }
  return buckets;
}

// Fraction of the chain, measured from the boot, over which a bucket is
// still passing through the loading zone and filling up. One density band
// wide: with ~24 bands over ~24 bucket pitches, that is almost exactly the
// one bucket-spacing of travel a bucket spends under the inlet.
const LOADING_ZONE_BANDS = 1;

// A real bucket fills where grain is fed in — at the boot, the tail of the
// chain nearest the inlet drum feeder — and then carries that load unchanged
// all the way to the head. computeElevatorBuckets on its own can't show
// that: it samples the live density profile at wherever the bucket *now*
// sits, and a band only partly occupied by the material front reads as a
// half-empty bucket. So a loaded bucket climbing into the empty chain ahead
// of it emptied and refilled once per band it crossed, which is what read
// as the level animation happening at the head of the chain instead of at
// the tail (the earlier bucketGeneration/DOM-pool fix addressed a real
// second bug, but not this one).
//
// This carries a per-bucket load instead, keyed by the same stable
// bucketGeneration identity: while a bucket is inside the loading zone its
// level ramps up to the boot's live local density (the visible filling
// animation, at the tail where it belongs), and once clear of the zone it
// holds whatever it left with for the rest of the climb. A bucket first
// seen already up the chain — first frame after mount, or a resume with
// material mid-transit — seeds from where it sits, so an in-flight chain
// still renders its real material rather than needing a full transit to
// refill.
//
// `held` is the caller's own Map<generation, { load, cutoff }>, carried
// across frames (ElevatorBuckets keeps it in a ref) and pruned here to the
// buckets currently on the chain. Mutates each bucket's fillRatio in place
// and returns the same array. A no-op without a live density profile: both
// fallback paths (the binary leadingProgress sweep, the static decoration)
// keep their position-sampled fill exactly as before.
//
// `loadingCutoffFrac` (issue #69) is where the material being fed *right
// now* leaves the chain — the selected outlet's own fraction of the whole
// run, from the routed machine's own snapshot. It is stamped onto a bucket
// while that bucket is loading and never rewritten afterwards, exactly the
// way routedTransportDelay (behaviors.js) stamps each packet's own port and
// distance at accept time. That per-bucket stamp is the whole point: a
// single live "wherever the selector points now" cutoff, applied to every
// bucket at once, is what broke a mid-run destination switch — picking a
// nearer outlet erased grain still legitimately riding to the previous,
// farther one, and picking a farther outlet made already-loaded buckets pop
// back into view further down the belt. Carrying the cutoff with the load
// keeps each bucket honest about where *its own* grain is going, so a
// switch only ever changes what the buckets loading from now on do. Left
// undefined (plain transportDelay's own snapshot, which has a single
// discharge at the head) means no cutoff at all.
export function carryBucketLoads(buckets, phase, held, { bandCount, hasMaterial = true, spacing = BUCKET_SPACING, loadingCutoffFrac } = {}) {
  if (!(bandCount > 0)) return buckets;
  // Nothing left in transit at all (a cleared plant, or a chain that has
  // fully drained): drop every carried load rather than letting buckets
  // keep showing grain the sim no longer has anywhere.
  if (!hasMaterial) held.clear();
  const loadingFrac = LOADING_ZONE_BANDS / bandCount;
  const live = new Set();
  for (const b of buckets) {
    const gen = bucketGeneration(b.pos, phase, spacing);
    live.add(gen);
    if (b.pathFrac < loadingFrac) {
      // Still under the inlet: keep topping this bucket up to the boot's own
      // live density, and (re-)stamp where this grain is bound for, so a
      // switch made while it is loading applies to it.
      held.set(gen, { load: b.fillRatio * (b.pathFrac / loadingFrac), cutoff: loadingCutoffFrac });
    } else if (!held.has(gen)) {
      // First seen already up the chain (mount, or a resume with material
      // mid-transit): seed from where it sits. The live cutoff is the only
      // one available for it — a one-off on mount, not a per-switch path.
      held.set(gen, { load: b.fillRatio, cutoff: loadingCutoffFrac });
    }
    const entry = held.get(gen);
    // Past its own outlet, a bucket has already tipped its grain out: it
    // rides the rest of the run empty rather than carrying it to the head.
    b.fillRatio = entry.cutoff != null && b.pathFrac >= entry.cutoff ? 0 : entry.load;
  }
  for (const gen of held.keys()) if (!live.has(gen)) held.delete(gen);
  return buckets;
}

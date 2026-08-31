import { describe, it, expect } from "vitest";
import { elevatorChain, chainSceneSpeed, computeElevatorBuckets, carryBucketLoads, bucketGeneration, BUCKET_SPACING } from "./elevatorMotion";
import { line } from "../line/lineData";

// Small fixture mirroring the real treatingElevator's own geometry shape
// (w:420,h:264,colX:200 -> the 608-scene-unit chain the issue's own
// description cites) without depending on lineData's full machine record.
const FIXTURE = { w: 420, h: 264, geom: { colX: 200, duct: 36 }, sim: { distanceM: 8.731 } };

describe("elevatorChain", () => {
  it("sums the three drawn segments (bottom run, climb, top run)", () => {
    const { points, totalLen } = elevatorChain(FIXTURE);
    expect(points).toEqual([[20, 246], [218, 246], [218, 18], [400, 18]]);
    expect(totalLen).toBeCloseTo(608, 6);
  });
});

describe("chainSceneSpeed", () => {
  it("is zero with no live chain speed", () => {
    expect(chainSceneSpeed(FIXTURE, 0)).toBe(0);
    expect(chainSceneSpeed(FIXTURE, null)).toBe(0);
    expect(chainSceneSpeed(FIXTURE, undefined)).toBe(0);
  });

  it("is zero when the machine has no real transit distance to scale against", () => {
    expect(chainSceneSpeed({ ...FIXTURE, sim: {} }, 10)).toBe(0);
  });

  it("scales scene units/sec by the chain path length against the real distance", () => {
    // 608 scene units over 8.731 m, at 10.08 m/min: matches the issue's own
    // worked figures (~608 units, ~11.7 units/sec at nameplate speed).
    const speed = chainSceneSpeed(FIXTURE, 10.08);
    expect(speed).toBeCloseTo((10.08 / 60) * (608 / 8.731), 6);
    expect(speed).toBeCloseTo(11.72, 1);
  });

  it("matches the real treatingElevator machine's own authored figures", () => {
    const m = line.machines.find((mm) => mm.id === "treatingElevator");
    expect(chainSceneSpeed(m, m.sim.speedMPerMin)).toBeGreaterThan(0);
  });
});

describe("computeElevatorBuckets", () => {
  it("reproduces the original static layout at phaseOffset 0 with no live data", () => {
    const buckets = computeElevatorBuckets(FIXTURE, undefined, 0);
    // First bucket sits exactly at the chain's own start point.
    expect(buckets[0]).toEqual({ x: 20, y: 246, fillRatio: 1, pos: 0, pathFrac: 0 });
    // Every bucket is BUCKET_SPACING apart along a straight run.
    const onBottomRun = buckets.filter((b) => b.y === 246);
    for (let i = 1; i < onBottomRun.length; i++) {
      expect(onBottomRun[i].x - onBottomRun[i - 1].x).toBeCloseTo(BUCKET_SPACING, 6);
    }
  });

  it("reads a full binary sweep as loaded, everything else empty, on the leadingProgress/trailingProgress path", () => {
    const dynamic = { leadingProgress: 0.6, trailingProgress: 0.3 };
    const buckets = computeElevatorBuckets(FIXTURE, dynamic, 0);
    const totalLen = elevatorChain(FIXTURE).totalLen;
    // Nothing outside [0.3,0.6] of the path should be loaded, everything
    // inside should be — widened by the source's own PROGRESS_BAND_SLACK
    // (0.02) at each edge, same flicker guard it applies internally.
    const SLACK = 0.02;
    for (const b of buckets) {
      // Recompute pathFrac from x/y against the known segment geometry.
      let d;
      if (b.y === 246) d = b.x - 20;
      else if (b.x === 218) d = 198 + (246 - b.y);
      else d = 198 + 228 + (b.x - 218);
      const pathFrac = d / totalLen;
      const expectLoaded = pathFrac >= 0.3 - SLACK && pathFrac <= 0.6 + SLACK;
      expect(b.fillRatio).toBe(expectLoaded ? 1 : 0);
    }
  });

  it("samples the density band at the bucket's own path position, not a fixed slot", () => {
    const bandCount = 4;
    const density = [1, 0, 0, 0]; // only the very start of the chain is loaded
    const buckets = computeElevatorBuckets(FIXTURE, { densityProfile: density }, 0);
    const totalLen = elevatorChain(FIXTURE).totalLen;
    const firstQuarter = totalLen / bandCount;
    for (const b of buckets) {
      const d = b.y === 246 ? b.x - 20 : b.x === 218 ? 198 + (246 - b.y) : 198 + 228 + (b.x - 218);
      expect(b.fillRatio).toBe(d < firstQuarter ? 1 : 0);
    }
  });

  it("wraps cleanly at a full BUCKET_SPACING: identical to phaseOffset 0", () => {
    const dynamic = { densityProfile: [0.5, 0.5, 0.5, 0.5] };
    const atZero = computeElevatorBuckets(FIXTURE, dynamic, 0);
    const atSpacing = computeElevatorBuckets(FIXTURE, dynamic, BUCKET_SPACING);
    expect(atSpacing).toEqual(atZero);
    const atMultiple = computeElevatorBuckets(FIXTURE, dynamic, BUCKET_SPACING * 7);
    expect(atMultiple).toEqual(atZero);
  });

  it("shifts every bucket forward along the chain as phase advances, and a negative phase behaves like its positive wrap", () => {
    const dynamic = { densityProfile: [1, 1, 1, 1] };
    const shifted = computeElevatorBuckets(FIXTURE, dynamic, 5);
    // The first bucket on the bottom run moves from d=0 to d=5.
    expect(shifted[0].x).toBeCloseTo(25, 6);
    expect(shifted[0].y).toBe(246);

    const negative = computeElevatorBuckets(FIXTURE, dynamic, -5);
    const wrappedEquivalent = computeElevatorBuckets(FIXTURE, dynamic, BUCKET_SPACING - 5);
    expect(negative).toEqual(wrappedEquivalent);
  });
});

describe("bucketGeneration", () => {
  it("stays exactly constant for one physical bucket as phase advances continuously", () => {
    // A bucket that entered the boot at cumulative travel P0 sits at
    // pos = phase - P0 at any later phase — its generation must come back
    // out exactly constant, not just close, since this is what a DOM pool
    // slot keys off across every animation frame.
    const spacing = BUCKET_SPACING;
    const P0 = spacing * 4;
    for (const phase of [P0, P0 + 3, P0 + spacing - 0.01, P0 + 12.345]) {
      const pos = phase - P0;
      expect(bucketGeneration(pos, phase)).toBe(4);
    }
  });

  it("never collides two simultaneously-visible buckets into the same pool slot", () => {
    // Reproduces issue #65's follow-up bug: keying a fixed-size DOM pool by
    // a bucket's own array index (instead of this stable identity) handed
    // an unrelated bucket's fill to whatever node used to sit at that index
    // the moment a new bucket entered the boot or an old one discharged,
    // which read as the front-most bucket repeatedly "filling and
    // refilling" instead of a train advancing smoothly.
    const { totalLen } = elevatorChain(FIXTURE);
    const poolSize = Math.floor(totalLen / BUCKET_SPACING) + 3;
    const dynamic = { densityProfile: new Array(24).fill(0.5) };
    for (let phase = 0; phase < BUCKET_SPACING * 3; phase += 0.37) {
      const buckets = computeElevatorBuckets(FIXTURE, dynamic, phase);
      const slots = new Set();
      for (const b of buckets) {
        const slot = ((bucketGeneration(b.pos, phase) % poolSize) + poolSize) % poolSize;
        expect(slots.has(slot)).toBe(false);
        slots.add(slot);
      }
    }
  });
});

describe("carryBucketLoads", () => {
  const BANDS = 24;
  const loadingFrac = 1 / BANDS;
  const withDensity = (value) => ({ densityProfile: new Array(BANDS).fill(value) });

  it("fills a bucket progressively across the boot, at the tail of the chain", () => {
    const held = new Map();
    const buckets = carryBucketLoads(
      computeElevatorBuckets(FIXTURE, withDensity(0.8), 0), 0, held, { bandCount: BANDS },
    );
    const inBoot = buckets.filter((b) => b.pathFrac < loadingFrac);
    // The chain's own geometry puts exactly one bucket inside the boot at a
    // time, and it enters empty.
    expect(inBoot.length).toBe(1);
    expect(buckets[0].fillRatio).toBe(0);
    // Walking that one bucket through the boot ramps it up to the boot's own
    // live density, and it is full by the time it is clear of the zone.
    let last = 0;
    for (let phase = 1; phase < BUCKET_SPACING; phase += 1) {
      const b = carryBucketLoads(
        computeElevatorBuckets(FIXTURE, withDensity(0.8), phase), phase, new Map(), { bandCount: BANDS },
      )[0];
      expect(b.fillRatio).toBeGreaterThan(last);
      last = b.fillRatio;
    }
    expect(last).toBeGreaterThan(0.7);
    expect(last).toBeLessThanOrEqual(0.8);
  });

  it("carries a bucket's load unchanged once clear of the boot, instead of resampling the band under it", () => {
    const held = new Map();
    carryBucketLoads(computeElevatorBuckets(FIXTURE, withDensity(1), 0), 0, held, { bandCount: BANDS });
    // Same phase, but every band under the chain now reads empty: a bucket
    // already up the chain keeps what it left the boot with; only the one
    // still in the boot follows the live density.
    const after = carryBucketLoads(
      computeElevatorBuckets(FIXTURE, withDensity(0), 0), 0, held, { bandCount: BANDS },
    );
    for (const b of after) {
      expect(b.fillRatio).toBe(b.pathFrac < loadingFrac ? 0 : 1);
    }
  });

  it("never lets a loaded bucket empty and refill as it climbs behind the material front", () => {
    // The reported bug (issue #65 follow-up, second cause): a bucket's fill
    // was sampled from the fixed band it currently sits in, and the band the
    // material front is still crossing is only partly occupied — so the
    // front-most loaded bucket dropped to near-empty and filled again once
    // per band, all the way up the chain, which read as the filling
    // animation happening at the head instead of at the boot.
    const { totalLen } = elevatorChain(FIXTURE);
    const held = new Map();
    const lastSeen = new Map();
    // Material front advancing at exactly the chain's own speed, as the
    // engine's packet queue really does (behaviors.js's transportDelay).
    for (let phase = 0; phase <= totalLen; phase += 0.6) {
      const frontFrac = phase / totalLen;
      const densityProfile = Array.from({ length: BANDS }, (_, i) => {
        const lo = i / BANDS, hi = (i + 1) / BANDS;
        if (hi <= frontFrac) return 1;
        if (lo >= frontFrac) return 0;
        return (frontFrac - lo) * BANDS; // the one band the front is crossing
      });
      const buckets = carryBucketLoads(
        computeElevatorBuckets(FIXTURE, { densityProfile }, phase), phase, held, { bandCount: BANDS },
      );
      for (const b of buckets) {
        if (b.pathFrac < loadingFrac) continue; // still loading at the boot
        const gen = bucketGeneration(b.pos, phase);
        if (lastSeen.has(gen)) expect(b.fillRatio).toBeCloseTo(lastSeen.get(gen), 10);
        lastSeen.set(gen, b.fillRatio);
      }
    }
    // ...and the chain really did load up rather than staying empty.
    expect([...lastSeen.values()].filter((v) => v > 0.9).length).toBeGreaterThan(10);
  });

  it("drops every carried load when the sim has no material in transit at all", () => {
    const held = new Map();
    carryBucketLoads(computeElevatorBuckets(FIXTURE, withDensity(1), 0), 0, held, { bandCount: BANDS });
    expect([...held.values()].some((v) => v > 0)).toBe(true);
    const cleared = carryBucketLoads(
      computeElevatorBuckets(FIXTURE, withDensity(0), 0), 0, held, { bandCount: BANDS, hasMaterial: false },
    );
    for (const b of cleared) expect(b.fillRatio).toBe(0);
  });

  it("seeds a bucket first seen already up the chain from where it sits", () => {
    // Mount, or a resume with material already mid-transit: the chain must
    // render what the sim actually has in it rather than waiting a full
    // transit for buckets to refill from the boot.
    const held = new Map();
    const buckets = carryBucketLoads(
      computeElevatorBuckets(FIXTURE, withDensity(0.5), 0), 0, held, { bandCount: BANDS },
    );
    for (const b of buckets.filter((x) => x.pathFrac >= loadingFrac)) expect(b.fillRatio).toBe(0.5);
  });

  it("forgets a bucket once it has left the chain, rather than growing the map forever", () => {
    const held = new Map();
    const { totalLen } = elevatorChain(FIXTURE);
    for (let phase = 0; phase <= totalLen * 3; phase += 1.7) {
      carryBucketLoads(computeElevatorBuckets(FIXTURE, withDensity(1), phase), phase, held, { bandCount: BANDS });
    }
    expect(held.size).toBeLessThanOrEqual(Math.ceil(totalLen / BUCKET_SPACING) + 1);
  });

  it("leaves both fallback paths (no density profile) exactly as they were", () => {
    const held = new Map();
    const dynamic = { leadingProgress: 0.6, trailingProgress: 0.3 };
    const raw = computeElevatorBuckets(FIXTURE, dynamic, 0);
    const carried = carryBucketLoads(computeElevatorBuckets(FIXTURE, dynamic, 0), 0, held, { bandCount: 0 });
    expect(carried).toEqual(raw);
    expect(held.size).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { elevatorChain, chainSceneSpeed, computeElevatorBuckets, BUCKET_SPACING } from "./elevatorMotion";
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
    expect(buckets[0]).toEqual({ x: 20, y: 246, fillRatio: 1 });
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

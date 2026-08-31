import { describe, it, expect } from "vitest";
import { createSim, stepSim, DT, setSourceRate, setSource, setDestination, getMachineState } from "../sim/engine";
import { BEHAVIORS } from "../sim/behaviors";
import { line } from "../line/lineData";
import { computeElevatorBuckets, carryBucketLoads, chainSceneSpeed, elevatorChain } from "./elevatorMotion";
import { tPerHourToM3PerSec } from "../sim/units";

// Issue #69: the pendulum conveyor's grain has to stop at the outlet it is
// actually bound for. This regressed twice — once shipping with the render
// carrying every bucket to the head regardless of destination, once
// "fixing" that with a chain-wide cutoff keyed on the live selection, which
// erased in-transit grain the moment a nearer outlet was picked. Neither
// was caught by the engine's own unit tests, because both were in the seam
// between the published snapshot and the render's own bucket carrying.
//
// So this drives the whole seam: real engine -> real *published snapshot*
// (BEHAVIORS[kind].snapshot — note getMachineState returns the RAW state,
// which has no densityProfile at all, and reading that instead is exactly
// how an earlier version of this trace silently asserted nothing) -> real
// render helpers. Same pipeline ElevatorBuckets (symbols.jsx) drives every
// frame. Each test guards that grain was genuinely carried, so a trace that
// quietly stops producing buckets fails instead of passing vacuously.
const M = line.machines.find((m) => m.id === "pendulumConveyor");
const { totalLen } = elevatorChain(M);
// One bucket pitch plus one density band, as a fraction of the drawn run:
// the granularity at which a discharge can visually land.
const SLACK = 26 / totalLen + 1 / 24;
const OUT_BUFFER_FRAC = M.sim.portDistanceM.outBuffer / M.sim.distanceM;  // ~0.138
const OUT_BINSEG_FRAC = M.sim.portDistanceM.outBinSeg / M.sim.distanceM;  // ~0.642

function runTrace({ legs, onFrame }) {
  const sim = createSim(line);
  setSource(sim, "proBox");
  setSourceRate(sim, "proBoxStation", tPerHourToM3PerSec(20));
  const held = new Map();
  let phase = 0;
  let frames = 0;
  for (const leg of legs) {
    if (leg.destination) setDestination(sim, leg.destination);
    for (let i = 0; i < Math.round(leg.seconds / DT); i++) {
      stepSim(sim, DT);
      const dyn = BEHAVIORS.routedTransportDelay.snapshot(getMachineState(sim, "pendulumConveyor"));
      phase += chainSceneSpeed(M, dyn.chainSpeedMPerMin) * DT;
      const buckets = carryBucketLoads(
        computeElevatorBuckets(M, dyn, phase), phase, held,
        {
          bandCount: dyn.densityProfile.length,
          hasMaterial: dyn.inTransitVol > 0 || dyn.backlogVol > 0,
          loadingCutoffFrac: dyn.selectedSpanFraction,
        },
      );
      frames++;
      onFrame({ t: sim.t, dyn, buckets });
    }
  }
  return frames;
}

function farthestLoaded(legs) {
  let worst = 0;
  let everLoaded = false;
  const frames = runTrace({
    legs,
    onFrame: ({ buckets }) => {
      for (const b of buckets) {
        if (b.fillRatio > 0.03) {
          everLoaded = true;
          if (b.pathFrac > worst) worst = b.pathFrac;
        }
      }
    },
  });
  return { worst, everLoaded, frames };
}

describe("pendulum conveyor render trace", () => {
  it("stops grain at the nearest outlet when only that outlet is ever selected", () => {
    const { worst, everLoaded, frames } = farthestLoaded([{ destination: "metalBin1", seconds: 400 }]);
    expect(frames).toBeGreaterThan(1000);
    expect(everLoaded).toBe(true); // the trace has to actually carry grain, or it proves nothing
    expect(worst).toBeLessThan(OUT_BUFFER_FRAC + SLACK);
  }, 30000); // ~4x the measured solo run: 8000 ticks of the whole line, x68 buckets a frame

  it("stops grain at the middle outlet, further along than the nearest but not the full run", () => {
    const { worst, everLoaded } = farthestLoaded([{ destination: "flexicon", seconds: 400 }]);
    expect(everLoaded).toBe(true);
    expect(worst).toBeGreaterThan(OUT_BUFFER_FRAC);
    expect(worst).toBeLessThan(OUT_BINSEG_FRAC + SLACK);
  }, 30000);

  // 400s, not less: on the real line the farthest outlet's own grain does
  // not reach the head until ~330s once the upstream feed ramp is included
  // (live-traced), well past the 185s the transit alone would suggest.
  it("runs the full length for the farthest outlet", () => {
    const { worst, everLoaded } = farthestLoaded([{ destination: "concetti", seconds: 400 }]);
    expect(everLoaded).toBe(true);
    expect(worst).toBeGreaterThan(0.9);
  }, 30000);

  // The user's own recorded sequence.
  it("neither erases nor pops grain across Concetti -> Flexicon -> Metal Bin 1 -> Flexicon", () => {
    let last = null;
    let worst = { delta: 0, t: 0 };
    let sawGrain = false;
    runTrace({
      legs: [
        { destination: "concetti", seconds: 120 },
        { destination: "flexicon", seconds: 60 },
        { destination: "metalBin1", seconds: 60 },
        { destination: "flexicon", seconds: 60 },
      ],
      onFrame: ({ t, buckets }) => {
        const filled = buckets.filter((b) => b.fillRatio > 0.03).length;
        if (filled > 0) sawGrain = true;
        if (last != null && Math.abs(filled - last) > worst.delta) worst = { delta: Math.abs(filled - last), t };
        last = filled;
      },
    });
    expect(sawGrain).toBe(true);
    // One tick of chain travel can only mature or discharge a bucket or two.
    expect(worst.delta, `worst single-tick jump ${worst.delta} at t=${worst.t.toFixed(1)}s`).toBeLessThan(4);
  }, 30000);
});

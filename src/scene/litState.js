// Pure "is this machine actually doing something" derivations for the Lit
// idiom (issue #64/#66), kept separate from symbols.jsx so the mapping from
// a kind snapshot to what gets drawn is unit-testable without rendering —
// same reasoning as elevatorMotion.js's pure bucket geometry.

// How the treater's drawn charge is split across one batch. A DISPLAY
// convention, not a plant figure: the real fill / treat / discharge
// breakdown of the ~48s cycle is a supplier question and is still open
// (docs/OPEN_QUESTIONS.md) — the PLC treats 52.508.T00 as a plain start/stop
// object, so batching is internal to the Niklas machine. Nothing may be read
// off these as a timing.
//
// A drawn charge is needed at all because the engine's own charge and
// discharge are each a single 0.05s tick (see applyBatchCycle), while
// useSimEngine publishes every 100ms — so the real transitions are never
// observable, and a drum drawn strictly from `fill` would sit pinned full
// for the whole run. What IS real is where in the cycle the machine is, and
// that is what these fractions are laid over.
export const TREATER_CHARGE_FRACTION = 0.14;
export const TREATER_TREAT_FRACTION = 0.82;

// The batch the treater symbol draws right now: how full the drum is, how far
// through treatment that charge is (which shifts the seed toward the treated
// colour), and whether it is currently running out of the chute.
//
// Phased off the engine's OWN batch clock (`elapsedSec`, published by
// snapshotBatchCycle) rather than a free-running clock of its own, which is
// what keeps it in step with the bins either side. `elapsedSec` resets to 0
// on the same tick the pre-bin hands over a charge and reaches `cycleSec` on
// the tick the after-bin receives one, so the drawn charge is laid out to
// finish emptying exactly as the after-bin steps up, and to start filling
// exactly as the pre-bin steps down. The earlier version phased off the
// sim-time of the first batch ever observed, which had no relationship to
// either neighbour and visibly drifted against them.
//
// An empty drum is the machine's own off state and is NOT faked: `stopped`
// (a utilities trip) and `waiting` (held off by the after-bin interlock)
// both draw empty, and so does a machine holding nothing — `heldFill` is the
// real published `fill`, which is how a treater that has never been charged
// (at boot, or straight after a RESTART while the chain primes from empty)
// is told apart from one mid-cycle. Phase alone cannot tell those apart,
// which is the lesson issue #66 left behind.
export function treaterBatch(phase, elapsedSec, cycleSec, heldFill) {
  const empty = { fill: 0, treat: 0, discharging: false };
  if (phase !== "holding" && phase !== "charging" && phase !== "discharging") return empty;
  if (!(heldFill > 0)) return empty;
  // No known period to phase against: hold a full drum rather than divide by
  // zero. A presenter can dial cycle time down, never to a negative.
  if (!(cycleSec > 0)) return { fill: 1, treat: 1, discharging: false };

  const u = Math.max(0, Math.min(1, (elapsedSec ?? 0) / cycleSec));
  if (u < TREATER_CHARGE_FRACTION) {
    return { fill: u / TREATER_CHARGE_FRACTION, treat: 0, discharging: false };
  }
  if (u < TREATER_TREAT_FRACTION) {
    const t = (u - TREATER_CHARGE_FRACTION) / (TREATER_TREAT_FRACTION - TREATER_CHARGE_FRACTION);
    return { fill: 1, treat: t, discharging: false };
  }
  const d = (u - TREATER_TREAT_FRACTION) / (1 - TREATER_TREAT_FRACTION);
  return { fill: 1 - d, treat: 1, discharging: true };
}

// Threshold below which a published flowRateM3PerSec (issue #28, engine.js's
// generic per-tick outflow, unit m3/s) reads as "not actually flowing"
// rather than floating-point residue. Same idea as useFlowAnimation.js's own
// FLOWING_EPS, but not the same value: that one gates a dimensionless
// live/nominal ratio, not a raw m3/s rate, so the two aren't meant to track
// each other.
const FLOW_EPS = 1e-6;

// Vibrating conveyor (a meteredFeeder): lit only while material is actually
// moving, per the live flow rather than the commanded `rate` — a conveyor
// dialed up but starved by an empty pre-bin above it delivers nothing and
// should read dark, matching what the scalping screen's own `flowing`
// already means (issue #26).
export function vibratoryFlowing(dynamic) {
  return (dynamic?.flowRateM3PerSec ?? 0) > FLOW_EPS;
}

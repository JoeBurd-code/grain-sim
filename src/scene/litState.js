// Pure "is this machine actually doing something" derivations for the Lit
// idiom (issue #64/#66), kept separate from symbols.jsx so the mapping from
// a kind snapshot to what gets drawn is unit-testable without rendering —
// same reasoning as elevatorMotion.js's pure bucket geometry.

// snapshotBatchCycle's `phase` (src/sim/behaviors.js) collapses to what the
// batch treater symbol draws: the vessel lit while any real batch is in
// progress (charging/holding/discharging), the agitator turning only during
// the mixing dwell ("holding" — the hold-for-a-cycle step, not the fill or
// the discharge pulse). `stopped` (utilities trip, issue #51) and `waiting`
// (starved by the pre-bin, derived in snapshotBatchCycle itself) both read
// as not-cycling, same as an undefined phase before the sim has primed.
export function treaterVisualState(phase) {
  const cycling = phase === "charging" || phase === "holding" || phase === "discharging";
  const mixing = phase === "holding";
  return { cycling, mixing };
}

// Agitator rotation rate while mixing, in degrees per sim-second. A
// legibility pick for readable motion at the scene's scale, not a plant
// figure: no document gives the real Niklas WNS/200 agitator speed
// (docs/OPEN_QUESTIONS.md has no entry for it), so this deliberately gets
// no provenance marker and must never be presented as one.
export const TREATER_PADDLE_DEG_PER_SEC = 90;

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

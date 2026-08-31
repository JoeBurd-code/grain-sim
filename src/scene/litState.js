// Pure "is this machine actually doing something" derivations for the Lit
// idiom (issue #64/#66), kept separate from symbols.jsx so the mapping from
// a kind snapshot to what gets drawn is unit-testable without rendering —
// same reasoning as elevatorMotion.js's pure bucket geometry.

// Cosmetic dark stretch faked at the start of every assumed batch period
// (issue #66 follow-up — not a plant figure). Why faked rather than
// detected: useSimEngine.js only publishes a snapshot every
// PUBLISH_INTERVAL_MS (100ms) of real time, but batchCycle's charge draw is
// atomic (see applyBatchCycle's own comment) — once the pre-bin holds ample
// stock, "charging" completes and flips back to "holding" within a single
// 0.05s sim tick. That tick essentially never lands on the instant a
// snapshot is taken, so `dynamic.phase` in the running app never actually
// reads anything but "holding" once the first batch completes — there is
// no real transition left to debounce. Confirmed live and explicitly
// signed off by the user: "i dont mind if we just fake this on the visual
// side and keep the sim how it is" (2026-08-31) — so this synthesizes a
// periodic pulse from the sim's own clock instead of trying to observe a
// transition that can't be observed this way.
export const TREATER_FAKE_DARK_SEC = 3;

// Latches the sim-time of the treater's first-ever completed batch, so
// every later batch's fake dark window can be phased off it. "holding"
// observed for the first time is a genuinely long, reliably-published
// stretch (the whole downstream chain has to prime from empty — ~100+
// sim-seconds on the real line data, see this ticket's original headless
// trace), unlike every subsequent charging->holding edge (see
// TREATER_FAKE_DARK_SEC's own comment). "charging" clears the anchor back
// to null: at true boot or right after a RESET/RESTART (also a genuinely
// long, reliably-published stretch, since the chain has to re-prime) this
// correctly holds the display dark until the next real batch completes; on
// the rare occasion a mid-run instant is caught by pure timing luck, this
// self-corrects harmlessly (the fake cadence just re-phases off whichever
// "holding" is next observed).
export function nextTreaterAnchor(phase, firstMixingAt, now) {
  if (phase === "charging") return null;
  if (phase === "holding" && firstMixingAt == null) return now;
  return firstMixingAt;
}

// Whether the treater reads lit right now. Genuinely `stopped` (utilities
// trip) or `waiting` (starved by the pre-bin) always reads dark, same as a
// treater that hasn't completed even one real batch yet (`firstMixingAt`
// still null). Once a real batch has completed at least once, every
// subsequent boundary is the faked periodic pulse described above: dark
// for TREATER_FAKE_DARK_SEC at the start of every `cycleSec`-length window
// since the first observed batch, lit for the rest of it. `now` is the
// sim's own published clock (`snap.t`, useSimEngine.js), not wall time —
// this freezes on pause for free (the sim just stops stepping) and scales
// with the speed multiplier for free (the clock is sim-seconds, not
// wall-seconds), without needing useMachineMotion's rAF clock, which would
// also incorrectly freeze this under prefers-reduced-motion (right for
// actual motion, wrong for a plain state indicator).
export function treaterLit(phase, cycleSec, firstMixingAt, now) {
  if (phase !== "holding" && phase !== "charging") return false;
  if (firstMixingAt == null) return false;
  if (!(cycleSec > 0)) return true; // no known period to phase against; stay lit rather than divide by zero
  const sincePeriodStart = (((now - firstMixingAt) % cycleSec) + cycleSec) % cycleSec;
  return sincePeriodStart >= TREATER_FAKE_DARK_SEC;
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

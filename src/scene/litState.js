// Pure "is this machine actually doing something" derivations for the Lit
// idiom (issue #64/#66), kept separate from symbols.jsx so the mapping from
// a kind snapshot to what gets drawn is unit-testable without rendering —
// same reasoning as elevatorMotion.js's pure bucket geometry.

// snapshotBatchCycle's `phase` (src/sim/behaviors.js): the treater's Lit
// signal is specifically "actively mixing" (`holding`, the hold-for-a-
// cycle dwell), not "cycling at all" — charging/discharging are both
// comparatively instantaneous once a well-stocked pre-bin is feeding it
// (batchCycle's own atomic charge draw, see applyBatchCycle's comment), so
// treating either of those as lit too made the on/off boundary barely
// register as a real event. `stopped`/`waiting`/an undefined phase before
// the sim has primed all fall out of this the same way: none of them is
// "holding".
export function treaterMixing(phase) {
  return phase === "holding";
}

// Cosmetic minimum dark stretch between mixing dwells (issue #66 follow-up
// — not a plant figure): the real machine has a grain-fall downtime between
// the pre-bin's discharge and the vessel actually starting to mix that this
// sim deliberately doesn't model. Without a floor, a well-stocked pre-bin's
// near-instant charge draw turns that gap into a single sim-tick flicker
// rather than a visible pause a viewer can actually see land and end.
export const TREATER_MIN_DARK_SEC = 3;

export const INITIAL_TREATER_LIT_STATE = { lit: false, offSince: -Infinity, lastNow: -Infinity };

// Debounces the raw `treaterMixing` signal against sim time so a real batch
// boundary reads as a visible dark period. `now` is the sim's own published
// clock (`snap.t`, useSimEngine.js), not wall time — deliberately not
// useMachineMotion's rAF clock, which would also freeze this under
// prefers-reduced-motion; that's right for actual motion (spin, travel) but
// wrong for a plain lit/unlit state indicator that carries real
// information. Reading `now` off the sim clock instead means this freezes
// on pause for free (the sim just stops stepping) and scales with the speed
// multiplier for free (the clock is sim-seconds, not wall-seconds).
//
// Self-resets if `now` ever goes backward (RESET / a fresh createSim):
// without this, a stale `offSince` left over from the previous run's clock
// could hold the display artificially dark for a long stretch of the new
// run's own timeline.
//
// MUST return `state` itself, unchanged, whenever nothing about the visible
// result actually changes — never a fresh `{ ...state }` copy. The caller
// (TreaterSymbol, symbols.jsx) calls this during render and only commits via
// setState when the result is a *different reference*, React's own blessed
// "adjust state during rendering" pattern; a version of this that always
// returned a new object even on a no-op tick made that check always true,
// which is exactly what shipped a black-screen "Minified React error #301
// (too many re-renders)" regression to production — every render called
// setState, which triggered another render, forever. `lastNow` only needs
// to track the highest `now` seen at the last *real* transition (time is
// monotonic outside of a reset, so that's sufficient for the check above),
// not every call.
export function nextTreaterLitState(state, mixingNow, now) {
  if (now < state.lastNow) state = INITIAL_TREATER_LIT_STATE;
  if (!mixingNow) {
    return state.lit ? { lit: false, offSince: now, lastNow: now } : state;
  }
  if (state.lit) return state;
  if (now - state.offSince >= TREATER_MIN_DARK_SEC) {
    return { lit: true, offSince: state.offSince, lastNow: now };
  }
  return state;
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

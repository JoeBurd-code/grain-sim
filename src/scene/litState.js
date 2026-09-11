// Pure "is this machine actually doing something" derivations for the Lit
// idiom (issue #64/#66), kept separate from symbols.jsx so the mapping from
// a kind snapshot to what gets drawn is unit-testable without rendering —
// same reasoning as elevatorMotion.js's pure bucket geometry.

// The treater's drawn batch is a FAKED cadence, not an observed one, and the
// split below is a display convention rather than a plant figure.
//
// Why faked. useSimEngine.js publishes a snapshot only every
// PUBLISH_INTERVAL_MS (100ms) of real time, but batchCycle's charge draw is
// atomic (see applyBatchCycle's own comment) — once the pre-bin holds ample
// stock, "charging" completes and flips back to "holding" within a single
// 0.05s sim tick, and the discharge empties in one tick too. Those ticks
// essentially never land on the instant a snapshot is taken, so the
// published `phase` in the running app never reads anything but "holding"
// once the first batch completes, and the published `fill` sits pinned at 1.
// There is no transition left to observe, so this synthesizes one. Confirmed
// live and explicitly signed off by the user: "i dont mind if we just fake
// this on the visual side and keep the sim how it is" (2026-08-31).
//
// Why these numbers. The real fill / treat / discharge breakdown of the ~48s
// cycle is a supplier question and is still open (docs/OPEN_QUESTIONS.md) —
// the PLC treats 52.508.T00 as a plain start/stop object, so batching is
// internal to the Niklas machine. Nothing may be read off this split as a
// timing. It exists so the bottleneck machine on the line visibly pulses a
// batch in and out at its own cycle rate, which is the thing it is known for.
export const TREATER_CHARGE_FRACTION = 0.14;
export const TREATER_TREAT_FRACTION = 0.82;

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

// The batch the treater symbol draws right now: how full the drum is, how
// far through treatment that charge is (which shifts the seed toward the
// treated colour), and whether it is currently running out of the chute.
//
// An empty drum is the machine's own off state, and that part is NOT faked —
// it is read straight off the real published phase. Genuinely `stopped` (a
// utilities trip) or `waiting` (held off by the after-bin interlock) draws
// empty, and so does a treater that has not completed even one real batch
// yet (`firstMixingAt` still null), which is the true state at boot and
// straight after a RESTART while the chain primes from empty. Only the
// cadence WITHIN a running machine is synthesized, per the comment above.
//
// `now` is the sim's own published clock (`snap.t`, useSimEngine.js), not
// wall time: this freezes on pause for free (the sim just stops stepping)
// and scales with the speed multiplier for free (the clock is sim-seconds).
// Deliberately not useMachineMotion's rAF clock, which would also freeze
// this under prefers-reduced-motion — right for the drum's rotation, wrong
// for a level that is plain state rather than motion.
export function treaterBatch(phase, cycleSec, firstMixingAt, now) {
  const empty = { fill: 0, treat: 0, discharging: false };
  if (phase !== "holding" && phase !== "charging" && phase !== "discharging") return empty;
  if (firstMixingAt == null) return empty;
  // No known period to phase against: hold a full drum rather than divide by
  // zero, matching what the old boolean did (it stayed lit).
  if (!(cycleSec > 0)) return { fill: 1, treat: 1, discharging: false };

  const u = ((((now - firstMixingAt) % cycleSec) + cycleSec) % cycleSec) / cycleSec;
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

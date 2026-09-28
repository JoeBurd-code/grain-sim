// Pure "what should the drum feeder symbol show" derivations (issue #67),
// kept separate from symbols.jsx so they're unit-testable without rendering
// — same reasoning as elevatorMotion.js's pure bucket geometry and
// litState.js's pure lit derivations.
import { tPerHourToM3PerSec, SIMATEK_FEED_RATE_K } from "../sim/units";

// Theoretical ceiling (100% speed x 100% gate) the Simatek formula
// (units.js) can ever command — the reference a drum's rotation rate is
// normalized against, since neither feeder publishes its own design
// ceiling separately from that formula's own inputs.
export const DRUM_FEEDER_MAX_M3_PER_SEC = tPerHourToM3PerSec(SIMATEK_FEED_RATE_K);

// Degrees per sim-second the drum spins at that theoretical ceiling — picked
// for legibility (about 2/3 revolution per second at full tilt), not a real
// RPM figure.
export const DRUM_MAX_DEG_PER_SEC = 240;

// Spin = is it running. Scales with the feeder's own live commanded `rate`,
// but only while it can actually deliver: `rate` is derived purely from the
// gate/speed dial formula (control.js's stepFeedRateDerivation) and stays
// commanded even for a feeder currently held off by `enabled`/`runPermit`
// — e.g. whichever of the two inlet feeders isn't the presenter's current
// source selection (lineData.js's feedRateDerivations comment) — so both
// gates are checked here rather than reading `rate` alone.
export function drumSpinDegPerSec(dynamic) {
  const running = (dynamic?.enabled ?? true) && (dynamic?.runPermit ?? true);
  if (!running) return 0;
  const rate = dynamic?.rate ?? 0;
  const normalized = Math.max(0, Math.min(1, rate / DRUM_FEEDER_MAX_M3_PER_SEC));
  return normalized * DRUM_MAX_DEG_PER_SEC;
}

// Gate aperture = how much the gate is actually open: the sim's own
// effective gate fraction (sim/dial.js), published on the snapshot as
// `gateDial`. The popup slider reads the same field, so the drawing and the
// slider's readout can never disagree (issue #67), and both match what the
// sim runs on. A machine the sim hasn't published yet reads as fully open.
export function drumGateFraction(dynamic) {
  return dynamic?.gateDial?.effective ?? 1;
}

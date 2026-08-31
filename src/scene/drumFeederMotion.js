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

// Percentage points either side of the cap that still counts as "on it" —
// must stay numerically in sync with MachinePopup.jsx's own OVERRIDE_SNAP
// (2), expressed here as a 0..1 gateFraction delta instead of a 0..100
// param-slider delta. Not imported from there: scene/ has no dependency on
// app/ anywhere else in this codebase (app depends on scene, not the
// reverse — see PlantApp.jsx's own imports), and this one shared constant
// isn't worth inverting that for.
const GATE_OVERRIDE_SNAP = 0.02;

// Gate aperture = how much. Deliberately mirrors MachinePopup.jsx's own
// Slider `armed` test verbatim (direction-symmetric, snap-toleranced —
// "Override slider balanced point", issue #63 follow-up 2026-08-24) rather
// than control.js's isThrottleOverridden (asymmetric, exact inequality,
// gated on the throttle target being a genuine partial stop). Those two
// predicates are deliberately different already — the Slider's is a display
// convention, isThrottleOverridden is what the sim actually runs on — and
// issue #67's own caution ("the visual must never disagree with the
// slider's own actual readout") means this has to match the display
// convention, not the physics one. Defaults (dial/throttle to 1, touched to
// false) match initMeteredFeeder's own gated-feeder defaults, so a machine
// the sim hasn't published a snapshot for yet reads as fully open.
export function drumGateFraction(dynamic) {
  const dial = dynamic?.gateFraction ?? 1;
  const cap = dynamic?.gateThrottleFraction ?? 1;
  const touched = dynamic?.gateDialTouched ?? false;
  const armed = touched && Math.abs(dial - cap) > GATE_OVERRIDE_SNAP;
  return armed ? dial : cap;
}

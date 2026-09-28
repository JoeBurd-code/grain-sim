// The presenter's dial on a throttled actuator, and the one answer to "is it
// overriding the interlock?" (issue #63). Two actuators carry one: a chain's
// VFD speed (transportDelay, routedTransportDelay) and a gated drum feeder's
// gate position (meteredFeeder). Each pairs the presenter's own dial with an
// interlock-commanded throttle layered on top of it, stored as four flat
// fields on the machine's state. The field names differ per actuator, so a
// descriptor below names them, and every function here takes one.
//
// Before this module the override rule was written out in six places with
// three different formulas: the sim's intake, its chain speed and its feed-
// rate derivation each resolved the dial their own way, and the popup slider
// and the drum-feeder drawing each kept their own copy of the display rule
// and its snap window. They could disagree about the same dial. Everything
// now reads `dialEffective`/`dialOverriding`, and the UI reads the same
// answer back off the snapshot (`dialReading`) instead of re-deriving it.
//
// The rule (grilled 2026-08-24): the interlock's live cap is the machine's
// balanced point. A dial the presenter has touched and parked more than
// DIAL_SNAP away from that cap, above *or* below it, is an override, and the
// actuator runs at the dial. Otherwise it runs at the cap. A full stop
// (throttle target 0) is never overridable, however the dial sits.
// `touched` is needed because a gradedFeedSchedule band's own targets are
// always below the dial's untouched default of 1: without it every such
// actuator would read as overridden the moment its schedule engaged.

export const SPEED_DIAL = {
  dial: "speedFraction", touched: "speedDialTouched",
  throttle: "throttleFraction", target: "throttleTarget",
};
export const GATE_DIAL = {
  dial: "gateFraction", touched: "gateDialTouched",
  throttle: "gateThrottleFraction", target: "gateThrottleTarget",
};

// How far from the cap a touched dial may sit and still count as "on it".
// A native range input centres its thumb under the cursor, so a drag that
// looks dead on the slider's tick still lands a point or two off it.
export const DIAL_SNAP = 0.02;

export function dialOverriding(state, f) {
  return state[f.touched] === true
    && state[f.target] > 0
    && Math.abs(state[f.dial] - state[f.throttle]) > DIAL_SNAP;
}

// The fraction the actuator actually runs at. During a full stop the
// throttle ramps down from wherever the interlock last had it, which can sit
// above a dial the presenter had slowed the machine to; a stop must ramp
// down from the machine's real speed, never jump it back up to the cap first
// (seen live 2026-09-28: a chain dialled to 30% leapt to 79% the instant the
// LSHH trip fired, then ramped to 0).
export function dialEffective(state, f) {
  if (dialOverriding(state, f)) return state[f.dial];
  if (state[f.touched] === true && state[f.target] <= 0) return Math.min(state[f.dial], state[f.throttle]);
  return state[f.throttle];
}

// The presenter drags the dial. A drag that lands within DIAL_SNAP of the
// live cap is "return to normal": the dial goes back to its exact untouched
// default rather than staying touched at a value that only matches the cap
// right now, which would diverge (or re-arm the override) the next time the
// cap moves.
export function setDial(state, f, fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (Math.abs(clamped - state[f.throttle]) <= DIAL_SNAP) {
    releaseDial(state, f);
    return;
  }
  state[f.dial] = clamped;
  state[f.touched] = true;
}

export function releaseDial(state, f) {
  state[f.dial] = 1;
  state[f.touched] = false;
}

// Published on the machine's snapshot, so the popup slider and the scene
// read the sim's own answer instead of re-deriving it. `cap` is where the
// interlock alone would run the actuator; `overridable` is false during a
// full stop.
export function dialReading(state, f) {
  return {
    dial: state[f.dial],
    touched: state[f.touched],
    cap: state[f.throttle],
    overridable: state[f.target] > 0,
    overriding: dialOverriding(state, f),
    effective: dialEffective(state, f),
  };
}

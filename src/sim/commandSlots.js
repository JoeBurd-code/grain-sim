// Who is allowed to stop or slow an actuator, and how their commands
// combine. Several authorities command the same machine: each interlock rule
// (by its own id), the controlled stop, the utilities trip, and for a drum
// feeder the source selector. On the real line the pendulum conveyor alone
// answers to seven of them.
//
// Before this module every authority overwrote one shared target field, so
// the last writer won and correctness hung on call order in stepSim and on
// each mechanism remembering what the others had commanded. Two bugs came
// straight out of that (found 2026-09-28 by a headless trace): the Concetti
// feed schedule's band change restarted the pendulum conveyor while the
// pause sequence was still holding it for its ordered restart, and the pause
// sequence's own restart then ran the conveyor at 100% over the schedule's
// band speed until the next band change. The utilities trip needed its own
// capture/restore bookkeeping so as not to un-latch another trip, and the
// treater had already grown a private `holders` set (issue #73) for the same
// reason.
//
// Now each authority writes only its own slot and the actuator resolves them
// with one rule: the most restrictive command wins. The slowest speed, any
// "close", any "off". Releasing a command is just writing the neutral value
// (1, open, on) to one's own slot, which can never override anyone else. A
// valve's or drum feeder gate's position has a starting position under its
// slots instead (`baseline`): released there, a command leaves the slot, and
// with no slot held the actuator goes back to its starting position. The
// resolved value lands in the same fields everything already reads
// (`throttleTarget`, `opennessTarget`, `enabled`), so nothing downstream of
// a command needs to know slots exist.
//
// The ramp is the writer's: the authority whose command just changed things
// sets how fast the actuator moves to the newly resolved target, the same as
// when it owned the field outright.
//
// This does not merge the three stop mechanisms (ADR-0006): each still owns
// its own rule for *when* a machine stops. It only changes where they write.

// A caller that names no authority shares this one slot, which behaves
// exactly like the old single field. Behaviour-level unit tests rely on it.
export const DEFAULT_AUTHORITY = "default";

// The source selector owns a drum feeder's on/off slot under this name; a
// feeder's authored `sim.enabled` is that selector's starting position.
export const SOURCE_SELECTOR = "sourceSelector";

// Fraction-valued actuators: a chain's throttle, a valve's openness, a drum
// feeder's gate. `baseline` names the field holding the actuator's starting
// position, set in Build mode: where it sits while no authority holds a
// command (absent, fully open).
export const THROTTLE = { slots: "throttleCommands", target: "throttleTarget", ramp: "throttleRampPerSec" };
export const OPENNESS = { slots: "opennessCommands", target: "opennessTarget", ramp: "opennessRampPerSec", baseline: "startFraction" };
export const GATE = { slots: "gateCommands", target: "gateThrottleTarget", ramp: "gateThrottleRampPerSec", baseline: "startFraction" };

// A `target` of null lets the authority's command go altogether. While any
// authority holds a command the lowest wins, so an interlock's "set to 60%"
// opens a valve that starts shut; with none held, the actuator goes back to
// its starting position. Writing 1 to release, as the throttle's authorities
// do, is the same thing on an actuator that starts fully open.
export function commandFraction(state, f, authority, target, rampTimeSec) {
  const slots = (state[f.slots] ??= {});
  if (target === null) delete slots[authority];
  else slots[authority] = target;
  state[f.target] = resolvedFraction(state, f);
  state[f.ramp] = rampTimeSec > 0 ? 1 / rampTimeSec : Infinity;
}

function resolvedFraction(state, f) {
  const held = Object.values(state[f.slots] ?? {});
  return held.length > 0 ? Math.min(...held) : (f.baseline ? state[f.baseline] ?? 1 : 1);
}


// On/off actuators: a drum feeder's intake gate. On only while every
// authority that has spoken says on.
export function commandOn(state, slotsKey, flagKey, authority, on) {
  const slots = (state[slotsKey] ??= {});
  slots[authority] = on;
  state[flagKey] = Object.values(slots).every(Boolean);
}

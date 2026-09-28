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
// (1, open, on) to one's own slot, which can never override anyone else. The
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

// Fraction-valued actuators: a chain's throttle, a valve's openness.
export const THROTTLE = { slots: "throttleCommands", target: "throttleTarget", ramp: "throttleRampPerSec" };
export const OPENNESS = { slots: "opennessCommands", target: "opennessTarget", ramp: "opennessRampPerSec" };

export function commandFraction(state, f, authority, target, rampTimeSec) {
  const slots = (state[f.slots] ??= {});
  slots[authority] = target;
  let resolved = 1;
  for (const v of Object.values(slots)) if (v < resolved) resolved = v;
  state[f.target] = resolved;
  state[f.ramp] = rampTimeSec > 0 ? 1 / rampTimeSec : Infinity;
}

// On/off actuators: a drum feeder's intake gate. On only while every
// authority that has spoken says on.
export function commandOn(state, slotsKey, flagKey, authority, on) {
  const slots = (state[slotsKey] ??= {});
  slots[authority] = on;
  state[flagKey] = Object.values(slots).every(Boolean);
}

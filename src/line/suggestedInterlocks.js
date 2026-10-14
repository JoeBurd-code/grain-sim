// Issue #93: the interlocks the editor proposes for the connections on the
// line, so a built line can protect itself without PLC knowledge. The
// proposals are a pure function of the line document. One rule, the one the
// golden line repeats on every bin it protects (metal bins 1 and 2, the
// Flexicon pre-bin): when a machine with a level is above 85 % for 5 s, stop
// the machine feeding it, latched.
//
// A suggestion is never on the line by itself. The Interlocks window lists
// it under its machine with a tick and a cross: the tick adds it as an
// ordinary interlock (acceptSuggestion), the cross records its id in
// `line.dismissedSuggestions` (dismissSuggestion), so it is not proposed
// again.
import { conditionOptions, holdAction } from "./sentenceOptions";

export const HIGH_LEVEL_SETPOINT = 0.85;
export const HIGH_LEVEL_DELAY_SEC = 5;

function suggestionId(binId, feederId) {
  return `suggested-high-${binId}-${feederId}`;
}

// Every suggestion the connections of the line call for, one per
// connection into a machine with a level from a machine that can be held.
export function suggestedInterlocks(line) {
  const out = [];
  for (const c of line.connections) {
    const bin = c.to.machine;
    const feeder = c.from.machine;
    if (bin === feeder || !conditionOptions(line, bin).includes("above")) continue;
    const action = holdAction(line, feeder);
    if (!action) continue;
    const id = suggestionId(bin, feeder);
    if (out.some((r) => r.id === id)) continue;
    out.push({
      id,
      kind: "sentence",
      when: { machine: bin, condition: "above", setpoint: HIGH_LEVEL_SETPOINT, delaySec: HIGH_LEVEL_DELAY_SEC },
      then: [{ action, machine: feeder }],
      reset: "latched",
    });
  }
  return out;
}

// True when the line already has an interlock that holds `feeder` while
// `bin` is above some level: an accepted suggestion, the user's own or the
// golden line's.
function alreadyCovered(line, bin, feeder) {
  return (line.interlocks ?? []).some((r) => r.when?.machine === bin && r.when?.condition === "above"
    && (r.then ?? []).some((s) => s.machine === feeder && (s.action === "stop" || s.action === "close")));
}

// The suggestions still waiting for a tick or a cross.
export function pendingSuggestions(line) {
  const dismissed = new Set(line.dismissedSuggestions ?? []);
  const ids = new Set((line.interlocks ?? []).map((r) => r.id));
  return suggestedInterlocks(line)
    .filter((r) => !ids.has(r.id) && !dismissed.has(r.id) && !alreadyCovered(line, r.when.machine, r.then[0].machine));
}

function findPending(line, id) {
  return pendingSuggestions(line).find((r) => r.id === id);
}

// The tick: the suggestion becomes an ordinary interlock on the line.
export function acceptSuggestion(line, id) {
  const rule = findPending(line, id);
  if (!rule) return { ok: false, error: `There is no suggestion "${id}".` };
  return { ok: true, line: { ...line, interlocks: [...(line.interlocks ?? []), rule] }, id };
}

// The cross: the suggestion is not proposed again.
export function dismissSuggestion(line, id) {
  if (!findPending(line, id)) return { ok: false, error: `There is no suggestion "${id}".` };
  return { ok: true, line: { ...line, dismissedSuggestions: [...(line.dismissedSuggestions ?? []), id] } };
}

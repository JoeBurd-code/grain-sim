// Issue #93: the interlocks the editor proposes when the user connects
// machines, so a built line protects itself without PLC knowledge. The
// proposals are a pure function of the line document. One rule, the one the
// golden line repeats on every bin it protects (metal bins 1 and 2, the
// Flexicon pre-bin): when a machine with a level is above 85 % for 5 s, stop
// the machine feeding it, latched.
//
// A suggestion is an ordinary sentence with `suggested: true`. The first
// change the user makes to it takes the mark away (sentenceEditor.js), and
// deleting one records its id in `line.dismissedSuggestions`, so it is not
// proposed again. Only a new connection adds suggestions, and only for that
// connection, so a line's existing interlocks never gain any after the fact.
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
      suggested: true,
      when: { machine: bin, condition: "above", setpoint: HIGH_LEVEL_SETPOINT, delaySec: HIGH_LEVEL_DELAY_SEC },
      then: [{ action, machine: feeder }],
      reset: "latched",
    });
  }
  return out;
}

// True when the line already has an interlock that holds `feeder` while
// `bin` is above some level, the user's own or the golden line's.
function alreadyCovered(line, bin, feeder) {
  return (line.interlocks ?? []).some((r) => r.when?.machine === bin && r.when?.condition === "above"
    && (r.then ?? []).some((s) => s.machine === feeder && (s.action === "stop" || s.action === "close")));
}

// The line with the suggestions for `connection` added, unless the line has
// them already, the user deleted them, or another interlock already does
// the same job.
export function addSuggestionsFor(line, connection) {
  const dismissed = new Set(line.dismissedSuggestions ?? []);
  const ids = new Set((line.interlocks ?? []).map((r) => r.id));
  const fresh = suggestedInterlocks({ ...line, connections: [connection] })
    .filter((r) => !ids.has(r.id) && !dismissed.has(r.id) && !alreadyCovered(line, r.when.machine, r.then[0].machine));
  if (fresh.length === 0) return line;
  return { ...line, interlocks: [...(line.interlocks ?? []), ...fresh] };
}

// The line without the unchanged suggestions its connections no longer call
// for. A suggestion the user changed is their own, and stays.
export function withoutStaleSuggestions(line) {
  const wanted = new Set(suggestedInterlocks(line).map((r) => r.id));
  const interlocks = (line.interlocks ?? []).filter((r) => !r.suggested || wanted.has(r.id));
  return interlocks.length === (line.interlocks ?? []).length ? line : { ...line, interlocks };
}

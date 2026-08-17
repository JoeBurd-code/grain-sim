// Issue #52: the single source of truth for "this machine is deliberately,
// permanently never simulated" — validateLine.js and behaviorCensus.js both
// need the exact same rule (a machine with no `sim` block is either a real
// gap or one of these two exemptions), and a third exemption kind should
// only ever need editing here, not at both call sites in lockstep.
export function isSimExempt(m) {
  return m.type === "stub" || m.simExempt === true;
}

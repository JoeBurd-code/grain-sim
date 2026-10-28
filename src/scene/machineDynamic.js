// Single point of resolution for a machine's dynamic (per-tick) values.
// `simSnap` is the live sim's published snapshot (Map<machineId, {...}>,
// shape varies per sim.kind's own `snapshot`, see behaviors.js); a machine
// the sim hasn't reached yet, or that has no dynamic value at all, falls
// back to the static `fill` authored in the line data so the scene never
// looks broken mid build. Every other live field (e.g. the transport
// delay's leadingProgress/trailingProgress, issue #21) passes through
// as-is, undefined where the sim hasn't published one — each symbol reads
// only the fields it understands.
//
// In Build mode an outlet valve or a drum feeder gate is drawn at its
// starting position, the one the Build panel sets, not wherever the last
// run left it. `easePosition` asks the symbol to slide its shutter to a new
// position rather than jump, so changing the field shows the valve closing.
export function resolveDynamic(machine, simSnap, building) {
  const live = simSnap?.get(machine.id) ?? {};
  const dynamic = { ...live, fill: live.fill ?? machine.fill };
  if (!building) return dynamic;
  const start = machine.sim?.startFraction ?? 1;
  if (machine.sim?.kind === "gateValve") return { ...dynamic, openness: start, easePosition: true };
  if (machine.sim?.hasGate) return { ...dynamic, gateDial: { effective: start }, easePosition: true };
  return dynamic;
}

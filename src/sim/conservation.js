// Shared conservation assertion every accumulating/source machine test can
// call: total fed, plus whatever inventory an accumulator started with
// before this run, must always equal stored plus in-transit plus delivered
// plus spilled. This is the check that catches a leak or a duplication
// invisible to the eye. Each behaviour declares its own contribution (see
// behaviors.js `conserve`), so a new kind needs no edit here.
import { BEHAVIORS } from "./behaviors";
import { hasSimDownstream } from "./engine";

const EPS = 1e-9;
const FIELDS = ["fed", "initialStored", "stored", "inTransit", "delivered", "spilled"];

export function conservationTotals(sim) {
  const totals = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  for (const [id, state] of sim.machines) {
    // Whether this machine has a sim-enabled downstream changes what its
    // own contribution means (issue #21): a machine that holds no
    // inventory of its own reports its cumulative throughput as
    // "delivered" only when nothing downstream already accounts for that
    // same volume in its own stored/inTransit.
    const contribution = BEHAVIORS[state.kind]?.conserve?.(state, hasSimDownstream(sim, id)) ?? {};
    for (const field of FIELDS) totals[field] += contribution[field] ?? 0;
  }
  return totals;
}

export function assertConserved(sim) {
  const { fed, initialStored, stored, inTransit, delivered, spilled } = conservationTotals(sim);
  const accountedFor = stored + inTransit + delivered + spilled;
  const suppliedTotal = fed + initialStored;
  const diff = suppliedTotal - accountedFor;
  if (Math.abs(diff) > EPS) {
    throw new Error(
      `conservation violated: fed+initialStored=${suppliedTotal} but stored+inTransit+delivered+spilled=${accountedFor} (diff ${diff})`
    );
  }
}

// Shared conservation assertion every accumulating/source machine test can
// call: total fed, plus whatever inventory an accumulator started with
// before this run, must always equal stored plus in-transit plus delivered
// plus spilled plus clearedByPlant. This is the check that catches a leak
// or a duplication invisible to the eye. Each behaviour declares its own
// contribution to the first five terms (see behaviors.js `conserve`), so a
// new kind needs no edit here; `clearedByPlant` (issue #55) is the one
// exception, a sim-level rather than per-machine term — see its own comment
// on conservationTotals below.
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
  // Issue #55: CLEAR PLANT's own running discard total — a sim-level field
  // (engine.js's createSim), not a per-machine `conserve` contribution,
  // since the material it accounts for no longer exists on any machine by
  // the time this runs.
  totals.clearedByPlant = sim.discardedByClear ?? 0;
  return totals;
}

export function assertConserved(sim) {
  const { fed, initialStored, stored, inTransit, delivered, spilled, clearedByPlant } = conservationTotals(sim);
  // `clearedByPlant` joins the accounted-for side, not the supplied side: a
  // clear doesn't add material to the line, it removes material that was
  // already accounted for elsewhere (stored/inTransit) and re-homes it here
  // instead — see clearPlant's own comment (engine.js).
  const accountedFor = stored + inTransit + delivered + spilled + clearedByPlant;
  const suppliedTotal = fed + initialStored;
  const diff = suppliedTotal - accountedFor;
  if (Math.abs(diff) > EPS) {
    throw new Error(
      `conservation violated: fed+initialStored=${suppliedTotal} but stored+inTransit+delivered+spilled+clearedByPlant=${accountedFor} (diff ${diff})`
    );
  }
}

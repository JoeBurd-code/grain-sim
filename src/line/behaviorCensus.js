// Behaviour census (issue #23): generated entirely from the line definition,
// never hand maintained, so it cannot drift the way a written-up document
// would. A machine "declares" a behaviour by carrying a `sim.kind`; grouping
// on that field is the whole census. A machine with no `sim` block at all
// simply hasn't been engined yet and is counted separately as `undeclared`,
// not folded into any behaviour row.
//
// Two tier status per node (per the parent spec, issue #15):
//   ENGINED   — built, tested, conserving, even with assumed values left.
//               Data-derivable proxy: it declares a registered sim.kind, since
//               in this repo's process a machine only gains a `sim` block once
//               its own issue has actually built, tested and closed it (see
//               CLAUDE.md / issue #15's "per machine loop"). That's also why
//               `engined` always equals `total` within a single behaviour row
//               here: the distinction between built and not-yet-built shows up
//               at the whole-line level (`undeclared`), not within a row.
//   CONFIRMED — every value in its `sim.provenance` has been replaced from
//               an authoritative source, i.e. none is still "assumed". A
//               missing/empty provenance object has nothing left assumed, so
//               it counts as confirmed (e.g. passThrough, which has no
//               configurable numeric fields at all). The tests-still-pass
//               half of CONFIRMED (issue #15) is guaranteed by the `npm test`
//               gate itself, same as validateLine.js assumes a green suite
//               rather than re-running it — this census reads only the data.
import { REGISTERED_KINDS, unregisteredKindMessage } from "../sim/behaviors";

function hasAssumedValue(provenance) {
  if (!provenance) return false;
  return Object.values(provenance).some((v) => v === "assumed");
}

export function computeBehaviorCensus(line) {
  const byKind = new Map();
  let undeclared = 0;

  for (const m of line.machines) {
    const kind = m.sim?.kind;
    if (!kind) {
      undeclared += 1;
      continue;
    }
    // Fails loudly rather than silently dropping the node from the census
    // (acceptance criterion): the line validator makes the same check, but
    // the census must not depend on validation having run first.
    if (!REGISTERED_KINDS.has(kind)) {
      throw new Error(unregisteredKindMessage(m.id, kind));
    }
    if (!byKind.has(kind)) byKind.set(kind, { kind, total: 0, engined: 0, confirmed: 0 });
    const row = byKind.get(kind);
    row.total += 1;
    row.engined += 1;
    if (!hasAssumedValue(m.sim.provenance)) row.confirmed += 1;
  }

  const behaviors = [...byKind.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  const totals = behaviors.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      engined: acc.engined + r.engined,
      confirmed: acc.confirmed + r.confirmed,
    }),
    { total: 0, engined: 0, confirmed: 0 }
  );

  return { behaviors, totals, undeclared, machineCount: line.machines.length };
}

export function formatCensusReport(census) {
  const cols = ["kind", "nodes", "engined", "confirmed"];
  const rows = census.behaviors.map((b) => [b.kind, b.total, b.engined, b.confirmed]);
  const widths = cols.map((c, i) =>
    Math.max(c.length, ...rows.map((r) => String(r[i]).length), i === 0 ? "TOTAL".length : 0)
  );
  const pad = (v, i) => (i === 0 ? String(v).padEnd(widths[i]) : String(v).padStart(widths[i]));
  const renderRow = (r) => r.map((v, i) => pad(v, i)).join("  ");

  const report = ["BEHAVIOUR CENSUS (nodes with a behaviour assigned)", "", renderRow(cols)];
  for (const r of rows) report.push(renderRow(r));
  report.push(renderRow(["-".repeat(widths[0]), "", "", ""]).trimEnd());
  report.push(renderRow(["TOTAL", census.totals.total, census.totals.engined, census.totals.confirmed]));
  report.push("");
  report.push(`not yet engined: ${census.undeclared} of ${census.machineCount} machines on the whole line`);
  return report.join("\n");
}

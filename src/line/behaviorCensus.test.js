import { describe, it, expect } from "vitest";
import { computeBehaviorCensus, formatCensusReport } from "./behaviorCensus";
import { line } from "./lineData";

function machine(id, kind, provenance) {
  return { id, sim: kind ? { kind, provenance } : undefined };
}

function stubMachine(id) {
  return { id, type: "stub", sim: undefined };
}

function exemptMachine(id) {
  return { id, simExempt: true, sim: undefined };
}

describe("computeBehaviorCensus", () => {
  it("groups nodes by declared behaviour kind, counting engined and confirmed", () => {
    const fixture = {
      machines: [
        machine("a", "accumulator", { capacityM3: "confirmed" }),
        machine("b", "accumulator", { capacityM3: "assumed" }),
        machine("c", "passThrough"),
      ],
    };
    const census = computeBehaviorCensus(fixture);
    const byKind = Object.fromEntries(census.behaviors.map((b) => [b.kind, b]));

    expect(byKind.accumulator).toEqual({ kind: "accumulator", total: 2, engined: 2, confirmed: 1 });
    expect(byKind.passThrough).toEqual({ kind: "passThrough", total: 1, engined: 1, confirmed: 1 });
  });

  it("counts a machine with no provenance object as confirmed (nothing left assumed)", () => {
    const fixture = { machines: [machine("a", "passThrough")] };
    const census = computeBehaviorCensus(fixture);
    expect(census.behaviors[0].confirmed).toBe(1);
  });

  it("excludes a machine with any assumed provenance value from the confirmed count", () => {
    const fixture = {
      machines: [machine("a", "source", { rateM3PerSec: "assumed" })],
    };
    const census = computeBehaviorCensus(fixture);
    expect(census.behaviors[0].engined).toBe(1);
    expect(census.behaviors[0].confirmed).toBe(0);
  });

  it("counts a machine still marked derived as confirmed (only 'assumed' blocks it)", () => {
    const fixture = {
      machines: [machine("a", "source", { rateM3PerSec: "derived" })],
    };
    const census = computeBehaviorCensus(fixture);
    expect(census.behaviors[0].confirmed).toBe(1);
  });

  it("excludes machines with no sim block from the behaviour groups, counting them as undeclared", () => {
    const fixture = {
      machines: [machine("a", "passThrough"), machine("b", undefined)],
    };
    const census = computeBehaviorCensus(fixture);
    expect(census.behaviors).toHaveLength(1);
    expect(census.undeclared).toBe(1);
    expect(census.outOfScope).toBe(0);
    expect(census.machineCount).toBe(2);
  });

  // Issue #52: a machine with no sim block is only a real "not yet engined"
  // gap if it isn't one of the two deliberate, permanent exemptions
  // validateLine.js also honours — otherwise the census can never reach
  // zero for a reason that isn't actually a gap.
  it("counts a stub machine (type: \"stub\") with no sim block as out of scope, not undeclared", () => {
    const fixture = { machines: [machine("a", "passThrough"), stubMachine("b")] };
    const census = computeBehaviorCensus(fixture);
    expect(census.undeclared).toBe(0);
    expect(census.outOfScope).toBe(1);
    expect(census.machineCount).toBe(2);
  });

  it("counts a simExempt machine with no sim block as out of scope, not undeclared", () => {
    const fixture = { machines: [machine("a", "passThrough"), exemptMachine("b")] };
    const census = computeBehaviorCensus(fixture);
    expect(census.undeclared).toBe(0);
    expect(census.outOfScope).toBe(1);
    expect(census.machineCount).toBe(2);
  });

  it("throws, naming the machine and kind, instead of silently omitting an unregistered behaviour kind", () => {
    const fixture = { machines: [machine("ghost", "teleporter")] };
    expect(() => computeBehaviorCensus(fixture)).toThrow(/ghost/);
    expect(() => computeBehaviorCensus(fixture)).toThrow(/teleporter/);
  });

  it("sums totals across every behaviour", () => {
    const fixture = {
      machines: [
        machine("a", "accumulator", { capacityM3: "confirmed" }),
        machine("b", "accumulator", { capacityM3: "assumed" }),
        machine("c", "source", { rateM3PerSec: "confirmed" }),
      ],
    };
    const census = computeBehaviorCensus(fixture);
    expect(census.totals).toEqual({ total: 3, engined: 3, confirmed: 2 });
  });

  it("computes cleanly over the real Treater Line 2 definition", () => {
    const census = computeBehaviorCensus(line);
    expect(census.machineCount).toBe(line.machines.length);
    expect(census.totals.total + census.undeclared + census.outOfScope).toBe(line.machines.length);
    for (const row of census.behaviors) {
      expect(row.engined).toBe(row.total);
      expect(row.confirmed).toBeLessThanOrEqual(row.engined);
    }
  });

  // Issue #52's own acceptance criterion: the census reaches zero "not yet
  // engined" on the real line — every non-stub, non-exempt machine has been
  // engined by this point in the build.
  it("reports zero machines not yet engined on the real Treater Line 2 definition", () => {
    const census = computeBehaviorCensus(line);
    expect(census.undeclared).toBe(0);
  });
});

describe("formatCensusReport", () => {
  it("renders a header, one line per behaviour, and a totals line", () => {
    const fixture = {
      machines: [
        machine("a", "accumulator", { capacityM3: "confirmed" }),
        machine("b", "accumulator", { capacityM3: "assumed" }),
        machine("c", undefined),
      ],
    };
    const report = formatCensusReport(computeBehaviorCensus(fixture));
    expect(report).toContain("accumulator");
    expect(report).toMatch(/2\s+2\s+1/); // total 2, engined 2, confirmed 1
    expect(report).toContain("TOTAL");
    expect(report).toMatch(/not yet engined:\s*1 of 3/);
  });

  it("reports an out-of-scope line only when a stub or exempt machine is present", () => {
    const withoutStub = { machines: [machine("a", "passThrough")] };
    expect(formatCensusReport(computeBehaviorCensus(withoutStub))).not.toContain("out of demo scope");

    const withStub = { machines: [machine("a", "passThrough"), stubMachine("b")] };
    const report = formatCensusReport(computeBehaviorCensus(withStub));
    expect(report).toMatch(/out of demo scope, never simulated by design:\s*1 of 2/);
  });
});

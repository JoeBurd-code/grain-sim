import { describe, it, expect } from "vitest";
import { validateLine } from "./validateLine";
import { line } from "./lineData";

describe("authored Treater Line 2 data", () => {
  it("passes validation", () => {
    const result = validateLine(line);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("covers all three zones", () => {
    const zonesUsed = new Set(line.machines.map((m) => m.zone));
    expect(zonesUsed).toEqual(new Set(["treating", "packaging", "bagging"]));
  });

  // Issue #73: a `coupling` connection is drawn as nothing (Scene.jsx), on
  // the strength of its two endpoints being the same world point. If either
  // machine is ever nudged, hiding it would leave a visible gap in the run
  // with no arrow across it — so the geometry that justifies hiding it is
  // asserted here rather than assumed.
  it("every coupling connection joins two anchors at the identical world point", () => {
    const byId = new Map(line.machines.map((m) => [m.id, m]));
    const world = (machineId, port) => {
      const m = byId.get(machineId);
      return { x: m.x + m.anchors[port].x, y: m.y + m.anchors[port].y };
    };
    const couplings = line.connections.filter((c) => c.coupling);
    expect(couplings.length).toBeGreaterThan(0);
    for (const c of couplings) {
      const from = world(c.from.machine, c.from.port);
      const to = world(c.to.machine, c.to.port);
      expect(from, `${c.from.machine}.${c.from.port} -> ${c.to.machine}.${c.to.port}`).toEqual(to);
    }
  });
});

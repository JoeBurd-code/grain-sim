import { describe, it, expect } from "vitest";
import { validateLine, wiringGaps } from "./validateLine";
import { isRuleOff, isFeedRateLinkOff } from "./interlocks";
import { catalogueItem } from "../catalogue/catalogue";
import { line } from "./lineData";

describe("authored Treater Line 2 data", () => {
  it("passes validation", () => {
    const result = validateLine(line);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Issue #87: a gap in the wiring no longer stops a line loading, so the
  // hand-written golden line is held to having none here.
  it("has no machine or Diverter outlet left unconnected", () => {
    expect(wiringGaps(line)).toEqual([]);
  });

  // Issue #87: a rule naming a missing machine loads but is off, so a typo
  // in a machine id here would quietly switch an interlock off.
  it("has no rule or feed rate link that is off", () => {
    expect([...line.interlocks, ...line.machineRules].filter((r) => isRuleOff(line, r)).map((r) => r.id)).toEqual([]);
    expect(line.feedRateDerivations.filter((l) => isFeedRateLinkOff(line, l)).map((l) => l.id)).toEqual([]);
  });

  // Issue #87: every golden line machine but the stubs names its catalogue
  // item, and is that item's kind of machine.
  it("names a catalogue item for every machine but the stubs, of the same type, kind, size and ports", () => {
    for (const m of line.machines) {
      if (m.type === "stub") {
        expect(m.item, m.id).toBeUndefined();
        continue;
      }
      const item = catalogueItem(m.item);
      expect(item, `${m.id} item "${m.item}"`).toBeDefined();
      expect({ type: m.type, kind: m.sim.kind, w: m.w, h: m.h, ports: m.ports }, m.id)
        .toEqual({ type: item.machine.type, kind: item.machine.sim.kind, w: item.machine.w, h: item.machine.h, ports: item.machine.ports });
    }
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

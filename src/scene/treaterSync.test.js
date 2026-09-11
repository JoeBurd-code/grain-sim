// The treater's drawn charge has to stay in step with the bins either side.
// That is the whole reason treaterBatch is phased off the engine's published
// `elapsedSec` rather than a clock of its own: the earlier version was
// anchored on the sim-time of the first batch ever observed, which had no
// relationship to when the pre-bin actually handed a charge over or when the
// after-bin actually received one, and visibly drifted against both.
//
// A unit test on treaterBatch alone cannot catch a regression here, because
// the property is about the relationship between three machines' published
// values over a real run. So this drives the real line through the real
// engine and checks what the drawn charge is doing on the exact ticks the
// neighbours step.
//
// It reads the PUBLISHED SNAPSHOT rather than raw engine state — the raw
// state has no `fill` at all (accumulators store `stored`/`capacity`,
// batchCycle stores `held`), so a trace reading `state.fill` gets undefined
// and silently passes while proving nothing.
import { describe, it, expect } from "vitest";
import { createSim, stepSim, getMachineState, setSourceRate, setSource, setDestination, DT } from "../sim/engine";
import { BEHAVIORS } from "../sim/behaviors";
import { tPerHourToM3PerSec } from "../sim/units";
import { line } from "../line/lineData";
import { treaterBatch } from "./litState";

// A level step big enough to be the atomic handover of a whole charge rather
// than ordinary trickle in or out.
const STEP = 0.05;

function trace(ticks) {
  const sim = createSim(line);
  setSource(sim, "treatingLine");
  setDestination(sim, "concetti");
  setSourceRate(sim, "upstreamStub", tPerHourToM3PerSec(15));
  const pub = (id) => {
    const st = getMachineState(sim, id);
    return BEHAVIORS[st.kind].snapshot(st);
  };

  const rows = [];
  for (let i = 0; i < ticks; i++) {
    stepSim(sim, DT);
    const t = pub("batchTreater");
    rows.push({
      pre: pub("treaterPreBin").fill,
      aft: pub("treaterAfterBin").fill,
      drawn: treaterBatch(t.phase, t.elapsedSec, t.cycleSec, t.fill).fill,
    });
  }
  return rows;
}

describe("treater drawn charge vs the bins either side", () => {
  const rows = trace(8000);                      // 400 sim-seconds, several batches
  const preDrops = [], aftRises = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].pre - rows[i].pre > STEP) preDrops.push(i);
    if (rows[i].aft - rows[i - 1].aft > STEP) aftRises.push(i);
  }

  it("actually observed several batches (guards the two tests below from passing vacuously)", () => {
    expect(preDrops.length).toBeGreaterThan(3);
    expect(aftRises.length).toBeGreaterThan(3);
    expect(rows.some((r) => r.drawn > 0.9)).toBe(true);   // the drum does fill
    expect(rows.some((r) => r.drawn < 0.1)).toBe(true);   // and does empty
  });

  it("is empty and starting to fill on the tick the pre-bin hands a charge over", () => {
    for (const i of preDrops) {
      expect(rows[i].drawn).toBeLessThan(0.1);
    }
  });

  it("has finished emptying on the tick the after-bin receives a charge", () => {
    for (const i of aftRises) {
      expect(rows[i].drawn).toBeLessThan(0.1);
    }
  });

  it("is full in between, so the batch reads as being treated rather than in transit", () => {
    // Measured per batch rather than as a share of the whole run: the run
    // also contains long starved stretches where the pre-bin cannot supply a
    // charge and the drum is correctly empty, and how much of the run those
    // take up is a property of the line's feed, not of this symbol.
    const midHold = preDrops
      .map((i) => rows[i + Math.round(20 / DT)])   // 20s into a 48s cycle
      .filter(Boolean);
    expect(midHold.length).toBeGreaterThan(3);
    for (const r of midHold) expect(r.drawn).toBeCloseTo(1, 5);
  });
});

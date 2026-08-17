// Issue #52: every one of issues #46-#51 already asserts conservation for
// its own branch, against the real line, at the moment its own mechanism
// fires (a destination switch, a source switch, a latching trip, a
// controlled stop, a utilities trip) — but always one mechanism at a time,
// starting from a fresh `createSim`. This file's one test composes all five
// into a single continuous run instead, so a leak that only shows up once
// two mechanisms interact (e.g. a controlled stop begun while a trip is
// still latched, or a destination switch with a utilities recovery still in
// flight) has somewhere to be caught. It doesn't re-prove any one
// mechanism's own timing or ordering — that's each parent issue's own test
// file — only that `assertConserved` never trips across the whole sequence.
import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, resetTrips, getMachineState, setSourceRate, setFeederRate, setAccumulatorLevel, DT,
  setSource, setDestination, controlledStop, resumeLine, setUtilitiesHealthy, getUtilitiesTripPhase,
} from "./engine";
import { assertConserved } from "./conservation";
import { tPerHourToM3PerSec } from "./units";
import { line } from "../line/lineData";

const SOURCE_ID = "upstreamStub";
const PRO_BOX_ID = "proBoxStation";
const FEEDER_ID = "treatDrumFeeder";
const METAL_BIN_2_ID = "metalBin2";
const OUTLOAD_DIVERTER_ID = "outloadDiverter";
const CONVEYOR_ID = "pendulumConveyor";

function run(sim, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepSim(sim, DT);
    assertConserved(sim);
  }
}

describe("whole-line conservation across every route at once (issue #52)", () => {
  it("holds continuously through a combined destination switch, source switch, latching trip, controlled stop and utilities trip, over a long run", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(15));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15));

    // Populate every zone at once — treating, then packaging — with the
    // conveyor genuinely loaded before anything starts switching.
    run(sim, 200);

    // Mid-run destination switch with the conveyor loaded (#47): walk every
    // route the destination selector can pick, each while the previous
    // route's own material is still arriving.
    setDestination(sim, "flexicon");
    run(sim, 100);
    setDestination(sim, "concetti");
    run(sim, 100);
    setDestination(sim, "metalBin2");
    run(sim, 100);

    // Mid-run source switch (#46), with the old source's own material still
    // in flight across the switch.
    setSource(sim, "proBox");
    setSourceRate(sim, PRO_BOX_ID, tPerHourToM3PerSec(15));
    run(sim, 100);
    setSource(sim, "treatingLine");
    run(sim, 100);

    // A trip latching with product stranded everywhere: metal bin 2, the
    // currently selected destination, fills and cascades backward.
    // Conservation must hold with the line frozen mid-cascade, not only
    // once the cascade has finished propagating (issue #47's own cascade
    // test covers that timing in detail; this run doesn't wait for it).
    setAccumulatorLevel(sim, METAL_BIN_2_ID, 1);
    run(sim, 300);
    expect(getMachineState(sim, OUTLOAD_DIVERTER_ID).selected).toBe("out2");
    expect(getMachineState(sim, CONVEYOR_ID).throttleFraction).toBe(0); // genuinely tripped, not coasting

    // Clear the trip the way the presenter does (empty the bin, then
    // reset), and let the line recover before the next phase.
    setAccumulatorLevel(sim, METAL_BIN_2_ID, 0);
    resetTrips(sim);
    run(sim, 100);

    // A controlled stop drains the line upstream-first (#50), then resumes
    // — deliberately not waited out to "stopped" here (that's #50's own
    // coverage); only that draining and resuming mid-sequence still
    // conserves.
    controlledStop(sim);
    run(sim, 300);
    resumeLine(sim);
    run(sim, 100);

    // A utilities failure trips the whole line at one second (#51), then
    // clears.
    setUtilitiesHealthy(sim, false);
    run(sim, 50);
    expect(getUtilitiesTripPhase(sim)).toBe("tripped");
    setUtilitiesHealthy(sim, true);
    resetTrips(sim);
    run(sim, 200);

    expect(() => assertConserved(sim)).not.toThrow();
  }, 30000);
});

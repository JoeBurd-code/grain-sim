// Exercises computeConnectionFlowRatios against the real Treater Line 2 data
// (lineData.js) stepped through the real engine, the same pattern engine.test.js
// itself uses — a fabricated snapshot risks silently drifting from what
// publishSnap (useSimEngine.js) actually hands the scene.
import { describe, it, expect } from "vitest";
import { createSim, stepSim, setFeederRate, setAccumulatorLevel, setSourceRate, setBatchCycleSec, getMachineState, DT } from "../sim/engine";
import { BEHAVIORS } from "../sim/behaviors";
import { line } from "../line/lineData";
import { tPerHourToM3PerSec } from "../sim/units";
import { computeConnectionFlowRatios } from "./flowAnimation";

const SOURCE_ID = "upstreamStub";
const BUFFER_BIN_ID = "treaterBufferBin";
const FEEDER_ID = "treatDrumFeeder";
const TREATER_ID = "batchTreater";
const SCREEN_ID = "scalpingScreen";

// Isolates the feeder's own draw from the buffer bin's stock (mirrors
// engine.test.js's own feedElevator helper), so a short run reliably keeps
// material moving all the way to the treater without needing to also
// balance the source valve.
function feedElevator(sim, tPerHour = 12) {
  setSourceRate(sim, SOURCE_ID, 0);
  setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(tPerHour));
}

// Mirrors publishSnap's per-machine shape (useSimEngine.js) closely enough
// for this seam: one combined flowRateM3PerSec plus whatever the behaviour's
// own snapshot() adds — the control-layer merge publishSnap also does is
// irrelevant to flow-rate computation, so it's left out here.
function snapshotOf(sim) {
  const machines = new Map();
  for (const [id, state] of sim.machines) {
    machines.set(id, { flowRateM3PerSec: state.flowRateM3PerSec ?? 0, ...BEHAVIORS[state.kind]?.snapshot?.(state) });
  }
  return machines;
}

function indexOfConnection(fromId, toId) {
  return line.connections.findIndex((c) => c.from.machine === fromId && c.to.machine === toId);
}

describe("computeConnectionFlowRatios", () => {
  it("only holds entries for connections the engine actually models", () => {
    const sim = createSim(line);
    const ratios = computeConnectionFlowRatios(line, snapshotOf(sim));

    // Modelled: the treating chain's product edges, and the screen's waste edge.
    expect(ratios.has(indexOfConnection("upstreamStub", "treatMetalRemover"))).toBe(true);
    expect(ratios.has(indexOfConnection("scalpingScreen", "discardBin"))).toBe(true);
    expect(ratios.has(indexOfConnection("scalpingScreen", "inletDrumFeeder2"))).toBe(true);

    // Not modelled: the metal remover's negligible reject stream and the
    // chemical dose — neither destination is sim-enabled, and neither
    // source is a multiOutput kind, so the single-sibling rule excludes them.
    expect(ratios.has(indexOfConnection("treatMetalRemover", "metalRejectStub1"))).toBe(false);
    expect(ratios.has(indexOfConnection("chemStub", "batchTreater"))).toBe(false);

    // Modelled (issue #46 + #47): the Pro Box is now a live source, and the
    // packaging conveyor is now a genuine multiOutput (routedTransportDelay)
    // machine — isModelledEdge's own `multi` branch (see its own comment)
    // treats every product/waste edge off a multiOutput source as modelled
    // regardless of whether that particular destination is sim-enabled yet,
    // the same rule the splitter's own two ports have always used. All
    // three of the conveyor's declared outlets read as modelled now, even
    // though the Concetti/Flexicon branches beyond binSegSampler/
    // concettiSampler still aren't built.
    expect(ratios.has(indexOfConnection("proBoxStation", "inletDrumFeeder1"))).toBe(true);
    expect(ratios.has(indexOfConnection("pendulumConveyor", "grainBreak"))).toBe(true);
    expect(ratios.has(indexOfConnection("pendulumConveyor", "binSegSampler"))).toBe(true);
    expect(ratios.has(indexOfConnection("pendulumConveyor", "concettiSampler"))).toBe(true);
  });

  it("reports a ratio near 1 once flow through a connection settles at its own nominal rate", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(20)); // keep the buffer bin well fed
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12));
    for (let i = 0; i < Math.round(120 / DT); i++) stepSim(sim, DT); // long enough to clear startup transients

    const ratios = computeConnectionFlowRatios(line, snapshotOf(sim));
    const idx = indexOfConnection(FEEDER_ID, "treatingElevator");
    expect(ratios.get(idx)).toBeCloseTo(1, 1);
  });

  it("reads the batch treater's nominal rate off its own live chargeM3/cycleSec, not the line's authored default", () => {
    // Runs the same scenario twice, differing only in a live setBatchCycleSec
    // call (issue #24's own presenter control) made before either run steps
    // — if the nominal reader fell back to the authored 40 s default instead
    // of state.cycleSec, both runs would report the identical ratio.
    function ratioAtFirstDischarge(cycleSecOverride) {
      const sim = createSim(line);
      feedElevator(sim, 20);
      if (cycleSecOverride != null) setBatchCycleSec(sim, TREATER_ID, cycleSecOverride);
      for (let i = 0; i < Math.round(300 / DT); i++) {
        stepSim(sim, DT);
        if (getMachineState(sim, TREATER_ID).flowRateM3PerSec > 0) break;
      }
      expect(getMachineState(sim, TREATER_ID).flowRateM3PerSec).toBeGreaterThan(0); // sanity: a discharge actually happened
      const ratios = computeConnectionFlowRatios(line, snapshotOf(sim));
      return ratios.get(indexOfConnection(TREATER_ID, "treaterAfterBin"));
    }

    const defaultRatio = ratioAtFirstDischarge(undefined); // authored 40 s cycle
    const doubledCycleRatio = ratioAtFirstDischarge(80); // half the nominal rate -> double the ratio

    expect(doubledCycleRatio / defaultRatio).toBeCloseTo(2, 1);
  });

  it("reports zero once a connection's source machine is genuinely starved", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, 0);
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(12));
    setAccumulatorLevel(sim, BUFFER_BIN_ID, 0); // nothing left for the feeder to draw
    stepSim(sim, DT);

    const ratios = computeConnectionFlowRatios(line, snapshotOf(sim));
    const idx = indexOfConnection(FEEDER_ID, "treatingElevator");
    expect(ratios.get(idx)).toBe(0);
  });

  it("gives a splitter's product and waste connections the same ratio, cancelling the split fraction out", () => {
    const sim = createSim(line);
    feedElevator(sim, 20);
    setBatchCycleSec(sim, TREATER_ID, 2); // short hold once charged, so batches pulse through repeatedly
    // The screen only actually moves material in the brief window right
    // after each batch pulse drains through the after-bin (issue #28's own
    // "sums across every port" test hits the same shape) — step forward to
    // the next such tick rather than sampling one fixed endpoint that could
    // land in the much longer idle gap between pulses.
    let found = false;
    for (let i = 0; i < Math.round(180 / DT) && !found; i++) {
      stepSim(sim, DT);
      found = getMachineState(sim, SCREEN_ID).flowRateM3PerSec > 0;
    }
    expect(found).toBe(true); // sanity: the run window was long enough to see it flowing at all

    const ratios = computeConnectionFlowRatios(line, snapshotOf(sim));
    const productRatio = ratios.get(indexOfConnection(SCREEN_ID, "inletDrumFeeder2"));
    const wasteRatio = ratios.get(indexOfConnection(SCREEN_ID, "discardBin"));
    expect(productRatio).toBeGreaterThan(0);
    expect(wasteRatio).toBeCloseTo(productRatio, 6);
  });

  // Issue #47: a router-family kind (routedTransportDelay here — the
  // packaging conveyor) sends its whole live flow through exactly one port
  // at a time, unlike a splitter's simultaneous fan-out — LIVE_PORT_SHARE_BY_KIND's
  // own `router`/`routedTransportDelay` entries are what makes the other,
  // unselected outlets read as genuinely idle instead of fractionally
  // flowing.
  it("gives only the conveyor's currently selected outlet a nonzero ratio, never the other declared ports", () => {
    const sim = createSim(line);
    setSourceRate(sim, SOURCE_ID, tPerHourToM3PerSec(15));
    setFeederRate(sim, FEEDER_ID, tPerHourToM3PerSec(15));
    for (let i = 0; i < Math.round(210 / DT); i++) stepSim(sim, DT); // past the ~185s transit lag, default destination (metal bin 1)

    const ratios = computeConnectionFlowRatios(line, snapshotOf(sim));
    const selectedRatio = ratios.get(indexOfConnection("pendulumConveyor", "grainBreak"));
    const otherRatio1 = ratios.get(indexOfConnection("pendulumConveyor", "binSegSampler"));
    const otherRatio2 = ratios.get(indexOfConnection("pendulumConveyor", "concettiSampler"));
    expect(selectedRatio).toBeGreaterThan(0);
    expect(otherRatio1).toBe(0);
    expect(otherRatio2).toBe(0);
  });
});

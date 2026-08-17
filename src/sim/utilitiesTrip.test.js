import { describe, it, expect } from "vitest";
import { createSim, stepSim, resetTrips, getMachineState, getCombinedEvents, DT } from "./engine";
import { setUtilitiesHealthy, getUtilitiesHealthy, getUtilitiesTripPhase } from "./engine";
import { assertConserved } from "./conservation";

// A small fabricated line covering every actuator-bearing sim kind this
// trip touches (source, meteredFeeder, batchCycle, transportDelay), plus an
// accumulator (no actuator of its own) — same fixture shape as
// controlledStop's own miniLine in engine.test.js, extended with a batch
// machine so a mid-cycle freeze is directly observable.
const miniLine = {
  machines: [
    { id: "src", sim: { kind: "source", rateM3PerSec: 1 } },
    { id: "bin", sim: { kind: "accumulator", capacityM3: 10, initialLevelFraction: 0.5 } },
    { id: "feeder", sim: { kind: "meteredFeeder", rateM3PerSec: 1, enabled: true } },
    { id: "belt", sim: { kind: "transportDelay", distanceM: 1, speedMPerMin: 60, ceilingM3PerSec: 1 } },
    { id: "scale", sim: { kind: "batchCycle", chargeM3: 0.3, phases: [{ name: "cycle", durationSec: 5 }] } },
    { id: "sink", sim: { kind: "terminalSink" } },
  ],
  connections: [
    { from: { machine: "src", port: "out" }, to: { machine: "bin", port: "in" }, kind: "product" },
    { from: { machine: "bin", port: "out" }, to: { machine: "feeder", port: "in" }, kind: "product" },
    { from: { machine: "feeder", port: "out" }, to: { machine: "belt", port: "in" }, kind: "product" },
    { from: { machine: "belt", port: "out" }, to: { machine: "scale", port: "in" }, kind: "product" },
    { from: { machine: "scale", port: "out" }, to: { machine: "sink", port: "in" }, kind: "product" },
  ],
  interlocks: [],
};

describe("utilities trip (issue #51)", () => {
  it("starts healthy, running, with nothing latched", () => {
    const sim = createSim(miniLine);
    expect(getUtilitiesHealthy(sim)).toBe(true);
    expect(getUtilitiesTripPhase(sim)).toBe("running");
  });

  it("trips every actuator on the line 1s after utilities go unhealthy, not sooner", () => {
    const sim = createSim(miniLine);
    for (let i = 0; i < Math.round(20 / DT); i++) stepSim(sim, DT); // real material moving everywhere, including a real charge on the scale

    setUtilitiesHealthy(sim, false);
    expect(getUtilitiesTripPhase(sim)).toBe("armed"); // arms immediately...
    for (let i = 0; i < Math.round(0.9 / DT); i++) stepSim(sim, DT); // ...but nothing commanded yet, short of the 1s delay
    expect(getMachineState(sim, "src").opennessTarget).toBe(1);
    expect(getMachineState(sim, "feeder").enabled).toBe(true);
    expect(getMachineState(sim, "belt").throttleTarget).toBe(1);
    expect(getUtilitiesTripPhase(sim)).toBe("armed");

    for (let i = 0; i < Math.round(0.2 / DT); i++) stepSim(sim, DT); // past the 1s delay
    expect(getUtilitiesTripPhase(sim)).toBe("tripped");
    expect(getMachineState(sim, "src").opennessTarget).toBe(0);
    expect(getMachineState(sim, "feeder").enabled).toBe(false);
    expect(getMachineState(sim, "belt").throttleTarget).toBe(0);
    expect(getMachineState(sim, "scale").stopped).toBe(true);
  });

  it("is total and immediate, not a drain: a charge caught mid-cycle stays frozen exactly where it was, and the belt's own in-transit queue does not drain either", () => {
    const sim = createSim(miniLine);
    for (let i = 0; i < Math.round(3 / DT); i++) stepSim(sim, DT); // past the ~1s transit, mid-way through the 5s hold
    const beltInTransitBefore = getMachineState(sim, "belt").queue.reduce((a, p) => a + p.vol, 0) + getMachineState(sim, "belt").backlog;
    const scaleBefore = { phase: getMachineState(sim, "scale").phase, held: getMachineState(sim, "scale").held };
    expect(scaleBefore.held).toBeGreaterThan(0); // mid-cycle, real product already in the charge

    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(1.1 / DT); i++) stepSim(sim, DT); // past the 1s trip delay

    const scale = getMachineState(sim, "scale");
    expect(scale.phase).toBe(scaleBefore.phase); // frozen, not advanced to holding/discharging/charging
    expect(scale.held).toBeCloseTo(scaleBefore.held); // exactly what it held the instant the trip landed

    // Left running for a long time afterward: still nothing moves anywhere.
    for (let i = 0; i < Math.round(200 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    expect(getMachineState(sim, "scale").held).toBeCloseTo(scaleBefore.held);
    const belt = getMachineState(sim, "belt");
    const beltInTransitAfter = belt.queue.reduce((a, p) => a + p.vol, 0) + belt.backlog;
    expect(beltInTransitAfter).toBeCloseTo(beltInTransitBefore); // stranded, not drained through
  });

  it("latches: restoring health alone does not restart the line, only a reset does", () => {
    const sim = createSim(miniLine);
    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(1.1 / DT); i++) stepSim(sim, DT);
    expect(getUtilitiesTripPhase(sim)).toBe("tripped");

    setUtilitiesHealthy(sim, true);
    stepSim(sim, DT);
    expect(getUtilitiesTripPhase(sim)).toBe("tripped"); // still latched
    expect(getMachineState(sim, "src").opennessTarget).toBe(0);

    resetTrips(sim);
    expect(getUtilitiesTripPhase(sim)).toBe("running");
    expect(getMachineState(sim, "src").opennessTarget).toBe(1);
    expect(getMachineState(sim, "feeder").enabled).toBe(true);
    expect(getMachineState(sim, "belt").throttleTarget).toBe(1);
    expect(getMachineState(sim, "scale").stopped).toBe(false);
  });

  it("a reset while still unhealthy re-latches instead of resuming", () => {
    const sim = createSim(miniLine);
    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(1.1 / DT); i++) stepSim(sim, DT);

    resetTrips(sim); // still unhealthy
    expect(getUtilitiesTripPhase(sim)).toBe("tripped");
    expect(getMachineState(sim, "src").opennessTarget).toBe(0);
  });

  it("a trip armed but not yet fired always fires, even if health is restored before the delay elapses", () => {
    const sim = createSim(miniLine);
    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(0.5 / DT); i++) stepSim(sim, DT);
    setUtilitiesHealthy(sim, true); // recrosses before the 1s delay elapses

    for (let i = 0; i < Math.round(0.6 / DT); i++) stepSim(sim, DT); // past the original fireAt
    expect(getUtilitiesTripPhase(sim)).toBe("tripped");
    expect(getMachineState(sim, "src").opennessTarget).toBe(0);

    // Healthy at the moment of reset (already restored above), so this clears it.
    resetTrips(sim);
    expect(getUtilitiesTripPhase(sim)).toBe("running");
  });

  it("resuming does not fight a still-latched interlock on the same actuator: it restores the pre-trip target, not a blind full-open default", () => {
    const sim = createSim(miniLine);
    // Simulate another rule having already parked the belt at half speed
    // before utilities ever fails — a genuine interlock in the real line
    // data, stood in here directly since this fixture carries none.
    const belt = getMachineState(sim, "belt");
    belt.throttleTarget = 0.5;
    belt.throttleFraction = 0.5;

    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(1.1 / DT); i++) stepSim(sim, DT);
    expect(getMachineState(sim, "belt").throttleTarget).toBe(0);

    setUtilitiesHealthy(sim, true);
    resetTrips(sim);
    // Restored to what it was commanded to *before* the utilities trip, not
    // snapped back to full speed out from under the other interlock.
    expect(getMachineState(sim, "belt").throttleTarget).toBe(0.5);
  });

  it("writes an event identifying utilities as the cause, in the combined feed", () => {
    const sim = createSim(miniLine);
    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(1.1 / DT); i++) stepSim(sim, DT);

    const events = getCombinedEvents(sim);
    const tripEvent = events.find((e) => e.message.toLowerCase().includes("utilities") && e.message.toLowerCase().includes("tripped"));
    expect(tripEvent).toBeDefined();
    expect(tripEvent.machineName).toBe("UTILITIES");
  });

  it("conservation holds across a utilities trip and the recovery that follows it", () => {
    const sim = createSim(miniLine);
    for (let i = 0; i < Math.round(20 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }

    setUtilitiesHealthy(sim, false);
    for (let i = 0; i < Math.round(1.1 / DT); i++) { stepSim(sim, DT); assertConserved(sim); }
    for (let i = 0; i < Math.round(50 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // sits tripped a while

    setUtilitiesHealthy(sim, true);
    resetTrips(sim);
    for (let i = 0; i < Math.round(200 / DT); i++) { stepSim(sim, DT); assertConserved(sim); } // flowing again
    expect(() => assertConserved(sim)).not.toThrow();
    expect(getMachineState(sim, "sink").total).toBeGreaterThan(0); // genuinely resumed, not still parked
  });
});

import { describe, it, expect } from "vitest";
import { resolveDynamic } from "./machineDynamic";

const valve = (startFraction) => ({ id: "v", sim: { kind: "gateValve", ...(startFraction !== undefined ? { startFraction } : {}) } });
const feeder = (startFraction) => ({ id: "f", sim: { kind: "meteredFeeder", hasGate: true, startFraction } });
const bin = { id: "b", fill: 0.4, sim: { kind: "accumulator" } };

describe("a machine's drawn state", () => {
  it("in Sim mode is the sim's published snapshot", () => {
    const snap = new Map([["v", { openness: 0.3 }], ["f", { gateDial: { effective: 0.6 } }]]);
    expect(resolveDynamic(valve(0.5), snap, false).openness).toBe(0.3);
    expect(resolveDynamic(feeder(0.5), snap, false).gateDial.effective).toBe(0.6);
  });

  it("in Build mode shows a valve or drum feeder gate at its starting position, not where the last run left it", () => {
    const snap = new Map([["v", { openness: 0.3 }], ["f", { gateDial: { effective: 0.6 } }]]);
    expect(resolveDynamic(valve(0), snap, true)).toMatchObject({ openness: 0, easePosition: true });
    expect(resolveDynamic(feeder(0.25), snap, true)).toMatchObject({ gateDial: { effective: 0.25 }, easePosition: true });
  });

  it("in Build mode shows a valve with no starting position fully open", () => {
    expect(resolveDynamic(valve(), new Map(), true).openness).toBe(1);
  });

  it("in Build mode draws a just-placed elevator or pendulum conveyor empty, as a run leaves it", () => {
    const elevator = { id: "e", sim: { kind: "transportDelay" } };
    const pendulum = { id: "p", sim: { kind: "routedTransportDelay" } };
    expect(resolveDynamic(elevator, new Map(), true).densityProfile).toEqual([0]);
    expect(resolveDynamic(pendulum, new Map(), true).densityProfile).toEqual([0]);
    const run = new Map([["e", { densityProfile: [0, 0.5] }]]);
    expect(resolveDynamic(elevator, run, true).densityProfile).toEqual([0, 0.5]);
  });

  it("falls back to the authored fill where the sim has published nothing", () => {
    expect(resolveDynamic(bin, new Map(), false).fill).toBe(0.4);
    expect(resolveDynamic(bin, new Map([["b", { fill: 0.7 }]]), false).fill).toBe(0.7);
  });
});

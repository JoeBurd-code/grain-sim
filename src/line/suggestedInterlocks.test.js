import { describe, it, expect } from "vitest";
import { binFeederTestLine } from "./testLines";
import { connectPorts, disconnectConnection } from "./connecting";
import { suggestedInterlocks } from "./suggestedInterlocks";
import { removeInterlock, setSentenceField, setSentenceReset } from "./sentenceEditor";
import { validateLine } from "./validateLine";
import { createSim, stepSim, getMachineState, DT } from "../sim/engine";

// binFeederTestLine without the grain-in -> bin connection, so a test can
// make it.
function unconnected() {
  const line = binFeederTestLine();
  line.connections = line.connections.filter((c) => c.to.machine !== "bin");
  return line;
}
const grainToBin = [{ machine: "grainIn", port: "out" }, { machine: "bin", port: "in" }];
const connect = (line) => {
  const result = connectPorts(line, ...grainToBin);
  expect(result.ok).toBe(true);
  return result.line;
};
const ID = "suggested-high-bin-grainIn";

describe("suggested interlocks (issue #93)", () => {
  it("connecting a feeder to a bin adds the latched high-level interlock, marked suggested", () => {
    const line = connect(unconnected());
    expect(line.interlocks).toEqual([{
      id: ID, kind: "sentence", suggested: true,
      when: { machine: "bin", condition: "above", setpoint: 0.85, delaySec: 5 },
      then: [{ action: "close", machine: "grainIn" }],
      reset: "latched",
    }]);
    expect(validateLine(line).ok).toBe(true);
  });

  it("proposes nothing for a connection into a machine without a level", () => {
    // feeder -> diverter is already connected; the diverter has no level.
    expect(suggestedInterlocks(unconnected()).map((r) => r.id)).toEqual([]);
  });

  it("a changed suggestion loses its mark and keeps the change after more connects", () => {
    let line = connect(unconnected());
    line = setSentenceField(line, ID, "when", "setpoint", 0.7).line;
    expect(line.interlocks[0].suggested).toBeUndefined();
    line.connections = line.connections.filter((c) => c.to.machine !== "bin");
    line = connect(line);
    expect(line.interlocks).toHaveLength(1);
    expect(line.interlocks[0].when.setpoint).toBe(0.7);
  });

  it("an edit that changes nothing keeps the mark", () => {
    const line = setSentenceReset(connect(unconnected()), ID, "latched").line;
    expect(line.interlocks[0].suggested).toBe(true);
  });

  it("a deleted suggestion does not come back", () => {
    let line = removeInterlock(connect(unconnected()), ID).line;
    expect(line.dismissedSuggestions).toEqual([ID]);
    line.connections = line.connections.filter((c) => c.to.machine !== "bin");
    line = connect(line);
    expect(line.interlocks).toEqual([]);
  });

  it("deleting the user's own interlock records nothing", () => {
    const line = { ...unconnected(), interlocks: [{ id: "mine", kind: "sentence", when: { machine: null, condition: null }, then: [], reset: "auto" }] };
    expect(removeInterlock(line, "mine").line.dismissedSuggestions).toBeUndefined();
  });

  it("disconnecting removes an unchanged suggestion, and keeps a changed one", () => {
    const from = { machine: "grainIn", port: "out" };
    const line = connect(unconnected());
    expect(disconnectConnection(line, from).line.interlocks).toEqual([]);
    const changed = setSentenceField(line, ID, "when", "delaySec", 9).line;
    expect(disconnectConnection(changed, from).line.interlocks.map((r) => r.id)).toEqual([ID]);
  });

  it("is not added where another interlock already does the job", () => {
    const line = unconnected();
    line.interlocks = [{
      id: "own", kind: "sentence",
      when: { machine: "bin", condition: "above", setpoint: 0.9, delaySec: 2 },
      then: [{ action: "stop", machine: "grainIn" }], reset: "auto",
    }];
    expect(connect(line).interlocks.map((r) => r.id)).toEqual(["own"]);
  });

  it("engine: a line built by connects, with only suggested interlocks, never fills a bin", () => {
    // grain in -> bin -> feeder -> bin 2 (no outlet). Grain in outruns the
    // feeder, and bin 2 only fills, so both bins would reach 100 % unheld.
    const base = binFeederTestLine();
    base.machines.push({
      ...base.machines.find((m) => m.id === "bin"), id: "bin2", name: "BIN 2", x: 600,
      ports: { inputs: ["in"], outputs: [] }, anchors: { in: { x: 20, y: 20 } }, sim: { kind: "accumulator", capacityM3: 0.5 },
    });
    const pairs = [
      ["grainIn", "out", "bin", "in"], ["bin", "out", "feeder", "in"], ["feeder", "out", "bin2", "in"],
    ];
    let line = { ...base, connections: [] };
    for (const [a, ap, b, bp] of pairs) line = connectPorts(line, { machine: a, port: ap }, { machine: b, port: bp }).line;
    expect(line.interlocks.map((r) => r.id)).toEqual([ID, "suggested-high-bin2-feeder"]);

    const run = (l) => {
      const sim = createSim(l);
      const peak = { bin: 0, bin2: 0 };
      for (let i = 0; i < (20 * 60) / DT; i += 1) {
        stepSim(sim, DT);
        for (const id of ["bin", "bin2"]) {
          const s = getMachineState(sim, id);
          peak[id] = Math.max(peak[id], s.stored / s.capacity);
          expect(s.spill).toBe(0);
        }
      }
      return peak;
    };
    const held = run(line);
    expect(held.bin).toBeGreaterThan(0.85);
    expect(held.bin).toBeLessThan(0.95);
    expect(held.bin2).toBeGreaterThan(0.85);
    expect(held.bin2).toBeLessThan(0.95);
    const bare = run({ ...line, interlocks: [] });
    expect(bare.bin).toBeCloseTo(1);
    expect(bare.bin2).toBeCloseTo(1);
  });
});

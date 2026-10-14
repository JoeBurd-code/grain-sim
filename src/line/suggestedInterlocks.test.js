import { describe, it, expect } from "vitest";
import { binFeederTestLine } from "./testLines";
import { connectPorts, disconnectConnection } from "./connecting";
import { suggestedInterlocks, pendingSuggestions, acceptSuggestion, dismissSuggestion } from "./suggestedInterlocks";
import { removeInterlock } from "./sentenceEditor";
import { validateLine } from "./validateLine";
import { createSim, stepSim, getMachineState, DT } from "../sim/engine";

// binFeederTestLine without the grain-in -> bin connection, so a test can
// make it.
function unconnected() {
  const line = binFeederTestLine();
  line.connections = line.connections.filter((c) => c.to.machine !== "bin");
  return line;
}
const from = { machine: "grainIn", port: "out" };
const connect = (line) => {
  const result = connectPorts(line, from, { machine: "bin", port: "in" });
  expect(result.ok).toBe(true);
  return result.line;
};
const ID = "suggested-high-bin-grainIn";
const ok = (result) => {
  expect(result.ok).toBe(true);
  return result.line;
};

describe("suggested interlocks (issue #93)", () => {
  it("connecting a feeder to a bin proposes the latched high-level interlock, but adds nothing", () => {
    const line = connect(unconnected());
    expect(line.interlocks).toEqual([]);
    expect(pendingSuggestions(line)).toEqual([{
      id: ID, kind: "sentence",
      when: { machine: "bin", condition: "above", setpoint: 0.85, delaySec: 5 },
      then: [{ action: "close", machine: "grainIn" }],
      reset: "latched",
    }]);
  });

  it("proposes nothing for a connection into a machine without a level", () => {
    // feeder -> diverter is already connected; the diverter has no level.
    expect(suggestedInterlocks(unconnected())).toEqual([]);
  });

  it("the tick adds it as an ordinary interlock, and it is no longer pending", () => {
    const line = ok(acceptSuggestion(connect(unconnected()), ID));
    expect(line.interlocks.map((r) => r.id)).toEqual([ID]);
    expect(pendingSuggestions(line)).toEqual([]);
    expect(validateLine(line).ok).toBe(true);
  });

  it("the cross records it, and it does not come back after a reconnect", () => {
    let line = ok(dismissSuggestion(connect(unconnected()), ID));
    expect(line.dismissedSuggestions).toEqual([ID]);
    expect(line.interlocks).toEqual([]);
    line = connect(ok(disconnectConnection(line, from)));
    expect(pendingSuggestions(line)).toEqual([]);
  });

  it("refuses a suggestion that is not pending", () => {
    expect(acceptSuggestion(unconnected(), ID).ok).toBe(false);
    expect(dismissSuggestion(unconnected(), ID).ok).toBe(false);
  });

  it("disconnecting takes a pending suggestion away", () => {
    expect(pendingSuggestions(ok(disconnectConnection(connect(unconnected()), from)))).toEqual([]);
  });

  it("an accepted interlock the user deletes is proposed again", () => {
    const line = ok(removeInterlock(ok(acceptSuggestion(connect(unconnected()), ID)), ID));
    expect(pendingSuggestions(line).map((r) => r.id)).toEqual([ID]);
  });

  it("is not proposed where another interlock already does the job", () => {
    const line = unconnected();
    line.interlocks = [{
      id: "own", kind: "sentence",
      when: { machine: "bin", condition: "above", setpoint: 0.9, delaySec: 2 },
      then: [{ action: "stop", machine: "grainIn" }], reset: "auto",
    }];
    expect(pendingSuggestions(connect(line))).toEqual([]);
  });

  it("engine: a built line with only accepted suggestions never fills a bin", () => {
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
    for (const [a, ap, b, bp] of pairs) line = ok(connectPorts(line, { machine: a, port: ap }, { machine: b, port: bp }));
    expect(line.interlocks).toEqual([]);
    for (const { id } of pendingSuggestions(line)) line = ok(acceptSuggestion(line, id));
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

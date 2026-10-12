// Small lines for tests that need a line other than the golden line (issue
// #81): built from plain data, with no reference to any golden line machine.

// Source -> bin -> Diverter -> two terminal sinks. The smallest line that
// has every kind of generated plant control: one Diverter selector and two
// EMPTY buttons.
export function diverterTestLine() {
  const machine = (id, name, sim, ports, x) => ({
    id, type: "bin", name, tag: `T.${id}`, status: "new", zone: "all",
    x, y: 0, w: 40, h: 40, ports,
    anchors: Object.fromEntries([...ports.inputs, ...ports.outputs].map((p) => [p, { x: 20, y: 20 }])),
    sim,
  });
  return {
    zones: [{ id: "all", name: "ALL" }],
    machines: [
      machine("grainIn", "GRAIN IN", { kind: "source", rateM3PerSec: 0.004 }, { inputs: [], outputs: ["out"] }, 0),
      machine("bin", "BIN", { kind: "accumulator", capacityM3: 1 }, { inputs: ["in"], outputs: ["out"] }, 100),
      machine("splitValve", "SPLIT VALVE", { kind: "router" }, { inputs: ["in"], outputs: ["left", "right"] }, 200),
      machine("sinkA", "BAY A", { kind: "terminalSink" }, { inputs: ["in"], outputs: [] }, 300),
      machine("sinkB", "BAY B", { kind: "terminalSink" }, { inputs: ["in"], outputs: [] }, 400),
    ],
    connections: [
      { from: { machine: "grainIn", port: "out" }, to: { machine: "bin", port: "in" }, kind: "product" },
      { from: { machine: "bin", port: "out" }, to: { machine: "splitValve", port: "in" }, kind: "product" },
      { from: { machine: "splitValve", port: "left" }, to: { machine: "sinkA", port: "in" }, kind: "product" },
      { from: { machine: "splitValve", port: "right" }, to: { machine: "sinkB", port: "in" }, kind: "product" },
    ],
    interlocks: [],
  };
}

// The diverter line with a metered feeder under the bin, so the bin holds a
// level instead of draining in one tick: grain in -> bin -> feeder ->
// diverter -> two bays (issue #85). No interlocks.
export function binFeederTestLine() {
  const line = diverterTestLine();
  line.machines.splice(2, 0, {
    id: "feeder", type: "feeder", name: "FEEDER", tag: "T.feeder", status: "new", zone: "all",
    x: 150, y: 0, w: 40, h: 40, ports: { inputs: ["in"], outputs: ["out"] },
    anchors: { in: { x: 20, y: 20 }, out: { x: 20, y: 20 } },
    sim: { kind: "meteredFeeder", rateM3PerSec: 0.003 },
  });
  line.connections[1] = { from: { machine: "bin", port: "out" }, to: { machine: "feeder", port: "in" }, kind: "product" };
  line.connections.splice(2, 0, { from: { machine: "feeder", port: "out" }, to: { machine: "splitValve", port: "in" }, kind: "product" });
  return line;
}

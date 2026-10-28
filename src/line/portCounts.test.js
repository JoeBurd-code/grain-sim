// Issue #152: a Custom conveyor or bucket elevator takes as many inlets and
// outlets as the user sets in Build mode.
import { describe, it, expect } from "vitest";
import { addMachine, emptyLine } from "./editing";
import { connectPorts } from "./connecting";
import { setAdjustableValue, adjustableFields } from "./adjustableFields";
import { flipMachine, anchorPoint } from "./layout";
import { reshapeElevator, INLET_INSET, PX_PER_M } from "./elevatorPath";
import { diffFromBase, applyChanges } from "./lineChanges";
import { exportLine, importLine } from "./lineDocument";
import { validateLine } from "./validateLine";
import { catalogueItem } from "../catalogue/catalogue";
import { createSim, stepSim, getMachineState, setSelection, DT } from "../sim/engine";
import { plantControlsFor } from "./plantControls";
import { assertConserved } from "../sim/conservation";

const byId = (line, id) => line.machines.find((m) => m.id === id);

function add(line, itemId, pos) {
  const result = addMachine(line, itemId, pos);
  expect(result.ok, result.error).toBe(true);
  return result;
}

function set(line, id, field, value) {
  const result = setAdjustableValue(line, id, field, value);
  expect(result.ok, result.error).toBe(true);
  return result.line;
}

function connect(line, a, b) {
  const result = connectPorts(line, a, b);
  expect(result.ok, result.error).toBe(true);
  return result.line;
}

function placed(itemId) {
  const { line, id } = add(emptyLine(), itemId, { x: 400, y: 400 });
  return { line, id };
}

describe("the port count fields", () => {
  it("are on the Custom conveyor and Custom bucket elevator, from 1 to 6, 1 by default", () => {
    for (const itemId of ["custom-conveyor", "custom-bucket-elevator"]) {
      const fields = adjustableFields(catalogueItem(itemId).machine);
      for (const id of ["inputs", "outputs"]) {
        expect(fields.find((f) => f.id === id), `${itemId} ${id}`).toMatchObject({ min: 1, max: 6, default: 1, integer: true });
      }
    }
  });

  it("are not on a real machine", () => {
    for (const itemId of ["belt-conveyor", "bucket-elevator", "pendulum-conveyor"]) {
      const ids = adjustableFields(catalogueItem(itemId).machine).map((f) => f.id);
      expect(ids, itemId).not.toContain("inputs");
      expect(ids, itemId).not.toContain("outputs");
    }
  });

  it("refuse a count that is not a whole number", () => {
    const { line, id } = placed("custom-conveyor");
    const result = setAdjustableValue(line, id, "outputs", 2.5);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/whole number/);
  });
});

describe("changing a count", () => {
  it("names the slots in1, in2, ... and out1, out2, ..., and one slot keeps its own name", () => {
    const { line, id } = placed("custom-conveyor");
    let next = set(line, id, "inputs", 3);
    next = set(next, id, "outputs", 2);
    expect(byId(next, id).ports).toEqual({ inputs: ["in1", "in2", "in3"], outputs: ["out1", "out2"] });
    next = set(set(next, id, "inputs", 1), id, "outputs", 1);
    expect(byId(next, id).ports).toEqual({ inputs: ["in"], outputs: ["out"] });
  });

  it("gives every port an anchor, and the line stays valid", () => {
    const { line, id } = placed("custom-bucket-elevator");
    const next = set(set(line, id, "inputs", 4), id, "outputs", 5);
    const m = byId(next, id);
    for (const p of [...m.ports.inputs, ...m.ports.outputs]) expect(m.anchors[p], p).toBeDefined();
    expect(Object.keys(m.anchors).sort()).toEqual([...m.ports.inputs, ...m.ports.outputs].sort());
    expect(validateLine(next).errors).toEqual([]);
  });

  it("keeps a connection on the port at the run's end, renamed with it", () => {
    let { line, id } = placed("custom-conveyor");
    const grainIn = add(line, "grain-in", { x: 0, y: 0 });
    line = connect(grainIn.line, { machine: grainIn.id, port: "out" }, { machine: id, port: "in" });
    line = set(line, id, "inputs", 3);
    expect(line.connections).toHaveLength(1);
    expect(line.connections[0].to).toEqual({ machine: id, port: "in3" });
    line = set(line, id, "inputs", 1);
    expect(line.connections[0].to).toEqual({ machine: id, port: "in" });
  });

  it("refuses to remove a port that has a connection, naming it", () => {
    let { line, id } = placed("custom-conveyor");
    const grainIn = add(line, "grain-in", { x: 0, y: 0 });
    line = set(grainIn.line, id, "inputs", 3);
    line = connect(line, { machine: grainIn.id, port: "out" }, { machine: id, port: "in1" });
    const result = setAdjustableValue(line, id, "inputs", 2);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("GRAIN IN 1");
    expect(result.error).toContain("in1");
    expect(result.line).toBeUndefined();
    expect(byId(line, id).ports.inputs).toEqual(["in1", "in2", "in3"]);
    expect(line.connections).toHaveLength(1);
  });

  // Issue #153: the same for outlets, with every connection in the way
  // named in one message, however far the count drops.
  it("refuses to remove outlets that have connections, naming each one", () => {
    let { line, id } = placed("custom-conveyor");
    line = set(line, id, "outputs", 4);
    for (const [i, port] of ["out1", "out2"].entries()) {
      const sink = add(line, "grain-out", { x: 200 * i, y: 800 });
      line = connect(sink.line, { machine: id, port }, { machine: sink.id, port: "in" });
    }
    const result = setAdjustableValue(line, id, "outputs", 1);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot drop to 1 output:/);
    expect(result.error).toContain("out1 to GRAIN OUT 1");
    expect(result.error).toContain("out2 to GRAIN OUT 2");
  });

  it("lets the user connect to and from every generated port", () => {
    let { line, id } = placed("custom-conveyor");
    line = set(set(line, id, "inputs", 2), id, "outputs", 3);
    const sources = [add(line, "grain-in", { x: 0, y: 0 })];
    sources.push(add(sources[0].line, "grain-in", { x: 100, y: 0 }));
    line = sources[1].line;
    line = connect(line, { machine: sources[0].id, port: "out" }, { machine: id, port: "in1" });
    line = connect(line, { machine: sources[1].id, port: "out" }, { machine: id, port: "in2" });
    for (const [i, port] of ["out1", "out2", "out3"].entries()) {
      const sink = add(line, "grain-out", { x: 200 * i, y: 800 });
      line = connect(sink.line, { machine: id, port }, { machine: sink.id, port: "in" });
    }
    expect(line.connections).toHaveLength(5);
    expect(validateLine(line).errors).toEqual([]);
  });
});

// Issue #153: a saved line whose ports no longer carry its connections (a
// hand-edited file, a bad save) does not open with a connection to nothing.
describe("a connection on a port the machine no longer has", () => {
  it("stops the line opening, and the error names the connection", () => {
    let { line, id } = placed("custom-bucket-elevator");
    line = set(line, id, "outputs", 3);
    const sink = add(line, "grain-out", { x: 0, y: 800 });
    line = connect(sink.line, { machine: id, port: "out1" }, { machine: sink.id, port: "in" });
    const doc = JSON.parse(exportLine(line, "ports"));
    byId(doc.line, id).ports.outputs = ["out"];
    const opened = importLine(JSON.stringify(doc));
    expect(opened.ok).toBe(false);
    expect(opened.errors).toContain(
      `connection from "${id}" port "out1" to "${sink.id}" port "in": machine "${id}" has no output port "out1"`
    );
  });
});

describe("a Custom conveyor's ports", () => {
  it("are where today's single ports are with one of each", () => {
    const { line, id } = placed("custom-conveyor");
    const m = byId(line, id);
    expect(m.anchors).toEqual({ in: { x: 0, y: 13 }, out: { x: m.w, y: 13 } });
    expect(m.sim.portDistanceM).toBeUndefined();
  });

  it("spread inlets along the infeed half and outlets along the discharge half, the last at each end", () => {
    const { line, id } = placed("custom-conveyor");
    const m = byId(set(set(line, id, "inputs", 2), id, "outputs", 2), id);
    const L = m.sim.distanceM;
    expect(m.anchors.in2).toEqual({ x: 0, y: 13 });
    expect(m.anchors.out2).toEqual({ x: m.w, y: 13 });
    expect(m.anchors.in1).toEqual({ x: m.w / 4, y: 0 });
    expect(m.anchors.out1).toEqual({ x: (3 * m.w) / 4, y: m.h });
    expect(m.sim.portDistanceM).toEqual({ in1: L / 4, in2: 0, out1: (3 * L) / 4, out2: L });
  });

  it("move with the conveyor's length", () => {
    const { line, id } = placed("custom-conveyor");
    const m = byId(set(set(set(line, id, "outputs", 2), id, "inputs", 2), id, "length", 20), id);
    expect(m.anchors.out1.x).toBeCloseTo((3 * m.w) / 4, 9);
    expect(m.anchors.out2.x).toBeCloseTo(m.w, 9);
    expect(m.sim.portDistanceM.out1).toBeCloseTo(15, 9);
    expect(m.sim.portDistanceM.in1).toBeCloseTo(5, 9);
  });
});

describe("a Custom bucket elevator's ports", () => {
  // Floor run 2 m, column 6 m, head run 3 m.
  function roomy(inputs, outputs) {
    const { line, id } = placed("custom-bucket-elevator");
    let next = set(line, id, "pathLength", 11);
    const shaped = reshapeElevator(next, id, { floor: 2, column: 6, head: 3 });
    expect(shaped.ok, shaped.error).toBe(true);
    next = set(set(shaped.line, id, "inputs", inputs), id, "outputs", outputs);
    return { line: next, id, m: byId(next, id) };
  }

  it("space the inlets along the floor run and the outlets along the head run, the last at each run's end", () => {
    const { m } = roomy(2, 3);
    const { colX, duct } = m.geom;
    const inletY = m.h - duct;
    expect(m.anchors.in2).toEqual({ x: INLET_INSET, y: inletY });
    expect(m.anchors.in1.x).toBeCloseTo(INLET_INSET + 1 * PX_PER_M, 9);
    expect(m.anchors.in1.y).toBe(inletY);
    const headStart = colX + duct;
    const outY = m.anchors.out3.y;
    expect(m.anchors.out1.x).toBeCloseTo(headStart + 1 * PX_PER_M, 9);
    expect(m.anchors.out2.x).toBeCloseTo(headStart + 2 * PX_PER_M, 9);
    expect(m.anchors.out3.x).toBeCloseTo(headStart + 3 * PX_PER_M, 9);
    expect(m.anchors.out1.y).toBe(outY);
  });

  it("each carry their own distance along the path", () => {
    const { m } = roomy(2, 3);
    expect(m.sim.portDistanceM).toEqual({ in1: 1, in2: 0, out1: 9, out2: 10, out3: 11 });
  });

  it("with one of each, sit and time exactly as before", () => {
    const { line, id } = placed("custom-bucket-elevator");
    const real = placed("bucket-elevator");
    expect(byId(line, id).anchors).toEqual(byId(real.line, real.id).anchors);
    expect(byId(line, id).sim.portDistanceM).toBeUndefined();
  });

  it("follow the runs when the elevator is reshaped or its path length changes", () => {
    const { line, id } = roomy(2, 2);
    const reshaped = reshapeElevator(line, id, { floor: 4, column: 5, head: 2 });
    expect(reshaped.ok, reshaped.error).toBe(true);
    let m = byId(reshaped.line, id);
    expect(m.sim.portDistanceM).toEqual({ in1: 2, in2: 0, out1: 10, out2: 11 });
    expect(m.anchors.in1.x).toBeCloseTo(INLET_INSET + 2 * PX_PER_M, 9);
    expect(m.anchors.out2.x).toBeCloseTo(m.geom.colX + m.geom.duct + 2 * PX_PER_M, 9);
    m = byId(set(reshaped.line, id, "pathLength", 13), id);
    expect(m.sim.portDistanceM).toEqual({ in1: 2, in2: 0, out1: 12, out2: 13 });
  });

  it("mirror on a flipped elevator", () => {
    const { line, id, m } = roomy(2, 3);
    const flipped = byId(flipMachine(line, id).line, id);
    for (const p of [...m.ports.inputs, ...m.ports.outputs]) {
      expect(anchorPoint(flipped, p).x, p).toBeCloseTo(m.w - m.anchors[p].x, 9);
      expect(anchorPoint(flipped, p).y, p).toBe(m.anchors[p].y);
    }
  });

  it("keep their anchors in the unflipped shape when the count changes on a flipped elevator", () => {
    const { line, id } = roomy(1, 1);
    const flipped = flipMachine(line, id).line;
    const m = byId(set(flipped, id, "outputs", 3), id);
    const plain = byId(set(line, id, "outputs", 3), id);
    expect(m.flipped).toBe(true);
    expect(m.anchors).toEqual(plain.anchors);
  });
});

describe("running a machine with several ports", () => {
  function run(sim, seconds) {
    for (let i = 0; i < Math.round(seconds / DT); i++) stepSim(sim, DT);
  }

  // A Custom elevator with floor 2 m, column 6 m and head 3 m, fed at one
  // inlet, discharging to one grain out per outlet.
  function elevatorLine(inletPort) {
    let { line, id } = placed("custom-bucket-elevator");
    line = set(line, id, "pathLength", 11);
    const shaped = reshapeElevator(line, id, { floor: 2, column: 6, head: 3 });
    expect(shaped.ok, shaped.error).toBe(true);
    line = set(set(shaped.line, id, "inputs", 2), id, "outputs", 3);
    const grainIn = add(line, "grain-in", { x: 0, y: 0 });
    line = connect(grainIn.line, { machine: grainIn.id, port: "out" }, { machine: id, port: inletPort });
    const sinks = [];
    for (const [i, port] of ["out1", "out2", "out3"].entries()) {
      const sink = add(line, "grain-out", { x: 1200 + 100 * i, y: 0 });
      line = connect(sink.line, { machine: id, port }, { machine: sink.id, port: "in" });
      sinks.push(sink.id);
    }
    return { line, id, sinks };
  }

  // The first time grain reaches `sinkId`, in seconds.
  function arrival(line, sinkId, select) {
    const sim = createSim(line);
    if (select) select(sim);
    for (let t = 0; t < 600; t += DT) {
      stepSim(sim, DT);
      if (getMachineState(sim, sinkId).total > 0) return sim.t;
    }
    return Infinity;
  }

  it("delivers grain from a nearer inlet sooner", () => {
    const far = elevatorLine("in2");
    const near = elevatorLine("in1");
    const tFar = arrival(far.line, far.sinks[2], (sim) => setSelection(sim, far.id, "out3"));
    const tNear = arrival(near.line, near.sinks[2], (sim) => setSelection(sim, near.id, "out3"));
    const speed = byId(far.line, far.id).sim.speedMPerMin / 60;
    expect(tFar).toBeGreaterThan(tNear);
    expect(tFar - tNear).toBeCloseTo(1 / speed, 0);
  });

  it("sends grain out of the selected outlet only, sooner from a nearer one", () => {
    const { line, id, sinks } = elevatorLine("in2");
    const selector = plantControlsFor(line).selectors.find((s) => s.id === id);
    expect(selector.options.map((o) => o.id)).toEqual(["out1", "out2", "out3"]);
    const t1 = arrival(line, sinks[0], (sim) => setSelection(sim, id, "out1"));
    const t3 = arrival(line, sinks[2], (sim) => setSelection(sim, id, "out3"));
    expect(t1).toBeLessThan(t3);
    const sim = createSim(line);
    setSelection(sim, id, "out2");
    run(sim, 120);
    expect(getMachineState(sim, sinks[0]).total).toBe(0);
    expect(getMachineState(sim, sinks[1]).total).toBeGreaterThan(0);
    expect(getMachineState(sim, sinks[2]).total).toBe(0);
  });

  // Two feeders that together bring more than the elevator can take: what
  // it cannot take stays upstream, rather than vanishing between them.
  it("loses no grain when two inlets together bring more than it can take", () => {
    const { line, id } = elevatorLine("in2");
    const second = add(line, "grain-in", { x: 100, y: 0 });
    const both = connect(second.line, { machine: second.id, port: "out" }, { machine: id, port: "in1" });
    const sim = createSim(both);
    run(sim, 30);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  // Overfed at the infeed, the chain only found out at its head minutes
  // later, and then shut the infeed until the whole chain had drained.
  it("takes no more than its rated capacity from two inlets, so it never backs up with room downstream", () => {
    const { line, id } = elevatorLine("in2");
    const second = add(line, "grain-in", { x: 100, y: 0 });
    const both = connect(second.line, { machine: second.id, port: "out" }, { machine: id, port: "in1" });
    const sim = createSim(both);
    const { ceilingM3PerSec } = byId(both, id).sim;
    let maxBacklog = 0;
    for (let i = 0; i < Math.round(300 / DT); i++) {
      if (i === Math.round(150 / DT)) setSelection(sim, id, "out2");
      stepSim(sim, DT);
      maxBacklog = Math.max(maxBacklog, getMachineState(sim, id).backlog);
    }
    expect(maxBacklog).toBeLessThan(ceilingM3PerSec * DT * 2);
    const fed = both.machines.filter((m) => m.sim.kind === "source").reduce((a, m) => a + getMachineState(sim, m.id).fed, 0);
    expect(fed / 300).toBeCloseTo(ceilingM3PerSec, 3);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  // A full bin jams the elevator, and the jam holds until another outlet
  // is selected; the grain waiting on the chain then fills that bin.
  it("stays jammed on a full bin until another outlet is selected, then fills that one", () => {
    let { line, id } = placed("custom-bucket-elevator");
    line = set(line, id, "outputs", 2);
    const grainIn = add(line, "grain-in", { x: 0, y: 0 });
    line = connect(grainIn.line, { machine: grainIn.id, port: "out" }, { machine: id, port: "in" });
    const bins = [];
    for (const [i, port] of ["out1", "out2"].entries()) {
      const bin = add(line, "custom-bin", { x: 1200 + 200 * i, y: 0 });
      line = connect(bin.line, { machine: id, port }, { machine: bin.id, port: "in" });
      bins.push(bin.id);
    }
    const sim = createSim(line);
    setSelection(sim, id, "out1");
    const { capacity } = getMachineState(sim, bins[0]);
    run(sim, 500);
    expect(getMachineState(sim, bins[0]).stored).toBeGreaterThan(capacity * 0.99);
    expect(sim.machines.get(id).jammed).toBe(true);
    const fedBefore = getMachineState(sim, grainIn.id).fed;
    run(sim, 60);
    expect(getMachineState(sim, grainIn.id).fed).toBeCloseTo(fedBefore, 9);
    expect(getMachineState(sim, bins[1]).stored).toBe(0);

    setSelection(sim, id, "out2");
    run(sim, 300);
    expect(sim.machines.get(id).jammed).toBe(false);
    expect(getMachineState(sim, bins[1]).stored).toBeGreaterThan(1);
    expect(getMachineState(sim, grainIn.id).fed).toBeGreaterThan(fedBefore + 1);
    expect(() => assertConserved(sim)).not.toThrow();
  });

  it("gives a machine with one outlet no selector", () => {
    const { line } = placed("custom-conveyor");
    expect(plantControlsFor(line).selectors).toEqual([]);
  });
});

describe("saving a machine's port counts", () => {
  function wired() {
    let { line, id } = placed("custom-bucket-elevator");
    line = set(set(line, id, "inputs", 3), id, "outputs", 2);
    const grainIn = add(line, "grain-in", { x: 0, y: 0 });
    line = connect(grainIn.line, { machine: grainIn.id, port: "out" }, { machine: id, port: "in2" });
    const sink = add(line, "grain-out", { x: 1200, y: 0 });
    line = connect(sink.line, { machine: id, port: "out1" }, { machine: sink.id, port: "in" });
    return { line, id };
  }

  it("round-trips through SAVE and OPEN", () => {
    const { line, id } = wired();
    const opened = importLine(exportLine(line, "ports"));
    expect(opened.ok, opened.error).toBe(true);
    expect(byId(opened.line, id).ports).toEqual(byId(line, id).ports);
    expect(byId(opened.line, id).anchors).toEqual(byId(line, id).anchors);
    expect(byId(opened.line, id).sim.portDistanceM).toEqual(byId(line, id).sim.portDistanceM);
    expect(opened.line.connections).toEqual(line.connections);
  });

  it("round-trips as changes to a base line", () => {
    const { line, id } = wired();
    const base = emptyLine();
    const again = applyChanges(base, diffFromBase(base, line));
    expect(byId(again, id).ports).toEqual(byId(line, id).ports);
    expect(again.connections.map((c) => [c.from, c.to])).toEqual(line.connections.map((c) => [c.from, c.to]));
  });

  it("round-trips a count changed on a machine the base already has", () => {
    const { line: base, id } = placed("custom-conveyor");
    const grainIn = add(base, "grain-in", { x: 0, y: 0 });
    const baseLine = connect(grainIn.line, { machine: grainIn.id, port: "out" }, { machine: id, port: "in" });
    const line = set(set(baseLine, id, "inputs", 2), id, "outputs", 3);
    const again = applyChanges(baseLine, diffFromBase(baseLine, line));
    expect(byId(again, id).ports).toEqual(byId(line, id).ports);
    expect(again.connections).toEqual(line.connections);
    expect(diffFromBase(line, again)).toEqual([]);
  });
});

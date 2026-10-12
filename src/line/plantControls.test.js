// Issue #81: the plant control panel is a pure function of the line
// document. A plain line gets one selector for each Diverter and one EMPTY
// button for each terminal sink. A line can declare selectors that command
// several machines in lockstep (the golden line's SOURCE and DESTINATION);
// those replace the plain Diverter selectors they wrap.
import { describe, it, expect } from "vitest";
import { plantControlsFor, plantControlErrors } from "./plantControls";
import { goldenLine } from "./goldenLine";
import { diverterTestLine } from "./testLines";
import { validateLine } from "./validateLine";

// What the panel shows: section titles and button labels, in order.
function panelText(controls) {
  return [
    ...controls.selectors.map((s) => ({
      section: s.label,
      buttons: s.options.map((o) => o.label),
      emptyWhenSelected: Object.fromEntries(s.options.filter((o) => o.empty).map((o) => [o.label, o.empty.label])),
    })),
    ...controls.emptyButtons.map((b) => ({ section: b.section, buttons: [b.label] })),
  ];
}

describe("plantControlsFor on a plain line", () => {
  it("gives one selector for the Diverter, named after it, listing the machines its outputs feed", () => {
    const controls = plantControlsFor(diverterTestLine());
    expect(controls.selectors).toHaveLength(1);
    const [selector] = controls.selectors;
    expect(selector.label).toBe("SPLIT VALVE");
    expect(selector.options.map((o) => o.label)).toEqual(["BAY A", "BAY B"]);
    expect(selector.options.map((o) => o.commands)).toEqual([
      [{ machine: "splitValve", port: "left" }],
      [{ machine: "splitValve", port: "right" }],
    ]);
  });

  it("gives one EMPTY button for each terminal sink", () => {
    const controls = plantControlsFor(diverterTestLine());
    expect(controls.emptyButtons).toEqual([
      { id: "sinkA", section: "BAY A", label: "EMPTY", machines: ["sinkA"] },
      { id: "sinkB", section: "BAY B", label: "EMPTY", machines: ["sinkB"] },
    ]);
  });

  it("labels an output with nothing connected by its port name", () => {
    const line = diverterTestLine();
    line.connections = line.connections.filter((c) => c.to.machine !== "sinkB");
    expect(plantControlsFor(line).selectors[0].options.map((o) => o.label)).toEqual(["BAY A", "right"]);
  });

  it("gives a line with no Diverter and no terminal sink no selectors and no EMPTY buttons", () => {
    const line = diverterTestLine();
    line.machines = line.machines.filter((m) => m.id === "grainIn" || m.id === "bin");
    line.connections = line.connections.slice(0, 1);
    expect(plantControlsFor(line)).toEqual({ selectors: [], emptyButtons: [] });
  });
});

describe("plantControlsFor on the golden line", () => {
  // Today's hand-written panel (PlantControls.jsx before issue #81). The
  // SAFETY and DANGER sections are on every line and are not part of the
  // generated model.
  it("has the same sections, buttons and labels as the hand-written panel", () => {
    expect(panelText(plantControlsFor(goldenLine))).toEqual([
      { section: "SOURCE", buttons: ["TREATING LINE", "PRO BOX"], emptyWhenSelected: {} },
      {
        section: "DESTINATION",
        buttons: ["CONCETTI", "FLEXICON", "METAL BIN 1", "METAL BIN 2"],
        emptyWhenSelected: { "METAL BIN 1": "EMPTY BIN", "METAL BIN 2": "EMPTY BIN" },
      },
      { section: "DISCARD BIN", buttons: ["EMPTY DISCARD BIN"] },
    ]);
  });

  it("drives the same machines as the hand-written SOURCE and DESTINATION", () => {
    const controls = plantControlsFor(goldenLine);
    const commandsOf = (selectorId) => Object.fromEntries(
      controls.selectors.find((s) => s.id === selectorId).options.map((o) => [o.id, o.commands])
    );
    // engine.js before issue #81: PACKAGING_FEEDERS and DESTINATIONS.
    expect(commandsOf("source")).toEqual({
      treatingLine: [{ machine: "inletDrumFeeder2", enabled: true }, { machine: "inletDrumFeeder1", enabled: false }],
      proBox: [{ machine: "inletDrumFeeder2", enabled: false }, { machine: "inletDrumFeeder1", enabled: true }],
    });
    expect(commandsOf("destination")).toEqual({
      concetti: [{ machine: "pendulumConveyor", port: "outConcetti" }],
      flexicon: [{ machine: "pendulumConveyor", port: "outBinSeg" }],
      metalBin1: [{ machine: "pendulumConveyor", port: "outBuffer" }, { machine: "outloadDiverter", port: "out1" }],
      metalBin2: [{ machine: "pendulumConveyor", port: "outBuffer" }, { machine: "outloadDiverter", port: "out2" }],
    });
  });

  it("empties the same machines as the hand-written EMPTY BIN and EMPTY DISCARD BIN", () => {
    const controls = plantControlsFor(goldenLine);
    const destination = controls.selectors.find((s) => s.id === "destination");
    expect(destination.options.find((o) => o.id === "metalBin1").empty.machines).toEqual(["metalBin1"]);
    expect(destination.options.find((o) => o.id === "metalBin2").empty.machines).toEqual(["metalBin2"]);
    expect(controls.emptyButtons[0].machines).toEqual(["discardBin", "metalBin1", "metalBin2"]);
  });
});

describe("plantControlErrors", () => {
  it("finds no errors on the golden line or the plain test line", () => {
    expect(plantControlErrors(goldenLine)).toEqual([]);
    expect(plantControlErrors(diverterTestLine())).toEqual([]);
    expect(validateLine(diverterTestLine())).toEqual({ ok: true, errors: [] });
  });

  it("refuses a declared selector that commands a machine the line does not have", () => {
    const line = diverterTestLine();
    line.plantControls = {
      selectors: [{ id: "route", label: "ROUTE", options: [{ id: "a", label: "A", commands: [{ machine: "ghost", port: "left" }] }] }],
    };
    expect(plantControlErrors(line)).toEqual([`plant control "route" option "a" commands unknown machine "ghost"`]);
    expect(validateLine(line).ok).toBe(false);
  });

  it("refuses a port the machine does not have, and a port on a machine that is not a Diverter", () => {
    const line = diverterTestLine();
    line.plantControls = {
      selectors: [{
        id: "route", label: "ROUTE", options: [
          { id: "a", label: "A", commands: [{ machine: "splitValve", port: "middle" }] },
          { id: "b", label: "B", commands: [{ machine: "bin", port: "out" }] },
        ],
      }],
    };
    expect(plantControlErrors(line)).toEqual([
      `plant control "route" option "a" selects unknown output port "middle" on machine "splitValve"`,
      `plant control "route" option "b" selects a port on machine "bin", which is not a Diverter`,
    ]);
  });

  it("refuses an on/off command on a machine that cannot be switched, and an EMPTY on one that cannot be emptied", () => {
    const line = diverterTestLine();
    line.plantControls = {
      selectors: [{ id: "route", label: "ROUTE", options: [{ id: "a", label: "A", commands: [{ machine: "bin", enabled: true }] }] }],
      emptyButtons: [{ id: "e", section: "E", label: "EMPTY", machines: ["splitValve"] }],
    };
    expect(plantControlErrors(line)).toEqual([
      `plant control "route" option "a" switches machine "bin" on or off, which it cannot be`,
      `plant control "e" empties machine "splitValve", which holds no grain to empty`,
    ]);
  });
});

// Issue #81: the golden line's generated plant control panel renders exactly
// as the hand-written panel did. goldenPlantPanel.fixture.json holds the
// markup the hand-written PlantControls.jsx rendered (captured before #81)
// for every state that changes how the panel looks.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PlantControls from "./PlantControls";
import { plantControlsFor } from "../line/plantControls";
import { goldenLine } from "../line/goldenLine";
import { diverterTestLine } from "../line/testLines";
import fixture from "./goldenPlantPanel.fixture.json";

const noop = () => {};

function render(controls, props) {
  return renderToStaticMarkup(
    <PlantControls
      controls={controls} onSelect={noop} onEmpty={noop}
      onResetTrips={noop} onControlledStop={noop} onResumeLine={noop} onSetUtilitiesHealthy={noop} onClearPlant={noop}
      {...props}
    />
  );
}

describe("the golden line's generated plant control panel", () => {
  it("covers every captured state (guard)", () => {
    expect(fixture.length).toBe(12);
    expect(new Set(fixture.map((f) => f.html)).size).toBeGreaterThan(8);
  });

  for (const { state, html } of fixture) {
    it(`matches the hand-written panel for ${JSON.stringify(state)}`, () => {
      const { source, destination, ...rest } = state;
      expect(render(plantControlsFor(goldenLine), { ...rest, selections: { source, destination } })).toBe(html);
    });
  }
});

describe("a plain line's generated plant control panel", () => {
  it("shows its Diverter selector, its two EMPTY buttons and the line-wide controls", () => {
    const html = render(plantControlsFor(diverterTestLine()), {
      selections: { splitValve: "left" }, controlledStopPhase: "running",
      utilitiesHealthy: true, utilitiesTripPhase: "running", anyTripLatched: false,
    });
    const text = html.replace(/<[^>]+>/g, "|").split("|").filter(Boolean);
    expect(text).toEqual([
      "SPLIT VALVE", "BAY A", "BAY B",
      "BAY A", "EMPTY",
      "BAY B", "EMPTY",
      "SAFETY", "⏻ CONTROLLED STOP", "⚠ RESET TRIPS", "⚡ TRIP UTILITIES",
      "DANGER", "CLEAR PLANT",
    ]);
  });
});

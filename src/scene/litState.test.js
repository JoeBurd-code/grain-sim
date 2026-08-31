import { describe, it, expect } from "vitest";
import { treaterVisualState, vibratoryFlowing } from "./litState";

describe("treaterVisualState", () => {
  it("reads boot state (charging, fill 0 — nothing has ever flowed) as neither cycling nor mixing", () => {
    expect(treaterVisualState("charging", 0)).toEqual({ cycling: false, mixing: false });
  });

  it("reads charging with a real charge accumulating as cycling but not mixing", () => {
    expect(treaterVisualState("charging", 0.4)).toEqual({ cycling: true, mixing: false });
  });

  it("reads holding as cycling and mixing", () => {
    expect(treaterVisualState("holding", 1)).toEqual({ cycling: true, mixing: true });
  });

  it("reads discharging as cycling but not mixing", () => {
    expect(treaterVisualState("discharging", 1)).toEqual({ cycling: true, mixing: false });
  });

  it("reads waiting (starved by the pre-bin) as neither cycling nor mixing", () => {
    expect(treaterVisualState("waiting", 0)).toEqual({ cycling: false, mixing: false });
  });

  it("reads stopped (utilities trip) as neither cycling nor mixing, even mid-charge", () => {
    expect(treaterVisualState("stopped", 0.7)).toEqual({ cycling: false, mixing: false });
  });

  it("reads an undefined phase (sim not yet primed) as neither cycling nor mixing", () => {
    expect(treaterVisualState(undefined, 0)).toEqual({ cycling: false, mixing: false });
  });
});

describe("vibratoryFlowing", () => {
  it("is true for a genuine positive flow rate", () => {
    expect(vibratoryFlowing({ flowRateM3PerSec: 0.0023 })).toBe(true);
  });

  it("is false for exactly zero", () => {
    expect(vibratoryFlowing({ flowRateM3PerSec: 0 })).toBe(false);
  });

  it("is false when flowRateM3PerSec is undefined", () => {
    expect(vibratoryFlowing({ flowRateM3PerSec: undefined })).toBe(false);
  });

  it("is false when dynamic itself is undefined (machine not yet reached by the sim)", () => {
    expect(vibratoryFlowing(undefined)).toBe(false);
  });

  it("is false for floating-point residue below the flow threshold", () => {
    expect(vibratoryFlowing({ flowRateM3PerSec: 1e-9 })).toBe(false);
  });
});

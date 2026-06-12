import { describe, it, expect } from "vitest";
import { validateLine } from "./validateLine";
import { line } from "./lineData";

describe("authored Treater Line 2 data", () => {
  it("passes validation", () => {
    const result = validateLine(line);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("covers all three zones", () => {
    const zonesUsed = new Set(line.machines.map((m) => m.zone));
    expect(zonesUsed).toEqual(new Set(["treating", "packaging", "bagging"]));
  });
});

// Issue #75: a line as a document — the JSON a user SAVEs and OPENs. The
// golden line (lineData.js) must survive a round trip exactly, minus its
// provenance labels, which stay in the hand-written source only.
import { describe, it, expect } from "vitest";
import { exportLine, importLine, LINE_FORMAT, LINE_FORMAT_VERSION } from "./lineDocument";
import { goldenLine, GOLDEN_LINE_NAME } from "./goldenLine";
import { line } from "./lineData";
import { createSim, stepSim, getMachineState, setDestination, DT } from "../sim/engine";

function hasKeyDeep(value, key) {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value && typeof value === "object") {
    return Object.keys(value).some((k) => k === key || hasKeyDeep(value[k], key));
  }
  return false;
}

// Path of the first difference between two plain values, or null when equal.
// Cheaper than JSON.stringify, which matters when it runs every step.
function firstDifference(a, b, path = "") {
  if (a === b) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return Number.isNaN(a) && Number.isNaN(b) ? null : path || "(root)";
  }
  if (a instanceof Map || b instanceof Map) {
    return firstDifference([...a], [...b], path);
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = firstDifference(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

function roundTrip(l) {
  const result = importLine(exportLine(l, "test"));
  expect(result.ok, result.error).toBe(true);
  return result.line;
}

describe("exportLine", () => {
  it("writes the format id, version and line name", () => {
    const doc = JSON.parse(exportLine(line, GOLDEN_LINE_NAME));
    expect(doc.format).toBe(LINE_FORMAT);
    expect(doc.formatVersion).toBe(LINE_FORMAT_VERSION);
    expect(doc.name).toBe(GOLDEN_LINE_NAME);
  });

  it("carries no provenance labels", () => {
    expect(hasKeyDeep(line, "provenance")).toBe(true); // guard: the source really has them
    const doc = JSON.parse(exportLine(line, GOLDEN_LINE_NAME));
    expect(hasKeyDeep(doc, "provenance")).toBe(false);
  });

  it("does not change the line it was given", () => {
    const before = JSON.stringify(line);
    exportLine(line, GOLDEN_LINE_NAME);
    expect(JSON.stringify(line)).toBe(before);
  });
});

describe("importLine", () => {
  it("reads back everything the golden line holds except provenance", () => {
    const expected = JSON.parse(JSON.stringify(line, (k, v) => (k === "provenance" ? undefined : v)));
    expect(roundTrip(line)).toEqual(expected);
  });

  it("returns the name stored in the file", () => {
    const result = importLine(exportLine(line, "my line"));
    expect(result.name).toBe("my line");
  });

  const bad = [
    ["malformed JSON", "{ not json"],
    ["a JSON value that is not an object", "42"],
    ["a different format", JSON.stringify({ format: "something-else", formatVersion: 1, name: "x", line: {} })],
    ["a newer format version", JSON.stringify({ format: LINE_FORMAT, formatVersion: LINE_FORMAT_VERSION + 1, name: "x", line: {} })],
    ["no line", JSON.stringify({ format: LINE_FORMAT, formatVersion: LINE_FORMAT_VERSION, name: "x" })],
    ["a line with no machines list", JSON.stringify({ format: LINE_FORMAT, formatVersion: LINE_FORMAT_VERSION, name: "x", line: { zones: [], connections: [] } })],
  ];
  for (const [label, text] of bad) {
    it(`refuses ${label} with a message and no line`, () => {
      const result = importLine(text);
      expect(result.ok).toBe(false);
      expect(result.line).toBeUndefined();
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    });
  }

  it("refuses a line that fails validation, listing the validation errors", () => {
    const doc = JSON.parse(exportLine(line, "x"));
    doc.line.machines[1].sim.kind = "teleporter";
    const result = importLine(JSON.stringify(doc));
    expect(result.ok).toBe(false);
    expect(result.line).toBeUndefined();
    expect(result.errors.some((e) => e.includes("teleporter"))).toBe(true);
  });
});

describe("golden line", () => {
  it("is the hand-written line loaded through the import path", () => {
    expect(goldenLine.machines.map((m) => m.id)).toEqual(line.machines.map((m) => m.id));
    expect(hasKeyDeep(goldenLine, "provenance")).toBe(false);
  });
});

describe("round trip runs identically in the engine", () => {
  it("matches the hand-written golden line on every machine at every step", () => {
    const original = createSim(line);
    const restored = createSim(roundTrip(line));
    const ids = [...original.machines.keys()];
    expect([...restored.machines.keys()]).toEqual(ids);

    const steps = (seconds) => Math.round(seconds / DT);
    let compared = 0;
    const run = (seconds) => {
      for (let i = 0; i < steps(seconds); i++) {
        stepSim(original, DT);
        stepSim(restored, DT);
        if (restored.t !== original.t) expect(restored.t).toBe(original.t);
        for (const id of ids) {
          const d = firstDifference(getMachineState(original, id), getMachineState(restored, id));
          if (d) expect(`${id}${d} at t=${original.t.toFixed(2)}`).toBe("no difference");
        }
        compared += 1;
      }
    };

    run(150);
    // Exercise a routed branch too, not only the default destination.
    setDestination(original, "flexicon");
    setDestination(restored, "flexicon");
    run(150);

    expect(compared).toBe(steps(150) * 2);
    // Guard: the run did real work. Grain passed through at least two bins,
    // so a value dropped from the export would have had a chance to show.
    const binsPassedThrough = ids.filter((id) => {
      const s = getMachineState(original, id);
      return s.kind === "accumulator" && s.discharged > 0.1;
    });
    expect(binsPassedThrough.length).toBeGreaterThanOrEqual(2);
  }, 30000); // ~7x the measured solo run: two whole-line sims for 300 simulated seconds
});

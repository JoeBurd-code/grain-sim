// Issue #157: the length a drag handle moves, traded between two segments.
import { describe, it, expect } from "vitest";
import { draggedLengths } from "./lengthHandles";

const MIN = { a: 0.5, b: 4 };
const opts = { pxPerM: 30, step: 0.1, min: MIN };
const along = (axis, px) => ({ x: axis === "x" ? px : 0, y: axis === "y" ? px : 0 });

describe("draggedLengths", () => {
  const handle = { axis: "x", sign: -1, grows: "a", takesFrom: "b" };

  it("lengthens one segment and shortens the other by the same amount", () => {
    const next = draggedLengths({ a: 1, b: 6 }, handle, along("x", -60), opts);
    expect(next.a).toBeCloseTo(3, 9);
    expect(next.b).toBeCloseTo(4, 9);
  });

  it("drags the other way to give the length back", () => {
    const next = draggedLengths({ a: 2, b: 6 }, handle, along("x", 30), opts);
    expect(next).toEqual({ a: 1, b: 7 });
  });

  it("ignores movement across its axis", () => {
    expect(draggedLengths({ a: 1, b: 6 }, handle, { x: 0, y: 200 }, opts)).toEqual({ a: 1, b: 6 });
  });

  it("stops where either segment reaches its minimum", () => {
    expect(draggedLengths({ a: 1, b: 6 }, handle, along("x", -3000), opts)).toEqual({ a: 3, b: 4 });
    expect(draggedLengths({ a: 1, b: 6 }, handle, along("x", 3000), opts)).toEqual({ a: 0.5, b: 6.5 });
  });

  it("moves in whole steps, without float noise", () => {
    const next = draggedLengths({ a: 0.5, b: 7.731 }, handle, along("x", -4), opts);
    expect(next).toEqual({ a: 0.6, b: 7.631 });
  });

  it("keeps segments it does not trade", () => {
    const next = draggedLengths({ a: 1, b: 6, c: 2 }, handle, along("x", -30), opts);
    expect(next.c).toBe(2);
  });

  it("lengthens alone, up to a maximum, when it takes from nothing", () => {
    const single = { axis: "x", sign: 1, grows: "a" };
    const limits = { ...opts, min: { a: 1 }, max: { a: 5 } };
    expect(draggedLengths({ a: 2 }, single, along("x", 30), limits)).toEqual({ a: 3 });
    expect(draggedLengths({ a: 2 }, single, along("x", 3000), limits)).toEqual({ a: 5 });
    expect(draggedLengths({ a: 2 }, single, along("x", -3000), limits)).toEqual({ a: 1 });
  });
});

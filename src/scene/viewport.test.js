import { describe, it, expect } from "vitest";
import { screenToWorld, worldToScreen, zoomAt, panBy, fitBounds } from "./viewport";

// A viewBox whose aspect matches the screen dims (the hook keeps it that way),
// so the SVG "meet" scaling is uniform and exact.
const vb = { x: -60, y: 20, w: 1000, h: 500 };
const dims = { width: 800, height: 400 };

describe("viewport coordinate math", () => {
  it("round-trips screen to world and back", () => {
    const screenPt = { x: 123, y: 321 };
    const world = screenToWorld(vb, dims, screenPt);
    const back = worldToScreen(vb, dims, world);
    expect(back.x).toBeCloseTo(screenPt.x, 6);
    expect(back.y).toBeCloseTo(screenPt.y, 6);
    // and a known point: screen origin maps to the viewBox origin
    const origin = screenToWorld(vb, dims, { x: 0, y: 0 });
    expect(origin).toEqual({ x: -60, y: 20 });
  });

  it("zoomAt keeps the world point under the cursor fixed", () => {
    const cursor = { x: 600, y: 100 };
    const before = screenToWorld(vb, dims, cursor);
    const zoomed = zoomAt(vb, dims, cursor, 1.5);
    const after = screenToWorld(zoomed, dims, cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    // factor > 1 zooms in: the visible world rect shrinks
    expect(zoomed.w).toBeCloseTo(vb.w / 1.5, 6);
    expect(zoomed.h).toBeCloseTo(vb.h / 1.5, 6);
  });

  it("panBy shifts the view opposite the drag, scaled to world units", () => {
    // dragging content right by 80 screen px moves the viewBox left
    const panned = panBy(vb, dims, { x: 80, y: -40 });
    const scale = vb.w / dims.width; // 1.25 world units per px
    expect(panned.x).toBeCloseTo(vb.x - 80 * scale, 6);
    expect(panned.y).toBeCloseTo(vb.y + 40 * scale, 6);
    expect(panned.w).toBe(vb.w);
    expect(panned.h).toBe(vb.h);
  });

  it("fitBounds frames the rect with padding, centred, matching container aspect", () => {
    const bounds = { x: 100, y: 200, w: 400, h: 100 }; // wide, flat rect
    const fitted = fitBounds(bounds, dims, 50);
    // matches the container aspect (2:1)
    expect(fitted.w / fitted.h).toBeCloseTo(dims.width / dims.height, 6);
    // contains the padded bounds
    expect(fitted.x).toBeLessThanOrEqual(bounds.x - 50);
    expect(fitted.y).toBeLessThanOrEqual(bounds.y - 50);
    expect(fitted.x + fitted.w).toBeGreaterThanOrEqual(bounds.x + bounds.w + 50);
    expect(fitted.y + fitted.h).toBeGreaterThanOrEqual(bounds.y + bounds.h + 50);
    // centred on the bounds centre
    expect(fitted.x + fitted.w / 2).toBeCloseTo(bounds.x + bounds.w / 2, 6);
    expect(fitted.y + fitted.h / 2).toBeCloseTo(bounds.y + bounds.h / 2, 6);
  });

  it("zoomAt clamps to the given viewBox width limits", () => {
    const limits = { minW: 250, maxW: 2000 };
    const cursor = { x: 400, y: 200 };
    // try to zoom in far past the limit: width stops at minW
    const zoomedIn = zoomAt(vb, dims, cursor, 100, limits);
    expect(zoomedIn.w).toBeCloseTo(limits.minW, 6);
    // try to zoom out far past the limit: width stops at maxW
    const zoomedOut = zoomAt(vb, dims, cursor, 0.01, limits);
    expect(zoomedOut.w).toBeCloseTo(limits.maxW, 6);
    // clamped zoom still keeps the cursor's world point fixed
    const before = screenToWorld(vb, dims, cursor);
    const after = screenToWorld(zoomedIn, dims, cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

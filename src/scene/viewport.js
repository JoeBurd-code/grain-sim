// Pure viewBox math for the pan/zoom SVG scene. The viewBox is a world-space
// rect { x, y, w, h }. The hook keeps its aspect equal to the container's, so
// SVG "meet" scaling is uniform: scale = w / width.

export function screenToWorld(vb, dims, pt) {
  const scale = vb.w / dims.width;
  return { x: vb.x + pt.x * scale, y: vb.y + pt.y * scale };
}

export function worldToScreen(vb, dims, pt) {
  const scale = vb.w / dims.width;
  return { x: (pt.x - vb.x) / scale, y: (pt.y - vb.y) / scale };
}

// ViewBox that frames `bounds` plus padding, centred, with the container's
// aspect ratio (so uniform "meet" scaling holds for the other functions).
export function fitBounds(bounds, dims, pad = 0) {
  const targetW = bounds.w + pad * 2;
  const targetH = bounds.h + pad * 2;
  const aspect = dims.width / dims.height;
  let w, h;
  if (targetW / targetH >= aspect) {
    w = targetW;
    h = targetW / aspect;
  } else {
    h = targetH;
    w = targetH * aspect;
  }
  return {
    x: bounds.x + bounds.w / 2 - w / 2,
    y: bounds.y + bounds.h / 2 - h / 2,
    w,
    h,
  };
}

// Pan by a screen-pixel drag delta: content follows the cursor, so the
// viewBox moves the opposite way, scaled into world units.
export function panBy(vb, dims, deltaScreen) {
  const scale = vb.w / dims.width;
  return { ...vb, x: vb.x - deltaScreen.x * scale, y: vb.y - deltaScreen.y * scale };
}

// Zoom by factor (>1 = in) keeping the world point under the cursor fixed.
// Optional limits clamp the resulting viewBox width so a runaway wheel can't
// zoom the presenter into oblivion or out to nothing.
export function zoomAt(vb, dims, cursor, factor, limits) {
  if (limits) {
    const clampedW = Math.min(limits.maxW, Math.max(limits.minW, vb.w / factor));
    factor = vb.w / clampedW;
  }
  const anchor = screenToWorld(vb, dims, cursor);
  const w = vb.w / factor;
  const h = vb.h / factor;
  return {
    x: anchor.x - (anchor.x - vb.x) / factor,
    y: anchor.y - (anchor.y - vb.y) / factor,
    w,
    h,
  };
}

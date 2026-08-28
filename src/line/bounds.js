// World-space bounding rects over machines, used for fit-all and zone framing.
// The margin leaves room for instrument dots and other silhouette furniture
// that renders outside a machine's own footprint; name labels are measured
// properly rather than allowed for by a blanket guess, since which side a
// label hangs off (and how far it reaches) is now declared per machine.
import { labelPlacement, CAP_HEIGHT } from "../scene/labelLayout";

const LABEL_MARGIN = 60;

// Average advance per character, generous, at each label size — bounds only
// needs an upper bound on how far a label reaches, not its exact width, and
// over-reserving costs nothing but a slightly roomier fit-all frame. Anton at
// 13px measures ~6.2-7.0 per character; JetBrains Mono at 8px ~5.0.
const CHAR_WIDTH = { display: 7.2, small: 5.3 };

// The world-space box a machine's name label occupies, resolved through the
// same placement the scene renders with (scene/labelLayout.js).
function labelBox(m) {
  const { x, y, anchor, lines, lineHeight, size } = labelPlacement(m);
  const width = Math.max(...lines.map((l) => l.length)) * CHAR_WIDTH[size];
  const left = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
  return {
    x0: m.x + left,
    x1: m.x + left + width,
    y0: m.y + y - CAP_HEIGHT[size],
    y1: m.y + y + (lines.length - 1) * lineHeight,
  };
}

export function machinesBounds(machines, margin = LABEL_MARGIN) {
  const boxes = machines.map((m) => (m.type === "stub" ? null : labelBox(m)));
  const xs = machines.flatMap((m, i) => {
    const pts = [m.x, m.x + m.w];
    if (boxes[i]) pts.push(boxes[i].x0, boxes[i].x1);
    return pts;
  });
  const ys = machines.flatMap((m, i) => {
    const pts = [m.y, m.y + m.h];
    if (boxes[i]) pts.push(boxes[i].y0, boxes[i].y1);
    return pts;
  });
  const minX = Math.min(...xs) - margin;
  const minY = Math.min(...ys) - margin;
  return {
    x: minX,
    y: minY,
    w: Math.max(...xs) + margin - minX,
    h: Math.max(...ys) + margin - minY,
  };
}

export function lineBounds(line) {
  return machinesBounds(line.machines);
}

export function zoneBounds(line, zoneId) {
  return machinesBounds(line.machines.filter((m) => m.zone === zoneId));
}

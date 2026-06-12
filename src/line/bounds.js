// World-space bounding rects over machines, used for fit-all and zone framing.
// The margin leaves room for labels, chips and instrument dots that render
// outside machine footprints.
const LABEL_MARGIN = 60;

export function machinesBounds(machines, margin = LABEL_MARGIN) {
  const xs = machines.flatMap((m) => {
    const pts = [m.x, m.x + m.w];
    if (m.labelAt) pts.push(m.x + m.labelAt.x, m.x + m.labelAt.x + 190);
    return pts;
  });
  const ys = machines.flatMap((m) => {
    const pts = [m.y, m.y + m.h];
    if (m.labelAt) pts.push(m.y + m.labelAt.y - 14, m.y + m.labelAt.y + 22);
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

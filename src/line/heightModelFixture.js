// For tests (issue #156): the golden line as a line saved before issue #156
// would hold it. The treating elevator's `distanceM` was its height, it was
// drawn 264 px tall with long runs at either end, and its field was
// "height".
import { goldenLine } from "./goldenLine";

export function heightModelLine(height = 8.731) {
  const line = structuredClone(goldenLine);
  const m = line.machines.find((x) => x.id === "treatingElevator");
  delete m.geom.segmentsM;
  Object.assign(m, { x: 250, y: 222, w: 420, h: 264 });
  m.geom.colX = 200;
  m.anchors = { in: { x: 25, y: 228 }, out: { x: 376, y: 44 } };
  m.sim.distanceM = height;
  m.adjustable = m.adjustable.map((a) => (a.bind === "pathLength"
    ? { id: "height", label: "height", unit: "m", kind: "number", min: 4, max: 20, default: 8.731, bind: "height" }
    : a));
  return line;
}

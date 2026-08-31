// Pure geometry + easing for the outload diverter's flapper swing (issue
// #68), kept separate from symbols.jsx so it's unit-testable without
// rendering — same reasoning as drumFeederMotion.js/elevatorMotion.js.

// Diamond center and the two outlet vertices, matching lineData.js's own
// outloadDiverter anchors (issue #44): out1 sits at the left vertex, out2 at
// the right.
const DIVERTER_CENTER = { x: 16, y: 16 };
const DIVERTER_PORT_VERTEX = { out1: { x: 0, y: 16 }, out2: { x: 32, y: 16 } };
const DIVERTER_FLAPPER_LEN = 12;

// Pneumatic actuator travel time. No document gives its duration, so this is
// a legibility pick (a route change should be noticed, not missed between
// frames), not a plant figure.
export const DIVERTER_SWING_SEC = 0.4;

// Where the flapper's tip sits when fully pointed at `port`, an unfalling-
// back-to-out1 default for any port this symbol doesn't know (there are only
// ever two on this machine).
export function diverterFlapperPoint(port) {
  const v = DIVERTER_PORT_VERTEX[port] ?? DIVERTER_PORT_VERTEX.out1;
  const dx = v.x - DIVERTER_CENTER.x, dy = v.y - DIVERTER_CENTER.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: DIVERTER_CENTER.x + (dx / len) * DIVERTER_FLAPPER_LEN, y: DIVERTER_CENTER.y + (dy / len) * DIVERTER_FLAPPER_LEN };
}

// Eases the flapper's tip from `from` toward `toPort`'s vertex as `phase`
// (elapsed sim-seconds off useMachineMotion's own clock — frozen while
// paused, scaled by the speed multiplier, same as every other machine's
// motion) advances past `changePhase` (the phase at which the target last
// changed). Reaches the vertex exactly and stays there once
// DIVERTER_SWING_SEC has elapsed.
export function diverterSwingPoint(from, toPort, phase, changePhase) {
  const to = diverterFlapperPoint(toPort);
  const elapsed = phase - changePhase;
  const t = DIVERTER_SWING_SEC > 0 ? Math.min(1, Math.max(0, elapsed / DIVERTER_SWING_SEC)) : 1;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

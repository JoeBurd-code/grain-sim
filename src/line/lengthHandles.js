// Drag handles that change a machine's lengths on the canvas (issue #157).
// A machine's lengths are named segments in metres, such as a bucket
// elevator's floor run, column and head run (elevatorPath.js). A handle
// lengthens one segment, `grows`, as the pointer moves along its `axis`
// ("x" or "y") the way `sign` says (+1 or -1), and shortens it the other
// way. With `takesFrom` it trades: the other segment gives the length and
// takes it back, so the total never changes. Without one (a conveyor's
// single length handle) the segment changes alone, up to its maximum.
//
// A handle is { axis, sign, grows, takesFrom? }; where it sits on the
// machine is its owner's business.

// A length without float noise.
const clean = (v) => Number(v.toPrecision(12));

// `lengths` after the pointer moved `deltaPx` ({ x, y }) from where the drag
// began. Moves in whole `step`s of metres at `pxPerM`, and stops where a
// segment reaches its `min` (or the grown one its `max`).
export function draggedLengths(lengths, handle, deltaPx, { pxPerM, step, min, max = {} }) {
  const { grows, takesFrom } = handle;
  const raw = (handle.sign * deltaPx[handle.axis]) / pxPerM;
  const lowest = (min[grows] ?? 0) - lengths[grows];
  const highest = takesFrom !== undefined
    ? lengths[takesFrom] - (min[takesFrom] ?? 0)
    : (max[grows] ?? Infinity) - lengths[grows];
  const amount = Math.min(highest, Math.max(lowest, Math.round(raw / step) * step));
  const next = { ...lengths, [grows]: clean(lengths[grows] + amount) };
  if (takesFrom !== undefined) next[takesFrom] = clean(lengths[takesFrom] - amount);
  return next;
}

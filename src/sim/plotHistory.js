// Pure state machine for the shared chart's recorded series (issue #36).
// A series exists (accumulating samples) only for a (machineId, kind) pair
// that's currently toggled on, where kind is "level" or "rate"; toggling one
// off discards its whole history immediately, so re-plotting later always
// starts a clean trace, never a gapped one. This module has no notion of sim
// time or the tick loop itself -- it just reacts to "a sample arrived" via
// recordSample, which the sim engine hook calls at its own throttled publish
// cadence (see useSimEngine.js), so the graph's sample rate is exactly the
// snapshot publish rate, not a second independent one.

export function createPlotHistory() {
  return new Map(); // machineId -> { level: Sample[] | null, rate: Sample[] | null }
}

export function isSeriesPlotted(history, machineId, kind) {
  return (history.get(machineId)?.[kind] ?? null) != null;
}

// Starts (on=true) or discards (on=false) one machine's series. A no-op
// (returns the same reference) when the requested state already holds, so
// callers can dispatch unconditionally without needing to check first.
export function setSeriesPlotted(history, machineId, kind, on) {
  const entry = history.get(machineId) ?? { level: null, rate: null };
  const already = entry[kind] != null;
  if (on === already) return history;
  const nextEntry = { ...entry, [kind]: on ? [] : null };
  const next = new Map(history);
  if (nextEntry.level == null && nextEntry.rate == null) next.delete(machineId);
  else next.set(machineId, nextEntry);
  return next;
}

// Appends one sample to every currently-plotted series, reading each
// machine's live value off its published snapshot. A machine with no entry
// in `machineSnapshots` this tick (e.g. plotted then the popup closed on a
// stale id) is left untouched rather than recording a gap.
export function recordSample(history, t, machineSnapshots) {
  if (history.size === 0) return history;
  const next = new Map();
  for (const [machineId, entry] of history) {
    const snap = machineSnapshots.get(machineId);
    next.set(machineId, {
      level: entry.level && snap ? [...entry.level, { t, value: snap.fill ?? 0 }] : entry.level,
      rate: entry.rate && snap ? [...entry.rate, { t, value: snap.flowRateM3PerSec ?? 0 }] : entry.rate,
    });
  }
  return next;
}

// Linearly interpolates a recorded series' value at time t, for placing an
// event marker (issue #38) on a level line between the two samples that
// straddle its timestamp -- event ticks and the throttled publish cadence
// that produces `samples` aren't the same clock, so an event's exact instant
// rarely lands on a recorded sample. Clamps to the nearest endpoint's value
// for a t outside the recorded span; returns null for an empty series.
export function sampleValueAt(samples, t) {
  if (samples.length === 0) return null;
  if (t <= samples[0].t) return samples[0].value;
  const last = samples[samples.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i];
    if (b.t >= t) {
      const a = samples[i - 1];
      const frac = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.value + (b.value - a.value) * frac;
    }
  }
  return last.value;
}

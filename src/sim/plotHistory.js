// Pure state machine for the shared chart's recorded series (issue #36).
// A series exists (accumulating samples) only for a (machineId, kind) pair
// that's currently toggled on, where kind is "level" or "rate"; toggling one
// off discards its whole history immediately, so re-plotting later always
// starts a clean trace, never a gapped one. This module has no notion of sim
// time or the tick loop itself -- it just reacts to "a sample arrived" via
// recordSample, which the sim engine hook calls at its own throttled publish
// cadence (see useSimEngine.js), so the graph's sample rate is exactly the
// snapshot publish rate, not a second independent one.
//
// Level despike: an occasional published snapshot could carry a fill past
// 100% (the one hard, exact ceiling this line has). recordSample clamps
// against it and, when a raw value exceeds it, repeats the series' last
// accepted value instead of plotting the spike -- the trace goes flat for
// that tick rather than jumping. Chart-only: it doesn't touch the snapshot
// itself, so nothing outside this recorded series is affected.
//
// Rate is not a despike -- it's an exponential moving average (EMA). A
// machine like the batch treater discharges its whole charge in the single
// 0.05s tick its "discharging" phase begins (behaviors.js, batchCycle): read
// as a per-tick instantaneous rate, a real 160 kg charge is a genuine
// ~11500 t/h for that one tick, and the chart's own throttled ~10fps publish
// (useSimEngine.js) either misses that tick entirely (most publishes) or
// shows the whole undiluted spike (whichever publish's last simulated step
// happens to be the discharging one) -- there is no meaningful per-tick
// "rate" to despike here, only a genuine average over enough time to cover a
// full charge cycle. recordSample instead tracks each rate series' own
// running cumulativeOutM3 (engine.js's stepSim -- a volume total that can
// never skip a tick's contribution, unlike flowRateM3PerSec) and smooths the
// throughput implied by it with an EMA of time constant RATE_EMA_TAU_SEC,
// rather than a hard-cutoff windowed average: a fixed window means a pulse's
// entire volume drops out in one step the instant it ages past the cutoff (a
// visible cliff, immediately following a visible post-pulse spike, once per
// cycle); an EMA has no cutoff to fall off of, so it settles toward the
// treater's real ~12 t/h sustained rate as a smooth, monotonic curve instead.
// Sanity cap for the level despike above. Level is a 0..1 fill fraction, so
// 100% is an exact, not approximate, ceiling.
const LEVEL_MAX_FRACTION = 1;
// Flattening one machine's own periodic pulsing needs the EMA to keep
// "memory" back across at least about one of its own cycles; shrinking tau
// below that just lets each pulse show through mostly undamped. Pinned to
// the treater's cycle time (48s -- lineData.js, the longest of the batch
// machines on this line: Concetti scale 15s, Flexicon 45s) as the smallest
// value that still meaningfully flattens the slowest one, since any larger
// only adds lag without flattening anything better -- a genuine rate change
// is then ~63% visible after one tau and ~86% after two, rather than the
// several-minute settling a longer window would cost.
export const RATE_EMA_TAU_SEC = 48;

export function createPlotHistory() {
  return new Map(); // machineId -> { level: Sample[] | null, rate: Sample[] | null, rateEma: EmaState | null }
}

export function isSeriesPlotted(history, machineId, kind) {
  return (history.get(machineId)?.[kind] ?? null) != null;
}

// Starts (on=true) or discards (on=false) one machine's series. A no-op
// (returns the same reference) when the requested state already holds, so
// callers can dispatch unconditionally without needing to check first.
// `rateEma` (the internal EMA state recordSample derives the visible `rate`
// series from) is toggled in lockstep with `rate`, never exposed or toggled
// on its own -- it's not a plottable series, just what `rate` is derived
// from. Reset to null on every toggle, on or off, so re-plotting later never
// resumes an old EMA computed against a stale baseline from before the gap.
export function setSeriesPlotted(history, machineId, kind, on) {
  const entry = history.get(machineId) ?? { level: null, rate: null, rateEma: null };
  const already = entry[kind] != null;
  if (on === already) return history;
  const nextEntry = { ...entry, [kind]: on ? [] : null };
  if (kind === "rate") nextEntry.rateEma = null;
  const next = new Map(history);
  if (nextEntry.level == null && nextEntry.rate == null) next.delete(machineId);
  else next.set(machineId, nextEntry);
  return next;
}

// Returns the value to append for the level series' next sample: `raw`
// itself if it's within `max`, otherwise a repeat of the last accepted
// sample (or 0 for a series with no accepted sample yet) so the spike plots
// as a flat hold rather than a jump.
function despike(samples, raw, max) {
  if (raw <= max) return raw;
  return samples.length > 0 ? samples[samples.length - 1].value : 0;
}

// Folds this tick's cumulative-volume reading into the rate EMA: the
// instantaneous rate since the last sample (this tick's volume moved, over
// the time since then) is blended into the running average by `alpha`,
// derived from how much sim-time actually elapsed so the same tau applies
// however far apart two publishes land (a slower speed multiplier, a paused
// tab, or a tick simply missed) rather than assuming a fixed publish
// interval. The very first sample (`prev` null, nothing elapsed yet to
// derive an instantaneous rate from) seeds the EMA at 0, same starting point
// the old windowed average used.
function nextEma(prev, t, cumulative) {
  if (prev == null) return { t, cumulative, value: 0 };
  const elapsed = t - prev.t;
  if (elapsed <= 0) return { ...prev, t, cumulative };
  const instRate = (cumulative - prev.cumulative) / elapsed;
  const alpha = 1 - Math.exp(-elapsed / RATE_EMA_TAU_SEC);
  return { t, cumulative, value: prev.value + alpha * (instRate - prev.value) };
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
    const rateEma = entry.rate && snap ? nextEma(entry.rateEma, t, snap.cumulativeOutM3 ?? 0) : entry.rateEma;
    next.set(machineId, {
      level: entry.level && snap
        ? [...entry.level, { t, value: despike(entry.level, snap.fill ?? 0, LEVEL_MAX_FRACTION) }]
        : entry.level,
      rate: entry.rate && snap ? [...entry.rate, { t, value: rateEma.value }] : entry.rate,
      rateEma,
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

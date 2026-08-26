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
// Rate is not a despike -- it's a windowed average. A machine like the
// batch treater discharges its whole charge in the single 0.05s tick its
// "discharging" phase begins (behaviors.js, batchCycle): read as a per-tick
// instantaneous rate, a real 160 kg charge is a genuine ~11500 t/h for that
// one tick, and the chart's own throttled ~10fps publish (useSimEngine.js)
// either misses that tick entirely (most publishes) or shows the whole
// undiluted spike (whichever publish's last simulated step happens to be the
// discharging one) -- there is no meaningful per-tick "rate" to despike here,
// only a genuine average over enough time to cover a full charge cycle.
// recordSample instead tracks each rate series' own running
// cumulativeOutM3 (engine.js's stepSim -- a volume total that can never skip
// a tick's contribution, unlike flowRateM3PerSec) and reports the average
// throughput over the trailing RATE_AVG_WINDOW_SEC, i.e. (volume moved in
// the window) / (window length) -- the treater settles at its real ~12 t/h
// sustained rate instead of oscillating between 0 and a five-figure spike.
// Sanity cap for the level despike above. Level is a 0..1 fill fraction, so
// 100% is an exact, not approximate, ceiling.
const LEVEL_MAX_FRACTION = 1;
// Longer than every batch-cycle machine's own cycle time on this line
// (treater 48s, Concetti scale 15s, Flexicon 45s -- lineData.js) so each
// one's average fully covers a charge/discharge cycle rather than catching
// it mid-cycle; short enough that a genuine rate change (a presenter
// dragging a feeder's dial) still reaches the chart within about a minute.
export const RATE_AVG_WINDOW_SEC = 60;

export function createPlotHistory() {
  return new Map(); // machineId -> { level: Sample[] | null, rate: Sample[] | null, rateVolume: VolumeSample[] | null }
}

export function isSeriesPlotted(history, machineId, kind) {
  return (history.get(machineId)?.[kind] ?? null) != null;
}

// Starts (on=true) or discards (on=false) one machine's series. A no-op
// (returns the same reference) when the requested state already holds, so
// callers can dispatch unconditionally without needing to check first.
// `rateVolume` (the internal cumulative-volume buffer recordSample averages
// over) is toggled in lockstep with `rate`, never exposed or toggled on its
// own -- it's not a plottable series, just what the visible `rate` series is
// derived from.
export function setSeriesPlotted(history, machineId, kind, on) {
  const entry = history.get(machineId) ?? { level: null, rate: null, rateVolume: null };
  const already = entry[kind] != null;
  if (on === already) return history;
  const nextEntry = { ...entry, [kind]: on ? [] : null };
  if (kind === "rate") nextEntry.rateVolume = on ? [] : null;
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

// Appends this tick's cumulative-volume reading and drops everything from
// the front of the buffer older than RATE_AVG_WINDOW_SEC, except the single
// entry right at or before that cutoff -- kept as the delta's baseline, so
// the window this recordSample call averages over is always the full
// RATE_AVG_WINDOW_SEC (once the series is that old) rather than shrinking
// each time the oldest sample gets dropped. Bounds the buffer to roughly
// window / publish-interval entries instead of growing for the whole run.
function pushVolumeSample(volumeSamples, t, cumulative) {
  const appended = [...volumeSamples, { t, cumulative }];
  const cutoff = t - RATE_AVG_WINDOW_SEC;
  let start = 0;
  while (start + 1 < appended.length && appended[start + 1].t <= cutoff) start++;
  return start === 0 ? appended : appended.slice(start);
}

// The average rate implied by a volume-sample buffer: the volume moved
// between its oldest and newest entry, divided by the time between them.
// Under two samples (a series' very first tick, with no elapsed time yet to
// average over) reads as 0 rather than dividing by zero.
function averageRate(volumeSamples) {
  if (volumeSamples.length < 2) return 0;
  const first = volumeSamples[0];
  const last = volumeSamples[volumeSamples.length - 1];
  const elapsed = last.t - first.t;
  return elapsed > 0 ? (last.cumulative - first.cumulative) / elapsed : 0;
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
    const rateVolume = entry.rate && snap
      ? pushVolumeSample(entry.rateVolume, t, snap.cumulativeOutM3 ?? 0)
      : entry.rateVolume;
    next.set(machineId, {
      level: entry.level && snap
        ? [...entry.level, { t, value: despike(entry.level, snap.fill ?? 0, LEVEL_MAX_FRACTION) }]
        : entry.level,
      rate: entry.rate && snap ? [...entry.rate, { t, value: averageRate(rateVolume) }] : entry.rate,
      rateVolume,
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

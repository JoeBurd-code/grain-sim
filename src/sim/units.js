// Unit conversions between the engine's conserved currency (m3, m3/s) and the
// language the drawings and the engineer use (t/h). Per docs/adr/0002 volume
// is what the engine steps; density conversion happens only at the edges.
//
// Bulk density is derived, not assumed: the engineer's confirmed 7.7 m3 -> 5.5 t
// and 4.51 m3 -> 3.25 t both give ~0.72 t/m3 (REAL_LINE_SPECS.md §8/§9).
export const BULK_DENSITY_T_PER_M3 = 0.72;

export function tPerHourToM3PerSec(tPerHour) {
  return tPerHour / BULK_DENSITY_T_PER_M3 / 3600;
}

export function m3PerSecToTPerHour(m3PerSec) {
  return m3PerSec * BULK_DENSITY_T_PER_M3 * 3600;
}

// Simatek elevator feed-rate formula (issue #57): TPH = Speed% x Gate% x k,
// matching the plant's own commissioning spreadsheet
// (Elevator_Feed_Rate_Calculator_v4_UPDATED.xlsx, user-supplied 2026-08-19,
// read-only, not to be edited -- see issue #56). `speedFraction`/
// `gateFraction` are 0..1, the same convention every other *Fraction field
// on this line already uses (speedFraction/throttleFraction on
// transportDelay), not 0..100.
//
// `k` is the same constant for both the Yellow Bin (treating) and Red Bin
// (Concetti) elevator sheets in the source spreadsheet -- an artifact of it
// hardcoding its own "buckets per metre" constant identically on both
// despite their differing actual bucket pitch, carried through faithfully
// per this project's practice of logging a source document's own quirks
// rather than silently correcting them (docs/OPEN_QUESTIONS.md). The xlsx
// itself isn't available to this repo, so this value is derived, not read
// directly off the sheet: it's the constant that reproduces both of the
// spreadsheet's own worked examples to the 2 decimal places issue #56 gives
// them (85%x55% ~= 13.92 TPH, 95%x65% ~= 18.38 TPH) -- see
// docs/OPEN_QUESTIONS.md.
export const SIMATEK_FEED_RATE_K = 29.77;

export function simatekFeedRateTph(speedFraction, gateFraction) {
  return SIMATEK_FEED_RATE_K * speedFraction * gateFraction;
}

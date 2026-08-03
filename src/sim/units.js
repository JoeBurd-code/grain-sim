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

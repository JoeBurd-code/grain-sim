// Sim time as H:MM:SS.s for the transport readout. A bare seconds count
// stops being readable once a run goes past a few minutes (feedback: "2417.3s"
// says nothing at a glance), so hours and minutes lead. The tenth stays so a
// STEP (one DT = 0.05 s) still visibly moves the clock. Rounded, not
// floored: the clock is summed in 0.05 s steps and lands on values like
// 0.6999..., which must still read 0.7.
export function formatElapsed(sec) {
  const tenths = Math.round(Math.max(0, sec) * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${t}`;
}

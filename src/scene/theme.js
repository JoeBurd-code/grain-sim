// Visual language shared by the whole meeting frontend.
// Palette, fonts and ratioColor are transplanted unchanged from the mock
// (src/GrainFlowSim.jsx), which stays untouched as the reference.

export const C = {
  bg: "#0c0e0d", panel: "#16191b", panel2: "#1d2123", line: "#2a2f31",
  text: "#d4dad0", muted: "#7d877f", wheat: "#e0a82e",
  green: "#3fb950", amber: "#d29922", red: "#f85149",
};

export const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
export const FONT_DISP = "'Anton', 'Arial Narrow', sans-serif";

// colour ramp green -> amber -> red by fill ratio
export function ratioColor(r) {
  r = Math.max(0, Math.min(1, r));
  let a, b, t;
  if (r < 0.5) { a = [63, 185, 80]; b = [210, 153, 34]; t = r / 0.5; }
  else { a = [210, 153, 34]; b = [248, 81, 73]; t = (r - 0.5) / 0.5; }
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Hover/selection accents for the SVG scene.
export const HOVER_STROKE = "#6e7a71";
export const SELECT_STROKE = "#e0a82e";

// Visual language shared by the whole plant app.
// Palette, fonts and ratioColor were originally transplanted unchanged from
// the retired GrainFlowSim mock.

export const C = {
  bg: "#0c0e0d", panel: "#16191b", panel2: "#1d2123", line: "#2a2f31",
  text: "#d4dad0", muted: "#7d877f", wheat: "#e0a82e",
  green: "#3fb950", amber: "#d29922", red: "#f85149",
  // Machined steel, for a mark that has to stay visible against BOTH an
  // empty machine and one full of seed — it is lighter than `panel` and
  // much darker than `wheat`, so it reads as a light mark on the first and
  // a dark one on the second. The treater's drum grooves and agitator use
  // it; a near-black or near-wheat mark disappears on one or the other.
  steel: "#272C2D",
  // Seed with chemical on it: `wheat` pushed toward the dye colour, so a
  // treated charge is distinguishable from an untreated one without a key.
  treated: "#c2703a",
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

// Blend two #rrggbb palette colours. Used for the treater's charge, which
// shifts from `wheat` toward `treated` as chemical goes onto it.
export function mixColor(a, b, t) {
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const A = hex(a), B = hex(b);
  const k = Math.max(0, Math.min(1, t));
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Hover/selection accents for the SVG scene.
export const HOVER_STROKE = "#6e7a71";
export const SELECT_STROKE = "#e0a82e";

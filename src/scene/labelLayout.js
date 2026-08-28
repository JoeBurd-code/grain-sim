// Where a machine's name label sits relative to its own silhouette.
//
// Labels used to carry a hand-authored pixel offset (`labelAt: {x, y}`) with
// the SVG default `text-anchor: start`. That works for a label hanging off a
// machine's right-hand side, but a label on the *left* then has to guess its
// own rendered width to land a sensible gap — and Anton's advance widths are
// nobody's idea of guessable. The result across the line was gaps anywhere
// from 50 units to a negative one (the batch treater's label ran ~20 units
// onto its own vessel), which is what made the arrangement look untidy.
//
// So placement is declared, not measured: a machine says which SIDE its label
// hangs off and how it lines up ALONG that side, and the geometry falls out of
// the machine's own footprint. A left label is anchored `end` at a fixed gap
// from the left edge, so its distance from the machine is exact regardless of
// how long the name is; the same holds on every other side. One constant
// (`LABEL_GAP`) therefore sets the spacing for the whole line at once.
//
// Machines carrying ISA instrument dots (symbols.jsx `Instruments`, always
// stacked off the right-hand edge) get a wider gutter on that side only, so a
// right-hand label clears the dots instead of landing on them.

// Distance from the machine's edge to the nearest ink of its label.
export const LABEL_GAP = 14;

// Right-hand gap for a machine whose instrument dots occupy that edge. The
// widest stack in symbols.jsx sits at `w + 34` with r=9, so its ink ends at
// `w + 43`; this clears that by a full LABEL_GAP.
export const INSTRUMENT_GUTTER = 57;

// Baseline-to-baseline distance for a wrapped label, per label size.
export const LINE_HEIGHT = { display: 13, small: 10 };

// Cap height of each label's font at its rendered size — Anton 13px and
// JetBrains Mono 8px both sit at ~0.73em. Used to convert between "where the
// text's ink starts" (what placement reasons about) and "where its baseline
// goes" (what SVG wants), so a label reads as optically flush with the edge
// it is aligned to rather than floating by a font-metric accident.
export const CAP_HEIGHT = { display: 9.5, small: 5.8 };

// Longest single line, in characters, before a name wraps. ~22 Anton
// characters is ~140 world units, about the width of a mid-size bin — past
// that a label stops reading as a caption for one machine and starts
// reading as a banner across its neighbours.
export const WRAP_BUDGET = 22;

// Splits a machine name across at most two lines, balanced so neither line
// dominates. A " · " in the name is the line author's own separator (e.g.
// "BUCKET ELEVATOR · TREATING") and is preferred as the break, with the
// separator itself dropped — the line break already says what it said.
export function wrapLabel(name, budget = WRAP_BUDGET) {
  if (name.length <= budget) return [name];

  const parts = name.split(" · ");
  if (parts.length === 2 && parts.every((p) => p.length <= budget)) return parts;

  const words = name.split(" ");
  if (words.length < 2) return [name];

  let best = null;
  for (let i = 1; i < words.length; i++) {
    const head = words.slice(0, i).join(" ");
    const tail = words.slice(i).join(" ");
    const worst = Math.max(head.length, tail.length);
    if (best == null || worst < best.worst) best = { worst, lines: [head, tail] };
  }
  return best.lines;
}

// First-line baseline for a label hanging off a vertical (left/right) edge.
// `align` positions the whole wrapped block against the machine's height.
function baselineAlongEdge(align, h, cap, span) {
  if (align === "top") return cap;
  if (align === "bottom") return h - span;
  return h / 2 + cap / 2 - span / 2;
}

// x + text-anchor for a label sitting above or below the machine.
function acrossEdge(align, w) {
  if (align === "start") return [0, "start"];
  if (align === "end") return [w, "end"];
  return [w / 2, "middle"];
}

// Resolves a machine's declared `label: { side, align, nudge }` into concrete
// SVG text geometry, in the machine's own local coordinates (the `g` the
// scene has already translated to the machine origin).
//
// `nudge` is the deliberate escape hatch for the handful of places where the
// line's own routing leaves no clean side — it is an offset from a real
// placement, not a replacement for one, so the uniform gap still holds
// everywhere it isn't used.
export function labelPlacement(m) {
  const size = m.smallLabel ? "small" : "display";
  const cap = CAP_HEIGHT[size];
  const lineHeight = LINE_HEIGHT[size];
  const lines = wrapLabel(m.name, m.label?.wrap ?? WRAP_BUDGET);
  const span = (lines.length - 1) * lineHeight;

  const side = m.label?.side ?? "below";
  const align = m.label?.align ?? "center";
  const hasInstruments = (m.instruments?.length ?? 0) > 0;

  let x, y, anchor;
  if (side === "left") {
    x = -LABEL_GAP;
    anchor = "end";
    y = baselineAlongEdge(align, m.h, cap, span);
  } else if (side === "right") {
    x = m.w + (hasInstruments ? INSTRUMENT_GUTTER : LABEL_GAP);
    anchor = "start";
    y = baselineAlongEdge(align, m.h, cap, span);
  } else if (side === "above") {
    [x, anchor] = acrossEdge(align, m.w);
    y = -LABEL_GAP - span;
  } else {
    [x, anchor] = acrossEdge(align, m.w);
    y = m.h + LABEL_GAP + cap;
  }

  const nudge = m.label?.nudge;
  return {
    x: x + (nudge?.x ?? 0),
    y: y + (nudge?.y ?? 0),
    anchor,
    lines,
    lineHeight,
    size,
  };
}

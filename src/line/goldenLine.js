// The golden line: Treater Line 2 as hand-written in lineData.js, loaded
// through the same import path as a user's line file (issue #75). The
// hand-written source keeps its comments and provenance labels; what the
// app runs is the document form of it.
import { line } from "./lineData";
import { exportLine, importLine } from "./lineDocument";

export const GOLDEN_LINE_NAME = "golden line";

const loaded = importLine(exportLine(line, GOLDEN_LINE_NAME));

// When the hand-written line fails validation, the app still needs a line
// to show its LINE DATA INVALID screen against, so fall back to the source.
export const goldenLine = loaded.ok ? loaded.line : line;
export const goldenLineErrors = loaded.ok ? [] : loaded.errors;

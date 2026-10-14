// Issue #91: Build mode's undo/redo stack. Kept as plain data (a line
// document per step) and pure functions so the exact-earlier-document
// guarantee is testable without mounting PlantApp. The 50-step cap applies
// to the past; a redo pushes its line back onto the past so the cap keeps
// working after an undo/redo round trip too.
const MAX_HISTORY = 50;

export function emptyHistory() {
  return { past: [], future: [] };
}

// Called with the line as it was just before an edit that succeeded. A new
// edit always clears the redo future.
export function pushHistory(history, prevLine) {
  return { past: [...history.past, prevLine].slice(-MAX_HISTORY), future: [] };
}

// `currentLine` is the line being moved away from (into the future, so redo
// can get back to it). Returns null when there is nothing to undo.
export function undoHistory(history, currentLine) {
  if (history.past.length === 0) return null;
  const prevLine = history.past[history.past.length - 1];
  return {
    line: prevLine,
    history: {
      past: history.past.slice(0, -1),
      future: [currentLine, ...history.future].slice(0, MAX_HISTORY),
    },
  };
}

export function redoHistory(history, currentLine) {
  if (history.future.length === 0) return null;
  const nextLine = history.future[0];
  return {
    line: nextLine,
    history: {
      past: [...history.past, currentLine].slice(-MAX_HISTORY),
      future: history.future.slice(1),
    },
  };
}

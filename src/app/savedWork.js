// Browser autosave (issue #79): the user's work survives a reload or a
// closed tab.
//
// - The golden line with edits is stored as its changes only (diffFromBase).
//   On load they are applied to the golden line as it is now, so a value the
//   user never touched always comes from the repo.
// - An opened file is stored whole, with its name.
// - The untouched golden line stores nothing.
//
// Every storage access is wrapped: storage that is blocked, full, missing or
// holding something unreadable only means "no saved work".
import { diffFromBase, applyChanges, exportLine, importLine } from "../line/lineDocument";

export const SAVED_WORK_KEY = "grain-sim:saved-work";
const SAVED_WORK_VERSION = 1;

function browserStorage() {
  return window.localStorage;
}

// Returns the saved line as { line, name, fromFile }, or null.
export function loadSavedWork(golden, getStorage = browserStorage) {
  try {
    const text = getStorage().getItem(SAVED_WORK_KEY);
    if (text === null) return null;
    const saved = JSON.parse(text);
    if (saved?.version !== SAVED_WORK_VERSION) return null;
    if (saved.kind === "changes") {
      return { ...golden, line: applyChanges(golden.line, saved.changes) };
    }
    if (saved.kind === "file") {
      const result = importLine(saved.file);
      return result.ok ? { line: result.line, name: result.name, fromFile: true } : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSavedWork(getStorage = browserStorage) {
  try {
    getStorage().removeItem(SAVED_WORK_KEY);
  } catch {
    // Storage that cannot be reached holds nothing to clear.
  }
}

// `current` is { line, name, fromFile }. The untouched golden line removes
// what is stored.
export function storeWork(golden, current, getStorage = browserStorage) {
  let saved = null;
  try {
    saved = current.fromFile
      ? { version: SAVED_WORK_VERSION, kind: "file", file: exportLine(current.line, current.name) }
      : { version: SAVED_WORK_VERSION, kind: "changes", changes: diffFromBase(golden.line, current.line) };
    if (saved.kind === "changes" && saved.changes.length === 0) {
      clearSavedWork(getStorage);
      return;
    }
    getStorage().setItem(SAVED_WORK_KEY, JSON.stringify(saved));
  } catch {
    // A write that fails (storage full, for example) must not leave older
    // work behind for the next load to bring back instead of this work.
    if (saved) clearSavedWork(getStorage);
  }
}

// A line as a document (issue #75): the JSON file a user SAVEs and OPENs in
// Build mode. The file holds the design at the RESTART state — machines,
// slider defaults, positions, connections, interlocks, zones — already in
// the engine's own units. It holds no run state and no provenance labels:
// those stay in the hand-written golden line (lineData.js), which remains
// the record of what the client's engineer confirmed.
//
// Every line reaches the app through importLine, the golden line included
// (see goldenLine.js), so there is one loading path, not two.
import { validateLine } from "./validateLine";

// Build mode edits (issue #77). The rules live in adjustableFields.js; a
// line document is edited only through these.
export { setAdjustableValue, differsFromDefault } from "./adjustableFields";
// Browser autosave (issue #79) stores edits to the golden line as changes.
export { diffFromBase, applyChanges } from "./lineChanges";

export const LINE_FORMAT = "grain-sim-line";
export const LINE_FORMAT_VERSION = 1;

function withoutProvenance(key, value) {
  return key === "provenance" ? undefined : value;
}

export function exportLine(line, name) {
  const doc = { format: LINE_FORMAT, formatVersion: LINE_FORMAT_VERSION, name, line };
  return JSON.stringify(doc, withoutProvenance, 2);
}

function refuse(error, errors = [error]) {
  return { ok: false, error, errors };
}

// Returns { ok: true, line, name } or { ok: false, error, errors }. Never
// throws: a bad file is a message for the user, not a crash.
export function importLine(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return refuse("This file is not valid JSON.");
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || doc.format !== LINE_FORMAT) {
    return refuse("This file is not a grain-sim line.");
  }
  if (doc.formatVersion !== LINE_FORMAT_VERSION) {
    return refuse(`This line file is format version ${doc.formatVersion}; this app reads version ${LINE_FORMAT_VERSION}.`);
  }
  const line = doc.line;
  if (!line || typeof line !== "object"
    || !Array.isArray(line.machines) || !Array.isArray(line.connections) || !Array.isArray(line.zones)) {
    return refuse("This line file is missing its machines, connections or zones.");
  }
  let validation;
  try {
    validation = validateLine(line);
  } catch (e) {
    return refuse(`This line file is damaged: ${e.message}`);
  }
  if (!validation.ok) {
    return refuse("This line has errors and cannot be loaded.", validation.errors);
  }
  return { ok: true, line, name: typeof doc.name === "string" ? doc.name : "untitled line" };
}

// OPEN (issue #76): a file the user picked. The line takes the file's name,
// not the name stored inside it, so a saved copy of the golden line never
// passes for the golden line itself.
export function importLineFile(text, fileName) {
  const result = importLine(text);
  if (!result.ok) return result;
  return { ...result, name: fileName.replace(/\.json$/i, "") || result.name };
}

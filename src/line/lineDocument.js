// A line as a document (issue #75): the JSON file a user SAVEs and OPENs in
// Build mode. The file holds the design at the RESTART state — machines,
// slider defaults, positions, connections, interlocks, machine rules and
// zones, already in the engine's own units. It holds no run state and no
// provenance labels: those stay in the hand-written golden line
// (lineData.js), which remains the record of what the client's engineer
// confirmed.
//
// Every line reaches the app through importLine, the golden line included
// (see goldenLine.js), so there is one loading path, not two.
import { validateLine } from "./validateLine";
import { migrateHeightModel } from "./elevatorPath";

// Build mode edits (issue #77). The rules live in adjustableFields.js; a
// line document is edited only through these.
export { setAdjustableValue, differsFromDefault } from "./adjustableFields";
// Browser autosave (issue #79) stores edits to the golden line as changes.
export { diffFromBase, applyChanges } from "./lineChanges";
// Moving a machine (issue #86).
export { moveMachine } from "./layout";
// A shape edit that settles an overlapping machine into a free spot (issue #154).
export { applyGeometryEdit } from "./layout";
// Flipping a machine left to right (issue #155).
export { flipMachine } from "./layout";
// Adding and deleting machines, and NEW LINE (issue #87).
export { addMachine, deleteMachine, emptyLine, setMachineText } from "./editing";
// Connecting and disconnecting ports (issue #88).
export { connectPorts, disconnectConnection, connectionKey } from "./connecting";
// Moving, deleting, copying and pasting a group of machines (issue #95).
export { moveMachines, deleteMachines, copyMachines, pasteMachines } from "./groups";

export const LINE_FORMAT = "grain-sim-line";
// Version 2 (issue #85): every interlock is a sentence, and the rules that
// are not move to `machineRules`. A version 1 file is refused with a message.
// Version 3 (issue #87): a machine names its catalogue `item`, a machine
// can have no zone and an empty tag, and a line can have unconnected
// machines and rules that are off. An older file is refused with a message.
export const LINE_FORMAT_VERSION = 3;

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
  const saved = doc.line;
  if (!saved || typeof saved !== "object"
    || !Array.isArray(saved.machines) || !Array.isArray(saved.connections) || !Array.isArray(saved.zones)) {
    return refuse("This line file is missing its machines, connections or zones.");
  }
  let line, validation;
  try {
    // Issue #156: a bucket elevator saved under the old height model
    // migrates to a path length, in the same format version.
    line = migrateHeightModel(saved);
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

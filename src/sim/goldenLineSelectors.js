// Test support (issue #81): the golden line's two declared selectors by
// their ids in lineData.js, so the many engine tests written before #81 can
// keep saying setSource(sim, "proBox") and setDestination(sim, "flexicon").
// The app never imports this: it drives any line's selectors through
// engine.js's setSelection and getSelection.
import { setSelection, getSelection } from "./engine";

function selectionOrNull(sim, selectorId) {
  return sim.selectors.some((s) => s.id === selectorId) ? getSelection(sim, selectorId) : null;
}

export function setSource(sim, source) {
  setSelection(sim, "source", source);
}

export function getSource(sim) {
  return selectionOrNull(sim, "source");
}

export function setDestination(sim, destination) {
  setSelection(sim, "destination", destination);
}

export function getDestination(sim) {
  return selectionOrNull(sim, "destination");
}

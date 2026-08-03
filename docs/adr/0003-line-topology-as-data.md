# Line topology as data, not a visual editor

The line is a data-described graph: one config object lists this line's machines,
their ports, parameters, and connections, interpreted by a small set of shared
behavior functions to simulate and draw. There is deliberately no drag-and-drop
editor — the data file is hand-authored. This project simulates one specific,
already-engineered line for a stakeholder demo, not a general-purpose
line-building platform, so the cost of a topology editor buys nothing a real user
needs.

## Consequences

Adding or changing a machine means editing `lineData.js` directly rather than
using UI. That's the intended trade-off, not an oversight — reopening it would
mean reopening the "not a general-purpose platform" scope decision in
`docs/PROJECT_BRIEF.md` §1.

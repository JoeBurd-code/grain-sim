# Lines are user-editable documents, and the golden line stays hand-written

Supersedes ADR 0003.

ADR 0003 said the line is hand-written data and that there is no editor, because
the project simulated one line for one stakeholder demo. That scope has changed.
The project is now the proof of concept for a factory builder: a user configures
machines, saves lines and later builds their own lines from a machine catalogue.

## Decision

- A line is a document. It is a JSON file that holds the design at the RESTART
  state: machines, slider defaults, positions, connections, interlocks and zones,
  in engine units. It holds no run state and no provenance labels. The file has
  a format id and a format version.
- The app has two modes and is always in exactly one of them. Sim mode runs a
  line. Build mode designs it. Every switch between modes is a full RESTART, so a
  design change never applies to a run that is already in progress.
- Changes made in Sim mode are temporary. Only Build mode changes the design.
- Treater Line 2, the **golden line**, stays hand-written in `lineData.js` with
  all its comments and provenance labels. It is never generated from JSON and
  changes only by commits. The app loads it through the same import path as a
  user file, so there is one loading path.
- A user cannot change a machine's behaviour kind. A different behaviour is a
  different machine, and later a different catalogue entry.

## Consequences

- Provenance labels exist only in the hand-written source (and later in catalogue
  entries). An exported golden line does not record which values the engineer
  confirmed. That record stays in the repo.
- A test runs the golden line and its export/import round trip side by side in
  the engine, so a value lost in export fails the build.
- The first version of Build mode edits values only. Moving, adding, deleting and
  connecting machines need pipe auto-routing and error handling for broken lines
  first, and they come with drag and drop.

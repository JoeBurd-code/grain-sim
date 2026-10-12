# Interlocks are sentences

The interlocks were coded rule kinds in `control.js`, one kind for each response
the golden line needed: close a valve, slow then stop an elevator, stop a
conveyor, start a feeder. A user could not read them, change them or add one,
and a line built from scratch had no interlocks. Issue #80 replaces the kinds
with one shape that a user can read and fill in. Issues #82 to #84 converted
every golden line interlock to it, and issue #85 deleted the coded kinds.

## Decision

- Every interlock on every line is an **interlock sentence**
  (`src/sim/sentenceInterlock.js`):

  > When [machine] is [condition] for [delay] s, then [steps].
  > When it clears, then [steps]. Reset: [auto or latched].

- **when**: one sensor machine and one condition (level above or below a %,
  stopped, running) and a signal delay. A level condition can name its level
  switch (LSL, LSH or LSHH). Then that switch's lamp and set point slider
  follow the sentence.
- **then**: steps that run top to bottom. A step is an action on a machine
  (stop, start, close, open), a wait, an "if still true" check that ends the
  steps when the condition has cleared, or a trip of the whole line.
- **when it clears** (optional): steps for the release. It can have its own
  condition and delay (the buffer bin valve opens below LSL). With none, it
  starts the tick the "when" condition stops holding.
- **reset**: latched (held until RESET TRIPS, and only once the condition has
  cleared) or auto. A sentence that trips the whole line is held until RESET
  TRIPS in either case.
- A sentence can be armed only while selectors point at given ports
  (`armedWhen`), as the metal bin trips are.
- Each sentence commands through its own command slot, so the most restrictive
  command on a machine wins and one sentence never releases another's stop.
- A part of the model that is not built yet is refused at import with a
  message. It is never ignored at run time. "Slow a machine to a %" is in the
  model and is not built yet.
- Rules that a sentence cannot express are **machine rules**, in
  `line.machineRules`, not interlocks: the graded feed schedules (a machine
  setting) and "hold the next batch" (see `docs/OPEN_QUESTIONS.md`). The
  controlled stop's order comes from the line graph and is neither (ADR 0006).
  A new machine rule kind needs a reason it cannot be a sentence.
- A machine popup's set point sliders are generated from the rules
  (`src/line/setpointSliders.js`): one slider for each level switch that a
  rule reads on that machine, and one for each sentence level condition with
  no switch. A machine can give its switches' sliders a label and limits. No
  set point slider is written by hand.
- In Sim mode only set points can change, and the change lasts until RESTART.
  Delays and structure change only in Build mode (ADR 0008).

## Consequences

- One interlock system runs the golden line and every built line. The golden
  line interlock baseline (`goldenInterlockBaseline.test.js`) holds the
  converted golden line to the behaviour of the coded rules.
- The line file format went to version 2. A version 1 file is refused with a
  message, because its interlocks can hold coded rules.
- Machine rules step before the interlocks on each tick. Rules read machine
  state that an earlier rule commanded in the same tick, so the order can move
  an event by one tick. This order keeps the baseline record.
- A switch read by two rules has one set point. Its slider moves it on every
  rule that reads it, because one physical switch has one height.
- The Interlocks window (issue #92) edits this shape. It needs no second format.

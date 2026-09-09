# Level switches are contacts, and dot colour tracks alarm role

A level switch on this line is a physical probe fixed at one height in a
vessel. It signals when grain covers it and falls silent when grain leaves it.
That is true whether the probe is mounted low (`LSL0`) or high (`LSH0`), so
every code reads one direction in `instrumentReadings` (`sim/control.js`):

```js
signal: level >= setpoint
```

Until issue #72 this file read a low switch backwards, `level <= setpoint`, so
a *dry* bin asserted its low switch. That inverted the physical device. The
name `signal` replaced `tripped` at the same time, because a healthy stocked
bin asserting its low probe is news, not a fault.

The direct consequence is that a stocked bin now signals `LSL` and `LSH` at
once. This needs no arbitration and no priority rule. Nothing downstream of
these flags reads them. Feed bands come from `bandForLevel`, which compares the
raw level against the set points in order, so the bands stay mutually exclusive
by construction and a later switch always wins over an earlier one.

## Colour tracks alarm role, not the code's letters

A lit dot is red when its code is that machine's own latched trip, and green
otherwise. The role comes from the rule kind, via `ALARM_CODE` in
`sim/control.js`, and rides on each reading as `alarm` so the render layer
never has to know about rule kinds.

This means the same `LSH` is drawn in two different colours in two places on
screen, which looks wrong until you know why. `LSH` genuinely means two things
on this line:

| vessel | rule kind | latched trip | so LSH is |
| --- | --- | --- | --- |
| treaterBufferBin | hysteresisValve | LSHH | green |
| treaterPreBin | gradedFeedSchedule | LSHH | green |
| concettiPreBin | gradedFeedSchedule | LSHH | green |
| treaterAfterBin | holdNextBatch | LSH | red |
| flexiconPreBin | thresholdStopTrip | LSH | red |
| metalBin1 | thresholdStopTrip | LSH | red |
| metalBin2 | thresholdStopTrip | LSH | red |

Issue #58 demoted `LSH` to a feed-schedule boundary on the three vessels that
carry an `LSHH`, and made `LSHH` the sole latched trip there. The other four
vessels have no `LSHH` at all, and their `LSH` is the switch that stops the
line. Colouring by the letters would leave those four with no red indication
at the exact moment something goes wrong, which is the one thing the colour is
for.

This also matches how the FD classifies these devices. The buffer bin's `LSL0`
is **Information** alarm class only and appears in no interlock and no trip
table, while a high level event is a trip that needs a SCADA reset
(`docs/PLC_FUNCTIONAL_DESCRIPTION.md`).

## Consequences

The event log records the one edge that is news for each switch. A high switch
logs when it makes, a low switch logs when it breaks. Under the old backwards
reading, a low switch's make *was* that same falling crossing, so the log keeps
exactly the timing and the volume it had before, reworded from "set point
reached" to `ON` / `OFF`.

The pulse ring fires only for an alarm code. Green switches light and hold
without animating, so a ring on screen means one thing: the line just stopped.

An empty line opens with every dot dark. The line always starts empty (issue
#55), and the old reading opened the demo with a red `LSL` on every bin.

Colour-by-role is easy to "tidy" back into colour-by-letters, so it is pinned
by tests on both sides: `control.test.js` covers every code on every rule kind,
and `engine.test.js` covers the real line's own seven rules.

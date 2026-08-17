# Three distinct stop mechanisms, not one generic "stop"

The line can go idle three different ways, and each is its own primitive rather
than a shared "stop" abstraction with mode flags: a **trip** (`control.js`)
commands one actuator immediately, wherever its material happens to be, the
instant its own interlock fires; a **controlled stop** (`controlledStop.js`)
walks the whole line's precomputed upstream-first stop order
(`line/stopOrder.js`) and only commands a machine once nothing further will
ever reach it, so material already released keeps moving instead of freezing
mid-transit; a **utilities trip** (`utilitiesTrip.js`) is a trip variant that,
once fired, hits every actuator on the line at once rather than one
interlock's own target. These read as three shapes of one idea, but each has
a genuinely different rule for *when* a given machine actually stops (now vs.
once drained vs. all-at-once), and collapsing them into one function with a
mode parameter would have made that rule implicit in a branch instead of
explicit in which file owns it.

A trip also **latches**: since issue #45, a tripped machine stays stopped once
the triggering condition clears, released only by the plant control's own
RESET TRIPS command (and only if the condition has actually cleared by then).
An earlier version of this sim auto-reopened once the level cleared — a
modelling convenience, not plant behaviour (the FD is explicit: a tripped
device needs a SCADA reset). A controlled stop deliberately does **not**
latch — `resumeLine` needs no trip reset, since choosing to stop the line
gracefully is not itself a fault condition.

## Consequences

Any future stop-like behaviour has to decide which of the three shapes it
actually is rather than reusing one generic path: instant-and-latching
(trip), graceful-and-non-latching (controlled stop), or instant-and-total
(utilities trip). Conservation (`sim/conservation.js`) has to hold across all
three independently and in combination — issue #52's whole-line conservation
test (`sim/wholeLineConservation.test.js`) exercises a latched trip, a
controlled stop, and a utilities trip within one continuous run for exactly
this reason. `docs/OPEN_QUESTIONS.md` records the auto-reopen removal as the
one item in this register that was a correctness fix rather than a precision
one.

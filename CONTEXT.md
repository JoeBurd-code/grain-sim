# Grain Flow Simulator

A node-graph simulator of one specific, already-engineered grain production line
(Bayer South Africa's Treater Line 2), built to demo to stakeholders how grain flows
and how the line behaves under fault conditions.

## Language

### Simulation model

**Stream**:
A quantity of grain in transit or storage, described by volume (m³) as the primary
conserved currency; mass is derived (`mass = volume × density`) only where it's
actually read, e.g. by a sensor.
_Avoid_: batch (see Accumulator, Batch cycle), parcel (see In-flight parcel).

**Port**:
A typed input or output connection point on a machine, e.g. a treater has one input
and two outputs (waste + product).
_Avoid_: pin, terminal, socket.

**Backpressure**:
The condition where a downstream cell or machine is full, so an upstream move is
rejected and grain accumulates instead of advancing.
_Avoid_: congestion, blocking.

**Spill**:
Grain that could not be accepted — feed exceeding a cell's capacity, or an
accumulator overflowing past its cap — and is discarded, counted separately from
grain that backs up.
_Avoid_: overflow (the general phenomenon; spill is the counted, discarded quantity), waste.

**In-flight parcel**:
Grain that has left a machine's discharge and is free-falling before arriving at
the next machine, held in a fixed-delay queue for the fall time.
_Avoid_: in-transit (the general phase; this term is the specific free-fall leg of it).

**Accumulator**:
A machine that fills continuously and holds real stock, rather than passing
grain straight through, with no cyclic timer of its own — it only discharges
once whatever sits downstream has room (backpressure release), or via a
presenter/operator command (e.g. emptying a full metal bin). Covers every bin
and vessel on the line (the treater buffer bin, the outload buffer bin, the
Flexicon and Concetti pre-bins, both treated metal bins). Distinct from
Batch cycle below, which does run on a cyclic timer — the two are separate
sim primitives (`src/sim/behaviors.js`) even though both "hold a batch" in
plain English.
_Avoid_: buffer (used loosely for any holding vessel in the plant drawings; reserve
accumulator for the sim-primitive sense), reservoir, batch (see Batch cycle).

**Batch cycle**:
A machine that charges to a fixed size, then holds for a fixed cyclic
duration before discharging — the treater (charge → treat → discharge), the
Flexicon filling head, and the Concetti bagging scale all share this one
primitive (`batchCycle`, `src/sim/behaviors.js`), configured with a
different charge size and cycle time each time. The hold timer itself runs
on a fixed schedule regardless of downstream demand (unlike Accumulator,
which has no timer at all); actually releasing the held charge once
discharging starts is still capacity-bounded by whatever's downstream, the
same as every other machine.
_Avoid_: accumulator (see above; the two are easy to conflate since both
"hold a batch" informally), scale (plant-drawing term for the two bagging
machines specifically; batch cycle is the sim-primitive name both share with
the treater).

**Splitter**:
A machine with one input and multiple outputs that divides a stream, either by a
fixed ratio (a scalping screen separating product from oversize waste) or by
routing the whole stream to one destination at a time (see Diverter).
_Avoid_: fork, divider.

**Diverter**:
A valve that routes an entire stream to exactly one of several downstream
destinations at a time (e.g. between Treated Outload Metal Bins 1 and 2), as
opposed to splitting it into simultaneous fractions. Implemented by one of
two sim primitives depending on whether the machine also carries real
transport lag of its own: `router` (holds no material, selects instantly —
the outload diverter between the two metal bins) or `routedTransportDelay`
(a Diverter and a Transport lag chain combined into one machine — the
pendulum conveyor's own three pneumatically selected outlets, where material
already accepted for one outlet keeps travelling there even after the
selection changes).
_Avoid_: switch, splitter (splitter can mean simultaneous division; diverter never is).

**Destination/source selector**:
A presenter-facing control that commands more than one machine's selection
in lockstep so the on-screen result is always self-consistent — the
destination selector sets both the pendulum conveyor's own outlet and, when
it points at either metal bin, the outload diverter behind it; the source
selector arms exactly one of the two packaging drum feeders and disarms the
other. Distinct from a single machine's own Diverter selection, which the
selector wraps rather than replaces.
_Avoid_: router (that's the underlying sim primitive one Diverter uses, not
the presenter-facing control that may drive more than one).

**Interlock**:
A declared dependency where one machine's stop or slow condition is triggered by
another machine crossing a threshold (e.g. the treater pre-bin filling slows then
stops the treating elevator), carrying its own signal delay.
_Avoid_: lockout, safety trip (a trip is the sensor event; the interlock is the
resulting chain of stops).

**Trip**:
An interlock's own high-level outcome: the commanded machine stops immediately,
wherever its material happens to be, and — since issue #45 — stays stopped once
the triggering condition clears, latched until the plant control's own RESET
TRIPS command releases it (and only if the condition has actually cleared by
then). The real line has no automatic reopen; an earlier version of this sim
did, which was a modelling error, not a plant fact (see `docs/OPEN_QUESTIONS.md`).
_Avoid_: interlock (the rule; a trip is what happens when the rule fires),
auto-reopen, auto-recover.

**Controlled stop**:
The opposite of a Trip: a presenter-commanded, whole-line stop that walks the
line's own upstream-first stop order (`src/line/stopOrder.js`) and only
commands each machine to stop once nothing further will ever reach it, so
material already released keeps moving to whatever is still running instead
of freezing mid-transit. Does not latch — resuming needs no trip reset, only
`resumeLine`. Distinct again from the Utilities trip below, which stops
everything at once rather than draining it.
_Avoid_: trip, shutdown, emergency stop.

**Utilities trip**:
A trip triggered by a hard prerequisite failing (dust filter, cyclofan, or
conditioning compressor) rather than by any one machine's own level or
running-state condition — modelled as its own presenter toggle that, once
tripped, stops every actuator on the line at once, total and immediate,
leaving product stranded wherever it was. Latches and resets the same way
any other Trip does.
_Avoid_: controlled stop (a utilities trip is instant and total; a controlled
stop is a graceful drain — the two are near-opposites despite both being
whole-line).

**Transport lag**:
The delay caused by grain already in transit — on a belt, in an elevator, mid
free-fall — continuing to move after a stop is commanded. It is not a
signal-latency-style fixed countdown independent of the machine's own state:
whatever primitive implements it (cell-by-cell capacity propagation for the
belt; a fixed-delay queue for free-fall and, since issue #21, the `transportDelay`
behaviour for an elevator's chain) always derives the delay from a real
physical rate (belt/chain speed) and distance, re-paces live material when
that rate changes, and keeps discharging whatever's already in transit after
a stop — the lag falls out of that physical model, not a bolted-on timer with
its own independent clock.
_Avoid_: signal latency (a distinct delay source, see below), ramp-down.

**Signal latency**:
The delay between a sensor crossing its threshold and the corresponding actuator
command taking effect, independent of how long the actuator then takes to act.
_Avoid_: transport lag, ramp-down.

**Ramp-down**:
The settable time a machine takes to decelerate to a stop once commanded, rather
than stopping instantly. VFD-driven equipment ramps; DOL-driven equipment stops
near-instantly.
_Avoid_: coast, spin-down (used interchangeably in the plant drawings; this repo
standardises on ramp-down).

### Treater Line 2 (the real line)

**Treater**:
The Niklas WNS/200 batch treater that doses chemical onto seed. Confirmed to be
the line's bottleneck at ~14.4 t/h (160 kg every ~40 s), not the equipment capacity
of ~20 t/h.
_Avoid_: dryer, coater.

**Buffer bin** ("7T bin"):
The 7.7 m³ intermediary bin between the out-of-scope yellow-bin area and the
treating side. This is the simulation's defined start point — nothing upstream of
it is modelled.
_Avoid_: hopper (reserve for smaller feed hoppers), silo.

**Drum feeder**:
A metering feed machine controlled by a non-proportional percentage opening
(2-20 t/h range) — the opening percentage does not map linearly to flow rate.
_Avoid_: valve, gate.

**Bucket elevator**:
A Simatek E200 pendulum conveyor that lifts grain via buckets on a chain loop
(lower horizontal → vertical lift → upper horizontal). Two exist on the line —
treating-side and packaging-side — each with several minutes of carrying-side
transit lag.
_Avoid_: lift, conveyor (reserve conveyor for horizontal belt transport).

**Outload**:
The downstream distribution of treated seed into one of three parallel branches
(Concetti bagging, treated metal bins, Flexicon big-bag filling), of which only
one runs at a time, operator-selected.
_Avoid_: dispatch, output.

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
_Avoid_: batch (see Batch/accumulator), parcel (see In-flight parcel).

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
A machine that fills continuously and discharges as a batch — on a cyclic timer,
a threshold, or an operator/SCADA command — rather than passing grain straight
through. Covers buckets, bins, and vessels alike.
_Avoid_: buffer (used loosely for any holding vessel in the plant drawings; reserve
accumulator for the sim-primitive sense), reservoir.

**Splitter**:
A machine with one input and multiple outputs that divides a stream, either by a
fixed ratio (a scalping screen separating product from oversize waste) or by
routing the whole stream to one destination at a time (see Diverter).
_Avoid_: fork, divider.

**Diverter**:
A valve that routes an entire stream to exactly one of several downstream
destinations at a time (e.g. between Treated Outload Metal Bins 1 and 2), as
opposed to splitting it into simultaneous fractions.
_Avoid_: switch, splitter (splitter can mean simultaneous division; diverter never is).

**Interlock**:
A declared dependency where one machine's stop or slow condition is triggered by
another machine crossing a threshold (e.g. the treater pre-bin filling slows then
stops the treating elevator), carrying its own signal delay.
_Avoid_: lockout, safety trip (a trip is the sensor event; the interlock is the
resulting chain of stops).

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

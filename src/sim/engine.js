// The single entry point every test and every UI surface drives: create a
// sim from a line definition, step it by a fixed timestep, read a machine's
// state back. Internals (the two-phase step, how behaviours are wired) are
// not part of this seam.
import { BEHAVIORS, REGISTERED_KINDS, unregisteredKindMessage } from "./behaviors";
import { initControl, stepControl, combineEventLogs, primeInstruments, resetTrips as resetControlTrips } from "./control";
import {
  initControlledStop, stepControlledStop, beginControlledStop as beginControlledStopRun,
  resumeControlledStop,
} from "./controlledStop";
import {
  initUtilitiesTrip, stepUtilitiesTrip, setUtilitiesHealthy as setUtilitiesHealthySim,
  resetUtilitiesTrip,
} from "./utilitiesTrip";

export const DT = 0.05; // s, fixed sim timestep (matches the proven mock)

// Builds the id -> (port -> id) map of "the sim-enabled machines this
// machine's product/waste streams feed", restricted to machines that both
// declare a `sim` block. Edges into not-yet-built machines are not part of
// the sim graph yet. A single-output kind (almost everything) only ever
// keeps its "product" edge here, exactly as before issue #26 — the waste/
// chemical ports a machine like the metal remover or batch treater declares
// are real on the drawing but deliberately not modelled as a split (see
// their own `sim` comments). Only a kind that opts into `multiOutput` (see
// behaviors.js — splitter is the first) has more than one port wired here,
// which is what makes a genuine fan-out meaningful in the passes below.
function buildDownstreamMap(line, simEnabledIds, machinesById) {
  const downstream = new Map();
  for (const c of line.connections) {
    if (!simEnabledIds.has(c.from.machine) || !simEnabledIds.has(c.to.machine)) continue;
    const fromKind = machinesById.get(c.from.machine).sim.kind;
    const multi = BEHAVIORS[fromKind].multiOutput === true;
    if (multi ? c.kind !== "product" && c.kind !== "waste" : c.kind !== "product") continue;
    if (!downstream.has(c.from.machine)) downstream.set(c.from.machine, new Map());
    downstream.get(c.from.machine).set(c.from.port, c.to.machine);
  }
  return downstream;
}

// Kahn's algorithm over the sim-enabled subgraph. Throws on a cycle, which
// would mean a mis-wired line definition (recirculation is not part of this
// line, per REAL_LINE_SPECS.md §10 "Recirculation: NONE seen"). Works
// unchanged for a multi-output node: it just has more than one edge to fan
// out over below.
function topoOrder(simEnabledIds, downstream) {
  const indegree = new Map([...simEnabledIds].map((id) => [id, 0]));
  for (const portMap of downstream.values()) {
    for (const to of portMap.values()) indegree.set(to, indegree.get(to) + 1);
  }
  const queue = [...simEnabledIds].filter((id) => indegree.get(id) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    const portMap = downstream.get(id);
    if (portMap) {
      for (const to of portMap.values()) {
        indegree.set(to, indegree.get(to) - 1);
        if (indegree.get(to) === 0) queue.push(to);
      }
    }
  }
  if (order.length !== simEnabledIds.size) {
    throw new Error("sim graph has a cycle among sim-enabled machines");
  }
  return order;
}

export function createSim(line) {
  const machines = new Map();
  const machinesById = new Map(line.machines.map((m) => [m.id, m]));
  for (const m of line.machines) {
    if (!m.sim) continue;
    if (!REGISTERED_KINDS.has(m.sim.kind)) {
      throw new Error(unregisteredKindMessage(m.id, m.sim.kind));
    }
    machines.set(m.id, BEHAVIORS[m.sim.kind].init(m));
  }
  const simEnabledIds = new Set(machines.keys());
  const downstream = buildDownstreamMap(line, simEnabledIds, machinesById);
  const order = topoOrder(simEnabledIds, downstream);
  const control = initControl(line);
  // Issue #30: seed every rule's instrument state (setpoint, tripped) from
  // the sensor's initial level right away, so the very first published
  // snapshot — before the sim has ever ticked — already shows real values.
  primeInstruments(control, machines);
  // Issue #50: the controlled stop's own runtime state, walking the stop
  // order computed once off this same `line`'s topology (see
  // sim/controlledStop.js and line/stopOrder.js).
  const controlledStop = initControlledStop(line);
  // Issue #51: the utilities trip's own runtime state — no line-derived
  // config needed (unlike control.js's rules), since it doesn't target one
  // sensor/actuator pair but every actuator on the line at once, discovered
  // fresh off `sim.machines` the moment it actually fires (utilitiesTrip.js).
  const utilitiesTrip = initUtilitiesTrip();
  // The declared output ports of every multi-output (splitter, and later
  // router) machine, so the passes below know the full port set to build
  // downstreamCap/hasDownstream objects over — including a port with
  // nothing sim-enabled wired to it (see stepSim), which the `downstream`
  // map above simply omits.
  const multiOutputPorts = new Map();
  for (const id of simEnabledIds) {
    const m = machinesById.get(id);
    if (BEHAVIORS[m.sim.kind].multiOutput) multiOutputPorts.set(id, m.ports.outputs);
  }
  return {
    t: 0, line, machines, downstream, multiOutputPorts, order, control, controlledStop, utilitiesTrip,
    // Issue #55: running total of every unit CLEAR PLANT has ever discarded
    // — internal-only, never published to the UI (see useSimEngine.js's
    // publishSnap, which doesn't read it) — folded into assertConserved
    // (conservation.js) as its own term so the whole-line invariant still
    // proves out across a clear without that material landing in any
    // presenter-facing counter.
    discardedByClear: 0,
  };
}

// Rebuilds `sim` from its own `line` and copies the result over the same
// object reference (rather than returning a new one), so a caller holding
// onto `sim` — the UI's useState value, never replaced via its setter — sees
// the reset without needing to know its identity changed. Every live
// control set during the run (rates, interlock set points, elevator speed)
// reverts to the line's authored defaults, same as a page reload. This is
// the whole-sim rebuild — surfaced to the presenter as RESTART, not RESET,
// so it's never confused with resetTrips below, which only clears latched
// interlocks and leaves the running demo alone.
export function resetSim(sim) {
  Object.assign(sim, createSim(sim.line));
  return sim;
}

// Whether a sim-enabled machine actually sits downstream of `id` — the one
// fact both the forward pass and conservationTotals need computed the same
// way, since a downstream *value* of 0 is ambiguous (genuinely full vs not
// modelled at all, see stepSim below) but this boolean isn't.
export function hasSimDownstream(sim, id) {
  return sim.downstream.has(id);
}

// Builds this node's downstream shape for one pass. A single-output node
// (every kind except a `multiOutput` one, see behaviors.js) gets back the
// plain single-id shape every behaviour before issue #26 already expects:
// `single` is that one downstream id, or undefined. A multiOutput node gets
// back its full declared port list instead, so the caller can build a
// per-port object even over a port with nothing sim-enabled wired to it.
function outputShape(sim, id) {
  const ports = sim.multiOutputPorts.get(id);
  if (!ports) {
    const portMap = sim.downstream.get(id);
    return { single: portMap ? [...portMap.values()][0] : undefined };
  }
  return { ports, portMap: sim.downstream.get(id) };
}

export function stepSim(sim, dt) {
  const { machines, order } = sim;

  // Reverse pass: how much can flow INTO each node this tick, given what
  // its own downstream can accept. Must run before the forward pass so
  // backpressure from a full accumulator is known before an upstream
  // pass-through or source decides how much to emit.
  const capAvail = new Map();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const state = machines.get(id);
    const shape = outputShape(sim, id);
    const downstreamCap = shape.ports
      ? Object.fromEntries(shape.ports.map((p) => {
          const toId = shape.portMap?.get(p);
          return [p, toId != null ? capAvail.get(toId) : Infinity];
        }))
      : shape.single != null ? capAvail.get(shape.single) : Infinity;
    capAvail.set(id, BEHAVIORS[state.kind].capacityAvailable(state, dt, downstreamCap));
  }

  // Forward pass: actually move volume, capped by the availability just computed.
  // `downstreamCap` re-derives the same value the reverse pass used as this
  // node's own downstream bound (see issue #20) — a node that both holds
  // and discharges (the accumulator) needs it to know how much it may push
  // out this tick, separately from `capAvail.get(id)` (how much it may
  // accept in). A port with nothing sim-enabled downstream gets 0: nowhere
  // for it to discharge into. `hasDownstream` (issue #21) is passed
  // alongside the number itself, because 0 is also the legitimate value of
  // a genuinely full downstream — a behaviour that self-reports its output
  // as "delivered" when unconnected (meteredFeeder, transportDelay,
  // splitter) needs to tell those two cases apart, which the number alone
  // can't do. A multiOutput node (issue #26) gets both as objects keyed by
  // port instead of a single value/boolean, and `apply` returns an object
  // of per-port flow instead of one number — every single-output kind is
  // untouched by this branch.
  // Issue #28: every machine's actual outflow this tick, divided by dt, is
  // recorded generically here — right off the same `outflow` apply() already
  // returns for the forward pass itself, summed across ports for a
  // multiOutput node — rather than each behaviour kind computing its own
  // notion of "rate". Assigned unconditionally every tick (never left stale
  // from a prior tick) so a starved/blocked/downstream-full machine that
  // moved nothing this tick reads as a real 0, not undefined or leftover.
  const inflowOf = new Map();
  const addInflow = (id, amt) => inflowOf.set(id, (inflowOf.get(id) ?? 0) + amt);
  for (const id of order) {
    const state = machines.get(id);
    const inflow = inflowOf.get(id) ?? 0;
    const shape = outputShape(sim, id);

    if (shape.ports) {
      const hasDownstream = Object.fromEntries(shape.ports.map((p) => [p, shape.portMap?.get(p) != null]));
      const downstreamCap = Object.fromEntries(shape.ports.map((p) => {
        const toId = shape.portMap?.get(p);
        return [p, toId != null ? capAvail.get(toId) : 0];
      }));
      const outflow = BEHAVIORS[state.kind].apply(state, dt, inflow, capAvail.get(id), downstreamCap, hasDownstream);
      let totalOut = 0;
      for (const p of shape.ports) {
        const toId = shape.portMap?.get(p);
        totalOut += outflow[p] ?? 0;
        if (toId != null) addInflow(toId, outflow[p] ?? 0);
      }
      state.flowRateM3PerSec = totalOut / dt;
    } else {
      const hasDownstream = shape.single != null;
      const downstreamCap = hasDownstream ? capAvail.get(shape.single) : 0;
      const outflow = BEHAVIORS[state.kind].apply(state, dt, inflow, capAvail.get(id), downstreamCap, hasDownstream);
      if (shape.single != null) addInflow(shape.single, outflow);
      state.flowRateM3PerSec = outflow / dt;
    }
  }

  sim.t += dt;
  stepControl(sim);
  stepControlledStop(sim);
  // Issue #51: stepped last, so a utilities trip firing this tick overrides
  // whatever the two passes above just commanded — a trip is total, and
  // nothing else on the line gets to argue with it.
  stepUtilitiesTrip(sim);
  return sim;
}

export function getMachineState(sim, id) {
  return sim.machines.get(id);
}

// Plant control (issue #45): clears every latched trip on the line at once
// — the SCADA reset, distinct from resetSim above (which rebuilds the whole
// sim back to t=0 and every authored default). A machine whose interlock
// condition is still live stays exactly where it was; see control.js's own
// resetTrips and each rule kind's `reset` for what "still live" means per
// kind.
export function resetTrips(sim) {
  resetControlTrips(sim);
  // Issue #51: swept by the same one RESET TRIPS button, per that ticket's
  // own "reuses the latch and reset machinery" instruction — resetUtilitiesTrip
  // decides for itself whether it has anything latched and whether utilities
  // health has actually been restored, the same self-gating shape every
  // control.js reset already has.
  resetUtilitiesTrip(sim);
}

// Plant control (issue #55): CLEAR PLANT — instantly empties every machine
// on the line of whatever grain it's currently holding, via each behaviour's
// own `clear` (behaviors.js), a kind not opting in (source, passThrough,
// meteredFeeder, splitter, router — none hold material of their own) simply
// contributes nothing. Cumulative counters, the event log, latched trips,
// source/destination selection and run/pause state are all untouched — this
// only ever zeroes the material a machine is holding right now, never
// anything this file's own resetTrips/resetSim already own. The total
// discarded folds into `sim.discardedByClear` (createSim above) rather than
// any presenter-facing counter, so `conservationTotals` (conservation.js)
// can still account for it without exposing a new number to the UI.
export function clearPlant(sim) {
  let discarded = 0;
  for (const state of sim.machines.values()) {
    const clear = BEHAVIORS[state.kind]?.clear;
    if (clear) discarded += clear(state);
  }
  sim.discardedByClear += discarded;
}

// Plant control (issue #50): the counterpart to resetTrips above, and
// deliberately independent of it — a controlled stop is not a trip, latches
// nothing, and needs no SCADA reset to undo (see controlledStop.js's own
// header). Passes which packaging feeder is currently selected into
// controlledStop.js's own beginControlledStop, which stores it on its own
// state (only if a drain is actually starting) — this file never writes
// into `sim.controlledStop` directly, the same read/command-only boundary
// every other module here keeps with `sim.control`.
export function controlledStop(sim) {
  beginControlledStopRun(sim, getSource(sim));
}

// Restores every actuator the drain touched back to its normal running
// command, then re-selects whichever packaging feeder controlledStop above
// captured — resumeControlledStop itself re-enables *every* meteredFeeder it
// commanded (it has no notion of "the selected one"), so this setSource call
// is what leaves exactly one running again rather than both. Reads
// `preStopSource` before calling resumeControlledStop, which clears it as
// part of resetting its own state back to "running". A no-op source
// selection (fabricated test lines with neither packaging feeder, or a
// resume called with nothing ever stopped) is harmless: setSource simply has
// nothing to select.
export function resumeLine(sim) {
  const preStopSource = sim.controlledStop.preStopSource;
  resumeControlledStop(sim);
  if (preStopSource) setSource(sim, preStopSource);
}

// Read access: which phase the controlled stop is in, for the plant-control
// cluster's own button state (issue #50) — filled/active for "draining" or
// "stopped", same "filled = active" convention the source/destination
// selectors already use.
export function getControlledStopPhase(sim) {
  return sim.controlledStop.phase;
}

// Plant control (issue #51): the utilities health toggle, and read access to
// both the presenter's own toggle position and the trip's own latch phase —
// same "filled = active" convention the source/destination selectors and the
// controlled-stop button already give the plant-control cluster.
export function setUtilitiesHealthy(sim, healthy) {
  setUtilitiesHealthySim(sim, healthy);
}

export function getUtilitiesHealthy(sim) {
  return sim.utilitiesTrip.healthy;
}

export function getUtilitiesTripPhase(sim) {
  return sim.utilitiesTrip.phase;
}

// Read access to an interlock's runtime state (phase, event log, live
// parameters), keyed by its sensor machine — the same public seam
// getMachineState offers for a plain machine, so a test or the UI never
// needs to reach into `sim.control` directly.
export function getInterlockState(sim, sensorMachineId) {
  return sim.control.find((r) => r.sensorId === sensorMachineId);
}

// Issue #29: the combined, machine-tagged event list published alongside
// each sensor's own per-machine log above, from the same rule.log arrays,
// merged and sorted by control.js's combineEventLogs, tagged with names
// read from the line definition (the only place a machine's display name
// lives).
export function getCombinedEvents(sim) {
  const machineNames = new Map(sim.line.machines.map((m) => [m.id, m.name]));
  const events = combineEventLogs(sim.control, machineNames);
  // Issue #50: the controlled stop's own log merges into the same feed, off
  // the same machineNames lookup — controlledStop.js tags each entry with
  // the machine it commanded, exactly like a rule's own log entries, just
  // gathered from a single runtime object rather than one per sensor.
  for (const entry of sim.controlledStop.log) {
    events.push({ ...entry, machineName: machineNames.get(entry.machineId) });
  }
  // Issue #51: the utilities trip's own log, merged the same way — tagged
  // with a synthetic "utilities" id rather than a real line machine (see
  // utilitiesTrip.js's own header: the three utility sequences are
  // deliberately not modelled as machines), so there is no real id for
  // `machineNames` to resolve; the display name is supplied directly here
  // instead of looked up.
  for (const entry of sim.utilitiesTrip.log) {
    events.push({ ...entry, machineName: "UTILITIES" });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

export function setSourceRate(sim, id, rateM3PerSec) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "source") {
    throw new Error(`machine "${id}" is not a source`);
  }
  state.nominalRate = rateM3PerSec;
}

// Live control (issue #20): the drum feeder's metering rate takes effect on
// its very next capacityAvailable call, mid run — same immediacy as
// setSourceRate, no ramp modelled for the feeder itself. Stamps
// `manualOverride` (issue #42) so the auto-start interlock can tell a
// presenter has taken the feeder into their own hands, at any rate
// including 0, and never re-commands it afterwards.
export function setFeederRate(sim, id, rateM3PerSec) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "meteredFeeder") {
    throw new Error(`machine "${id}" is not a metered feeder`);
  }
  BEHAVIORS[state.kind].command(state, rateM3PerSec);
  state.manualOverride = true;
}

// Live control (issue #21, the VFD): takes effect on the very next apply(),
// re-pacing every packet already in transit, not just newly accepted
// material — a real chain has one speed for everything riding it. Accepts
// either transport-delay kind (issue #47's own `routedTransportDelay`
// shares this field verbatim) since both are "a chain with a live speed
// dial" as far as this setter is concerned.
export function setElevatorSpeed(sim, id, fraction) {
  const state = sim.machines.get(id);
  if (!state || (state.kind !== "transportDelay" && state.kind !== "routedTransportDelay")) {
    throw new Error(`machine "${id}" is not a transport-delay machine`);
  }
  state.speedFraction = Math.max(0, Math.min(1, fraction));
}

// Presenter/demo control: jump an accumulator straight to a given fill
// fraction, e.g. to stage a near-overflow scenario without waiting for the
// source to fill it there. This adds or removes volume from outside the
// modelled source, so it folds into `initialStored` (the same bucket the
// t=0 seed level uses) rather than `stored` alone, keeping the conservation
// identity (fed + initialStored = stored + ...) true afterwards.
export function setAccumulatorLevel(sim, id, fraction) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "accumulator") {
    throw new Error(`machine "${id}" is not an accumulator`);
  }
  const nextStored = Math.max(0, Math.min(state.capacity, fraction * state.capacity));
  state.initialStored += nextStored - state.stored;
  state.stored = nextStored;
}

function findInterlock(sim, sensorMachineId) {
  const rule = getInterlockState(sim, sensorMachineId);
  if (!rule) throw new Error(`machine "${sensorMachineId}" has no interlock`);
  return rule;
}

// Live controls (issue #19): the sensor's set points and the interlock's
// signal delay all take effect on the rule's very next tick, mid run —
// there's no need to touch the actuator directly, since a set point only
// changes when stepControl next compares the sensor's level against it.
export function setInterlockHighSetpoint(sim, sensorMachineId, fraction) {
  findInterlock(sim, sensorMachineId).highSetpoint = fraction;
}

export function setInterlockLowSetpoint(sim, sensorMachineId, fraction) {
  findInterlock(sim, sensorMachineId).lowSetpoint = fraction;
}

export function setInterlockSignalDelay(sim, sensorMachineId, seconds) {
  findInterlock(sim, sensorMachineId).signalDelaySec = seconds;
}

// Live controls (issue #22, the two-stage interlock): the pre-bin's slow and
// stop set points and delays are each independent, unlike thresholdTrip's
// single highSetpoint/signalDelaySec pair — `setInterlockLowSetpoint` above
// is reused as-is for this rule kind's recovery threshold, since both rule
// kinds happen to name that field `lowSetpoint`.
export function setInterlockSlowSetpoint(sim, sensorMachineId, fraction) {
  findInterlock(sim, sensorMachineId).slowSetpoint = fraction;
}

export function setInterlockStopSetpoint(sim, sensorMachineId, fraction) {
  findInterlock(sim, sensorMachineId).stopSetpoint = fraction;
}

export function setInterlockSlowDelay(sim, sensorMachineId, seconds) {
  findInterlock(sim, sensorMachineId).slowDelaySec = seconds;
}

export function setInterlockStopDelay(sim, sensorMachineId, seconds) {
  findInterlock(sim, sensorMachineId).stopDelaySec = seconds;
}

// Live controls (issue #24): the batch treater's charge size and cycle time
// take effect on the very next tick. A size change never retroactively
// resizes a charge already mid-cycle — capacityAvailableBatchCycle re-reads
// `chargeM3` itself every tick, and dropping it below what's already `held`
// simply completes the current charge immediately rather than shrinking it
// out from under an in-progress hold.
export function setBatchSize(sim, id, m3) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "batchCycle") {
    throw new Error(`machine "${id}" is not a batch-cycle machine`);
  }
  state.chargeM3 = Math.max(0, m3);
}

export function setBatchCycleSec(sim, id, seconds) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "batchCycle") {
    throw new Error(`machine "${id}" is not a batch-cycle machine`);
  }
  state.cycleSec = Math.max(0, seconds);
}

// Live control (issue #26): the scalping screen's oversize split, dragged as
// a percentage in the UI and clamped here to a valid fraction.
export function setSplitterWasteFraction(sim, id, fraction) {
  const state = sim.machines.get(id);
  if (!state || state.kind !== "splitter") {
    throw new Error(`machine "${id}" is not a splitter`);
  }
  state.wasteFraction = Math.max(0, Math.min(1, fraction));
}

// Plant control (issue #46 — the source selector): which drum feeder is
// allowed to run, since only one ever does. The single place both setSource
// and getSource below name the two machines, so the mapping is authored
// once. Which position is the *default* is not decided here at all — it's
// whichever feeder's own `sim.enabled` the line data authors as true
// (lineData.js), the same convention every other machine's t=0 state
// already uses; a fabricated line missing one or both packaging feeders
// (most existing engine tests) is unaffected, since neither function
// requires them to exist.
const PACKAGING_FEEDERS = { treatingLine: "inletDrumFeeder2", proBox: "inletDrumFeeder1" };

// Commands the selected feeder's intake open and the other one shut, via
// each feeder's own `enabled` gate (behaviors.js) rather than its `rate` —
// so a presenter's own feed-rate dial on either feeder survives being
// deselected and reselected, instead of being zeroed and forgotten.
// Deselecting the treating-side feeder is what leaves the treating zone
// idle (see inletDrumFeeder2's own lineData.js comment): the scalping
// screen backs up into the treater after-bin exactly like any other full
// downstream, with no special-cased "idle" state anywhere in this function.
export function setSource(sim, source) {
  if (!(source in PACKAGING_FEEDERS)) {
    throw new Error(`unknown source "${source}"`);
  }
  for (const [key, id] of Object.entries(PACKAGING_FEEDERS)) {
    const state = sim.machines.get(id);
    if (state?.kind === "meteredFeeder") {
      BEHAVIORS.meteredFeeder.setEnabled(state, key === source);
    }
  }
}

// Read access (issue #46): which source is currently selected, derived from
// which packaging feeder is enabled rather than tracked as separate state —
// there is exactly one fact here, and the feeders' own `enabled` flags
// already carry it. Returns null for a fabricated line with neither
// packaging feeder, or the unreachable case of both/neither enabled.
export function getSource(sim) {
  const enabled = Object.entries(PACKAGING_FEEDERS).filter(
    ([, id]) => sim.machines.get(id)?.enabled === true
  );
  return enabled.length === 1 ? enabled[0][0] : null;
}

// Plant control (issue #47 — the destination selector): four positions, one
// control, matching the Functional Description's own sequence pre-check
// ("select treated outlet metal bin no. when that destination is chosen") —
// the metal bin choice is part of choosing the destination, not a separate
// dial. Two machines carry the actual selection: the packaging conveyor's
// own outlet port (which of the three real destinations — outload, Flexicon,
// Concetti), and the outload diverter's own port (which of the two metal
// bins, only meaningful when the conveyor's own selection is the outload
// port at all). Both machine ids are hardcoded here, the same convention
// PACKAGING_FEEDERS above already uses for the source selector.
const CONVEYOR_ID = "pendulumConveyor";
const OUTLOAD_DIVERTER_ID = "outloadDiverter";
const DESTINATIONS = {
  concetti: { conveyorPort: "outConcetti" },
  flexicon: { conveyorPort: "outBinSeg" },
  metalBin1: { conveyorPort: "outBuffer", diverterPort: "out1" },
  metalBin2: { conveyorPort: "outBuffer", diverterPort: "out2" },
};

// Switching destination mid-run is a deliberate presenter affordance, off-
// spec (the real plant only selects at sequence start, docs/OPEN_QUESTIONS.md)
// — and it's the strongest transport-lag demonstration on the line, since
// the conveyor's own `routedTransportDelay` behaviour (behaviors.js) tags
// each packet with the port selected at the moment it was accepted:
// commanding a new `selectPort` here only changes what *newly* accepted
// material is tagged with, never anything already in transit.
export function setDestination(sim, destination) {
  const cfg = DESTINATIONS[destination];
  if (!cfg) throw new Error(`unknown destination "${destination}"`);
  const conveyor = sim.machines.get(CONVEYOR_ID);
  if (conveyor) BEHAVIORS[conveyor.kind].selectPort(conveyor, cfg.conveyorPort);
  if (cfg.diverterPort) {
    const diverter = sim.machines.get(OUTLOAD_DIVERTER_ID);
    if (diverter) BEHAVIORS[diverter.kind].selectPort(diverter, cfg.diverterPort);
  }
}

// Read access, derived the same way getSource is: the two routers' own
// `selected` ports already carry the one fact this needs, so there's
// nothing separate to track. A conveyor selection of the shared outload
// port resolves to whichever metal bin the diverter itself currently
// points at; any other conveyor selection maps straight back to its own
// destination. Returns null for a fabricated line missing either machine.
export function getDestination(sim) {
  const conveyor = sim.machines.get(CONVEYOR_ID);
  if (!conveyor) return null;
  if (conveyor.selected === "outConcetti") return "concetti";
  if (conveyor.selected === "outBinSeg") return "flexicon";
  if (conveyor.selected === "outBuffer") {
    const diverter = sim.machines.get(OUTLOAD_DIVERTER_ID);
    return diverter?.selected === "out2" ? "metalBin2" : "metalBin1";
  }
  return null;
}

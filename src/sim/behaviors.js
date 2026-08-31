// Behaviour primitives every sim-enabled machine's `sim.kind` resolves to.
// Each behaviour exposes the pure functions used by the engine's two-phase
// step (see engine.js) and by everything else that reads a machine's state
// generically instead of switching on kind: `capacityAvailable` (reverse
// pass, how much this machine can accept from upstream this tick, given
// what its own downstream can accept), `apply` (forward pass, move the
// volume and mutate state), `conserve` (this machine's contribution to the
// conservation totals, see conservation.js) and `snapshot` (its published
// dynamic render value, see useSimEngine.js — omitted where a kind has
// nothing to show). `clear` (issue #55, CLEAR PLANT) discards whatever held
// material this machine currently carries and returns the discarded volume;
// omitted entirely on a kind that holds no material of its own (source,
// passThrough, meteredFeeder, splitter, router) and left un-called on
// terminalSink, whose running total is a delivered-style counter, not held
// material. Adding a kind means adding one entry here; nothing
// downstream needs a matching switch/if. This is also the registry
// validateLine.js checks declared `sim.kind` values against.

// Shared by source and passThrough: neither holds any volume of its own, so
// what either can accept is exactly what its own downstream can accept.
function forwardDownstreamCapacity(state, dt, downstreamCap) {
  return downstreamCap;
}

// Slews `current` toward `target` at `ratePerSec` over `dt`, clamping onto
// the target exactly rather than overshooting it — shared by any actuator
// that ramps rather than snaps: the source valve's openness below, and the
// elevator's interlock-commanded throttle (issue #22).
function slewToward(current, target, ratePerSec, dt) {
  if (current === target) return current;
  const step = ratePerSec * dt;
  const diff = target - current;
  return Math.abs(diff) <= step ? target : current + Math.sign(diff) * step;
}

// `openness` (0..1, the valve's actual position) slews toward
// `opennessTarget` at `opennessRampPerSec`, rather than snapping — this is
// what lets material already released keep arriving after a close command,
// the overshoot the control layer (control.js) exists to demonstrate.
// Defaults to fully open with an instant (infinite) slew rate so a source
// with nothing commanding it behaves exactly as before this existed.
function initSource(m) {
  return {
    kind: "source",
    nominalRate: m.sim.rateM3PerSec,
    openness: 1,
    opennessTarget: 1,
    opennessRampPerSec: Infinity,
    fed: 0,
  };
}
function applySource(state, dt, inflow, cap) {
  state.openness = slewToward(state.openness, state.opennessTarget, state.opennessRampPerSec, dt);
  const out = Math.min(state.nominalRate * state.openness * dt, cap);
  state.fed += out;
  return out;
}
function conserveSource(state) {
  return { fed: state.fed };
}
// `nominalRate` and `openness` (issue #34) let the UI show the dial's actual
// resulting rate — nominalRate * openness — distinct from flowRateM3PerSec
// (issue #28), which also reflects downstream backpressure, not just this
// valve's own interlock-commanded position.
function snapshotSource(state) {
  return { nominalRate: state.nominalRate, openness: state.openness };
}
// Commands the valve toward fully open or fully closed over `rampTimeSec`.
// The control layer is the only caller; a source with no interlock never
// has this invoked and keeps its default openness of 1.
function commandSource(state, direction, rampTimeSec) {
  state.opennessTarget = direction === "close" ? 0 : 1;
  state.opennessRampPerSec = rampTimeSec > 0 ? 1 / rampTimeSec : Infinity;
}
function isSettledSource(state) {
  return state.openness === state.opennessTarget;
}

// Holds zero volume at all times: whatever it can accept, it emits the same tick.
function initPassThrough() {
  return { kind: "passThrough", volume: 0 };
}
function applyPassThrough(state, dt, inflow, cap) {
  const out = Math.min(inflow, cap);
  state.volume = 0;
  return out;
}

function initAccumulator(m) {
  const capacity = m.sim.capacityM3;
  const stored = (m.sim.initialLevelFraction ?? 0) * capacity;
  // Pre-existing inventory at t=0 didn't come through any source's `fed`
  // counter this run; the conservation identity accounts for it separately.
  // `atomicDischarge` (opt-in via `m.sim.atomicDischarge`) is for a bin whose
  // only downstream is a batch-cycle machine (the treater/Concetti scale pre-
  // bins) — see applyAccumulator's own comment on what it changes. Every
  // other accumulator on the line feeds a continuous-flow consumer and must
  // keep handing over whatever it has, so this defaults false.
  return { kind: "accumulator", capacity, stored, initialStored: stored, spill: 0, discharged: 0, atomicDischarge: m.sim.atomicDischarge ?? false };
}
// How much this accumulator can accept from upstream this tick is purely
// its own remaining headroom — independent of whatever's happening on the
// discharge side (see applyAccumulator), since filling and draining are two
// separate flows through the same vessel.
function capacityAvailableAccumulator(state) {
  return Math.max(0, state.capacity - state.stored);
}
// `downstreamCap` (issue #20) is the engine's forward-pass echo of the same
// value this accumulator's own capacityAvailable saw propagate in from its
// downstream during the reverse pass — for a metered feeder that's its
// configured draw rate this tick, already bounded by *its* own downstream.
// Defaults to 0 so a bin with nothing sim-enabled downstream of it (or a
// fabricated test state that never passes it) keeps issue #18's fill-only
// behaviour exactly.
function applyAccumulator(state, dt, inflow, cap, downstreamCap = 0) {
  const accepted = Math.min(inflow, cap);
  state.stored += accepted;
  state.spill += Math.max(0, inflow - accepted);
  // `atomicDischarge`: a batch-cycle downstream's own capacityAvailable only
  // ever asks for 0 or its full remaining charge (behaviors.js, batchCycle),
  // never a partial amount — so `downstreamCap` here is that same all-or-
  // nothing request. Without this gate a short bin hands over whatever it
  // has anyway (Math.min below), which the batch machine then sits on
  // indefinitely as a part-charge — materially harmless (never gets treated
  // short, see batchCycle's own comment) but wrong to look at: the bin
  // reads empty while the machine silently holds the seed instead. Gating
  // here keeps that seed visibly in the bin until there's enough for a
  // whole charge, matching how a real batching valve only opens once its
  // hopper can complete one.
  const canDischarge = !state.atomicDischarge || state.stored >= downstreamCap - EPS;
  const discharge = canDischarge ? Math.min(state.stored, downstreamCap) : 0;
  state.stored -= discharge;
  state.discharged = (state.discharged ?? 0) + discharge;
  return discharge;
}
function conserveAccumulator(state) {
  return { initialStored: state.initialStored, stored: state.stored, spilled: state.spill };
}
// Plant control (issue #55 — CLEAR PLANT): discards whatever this bin is
// currently holding, leaving `initialStored` (the t=0 seed) and every
// cumulative counter (`spill`, `discharged`) untouched — the caller folds
// the returned volume into its own internal-only discard total so
// conservation still proves out, per this behaviour's own contract with
// clearPlant (engine.js).
function clearAccumulator(state) {
  const discarded = state.stored;
  state.stored = 0;
  return discarded;
}
function snapshotAccumulator(state) {
  return { fill: state.capacity > 0 ? state.stored / state.capacity : 0 };
}

// Metered feeder (issue #20): draws from whatever accumulator feeds it, at
// a settable rate, and holds no volume of its own — everything it accepts
// it forwards the same tick, like passThrough, except its intake is capped
// by `rate` rather than being unlimited. The real drum feeder is actually
// controlled by a non-proportional percentage opening, not a direct rate
// (see docs/OPEN_QUESTIONS.md); this behaviour assumes a linear opening ->
// rate mapping across the confirmed 2-20 t/h range until the engineer's
// spreadsheet of estimated values arrives.
// `manualOverride` (issue #42) is stamped only by the engine's own
// setFeederRate — the presenter-facing live control — never by `command`
// below, so the auto-start interlock can tell "a presenter has already
// touched this slider" apart from "still sitting at its own rate, whatever
// that rate happens to be" (0 is not a safe proxy for "never touched": a
// presenter deliberately pausing the feeder at 0 also leaves `rate` at 0,
// and that pause must not look like "never started" to the interlock).
// `hasGate` (issue #57, opt-in via `m.sim.hasGate`) adds a second, gate-
// position pair of fields alongside `rate`/`manualOverride` above — the
// drum feeders' own physical actuator, independent of the metering rate
// this behaviour already models. Opt-in rather than unconditional because
// meteredFeeder is also reused by machines with no physical gate at all
// (vibratingConveyor, issue #48) — those must not carry dead gate state.
// `gateFraction` is the presenter's own persisted dial (mirrors
// transportDelay's `speedFraction`); `gateThrottleFraction` is the
// interlock-commanded layer on top of it (mirrors transportDelay's
// `throttleFraction`/`throttleTarget`), ramping toward
// `gateThrottleTarget` at `gateThrottleRampPerSec` rather than snapping.
// Both default fully open with an instant slew rate so a gated feeder with
// no interlock commanding it yet behaves as if the gate were always wide
// open. Issue #57 only establishes this state and its ramp mechanics —
// nothing yet reads gateFraction/gateThrottleFraction into the commanded
// rate; that rate-derivation step is issue #56's own job.
function initMeteredFeeder(m) {
  return {
    kind: "meteredFeeder", rate: m.sim.rateM3PerSec, drawn: 0, manualOverride: false,
    enabled: m.sim.enabled ?? true,
    // `runPermit` (issue #47 — the packaging conveyor's own "not running"
    // process interlock) is a *second*, independent on/off gate alongside
    // `enabled`: the source selector (setSource, engine.js) owns `enabled`
    // exclusively, and the conveyor's auto-stop interlock
    // (autoStopOnNotRunning, control.js) owns this one exclusively. Keeping
    // them separate fields means either writer can flip its own gate
    // without fighting the other's — e.g. the presenter switching source
    // away from a feeder the conveyor interlock has independently stopped
    // never has one write silently clobber the other's intent.
    runPermit: true,
    ...(m.sim.hasGate ? {
      gateFraction: 1,
      // Issue #63: stamped by setGateFraction (engine.js) the first time the
      // presenter actually drags this gate's own dial — see
      // isThrottleOverridden's own comment (behaviors.js) for why.
      gateDialTouched: false,
      gateThrottleFraction: 1,
      gateThrottleTarget: 1,
      gateThrottleRampPerSec: Infinity,
    } : {}),
  };
}
// Reverse pass: how much this feeder can pull in this tick — its own
// metering rate, further bounded by whatever its own downstream can accept.
// `enabled` (issue #46 — the packaging source selector) and `runPermit`
// (issue #47 — the conveyor's own "not running" interlock) each gate intake
// to zero outright, independent of `rate` and of each other: unlike
// commandMeteredFeeder, neither overwrites the presenter's own dial, so
// switching source and back, or the conveyor tripping and recovering,
// restores whatever rate was last set rather than losing it. Both default
// to true so a feeder neither selector nor interlock ever commands
// (treatDrumFeeder) is unaffected.
function capacityAvailableMeteredFeeder(state, dt, downstreamCap) {
  if (!state.enabled || !state.runPermit) return 0;
  return Math.min(state.rate * dt, downstreamCap);
}
function applyMeteredFeeder(state, dt, inflow, cap) {
  // Issue #57: only a gated feeder (state.gateThrottleFraction present) has
  // anything to slew here — a plain meteredFeeder with no gate (e.g.
  // vibratingConveyor) skips this every tick, same as before this existed.
  if (state.gateThrottleFraction !== undefined) {
    state.gateThrottleFraction = slewToward(state.gateThrottleFraction, state.gateThrottleTarget, state.gateThrottleRampPerSec, dt);
  }
  const out = Math.min(inflow, cap);
  state.drawn += out;
  return out;
}
// Commands the feeder's rate directly, no ramp modelled — the control
// layer's own path (issue #42's auto-start interlock), kept distinct from
// `manualOverride`, which only the presenter-facing setFeederRate sets.
function commandMeteredFeeder(state, rateM3PerSec) {
  state.rate = rateM3PerSec;
}
// Commands the gate's interlock-driven throttle toward an arbitrary target
// fraction, ramping over `rampTimeSec` rather than snapping — mirrors
// transportDelay's own commandTransportDelay exactly, just over the gate's
// own throttle fields instead of the chain's. Issue #56's schedule is the
// intended caller; a gated feeder with no schedule commanding it yet never
// has this invoked and keeps its default gate throttle of 1.
function commandGateMeteredFeeder(state, targetFraction, rampTimeSec) {
  state.gateThrottleTarget = targetFraction;
  state.gateThrottleRampPerSec = rampTimeSec > 0 ? 1 / rampTimeSec : Infinity;
}
function isSettledGateMeteredFeeder(state) {
  return state.gateThrottleFraction === state.gateThrottleTarget;
}
// `rate` (issue #34) is whichever of the presenter's own dial or the
// auto-start interlock's direct command last set it — see `manualOverride`
// above. Published separately from flowRateM3PerSec (issue #28), which also
// reflects downstream backpressure, not just this commanded rate.
// `gateFraction`/`gateThrottleFraction` (issue #57) are only present on a
// gated feeder — omitted here entirely for one with none, same convention
// as every other optional snapshot field on this line (e.g. terminalSink's
// `bagCount`).
function snapshotMeteredFeeder(state) {
  const snap = { rate: state.rate, enabled: state.enabled, runPermit: state.runPermit };
  if (state.gateFraction !== undefined) {
    snap.gateFraction = state.gateFraction;
    // Issue #63: gateDialTouched/gateThrottleTarget weren't published before
    // — see snapshotTransportDelay's own comment on the identical gap there.
    snap.gateDialTouched = state.gateDialTouched;
    snap.gateThrottleFraction = state.gateThrottleFraction;
    snap.gateThrottleTarget = state.gateThrottleTarget;
  }
  return snap;
}
// The source selector's command (issue #46): gates intake on/off without
// touching `rate`, so the presenter's own dial survives being deselected
// and reselected. The control layer is not the caller here — this is a
// direct presenter action (setSource, engine.js), same category as
// setFeederRate — so unlike commandMeteredFeeder there is no interlock/
// manualOverride interaction to worry about.
function setEnabledMeteredFeeder(state, enabled) {
  state.enabled = enabled;
}
// The conveyor's own "not running" interlock command (issue #47,
// autoStopOnNotRunning in control.js): gates intake on/off exactly like
// setEnabledMeteredFeeder above, but through the independent `runPermit`
// field, so this interlock and the source selector never overwrite each
// other's gate — see `runPermit`'s own comment on initMeteredFeeder.
function setRunPermitMeteredFeeder(state, permitted) {
  state.runPermit = permitted;
}

const EPS = 1e-9;

// Manual override (issue #63): whether the operator's own dial has been
// dragged past the interlock's current live cap on this actuator. Gated on
// `dialTouched` — a per-actuator flag stamped only by the presenter's own
// live setter (setElevatorSpeed/setGateFraction, engine.js), mirroring
// meteredFeeder's existing `manualOverride` convention (issue #42) — because
// a gradedFeedSchedule band's own calibrated speed/gate targets (issue
// #56-61) are *always* below the dial's untouched default of 1: without this
// gate, every gradedFeedSchedule-governed actuator would read as overridden
// the instant its schedule engaged, on a totally fresh run nobody has
// touched. Once touched, the rest of the check is a stateless comparison
// recomputed every tick, so it needs no special-case interaction with RESET
// TRIPS (never touches `dialTouched`, only the rule's own latch) or RESTART
// (which re-inits every machine, `dialTouched` included). Gated on
// `throttleTarget > 0` alone (never on the rule kind that set it) since a
// full stop is never overridable and there's no structural way to tell a
// full stop apart from a merely-low partial throttle other than the target
// value itself — see control.js's stepTwoStageThrottle, where the slow
// stage and the stop stage command the identical field.
export function isThrottleOverridden(dialTouched, dialFraction, throttleFraction, throttleTarget) {
  return dialTouched && throttleTarget > 0 && dialFraction > throttleFraction;
}

// Shared by plain transportDelay's and routedTransportDelay's own
// capacityAvailable — both carry the identical speedFraction/speedDialTouched/
// throttleFraction/throttleTarget shape (see each kind's own init), so this
// one swap applies unchanged to either.
function overriddenSpeedFraction(state) {
  return isThrottleOverridden(state.speedDialTouched, state.speedFraction, state.throttleFraction, state.throttleTarget)
    ? state.speedFraction
    : state.throttleFraction;
}

// `hasDownstream` (issue #21) is the engine's answer to "does a sim-enabled
// machine actually sit downstream of me", separate from the *value* of
// downstreamCap (which is legitimately 0 both when genuinely blocked and
// when nothing is modelled downstream — those two cases need different
// behaviour and can't be told apart from the number alone). Without it,
// wiring a real downstream onto a machine that used to report its own
// throughput as "delivered" (meteredFeeder; transportDelay below) would
// double-count every unit of volume against whatever the new downstream
// now separately accounts for in its own stored/inTransit.
function conserveMeteredFeeder(state, hasDownstream) {
  return hasDownstream ? {} : { delivered: state.drawn };
}

// Transport delay (issue #21): a FIFO pipe that holds material for a
// derived transit time before it can discharge — the primitive behind any
// device where infeed and discharge are genuinely decoupled in time (a
// bucket elevator's carrying run, and per the acceptance criteria, later a
// packaging elevator or a long conveyor). `distanceM` / `speedMPerMin` are
// named generically (not "riseHeightM" / "chainSpeedMPerMin") so the same
// behaviour serves a horizontal conveyor as well as an elevator's lift.
//
// Each queued packet tracks `progress` (0..1 of the transit) rather than a
// fixed arrival time, so a live speed change (the VFD) instantly re-paces
// every packet already in transit, not just newly accepted material — a
// real chain has one speed for everything riding it.
//
// Accept and discharge are bounded independently: accepting new material is
// gated only by the throughput ceiling and by `backlog` (material that has
// finished its transit but couldn't leave — the chain backing up at the
// head, per the acceptance criteria); discharging is bounded by the ceiling
// and, only when a sim-enabled machine is actually downstream, by that
// machine's own headroom. A transport delay with nothing sim-enabled
// downstream of it (e.g. the packaging elevator, still unbuilt) discharges
// unconstrained by anything downstream instead, mirroring meteredFeeder's
// own "nothing sim-enabled downstream yet" convention — see conserve below.
// The treating elevator itself has had a real downstream (the treater
// pre-bin) since issue #22.
function initTransportDelay(m) {
  return {
    kind: "transportDelay",
    distanceM: m.sim.distanceM,
    speedMPerMin: m.sim.speedMPerMin,
    ceilingM3PerSec: m.sim.ceilingM3PerSec,
    speedFraction: 1, // manual VFD dial (issue #21) — presenter-set, takes effect instantly
    // Issue #63: stamped by setElevatorSpeed (engine.js) the first time the
    // presenter actually drags this dial — see isThrottleOverridden's own
    // comment for why the manual override it gates needs this rather than a
    // bare `speedFraction` comparison.
    speedDialTouched: false,
    // Interlock-commanded multiplier on top of the manual dial (issue #22):
    // `throttleFraction` slews toward `throttleTarget` at `throttleRampPerSec`
    // rather than snapping, exactly like the source valve's openness — this
    // is what makes "slow down, then stop" a ramp instead of a step, and
    // what lets a presenter's own speed slider and an automatic interlock
    // coexist without one silently overwriting the other. Defaults to fully
    // open with an instant slew rate so nothing changes for a machine no
    // interlock ever commands.
    throttleFraction: 1,
    throttleTarget: 1,
    throttleRampPerSec: Infinity,
    queue: [],       // [{ progress, vol }] material past the infeed, still travelling
    backlog: 0,      // volume that finished transit but discharge hasn't taken it yet
    delivered: 0,
  };
}
function chainSpeedMPerSec(state) {
  return (state.speedMPerMin * state.speedFraction * state.throttleFraction) / 60;
}
function queueVolume(state) {
  return state.queue.reduce((a, p) => a + p.vol, 0);
}
function capacityAvailableTransportDelay(state, dt) {
  // A backed-up discharge blocks new infeed too, a simplified stand-in for
  // the chain physically filling up — exact bucket count/volume/chain
  // length are still unconfirmed (see docs/OPEN_QUESTIONS.md), so this
  // doesn't attempt to track precise in-chain capacity.
  if (state.backlog > EPS) return 0;
  // Intake scales with the interlock's throttle (issue #22): a slowed chain
  // carries fewer buckets past the infeed per second, and a stopped one
  // (throttleFraction 0) accepts nothing new — this is the "reduces the
  // infeed" half of the two-stage response, distinct from the manual VFD
  // dial (`speedFraction`), which only ever affected transit *timing* until
  // issue #63: dragging the dial past the throttle's own live cap now swaps
  // it in as the real intake multiplier too, so a presenter can deliberately
  // push more material past a governing interlock instead of the dial being
  // cosmetic. Chain transit speed itself (chainSpeedMPerSec) is unaffected
  // either way — override bypasses the intake ceiling, not the interlock's
  // own commanded chain speed.
  return state.ceilingM3PerSec * overriddenSpeedFraction(state) * dt;
}
function applyTransportDelay(state, dt, inflow, cap, downstreamCap = 0, hasDownstream = false) {
  const accepted = Math.min(inflow, cap);
  if (accepted > 0) state.queue.push({ progress: 0, vol: accepted });

  state.throttleFraction = slewToward(state.throttleFraction, state.throttleTarget, state.throttleRampPerSec, dt);
  const v = chainSpeedMPerSec(state);
  const progressStep = state.distanceM > 0 ? (v * dt) / state.distanceM : 0;
  const still = [];
  for (const pkt of state.queue) {
    const progress = pkt.progress + progressStep;
    if (progress >= 1) state.backlog += pkt.vol;
    else still.push({ progress, vol: pkt.vol });
  }
  state.queue = still;

  const dischargeCeiling = state.ceilingM3PerSec * dt;
  const dischargeCap = hasDownstream ? Math.min(dischargeCeiling, downstreamCap) : dischargeCeiling;
  const out = Math.min(state.backlog, dischargeCap);
  state.backlog -= out;
  state.delivered += out;
  return out;
}
function conserveTransportDelay(state, hasDownstream) {
  const inTransit = queueVolume(state) + state.backlog;
  return hasDownstream ? { inTransit } : { inTransit, delivered: state.delivered };
}
// Plant control (issue #55): discards everything in transit — the queue and
// the backlog alike — leaving `delivered` (a cumulative counter) untouched.
function clearTransportDelay(state) {
  const discarded = queueVolume(state) + state.backlog;
  state.queue = [];
  state.backlog = 0;
  return discarded;
}

// Issue #31: bands the packet queue into `bandCount` equal-width slices of
// progress (0 = infeed, 1 = discharge) and sums each band's volume. Every
// packet is a single point of progress carrying a volume — there's no
// notion of how far it "spans" — so summing per band is the natural proxy
// for local density, and comparable band-to-band since every band is the
// same width. A pure function of the queue alone (no dt, no machine
// constants) so it's testable against a fabricated queue without stepping a
// live sim.
export function packetDensityProfile(queue, bandCount) {
  const bands = new Array(bandCount).fill(0);
  for (const pkt of queue) {
    if (pkt.progress < 0) continue;
    // Clamped rather than skipped at the top end (progress in the queue
    // never actually reaches 1 — applyTransportDelay moves a packet to
    // backlog the moment it does) so this matches the same clamped
    // fraction-to-band-index mapping the renderer uses for its own
    // pathFrac, rather than two formulas quietly drifting apart.
    bands[Math.min(bandCount - 1, Math.floor(pkt.progress * bandCount))] += pkt.vol;
  }
  return bands;
}

// Rendering wants each band's density expressed relative to a *fixed*
// reference, not the chain's live speed — dividing by a reference that
// itself scales with live speed would cancel out exactly the effect issue
// #31 wants visible (speeding up the chain with feed unchanged spreads the
// same volume over more chain length, thinning the real per-band volume;
// normalizing by a reference tied to that same live speed would shrink in
// lockstep and hide it). So the reference is "how much volume would occupy
// one band if the chain ran continuously at its nameplate ceiling and
// design speed" — fixed for a given machine, independent of the live VFD
// dial or interlock throttle.
// Arbitrary render-resolution pick, unrelated to the decorative bucket
// spacing in symbols.jsx (that's a pixel-space constant; this is a
// progress-space one) — coarse enough that each band aggregates several
// ticks' worth of packets into one smooth-reading value.
const DENSITY_BANDS = 24;
function nominalBandVolume(state, bandCount) {
  const nominalV = state.speedMPerMin / 60;
  if (!(nominalV > 0) || !(state.distanceM > 0)) return 0;
  const nominalTransitSec = state.distanceM / nominalV;
  return (state.ceilingM3PerSec * nominalTransitSec) / bandCount;
}
// Issue #69: the shared tail of transportDelay's and routedTransportDelay's
// own snapshot — normalise the reference band volume, band the queue, then
// express each band relative to that reference. Lifted out so the two
// snapshots share one copy rather than drifting again (routedTransportDelay
// used to skip publishing a densityProfile at all). `queueForBands` lets
// routedTransportDelay pass in a queue whose `.progress` has already been
// converted onto the machine's shared whole-run scale (see
// wholeRunFraction below) — plain transportDelay's own queue already lives
// on that scale, so it passes `state.queue` through unchanged.
function densityProfileFromQueue(state, bandCount, queueForBands) {
  const refBandVol = nominalBandVolume(state, bandCount);
  const rawBands = packetDensityProfile(queueForBands, bandCount);
  return refBandVol > 0 ? rawBands.map((vol) => Math.min(1, vol / refBandVol)) : rawBands.map(() => 0);
}
function snapshotTransportDelay(state) {
  const inTransitVol = queueVolume(state);
  const hasMaterial = state.queue.length > 0 || state.backlog > 0;
  // Leading/trailing progress bound the span of the chain currently
  // carrying material, so the scene can render the sweep from boot to
  // discharge on startup and the drain back to empty once feed stops.
  const leadingProgress = hasMaterial
    ? Math.max(state.backlog > 0 ? 1 : 0, 0, ...state.queue.map((p) => p.progress))
    : 0;
  const trailingProgress = state.queue.length > 0 ? Math.min(...state.queue.map((p) => p.progress)) : leadingProgress;
  const v = chainSpeedMPerSec(state);
  const densityProfile = densityProfileFromQueue(state, DENSITY_BANDS, state.queue);
  return {
    inTransitVol, backlogVol: state.backlog,
    leadingProgress, trailingProgress,
    transitTimeSec: v > 0 ? state.distanceM / v : Infinity,
    speedFraction: state.speedFraction,
    // Issue #63: speedDialTouched/throttleTarget weren't published before —
    // PARAM_READERS (PlantApp.jsx) needs both to compute the override-armed
    // state and the "never overridable past a full stop" gate itself.
    speedDialTouched: state.speedDialTouched,
    throttleFraction: state.throttleFraction,
    throttleTarget: state.throttleTarget,
    // Actual live chain speed (issue #31), already folding in both the
    // manual VFD dial and any active interlock throttle via chainSpeedMPerSec.
    chainSpeedMPerMin: v * 60,
    densityProfile,
  };
}
// Commands the interlock-driven throttle toward an arbitrary target fraction
// (issue #22 needs "half speed" and "stopped", not just source's binary
// open/close), ramping over `rampTimeSec` rather than snapping — the two
// stage interlock (control.js) is the only caller; a transport delay with no
// interlock on it never has this invoked and keeps its default throttle of 1.
function commandTransportDelay(state, targetFraction, rampTimeSec) {
  state.throttleTarget = targetFraction;
  state.throttleRampPerSec = rampTimeSec > 0 ? 1 / rampTimeSec : Infinity;
}
function isSettledTransportDelay(state) {
  return state.throttleFraction === state.throttleTarget;
}
// Issue #42: the auto-start interlock's read of "is this elevator confirmed
// running" — the engineer named the trigger (the drum feeder starts once
// the bucket elevator is confirmed running) but not the underlying signal
// (a motor run-proof switch? an immediate command-issued flag? something
// that only asserts once the chain reaches full commanded speed?), so this
// assumes it's the elevator's own commanded speed settled at a nonzero
// value — both the manual VFD dial (`speedFraction`) and the interlock's
// own throttle (`throttleFraction`/`throttleTarget`) folded in, since
// either one sitting at 0 means the chain genuinely isn't moving, and
// "settled" (not mid-ramp) so a throttle still easing down through a
// nonzero fraction on its way to a full stop doesn't read as running. See
// docs/OPEN_QUESTIONS.md.
function isConfirmedRunningTransportDelay(state) {
  return isSettledTransportDelay(state) && chainSpeedMPerSec(state) > 0;
}

// Routed transport delay (issue #47): the packaging conveyor 52.604.E00
// combines transportDelay's own carrying-run physics with the router
// concept (see `router` below) — one FIFO chain, but each packet remembers
// which outlet it was destined for at the moment it entered, so a mid-run
// destination switch (the presenter's own affordance, off-spec per the FD —
// the real plant only selects at sequence start) never reroutes material
// already in transit: everything already on the chain keeps travelling to
// the outlet it was accepted for, and only newly-accepted material follows
// the new selection. This is *why* it can't just be a plain `transportDelay`
// feeding a downstream `router` node — a router downstream of the queue
// would have no memory of which destination was selected when each packet
// actually entered, and would reroute in-flight material the instant the
// selector changes.
//
// Reuses transportDelay's own timing helpers (slewToward via
// chainSpeedMPerSec, queueVolume) unchanged rather than duplicating them —
// only the discharge side genuinely differs. Kept as its own registered
// kind rather than folding into `transportDelay` itself (behaviors.js's
// other machines, e.g. treatingElevator, stay untouched and untested by
// this) since every existing transportDelay call site assumes a single
// scalar downstream/backlog, and this is the only machine on the line that
// needs more than one discharge port.
function initRoutedTransportDelay(m) {
  return {
    kind: "routedTransportDelay",
    distanceM: m.sim.distanceM,
    // Issue #69: each outlet's own along-belt distance from the infeed
    // (lineData.js's own `portDistanceM`, e.g. the pendulum conveyor's three
    // pneumatically selected outlets sitting at very different points along
    // one physical run) — a port missing here falls back to the shared
    // `distanceM` in portDistanceMFor below, which is every port on every
    // routedTransportDelay machine except the pendulum conveyor, so this
    // defaulting to `{}` keeps every other machine's single-distance timing
    // exactly as it always was.
    portDistanceM: m.sim.portDistanceM ?? {},
    speedMPerMin: m.sim.speedMPerMin,
    ceilingM3PerSec: m.sim.ceilingM3PerSec,
    speedFraction: 1,
    speedDialTouched: false, // issue #63 — see plain transportDelay's own initTransportDelay comment
    throttleFraction: 1,
    throttleTarget: 1,
    throttleRampPerSec: Infinity,
    // Defaults to the machine's own first declared output port so a line
    // that never calls the destination selector (every test predating issue
    // #47) keeps routing to exactly the port it always implicitly used.
    selected: m.sim.defaultPort ?? m.ports.outputs[0],
    queue: [],       // [{ progress, vol, port, distanceM }] material past the infeed, still
                      // travelling — `distanceM` is this packet's own destination's transit
                      // distance (issue #69), stamped once at accept time so a later
                      // destination switch never rewrites an in-flight packet's pacing
    backlogEntries: [], // [{ vol, port }] FIFO, finished transit, not yet discharged
    backlog: 0,      // total backlog volume across every port — kept in lockstep with
                      // backlogEntries so external readers (tests, the popup) see the
                      // exact same scalar plain transportDelay machines publish
    delivered: 0,
  };
}
// Issue #69: `port`'s own transit distance, or the shared whole-run
// `distanceM` when this machine has no per-port split (see initRoutedTransportDelay).
function portDistanceMFor(state, port) {
  return state.portDistanceM[port] ?? state.distanceM;
}
// Issue #69: converts a packet's own progress (0..1 of *its* destination's
// distance, see applyRoutedTransportDelay) back onto the machine's shared
// 0..1 whole-run scale — the one every packet can be compared and banded on
// regardless of which outlet it's bound for, and the same scale the render
// draws its buckets across.
function wholeRunFraction(state, pkt) {
  return state.distanceM > 0 ? (pkt.progress * pkt.distanceM) / state.distanceM : 0;
}
function totalBacklogVolume(state) {
  return state.backlogEntries.reduce((a, e) => a + e.vol, 0);
}
function capacityAvailableRoutedTransportDelay(state, dt) {
  // A backed-up discharge (on *any* port) blocks new infeed too, the same
  // simplified stand-in for the chain physically filling up that plain
  // transportDelay uses — the single physical chain can't accept new
  // material at the infeed while anything is still jammed at the discharge
  // end, regardless of which outlet the jam is destined for.
  if (state.backlog > EPS) return 0;
  // Manual override (issue #63): same swap as plain transportDelay's own
  // capacityAvailableTransportDelay above — see overriddenSpeedFraction's
  // own comment.
  return state.ceilingM3PerSec * overriddenSpeedFraction(state) * dt;
}
function applyRoutedTransportDelay(state, dt, inflow, cap, downstreamCap = {}, hasDownstream = {}) {
  const accepted = Math.min(inflow, cap);
  if (accepted > 0) {
    state.queue.push({ progress: 0, vol: accepted, port: state.selected, distanceM: portDistanceMFor(state, state.selected) });
  }

  state.throttleFraction = slewToward(state.throttleFraction, state.throttleTarget, state.throttleRampPerSec, dt);
  const v = chainSpeedMPerSec(state);
  const still = [];
  for (const pkt of state.queue) {
    // Issue #69: paced against this packet's own distance, not the shared
    // whole-run one — the single physical chain moves everyone at the same
    // v, but a packet bound for a nearer outlet has less ground to cover, so
    // it reaches progress 1 (and discharges) sooner.
    const progressStep = pkt.distanceM > 0 ? (v * dt) / pkt.distanceM : 0;
    const progress = pkt.progress + progressStep;
    if (progress >= 1) state.backlogEntries.push({ vol: pkt.vol, port: pkt.port });
    else still.push({ progress, vol: pkt.vol, port: pkt.port, distanceM: pkt.distanceM });
  }
  state.queue = still;

  // Discharge is strictly FIFO across ports, not per-port parallel: the
  // conveyor has exactly one physical discharge point, so material queued
  // ahead of a still-blocked entry can't "skip ahead" onto a different,
  // currently-unblocked outlet — a literal single-file jam, the same
  // physical picture the backlog-blocks-infeed rule above already assumes.
  let dischargeBudget = state.ceilingM3PerSec * dt;
  const outflow = {};
  const remaining = [];
  let stalled = false;
  for (const entry of state.backlogEntries) {
    if (stalled || dischargeBudget <= EPS) {
      remaining.push(entry);
      continue;
    }
    const portCap = hasDownstream[entry.port] ? downstreamCap[entry.port] ?? 0 : Infinity;
    const out = Math.min(entry.vol, dischargeBudget, portCap);
    outflow[entry.port] = (outflow[entry.port] ?? 0) + out;
    dischargeBudget -= out;
    if (!hasDownstream[entry.port]) state.delivered += out;
    if (out < entry.vol - EPS) {
      remaining.push({ vol: entry.vol - out, port: entry.port });
      stalled = true;
    }
  }
  state.backlogEntries = remaining;
  state.backlog = totalBacklogVolume(state);
  return outflow;
}
function conserveRoutedTransportDelay(state) {
  const inTransit = queueVolume(state) + state.backlog;
  return { inTransit, delivered: state.delivered };
}
// Plant control (issue #55): the packaging conveyor's own clear — the queue
// and the per-port backlog entries alike, mirroring plain transportDelay's
// own clearTransportDelay, but over `backlogEntries` rather than a bare
// scalar. `selected` (the destination routing) is untouched — that's the
// presenter's own destination-selector state, not held material.
function clearRoutedTransportDelay(state) {
  const discarded = queueVolume(state) + state.backlog;
  state.queue = [];
  state.backlogEntries = [];
  state.backlog = 0;
  return discarded;
}
function snapshotRoutedTransportDelay(state) {
  const inTransitVol = queueVolume(state);
  const hasMaterial = state.queue.length > 0 || state.backlog > 0;
  // Issue #69: every packet's own `progress` is normalised against its own
  // destination's distance (applyRoutedTransportDelay above), so leading/
  // trailing/the density bands below all need packets converted onto the
  // shared whole-run scale first — otherwise a packet bound for a nearer
  // outlet would read as "further along" than one bound for a farther
  // outlet at the same actual physical position.
  const normalizedQueue = state.queue.map((p) => ({ progress: wholeRunFraction(state, p), vol: p.vol }));
  const leadingProgress = hasMaterial
    ? Math.max(state.backlog > 0 ? 1 : 0, 0, ...normalizedQueue.map((p) => p.progress))
    : 0;
  const trailingProgress = normalizedQueue.length > 0 ? Math.min(...normalizedQueue.map((p) => p.progress)) : leadingProgress;
  const v = chainSpeedMPerSec(state);
  // Issue #69: the bands themselves are never masked past the selected
  // outlet. Each packet's own progress is already normalised against its
  // own destination's distance (wholeRunFraction above), so a packet bound
  // for outBuffer cannot read past outBuffer's own fraction of the whole
  // run in the first place — and a packet bound for a *farther* outlet than
  // the one currently selected genuinely is still out there, mid-run, and
  // has to keep being reported where it really is. Masking the bands on the
  // live selection instead (an earlier version of this) erased exactly that
  // material the instant a presenter picked a nearer outlet.
  const densityProfile = densityProfileFromQueue(state, DENSITY_BANDS, normalizedQueue);
  return {
    inTransitVol, backlogVol: state.backlog,
    leadingProgress, trailingProgress,
    transitTimeSec: v > 0 ? portDistanceMFor(state, state.selected) / v : Infinity,
    speedFraction: state.speedFraction,
    speedDialTouched: state.speedDialTouched, // issue #63 — see plain transportDelay's own snapshot comment
    throttleFraction: state.throttleFraction,
    throttleTarget: state.throttleTarget,
    chainSpeedMPerMin: v * 60,
    selected: state.selected,
    densityProfile,
    // Issue #69: where material accepted *right now* leaves this machine,
    // as a fraction of the whole drawn run. The bands above can't express
    // this on their own: the render carries a bucket's load unchanged from
    // the boot onward (elevatorMotion.js's carryBucketLoads, deliberately
    // ignoring live density past the loading zone, so a part-filled band at
    // the material front doesn't read as a half-empty bucket), so a bucket
    // loaded before the selected outlet would ride straight past it to the
    // head unless it is told where to tip its grain out. Sampled per bucket
    // *at loading time* and carried with that bucket's load, never applied
    // to the whole chain at once — see carryBucketLoads' own comment for
    // why the difference is what makes a mid-run switch behave.
    selectedSpanFraction: state.distanceM > 0 ? portDistanceMFor(state, state.selected) / state.distanceM : 1,
  };
}
// Interlock throttle command (issue #22's own shape, e.g. the metal bins'
// high-level trip): identical semantics to plain transportDelay's own
// commandTransportDelay — a target speed fraction, ramped over
// `rampTimeSec` — kept as a separate function only because it operates on
// this kind's own state shape, not because the behaviour differs.
function commandRoutedTransportDelay(state, targetFraction, rampTimeSec) {
  state.throttleTarget = targetFraction;
  state.throttleRampPerSec = rampTimeSec > 0 ? 1 / rampTimeSec : Infinity;
}
function isSettledRoutedTransportDelay(state) {
  return state.throttleFraction === state.throttleTarget;
}
function isConfirmedRunningRoutedTransportDelay(state) {
  return isSettledRoutedTransportDelay(state) && chainSpeedMPerSec(state) > 0;
}
// Destination selection (issue #47): which named output port newly-accepted
// material is tagged with, from this tick's infeed onward — see the queue's
// own per-packet `port` field above for why this alone is what makes a
// mid-run switch conserve without special-casing. Distinct from `command`
// above (the interlock's own speed-fraction throttle): one selects *where*
// material goes, the other *whether* it moves at all, and both need to
// coexist on this one machine without one overwriting the other's target.
function selectPortRoutedTransportDelay(state, port) {
  state.selected = port;
}

// Batch cycle (issue #24): the primitive behind any machine that takes a
// fixed charge, holds it for a cycle, then discharges the whole charge as a
// pulse — the batch treater today, and per the parent spec (issue #15) the
// Concetti bagging scale, the Concetti filler and the Flexicon big-bag
// filling head later, all sharing this unchanged.
//
// `phases` (from the line data) names the sub-steps of the hold: the
// engineer gave one unsplit cycle time with no fill/treat/discharge
// breakdown and was explicit he'd have to ask the supplier
// (docs/OPEN_QUESTIONS.md), so `phases` holds exactly one entry today. This
// behaviour only ever sums every phase's duration into `cycleSec` — it
// never reads an individual phase's length — so a future fill/treat/
// discharge split is a data edit to `phases`, not a restructuring of this
// function.
//
// A charge is drawn gradually into `held` rather than snatched in one
// forced atomic pull, because a behaviour's capacityAvailable only ever
// sees its own downstream, never what its upstream can actually supply this
// tick (see engine.js's reverse pass) — there is no seam through which to
// demand "the whole charge or nothing" from the pre-bin in a single tick.
// In the ordinary case the pre-bin holds far more than one charge, so the
// accumulator behaviour's own uncapped discharge (min(stored, downstreamCap),
// no rate limit of its own) still hands over the full charge in a single
// tick — the atomic "draws a fixed charge" the acceptance criteria
// describe. The gradual path only engages when the pre-bin itself is short,
// and even then no partial charge is ever treated as complete: the hold
// timer (and the eventual discharge pulse) only starts once `held` reaches
// `chargeM3` exactly, so an under-supplied treater simply waits rather than
// batching short.
// Exported since the scene layer's flow-animation nominal-rate computation
// (issue #35, src/scene/flowAnimation.js) needs the same sum as a static
// fallback for a tick before the first snapshot publishes state.cycleSec.
export function cycleSecFromPhases(phases) {
  return phases.reduce((a, p) => a + p.durationSec, 0);
}

function initBatchCycle(m) {
  const cycleSec = cycleSecFromPhases(m.sim.phases);
  return {
    kind: "batchCycle",
    chargeM3: m.sim.chargeM3,
    cycleSec,
    phase: "charging", // charging -> holding -> discharging -> charging
    held: 0,
    elapsedSec: 0,
    drawn: 0,
    delivered: 0,
    // Hold-next-batch interlock (issue #25 — the treater after-bin's
    // response to a full bin): a simple accept/block gate, not a ramp, so
    // unlike the source valve's openness or the elevator's throttle there is
    // nothing to slew — the actuator either accepts a fresh charge or it
    // doesn't. Defaults open so a batch-cycle machine no interlock ever
    // commands keeps issue #24's behaviour exactly.
    blocked: false,
    // Utilities trip (issue #51): unlike `blocked`, which only withholds a
    // *fresh* charge, `stopped` freezes the machine exactly where it is —
    // mid-charging, mid-holding or mid-discharging — the same "product left
    // stranded wherever it is" a real trip demands and no existing interlock
    // on this line has ever needed (every prior one deliberately lets an
    // in-progress charge finish, see controlledStop.js's own comment on this
    // same field's absence there). Independent of `blocked` so the two never
    // fight: a utilities reset only ever clears this flag, never `blocked`,
    // and vice versa. Defaults false so a batch-cycle machine no interlock
    // ever commands keeps issue #24's behaviour exactly.
    stopped: false,
  };
}
// Reverse pass: only wants more material while actively charging, and only
// up to what's still missing from the current charge — never more, so a
// generous upstream can't overshoot the fixed batch size. Holding and
// discharging both report 0: the treater accepts nothing new until the
// current charge has fully left, matching "does not start a partial batch".
// `blocked` (issue #25) additionally withholds capacity, but only while
// `held` is still 0 — a charge already under way (held > 0) is "the current
// cycle" the engineer said a full after-bin must not interrupt, so once a
// charge has started accepting material it runs to completion regardless of
// when the interlock trips; only a charge that hasn't started yet (fresh off
// the previous discharge, or at boot) is what "does not accept more seed for
// another batch" actually withholds.
function capacityAvailableBatchCycle(state) {
  if (state.stopped) return 0;
  if (state.phase !== "charging") return 0;
  if (state.held === 0 && state.blocked) return 0;
  return Math.max(0, state.chargeM3 - state.held);
}
function applyBatchCycle(state, dt, inflow, cap, downstreamCap = 0, hasDownstream = false) {
  // Issue #51: a genuine trip, unlike `blocked` above, freezes the machine
  // outright — no phase advances, no hold timer ticks, no discharge — so a
  // charge caught mid-cycle stays exactly where the trip found it rather
  // than running on to its next natural transition.
  if (state.stopped) return 0;
  const accepted = Math.min(inflow, cap);
  state.held += accepted;
  state.drawn += accepted;

  if (state.phase === "charging" && state.held >= state.chargeM3 - EPS) {
    state.phase = "holding";
    state.elapsedSec = 0;
  }

  if (state.phase === "holding") {
    state.elapsedSec += dt;
    if (state.elapsedSec >= state.cycleSec) {
      state.phase = "discharging";
    }
  }

  let out = 0;
  if (state.phase === "discharging") {
    // No discharge rate is modelled: nothing sim-enabled sits downstream of
    // the treater yet (the after-bin is issue #25), and the engineer's own
    // description is a pulse, not a metered outflow — so an unconstrained
    // downstream drains the whole charge in the single tick discharge
    // begins, which is the pulse the acceptance criteria describe. A future
    // sim-enabled downstream still bounds it via downstreamCap exactly like
    // every other behaviour, so a momentarily full after-bin holds the
    // charge here — mid-cycle, still accounted for — rather than losing it.
    const dischargeCap = hasDownstream ? downstreamCap : Infinity;
    out = Math.min(state.held, dischargeCap);
    state.held -= out;
    state.delivered += out;
    if (state.held <= EPS) {
      state.held = 0;
      state.phase = "charging";
    }
  }

  return out;
}
// Held volume — whether mid-charge or mid-cycle — is neither delivered nor
// lost: it folds into the same `inTransit` bucket transportDelay's queue/
// backlog uses, per the acceptance criteria's "accounted for as neither
// delivered nor lost". `hasDownstream` follows the same convention as
// meteredFeeder and transportDelay: only report cumulative "delivered" when
// nothing sim-enabled downstream already accounts for that same volume
// itself.
function conserveBatchCycle(state, hasDownstream) {
  return hasDownstream ? { inTransit: state.held } : { inTransit: state.held, delivered: state.delivered };
}
// Plant control (issue #55): discards whatever charge is currently held —
// mid-charging, mid-holding or mid-discharging alike — and resets the cycle
// back to a fresh "charging" phase rather than leaving it holding or
// discharging a now-empty charge. `blocked` (the hold-next-batch interlock)
// and `stopped` (the utilities trip) are both latched trip state, per
// clearPlant's own contract, so neither is touched here.
function clearBatchCycle(state) {
  const discarded = state.held;
  state.held = 0;
  state.phase = "charging";
  state.elapsedSec = 0;
  return discarded;
}
// `phase` here is the same charging/holding/discharging value apply() drives
// — except when a fresh charge is being withheld by the hold-next-batch
// interlock (issue #25), which is reported as "waiting" rather than
// "charging" so the popup and event log can tell "hasn't started its next
// batch because it's blocked" apart from "hasn't started because the pre-bin
// is starving it" or "stopped" outright. Derived here rather than stored as
// a distinct state.phase value, since capacityAvailableBatchCycle's own
// check (blocked && held === 0) already gives the exact condition for free.
// `stopped` (issue #51) takes priority over both: a utilities trip can catch
// this machine mid-charging, mid-holding or mid-discharging, and the popup
// should read "stopped" regardless of which phase it was frozen in.
function snapshotBatchCycle(state) {
  const waiting = state.phase === "charging" && state.held === 0 && state.blocked;
  return {
    fill: state.chargeM3 > 0 ? state.held / state.chargeM3 : 0,
    phase: state.stopped ? "stopped" : waiting ? "waiting" : state.phase,
    // chargeM3/cycleSec (issue #35): published live, not just read off the
    // line's authored sim block, since setBatchSize/setBatchCycleSec (both
    // issue #24 presenter controls) mutate these on `state` directly — the
    // flow-animation overlay normalizes against whichever one the presenter
    // is actually running, the same live-dial convention issue #34's own
    // readBinds use for the source and metered feeder.
    chargeM3: state.chargeM3,
    cycleSec: state.cycleSec,
  };
}
// Commands the hold-next-batch gate (issue #25). The control layer is the
// only caller; a batch-cycle machine no interlock ever commands never has
// this invoked and keeps its default `blocked: false`.
function commandBatchCycle(state, blocked) {
  state.blocked = blocked;
}
// Utilities trip (issue #51): the immediate, total stop `blocked` above was
// never meant to provide (see `stopped`'s own comment on initBatchCycle).
// The control layer is not the caller here — utilitiesTrip.js is, the same
// category of direct commander controlledStop.js already is for the other
// actuator kinds.
function setStoppedBatchCycle(state, stopped) {
  state.stopped = stopped;
}

// Splitter (issue #26): divides a single infeed across two named output
// ports by a fixed fraction — the treatment scalping screen's real job (16mm
// aperture: oversize to waste, the rest to product), and per the parent spec
// (issue #15) the primitive later meant for the metal removers and auto
// samplers too, each the same "divert a small fraction to a second named
// port" shape. Holds no material of its own — negligible holdup, per the
// engineer's own description of the screen (REAL_LINE_SPECS.md §5) — so
// unlike accumulator/batchCycle there is no stored/held field: whatever is
// accepted this tick is fully routed this same tick, like passThrough.
//
// `ceilingM3PerSec` is the screen's confirmed 64.4 t/h rating
// (REAL_LINE_SPECS.md §5/§12) — "well oversized" against the line's ~12-14.4
// t/h, so it is never the limiter in ordinary running (the acceptance
// criterion's "does not become a bottleneck"). It is still a real ceiling,
// the same convention transportDelay uses, so a deliberately overwhelming
// feed still backs up rather than passing through at any rate.
//
// This is the line's first behaviour with more than one product output, so
// the engine (engine.js, see `multiOutput`) generalises downstreamCap/
// hasDownstream from a single value to an object keyed by port name whenever
// a kind opts in — every other, single-output kind is unaffected.
function initSplitter(m) {
  return {
    kind: "splitter",
    wasteFraction: m.sim.wasteFraction,
    ceilingM3PerSec: m.sim.ceilingM3PerSec,
    outTotal: 0,
    wasteTotal: 0,
    // Only accrue "delivered" on a port with nothing sim-enabled downstream
    // (see conserve below) — same per-port convention as everything else
    // that reports a cumulative "delivered", except a splitter can have one
    // wired branch and one not (the screen's waste port feeds a real sink,
    // its product port still feeds an un-engined drum feeder).
    outDelivered: 0,
    wasteDelivered: 0,
    flowing: false,
  };
}
// Reverse pass: how much this splitter can accept is bounded by whichever
// branch is tightest for its own share of the split, scaled back up to the
// whole inflow — a full waste bin or a starved product route each throttle
// intake in proportion to the fraction that actually flows there, not the
// raw downstream number.
function capacityAvailableSplitter(state, dt, downstreamCap) {
  const f = state.wasteFraction;
  const ceiling = state.ceilingM3PerSec * dt;
  const fromOut = f < 1 ? downstreamCap.out / (1 - f) : Infinity;
  const fromWaste = f > 0 ? downstreamCap.waste / f : Infinity;
  return Math.min(ceiling, fromOut, fromWaste);
}
function applySplitter(state, dt, inflow, cap, downstreamCap, hasDownstream) {
  const accepted = Math.min(inflow, cap);
  const wasteWant = accepted * state.wasteFraction;
  const outWant = accepted - wasteWant;
  const outFlow = Math.min(outWant, hasDownstream.out ? downstreamCap.out : Infinity);
  const wasteFlow = Math.min(wasteWant, hasDownstream.waste ? downstreamCap.waste : Infinity);
  state.outTotal += outFlow;
  state.wasteTotal += wasteFlow;
  if (!hasDownstream.out) state.outDelivered += outFlow;
  if (!hasDownstream.waste) state.wasteDelivered += wasteFlow;
  // Recomputed fresh every tick, not accumulated: a snapshot-only signal
  // for whether material is passing through *right now*, since the
  // behaviour otherwise holds nothing a fill bar could show (see
  // snapshotSplitter below).
  state.flowing = outFlow + wasteFlow > EPS;
  return { out: outFlow, waste: wasteFlow };
}
// Holds nothing of its own, so its only conservation contribution is
// whatever it has routed onward that nothing sim-enabled downstream already
// accounts for — tracked per-port at apply-time above, so this ignores the
// whole-machine `hasDownstream` boolean conservation.js passes every other
// kind's conserve (it can't distinguish "wired on one port, not the other").
function conserveSplitter(state) {
  return { delivered: state.outDelivered + state.wasteDelivered };
}
// A splitter holds no material, so it has no fill level to show — `flowing`
// is the presenter-facing stand-in (ScreenSymbol pulses its mesh while
// true), the same role `backlogVol > 0` plays for the elevator's discharge
// gap.
function snapshotSplitter(state) {
  return { flowing: state.flowing, wasteFraction: state.wasteFraction };
}

// Router (issue #47): the Diverter concept from the glossary, deliberately
// distinct from splitter above — a splitter divides one inflow across two
// ports *simultaneously* by a fixed fraction; a router sends the *whole* of
// its inflow to exactly one named port, chosen by command, with the other
// declared ports carrying nothing until reselected. Holds no material of
// its own, like splitter and passThrough. The outload diverter (52.612.V00,
// choosing between the two treated metal bins) uses this kind directly; the
// packaging conveyor (52.604.E00) needs the same one-port-at-a-time
// selection but combined with real transport lag, so it uses
// `routedTransportDelay` above instead, which shares this kind's own
// `selectPort` shape rather than duplicating it.
function initRouter(m) {
  return {
    kind: "router",
    selected: m.sim.defaultPort ?? m.ports.outputs[0],
    delivered: 0,
    flowing: false,
  };
}
// Reverse pass: this router can only ever accept as much as its currently
// selected port's own downstream can take — the other, unselected ports
// contribute nothing to what it may accept this tick, since nothing will
// flow there regardless of how much headroom they have.
function capacityAvailableRouter(state, dt, downstreamCap) {
  return downstreamCap[state.selected] ?? Infinity;
}
function applyRouter(state, dt, inflow, cap, downstreamCap, hasDownstream) {
  const accepted = Math.min(inflow, cap);
  const outflow = {};
  const selected = state.selected;
  const flow = hasDownstream[selected] ? Math.min(accepted, downstreamCap[selected]) : accepted;
  outflow[selected] = flow;
  if (!hasDownstream[selected]) state.delivered += flow;
  state.flowing = flow > EPS;
  return outflow;
}
// Holds nothing of its own; whatever it has routed onward that nothing
// sim-enabled downstream already accounts for is its only contribution —
// tracked at apply-time above, exactly as splitter's own conserve does.
function conserveRouter(state) {
  return { delivered: state.delivered };
}
// No fill level to show (holds no material) — `flowing` is the same
// presenter-facing stand-in splitter's own snapshot uses.
function snapshotRouter(state) {
  return { selected: state.selected, flowing: state.flowing };
}
// Destination selection: which single port the whole of this tick's inflow
// routes to from the next tick onward. Shares its name and shape with
// `selectPortRoutedTransportDelay` above so the engine's own destination
// setter (setDestination, engine.js) can call either kind uniformly.
function selectPortRouter(state, port) {
  state.selected = port;
}

// Terminal sink (issue #26): the end of a modelled flow, holding an
// unbounded running total of everything it has ever received — the discard
// scalpings bin's whole job, and per the parent spec (issue #15) the shape
// every other terminal destination on the line will eventually share. Never
// backpressures and never spills, so whatever feeds it can always treat this
// branch as unconstrained.
// `bagSizeM3` (issue #48, optional) turns a terminal sink into a discrete
// counter as well as a volume total — the Flexicon terminus's own "how many
// bags left this tick" is a number a stakeholder reads without translation,
// unlike the plain waste volume every other terminalSink (discardBin) only
// ever reports. Left undefined for every terminus that doesn't configure it,
// so discardBin's own shape is untouched.
// `initialLevelFraction` (issue #57, optional) mirrors the accumulator's own
// field: a t=0 seed level, expressed against `displayCapacityM3` the same
// way this kind's own fill bar already reads. Tracked separately as
// `initialStored`, exactly as accumulator does with `stored`, so
// conserveTerminalSink below can report it and the whole-line invariant
// (fed + initialStored = ...) stays true for material that was never fed by
// any source this run.
function initTerminalSink(m) {
  const displayCapacityM3 = m.sim.displayCapacityM3;
  const initialStored = (m.sim.initialLevelFraction ?? 0) * (displayCapacityM3 ?? 0);
  return {
    kind: "terminalSink", total: initialStored, initialStored,
    displayCapacityM3,
    bagSizeM3: m.sim.bagSizeM3,
  };
}
function capacityAvailableTerminalSink() {
  return Infinity;
}
function applyTerminalSink(state, dt, inflow, cap) {
  state.total += Math.min(inflow, cap);
  return 0;
}
function conserveTerminalSink(state) {
  return { initialStored: state.initialStored, delivered: state.total };
}
// `displayCapacityM3` is a presenter-facing scale, not a physical limit —
// the real bin's working volume was never confirmed (REAL_LINE_SPECS.md
// §12), and unlike an accumulator's `capacity` this number gates nothing:
// capacityAvailableTerminalSink above stays Infinity regardless, so nothing
// here can ever cause backpressure or a spill. Without it the bin's fill bar
// would have nothing to show at all (a running total has no natural 0..1
// ratio); this just picks one so the bar visibly rises as waste arrives,
// same demo-pacing spirit as an assumed starting fill level elsewhere on the
// line. Saturates at 1 rather than wrapping, since there's no confirmed
// empty-when-full behaviour to animate.
//
// `bagCount` (issue #48) is derived from the running total divided by the
// configured bag size, floored to whole bags — robust to however the volume
// actually arrived (one atomic pulse off the filling head's own batchCycle
// discharge in the ordinary case, or fragmented across ticks under
// backpressure), rather than trying to detect discrete arrivals. Omitted
// entirely when this terminus has no `bagSizeM3` configured.
function snapshotTerminalSink(state) {
  const cap = state.displayCapacityM3;
  const snap = { fill: cap > 0 ? Math.min(1, state.total / cap) : 0 };
  if (state.bagSizeM3) snap.bagCount = Math.floor(state.total / state.bagSizeM3 + EPS);
  return snap;
}

export const BEHAVIORS = {
  source: {
    init: initSource, capacityAvailable: forwardDownstreamCapacity, apply: applySource,
    conserve: conserveSource, snapshot: snapshotSource, command: commandSource, isSettled: isSettledSource,
  },
  passThrough: {
    init: initPassThrough, capacityAvailable: forwardDownstreamCapacity, apply: applyPassThrough,
  },
  accumulator: {
    init: initAccumulator, capacityAvailable: capacityAvailableAccumulator, apply: applyAccumulator,
    conserve: conserveAccumulator, snapshot: snapshotAccumulator, clear: clearAccumulator,
  },
  meteredFeeder: {
    init: initMeteredFeeder, capacityAvailable: capacityAvailableMeteredFeeder, apply: applyMeteredFeeder,
    conserve: conserveMeteredFeeder, snapshot: snapshotMeteredFeeder, command: commandMeteredFeeder,
    setEnabled: setEnabledMeteredFeeder, setRunPermit: setRunPermitMeteredFeeder,
    // Issue #57: only meaningful on a gated feeder (`hasGate` at init) —
    // harmless no-ops on any other meteredFeeder, since gateThrottleTarget/
    // gateThrottleRampPerSec are just plain fields with nothing reading them
    // back on a machine that never published gateThrottleFraction to begin
    // with.
    commandGate: commandGateMeteredFeeder, isSettledGate: isSettledGateMeteredFeeder,
  },
  transportDelay: {
    init: initTransportDelay, capacityAvailable: capacityAvailableTransportDelay, apply: applyTransportDelay,
    conserve: conserveTransportDelay, snapshot: snapshotTransportDelay, clear: clearTransportDelay,
    command: commandTransportDelay, isSettled: isSettledTransportDelay,
    confirmedRunning: isConfirmedRunningTransportDelay,
  },
  routedTransportDelay: {
    init: initRoutedTransportDelay, capacityAvailable: capacityAvailableRoutedTransportDelay, apply: applyRoutedTransportDelay,
    conserve: conserveRoutedTransportDelay, snapshot: snapshotRoutedTransportDelay, clear: clearRoutedTransportDelay,
    command: commandRoutedTransportDelay, isSettled: isSettledRoutedTransportDelay,
    confirmedRunning: isConfirmedRunningRoutedTransportDelay, selectPort: selectPortRoutedTransportDelay,
    multiOutput: true,
  },
  batchCycle: {
    init: initBatchCycle, capacityAvailable: capacityAvailableBatchCycle, apply: applyBatchCycle,
    conserve: conserveBatchCycle, snapshot: snapshotBatchCycle, command: commandBatchCycle,
    setStopped: setStoppedBatchCycle, clear: clearBatchCycle,
  },
  splitter: {
    init: initSplitter, capacityAvailable: capacityAvailableSplitter, apply: applySplitter,
    conserve: conserveSplitter, snapshot: snapshotSplitter, multiOutput: true,
  },
  router: {
    init: initRouter, capacityAvailable: capacityAvailableRouter, apply: applyRouter,
    conserve: conserveRouter, snapshot: snapshotRouter, selectPort: selectPortRouter,
    multiOutput: true,
  },
  terminalSink: {
    init: initTerminalSink, capacityAvailable: capacityAvailableTerminalSink, apply: applyTerminalSink,
    conserve: conserveTerminalSink, snapshot: snapshotTerminalSink,
  },
};

export const REGISTERED_KINDS = new Set(Object.keys(BEHAVIORS));

// Kinds whose snapshot publishes a `fill` ratio (issue #36): only these have
// a level series to offer on the shared chart. passThrough, source,
// meteredFeeder, transportDelay and splitter all hold no vessel-like
// inventory of their own (transportDelay's in-transit queue is a density
// profile, not a single 0..1 fill), so a level checkbox for them would have
// nothing meaningful to plot -- they only ever offer the rate series.
export const LEVEL_KINDS = new Set(["accumulator", "batchCycle", "terminalSink"]);

// Shared wording for the one error every unregistered-kind check throws or
// reports (createSim, validateLine, the behaviour census) — one message
// shape, not a copy in each caller.
export function unregisteredKindMessage(id, kind) {
  return `machine "${id}" declares unregistered sim.kind "${kind}"`;
}

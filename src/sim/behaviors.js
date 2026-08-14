// Behaviour primitives every sim-enabled machine's `sim.kind` resolves to.
// Each behaviour exposes the pure functions used by the engine's two-phase
// step (see engine.js) and by everything else that reads a machine's state
// generically instead of switching on kind: `capacityAvailable` (reverse
// pass, how much this machine can accept from upstream this tick, given
// what its own downstream can accept), `apply` (forward pass, move the
// volume and mutate state), `conserve` (this machine's contribution to the
// conservation totals, see conservation.js) and `snapshot` (its published
// dynamic render value, see useSimEngine.js — omitted where a kind has
// nothing to show). Adding a kind means adding one entry here; nothing
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
  return { kind: "accumulator", capacity, stored, initialStored: stored, spill: 0, discharged: 0 };
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
  const discharge = Math.min(state.stored, downstreamCap);
  state.stored -= discharge;
  state.discharged = (state.discharged ?? 0) + discharge;
  return discharge;
}
function conserveAccumulator(state) {
  return { initialStored: state.initialStored, stored: state.stored, spilled: state.spill };
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
function initMeteredFeeder(m) {
  return { kind: "meteredFeeder", rate: m.sim.rateM3PerSec, drawn: 0, manualOverride: false, enabled: m.sim.enabled ?? true };
}
// Reverse pass: how much this feeder can pull in this tick — its own
// metering rate, further bounded by whatever its own downstream can accept.
// `enabled` (issue #46 — the packaging source selector) gates intake to
// zero outright, independent of `rate`: unlike commandMeteredFeeder, this
// never overwrites the presenter's own dial, so switching source and back
// restores whatever rate was last set rather than losing it. Defaults to
// true so a feeder no selector ever commands (treatDrumFeeder) is
// unaffected.
function capacityAvailableMeteredFeeder(state, dt, downstreamCap) {
  if (!state.enabled) return 0;
  return Math.min(state.rate * dt, downstreamCap);
}
function applyMeteredFeeder(state, dt, inflow, cap) {
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
// `rate` (issue #34) is whichever of the presenter's own dial or the
// auto-start interlock's direct command last set it — see `manualOverride`
// above. Published separately from flowRateM3PerSec (issue #28), which also
// reflects downstream backpressure, not just this commanded rate.
function snapshotMeteredFeeder(state) {
  return { rate: state.rate, enabled: state.enabled };
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

const EPS = 1e-9;

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
  // dial (`speedFraction`), which only ever affected transit *timing*.
  return state.ceilingM3PerSec * state.throttleFraction * dt;
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
  const refBandVol = nominalBandVolume(state, DENSITY_BANDS);
  const rawBands = packetDensityProfile(state.queue, DENSITY_BANDS);
  const densityProfile = refBandVol > 0 ? rawBands.map((vol) => Math.min(1, vol / refBandVol)) : rawBands.map(() => 0);
  return {
    inTransitVol, backlogVol: state.backlog,
    leadingProgress, trailingProgress,
    transitTimeSec: v > 0 ? state.distanceM / v : Infinity,
    speedFraction: state.speedFraction,
    throttleFraction: state.throttleFraction,
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
  if (state.phase !== "charging") return 0;
  if (state.held === 0 && state.blocked) return 0;
  return Math.max(0, state.chargeM3 - state.held);
}
function applyBatchCycle(state, dt, inflow, cap, downstreamCap = 0, hasDownstream = false) {
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
// `phase` here is the same charging/holding/discharging value apply() drives
// — except when a fresh charge is being withheld by the hold-next-batch
// interlock (issue #25), which is reported as "waiting" rather than
// "charging" so the popup and event log can tell "hasn't started its next
// batch because it's blocked" apart from "hasn't started because the pre-bin
// is starving it" or "stopped" outright. Derived here rather than stored as
// a distinct state.phase value, since capacityAvailableBatchCycle's own
// check (blocked && held === 0) already gives the exact condition for free.
function snapshotBatchCycle(state) {
  const waiting = state.phase === "charging" && state.held === 0 && state.blocked;
  return {
    fill: state.chargeM3 > 0 ? state.held / state.chargeM3 : 0,
    phase: waiting ? "waiting" : state.phase,
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

// Terminal sink (issue #26): the end of a modelled flow, holding an
// unbounded running total of everything it has ever received — the discard
// scalpings bin's whole job, and per the parent spec (issue #15) the shape
// every other terminal destination on the line will eventually share. Never
// backpressures and never spills, so whatever feeds it can always treat this
// branch as unconstrained.
function initTerminalSink(m) {
  return { kind: "terminalSink", total: 0, displayCapacityM3: m.sim.displayCapacityM3 };
}
function capacityAvailableTerminalSink() {
  return Infinity;
}
function applyTerminalSink(state, dt, inflow, cap) {
  state.total += Math.min(inflow, cap);
  return 0;
}
function conserveTerminalSink(state) {
  return { delivered: state.total };
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
function snapshotTerminalSink(state) {
  const cap = state.displayCapacityM3;
  return { fill: cap > 0 ? Math.min(1, state.total / cap) : 0 };
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
    conserve: conserveAccumulator, snapshot: snapshotAccumulator,
  },
  meteredFeeder: {
    init: initMeteredFeeder, capacityAvailable: capacityAvailableMeteredFeeder, apply: applyMeteredFeeder,
    conserve: conserveMeteredFeeder, snapshot: snapshotMeteredFeeder, command: commandMeteredFeeder,
    setEnabled: setEnabledMeteredFeeder,
  },
  transportDelay: {
    init: initTransportDelay, capacityAvailable: capacityAvailableTransportDelay, apply: applyTransportDelay,
    conserve: conserveTransportDelay, snapshot: snapshotTransportDelay,
    command: commandTransportDelay, isSettled: isSettledTransportDelay,
    confirmedRunning: isConfirmedRunningTransportDelay,
  },
  batchCycle: {
    init: initBatchCycle, capacityAvailable: capacityAvailableBatchCycle, apply: applyBatchCycle,
    conserve: conserveBatchCycle, snapshot: snapshotBatchCycle, command: commandBatchCycle,
  },
  splitter: {
    init: initSplitter, capacityAvailable: capacityAvailableSplitter, apply: applySplitter,
    conserve: conserveSplitter, snapshot: snapshotSplitter, multiOutput: true,
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

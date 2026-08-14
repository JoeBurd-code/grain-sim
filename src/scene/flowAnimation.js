// Pure computation of each connection's live flow relative to its own
// nominal/design rate (issue #35), driving the animated-dash overlay in
// Scene.jsx. Kept separate from the render code so the graph-walk logic is
// unit-testable against a fabricated line + snapshot, no SVG/DOM involved.
//
// "Nominal/design rate" is not a fixed constant per connection: for a
// machine whose own dial *sets* a rate (the source valve's nominalRate, the
// metered feeder's rate, the batch treater's charge/cycle time — all three
// live-adjustable, see engine.js's setSourceRate/setFeederRate/setBatchSize/
// setBatchCycleSec) it's that machine's own live-commanded value, read off
// the published snapshot the same way issue #34's readBind dials already
// do — so a presenter changing that dial simply moves what "fully lively"
// means, rather than staying pinned to whatever the line was authored at.
// Every other kind (passThrough, accumulator, transportDelay, terminalSink)
// holds no rate-setting dial of its own — it only ever carries through
// whatever its own upstream is delivering — so it inherits its inflow's
// nominal rate unchanged. A splitter inherits its inflow's nominal and
// divides it by the same live wasteFraction its own snapshot already
// publishes; its equipment ceiling (deliberately oversized, see
// behaviors.js's splitter comments) never enters this, since using it would
// normalize the product and waste connections against two very different
// ceilings instead of the one thing that actually determines "running as
// designed" here — how well the upstream chain is keeping the splitter fed.
import { BEHAVIORS, cycleSecFromPhases } from "../sim/behaviors";

// Per-kind nominal-rate readers, the same "one place per kind, dispatched
// through a lookup rather than a switch" shape BEHAVIORS itself uses
// (behaviors.js) — a kind not listed here (passThrough, accumulator,
// transportDelay, terminalSink) has no rate-setting dial of its own and
// falls through to nominalInflow below instead. Each reader prefers the
// live, presenter-adjustable figure off the snapshot and only falls back to
// the line's authored static value for the tick before anything has
// published yet.
const NOMINAL_RATE_BY_KIND = {
  source: (machineId, port, sim, live) => live?.nominalRate ?? sim.rateM3PerSec,
  meteredFeeder: (machineId, port, sim, live) => live?.rate ?? sim.rateM3PerSec,
  batchCycle: (machineId, port, sim, live) => {
    const cycleSec = live?.cycleSec ?? cycleSecFromPhases(sim.phases);
    const chargeM3 = live?.chargeM3 ?? sim.chargeM3;
    return cycleSec > 0 ? chargeM3 / cycleSec : undefined;
  },
  splitter: (machineId, port, sim, live, ctx) => {
    const inflow = nominalInflow(machineId, ctx);
    const wasteFraction = live?.wasteFraction ?? sim.wasteFraction ?? 0;
    return inflow == null ? undefined : port === "waste" ? inflow * wasteFraction : inflow * (1 - wasteFraction);
  },
};

// Mirrors engine.js's buildDownstreamMap inclusion rule (only a multiOutput
// machine's product/waste edges are real sim edges; every other kind only
// has its single product edge modelled) so this can never silently diverge
// from what the engine itself actually steps. Unlike buildDownstreamMap,
// this doesn't also require the *destination* to be sim-enabled — a
// connection's own live flow is a property of its source machine's
// published outflow, readable regardless of whether anything sim-enabled
// sits downstream of it yet (e.g. the scalping screen's product edge into
// the still-un-engined packaging zone, issue #15's build frontier).
//
// Issue #46: a non-multiOutput machine can still *declare* more than one
// product-kind port (the packaging conveyor has three — its pneumatic
// outlet selection is real equipment, per the parent spec, issue #43 —
// even though it isn't a `router` yet and only carries one real discharge
// today). buildDownstreamMap resolves that ambiguity by only ever wiring a
// connection whose destination is sim-enabled; this mirrors the same rule —
// once any sibling connection from this machine reaches a sim-enabled
// destination, that's the one real edge, and any other same-machine
// product connection is not modelled, even though it shares the kind. Until
// then (nothing downstream built at all yet), every sibling still reads as
// reaching into the frontier, exactly as the single-port case always has.
function isModelledEdge(line, machinesById, c) {
  const from = machinesById.get(c.from.machine);
  if (!from?.sim) return false;
  const multi = BEHAVIORS[from.sim.kind]?.multiOutput === true;
  if (multi) return c.kind === "product" || c.kind === "waste";
  if (c.kind !== "product") return false;
  const siblings = line.connections.filter((sc) => sc.from.machine === c.from.machine && sc.kind === "product");
  const realSibling = siblings.find((sc) => machinesById.get(sc.to.machine)?.sim);
  return realSibling ? realSibling === c : true;
}

// The nominal rate flowing INTO `machineId`, in m3/s: the sum of every
// modelled edge's own nominal outflow. Every sim-enabled machine on this
// line traces back to exactly one root (the source, upstreamStub), which
// nominalOutRate below handles as its own base case (via NOMINAL_RATE_BY_KIND),
// so this is never called with nothing feeding it in a well-formed line.
function nominalInflow(machineId, ctx) {
  let total;
  for (const c of ctx.line.connections) {
    if (c.to.machine !== machineId || !isModelledEdge(ctx.line, ctx.machinesById, c)) continue;
    const v = nominalOutRate(c.from.machine, c.from.port, ctx);
    if (v == null) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

// The nominal (design) rate `machineId` delivers out of `port`, in m3/s.
// Memoized on ctx.memo since a machine feeding more than one downstream
// connection (or both of a splitter's ports) would otherwise be recomputed
// once per edge.
function nominalOutRate(machineId, port, ctx) {
  const key = `${machineId}:${port}`;
  if (ctx.memo.has(key)) return ctx.memo.get(key);
  ctx.memo.set(key, undefined); // cycle guard; the sim graph is acyclic (engine.js's topoOrder enforces it)
  const machine = ctx.machinesById.get(machineId);
  const sim = machine?.sim;
  const live = ctx.simSnap?.get(machineId);
  const readNominal = sim && NOMINAL_RATE_BY_KIND[sim.kind];
  const value = !sim ? undefined : readNominal ? readNominal(machineId, port, sim, live, ctx) : nominalInflow(machineId, ctx);
  ctx.memo.set(key, value);
  return value;
}

// Per-kind live-flow port share (issue #47): how much of a multiOutput
// machine's one combined `flowRateM3PerSec` figure (issue #28) actually
// went through `port` this tick, as a 0..1 fraction of the total — the
// same "one lookup table per kind" shape NOMINAL_RATE_BY_KIND above
// already uses, needed because a fan-out kind (splitter) and a
// one-port-at-a-time kind (router, routedTransportDelay) split their own
// total in fundamentally different ways. A kind not listed here falls back
// to "all of it, on whichever port is asked" (see the `multi` branch
// below), which is wrong for any future multiOutput kind that isn't
// registered — same trade every other per-kind table in this file makes.
// A router (or routedTransportDelay) sends the whole of its live flow
// through exactly one port at a time — the one its own snapshot reports as
// `selected` — so every other declared port reads as genuinely idle rather
// than fractionally flowing. Both router-family kinds share this one
// function rather than each getting their own identical entry below.
const routerPortShare = (port, live) => (port === live?.selected ? 1 : 0);

const LIVE_PORT_SHARE_BY_KIND = {
  splitter: (port, live, sim) => {
    const wasteFraction = live?.wasteFraction ?? sim.wasteFraction ?? 0;
    return port === "waste" ? wasteFraction : 1 - wasteFraction;
  },
  router: routerPortShare,
  routedTransportDelay: routerPortShare,
};

// Live outflow of `machineId` through `port`, in m3/s, derived from the one
// combined figure engine.js publishes (issue #28) plus, for a multiOutput
// kind, the per-kind port share above. The engine never publishes a
// per-port figure — issue #28 is deliberately one number per machine,
// generic across every behaviour kind, not one per kind — so this is the
// split applied on the read side rather than new engine surface.
//
// Known limitation (splitter only): `applySplitter` (behaviors.js) actually
// caps each port's flow against *that port's own* downstreamCap
// independently, so under genuinely asymmetric backpressure (one branch
// blocked, the other free) the real per-port split can diverge from
// wasteFraction — this reconstruction would then show motion on the
// blocked branch too. Not reachable on the line as currently authored (the
// splitter's only instance, the scalping screen, feeds a terminalSink on
// one port and an un-engined, so uncapped, machine on the other — see
// isModelledEdge — so nothing today ever throttles one port without the
// other). Left as a documented approximation rather than new per-port
// engine surface, matching issue #28's own choice to publish one combined
// figure per machine. Router-family kinds have no such gap: their whole
// flow already goes through exactly one port, so `selected` alone is exact.
function liveOutRate(machineId, port, ctx) {
  const machine = ctx.machinesById.get(machineId);
  const live = ctx.simSnap?.get(machineId);
  const total = live?.flowRateM3PerSec ?? 0;
  const kind = machine?.sim?.kind;
  const multi = BEHAVIORS[kind]?.multiOutput === true;
  if (!multi) return total;
  const share = LIVE_PORT_SHARE_BY_KIND[kind]?.(port, live, machine.sim) ?? 1;
  return total * share;
}

// Public seam: every line connection's index -> its live flow as a fraction
// of its own nominal/design rate. Only holds an entry for a connection the
// engine actually models (see isModelledEdge) — an un-modelled waste stream
// (e.g. the metal remover's reject), a chemical stub, or any connection
// whose source isn't sim-enabled yet has no live figure to animate against
// at all, so Scene renders no moving overlay for it rather than guessing.
// A modelled connection always gets an entry, 0 included, so a genuinely
// stalled connection reads as "known to be at a standstill" rather than
// "unknown" — the same zero-not-undefined convention issue #28 itself uses.
export function computeConnectionFlowRatios(line, simSnap) {
  const ctx = { line, machinesById: new Map(line.machines.map((m) => [m.id, m])), simSnap, memo: new Map() };
  const ratios = new Map();
  line.connections.forEach((c, i) => {
    if (!isModelledEdge(ctx.line, ctx.machinesById, c)) return;
    const nominal = nominalOutRate(c.from.machine, c.from.port, ctx);
    if (!(nominal > 0)) {
      ratios.set(i, 0);
      return;
    }
    const live = liveOutRate(c.from.machine, c.from.port, ctx);
    ratios.set(i, Math.max(0, live / nominal));
  });
  return ratios;
}

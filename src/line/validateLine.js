// Validates a hand-authored line definition (machines, connections, zones).
// Returns { ok, errors } where errors are human-readable strings, so a bad
// data edit made in a hurry (e.g. during the engineer meeting) fails loudly.
import { REGISTERED_KINDS, BEHAVIORS, unregisteredKindMessage } from "../sim/behaviors";
import { isSimExempt } from "./simExempt";

export function validateLine(line) {
  const errors = [];

  for (const m of line.machines) {
    if (m.sim && !REGISTERED_KINDS.has(m.sim.kind)) {
      errors.push(unregisteredKindMessage(m.id, m.sim.kind));
    }
  }

  // Issue #52: the census (behaviorCensus.js) is only honest if "not yet
  // engined" is a fact the validator itself enforces, not just a number the
  // census happens to report. A machine with no `sim` block is either a
  // genuine gap (fails here) or one of the two deliberate, permanent
  // exemptions `isSimExempt` recognises (see its own comment) — the census
  // and the validator must agree on exactly which, which is why that check
  // lives in one shared place rather than being re-decided here.
  for (const m of line.machines) {
    if (!m.sim && !isSimExempt(m)) {
      errors.push(
        `machine "${m.id}" (${m.tag}) declares no sim.kind and is not marked as a stub or intentionally out of scope`
      );
    }
  }

  const zoneIds = new Set(line.zones.map((z) => z.id));
  for (const m of line.machines) {
    if (!zoneIds.has(m.zone)) {
      errors.push(`machine "${m.id}" assigned to undeclared zone "${m.zone}"`);
    }
  }

  const seenTags = new Map();
  for (const m of line.machines) {
    if (seenTags.has(m.tag)) {
      errors.push(`duplicate tag "${m.tag}" on machines "${seenTags.get(m.tag)}" and "${m.id}"`);
    } else {
      seenTags.set(m.tag, m.id);
    }
  }

  const byId = new Map(line.machines.map((m) => [m.id, m]));
  for (const c of line.connections) {
    const ends = [
      { end: c.from, side: "outputs" },
      { end: c.to, side: "inputs" },
    ];
    for (const { end, side } of ends) {
      const m = byId.get(end.machine);
      if (!m) {
        errors.push(`connection references unknown machine "${end.machine}"`);
      } else if (!m.ports[side].includes(end.port)) {
        errors.push(`machine "${end.machine}" has no ${side.slice(0, -1)} port "${end.port}"`);
      }
    }
  }

  for (const rule of line.interlocks ?? []) {
    if (!byId.has(rule.sensor.machine)) {
      errors.push(`interlock "${rule.id}" references unknown sensor machine "${rule.sensor.machine}"`);
    }
    const actuator = byId.get(rule.action.machine);
    if (!actuator) {
      errors.push(`interlock "${rule.id}" references unknown action machine "${rule.action.machine}"`);
    } else if (!BEHAVIORS[actuator.sim?.kind]?.command) {
      errors.push(`interlock "${rule.id}" targets machine "${rule.action.machine}", whose sim.kind cannot be commanded`);
    }
  }

  const touched = new Set();
  for (const c of line.connections) {
    touched.add(c.from.machine);
    touched.add(c.to.machine);
  }
  for (const m of line.machines) {
    if (!touched.has(m.id)) {
      errors.push(`orphan machine "${m.id}" (${m.tag}) is not touched by any connection`);
    }
  }

  // Issue #47: a router-family machine (any kind declaring `selectPort` —
  // `router` and `routedTransportDelay`, behaviors.js) selects among its
  // own declared output ports at runtime, by name, so a mis-authored route
  // has nowhere else to fail loudly except here. Two distinct failure
  // shapes: an authored default naming a port the machine never declared at
  // all, and a declared port with no connection routing it anywhere —
  // either leaves a selectable destination that can never actually deliver.
  for (const m of line.machines) {
    if (!BEHAVIORS[m.sim?.kind]?.selectPort) continue;
    const outputPorts = m.ports.outputs;
    if (m.sim.defaultPort && !outputPorts.includes(m.sim.defaultPort)) {
      errors.push(`machine "${m.id}" declares router defaultPort "${m.sim.defaultPort}" not among its own output ports`);
    }
    for (const p of outputPorts) {
      const wired = line.connections.some((c) => c.from.machine === m.id && c.from.port === p);
      if (!wired) {
        errors.push(`machine "${m.id}" declares router outlet port "${p}" with no connection routing it anywhere`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

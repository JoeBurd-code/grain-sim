// Validates a hand-authored line definition (machines, connections, zones).
// Returns { ok, errors } where errors are human-readable strings, so a bad
// data edit made in a hurry (e.g. during the engineer meeting) fails loudly.
import { REGISTERED_KINDS, BEHAVIORS, unregisteredKindMessage } from "../sim/behaviors";
import { isSimExempt } from "./simExempt";
import { isLiveControlBind, isLiveReadBind } from "../sim/liveControls";
import { adjustableFieldErrors } from "./adjustableFields";
import { isBucketElevator, segmentsError } from "./elevatorPath";
import { plantControlErrors } from "./plantControls";
import { isSentence, lineRules, interlockSensorMachine, ruleSwitches, SWITCH_FIELDS, isRuleOff, isFeedRateLinkOff } from "./interlocks";

// The rules a machine runs that are not interlock sentences (issue #85).
const MACHINE_RULE_KINDS = new Set(["gradedFeedSchedule", "holdNextBatch"]);

export function validateLine(line) {
  const errors = [];

  for (const m of line.machines) {
    if (m.sim && !REGISTERED_KINDS.has(m.sim.kind)) {
      errors.push(unregisteredKindMessage(m.id, m.sim.kind));
    }
  }

  // A popup slider's `bind`/`readBind` names what it drives and reads back
  // (sim/liveControls.js). A misspelt one used to do nothing at all when
  // dragged, with no error anywhere.
  for (const m of line.machines) {
    for (const p of m.params ?? []) {
      if (p.bind != null && !isLiveControlBind(p.bind)) {
        errors.push(`machine "${m.id}" param "${p.id}" binds unknown live control "${p.bind}"`);
      }
      if (p.readBind != null && !isLiveReadBind(p.readBind)) {
        errors.push(`machine "${m.id}" param "${p.id}" reads unknown live control "${p.readBind}"`);
      }
    }
  }

  // Issue #77: a Build mode field must name a real slider or bind, and its
  // default must sit inside its own limits.
  errors.push(...adjustableFieldErrors(line));

  // Issue #81: a declared plant control must name real machines and ports.
  errors.push(...plantControlErrors(line));

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

  // Issue #87: a machine added in Build mode has no zone, and its tag is
  // empty until the user sets one.
  const zoneIds = new Set(line.zones.map((z) => z.id));
  for (const m of line.machines) {
    if (m.zone !== undefined && !zoneIds.has(m.zone)) {
      errors.push(`machine "${m.id}" assigned to undeclared zone "${m.zone}"`);
    }
  }

  // Issue #155: a flipped machine carries `flipped: true`. Build mode drops
  // the flag on a flip back, but a hand-written `false` means the same.
  for (const m of line.machines) {
    if (m.flipped !== undefined && typeof m.flipped !== "boolean") {
      errors.push(`machine "${m.id}" has flipped ${JSON.stringify(m.flipped)}; it must be true or false`);
    }
  }

  // Issue #156: a bucket elevator's path segments add up to its path length
  // and keep their minimums.
  for (const m of line.machines) {
    if (!isBucketElevator(m)) continue;
    const error = segmentsError(m.geom.segmentsM, m.sim?.distanceM);
    if (error) errors.push(`machine "${m.id}" ${error}`);
  }

  const seenIds = new Set();
  for (const m of line.machines) {
    if (seenIds.has(m.id)) errors.push(`two machines have the id "${m.id}"`);
    seenIds.add(m.id);
  }

  const seenTags = new Map();
  for (const m of line.machines) {
    if (m.tag === "") continue;
    if (seenTags.has(m.tag)) {
      errors.push(`duplicate tag "${m.tag}" on machines "${seenTags.get(m.tag)}" and "${m.id}"`);
    } else {
      seenTags.set(m.tag, m.id);
    }
  }

  // Every connection runs between ports its two machines declare. Issue
  // #153: each error names the whole connection, since a machine whose
  // port count shrank (portCounts.js) can leave one pointing at nothing.
  const byId = new Map(line.machines.map((m) => [m.id, m]));
  for (const c of line.connections) {
    const where = `connection from "${c.from.machine}" port "${c.from.port}" to "${c.to.machine}" port "${c.to.port}"`;
    const ends = [
      { end: c.from, side: "outputs" },
      { end: c.to, side: "inputs" },
    ];
    for (const { end, side } of ends) {
      const m = byId.get(end.machine);
      if (!m) {
        errors.push(`${where} references unknown machine "${end.machine}"`);
      } else if (!m.ports[side].includes(end.port)) {
        errors.push(`${where}: machine "${end.machine}" has no ${side.slice(0, -1)} port "${end.port}"`);
      }
    }
  }

  // Issue #88: an output port drives at most one connection — the same rule
  // connectPorts enforces when the user makes one, checked here too for a
  // line loaded from a file. An input port has no such limit: a router or a
  // Diverter legitimately lands more than one of its own output ports on
  // the same input, since only one is ever actually selected at a time.
  const fromSeen = new Set();
  for (const c of line.connections) {
    const fromKey = `${c.from.machine}:${c.from.port}`;
    if (fromSeen.has(fromKey)) errors.push(`output port "${c.from.port}" on machine "${c.from.machine}" has more than one connection`);
    fromSeen.add(fromKey);
  }

  // Issue #85: every interlock is a sentence. One that is not even shaped
  // like a sentence is refused. One that is shaped right but not filled in
  // correctly (a set point out of range, an action the machine cannot take)
  // still loads (issue #92): a line being built has those, and losing the
  // whole line over one would lose the user's work. It does not run, and the
  // problems list reports it (problems.js), as validateSentence words it.
  //
  // A rule that names a machine the line no longer has is off (issue #87):
  // it is kept, but not run or checked here.
  for (const rule of line.interlocks ?? []) {
    if (isRuleOff(line, rule)) continue;
    if (isSentence(rule)) {
      if (typeof rule.id !== "string" || rule.when === null || typeof rule.when !== "object" || !Array.isArray(rule.then)) {
        errors.push(`interlock "${rule.id}" is not shaped like a sentence (it needs an id, a "when" part and a list of "then" steps)`);
      }
    } else {
      errors.push(`interlock "${rule.id}" has kind "${rule.kind}"; every interlock is a sentence`);
    }
  }

  for (const rule of line.machineRules ?? []) {
    if (!MACHINE_RULE_KINDS.has(rule.kind)) {
      errors.push(`machine rule "${rule.id}" has unknown kind "${rule.kind}" (expected one of ${[...MACHINE_RULE_KINDS].join(", ")})`);
      continue;
    }
    if (isRuleOff(line, rule)) continue;
    if (!byId.has(rule.sensor?.machine)) {
      errors.push(`machine rule "${rule.id}" references unknown sensor machine "${rule.sensor?.machine}"`);
    }
    // gradedFeedSchedule (issue #58/#60) commands two actuators — an
    // elevator's speed throttle and a feeder's gate throttle — instead of
    // the single `action.machine` holdNextBatch targets, so its own
    // `action` is `{ elevator: { machine }, feeder: { machine } }` rather
    // than a bare `{ machine }`. `action.feeder` can also be an array of
    // `{ machine }` (issue #61: the Concetti pre-bin's schedule commands
    // both inlet drum feeders uniformly) — flattened here the same way
    // either shape validates.
    const feeders = Array.isArray(rule.action?.feeder) ? rule.action.feeder : [rule.action?.feeder];
    const targets =
      rule.kind === "gradedFeedSchedule" ? [rule.action?.elevator, ...feeders] : [rule.action];
    for (const target of targets) {
      const actuator = byId.get(target?.machine);
      if (!actuator) {
        errors.push(`machine rule "${rule.id}" references unknown action machine "${target?.machine}"`);
      } else if (!BEHAVIORS[actuator.sim?.kind]?.command) {
        errors.push(`machine rule "${rule.id}" targets machine "${target.machine}", whose sim.kind cannot be commanded`);
      }
    }
  }

  // Issue #85: the label and limits a bin gives its set point sliders.
  for (const m of line.machines) {
    if (m.setpointSliders === undefined) continue;
    if (!Array.isArray(m.setpointSliders)) {
      errors.push(`machine "${m.id}" set point sliders are not a list`);
      continue;
    }
    const seen = new Set();
    for (const slider of m.setpointSliders) {
      const code = slider?.switch;
      if (!SWITCH_FIELDS[code]) {
        errors.push(`machine "${m.id}" has a set point slider for unknown level switch "${code}"`);
        continue;
      }
      if (seen.has(code)) errors.push(`machine "${m.id}" has two set point sliders for "${code}"`);
      seen.add(code);
      if (typeof slider.label !== "string" || slider.label === "") {
        errors.push(`machine "${m.id}" set point slider "${code}" needs a label`);
      }
      if (![slider.min, slider.max].every(Number.isFinite) || slider.min < 0 || slider.max > 100 || slider.min >= slider.max) {
        errors.push(`machine "${m.id}" set point slider "${code}" needs limits from 0 to 100 %, the lower first`);
      }
    }
  }

  // Issue #83: a bin's display-only level switches (control.js
  // initLevelSwitches). A code an interlock on the same bin also names would
  // draw two set points for one lamp.
  for (const m of line.machines) {
    const switches = m.sim?.levelSwitches;
    if (switches === undefined) continue;
    if (!BEHAVIORS[m.sim.kind]?.level) errors.push(`machine "${m.id}" has level switches but no level`);
    for (const [code, setpoint] of Object.entries(switches)) {
      if (!SWITCH_FIELDS[code]) {
        errors.push(`machine "${m.id}" has unknown level switch "${code}" (expected one of ${Object.keys(SWITCH_FIELDS).join(", ")})`);
      } else if (typeof setpoint !== "number" || !(setpoint >= 0 && setpoint <= 1)) {
        errors.push(`machine "${m.id}" needs an ${code} set point from 0 to 100 %`);
      }
      const rule = lineRules(line).find((r) => interlockSensorMachine(r) === m.id && ruleSwitches(r).includes(code));
      const what = rule && isSentence(rule) ? "interlock" : "machine rule";
      if (rule) errors.push(`machine "${m.id}" level switch "${code}" is also named by ${what} "${rule.id}"`);
    }
  }

  // Issue #60: the always-on speed x gate -> rate derivation's own links,
  // outside `line.interlocks` and `line.machineRules` (see control.js's
  // initFeedRateDerivations: it is not a phase-machine rule kind).
  for (const link of line.feedRateDerivations ?? []) {
    if (isFeedRateLinkOff(line, link)) continue;
    if (!byId.has(link.elevator.machine)) {
      errors.push(`feed-rate derivation "${link.id}" references unknown elevator machine "${link.elevator.machine}"`);
    }
    if (!byId.has(link.feeder.machine)) {
      errors.push(`feed-rate derivation "${link.id}" references unknown feeder machine "${link.feeder.machine}"`);
    }
  }

  // A Diverter's authored default must be one of its own outlets.
  for (const m of line.machines) {
    if (!BEHAVIORS[m.sim?.kind]?.selectPort) continue;
    if (m.sim.defaultPort && !m.ports.outputs.includes(m.sim.defaultPort)) {
      errors.push(`machine "${m.id}" declares router defaultPort "${m.sim.defaultPort}" not among its own output ports`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// Gaps in a line's wiring (issue #87): a machine no connection touches, and
// a Diverter outlet with no connection. A line with gaps still loads and
// runs, because a line being built has them; the hand-written golden line
// is held to having none by its own test.
export function wiringGaps(line) {
  const errors = [];
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
    for (const p of outputPorts) {
      const wired = line.connections.some((c) => c.from.machine === m.id && c.from.port === p);
      if (!wired) {
        errors.push(`machine "${m.id}" declares router outlet port "${p}" with no connection routing it anywhere`);
      }
    }
  }

  return errors;
}

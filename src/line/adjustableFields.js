// The fields a user may change on a machine in Build mode (issue #77).
//
// A machine declares its fields in an `adjustable` list. An entry is one of:
//   { param: "batchSize", default: 160 }
//     the default of an existing popup slider. Label, unit and limits come
//     from the slider's own entry in `params`.
//   { setpoint: "LSH", default: 85 }
//     the set point of a level switch. Label and limits come from the
//     machine's set point slider for that switch (setpointSliders.js).
//   { id, label, unit, kind: "number", min, max, default, bind }
//   { id, label, unit, kind: "option", options: [...], default, bind }
//     a behaviour setting, such as a bin's capacity.
//
// `bind` names a row in BINDS below, the one place that knows where a field's
// value lives in the line and how its plant unit (t/h, m³, %, s, kg) converts
// to the engine unit the line holds. This module never changes a line it is
// given: setAdjustableValue returns a new one.
import { tPerHourToM3PerSec, m3PerSecToTPerHour, kgToM3, m3ToKg } from "../sim/units";
import { lineRules, interlockSensorMachine, interlockValue, putInterlockValue, SWITCH_FIELDS } from "./interlocks";
import { switchSlider, SWITCH_BINDS } from "./setpointSliders";
import { overlappingMachine } from "./layout";

// Plant unit <-> line (engine) unit.
const SAME = { toLine: (v) => v, fromLine: (v) => v };
const PERCENT = { toLine: (v) => v / 100, fromLine: (v) => v * 100 };
const T_PER_H = { toLine: tPerHourToM3PerSec, fromLine: m3PerSecToTPerHour };
const KG = { toLine: kgToM3, fromLine: m3ToKg };

// A value on the machine's own `sim` block.
function simValue(key, unit, convert) {
  return {
    unit, convert,
    get: (line, m) => m.sim?.[key],
    put: (line, m, value) => { m.sim[key] = value; },
  };
}

// Every place on the line that holds this machine's value for `key`: each
// rule that reads the machine and carries it, interlock sentence or machine
// rule, and (issue #83) the machine's own display-only level switch.
function holdersOf(line, machine, key) {
  const holders = lineRules(line)
    .filter((r) => interlockSensorMachine(r) === machine.id && interlockValue(r, key) !== undefined)
    .map((r) => ({ get: () => interlockValue(r, key), put: (value) => putInterlockValue(r, key, value) }));
  const code = Object.keys(SWITCH_FIELDS).find((c) => SWITCH_FIELDS[c] === key);
  const switches = machine.sim?.levelSwitches;
  if (code && switches?.[code] !== undefined) {
    holders.push({ get: () => switches[code], put: (value) => { switches[code] = value; } });
  }
  return holders;
}

// A value held for this machine by its rules, the same places the live
// slider moves (setInterlockField, engine.js).
function interlockField(key, unit, convert) {
  return {
    unit, convert,
    get: (line, m) => holdersOf(line, m, key)[0]?.get(),
    put: (line, m, value) => {
      for (const holder of holdersOf(line, m, key)) holder.put(value);
    },
  };
}

// The terminal that counts this machine's bags, found by walking single
// connections through pass-through machines. Null when there is none.
function bagCounterBelow(line, machineId) {
  const visited = new Set();
  let id = machineId;
  while (!visited.has(id)) {
    visited.add(id);
    const out = line.connections.filter((c) => c.from.machine === id);
    if (out.length !== 1) return null;
    const next = line.machines.find((m) => m.id === out[0].to.machine);
    if (next?.sim?.kind === "passThrough") { id = next.id; continue; }
    return next?.sim?.kind === "terminalSink" && next.sim.bagSizeM3 !== undefined ? next : null;
  }
  return null;
}

export function closeTo(a, b) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
}

const SETPOINT_BINDS = new Set(["interlockLowSetpoint", "interlockHighSetpoint", "interlockHighHighSetpoint"]);

// Issue #90: a conveyor's length or an elevator's height. One field drives
// both the drawn size and the sim's transit distance, so they cannot
// disagree: the stored value *is* `sim.distanceM`, and `w`/`h` scale by the
// same ratio the edit moves `distanceM` by (so does each routed outlet's
// own `portDistanceM`, a real-meters split, not a pixel one).
//
// A port does not scale with the machine, it moves with the machine's own
// end (the issue's own words): the elevator's boot stays exactly `duct`
// above the floor it sits on as the column grows taller, and the head
// discharge near the top does not drift down with it (lineData.js's own
// comment on treatingElevator explains why `out` is measured from the top,
// not scaled from `h`) — the same holds for a conveyor's infeed and its
// discharge end. So only a port past the old size's own midpoint (the far
// end) moves, and it moves by the same pixel delta the drawn size grew by,
// not by the ratio: that is what keeps a fixed offset like `in.y = h -
// duct` exact after the resize instead of drifting. `geom.colX` (the
// elevator's climb column, the conveyor's own) follows the same rule: it
// only shifts when it already sits on the growing axis' far side.
// `axis` is the drawn dimension the field lengthens: "w" for a conveyor's
// length, "h" for an elevator's height. Connections touching the machine
// drop their hand-placed bend points, the same as a move (layout.js
// placeMachine), so routing.js re-routes them to the moved ports. The
// caller (setAdjustableValue) still has to refuse the edit if the new size
// would overlap another machine.
const RESIZE_BINDS = new Set(["length", "height"]);
function resizeField(axis) {
  const coord = axis === "w" ? "x" : "y";
  return {
    unit: "m", convert: SAME,
    get: (line, m) => m.sim?.distanceM,
    put: (line, m, value) => {
      const ratio = value / m.sim.distanceM;
      const oldSize = m[axis];
      const delta = oldSize * ratio - oldSize;
      m.sim.distanceM = value;
      if (m.sim.portDistanceM) {
        for (const key of Object.keys(m.sim.portDistanceM)) m.sim.portDistanceM[key] *= ratio;
      }
      m[axis] = oldSize + delta;
      if (m.geom && axis === "w" && m.geom.colX > oldSize / 2) m.geom.colX += delta;
      for (const key of Object.keys(m.anchors)) {
        const anchor = m.anchors[key];
        if (anchor[coord] > oldSize / 2) anchor[coord] += delta;
      }
      line.connections = line.connections.map((c) => {
        if (c.from.machine !== m.id && c.to.machine !== m.id) return c;
        if (c.via === undefined && c.coupling === undefined) return c;
        const rerouted = { ...c };
        delete rerouted.via;
        delete rerouted.coupling;
        return rerouted;
      });
    },
  };
}

const BINDS = {
  sourceRate: simValue("rateM3PerSec", "t/h", T_PER_H),
  feederRate: simValue("rateM3PerSec", "t/h", T_PER_H),
  interlockHighSetpoint: interlockField("highSetpoint", "%", PERCENT),
  interlockLowSetpoint: interlockField("lowSetpoint", "%", PERCENT),
  interlockHighHighSetpoint: interlockField("highHighSetpoint", "%", PERCENT),
  interlockSignalDelay: interlockField("signalDelaySec", "s", SAME),
  // A bag size change also moves the bag counter below the machine, which
  // holds its own copy of the bag size.
  batchSize: {
    unit: "kg", convert: KG,
    get: (line, m) => m.sim?.chargeM3,
    put: (line, m, value) => {
      const counter = bagCounterBelow(line, m.id);
      if (counter) counter.sim.bagSizeM3 = value;
      m.sim.chargeM3 = value;
    },
  },
  // Only a machine with one phase has one cycle time to set.
  batchCycleTime: {
    unit: "s", convert: SAME,
    get: (line, m) => (m.sim?.phases?.length === 1 ? m.sim.phases[0].durationSec : undefined),
    put: (line, m, value) => { m.sim.phases[0].durationSec = value; },
  },
  wasteFraction: simValue("wasteFraction", "%", PERCENT),
  capacity: simValue("capacityM3", "m³", SAME),
  ratedCapacity: simValue("ceilingM3PerSec", "t/h", T_PER_H),
  chainSpeed: simValue("speedMPerMin", "m/min", SAME),
  hasGate: simValue("hasGate", "", SAME),
  length: resizeField("w"),
  height: resizeField("h"),
};

// The machine's fields in one shape, whichever way each was declared.
export function adjustableFields(machine) {
  return (machine.adjustable ?? []).map((decl) => {
    if (decl.setpoint !== undefined) {
      return {
        id: SWITCH_FIELDS[decl.setpoint] ?? decl.setpoint, setpoint: decl.setpoint, kind: "number",
        ...switchSlider(machine, decl.setpoint), unit: "%", bind: SWITCH_BINDS[decl.setpoint],
        default: decl.default,
      };
    }
    if (decl.param === undefined) return { kind: "number", ...decl };
    const p = machine.params?.find((q) => q.id === decl.param);
    return {
      id: decl.param, param: decl.param, kind: "number",
      label: p?.label, unit: p?.unit, min: p?.min, max: p?.max, bind: p?.bind,
      default: decl.default,
    };
  });
}

function findMachine(line, machineId) {
  return line.machines.find((m) => m.id === machineId);
}

function findField(machine, fieldId) {
  return adjustableFields(machine).find((f) => f.id === fieldId);
}

// Rounded to 12 significant figures, so 15 t/h read back through m³/s is 15.
function readField(line, machine, field) {
  const bind = BINDS[field.bind];
  const raw = bind?.get(line, machine);
  if (field.kind === "option" || typeof raw !== "number") return raw;
  return Number(bind.convert.fromLine(raw).toPrecision(12));
}

// A field's current value in plant units, or undefined when the machine or
// field does not exist.
export function readAdjustableValue(line, machineId, fieldId) {
  const machine = findMachine(line, machineId);
  const field = machine && findField(machine, fieldId);
  return field ? readField(line, machine, field) : undefined;
}

export function differsFromDefault(line, machineId, fieldId) {
  const machine = findMachine(line, machineId);
  const field = machine && findField(machine, fieldId);
  if (!field) return false;
  const value = readField(line, machine, field);
  if (value === undefined) return false;
  return field.kind === "option" ? value !== field.default : !closeTo(value, field.default);
}

function valueError(field, value) {
  if (field.kind === "option") {
    return field.options.includes(value) ? null : `${field.label} must be one of: ${field.options.join(", ")}.`;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return `${field.label} must be a number.`;
  if (value < field.min || value > field.max) {
    return `${field.label} must be between ${field.min} and ${field.max} ${field.unit}.`.replace(/ \.$/, ".");
  }
  return null;
}

// LSL below LSH, LSH below LSHH. Compared across every rule that reads the
// bin, since one bin's set points can sit on different rules.
function setpointOrderError(line, machineId) {
  const machine = findMachine(line, machineId);
  const values = (key) => holdersOf(line, machine, key).map((h) => h.get());
  const [lows, highs, highHighs] = [values("lowSetpoint"), values("highSetpoint"), values("highHighSetpoint")];
  const below = (a, b) => a.length === 0 || b.length === 0 || Math.max(...a) < Math.min(...b);
  if (below(lows, highs) && below(highs, highHighs) && below(lows, highHighs)) return null;
  return "Set points must stay in order: LSL below LSH, and LSH below LSHH.";
}

function refuse(error) {
  return { ok: false, error };
}

// Returns { ok: true, line } with a new line, or { ok: false, error }.
// `value` is in the field's plant unit.
export function setAdjustableValue(line, machineId, fieldId, value) {
  const original = findMachine(line, machineId);
  if (!original) return refuse(`There is no machine "${machineId}" on this line.`);
  const field = findField(original, fieldId);
  if (!field) return refuse(`${original.name} has no adjustable field "${fieldId}".`);
  // Lines arrive validated, but a bad declaration is still a message, never a throw.
  if (!BINDS[field.bind] || readField(line, original, field) === undefined) {
    return refuse(`${original.name} field "${fieldId}" cannot be adjusted on this line.`);
  }
  const error = valueError(field, value);
  if (error) return refuse(error);

  const next = structuredClone(line);
  const machine = findMachine(next, machineId);
  const bind = BINDS[field.bind];
  bind.put(next, machine, field.kind === "option" ? value : bind.convert.toLine(value));
  if (field.param !== undefined) machine.params.find((p) => p.id === field.param).value = value;

  if (SETPOINT_BINDS.has(field.bind)) {
    const orderError = setpointOrderError(next, machineId);
    if (orderError) return refuse(orderError);
  }
  if (RESIZE_BINDS.has(field.bind) && overlappingMachine(next, machineId, { x: machine.x, y: machine.y })) {
    return refuse(`${original.name} would overlap another machine at this size.`);
  }
  return { ok: true, line: next };
}

// For validateLine: every declaration must name a real slider or bind, carry
// the bind's unit, and have a default inside its own limits that the line
// can actually be read at.
export function adjustableFieldErrors(line) {
  const errors = [];
  for (const m of line.machines) {
    const seen = new Set();
    for (const f of adjustableFields(m)) {
      const at = `machine "${m.id}" adjustable field "${f.id}"`;
      if (seen.has(f.id)) errors.push(`${at} is declared twice`);
      seen.add(f.id);
      if (f.setpoint !== undefined && !SWITCH_FIELDS[f.setpoint]) {
        errors.push(`${at} names unknown level switch "${f.setpoint}"`);
        continue;
      }
      if (f.param !== undefined && !m.params?.some((p) => p.id === f.param)) {
        errors.push(`${at} names no slider "${f.param}"`);
        continue;
      }
      const bind = BINDS[f.bind];
      if (!bind) {
        errors.push(`${at} binds unknown field "${f.bind}"`);
        continue;
      }
      if (f.unit !== bind.unit) errors.push(`${at} has unit "${f.unit}"; its bind "${f.bind}" uses "${bind.unit}"`);
      if (f.kind === "option") {
        if (!Array.isArray(f.options) || !f.options.includes(f.default)) errors.push(`${at} default is not one of its options`);
      } else if (f.kind !== "number") {
        errors.push(`${at} has unknown kind "${f.kind}"`);
      } else if (![f.min, f.max, f.default].every(Number.isFinite) || f.default < f.min || f.default > f.max) {
        errors.push(`${at} default ${f.default} is not between its limits ${f.min} and ${f.max}`);
      }
      if (bind.get(line, m) === undefined) errors.push(`${at} has no value on this line to adjust`);
    }
  }
  return errors;
}

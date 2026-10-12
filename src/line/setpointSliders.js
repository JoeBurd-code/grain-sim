// A machine popup's set point sliders (issue #85), generated from the rules
// that read the machine's level. No slider is written by hand: a bin gets
// one slider for each level switch that a rule on the line reads (an
// interlock sentence's part that names the switch, a machine rule's set
// point, or the bin's own display-only switch), and one for each sentence
// level condition that names no switch.
//
// A switch's slider moves that switch's set point on every rule that reads
// it, because one physical switch has one height. A condition with no
// switch belongs to its sentence alone, so its slider moves only that one.
//
// A machine can give its switches' sliders a label and limits
// (`setpointSliders` on the machine), listed in the order the popup shows
// them. A switch it does not list gets "<code> set point", 0 to 100 %.
//
// A rule that is off (issue #87) does not run, so it gives no slider.
import { lineRules, interlockSensorMachine, interlockValue, isSentence, ruleSwitches, SWITCH_FIELDS, isRuleOff } from "./interlocks";

// The Sim mode live control (sim/liveControls.js) each switch's slider drives.
export const SWITCH_BINDS = {
  LSL: "interlockLowSetpoint", LSH: "interlockHighSetpoint", LSHH: "interlockHighHighSetpoint",
};
// The live control for a condition with no switch: it carries its target.
export const PART_SETPOINT_BIND = "interlockPartSetpoint";

const CODE_ORDER = Object.keys(SWITCH_FIELDS);

// The label and limits of the slider for `code` on `machine`.
export function switchSlider(machine, code) {
  const own = machine.setpointSliders?.find((s) => s.switch === code);
  return { label: own?.label ?? `${code} set point`, min: own?.min ?? 0, max: own?.max ?? 100 };
}

// A set point fraction as the slider's whole-number percent.
const percent = (fraction) => Number((fraction * 100).toPrecision(12));

// The level switches read on `machine`, by code, to the set point the first
// rule that reads each one holds.
function switchValues(line, machine) {
  const values = new Map();
  for (const rule of lineRules(line)) {
    if (interlockSensorMachine(rule) !== machine.id || isRuleOff(line, rule)) continue;
    for (const code of ruleSwitches(rule)) {
      if (!values.has(code)) values.set(code, interlockValue(rule, SWITCH_FIELDS[code]));
    }
  }
  for (const [code, setpoint] of Object.entries(machine.sim?.levelSwitches ?? {})) {
    if (!values.has(code)) values.set(code, setpoint);
  }
  return values;
}

// The sentence level conditions on `machine` that name no switch.
function unnamedParts(line, machine) {
  const parts = [];
  for (const rule of line.interlocks ?? []) {
    if (!isSentence(rule) || rule.when?.machine !== machine.id || isRuleOff(line, rule)) continue;
    for (const [name, part] of [["when", rule.when], ["whenClears", rule.whenClears]]) {
      if (part?.setpoint !== undefined && part.switch === undefined) parts.push({ rule, name, part });
    }
  }
  return parts;
}

// The popup's set point sliders for one machine, in the same shape as a
// machine's hand-written `params`.
export function setpointSliders(line, machineId) {
  const machine = line.machines.find((m) => m.id === machineId);
  if (!machine) return [];
  const values = switchValues(line, machine);
  const listed = (machine.setpointSliders ?? []).map((s) => s.switch).filter((code) => values.has(code));
  const codes = [...listed, ...CODE_ORDER.filter((code) => values.has(code) && !listed.includes(code))];
  const sliders = codes.map((code) => ({
    id: SWITCH_FIELDS[code], ...switchSlider(machine, code),
    value: percent(values.get(code)), unit: "%", bind: SWITCH_BINDS[code],
  }));

  const labels = new Map();
  for (const { rule, name, part } of unnamedParts(line, machine)) {
    const base = `${part.condition} set point`;
    const count = (labels.get(base) ?? 0) + 1;
    labels.set(base, count);
    sliders.push({
      id: `${rule.id}.${name}`, label: count === 1 ? base : `${base} ${count}`, min: 0, max: 100,
      value: percent(part.setpoint), unit: "%", bind: PART_SETPOINT_BIND, target: { interlock: rule.id, part: name },
    });
  }
  return sliders;
}

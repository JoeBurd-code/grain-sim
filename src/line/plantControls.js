// The plant control panel as a pure function of the line document (issue
// #81). The panel, the engine and the app shell read it from here, so no
// code outside the line document names a machine of a particular line.
//
// A plain line gets:
// - one selector for each Diverter (a machine whose behaviour can select an
//   output port), named after the Diverter, with one option for each output
//   port, labelled with the name of the machine that port feeds;
// - one EMPTY button for each terminal sink, in a section named after it.
//
// A line can declare its own controls in `line.plantControls`:
// - `selectors`: a Destination/source selector that commands more than one
//   machine in lockstep. Each option is a list of commands, either
//   `{ machine, port }` (select that Diverter output) or
//   `{ machine, enabled }` (switch that machine's intake on or off). A
//   declared selector replaces the plain selector of every Diverter it
//   commands. An option can carry `empty: { label, machines }`, an EMPTY
//   button shown only while that option is selected.
// - `emptyButtons`: `{ id, section, label, machines }`. When a line declares
//   these, they replace the generated EMPTY buttons. The golden line uses
//   this to keep its one EMPTY DISCARD BIN button, which also empties both
//   metal bins, and to show no button for its two plant-edge stubs.
//
// CONTROLLED STOP, RESET TRIPS, the utilities toggle and CLEAR PLANT are on
// every line and are not part of this model.
import { BEHAVIORS } from "../sim/behaviors";

// The kinds an EMPTY button can act on: the ones that hold grain a
// presenter can take away (engine.js emptyMachine).
const EMPTYABLE_KINDS = new Set(["accumulator", "terminalSink"]);

function behaviourOf(machine) {
  return BEHAVIORS[machine?.sim?.kind];
}

export function isDiverter(machine) {
  return Boolean(behaviourOf(machine)?.selectPort);
}

function feedsName(line, machineId, port) {
  const c = line.connections.find((x) => x.from.machine === machineId && x.from.port === port);
  const to = c && line.machines.find((m) => m.id === c.to.machine);
  return to ? to.name : port;
}

function plainSelector(line, diverter) {
  return {
    id: diverter.id,
    label: diverter.name,
    options: diverter.ports.outputs.map((port) => ({
      id: port,
      label: feedsName(line, diverter.id, port),
      commands: [{ machine: diverter.id, port }],
    })),
  };
}

export function plantControlsFor(line) {
  const declared = line.plantControls?.selectors ?? [];
  const wrapped = new Set(
    declared.flatMap((s) => s.options.flatMap((o) => o.commands.filter((c) => c.port !== undefined).map((c) => c.machine)))
  );
  const plain = line.machines
    .filter((m) => isDiverter(m) && !wrapped.has(m.id))
    .map((m) => plainSelector(line, m));
  const emptyButtons = line.plantControls?.emptyButtons
    ?? line.machines
      .filter((m) => m.sim?.kind === "terminalSink")
      .map((m) => ({ id: m.id, section: m.name, label: "EMPTY", machines: [m.id] }));
  return { selectors: [...declared, ...plain], emptyButtons };
}

// A selector that switches machines on and off. The controlled stop
// remembers its choice and puts it back on resume (engine.js resumeLine).
export function switchesMachines(selector) {
  return selector.options.some((o) => o.commands.some((c) => c.enabled !== undefined));
}

// Errors in a line's declared plant controls, for validateLine. A misspelt
// machine or port would otherwise give a button that does nothing.
export function plantControlErrors(line) {
  const errors = [];
  const byId = new Map(line.machines.map((m) => [m.id, m]));
  const emptyErrors = (ownerId, machines) => {
    for (const id of machines) {
      const m = byId.get(id);
      if (!m) errors.push(`plant control "${ownerId}" empties unknown machine "${id}"`);
      else if (!EMPTYABLE_KINDS.has(m.sim?.kind)) errors.push(`plant control "${ownerId}" empties machine "${id}", which holds no grain to empty`);
    }
  };
  for (const s of line.plantControls?.selectors ?? []) {
    for (const o of s.options) {
      const where = `plant control "${s.id}" option "${o.id}"`;
      for (const c of o.commands) {
        const m = byId.get(c.machine);
        if (!m) {
          errors.push(`${where} commands unknown machine "${c.machine}"`);
        } else if (c.port !== undefined) {
          if (!isDiverter(m)) errors.push(`${where} selects a port on machine "${c.machine}", which is not a Diverter`);
          else if (!m.ports.outputs.includes(c.port)) errors.push(`${where} selects unknown output port "${c.port}" on machine "${c.machine}"`);
        } else if (!behaviourOf(m)?.setEnabled) {
          errors.push(`${where} switches machine "${c.machine}" on or off, which it cannot be`);
        }
      }
      if (o.empty) emptyErrors(s.id, o.empty.machines);
    }
  }
  for (const b of line.plantControls?.emptyButtons ?? []) emptyErrors(b.id, b.machines);
  return errors;
}

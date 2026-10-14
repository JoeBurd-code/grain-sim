// The Build mode problems list (issue #89): a pure function of the line
// document, so the panel, the canvas outlines and RUN's own gate all read
// the same facts. Unlike validateLine's errors, a problem never blocks
// loading or saving a line -- a line being built has them.
import { isSentence, isRuleOff, lineRules, interlockSensorMachine } from "./interlocks";
import { validateSentence } from "../sim/sentenceInterlock";

// A problem is `{ id, machineId, message }`. `machineId` is the machine to
// outline and jump to on a click, or null when no machine still on the line
// is the right target (an interlock that lost the machine it watches).
function problem(id, machineId, message) {
  return { id, machineId, message };
}

// Every input and output port with no connection landing on it.
function portProblems(line) {
  const problems = [];
  const connectedInputs = new Set(line.connections.map((c) => `${c.to.machine}:${c.to.port}`));
  const connectedOutputs = new Set(line.connections.map((c) => `${c.from.machine}:${c.from.port}`));
  for (const m of line.machines) {
    for (const p of m.ports.inputs) {
      if (!connectedInputs.has(`${m.id}:${p}`)) {
        problems.push(problem(`${m.id}:in:${p}`, m.id, `${m.name}: input not connected`));
      }
    }
    for (const p of m.ports.outputs) {
      if (!connectedOutputs.has(`${m.id}:${p}`)) {
        problems.push(problem(`${m.id}:out:${p}`, m.id, `${m.name}: output not connected`));
      }
    }
  }
  return problems;
}

// A built line needs a source of grain to mean anything, and somewhere for
// it to go.
export function hasGrainIn(line) {
  return line.machines.some((m) => m.sim?.kind === "source");
}
function hasGrainOut(line) {
  return line.machines.some((m) => m.sim?.kind === "terminalSink");
}

// Every interlock and machine rule: off because it lost a machine it names
// (issue #87, interlocks.js), or, for a sentence still fully named, an
// incomplete part validateSentence itself refuses.
function ruleProblems(line) {
  const problems = [];
  const byId = new Map(line.machines.map((m) => [m.id, m]));
  for (const rule of lineRules(line)) {
    const sensorId = interlockSensorMachine(rule);
    const sensor = byId.get(sensorId);
    const name = sensor?.name ?? sensorId ?? "the line";
    if (isRuleOff(line, rule)) {
      problems.push(problem(`${rule.id}:off`, sensor ? sensorId : null, `${name}: interlock lost a machine it depends on`));
      continue;
    }
    if (isSentence(rule)) {
      for (const message of validateSentence(rule, byId)) {
        problems.push(problem(`${rule.id}:${message}`, sensorId, `${name}: incomplete interlock -- ${message}`));
      }
    }
  }
  return problems;
}

export function lineProblems(line) {
  const problems = [...portProblems(line), ...ruleProblems(line)];
  if (!hasGrainIn(line)) problems.push(problem("line:no-grain-in", null, "No Grain in on the line"));
  if (!hasGrainOut(line)) problems.push(problem("line:no-grain-out", null, "No Grain out on the line"));
  return problems;
}

// The machines a problem outlines on the canvas (issue #89): one outline
// per machine, even if it has more than one problem.
export function problemMachineIds(line) {
  return new Set(lineProblems(line).map((p) => p.machineId).filter(Boolean));
}

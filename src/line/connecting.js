// Connecting and disconnecting ports in Build mode (issue #88). The user
// drags from one port to another; connectPorts works out for itself which
// end is the output and which is the input, since a drag can start on
// either one. Like the other line document functions, neither function here
// ever changes the line it is given.
import { addSuggestionsFor, withoutStaleSuggestions } from "./suggestedInterlocks";

function endpointInfo(line, end) {
  const m = line.machines.find((x) => x.id === end.machine);
  if (!m) return { ok: false, error: `There is no machine "${end.machine}" on this line.` };
  const isOutput = m.ports.outputs.includes(end.port);
  const isInput = m.ports.inputs.includes(end.port);
  if (!isOutput && !isInput) return { ok: false, error: `${m.name} has no port "${end.port}".` };
  return { ok: true, machine: m, isOutput };
}

// A connection from a waste port is a waste connection (CONTEXT.md "Port");
// every other is a product connection. A waste port's name always starts
// with "waste" ("waste", "wasteOut") across the catalogue.
function connectionKindFor(outputPort) {
  return outputPort.toLowerCase().startsWith("waste") ? "waste" : "product";
}

// The identity of a connection: the output port it leaves from, since an
// output port drives at most one connection, so this is always unique on a
// valid line. Used to select a connection and to disconnect it.
export function connectionKey(c) {
  return `${c.from.machine}:${c.from.port}`;
}

// Returns { ok: true, line } or { ok: false, error }. `a` and `b` are each
// { machine, port }, in either order.
export function connectPorts(line, a, b) {
  const infoA = endpointInfo(line, a);
  if (!infoA.ok) return infoA;
  const infoB = endpointInfo(line, b);
  if (!infoB.ok) return infoB;
  if (a.machine === b.machine && a.port === b.port) {
    return { ok: false, error: "A port cannot connect to itself." };
  }
  if (infoA.isOutput && infoB.isOutput) {
    return { ok: false, error: "Two output ports cannot connect to each other." };
  }
  if (!infoA.isOutput && !infoB.isOutput) {
    return { ok: false, error: "Two input ports cannot connect to each other." };
  }
  // Only the output side is limited to one connection: a router or a
  // Diverter legitimately has more than one of its own output ports landing
  // on the same input (validateLine.test.js's own router fixture), since
  // only one of them is ever actually selected at a time.
  const [outEnd, outInfo, inEnd] = infoA.isOutput ? [a, infoA, b] : [b, infoB, a];
  const already = line.connections.find((c) => c.from.machine === outEnd.machine && c.from.port === outEnd.port);
  if (already) return { ok: false, error: `${outInfo.machine.name}'s ${outEnd.port} output already connects to something.` };
  const connection = {
    from: { machine: outEnd.machine, port: outEnd.port },
    to: { machine: inEnd.machine, port: inEnd.port },
    kind: connectionKindFor(outEnd.port),
  };
  // Issue #93: a new connection brings the interlocks it calls for.
  return { ok: true, line: addSuggestionsFor({ ...line, connections: [...line.connections, connection] }, connection) };
}

// Returns { ok: true, line } or { ok: false, error }. `from` is the output
// end of the connection to remove (connectionKey's own identity).
export function disconnectConnection(line, from) {
  const idx = line.connections.findIndex((c) => c.from.machine === from.machine && c.from.port === from.port);
  if (idx === -1) return { ok: false, error: `There is no connection from "${from.machine}:${from.port}".` };
  // Issue #93: a suggestion the user never changed goes with its connection.
  return { ok: true, line: withoutStaleSuggestions({ ...line, connections: line.connections.filter((_, i) => i !== idx) }) };
}

// Validates a hand-authored line definition (machines, connections, zones).
// Returns { ok, errors } where errors are human-readable strings, so a bad
// data edit made in a hurry (e.g. during the engineer meeting) fails loudly.
export function validateLine(line) {
  const errors = [];

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

  return { ok: errors.length === 0, errors };
}

// Stable per-machine chart colors, shared by MachinePopup (the plot toggles),
// ChartDock (the lines and legend) and EventLogPanel (the machine tags) so a
// machine's color is consistent wherever it's shown (issue #36).
import { C } from "../scene/theme";

export const PLOT_COLORS = [C.wheat, C.green, "#5a9ea0", C.red, "#b07cc6", C.amber];

// The roster of a line's sim-enabled machines, in declaration order -- a
// machine's color is assigned from its position here, not by plot/toggle
// order, so it never shifts as other machines are plotted or unplotted. Built
// from the line the sim is running rather than the golden line, so a line made
// with NEW LINE or OPEN plots its own machines. Mirrors PlantApp.jsx's
// `interlockedMachinesOf` derived-roster pattern.
export function plotRosterOf(line) {
  const machines = line.machines.filter((m) => m.sim?.kind);
  const colorFor = (machineId) => {
    const idx = machines.findIndex((m) => m.id === machineId);
    return PLOT_COLORS[(idx < 0 ? 0 : idx) % PLOT_COLORS.length];
  };
  return { machines, colorFor };
}

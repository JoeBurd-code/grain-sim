// Stable per-machine chart colors, shared by MachinePopup (the plot toggles)
// and ChartDock (the lines and legend) so a machine's color is consistent
// wherever it's shown (issue #36).
import { line } from "../line/lineData";
import { C } from "../scene/theme";

export const PLOT_COLORS = [C.wheat, C.green, "#5a9ea0", C.red, "#b07cc6", C.amber];

// Every sim-enabled machine, in declaration order -- the fixed roster a
// machine's color is assigned from by position, not by plot/toggle order, so
// a machine's color never shifts as other machines are plotted or unplotted
// elsewhere on the line. Mirrors PlantApp.jsx's own `interlockedMachines`
// derived-roster pattern.
export const PLOTTABLE_MACHINES = line.machines.filter((m) => m.sim?.kind);

export function plotColorFor(machineId) {
  const idx = PLOTTABLE_MACHINES.findIndex((m) => m.id === machineId);
  return PLOT_COLORS[(idx < 0 ? 0 : idx) % PLOT_COLORS.length];
}

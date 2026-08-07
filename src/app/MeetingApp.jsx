// Meeting frontend shell. Renders the real Treater Line 2 scene from the
// line definition with pan/zoom navigation. The full header chrome (transport
// stubs, legend, chart dock) lands with issue #9; zone buttons here are the
// provisional form from issue #5.
import { useCallback, useMemo, useState } from "react";
import { line } from "../line/lineData";
import { validateLine } from "../line/validateLine";
import { lineBounds, zoneBounds } from "../line/bounds";
import Scene from "../scene/Scene";
import MachinePopup from "./MachinePopup";
import TransportControls from "./TransportControls";
import ChartDock from "./ChartDock";
import EventLogPanel from "./EventLogPanel";
import { useViewport } from "../scene/useViewport";
import { useSimEngine } from "../sim/useSimEngine";
import { tPerHourToM3PerSec, BULK_DENSITY_T_PER_M3 } from "../sim/units";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

// Params that opt into live sim control declare `bind`; anything without
// one is a display-only value with no runtime effect.
const PARAM_BINDERS = {
  sourceRate: (engine, machineId, value) => engine.setRate(machineId, tPerHourToM3PerSec(value)),
  feederRate: (engine, machineId, value) => engine.setFeedRate(machineId, tPerHourToM3PerSec(value)),
  // Jumps the live accumulator to this fill % now, for staging a scenario
  // mid-presentation (e.g. drag to 95% to demo a near-overflow, or below the
  // low set point to stage the interlock's reopen) rather than waiting for
  // the source to fill or drain it there.
  levelJump: (engine, machineId, value) => engine.setLevel(machineId, value / 100),
  interlockHighSetpoint: (engine, machineId, value) => engine.setInterlockHigh(machineId, value / 100),
  interlockLowSetpoint: (engine, machineId, value) => engine.setInterlockLow(machineId, value / 100),
  interlockSignalDelay: (engine, machineId, value) => engine.setInterlockDelay(machineId, value),
  // Elevator VFD (issue #21): re-paces the transport delay live, including
  // material already in transit, not just newly fed material.
  elevatorSpeed: (engine, machineId, value) => engine.setElevatorSpeed(machineId, value / 100),
  // Pre-bin two-stage interlock (issue #22): the recovery threshold reuses
  // interlockLowSetpoint above, since both rule kinds name that field the
  // same; slow/stop each get their own set point and delay.
  interlockSlowSetpoint: (engine, machineId, value) => engine.setInterlockSlow(machineId, value / 100),
  interlockStopSetpoint: (engine, machineId, value) => engine.setInterlockStop(machineId, value / 100),
  interlockSlowDelay: (engine, machineId, value) => engine.setInterlockSlowDelay(machineId, value),
  interlockStopDelay: (engine, machineId, value) => engine.setInterlockStopDelay(machineId, value),
  // Batch treater (issue #24): the slider is in kg, the engineer's own unit;
  // converted to m3 at this edge, same pattern as sourceRate/feederRate's
  // t/h -> m3/s conversion. Cycle time is already in seconds.
  batchSize: (engine, machineId, value) => engine.setBatchSize(machineId, (value / 1000) / BULK_DENSITY_T_PER_M3),
  batchCycleTime: (engine, machineId, value) => engine.setBatchCycleTime(machineId, value),
  // Scalping screen (issue #26): the slider is a percentage, the engine wants a fraction.
  wasteFraction: (engine, machineId, value) => engine.setWasteFraction(machineId, value / 100),
};

const validation = validateLine(line);

// Every machine with an interlock rule, in declaration order — the fixed
// roster for the combined event panel's per-machine toggles (issue #33).
// Derived from line data, not from events seen so far, so a toggle exists
// for a machine even before its first trip.
const interlockedMachineIds = new Set((line.interlocks ?? []).map((i) => i.sensor.machine));
const interlockedMachines = line.machines.filter((m) => interlockedMachineIds.has(m.id));

const zoneBtnStyle = {
  background: "transparent", color: C.muted, border: `1px solid ${C.line}`,
  borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO, fontSize: 10,
  letterSpacing: "0.08em", cursor: "pointer",
};

export default function MeetingApp() {
  const [selectedId, setSelectedId] = useState(null);
  const [plotted, setPlotted] = useState(() => new Set());
  const [eventPanelOpen, setEventPanelOpen] = useState(false);
  const selected = line.machines.find((m) => m.id === selectedId);

  const home = useMemo(() => lineBounds(line), []);
  const { containerRef, vb, fitTo, wasDrag, handlers } = useViewport(home);
  const engine = useSimEngine(line);

  const togglePlot = useCallback((id) => {
    setPlotted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const closePopup = useCallback(() => setSelectedId(null), []);
  const onParamChange = useCallback(
    (machineId, param, value) => PARAM_BINDERS[param.bind]?.(engine, machineId, value),
    [engine]
  );

  return (
    <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_MONO }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .machine { cursor: pointer; }
        .machine .body { transition: stroke .15s ease; }
        .machine:hover .body { stroke: #6e7a71; }
        .machine .mname { transition: fill .15s ease; }
        .machine:hover .mname { fill: #ffffff; }
        .zonebtn:hover { color: #d4dad0; border-color: #6e7a71; }
        @keyframes instrumentPulse {
          0% { r: 9; opacity: 0.9; }
          100% { r: 20; opacity: 0; }
        }
        .instrument-pulse { animation: instrumentPulse 0.6s ease-out forwards; }
      `}</style>

      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px", borderBottom: `1px solid ${C.line}`, flex: "none", gap: 16, flexWrap: "wrap",
      }}>
        <TransportControls
          running={engine.running}
          onStart={engine.start}
          onPause={engine.pause}
          onStep={engine.stepOnce}
          onReset={engine.reset}
          speed={engine.speed}
          onSpeedChange={engine.setSpeed}
        />
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          {line.zones.map((z) => (
            <button key={z.id} className="zonebtn" style={zoneBtnStyle} onClick={() => fitTo(zoneBounds(line, z.id))}>
              {z.name}
            </button>
          ))}
          <button className="zonebtn" style={{ ...zoneBtnStyle, color: C.wheat }} onClick={() => fitTo(home)}>
            FIT ALL
          </button>
          <button
            className="zonebtn"
            style={eventPanelOpen
              ? { ...zoneBtnStyle, background: C.wheat, color: "#1a1a14", border: `1px solid ${C.wheat}` }
              : zoneBtnStyle}
            onClick={() => setEventPanelOpen((v) => !v)}
          >
            EVENT LOG
          </button>
        </div>
        <div style={{ fontSize: 9, color: selected ? C.wheat : C.muted, textAlign: "right", minWidth: 170 }}>
          {selected ? selected.name : "click a machine · drag to pan · wheel to zoom"}
        </div>
      </header>

      {validation.ok ? (
        <main ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
          {vb && (
            <Scene
              line={line}
              vb={vb}
              handlers={handlers}
              wasDrag={wasDrag}
              selectedId={selectedId}
              onSelect={setSelectedId}
              simSnap={engine.snap.machines}
            />
          )}
          {selected && (
            <MachinePopup
              key={selected.id}
              machine={selected}
              plotted={plotted}
              onTogglePlot={togglePlot}
              onClose={closePopup}
              onParamChange={onParamChange}
              events={engine.snap.machines.get(selected.id)?.events}
            />
          )}
          {eventPanelOpen && (
            <EventLogPanel
              machines={interlockedMachines}
              events={engine.snap.events}
              onClose={() => setEventPanelOpen(false)}
            />
          )}
        </main>
      ) : (
        <main style={{ padding: 24 }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 16, color: C.red, marginBottom: 10 }}>LINE DATA INVALID</div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>· {e}</div>
          ))}
        </main>
      )}

      {validation.ok && <ChartDock machines={line.machines} plotted={plotted} />}
    </div>
  );
}

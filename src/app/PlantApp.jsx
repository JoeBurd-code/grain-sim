// Meeting frontend shell. Renders the real Treater Line 2 scene from the
// line definition with pan/zoom navigation. The full header chrome (transport
// stubs, legend, chart dock) lands with issue #9; zone buttons here are the
// provisional form from issue #5.
import { useCallback, useMemo, useRef, useState } from "react";
import { line } from "../line/lineData";
import { validateLine } from "../line/validateLine";
import { lineBounds, zoneBounds } from "../line/bounds";
import Scene from "../scene/Scene";
import MachinePopup from "./MachinePopup";
import TransportControls from "./TransportControls";
import PlantControls from "./PlantControls";
import ChartDock from "./ChartDock";
import EventLogPanel from "./EventLogPanel";
import { useViewport } from "../scene/useViewport";
import { useSimEngine } from "../sim/useSimEngine";
import { tPerHourToM3PerSec, m3PerSecToTPerHour, BULK_DENSITY_T_PER_M3 } from "../sim/units";
import { isSeriesPlotted } from "../sim/plotHistory";
import { plotColorFor } from "./plotColors";
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
  // Pre-bin graded feed schedule (issue #56/#58/#60): LSHH, the schedule's
  // own latched trip set point, alongside LSH/LSL above, which
  // gradedFeedSchedule reuses unchanged.
  interlockHighHighSetpoint: (engine, machineId, value) => engine.setInterlockHighHigh(machineId, value / 100),
  interlockSignalDelay: (engine, machineId, value) => engine.setInterlockDelay(machineId, value),
  // Elevator VFD (issue #21): re-paces the transport delay live, including
  // material already in transit, not just newly fed material.
  elevatorSpeed: (engine, machineId, value) => engine.setElevatorSpeed(machineId, value / 100),
  // Drum feeder gate position (issue #56/#57/#60): the presenter's own dial,
  // never touched by the feed schedule (see setGateFraction's own comment,
  // engine.js) — mirrors elevatorSpeed above, on the feeder's gate rather
  // than the elevator's chain.
  gatePosition: (engine, machineId, value) => engine.setGateFraction(machineId, value / 100),
  // Batch treater (issue #24): the slider is in kg, the engineer's own unit;
  // converted to m3 at this edge, same pattern as sourceRate/feederRate's
  // t/h -> m3/s conversion. Cycle time is already in seconds.
  batchSize: (engine, machineId, value) => engine.setBatchSize(machineId, (value / 1000) / BULK_DENSITY_T_PER_M3),
  batchCycleTime: (engine, machineId, value) => engine.setBatchCycleTime(machineId, value),
  // Scalping screen (issue #26): the slider is a percentage, the engine wants a fraction.
  wasteFraction: (engine, machineId, value) => engine.setWasteFraction(machineId, value / 100),
};

// Live "actual" readouts (issue #34): the same declarative shape as
// PARAM_BINDERS above, but resolved against a machine's live published
// snapshot instead of calling into the engine. Only params whose machine can
// have its real output overridden by an active interlock declare `readBind`;
// a param with none shows no readout at all. The setpoint slider itself
// never reads from these — it stays bound only to the operator's own dial.
// Issue #63: every reader now returns `{ actual, cap, overridable }` rather
// than a bare number — `actual` is issue #34's original figure, unchanged;
// `cap` (in the same units as the param's own slider) is where a throttle
// band currently limits this dial, or `null` when this param has no such
// band at all (sourceRate/feederRate — see their own comment below); and
// `overridable` says whether the governing rule's live target is a genuine
// partial throttle (> 0) rather than a full stop, which can never be
// overridden. MachinePopup's own Slider combines this with the operator's
// dial (already passed to it separately) to derive the tick position and the
// armed/not-armed state itself — see that component's own comment.
const PARAM_READERS = {
  // Source valve (issue #19) and drum feeder (issue #42): each can be
  // overridden by an interlock (valve openness; a direct rate command) out
  // from under the presenter's own dial. Deliberately not flowRateM3PerSec
  // (issue #28) here — that also dips under downstream backpressure (a full
  // bin, a stalled belt) with no interlock involved at all, which would make
  // the readout noisy during perfectly ordinary operation (see issue #34's
  // "doesn't look like noise during normal operation" criterion). These
  // instead read the machine's own commanded rate, snapshotSource /
  // snapshotMeteredFeeder (src/sim/behaviors.js), which only moves when the
  // dial or an interlock actually changes it. Neither has a genuine partial-
  // throttle band of its own (the source valve is only ever fully open or
  // fully closed; the feeder's own auto-start command is a one-shot direct
  // write, not a live cap) — `cap: null` so issue #63's override mechanism
  // never engages for these two, honestly reflecting that there's nothing
  // here for a dial to be dragged past.
  sourceRateActual: (dynamic) => (dynamic ? { actual: m3PerSecToTPerHour((dynamic.nominalRate ?? 0) * (dynamic.openness ?? 1)), cap: null, overridable: false } : null),
  feederRateActual: (dynamic) => (dynamic ? { actual: m3PerSecToTPerHour(dynamic.rate ?? 0), cap: null, overridable: false } : null),
  // Elevator (issue #22's two-stage throttle, superseded on the real line by
  // issue #60's gradedFeedSchedule): speedFraction is the operator's own VFD
  // dial, throttleFraction is the interlock's own multiplier layered on top
  // — both already published by snapshotTransportDelay, combined here the
  // same way chainSpeedMPerMin is. `cap`/`overridable` read throttleFraction/
  // throttleTarget directly, in the dial's own percent units, for the
  // Slider's own tick and armed-state computation.
  elevatorSpeedActual: (dynamic) => (dynamic ? {
    actual: (dynamic.speedFraction ?? 1) * (dynamic.throttleFraction ?? 1) * 100,
    cap: (dynamic.throttleFraction ?? 1) * 100,
    overridable: (dynamic.throttleTarget ?? 1) > 0,
  } : null),
  // Drum feeder gate (issue #60): same shape as elevatorSpeedActual above —
  // gateFraction is the presenter's own dial, gateThrottleFraction the feed
  // schedule's own multiplier layered on top.
  gatePositionActual: (dynamic) => (dynamic ? {
    actual: (dynamic.gateFraction ?? 1) * (dynamic.gateThrottleFraction ?? 1) * 100,
    cap: (dynamic.gateThrottleFraction ?? 1) * 100,
    overridable: (dynamic.gateThrottleTarget ?? 1) > 0,
  } : null),
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

export default function PlantApp() {
  const [selectedId, setSelectedId] = useState(null);
  const [eventPanelOpen, setEventPanelOpen] = useState(false);
  const [eventJump, setEventJump] = useState(null);
  const jumpTokenRef = useRef(0);
  const selected = line.machines.find((m) => m.id === selectedId);

  const home = useMemo(() => lineBounds(line), []);
  const { containerRef, vb, fitTo, wasDrag, handlers } = useViewport(home);
  const engine = useSimEngine(line);

  // The operator's last-dragged slider position per machine/param, kept
  // above MachinePopup's own mount boundary (it unmounts entirely on
  // close) so reopening a machine's panel shows what was actually set,
  // not the lineData default every param starts from.
  const [paramValues, setParamValues] = useState({});

  // Restart (issue #45) already puts every live control back at the line's
  // authored defaults on the engine side; clear the persisted slider
  // positions here too so a reopened popup shows those same defaults
  // instead of stale pre-restart values.
  const onRestart = useCallback(() => {
    engine.restart();
    setParamValues({});
  }, [engine]);

  const closePopup = useCallback(() => setSelectedId(null), []);
  const onParamChange = useCallback(
    (machineId, param, value) => {
      setParamValues((prev) => ({
        ...prev,
        [machineId]: { ...prev[machineId], [param.id]: value },
      }));
      PARAM_BINDERS[param.bind]?.(engine, machineId, value);
    },
    [engine]
  );
  const onParamRead = useCallback(
    (machineId, param) => PARAM_READERS[param.readBind]?.(engine.snap.machines.get(machineId)) ?? null,
    [engine.snap]
  );

  // Issue #38: a chart event dot reports the clicked event's index in the
  // same combined `events` list the panel below reads, so opening/focusing
  // the panel and jumping it to that event need no second event lookup.
  // `token` always changes so re-clicking the same dot re-triggers the
  // scroll even when the panel is already open and already there.
  const onEventMarkerClick = useCallback((idx) => {
    setEventPanelOpen(true);
    jumpTokenRef.current += 1;
    setEventJump({ idx, token: jumpTokenRef.current });
  }, []);

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
        @keyframes eventRowFlash {
          0%, 100% { background: transparent; }
          50% { background: rgba(224, 168, 46, 0.35); }
        }
        .event-row-flash { animation: eventRowFlash 0.5s ease-out 3; border-radius: 4px; }
        @keyframes tripPulse {
          0%, 100% { background: transparent; color: ${C.red}; box-shadow: none; }
          50% { background: ${C.red}; color: #1a1a14; box-shadow: 0 0 8px 1px rgba(248, 81, 73, 0.7); }
        }
        .trip-pulse { animation: tripPulse 1s ease-in-out infinite; }
      `}</style>

      <header style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: "10px 16px", borderBottom: `1px solid ${C.line}`, flex: "none",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <TransportControls
            running={engine.running}
            onStart={engine.start}
            onPause={engine.pause}
            onStep={engine.stepOnce}
            onRestart={onRestart}
            speed={engine.speed}
            onSpeedChange={engine.setSpeed}
            elapsed={engine.snap.t}
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
        </div>
        <PlantControls
          onResetTrips={engine.resetTrips}
          anyTripLatched={engine.snap.anyTripLatched}
          source={engine.snap.source}
          onSetSource={engine.setSource}
          destination={engine.snap.destination}
          onSetDestination={engine.setDestination}
          onEmptyBin={(binId) => engine.setLevel(binId, 0)}
          onEmptyDiscardBin={() => engine.emptySink("discardBin")}
          controlledStopPhase={engine.snap.controlledStopPhase}
          onControlledStop={engine.controlledStop}
          onResumeLine={engine.resumeLine}
          utilitiesHealthy={engine.snap.utilitiesHealthy}
          utilitiesTripPhase={engine.snap.utilitiesTripPhase}
          onSetUtilitiesHealthy={engine.setUtilitiesHealthy}
          onClearPlant={engine.clearPlant}
        />
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
              levelPlotted={isSeriesPlotted(engine.history, selected.id, "level")}
              ratePlotted={isSeriesPlotted(engine.history, selected.id, "rate")}
              plotColor={plotColorFor(selected.id)}
              onToggleSeries={(kind) => engine.togglePlotSeries(selected.id, kind)}
              onClose={closePopup}
              paramValues={paramValues}
              onParamChange={onParamChange}
              onParamRead={onParamRead}
              events={engine.snap.machines.get(selected.id)?.events}
            />
          )}
          {eventPanelOpen && (
            <EventLogPanel
              machines={interlockedMachines}
              events={engine.snap.events}
              onClose={() => setEventPanelOpen(false)}
              jumpTo={eventJump}
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

      {validation.ok && (
        <ChartDock history={engine.history} events={engine.snap.events} onEventClick={onEventMarkerClick} />
      )}
    </div>
  );
}

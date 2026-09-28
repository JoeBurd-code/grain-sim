// Meeting frontend shell. Renders the real Treater Line 2 scene from the
// line definition with pan/zoom navigation. The full header chrome (transport
// stubs, legend, chart dock) lands with issue #9; zone buttons here are the
// provisional form from issue #5.
import { useCallback, useMemo, useRef, useState } from "react";
import { line } from "../line/lineData";
import { validateLine } from "../line/validateLine";
import { lineBounds, zoneBounds } from "../line/bounds";
import Scene from "../scene/Scene";
import MachinePopup, { THUMB_PX, TRACK_PX } from "./MachinePopup";
import TransportControls from "./TransportControls";
import PlantControls from "./PlantControls";
import ChartDock from "./ChartDock";
import EventLogPanel from "./EventLogPanel";
import { useViewport } from "../scene/useViewport";
import { useSimEngine } from "../sim/useSimEngine";
import { readLiveControl } from "../sim/liveControls";
import { isSeriesPlotted } from "../sim/plotHistory";
import { plotColorFor } from "./plotColors";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

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

  // Metal bin 1/2 (lineData.js) never discharge on their own — no document
  // covers truck loadout gate logic, so they only ever fill — and unlike the
  // discard bin they have no DESTINATION-section EMPTY BIN affordance of
  // their own unless they're the currently selected destination. Rather than
  // add a second dedicated button, EMPTY DISCARD BIN's own housekeeping
  // click also jumps both back to empty (engine.setLevel(id, 0), the same
  // call PlantControls' own EMPTY BIN uses) — a presenter's one "clear the
  // downstream clutter" action.
  const onEmptyDiscardBin = useCallback(() => {
    engine.emptySink("discardBin");
    engine.setLevel("metalBin1", 0);
    engine.setLevel("metalBin2", 0);
  }, [engine]);

  const closePopup = useCallback(() => setSelectedId(null), []);
  // Slider values reach the sim through sim/liveControls.js. A drag that
  // lands back on a dial's live cap is released by the sim itself
  // (setDial, sim/dial.js), so this only records the position and forwards it.
  const onParamChange = useCallback(
    (machineId, param, value) => {
      setParamValues((prev) => ({
        ...prev,
        [machineId]: { ...prev[machineId], [param.id]: value },
      }));
      if (param.bind) engine.setControl(machineId, param.bind, value);
    },
    [engine]
  );
  const onParamRead = useCallback(
    (machineId, param) => readLiveControl(engine.snap.machines.get(machineId), param.readBind),
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
        /* Pinned to MachinePopup.jsx's own THUMB_PX/TRACK_PX so the cap
           tick's own thumb-center math there matches what actually renders
           here. Both the track and the thumb are styled explicitly on both
           engines -- leaving one native and the other custom is what left
           the thumb's *vertical* centering unreliable (confirmed live: a
           thumb sized only via ::-webkit-slider-thumb, with the track still
           native, rendered a few px lower than the input's own box center)
           -- so nothing here is left for either engine to auto-position. */
        .param-slider {
          -webkit-appearance: none; appearance: none;
          background: transparent; cursor: pointer;
        }
        .param-slider::-webkit-slider-runnable-track {
          height: ${TRACK_PX}px; border-radius: ${TRACK_PX / 2}px;
          /* --fill-stop (MachinePopup.jsx) is the same thumb-center inset
             calc() the tick uses, so the filled/unfilled boundary lands
             exactly under the thumb too, not at a plain linear percentage. */
          background: linear-gradient(to right,
            var(--slider-color) 0%, var(--slider-color) var(--fill-stop),
            ${C.line} var(--fill-stop), ${C.line} 100%);
        }
        .param-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: ${THUMB_PX}px; height: ${THUMB_PX}px; border-radius: 50%;
          background: var(--slider-color);
          /* Centers the thumb on the thinner track -- see TRACK_PX's own
             comment (MachinePopup.jsx). */
          margin-top: ${(TRACK_PX - THUMB_PX) / 2}px;
          cursor: pointer;
        }
        .param-slider::-moz-range-track {
          height: ${TRACK_PX}px; border-radius: ${TRACK_PX / 2}px;
          background: ${C.line};
        }
        .param-slider::-moz-range-progress {
          height: ${TRACK_PX}px; border-radius: ${TRACK_PX / 2}px 0 0 ${TRACK_PX / 2}px;
          background: var(--slider-color);
        }
        .param-slider::-moz-range-thumb {
          width: ${THUMB_PX}px; height: ${THUMB_PX}px; border-radius: 50%;
          background: var(--slider-color);
          border: none;
          cursor: pointer;
        }
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
          onEmptyDiscardBin={onEmptyDiscardBin}
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
              running={engine.running}
              speed={engine.speed}
              simTime={engine.snap.t}
            />
          )}
          {selected && (
            <MachinePopup
              key={selected.id}
              machine={selected}
              dynamic={engine.snap.machines.get(selected.id)}
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

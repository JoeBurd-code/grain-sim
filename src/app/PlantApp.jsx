// Meeting frontend shell. Renders the real Treater Line 2 scene from the
// line definition with pan/zoom navigation. The full header chrome (transport
// stubs, legend, chart dock) lands with issue #9; zone buttons here are the
// provisional form from issue #5.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { goldenLine, goldenLineErrors, GOLDEN_LINE_NAME } from "../line/goldenLine";
import {
  exportLine, importLineFile, setAdjustableValue, moveMachine, addMachine, deleteMachine, emptyLine,
  connectPorts, disconnectConnection, connectionKey, setMachineText,
} from "../line/lineDocument";
import { catalogueItem } from "../catalogue/catalogue";
import { placeMachine } from "../line/layout";
import { lineBounds, zoneBounds, machineBounds } from "../line/bounds";
import { lineProblems, problemMachineIds, hasGrainIn } from "../line/problems";
import { plantControlsFor } from "../line/plantControls";
import Scene from "../scene/Scene";
import MachinePopup, { THUMB_PX, TRACK_PX } from "./MachinePopup";
import TransportControls from "./TransportControls";
import PlantControls from "./PlantControls";
import ChartDock from "./ChartDock";
import EventLogPanel from "./EventLogPanel";
import ModeSwitch from "./ModeSwitch";
import BuildPanel from "./BuildPanel";
import CataloguePanel, { CATALOGUE_DRAG_TYPE } from "./CataloguePanel";
import { loadSavedWork, storeWork, clearSavedWork, hasUnsavedWork } from "./savedWork";
import { useViewport } from "../scene/useViewport";
import { useMachineDrag, toWorld } from "../scene/useMachineDrag";
import { useConnectionDrag } from "../scene/useConnectionDrag";
import { useSimEngine } from "../sim/useSimEngine";
import { readLiveControl } from "../sim/liveControls";
import { isSeriesPlotted } from "../sim/plotHistory";
import { plotColorFor } from "./plotColors";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";
import { lineRules, interlockSensorMachine, isRuleOff } from "../line/interlocks";
import { setpointSliders } from "../line/setpointSliders";

// The golden line is validated on its way in through the import path
// (goldenLine.js); any errors land here for the LINE DATA INVALID screen.
// An opened file is validated by importLineFile and never loads when it fails.
const goldenValidation = { ok: goldenLineErrors.length === 0, errors: goldenLineErrors };
const GOLDEN_LINE_DOC = { line: goldenLine, name: GOLDEN_LINE_NAME, fromFile: false };
// NEW LINE (issue #87). Like an opened file, a new line is stored whole.
const NEW_LINE_NAME = "new line";
const CATALOGUE_OPEN_KEY = "grain-sim:catalogue-open";
// Scroll bar thumb: lighter than the panel lines, so it shows on every panel.
const SCROLL_THUMB = "#3a4143";
const SCROLL_THUMB_HOVER = "#566064";

// Typing in a box never deletes a machine.
function isTyping(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

// "golden line" -> "golden-line.json".
function fileNameFor(name) {
  const slug = name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${slug || "line"}.json`;
}

// SAVE (issue #75): the current line as a JSON file download. Build mode
// only — a file is a design, never a run.
function downloadLine(lineToSave, name) {
  const blob = new Blob([exportLine(lineToSave, name)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFor(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Every machine an interlock or machine rule reads, in line order: the fixed
// roster for the combined event panel's per-machine toggles (issue #33).
// Derived from line data, not from events seen so far, so a toggle exists
// for a machine even before its first trip.
function interlockedMachinesOf(line) {
  const ids = new Set(lineRules(line).filter((r) => !isRuleOff(line, r)).map(interlockSensorMachine));
  return line.machines.filter((m) => ids.has(m.id));
}

const zoneBtnStyle = {
  background: "transparent", color: C.muted, border: `1px solid ${C.line}`,
  borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO, fontSize: 10,
  letterSpacing: "0.08em", cursor: "pointer",
};
const zoneBtnActiveStyle = { ...zoneBtnStyle, background: C.wheat, color: "#1a1a14", border: `1px solid ${C.wheat}` };

export default function PlantApp() {
  // Issue #76: the current line is the golden line or an opened file. The
  // sim runs `simLine`, which is set only on a mode switch, OPEN or START
  // OVER, so a Build mode edit to the current line never rebuilds the sim.
  // Issue #79: the page opens on the work the browser saved, if any.
  const [initial] = useState(() => loadSavedWork(GOLDEN_LINE_DOC) ?? GOLDEN_LINE_DOC);
  const [current, setCurrent] = useState(initial);
  const [simLine, setSimLine] = useState(initial.line);
  // Autosave on every change to the current line. The line the page opened
  // on is not stored again, so saved work this app cannot read (a file that
  // no longer validates, a newer format) stays until the user changes the line.
  useEffect(() => {
    if (current !== initial) storeWork(GOLDEN_LINE_DOC, current);
  }, [current, initial]);
  const { line } = current;
  const validation = current.fromFile ? { ok: true, errors: [] } : goldenValidation;
  const interlockedMachines = useMemo(() => interlockedMachinesOf(line), [line]);

  const [selectedId, setSelectedId] = useState(null);
  // Issue #88: a selected connection, keyed by its own output end
  // (connectionKey), never at the same time as a selected machine.
  const [selectedConnectionKey, setSelectedConnectionKey] = useState(null);
  const [eventPanelOpen, setEventPanelOpen] = useState(false);
  const [eventJump, setEventJump] = useState(null);
  const jumpTokenRef = useRef(0);
  const selected = line.machines.find((m) => m.id === selectedId);
  const selectedConnection = line.connections.find((c) => connectionKey(c) === selectedConnectionKey);

  const home = useMemo(() => lineBounds(line), [line]);
  const { containerRef, vb, fitTo, wasDrag: viewportWasDrag, handlers: viewportHandlers } = useViewport(home);
  const engine = useSimEngine(simLine);

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

  // Issue #75: the app is always in exactly one mode. Every switch, in
  // either direction, is a full RESTART, so a design never applies to an old
  // run and Sim mode always starts from empty, paused. Selection and the
  // event panel are dropped too, so neither mode inherits the other's state.
  const [mode, setMode] = useState("sim");
  const building = mode === "build";
  // Build mode's right panel shows the line settings or the selected
  // machine, never both: one panel, always in the same place.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Issue #89: the problems panel is a third state the right panel can be
  // in, same rule as SETTINGS -- never shown at the same time as a selected
  // machine or connection.
  const [problemsOpen, setProblemsOpen] = useState(false);
  const problems = useMemo(() => lineProblems(line), [line]);
  const problemIds = useMemo(() => problemMachineIds(line), [line]);
  const runDisabledReason = useMemo(() => (hasGrainIn(simLine) ? null : "Add a Grain in to start"), [simLine]);
  const onGoToProblem = useCallback((machineId) => {
    setSelectedId(machineId);
    setSelectedConnectionKey(null);
    setSettingsOpen(false);
    setProblemsOpen(false);
    fitTo(machineBounds(line, machineId));
  }, [line, fitTo]);
  // NEW LINE's confirmation, shown when there is work to lose.
  const [confirmingNewLine, setConfirmingNewLine] = useState(false);
  // Whether the catalogue panel is shown. Remembered in this browser only,
  // as a convenience: blocked storage just means it starts shown.
  const [catalogueOpen, setCatalogueOpen] = useState(() => {
    try {
      return window.localStorage.getItem(CATALOGUE_OPEN_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const onToggleCatalogue = useCallback(() => {
    setCatalogueOpen((open) => {
      try {
        window.localStorage.setItem(CATALOGUE_OPEN_KEY, String(!open));
      } catch {
        // Not remembered; the panel still hides.
      }
      return !open;
    });
  }, []);
  // OPEN's last refusal, shown until the next OPEN, START OVER or mode switch.
  const [openError, setOpenError] = useState(null);
  // Bumped on every mode switch. A file read that finishes after a switch is
  // dropped, so OPEN never loads a line outside Build mode.
  const modeSwitchCountRef = useRef(0);
  const onModeChange = useCallback((next) => {
    modeSwitchCountRef.current += 1;
    onRestart();
    setSimLine(line);
    setSelectedId(null);
    setSelectedConnectionKey(null);
    setEventPanelOpen(false);
    setSettingsOpen(false);
    setProblemsOpen(false);
    setOpenError(null);
    setConfirmingNewLine(false);
    setMode(next);
  }, [onRestart, line]);

  // OPEN and START OVER both replace the current line and rebuild the sim
  // from it. They exist only in Build mode, where the sim is already reset.
  const loadLine = useCallback((next) => {
    setCurrent(next);
    setSimLine(next.line);
    setParamValues({});
    setSelectedId(null);
    setSelectedConnectionKey(null);
    setOpenError(null);
    fitTo(lineBounds(next.line));
  }, [fitTo]);

  const fileInputRef = useRef(null);
  const onOpenFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    const switchCount = modeSwitchCountRef.current;
    let text;
    try {
      text = await file.text();
    } catch {
      text = null;
    }
    if (modeSwitchCountRef.current !== switchCount) return;
    if (text === null) {
      setOpenError({ name: file.name, errors: ["This file could not be read."] });
      return;
    }
    const result = importLineFile(text, file.name);
    if (!result.ok) {
      setOpenError({ name: file.name, errors: result.errors });
      return;
    }
    loadLine({ line: result.line, name: result.name, fromFile: true });
  }, [loadLine]);

  const onStartOver = useCallback(() => {
    clearSavedWork();
    loadLine(GOLDEN_LINE_DOC);
    setSettingsOpen(false);
    setConfirmingNewLine(false);
  }, [loadLine]);

  const startNewLine = useCallback(() => {
    setConfirmingNewLine(false);
    setSettingsOpen(false);
    loadLine({ line: emptyLine(), name: NEW_LINE_NAME, fromFile: true });
  }, [loadLine]);
  const onNewLine = useCallback(() => {
    if (hasUnsavedWork(GOLDEN_LINE_DOC, current)) setConfirmingNewLine(true);
    else startNewLine();
  }, [current, startNewLine]);

  // Issue #78: a Build mode edit changes the current line only. The sim
  // picks it up on the switch back to Sim mode, where it is what RESTART
  // returns to; Sim mode sliders act on the sim and never reach this line.
  // A refused value leaves the line as it was and the message goes back to
  // the panel. The edit is applied again inside the updater, so two commits
  // before one render (a blur and a click) both land.
  const onEditField = useCallback((machineId, fieldId, value) => {
    const result = setAdjustableValue(line, machineId, fieldId, value);
    if (result.ok) {
      setCurrent((c) => {
        const next = setAdjustableValue(c.line, machineId, fieldId, value);
        return next.ok ? { ...c, line: next.line } : c;
      });
    }
    return result;
  }, [line]);

  // Issue #90: a machine's name or tag, the same double-apply pattern as
  // onEditField.
  const onEditText = useCallback((machineId, key, value) => {
    const result = setMachineText(line, machineId, key, value);
    if (result.ok) {
      setCurrent((c) => {
        const next = setMachineText(c.line, machineId, key, value);
        return next.ok ? { ...c, line: next.line } : c;
      });
    }
    return result;
  }, [line]);

  // Issue #86: a machine dragged in Build mode moves in the current line.
  // The move is applied again inside the updater, as onEditField does. A
  // move the line refuses leaves it as it was.
  const onMoveMachine = useCallback((machineId, pos) => {
    setCurrent((c) => {
      const next = moveMachine(c.line, machineId, pos);
      return next.ok && next.line !== c.line ? { ...c, line: next.line } : c;
    });
  }, []);
  const drag = useMachineDrag(line, onMoveMachine);

  // Issue #87: a catalogue item dropped on the canvas is added there, centred
  // on the pointer, and selected so its values show in the right panel. Alt
  // turns snapping off, as it does for a move.
  const onCanvasDragOver = useCallback((e) => {
    if (!building || !e.dataTransfer.types.includes(CATALOGUE_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, [building]);
  const onCanvasDrop = useCallback((e) => {
    const itemId = e.dataTransfer.getData(CATALOGUE_DRAG_TYPE);
    const item = catalogueItem(itemId);
    const svg = containerRef.current?.querySelector("svg");
    if (!building || !item || !svg) return;
    e.preventDefault();
    const world = toWorld(svg, e);
    const pos = { x: world.x - item.machine.w / 2, y: world.y - item.machine.h / 2, snap: !e.altKey };
    const result = addMachine(line, itemId, pos);
    if (!result.ok) return;
    setCurrent((c) => {
      const next = addMachine(c.line, itemId, pos);
      return next.ok ? { ...c, line: next.line } : c;
    });
    setSelectedId(result.id);
    setSelectedConnectionKey(null);
    setSettingsOpen(false);
  }, [building, containerRef, line]);

  // Issue #87: the Delete key or the right panel's button deletes the
  // selected machine and its connections.
  const onDeleteMachine = useCallback((machineId) => {
    setCurrent((c) => {
      const next = deleteMachine(c.line, machineId);
      return next.ok ? { ...c, line: next.line } : c;
    });
    setSelectedId(null);
  }, []);

  // Issue #88: a press on a port dot connects it to the next one the drag
  // releases over; connectPorts decides whether it is refused. Run first
  // against the current line so the refusal (if any) reaches the drag hook
  // synchronously, then applied again inside the updater, as every other
  // Build mode edit here does.
  const onConnectPorts = useCallback((a, b) => {
    const result = connectPorts(line, a, b);
    if (result.ok) {
      setCurrent((c) => {
        const next = connectPorts(c.line, a, b);
        return next.ok ? { ...c, line: next.line } : c;
      });
    }
    return result;
  }, [line]);
  const connectionDrag = useConnectionDrag(line, onConnectPorts);

  // The Delete key or the right panel's button removes the selected
  // connection, the same way it removes a selected machine.
  const onDisconnect = useCallback((key) => {
    setCurrent((c) => {
      const conn = c.line.connections.find((x) => connectionKey(x) === key);
      if (!conn) return c;
      const next = disconnectConnection(c.line, conn.from);
      return next.ok ? { ...c, line: next.line } : c;
    });
    setSelectedConnectionKey(null);
  }, []);

  useEffect(() => {
    if (!building || (!selectedId && !selectedConnectionKey)) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== "Delete" || isTyping(e.target)) return;
      e.preventDefault();
      if (selectedId) onDeleteMachine(selectedId);
      else onDisconnect(selectedConnectionKey);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [building, selectedId, selectedConnectionKey, onDeleteMachine, onDisconnect]);
  const { onCanvasPointerDown, wasDrag: dragWasDrag } = drag;
  const handlers = useMemo(() => ({
    onPointerDown: (e) => {
      onCanvasPointerDown();
      viewportHandlers.onPointerDown(e);
    },
  }), [onCanvasPointerDown, viewportHandlers]);
  const wasDrag = useCallback(() => dragWasDrag(viewportWasDrag), [dragWasDrag, viewportWasDrag]);
  // While a drag is in progress the scene draws the machine where it would
  // land; the current line changes only on release.
  const shownLine = useMemo(
    () => (drag.preview ? placeMachine(line, drag.preview.id, drag.preview.pos) : line),
    [line, drag.preview],
  );

  const onSelect = useCallback((id) => {
    setSelectedId(id);
    setSelectedConnectionKey(null);
    if (id) {
      setSettingsOpen(false);
      setProblemsOpen(false);
    }
  }, []);
  const onSelectConnection = useCallback((key) => {
    setSelectedConnectionKey(key);
    setSelectedId(null);
    setSettingsOpen(false);
    setProblemsOpen(false);
  }, []);

  // Issue #81: the plant control panel is generated from the line the sim
  // runs, so its buttons always name machines that sim has.
  const plantControls = useMemo(() => plantControlsFor(simLine), [simLine]);

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
      if (param.bind) engine.setControl(machineId, param.bind, value, param.target);
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
        .catalogue-item:hover { border-color: ${C.line} !important; background: ${C.panel2}; }
        /* A thumbnail is drawn small; its lines keep their width (issue #87). */
        .catalogue-thumb * { vector-effect: non-scaling-stroke; }
        .catalogue-handle:hover { color: ${C.wheat} !important; background: ${C.panel2} !important; }
        /* Every scroll bar in the app: thin, in the app's colours. The thumb
           is 6 px wide inside a 10 px bar, so it is easy to grab. Chrome,
           Edge and Safari read the -webkit- rules, which give a rounded
           thumb. Firefox reads only scrollbar-width and scrollbar-color;
           those also switch the -webkit- rules off in Chrome, so they are
           set for Firefox alone. */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: ${SCROLL_THUMB}; border-radius: 5px;
          border: 2px solid transparent; background-clip: padding-box;
        }
        ::-webkit-scrollbar-thumb:hover { background-color: ${SCROLL_THUMB_HOVER}; }
        ::-webkit-scrollbar-corner { background: transparent; }
        @supports (-moz-appearance: none) {
          * { scrollbar-width: thin; scrollbar-color: ${SCROLL_THUMB} transparent; }
        }
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
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ModeSwitch mode={mode} onChange={onModeChange} />
            <div style={{ fontSize: 10, color: C.text, letterSpacing: "0.04em" }} title="current line">
              {current.name}
            </div>
            {building ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="zonebtn" style={{ ...zoneBtnStyle, color: C.wheat }} onClick={onNewLine}>
                  NEW LINE
                </button>
                <button className="zonebtn" style={{ ...zoneBtnStyle, color: C.wheat }} onClick={() => fileInputRef.current?.click()}>
                  OPEN
                </button>
                <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={onOpenFile} />
                <button className="zonebtn" style={{ ...zoneBtnStyle, color: C.wheat }} onClick={() => downloadLine(line, current.name)}>
                  SAVE
                </button>
                <button
                  className="zonebtn"
                  style={problemsOpen
                    ? zoneBtnActiveStyle
                    : zoneBtnStyle}
                  onClick={() => {
                    setProblemsOpen((v) => !v);
                    setSettingsOpen(false);
                    setSelectedId(null);
                    setSelectedConnectionKey(null);
                  }}
                >
                  PROBLEMS{problems.length > 0 ? ` (${problems.length})` : ""}
                </button>
                <button
                  className="zonebtn"
                  style={settingsOpen
                    ? zoneBtnActiveStyle
                    : zoneBtnStyle}
                  onClick={() => {
                    setSettingsOpen((v) => !v);
                    setProblemsOpen(false);
                    setSelectedId(null);
                    setSelectedConnectionKey(null);
                  }}
                >
                  SETTINGS
                </button>
              </div>
            ) : (
              <TransportControls
                running={engine.running}
                onStart={engine.start}
                onPause={engine.pause}
                onStep={engine.stepOnce}
                onRestart={onRestart}
                speed={engine.speed}
                onSpeedChange={engine.setSpeed}
                elapsed={engine.snap.t}
                runDisabledReason={runDisabledReason}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flex: "none" }}>
            {line.zones.map((z) => (
              <button key={z.id} className="zonebtn" style={zoneBtnStyle} onClick={() => fitTo(zoneBounds(line, z.id))}>
                {z.name}
              </button>
            ))}
            <button className="zonebtn" style={{ ...zoneBtnStyle, color: C.wheat }} onClick={() => fitTo(home)}>
              FIT ALL
            </button>
            {!building && (
              <button
                className="zonebtn"
                style={eventPanelOpen
                  ? zoneBtnActiveStyle
                  : zoneBtnStyle}
                onClick={() => setEventPanelOpen((v) => !v)}
              >
                EVENT LOG
              </button>
            )}
          </div>
          <div style={{ fontSize: 9, color: selected ? C.wheat : C.muted, textAlign: "right", minWidth: 170 }}>
            {selected
              ? selected.name
              : building
                ? "drag a port dot to connect · drag from the catalogue to add · drag to move · Alt places off the grid · Delete removes"
                : "click a machine · drag to pan · wheel to zoom"}
          </div>
        </div>
        {building && connectionDrag.error && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, color: C.red }}>
            {connectionDrag.error}
          </div>
        )}
        {building && confirmingNewLine && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, color: C.text }}>
            <div>Discard the work on {current.name} and start a new line?</div>
            <button
              className="zonebtn"
              style={{ ...zoneBtnStyle, color: C.red, borderColor: C.red, padding: "2px 8px" }}
              onClick={startNewLine}
            >
              DISCARD AND START NEW
            </button>
            <button className="zonebtn" style={{ ...zoneBtnStyle, padding: "2px 8px" }} onClick={() => setConfirmingNewLine(false)}>
              CANCEL
            </button>
          </div>
        )}
        {building && openError && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 10, color: C.red }}>
            <div>
              <div>Could not open {openError.name}. The current line is unchanged.</div>
              {openError.errors.map((e, i) => <div key={i}>· {e}</div>)}
            </div>
            <button className="zonebtn" style={{ ...zoneBtnStyle, padding: "2px 8px" }} onClick={() => setOpenError(null)}>
              DISMISS
            </button>
          </div>
        )}
        {!building && <PlantControls
          onResetTrips={engine.resetTrips}
          anyTripLatched={engine.snap.anyTripLatched}
          controls={plantControls}
          selections={engine.snap.selections}
          onSelect={engine.select}
          onEmpty={engine.empty}
          controlledStopPhase={engine.snap.controlledStopPhase}
          onControlledStop={engine.controlledStop}
          onResumeLine={engine.resumeLine}
          utilitiesHealthy={engine.snap.utilitiesHealthy}
          utilitiesTripPhase={engine.snap.utilitiesTripPhase}
          onSetUtilitiesHealthy={engine.setUtilitiesHealthy}
          onClearPlant={engine.clearPlant}
        />}
      </header>

      {validation.ok ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {building && <CataloguePanel open={catalogueOpen} onToggle={onToggleCatalogue} />}
          <main
            ref={containerRef}
            style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}
            onDragOver={onCanvasDragOver}
            onDrop={onCanvasDrop}
          >
            {vb && (
              <Scene
                line={shownLine}
                vb={vb}
                handlers={handlers}
                wasDrag={wasDrag}
                selectedId={selectedId}
                onSelect={onSelect}
                simSnap={engine.snap.machines}
                running={engine.running}
                speed={engine.speed}
                simTime={engine.snap.t}
                onMachinePointerDown={building ? drag.onMachinePointerDown : undefined}
                overlapId={drag.flashId}
                onPortPointerDown={building ? connectionDrag.onPortPointerDown : undefined}
                selectedConnectionKey={building ? selectedConnectionKey : null}
                onSelectConnection={building ? onSelectConnection : undefined}
                connectionDraft={building ? connectionDrag.draft : null}
                problemMachineIds={building ? problemIds : null}
              />
            )}
            {selected && !building && (
              <MachinePopup
                key={selected.id}
                machine={selected}
                // Issue #85: the machine's own sliders, then a set point
                // slider for each level switch or condition the sim's rules
                // read on it, at the value the line gives it.
                params={[...(selected.params ?? []), ...setpointSliders(simLine, selected.id)]}
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
            {eventPanelOpen && !building && (
              <EventLogPanel
                machines={interlockedMachines}
                events={engine.snap.events}
                onClose={() => setEventPanelOpen(false)}
                jumpTo={eventJump}
              />
            )}
          </main>
          {building && (
            <BuildPanel
              line={line}
              machine={selected}
              connection={selectedConnection}
              settingsOpen={settingsOpen}
              problemsOpen={problemsOpen}
              problems={problems}
              lineName={current.name}
              onStartOver={onStartOver}
              onEditField={onEditField}
              onEditText={onEditText}
              onDeleteMachine={onDeleteMachine}
              onDeleteConnection={() => onDisconnect(selectedConnectionKey)}
              onGoToProblem={onGoToProblem}
            />
          )}
        </div>
      ) : (
        <main style={{ padding: 24 }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 16, color: C.red, marginBottom: 10 }}>LINE DATA INVALID</div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>· {e}</div>
          ))}
        </main>
      )}

      {validation.ok && !building && (
        <ChartDock history={engine.history} events={engine.snap.events} onEventClick={onEventMarkerClick} />
      )}
    </div>
  );
}

// React binding for the sim engine. The real-time budget loop and throttled
// snapshot publication are lifted unchanged from the proven mock
// (GrainFlowSim.jsx): the speed multiplier scales how much sim time is
// consumed per wall-clock second, never the fixed timestep itself.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSim, stepSim, resetSim, resetTrips as resetTripsSim, clearPlant as clearPlantSim, setSourceRate, setFeederRate, setAccumulatorLevel, emptyTerminalSink, DT,
  setInterlockHighSetpoint, setInterlockLowSetpoint, setInterlockSignalDelay, setElevatorSpeed,
  setInterlockSlowSetpoint, setInterlockStopSetpoint,
  setInterlockSlowDelay as engineSetInterlockSlowDelay, setInterlockStopDelay as engineSetInterlockStopDelay,
  setBatchSize, setBatchCycleSec, setSplitterWasteFraction, getCombinedEvents,
  setSource as setSourceSim, getSource,
  setDestination as setDestinationSim, getDestination,
  controlledStop as controlledStopSim, resumeLine as resumeLineSim, getControlledStopPhase,
  setUtilitiesHealthy as setUtilitiesHealthySim, getUtilitiesHealthy, getUtilitiesTripPhase,
} from "./engine";
import { BEHAVIORS } from "./behaviors";
import { createPlotHistory, setSeriesPlotted, recordSample } from "./plotHistory";

const MAX_STEPS_PER_FRAME = 60;
const PUBLISH_INTERVAL_MS = 100;

function publishSnap(sim) {
  const machines = new Map();
  // Issue #28: every sim-enabled machine publishes its live flow rate
  // (engine.js sets this generically every tick), merged with whatever
  // kind-specific snapshot fields a behaviour also declares — a kind with no
  // `snapshot` (source, meteredFeeder, passThrough) now still publishes this
  // one figure instead of nothing at all.
  for (const [id, state] of sim.machines) {
    const kindSnap = BEHAVIORS[state.kind]?.snapshot?.(state);
    machines.set(id, { flowRateM3PerSec: state.flowRateM3PerSec ?? 0, ...kindSnap });
  }
  // A rule's event log and per-instrument state (issue #30: setpoint,
  // tripped, pulseGen — LT/LSH/LSL dots on the scene) are published on its
  // sensor machine's snapshot, since that's the machine whose popup and
  // scene symbol both read them.
  for (const rule of sim.control) {
    machines.set(rule.sensorId, { ...machines.get(rule.sensorId), events: rule.log, instruments: rule.instruments });
  }
  // Issue #29: the same rule logs, flattened line-wide and tagged with
  // their source machine, for the combined event panel and (later) the
  // graph's event markers, from the single source of truth in engine.js's
  // getCombinedEvents / control.js's combineEventLogs.
  // `source` (issue #46): which packaging feeder the plant-control cluster's
  // selector currently has open, derived fresh off the machines themselves
  // (engine.js's getSource) rather than tracked separately, so it can never
  // drift from what's actually running. `destination` (issue #47) is the
  // same pattern for the two routers the destination selector commands.
  // `controlledStopPhase` (issue #50) is the same pattern again, for the
  // controlled-stop button's own active/inactive state.
  return {
    t: sim.t, machines, events: getCombinedEvents(sim), source: getSource(sim), destination: getDestination(sim),
    controlledStopPhase: getControlledStopPhase(sim),
    // Issue #51: same derived-off-the-sim pattern as controlledStopPhase
    // above — the toggle's own position and the trip's own latch phase are
    // two independent facts (health can be restored while still "tripped",
    // pending a reset), so both are published rather than collapsed into one.
    utilitiesHealthy: getUtilitiesHealthy(sim), utilitiesTripPhase: getUtilitiesTripPhase(sim),
  };
}

export function useSimEngine(line) {
  const [sim] = useState(() => createSim(line));
  const [snap, setSnap] = useState(() => publishSnap(sim));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(5);
  // Issue #36: the shared chart's recorded series live here, not in the page
  // component, since this hook already owns the throttled publish cadence
  // that determines the graph's sample rate -- every recordSample call below
  // rides the same `publish` this hook already runs on.
  const [history, setHistory] = useState(() => createPlotHistory());

  const runRef = useRef(false);
  const speedRef = useRef(speed);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastPublishRef = useRef(0);
  const budgetRef = useRef(0);
  // Recursion goes through a ref (kept in sync via the effect below, never
  // written during render) so `loop` doesn't need to reference its own
  // useCallback binding before it exists.
  const loopRef = useRef(null);

  useEffect(() => { speedRef.current = speed; }, [speed]);

  const publish = useCallback(() => {
    const s = publishSnap(sim);
    setSnap(s);
    setHistory((prev) => recordSample(prev, s.t, s.machines));
  }, [sim]);

  const loop = useCallback((ts) => {
    if (!runRef.current) return;
    if (!lastTsRef.current) lastTsRef.current = ts;
    const dtReal = Math.min(0.1, (ts - lastTsRef.current) / 1000);
    lastTsRef.current = ts;
    budgetRef.current += dtReal * speedRef.current;
    let steps = 0;
    while (budgetRef.current >= DT && steps < MAX_STEPS_PER_FRAME) {
      stepSim(sim, DT);
      budgetRef.current -= DT;
      steps++;
    }
    if (ts - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
      publish();
      lastPublishRef.current = ts;
    }
    rafRef.current = requestAnimationFrame(loopRef.current);
  }, [sim, publish]);

  useEffect(() => { loopRef.current = loop; }, [loop]);

  const start = useCallback(() => {
    if (runRef.current) return;
    runRef.current = true;
    setRunning(true);
    lastTsRef.current = 0;
    budgetRef.current = 0;
    rafRef.current = requestAnimationFrame(loopRef.current);
  }, []);

  const pause = useCallback(() => {
    runRef.current = false;
    setRunning(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const stepOnce = useCallback(() => {
    stepSim(sim, DT);
    publish();
  }, [sim, publish]);

  // Puts the whole system back to t=0 with every live control (rates,
  // interlock set points, elevator speed) back at the line's authored
  // defaults — the same end state as reloading the page, without losing
  // pan/zoom or the selected machine's popup. Named `restart`, not `reset`
  // (issue #45), so it's never confused with the plant control's own
  // resetTrips below — one wipes the whole run, the other only clears
  // latched interlocks and leaves everything else running.
  const restart = useCallback(() => {
    pause();
    resetSim(sim);
    lastTsRef.current = 0;
    budgetRef.current = 0;
    // Un-plots every series rather than just emptying them, so a presenter
    // starts each fresh run by deliberately re-choosing what to plot instead
    // of carrying over a prior run's selection.
    setHistory(createPlotHistory());
    publish();
  }, [sim, pause, publish]);

  // Plant control (issue #45): the SCADA reset, clearing every latched trip
  // on the line at once. Takes effect immediately, whether paused or
  // running, same as the other presenter-facing live controls below.
  const resetTrips = useCallback(() => {
    resetTripsSim(sim);
    publish();
  }, [sim, publish]);

  // Plant control (issue #55): CLEAR PLANT — takes effect immediately,
  // whether paused or running, same one-click shape as every other plant
  // control here.
  const clearPlant = useCallback(() => {
    clearPlantSim(sim);
    publish();
  }, [sim, publish]);

  // Toggles one machine's level/rate series on or off (issue #36). Reads the
  // latest history via the functional updater rather than closing over the
  // `history` state value, so rapid double-toggles never race a stale read.
  const togglePlotSeries = useCallback((machineId, kind) => {
    setHistory((prev) => setSeriesPlotted(prev, machineId, kind, !(prev.get(machineId)?.[kind] != null)));
  }, []);

  const setRate = useCallback((machineId, rateM3PerSec) => {
    setSourceRate(sim, machineId, rateM3PerSec);
  }, [sim]);

  const setFeedRate = useCallback((machineId, rateM3PerSec) => {
    setFeederRate(sim, machineId, rateM3PerSec);
  }, [sim]);

  const setElevatorSpeedFraction = useCallback((machineId, fraction) => {
    setElevatorSpeed(sim, machineId, fraction);
  }, [sim]);

  // Jumps take effect immediately even while paused, so publish right away
  // rather than waiting for the next throttled tick (which may never come
  // if the sim isn't running).
  const setLevel = useCallback((machineId, fraction) => {
    setAccumulatorLevel(sim, machineId, fraction);
    publish();
  }, [sim, publish]);

  // Issue #57: the discard-scalpings bin's own EMPTY BIN affordance —
  // terminalSink's counterpart to setLevel above, same immediate-publish
  // shape since this too takes effect while paused.
  const emptySink = useCallback((machineId) => {
    emptyTerminalSink(sim, machineId);
    publish();
  }, [sim, publish]);

  const setInterlockHigh = useCallback((machineId, fraction) => {
    setInterlockHighSetpoint(sim, machineId, fraction);
    publish();
  }, [sim, publish]);

  const setInterlockLow = useCallback((machineId, fraction) => {
    setInterlockLowSetpoint(sim, machineId, fraction);
    publish();
  }, [sim, publish]);

  const setInterlockDelay = useCallback((machineId, seconds) => {
    setInterlockSignalDelay(sim, machineId, seconds);
    publish();
  }, [sim, publish]);

  // Live controls (issue #22, the pre-bin's two-stage interlock).
  const setInterlockSlow = useCallback((machineId, fraction) => {
    setInterlockSlowSetpoint(sim, machineId, fraction);
    publish();
  }, [sim, publish]);

  const setInterlockStop = useCallback((machineId, fraction) => {
    setInterlockStopSetpoint(sim, machineId, fraction);
    publish();
  }, [sim, publish]);

  const setInterlockSlowDelay = useCallback((machineId, seconds) => {
    engineSetInterlockSlowDelay(sim, machineId, seconds);
    publish();
  }, [sim, publish]);

  const setInterlockStopDelay = useCallback((machineId, seconds) => {
    engineSetInterlockStopDelay(sim, machineId, seconds);
    publish();
  }, [sim, publish]);

  // Live controls (issue #24): the batch treater's charge size and cycle time.
  const setBatchSizeM3 = useCallback((machineId, m3) => {
    setBatchSize(sim, machineId, m3);
    publish();
  }, [sim, publish]);

  const setBatchCycleTime = useCallback((machineId, seconds) => {
    setBatchCycleSec(sim, machineId, seconds);
    publish();
  }, [sim, publish]);

  // Live control (issue #26): the scalping screen's oversize split.
  const setWasteFraction = useCallback((machineId, fraction) => {
    setSplitterWasteFraction(sim, machineId, fraction);
    publish();
  }, [sim, publish]);

  // Plant control (issue #46): the source selector, one click in the header
  // like resetTrips above — takes effect immediately, whether paused or
  // running, and publishes right away so the selector's own highlighted
  // button never lags a throttled tick.
  const setSource = useCallback((source) => {
    setSourceSim(sim, source);
    publish();
  }, [sim, publish]);

  // Plant control (issue #47): the destination selector, same shape as
  // setSource above. Switching mid-run is a deliberate presenter
  // affordance — the engine itself (setDestination, engine.js) is what
  // makes it conserve, not anything here.
  const setDestination = useCallback((destination) => {
    setDestinationSim(sim, destination);
    publish();
  }, [sim, publish]);

  // Plant control (issue #50): the counterpart to resetTrips above, same
  // one-click shape — takes effect immediately, whether paused or running.
  // Deliberately not gated on `running`: a presenter can stage or undo a
  // controlled stop while the clock itself is paused, same as every other
  // plant control here.
  const controlledStop = useCallback(() => {
    controlledStopSim(sim);
    publish();
  }, [sim, publish]);

  const resumeLine = useCallback(() => {
    resumeLineSim(sim);
    publish();
  }, [sim, publish]);

  // Plant control (issue #51): the utilities health toggle, same one-click
  // immediate-effect shape as setSource/setDestination above.
  const setUtilitiesHealthy = useCallback((healthy) => {
    setUtilitiesHealthySim(sim, healthy);
    publish();
  }, [sim, publish]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return {
    snap, running, start, pause, stepOnce, restart, resetTrips, clearPlant, speed, setSpeed, setRate, setFeedRate, setLevel, emptySink,
    setInterlockHigh, setInterlockLow, setInterlockDelay, setElevatorSpeed: setElevatorSpeedFraction,
    setInterlockSlow, setInterlockStop, setInterlockSlowDelay, setInterlockStopDelay,
    setBatchSize: setBatchSizeM3, setBatchCycleTime, setWasteFraction, setSource, setDestination,
    controlledStop, resumeLine, setUtilitiesHealthy,
    history, togglePlotSeries,
  };
}

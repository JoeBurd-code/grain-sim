// React binding for the sim engine. The real-time budget loop and throttled
// snapshot publication are lifted unchanged from the proven mock
// (GrainFlowSim.jsx): the speed multiplier scales how much sim time is
// consumed per wall-clock second, never the fixed timestep itself.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSim, stepSim, setSourceRate, setFeederRate, setAccumulatorLevel, DT,
  setInterlockHighSetpoint, setInterlockLowSetpoint, setInterlockSignalDelay,
} from "./engine";
import { BEHAVIORS } from "./behaviors";

const MAX_STEPS_PER_FRAME = 60;
const PUBLISH_INTERVAL_MS = 100;

function publishSnap(sim) {
  const machines = new Map();
  for (const [id, state] of sim.machines) {
    const snap = BEHAVIORS[state.kind]?.snapshot?.(state);
    if (snap) machines.set(id, snap);
  }
  // A rule's event log is published on its sensor machine's snapshot, since
  // that's the machine whose popup surfaces it (see MachinePopup.jsx).
  for (const rule of sim.control) {
    machines.set(rule.sensorId, { ...machines.get(rule.sensorId), events: rule.log });
  }
  return { t: sim.t, machines };
}

export function useSimEngine(line) {
  const [sim] = useState(() => createSim(line));
  const [snap, setSnap] = useState(() => publishSnap(sim));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(5);

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

  const publish = useCallback(() => setSnap(publishSnap(sim)), [sim]);

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

  const setRate = useCallback((machineId, rateM3PerSec) => {
    setSourceRate(sim, machineId, rateM3PerSec);
  }, [sim]);

  const setFeedRate = useCallback((machineId, rateM3PerSec) => {
    setFeederRate(sim, machineId, rateM3PerSec);
  }, [sim]);

  // Jumps take effect immediately even while paused, so publish right away
  // rather than waiting for the next throttled tick (which may never come
  // if the sim isn't running).
  const setLevel = useCallback((machineId, fraction) => {
    setAccumulatorLevel(sim, machineId, fraction);
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

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return {
    snap, running, start, pause, stepOnce, speed, setSpeed, setRate, setFeedRate, setLevel,
    setInterlockHigh, setInterlockLow, setInterlockDelay,
  };
}

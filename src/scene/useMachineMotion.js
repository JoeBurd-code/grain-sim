// Shared rAF-driven "phase" clock for machine motion (issue #64/#65): a
// sibling to useFlowAnimation.js, not animation logic folded into any one
// symbol. Any machine that needs continuous motion — the bucket elevator's
// chain travel now; drum rotation, treater agitation, pendulum travel, or
// a diverter's eased transition in later #64 children — registers its own
// per-second rate (whatever "one unit of phase" means for that machine: a
// scene-unit chain offset, a degree of rotation, ...) and a per-frame
// callback. Unlike useFlowAnimation.js (which both integrates and mutates
// DOM attributes itself, since a dash offset is one generic computation for
// every connection), this hook only owns the clock: one rAF loop, phase
// integrated as `rate * speed * dtReal`, frozen whenever the sim is paused
// (`running` false) or the viewer has prefers-reduced-motion set. Turning a
// phase into SVG attributes is necessarily machine-specific (a chain
// offset's geometry has nothing in common with a rotation's), so that part
// stays in each machine's own registered frame callback — see
// ElevatorSymbol/ElevatorBuckets (symbols.jsx) for the one built so far.
// Scene.jsx itself stays declarative scene structure either way.
import { useEffect, useRef, useState } from "react";

function reducedMotionQuery() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
}

export function useMachineMotion(running, speed) {
  const ratesRef = useRef(new Map()); // machineId -> phase units per sim-second
  const framesRef = useRef(new Map()); // machineId -> onFrame(phase)
  const phasesRef = useRef(new Map()); // machineId -> accumulated phase
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const reducedMotionRef = useRef(false);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    const mq = reducedMotionQuery();
    if (!mq) return undefined;
    reducedMotionRef.current = mq.matches;
    const onChange = () => { reducedMotionRef.current = mq.matches; };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    function frame(ts) {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dtReal = Math.min(0.1, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      if (runningRef.current && !reducedMotionRef.current) {
        const dtSim = dtReal * speedRef.current;
        for (const [id, rate] of ratesRef.current) {
          const next = (phasesRef.current.get(id) ?? 0) + rate * dtSim;
          phasesRef.current.set(id, next);
          framesRef.current.get(id)?.(next);
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // A stable object identity across renders, not a fresh literal each call —
  // Scene.jsx's own re-renders happen on every throttled sim publish
  // (~10/s), and a symbol's effect that depends on `motion` (to register its
  // frame callback once) would otherwise tear down and re-register on every
  // one of those, not just on mount/unmount. `useState`'s lazy initializer
  // runs exactly once, same as a ref would, but the result is ordinary
  // render-time state rather than a ref read during render.
  const [api] = useState(() => ({
    // Called every render by a machine that has live motion this frame —
    // a plain Map write, cheap enough not to need its own effect/deps.
    setRate(id, ratePerSimSecond) {
      ratesRef.current.set(id, ratePerSimSecond);
    },
    getPhase(id) {
      return phasesRef.current.get(id) ?? 0;
    },
    // Ref-callback-style registration, one per machine id: a symbol calls
    // motion.frameRef(machine.id)(fn) inside its own layout effect to
    // receive per-frame phase updates, and (null) to deregister on unmount.
    frameRef(id) {
      return (fn) => {
        if (fn) framesRef.current.set(id, fn);
        else framesRef.current.delete(id);
      };
    },
  }));
  return api;
}

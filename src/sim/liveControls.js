// What a machine popup slider means to the sim. A param in lineData.js opts
// into live control by naming a `bind` (how a dragged value reaches the
// engine) and optionally a `readBind` (what live figure the slider shows back
// from the machine's published snapshot). This module is the one place both
// names are defined, including each one's unit conversion between the
// slider's own units (t/h, kg, %, s) and the engine's (m3/s, m3, fractions).
//
// Before this, one slider drag crossed four modules: the param's `bind`
// string, a PARAM_BINDERS entry in PlantApp.jsx doing the unit conversion, a
// useSimEngine.js wrapper deciding whether to republish, and the engine.js
// setter itself. Each held one line of logic, a new slider cost four edits,
// and the wrappers had drifted (two of them never republished while paused).
// Now a new slider is one row here, useSimEngine exposes a single setControl
// that always republishes, and validateLine rejects a `bind`/`readBind` this
// module does not define instead of it silently doing nothing.
import {
  setSourceRate, setFeederRate, setAccumulatorLevel,
  setInterlockHighSetpoint, setInterlockLowSetpoint, setInterlockHighHighSetpoint, setInterlockSignalDelay,
  setElevatorSpeed, setGateFraction, setBatchSize, setBatchCycleSec, setSplitterWasteFraction,
} from "./engine";
import { tPerHourToM3PerSec, m3PerSecToTPerHour, kgToM3 } from "./units";

const pct = (value) => value / 100;

// bind name -> (sim, machineId, sliderValue) => void
const LIVE_CONTROLS = {
  sourceRate: (sim, id, tph) => setSourceRate(sim, id, tPerHourToM3PerSec(tph)),
  feederRate: (sim, id, tph) => setFeederRate(sim, id, tPerHourToM3PerSec(tph)),
  // Jumps the live accumulator to this fill % now, for staging a scenario
  // mid-presentation (e.g. drag to 95% to demo a near-overflow) rather than
  // waiting for the source to fill or drain it there.
  levelJump: (sim, id, value) => setAccumulatorLevel(sim, id, pct(value)),
  interlockHighSetpoint: (sim, id, value) => setInterlockHighSetpoint(sim, id, pct(value)),
  interlockLowSetpoint: (sim, id, value) => setInterlockLowSetpoint(sim, id, pct(value)),
  // The pre-bin graded feed schedule's own LSHH trip set point (issue #60).
  interlockHighHighSetpoint: (sim, id, value) => setInterlockHighHighSetpoint(sim, id, pct(value)),
  interlockSignalDelay: (sim, id, seconds) => setInterlockSignalDelay(sim, id, seconds),
  // Elevator VFD (issue #21) and drum feeder gate (issue #60): both are
  // dials (sim/dial.js), so a drag landing back on the interlock's cap
  // releases the dial rather than setting it.
  elevatorSpeed: (sim, id, value) => setElevatorSpeed(sim, id, pct(value)),
  gatePosition: (sim, id, value) => setGateFraction(sim, id, pct(value)),
  // Batch treater (issue #24): the slider is in kg, the engineer's own unit.
  batchSize: (sim, id, kg) => setBatchSize(sim, id, kgToM3(kg)),
  batchCycleTime: (sim, id, seconds) => setBatchCycleSec(sim, id, seconds),
  // Scalping screen oversize split (issue #26).
  wasteFraction: (sim, id, value) => setSplitterWasteFraction(sim, id, pct(value)),
};

// A dial's published reading (sim/dial.js), scaled to the slider's percent.
// `actual` is what the actuator really runs at: the dial while overriding,
// the interlock's live cap while governed.
function dialPercent(reading) {
  if (!reading) return null;
  return {
    actual: reading.effective * 100,
    cap: reading.cap * 100,
    overridable: reading.overridable,
    overriding: reading.overriding,
  };
}

// readBind name -> (snapshot) => { actual, cap, overridable, overriding } | null
//
// Only a param whose machine can have its real output changed by an
// interlock out from under the presenter's own dial declares a `readBind`.
// `cap` is where the interlock alone would run it (the slider's tick), or
// null when there is no throttle band at all, in which case no tick is drawn
// and override never arms.
const LIVE_READINGS = {
  // Source valve (issue #19) and drum feeder (issue #42). Deliberately the
  // machine's own commanded rate, not flowRateM3PerSec (issue #28): that also
  // dips under ordinary downstream backpressure with no interlock involved,
  // which would make the readout noisy (issue #34). Neither has a partial-
  // throttle band (the valve is only open or shut; the feeder's auto-start
  // is a one-shot command, not a live cap), so neither ever arms.
  sourceRateActual: (snap) => (snap
    ? { actual: m3PerSecToTPerHour((snap.nominalRate ?? 0) * (snap.openness ?? 1)), cap: null, overridable: false, overriding: false }
    : null),
  feederRateActual: (snap) => (snap
    ? { actual: m3PerSecToTPerHour(snap.rate ?? 0), cap: null, overridable: false, overriding: false }
    : null),
  elevatorSpeedActual: (snap) => dialPercent(snap?.speedDial),
  gatePositionActual: (snap) => dialPercent(snap?.gateDial),
};

// A dragged slider value, in the slider's own units, reaching the sim.
export function setLiveControl(sim, machineId, bind, value) {
  const control = LIVE_CONTROLS[bind];
  if (!control) throw new Error(`unknown live control bind "${bind}"`);
  control(sim, machineId, value);
}

// The live figure a slider shows back, read off a machine's published
// snapshot. Null for a param with no `readBind`, or before the machine has
// published.
export function readLiveControl(snapshot, readBind) {
  if (!readBind) return null;
  const reading = LIVE_READINGS[readBind];
  if (!reading) throw new Error(`unknown live control readBind "${readBind}"`);
  return reading(snapshot);
}

export function isLiveControlBind(bind) {
  return Object.hasOwn(LIVE_CONTROLS, bind);
}

export function isLiveReadBind(readBind) {
  return Object.hasOwn(LIVE_READINGS, readBind);
}

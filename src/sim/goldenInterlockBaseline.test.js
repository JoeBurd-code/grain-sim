// Issue #82: the golden line's interlock behaviour, recorded through the
// engine before any interlock is converted to the sentence model. Each
// conversion (#82, #83, #84) must reproduce this record exactly.
//
// The record holds only what a user can see: the time each commanded machine
// changes its command (the stop and restart order), the levels of the
// sensing bins at that moment, the trip latch, and the bin levels sampled
// every 30 s. It holds no rule phase names and no log text, because those
// belong to the rule kind and change when a rule becomes a sentence.
//
// The scenarios select a source and a destination through each machine's
// own selector rather than through the plant control functions, so that
// this record does not depend on how the plant controls name machines.
import { describe, it, expect } from "vitest";
import {
  createSim, stepSim, DT, getMachineState, setAccumulatorLevel, resetTrips, hasAnyTripLatched,
  setElevatorSpeed, releaseElevatorSpeed, setBatchCycleSec, controlledStop, resumeLine, setUtilitiesHealthy, getInterlockState,
} from "./engine";
import { BEHAVIORS } from "./behaviors";
import { SOURCE_SELECTOR } from "./commandSlots";
import { goldenLine } from "../line/goldenLine";

// Every machine a golden line interlock commands.
const COMMANDED = [
  "upstreamStub", "treatingElevator", "treatDrumFeeder", "batchTreater", "afterBinOutletValve",
  "pendulumConveyor", "inletDrumFeeder1", "inletDrumFeeder2",
];
// Every machine a golden line interlock senses by level.
const SENSED = [
  "treaterBufferBin", "treaterPreBin", "treaterAfterBin", "metalBin1", "metalBin2",
  "flexiconPreBin", "concettiPreBin",
];
const COMMAND_FIELDS = [
  "throttleTarget", "opennessTarget", "runPermit", "enabled", "gateThrottleTarget", "blocked", "stopped",
];

const round = (v) => (typeof v === "number" ? Number(v.toFixed(4)) : v);

function commandOf(state) {
  return COMMAND_FIELDS.filter((f) => state[f] !== undefined).map((f) => `${f}=${round(state[f])}`).join(" ");
}

function levels(sim) {
  return SENSED.map((id) => {
    const state = getMachineState(sim, id);
    return `${id}=${round(state.stored / state.capacity)}`;
  }).join(" ");
}

function recorder(sim) {
  const trace = [];
  const last = new Map(COMMANDED.map((id) => [id, commandOf(getMachineState(sim, id))]));
  let latched = hasAnyTripLatched(sim);
  let nextSample = 30;
  const stamp = () => sim.t.toFixed(2);
  const tick = () => {
    stepSim(sim, DT);
    for (const id of COMMANDED) {
      const now = commandOf(getMachineState(sim, id));
      if (now !== last.get(id)) {
        trace.push(`${stamp()} ${id}: ${now} | ${levels(sim)}`);
        last.set(id, now);
      }
    }
    const nowLatched = hasAnyTripLatched(sim);
    if (nowLatched !== latched) {
      trace.push(`${stamp()} trip latched=${nowLatched}`);
      latched = nowLatched;
    }
    if (sim.t >= nextSample) {
      trace.push(`${stamp()} sample | ${levels(sim)}`);
      nextSample += 30;
    }
  };
  return {
    trace,
    run(seconds) {
      for (let i = 0; i < Math.round(seconds / DT); i++) tick();
    },
    note(text) {
      trace.push(`${stamp()} >> ${text}`);
    },
  };
}

function selectSource(sim, feederId) {
  for (const id of ["inletDrumFeeder1", "inletDrumFeeder2"]) {
    BEHAVIORS.meteredFeeder.setEnabled(getMachineState(sim, id), id === feederId, SOURCE_SELECTOR);
  }
}

function selectDestination(sim, conveyorPort, diverterPort) {
  const conveyor = getMachineState(sim, "pendulumConveyor");
  BEHAVIORS[conveyor.kind].selectPort(conveyor, conveyorPort);
  if (diverterPort) {
    const diverter = getMachineState(sim, "outloadDiverter");
    BEHAVIORS[diverter.kind].selectPort(diverter, diverterPort);
  }
}

// Each scenario is a list of steps: a presenter action, then a run time.
const SCENARIOS = {
  "a natural run to Concetti": (sim, r) => {
    r.run(1800);
  },
  "the treater buffer bin: LSH close and LSL reopen, then the LSHH trip and its reset": (sim, r) => {
    r.note("buffer bin to 90%");
    setAccumulatorLevel(sim, "treaterBufferBin", 0.9);
    r.run(60);
    r.note("buffer bin to 100%");
    setAccumulatorLevel(sim, "treaterBufferBin", 1);
    r.run(30);
    r.note("reset while still full");
    resetTrips(sim);
    r.run(5);
    r.note("buffer bin to 20%, then reset");
    setAccumulatorLevel(sim, "treaterBufferBin", 0.2);
    resetTrips(sim);
    r.run(60);
  },
  "the treater pre-bin: feed schedule bands, then the LSHH trip and its reset": (sim, r) => {
    r.note("pre-bin to 50%");
    setAccumulatorLevel(sim, "treaterPreBin", 0.5);
    r.run(20);
    r.note("pre-bin to 90%");
    setAccumulatorLevel(sim, "treaterPreBin", 0.9);
    r.run(20);
    r.note("pre-bin to 100%");
    setAccumulatorLevel(sim, "treaterPreBin", 1);
    r.run(30);
    r.note("pre-bin to 10%, then reset");
    setAccumulatorLevel(sim, "treaterPreBin", 0.1);
    resetTrips(sim);
    r.run(30);
  },
  "the treater after-bin holds the treater, and its reset releases it": (sim, r) => {
    r.run(300);
    r.note("after-bin to 80%");
    setAccumulatorLevel(sim, "treaterAfterBin", 0.8);
    r.run(30);
    r.note("after-bin to 0%, then reset");
    setAccumulatorLevel(sim, "treaterAfterBin", 0);
    resetTrips(sim);
    r.run(60);
  },
  "metal bin 1 trips the conveyor, the conveyor stops both inlet drum feeders, and both recover": (sim, r) => {
    selectDestination(sim, "outBuffer", "out1");
    r.run(300);
    r.note("metal bin 1 to 100%");
    setAccumulatorLevel(sim, "metalBin1", 1);
    r.run(30);
    r.note("metal bin 1 to 0%, then reset");
    setAccumulatorLevel(sim, "metalBin1", 0);
    resetTrips(sim);
    r.run(60);
  },
  "metal bin 2 trips the conveyor, and its trip is unarmed while metal bin 1 is selected": (sim, r) => {
    selectDestination(sim, "outBuffer", "out1");
    r.note("metal bin 2 to 100% while metal bin 1 is selected");
    setAccumulatorLevel(sim, "metalBin2", 1);
    r.run(30);
    r.note("select metal bin 2");
    selectDestination(sim, "outBuffer", "out2");
    r.run(30);
    r.note("metal bin 2 to 0%, then reset");
    setAccumulatorLevel(sim, "metalBin2", 0);
    resetTrips(sim);
    r.run(30);
  },
  "the Flexicon pre-bin trips the conveyor with the pro box source selected": (sim, r) => {
    selectSource(sim, "inletDrumFeeder1");
    selectDestination(sim, "outBinSeg");
    r.run(120);
    r.note("Flexicon pre-bin to 100%");
    setAccumulatorLevel(sim, "flexiconPreBin", 1);
    r.run(30);
    r.note("Flexicon pre-bin to 0%, then reset");
    setAccumulatorLevel(sim, "flexiconPreBin", 0);
    resetTrips(sim);
    r.run(30);
  },
  "the Concetti pre-bin: bands, the LSHH pause, its ordered restart, then the escalation trip": (sim, r) => {
    r.run(300);
    r.note("Concetti pre-bin to 50%");
    setAccumulatorLevel(sim, "concettiPreBin", 0.5);
    r.run(20);
    r.note("Concetti pre-bin to 90%");
    setAccumulatorLevel(sim, "concettiPreBin", 0.9);
    r.run(20);
    r.note("Concetti pre-bin to 97%");
    setAccumulatorLevel(sim, "concettiPreBin", 0.97);
    r.run(10);
    r.note("Concetti pre-bin to 50%");
    setAccumulatorLevel(sim, "concettiPreBin", 0.5);
    r.run(60);
    r.note("Concetti pre-bin to 100% and held");
    for (let i = 0; i < 40; i++) {
      setAccumulatorLevel(sim, "concettiPreBin", 1);
      r.run(1);
    }
    r.note("Concetti pre-bin to 50%, then reset");
    setAccumulatorLevel(sim, "concettiPreBin", 0.5);
    resetTrips(sim);
    r.run(90);
  },
  // Issue #84: the scenario above never reaches the escalation, because each
  // bag drawn from the pre-bin dips it below LSHH and restarts the 30 s
  // clock. This one slows the scale so that it draws no bag while the level
  // is held up.
  "the Concetti pre-bin held above LSHH: a dip restarts the clock, the escalation trips the line, the reset restarts in order": (sim, r) => {
    const hold = (seconds) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        setAccumulatorLevel(sim, "concettiPreBin", 1);
        r.run(DT);
      }
    };
    r.run(300);
    r.note("Concetti scale fill time to 600 s");
    setBatchCycleSec(sim, "concettiScale", 600);
    r.note("Concetti pre-bin held at 100% for 20 s");
    hold(20);
    r.note("Concetti pre-bin to 90% for 1 s");
    setAccumulatorLevel(sim, "concettiPreBin", 0.9);
    r.run(1);
    r.note("Concetti pre-bin held at 100% for 40 s");
    hold(40);
    r.note("reset while still full");
    resetTrips(sim);
    r.run(5);
    r.note("Concetti pre-bin to 50%, then reset");
    setAccumulatorLevel(sim, "concettiPreBin", 0.5);
    resetTrips(sim);
    r.run(90);
  },
  "the conveyor speed dial: a short stop, a long stop, and the return": (sim, r) => {
    r.run(300);
    r.note("conveyor speed to 0 for 0.5 s");
    setElevatorSpeed(sim, "pendulumConveyor", 0);
    r.run(0.5);
    releaseElevatorSpeed(sim, "pendulumConveyor");
    r.run(10);
    r.note("conveyor speed to 0 for 10 s");
    setElevatorSpeed(sim, "pendulumConveyor", 0);
    r.run(10);
    releaseElevatorSpeed(sim, "pendulumConveyor");
    r.run(30);
    r.note("pro box source, conveyor speed to 0 for 10 s");
    selectSource(sim, "inletDrumFeeder1");
    setElevatorSpeed(sim, "pendulumConveyor", 0);
    r.run(10);
    releaseElevatorSpeed(sim, "pendulumConveyor");
    r.run(30);
  },
  "a controlled stop and resume, then a utilities trip and its reset": (sim, r) => {
    r.run(300);
    r.note("controlled stop");
    controlledStop(sim);
    r.run(400);
    r.note("resume");
    resumeLine(sim);
    r.run(120);
    r.note("utilities unhealthy");
    setUtilitiesHealthy(sim, false);
    r.run(30);
    r.note("utilities healthy, then reset");
    setUtilitiesHealthy(sim, true);
    resetTrips(sim);
    r.run(60);
  },
};

function runScenario(line, name) {
  const sim = createSim(line);
  const r = recorder(sim);
  SCENARIOS[name](sim, r);
  return { sim, trace: r.trace };
}

describe("the golden line's interlock baseline (issue #82)", () => {
  const ruleLogged = new Set();

  for (const name of Object.keys(SCENARIOS)) {
    it(name, () => {
      const { sim, trace } = runScenario(goldenLine, name);
      for (const rule of sim.control) if (rule.log.length > 0) ruleLogged.add(rule.id);
      // The record must hold real command changes, not only samples.
      expect(trace.filter((e) => /^\S+ \w+: /.test(e)).length).toBeGreaterThan(0);
      expect(trace).toMatchSnapshot();
    }, 60000);
  }

  // The scenarios are only a baseline if they make every interlock act.
  it("makes every golden line interlock act at least once", () => {
    const ids = goldenLine.interlocks.map((i) => i.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !ruleLogged.has(id))).toEqual([]);
  });

  // A converted interlock with a different signal delay must change the
  // record, or the baseline could not catch a bad conversion.
  it("changes when a conveyor-running interlock gets a different signal delay", () => {
    const name = "the conveyor speed dial: a short stop, a long stop, and the return";
    const mutated = structuredClone(goldenLine);
    for (const rule of mutated.interlocks) {
      if (rule.id === "conveyorRunningInterlockFeeder2") {
        if (rule.when) rule.when.delaySec = 2;
        else rule.signalDelaySec = 2;
      }
    }
    expect(runScenario(mutated, name).trace).not.toEqual(runScenario(goldenLine, name).trace);
    // Guard: the interlock under test is really on the line.
    expect(getInterlockState(createSim(mutated), "pendulumConveyor")).toBeDefined();
  }, 60000);

  // Issue #84: the same for the order of the Concetti pause's steps. Each
  // mutation swaps two steps of the sentence.
  const pauseSteps = {
    "the restart opens the valve before it starts the conveyor": (rule) => {
      const [wait30, start, wait10, open] = rule.whenClears.then;
      rule.whenClears.then = [wait30, open, wait10, start];
    },
    "the escalation trips the line before its wait": (rule) => {
      const [close, stop, wait25, check, trip] = rule.then;
      rule.then = [close, stop, check, trip, wait25];
    },
  };
  for (const [what, mutate] of Object.entries(pauseSteps)) {
    it(`changes when the Concetti pause's steps are reordered: ${what}`, () => {
      const name = "the Concetti pre-bin held above LSHH: a dip restarts the clock, the escalation trips the line, the reset restarts in order";
      const mutated = structuredClone(goldenLine);
      const rule = mutated.interlocks.find((r) => r.id === "concettiHighHighPauseSequence");
      // Guard: the mutation reaches the sentence.
      expect(rule.kind).toBe("sentence");
      mutate(rule);
      expect(runScenario(mutated, name).trace).not.toEqual(runScenario(goldenLine, name).trace);
    }, 60000);
  }
});

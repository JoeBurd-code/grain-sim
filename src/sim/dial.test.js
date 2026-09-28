import { describe, it, expect } from "vitest";
import { SPEED_DIAL, GATE_DIAL, DIAL_SNAP, dialOverriding, dialEffective, setDial, releaseDial, dialReading } from "./dial";
import { BEHAVIORS } from "./behaviors";

// A fresh actuator with an interlock holding its cap at `cap` (target equal,
// settled), dial untouched at its default of 1.
function governed(cap, f = SPEED_DIAL) {
  return { [f.dial]: 1, [f.touched]: false, [f.throttle]: cap, [f.target]: cap };
}

describe("dial (issue #63): the one override rule", () => {
  it("an untouched dial runs at the interlock's cap, even though it sits above it", () => {
    const s = governed(0.55);
    expect(dialOverriding(s, SPEED_DIAL)).toBe(false);
    expect(dialEffective(s, SPEED_DIAL)).toBe(0.55);
  });

  it("a touched dial dragged above the cap overrides it", () => {
    const s = governed(0.55);
    setDial(s, SPEED_DIAL, 0.9);
    expect(dialOverriding(s, SPEED_DIAL)).toBe(true);
    expect(dialEffective(s, SPEED_DIAL)).toBe(0.9);
  });

  // The divergence this module was built to close: the popup already read a
  // below-cap dial as an override, but the sim kept running the cap.
  it("a touched dial dragged below the cap overrides it too", () => {
    const s = governed(0.55);
    setDial(s, SPEED_DIAL, 0.3);
    expect(dialOverriding(s, SPEED_DIAL)).toBe(true);
    expect(dialEffective(s, SPEED_DIAL)).toBe(0.3);
  });

  it("a drag landing within the snap window of the cap releases the dial back to untouched", () => {
    const s = governed(0.55);
    setDial(s, SPEED_DIAL, 0.9);
    setDial(s, SPEED_DIAL, 0.55 + DIAL_SNAP / 2);
    expect(s.speedDialTouched).toBe(false);
    expect(s.speedFraction).toBe(1);
    expect(dialEffective(s, SPEED_DIAL)).toBe(0.55);
  });

  it("a touched dial the cap later moves onto (within snap) stops overriding, without being released", () => {
    const s = governed(0.55);
    setDial(s, SPEED_DIAL, 0.7);
    s.throttleFraction = s.throttleTarget = 0.69;
    expect(dialOverriding(s, SPEED_DIAL)).toBe(false);
    expect(dialEffective(s, SPEED_DIAL)).toBe(0.69);
    expect(s.speedDialTouched).toBe(true);
  });

  it("never overrides a full stop, however far the touched dial sits from it", () => {
    const s = governed(0.55);
    setDial(s, SPEED_DIAL, 0.9);
    s.throttleTarget = 0; // interlock commands a full stop; throttle still ramping down
    s.throttleFraction = 0.3;
    expect(dialOverriding(s, SPEED_DIAL)).toBe(false);
    expect(dialEffective(s, SPEED_DIAL)).toBe(0.3);
  });

  it("clamps a drag to 0..1", () => {
    const s = governed(0.5);
    setDial(s, SPEED_DIAL, 1.7);
    expect(s.speedFraction).toBe(1);
    setDial(s, SPEED_DIAL, -0.2);
    expect(s.speedFraction).toBe(0);
  });

  it("releaseDial restores the exact untouched default", () => {
    const s = governed(0.5);
    setDial(s, SPEED_DIAL, 0.1);
    releaseDial(s, SPEED_DIAL);
    expect(s).toEqual(governed(0.5));
  });

  it("dialReading publishes the same answer the sim runs on", () => {
    const s = governed(0.4, GATE_DIAL);
    setDial(s, GATE_DIAL, 0.2);
    expect(dialReading(s, GATE_DIAL)).toEqual({
      dial: 0.2, touched: true, cap: 0.4, overridable: true, overriding: true, effective: 0.2,
    });
  });
});

// The same dial drives the chain's intake and its speed, so a below-cap
// override slows both, and the published reading agrees with them.
describe("dial through a real transportDelay", () => {
  it("intake, chain speed and the published reading all agree for a below-cap override", () => {
    const state = BEHAVIORS.transportDelay.init({ sim: { distanceM: 10, speedMPerMin: 60, ceilingM3PerSec: 2 } });
    BEHAVIORS.transportDelay.command(state, 0.6, 0);
    BEHAVIORS.transportDelay.apply(state, 0.05, 0, Infinity);
    setDial(state, SPEED_DIAL, 0.25);
    const snap = BEHAVIORS.transportDelay.snapshot(state);
    expect(snap.speedDial.overriding).toBe(true);
    expect(snap.speedDial.effective).toBe(0.25);
    expect(snap.chainSpeedMPerMin).toBeCloseTo(60 * 0.25);
    expect(BEHAVIORS.transportDelay.capacityAvailable(state, 0.05)).toBeCloseTo(2 * 0.25 * 0.05);
  });
});

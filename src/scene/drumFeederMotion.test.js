import { describe, it, expect } from "vitest";
import {
  drumSpinDegPerSec, drumGateFraction, DRUM_FEEDER_MAX_M3_PER_SEC, DRUM_MAX_DEG_PER_SEC,
} from "./drumFeederMotion";

describe("drumSpinDegPerSec", () => {
  it("is stationary at rate 0 (fresh load default)", () => {
    expect(drumSpinDegPerSec({ rate: 0, enabled: true, runPermit: true })).toBe(0);
  });

  it("scales linearly with rate below the theoretical ceiling", () => {
    const half = DRUM_FEEDER_MAX_M3_PER_SEC / 2;
    expect(drumSpinDegPerSec({ rate: half, enabled: true, runPermit: true }))
      .toBeCloseTo(DRUM_MAX_DEG_PER_SEC / 2);
  });

  it("clamps at the ceiling rather than spinning faster past it", () => {
    expect(drumSpinDegPerSec({ rate: DRUM_FEEDER_MAX_M3_PER_SEC * 3, enabled: true, runPermit: true }))
      .toBe(DRUM_MAX_DEG_PER_SEC);
  });

  it("is still while disabled even if a rate is commanded", () => {
    expect(drumSpinDegPerSec({ rate: DRUM_FEEDER_MAX_M3_PER_SEC, enabled: false, runPermit: true })).toBe(0);
  });

  it("is still while unpermitted even if a rate is commanded", () => {
    expect(drumSpinDegPerSec({ rate: DRUM_FEEDER_MAX_M3_PER_SEC, enabled: true, runPermit: false })).toBe(0);
  });

  it("defaults enabled/runPermit to true and rate to 0 when the sim hasn't published yet", () => {
    expect(drumSpinDegPerSec({})).toBe(0);
    expect(drumSpinDegPerSec(undefined)).toBe(0);
  });
});

describe("drumGateFraction", () => {
  it("reads the interlock's live cap while untouched, however far the dial sits from it", () => {
    expect(drumGateFraction({ gateFraction: 1, gateDialTouched: false, gateThrottleFraction: 0.65 })).toBe(0.65);
  });

  it("reads the operator's own dial once armed above the cap", () => {
    expect(drumGateFraction({ gateFraction: 0.9, gateDialTouched: true, gateThrottleFraction: 0.65 })).toBe(0.9);
  });

  // The key fix from this ticket's spec review: armed is direction-symmetric
  // (mirrors MachinePopup.jsx's Slider), not just "dragged past the cap" —
  // a dial parked below the cap disagrees with the slider's own readout
  // exactly as much as one parked above it.
  it("reads the operator's own dial once armed below the cap", () => {
    expect(drumGateFraction({ gateFraction: 0.3, gateDialTouched: true, gateThrottleFraction: 0.65 })).toBe(0.3);
  });

  it("stays at the cap for a touched dial within snap tolerance of it, above or below", () => {
    expect(drumGateFraction({ gateFraction: 0.66, gateDialTouched: true, gateThrottleFraction: 0.65 })).toBe(0.65);
    expect(drumGateFraction({ gateFraction: 0.64, gateDialTouched: true, gateThrottleFraction: 0.65 })).toBe(0.65);
  });

  it("defaults to fully open when the sim hasn't published a snapshot yet", () => {
    expect(drumGateFraction({})).toBe(1);
    expect(drumGateFraction(undefined)).toBe(1);
  });
});

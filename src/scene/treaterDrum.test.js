import { describe, it, expect } from "vitest";
import {
  treaterGeometry, drumRibs, drumProngs, drumFillY, treaterDrumDegPerSec,
  DESIGN, DRUM_RIB_COUNT, DRUM_PRONG_COUNT, TREATER_DRUM_DEG_PER_SEC,
} from "./treaterDrum";

const G = treaterGeometry(DESIGN.w, DESIGN.h);

// Where the drum's own outline sits at a given x, on the near side. The
// tests below use this as an independent check rather than re-deriving it
// from the same constants the code under test uses — the mistake that let a
// pendulum-conveyor test agree with its own bug (see
// sim-space-vs-drawn-space, issue #70).
function shellBottomAt(x) {
  const s = (x - G.drum.cx) / G.drum.rx;
  return G.drum.bot + G.drum.ry * Math.sqrt(Math.max(0, 1 - s * s));
}
function shellTopAt(x) {
  const s = (x - G.drum.cx) / G.drum.rx;
  return G.drum.top + G.drum.ry * Math.sqrt(Math.max(0, 1 - s * s));
}

describe("treaterGeometry", () => {
  it("puts the mouth's back lip on y=0, where the `in` anchor is", () => {
    expect(G.drum.top - G.drum.ry).toBeCloseTo(0, 6);
  });

  it("holds the sketch's proportions: drum taller than wide, plinth wider than the drum", () => {
    const drumWidth = G.drum.rx * 2;
    const drumHeight = G.drum.bot + G.drum.ry;      // top lip to the lowest point of the base cap
    expect(drumHeight / drumWidth).toBeCloseTo(1.29, 1);
    expect(G.base.w / drumWidth).toBeCloseTo(1.62, 1);
  });

  it("keeps everything inside the declared footprint", () => {
    expect(G.drum.cx - G.drum.rx).toBeGreaterThanOrEqual(0);
    expect(G.drum.cx + G.drum.rx).toBeLessThanOrEqual(DESIGN.w);
    expect(G.base.x + G.base.w).toBeLessThanOrEqual(DESIGN.w);
    for (const f of G.feet) expect(f.y + f.h).toBeLessThanOrEqual(DESIGN.h);
    expect(G.chuteMouth.bottom).toBeLessThanOrEqual(DESIGN.h);
  });

  it("centres the chute mouth on the `out` anchor lineData declares (0, 98)", () => {
    expect((G.chuteMouth.top + G.chuteMouth.bottom) / 2).toBeCloseTo(98, 6);
  });

  it("starts the plinth above the drum's lower cap, so the drum sits across it", () => {
    expect(G.base.y).toBeLessThan(G.drum.bot + G.drum.ry);
    expect(G.base.y).toBeGreaterThan(G.drum.bot - G.drum.ry);
  });

  it("scales to a different footprint without changing its proportions", () => {
    const big = treaterGeometry(DESIGN.w * 2, DESIGN.h * 2);
    expect(big.drum.rx).toBeCloseTo(G.drum.rx * 2, 6);
    expect(big.base.w / (big.drum.rx * 2)).toBeCloseTo(G.base.w / (G.drum.rx * 2), 6);
  });
});

describe("drumFillY", () => {
  it("runs from the bottom of the usable depth to the top", () => {
    expect(drumFillY(G, 0)).toBeCloseTo(G.fillBottom, 6);
    expect(drumFillY(G, 1)).toBeCloseTo(G.fillTop, 6);
  });

  it("clamps rather than drawing seed outside the drum", () => {
    expect(drumFillY(G, -5)).toBeCloseTo(G.fillBottom, 6);
    expect(drumFillY(G, 99)).toBeCloseTo(G.fillTop, 6);
  });
});

describe("drumRibs", () => {
  it("returns one slot per rib, keeping indexes stable for the DOM nodes", () => {
    for (let deg = 0; deg < 360; deg += 7) {
      expect(drumRibs(G, deg)).toHaveLength(DRUM_RIB_COUNT);
    }
  });

  it("draws only the near half, and never an empty drum", () => {
    for (let deg = 0; deg < 360; deg += 3) {
      const shown = drumRibs(G, deg).filter(Boolean);
      expect(shown.length).toBeGreaterThanOrEqual(4);
      expect(shown.length).toBeLessThanOrEqual(Math.ceil(DRUM_RIB_COUNT / 2));
    }
  });

  it("lands every rib exactly on the drum's own outline, top and bottom", () => {
    let checked = 0;
    for (let deg = 0; deg < 360; deg += 5) {
      for (const rib of drumRibs(G, deg)) {
        if (!rib) continue;
        expect(rib.y1).toBeCloseTo(shellTopAt(rib.x), 6);
        expect(rib.y2).toBeCloseTo(shellBottomAt(rib.x), 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);   // the assertions above actually ran
  });

  it("stays inside the drum's width", () => {
    for (let deg = 0; deg < 360; deg += 5) {
      for (const rib of drumRibs(G, deg)) {
        if (!rib) continue;
        expect(rib.x).toBeGreaterThanOrEqual(G.drum.cx - G.drum.rx - 1e-9);
        expect(rib.x).toBeLessThanOrEqual(G.drum.cx + G.drum.rx + 1e-9);
      }
    }
  });

  it("thickens and brightens across the face and thins toward the edges", () => {
    // rib 0 at deg 0 is dead centre-front; at deg 80 it is nearly side-on
    const front = drumRibs(G, 0)[0];
    const edge = drumRibs(G, 80)[0];
    expect(front.width).toBeGreaterThan(edge.width);
    expect(front.opacity).toBeGreaterThan(edge.opacity);
    expect(Math.abs(front.x - G.drum.cx)).toBeLessThan(Math.abs(edge.x - G.drum.cx));
  });

  it("emits no NaN at any angle", () => {
    for (let deg = -720; deg <= 720; deg += 1) {
      for (const rib of drumRibs(G, deg)) {
        if (!rib) continue;
        for (const v of Object.values(rib)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("drumProngs", () => {
  it("draws three paddles, far one first for painter's order", () => {
    for (let deg = 0; deg < 360; deg += 11) {
      const prongs = drumProngs(G, deg);
      expect(prongs).toHaveLength(DRUM_PRONG_COUNT);
      for (let i = 1; i < prongs.length; i++) {
        expect(prongs[i].opacity).toBeGreaterThanOrEqual(prongs[i - 1].opacity);
      }
    }
  });

  it("never lines two paddles up into one bar across the mouth", () => {
    // The four-paddle version did exactly this every quarter turn, which is
    // what made it read as a propeller. With three, no two paddles are ever
    // close to 180 degrees apart.
    for (let deg = 0; deg < 360; deg += 1) {
      for (let i = 0; i < DRUM_PRONG_COUNT; i++) {
        for (let j = i + 1; j < DRUM_PRONG_COUNT; j++) {
          const a = (deg + (i * 360) / DRUM_PRONG_COUNT) % 360;
          const b = (deg + (j * 360) / DRUM_PRONG_COUNT) % 360;
          const apart = Math.abs(((a - b + 540) % 360) - 180);
          expect(apart).toBeGreaterThan(30);
        }
      }
    }
  });

  it("keeps every paddle inside the mouth", () => {
    const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);
    for (let deg = 0; deg < 360; deg += 5) {
      for (const prong of drumProngs(G, deg)) {
        const v = nums(prong.d);
        for (let i = 0; i < v.length; i += 2) {
          expect(v[i]).toBeGreaterThan(G.drum.cx - G.drum.rx);
          expect(v[i]).toBeLessThan(G.drum.cx + G.drum.rx);
        }
        expect(prong.d).not.toMatch(/NaN/);
      }
    }
  });
});

describe("treaterDrumDegPerSec", () => {
  it("turns while the machine is genuinely live", () => {
    for (const phase of ["charging", "holding", "discharging"]) {
      expect(treaterDrumDegPerSec(phase, 100)).toBe(TREATER_DRUM_DEG_PER_SEC);
    }
  });

  it("stands still when tripped or held off", () => {
    expect(treaterDrumDegPerSec("stopped", 100)).toBe(0);
    expect(treaterDrumDegPerSec("waiting", 100)).toBe(0);
  });

  it("stands still until the line has primed and a real batch has completed", () => {
    // At boot and right after a RESTART the whole chain fills from empty; a
    // drum spinning on nothing would claim the line was running.
    for (const phase of ["charging", "holding", "discharging"]) {
      expect(treaterDrumDegPerSec(phase, null)).toBe(0);
    }
  });
});

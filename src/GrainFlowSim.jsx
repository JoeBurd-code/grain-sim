import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Play, Pause, RotateCcw, FastForward, StepForward, AlertTriangle } from "lucide-react";

// ----------------------------------------------------------------------------
// GRAIN FLOW SIMULATOR  -  proof of concept
// Cell-based finite-volume belt + transport delay + 1m free-fall + cyclic bucket
// All units metric. Flow m3/s, speed m/s, area m2, volume m3, time s.
// ----------------------------------------------------------------------------

const N_CELLS = 24;          // belt segments
const DT = 0.05;             // sim step (s)
const G = 9.81;              // gravity
const MAX_STEPS_PER_FRAME = 60;
const HIST_SAMPLE = 0.25;    // chart sample interval (sim s)
const HIST_CAP = 400;

const PRESETS = {
  bucket: {
    label: "Bucket overflow (~50s)",
    p: { valveRate: 0.045, beltSpeed: 1.2, area: 0.05, length: 6, bucketCap: 2.0, emptyInterval: 60 },
  },
  belt: {
    label: "Belt overload (feed spill)",
    p: { valveRate: 0.09, beltSpeed: 1.2, area: 0.05, length: 6, bucketCap: 2.0, emptyInterval: 60 },
  },
  balanced: {
    label: "Balanced (no overflow)",
    p: { valveRate: 0.03, beltSpeed: 1.2, area: 0.05, length: 6, bucketCap: 2.0, emptyInterval: 60 },
  },
};

const FALL_HEIGHT = 1.0;
const FALL_TIME = Math.sqrt((2 * FALL_HEIGHT) / G); // 0.4515 s

function freshState() {
  return {
    t: 0,
    cells: new Array(N_CELLS).fill(0),
    inFlight: [],          // [{arriveAt, vol}]
    bucket: 0,
    lastEmptyIdx: 0,
    feedSpill: 0,
    bucketSpill: 0,
    bucketOverflowing: false,
    events: [],
    hist: [],
    lastSample: -1,
  };
}

// Pure single step. Mutates a copy-friendly state object in place for speed,
// returns the same reference. Caller owns cloning cadence.
function step(s, P) {
  const cellLen = P.length / N_CELLS;
  const cellCap = P.area * cellLen;          // max volume a belt segment can hold
  const ceiling = P.area * P.beltSpeed;      // belt throughput ceiling (m3/s)
  const f = Math.min(1, (P.beltSpeed * DT) / cellLen); // fraction of a cell moved per step
  const maxMove = ceiling * DT;              // hard cap on volume past any point per step

  const cells = s.cells;

  // 1. Advect downstream -> upstream so grain only moves one stage per step.
  // Last cell discharges to the fall buffer.
  let beltOut = Math.min(cells[N_CELLS - 1] * f, maxMove);
  cells[N_CELLS - 1] -= beltOut;

  for (let i = N_CELLS - 2; i >= 0; i--) {
    const want = Math.min(cells[i] * f, maxMove);
    const space = cellCap - cells[i + 1];
    const moved = Math.max(0, Math.min(want, space));
    cells[i] -= moved;
    cells[i + 1] += moved;
    // rejected (want - moved) stays put -> backs up toward the feed
  }

  // 2. Valve feeds cell 0. Excess that won't fit is feed-point spill.
  const inflow = P.valveRate * DT;
  const space0 = cellCap - cells[0];
  const accepted = Math.max(0, Math.min(inflow, space0));
  cells[0] += accepted;
  const spilled = inflow - accepted;
  if (spilled > 1e-9) {
    s.feedSpill += spilled;
    if (!s._feedFlagged) {
      s.events.unshift({ t: s.t, type: "feed", msg: `Feed-point spill begins (valve > belt ceiling ${ceiling.toFixed(3)} m³/s)` });
      s._feedFlagged = true;
    }
  } else {
    s._feedFlagged = false;
  }

  // 3. Belt discharge -> 1m free fall -> arrives at bucket FALL_TIME later
  if (beltOut > 1e-12) s.inFlight.push({ arriveAt: s.t + FALL_TIME, vol: beltOut });

  // 4. advance time
  const tNew = s.t + DT;

  // 5. process arrivals into bucket
  let arrived = 0;
  const still = [];
  for (const pkt of s.inFlight) {
    if (pkt.arriveAt <= tNew) arrived += pkt.vol;
    else still.push(pkt);
  }
  s.inFlight = still;
  s.bucket += arrived;

  // 6. cyclic empty
  const idx = Math.floor(tNew / P.emptyInterval);
  if (idx > s.lastEmptyIdx) {
    s.lastEmptyIdx = idx;
    if (s.bucket > 1e-9) s.events.unshift({ t: tNew, type: "empty", msg: `Bucket emptied (was ${s.bucket.toFixed(2)} m³)` });
    s.bucket = 0;
    s.bucketOverflowing = false;
  }

  // 7. bucket overflow
  if (s.bucket > P.bucketCap + 1e-9) {
    const over = s.bucket - P.bucketCap;
    s.bucketSpill += over;
    s.bucket = P.bucketCap;
    if (!s.bucketOverflowing) {
      s.bucketOverflowing = true;
      s.events.unshift({ t: tNew, type: "bucket", msg: `BUCKET OVERFLOW at t=${tNew.toFixed(1)}s` });
    }
  }

  s.t = tNew;

  // 8. sample history
  if (Math.floor(tNew / HIST_SAMPLE) > s.lastSample) {
    s.lastSample = Math.floor(tNew / HIST_SAMPLE);
    const beltTotal = cells.reduce((a, b) => a + b, 0);
    s.hist.push({ t: +tNew.toFixed(2), bucket: +s.bucket.toFixed(4), belt: +beltTotal.toFixed(4) });
    if (s.hist.length > HIST_CAP) s.hist.shift();
  }
  if (s.events.length > 40) s.events.length = 40;
  return s;
}

// colour ramp green -> amber -> red by fill ratio
function ratioColor(r) {
  r = Math.max(0, Math.min(1, r));
  let a, b, t;
  if (r < 0.5) { a = [63, 185, 80]; b = [210, 153, 34]; t = r / 0.5; }
  else { a = [210, 153, 34]; b = [248, 81, 73]; t = (r - 0.5) / 0.5; }
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
const FONT_DISP = "'Anton', 'Arial Narrow', sans-serif";
const C = {
  bg: "#0c0e0d", panel: "#16191b", panel2: "#1d2123", line: "#2a2f31",
  text: "#d4dad0", muted: "#7d877f", wheat: "#e0a82e",
  green: "#3fb950", amber: "#d29922", red: "#f85149",
};

export default function GrainFlowSim() {
  const [params, setParams] = useState({ ...PRESETS.bucket.p });
  const [running, setRunning] = useState(false);
  const [snap, setSnap] = useState(freshState());

  const stateRef = useRef(freshState());
  const paramsRef = useRef(params);
  const runRef = useRef(false);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const speedRef = useRef(5);
  const [speed, setSpeed] = useState(5);
  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const drawRef = useRef(null);
  const lastPublishTs = useRef(0);

  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const publish = useCallback(() => {
    const s = stateRef.current;
    setSnap({
      t: s.t, cells: s.cells.slice(), bucket: s.bucket,
      feedSpill: s.feedSpill, bucketSpill: s.bucketSpill,
      bucketOverflowing: s.bucketOverflowing, events: s.events.slice(0, 12),
      hist: s.hist.slice(), inFlightVol: s.inFlight.reduce((a, p) => a + p.vol, 0),
    });
  }, []);

  // Reassigned every render so the recursive rAF call always uses the current closure.
  loopRef.current = (ts) => {
    if (!runRef.current) return;
    if (!lastTsRef.current) lastTsRef.current = ts;
    const dtReal = Math.min(0.1, (ts - lastTsRef.current) / 1000);
    lastTsRef.current = ts;
    let simBudget = dtReal * speedRef.current;
    let steps = 0;
    const s = stateRef.current, P = paramsRef.current;
    while (simBudget >= DT && steps < MAX_STEPS_PER_FRAME) {
      step(s, P); simBudget -= DT; steps++;
    }
    drawRef.current?.();                           // canvas: every frame, no React overhead
    if (ts - lastPublishTs.current >= 100) {       // React state (chart/stats): ~10 fps
      publish();
      lastPublishTs.current = ts;
    }
    rafRef.current = requestAnimationFrame(loopRef.current);
  };

  const start = () => {
    if (runRef.current) return;
    runRef.current = true; setRunning(true);
    lastTsRef.current = 0;
    lastPublishTs.current = 0;
    rafRef.current = requestAnimationFrame(loopRef.current);
  };
  const pause = () => { runRef.current = false; setRunning(false); cancelAnimationFrame(rafRef.current); };
  const reset = () => {
    pause(); stateRef.current = freshState(); publish();
  };
  const stepOnce = () => { step(stateRef.current, paramsRef.current); publish(); };
  const jumpToOverflow = () => {
    pause();
    const s = stateRef.current, P = paramsRef.current;
    const startT = s.t; let guard = 0;
    while (s.bucketSpill < 1e-9 && s.feedSpill < 1e-6 && (s.t - startT) < 600 && guard < 600 / DT + 10) {
      step(s, P); guard++;
    }
    publish();
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const applyPreset = (key) => { pause(); setParams({ ...PRESETS[key].p }); stateRef.current = freshState(); publish(); };
  const setP = (k, v) => setParams((p) => ({ ...p, [k]: v }));

  // derived readouts
  const ceiling = params.area * params.beltSpeed;
  const delay = params.length / params.beltSpeed;
  const beltCopes = params.valveRate <= ceiling + 1e-9;
  const netToBucket = params.valveRate; // steady-state inflow once filled
  const cellCap = (params.area * params.length) / N_CELLS;

  // ---- canvas draw ----
  // Reassigned every render; called directly from the rAF loop (60 fps) for smooth animation.
  // Also triggered via useEffect below for pause / step / param-change scenarios.
  drawRef.current = () => {
    const cv = canvasRef.current; if (!cv) return;
    const s = stateRef.current;
    const P = paramsRef.current;
    const cCap = (P.area * P.length) / N_CELLS;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const beltX0 = 130, beltX1 = 600, beltY = 168, bandH = 78;
    const cellW = (beltX1 - beltX0) / N_CELLS;

    const hx = 60, hy = 26, hw = 70;
    ctx.fillStyle = C.panel2;
    ctx.beginPath();
    ctx.moveTo(hx, hy); ctx.lineTo(hx + hw, hy);
    ctx.lineTo(hx + hw / 2 + 12, hy + 70); ctx.lineTo(hx + hw / 2 - 12, hy + 70);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.line; ctx.stroke();
    ctx.fillStyle = C.wheat; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(hx + 6, hy + 4); ctx.lineTo(hx + hw - 6, hy + 4);
    ctx.lineTo(hx + hw / 2 + 9, hy + 58); ctx.lineTo(hx + hw / 2 - 9, hy + 58);
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    const openFrac = Math.min(1, P.valveRate / 0.12);
    const gateY = hy + 70;
    ctx.fillStyle = "#0c0e0d"; ctx.fillRect(hx + hw / 2 - 14, gateY, 28, 10);
    ctx.fillStyle = C.green; ctx.fillRect(hx + hw / 2 - 12, gateY + 2, 24 * openFrac, 6);
    ctx.fillStyle = C.muted; ctx.font = `10px ${FONT_MONO}`;
    ctx.fillText(`valve ${(P.valveRate).toFixed(3)} m³/s`, hx - 6, gateY + 26);

    const feedX = beltX0 + cellW * 0.5;
    if (P.valveRate > 0) {
      ctx.strokeStyle = C.wheat; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
      const ph = (s.t * 60) % 14;
      for (let yy = gateY + 12; yy < beltY - bandH / 2; yy += 7) {
        ctx.beginPath(); ctx.moveTo(hx + hw / 2, yy); ctx.lineTo(feedX, yy + 4); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }

    ctx.fillStyle = C.panel; ctx.fillRect(beltX0 - 4, beltY - bandH / 2 - 4, (beltX1 - beltX0) + 8, bandH + 8);
    ctx.strokeStyle = C.line; ctx.strokeRect(beltX0 - 4, beltY - bandH / 2 - 4, (beltX1 - beltX0) + 8, bandH + 8);

    const rollPhase = (s.t * P.beltSpeed * 2) % (Math.PI * 2);
    [beltX0 - 4, beltX1 + 4].forEach((rx) => {
      ctx.beginPath(); ctx.fillStyle = C.panel2; ctx.arc(rx, beltY, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.muted; ctx.beginPath();
      ctx.moveTo(rx, beltY); ctx.lineTo(rx + 14 * Math.cos(rollPhase), beltY + 14 * Math.sin(rollPhase)); ctx.stroke();
    });

    const cells = s.cells;
    for (let i = 0; i < N_CELLS; i++) {
      const r = cCap > 0 ? Math.min(1, cells[i] / cCap) : 0;
      const x = beltX0 + i * cellW;
      const h = r * bandH;
      const top = beltY + bandH / 2 - h;
      ctx.fillStyle = ratioColor(r); ctx.globalAlpha = 0.92;
      ctx.fillRect(x + 0.5, top, cellW - 1, h);
      ctx.globalAlpha = 1;
      if (r > 0.999) {
        ctx.strokeStyle = C.red; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, beltY - bandH / 2, cellW - 2, bandH); ctx.lineWidth = 1;
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath(); ctx.moveTo(beltX0, beltY + bandH / 2); ctx.lineTo(beltX1, beltY + bandH / 2); ctx.stroke();

    const fallX = beltX1 + 4;
    const buX = beltX1 + 70, buW = 150, buTop = beltY + 60, buH = 150;
    const inFlightVol = s.inFlight.reduce((a, p) => a + p.vol, 0);
    if (inFlightVol > 1e-7) {
      ctx.strokeStyle = C.wheat; ctx.globalAlpha = 0.7; ctx.lineWidth = 3;
      const ph = (s.t * 120) % 16;
      for (let yy = beltY + bandH / 2; yy < buTop; yy += 8) {
        const y2 = yy + (ph % 8);
        ctx.beginPath(); ctx.moveTo(fallX, y2); ctx.lineTo(buX + buW / 2, y2 + 3); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    ctx.fillStyle = C.muted; ctx.font = `9px ${FONT_MONO}`;
    ctx.fillText(`1 m fall · ${FALL_TIME.toFixed(2)} s`, fallX + 4, beltY + 36);

    ctx.fillStyle = C.panel; ctx.fillRect(buX, buTop, buW, buH);
    ctx.strokeStyle = C.line; ctx.strokeRect(buX, buTop, buW, buH);
    const br = Math.min(1, s.bucket / P.bucketCap);
    const fh = br * (buH - 6);
    ctx.fillStyle = ratioColor(br); ctx.globalAlpha = 0.92;
    ctx.fillRect(buX + 3, buTop + (buH - 3) - fh, buW - 6, fh); ctx.globalAlpha = 1;
    ctx.strokeStyle = C.red; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(buX, buTop + 3); ctx.lineTo(buX + buW, buTop + 3); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.muted; ctx.font = `9px ${FONT_MONO}`;
    ctx.fillText(`cap ${P.bucketCap.toFixed(1)} m³`, buX + 4, buTop + 14);
    if (s.bucketOverflowing) {
      ctx.fillStyle = C.red;
      ctx.font = `bold 12px ${FONT_MONO}`;
      ctx.fillText("OVERFLOW", buX + 28, buTop - 8);
      ctx.globalAlpha = 0.7; ctx.fillStyle = C.wheat;
      const ph = (s.t * 90) % 12;
      for (let yy = buTop; yy < buTop + 40; yy += 6) {
        ctx.fillRect(buX - 6, yy + (ph % 6), 4, 4);
        ctx.fillRect(buX + buW + 2, yy + (ph % 6), 4, 4);
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = C.text; ctx.font = `bold 12px ${FONT_MONO}`;
    ctx.fillText(`${s.bucket.toFixed(2)} m³`, buX + 8, buTop + buH - 8);
  };

  // Redraws canvas when paused (step, reset, slider change). During run, drawRef is called
  // directly from the rAF loop at 60 fps so this effect is a no-op most of the time.
  useEffect(() => { drawRef.current?.(); }, [snap, params]);

  const Stat = ({ label, value, color }) => (
    <div style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: FONT_MONO }}>{label}</div>
      <div style={{ fontSize: 18, color: color || C.text, fontFamily: FONT_MONO, fontWeight: 600 }}>{value}</div>
    </div>
  );

  const Slider = ({ k, label, min, max, stepv, unit }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: FONT_MONO, color: C.muted, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: C.wheat }}>{params[k]}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={stepv} value={params[k]}
        onChange={(e) => setP(k, +e.target.value)} style={{ width: "100%", accentColor: C.wheat }} />
    </div>
  );

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", padding: 18, fontFamily: FONT_MONO }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;600&display=swap');
        input[type=range]{height:4px;background:${C.line};border-radius:3px;}`}</style>

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
        <h1 style={{ fontFamily: FONT_DISP, fontSize: 38, margin: 0, color: C.wheat, letterSpacing: 1 }}>GRAIN FLOW SIMULATOR</h1>
        <span style={{ fontSize: 11, color: C.muted }}>cell-based · transport delay · 1 m free-fall · cyclic bucket</span>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
        t = <span style={{ color: C.text }}>{snap.t.toFixed(1)} s</span> &nbsp;|&nbsp; belt ceiling <span style={{ color: beltCopes ? C.green : C.red }}>{ceiling.toFixed(3)} m³/s</span> &nbsp;|&nbsp; transport delay {delay.toFixed(1)} s &nbsp;|&nbsp; belt {beltCopes ? "coping" : "OVERLOADED"}
      </div>

      {/* controls bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {!running
          ? <Btn onClick={start} icon={<Play size={14} />}>Run</Btn>
          : <Btn onClick={pause} icon={<Pause size={14} />}>Pause</Btn>}
        <Btn onClick={stepOnce} icon={<StepForward size={14} />}>Step</Btn>
        <Btn onClick={jumpToOverflow} icon={<FastForward size={14} />}>Jump to overflow</Btn>
        <Btn onClick={reset} icon={<RotateCcw size={14} />}>Reset</Btn>
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 6 }}>
          <span style={{ fontSize: 11, color: C.muted }}>speed</span>
          {[1, 5, 20].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              background: speed === s ? C.wheat : C.panel2, color: speed === s ? "#000" : C.text,
              border: `1px solid ${C.line}`, borderRadius: 5, padding: "4px 9px", fontFamily: FONT_MONO,
              fontSize: 11, cursor: "pointer", fontWeight: 600,
            }}>{s}x</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {Object.entries(PRESETS).map(([k, v]) => (
            <button key={k} onClick={() => applyPreset(k)} style={{
              background: C.panel2, color: C.text, border: `1px solid ${C.line}`,
              borderRadius: 5, padding: "4px 10px", fontFamily: FONT_MONO, fontSize: 11, cursor: "pointer",
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14 }}>
        {/* left: parameters */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 16, color: C.wheat, marginBottom: 12, letterSpacing: 1 }}>PARAMETERS</div>
          <Slider k="valveRate" label="Valve flow" min={0} max={0.12} stepv={0.001} unit=" m³/s" />
          <Slider k="beltSpeed" label="Belt speed" min={0.2} max={4} stepv={0.1} unit=" m/s" />
          <Slider k="area" label="Belt cross-section" min={0.01} max={0.12} stepv={0.005} unit=" m²" />
          <Slider k="length" label="Belt length" min={2} max={20} stepv={0.5} unit=" m" />
          <Slider k="bucketCap" label="Bucket capacity" min={0.5} max={6} stepv={0.1} unit=" m³" />
          <Slider k="emptyInterval" label="Empty interval" min={10} max={120} stepv={5} unit=" s" />
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 10, fontSize: 10.5, color: C.muted, lineHeight: 1.7 }}>
            ceiling = area × speed = <span style={{ color: C.text }}>{ceiling.toFixed(3)}</span> m³/s<br />
            cell capacity = <span style={{ color: C.text }}>{cellCap.toFixed(4)}</span> m³<br />
            steady fill rate = <span style={{ color: C.text }}>{netToBucket.toFixed(3)}</span> m³/s<br />
            fill-to-cap ≈ <span style={{ color: C.text }}>{(params.bucketCap / Math.max(1e-6, netToBucket)).toFixed(1)}</span> s + {delay.toFixed(1)}s delay
          </div>
        </div>

        {/* right: viz + stats + chart */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 8 }}>
            <canvas ref={canvasRef} width={840} height={300} style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            <Stat label="Bucket vol" value={`${snap.bucket.toFixed(2)} m³`} color={snap.bucketOverflowing ? C.red : C.text} />
            <Stat label="Bucket spill" value={`${snap.bucketSpill.toFixed(2)} m³`} color={snap.bucketSpill > 0 ? C.red : C.green} />
            <Stat label="Feed spill" value={`${snap.feedSpill.toFixed(2)} m³`} color={snap.feedSpill > 0 ? C.red : C.green} />
            <Stat label="On belt" value={`${(snap.cells || []).reduce((a, b) => a + b, 0).toFixed(2)} m³`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 10px 4px" }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, paddingLeft: 6 }}>VOLUME vs TIME</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={snap.hist} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
                  <XAxis dataKey="t" stroke={C.muted} tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT_MONO }} unit="s" />
                  <YAxis stroke={C.muted} tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT_MONO }} />
                  <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.line}`, fontFamily: FONT_MONO, fontSize: 11 }} labelStyle={{ color: C.wheat }} />
                  <ReferenceLine y={params.bucketCap} stroke={C.red} strokeDasharray="5 4" label={{ value: "bucket cap", fill: C.red, fontSize: 9 }} />
                  <Line type="monotone" dataKey="bucket" stroke={C.wheat} dot={false} strokeWidth={2} isAnimationActive={false} name="bucket" />
                  <Line type="monotone" dataKey="belt" stroke={C.green} dot={false} strokeWidth={1.5} isAnimationActive={false} name="belt total" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, height: 200, overflowY: "auto" }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={12} /> EVENT LOG
              </div>
              {(snap.events || []).length === 0 && <div style={{ fontSize: 11, color: C.muted }}>no events yet</div>}
              {(snap.events || []).map((e, i) => (
                <div key={i} style={{
                  fontSize: 10.5, marginBottom: 5, fontFamily: FONT_MONO,
                  color: e.type === "bucket" ? C.red : e.type === "feed" ? C.amber : C.muted,
                }}>
                  <span style={{ color: C.text }}>t={e.t.toFixed(1)}s</span> {e.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Btn({ onClick, icon, children }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, background: C.panel2, color: C.text,
      border: `1px solid ${C.line}`, borderRadius: 6, padding: "7px 12px", fontFamily: FONT_MONO,
      fontSize: 12, cursor: "pointer",
    }}>{icon}{children}</button>
  );
}

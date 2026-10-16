# Build mode findings

The results of the `browser-test` combo sessions. How a session runs and what each
entry holds is set out in `docs/browser-testing.md`. The matrix of combos is
in the parent tracking issue, #96.

## Summary

Shows the latest run of each combo.

| Combo | Ticket | Last run | SHA | PASS | FAIL | QUESTION | Bugs |
|-------|--------|----------|-----|------|------|----------|------|
| S1 Edges & Storage smoke | #97 | 2026-10-16 | 0cae43a | 106 | 8 | 4 | #123 #124 #125 #126 |
| S2 Conveying smoke | #98 | 2026-10-16 | 862a656 | 88 | 7 | 3 | #128 #129 |
| S3 Cleaning & treating smoke | #99 | 2026-10-16 | 6e8dedb | 38 | 7 | 3 | #128 #130 |
| S4 Packaging smoke | #100 | | | | | | |
| G1 Golden: treating section | #101 | 2026-10-16 | 6e8dedb | 48 | 5 | 7 | #131 |
| G2 Golden: outload | #102 | | | | | | |
| G3 Golden: packaging | #103 | | | | | | |
| G4 Golden: interlocks & rules | #104 | | | | | | |
| G5 Golden: side-by-side run | #105 | | | | | | |
| C1 Level conditions × actions | #106 | | | | | | |
| C2 Running/stopped & cascades | #107 | | | | | | |
| C3 Delays, alarm-only, sliders | #108 | | | | | | |
| C4 Suggested interlocks | #109 | | | | | | |
| C5 Interlock lifecycle | #110 | | | | | | |
| C6 Machine rules & feed rate links | #111 | | | | | | |
| B1 Topology edge cases | #112 | | | | | | |
| B2 Merge & fan-out | #113 | | | | | | |
| B3 Chained metering | #114 | | | | | | |
| B4 Batch machines in series | #115 | | | | | | |
| B5 Recirculation loop | #116 | | | | | | |
| B6 Rate mismatch | #117 | | | | | | |
| D1 Undo/redo | #118 | | | | | | |
| D2 Save/open/autosave | #119 | | | | | | |
| D3 Multi-select & routing | #120 | | | | | | |
| E1 Limits & extreme values | #121 | | | | | | |
| E2 Long runs & large line | #122 | | | | | | |

## Known broken items

Each session keeps this list current, so later sessions know what to work around.

| Item / feature | Bug | Found in | Fixed? |
|----------------|-----|----------|--------|
| Treater pre-bin, Concetti pre-bin and custom Bin never discharge unless a batch machine pulls; into Grain out they only fill | #123 | S1 | No |
| A full Discard bin keeps taking grain at the full rate, with no event | #124 | S1 | No |
| A bin at 100 % blocks its feed with no event-log or problems entry | #125 | S1 | No |
| Custom Discard bin has no capacity field (user decided to add one) | #127 | S1 | No |
| Grain out shows no amount received and plots 0 t/h, so conservation can't be read at the end of a line. Discard bin popup also empty | #126 | S1 | No |
| Belt, chain, conveyor, grain break, diverter and outlet valve popups show no values. The outlet valve has no manual open/close (only interlocks, CONTROLLED STOP, TRIP UTILITIES) | #128 | S2 | No |
| A pendulum shortened below about 20 m draws outlet 2 before outlet 1 (the sim is right) | #129 | S2 | No |
| No real catalogue item for the golden metal remover, drum feeder, outlet valve, scalping screen or discard bin; only the custom ones are listed. Use the custom items as stand-ins | #131 | G1 | No |
| Metal remover, auto sampler, scalping screen and batch treater popups have no live readouts (only sliders, or nothing). Same on the golden line | #128 | S3 | No |
| A batch treater fed through a drum feeder (or starved) draws an empty drum with its chute discharging while it fills. The sim itself is right | #130 | S3 | No |

## Entries

<!-- One "## <combo id> <name>" heading per combo, entries appended under it. -->

## S1 Edges & Storage smoke

### S1 — 2026-10-16 — 0cae43a

**Result:** 106 PASS · 8 FAIL · 4 QUESTION · blocked by: #126 (Pro box row, check 7)
**Tool:** Playwright only. Dev server on port 5174, because 5173 was held by an older dev server from another session.

**Steps**
1. Cleared localStorage, reloaded, BUILD → NEW LINE.
2. For each storage item: dragged Grain in, the item and Grain out from the catalogue, then wired Grain in → item → Grain out by dragging port dots. Read the PROBLEMS panel.
3. Selected the item and read the right panel. For every number field, typed 2× the max, half the min, then the max and the min, pressing Enter each time, deselecting and reselecting, and reading the value back.
4. SIM → 5×. Plotted Grain in's rate and the item's level and rate from their popups, then ran for 150 sim-seconds. Sampled the popup and the canvas instruments every 25 s, and read the final chart values from the chart's polylines (read-only). The chart's hover readout didn't respond to Playwright mouse moves.
5. Treater buffer bin got extra runs. First Grain in → bin → Grain out at 5× for 418 s. Then the bin's fill-level slider was set to 61% mid-run. Then the bin → Grain out connection was deleted (click connector, Delete), Grain in was set to 20 t/h, and the line ran at 20× until the bin was full (2167 s).
6. Custom Discard bin as a sink: Grain in → Discard bin, 5× then 20× to 450 s.
7. Pro box unloading station → Grain out on its own. Then Grain in alone, for its right panel.
8. SETTINGS → START OVER to the golden line, then ran it at 20× to 960 s to compare the pre-bins and the Discard bin.
9. Checked console messages after each stage. This session logged no errors or warnings. The only errors in the buffer are older ones, from dev servers on ports 5199 and 5173.

**Checks.** Check numbers follow the ticket: 1 lands/name/maker · 2 wiring/problems · 3 flows and animates · 4 popup controls · 5 right panel limits · 6 ports · 7 conservation · 8 console. Each row shows the evidence that matters.

| Item | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Evidence |
|------|---|---|---|---|---|---|---|---|----------|
| Grain in | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Rate 0–20 t/h (default 12). Typing 40 or −5 is refused, and 0 is accepted. The popup slider set to 20 t/h fills a blocked bin at exactly 0.33 t/min. One output port. |
| Grain out | PASS | PASS | PASS | **FAIL** #126 | PASS | PASS | **FAIL** #126 | PASS | "No adjustable settings". The popup has only plot buttons, with no amount received. Its plotted rate and level stay 0 while 12 t/h arrives. |
| Pro box unloading station | PASS | PASS | PASS | PASS | PASS | PASS | blocked by #126 | PASS | Rate 0–20 t/h. Typing 40 or −5 leaves 20. It flows to Grain out at 11.39 t/h plotted. Only its outline or inner box can be clicked (see observations). |
| Treater buffer bin | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 2–20 m³ (default 7.7). Typing 25 or 1 is refused, and 12 is accepted. 12 t/h passes through and it holds 0 t. With the outlet open it fills at exactly 20 t/h: 0.33 t at 60 s, 3.34 t at 602 s, 8.64 t at 1606 s. |
| Treater pre-bin | PASS | PASS | **FAIL** #123 | PASS | PASS | PASS | PASS | PASS | 0.5–5 m³ (default 1.63). Typing 10 or 0.25 is refused. It never discharges: 7% → 43% in 150 s (0.50 t, which matches 12 t/h in), outflow 0.01 t/h. On the golden line it does discharge to the treater (30% → 28%). |
| Treater after-bin | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 0.2–2 m³ (default 0.67). Typing 4 or 0.1 is refused. 11.40 t/h in = 11.40 out, and it holds 0%. Its instruments are LSH and LSL only, with no LT. |
| Screen discharge hopper | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 0.05–0.6 m³ (default 0.2). Typing 1.2 or 0.025 is refused. 11.40 in = 11.40 out. |
| Discard bin (real) | QUESTION | – | – | – | – | – | – | – | Not in the catalogue. Only the custom Discard bin is listed (catalogue.js lists a real item only if it has a maker or sensors). |
| Outload buffer bin | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 1–15 m³ (default 4.51). Typing 30 or 0.5 is refused. 11.40 in = 11.40 out, and it holds 0.00 / 3.25 t. |
| Metal bin | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 1.5–18 m³ (default 6). Typing 36 or 0.75 is refused. 11.40 in = 11.40 out, and it holds 0.00 / 4.32 t. |
| Flexicon pre-bin | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 0.6–8 m³ (default 2.5). Typing 16 or 0.3 is refused. 11.40 in = 11.40 out. A fresh copy already has an "LSL set point 35 %" slider (see questions). |
| Concetti pre-bin | PASS | PASS | **FAIL** #123 | PASS | PASS | PASS | PASS | PASS | 0.2–2 m³ (default 0.72). Typing 4 or 0.1 is refused. It never discharges: 16% → 96% in 150 s (0.50 / 0.52 t), outflow 0.01 t/h. |
| Bin (Custom) | PASS | PASS | **FAIL** #123 | PASS | PASS | PASS | PASS | PASS | The right panel shows "Custom". 0.01–100 m³: typing 200 or 0.005 is refused, while 100 and 0.01 are accepted. Cloned from the Treater pre-bin, it doesn't discharge either (43% after 150 s). |
| Metal bin (Custom) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | The right panel shows "Custom". 0.01–100 m³: typing 200 or 0.005 is refused, while 100 and 0.01 are accepted. 11.40 in = 11.40 out. |
| Discard bin (Custom) | PASS | PASS | PASS | **FAIL** #126 | QUESTION | PASS | **FAIL** #124 | PASS | The right panel shows "Custom" but "no adjustable settings", so there's no capacity. The popup has only plot buttons. It is full (red, 100%) at about 85 s and still takes 12.00 t/h at 450 s. |

On check 1: no item shows a maker on the canvas. The maker line appears in the catalogue and the right panel, "Custom" for the custom items. The real storage items have no maker, so both places are blank for them, which is consistent. On check 7: for the pass-through rows, the item's plotted rate matched Grain in's and the item held 0 t, so nothing was lost up to the item. The last hop into Grain out can't be read (#126).

**Bin extras**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| E1 | Level rises when the outlet is starved | Rises | Treater buffer bin with its outlet left open: 0% → 100% linearly at the Grain in rate | PASS |
| E2 | Level falls when drained | Falls | Buffer bin set to 61% (5.27 t) mid-run: back to 0 within 15 sim-seconds, outflow peak about 216 t/h. Pre-bins never drain (#123, counted above) | PASS |
| E3 | Level switches assert, coloured by alarm role, as the level crosses them | Assert | Fresh bins have no set points (LSHH, LSH and LSL show "–"), so nothing asserted from 0% to 100% | QUESTION |
| E4 | Set point sliders appear only once an interlock uses that switch | None on a fresh bin | None on 10 of the 11 storage items. The Flexicon pre-bin is the exception: it has LSL 35 % and its slider with no interlock | PASS (Flexicon: QUESTION) |
| E5 | A bin at 100 % stops taking grain or overflows visibly, and the event log or problems list says so | Stops or overflows, with a message | Buffer bin: turns red and Grain in drops to 0 t/h (nothing lost), but nothing is logged (#125). Discard bin: takes grain past 100 % (#124, counted in its row) | **FAIL** #125 |

Screenshots: [S1-1 full buffer bin, empty event log](findings-img/S1-1.png) · [S1-2 full Discard bin still fed](findings-img/S1-2.png) · [S1-3 Pro box → Grain out](findings-img/S1-3.png) · [S1-4 Treater pre-bin stalled](findings-img/S1-4.png) · [S1-5 Grain out plotted at 0](findings-img/S1-5.png) · [S1-6 custom Bin stalled](findings-img/S1-6.png) · [S1-7 Flexicon pre-bin with LSL 35](findings-img/S1-7.png)

**Bugs filed / commented**
- #123 Pre-bins never discharge into a line without a batch machine (Treater pre-bin, Concetti pre-bin, custom Bin) (new)
- #124 A full Discard bin keeps taking grain at the full rate, with no event (new)
- #125 A bin that fills to 100 % blocks its feed with no event-log or problems entry (new)
- #126 Grain out and Discard bin popups show no amount received; Grain out's plotted rate stays at 0 (new)

**Questions for the user** (answered 2026-10-16)
- The ticket lists a real **Discard bin**, but the catalogue lists only the custom one. A real item with no maker and no sensors is hidden on purpose (#94). Is that what you want for the Discard bin? **Answer: yes. Only the custom Discard bin is listed.**
- The custom **Discard bin** has no capacity setting at all, so it fills in about 85 s at 12 t/h and you can't change that. Should it get a capacity field with the custom 0.01–100 m³ range? **Answer: add a field. Filed as #127.**
- A freshly added bin's level switches have no set points, so they never assert and nothing is logged until an interlock exists. Should catalogue bins carry default set points the way the golden bins do (95/85/35)? **Answer: no. A fresh bin stays without set points until an interlock uses them.**
- A fresh **Flexicon pre-bin** ships with LSL at 35 % and its set point slider, with no interlock. The other bins have none. Is that intended? **Answer: not sure yet. Still open.**

**Observations**
- Connector routing: the Grain in → bin connector leaves Grain in's outlet upwards, runs behind its body, and enters the bin from the side behind the bin's body (path `M240,54 L240,37 L725,37 L725,20`). On screen the line doesn't touch either port dot.
- Opening or closing the right panel resizes the canvas and shifts every machine. A drag aimed at a port from a screenshot taken before the panel closed landed on Grain out and moved it on top of the bin outlet instead of wiring.
- An out-of-range value reverts silently on Enter. While typing, the field shows "CHANGED" with no warning, so nothing tells the user why the value didn't stick.
- A bin popup's "fill level" slider is a set-to control and doesn't follow the live level. It read 0 % while the bin read 100 %, and stayed at 61 % after the bin drained.
- The chart's rate line lags the real flow. A blocked bin fed at 12 t/h holds 0.08 t at 25 s, which is the full rate from t = 0. Grain in's plotted rate ramps up from 0 and reaches only about 11.4 t/h at 150 s.
- A bin whose outlet runs straight into Grain out drains with no throttle: 5.27 t left in under 15 s.
- The Pro box station's body is hollow. Clicks on its centre select nothing; only the outline or the inner box works.
- UNDO was greyed out after a SIM → BUILD round trip (for D1).
- Golden comparison: on the golden line the Treater pre-bin and Concetti pre-bin cycle normally, and the DISCARD SCALPINGS BIN popup is just as empty as the custom one.

**Follow-up combo ideas**
- Pre-bin → drum feeder or batch treater, to confirm the pre-bins work in Build mode when something pulls (pairs with #123).
- Bin → a conveyor that's stopped, to see the level rise with the outlet still connected.
- The golden Discard bin filled to 100 % (high scalpings fraction), to see whether #124 also happens on the golden line.

## S2 Conveying smoke

### S2 — 2026-10-16 — 862a656

**Result:** 88 PASS · 7 FAIL · 3 QUESTION · blocked by: none
**Tool:** Playwright only. Dev server on port 5180.

**Steps**
1. Cleared localStorage, reloaded, BUILD → NEW LINE. Each item got its own NEW LINE (DISCARD AND START NEW).
2. Plain runs (belt, chain, conveyor, elevators, grain break): Grain in → item → Grain out. Feeders and valve: Grain in → custom Bin → item → Grain out. Diverter: both outlets to their own Grain out. Pendulum: Grain in → inlet 1, and each of the three outlets to its own Grain out. Machines were dragged from the catalogue and wired by dragging port dots. The PROBLEMS button was read after wiring.
3. Right panel: for every number field, typed 2× the max, half the min, −1, the max, the min, then the default, pressing Enter each time. After each entry I deselected (Escape), reselected and read the value back. For length and height I also read the machine's drawn size (getBBox, read-only).
4. SIM → 5× → RUN. Plotted the rates (and the Bin's level) from the popups and read the chart polylines (read-only). Transit is the gap between the Grain in curve and the item's curve at the same value (0.25, 0.5 and 1 t/h). The chart's rate lag is the same on both curves, so it cancels. Conservation integrates both curves over sim time to get tonnes. Grain out still plots 0 (#126), so the last hop is read from the item's own rate.
5. Exercised each control: popup sliders (elevator and pendulum speed, drum gate, vibrating feed rate), the plant-control selectors (diverter, pendulum), and, for the outlet valve, an interlock built in the Interlocks window ("When BIN 1 is below 50 % for 1 s, close OUTLET VALVE 1"), since nothing else closes it.
6. Which outlet gets grain was read from the connector flow overlay (opacity, read-only), the flapper line's coordinates, and the transit times.
7. START OVER to compare the golden GRAIN BREAK, DIVERTER, AFTER-BIN OUTLET VALVE and BUCKET ELEVATOR popups.
8. Checked console messages after every stage: no errors or warnings all session.

**Checks.** Check numbers follow the ticket: 1 lands/name/maker · 2 wiring/problems · 3 flows and animates · 4 popup controls and readouts · 5 right-panel limits · 6 ports · 7 conservation · 8 console.

| Item | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Evidence |
|------|---|---|---|---|---|---|---|---|----------|
| Belt conveyor (Simatek B100) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | 5–40 t/h, 2–60 m/min, 2–40 m. Typing 80, 2.5 or −1 is refused; the max and min are accepted. Flights dash while running. 12.00 in / 11.99 t/h out at 300 s. Popup: EVENT LOG and PLOT RATE only. |
| Chain conveyor (Simatek E100) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | 5–40 t/h, 2–30 m/min (default 10.08), 2–40 m, out-of-range refused. Flights lit while running ([S2-1](findings-img/S2-1.png)). 12.00 in / 11.97 out at 300 s. Popup empty, as for the belt. |
| Bucket elevator (Simatek E200) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 5–40 t/h, 2–30 m/min, 4–20 m (default 8.731), out-of-range refused. Popup speed slider at 50 %: ST and canvas read 5.0 m/min with OVERRIDE, and the line throttles to its rating (Grain in and elevator both 10.0 t/h at 650 s, [S2-4](findings-img/S2-4.png)). 12.00 in / 11.98 out at 300 s. |
| Pendulum conveyor (Simatek E200) | PASS | QUESTION | PASS | PASS | PASS | PASS | PASS | PASS | Lands far larger than the view (2073 px wide). With all three outlets and inlet 1 wired, PROBLEMS keeps "PENDULUM CONVEYOR 1: input not connected" for the unused inlet 2 (see questions). 5–40 t/h, 2–30 m/min, 15–60 m, out-of-range refused. Speed 50 % reads 5.0 m/min. Selector GRAIN OUT 1/2/3 in the top bar. In 1.7509 t, out 1.6662 t at 700 s; the gap, 0.0847 t, equals what sits on the 4.28 m path to outlet 1 (0.0848 t). |
| Drum feeder (real) | – | – | – | – | – | – | – | – | Not listed: no maker and no sensors, so only the custom item is shown (#94, same rule as the S1 Discard bin answer). Not counted. |
| Vibrating conveyor (real) | – | – | – | – | – | – | – | – | Not listed, same reason. Not counted. |
| Outlet valve (real) | – | – | – | – | – | – | – | – | Not listed, same reason. Not counted. |
| Diverter (real) | – | – | – | – | – | – | – | – | Not listed, same reason. Not counted. |
| Grain break (real) | – | – | – | – | – | – | – | – | Not listed, same reason. Not counted. |
| Conveyor (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom". 0.5–200 t/h, 0.5–120 m/min, 1–150 m (4530 px at 150 m), out-of-range refused. In 0.2996 t, out 0.2059 t at 160 s; the gap is 30 s of transit at about 11.3 t/h (0.094 t). |
| Bucket elevator (Custom) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | "Custom". 0.5–200 t/h, 0.5–120 m/min, 2–50 m (1553 px tall at 50 m), out-of-range refused. Speed 0 %: ST 0.0 and the flow stops, Grain in held back. |
| Vibrating conveyor (Custom) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | "Custom". Feed rate 0–200 t/h (a minimum of 0 is kept, by the catalogue rule); 400 and −1 refused. The bed lights while conveying (by design it doesn't shake, #64). |
| Drum feeder (Custom) | PASS | PASS | PASS | PASS | QUESTION | PASS | PASS | PASS | "Custom". The right panel has "no adjustable settings", so its capacity is fixed at about 12.5 t/h (see questions). The drum rotates while running (107° → 94° in 0.7 s). With the feeder pulling, the custom Bin passes grain through (level 0 %, 11.39 t/h everywhere), so #123 doesn't block this chain. |
| Diverter (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | No adjustable settings. Two outlets, both connect. In 0.2662 t = out 0.2662 t at 150 s. The selector works (see extras), but the popup is empty; the golden DIVERTER's is too. |
| Outlet valve (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | Maximum flow 0.5–200 t/h, out-of-range refused. Popup empty, with no open/close control anywhere; the golden AFTER-BIN OUTLET VALVE's is the same. Passes 11.39 t/h with the bin at 0 %. |
| Grain break (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | No adjustable settings. In 0.2665 t = out 0.2665 t at 150 s. Popup empty; the golden GRAIN BREAK's is too. |

On check 1: as in S1, the maker shows in the catalogue and the right panel ("Simatek B100", "Custom"), not on the canvas.

**Conveying extras**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| X1 | Belt transit grows with length, shrinks with speed | ∝ length / speed | 10 m at 30 m/min: 20.0 s. 20 m: 40.0 s. 10 m at 60 m/min: 10.1 s | PASS |
| X2 | Chain transit | ∝ length / speed | 10 m at 10.08 m/min: 59.5 s (expected 59.5). 5 m at 20.16: 14.9 s (expected 14.9) | PASS |
| X3 | Elevator transit grows with height | ∝ height / speed | Real 8.731 m at 10.08 m/min: 52.0 s (expected 52.0). Custom 5 m at 10 m/min: 29.6–30.0 s. Pendulum outlet 3 at 31.087 m: 184.7 s (expected 185.0); at 15 m: 89.4 s | PASS |
| X4 | Changing length or height redraws the machine at its new size | Redraws in proportion | Belt, chain, conveyor and both elevators redraw (e.g. chain 100 / 330 / 1230 px at 2 / 10 / 40 m). The pendulum redraws, but at 15 m outlet 2 is drawn before outlet 1 (x 524 vs 614), while the sim still puts it after ([S2-2](findings-img/S2-2.png)) | **FAIL** #129 |
| X5 | Drum feeder: gate % sets the flow, 0 % gives none | Flow ∝ gate | Gate 50 %: 6.01 t/h, bin fills 0 → 36 %. Gate 0 %: the feeder decays to 0 and its connector goes dark, bin 36 → 81 %. Both fill rates give the same bin mass (about 1.19 t full) | PASS |
| X6 | Vibrating conveyor: feed rate sets the flow, 0 gives none | Flow = set rate | 10 t/h: 9.5 and rising at 150 s, bin takes the 2 t/h surplus. 0: no flow, bin to 50 %. 20 t/h: bin drains 50 → 28 % | PASS |
| X7 | Outlet valve: closed means no flow, open means flow | As stated | Closed by the interlock: valve 0 t/h, bin fills linearly to 50 % at 181 s (12 t/h into about 1.19 t). Then it opens and holds the bin at 50 %, the valve passing 10.5 t/h and rising ([S2-5](findings-img/S2-5.png)). CONTROLLED STOP also closes it, but stops Grain in too | PASS |
| X8 | Diverter: selector moves the flapper, grain only to the selected outlet | As stated | Default outlet 1: flapper line points left (16,16 → 4,16), only outlet 1's connector flows. GRAIN OUT 2: flapper flips right (→ 28,16) and only outlet 2's connector flows ([S2-6](findings-img/S2-6.png)) | PASS |
| X9 | Pendulum: grain stops at the selected outlet, and switching reroutes it | As stated | Outlet 1 at 31 m transits in 25.4 s (inferred from the conservation gap), outlet 2 in 57.1 s at 15 m, outlet 3 in 184.7 s. Switching 3 → 1 at 250 s: new grain goes to outlet 1, while grain already on the chain keeps going to outlet 3 (#69). The pendulum's output peaks at 17.2 t/h as both drain, then settles at 12, and the totals balance (row above). But outlet 3's connector stops animating within 15 s while grain still lands there ([S2-3](findings-img/S2-3.png), see questions) | PASS |

Screenshots: [S2-1 chain popup empty while running](findings-img/S2-1.png) · [S2-2 pendulum at 15 m, outlets out of order](findings-img/S2-2.png) · [S2-3 pendulum after switching to outlet 1](findings-img/S2-3.png) · [S2-4 elevator at 50 % speed](findings-img/S2-4.png) · [S2-5 outlet valve held closed by an interlock](findings-img/S2-5.png) · [S2-6 diverter switched to outlet 2](findings-img/S2-6.png)

**Bugs filed / commented**
- #128 Belt, chain, grain break, diverter and outlet valve popups show no values while running (new)
- #129 Shortening the pendulum conveyor draws outlet 2 before outlet 1 (new)

**Questions for the user**
- A pendulum with only one of its two inlets wired shows "PENDULUM CONVEYOR 1: input not connected" in PROBLEMS, and the message doesn't say which inlet. The line still runs. Should an unused second inlet count as a problem, and if it should, should the message name the inlet?
- The custom **Drum feeder** has no adjustable settings, so its capacity is fixed at about 12.5 t/h (the real feeder's rate); only the gate % changes the flow. The other custom items reach the wide limits. Should the custom drum feeder get a rate or capacity field (0.5–200 t/h)?
- After a pendulum switches outlet, grain already on the chain still discharges at the old outlet for up to about 160 s, as #69 intends. The old outlet's connector stops animating at once, though, so it looks as if nothing is arriving there. Should a connector keep animating until the chain has cleared it?

**Observations**
- RESTART clears the shared chart's plots and resets the plant-control selectors (the pendulum went back to GRAIN OUT 3). A BUILD → SIM round trip also clears the plots. Each run had to re-plot after RESTART.
- In SIM, the first view of a new line is zoomed far out, and FIT ALL fits the line under the chart dock, hiding the bottom machines. Each run needed a wheel zoom-out to see Grain out.
- The pendulum lands at about 2073 × 818 px, much bigger than the view, so its ports are off screen until FIT ALL.
- A bucket elevator at 50 % throttles Grain in from 12 to 10 t/h with no event or problems entry. Grain in's popup still reads 12 t/h. Same theme as #125.
- The diverter's flapper doesn't redraw when the selector changes while paused; it flips on the next step. The routing itself changes at once.
- The outlet valve can only be closed by an interlock, CONTROLLED STOP or TRIP UTILITIES. There's no manual open/close (included in #128).
- The real drum feeder, vibrating conveyor, outlet valve, diverter and grain break aren't in the catalogue (no maker, no sensors). The ticket lists them as real items; only their custom versions exist.
- The chart's rate line lags the flow, as S1 noted. Grain in's plotted rate reaches 11.4 t/h only at about 150 s. Transit and conservation were read by comparing curves under the same lag, not from the raw values.

**Follow-up combo ideas**
- Pendulum with both inlets fed (merge), and both ports of a diverter fed back into one machine (pairs with B2).
- Pendulum shortened to 15 m, then outlet 2 selected, on a full line, to confirm grain reaches the right bin after #129 is fixed.
- Bucket elevator throttled by its speed % feeding a bin, to check the bin's level matches the reduced rate.
- Custom Bin → drum feeder → batch treater, to see whether #123 changes with a batch machine downstream of a feeder.

## G1 Golden: treating section

### G1 — 2026-10-16 — 6e8dedb

**Result:** 48 PASS · 5 FAIL · 7 QUESTION · blocked by: #131 (check 1, five machines built from their custom items)
**Tool:** Standalone Playwright scripts (Node, headless Chromium), not the Playwright MCP, because another session held the shared browser. A small driver kept one page open and took commands. Every change was made with real mouse and keyboard input: HTML5 drags from the catalogue, port-to-port drags, typing in the right panel, and toolbar buttons. Scripts only read state (DOM text, bounding boxes, chart polylines, the SAVE download). Dev server on port 5183.

**Steps**
1. Cleared localStorage and reloaded. On the golden line, read every treating machine's right panel in BUILD and its popup in SIM. Then plotted the treating machines, set 20× and ran to 1319 s for a baseline ([G1-1](findings-img/G1-1.png)).
2. BUILD → NEW LINE. Dragged in 14 items: Grain in, Grain out ×2, the six real items (Treater buffer bin, Bucket elevator Simatek E200, Treater pre-bin, Batch treater Niklas WNS/200, Treater after-bin, Screen discharge hopper), and five custom items, because no real item is listed for them (#131). Each was dropped at the golden position shifted 90 units up.
3. Wired the 13 connections by dragging port dots. For the zero-length coupling, the after-bin's outlet dot sits under the valve's inlet dot, so I dragged from the valve's inlet and dropped it back on the same point.
4. In the right panel, typed the golden name, tag and every value into each machine, pressing Enter after each. Then deselected, reselected and read every field back. Set Grain in to 15 t/h, the golden source rate.
5. SIM: plotted the same series as the golden baseline plus Grain in, the buffer bin level and Grain out 2. Ran at 20× to 1317 s and read the chart polylines, popups and canvas fills.
6. BUILD → SAVE, kept the download, then opened it again through OPEN to confirm it loads.
7. SETTINGS → START OVER, then read the golden PROBLEMS list, the golden buffer bin popup ([G1-6](findings-img/G1-6.png)) and measured the run speed.
8. Read console messages after each stage. There were no errors or warnings all session.

**Checks.** Check numbers follow the ticket: 1 real catalogue item · 2 wired port to port · 3 name, tag and values · 6 popup controls match the golden popup. Checks 4, 5, 7 and 8 apply to the whole line and are in the second table.

| Machine (tag) | Item used | 1 | 2 | 3 | 6 | Evidence |
|---------------|-----------|---|---|---|---|----------|
| Grain in (for the upstream stub) | grain-in | PASS | PASS | PASS | – | Source rate set to 15 t/h (golden 15; the item's default is 12, limits 0–20). |
| Grain out 1 (for the metal reject stub) | grain-out | PASS | PASS | – | – | Wired from the metal remover's waste port (a waste line). |
| Grain out 2 (for the hopper's onward feed) | grain-out | PASS | PASS | – | – | Wired from the hopper's outlet. |
| METAL REMOVER (52.501.F00) | custom-metal-remover | **FAIL** #131 | PASS | PASS | PASS | No real `metal-remover` item listed. No adjustable settings, the same as golden. Popup: event log and PLOT RATE, the same as golden. |
| TREATER BUFFER BIN (52.502.H00) | treater-buffer-bin | PASS | PASS | QUESTION | QUESTION | Capacity 7.7 m³ (limits 2–20, as golden). The golden LSH 85, LSL 35, LSHH 95 set points and 7 s signal delay are not offered, and the popup lacks its three set point sliders. They only appear once an interlock uses the switch (see questions). |
| INLET DRUM FEEDER (52.505.L00) | custom-drum-feeder | **FAIL** #131 | PASS | PASS | PASS | No real `drum-feeder` item listed. No adjustable settings, the same as golden. The popup has the gate position slider, as golden. Here it reads 100 %; golden reads 55 %, set by its feed schedule rule. |
| BUCKET ELEVATOR · TREATING (52.506.E00) | bucket-elevator | PASS | PASS | PASS | PASS | Simatek E200. Rated capacity 20 t/h, chain speed 10.08 m/min, height 8.731 m, with limits as golden. The popup has the speed slider: 100 % here, 85 % on golden (feed schedule). |
| TREATER PRE-BIN (52.507.H00) | treater-pre-bin | PASS | PASS | QUESTION | QUESTION | Capacity 1.63 m³ (limits 0.5–5). The LSL recover 35, LSH 85 and LSHH 95 set points and their popup sliders are missing, as for the buffer bin. |
| NIKLAS WNS/200 BATCH TREATER (52.508.T00) | batch-treater | PASS | PASS | PASS | PASS | Batch size 160 kg (40–300), cycle time 48 s (10–90). Popup: both sliders, PLOT LEVEL and PLOT RATE, as golden. The chemical inlet and waste outlet are left unwired, as on golden. |
| TREATER AFTER-BIN (52.601.H00) | treater-after-bin | PASS | PASS | QUESTION | QUESTION | Capacity 0.67 m³ (0.2–2). The LSH0 60 and LSL0 20 set points, the 5 s signal delay and the two popup sliders are missing. |
| AFTER-BIN OUTLET VALVE (52.601.V00) | custom-outlet-valve | **FAIL** #131 | PASS | PASS | PASS | No real `outlet-valve` item listed. Maximum flow 19.2 t/h is accepted, but the custom limits are 0.5–200 (golden 5–40). The popup is the same as golden (empty, #128). |
| TREATMENT SCALPING SCREEN (52.602.F00) | custom-scalping-screen | **FAIL** #131 | PASS | PASS | PASS | No real `scalping-screen` item listed. Scalpings split 1 % (0–20), rated capacity 64.4 t/h (custom 0.5–200, golden 10–100). Popup: split slider and PLOT RATE, as golden. |
| SCALPING SCREEN DISCHARGE HOPPER (52.603.H00) | discharge-hopper | PASS | PASS | PASS | PASS | Capacity 0.2 m³ (0.05–0.6). Popup: fill level slider, PLOT LEVEL and PLOT RATE, as golden. |
| DISCARD SCALPINGS BIN (52.801.L00) | custom-discard-bin | **FAIL** #131 | PASS | PASS | PASS | No real `discard-bin` item listed (S1 confirmed only the custom one is listed, see #131). No adjustable settings, the same as golden. Popup: PLOT LEVEL and PLOT RATE only, as golden (#126). |

On check 3: every name and tag took on Enter and read back after deselecting. All the golden values except Grain in's rate equal the item defaults, so they were retyped and read back rather than changed from something else.

**Line checks**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 2 | After-bin → outlet valve coupling, no length | Can be made port to port | Made by dragging from the valve's inlet dot and dropping it back on the same point; PROBLEMS dropped from 4 to 2. The after-bin's outlet dot lies under the valve's, so it can't be the start of the drag. Nothing is drawn between them, as on golden | PASS |
| 4 | Problems list | Clears, or each remaining problem names a replaced stub | Two remain: "NIKLAS WNS/200 BATCH TREATER: input not connected" and "… output not connected" (the chemical inlet and waste outlet). The golden line shows the same two ([G1-2](findings-img/G1-2.png)) | QUESTION |
| 5a | Grain reaches the discharge hopper | Flows | Hopper 11.88 t/h (average over the last 120 s), 3.653 t passed by 1317 s. Golden: 11.88 t/h, 3.650 t | PASS |
| 5b | Grain reaches the discard bin | Flows | Its plotted rate is 0 (#126), but its fill rose from 1 % to about 19 % (drawn fill 15.3 of 80 units). That is the 1 % split: valve 3.690 t − hopper 3.653 t = 0.037 t | PASS |
| 5c | Batch treater cycles | Cycles | The drum is lit, the rate saw-tooths between 11.2 and 12.6 t/h, and 3.736 t was discharged by 1317 s (golden 3.733 t) ([G1-3](findings-img/G1-3.png)) | PASS |
| 5d | No machine idle that is busy on golden at the same source rate | All busy | At 15 t/h: metal remover 15.00, feeder 12.00, elevator 12.00, treater 11.92, valve 12.00, screen 12.00, hopper 11.88 t/h. Golden: 15.00, 12.18, 12.18, 11.79, 12.00, 12.00, 11.88. The pre-bin cycles 1–14 % here against 33–46 % on golden (see observations) ([G1-4](findings-img/G1-4.png)) | PASS |
| – | Conservation | Totals balance | By 1317 s: in 5.196 t = buffer bin 1.10 t + feeder 4.157 t (−0.06 t, chart lag at start-up). Feeder 4.157 → elevator 3.983 (0.17 t in transit = 52 s at 12 t/h). Then pre-bin 0.06 t + one 0.16 t batch in the treater, treater out 3.736, valve 3.690, hopper 3.653 + discard 0.037. Read by integrating the chart polylines (read-only) | PASS |
| 7 | SAVE downloads a file | A file | `new-line.json` (21 KB): 14 machines, 13 connections, no interlocks or rules. Committed as [`docs/findings-lines/G1.json`](findings-lines/G1.json). Opening it again through OPEN loads all 14 machines with PROBLEMS (2) | PASS |
| 8 | Console | No errors | No errors or warnings all session | PASS |

Screenshots: [G1-1 golden baseline run](findings-img/G1-1.png) · [G1-2 rebuilt line and its problems](findings-img/G1-2.png) · [G1-3 rebuilt line running, chart](findings-img/G1-3.png) · [G1-4 rebuilt line at 1317 s](findings-img/G1-4.png) · [G1-5 rebuilt buffer bin popup](findings-img/G1-5.png) · [G1-6 golden buffer bin popup](findings-img/G1-6.png)

**Bugs filed / commented**
- #131 Five golden treating machines have no real catalogue item (metal remover, drum feeder, outlet valve, scalping screen, discard bin) (new)

**Questions for the user**
- The buffer bin, pre-bin and after-bin can't be given their golden set points (LSH, LSL, LSHH, LSH0, LSL0) or signal delays in the right panel, and their popups lack the set point sliders. The ticket counts a value or control that isn't offered as a FAIL. But your S1 answer says a fresh bin has no set points until an interlock uses them, and these values live on the golden interlocks and the pre-bin feed schedule. Are they G4's to rebuild and check, rather than G1 failures?
- The batch treater's unwired chemical inlet and waste outlet show as two problems, on the golden line as well. The messages say "input not connected" and "output not connected" without naming the port. Should the chemical inlet and waste outlet count as problems when they're unwired? If they should, should the message name the port?

**Observations**
- Without the golden feed schedule rule (`preBinFeedSchedule`) and feed rate derivation, the feeder runs at 100 % gate and the elevator at 100 % speed. On golden they run at 55 % and 85 %. Throughput is the same, about 12 t/h, but the pre-bin cycles 1–14 % instead of holding 33–46 %. The buffer bin fills at 3 t/h on both lines. G4 should bring this back with the rules.
- In SIM, the rebuilt line's plant controls show EMPTY buttons for GRAIN OUT 1 and GRAIN OUT 2 as well as the discard bin. The golden stubs have none. Emptying a plant edge seems pointless.
- The coupling works, but it's hard to find: with the ports on the same point, only the top (valve inlet) dot can start a drag. The saved connection has no `coupling` mark (it's drawing-only), and nothing is drawn, as on golden.
- With only one machine on the line, the wheel can't zoom out below about 1.6× and FIT ALL zooms that machine to about 2×. Machines had to be placed one at a time, with FIT ALL between them, so the view grew. A drop outside the view lands at the clamped edge.
- The first golden run at 20× advanced about 56 sim-s per real second (926 s in 16 s). Every later run measured 20.1×, 20.6× and 5.3× at 20× and 5×, so I couldn't reproduce it.
- The custom stand-ins accept far wider limits than the golden machines (valve 0.5–200 t/h, screen 0.5–200 t/h), so a typo there wouldn't be refused.
- Right after NEW LINE, with nothing on the canvas, the button read PROBLEMS (2). It may be left over from the golden line. Not followed up.

**Follow-up combo ideas**
- G4: rebuild the buffer-bin, pre-bin and after-bin interlocks and the pre-bin feed schedule on top of G1.json, then compare the pre-bin band (33–46 %) and the popup set point sliders with golden.
- Re-run G1 check 1 once #131 is decided, with the real items if they are listed.

## S3 Cleaning and treating smoke

### S3 — 2026-10-16 — 6e8dedb

**Result:** 38 PASS · 7 FAIL · 3 QUESTION · blocked by: none (#126 still hides Grain out's amount, so I read the last hop from an Auto sampler placed just before it)
**Tool:** Playwright only. Dev server on port 5181.

**Steps**
1. Cleared localStorage, reloaded, BUILD → NEW LINE. Each item got its own NEW LINE (DISCARD AND START NEW).
2. Metal remover and Auto sampler: Grain in → item → Grain out. After the first run I wired the metal remover's waste port to a custom Discard bin.
3. Scalping screen: Grain in → screen. Product went to Auto sampler 1 → Grain out, and waste to Auto sampler 2 → Discard bin. A pass-through sampler plots its own rate, so each branch could be measured even though Grain out plots 0 (#126). The first run had the waste port left open; the second had it wired.
4. Batch treater (real, then Custom): first Grain in → treater → Grain out, to read PROBLEMS and the right panel. Then a new line: Grain in → Bin (Custom) → Drum feeder (Custom) → treater → Auto sampler → Grain out, with the waste outlet → Discard bin. Once, I also fed the real treater's chemical inlet from a second Grain in to see whether it connects.
5. Right panel: for every number field I typed 2× the max, a value below the min, −1, the max, the min, then the default, pressing Enter each time. After each entry I deselected, reselected and read the value back.
6. SIM → 5× (20× for the long treater runs) → RUN. I plotted rates and levels from the popups and read the chart polylines (read-only). On the chart, y = 235 is zero and y = 14 is the top of the axis; the right axis tops out at 15 t/h. I timed treater cycles from the drops in its plotted level. The treater's plotted rate lags, so its conservation check counts discharged batches × batch size instead.
7. Exercised the popup sliders: scalpings split, batch size, cycle time, and Grain in's source rate (set to 0 to starve the treater).
8. SETTINGS → START OVER, to compare against the golden line's METAL REMOVER, TREATMENT SCALPING SCREEN, NIKLAS WNS/200 BATCH TREATER and AUTO SAMPLER popups and its PROBLEMS list.
9. Checked console messages after every stage. There were no errors or warnings all session.

**Checks.** Check numbers follow the ticket: 1 lands/name/maker · 2 wiring/problems · 3 flows and animates · 4 popup controls and readouts · 5 right-panel limits · 6 ports · 7 conservation · 8 console.

| Item | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Evidence |
|------|---|---|---|---|---|---|---|---|----------|
| Metal remover (real) | – | – | – | – | – | – | – | – | Not listed. It has no maker and no sensors, so only the custom item is shown (#94, the same rule as in S1 and S2). Not counted. |
| Scalping screen (real) | – | – | – | – | – | – | – | – | Not listed, same reason. Not counted. |
| Auto sampler (real) | – | – | – | – | – | – | – | – | Not listed, same reason. Not counted. |
| Batch treater (Niklas WNS/200) | PASS | PASS | **FAIL** #130 | **FAIL** #128 | PASS | PASS | PASS | PASS | "Niklas WNS/200" shows in the catalogue and the right panel. With the chemical inlet and the waste outlet open, PROBLEMS reads "BATCH TREATER 1: input not connected" and "output not connected". Wiring the waste to a Discard bin clears the second one. Limits are 40–300 kg and 10–90 s: 600, 20 and −1 kg are refused, and so are 180, 5 and −1 s. It cycles correctly, but while it fills from the drum feeder the drum is drawn empty with the chute lit ([S3-4](findings-img/S3-4.png)). The popup sliders work (see extras), but the popup has no readouts. All four ports connect. At 680 s: in = 12 t/h × 680 s = 2.267 t. Out = 7 batches × 160 kg = 1.120 t, plus 1.12 t in the bin and 0.028 t in the treater (17 % of 160 kg), for 2.268 t. |
| Metal remover (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom". With the waste port open, PROBLEMS reads "METAL REMOVER 1: output not connected", and wiring the waste to a Discard bin clears it. It has no adjustable settings, since a pass-through has no rate to limit. 12 t/h passes through. The magnet symbol doesn't move (by design), and the connectors animate. At 249 s, 0.6057 t went in and 0.6057 t came through, with nothing to waste. The popup has only EVENT LOG and PLOT RATE, the same as the golden METAL REMOVER. |
| Scalping screen (Custom) | PASS | PASS | PASS | **FAIL** #128 | QUESTION | PASS | PASS | PASS | "Custom". Rated capacity is 0.5–200 t/h: 400, 0.25 and −1 are refused, and 200 and 0.5 are accepted. The scalpings split keeps the real 0–20 %, and 40 and −1 are refused (see questions). The mesh lights gold while grain flows. The popup has a split slider that works, but no readouts. At 652 s: in 1.9352 t = product 1.6968 t + scalpings 0.2384 t. |
| Batch treater (Custom) | PASS | PASS | **FAIL** #130 | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom". Limits are 1–5000 kg and 1–600 s: 10000, 0.5 and −1 kg are refused, and so are 1200, 0.5 and −1 s; 5000 kg, 1 kg, 600 s and 1 s are accepted. Set to 20 kg / 5 s (below the real minimums), it cycles every 11.1 s: a 6 s fill plus 5 s. At 66 % it is drawn empty with the chute lit ([S3-7](findings-img/S3-7.png)). The in, out and waste ports connect, and the chemical inlet is the same port as on the real item. At 213 s: in = 12 t/h × 213 s = 0.710 t. Out = 19 batches × 20 kg = 0.380 t, plus 0.32 t in the bin and 0.013 t in the treater (66 % of 20 kg), for 0.713 t. |
| Auto sampler (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom", with a small label. It has no adjustable settings. 12 t/h passes through: at 215 s, 0.4917 t went in and 0.4917 t came through. The symbol doesn't move and takes no sample, because the item is a pass-through. The popup has only EVENT LOG and PLOT RATE, as on the golden AUTO SAMPLERs. |

On check 1: as in S1 and S2, the maker shows in the catalogue and the right panel, not on the canvas.

**Treating extras**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| T1 | Scalping screen: product goes out its product port and scalpings out its waste port, in the set ratio | The split matches the setting | At 10 %: product 10.80 t/h and scalpings 1.20 t/h, out of 12.00. With the popup slider at 20 %, it settles toward 9.61 / 2.39 t/h ([S3-2](findings-img/S3-2.png)) | PASS |
| T2 | Scalping screen with the waste port left open | PROBLEMS says so, or the waste is visibly lost | PROBLEMS: "SCALPING SCREEN 1: output not connected". The line still runs and the 10 % disappears with no sign: 10.90 of 12.09 t/h reaches the product side, and nothing shows where the rest went ([S3-1](findings-img/S3-1.png)). PROBLEMS does say so, which meets the pass rule | PASS |
| T3 | Metal remover: the waste port exists and connects, and product passes through | As stated | The waste port is there (red dot, right side). It wires to a Discard bin, PROBLEMS clears, and 12 t/h passes through | PASS |
| T4 | Batch treater fills a batch, mixes, discharges, and repeats | The cycle repeats | Through the drum feeder it fills 0 → 100 % in 47.9 s, holds for 48 s, discharges in one step, and repeats every 95.9 s (7 discharges by 680 s). The drum staves turn throughout ([S3-3](findings-img/S3-3.png)). The drawing during the fill is wrong (#130, counted above) | PASS |
| T5 | Batch size and cycle time change the cycle | The period changes | Popup cycle time 48 → 10 s: the period goes from 95.9 to 58.0 s. Popup batch size 160 → 40 kg: 21.9 s ([S3-5](findings-img/S3-5.png)). Right panel set to 300 kg / 90 s: 180.4 s (a 90 s fill plus 90 s) | PASS |
| T6 | Fed from a Bin through a Drum feeder, the treater can be starved and filled | It waits when starved | With Grain in set to 0, the bin drains from 0.60 t to 0 in 300 kg batches. The treater then holds a 1.4 % part batch and waits; the level stayed the same for 160 sim-seconds ([S3-6](findings-img/S3-6.png)). While the treater is full and holding, the drum feeder stops and the bin fills. At 12 t/h in, the bin reaches 95 % at 680 s and then throttles Grain in with no message (#125) | PASS |
| T7 | Batch treater chemical inlet | – | No catalogue item can feed it, so PROBLEMS never clears on a line with a treater; the golden line shows the same two problems. A second Grain in wired to the chemical inlet is accepted and PROBLEMS clears ("This line has no problems"). That grain goes into the batch as if the port were the grain inlet: both Grain ins feed 4.07 t/h | QUESTION |
| T8 | Batch treater throughput through a drum feeder | – | The cycle is the fill time plus the cycle time, because the feeder fills the treater at about 12 t/h. So a 160 kg / 48 s treater passes about 6.0 t/h, not its 12 t/h rating, and the bin in front of it backs up. On the golden line the pre-bin charges the treater in one tick, so the 48 s is the whole cycle | QUESTION |

Screenshots: [S3-1 screen with the waste open](findings-img/S3-1.png) · [S3-2 screen split at 20 %](findings-img/S3-2.png) · [S3-3 treater fed by two Grain ins, one on the chemical inlet](findings-img/S3-3.png) · [S3-4 real treater drawn empty while filling](findings-img/S3-4.png) · [S3-5 40 kg / 10 s cycles](findings-img/S3-5.png) · [S3-6 treater starved](findings-img/S3-6.png) · [S3-7 custom treater drawn empty at 66 %](findings-img/S3-7.png). Line file: [S3.json](findings-lines/S3.json) (Grain in → Bin → Drum feeder → Batch treater → Auto sampler → Grain out, set to 300 kg / 90 s).

**Bugs filed / commented**
- #128 Belt, chain, grain break, diverter and outlet valve popups show no values while running (existing, commented: adds the metal remover, auto sampler, scalping screen and both batch treaters)
- #130 Batch treater fed by a drum feeder draws an empty drum with its chute discharging while it fills (new)

**Questions for the user**
- The custom **Scalping screen** keeps the real 0–20 % limit on its scalpings split, because the custom rule keeps a percentage's real limits. The ticket expected "% stays 0–100". Should the custom screen's split reach 0–100 %, or is 0–20 % right?
- No catalogue item can feed the **batch treater's chemical inlet**, so any line with a treater always shows "BATCH TREATER: input not connected" (the golden line does too). A Grain in wired to that inlet is accepted, clears PROBLEMS, and feeds grain into the batch. Should an open chemical inlet stop counting as a problem? And should a grain source be refused on it?
- Fed through a **drum feeder**, the batch treater's cycle is its fill time plus its cycle time, so the Niklas passes about 6 t/h instead of 12 t/h. On the golden line the pre-bin charges it in one tick. Is the longer cycle right for a treater fed by a feeder, or should the cycle time include the fill?

**Observations**
- PROBLEMS says "input not connected" or "output not connected" without naming the port. For the scalping screen, metal remover and treater it doesn't say that it means the waste port or the chemical inlet (S2 found the same for the pendulum's second inlet).
- The metal remover never sends anything to its waste port. It's a pass-through, so wiring the waste to a Discard bin changes nothing.
- The auto sampler doesn't take a sample either; it's also a pass-through.
- Nothing goes in the event log when a treater is full or starved, or when the bin behind it backs up (#125).
- The batch treater's waste outlet connector is drawn red, like the screen's waste connector.
- On a new line the treater's canvas name is "BATCH TREATER 1". On the golden line it is "NIKLAS WNS/200 BATCH TREATER", because there the maker is part of the name.
- When the view zooms out to fit a tall line, the port dots shrink to about 4 px, so a drag has to land precisely to wire.

**Follow-up combo ideas**
- Treater pre-bin → batch treater in Build mode, to compare a one-tick charge with the drum-feeder fill (pairs with #123 and T8).
- A scalping screen whose waste goes to a Discard bin that fills, to see whether the screen throttles (pairs with #124).
- Two batch treaters in series (B4), now that a single one is known to cycle correctly.

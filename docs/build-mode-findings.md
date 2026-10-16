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
| S3 Cleaning & treating smoke | #99 | | | | | | |
| S4 Packaging smoke | #100 | | | | | | |
| G1 Golden: treating section | #101 | | | | | | |
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

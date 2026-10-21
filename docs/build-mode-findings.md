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
| S4 Packaging smoke | #100 | 2026-10-16 | 6e8dedb | 67 | 10 | 3 | #128 #132 |
| G1 Golden: treating section | #101 | 2026-10-16 | 6e8dedb | 48 | 5 | 7 | #131 |
| G2 Golden: outload | #102 | 2026-10-16 | 7b0bcd6 | 45 | 6 | 4 | #131 #133 #134 |
| G3 Golden: packaging | #103 | 2026-10-19 | 6029015 | 47 | 5 | 5 | #131 #134 |
| G4 Golden: interlocks & rules | #104 | 2026-10-19 | 602a423 | 10 | 9 | 0 | #138 #139 |
| G5 Golden: side-by-side run | #105 | 2026-10-19 | 43f61c7 | 21 | 5 | 1 | #138 #139 #140 #141 #142 |
| C1 Level conditions × actions | #106 | 2026-10-19 | 6029015 | 36 | 1 | 1 | #137 |
| C2 Running/stopped & cascades | #107 | 2026-10-19 | 6029015 | 8 | 2 | 2 | #135 #136 |
| C3 Delays, alarm-only, sliders | #108 | 2026-10-19 | 158c589 | 15 | 2 | 0 | #143 #137 |
| C4 Suggested interlocks | #109 | 2026-10-20 | 346a1a0 | 13 | 4 | 0 | #145 #136 |
| C5 Interlock lifecycle | #110 | 2026-10-20 | ce5b7bf | 6 | 2 | 0 | #146 |
| C6 Machine rules & feed rate links | #111 | 2026-10-21 | f861ecd | 7 | 3 | 1 | #139 #143 |
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
| Bagging scale, filling head, filling and sewing, palletiser and roller conveyors popups have no live readouts (the batch machines show only their two sliders). Same on the golden line | #128 | S4 | No |
| A bagging scale or filling head whose bag is bigger than its feed bin (e.g. a 1500 kg bag behind the default 1.17 t custom Bin) deadlocks the line with no message. Enlarge the Bin or keep the bag under its capacity | #132 | S4 | No |
| No real catalogue item for the golden inlet drum feeders, grain break or diverter either; only the custom ones are listed | #131 | G2 | No |
| Two feeds into one machine (both inlet drum feeders into the pendulum) lose whatever is above its capacity, with no event. Keep the feeders' total under the rating, e.g. one gate at 50 % | #133 | G2 | No |
| A built line gets no SOURCE selector and no combined DESTINATION, only one plain selector per diverter/pendulum, set separately | #134 | G2 | No |
| No real catalogue item for the golden auto sampler, vibrating conveyor or roller conveyors and belt scale either. The custom vibrating conveyor reaches 0–200 t/h (golden 0–20) | #131 | G3 | No |
| The pendulum selector names each outlet after its first machine, so on the golden packaging line both the big bag and Concetti outlets read "AUTO SAMPLER" (the first is big bag) | #134 | G3 | No |
| No machine popup has a stop or start control (conveyor, elevator, drum feeder), so one machine can't be stopped by hand. Stop it through an interlock instead, e.g. "When BIN is above 50 % for 0 s, stop K2", and drag that interlock's set point slider in the bin's popup below the bin's level (back to 100 % releases it) | #135 | C2 | No |
| Only the bin high-level rule is ever suggested. No conveyor-running interlock ("when K1 is stopped, stop F1") is offered; write them by hand | #136 | C2 | No |
| A custom Bin's popup set point sliders keep the Treater pre-bin's limits (LSH 35–90 %, LSL 0–55 %) and its "LSL recover" label, while the Interlocks window accepts 0–100 %. A set point outside them shows with the thumb pinned at the end, and touching it moves the trip point. Keep custom-Bin set points inside those ranges | #137 | C1 | No |
| The Interlocks window has no "armed while" blank: 5 of golden's 9 interlocks (the metal bins, Flexicon trip, both Concetti LSHH ones) only fire while the line is routed to that destination, and that condition can't be rebuilt or even seen in the UI | #138 | G4 | No |
| No Build mode UI creates machine rules (graded feed schedules, hold-next-batch) or feed rate derivations; the three golden machine rules and three feed rate links can only be approximated with plain interlocks at the wrong set points | #139 | G4 | No |
| A rebuilt line's own SAVE output can fail its own OPEN validation: building an interlock on a bin's level switch (e.g. flexiconPreBinHighTrip) auto-writes a duplicate `sim.levelSwitches` entry that OPEN then rejects as a name clash with the interlock itself | #140 | G5 | No |
| On a rebuilt line, selecting PENDULUM CONVEYOR → GRAIN BREAK (the metal-bin branch) never passes any grain through to OUTLOAD BUFFER BIN / either metal bin, even after 10+ sim-minutes; the Flexicon and Concetti branches on the same line flow normally | #141 | G5 | No |
| No Build mode UI creates or names a zone, so a rebuilt line never gets the golden line's TREATING/PACKAGING & OUTLOAD/BAGGING fit-view shortcut buttons (cosmetic only, no behavioural effect) | #142 | G5 | No |
| Dragging a bin's set point slider in SIM mode has no lasting effect: switch back to BUILD and the Interlocks sentence/set-point field still show the old value. The other direction (edit in BUILD, then open SIM) works fine | #143 | C3 | No |
| A bin fed by a Diverter or Scalping screen gets no suggested high-level interlock at all (those items' behaviours have no `stop` verb for the suggestion engine's `holdAction()` to find); a Pendulum conveyor's bins are unaffected since its behaviour does define `stop` | #145 | C4 | No |
| A broken interlock (its watched machine deleted) or an incomplete one (left blank) is correctly flagged in PROBLEMS, but RUN never blocks on it and it's skipped with no message anywhere — UI, event log or console | #146 | C5 | No |
| A deleted machine's id goes to the next machine of that kind added or pasted, so an interlock orphaned by the delete silently re-attaches to the newcomer. After deleting a watched machine, delete or re-point its interlock before adding another of the same kind | #147 | C5 | No |

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

## S4 Packaging smoke

### S4 — 2026-10-16 — 6e8dedb

**Result:** 67 PASS · 10 FAIL · 3 QUESTION · blocked by: none (#126 hides the last hop into Grain out, as in S1 and S2)
**Tool:** Standalone Playwright scripts (Node, headless Chromium 1243) driving the app through real mouse and keyboard events, because another session held the shared Playwright MCP browser. Dev server on port 5182. Viewport 1600 × 1000.

**Steps**
1. Cleared localStorage, reloaded, BUILD. Each item got its own NEW LINE (DISCARD AND START NEW).
2. Batch machines (bagging scale, filling head): Grain in → Bin (Custom) → item → Grain out, as the ticket asks. Pass-through machines (filling and sewing, palletiser, roller conveyors): Grain in → item → Grain out. Items came from the catalogue by HTML5 drag (search box, then drag onto the canvas). Wiring was by dragging from port dot to port dot. Then I read PROBLEMS.
3. Right panel: for each number field I typed 2× the max, below the min, −1 (or 0), then the max, the min and the default, pressing Enter each time. Escape, reselect, read the value back.
4. SIM → FIT ALL → wheel out → 5× → RUN. Plotted the rates (Grain in, Bin, item, Grain out) and the levels (Bin, item) from each popup. Read the chart polylines (read-only) to get batch periods (the Bin's level sawtooth), end values and integrated tonnes.
5. Batch controls: dragged the popup sliders with the keyboard (focus, arrow keys). Bagging scale 50 → 100 kg, then fill time 15 → 60 s. Custom bagging scale 50 → 200 kg. Filling head 1000 → 1500 kg.
6. SETTINGS → DISCARD AND START OVER, then SIM → destination CONCETTI → 20× to 1521 s. Read the golden BAGGING SCALE, FILLING & SEWING, FLEXICON FILLING HEAD and PALLETISING popups and the bag counters.
7. Collected console messages all session: no errors or warnings, only Vite debug lines and the React DevTools notice.

**Checks.** Check numbers follow the ticket: 1 lands/name/maker · 2 wiring/problems · 3 flows and animates · 4 popup controls and readouts · 5 right-panel limits · 6 ports · 7 conservation · 8 console.

| Item | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Evidence |
|------|---|---|---|---|---|---|---|---|----------|
| Bagging scale (Concetti) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Concetti" in the right panel. Bag size 10–100 kg, fill time 5–60 s. Typing 200, 5, −1 / 120, 2, 0 is refused, and the max, min and default are accepted. A 50 kg batch every 15.0 s (Bin peaks 4.15 % ≈ 49 kg, gaps 15.0 ± 0.4 s), Grain in 12.00 t/h = scale out 11.98 t/h at 456 s ([S4-1](findings-img/S4-1.png)). The popup has working sliders but no live value (see extras). |
| Bagging scale (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom". 1–5000 kg and 1–600 s. Typing 10000, 0.5, −1, 0 / 1200, 0.5, 0 is refused, and 5000, 1 / 600, 1 are accepted. In 0.772 t over 303 s = Bin out 0.747 + Bin 0.011; scale in 0.747 = scale out 0.697 + 0.050 held. |
| Big bag filling head (Flexicon) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Flexicon". 500–1500 kg and 15–120 s. Typing 3000, 250, −1 / 240, 7, 0 is refused. At 1000 kg the Bin collects to 85.2 % (1000 kg) and dumps into the head every 299.5 s ([S4-3](findings-img/S4-3.png)). The Bin side balances: in 2.095 t = out 1.790 + Bin 0.335 t at 700 s. At 1500 kg the line deadlocks (extra X5, #132). |
| Big bag filling head (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom". 1–5000 kg and 1–600 s, out-of-range refused. Same 300 s cycle at 1000 kg (Bin peaks 85.18 / 85.08 %). By 653 s: 12 t/h × 653 s = 2.18 t in = 2 full bags + 0.176 t in the Bin. The plotted head rate lags its pulses, so the cycle count is the better reading. |
| Filling and sewing (Concetti) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Concetti". "This machine has no adjustable settings" (the real one has none either). One in, one out. In 0.4392 t = out 0.4392 t at 203 s. The popup has only EVENT LOG and PLOT RATE ([S4-4](findings-img/S4-4.png)). |
| Filling and sewing (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom", no adjustable settings. In 0.4365 = out 0.4365 t at 202 s. Popup as above. |
| Palletiser (Concetti) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Concetti", no adjustable settings. In 0.4365 = out 0.4365 t at 202 s. Popup: EVENT LOG and PLOT RATE only. |
| Palletiser (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom", no adjustable settings. In 0.4362 = out 0.4362 t at 202 s. |
| Roller conveyors and belt scale (real) | – | – | – | – | – | – | – | – | Not listed: no maker and no sensors, so only the custom item is shown (#94, same rule as S1 and S2). Not counted. |
| Roller conveyors (Custom) | PASS | PASS | PASS | **FAIL** #128 | PASS | PASS | PASS | PASS | "Custom", no adjustable settings. The in port is at the top centre and the out port on the right end of the roller row. Plotted at 202 s, it reached 9.7 t/h by 306 s and was still rising alongside Grain in's lagged curve. Only a roller circle or the base line selects it ([S4-5](findings-img/S4-5.png)). |

On check 1: as in S1 to S3, the maker shows in the catalogue and the right panel, not on the canvas. On check 3: grain reaches Grain out on every line and the connectors dash. No packaging symbol changes while it works. #64 leaves the pass-through ones (filler, palletiser, roller scale) static on purpose, so they pass. The bagging scale and filling head are the open question below. On check 5: the pass-through items have no settings, real or custom, so there is no limit to check (see questions). On check 7: Grain out still plots 0 (#126), so the last hop is read from the item's own plotted rate.

**Packaging extras**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| X1 | Bagging scale weighs a batch, discharges it and repeats | Repeating batches of the bag size | The Bin's level saws up to 4.15 % (≈ 49 kg of its 1.17 t) and drops every 15.0 s, with the scale holding 100 % of its charge in between | PASS |
| X2 | Changing the bag size changes the batch | Batch follows the slider | Real 50 → 100 kg: Bin peaks 8.49 % (≈ 100 kg), period 30 s. Custom 50 → 200 kg: peaks 16.9 % (≈ 198 kg), period 60 s ([S4-7](findings-img/S4-7.png)) | PASS |
| X3 | Fill time slider changes the cycle | Longer fill, slower line | 15 → 60 s at 100 kg: period 60 s, so the line takes 6 t/h and the Bin fills 8 → 42 % in 240 s | PASS |
| X4 | Filling head weighs a batch, discharges it and repeats | Repeating 1000 kg batches | Real and custom: 1000 kg every 300 s (Bin peaks 85.2 %) | PASS |
| X5 | Filling head bag size at its real max (1500 kg) | Fills 1500 kg bags, or explains why it can't | The custom Bin holds about 1.17 t, so it fills to 100 % (red) and the head stays at 0 %. Grain in falls to 0 t/h and nothing is logged or listed in PROBLEMS: the line has deadlocked ([S4-2](findings-img/S4-2.png)) | **FAIL** #132 |
| X6 | Each popup shows bags or batches completed | A count, or a QUESTION | No packaging popup counts anything, real or custom, Build mode or golden. Only the golden line's end stubs count ("76 bags · bagged product · pallets out" at 1521 s, [S4-6](findings-img/S4-6.png)). A Build-mode Grain out shows no count | QUESTION |
| X7 | Bagging scale and filling head show they're working | Lit or moving while weighing | Their symbols never change (the scale's SVG is identical across 40 sim-seconds of cycling). The golden ones are static too | QUESTION |
| X8 | Pass-through packaging machines have a capacity to reach | A real limit, and a custom one that reaches the wide limits | Filling and sewing, palletiser and roller conveyors have no settings and no capacity, real or custom. 12 t/h passes with nothing to tune | QUESTION |

Screenshots: [S4-1 bagging scale cycling, Bin sawtooth](findings-img/S4-1.png) · [S4-2 filling head at 1500 kg, deadlocked](findings-img/S4-2.png) · [S4-3 filling head at 1000 kg, 300 s cycle](findings-img/S4-3.png) · [S4-4 filling and sewing popup, no values](findings-img/S4-4.png) · [S4-5 roller conveyors wired](findings-img/S4-5.png) · [S4-6 golden packaging, 76 bags](findings-img/S4-6.png) · [S4-7 custom bagging scale at 200 kg](findings-img/S4-7.png). Saved line: [S4.json](findings-lines/S4.json) (Grain in → Bin → Bagging scale (Concetti) → Grain out).

**Bugs filed / commented**
- #132 A batch machine whose bag is bigger than its feed bin deadlocks the line with no message (new)
- #128 Belt, chain, grain break, diverter and outlet valve popups show no values while running (existing, commented: all five packaging kinds, real and custom, same on golden)

**Questions for the user**
- Nothing counts bags or batches in Build mode. The bagging scale and filling head popups have no count, and a Grain out after them shows none, while the golden line's end stubs do ("76 bags"). Should a batch machine's popup show bags completed, or should a Grain out fed by a batch machine count bags the way the golden stubs do?
- The bagging scale and filling head symbols stay the same while they fill, hold and discharge. The batch treater lights and turns its paddles from its phase (#66), and #64 leaves only the pass-through packaging machines static. Should the scale and the filling head light up (or show their fill) while they're working?
- Filling and sewing, palletiser and roller conveyors have no settings and no capacity, real or custom, so they pass any rate (the custom roller conveyors have no length or speed either). Is that what you want, or should they get a rate limit (t/h or bags/h), at least on the custom versions?

**Observations**
- An out-of-range value reverts silently on Enter, as S1 noted. Nothing says why.
- The bagging scale's level plot sits at 100 % throughout, because it charges in the same tick it discharges. The chart only shows the cycle through the feed Bin's sawtooth.
- The batch machines' plotted rate is a lagging filter of their pulses, so the integrated tonnes trail by up to one batch. The 1000 kg filling head trails by most of a bag for about 100 s after each dump.
- The roller conveyors' out port sits on the right end of the roller row. With Grain out placed below, the connector leaves sideways and runs down across the "ROLLER CONVEYORS 1" label ([S4-5](findings-img/S4-5.png)).
- The roller conveyors' and filling head's bodies are mostly hollow: a click on the label side or between the rollers doesn't select them.
- The batch line's throughput is capped by bag size ÷ fill time with no warning. The Concetti scale's defaults (50 kg / 15 s) give exactly 12 t/h, the Grain in default, so any faster feed fills the Bin.
- The golden packaging popups match the Build-mode ones exactly, so nothing here is specific to Build mode, apart from #132, which can't happen with the golden Flexicon pre-bin (2.5 m³).

**Follow-up combo ideas**
- Bagging scale → filling and sewing → palletiser → Grain out in series behind a Concetti pre-bin, as on the golden line (pairs with G3 and B4).
- A filling head at 1500 kg behind a Bin enlarged to 3 m³, to confirm #132 is only the bin size.
- Grain in at 20 t/h into the Concetti bagging scale (capped at 12 t/h), to watch the Bin fill and see whether #125 also applies here.

## G2 Golden: outload

### G2 — 2026-10-16 — 7b0bcd6

**Result:** 45 PASS · 6 FAIL · 4 QUESTION · blocked by: #131 (four machines built from their custom items)
**Tool:** Standalone Playwright scripts (Node, headless Chromium), not the Playwright MCP or Claude in Chrome, because another session held the shared browser. A small driver kept one page open and took commands. Every change was made with real mouse and keyboard input: HTML5 drags from the catalogue, port-to-port drags, typing in the right panel, popup slider drags, and the plant-control and toolbar buttons. Scripts only read state (DOM text, port positions, chart polylines, the SAVE download). Dev server on port 5184.

**Steps**
1. Fresh browser, so localStorage was already empty. On the golden line, read the outload machines' right panels in BUILD and their popups in SIM.
2. BUILD → OPEN `docs/findings-lines/G1.json`. All 14 machines and 13 connections loaded, with PROBLEMS (2).
3. Dragged in 10 items at the golden positions, shifted 90 units up as in G1: Pendulum conveyor (Simatek E200), Pro box unloading station, Outload buffer bin, Metal bin ×2 and Grain out ×2. Four more came from custom items, because no real one is listed (#131): Drum feeder ×2, Grain break and Diverter. Deleted G1's temporary GRAIN OUT 2. A drop is centred on the cursor and snaps to a 10-unit grid. The pendulum (2030 × 780) has to be dropped with the whole of it in view, or it lands clamped to the view's edge.
4. Wired 11 connections by dragging port dots (listed under check 1). The pendulum's outBinSeg and outConcetti were left open for G3.
5. In the right panel, typed the golden name, tag and every value into each machine, pressing Enter after each. Then deselected, reselected and read every field back.
6. SIM. Plotted the hopper, the Pro box, both feeders, the pendulum, the grain break, the diverter, the buffer bin (level and rate) and both metal bins (level and rate). 20× → RUN. Set PENDULUM CONVEYOR to GRAIN BREAK and DIVERTER to METAL BIN 1, then switched the diverter to METAL BIN 2. Dragged feeder 1's gate to 50 %, then feeder 2's. Last, sent the pendulum to the open outConcetti.
7. BUILD → SAVE, saved the download as `docs/findings-lines/G2.json`, then opened it again through OPEN.
8. SETTINGS → START OVER for a golden baseline: SOURCE = PRO BOX, DESTINATION = METAL BIN 1, 400 s at 20× ([G2-8](findings-img/G2-8.png)).
9. Read console messages after each stage. There were no errors or warnings all session.

**Checks.** Check numbers follow the ticket: 1 pendulum ports · 2 plant controls · 3 destination routing · 4 feeders meter by gate % · 5 popups and values match golden (as G1 checks 3 and 6) · 6 SAVE · 7 console. Check 5 is two columns in the machine table, the right panel and the popup. The other two columns, the catalogue item and the wiring, are as in G1.

| Machine (tag) | Item used | Real item | Wired | Right panel (5) | Popup (5) | Evidence |
|---------------|-----------|-----------|-------|-----------------|-----------|----------|
| PRO BOX UNLOADING STATION (52.608.H00) | pro-box-station | PASS | PASS | PASS | PASS | Source rate 12 t/h (0–20), as golden. Popup: source rate slider and PLOT RATE, as golden. |
| INLET DRUM FEEDER 1 (52.603.L01) | custom-drum-feeder | **FAIL** #131 | PASS | PASS | PASS | No real drum feeder listed. No adjustable settings, the same as golden. The popup has the gate slider, as golden. It reads 100 % here; golden reads 64 %, set by its feed rate derivation (G4). |
| INLET DRUM FEEDER 2 (52.603.L00) | custom-drum-feeder | **FAIL** #131 | PASS | PASS | PASS | As feeder 1. Its inlet is on top (custom item); golden's is on the left side, so the hopper run bends. |
| PENDULUM CONVEYOR (52.604.E00) | pendulum-conveyor | PASS | PASS | PASS | PASS | Simatek E200. 20.84 t/h (5–40), 10.08 m/min (2–30), 31.087 m (15–60), all as golden. Popup speed slider: 100 % here, 94 % on golden (derivation). |
| GRAIN BREAK (TBC-20) | custom-grain-break | **FAIL** #131 | PASS | PASS | PASS | No real grain break listed (S2 noted it too). No settings, the same as golden. Popup empty on both (#128). |
| OUTLOAD BUFFER BIN (52.610.H00) | outload-buffer-bin | PASS | PASS | PASS | PASS | Capacity 4.51 m³ (1–15). Popup: fill level slider, PLOT LEVEL and PLOT RATE, as golden. |
| DIVERTER (52.612.V00) | custom-diverter | **FAIL** #131 | PASS | PASS | PASS | No real diverter listed. No settings, the same as golden. Popup empty on both (#128). |
| TREATED OUTLOAD METAL BIN 1 (52.613.H00) | metal-bin | PASS | PASS | PASS | QUESTION | Capacity 6 m³ (1.5–18). The popup lacks golden's "LSH set point 85 %" slider, as with G1's bins (see questions). |
| TREATED OUTLOAD METAL BIN 2 (52.613.H01) | metal-bin | PASS | PASS | PASS | QUESTION | As bin 1. |
| GRAIN OUT 3 (for metal bin 1's discharge stub) | grain-out | PASS | PASS | – | – | Dragged into place after dropping. |
| GRAIN OUT 4 (for metal bin 2's discharge stub) | grain-out | PASS | PASS | – | – | |

On check 5: every name and tag took on Enter and read back after deselecting. All the golden values equal the item defaults, so they were retyped and read back rather than changed from something else.

**Line checks**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1a | Pendulum in1 | INLET DRUM FEEDER 1 | Saved file: `INLET DRUM FEEDER 1.out → PENDULUM CONVEYOR.in1`, fed by `PRO BOX UNLOADING STATION.out → INLET DRUM FEEDER 1.in` | PASS |
| 1b | Pendulum in2 | INLET DRUM FEEDER 2 | `INLET DRUM FEEDER 2.out → PENDULUM CONVEYOR.in2`, fed by `SCALPING SCREEN DISCHARGE HOPPER.out → INLET DRUM FEEDER 2.in`, which replaces G1's temporary Grain out | PASS |
| 1c | Pendulum outBuffer | GRAIN BREAK, then the bin, the diverter and the metal bins | `outBuffer → GRAIN BREAK → OUTLOAD BUFFER BIN → DIVERTER`, then `out1 → METAL BIN 1 → GRAIN OUT 3` and `out2 → METAL BIN 2 → GRAIN OUT 4` ([G2-1](findings-img/G2-1.png)) | PASS |
| 1d | outBinSeg and outConcetti left open | Open, and the problems list noted | PROBLEMS (4): the batch treater's two (as G1) and "PENDULUM CONVEYOR: output not connected" twice. The messages don't name the port ([G2-3](findings-img/G2-3.png)) | PASS |
| 2 | Plant control panel | SOURCE (TREATING LINE / PRO BOX) and DESTINATION (CONCETTI / FLEXICON / METAL BIN 1 / METAL BIN 2), as on golden | Only plain selectors, set separately: PENDULUM CONVEYOR (GRAIN BREAK / outBinSeg / outConcetti, showing raw port ids) and DIVERTER (METAL BIN 1 / METAL BIN 2). Missing: the SOURCE selector, a combined DESTINATION, and EMPTY BIN for the metal bins. There are EMPTY buttons for GRAIN OUT 1, 3 and 4 instead ([G2-2](findings-img/G2-2.png)) | **FAIL** #134 |
| 3a | Destination metal bin 1 | Grain only to metal bin 1 | By 723 s, metal bin 1 at 20.74 t/h and metal bin 2 at 0.00. The flapper line points left (x2 4) | PASS |
| 3b | Switch to metal bin 2 | Reroutes, flapper follows | Within 30 s, metal bin 2 is at 20.47 t/h and metal bin 1 falls to 0. The flapper flipped to x2 28. The routing changes at once, but while paused the flapper only redraws on the next step (as S2 saw). By 920 s: diverter 4.394 t = bin 1 3.693 + bin 2 0.701 ([G2-4](findings-img/G2-4.png)) | PASS |
| 4a | Feeder 1 meters by gate % | Flow ∝ gate | Gate 100 %: 12.00 t/h. Gate 50 % (OVERRIDE): 6.00 t/h, and the Pro box follows at 6.00 ([G2-5](findings-img/G2-5.png)) | PASS |
| 4b | Feeder 2 meters by gate % | Flow ∝ gate | Gate 100 %: 11.87 t/h. Gate 50 %: 6.01 t/h, and the discharge hopper backs up to 100 % (0.14 t) with no event (#125's theme) ([G2-6](findings-img/G2-6.png)) | PASS |
| 4c | Pendulum carries the feeders' flow to the selected outlet | The feeders' sum, at the selected outlet | 6.00 + 11.88: pendulum 17.86. 6.00 + 6.01: pendulum 12.03, all of it to metal bin 2 | PASS |
| – | Conservation, both feeders at 100 % | Totals balance | With no SOURCE selector both feeders run: 12.00 + 11.87 = 23.9 t/h into a 20.84 t/h pendulum. The pendulum carries 20.74, and the other 3.1 t/h is lost with no event. Feeders minus pendulum: 0.104 t at 200 s, 0.565 t at 700 s, 0.975 t at 1175 s. Once feeder 1 is at 50 %, the gap holds at 1.018 t. From the pendulum on, everything balances: by 1740 s pendulum = grain break = buffer bin = diverter = 8.504 t = metal bin 1 3.697 + metal bin 2 4.807 t. Read by integrating the chart polylines (read-only) | **FAIL** #133 |
| – | Pendulum sent to the open outConcetti | Runs and conserves grain, or the problems list explains why not | The pendulum keeps taking 12 t/h and, once grain reaches the end, discharges into nothing (10.4 t/h at 2041 s). The grain break drops to 0. No event in SIM. BUILD's problems list says "output not connected" ([G2-7](findings-img/G2-7.png), see questions) | QUESTION |
| – | Metal bins hold grain | As golden | On golden a metal bin fills: bin 1 at 29 % (1.25 t) after 400 s from the Pro box ([G2-8](findings-img/G2-8.png)). Its outlet goes to a TBC stub that takes nothing. Here, as the ticket says, each bin's outlet goes to a Grain out, so the bins pass the grain straight through and stay at 0 % (see questions) | QUESTION |
| 6 | SAVE, then commit as G2.json | A valid line file | Downloaded as `g1.json` (35 KB, `grain-sim-line` v3): 24 machines, 23 connections, no interlocks or rules. Committed as [`docs/findings-lines/G2.json`](findings-lines/G2.json). Opening it again through OPEN loads all 24 machines and 23 connections with PROBLEMS (4). The app names the line "G2" after the file; inside the file the name is still "G1" | PASS |
| 7 | Console | No errors | No errors or warnings all session | PASS |

Screenshots: [G2-1 rebuilt line in BUILD](findings-img/G2-1.png) · [G2-2 plant controls on the rebuilt line](findings-img/G2-2.png) · [G2-3 problems list](findings-img/G2-3.png) · [G2-4 diverter switched to metal bin 2](findings-img/G2-4.png) · [G2-5 feeder 1 at 50 %, chart](findings-img/G2-5.png) · [G2-6 feeder 2 at 50 %](findings-img/G2-6.png) · [G2-7 pendulum sent to the open outConcetti](findings-img/G2-7.png) · [G2-8 golden baseline, metal bin 1 filling](findings-img/G2-8.png)

**Bugs filed / commented**
- #133 Two feeds into one machine lose the grain above its capacity, with no event (new)
- #134 A built line's plant controls don't offer the golden SOURCE and DESTINATION choices (new)
- #131 Five golden treating machines have no real catalogue item (existing, commented: the inlet drum feeders, grain break and diverter have none either)

**Questions for the user**
- The metal bins' popups lack golden's "LSH set point 85 %" slider. This is G1's question again: a fresh bin has no set points until an interlock uses one. Do these belong to G4 rather than counting as G2 failures?
- A pendulum can be sent to an outlet with nothing wired to it, and a fresh pendulum starts on outConcetti, its far outlet. The grain then leaves the line there, with no event in SIM. Only BUILD's problems list says "output not connected", and it doesn't name the port. Should the selector refuse an unwired outlet, or should the pendulum hold the grain, or is the problems entry enough?
- On golden the metal bins fill, because their outlets go to TBC stubs. Wired to a Grain out, as this ticket builds them, they pass the grain straight through and stay at 0 %, so their level, LT and LSH never move. The pre-bins in #123 do the opposite: wired to a Grain out, they only fill. Should a metal bin hold its grain until it's emptied, as on golden, or discharge into whatever it's wired to?

**Observations**
- FIT ALL in BUILD fits the line under the catalogue panel, so the left part of the line is hidden. G1 saw the same under the chart dock in SIM.
- A pan made without first clicking the canvas did nothing. Twice, a scripted Space+drag pan that started over a machine moved the machine instead: the pendulum went 1410 units up and feeder 1 720 units down. I dragged them back, and their connections followed. Not checked by hand.
- INLET DRUM FEEDER 1's label is drawn behind feeder 2's body, so only "EDER 1" shows. METAL BIN 2's label sits between the two bins; golden puts it on the right.
- The custom drum feeder's inlet is on top, so the hopper → feeder 2 run bends down into it. Golden's feeder 2 has a side inlet and a straight run.
- On golden, SOURCE = PRO BOX at gate 64 % still gives 12 t/h, because golden's derivation sets the feeder's rate. Here 100 % gives 12 t/h.
- UNDO was greyed out after BUILD → SIM → BUILD, so the build steps couldn't be undone after a run.

**Follow-up combo ideas**
- G3: wire outBinSeg and outConcetti, then re-check the destination choices once #134 is fixed.
- B2 (merge & fan-out): two Grain ins into one Conveyor rated below their sum, to check #133 on a plain line.
- Re-run G2 check 2 and the conservation check after #133 and #134 are fixed, switching SOURCE between the feeders.

## G3 Golden: packaging

### G3 — 2026-10-19 — 6029015

**Result:** 47 PASS · 5 FAIL · 5 QUESTION · blocked by: #131 (four machines built from their custom items)
**Tool:** Playwright CLI (`@playwright/cli`, in its own isolated session), not the Playwright MCP or Claude in Chrome, because two other test sessions ran at the same time. Every change was made with real mouse and keyboard input: HTML5 drags from the catalogue, port-to-port drags, typing in the right panel, popup sliders moved with the keyboard, and the plant-control and toolbar buttons. Scripts only read state (DOM text, chart polylines, the SAVE download). Dev server on port 5181. Viewport 1600 × 1000.

**Steps**
1. Fresh browser, so localStorage was already empty. BUILD → OPEN `docs/findings-lines/G2.json`. It loaded with 24 machines and PROBLEMS (4).
2. Dragged in 12 items at the golden positions, shifted 90 units up as in G1 and G2. Six were real items: Flexicon pre-bin, Big bag filling head (Flexicon), Concetti pre-bin, and the Concetti Bagging scale, Filling and sewing and Palletiser. Four were custom, because no real item is listed for them (#131): Auto sampler ×2, Vibrating conveyor and Roller conveyors. Two Grain outs stand in for the "filled big bags · out" and "bagged product · pallets out" stubs. A drop snaps to the 10-unit grid, so three machines sit 5 units off golden (see observations).
3. Wired the 12 connections by dragging port dots, from the pendulum's open `outBinSeg` and `outConcetti` down each branch.
4. In the right panel, typed the golden name, tag and every value into each machine, pressing Enter after each. Then deselected, reselected and read every field back.
5. SIM. There's no SOURCE selector (#134), so I stood in for golden's SOURCE = PRO BOX by setting INLET DRUM FEEDER 2's gate to 0 % in its popup. Plotted the Pro box, the pendulum and every packaging machine (levels and rates). Set the pendulum selector to the first AUTO SAMPLER (`outBinSeg`), then ran at 20× to about 2440 s. Then switched to the second AUTO SAMPLER (`outConcetti`) and ran to 3125 s.
6. BUILD → SAVE. Kept the download as `docs/findings-lines/G3.json`, then opened it again through OPEN.
7. SETTINGS → START OVER for a golden baseline. Read the golden packaging right panels in BUILD. Then in SIM set SOURCE = PRO BOX and DESTINATION = FLEXICON, ran to 1245 s, switched to CONCETTI and ran to 1700 s ([G3-5](findings-img/G3-5.png)).
8. Reopened G3.json and set feeder 2 to 0 % again. Sent the pendulum to the big bag branch, set the vibrating conveyor to 5 t/h in its popup, and ran to 1147 s.
9. Read console messages after each stage. There were no errors or warnings all session.

**Checks.** Check numbers follow the ticket: 1 connections and problems · 2 destination selector and routing · 3 batch cycles · 4 vibrating conveyor meters · 5 popups and values match golden · 6 SAVE · 7 console. Check 5 is two columns in the machine table, the right panel and the popup. The other two columns, the catalogue item and the wiring, are as in G1 and G2.

| Machine (tag) | Item used | Real item | Wired | Right panel (5) | Popup (5) | Evidence |
|---------------|-----------|-----------|-------|-----------------|-----------|----------|
| AUTO SAMPLER (52.609.X00) | custom-auto-sampler | **FAIL** #131 | PASS | PASS | PASS | No real auto sampler listed (no maker, no sensors). No adjustable settings, the same as golden. Popup: EVENT LOG and PLOT RATE, as golden. |
| FLEXICON PRE-BIN (52.701.H00) | flexicon-pre-bin | PASS | PASS | QUESTION | QUESTION | Capacity 2.5 m³ (0.6–8), as golden. Golden's panel also has LSH set point 85, LSL set point 35 and a 5 s signal delay. The popup has a "x / 1.80 t" readout, the fill level slider and an "LSL set point 35 %" slider. Golden's popup also has "LSH set point 85 %" (see questions). |
| VIBRATING CONVEYOR (52.702.C00) | custom-vibrating-conveyor | **FAIL** #131 | PASS | PASS | PASS | No real vibrating conveyor listed. Feed rate 10 t/h was accepted, but the custom limits are 0–200 t/h (golden 0–20), both in the panel and on the popup slider. Popup: feed rate slider and PLOT RATE, as golden. |
| FLEXICON FILLING HEAD (52.703.L00) | filling-head | PASS | PASS | PASS | PASS | Flexicon. Bag size 1000 kg (500–1500) and fill time 45 s (15–120), as golden. Popup: both sliders, PLOT LEVEL and PLOT RATE, as golden. |
| ROLLER CONVEYORS 1-4 + BELT SCALE (52.704.K00) | custom-roller-conveyors | **FAIL** #131 | PASS | PASS | PASS | No real item listed. No settings, the same as golden. Popup: EVENT LOG and PLOT RATE, as golden. |
| GRAIN OUT 2 (for "filled big bags · out") | grain-out | PASS | PASS | – | – | The app named it GRAIN OUT 2, reusing the number G2 freed. |
| AUTO SAMPLER (52.605.X00) | custom-auto-sampler | **FAIL** #131 | PASS | PASS | PASS | As the first sampler. |
| CONCETTI PRE-BIN (52.705.H00) | concetti-pre-bin | PASS | PASS | QUESTION | QUESTION | Capacity 0.72 m³ (0.2–2), as golden. Golden's panel also has LSL recover 35, LSH 85 and LSHH trip 95. Golden's popup has those three sliders; this one has only the "x / 0.52 t" readout and the fill level slider. |
| BAGGING SCALE (TBC-16) | bagging-scale | PASS | PASS | PASS | PASS | Concetti. Bag size 50 kg (10–100) and fill time 15 s (5–60), as golden. Popup as golden. |
| FILLING & SEWING (TBC-17) | filling-sewing | PASS | PASS | PASS | PASS | Concetti. No settings, as golden. Popup: EVENT LOG and PLOT RATE, as golden. |
| PALLETISING (COLLAPSED) (TBC-18) | palletiser | PASS | PASS | PASS | PASS | Concetti. No settings, as golden. Popup as golden. |
| GRAIN OUT 5 (for "bagged product · pallets out") | grain-out | PASS | PASS | – | – | |

On check 5: every name and tag took on Enter and read back after deselecting. All the golden values equal the item defaults, so they were retyped and read back rather than changed from something else. The golden popups match the built ones, apart from the pre-bin set point sliders.

**Line checks**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1a | All connections can be made | 12 connections | All 12 were made port to port. The saved file lists `outBinSeg → AUTO SAMPLER → FLEXICON PRE-BIN → VIBRATING CONVEYOR → FLEXICON FILLING HEAD → ROLLER CONVEYORS 1-4 + BELT SCALE → GRAIN OUT 2` and `outConcetti → AUTO SAMPLER → CONCETTI PRE-BIN → BAGGING SCALE → FILLING & SEWING → PALLETISING (COLLAPSED) → GRAIN OUT 5` ([G3-1](findings-img/G3-1.png)) | PASS |
| 1b | Problems list | Only the replaced stubs, or nothing | PROBLEMS fell from 26 to 2: "NIKLAS WNS/200 BATCH TREATER: input not connected" and "… output not connected", which are its chemical inlet and waste outlet. Golden shows the same two. This is G1's question 2, still open | QUESTION |
| 2a | Destination selector offers big bag and Concetti | As golden's DESTINATION (CONCETTI / FLEXICON / METAL BIN 1 / METAL BIN 2) | There's no DESTINATION, only the pendulum's own selector, which reads `GRAIN BREAK · AUTO SAMPLER · AUTO SAMPLER`. Each outlet is named after its first machine, and both golden samplers are called AUTO SAMPLER. Only the order shows that the first is big bag (`outBinSeg`) and the second is Concetti ([G3-2](findings-img/G3-2.png)) | **FAIL** #134 |
| 2b | Big bag choice routes only to the big bag branch | Big bag branch only | By 1547 s, sampler 1 was at 12.00 t/h with 4.528 t through. Sampler 2, the Concetti pre-bin, the scale, the filler and the palletiser all stayed at 0.000 t ([G3-3](findings-img/G3-3.png)) | PASS |
| 2c | Concetti choice routes only to the Concetti branch | Concetti branch only | Switched at 2440 s. By 2921 s, sampler 2 was at 12.00 t/h and sampler 1 at 0.00, with its total held at 7.585 t. The big bag branch drained what it held: the pre-bin fell from 100 % to 33 % while the vibrating conveyor kept feeding the head ([G3-4](findings-img/G3-4.png)) | PASS |
| 3a | Filling head cycles at the golden bag size | 1000 kg bags | The head fills 0 → 100 % in 360 s at 10 t/h, holds 45 s, drops to 0.4 % and repeats. Drops at 525, 930 and 1336 s give a 405 s period. Golden dropped at 533 and 937 s, a 404 s period (its pendulum runs at 94 %, so its first bag comes later) | PASS |
| 3b | Bagging scale cycles at the golden bag size | 50 kg bags | The Concetti pre-bin saws between 0 and 9.5 % of its 0.52 t, about 50 kg, and drops every 15.0 s: 35 drops from 2615 to 3125 s. Scale, filler and palletiser run at 11.99 t/h. Golden showed the same sawtooth, every 15.0 s (1433 → 1704 s), at 11.98 t/h | PASS |
| 4a | Vibrating conveyor meters into the filling head | The head fills at the conveyor's rate | At 10 t/h the head rises 1.15 % every 4 s and stays at 100 % through the 45 s hold. The conveyor stops then, because the next bag starts at 0.4 %. Its plotted rate is a slow average, so the plot dips only to 5.3 t/h (see observations) | PASS |
| 4b | Changing the feed rate changes the fill | Slower fill | Popup slider moved from 10 to 5 t/h on the reopened line. The head was at 63.2 % at 574 s (5 t/h × 455 s = 0.632 t). Its first bag dropped at 884 s = 119 s transit + 720 s fill + 45 s | PASS |
| – | Conservation, big bag branch | Totals balance | At 1547 s the Pro box had sent 12 t/h × 1547 s = 5.157 t. On the pendulum to `outBinSeg`: 119 s × 12 t/h = 0.396 t. Pre-bin: 64.9 % × 1.80 t = 1.169 t. Head: 3 bags = 3.000 t, plus 59.4 % = 0.594 t. That totals 5.159 t, 2 kg over. Read from the chart's level polylines and the bag count (read-only). Grain out 2 plots 0 (#126), so bags were counted from the head's drops | PASS |
| – | Conservation, Concetti branch | Totals balance | Steady by 2900 s: sampler 2 at 12.00 t/h, pre-bin out 11.99, scale 11.99, filling & sewing 11.99 and palletising 11.99. The pre-bin holds a steady 0–50 kg sawtooth. Grain out 5 plots 0 (#126) | PASS |
| 6 | SAVE, then commit as G3.json | A valid line file | Downloaded as `g2.json` (51 KB, `grain-sim-line` v3): 36 machines, 35 connections, no interlocks or rules. Committed as [`docs/findings-lines/G3.json`](findings-lines/G3.json). Opening it again through OPEN loads 36 machines with PROBLEMS (2), and the app names the line "G3". Inside the file the name is still "G2", as in G2. The feeder 2 gate override set in SIM isn't saved (it's 100 % in the file) | PASS |
| 7 | Console | No errors | No errors or warnings all session | PASS |

Screenshots: [G3-1 both branches wired, problems list](findings-img/G3-1.png) · [G3-2 plant controls: two AUTO SAMPLER outlets](findings-img/G3-2.png) · [G3-3 big bag branch cycling, at 2394 s](findings-img/G3-3.png) · [G3-4 after switching to Concetti, at 3125 s](findings-img/G3-4.png) · [G3-5 golden baseline, FLEXICON then CONCETTI](findings-img/G3-5.png)

**Bugs filed / commented**
- #134 A built line's plant controls don't offer the golden SOURCE and DESTINATION choices (existing, commented: the two packaging outlets both show as "AUTO SAMPLER")
- #131 Five golden treating machines have no real catalogue item (existing, commented: the auto sampler, vibrating conveyor and roller conveyors have none either, and the custom vibrating conveyor reaches 0–200 t/h)

**Questions for the user**
- The Flexicon and Concetti pre-bins can't be given their golden set points in the right panel. The Flexicon pre-bin's are LSH 85, LSL 35 and a 5 s delay; the Concetti pre-bin's are LSL recover 35, LSH 85 and LSHH 95. Their popups also lack golden's set point sliders, apart from the Flexicon pre-bin's LSL. This is G1's and G2's question again: do these belong to G4, with the interlocks and the Concetti feed schedule, rather than counting as failures here?
- PROBLEMS still shows the batch treater's chemical inlet and waste outlet, as on golden. That is G1's question 2, still open: should an unwired chemical inlet or waste outlet count as a problem?

**Observations**
- With the big bag branch selected, the Flexicon pre-bin takes 12 t/h but passes on only 8.9 t/h on average (10 t/h, less the 45 s holds). It reached 100 % at about 2200 s, and the pendulum and then the Pro box throttled down with no event (#125, known). Golden avoids this with its pre-bin high trip interlock, which G4 rebuilds.
- The vibrating conveyor's plotted rate is a slow average. The conveyor stops during each 45 s hold, but the plot dips only to about 5.3 t/h, so its integrated tonnes trail the real flow by about 0.19 t. The head's level is the better reading.
- Both samplers keep golden's name, so the chart key lists two identical "AUTO SAMPLER" entries. Golden does the same.
- The Grain outs show no bag count (S4's open question) and plot 0 t/h (#126). Golden's two stubs count bags.
- A drop snaps to the 10-unit grid. The Flexicon pre-bin landed at x 2510 (golden 2515), the filling head at 2590 (2585) and the Concetti pre-bin at 3150 (3145). Holding Alt should place them off the grid, but I didn't try it.
- In BUILD the right panel covers the right-hand 280 px of the canvas. A catalogue drop released over it is silently ignored: my first drop of the big bag Grain out did nothing until I panned.
- The Flexicon pre-bin popup reads "0.00 / 1.80 t" and the Concetti one "0.00 / 0.52 t". Both show tonnes for a capacity typed in m³.

**Follow-up combo ideas**
- G4: rebuild the Flexicon pre-bin high trip and the Concetti feed schedule on G3.json, then check that the Flexicon pre-bin no longer fills to 100 %.
- Re-run G3 check 2a after #134 is fixed, and check that the destination labels say big bag and Concetti rather than AUTO SAMPLER.
- Re-run G3 check 1 for the four custom stand-ins once #131 is decided.

## G4 Golden: interlocks and machine rules

### G4 — 2026-10-19 — 602a423

**Result:** 10 PASS · 9 FAIL · 0 QUESTION · blocked by: none
**Tool:** Playwright CLI (`@playwright/cli`, its own isolated `g4` session), not the Playwright MCP or Claude in Chrome. Every change was made with real mouse and keyboard input: the OPEN file picker, the Interlocks window's selects/buttons/text fields, and the plant popups. Scripts only read state (DOM text/snapshots, the SAVE download, a code search of `src/app`). Dev server on port 5181.

**Steps**
1. Read `docs/browser-testing.md`, the findings-file summary table, "Known broken items" and the G3 entry. Read `src/line/lineData.js`'s `interlocks`, `machineRules` and `feedRateDerivations` arrays (with their comments) for the golden definitions and reasons.
2. Fresh browser, `localStorage.clear()`, reload. The app's own default/landing state is SIM mode on "golden line" already loaded — no START OVER needed to reach it. Switched to BUILD, opened INTERLOCKS: 9 interlocks, grouped by watched machine (TREATER BUFFER BIN 2, TREATER PRE-BIN +1 suggested 0, TREATER AFTER-BIN +1 suggested 0, PENDULUM CONVEYOR 2, METAL BIN 1 1, METAL BIN 2 1, FLEXICON PRE-BIN 1, CONCETTI PRE-BIN 2). Expanded every interlock and every suggestion and recorded each sentence and its WHEN/THEN/WHEN IT CLEARS/RESET fields word for word ([G4-4](findings-img/G4-4.png) shows the two suggestions; the golden interlocks list matches the rebuilt one in step 4 below, shown separately).
3. BUILD → OPEN `docs/findings-lines/G3.json` (the 36-machine line from G1+G2+G3, `interlocks: []`, `machineRules: []`). Loaded with PROBLEMS (2), matching golden.
4. INTERLOCKS → + ADD, nine times, rebuilding each golden sentence in order: watched machine, ABOVE/BELOW + set point + switch + delay, one or more THEN steps (MACHINE/WAIT/IF STILL TRUE/TRIP LINE), an optional WHEN IT CLEARS block, and RESET. Read back each interlock's own collapsed sentence after finishing it and compared to the golden text from step 2. Screenshot of the finished panel: [G4-1](findings-img/G4-1.png).
5. Checked the popup set point sliders on three rebuilt bins in SIM mode: TREATER BUFFER BIN ([G4-5](findings-img/G4-5.png)), FLEXICON PRE-BIN ([G4-2](findings-img/G4-2.png)), CONCETTI PRE-BIN ([G4-3](findings-img/G4-3.png)).
6. Searched `src/app` (the UI layer) for `machineRules`/`feedRateDerivations`: only `src/line/lineData.js`, the sim engine and a save/load round-trip test reference them; the only interlocks UI component is `src/app/InterlocksWindow.jsx`, and it has no path to create a machine rule or a feed rate derivation. Confirms the ticket's own prediction.
7. BUILD → SAVE. Downloaded as `g3.json` (app still shows the line's internal `name` as "G3", one iteration behind — the same lagging-name pattern G1-G3 already noted). Committed as `docs/findings-lines/G4.json`: 36 machines, 35 connections, 9 interlocks, 0 machine rules.
8. Checked console after the golden read, after each interlock, and at the end: 0 errors, 0 warnings throughout.

**Golden interlocks (recorded word for word from the golden line's own Interlocks window)**
1. `bufferBinValve` — "When TREATER BUFFER BIN is above 85 % for 7 s, close from yellow-bin area · 52.414.E00. When below 35 % for 7 s, open from yellow-bin area · 52.414.E00." Reset: auto.
2. `bufferBinHighTrip` — "When TREATER BUFFER BIN is above 95 % for 7 s, close from yellow-bin area · 52.414.E00." Reset: latched.
3. `conveyorRunningInterlockFeeder1` — "When PENDULUM CONVEYOR is stopped for 1 s, stop INLET DRUM FEEDER 1." Reset: auto.
4. `conveyorRunningInterlockFeeder2` — "When PENDULUM CONVEYOR is stopped for 1 s, stop INLET DRUM FEEDER 2." Reset: auto.
5. `metalBin1HighTrip` — "When TREATED OUTLOAD METAL BIN 1 is above 85 % for 5 s, stop PENDULUM CONVEYOR." Reset: latched. (`armedWhen` in `lineData.js`: only while the pendulum conveyor's `outBuffer` port feeds the outload diverter's `out1` — not shown anywhere in the UI.)
6. `metalBin2HighTrip` — "When TREATED OUTLOAD METAL BIN 2 is above 85 % for 5 s, stop PENDULUM CONVEYOR." Reset: latched. (Same `armedWhen` shape, mirrored onto `out2`.)
7. `flexiconPreBinHighTrip` — "When FLEXICON PRE-BIN is above 85 % for 5 s, stop PENDULUM CONVEYOR." Reset: latched. (`armedWhen`: only while routed to `outBinSeg`.)
8. `concettiHighHighPauseSequence` — "When CONCETTI PRE-BIN is above 95 % for 5 s, close AFTER-BIN OUTLET VALVE, stop PENDULUM CONVEYOR, wait 25 s, if still true then trip the whole line. When it clears, wait 30 s, start PENDULUM CONVEYOR, wait 10 s then open AFTER-BIN OUTLET VALVE." Reset: auto. (`armedWhen`: only while routed to `outConcetti`.)
9. `concettiHighHighHoldTreater` — "When CONCETTI PRE-BIN is above 95 % for 5 s, stop NIKLAS WNS/200 BATCH TREATER. When below 85 % for 0 s, start NIKLAS WNS/200 BATCH TREATER." Reset: auto. (Same `armedWhen` as #8.)

**Checks**
| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1.1 | bufferBinValve rebuilt | Golden sentence #1 above | Built exactly: "When TREATER BUFFER BIN is above 85 % for 7 s, close GRAIN IN. When below 35 % for 7 s, open GRAIN IN." Reset auto. (GRAIN IN stands in for the golden stub, per #131; no other difference) | PASS |
| 1.2 | bufferBinHighTrip rebuilt | Golden sentence #2 | Built exactly: "...is above 95 % for 7 s, close GRAIN IN." Reset latched | PASS |
| 1.3 | conveyorRunningInterlockFeeder1 rebuilt | Golden sentence #3 | Built exactly, word for word. Reset auto | PASS |
| 1.4 | conveyorRunningInterlockFeeder2 rebuilt | Golden sentence #4 | Built exactly, word for word. Reset auto | PASS |
| 1.5 | metalBin1HighTrip rebuilt | Golden sentence #5, armed only while routed to this bin | Sentence text and reset match exactly. No field anywhere in WHEN/THEN/WHEN IT CLEARS/RESET arms it to a destination — the rebuilt interlock fires even when the pendulum conveyor feeds Flexicon or Concetti instead. Missing blank: an "armed while destination is…" condition | **FAIL** #138 |
| 1.6 | metalBin2HighTrip rebuilt | Golden sentence #6, same arming gap | Same as 1.5, mirrored | **FAIL** #138 |
| 1.7 | flexiconPreBinHighTrip rebuilt | Golden sentence #7, armed only while routed to Flexicon | Sentence text and reset match exactly; same missing arming blank | **FAIL** #138 |
| 1.8 | concettiHighHighPauseSequence rebuilt | Golden sentence #8 (close valve, stop conveyor, wait 25 s, if still true trip line; clears: wait 30 s, start conveyor, wait 10 s, open valve), armed only while routed to Concetti | Sentence text matches word for word, including the full wait/if-still-true/trip-line and clears sequence. Same missing arming blank | **FAIL** #138 |
| 1.9 | concettiHighHighHoldTreater rebuilt | Golden sentence #9, same arming gap | Sentence text matches word for word. Same missing arming blank | **FAIL** #138 |
| 3 | Suggested interlocks while rebuilding | Each one named and checked against a golden interlock | Only two suggestions ever appeared, on the bare line (no others, even on TREATER BUFFER BIN/PENDULUM CONVEYOR/METAL BIN 1/2/FLEXICON/CONCETTI, which also have unwatched level switches — matches known item #136): "When TREATER PRE-BIN is above 85 % for 5 s, stop BUCKET ELEVATOR · TREATING" and "When TREATER AFTER-BIN is above 85 % for 5 s, stop NIKLAS WNS/200 BATCH TREATER." Neither matches a golden interlock: golden has no interlock on either bin at all — `preBinFeedSchedule` and `afterBinHoldTreater` are machine rules, not sentences, with different set points (LSHH 95 %, not LSH 85 %, trips `preBinFeedSchedule`; 60 %/20 % for `afterBinHoldTreater`) and different actuator behaviour (a 3-band throttle, and "stop accepting new batches" rather than an outright stop) ([G4-4](findings-img/G4-4.png)) | PASS |
| 4a | Popup set point slider — TREATER BUFFER BIN | 3 sliders (LSH 85, LSL 35, LSHH 95), as golden | All 3 present with golden's values, generated once interlocks 1-2 were built ([G4-5](findings-img/G4-5.png)) | PASS |
| 4b | Popup set point slider — FLEXICON PRE-BIN | LSH 85 and LSL 35 sliders, as golden | Both present (LSL was already shown before any interlock existed — display-only; LSH appeared only after interlock 1.7 was built) ([G4-2](findings-img/G4-2.png)) | PASS |
| 4c | Popup set point slider — CONCETTI PRE-BIN | LSL recover 35, LSH 85, LSHH 95, as golden | Only LSH 85 and LSHH 95 appeared (from interlocks 1.8/1.9); no LSL slider, because golden's LSL comes from `concettiFeedSchedule` (a machine rule, #139), not from any interlock ([G4-3](findings-img/G4-3.png)) | PASS (slider generation itself matches; the missing LSL is check 5's gap, not this one's) |
| 5.1 | preBinFeedSchedule rebuilt | A 3-band graded speed/gate schedule on the treating elevator + drum feeder (LSL 35 %/LSH 85 %/LSHH 95 % trip) | No Build mode UI creates machine rules at all (confirmed by code search of `src/app`: only `InterlocksWindow.jsx` exists, and it has no such path). Lost: the boost/normal/throttle bands (~14/12/6 TPH) between LSL and LSH, and the LSHH 95 % trip — only a flat 85 % stop can be approximated with an interlock, which is wrong on both set point and shape | **FAIL** #139 |
| 5.2 | afterBinHoldTreater rebuilt | "Stop accepting new batches" (not an outright stop) at 60 %, releasing at 20 % | No UI path. Lost: the distinction between blocking new batches vs. `stop`ping mid-cycle, and the 60 %/20 % set points (not 85 %, the figure the nearest suggestion offers) | **FAIL** #139 |
| 5.3 | concettiFeedSchedule rebuilt | Same 3-band schedule on the pendulum conveyor + both inlet drum feeders (LSL 35 %/LSH 85 %), armed only while routed to Concetti | No UI path, and unlike the pre-bin, no suggestion is even offered for this bin. Lost: the boost/normal/throttle bands (~18/14/7 TPH) that are the reason the Flexicon pre-bin on the rebuilt G3/G4 line fills straight to 100 % with no graduated throttle-back (observed already in G3, #125) | **FAIL** #139 |
| 5.4 | feedRateDerivations rebuilt (×3: treating elevator↔feeder, conveyor↔feeder1, conveyor↔feeder2) | A continuous speed×gate→rate derivation so a dial change shows the feeder's commanded rate immediately | No UI path for any of the three | **FAIL** #139 |
| 6 | SAVE, commit as G4.json | A valid line file with 9 interlocks, 0 machine rules | Downloaded (as `g3.json`, the line's internal name still lagging one combo behind — same pattern noted in G1-G3), 36 machines, 35 connections, 9 interlocks matching golden exactly (minus `armedWhen`, which isn't in the saved JSON either — confirming it truly cannot be set from the UI), 0 machine rules. Committed as [`docs/findings-lines/G4.json`](findings-lines/G4.json) | PASS |
| 7 | Console | No errors | 0 errors, 0 warnings for the whole session (golden read, all 9 interlocks, both SIM popup checks, SAVE) | PASS |

**Bugs filed / commented**
- #138 Interlocks window has no "armed while" / destination-arming blank (new)
- #139 No Build mode UI creates machine rules or feed rate derivations (new)

**Questions for the user**
- None this run — every gap traced to a missing UI capability already confirmed by code search, not a judgement call.

**Observations**
- The golden line's own Interlocks window never displays `armedWhen` anywhere — not in the collapsed sentence, not in the expanded WHEN/THEN/RESET fields. An engineer reading golden through the UI alone (rather than `lineData.js`) would not know 5 of its 9 interlocks are destination-gated at all.
- No field anywhere in the Interlocks window sets a ramp time (`rampTimeSec`), even though golden's own `then` steps carry one (e.g. the buffer bin valve's 6 s close/open ramp). The ticket's own required-field list for check 1 doesn't include ramp time, so this isn't scored as a FAIL here, but it's a further gap alongside `armedWhen` worth folding into whatever fixes #138.
- `+ MACHINE`, `+ WAIT`, `+ IF STILL TRUE` and `+ TRIP LINE` all needed a second click before they actually added a step (the first click only marked the button `[active]`); every double-add was caught and the extra step removed. This cost time but never produced a wrong saved interlock.
- Clicking "+ WHAT HAPPENS WHEN IT CLEARS" auto-fills a mirror-image default (reversed step order, actions flipped CLOSE↔OPEN/STOP↔START) rather than leaving it empty. That default was usable for the simple two-step cases (interlocks 1 and 9) but had to be fully discarded and rebuilt step by step for interlock 8's four-step clears sequence (wait/start/wait/open) since the default only ever produces as many steps as the "when" side had MACHINE steps.
- A sentence's set-point/delay textbox doesn't recompute the collapsed summary text until the field blurs (e.g. pressing Tab); reading the summary immediately after `fill` can show the old value even though the field itself already holds the new one.

**Follow-up combo ideas**
- Re-run G4 once #138 lands, and check that interlocks 5-9 can be armed to a destination and that the Flexicon pre-bin no longer fills to 100 % under the big-bag branch with only `flexiconPreBinHighTrip` (no graded schedule) in place.
- C6 (#111) is the natural home for a full UI build-out of machine rules and feed rate derivations once #139 is addressed; this run's per-machine-rule gaps (5.1-5.4) can seed its checklist directly.
- G5 (#105): now that G4 has a 9-interlock line saved, the side-by-side run can compare the rebuilt line's behaviour against golden with the known gaps (#138, #139) already named, rather than rediscovering them.

## C2 Running/stopped and cascades

### C2 — 2026-10-19 — 6029015

**Result:** 8 PASS · 2 FAIL · 2 QUESTION · blocked by: #135 (check 1's "from its popup": K2 was stopped through a bin-level interlock instead)
**Tool:** Playwright CLI (`@playwright/cli`, session `C2`, its own headless Chromium, viewport 1600 × 1000), not the Playwright MCP, because two other sessions ran in parallel. Every change was made with real mouse and keyboard input: catalogue drags, port-to-port drags, typing in the right panel and the Interlocks window, popup slider drags and toolbar buttons. Scripts only read state (port positions, chart polylines, localStorage, the SAVE download). Dev server on port 5183.

**Steps**
1. Cleared localStorage, reloaded, BUILD → NEW LINE. Dragged in Grain in, Bin (Custom), Drum feeder (Custom), Conveyor (Custom), Bucket elevator (Custom), Conveyor (Custom), Bin (Custom) and Grain out, and wired them port to port. PROBLEMS read "This line has no problems." Renamed the feeder, conveyors and elevator F1, K1, E and K2 in the right panel. All other values were left at the item defaults (conveyors 20 t/h, 30 m/min, 10 m; elevator 20 t/h, 10.08 m/min, 8.731 m; bins 1.63 m³ = 1.17 t; Grain in 12 t/h).
2. INTERLOCKS → + ADD, three times: "When K1 is stopped for 1 s, stop F1", "When E is stopped for 1 s, stop K1", "When K2 is stopped for 1 s, stop E", all auto reset. Each read "will run".
3. K2's popup has no stop control (#135). To stop K2 by hand I added "When BIN 2 is above 50 % for 0 s, stop K2" (auto). In SIM its popup set point slider ("above set point") sits in BIN 2's popup: dragging it below Bin 2's level stops K2, and dragging it to 100 % releases K2.
4. SIM → plotted the rates of Grain in, F1, K1, E and K2 and the levels and rates of both bins. 5× → RUN to 183 s (Bin 2 at 0.30 t). Dragged the K2 set point to 18 %, ran 40 s, then dragged it to 100 % and ran 44 s. At 267 s I dragged Grain in's source rate to 0 and ran at 20× to 780 s, so the line drained into Bin 2 and the plotted rates decayed to 0.
5. BUILD, + ADD "When BIN 2 is above 50 % for 0 s, stop F1", a second stop source on F1. SIM (a fresh run), then held and released the two F1 sources in both orders with the two set point sliders in BIN 2's popup, reading Bin 1's level each time.
6. BUILD: deleted BIN 2 → GRAIN OUT 1, added an Outlet valve (Custom) between them. Tried "When K1 is running for 1 s, open OUTLET VALVE 1", then built "When K1 is running for 1 s, close OUTLET VALVE 1". SIM: ran it, and stopped K1 through the K2 cascade.
7. BUILD → INTERLOCKS to read the suggestions, then SAVE ([`docs/findings-lines/C2.json`](findings-lines/C2.json): 9 machines, 8 connections, 6 interlocks).
8. Read console messages after every stage. There were no errors or warnings all session.

**Checks**
| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1a | Stop K2 from its popup | A stop control in K2's popup | K2's popup has only EVENT LOG and PLOT RATE. No machine popup on this line has a stop or start control. K2 was stopped through the bin-level interlock in step 3 | **FAIL** #135 |
| 1b | E, then K1, then F1 stop, in order, each after its delay | In order, 1 s apart | K2 stopped at 183.2 s, E at 184.2 s, K1 at 185.3 s, F1 at 186.3 s ([C2-1](findings-img/C2-1.png)). Their speeds read 0.0 m/min | PASS |
| 1c | The event log shows the chain | Each step logged | "183.2s BIN 2 above 18% for 0s, K2 stopped", "184.2s K2 not running for 1s, E stopped", "185.3s E not running for 1s, K1 stopped", "186.3s K1 not running for 1s, F1 stopped" | PASS |
| 2 | Grain on the stopped conveyors stays on them; conservation across the stop | Nothing vanishes | The stopped K1, E and K2 still draw their grain ([C2-1](findings-img/C2-1.png)). While stopped, Bin 2 held at 0.30 t and Bin 1 rose 0.13 t in 36 s, which is 12 t/h, all of Grain in. After the restart, the drain and 780 s: Grain in 0.886 t = F1 0.887 = K1 0.887 = E 0.887 = K2 0.887 = Bin 2 0.89 t (75.9 % of 1.17 t), Bin 1 0.00 t. 12 t/h × 267 s = 0.890 t. Rates read by integrating the chart polylines once they had decayed to 0 (read-only); bins from their popups ([C2-3](findings-img/C2-3.png)) | PASS |
| 3a | Restart K2: with auto reset the chain restarts downstream to upstream | K2, E, K1, F1 | Set point to 100 % at 222.8 s: "BIN 2 below 100% again, K2 released" 222.8 s, "K2 running again, E released" 222.9 s, "E running again, K1 released" 222.9 s, "K1 running again, F1 released" 223.0 s ([C2-2](findings-img/C2-2.png)). Order as expected, the whole chain back within 0.2 s | PASS |
| 3b | Restart timing | Record it | The stop takes 1 s a step because of the signal delays, but the restart has no delay at all: each release waits only for the machine below to read running again, one or two 0.05 s ticks. See questions | QUESTION |
| 4a | The running condition works the other way round | Acts while K1 runs, lets go when it stops | "When K1 is running for 1 s, close OUTLET VALVE 1": "1.1s K1 running for 1s, OUTLET VALVE 1 closed", and Bin 2 held its grain. When K1 stopped in the cascade: "173.7s K1 no longer running, OUTLET VALVE 1 released", and Bin 2 drained through the valve from 0.26 t to 0.09 t. When K1 ran again: "207.0s K1 running for 1s, OUTLET VALVE 1 closed" ([C2-7](findings-img/C2-7.png)) | PASS |
| 4b | "When K1 is running → open a valve" | Can be written | OPEN is greyed out. Picking the valve shows "Machines run on their own. A step can only stop a machine or close a valve. To leave OUTLET VALVE 1 running, remove this step." ([C2-6](findings-img/C2-6.png)). The same effect is "When K1 is stopped, close the valve" (see questions) | QUESTION |
| 5a | Two stop sources on F1, cleared in the order bin then K1 | F1 runs only when both have cleared | Source B (Bin 2 above 8 %) stopped F1 at 160.0 s, and the K1 interlock stopped it again at 205.7 s. B released F1 at 251.3 s, but Bin 1 kept rising at 12 t/h (0.30 → 0.46 t by 298.9 s), so F1 stayed stopped. K1 released it at 299.2 s, and Bin 1 then held at 0.46 t, so F1 was running ([C2-4](findings-img/C2-4.png)) | PASS |
| 5b | The same, cleared in the order K1 then bin | As 5a | Both held from 350.4 s. K1 released F1 at 387.3 s, but Bin 1 rose 0.60 → 0.76 t by 437.3 s. B released it at 437.4 s, and Bin 1 then held at 0.76 t ([C2-5](findings-img/C2-5.png)) | PASS |
| 6 | Accepting the suggested conveyor-running interlocks gives the same result as writing them by hand | Suggestions offered | Only bin high-level suggestions appear: "When BIN 1 is above 85 % for 5 s, close GRAIN IN 1", and "When BIN 2 is above 85 % for 5 s, stop K2" (until my BIN 2 → K2 interlock covered it). No conveyor-running suggestion at any point ([C2-8](findings-img/C2-8.png)) | **FAIL** #136 |
| 7 | Console | No errors | 3 messages all session, none an error or warning (Vite and React DevTools notices) | PASS |

Screenshots: [C2-1 cascade stop, grain left on the conveyors](findings-img/C2-1.png) · [C2-2 restart, downstream to upstream](findings-img/C2-2.png) · [C2-3 drained line, conservation](findings-img/C2-3.png) · [C2-4 two stop sources, bin first](findings-img/C2-4.png) · [C2-5 two stop sources, K1 first](findings-img/C2-5.png) · [C2-6 OPEN greyed out](findings-img/C2-6.png) · [C2-7 running condition closing the valve](findings-img/C2-7.png) · [C2-8 suggestions](findings-img/C2-8.png). Saved line: [C2.json](findings-lines/C2.json) (it includes the two BIN 2 workaround interlocks and the valve).

**Bugs filed / commented**
- #135 A conveyor's popup has no stop or start control, so one machine can't be stopped by hand (new)
- #136 No conveyor-running interlock is suggested when machines are connected (new)

**Questions for the user**
- The cascade stops one step a second because of the 1 s signal delays, but it restarts all at once: K2, E, K1 and F1 were all running again within 0.2 s of K2 being released, because an auto-reset interlock lets go the tick its condition clears and has no delay on clearing. Is an instant restart what you want, or should a restart be staggered too, for example by a delay on "running again", so each conveyor is up to speed before the one feeding it starts?
- A step can only stop a machine or close a valve, so "When K1 is running, open the valve" can't be written: OPEN is greyed out, and a valve is open unless something closes it. The same behaviour has to be written as "When K1 is stopped, close the valve". Is that the intended way to express "open the valve while K1 runs", or should OPEN be offered for a valve, meaning "hold it closed except while this is true"?

**Observations**
- BIN 2's popup labels its two generated set point sliders "above set point" and "above set point 2". Nothing says which interlock each one drives (one stops K2, the other F1), so I had to work it out from the order I added them.
- Choosing a step's machine before its action shows "Machines run on their own. A step can only stop a machine or close a valve. To leave F1 running, remove this step." No action has been picked yet, so "needs an action" would fit better. For a valve it says "To leave OUTLET VALVE 1 running".
- F1 has no events of its own. Every "F1 stopped" or "F1 released" line is listed under the machine the interlock watches (K1 or BIN 2), so the event log has no F1 button.
- BUILD → SIM starts a fresh run and clears the plots, and RESTART also clears them, so the series have to be plotted again each time. UNDO is greyed out after a SIM visit (G2 saw this too).
- Holding Bin 2 near the K2 set point (8 %) with the valve open made the line cycle about every 4 s: K2 stops, the valve opens, the bin drains, K2 restarts, the valve closes. The logic is right; it is what such a set point does.
- With the valve between them, the custom Bin 2 does discharge (0.26 → 0.09 t). Wired straight to Grain out it only fills, as #123 says.
- The custom drum feeder passes whatever it is fed: Bin 1 stays at 0 while F1 runs and holds level once F1 restarts, so F1 runs at the 12 t/h inflow.
- At this zoom the port dots are about 6 px across. A drag that starts just off one moves the machine instead, and twice moved Bin 1 on top of the feeder. Wheel-down zooms out only as far as the line's extent allows (G1 saw this).

**Follow-up combo ideas**
- Re-run C2 checks 1 and 6 once #135 and #136 are fixed: stop K2 from its popup, and accept the suggested conveyor-running interlocks.
- The same cascade with latched reset, restarted with RESET TRIPS, to compare against auto.
- A staggered restart built from a "when it clears" part with WAIT steps, if the instant restart (question 1) is not what is wanted.

## C1 Level conditions × actions

### C1 — 2026-10-19 — 6029015

**Result:** 36 PASS · 1 FAIL · 1 QUESTION · blocked by: none
**Tool:** Playwright CLI (`@playwright/cli`, its own headless Chromium session), not the Playwright MCP or Claude in Chrome, because two other sessions were running at the same time. Every change was made with real mouse and keyboard input: catalogue drags, port-to-port drags, typing and clicks in the right panel and the Interlocks window, popup slider clicks, and the toolbar and safety buttons. Scripts only read state (DOM snapshots, slider min/max, the RESET TRIPS button's class, the SAVE download). Dev server on port 5182.

**Steps**
1. Cleared localStorage and reloaded. BUILD → NEW LINE.
2. Dragged in Grain in, custom Bin, custom Drum feeder, custom Outlet valve, custom Conveyor, custom Bin, custom Drum feeder and Grain out. Wired them in that order by dragging port dots, then renamed the six machines BIN A, F, V, K, BIN B and G. PROBLEMS cleared. The saved file confirms the seven connections, `out → in` each.
3. For each of the 16 runnable combos (bin × above/below × stop F/close V × auto/latched): INTERLOCKS → deleted the last interlock (DELETE INTERLOCK → DELETE IT) → + ADD → WATCH the bin, IS ABOVE 50 % with switch LSH or BELOW 30 % with switch LSL, FOR 2 s, + MACHINE → F STOP or V CLOSE, then AUTO or LATCHED. Read the sentence, then SIM → RESTART → RUN (1×, or 5× to wait out a slow fill) and opened the watched bin's popup.
4. Moved each bin's level across the set point with the popup's fill level slider, or let it cross by itself. Read the popup's event log, the bin's tonnage and RESET TRIPS. For latched, let the level recover, checked the trip held, then pressed RESET TRIPS.
5. For the 16 start/open combos: wrote the same sentences up to the step, picked F or V, and read the action pills, their tooltips and the window's message, under AUTO and under LATCHED.
6. Set point slider: with "above 50 %, LSH", moved LSH live to 35 % (the level was at 50 %) and then to 80 %. Then wrote "above 20 %, LSH" to test a set point below the slider's range.
7. BUILD → SAVE, kept as [`docs/findings-lines/C1.json`](findings-lines/C1.json) (its interlock is the last one written, "above 20 %"). Read the console at the end: no errors or warnings all session.

**Matrix.** "Fires" is the event log entry after the 2 s delay. "Clears" is the auto release, or for latched, still held after recovery and released by RESET TRIPS. RESET TRIPS pulsed (`trip-pulse`) from the moment each latched trip fired until it was pressed. In every run, the bin's tonnage confirmed what the event said: it rose while F was stopped or V closed, and held or fell once released.

| # | Condition | Action | Reset | How the level crossed | Fires | Clears | Result |
|---|-----------|--------|-------|-----------------------|-------|--------|--------|
| 1 | BIN A above 50 % (LSH) | stop F | auto | fill slider 70 %, then 30 % | 270.4 s "above 50% for 2s, F stopped" (LSH ON 268.4 s) | 441.6 s "below 50% again, F released". A then held at 0.35 t | PASS |
| 2 | BIN A above 50 % | stop F | latched | 70 %, then 30 % | 17.7 s | Held (A rose 0.35 → 0.45 t with F stopped). RESET TRIPS at 75.7 s: "reset, F released", A held at 0.45 t | PASS |
| 3 | BIN A above 50 % | close V | auto | 70 %, then 30 % | 41.0 s "V closed" | 91.3 s "below 50% again, V released" | PASS |
| 4 | BIN A above 50 % | close V | latched | 70 %, then 30 % | 11.1 s | Held, V drawn closed ([C1-2](findings-img/C1-2.png)). RESET TRIPS at 56.3 s: "reset, V released" | PASS |
| 5 | BIN A below 30 % (LSL) | stop F | auto | starts empty, then fills while F is stopped | 2.1 s | 107.7 s "above 30% again, F released". A then held at 0.35 t | PASS |
| 6 | BIN A below 30 % | stop F | latched | the same | 2.1 s | Held while A rose to 0.64 t. RESET TRIPS at 238.5 s: "reset, F released", A held at 0.79 t | PASS |
| 7 | BIN A below 30 % | close V | auto | the same | 2.1 s "V closed" | 107.7 s "V released", the same moment as row 5, so a closed V held F back exactly as a stop did | PASS |
| 8 | BIN A below 30 % | close V | latched | the same | 2.1 s | Held to 0.55 t. RESET TRIPS at 201.2 s: "V released" | PASS |
| 9 | BIN B above 50 % | stop F | auto | fill slider 70 %, then G drains it | 23.8 s | 114.2 s "below 50% again, F released" | PASS |
| 10 | BIN B above 50 % | stop F | latched | 70 %, then G drains it | 265.9 s | Held while B drained to 0.15 t. RESET TRIPS at 540.6 s: "F released" | PASS |
| 11 | BIN B above 50 % | close V | auto | 70 %, then G drains it | 14.4 s | 97.1 s "V released" | PASS |
| 12 | BIN B above 50 % | close V | latched | 70 %, then G drains it | 13.2 s | Held to 0.29 t. RESET TRIPS at 200.1 s: "V released" | PASS |
| 13 | BIN B below 30 % | stop F | auto | starts empty, then fill slider 60 % | 2.1 s | 30.3 s "above 30% again, F released". B then held at 0.64 t | PASS |
| 14 | BIN B below 30 % | stop F | latched | empty, then 80 % | 2.1 s | Held at 0.90 t. RESET TRIPS at 25.5 s: "F released" | PASS |
| 15 | BIN B below 30 % | close V | auto | empty, then 60 % | 2.1 s | 16.1 s "V released" | PASS |
| 16 | BIN B below 30 % | close V | latched | empty, then 80 % | 2.1 s | Held. RESET TRIPS at 24.5 s: "V released" | PASS |
| 17–24 | BIN A or BIN B, above 50 % or below 30 % (4) | start F | auto, then latched (2 each) | – | START is greyed out, so it can't be picked. Its tooltip says "Only after this interlock has stopped it. Machines run on their own." The window says THIS INTERLOCK WILL NOT RUN YET: "Machines run on their own. A step can only stop a machine or close a valve. To leave F running, remove this step." It offers REMOVE STEP, and the sentence reads "… , … F." | – | PASS |
| 25–32 | the same 4 conditions | open V | auto, then latched | – | OPEN is greyed out: "Only after this interlock has closed it. Valves are open on their own." The same message and REMOVE STEP ([C1-3](findings-img/C1-3.png)) | – | PASS |

**Checks**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1a | The sentence reads in plain words | Correct | All 16 read as written, e.g. "When BIN A is above 50 % for 2 s, stop F." and "When BIN B is below 30 % for 2 s, close V." The reset shows under the sentence ("Lets go by itself once the condition clears." / "Holds until an operator presses RESET TRIPS.") | PASS |
| 1b | Only sensible choices | No "above" on a conveyor, no "close" on a feeder | WATCH lists BIN A, V, K and BIN B. A bin offers ABOVE / BELOW and SWITCH NONE / LSL / LSH / LSHH. K and V offer only STOPPED / RUNNING. Steps: F and K offer STOP / START, V and Grain in offer CLOSE / OPEN. No feeder offers CLOSE and no conveyor offers ABOVE | PASS |
| 2 | Fires at X after the delay, logged | Yes | Rows 1–16. A level switch also logs "LSH ON at 70% (setpoint 50%)" 2 s before the action | PASS |
| 3 | Auto clears and the machine returns | Yes | Rows 1, 3, 5, 7, 9, 11, 13 and 15 | PASS |
| 4 | Latched holds, RESET TRIPS lights, the press clears it | Yes | Rows 2, 4, 6, 8, 10, 12, 14 and 16 | PASS |
| 5 | "start"/"open" that can never run is explained | The window says why | Rows 17–32 | PASS |
| 6a | The popup gains the switch's set point slider, and it moves the trip point live | Yes | BIN A's popup showed "LSH set point 50 %" once the interlock existed. With the level at 50 %, LSH moved to 35 %: "LSH ON at 50% (setpoint 35%)", then "above 35% for 2s, F stopped". LSH moved to 80 %: "below 80% again, F released" ([C1-1](findings-img/C1-1.png)) | PASS |
| 6b | The slider shows the interlock's set point | Any set point the window accepts | "above 20 %, LSH" is accepted, and trips at 20 % ("LSH ON at 27% (setpoint 20%)"). But the popup slider is limited to 35–90 %, so its thumb sits pinned at the left end under a "20 %" label ([C1-4](findings-img/C1-4.png)). The LSL slider is limited to 0–55 % and labelled "LSL recover". These are the Treater pre-bin's values, kept by the custom Bin | **FAIL** #137 |
| 7 | Console | No errors | No errors or warnings all session | PASS |

Screenshots: [C1-1 LSH slider moved live, event log](findings-img/C1-1.png) · [C1-2 latched close V, RESET TRIPS lit, V drawn closed](findings-img/C1-2.png) · [C1-3 OPEN greyed out with the window's explanation](findings-img/C1-3.png) · [C1-4 set point 20 % on a 35–90 % slider](findings-img/C1-4.png)

**Bugs filed / commented**
- #137 A custom Bin's set point sliders keep the Treater pre-bin's 35–90 % / 0–55 % limits and "LSL recover" label (new)

**Questions for the user**
- Moving a set point slider in a SIM popup moves the live trip point, but it isn't written back to the line. After LSH was moved from 50 % to 80 % in SIM, the Interlocks window back in BUILD still read "above 50 %", and RESTART went back to 50 %. Should the popup slider stay a live tuning control that resets, or should it change the interlock's set point?

**Observations**
- #123 didn't show here: the custom Bin drains steadily into a drum feeder. With F running, BIN A stays at 0 %, and after a slider change it holds wherever it was put. So most level crossings had to be made with the popup's fill level slider.
- The fill level slider is a set-once control. After it was set to 70 %, the bin filled to 91 % and then 100 % while the slider still read 70 %.
- No "LSH OFF" or "LSL OFF" event is logged when a level switch clears, only the "ON". A latched trip logs nothing when its condition clears, only the later "reset, F released". A "below" trip logs no "LSL ON" line, unlike "above", which logs "LSH ON at …".
- Row 1: with F stopped, BIN A sat at 100 % for about 50 s with no event (#125).
- The window's message on a greyed-out OPEN says "To leave V running, remove this step." For a valve, "open" would read better than "running".
- The Interlocks window offers no way to pick "start" or "open" as an only step. That is the intent of #92, but it means the "start the feeder never runs" case is ruled out before it can be written, not shown after.
- Each time SIM was entered the view fitted to a different zoom, and the chart dock reopened. The popup and event log panel also closed on each switch to BUILD.
- In BUILD, the connector lines seem to start and end at odd points: Grain in's line leaves from its top, and F → V is drawn to V's outlet side. The saved file has every connection right (`out → in`).
- The first click on SIM, made while the delay field had focus, didn't switch mode. The second did.
- The suggested interlocks on this line were "When BIN A is above 85 % for 5 s, close GRAIN IN 1." and "When BIN B is above 85 % for 5 s, stop K." They were left alone (C4's subject).

**Follow-up combo ideas**
- C3 (delays, sliders): sentences with switch NONE, and set points at the window's 0 % and 100 % limits, against the popup slider's range, once #137 is fixed.
- C5: press RESET TRIPS while a latched condition still holds, and check that it waits until the condition clears.
- Re-run C1 6b after #137, with "above 20 %" and "below 80 %" on a custom Bin.

## G5 Golden: side-by-side run and saved-file diff

### G5 — 2026-10-19 — 43f61c7

**Result:** 21 PASS · 5 FAIL · 1 QUESTION · blocked by: #141 (metal-bin trip armedWhen check, see 3.2)
**Tool:** Playwright CLI (`@playwright/cli`), two parallel named sessions (`g5` driving the golden line, `g5r` driving the rebuilt line from `docs/findings-lines/G4.json`) so both 10-sim-minute runs could progress in real wall-clock time at once, not the Playwright MCP or Claude in Chrome. Every change was made with real mouse and keyboard input: START OVER, SAVE, OPEN's file picker, the SOURCE/DESTINATION buttons (golden) or the per-machine PENDULUM CONVEYOR/DIVERTER selectors and gate-position/feed-rate/fill-time sliders (rebuilt, per known gap #134), RUN/RESTART/speed, RESET TRIPS, and machine popups' own set-point sliders. Scripts only read state: a Node diff of the two saved JSON files, DOM text from the plant canvas and popups (`g.machine` elements, read in one eval per checkpoint rather than full-page snapshots), the event-log panel's text, and the console. Dev server on port 5181.

**Steps**
1. Read `docs/browser-testing.md`, the findings-file summary table, "Known broken items" and the G4 entry (reproduced in the ticket's own "Note known context from G4" section, so not re-read in full here).
2. Fresh browser, `localStorage.clear()`, reload — lands in SIM mode on the golden line already. Switched to BUILD, SETTINGS → START OVER → DISCARD AND START OVER (loads `GOLDEN_LINE_DOC` fresh, confirmed in `src/app/PlantApp.jsx`'s `onStartOver`), then SAVE. Downloaded as `golden-line.json`, saved as [`docs/findings-lines/golden.json`](findings-lines/golden.json) (36 machines, 35 connections, 9 interlocks, 3 machine rules, 3 feed-rate derivations, `zones` and `plantControls` both present — matches `src/line/lineData.js`'s golden definitions, confirming START OVER reproduces golden exactly).
3. **File diff** (read-only): a Node script built a golden-id → rebuilt-id map from the two files' machine order/names/connection topology (every stub-for-custom-item swap `docs/build-mode-findings.md` already logs for G1-G4 — e.g. `upstreamStub → grain-in-1`, `dischargeStub1 → grain-out-3`), then diffed machines (ports/sim/params/adjustable, ids and x/y/w/h ignored), connections (as a normalized set, via/position ignored), interlocks (matched by watched machine + condition + `then` target, ids ignored), `machineRules`, `feedRateDerivations`, `zones` and `plantControls`. Findings below (checks 1.1-1.10).
4. **OPEN round-trip check**: in session `g5r`, BUILD → OPEN `docs/findings-lines/G4.json` directly — refused (check 1.9, new bug #140). Built a local-only patched copy (`/tmp/G4-patched-for-sim-test.json`, not committed) with just the one offending field removed (`flexicon-pre-bin-1.sim.levelSwitches.LSH`, the duplicate #140 is about) so the rebuilt line's *behaviour* could still be driven for checks 2 and 3; every behavioural finding below about the rebuilt line is read from this patched copy, which is otherwise byte-identical to the committed `G4.json`. Also OPENed `docs/findings-lines/golden.json` in `g5r` — loaded cleanly (check 1.10).
5. **Behaviour, same scenario on each line** (check 2): TREATING LINE source at its default 15 t/h on both lines (rebuilt has no SOURCE selector — #134 — so its PRO BOX path, `INLET DRUM FEEDER 1`/`custom-drum-feeder-2`, was held at gate 0 % by hand after every RESTART, mirroring golden's default `inletDrumFeeder1: enabled=false`). For each of METAL BIN 1, METAL BIN 2, FLEXICON and CONCETTI: RESTART, set destination/selector(s), 5×, RUN, then read all 36 machines' canvas text (levels, speeds, bag counts) and the event log at three checkpoints. Checkpoints were taken as soon as the "elapsed" readout crossed each target (2/5/10 sim-min = 120/300/600 s), not at a fixed real-time delay — tool round-trip latency between calls (several seconds each, unavoidable with a real browser driver) means the actual elapsed at each checkpoint is sometimes tens of seconds past the target; the real elapsed is quoted alongside every figure below rather than assumed. Findings in checks 2.1-2.12.
6. **Trip scenarios** (check 3), forcing each condition with real UI actions rather than literally waiting out a slow natural fill every time: the treater buffer bin and Concetti high-high cases were reached by throttling or waiting out the natural fill at 20×; the metal-bin and Flexicon cases additionally used the technique already on record from C1/C2 (#135, #137) — filled the bin to a known level while routed there, switched the destination away (confirmed by the SOURCE/DESTINATION button's own highlight, or the PENDULUM CONVEYOR/DIVERTER selector's), then dragged the bin's own LSH/LSHH set-point slider (in its SIM popup) down below the now-frozen level, which makes the "above X%" condition become newly true at a moment the destination is verifiably not routed there — never by editing saved JSON or calling sim code. RESET TRIPS used after each. Findings in checks 3.1-3.5 and the RESET TRIPS note (3.6).
7. Checked the console (`playwright-cli console`) after the file-diff work, after each of the 8 behaviour runs, and at the end of the trip scenarios: 0 errors, 0 warnings throughout both sessions the entire run (check 4).
8. Filed #140 (G4.json fails its own re-open), #141 (rebuilt line's metal-bin branch never receives grain) and #142 (no UI creates the golden line's zone fit-view shortcuts); commented on #138 and #139 with the confirmed behavioural evidence rather than filing duplicates.

**Tolerance:** levels are read as the whole-percent integer the canvas itself displays (e.g. `LT36`), so figures are compared to within ±1 percentage point; elapsed times are compared to within the real-time checkpoint drift noted in step 5 (up to roughly +30 s past the nominal 120/300/600 s target, worse at higher multiples of real latency — quoted exactly, never assumed).

**File diff checks**
| # | Difference found | Classification | Detail |
|---|-------------------|-----------------|--------|
| 1.1 | All 36 machines match 1:1 by the id-map; every field differs only where known stub-replacement or custom-item gaps already predict (adjustable `rate.default` 15→12 on the source stub; `sim.kind` `undefined`→`"terminalSink"` on 4 of 6 stubs; `bigBagStub`/`palletStub` missing `displayCapacityM3`/`bagSizeM3`; `custom-vibrating-conveyor-1`'s `feederRate.max` 20→200) | **Expected** (#131, #126) | None of these differ in a way check 2 found behaviourally meaningful, except where noted in 1.9/2.5-2.6 |
| 1.2 | All 35 connections match 1:1 once normalized through the id-map (no connection only on one side) | **Expected** (stub replacement only) | — |
| 1.3 | All 9 interlocks match the golden sentence word for word (`when`/`then`/`whenClears`/`reset`), confirming G4's own read. 5 of 9 (`metalBin1HighTrip`, `metalBin2HighTrip`, `flexiconPreBinHighTrip`, `concettiHighHighPauseSequence`, `concettiHighHighHoldTreater`) are missing golden's `armedWhen` | **Expected** (#138, already logged in G4) | Checked behaviourally in 3.3; confirmed to actually change line behaviour, not just the saved file — commented on #138 rather than re-filed |
| 1.4 | Every `then`/`whenClears.then` step that carries a golden `rampTimeSec` (the buffer-bin valve's 6 s, the three *HighTrip stops' 0.5 s, the Concetti sequence's 6 s steps) has none on the rebuilt side — no Interlocks window field sets one | **Expected** (G4's own Observations already named this gap and tied it to #138's fix) | No behavioural difference found at 5× sim-minute granularity (ramps are 0.5-6 s); see 2.1-2.8 |
| 1.5 | `machineRules`: golden 3 (`preBinFeedSchedule`, `afterBinHoldTreater`, `concettiFeedSchedule`), rebuilt 0 | **Expected** (#139) | Behavioural effect confirmed in 2.1 vs 2.5/2.7's feed-rate and set-point differences; commented on #139 |
| 1.6 | `feedRateDerivations`: golden 3, rebuilt 0 (`custom-drum-feeder-1`'s `rateM3PerSec` is a static `0.0046296…` baked into the file, vs golden's `0` — driven live by `treatingFeedRateDerivation` instead) | **Expected** (#139) | As 1.5 |
| 1.7 | `zones`: golden `[treating, packaging, bagging]`, rebuilt `[]` — no catalogue item, popup or other Build mode control creates, names or assigns one | **Unexpected — new FAIL** | Filed #142. Cosmetic only (fit-view shortcut buttons); no behavioural effect found anywhere in check 2 or 3 |
| 1.8 | `plantControls`: present on golden (the SOURCE/DESTINATION button group), entirely absent on rebuilt | **Expected** (#134, already logged in G2) | Worked around per step 5 for check 2 |
| 1.9 | `docs/findings-lines/G4.json`, saved straight from this app's own SAVE button in the G4 session, **fails this same app's own OPEN validation**: `Could not open G4.json. · machine "flexicon-pre-bin-1" level switch "LSH" is also named by interlock "interlock-7"`. Root cause (`src/line/validateLine.js`, issue #83's check): building `flexiconPreBinHighTrip` through the Interlocks window auto-wrote `"LSH": 0.85` into the bin's own `sim.levelSwitches`, which the same file's validator then rejects as a duplicate of the interlock that already reads that switch | **Unexpected — new FAIL** | Filed #140. [G5-1](findings-img/G5-1.png). This also means G4's own check 4b (the Flexicon pre-bin's LSH slider "confirming" the interlock) was reading this duplicate marker, not the interlock alone — worth a note if #138/#140 are fixed together |
| 1.10 | `docs/findings-lines/golden.json` (saved by this run, step 2) re-opens cleanly in BUILD — `current line: golden`, `PROBLEMS (2)` (matching golden's own known problem count) | **PASS** | No file-level issue found here |

**Behaviour checks — golden line** (TREATING LINE, 15 t/h, 5×; bin levels are whole-% as displayed; "—" = no live canvas readout for that field, a known gap noted inline)
| # | Destination | t ≈ 2 min (actual elapsed) | t ≈ 5 min (actual elapsed) | t ≈ 10 min (actual elapsed) | Result |
|---|-------------|---------------------------|----------------------------|------------------------------|--------|
| 2.1 | METAL BIN 1 | MB1 0 %, MB2 0 %, buffer bin 1 %, pre-bin 15 % (146.8 s) | MB1 **13 %**, buffer bin 2 %, pre-bin 23 % (337.0 s) | MB1 **36 %**, buffer bin 3 %, pre-bin 26 %, elevator throttled 8.6→8.0 m/min by `preBinFeedSchedule` (633.3 s) | PASS |
| 2.2 | METAL BIN 2 | MB2 0 % (152.2 s) | MB2 **12 %** (334.1 s) | MB2 **45 %** (760.0 s) — tracks MB1's rate closely, as expected for the symmetric branch | PASS |
| 2.3 | FLEXICON (big bag) | Flexicon pre-bin 1.6 % (234.7 s) | — (not sampled at exactly 5 min; see t≈10) | Flexicon pre-bin popup **0.45/1.80 t (25 %)**, "**1 bags**" filled big bags out (740.1 s / 12.3 min) | PASS |
| 2.4 | CONCETTI | Concetti pre-bin 0 % (238.0 s) | Concetti pre-bin **7 %**, "**7 bags**" bagged product out (466.9 s / 7.8 min) | — (superseded by the trip test, check 3.4) | PASS |
| 2.9 | Batch treater cycle count | No live popup readout (#128, known already). Derived instead from the event log: `TREATER AFTER-BIN | LSL OFF at 20%` fires once per completed batch, spaced exactly 48 s apart (the configured cycle time) — 8 such events by 515.8 s, ≈10 by the 633.3 s MB1 t≈10 checkpoint | — | PASS (method noted) |
| 2.10 | Grain out total | Read as the bag counters on the terminal stubs (`"N bags · filled big bags out"` / `"N bags · bagged product · pallets out"`), since Grain out itself plots no rate (#126, known already) | — | — | PASS (method noted) |
| 2.11 | Feeder/conveyor running state | Elevator and pendulum conveyor show a live `m/min` speed (0 when stopped, confirmed in check 3); the three drum feeders have no live readout at all (#128) — inferred instead from downstream level movement and the event log's own `"stopped"`/`"released"` lines | — | — | PASS (method noted) |
| 2.12 | Console | 0 errors, 0 warnings for the whole golden-side session | — | — | PASS |

**Behaviour checks — rebuilt line** (same scenario, driven from the patched `G4.json` copy per step 4)
| # | Destination | t ≈ 2 min (actual elapsed) | t ≈ 5 min (actual elapsed) | t ≈ 10 min+ (actual elapsed) | Result |
|---|-------------|---------------------------|----------------------------|------------------------------|--------|
| 2.5 | METAL BIN 1 (GRAIN BREAK + DIVERTER→MB1) | MB1 0 %, buffer bin 3 %, pre-bin 7 %, elevator flat 10.1 m/min (no throttle, see 1.5) (172.2 s) | MB1 **still 0 %**, pre-bin 1 % (342.2 s) | MB1 **still 0 %** after 696.8 s (11.6 min); OUTLOAD BUFFER BIN popup reads a flat `0.00 / 3.25 t` throughout, while SCALPING SCREEN DISCHARGE HOPPER (just upstream) backs up to `0.14/0.14 t` (100 %) and stays there — material arrives at the hopper and simply never crosses the grain-break/diverter branch. Re-selecting GRAIN BREAK after switching away and back did not unstick it. Re-tested at 20× out to 9745 s (2.7 h) with the same result | **FAIL** #141 |
| 2.6 | METAL BIN 2 (GRAIN BREAK + DIVERTER→MB2) | Same branch as 2.5; MB2 stayed at 0 % for the full duration of every run that routed there (same #141) | | | **FAIL** #141 (same bug) |
| 2.7 | FLEXICON (AUTO SAMPLER #1) | Flexicon pre-bin popup 0.00 t (right after RESTART) (318.3 s) | — (discharged a full batch between checkpoints, see Observations) | Flexicon pre-bin popup **0.10/1.80 t (5.6 %)** (423.8 s / 7.1 min) — flows normally; no graded throttle band (#139) so rate is flat, but grain reaches the destination | PASS |
| 2.8 | CONCETTI (AUTO SAMPLER #2) | Concetti pre-bin 3.8 % (199.4 s) | Concetti pre-bin **8 %** (346.1 s / 5.8 min) — reaches a comparable level to golden's 2.4 *faster* (golden: 7 % by 7.8 min), consistent with the missing throttle schedule (#139) letting it run at an unthrottled rate | — | PASS |

**Trip scenario checks**
| # | Scenario | Expected | Actual | Result |
|---|----------|----------|--------|--------|
| 3.1 | Treater buffer bin high (`bufferBinHighTrip`, no `armedWhen`) | Same message, same ~85%/7s timing, on both lines | **Golden**: `"TREATER BUFFER BIN \| above 85% for 7s, from yellow-bin area · 52.414.E00 closed"`. **Rebuilt**: `"TREATER BUFFER BIN \| above 85% for 7s, GRAIN IN closed"` (GRAIN IN stands in for the golden stub, #131). Same condition, delay and action on both | PASS |
| 3.2 | Metal bin high (`metalBin1HighTrip`), armed while routed there | Fires only while that destination is selected | **Golden**: filled to 86 % while routed to METAL BIN 1 — event log `"TREATED OUTLOAD METAL BIN 1 \| above 85% for 5s, PENDULUM CONVEYOR stopped"` fired exactly 5 s after crossing 85 %, correctly while still armed. Attempting the mismatched-destination case (switch away, force via slider) was inconclusive on a first pass (timing raced the natural crossing — see Observations) and not cleanly redone given time; RESET TRIPS correctly refused while the level was still above 85 % either way (`"reset commanded, still above 85%, remains latched"`). **Rebuilt**: cannot be exercised at all — the branch never receives grain (#141), so METAL BIN 1/2 can never cross 85 % | blocked by #141 (rebuilt side); golden side PASS on the armed-fire case, inconclusive on the specific mismatched-destination sub-case |
| 3.3 | Flexicon pre-bin high (`flexiconPreBinHighTrip`), **forced while routed to CONCETTI instead** (clean procedure: filled to ~48 % while armed, switched to CONCETTI — confirmed active via the button's own highlight and CONCETTI PRE-BIN visibly filling — then dragged Flexicon's own LSH slider down to 45 %, below the now-frozen level) | Golden stays silent (unarmed); rebuilt also stays silent once #138 is fixed | **Golden**: PENDULUM CONVEYOR kept running (9.5 m/min) throughout, and no Flexicon-related line appeared in the event log — correctly unarmed. **Rebuilt**: PENDULUM CONVEYOR stopped (0.0 m/min) and both inlet drum feeders stopped with it; event log: `"FLEXICON PRE-BIN \| above 45% for 5s, PENDULUM CONVEYOR stopped"` while CONCETTI was the active destination the entire time | **FAIL**, commented on #138 |
| 3.4 | Concetti high-high staged pause (close valve, stop conveyor, wait 25 s, if still true trip the whole line) | Golden fires all three `then` actions together, then escalates after exactly 25 s if still true | Filled Concetti pre-bin to 98 % (slowed the bagging scale's fill time to force accumulation, then restored it). At 4672.1 s: `"CONCETTI PRE-BIN \| above 95% for 5s, PENDULUM CONVEYOR stopped"`, `"...AFTER-BIN OUTLET VALVE closed"` and `"...NIKLAS WNS/200 BATCH TREATER stopped"` (the last from `concettiHighHighHoldTreater`, same watched condition) all logged at the same timestamp. At 4697.1 s — **exactly 25.0 s later** — `"CONCETTI PRE-BIN \| still above 95%, entire line tripped, operator restart required"` and the same from `UTILITIES`. The SAFETY panel's TRIP UTILITIES button changed to `"⚡ TRIPPED — RESET NEEDED"` | PASS |
| 3.4b | Concetti high-high recovery (`whenClears`: wait 30 s, start PENDULUM CONVEYOR, wait 10 s, open AFTER-BIN OUTLET VALVE) | Should fire once the bin drains back below 95 % | **Could not observe.** Once the line fully trips (3.4's 25 s escalation), every machine the `then` steps touch (valve, conveyor, treater) stays stopped, and nothing else in the UI drains CONCETTI PRE-BIN — RESET TRIPS repeatedly refused (`"reset commanded, CONCETTI PRE-BIN has not cleared, line remains tripped"`) while the level sat frozen at 98 % with no path to lower it short of a full RESTART (which would discard the run). Unclear whether a full-line trip is meant to be recoverable only via RESTART (losing all state) or whether a real operator action this UI doesn't yet expose (e.g. manually emptying the pre-bin) is meant to unstick it | QUESTION |
| 3.5 | Pendulum stop while a packaging feeder runs (`conveyorRunningInterlockFeeder1`/`2`) | Both inlet drum feeders stop within 1 s of the pendulum stopping, on both lines | Observed as a side effect of every pendulum-stop trip above, on **both** lines: `"PENDULUM CONVEYOR \| not running for 1s, INLET DRUM FEEDER 1/2 stopped"`, always exactly 1 s after the pendulum itself stopped (e.g. golden 1293.1→1294.2 s; rebuilt 9507.1→9508.2 s) | PASS |
| 3.6 | RESET TRIPS while the condition still holds | Refuses and says why, doesn't silently clear | Seen on both the metal-bin and Concetti cases above (`"remains latched"` / `"has not cleared, line remains tripped"`), and resumes correctly once the level has actually dropped (confirmed on the Flexicon/metal-bin latched cases by draining first, then RESET TRIPS successfully releasing the stopped machine) | PASS (observation, not separately counted) |

**Bugs filed / commented**
- #140 A rebuilt line's own SAVE output fails its own OPEN validation (duplicate level-switch/interlock name) (new)
- #141 Rebuilt line: grain never reaches either metal bin — GRAIN BREAK → OUTLOAD BUFFER BIN → DIVERTER branch stalls at 0 % (new)
- #142 No Build mode UI creates the zone fit-view shortcuts (new)
- #138 Interlocks window has no "armed while" blank (commented — confirmed the gap changes real behaviour, with repro)
- #139 No Build mode UI creates machine rules or feed rate derivations (commented — confirmed the gap changes real behaviour, with repro)

**Questions for the user**
- Once a Concetti high-high trip escalates to a full-line trip (25 s with no clear), is the intended recovery path only a full RESTART (discarding the run), or should some operator action in the UI (that doesn't exist yet) let the pre-bin drain so the `whenClears` sequence (wait 30 s / start / wait 10 s / open) can fire on its own? See check 3.4b.

**Observations**
- The destination/SOURCE buttons (golden) and the per-machine selectors + gate sliders (rebuilt) are all reset to the line's saved defaults by RESTART — a destination set *before* RESTART is silently lost. Cost one early run (had to be redone); every run after step 2 of this entry set destination strictly after RESTART.
- The sim keeps ticking in real wall-clock time regardless of how long a tool call takes between actions — there is no way to "pause" the browser between Playwright CLI calls. Every elapsed time quoted above is the value actually read at the moment of the check, not a value assumed from a fixed sleep.
- The event log panel only populates `eventsText` while open; it has to be reopened by hand after every BUILD↔SIM or line switch (noted already by C1, and confirmed again here).
- First attempt at check 3.2 (metal bin, mismatched destination) raced the natural fill against the destination-switch click and the trip fired while still armed (correct, but not the sub-case intended) — redone cleanly for check 3.3 (Flexicon) by switching far enough in advance of the natural 85% crossing that the ordering was unambiguous; 3.2 itself wasn't re-attempted given #141 already blocks the rebuilt side of the comparison that mattered most.
- Grain conservation held throughout, including around #141's stall: the discharge hopper correctly caps at its own 100 % capacity rather than overflowing once the branch below it stalls; nothing vanished, it just backed up.

**Follow-up combo ideas**
- Re-run G5's behaviour checks once #141 lands: confirm METAL BIN 1/2 reach comparable levels to golden's 13 %/36 % (5/10 min) and 12 %/45 %.
- Re-run check 3.3's procedure against `metalBin1HighTrip`/`metalBin2HighTrip` once #141 is fixed, to directly confirm the same `armedWhen` divergence check 3.3 found on the Flexicon branch.
- Once #140 is fixed, re-save G4 (or re-run G4) and confirm the committed `G4.json` re-opens without the patched workaround this run needed.

## C3 Delays, alarm-only rules and sliders

### C3 — 2026-10-19 — 158c589

**Result:** 15 PASS · 2 FAIL · 0 QUESTION · blocked by: none
**Tool:** Playwright CLI only

**Steps**
1. NEW LINE. Dragged Grain in, a custom Bin, a custom Drum feeder and Grain out onto the canvas; connected Grain in -> Bin -> Drum feeder -> Grain out (PROBLEMS reached 0). No console errors at any point in the session (checked after every major step).
2. In Build mode, raised GRAIN IN 1's own "source rate" field to its max, 20 t/h (its own Build-mode field, separate from the interlocks under test), so the bin could be driven to 80 % quickly and repeatably during timing tests; this never changed during the run except as noted.
3. INTERLOCKS → + ADD. WATCH = BIN 1, ABOVE, SWITCH = LSH, set point 80, FOR 5 s, THEN + MACHINE = DRUM FEEDER 1 → STOP. Sentence: "When BIN 1 is above 80 % for 5 s, stop DRUM FEEDER 1." (screenshot C3-2).
4. Switched to SIM, opened BIN 1's popup: exactly one slider besides the manual "fill level" jump control, "LSH set point 80 %" (screenshot C3-3).
5. Tested the delay at 1×: with the Drum feeder's own live gate slider (SIM-mode popup) held at 3 % (so inflow 20 t/h outpaces the ~0.5 t/h the feeder can pass), ran until BIN 1 crossed 80 %. BIN 1's own event log: `172.1s LSH ON at 80 % (setpoint 80 %)`, then `177.1s above 80 % for 5 s, DRUM FEEDER 1 stopped` — exactly 5.0 s (screenshot C3-6, elapsed shown 203.0 s after the trip).
6. Repeated step 5 at 5× (RESTART, same gate=3 % setup): `172.1s LSH ON…`, `177.1s …stopped` — again exactly 5.0 s (screenshot C3-8).
7. Repeated step 5 at 20× (RESTART, default gate=100 %, so the asymmetry was GRAIN IN's 20 t/h against the feeder's own ~16.7 t/h top rate instead): `422.5s LSH ON…`, `427.5s …stopped` — again exactly 5.0 s.
8. Tested the cancel: RESTART, gate=3 %, ran to the exact instant BIN 1's event log showed "LSH ON" (used a single run-code script that polls the page every 100 ms and clicks PAUSE the moment the text appears, since a human-speed round trip at 1× cannot react inside a 5 s window reliably — two earlier attempts at this missed the window and the trip fired anyway). Paused at elapsed 172.1/172.2 s, confirmed via event log that only "LSH ON" had fired. With the sim frozen, set GRAIN IN 1's rate to 0 (its own SIM-mode live slider) so the feeder's gate=3 % output now drains the bin net-negative, then resumed. 12+ s later (elapsed 184.5 s, i.e. past the 177.1 s the stop would have fired at), BIN 1's event log still showed only the one `172.1s LSH ON…` entry and no "stopped" entry ever appeared; the level read 80 % exactly (0.94/1.17 t), consistent with the condition clearing right at the boundary with no separate recover/hysteresis band on this switch (screenshot C3-7).
9. Tested the delay field's own limits: typed 0 into the delay box → committed as "0 s", sentence read "...for 0 s...", interlock still showed "will run" (valid). Typed 600 → accepted as "600 s". Typed 601 → silently clamped back to 600 on blur (the Stepper component's own `min`/`max`, confirmed in source: `Stepper label="delay" … min={0} max={600}`).
10. Built a second interlock on BIN 1: WATCH = BIN 1, BELOW, SWITCH = LSL, set point 20, FOR 3 s, THEN + ALARM only (no machine step) → sentence "When BIN 1 is below 20 % for 3 s, raise an alarm." (screenshot C3-4). Ran from a fresh RESTART (bin starts at 0 %, already below 20 %): event log `3.1s below 20% for 3s, ALARM` (screenshot C3-5). DRUM FEEDER 1's own popup was unaffected (its gate/cap readout never changed because of this interlock — the THEN list has only the alarm step, nothing else to affect a machine).
11. Earlier, while building the first interlock, added a MACHINE step (DRUM FEEDER 1) before pressing STOP: the window showed "THIS INTERLOCK WILL NOT RUN YET … Machines run on their own. A step can only stop a machine or close a valve. To leave DRUM FEEDER 1 running, remove this step." — the explanation check 3 asks for.
12. Tested bidirectional sync of the slider: in Build mode set the set point to 82 via the Interlocks window; switched to SIM — BIN 1's popup slider read "82 %" (screenshot confirms Build → SIM works). Separately, in SIM mode dragged the same slider to 60 % (confirmed via the input's own `.value` and its displayed label, both "60"); switched to BUILD and re-opened INTERLOCKS: the sentence and set-point field still read 80 %/82 % as last set from Build — the SIM-mode drag had no lasting effect at all (filed as #143).
13. Checked the custom Bin's slider limits via a read-only eval of the `<input type=range>`: `min="35" max="90"` — the Treater pre-bin's own limits, not a generic 0–100 range (known #137; also true for this combo's plain custom Bin, not just a bin carrying golden set points).
14. Checked both machines' Build-mode popups for a "signal delay" field: neither the custom Bin nor the custom Drum feeder has one ("This machine has no adjustable settings." for the feeder; the Bin's popup only offers name/tag/capacity). This matches `catalogue.js`'s own comment — "An item drops the golden machine's set point and signal delay fields, because those values live on the interlocks, and an added machine has none yet" — so no machine in a Build-mode line can ever show this field; scored PASS (N/A by design) rather than FAIL.
15. Deleted the LSH interlock (DELETE INTERLOCK → confirm DELETE IT). INTERLOCKS count dropped from 2 to 1. Switched to SIM: BIN 1's popup no longer offered the "LSH set point" slider, while "LSL recover" (from the still-present alarm-only interlock) remained (screenshot C3-9).

**Checks**
| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1 | Delay at 1× | Feeder stops ~5 sim-s after the 80 % crossing | LSH ON 172.1s → stopped 177.1s = 5.0s | PASS |
| 2 | Delay at 5× | Same, independent of speed | LSH ON 172.1s → stopped 177.1s = 5.0s | PASS |
| 3 | Delay at 20× | Same, independent of speed | LSH ON 422.5s → stopped 427.5s = 5.0s | PASS |
| 4 | Dip below set point before 5 s cancels the trip | No "stopped" event fires | Armed at 172.1/172.2s, level pushed back to 80%/falling, no "stopped" entry 12+s past when it would have fired | PASS |
| 5 | Delay accepts 0 s | Valid, interlock runs | "for 0 s", still "will run" | PASS |
| 6 | Delay accepts its max (600 s) | Valid | Accepted as 600 | PASS |
| 7 | Delay past the max is refused | Refused/clamped | 601 silently clamped to 600 on blur | PASS |
| 8 | Alarm-only raises an alarm/event | Event appears | `3.1s below 20% for 3s, ALARM` | PASS |
| 9 | Alarm-only changes no machine | No machine affected | THEN list has only the alarm step; Drum feeder's own popup never changed because of this rule | PASS |
| 10 | Window explains a step left without an action | Explanatory text shown | "Machines run on their own. A step can only stop a machine or close a valve…" shown for an un-set MACHINE step | PASS |
| 11 | Exactly one slider per switch in the bin's popup | 1 slider for 1 switch-based interlock | "LSH set point" slider shown, none extra | PASS |
| 12 | Slider label/limits come from the switch | Custom Bin's own range | Label correct ("LSH set point") but limits are 35–90 %, the Treater pre-bin's, not the custom Bin's own | FAIL #137 |
| 13 | Dragging the slider moves the trip point, Build → SIM sync | Interlocks sentence reflects a Build-mode edit when you open SIM | Editing to 82 in Build then opening SIM showed 82 % on the slider | PASS |
| 14 | Dragging the slider moves the trip point, SIM → Build sync ("back the other way") | Interlocks sentence reflects a SIM-mode slider drag when you return to Build | Dragging to 60 % in SIM had no effect once back in Build (still 80/82) | FAIL #143 |
| 15 | Machine's signal delay field matches the interlock's delay, where the item has one | N/A or matching | Neither custom item exposes this field at all (by design — catalogue.js strips it from every added machine) | PASS (N/A) |
| 16 | Delete the interlock → its slider disappears | Slider gone, others stay | "LSH set point" gone after delete; "LSL recover" (other interlock) stayed | PASS |
| 17 | No console errors | None | 0 errors throughout (checked after every major step) | PASS |

**Bugs filed / commented**
- #143 Dragging a bin's set point slider in SIM mode is lost on return to BUILD mode (one-way sync only) (new)
- #137 A custom Bin's set point sliders keep the Treater pre-bin's 35–90 % / 0–55 % limits and "LSL recover" label (existing, commented)

**Questions for the user**
- none

**Observations**
- Catching the "cancel before 5 s" behaviour by hand (clicking PAUSE after seeing an event-log line appear) is not reliable at 1×: a human-speed round trip through the Playwright CLI (open a snapshot, read it, click) easily takes longer than the 5 s window and the trip fires anyway, as happened on the first two attempts. A single run-code script polling the page every ~100 ms and clicking PAUSE itself, all inside one browser-side call, is what actually caught it.
- The Drum feeder's own popup (gate position / "interlock cap") never visibly changes when the interlock's STOP step fires — the only confirmation a STOP actually happened is the event log entry on the *watched* machine (BIN 1), never anything on the Drum feeder's own popup. Reading `src/sim/behaviors.js` shows the feeder stops through a separate `runPermit`, not the gate dial's own cap, so this is consistent with the engine's design, but combined with #135 (no machine popup has a running/stopped indicator) it means there is no UI-visible confirmation on the acted-upon machine itself that a stop interlock actually took hold — only the sentence/event log on the machine being watched.
- A custom Bin and custom Drum feeder fed at typical rates (grain in ≤ 20 t/h, feeder base ~16.7 t/h at 100 % gate) barely fill at all on this exact topology (Bin → Drum feeder → Grain out, nothing downstream pulling harder than the feeder itself lets through), so every timed test in this entry needed either GRAIN IN 1 turned up to its 20 t/h max, the feeder's own gate dialled down, or both, to reach the 80 % set point inside a reasonable test window.

**Follow-up combo ideas**
- Re-run this combo's check 14 once #143 is fixed, confirming a SIM-mode slider drag now shows up in the Build-mode sentence.
- A dedicated check for whether a STOP step on a gated feeder ever surfaces anywhere in that feeder's own popup (tracks #135's broader "no running/stopped indicator" theme, but specific to the interlock-stop case here).

## C4 Suggested interlocks

### C4 — 2026-10-20 — 346a1a0

**Result:** 13 PASS · 4 FAIL · 0 QUESTION · blocked by: none
**Tool:** Playwright CLI only

**Steps**
1. NEW LINE. Built a conveying chain mixing real and custom items, each wired port to port through the UI: Grain in → Bin (Custom) → Drum feeder (Custom) → Belt conveyor (Simatek B100) → Bucket elevator (Simatek E200) → Treater buffer bin → Outlet valve (Custom), leaving Outlet valve unconnected to Grain out (not needed for interlock-suggestion checks; its own output-not-connected problem was left on PROBLEMS). This single chain covers 5 of the 12 pairs: Bin→Drum feeder, Drum feeder→Conveyor, Conveyor→Bucket elevator, Elevator→Bin, Bin→Outlet valve. SAVE → `docs/findings-lines/C4.json`. Screenshot `C4-1.png` (first suggestion), `C4-2.png` (Elevator→Bin suggestion before dismiss), `C4-3.png` (full chain, FIT ALL).
2. After BIN 1 (fed by Grain in) crossed the only pair that reaches a real level condition in this chain, INTERLOCKS showed "BIN 1 +1 suggested — When BIN 1 is above 85 % for 5 s, close GRAIN IN 1." Ticked it (✓): INTERLOCKS count went 0→1, the row became a plain editable interlock ("will run …"), no longer marked SUGGESTED.
3. Verified it fires when run: switched to SIM, used BIN 1's own "fill level" jump slider to push it to 92 % (no Grain in flow-rate tuning needed), pressed RUN. Event log: `5.1s above 85% for 5s, GRAIN IN 1 closed`. Confirms check 3 (tick → normal interlock → runs).
4. After Bucket elevator → Treater buffer bin connected, INTERLOCKS showed a second group, "TREATER BUFFER BIN 1 +1 suggested — … stop BUCKET ELEVATOR 1." Dismissed it (✕): group vanished. Deleted the connection (selected the connection path on canvas → DELETE CONNECTION) and reconnected Elevator → Bin: no suggestion reappeared (still only the 1 accepted Bin 1 interlock). Reloaded the page (full page reload, autosaved "new line" restored): still no suggestion reappeared. Confirms check 4 (cross persists across both reconnect and reload).
5. NEW LINE (discarding the first scratch; confirmed via the "Discard the work on new line and start a new line?" dialog). Built Grain in → Diverter (Custom) → Metal bin + Bin (Custom) (two outlets, one real item one custom). INTERLOCKS showed **no** suggestion for either bin, despite both having a real level (LT/LSH instruments) and being connected. Screenshot `C4-4.png`.
6. Added a Pendulum conveyor (Simatek E200, no custom version exists) with its 3 outlets wired to 3 separate bins (Flexicon pre-bin, Outload buffer bin, a 3rd custom Bin). INTERLOCKS now showed **3** separate "+1 suggested" groups, one per bin, each proposing "… stop PENDULUM CONVEYOR 1." — confirms check 6 (grouped by machine, 3 distinct groups visible together). Screenshot `C4-5.png`.
7. Accepted the 3rd bin's suggestion (✓ → became a normal interlock, count 0→1). Deleted the Pendulum→Flexicon pre-bin connection (selected the connection, DELETE CONNECTION): the Flexicon pre-bin's still-pending (never ticked or crossed) suggestion disappeared along with it — confirms check 5 (delete removes an unaccepted suggestion). Re-queried `src/sim/behaviors.js`: `router` (Diverter) and `splitter` (Scalping screen) have no `stop` verb in their behaviour entries, while `routedTransportDelay` (Pendulum) does (`stop: stopVerb(commandRoutedTransportDelay)`) — the suggestion engine's `holdAction()` needs that verb, which explains step 5's empty result precisely and rules out a tooling artifact.
8. Added a Scalping screen (Custom) → Discard bin (Custom), wiring the screen's `out` port (not `waste`) to the bin's input. No suggestion appeared for the Discard bin either, confirming the same root cause as step 5 (splitter also has no stop verb). Filed as #145 (new); commented on #136 (existing, reconfirmed by steps 1's Drum feeder→Conveyor and Conveyor→Elevator legs, which never offered a conveyor-running suggestion).
9. On the same canvas, connected: Bin (custom)→Batch treater (Niklas WNS/200, real), Bin (custom)→Bagging scale (Concetti, real), Metal bin→Big bag filling head (Custom), and Vibrating conveyor (Custom)→Big bag filling head (Flexicon, real). None of the four produced a suggestion. All four destinations are `batchCycle` machines with no level/switch instrument, so `conditionOptions(line, destination).includes("above")` is false and no suggestion is possible by design — correct/sensible absence, not a bug. Screenshot `C4-6.png` (full combined canvas, FIT ALL).
10. Checked the console after every major step (`console error`) throughout: 0 errors, 0 warnings for the whole session (one React DevTools info line only).

**Checks**
| # | Check | Pair / item | Expected | Actual | Result |
|---|-------|-------------|----------|--------|--------|
| 1 | Suggestion on connect | Bin → Drum feeder | None sensible (destination has no level) | None appeared | PASS (N/A, correct) |
| 1 | Suggestion on connect | Drum feeder → Conveyor | A conveyor-running interlock ("when K1 stopped, stop F1") | None appeared | FAIL #136 |
| 1 | Suggestion on connect | Conveyor → Bucket elevator | A conveyor-running interlock | None appeared | FAIL #136 |
| 1 | Suggestion on connect | Elevator → Bin | "When ‹bin› above 85 %, stop elevator" | Appeared, worded exactly that | PASS |
| 1 | Suggestion on connect | Bin → Outlet valve | None obviously sensible (no golden-grounded pattern for this direction) | None appeared | PASS (N/A) |
| 1 | Suggestion on connect | Diverter → two Bins (Metal bin, custom Bin) | "When ‹bin› above 85 %, stop Diverter" on each | None on either bin | FAIL #145 |
| 1 | Suggestion on connect | Pendulum → Bins on each of 3 outlets | "… stop Pendulum conveyor" on each of the 3 bins | Appeared on all 3, each its own group | PASS |
| 1 | Suggestion on connect | Scalping screen → Discard bin | "When Discard bin above 85 %, stop Scalping screen" | None appeared | FAIL #145 |
| 1 | Suggestion on connect | Bin → Batch treater | None (destination has no level) | None | PASS (N/A) |
| 1 | Suggestion on connect | Bin → Bagging scale | None (destination has no level) | None | PASS (N/A) |
| 1 | Suggestion on connect | Bin → Big bag filling head | None (destination has no level) | None | PASS (N/A) |
| 1 | Suggestion on connect | Vibrating conveyor → Filling head | None (destination has no level) | None | PASS (N/A) |
| 3 | Tick adds it and it then works when run | BIN 1 (fed by Grain in) | Becomes a normal interlock; fires in SIM | Count 0→1, no longer SUGGESTED; `5.1s … GRAIN IN 1 closed` on run | PASS |
| 4 | Cross dismisses; doesn't come back on reconnect or reload | TREATER BUFFER BIN 1 (fed by Elevator) | Stays dismissed after delete+reconnect and after a full reload | Stayed dismissed both times | PASS |
| 5 | Deleting the connection removes an unaccepted suggestion | Pendulum → Flexicon pre-bin | Suggestion vanishes with the connection | Vanished immediately | PASS |
| 6 | Suggestions grouped by machine | 3 simultaneous Pendulum-outlet suggestions | One group header per machine | 3 distinct "▾ ‹BIN› +1 suggested" groups shown together | PASS |
| 7 | No console errors | Whole session | None | 0 errors / 0 warnings throughout | PASS |

**Bugs filed / commented**
- #145 A bin fed by a diverter or scalping screen gets no suggested high-level interlock (feeder has no stop verb) (new)
- #136 No conveyor-running interlock is suggested when machines are connected (existing, reconfirmed — commented with this combo's Drum feeder→Conveyor / Conveyor→Elevator repro)

**Questions for the user**
- none

**Observations**
- The suggestion engine (`src/line/suggestedInterlocks.js`) only ever looks one hop upstream of a bin. Where that one hop is a multi-output "router"-family machine with no `stop` verb (Diverter, Scalping screen), the bin gets no protection at all from suggestions, even though walking one more hop upstream (to whatever feeds the diverter) would often find something stoppable. Pendulum conveyor escapes this only because its particular behaviour kind (`routedTransportDelay`) happens to define `stop`, not because the one-hop logic is routing-aware.
- `/opt/pw-browsers/chromium` plus the Playwright CLI reliably connects ports only when query + mousedown + mousemove + mouseup are all issued inside one `run-code` call; splitting them across separate CLI invocations silently drops the drag (the pointerdown registers on the catalogue/body click but the subsequent move/up are dispatched against a fresh, button-up Playwright mouse object.  This cost several retries before the pattern above was adopted uniformly and should save time for any future CLI-driven session doing the same port-to-port wiring.
- A newly dropped catalogue item always lands at the same canvas point, which on a busy line can coincide pixel-for-pixel with an existing port (seen between a Flexicon pre-bin's output and a freshly dropped Bin's input, and separately between a Pendulum outlet and a Bin input). The fix each time was to move the new machine away immediately after dropping it, before wiring it.
- Opening the INTERLOCKS or PROBLEMS side panel narrows the canvas; a port that sits far right/top in world space (the Pendulum conveyor's outlets especially, which can be off the default viewport entirely) can end up physically covered by that panel even though its DOM coordinates look valid. Closing the panel before taking a fresh port-position reading avoided several otherwise-mysterious failed connections.

**Follow-up combo ideas**
- Re-run the Diverter and Scalping screen checks in this entry once #145 is fixed, confirming both now offer the same per-bin suggestion the Pendulum conveyor already gets.
- A dedicated check for whether the suggestion engine could walk more than one hop upstream past a non-stoppable router/splitter to the next stoppable machine, once #145's immediate fix is in.

## C5 Interlock lifecycle

### C5 — 2026-10-20 — ce5b7bf

**Result:** 6 PASS · 2 FAIL · 0 QUESTION · blocked by: none
**Tool:** Playwright CLI (`@playwright/cli`, session `C5`, its own headless Chromium at `/opt/pw-browsers/chromium`, viewport 1280 × 800/1400). Every change was made with real mouse and keyboard input: catalogue drags (the built-in `drag` command — HTML5 `draggable` items don't respond to raw `page.mouse` down/move/up, only to `locator.dragTo`), machine moves and port-to-port wiring (raw `page.mouse` down/move/up in one `run-code` call, with screen targets computed from each machine's own SVG `transform` and the canvas `<svg>`'s `getScreenCTM()` so drags land exactly regardless of the view's current pan/zoom), multi-select (click + held Shift + click, not `modifiers` on `page.mouse.click`, which Playwright ignores), Ctrl+C/Ctrl+V, popup slider drags, and the toolbar/INTERLOCKS-window controls. Scripts only read state (DOM text, `getBoundingClientRect`, `transform` attributes, the SAVE download, console messages). Dev server on port 5181.

**Steps**
1. Cleared localStorage (fresh browser), BUILD → NEW LINE. Dragged in Grain in, Bin (Custom), Drum feeder (Custom), Conveyor (Custom), a second Bin (Custom), and Grain out, wired Grain in → BIN 1 → DRUM FEEDER 1 → CONVEYOR 1 → BIN 2 → Grain out. PROBLEMS reached "no problems".
2. INTERLOCKS → accepted the two suggested high-level trips: "When BIN 1 is above 85 % for 5 s, close GRAIN IN 1." and "When BIN 2 is above 85 % for 5 s, stop CONVEYOR 1." Both saved as `reset: latched` (not shown in the sentence or the accept button — only visible by expanding the interlock's own panel; see Observations). + ADD a third, by hand: "When CONVEYOR 1 is stopped for 1 s, stop DRUM FEEDER 1." (AUTO) — the conveyor-running interlock on the feeder the ticket's Build asks for. Screenshot [C5-1](findings-img/C5-1.png).
3. **Check 1**: selected BIN 1 → DELETE MACHINE. PROBLEMS: "GRAIN IN 1: output not connected", "DRUM FEEDER 1: input not connected", "custom-bin-1: interlock lost a machine it depends on". INTERLOCKS: the rule moved to a "NO MACHINE YET" group, sentence "When … is above 85 % for 5 s, close GRAIN IN 1." SIM → RUN: ran to 7.9 s elapsed with no dialog, toast or console line. Screenshot [C5-2](findings-img/C5-2.png).
4. **Check 2**: back in BUILD (no SIM visit — UNDO disables after any SIM visit, confirmed again here, matching C2/G5), re-selected BIN 1 (still shown, undo hadn't run yet) → DELETE MACHINE → UNDO. BIN 1 and its interlock both reappeared intact (sentence back to "When BIN 1 is above 85 % …", PROBLEMS back to "no problems"). REDO removed both again (PROBLEMS (3), rule back under "NO MACHINE YET"). UNDO once more to restore. Screenshot [C5-3](findings-img/C5-3.png) (restored state).
5. **Check 3**: multi-selected BIN 1 + DRUM FEEDER 1 + CONVEYOR 1 (Shift+click; the feeder's own interlock watches the conveyor, so the conveyor had to be in the selection too for that rule to be "between them" and get copied — a plain "bin + feeder" pair here carries no interlock, since BIN 1's rule acts on GRAIN IN 1 and the feeder's rule is watching CONVEYOR 1, neither of which is the other half of that pair). Ctrl+C, Ctrl+V → DRUM FEEDER 2, CONVEYOR 2, BIN 3 pasted, overlapping; moved them clear, added a fresh Grain in/Grain out and wired BIN 3's input and CONVEYOR 2's output so the copy could run on its own. PROBLEMS "no problems". Screenshot [C5-4](findings-img/C5-4.png).
6. SIM → RUN. Forced BIN 2 (original half) to 92 % with its popup's fill-level slider: `5.1s BIN 2 above 85% for 5s, CONVEYOR 1 stopped`, then `6.1s CONVEYOR 1 not running for 1s, DRUM FEEDER 1 stopped` (global EVENT LOG). Let it run to 972 s: CONVEYOR 1 stayed at 0.0 m/min; CONVEYOR 2 read 30.0 m/min throughout, untouched. Screenshot [C5-5](findings-img/C5-5.png) (both rows, one stopped one running).
7. **Check 4**: BUILD → INTERLOCKS → + ADD, left every field blank. PROBLEMS listed three separate entries naming each blank ("needs a machine to watch", "needs a signal delay", "needs at least one step after \"then\""); the interlock's own panel showed the same three bullets under "THIS INTERLOCK WILL NOT RUN YET". Screenshots [C5-6](findings-img/C5-6.png) (PROBLEMS), [C5-7](findings-img/C5-7.png) (the interlock's own panel). SIM → RUN to 44.3 s: no dialog; global EVENT LOG's machine-filter chips never gained an entry for it; its own popup (N/A, it watches no machine) and the console (`playwright-cli console`, 0 errors/0 warnings) showed nothing either. Deleted the blank interlock afterward.
8. **Check 5**: first attempt used the accepted BIN 1 (HEADHOUSE BIN, see step 10) suggestion, which turned out to be LATCHED — forced its level to 92 %, it tripped, then raised its popup's own "above set point" slider live from 85 % to 100 % while still running: the slider value updated but GRAIN IN 1 never reopened and no release ever logged, even 800+ s later and the level long since back down to 43 % ([C5-8](findings-img/C5-8.png)) — correct LATCHED behaviour, not a release failure (see Observations). Switched that one interlock's RESET to AUTO and repeated cleanly: forced the level to 94 %, `122.8s above 85% for 5s, GRAIN IN 1 closed`; live-dragged the same slider to 100 % while still running (still at 94 % level, no RESTART) — `154.5s below 85% again, GRAIN IN 1 released`, about 2 s later (one sim tick at that speed). Screenshot [C5-10](findings-img/C5-10.png). Set the interlock back to 85 %/LATCHED afterward.
9. **Check 6**: selected BIN 1, renamed it "HEADHOUSE BIN" in the right panel. INTERLOCKS updated immediately: group header and sentence both read "When HEADHOUSE BIN is above 85 % for 5 s, close GRAIN IN 1." Screenshot [C5-9](findings-img/C5-9.png).
10. **Check 7**: BUILD → SAVE → [`docs/findings-lines/C5.json`](findings-lines/C5.json) (11 machines, 9 connections, 4 interlocks, including `suggested-high-custom-bin-1-grain-in-1` → `custom-bin-1`/HEADHOUSE BIN, both bin-trip interlocks saved `"reset":"latched"`). OPEN the same file back through the UI's file picker: loaded as "current line: C5", PROBLEMS "no problems", INTERLOCKS showed the same 4 rules worded identically, HEADHOUSE BIN's name and rule intact. Screenshot [C5-11](findings-img/C5-11.png).
11. **Check 8**: checked the console after every major step throughout (catalogue drags, wiring, delete/undo/redo, copy/paste, the two long RUNs, the blank interlock, the rename, SAVE/OPEN). 0 errors, 0 warnings the entire session (one React DevTools info line only).

**Checks**
| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1 | Delete a bin an interlock watches | Either the interlock goes with it, or it shows broken in PROBLEMS **and** blocks RUN with a clear message | PROBLEMS does flag it ("custom-bin-1: interlock lost a machine it depends on") and the interlock is shown broken, not silently pointing at nothing — but RUN is never blocked. SIM → RUN starts immediately and the dead interlock runs forever with no further message anywhere | **FAIL** #146 |
| 2 | Undo restores the bin and its interlock; redo removes both again | Yes | UNDO: BIN 1 and its interlock both came back, sentence intact, PROBLEMS clear. REDO: both gone again, PROBLEMS (3), rule back under "NO MACHINE YET" | PASS |
| 3 | Multi-select bin + feeder, copy, paste: copies carry their own interlocks pointing at copies, not originals; both halves run independently | Yes | Pasted CONVEYOR 2/DRUM FEEDER 2/BIN 3 carried a new interlock "When CONVEYOR 2 is stopped for 1 s, stop DRUM FEEDER 2." (own name, own target). Forcing the original's BIN 2 to trip stopped CONVEYOR 1/DRUM FEEDER 1 only; CONVEYOR 2 ran at a steady 30.0 m/min throughout | PASS |
| 4 | Start a blank interlock, leave it unfilled: sentence problems name each blank; RUN blocked or the interlock skipped with a message | Yes | PROBLEMS and the interlock's own panel both name all three blanks correctly. But RUN is never blocked, and the interlock is skipped with **no message anywhere** — not the UI, not the event log, not the console | **FAIL** #146 |
| 5 | Edit an interlock while running: the change takes effect live | Yes | With AUTO reset, live-dragging the popup's own set-point slider during RUN (no RESTART, elapsed kept climbing) immediately released the trip: `154.5s below 85% again, GRAIN IN 1 released`, ~2 s after the drag | PASS |
| 6 | Rename a machine: the sentence shows the new name | Yes | Renaming BIN 1 → HEADHOUSE BIN updated the INTERLOCKS group header and sentence immediately, no save/reload needed | PASS |
| 7 | SAVE and OPEN keep all interlocks | Yes | SAVE wrote all 4 interlocks (including the renamed machine's); OPENing that same file back through the UI reloaded all 4, worded identically, PROBLEMS clear | PASS |
| 8 | No console errors | None | 0 errors, 0 warnings for the whole session | PASS |

Screenshots: [C5-1 initial build, 3 interlocks](findings-img/C5-1.png) · [C5-2 RUN with a deleted bin's orphaned interlock, no warning](findings-img/C5-2.png) · [C5-3 undo restored](findings-img/C5-3.png) · [C5-4 copy/paste wired for independent running](findings-img/C5-4.png) · [C5-5 original stopped (0.0 m/min), copy running (30.0 m/min)](findings-img/C5-5.png) · [C5-6 PROBLEMS naming a blank interlock's three missing parts](findings-img/C5-6.png) · [C5-7 the same, from the interlock's own panel](findings-img/C5-7.png) · [C5-8 a LATCHED trip correctly ignoring a live set-point raise](findings-img/C5-8.png) · [C5-9 renamed machine, sentence updated live](findings-img/C5-9.png) · [C5-10 an AUTO trip releasing live mid-RUN after a popup slider edit](findings-img/C5-10.png) · [C5-11 OPEN reload, same 4 interlocks](findings-img/C5-11.png). Saved line: [C5.json](findings-lines/C5.json).

**Bugs filed / commented**
- #146 A broken or incomplete interlock doesn't block RUN and is skipped with no message anywhere (new — covers both check 1 and check 4)

**Questions for the user**
- none

**Observations**
- Accepting a *suggested* high-level-bin interlock (the ✓ button) saves it with `"reset":"latched"`, even though nothing in the accept flow, the sentence, or the collapsed row says so — AUTO/LATCHED is only visible by expanding the interlock's own panel. A hand-built interlock defaults to AUTO (shown pressed when left untouched). This is plausibly intentional (a real high-level trip latching for an operator to acknowledge is a defensible default) but cost real time here: the first pass at check 5 (step 8) initially looked like a live-edit-doesn't-take-effect bug, until expanding the panel showed LATCHED and explained the stuck-closed behaviour correctly. Worth the user confirming this is the intended default for suggested bin trips specifically.
- `page.mouse.click(x, y, { modifiers: [...] })` is accepted by Playwright but silently does nothing — modifier keys need `page.keyboard.down('Shift')` / `up('Shift')` wrapped around the clicks. Cost two failed multi-select attempts before switching.
- Catalogue items are native HTML5 `draggable`, not pointer-driven like on-canvas machine moves and port wiring; raw `page.mouse` down/move/up (which works fine for the latter two) never starts a native drag, so a catalogue-to-canvas placement silently no-ops. The CLI's own `drag <source> <target>` command (which uses Playwright's `locator.dragTo`) does work, but drops at the target locator's centre — every placed item lands in the same spot and has to be moved afterward.
- Machine moves and port wiring both go through raw pointer events inside one `run-code` call (per C4's note), but the destination screen coordinates have to be computed fresh from the machine's own SVG `transform` and the canvas's `getScreenCTM()` each time — the view's pan/zoom shifts (sometimes mid-sequence, after a FIT ALL or even after a preceding drag in the same batch) and a coordinate computed even 1–2 calls earlier can silently land on the wrong element, including the catalogue sidebar when it's open (which then started a brand-new catalogue drag instead of moving the intended machine, twice, needing cleanup).
- The right-hand side panel (INTERLOCKS, PROBLEMS, a machine's own panel) overlaps the canvas on top of it rather than resizing it; a world coordinate that maps under the panel is unreachable by mouse even though `getBoundingClientRect` reports it as present. Closing the panel before a drag targeting that area avoided several otherwise-mysterious no-op drags.
- BIN 2's own interlock (also LATCHED, from the suggestion) tripped naturally partway through the long check-3/5 runs simply from ordinary flow over several hundred sim-seconds (BIN 2 only fills, per #123/#126 — nothing pulls from it into Grain out), stopping CONVEYOR 1/DRUM FEEDER 1 independently of whatever check 5 was doing at the time. Not a bug — just a reminder that a bin wired straight to Grain out needs watching (or RESET TRIPS) on any run left going for minutes.
- Deleting BIN 1 and then adding a brand-new Bin (Custom) re-used the exact same auto-generated name ("BIN 1"), and reconnecting it the same way silently re-attached the previously-orphaned interlock — confirming the interlock is matched by the watched machine's **name**, not a stable id. A second, unrelated bin that happened to get the same default name would silently inherit a stranger's interlock. (Review 2026-10-21: it's the id, not the name. The new bin gets the freed id `custom-bin-1` again; filed as #147.)

**Follow-up combo ideas**
- Re-run check 1 and check 4 once #146 is fixed, confirming RUN now refuses to start (or gives a visible skip message) while PROBLEMS lists a broken/incomplete interlock.
- A dedicated check pairing a `BIN 2`-style bin-only-fills trap (#123) with a LATCHED high-level interlock, run long enough (10+ sim-minutes) to confirm it always trips exactly once and stays latched as expected, never double-fires.

## C6 Machine rules and feed rate links from scratch

### C6 — 2026-10-21 — f861ecd

**Result:** 7 PASS · 3 FAIL · 1 QUESTION · blocked by: none
**Tool:** Playwright CLI (`@playwright/cli`, its own isolated `C6` session), not the Playwright MCP or Claude in Chrome. Every change was made with real mouse and keyboard input: the catalogue drag-drop, canvas port/machine drags, the Interlocks window, machine popups and their sliders/textboxes, Ctrl+C/Ctrl+V, and OPEN/SAVE. Scripts only read state (`eval` on `getBoundingClientRect`/`.value`/`.textContent`, console log files, the SAVE download's JSON). Dev server on port 5181.

**Steps**
1. Read `docs/browser-testing.md`, the findings-file summary table, "Known broken items" and the G4 entry (the ticket's named precedent). Read `src/line/lineData.js`'s `machineRules` and `feedRateDerivations` arrays in full for the golden definitions (`preBinFeedSchedule`, `afterBinHoldTreater`, `concettiFeedSchedule`, and the three `feedRateDerivations`), and re-confirmed by code search that only `InterlocksWindow.jsx` touches rule data anywhere under `src/app`.
2. Fresh browser, `localStorage.clear()`, reload — golden line loads by default in SIM. BUILD → INTERLOCKS on golden: expanded TREATER PRE-BIN, which shows only a plain "+1 suggested" stop interlock, nothing naming `preBinFeedSchedule` ([C6-1](findings-img/C6-1.png)).
3. Checked popups: golden TREATER PRE-BIN (SIM) shows three sliders — LSL recover 35 %, LSH set point 85 %, LSHH trip set point 95 % — generated directly from `preBinFeedSchedule`'s own set points (no interlock involved, unlike G4's rebuilt line). The INLET DRUM FEEDER and BUCKET ELEVATOR popups show a "gate position"/"speed" slider labelled "interlock cap: NN %", which is in fact the *feed-rate-derivation* input, continuously commanded by the same rule.
4. BUILD → edited TREATER PRE-BIN's "LSH set point" textbox from 85 to 36, confirmed it persisted (textbox shows "36", tagged CHANGED) and carried into the SIM popup slider (also 36). RUN at 20×, then used the pre-bin's own "fill level" demo-override slider plus RESET TRIPS to drive its level past 36 % without waiting out the real multi-minute fill time. Event log recorded `"LSH ON at 36% (setpoint 36%)"` and `"feed schedule commanded to throttle (56% speed / 36% gate)"` — the edited value, not the golden default — and INLET DRUM FEEDER's live speed/gate readouts matched the throttle band's calibrated figures exactly ([C6-2](findings-img/C6-2.png)). Reverted LSH to 85 afterward (in-memory only; never saved over the real golden line).
5. On INLET DRUM FEEDER (SIM), dragged the "gate position" slider itself (ArrowLeft/Right) away from the schedule-commanded 55 %; the UI accepted it, relabelled it "OVERRIDE" in red, and the shared "PLOT RATE" chart's derived-rate line climbed to match the new gate position within a few sim-seconds, confirmed stable over 5+ s ([C6-3](findings-img/C6-3.png)).
6. Separately, re-checked known bug #143's one-way SIM→BUILD sync, this time against a machine-rule-sourced set point rather than an interlock one: dragged the same LSH slider in SIM to 58 %, then switched to BUILD — the TREATER PRE-BIN panel's "LSH set point" textbox still read 85, confirming the gap is general, not interlock-specific. Commented on #143.
7. BUILD → NEW LINE (discarded golden's unsaved edits via the app's own confirm dialog). Dragged onto the canvas, using the mouse (catalogue items are native HTML5 `draggable`, so `drag <source> <target>` was used for placement and raw `mousedown`/`mousemove`/`mouseup` for port-to-port wiring and machine repositioning): Grain in, a custom Bin ("BIN 1"), a custom Drum feeder, a custom Bucket elevator, a second custom Bin ("BIN 2"), a custom Batch treater. Wired Grain in → BIN 1 → Drum feeder → Elevator → BIN 2 → Batch treater (golden's `treaterBufferBin → treatDrumFeeder → treatingElevator → treaterPreBin → batchTreater` shape). PROBLEMS reached 2 (only the treater's own two outputs left dangling, irrelevant to this check).
8. INTERLOCKS on the new line: only the same two plain threshold suggestions appeared ("When BIN 1 is above 85 % …" / "When BIN 2 is above 85 % …"). Opened "+ ADD": the only fields are WATCH / IS / FOR / THEN (+MACHINE/+WAIT/+ALARM/+IF STILL TRUE/+TRIP LINE) — no rule-kind selector, no graded-band fields, no hold-next-batch option ([C6-4](findings-img/C6-4.png)). BATCH TREATER 1's own BUILD panel has exactly `batch size` and `cycle time`, nothing resembling `afterBinHoldTreater`. Deleted the blank interlock afterward. Commented on #139 with this repro.
9. Reloaded fresh (golden line back by default). BUILD, shift-clicked exactly the golden lane `[treaterBufferBin, treatDrumFeeder, treatingElevator, treaterPreBin]` (TREATER BUFFER BIN, INLET DRUM FEEDER, BUCKET ELEVATOR · TREATING, TREATER PRE-BIN — confirmed via the "4 MACHINES" side-panel listing those four and no others), Ctrl+C. OPEN'd the step-7 new-line file back in, clicked empty canvas, Ctrl+V. The four machines pasted as "… 1" copies, renumbered IDs (`treater-buffer-bin-1`, `drum-feeder-1`, `bucket-elevator-1`, `treater-pre-bin-1`) distinct from the step-7 machines' own `custom-*` ids ([C6-5](findings-img/C6-5.png)).
10. SAVE → downloaded JSON (`new-line.json`) shows `machineRules: [{"id":"preBinFeedSchedule-1", ..., "sensor":{"machine":"treater-pre-bin-1"}, "action":{"elevator":{"machine":"bucket-elevator-1"},"feeder":{"machine":"drum-feeder-1"}}}]` and `feedRateDerivations: [{"id":"treatingFeedRateDerivation-1","elevator":{"machine":"bucket-elevator-1"},"feeder":{"machine":"drum-feeder-1"}}]` — both rebound to the pasted copies' own ids, not the originals. SIM popup on the pasted TREATER PRE-BIN 1 shows LSL 35 %/LSH 85 %/LSHH 95 % (golden's own values) and 1.17 t capacity ([C6-6](findings-img/C6-6.png)). Committed as [`docs/findings-lines/C6.json`](findings-lines/C6.json): 10 machines, 8 connections, 0 interlocks, 1 machine rule, 1 feed rate derivation.
11. Checked console after each major step (golden edits, new-line build, paste): 0 errors, 0 warnings throughout.

**Checks**
| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1.1 | Where machine rules/feed rate links show — Interlocks window | Record exactly where, or nowhere | Nowhere: expanding a rule-covered bin shows only a generic plain-stop "SUGGESTED" interlock at the wrong set point (85 % flat, not the rule's graded bands/different trip); nothing in the window names or displays `preBinFeedSchedule`/`afterBinHoldTreater`/`concettiFeedSchedule` or any `feedRateDerivations` entry | PASS |
| 1.2 | Where machine rules show — bin popup/right panel | Record exactly where, or nowhere | Yes: a bin whose level a machine rule senses gets LSL/LSH/LSHH sliders (SIM) and matching textboxes (BUILD) generated directly from that rule's own set points — the only UI surface that touches rule *values*, confirmed distinct from G4's interlock-driven sliders since golden's pre-bin carries no interlock at all | PASS |
| 1.3 | Where feed rate links show — feeder/elevator popup | Record exactly where, or nowhere | Yes: the drum feeder's "gate position" and the elevator's "speed" sliders are the derivation's live inputs, labelled "interlock cap: NN %" while schedule-commanded; no numeric derived-rate (t/h) readout appears anywhere in a popup, only via "PLOT RATE"'s chart | PASS |
| 2.1 | Edit a machine rule's value (golden, BUILD) | Change saves and takes effect in the run | LSH 85→36 persisted (BUILD→SIM) and the live event log/feeder readouts matched the edited threshold exactly during RUN (step 4) | PASS |
| 2.2 | SIM-mode slider edit on a machine-rule set point, then switch to BUILD | Golden behaviour implied by #95: changes round-trip | Same one-way-only sync as known bug #143 (previously shown only for an interlock's set point): the BUILD-mode textbox still reads 85 after a SIM-mode drag to 58. Commented on #143 with this repro rather than filing a duplicate | **FAIL** #143 |
| 2.3 | Edit a feed rate link (drum feeder gate position) | Change saves and takes effect in the run | Manual SIM-mode drag overrides the schedule-commanded gate (relabelled OVERRIDE) and the derived-rate chart responds live within a few seconds (step 5) | PASS |
| 3.1 | Create a pre-bin feed schedule from scratch (NEW LINE, exact golden topology) | Some UI lets `preBinFeedSchedule`-equivalent behaviour be built | No UI path exists: Interlocks window offers only the same flat 85 % stop suggestion seen on golden's own line; its "+ ADD" editor has no rule-kind selector or graded-band fields of any kind (step 8, [C6-4](findings-img/C6-4.png)) | **FAIL** #139 |
| 3.2 | Create a hold-treater rule from scratch | Some UI lets `afterBinHoldTreater`-equivalent behaviour be built | No UI path exists: the Batch treater's own BUILD panel has only `batch size`/`cycle time`; no "hold next batch"/"block new batches" field anywhere | **FAIL** #139 |
| 3.Q | — | — | Should `preBinFeedSchedule`'s graded bands and `afterBinHoldTreater`'s hold-next-batch behaviour become Interlocks-window sentences (a "THEN throttle to X %" step; a "block new batches" action distinct from "stop"), or stay a separate, non-UI-editable rule type? Logged as a question, not a bug | QUESTION |
| 4 | Paste a golden group carrying a machine rule into a new line | The rule comes with it, rebound to the copies (#95) | Confirmed via the SAVE JSON: `preBinFeedSchedule-1`/`treatingFeedRateDerivation-1` both reference the four pasted copies' own new ids, not the originals, and the pasted bin's popup shows the golden set points live (step 9-10) | PASS |
| 5 | Console | No errors | 0 errors, 0 warnings for the whole session (golden edits, new-line build/wire, Interlocks form, paste, SAVE) | PASS |

**Bugs filed / commented**
- #139 No Build mode UI creates machine rules or feed rate derivations (existing, commented with this ticket's from-scratch repro)
- #143 Dragging a bin's set point slider in SIM mode is lost on return to BUILD mode (existing, commented confirming the gap also covers a machine-rule-sourced set point, not just an interlock one)

**Questions for the user**
- Should `preBinFeedSchedule`'s graded boost/normal/throttle bands and `afterBinHoldTreater`'s "block new batches" behaviour become expressible as Interlocks-window sentences (extending the WHEN/THEN grammar with a throttle-style THEN step and a distinct "block new batches" action), or should they stay a separate rule type that Build mode never lets a user create — reserved for whoever edits `lineData.js` directly?

**Observations**
- The golden pre-bin's LSL/LSH/LSHH sliders being generated by a *machine rule* rather than an interlock wasn't obvious from the UI alone — same field names, same slider layout as G4's interlock-driven case. Only the Interlocks window showing 0 interlocks on that bin (plus the code search) made the distinction clear.
- The feed-rate-derivation inputs (gate position, elevator speed) are reused, overloaded controls: the same slider is schedule-driven most of the time (read-only in effect, labelled "interlock cap") and becomes a free manual OVERRIDE the moment a user drags it, with no separate "feed rate link" control anywhere. A user who didn't already know the rule existed would have no way to tell these apart from an ordinary manual dial.
- The bin popup's own "fill level" slider in SIM mode is a real, working manual override of the simulated level (confirmed: dragging it past LSHH armed and fired a real `gradedFeedSchedule` trip), which is a handy testing shortcut (used here to avoid waiting out several real minutes of golden's slow natural fill rate) but isn't documented anywhere in the UI as doing anything beyond a cosmetic preview.
- Dragging a catalogue item onto the canvas needs the CLI's `drag <source> <target>` (HTML5 native drag); raw `mousedown`/`mousemove`/`mouseup` silently no-ops for catalogue placement, same as C4/C5 already noted, but *does* work correctly for on-canvas port-to-port wiring and machine repositioning once a machine already exists — the two gestures are driven by different event models in this app and need different Playwright techniques.
- PROBLEMS's badge count ("PROBLEMS (N)") lagged one render behind the panel's own list contents at least twice during this session (the list already showed the correct, smaller set of unresolved items while the header still showed the old N) — cosmetic only, never affected what SAVE actually wrote. (Filed in review as #148.)

**Follow-up combo ideas**
- Re-run checks 3.1/3.2 once #139 lands, and check 2.2 once #143 lands (on a machine-rule set point specifically, not just an interlock one, per this run's repro).
- A dedicated check driving the bin popup's manual "fill level" override through a *second* rule transition in the same run (e.g. boost → normal → throttle → trip → reset → boost again) to confirm the schedule's phase machine never gets stuck partway, since this run only exercised boost↔trip and trip↔boost, never the mid-bands.

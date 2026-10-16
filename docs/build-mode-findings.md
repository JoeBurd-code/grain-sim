# Build mode findings

The results of the `browser-test` combo sessions. How a session runs and what each
entry holds is set out in `docs/browser-testing.md`. The matrix of combos is
in the parent tracking issue, #96.

## Summary

Shows the latest run of each combo.

| Combo | Ticket | Last run | SHA | PASS | FAIL | QUESTION | Bugs |
|-------|--------|----------|-----|------|------|----------|------|
| S1 Edges & Storage smoke | #97 | 2026-10-16 | 0cae43a | 106 | 8 | 4 | #123 #124 #125 #126 |
| S2 Conveying smoke | #98 | | | | | | |
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
| Grain out shows no amount received and plots 0 t/h, so conservation can't be read at the end of a line. Discard bin popup also empty | #126 | S1 | No |

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

**Questions for the user**
- The ticket lists a real **Discard bin**, but the catalogue lists only the custom one. A real item with no maker and no sensors is hidden on purpose (#94). Is that what you want for the Discard bin?
- The custom **Discard bin** has no capacity setting at all, so it fills in about 85 s at 12 t/h and you can't change that. Should it get a capacity field with the custom 0.01–100 m³ range?
- A freshly added bin's level switches have no set points, so they never assert and nothing is logged until an interlock exists. Should catalogue bins carry default set points the way the golden bins do (95/85/35)?
- A fresh **Flexicon pre-bin** ships with LSL at 35 % and its set point slider, with no interlock. The other bins have none. Is that intended?

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

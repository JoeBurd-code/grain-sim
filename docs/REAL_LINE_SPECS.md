# Treater Line 2 — Real Line Specs (deciphered from technical drawings)

> **How to use this doc:** This is the durable record of everything extracted from the
> engineering drawings on 2026-06-12. A new session should read this instead of
> re-reading the PDF/screenshots. Confidence flags are inline: **[HIGH]** = read
> directly off the drawing, **[MED]** = inferred from layout/tag sequence, **[LOW]** =
> small print at the edge of legibility or guessed. **[CONFIRMED 2026-06-30]** = the
> engineer answered this on the returned worksheet (see below); it overrides any
> earlier confidence flag.
>
> **Engineer answers received 2026-06-30.** The engineer filled and returned the
> confirmation worksheet (`docs/treater-line2-filled-20260630 (1) (1).md`). Confirmed
> answers are merged into the sections below and tagged **[CONFIRMED 2026-06-30]**.
> Items the engineer left blank or deferred remain open and are listed in §12. This
> was a returned worksheet, not a live meeting; several answers point to follow-ups
> (supplier data, a spreadsheet of feeder rates, and 4 unseen drawing sheets).
>
> **PLC & SCADA Functional Description received 2026-08-05.** Document A2653FSD001
> V1.0 (draft, 2026/07/14, 95 pages) was analysed in full; the durable record is
> **`docs/PLC_FUNCTIONAL_DESCRIPTION.md`** and it should be read alongside this
> file. That document is the control-system authority (tags, interlocks, trip
> delays, start/stop order); this one remains the equipment-and-layout authority.
> Where they disagree the FD wins, because it is six weeks newer and internally
> consistent with its own SCADA mimic screens. Items merged in below are tagged
> **[FD 2026-08-05]**.
>
> **Headline corrections from the Functional Description (read these first):**
> - **Most unknown tags are now known and applied.** 13 of the 20 `TBC-nn`
>   placeholders in `src/line/lineData.js` resolved to real tags; a 14th
>   machine (`concettiMetalRemover`) was deleted outright. Six placeholders
>   remain, correctly, for machines genuinely outside the FD's scope; see
>   PLC_FUNCTIONAL_DESCRIPTION §2 for the full accounting. Highlights: metal
>   remover `52.501.F00`, buffer bin `52.502.H00`,
>   treating drum feeder `52.505.L00`, treating elevator `52.506.E00`, pre-bin
>   `52.507.H00`, treater `52.508.T00`, after-bin `52.601.H00`, Pro Box station
>   `52.608.H00`, outload buffer bin `52.610.H00`, discard scalpings bin
>   `52.801.L00`.
> - **Bulk density (~0.72 t/m³) was already resolved, in issue #18, not by this
>   document.** `src/sim/units.js` has carried this exact constant since #18
>   merged, derived from two bins already confirmed on 2026-06-30. §12 item 13
>   should have flipped to resolved back then and did not; corrected below. The
>   FD adds a third independent bin (pre-bin, 1.63 m³ / 1.17 t) that agrees to
>   within 1%, which is welcome corroboration, not a new finding.
> - **`52.701.H00` is the Flexicon Pre-Bin, not the outload buffer bin**, and
>   `52.702.U00` appears nowhere in the FD. The branch-B routing below is wrong; see
>   PLC_FUNCTIONAL_DESCRIPTION §8.3.
> - **The Concetti-branch metal remover does not exist.** The FD names one metal
>   remover on the whole line. This backs the engineer against the sheet 52-14
>   cross-reference, and settles §12 item 23.
> - **The interlock cause-and-effect matrix is fully documented**, with trip delays
>   of 1 s (device not running) and 5 s (level high). §12 item 14 closed.
> - **A high-level trip does not auto-recover.** Tripped devices need a SCADA reset.
>   The buffer bin's LSL is an Information alarm only, in no interlock table.
>
> **Headline corrections from the 2026-06-30 answers:**
> - **Sustained line rate is ~12 t/h, not 20 t/h.** 20 t/h is equipment capacity. The
>   **treater is the bottleneck**, not the Concetti bagging scale.
> - **Treatment does NOT meaningfully change density or mass** ("slight but
>   negligible"). The treater is a batch machine but is not a density/mass transformer
>   for modelling. This reverses the §10 "density change: YES" conclusion.
> - **Chemical/formulation input and the waste-water IBC are both out of demo scope**
>   (client manages dosing; waste water is a ~monthly cleaning event, not per-batch).
> - **Only one outload branch runs at a time** (A/B/C selected by operators), and only
>   one of the two 52-13 drum feeders runs at a time into lift 52.604.E00.
> - **Sim start point = the ~7.7 m³ buffer bin** (the engineer's "7T bin," after the 8
>   yellow bins). Everything upstream (colour sorter, yellow bins) is out of the
>   initial sim.
>
> **Vocabulary clarified 2026-06-17:**
> - **IBC** = Intermediate Bulk Container (1000 L plastic cube in a metal cage on a
>   pallet — used here to collect batch treater waste water for separate disposal).
> - **FUTURE POWDER DOSING STATION** (52.507.H01) = dashed hopper beside Treater
>   Pre-Bin on sheet 52-12; not yet installed; would dose dry powder chemical.
>   Represented in `lineData.js` as `chemStub`, name "future: powder dosing station".

---

## 1. Source documents

| Source | What it is | Location at time of reading |
|---|---|---|
| `AXX7Z000347-3-52-D-3303-13_Treater_Line 2_(52-13)_Big_Bag_Packaging_&_Outload_A3.pdf` | Sheet 52-13, full PDF (selectable text layer, so tags/legends from this sheet are exact) | `c:\Users\SOMO-CAD\Downloads\` |
| `Screenshot 2026-06-12 113741.png` | Sheet 52-12 (Treating area), image only | `c:\Users\SOMO-CAD\Downloads\` |
| `Screenshot 2026-06-12 113821.png` | Sheet 52-13 full view, image only | `c:\Users\SOMO-CAD\Downloads\` |
| `Screenshot 2026-06-12 113915.png` | Sheet 52-14 (Concetti bagging line 2), image only | `c:\Users\SOMO-CAD\Downloads\` |
| `A2653 Bayer TR&PUP - Line 2, and Sheller PLC, SCADA  Functional Description V1.0.pdf` | **PLC & SCADA Functional Description A2653FSD001 V1.0**, 95 pages, full text layer. Deciphered separately into `docs/PLC_FUNCTIONAL_DESCRIPTION.md` | `c:\Users\SOMO-CAD\Downloads\` |

Screenshots are images only, so all sheet 52-12 and 52-14 numbers are read visually
and carry lower confidence than sheet 52-13 text.

**Title block (sheet 52-13, exact):**

- Client: Bayer South Africa (PTY) Ltd
- Project: **THB TR&PU Project**, project phase **F.E.L 3**, plant section **51B**
- Drawing title: Treater Line 2 (52-13) Big Bag Packaging & Outload A3
- Client drawing no: `AXX7Z000347-3-52-D-3303-13`; vendor drawing no: `SOMO-0180-E-100-52-13`
- Vendor: SOMO Technical Solutions (PTY) Ltd. Drawn by Reece Bekker, checked by Chris Moult, approval pending
- Sheet **4 of 7**, format A3, NTS, print date 04/06/2026
- Revision history: I = addition of FCP IO (06/05/2026), J = revised per comments (06/05/2026), K = **revised bin sizes** (25/05/2026), L = **addition of pneumatic hammers** (04/06/2026, current)

**Drawing set structure: now fully enumerated [FD 2026-08-05].** The Functional
Description §3 lists all seven PIDs by number and title, which resolves the guesswork:

| Sheet | Client drawing no. | Title | Seen? |
|---|---|---|---|
| 52-10 | `AXX7Z000347-3-52-D-3303-10` | Tripper Cart | no |
| 52-11 | `...-3303-11` | Yellow Bins | no |
| 52-12 | `...-3303-12` | **Treating & Scalping** | screenshot |
| 52-13 | `...-3303-13` | **Big Bag Packaging & Outload** | full PDF |
| 52-14 | `...-3303-14` | **Concetti Packaging** | screenshot |
| 52-15 | `...-3303-15` | **Dosing Stations** (this is the "Formulation" sheet) | no |
| 52-16 | `...-3303-16` | Dust Extraction | no |

Also referenced: `...-3512-01` Process **Equipment Schedule** and `...-3572-01`
Process **FCP Schedule**. The equipment schedule is the document most likely to
carry the bin working volumes and rates still missing from §12; worth requesting
by name.

Sheets covering the upstream "Line 2 Yellow Bin Upgrade Project" area are
explicitly **out of project scope** (note on sheet 52-12).

Note the drawing itself is not final: several motors are marked `??kW` and pneumatic
line sizes are marked `¾"(TBC)`. FEL 3 = front-end loading stage 3, pre-detail-design.

## 2. Tag and drive conventions

Tag format: `52.NNN.Ttt` where `52` = Treater Line 2 area, `NNN` = equipment number
(sequence roughly follows process order; design comment says numbering was adjusted to
align with existing plant equipment), `T` = type letter, `tt` = unit index (00, 01...).

Type letters as observed **[MED, inferred from usage]**:

| Letter | Meaning | Observed examples |
|---|---|---|
| H | Hopper / bin | 52.701.H00 outload buffer bin; 52.613.H00/H01 outload metal bins; 52.705.H00 Concetti pre-bin |
| C | Conveyor | 52.702.C00; 52.704.C00..C03 motorised roller conveyors |
| U | Bucket elevator | 52.702.U00 Simatek E200 (packaging) |
| E | Elevator / lifting conveyor | 52.604.E00 (4 kW); 52.414.E00 (upstream elevator, out of scope) |
| L | Feeder | 52.603.L00/L01 inlet drum feeders; 52.703.L00 |
| V | Valve | 52.604.V00/V01, 52.609.V01, 52.611.V00, 52.612.V00, 52.613.V00/V01, 52.701.V00 |
| X | Gate / slide / chain-conveyor-like transport | 52.605.X00, 52.609.X00, 52.610.X00, 52.612.X00 |
| K | Scale | 52.704.K00 inline belt scale |
| F | Screen | 52.602.F00 treatment scalping screen |

Motor suffix on tags **[HIGH, from drawing]**:

- `.MVFD` = variable frequency drive (speed-controllable, ramps) — 52.702.C00, 52.704.C00..C03
- `.MDOL` = direct-on-line starter (fixed speed, on/off) — 52.703.L00
- `.MX` = Ethernet-controlled motor start (per instrument legend MX0) — 52.702.U00 (5,0 kW), 52.603.L00/L01 (0,15 kW each), 52.604.E00 (4,00 kW)

Known motor ratings: bucket elevator 52.702.U00 = 5.0 kW; inlet drum feeders = 0.15 kW
each; 52.604.E00 = 4.0 kW. All MVFD conveyor ratings are `??kW` (TBD on drawing).

Equipment status flags on the drawing: **NEW**, **RELOCATED**, **FUTURE** (dashed
symbol), **EXISTING**.

## 3. Flow-line, valve, and aspiration legends (sheet 52-13, exact)

Flow line types: **product flow** (red), LPG & chemical flow, **process waste flow**,
pneumatic flow, existing equipment, future equipment, **software or datalink**, dust
extraction.

Valve symbol types: pneumatic gate valve, 2-way motor operated valve, **2-way pneumatic
diverter valve**, manual gate valve.

Aspiration (dust extraction) points: existing yellow, new yellow, new Line 2 red. These
appear all over the sheets (triangle symbols); they are a parallel dust network, almost
certainly out of sim scope.

Instrument location symbols: field mounted; primary location = field control panel;
auxiliary location = local control room; control room. A second ring distinguishes a
**physical instrument** (readable only at its location) from **shared control in DCS or
PLC** (readable remotely, shareable via Modbus/Ethernet). PLC symbol set marks discrete
input/output, analog input/output, selector switch.

## 4. Instrument code legend (sheet 52-13, exact and complete)

| Code | Meaning |
|---|---|
| HS1 | Field Isolator (LCP1) |
| HS2 | E-Stop (LCP1) |
| HS3 | Start Request (LCP1) |
| HS4 | Stop Request (LCP1) |
| HS5 | Field Isolator (LCP2) |
| HS6 | E-Stop (LCP2) |
| HS7 | Start Request (LCP2) |
| HS8 | Stop Request (LCP2) |
| HS9 | Field Isolator (Drive End) |
| HS10 | Pull-Key (Side 1) |
| HS11 | Pull-Key (Side 2) |
| HS12 | Run Forward Request |
| HS13 | Run Backward Request |
| HS14 | Discharge Request |
| HS15 | Local/Remote Selector Switch (LCP1) |
| HS16 | Local/Remote Selector Switch (LCP2) |
| HS17 | Jog LEFT/RIGHT |
| ZA1 | Position Alarm Open |
| ZA2 | Position Alarm Closed |
| ZA4 | Belt Running Left |
| ZA5 | Belt Running Right |
| MX0 | Motor Start - Ethernet Controlled |
| ZS0 | Auto/Manual Feedback (LCP1) |
| ZS1 | Open Feedback |
| ZS2 | Close Feedback |
| ZS3 | Position 1 Feedback |
| ZS4 | Position 2 Feedback |
| ZS5..ZS8 | Belt Misalignment Switches (top-left, top-right, bottom-left, bottom-right) |
| ZS9 | Auto/Manual Feedback (LCP2) |
| ZS10 | Position 3 Feedback |
| ZS11 | Position 4 Feedback |
| ZS12 | Chain Tensioner Healthy Feedback |
| ZS13 | Actuator A Position Feedback |
| ZS14 | Actuator B Position Feedback |
| XV0 | Pneumatic OPEN/CLOSE |
| XV1 | Pneumatic CLOSE/OPEN |
| XV2 | Motor FWD |
| XV3 | Motor REV |
| XV4 | Opening Degree Position 1 |
| XV5 | Opening Degree Position 2 |
| XA0 | Safe Start Alarm |
| XA1 | Equipment Healthy Signal |
| XA2 | Equipment Running Signal |
| XA3 | Error Reset |
| XA4 | Ready Alarm |
| XS0 | Start/Stop Command |
| XS1 | Overload Indication |
| XS2 | Run/Ready Indication (LCP1) |
| XS3 | Misalignment / Pull Key / E-Stop Indication |
| XS4 | Start Empty Cycle |
| XS5 | Fault Status Indication (LCP1) |
| XS6 | Run/Ready Indication (LCP2) |
| XS7 | Fault Status Indication (LCP2) |
| XS8 | Local Control Command |
| XS9 | Position Left Indication |
| XS10 | Position Right Indication |
| SS | Speed Switch |
| ST | Speed Transmitter |
| LT | Level Transmitter (analog) |
| LS | Level Switch (In Position) |
| LSL | Level Switch LOW |
| LSH | Level Switch HIGH |
| LSHH | Level Switch HIGH HIGH |
| PSL | Pressure Switch |

Sim-relevant subset: **LT** (analog bin level), **LS/LSL/LSH/LSHH** (level trips,
LSHH being the classic safety trip), **SS/ST** (machine actually running/speed),
**ZS1/ZS2** (valve position confirmation), **XV0** (pneumatic open/close command),
**XS4 Start Empty Cycle** and **HS14 Discharge Request** (batch/discharge semantics),
**XA0 Safe Start Alarm** (start-up siren interlock), **ZS12** (elevator chain health),
**PSL** (elevator pressure switch).

## 5. Sheet 52-12 — Treating (from screenshot, no text layer)

### Equipment roster

| Equipment | Tag | Status | Specs / instruments | Confidence |
|---|---|---|---|---|
| Simatek E200 Bucket Elevator (upstream, "CONTINUED") | 52.414.E00 | EXISTING, out of scope | 20 t/h; hands ~12 t/h to the treating area. **Out of the initial sim** (engineer: "we do not need this in the initial flow simulator") | [CONFIRMED 2026-06-30] |
| Metal Remover | **52.501.F00** | NEW | **40 t/h** rating (oversized). PLC-controlled pneumatic magnet extraction (`XV0` open/close), cleared ~weekly into a bucket. **Must pass straight through with zero holdup, or the magnets fail** | [CONFIRMED 2026-06-30; tag FD 2026-08-05] |
| Treater Intermediary Buffer Bin ("7T bin") | **52.502.H00** (alarm table says `52.501.H00`, see PLC_FD §8.1) | RELOCATED | **7.7 m³ / 5.5 t confirmed.** `LT0` + `LSH0` + `LSL0`; pneumatic hammer `52.502.X00`; outlet valve `52.503.V01` (confirm-open `52.503.V00`). SCADA commands the yellow bins to discharge into it; yellow-bin pan feeders set to **12 t/h**; when it fills, `LSH0` trips elevator `52.414.E00` after **5 s**, which cascades to the feeders and bin valves. This is the **sim start point** | [CONFIRMED 2026-06-30; tag+interlock FD 2026-08-05] |
| Inlet Drum Feeder (treating side) | **52.505.L00** (inlet valve `52.505.V00`) | NEW | **Range 2-20 t/h, but NOT proportional** — % opening only ("10% ≠ 10%; 40% could be ~12 t/h; settings need review"). 220 V single-phase, own local controller, remote via SCADA. **Starts once the bucket elevator is confirmed running** (FD: process interlock "52.506.E00 not running"). FD confirms the mechanism: **two actuators A/B (`ZS13`/`ZS14`) and two discrete opening-degree positions (`XV4`/`XV5`)**, which is why it is not proportional | [CONFIRMED 2026-06-30; tag+mechanism FD 2026-08-05] |
| Simatek E200 Bucket Elevator - Treating | **52.506.E00** | NEW | 20.5 L/bucket, 10.08 m/min; ~176 buckets, ~105 m chain, ~8731 mm height, ~4584 mm lower horizontal (bucket count TBC by engineer). **Normal fill ~50%. Motor 1.5 kW with a VFD** (transport delay depends on speed; coast configurable). Instruments `LS0`, **`LSHH0`** (the only LSHH on the line), `PSL0`, `SS0`, `ZS12` | [CONFIRMED 2026-06-30 for fill/motor; tag+instruments FD 2026-08-05; bucket geometry MED/LOW] |
| Treater Pre-Bin | **52.507.H00** | NEW | **1.63 m³ / 1.17 t** (FD mimic label; supersedes the 1.62 m³ screenshot read). `LT0` + `LSH0` + `LSL0`; hammer `52.507.X00`. Feeds the batch treater continuously. **When full, `LSH0` trips the treating bucket elevator after 5 s** (the engineer's "slows then stops" is the VFD ramp; the PLC calls it a trip) | [CONFIRMED 2026-06-30; tag+volume+interlock FD 2026-08-05] |
| **Niklas WNS/200 Batch Treater** | **52.508.T00** | NEW | **Batch = 160 kg every ~40 s (≈14.4 t/h).** Batch phase breakdown (fill/treat/discharge) **still unknown, and now clearly a supplier question**: the PLC treats it as a plain start/stop object with `PT0` (pressure) and `XS2` (ready), so batching is internal to the Niklas machine. Chemical dose changes density **negligibly**. Chemical inlet from Dosing Stations (52-15) but **out of demo scope** | [CONFIRMED 2026-06-30; tag FD 2026-08-05; phase timing OPEN] |
| Chemical Dosing Stations 1-10 | **52.508.M00 - 52.517.M00** | | Each has `LT0` and three valves (`V00` fresh water, `V01` chemical, `V02` grey water). **In PLC scope** even though out of demo scope: "Activate Dosing Control" is a sequence step and "dosing control not running" is a 1 s trip on the whole line | [FD 2026-08-05] |
| Waste Water IBC Tank | unknown | | Waste water produced **only during cleaning, ~1×/month** (not per-batch). **Out of demo scope** (engineer: "does not need to be shown"). Not mentioned in the FD either | [CONFIRMED 2026-06-30] |
| Treater After-Bin | **52.601.H00** (outlet valve `52.601.V00`) | NEW | 0.67 m³; `LSH0` + `LSL0`; hammer `52.601.X00`. Discharges when the high-level switch is healthy. **When full, `LSH0` trips the treater `52.508.T00` after 5 s**: the batch interlock, now documented | [CONFIRMED 2026-06-30; tag+interlock FD 2026-08-05] |
| Treatment Scalping Screen | **52.602.F00** | | **64.4 t/h = capacity, well oversized.** **16 mm aperture; only oversize (>16 mm) goes to waste** (waste fraction tiny). `LSH0`, `LSL0`, and **`VT0` vibration transmitter** (high vibration is a safety interlock, and this is the "overload → drive trips" the engineer described). Product out to 52-13 via discharge hopper `52.603.H00` [FD-INFERRED]; scalpings to discard bin | [CONFIRMED 2026-06-30; instruments FD 2026-08-05] |
| Discard Scalpings Bin | **52.801.L00** | | Waste sink; emptied when full. `LSH0` | [CONFIRMED 2026-06-30; tag FD 2026-08-05] |

### Flow (sheet 52-12)

0. [8 yellow bins, out of scope] → each with a pan feeder set to 12 t/h, SCADA-commanded, feeding the buffer bin **[CONFIRMED 2026-06-30]**
1. [Out-of-scope yellow-bin area] → 52.414.E00 elevator **[HIGH]** (out of the initial sim)
2. 52.414.E00 → Metal Remover → Treater Intermediary Buffer Bin **[HIGH]** (removed metal → bucket, cleared ~weekly; pass-through, no holdup) **[CONFIRMED 2026-06-30]**
3. Buffer bin → Inlet Drum Feeder → Treating Bucket Elevator (lifts back to top) **[MED, inferred from layout: red line runs from buffer bin down across the bottom through the feeder/elevator and up to the pre-bin]**
4. Treating elevator → Treater Pre-Bin → Niklas WNS/200 Batch Treater **[HIGH]**
5. Formulation (sheet 52-15) → chemical line → treater **[HIGH on sheet, but OUT OF DEMO SCOPE per engineer]**; Future Powder Dosing Station → treater **[FUTURE, dashed, left out]**
6. Treater → Waste water → IBC Tank **[HIGH on sheet, but OUT OF DEMO SCOPE; ~monthly cleaning only]**
7. Treater → Treater After-Bin **[HIGH]**
8. After-bin → Treatment Scalping Screen 52.602.F00 **[MED-HIGH]**
9. Scalping screen → scalpings (waste) → Discard Scalpings Bin **[HIGH]**
10. Scalping screen → product → **to Inlet Drum Feeder 52.603.L00, sheet 52-13** (green off-sheet reference box, matches the reciprocal reference on 52-13) **[HIGH]**

## 6. Sheet 52-13 — Big Bag Packaging & Outload (from PDF, text layer exact)

### Equipment roster

| Equipment (drawing label) | Tag | Status | Specs / instruments | Confidence |
|---|---|---|---|---|
| Inlet Drum Feeder 1 | 52.603.L00 | NEW | 20 t/h, 0.15 kW, .MX | [HIGH tag+kW, MED which-is-which vs L01] |
| Inlet Drum Feeder 2 | 52.603.L01 | NEW | 20 t/h, 0.15 kW, .MX | [HIGH] |
| Pro Box Unloading Station | **52.608.H00** | NEW | **Returns treated, stored seed to be re-bagged; ~1 day/month.** Feeds its own drum feeder (feeders are two independent units, one per branch). Resolves the "hopper the engineer did not recognise" | [CONFIRMED 2026-06-30; tag FD 2026-08-05] |
| **Simatek E200 Bucket Elevator - Packaging** | **52.604.E00** | NEW | 4.0 kW (TBC) .MX, 20 t/h; **XA0 safe start alarm**, `LS0`/`LS1`/**`LS2` ("Outlet 3 (Waste) level switch")**, `PSL0`, `SS0`, `ZS12`, `XA4`; associated **Start-up Area Siren**. **Takes both drum feeders but only one runs at a time.** The FD calls this "Simatek E200 Bucket Elevator - Packaging" and never mentions `52.702.U00`, so the §8 spec block probably describes *this* machine; see PLC_FD §8.3 | [CONFIRMED 2026-06-30; naming FD 2026-08-05] |
| Top transport conveyor | **no tag; may not be a separate machine** | | `52.605.X00` turns out to be the Concetti auto sampler, not this. The FD's three branches hang off "Selected Simatek Pneumatic Outlet"s, i.e. probably the **upper horizontal run of pendulum conveyor `52.604.E00`** with pneumatically selected discharge points. **The one open item worth asking the engineer**; see PLC_FD §8.3 | [FD-INFERRED] |
| Simatek Pneumatic Outlet → Concetti | **52.604.V00** | NEW | `XV0` open / `XV1` close | [FD 2026-08-05] |
| Simatek Pneumatic Outlet → Flexicon | **52.604.V01** | NEW | `XV0` open / `XV1` close | [FD 2026-08-05] |
| Auto Sampler (Concetti branch) | **52.605.X00** | NEW | `XV0`; **pass-through, no holdup**; sample ~every 3 h | [CONFIRMED 2026-06-30; tag FD 2026-08-05] |
| Auto Sampler (Flexicon branch) | **52.609.X00** | NEW | `XV0`; same | [CONFIRMED 2026-06-30; tag FD 2026-08-05] |
| **Outload Buffer Bin** (this is the "Bin Segment") | **52.610.H00** | NEW | **4.51 m³ (3.25 t)**, `LSH0` + `LSL0`, **pneumatic hammer `52.610.X00`** (rev L); outlet valve `52.611.V00`; **SCADA-triggered discharge**. High level trips elevator `52.604.E00` after 5 s when this branch is selected | [CONFIRMED 2026-06-30 specs; tag FD 2026-08-05] |
| Outload Diverter Valve | **52.612.V00** | NEW | `ZS1`/`ZS2`/`XV0`; outload chute hammer `52.612.X00` | [FD 2026-08-05] |
| Grain Break | unknown, not in FD | NEW | on elevator discharge path (cascade chute slowing falling grain); **pass-through, no holdup**. The FD does not mention it, consistent with it being an unpowered chute | [CONFIRMED 2026-06-30] |
| Treated Outload Metal Bin 1 | 52.613.H00 | NEW | LT0 level transmitter; fed via inlet slide gate 52.613.V00 (NEW, ZS1/ZS2, XV0). High level trips `52.604.E00` after 5 s | [HIGH] |
| Treated Outload Metal Bin 2 | 52.613.H01 | NEW | LT0 level transmitter; fed via inlet slide gate 52.613.V01 (NEW, ZS1/ZS2, XV0) | [HIGH] |
| **Flexicon Pre-Bin** | **52.701.H00** (outlet valve `52.701.V00`) | RELOCATED | `LSH0` + `LSL0`. **Correction: `52.701.H00` is this bin, not the outload buffer bin** | [FD 2026-08-05] |
| **Vibrating Conveyor** | **52.702.C00** | RELOCATED | .MVFD; feeds the Flexicon filling head. **Correction: not `52.703.L00`** | [FD 2026-08-05] |
| **Flexicon Filling Head** | **52.703.L00** | RELOCATED | big-bag (IBC/FIBC) filling; .MDOL; HS17 jog left/right + LSL0 instruments appear in this area | [FD 2026-08-05] |
| Flexicon Line 2 Main Field Supply | unknown | RELOCATED | electrical supply panel, not process equipment | [HIGH] |
| Motorised Roller Conveyors 1..4 | 52.704.C00..C03 | RELOCATED | all .MVFD ??kW; carry the big bag through the filling station | [HIGH] |
| Inline Belt Scale | 52.704.K00 | RELOCATED | sits within the roller conveyor row (between conveyors 2 and 3 by layout) | [HIGH tag, MED position] |
| Start-up Area Siren | tied to 52.604.E00 (XA0) | NEW | **Sounds 20 s before any motion**; covers any equipment in the area | [CONFIRMED 2026-06-30] |
| Auto Samplers (Concetti + Big Bag branches) | unknown | NEW | **Pass-through, no holdup.** Sample taken ~every 3 hours / per QC team | [CONFIRMED 2026-06-30] |
| Outload Diverter | 52.613.V00/V01 | NEW | **A single diverter; operators decide which of bin 1/2 is fed** | [CONFIRMED 2026-06-30] |

Off-sheet references **[HIGH]**: in = "FROM TREATMENT SCALPING SCREEN 52.602.F00 -
SHEET 52-12"; out = "TO CONCETTI BAGGING LINE 2 PRE-BIN 52.705.H00 - SHEET 52-14".

Drum feeder instrument sets (repeated identically for both feeders) **[HIGH from text
layer]**: LS0, ZS13, ZS14 (actuator A/B position), XV4/XV5 (opening degree positions 1
and 2), XS0, XS4 (start empty cycle), HS1, XA3, XS8, XA2, XS2, XS5. So the drum feeders
have two discrete opening positions, two actuators, and an empty-out cycle.

### Flow (sheet 52-13)

Two infeeds converge, one distribution conveyor splits three ways:

1. Scalping screen product (from 52-12) → Inlet Drum Feeder (one of 52.603.L00/L01) **[HIGH]**
2. Pro Box Unloading Station → the other Inlet Drum Feeder **[HIGH]** (feeders are two independent units, one per branch) **[CONFIRMED 2026-06-30]**
3. Both drum feeders → 52.604.E00 (4 kW lift) → top transport conveyor. **Only one drum feeder runs at a time; they never run together** — this resolves the previously MED edge **[CONFIRMED 2026-06-30]**
4. Branch A: Simatek Pneumatic Outlet `52.604.V00` → Auto Sampler `52.605.X00` → **Concetti Bagging Line 2 Pre-Bin 52.705.H00 (sheet 52-14)**. **The metal remover on this branch does not exist** — the FD names exactly one metal remover on the line (`52.501.F00`, treating side) and the Packaging mimic shows none here, which backs the engineer against the sheet 52-14 cross-reference **[CONFIRMED FD 2026-08-05]**
5. Branch B: Simatek Pneumatic Outlet (third outlet, unnamed) → **Outload Buffer Bin `52.610.H00`** → outlet valve `52.611.V00` → diverter `52.612.V00` → inlet gates `52.613.V00`/`V01` → **Treated Outload Metal Bins 1/2 (`52.613.H00`/`H01`)**. **Corrected 2026-08-05**: there is no second bucket elevator and no `52.701.H00` on this branch; the earlier reading conflated the Flexicon pre-bin with the outload buffer bin **[FD]**
6. Branch C: Simatek Pneumatic Outlet `52.604.V01` → Auto Sampler `52.609.X00` → **Flexicon Pre-Bin `52.701.H00`** (+ outlet valve `52.701.V00`) → **Vibrating Conveyor `52.702.C00`** → **Flexicon Filling Head `52.703.L00`** → big bag riding Motorised Roller Conveyors 1..4 over the Inline Belt Scale 52.704.K00. **Corrected 2026-08-05**: the "Bin Segment" of the earlier reading is the branch-B outload buffer bin, not a separate bin on this branch **[FD]**
7. Discharge of Metal Bins 1/2 (truck outload?) — **not shown / not captured** (§12)

**The three branches run one at a time, selected by operators** (engineer: "only one
at a time"). Resolves the former §12-Q2 open question. **[CONFIRMED 2026-06-30]**

## 7. Sheet 52-14 — Concetti Bagging Line 2 (from screenshot, no text layer)

### Equipment roster

| Equipment | Tag | Status | Specs | Confidence |
|---|---|---|---|---|
| Concetti Bagging Line 2 Pre-Bin | 52.705.H00 | NEW | ~0.72 m³(?) | [HIGH tag, volume LOW] |
| Concetti Bagging Line 2 Scale | unknown | | ~12 t/h (rate unconfirmed on worksheet). **Note: no longer believed to be the line bottleneck — the treater is** | [MED, rate still OPEN] |
| Concetti Bagging Line 2 Filling & Sewing | unknown | | fills + sews bags | [HIGH] |
| Concetti Bagging Line 2 Main Field Supply | unknown | | electrical panel | [HIGH] |
| Inline Belt Scale | unknown | | checkweigher after filling | [MED] |
| Inline Weigher Conveyor | unknown | | | [MED] |
| Palletiser Conveyor 1, 2 | unknown | | | [HIGH] |
| Pallet Index Conveyor 1, 2 | unknown | | | [HIGH] |
| Concetti Palletiser 2 | unknown | | | [HIGH] |
| Incline Roller Conveyor 1, 2 | unknown | | | [HIGH] |
| Decline Roller Conveyor 1, 2 | unknown | | | [HIGH] |
| Pallet Magazine Conveyor 1, 2 | unknown | | empty-pallet supply | [HIGH] |

Entry reference: "FROM METAL REMOVER ... SHEET 52-13" **[HIGH]** (confirms a metal
remover on 52-13's Concetti branch).

### Flow (sheet 52-14)

Pre-Bin 52.705.H00 → Bagging Scale (~12 t/h) → Filling & Sewing → inline belt scale /
inline weigher conveyor → palletiser conveyors → pallet index conveyors → Concetti
Palletiser 2 → incline roller conveyors → decline roller conveyors → pallet stack
**[MED on exact conveyor ordering]**. Pallet magazine conveyors feed empty pallets to
the palletiser.

**Grain-flow modelling ends at the bagging scale/filler**: everything after it is
discrete bag-and-pallet handling. Natural sim sink = bagged product counter.

## 8. Bucket elevator spec blocks

Both are Simatek E200 **pendulum** bucket conveyors (Z-shaped path: lower horizontal →
vertical lift → upper horizontal), which is why they have horizontal run lengths.

| Parameter | Packaging elevator 52.702.U00 (sheet 52-13, exact) | Treating elevator (sheet 52-12, low-res) |
|---|---|---|
| Volume per bucket | 20.5 L | 20.5 L |
| Chain speed | 10.08 m/min | 10.08 m/min |
| No. of buckets | 196 | ~176 |
| Chain length | 120 m | ~105 m |
| Height | 9157 mm | ~8731 mm |
| Lower horizontal | 7084 mm | ~4584 mm |
| Upper horizontal | 14846 mm | not captured (cut off) |
| Motor | 5.0 kW, .MX (fill to confirm, 50% normal) | **1.5 kW with VFD** [CONFIRMED 2026-06-30] |
| Normal operating fill | **50%** [CONFIRMED 2026-06-30] | **50%** [CONFIRMED 2026-06-30] |

Operating output table for 52.702.U00 (exact, at 100% speed / 50 Hz):

| Filling degree | TPH | kg/min |
|---|---|---|
| 70% | 20.84 | 347.29 |
| 55% | 16.37 | 272.87 |
| 15% | 4.47 | 74.42 |

Derived figures (computed, not on drawing):

- Full chain circuit: 120 m at 10.08 m/min ≈ **11.9 min**; treating elevator ≈ 10.4 min.
- Carrying-side transit (roughly half the loop) ≈ **6 min** of pure transport lag.
- Bucket pitch = 120 m / 196 ≈ 0.61 m; bucket pass rate = 10.08 / 0.61 ≈ 16.5 buckets/min.
- **Bulk density has been known since #18: ~0.72 t/m³**, derived from the buffer bin (7.7 m³ / 5.5 t) and outload buffer bin (4.51 m³ / 3.25 t), and coded in `src/sim/units.js`. **[FD 2026-08-05]** adds a third independent bin (pre-bin, 1.63 m³ / 1.17 t) that agrees to within 1%, confirming the existing constant. Use **0.72 kg/L** for maize.
- **The §8 anomaly is therefore not a density problem, it is a geometry problem.** At 0.72 kg/L, a 70%-full 20.5 L bucket holds 10.33 kg, so the table's 347.29 kg/min needs **33.6 buckets/min** against the 16.5 the drawing geometry gives: a factor of **2.04**. Either the chain speed is really ~20.5 m/min (10.08 misread), or the pitch is really ~0.3 m (196 counting pairs or one strand). **Still open**, but the consequence is bounded: carrying-side transit is either ~3 min or ~6 min. Both are large enough for the delayed-cascade thesis, so nothing is blocked. Worth one line in an engineer email. Note the elevators actually run at **50% fill, not the 70% table row**.

## 9. End-to-end line summary (one paragraph)

Raw/cleaned seed arrives from the out-of-scope yellow-bin area via elevator 52.414.E00,
passes a metal remover into a 7.7 m³ buffer bin, is metered by a drum feeder into the
treating bucket elevator, and lifts to a 1.6 m³ pre-bin feeding the **Niklas WNS/200
batch treater** (chemical from Formulation sheet 52-15, waste water to an IBC). Treated
seed surges through a 0.67 m³ after-bin to the **scalping screen 52.602.F00**, which
discards scalpings to a waste bin and sends product to sheet 52-13. There it lands in
an inlet drum feeder (a second drum feeder takes returned product from the **Pro Box
unloading station**), lifts via 52.604.E00 to the top distribution conveyor, and splits
three ways: (A) through an auto sampler and metal remover to the **Concetti bagging
line 2** (pre-bin → ~12 t/h scale → fill/sew → palletiser); (B) into the outload buffer
bin, up the **packaging bucket elevator 52.702.U00**, through the grain break and
diverters into **treated outload metal bins 1 and 2**; (C) through an auto sampler into
the 4.51 m³ **bin segment**, then Flexicon pre-bin → vibrating conveyor → **Flexicon
big-bag filling head** (bag on roller conveyors over an inline belt scale). Equipment
capacity is ~20 t/h, but **sustained line rate is ~12 t/h, choked at the batch treater**
(160 kg / ~40 s ≈ 14.4 t/h), which the engineer names as the slowest point. Only one of
the three outload branches runs at a time, selected by operators. The product is **maize,
always the same crop**, with size/shape varying ~10%. **[CONFIRMED 2026-06-30]**

## 10. What this resolves for the sim (vs PROJECT_BRIEF §7 open questions)

- **Density change: effectively NO (reversed 2026-06-30).** The engineer says the dose
  changes seed density/weight only "negligibly." The treater is still a batch machine
  but is **not** a meaningful density/mass transformer for the model. The former
  "transformer-primitive" reading is dropped. Chemical is client-managed and out of
  demo scope; waste water is a ~monthly cleaning event (also out of scope).
- **Recirculation: NONE seen.** All three sheets form a DAG. Elevator return legs are
  mechanical loops, not material loops. (Open question answered, pending engineer
  confirmation.)
- **Batch machine confirmed:** Niklas WNS/200 with pre-bin and after-bin on either side
  is exactly the accumulator-bounded batch pattern.
- **Splitters confirmed everywhere:** scalping screen (product/waste), 2 metal removers
  (product/contaminant), top conveyor 3-way distribution, bin 1/2 diverter pair.
- **Sinks:** 3 product sinks (Concetti bagged, Flexicon big bags, bulk outload metal
  bins) + 1 in-scope waste sink (discard scalpings bin). Waste-water IBC and removed-
  metal bucket are real but **out of demo scope** per the 2026-06-30 answers.
- **Transport lag is real and large:** ~6 min carrying-side transit per elevator at
  10 m/min; this alone powers the delayed-cascade thesis.
- **Ramp-down vs instant stop maps to drive types:** MVFD conveyors ramp; MDOL stops
  near-instantly; elevators (MX) have spin-down plus several minutes of in-transit
  material.
- **Sensors for the control layer [updated FD 2026-08-05]:** analog `LT0` on the
  buffer bin, treater pre-bin, Concetti pre-bin, both metal bins and all eight yellow
  bins; `LSH0`/`LSL0` pairs on the buffer bin, pre-bin, after-bin, scalping screen,
  outload buffer bin, Flexicon pre-bin and Concetti pre-bin; **exactly one `LSHH0` on
  the whole line, on treating elevator `52.506.E00`** (this closes the "LSHH placement
  TBD" question); `SS0`/`PSL0`/`ZS12`/`XA4` on all three bucket elevators; `VT0`
  vibration on the scalping screen; `ZS1`/`ZS2` on every pneumatic valve; per-area
  E-stops and pull-keys.
- **Interlock flavour: fully documented [FD 2026-08-05].** See
  `docs/PLC_FUNCTIONAL_DESCRIPTION.md` §5 for the complete cause-and-effect matrix
  and §6 for the timing constants. In brief: level-high conditions trip after **5 s**,
  "device not running" conditions after **1 s**, safety conditions immediately; a trip
  stops the device with no shutdown procedure and **requires a SCADA reset**; the
  start sequence runs strictly **downstream-first** and the stop sequence strictly
  **upstream-first**, so a controlled stop drains the line and a trip does not.
  XA0 safe start alarm + start-up siren confirmed as step 1 of every sequence.
- **Choke-point story (revised 2026-06-30):** ~20 t/h capacity but ~12 t/h sustained,
  **choked at the batch treater** (160 kg / ~40 s ≈ 14.4 t/h), buffered by 0.67-7.7 m³
  bins. The pre-bin-full → elevator-slows-then-stops and after-bin-full → no-next-batch
  interlocks are where backups and holds happen. LSH/LSL trips confirmed on pre-bin,
  after-bin, buffer bin, outload buffer bin, bin segment, Flexicon pre-bin.

## 11. Known reading uncertainties (recap)

- Screenshot-sourced volumes now **confirmed** by the engineer: 7.7 m³/5.5 t (buffer),
  **1.63 m³/1.17 t** (pre-bin, corrected by the FD mimic), 0.67 m³ (after-bin),
  64.4 t/h (screen capacity), 4.51 m³/3.25 t (outload buffer bin). Still unconfirmed:
  0.72 m³ (Concetti pre-bin), the treater elevator bucket count, and every outload
  metal bin / Flexicon pre-bin working volume. **The `...-3512-01` Process Equipment
  Schedule named in the FD is the document most likely to carry these**, worth
  requesting by name.
- Edge 52.603 drum feeders → 52.604.E00 → distribution is **confirmed** (only one feeder
  at a time). No longer a MED edge.
- **Concetti-branch metal remover (#23): RESOLVED, drop it.** The FD names one metal
  remover on the whole line and the Packaging mimic shows none on this branch, so two
  independent sources now agree with the engineer against the sheet 52-14 reference.
- **`52.608.H00`: RESOLVED.** It is the **Pro Box Unloading Station**, which is why the
  engineer did not recognise it as a distribution hopper. There is no paired
  distribution conveyor.
- **Tag↔name mapping: essentially resolved [FD 2026-08-05].** See
  `docs/PLC_FUNCTIONAL_DESCRIPTION.md` §2 for the full register. Two residual
  disputes (buffer bin `52.502.H00` vs `52.501.H00`; scalping bin `52.602.F00` vs
  `52.603.H00`) are internal FD typos, documented in PLC_FD §8.1-8.2. `52.605.X00`
  turned out to be the Concetti **auto sampler**, which leaves the **top transport
  conveyor with no tag at all** and raises the question in PLC_FD §8.3 of whether it
  is a separate machine.
- Where removed metal goes: **answered** (bucket, cleared ~weekly). Sampler take-offs:
  frequency answered (~3 hourly / per QC), destination still unstated.
- The §8 elevator throughput inconsistency **narrowed but not closed**: density is now
  known good at 0.72 t/m³, so the discrepancy is a factor-of-2 geometry question
  (chain speed or bucket pitch), not a density question.

## 12. Status after the 2026-06-30 answers and the 2026-08-05 Functional Description

> The confirmation worksheet (`docs/TREATER_LINE2_WORKSHEET.md`) was returned filled on
> 2026-06-30 (`docs/treater-line2-filled-20260630 (1) (1).md`). The PLC & SCADA
> Functional Description was analysed on 2026-08-05
> (`docs/PLC_FUNCTIONAL_DESCRIPTION.md`). Items below are marked **[RESOLVED]** or
> **[OPEN]**; those the FD closed are tagged **[FD]**. Resolved answers are already
> merged into §1-§11 above.
>
> **Scoreboard: 16 of the 29 items are now closed, up from 8 of the original 25.**
> (The FD itself raised 4 new items, 26-29, which is why the total grew.) 4 more are
> partial. Every remaining open item is either equipment *sizing* data (which the FD
> was never going to carry, and which the `...-3512-01` Process Equipment Schedule
> probably does) or a demo-scope decision that is ours to make.

**Topology:**

1. **[RESOLVED, FD]** Tag↔name mapping essentially complete; see PLC_FD §2. Two residual
   internal-typo disputes documented in PLC_FD §8.1-8.2.
2. [RESOLVED] Three branches run **one at a time, selected by operators**. The FD's six
   route variants confirm this: one destination is selected per sequence start.
3. **[OPEN]** Treated Outload Metal Bins 1/2 discharge (truck loadout, gate logic). The
   FD does not cover it either; `52.613.V00`/`V01` are *inlet* gates.
4. [RESOLVED] Pro Box = returns treated stored seed to be re-bagged, ~1 day/month. **[FD]**
   confirms it bypasses the treater entirely (`52.608.H00` → `52.603.L01` → `52.604.E00`
   → destination).
5. **[PARTIAL, FD]** All seven PID sheets are now enumerated by number and title (§1), so
   they can be requested precisely. Sheets 52-10, 52-11, 52-15, 52-16 still unseen.

**Per-machine behaviour:**

6. **[PARTIAL]** Batch = 160 kg / ~40 s. Phase breakdown still **[OPEN]**, and the FD makes
   clear it is a **supplier question, not an engineer one**: the PLC treats `52.508.T00`
   as a plain start/stop object, so batching is internal to the Niklas machine.
7. **[PARTIAL, FD]** Drum feeder mechanism now confirmed (two actuators A/B `ZS13`/`ZS14`,
   two discrete opening-degree positions `XV4`/`XV5`), which explains *why* it is
   non-proportional. Exact opening→flow values still **[OPEN]**; still the line's one
   genuinely load-bearing gap.
8. [RESOLVED] 64.4 t/h = oversized screen capacity; 16 mm aperture, only oversize wasted.
   **[FD]** adds `VT0` vibration high as the overload trip.
9. [RESOLVED] Auto samplers and grain break are pass-through.
10. **[PARTIAL]** Density resolved (see 13), so the §8 anomaly is now a bounded factor-of-2
    geometry question. Fill confirmed at 50% (not 70%). Spin-down time still **[OPEN]**;
    `PSL0` **[RESOLVED, FD]** as a safety interlock (plant air / chain tensioner) on all
    three elevators.
11. **[OPEN]** Flexicon filling head: bag size, fill time, bag-change time. Not in the FD.
12. **[OPEN]** Concetti line: bag size, sustained t/h, pre-bin volume. Not in the FD, and
    the FD confirms why: the Concetti line past pre-bin `52.705.H00` is a **vendor package
    outside this PLC's scope** (no tags for its scale, filler or palletiser).
13. **[RESOLVED, but was actually closed by issue #18, not by this document.]**
    Crop = maize, ±10% size/shape, **bulk density ≈ 0.72 t/m³**. This register
    entry was left open by mistake for weeks: `src/sim/units.js` has carried
    `BULK_DENSITY_T_PER_M3 = 0.72` since #18 merged, derived from two bins
    already confirmed on 2026-06-30. The FD (2026-08-05) adds a third
    independent bin that agrees to within 1%, corroborating the existing
    value rather than resolving anything. See §8.

**Control/interlock:**

14. **[RESOLVED, FD]** Full cause-and-effect matrix in PLC_FD §5, both directions
    (level-high trips upstream; "not running" blocks downstream).
15. **[RESOLVED as far as it can be, FD]** There are no fixed VFD ramp figures to find:
    monitoring time, feedback validation and start/stop delays are **per-device
    operator-adjustable parameters** on the SCADA faceplate. They are commissioning
    values. This retroactively justifies exposing them as sliders in the sim.
16. **[RESOLVED, FD]** Signal latency is documented and quantised: **1 s** for "device not
    running / not open / not in position", **5 s** for any level-high or position-feedback
    condition, immediate for safety conditions. The buffer-bin cascade totals ~7 s.
17. **[RESOLVED, FD]** Exactly one LSHH on the line: `52.506.E00.LSHH0`, on the treating
    bucket elevator, alarm class Error.
18. **[RESOLVED, FD]** Full ordered start and stop lists for all six routes (PLC_FD §4).
    Start is strictly downstream-first, stop strictly upstream-first. Siren remains 20 s.
19. **[OPEN]** Which parameters the engineer most wants tunable. Still ours to ask, though
    item 15 suggests the honest answer is "the ones the SCADA already exposes".

**Demo-scope decisions (ours):**

20. [RESOLVED] Truncate: **source = the 7.7 m³ buffer bin** (engineer's stated start
    point); sinks = bag/bin counters. Upstream (colour sorter, yellow bins) excluded.
21. [RESOLVED, **with a caveat from the FD**] Chemical/formulation and waste water stay
    out of demo scope. But note the FD puts a 10-station dosing area (`52.508.M00` -
    `52.517.M00`) squarely **in PLC scope**, with "dosing control not running" as a 1 s
    trip on the whole line. The exclusion is still the right demo call; it is just not a
    free one.
22. [RESOLVED] Dust aspiration network: out of scope as *equipment*. **Caveat [FD]:** the
    Red Dust Filter, Cyclofan and Conditioning Compressor sequences are **hard
    prerequisites**: any one stopping trips the entire line at 1 s. Currently absent
    from `lineData.js`.

**Newly raised by the answers:**

23. **[RESOLVED, FD; applied 2026-08-05]** Concetti-branch metal remover: **does
    not exist**. `concettiMetalRemover` removed from `lineData.js`, its
    connections rerouted so `concettiSampler` feeds `concettiPreBin` directly.
24. **[RESOLVED, FD; applied 2026-08-05]** `52.608.H00` is the **Pro Box
    Unloading Station** — `proBoxStation`'s tag corrected in `lineData.js`.
25. **[OPEN]** Default value to plot on the shared chart per machine (throughput vs fill
    level), ours to decide.

**Newly raised by the Functional Description:**

26. **[OPEN, worth asking]** Is the top distribution run a separate conveyor, or the upper
    horizontal of pendulum conveyor `52.604.E00` with pneumatically selected outlets? This
    changes the scene topology. See PLC_FD §8.3.
27. **[OPEN, minor]** Buffer bin tag `52.502.H00` (sequences) vs `52.501.H00` (alarm
    tables), a straight typo either way. PLC_FD §8.1.
28. **[OPEN]** The CS Inload Box Dumper `52.417.L00` is a **second source into treating**,
    alternative to the yellow bins. Not modelled; probably should not be, but it is a real
    branch we had not seen.
29. **[OPEN]** Hybrid / batch / farmer tracking runs through every sequence pre-check, and
    "hybrid mismatch" is a 1 s trip. The line is batch-tracked by seed variety, a whole
    dimension the sim ignores. Out of scope unless the demo wants it.

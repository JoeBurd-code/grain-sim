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
> **Headline corrections from the 2026-06-30 answers (read these first):**
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

**Drawing set structure:** 7 sheets total. We have seen 52-12, 52-13, 52-14 (likely
sheets 3, 4, 5). Referenced but not seen: **sheet 52-15 (Formulation)** which supplies
chemical to the batch treater. Sheets covering the upstream "Line 2 Yellow Bin Upgrade
Project" area are explicitly **out of project scope** (note on sheet 52-12).

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
| Metal Remover | unknown | NEW | **40 t/h** rating (oversized). PLC-controlled pneumatic magnet extraction, cleared ~weekly into a bucket. **Must pass straight through with zero holdup, or the magnets fail** | [CONFIRMED 2026-06-30] |
| Treater Intermediary Buffer Bin ("7T bin") | unknown | RELOCATED | **7.7 m³ / 5.5 t confirmed.** High + low level transmitters + **continuous level (IO-Link)**. SCADA commands the yellow bins to discharge into it; yellow-bin pan feeders set to **12 t/h**; when it fills, the **yellow-bin outlet valve closes**. This is the **sim start point** | [CONFIRMED 2026-06-30] |
| Inlet Drum Feeder (treating side) | unknown | NEW | **Range 2-20 t/h, but NOT proportional** — % opening only ("10% ≠ 10%; 40% could be ~12 t/h; settings need review"). 220 V single-phase, own local controller, remote via SCADA. **Starts once the bucket elevator is confirmed running** | [CONFIRMED 2026-06-30] |
| Simatek E200 Bucket Elevator - Treating | unknown | NEW | 20.5 L/bucket, 10.08 m/min; ~176 buckets, ~105 m chain, ~8731 mm height, ~4584 mm lower horizontal (bucket count TBC by engineer). **Normal fill ~50%. Motor 1.5 kW with a VFD** (transport delay depends on speed; coast configurable) | [CONFIRMED 2026-06-30 for fill/motor; bucket geometry MED/LOW, count TBC] |
| Treater Pre-Bin | unknown | NEW | 1.62 m³; **high + low level switches**. Feeds the batch treater continuously. **When full, the treating bucket elevator slows then stops** | [CONFIRMED 2026-06-30] |
| **Niklas WNS/200 Batch Treater** | unknown | NEW | **Batch = 160 kg every ~40 s (≈14.4 t/h).** Batch phase breakdown (fill/treat/discharge) unknown, supplier question. Chemical dose changes density **negligibly**. Chemical inlet from Formulation (52-15) but **out of demo scope**. Adjacent **Future Powder Dosing Station** (dashed/future, left out) | [CONFIRMED 2026-06-30; phase timing OPEN] |
| Waste Water IBC Tank | unknown | | Waste water produced **only during cleaning, ~1×/month** (not per-batch). **Out of demo scope** (engineer: "does not need to be shown") | [CONFIRMED 2026-06-30] |
| Treater After-Bin | unknown | NEW | 0.67 m³; **low + high level switches**. Discharges when the high-level switch is healthy. **When full, the treater will not accept the next batch until the switch clears and seed moves through** (batch interlock) | [CONFIRMED 2026-06-30] |
| Treatment Scalping Screen | **52.602.F00** | | **64.4 t/h = capacity, well oversized.** **16 mm aperture; only oversize (>16 mm) goes to waste** (waste fraction tiny). Overload → drive trips. Product out to 52-13; scalpings to discard bin | [CONFIRMED 2026-06-30] |
| Discard Scalpings Bin | unknown | | Waste sink; emptied when full | [CONFIRMED 2026-06-30] |

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
| Pro Box Unloading Station | unknown | NEW | **Returns treated, stored seed to be re-bagged; ~1 day/month.** Feeds its own drum feeder (feeders are two independent units, one per branch) | [CONFIRMED 2026-06-30] |
| Lift from drum feeders to top conveyor | 52.604.E00 | NEW | 4.0 kW (TBC) .MX, 20 t/h; **XA0 safe start alarm**, **LSH0**; associated **Start-up Area Siren**; valves 52.604.V00/V01. **Takes both drum feeders but only one runs at a time** — this confirms the previously MED routing edge | [CONFIRMED 2026-06-30] |
| Top transport conveyor / metal remover group | 52.605.X00 | | top-left area. Sheet 52-14 entry says "FROM METAL REMOVER ... SHEET 52-13", so a metal remover sits on the Concetti branch; 52.605.X00 is the top-left equipment but the exact tag↔name pairing is unresolved | [LOW mapping] |
| Simatek Pneumatic Outlet (left) + Auto Sampler | unknown | NEW | discharge → Concetti line | [HIGH] |
| Simatek Pneumatic Outlet (right) + Auto Sampler | unknown | NEW | discharge → Bin Segment | [HIGH] |
| Outload Buffer Bin | 52.701.H00 | NEW | valve 52.701.V00 (RELOCATED) | [HIGH] |
| **Simatek E200 Bucket Elevator - Packaging** | 52.702.U00 | NEW | 5.0 kW .MX, 20 t/h; full spec block in §8; big instrument cluster (SS0, ST0, PSL0, ZS12, two LCPs, E-stops, pull-keys) | [HIGH] |
| Conveyor at/after elevator | 52.702.C00 | | .MVFD ??kW | [HIGH tag, MED role] |
| Grain Break | unknown | NEW | on elevator discharge path (cascade chute slowing falling grain); **pass-through, no holdup** | [CONFIRMED 2026-06-30] |
| Hopper + conveyor pair | 52.608.H00, 52.609.X00 (+52.609.V01 NEW) | NEW | role/position unresolved, likely on the top-conveyor distribution | [LOW mapping] |
| Bin Segment | likely 52.610.H00 or 52.612.H00 (unresolved) | NEW | **4.51 m³ (3.25 t) confirmed**, LT0 level transmitter, **pneumatic hammers (rev L)**; level set points trip the feed; **SCADA-triggered discharge**; gates 52.610.X00 / 52.612.X00 (XV0), valves 52.611.V00 / 52.612.V00 sit in this column | [CONFIRMED 2026-06-30 specs; LOW tag mapping] |
| 52.610.H00 | 52.610.H00 | | has **LSH0 + LSL0** (could be the Bin Segment or the Flexicon Pre-Bin) | [LOW mapping] |
| Treated Outload Metal Bin 1 | 52.613.H00 | NEW | LT0 level transmitter; fed via diverter valve 52.613.V00 (NEW, ZS1/ZS2, XV0) | [HIGH] |
| Treated Outload Metal Bin 2 | 52.613.H01 | NEW | LT0 level transmitter; fed via diverter valve 52.613.V01 (NEW, ZS1/ZS2, XV0) | [HIGH] |
| Flexicon Pre-Bin | unknown | RELOCATED | | [HIGH] |
| Vibrating Conveyor | likely 52.703.L00 | RELOCATED | .MDOL ??kW | [MED mapping] |
| Flexicon Filling Head | unknown | RELOCATED | big-bag (IBC/FIBC) filling; HS17 jog left/right + LSL0 instruments appear in this area | [HIGH presence, MED instruments] |
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
4. Top conveyor, branch A (left): Simatek Pneumatic Outlet → Auto Sampler → (metal remover: engineer marked this **not part of the line**, see §11) → **Concetti Bagging Line 2 Pre-Bin 52.705.H00 (sheet 52-14)** **[HIGH]**
5. Top conveyor, branch B (middle): drop → Outload Buffer Bin 52.701.H00 (+52.701.V00) → Bucket Elevator 52.702.U00 → Grain Break → diverter valves 52.613.V00/V01 → **Treated Outload Metal Bins 1/2 (52.613.H00/H01)** **[HIGH, valve-level detail MED]**
6. Top conveyor, branch C (right): Simatek Pneumatic Outlet → Auto Sampler → **Bin Segment (4.51 m³)** → Flexicon Pre-Bin → Vibrating Conveyor → **Flexicon Filling Head** → big bag riding Motorised Roller Conveyors 1..4 over the Inline Belt Scale 52.704.K00 **[HIGH chain, MED at the Bin-Segment→Pre-Bin joint]**
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
- Implied bulk density from the 70% row: 347.29 kg/min ÷ (16.5 buckets/min × 20.5 L × 0.70) ≈ **1.47 kg/L**?? That is implausibly high for seed (~0.6-0.8 kg/L), so either the table assumes a different bucket pass rate or density. **Still unresolved as of 2026-06-30** — engineer deferred ("lets look at the table for this calculation") and gave no numeric maize density. Note the elevators actually run at **50% fill, not the 70% table row**. Follow-up needed.

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
- **Sensors for the control layer:** LT on bin segment + both metal bins (+ buffer bin
  level indication on 52-12); LSH/LSL on 52.610.H00 and LSH on 52.604.E00; LSHH exists
  in the legend (placement TBD); SS/ST/PSL/ZS12 on the packaging elevator; ZS1/ZS2 on
  every pneumatic valve; per-area E-stops/pull-keys.
- **Interlock flavour visible:** XA0 safe start alarm + start-up area sirens imply a
  timed start-up sequence (siren before motion); "software or datalink" lines are
  literal signal paths.
- **Choke-point story (revised 2026-06-30):** ~20 t/h capacity but ~12 t/h sustained,
  **choked at the batch treater** (160 kg / ~40 s ≈ 14.4 t/h), buffered by 0.67-7.7 m³
  bins. The pre-bin-full → elevator-slows-then-stops and after-bin-full → no-next-batch
  interlocks are where backups and holds happen. LSH/LSL trips confirmed on pre-bin,
  after-bin, buffer bin, outload buffer bin, bin segment, Flexicon pre-bin.

## 11. Known reading uncertainties (recap)

- Screenshot-sourced volumes now **confirmed** by the engineer: 7.7 m³/5.5 t (buffer),
  1.62 m³ (pre-bin), 0.67 m³ (after-bin), 64.4 t/h (screen capacity), 4.51 m³/3.25 t
  (bin segment). Still unconfirmed on the worksheet: 0.72 m³ (Concetti pre-bin), the
  treater elevator bucket count (engineer to check), and every outload/Flexicon bin
  working volume left blank.
- Edge 52.603 drum feeders → 52.604.E00 → top conveyor is **confirmed** (only one feeder
  at a time). No longer a MED edge.
- **Concetti-branch metal remover (#23):** engineer marked "Part of this line? No" and
  left it blank, which **contradicts** the sheet 52-14 "FROM METAL REMOVER ... SHEET
  52-13" reference. Needs a direct clarification before it is dropped or kept.
- **Distribution hopper 52.608.H00:** the engineer himself did not recognise it ("Not
  too sure what this is???"). Role genuinely unknown; the paired distribution conveyor
  is also unexplained.
- Tag↔name mapping still unresolved for: 52.605.X00, 52.608.H00, 52.609.X00/V01,
  52.610.H00/X00, 52.611.V00, 52.612.V00/X00, and most sheet 52-12/52-14 tags.
- Where removed metal goes: **answered** (bucket, cleared ~weekly). Sampler take-offs:
  frequency answered (~3 hourly / per QC), destination still unstated.
- The implied-bulk-density inconsistency in §8 remains open (engineer deferred; no
  maize density number given).

## 12. Status after the 2026-06-30 answers (resolved vs still open)

> The confirmation worksheet (`docs/TREATER_LINE2_WORKSHEET.md`) was returned filled on
> 2026-06-30 (`docs/treater-line2-filled-20260630 (1) (1).md`). Items below are marked
> **[RESOLVED]** or **[OPEN]**. Resolved answers are already merged into §1-§11 above.

**Topology:**

1. [PARTIAL] Most [MED]/[LOW] edges confirmed (drum-feeder→lift edge, branch selection).
   Tag↔name mappings for 52.605/608/609/610/611/612 still **[OPEN]**.
2. [RESOLVED] Three branches run **one at a time, selected by operators**.
3. [OPEN] Treated Outload Metal Bins 1/2 discharge (truck loadout, gate logic) — bins
   left blank; §11 truck-discharge question still unanswered.
4. [RESOLVED] Pro Box = returns treated stored seed to be re-bagged, ~1 day/month.
5. [OPEN, promised] Engineer will send sheet 52-15 (Formulation) plus sheets 1, 2, 6, 7.

**Per-machine behaviour:**

6. [PARTIAL] Batch = 160 kg / ~40 s. Phase breakdown (fill/treat/discharge) and mid-batch
   downstream-block behaviour still **[OPEN]** (supplier question).
7. [RESOLVED, with caveat] Drum feeder is a **non-proportional % opening** (2-20 t/h);
   exact opening-position flow values to come from the engineer's spreadsheet **[OPEN]**.
8. [RESOLVED] 64.4 t/h = oversized screen capacity; 16 mm aperture, only oversize wasted.
9. [RESOLVED] Auto samplers and grain break are pass-through.
10. [OPEN] §8 density inconsistency unresolved (engineer deferred). Fill confirmed at 50%
    (not 70%). Spin-down time and PSL0 protection still **[OPEN]**.
11. [OPEN] Flexicon filling head: bag size, fill time, bag-change time all blank.
12. [OPEN] Concetti line: bag size, sustained t/h, pre-bin volume all blank (but the
    treater, not this scale, is now the confirmed bottleneck).
13. [PARTIAL] Crop = maize, always same, ±10% size/shape. **Numeric bulk density still
    [OPEN]** — needed for the volume↔mass decision and the §8 anomaly.

**Control/interlock:**

14. [OPEN] Interlock cause-and-effect matrix — left blank. Individual interlocks known
    (pre-bin-full slows/stops elevator; after-bin-full holds next batch; buffer-full
    closes yellow-bin valve) but no ordered matrix.
15. [OPEN] VFD ramp times and MDOL stop behaviour — left blank.
16. [OPEN] Signal latency assumptions — left blank.
17. [OPEN] LSHH placements — left blank.
18. [PARTIAL] Siren = **20 s before motion**, covers any equipment in the area. Full
    start-order sequence down the line still **[OPEN]**.
19. [OPEN] Which parameters the engineer most wants tunable — not asked/answered.

**Demo-scope decisions (ours):**

20. [RESOLVED] Truncate: **source = the 7.7 m³ buffer bin** (engineer's stated start
    point); sinks = bag/bin counters. Upstream (colour sorter, yellow bins) excluded.
21. [RESOLVED] Chemical/formulation and waste water are **both out of scope** (not shown).
22. [RESOLVED] Dust aspiration network: out of scope (unchanged).

**Newly raised by the answers:**

23. [OPEN] Concetti-branch metal remover: engineer marked "not part of this line,"
    contradicting the 52-14 cross-reference (see §11).
24. [OPEN] Distribution hopper 52.608.H00: engineer did not recognise it; role unknown.
25. [OPEN] Default value to plot on the shared chart per machine (throughput vs fill
    level) — left blank; ours to decide.

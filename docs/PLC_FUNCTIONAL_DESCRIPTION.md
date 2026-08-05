# PLC & SCADA Functional Description (A2653FSD001): deciphered

> **How to use this doc:** durable record of everything extracted from the Bayer
> PLC & SCADA Functional Description on 2026-08-05. A new session should read
> this instead of re-opening the 95-page PDF. It is the companion to
> `docs/REAL_LINE_SPECS.md`: that doc records the *drawings* (what equipment
> exists and where), this one records the *control system* (what the PLC does
> with it). Where the two disagree, the conflicts are listed in §8 and this doc
> wins, because it is six weeks newer and internally consistent with its own
> SCADA mimics.
>
> Confidence flags: **[FD]** = stated verbatim in the document. **[FD-DERIVED]**
> = arithmetic or direct logical consequence of stated values. **[FD-INFERRED]**
> = read off the SCADA mimic screenshots or inferred from tag adjacency, not
> stated in prose.

---

## 1. Source document

| Field | Value |
|---|---|
| Title | Bayer PLC & SCADA Functional Description — TR&PUP - Line 2, and Sheller |
| Document no. | A2653FSD001, **V1.0** |
| Revision | 2026/07/14, "Draft", H.L Stander, "Initiation TR&PUP – Line 2" |
| Pages | 95 |
| File | `c:\Users\SOMO-CAD\Downloads\A2653 Bayer TR&PUP - Line 2, and Sheller PLC, SCADA  Functional Description V1.0.pdf` |
| Text layer | Yes, full. All tags and tables below are exact transcriptions, not visual reads. |

Platform **[FD]**: Siemens TIA Portal V19, WinCC Professional V19 RT (redundant),
STEP 7 Prof. V19, ProDiag. Operator clients on Windows 11 Pro.

**This is a draft.** Several sections are marked "To be updated" (hybrid
information, user administration, network layout, MCC pages), the Sheller half
of every reference table is blank, and two named sequences (52.600.S00 Line 2
Red Bin dumper, 52.600.S01 Bagging Line 2 packing) are listed in §3.2.1 but
never specified. Treat absences as "not yet written", not as "does not exist".

It also **supersedes the ~600-page operational spec** we had been waiting on for
control-layer answers (see `docs/OPEN_QUESTIONS.md`): the interlock matrix,
trip delays and start/stop ordering that register was holding out for are all
here. What is still missing is equipment *sizing* data (bag sizes, sustained
rates, bin volumes), which was never this document's job.

## 2. Tag register (the big win)

Every "TBC-nn" placeholder in `src/line/lineData.js` except three now has a real
tag. Sourced from the sequence lists (§3.2.3, §3.2.4) and the alarm tables
(§2.4.6), which corroborate each other.

### Treating

| Equipment | Tag | Instruments | Confidence |
|---|---|---|---|
| Yellow bins 1-8 ("20T CS Bin") | `52.410.H00` - `52.417.H00` | LT0, LSH0, LSL0, hammer X00, outlet valves V00/V01 | [FD] |
| CS Inload Box Dumper (alternative source) | `52.417.L00` | LS0 | [FD] |
| Vibratory feeders under the bins | `52.414.L00` - `52.414.L04` | (5 units) | [FD] |
| Bucket Elevator (yellow bin area) | `52.414.E00` | SS0, PSL0 (plant air), ZS2/ZS3 tensioner, XA4, HS1/2/5/6/15/16 | [FD] |
| **Metal Remover** | `52.501.F00` | XV0 pneumatic open/close | [FD] |
| **Treater Intermediary Buffer Bin ("7T")** | `52.502.H00` *(see §8.1)* | LT0, LSH0, LSL0; hammer `52.502.X00` | [FD, tag disputed] |
| Buffer bin outlet valve | `52.503.V01` commanded, `52.503.V00` confirm-open | ZS1, ZS2, XV0 | [FD] |
| Drain diverter (off elevator / pre-bin) | `52.504.V00`; slide gate `52.504.V01` | ZS1, ZS2, XV0 | [FD] |
| **Inlet Drum Feeder (treating)** | `52.505.L00`; inlet valve `52.505.V00` | LS0, LS1, ZS13/ZS14 actuator A/B, XA3 | [FD] |
| **Bucket Elevator - Treating** | `52.506.E00` | LS0, **LSHH0**, PSL0, SS0, ZS12, XA4 | [FD] |
| **Treater Pre-Bin** | `52.507.H00` | LT0, LSH0, LSL0; hammer `52.507.X00` | [FD] |
| **Niklas WNS/200 Batch Treater** | `52.508.T00` | PT0 pressure, XS2 ready | [FD] |
| Chemical Dosing Stations 1-10 | `52.508.M00` - `52.517.M00` | LT0 each; V00 fresh water, V01 chemical, V02 grey water | [FD] |
| **Treater After-Bin** | `52.601.H00`; outlet valve `52.601.V00` | LSH0, LSL0; hammer `52.601.X00`; valve ZS1/ZS2/XV0/XV1 | [FD] |
| Treatment Scalping Screen | `52.602.F00` | LSH0, LSL0, **VT0 vibration** | [FD] |
| Scalping screen discharge hopper | `52.603.H00` | hammer `52.603.X00`; LSH0 *(see §8.2)* | [FD-INFERRED] |
| **Discard Scalpings Bin** | `52.801.L00` | LSH0 | [FD] |

### Packaging and outload

| Equipment | Tag | Instruments | Confidence |
|---|---|---|---|
| Inlet Drum Feeder 1 (from scalping screen) | `52.603.L00` | LS0, LS1, ZS13/ZS14, XA3 | [FD] |
| Inlet Drum Feeder 2 (from Pro Box) | `52.603.L01` | same set | [FD] |
| **Pro Box Unloading Station** | `52.608.H00` | | [FD] |
| **Bucket Elevator - Packaging** | `52.604.E00` | LS0, LS1, **LS2 = "Outlet 3 (Waste) level switch"**, PSL0, SS0, ZS12, XA4 | [FD] |
| Simatek Pneumatic Outlet → Concetti | `52.604.V00` | XV0 open, XV1 close | [FD] |
| Simatek Pneumatic Outlet → Flexicon | `52.604.V01` | XV0 open, XV1 close | [FD] |
| **Auto Sampler (Concetti branch)** | `52.605.X00` | XV0 | [FD] |
| **Auto Sampler (Flexicon branch)** | `52.609.X00` | XV0 | [FD] |
| **Outload Buffer Bin** | `52.610.H00` | LSH0, LSL0; hammer `52.610.X00` | [FD] |
| Outload buffer bin outlet valve | `52.611.V00` | ZS1, ZS2, XV0 | [FD] |
| **Outload Diverter Valve** | `52.612.V00` | ZS1, ZS2, XV0; outload chute hammer `52.612.X00` | [FD] |
| Outload bin 1 / 2 inlet slide gates | `52.613.V00` / `52.613.V01` | ZS1, ZS2, XV0 | [FD] |
| Treated Outload Metal Bin 1 / 2 | `52.613.H00` / `52.613.H01` | LT0 each | [FD] |
| **Flexicon Pre-Bin** | `52.701.H00`; outlet valve `52.701.V00` | LSH0, LSL0 | [FD] |
| **Vibrating Conveyor** | `52.702.C00` | | [FD] |
| **Flexicon Filling Head** | `52.703.L00` | | [FD] |
| Concetti Bagging Line 2 Pre-Bin | `52.705.H00` | LT0, LSH0, LSL0 | [FD] |

### Utilities and sequences

| Item | Tag |
|---|---|
| Line 2 Yellow Bin Feed sequence | `52.400.S00` |
| **Bagging and Treating Line 2 sequence** | `52.500` (mimic shows `52.500.S00`) |
| Line 2 Red Bin dumper sequence | `52.600.S00` *(listed, never specified)* |
| Bagging Line 2 packing sequence | `52.600.S01` *(listed, never specified)* |
| Red Dust Filter System sequence | `52.808.S00` (rotary valve `52.808.V00.MDOL`, blower `52.808.B00.MVFD`) |
| Cyclofan sequence | `52.807.S00` |
| Conditioning Process Compressor sequence | `51.900.S00` |

### Still unresolved

`52.605.X00` turning out to be the Concetti auto sampler leaves the **top
transport conveyor without a tag**, and §8.3 argues it may not be a separate
machine at all. `52.608.H00` is the Pro Box station, so the "distribution
hopper" we could not place does not exist. No tag anywhere for the **grain
break**, the **Concetti bagging scale**, the **filling and sewing head**, or any
**palletising** equipment: the Concetti line past its pre-bin is not in this
PLC's scope (it is a vendor package with its own controller).

## 3. Bulk density: resolved at ~0.72 t/m³

The Treating mimic (§4.5, p.86) labels the Treater Pre-Bin **"1.63 m³ (1.17 T)"**.
That is a vendor volume-to-mass pair, which is exactly the missing constant.
Cross-checked against the two other bins with both figures known **[FD-DERIVED]**:

| Bin | Volume | Mass | Implied density |
|---|---|---|---|
| Treater Pre-Bin (`52.507.H00`) | 1.63 m³ | 1.17 t | 0.718 t/m³ |
| Treater Intermediary Buffer Bin | 7.7 m³ | 5.5 t | 0.714 t/m³ |
| Bin segment / outload buffer bin | 4.51 m³ | 3.25 t | 0.721 t/m³ |

Three independent bins agree to within 1%. **Use 0.72 t/m³ (0.72 kg/L) for
maize** as the volume↔mass conversion. This closes the long-standing gap that
`docs/REAL_LINE_SPECS.md` §12 item 13 was holding open, and it does so without
needing the engineer, because the vendor already committed to it when they rated
the bins in tonnes.

Note the pre-bin is **1.63 m³, not 1.62 m³** as read off the low-resolution
sheet 52-12 screenshot.

### What it does to the elevator anomaly (§8 of REAL_LINE_SPECS)

Still not resolved, but now precisely quantified. The 52.702.U00 output table
claims 347.29 kg/min at 70% fill. At 0.72 kg/L and 20.5 L buckets that is
10.33 kg per bucket, so the table needs **33.6 buckets/min**. The drawing's own
geometry (120 m chain, 196 buckets, 10.08 m/min) gives 16.5 buckets/min, a
factor of 2.04 out. Two candidate resolutions, both consistent with the density
now being known good:

1. Chain speed is really **~20.5 m/min**, and 10.08 was misread.
2. Bucket pitch is really **~0.3 m** (≈392 buckets on the loop), and 196 counts
   pairs or one strand.

The consequence for the sim is the transport lag: option 1 halves the
carrying-side transit from ~6 min to ~3 min, option 2 leaves it at ~6 min. Both
are large enough to drive the delayed-cascade thesis, so this does not block
anything, but it is worth one line in an engineer email since the two answers
differ by 3 minutes of on-screen lag.

## 4. Sequence 52.500: Bagging and Treating Line 2

The main event. Six route variants: two sources (yellow bins / CS inload box
dumper, or Pro Box unloading station) × three destinations (treated outload
metal bins, Flexicon big-bag filling head, Concetti bagging line).

**Pre-checks (all routes) [FD]:** select source and destination; check hybrid
information (hybrid, batch, farmer); check valid route path for source
destination; select treated outlet metal bin no. when that destination is
chosen.

### 4.1 Start order is strictly downstream-first

This is the single most useful structural fact in the document. The start
sequence walks from the *destination* back to the *source*, so nothing runs
until everything it will discharge into is already running:

```
siren → utilities → destination valve → ... → treater → treating elevator →
treating drum feeder → buffer bin outlet valve → metal remover →
upstream elevator → vibratory feeder → yellow bin outlet valve → running
```

Full order for yellow bins → treated outload metal bins **[FD]**:

1. Activate startup siren
2. Start Red Dust Filter System (`52.808.S00`), Cyclofan (`52.807.S00`), Conditioning Process Compressor (`51.900.S00`)
3. Open selected destination valve (`52.613.V00`/`V01`)
4. Open diverter valve to position (`52.612.V00`)
5. Activate pneumatic hammers (`52.612.X00`, `52.610.X00`)
6. Open buffer bin outlet valve (`52.611.V00`)
7. Open selected Simatek pneumatic outlet (`.XV0`)
8. Start Simatek bucket elevator (`52.604.E00`)
9. Start inlet drum feeder (`52.603.L00`)
10. Activate treater pneumatic hammers (`52.603.X00`, `52.601.X00`, `52.507.X00`, `52.502.X00`)
11. Start scalping screen (`52.602.F00`)
12. Open treater after-bin outlet valve (`52.601.V00`)
13. Activate dosing control
14. Start treater (`52.508.T00`)
15. Start bucket elevator (`52.506.E00`)
16. Start inlet drum feeder (`52.505.L00`)
17. Confirm drum feeder inlet valve open (`52.505.V00`)
18. Open diverter valve to position (`52.504.V00`)
19. Open treater intermediary bin outlet valve (`52.503.V01`), confirm (`52.503.V00`)
20. Open metal remover (`52.501.F00`)
21. Start bucket elevator (`52.414.E00`)
22. Start selected vibratory feeder (`52.414.L00`-`L04`)
23. Confirm selected outlet valves open (`52.416.V03` etc., then `52.410.V00`-`52.413.V00` / `52.416.V00`-`52.420.V00`)
24. Activate selected bin pneumatic hammers (`52.410.X00`-`52.417.X00`)
25. Sequence running

### 4.2 Stop order is the exact reverse: upstream-first

Stop closes the yellow bin valve **first** and works downstream, so the line
clears itself of material before the last machine stops **[FD]**. This is the
"drain the line" shutdown, and it is the natural counterpart to the delayed
cascade: on a controlled stop the plant empties gracefully, on a **trip** it
does not (§5).

### 4.3 The Pro Box routes are short

Pro Box → any destination skips the entire treating half: it is just
`52.603.L01` → `52.604.E00` → outlet → destination. The Pro Box product is
already treated (it is returned stored seed being re-bagged), so it bypasses the
treater. This confirms the two drum feeders are genuinely independent branches
and never both run.

## 5. Cause-and-effect matrix (answers the interlock question outright)

The FD distinguishes three severities **[FD]**:

- **Safety interlock (SI)**: prevents start. Bypassed only in maintenance mode. Field isolators, E-stops, misalignment switches, tensioners, "not in remote".
- **Process interlock (PI)**: prevents start. Bypassed in operator control mode. This is where every level switch lives.
- **Trip**: stops the device **immediately**, no shutdown procedure, and it **requires a SCADA reset before it can start again**.
- **Controlled trip**: follows the normal shutdown procedure, still needs a reset.

Level-driven chain, with the delay on the trip **[FD]**:

| Sensor | Trips / interlocks | Delay | Then cascades to |
|---|---|---|---|
| Buffer bin high `52.502.H00.LSH0` | Bucket elevator `52.414.E00`; also whole sequence 52.500 | **5 s** | vibratory feeders `52.414.L00-L04` (PI "52.414.E00 not running", 1 s) → yellow bin outlet valves (PI "feeder not running", 1 s) |
| Treater pre-bin high `52.507.H00.LSH0` | Bucket elevator `52.506.E00`; also sequence | **5 s** | inlet drum feeder `52.505.L00` (PI "52.506.E00 not running", 1 s) |
| Treating elevator high-high `52.506.E00.LSHH0` | Bucket elevator `52.506.E00` | **5 s** | as above |
| Treater after-bin high `52.601.H00.LSH0` | **Treater `52.508.T00`**; also sequence | **5 s** | treater stops accepting batches |
| Scalping screen high `52.602.F00.LSH0` | After-bin outlet valve `52.601.V00` (PI + trip), and the screen itself (SI) | **5 s** | after-bin backs up |
| Outload buffer bin high `52.610.H00.LSH0` | Bucket elevator `52.604.E00` "if selected"; also sequence | **5 s** | drum feeders `52.603.L00/L01` (PI "52.604.E00 not running", 1 s) |
| Metal bins high `52.613.H00/H01.LT0` | Bucket elevator `52.604.E00` "if selected"; destination valves `52.613.V00/V01` (PI) | **5 s** | as above |
| Flexicon pre-bin high `52.701.H00.LSH0` | Bucket elevator `52.604.E00` "if selected" | **5 s** | as above |
| Concetti pre-bin high `52.705.H00.LSH0` | Bucket elevator `52.604.E00` "if selected" | **5 s** | as above |
| Elevator waste outlet `52.604.E00.LS2` | Bucket elevator `52.604.E00` (SI) | **5 s** | as above |

Reverse-direction interlocks (a machine will not run unless the thing it feeds
is running) **[FD]**:

| Device | Will not run unless |
|---|---|
| Vibratory feeders `52.414.L00-L04` | `52.414.E00` running |
| Yellow bin outlet valves | selected vibratory feeder running |
| Inlet drum feeder `52.505.L00` | `52.506.E00` running |
| Bucket elevator `52.506.E00` | Treater `52.508.T00` running |
| Treater `52.508.T00` | Scalping screen `52.602.F00` running |
| Scalping screen `52.602.F00` | Inlet drum feeder `52.603.L00` running |
| Inlet drum feeders `52.603.L00/L01` | `52.604.E00` running |
| After-bin outlet valve `52.601.V00` | Scalping screen running |
| Whole sequence 52.500 | all three utility sequences healthy **and** running |

### 5.1 The correction this forces on issue #19

Two things in the current sim's `bufferBinHighTrip` interlock do not match the
document, and the second one matters:

1. **Signal delay.** The sim assumes a single 3 s delay. The FD's real chain is
   5 s (LSH → elevator trip) + 1 s (elevator not running → feeders trip) + 1 s
   (feeders not running → valves close) ≈ **7 s of pure signal latency**, before
   any valve travel. The assumption was the right shape and roughly half the
   real magnitude. Reasonable to move the slider default to 7 s and keep the
   range.

2. **There is no automatic reopen.** The buffer bin's `LSL0` is classified
   **Information** alarm class only, and appears in no interlock and no trip
   table. A high-level event is a **trip**, and the FD is explicit that a
   tripped device "needs to be reset via the SCADA before the device will be
   able to start again". So the real plant does **not** self-restart when the
   level falls back past the low switch: an operator resets it. The sim's
   automatic reopen at `lowSetpoint` is a modelling convenience, not plant
   behaviour, and a presenter should not claim otherwise.

   The honest demo framing is: high switch trips the feed after a delay, the
   line overshoots, and it then **stays** stopped until someone intervenes.
   That is a *stronger* delayed-cascade story than auto-recovery, not a weaker
   one, but it is a different one.

## 6. Timing constants

Every trip delay in the document is one of two values **[FD]**:

| Condition class | Delay |
|---|---|
| Upstream/downstream device "not running", "not open", valve "not in position" (sequence level) | **1 s** |
| Level switch high / level transmitter high | **5 s** |
| Speed switch no feedback (`SS0`) | **5 s** |
| Valve failed to open / failed to close | **5 s** |
| Drum feeder actuator position not reached (`ZS13`/`ZS14`) | **5 s** |
| Tripper car / diverter not in position | **5 s** |
| Field isolator, E-stop, misalignment, tensioner (safety) | **n/a, immediate** |

Other timings:

- **Start-up siren** is step 1 of every sequence. Duration not stated here; the engineer previously said **20 s before any motion**, which is consistent.
- **Red dust filter stop:** stop blower → **1 min delay** → stop rotary valve. The only explicit multi-second sequencing delay in the document.
- **Monitoring time, feedback validation, and start/stop delays are per-device operator-adjustable** on the SCADA faceplate (§2.2.4.1), as is the **speed switch monitoring delay** (§2.2.4.8.1). So there is no single fixed VFD ramp figure to find: those are commissioning values, set per drive. This is a genuine answer to "what are the ramp times", just not a numeric one, and it retroactively justifies exposing them as sliders in the sim.
- **Analog set points are operator-adjustable too** (§2.2.4, analog device faceplate: "Setpoints for failures and interlocks can be adjusted"). The LSH/LSL percentages we assumed are configuration, not fixed plant constants, which is why nobody could quote them.

## 7. Things the document adds that the sim does not model at all

- **Three utility sequences are hard prerequisites.** Red dust filter, cyclofan and conditioning compressor must be healthy to start and running to stay running; any one stopping trips the whole line at 1 s. Currently absent from `lineData.js`.
- **A whole chemical dosing area exists in PLC scope**: 10 dosing stations `52.508.M00`-`52.517.M00`, each with a level transmitter and fresh water / chemical / grey water valves. "Activate Dosing Control" is a step in every treating route, "dosing control not healthy" is a process interlock, and "not running" is a 1 s trip. The engineer put chemical **out of demo scope**, which remains the user's call, but note the coupling is real: dosing trips the line.
- **A second source into treating**: the CS Inload Box Dumper `52.417.L00`, an alternative to the yellow bins.
- **Bin drain sequences** (§3.2.4) let yellow bins discharge to a drain bin via diverters `52.416.V02`-`52.420.V02`, bypassing the line entirely.
- **Hybrid tracking**: every sequence pre-check validates hybrid / batch / farmer, and "hybrid mismatch" is a 1 s trip on the yellow bin feed sequence. The line is batch-tracked by seed variety, which is a whole dimension the sim ignores.
- **Pneumatic hammers on every bin**, activated and deactivated as sequence steps. They exist because this product bridges. Not a flow model concern, but it explains why bins do not simply discharge by gravity.

## 8. Conflicts with the drawings (`docs/REAL_LINE_SPECS.md`)

### 8.1 Buffer bin tag: `52.502.H00` vs `52.501.H00`

The **sequence sections consistently say `52.502.H00`** ("Treater Intermediary
Bin Level High (52.502.H00.LSH0)", appearing three times). The **alarm tables
say `52.501.H00`** ("7T Treater Intermediary Buffer Bin Low/High
52.501.H00.LSL0/LSH0", and "Treater Intermediary Buffer Bin Level
52.501.H00.LT0").

`52.502.H00` is almost certainly right: `52.501.F00` is already taken by the
metal remover, and `52.502.X00` is named "Buffer Bin Pneumatic Hammer", which
puts the buffer bin at equipment number 502. Recorded as `52.502.H00` with the
conflict noted. Low stakes, but worth one line in an engineer email since it is
a straight typo either way.

### 8.2 Scalping screen bin tag: `52.602.F00` vs `52.603.H00`

Sequence interlock #34 says "Scalping Screen Bin High / Fault
(**52.602.F00**.LSH0)"; the matching sequence failure #33 says
"(**52.603.H00**.LSH0)". The alarm table lists `52.602.F00.LSH0` and
`52.602.F00.LSL0`, and separately a "Scalping Bin Pneumatic Hammer
`52.603.X00.XV0`". Best reading: the screen itself is `52.602.F00` and there is
a discharge hopper `52.603.H00` beneath it feeding the drum feeders. Marked
[FD-INFERRED].

### 8.3 The packaging bucket elevator and the "top transport conveyor"

This is the structural one. The drawing reading gave branch B as: top conveyor →
outload buffer bin `52.701.H00` → **bucket elevator `52.702.U00`** → grain break
→ diverters → metal bins. The FD gives it as: bucket elevator `52.604.E00` →
Simatek pneumatic outlet → outload buffer bin `52.610.H00` → outlet valve
`52.611.V00` → diverter `52.612.V00` → destination valves → metal bins.

Differences:

- **`52.702.U00` appears nowhere in the FD.** `52.702.C00` is assigned to the *Vibrating Conveyor* on the Flexicon branch, and `52.703.L00` to the *Flexicon Filling Head* (the drawing reading had `52.703.L00` as the vibrating conveyor).
- **`52.701.H00` is the Flexicon Pre-Bin**, not the outload buffer bin. The outload buffer bin is `52.610.H00`. So the "bin segment, 4.51 m³ / 3.25 t" from the drawing is most likely `52.610.H00`.
- **There is no separate top transport conveyor.** `52.605.X00`, which we had guessed was it, is the Concetti auto sampler. The Packaging mimic (p.87) shows the three branches hanging off a plain distribution run with no drive symbol.

The likely explanation **[FD-INFERRED]**: `52.604.E00` is a Simatek E200
**pendulum** conveyor, whose upper horizontal run carries the product across the
building with **pneumatically selected discharge outlets along it** (hence
"Open Selected Simatek Pneumatic Outlet", `52.604.V00` for Concetti, `52.604.V01`
for Flexicon, an unnamed third for the outload bins, and `52.604.E00.LS2` labelled
"**Outlet 3** (Waste) level switch"). Under that reading the "top transport
conveyor" and the "packaging bucket elevator" are one machine, and the
20.5 L / 196 bucket / 120 m spec block on sheet 52-13 describes `52.604.E00`.

This is inference, and it changes the scene topology, so it is the **one item on
this list worth actually asking the engineer**: *"is the top distribution run a
separate conveyor, or the upper horizontal of 52.604.E00?"*

### 8.4 Concetti-branch metal remover: drop it

Sheet 52-14 carried an entry reference "FROM METAL REMOVER ... SHEET 52-13",
which contradicted the engineer's "part of this line? No" on the returned
worksheet. The FD **names exactly one metal remover on the whole line,
`52.501.F00`, on the treating side**, and the Packaging mimic shows none on the
Concetti branch. Two independent sources now agree with the engineer.
`concettiMetalRemover` in `lineData.js` should be removed.

### 8.5 Minor

- Treater Pre-Bin is **1.63 m³**, not 1.62 m³.
- The alarm table gives the Concetti pre-bin level tag as `52.507.H00.LT0`, which is the treater pre-bin's tag. Obvious copy-paste error; it should be `52.705.H00.LT0`.
- Duplicate/garbled rows in the alarm table (bin #4 and #6 outlet gates listed twice, `52.414.X00` used for both bin #5 and #6 hammers). Transcription noise in a draft; not load-bearing.

## 9. What is still open after this document

The FD is a control document, not an equipment datasheet, so the sizing gaps
survive intact:

- Treated outload metal bin **discharge** (truck loadout): still nothing. `52.613.V00/V01` are inlet gates.
- Metal bin, Flexicon pre-bin, Concetti pre-bin **working volumes**: not given.
- Flexicon **bag size, fill time, bag-change time**: not given.
- Concetti **sustained bagging rate**: not given.
- Treater **batch phase breakdown** (fill / treat / discharge split of the ~40 s cycle): not given, and now clearly a supplier question, because the PLC treats `52.508.T00` as a plain start/stop object with a pressure transmitter. Batching is internal to the Niklas machine.
- Drum feeder **percentage-opening → flow-rate curve**: not given. The FD confirms the *mechanism* (two actuators A/B, two discrete opening-degree positions `XV4`/`XV5`, position feedback `ZS13`/`ZS14`) which reinforces the engineer's "not proportional", but there are still no numbers. This stays the line's one genuinely load-bearing gap.
- Numeric **VFD ramp times**: not fixed values, they are per-device commissioning parameters (§6).
- Sequences `52.600.S00` and `52.600.S01`: listed but unwritten in V1.0. Expect them in V1.1.

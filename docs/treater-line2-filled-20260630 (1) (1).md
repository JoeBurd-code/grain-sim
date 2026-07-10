# Treater Line 2 (Area 52): Equipment Confirmation Worksheet

## Before the detail (whole-line questions)
- Drawings still needed: sheet 52-15 (Formulation), and sheets 1, 2, 6 and 7 of the 7-sheet set. Can copies be provided?
  Answer: 100% will send those
- Where does Line 2 start and end for this project? Confirm the first and last piece of equipment that is in scope.
  Answer: Techncally its from the output of the colour sorter, but for your flow simulator, lets take if from the 7T bin (after the 8 yellow bins)
- The outload area splits three ways (bulk outload bins, big bag filling, and the Concetti bagging line). Do these run at the same time, or is one selected at a time? What decides the routing?
  Answer: only one at a time
- Nominal line rate: is 20 t/h correct end to end, and where is the slowest point?
  Answer: SO we will only get closer to 12t/h, as the treater is the slowest point
- Which crop or product runs on this line, and is it always the same one?
  Answer: maize, yes always the same, just the size and shape changes slightly. by 10%

## Treating (sheet 52-12)
### 1. From Yellow-Bin Area (Upstream Bucket Elevator)
Status: Existing, upstream     Sheet: 52-12
Part of this line? (unanswered)
Confirm or correct:
- [x] Simatek E200 bucket elevator, around 20 t/h
- [x] Everything before this point is a separate project (Line 2 Yellow Bin Upgrade)
Information required:
- Where this line should be treated as starting (at this elevator, or downstream of it): As mentioned we are busy with the control after the colour sorter, the colour sorter feeds the yellow bins. 
- Steady feed rate handed over to the treating area (t/h): approximatly 12t/h
Notes:
> We do not need this in the initial flow simulator

### 2. Metal Remover (Treating)
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Removes tramp metal before the buffer bin
Information required:
- Throughput it has to pass (t/h): 40t/h
- Where removed metal goes, and how often it is cleared: this is an automated process, the magnets are extracted via pneumatic cyclinders that are controlled via the PLC. This timing will be setup later. But most probably cleared every week. The metal that is removed will go into a bucket so that the operators can see what has been removed
- Does product hold up here, or pass straight through: pass through, it must not hold upa at all - if it does the magnets wont work
Notes:
> 

### 3. Treater Intermediary Buffer Bin
Status: Relocated     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Working volume around 7.7 m3 (around 5.5 t)
- [x] Has bin level indication
- [x] Associated with a start-up area siren
Information required:
- Confirmed working volume (m3) and how much it actually holds (t): as per above
- Level instruments fitted (continuous level, low, high, high-high) and their set points: there is a high and low level transmitter as well as continous level (IO Link)
- What triggers it to discharge, and at what rate: the scada tells the yellow bin to discharge, filling the 5.5t bin. The pan feeders on the outlet of the yellow bins need to be set to 12t/h so as not to overfill the bin
- What happens when it fills (backs up, stops the feed, or overflows): the valve at the outlet of the yellow bin would close
Notes:
> 

### 4. Inlet Drum Feeder (Treating)
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Around 20 t/h
Information required:
- Feed rate range it can be set to (t/h): between 2 & 20
- How it meters the flow (the two opening positions, what each does): so it does not really meter flow, it just has a % opening. Meaning it is not 100% proportional. 10% does not mean you will get exactly 10% and 40% oven could be around 12t/h. THese settings need to be reviewed
- Start, stop and empty-out behaviour: this will start as soon as the bucket elevator is confirmed to be running
- Drive type and motor power: This is a small 220V single phase supply, it has its own local controller, however it will be controlled remotely via scada
Notes:
> 

### 5. Bucket Elevator (Treating)
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Simatek E200 pendulum type, around 20 t/h
- [x] Around 176 buckets at 20.5 L each, chain around 105 m at 10.08 m/min
- [x] Height around 8731 mm
Information required:
- Confirmed bucket count, bucket volume and chain length: I will need to check this
- Normal operating fill level (%): around 50%
- Time for material to travel from inlet to discharge (transport delay): this id dependant on the speed of the bucket elevator
- Time to coast to a stop after the motor is stopped: This can be configured
- Drive type and motor power: 1.5kW motor and it has a VFD 
Notes:
> 

### 6. Treater Pre-Bin
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Working volume around 1.62 m3
Information required:
- Confirmed working volume (m3): 
- Level instruments fitted and their set points: high and low level switch
- How it feeds the treater (continuous, or batch by batch): the treater is a batch process, however the bin has the ability to feed it constantly. The treater will remove 160kg of seed every +-40 seconds.
- What happens when it fills: The bucket elevator must first slow down then stop if the bin becomes too ful
Notes:
> 

### 7. Niklas WNS/200 Batch Treater
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Batch treater, around 4 to 18 t/h
- [x] Liquid chemical supplied from Formulation (sheet 52-15)
- [x] Waste water sent to an IBC tank
- [x] A future powder dosing station sits alongside it (shown dashed, not yet installed)
Information required:
- Batch size (kg or L) and full cycle time: 160kg / 40seconds
- Phase breakdown within a batch (fill, treat, discharge) and how long each takes: I cant tell you this - will have to ask suppliers
- Chemical dose rate, and whether the dose changes the bulk density or weight of the seed: There would be a slight change but this would be negligeble
- Waste water produced per batch: So the waste water is only produced during cleaning, this will only happen +-1 time a month
- What happens when the downstream blocks part way through a batch: not sure on this question?
Notes:
> 

### 8. Future Powder Dosing Station
Status: Future (not yet installed)     Sheet: 52-12
Part of this line? No
Confirm or correct:
- [ ] Would dose dry powder chemical into the treater
- [ ] Shown dashed (future) on the drawing
Information required:
- Should this be shown at all for now, or left out until it is installed: 
- If shown, intended dose rate and how it is added: 
Notes:
> 

### 9. Chemical Supply from Formulation (Sheet 52-15)
Status: Reference, off this sheet     Sheet: 52-15
Part of this line? Yes
Confirm or correct:
- [x] Supplies liquid chemical to the batch treater
Information required:
- Dose rate or ratio supplied to the treater: Client to manage this
- Whether this needs to be shown as a flowing stream, or just as on/off: no does not need to be shown
Notes:
> 

### 10. Waste Water IBC Tank
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Collects liquid waste from the treater area (1000 L container)
Information required:
- Capacity, and how and how often it is emptied: Emptied when full
- Whether it needs to be shown in the demo at all: no it does not
Notes:
> 

### 11. Treater After-Bin
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Working volume around 0.67 m3
- [x] Smooths the batch discharge into a continuous flow
Information required:
- Confirmed working volume (m3): 
- Level instruments fitted and their set points: low and high level switch
- What triggers it to discharge, and at what rate: the treater will discharge as soon as the high level switch is healthy
- What happens when it fills: if the high level switch it triggered the treater will not accept more seed for another batch until this switch is healthy again and the seed has moved through the process
Notes:
> 

### 12. Treatment Scalping Screen
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Capacity figure read as around 64.4 t/h
- [x] Product carries on to sheet 52-13, scalpings go to a discard bin
Information required:
- What the 64.4 t/h figure means (screen capacity, or something else): it is the capacity. It is well oversized
- Typical fraction sent to scalpings (waste) versus product: 16mm is the apeture. Anything larger will get sent to waste
- What happens on overload: the drive will trip??
Notes:
> 

### 13. Discard Scalpings Bin
Status: New     Sheet: 52-12
Part of this line? Yes
Confirm or correct:
- [x] Collects scalpings (waste) from the screen
Information required:
- Capacity, and how and how often it is emptied: Whenever it is full
Notes:
> 

## Packaging and Outload (sheet 52-13)
### 14. Pro Box Unloading Station
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Feeds one of the inlet drum feeders
Information required:
- What it does operationally (returned boxed seed re-entering the line, or something else): yes this is correct, it returns treated stored seed to be bagged.
- How often it is used, and at what rate: not 100% sure, lets say 1 day a month
Notes:
> 

### 15. Inlet Drum Feeder 1
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Around 20 t/h, 0.15 kW, ethernet start
- [x] Two opening positions, with an empty-out cycle
Information required:
- Which feeder takes the scalping screen line and which takes the Pro Box line: There are two independant drum feeders for each
- Feed rate range (t/h): as above
- What each opening position does in flow terms: this will have to be assessed, but refer to the spreadsheet for estimates
Notes:
> 

### 16. Inlet Drum Feeder 2
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Around 20 t/h, 0.15 kW, ethernet start
Information required:
- Feed rate range (t/h): as above
- Same metering and empty-cycle behaviour as Feeder 1: as abive
Notes:
> 

### 17. Lift to Top Conveyor
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] 4.0 kW, ethernet start
- [x] Has a safe-start alarm and start-up area siren
Information required:
- Confirm it takes both drum feeders and lifts to the top transport conveyor: Need to confirm that it is a 4kW, yes it does take both drum feeders. However only one will be working at any given time. They will never run at the same time
- Throughput (t/h) and time to travel its length: 20t/h
- Time to coast to a stop after stopping: tbc
Notes:
> 

### 18. Start-up Area Siren
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Sounds before equipment in the area starts moving
Information required:
- How long it sounds before motion starts: 20 seconds
- Which equipment it covers and what order they start in: Any equipment in that area
Notes:
> 

### 19. Top Transport Conveyor
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Distributes to three branches: outload bins, big bag filling, and the Concetti line
Information required:
- Throughput (t/h), speed, and time to travel its length: 20t/h
- Drive type, motor power, ramp-up and ramp-down times: 
- Are the three branches fed at the same time or one at a time, and what decides routing: 
Notes:
> 

### 20. Distribution Hopper
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Sits on the top-conveyor distribution (exact role not yet clear)
Information required:
- What this hopper does and where it sits in the flow: Not too sure what this is???
- Working volume and level instruments: 
Notes:
> 

### 21. Distribution Conveyor
Status: New     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [ ] Paired with the distribution hopper (exact role not yet clear)
Information required:
- What this conveyor does and where it sits in the flow: 
- Throughput, drive type and motor power: 
Notes:
> 

### 22. Pneumatic Outlet and Auto Sampler (Concetti Branch)
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Discharges toward the Concetti bagging line, with an auto sampler
Information required:
- Does product hold up here or pass straight through: it would pass straight through
- How much and how often the sampler takes off, and where the sample goes: samples taken every day, every 3 hours or as instructed by the QC team
Notes:
> 

### 23. Metal Remover (Concetti Branch)
Status: New     Sheet: 52-13
Part of this line? No
Confirm or correct:
- [ ] Removes tramp metal on the Concetti branch before the pre-bin
Information required:
- Throughput (t/h): 
- Where removed metal goes, and how often it is cleared: 
Notes:
> 

### 24. Outload Buffer Bin
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Has an outlet valve feeding the packaging bucket elevator
Information required:
- Working volume (m3): 
- Level instruments fitted and their set points: high and low level
- What happens when it fills: 
Notes:
> 

### 25. Bucket Elevator (Packaging)
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Simatek E200 pendulum type, around 20 t/h
- [x] 196 buckets at 20.5 L each, chain 120 m at 10.08 m/min
- [x] 5.0 kW, ethernet start
- [x] Output at 70% fill: 20.84 t/h, 347 kg/min
Information required:
- Normal operating fill level (%): 50% - we must confirm that motor size
- The output table implies a bulk density of around 1.47 kg/L, which seems high for seed. Please confirm the real density and the figures in the table: lets look at the table for this calculation
- Time for material to travel from inlet to discharge (transport delay): 
- Time to coast to a stop after stopping, and what the pressure switch protects: 
Notes:
> 

### 26. Conveyor after Packaging Elevator
Status: New     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [ ] Variable-speed drive, sits at or after the packaging elevator
Information required:
- Where it sits in the flow and what it feeds: 
- Throughput, motor power, ramp-up and ramp-down times: 
Notes:
> 

### 27. Grain Break
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] A cascade chute that slows falling grain on the elevator discharge
Information required:
- Does product hold up here, or pass straight through: pass through
Notes:
> 

### 28. Outload Diverter
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Routes product to either Outload Metal Bin 1 or 2
Information required:
- Is this one diverter, or two valves in series: diverter
- Open and close time, and what decides which bin is fed: the operators
Notes:
> 

### 29. Treated Outload Metal Bin 1
Status: New     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [x] Has continuous level indication
Information required:
- Working volume (m3 and t): 
- Where it discharges (truck loadout, and what controls the gate): 
- Level set points that trip or stop the feed: 
Notes:
> 

### 30. Treated Outload Metal Bin 2
Status: New     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [ ] Has continuous level indication
Information required:
- Working volume (m3 and t): 
- Where it discharges, and what controls the gate: 
- Level set points that trip or stop the feed: 
Notes:
> 

### 31. Pneumatic Outlet and Auto Sampler (Big Bag Branch)
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Discharges toward the bin segment, with an auto sampler
Information required:
- Does product hold up here, or pass straight through: pass through
- How much and how often the sampler takes off, and where the sample goes: every 3 hours
Notes:
> 

### 32. Bin Segment
Status: New     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Working volume 4.51 m3 (3.25 t)
- [x] Has continuous level indication and pneumatic hammers
Information required:
- Confirm working volume: 
- Level set points that trip or stop the feed: yes
- What triggers it to discharge, and at what rate: the scada system
- What happens when it fills: 
Notes:
> 

### 33. Flexicon Pre-Bin
Status: Relocated     Sheet: 52-13
Part of this line? Yes
Confirm or correct:
- [x] Feeds the big bag filling head through a vibrating conveyor
- [x] Has high and low level switches
Information required:
- Working volume (m3): 
- High and low level set points and what they do: 
Notes:
> 

### 34. Vibrating Conveyor
Status: Relocated     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [ ] Direct-on-line drive (on or off, no ramp)
Information required:
- Throughput it feeds to the filling head (t/h): 
- Motor power: 
Notes:
> 

### 35. Flexicon Filling Head
Status: Relocated     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [ ] Fills big bags (FIBC), bag sits on roller conveyors over a belt scale
Information required:
- Big bag size (kg or m3): 
- Time to fill one bag: 
- Time to change a bag (no bag present): 
- What happens when no empty bag is ready: 
Notes:
> 

### 36. Motorised Roller Conveyors 1 to 4
Status: Relocated     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [ ] Four variable-speed roller conveyors carrying the big bag through the filling station
Information required:
- Whether these need modelling, or are just bag handling after filling: 
Notes:
> 

### 37. Inline Belt Scale (Big Bag Line)
Status: Relocated     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [ ] Weighs the big bag within the roller conveyor run
Information required:
- What it is used for (check weight, batch control): 
Notes:
> 

### 38. Flexicon Line 2 Main Field Supply
Status: Relocated (electrical panel)     Sheet: 52-13
Part of this line? (unanswered)
Confirm or correct:
- [ ] Electrical supply panel, not process equipment
Information required:
- Confirm this is out of scope for the demo: 
Notes:
> 

## Bagging (sheet 52-14)
### 39. Concetti Pre-Bin
Status: New     Sheet: 52-14
Part of this line? Yes
Confirm or correct:
- [ ] Working volume around 0.72 m3, feeds the bagging scale
Information required:
- Confirm working volume (m3): 
- Level instruments and set points: low and high level
Notes:
> 

### 40. Concetti Bagging Scale
Status: New     Sheet: 52-14
Part of this line? (unanswered)
Confirm or correct:
- [ ] Around 12 t/h, believed to be the slowest point on the line
Information required:
- Confirmed sustained rate (t/h): 
- Bag size (kg) and time to fill one bag: 
Notes:
> 

### 41. Concetti Filling and Sewing
Status: New     Sheet: 52-14
Part of this line? (unanswered)
Confirm or correct:
- [ ] Fills and sews the bags
Information required:
- Time per bag, and behaviour when no empty bag is ready: 
Notes:
> 

### 42. Inline Weigher Conveyor
Status: Existing or relocated     Sheet: 52-14
Part of this line? (unanswered)
Confirm or correct:
- [ ] Carries the filled bag across the checkweigher
Information required:
- Whether anything past the filler needs modelling beyond a bag count: 
Notes:
> 

### 43. Inline Belt Scale (Checkweigher)
Status: Existing or relocated     Sheet: 52-14
Part of this line? (unanswered)
Confirm or correct:
- [ ] Check-weighs each filled bag
Information required:
- What happens to an out-of-weight bag: 
Notes:
> 

### 44. Palletiser Conveyor 1
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Information required:
- Bag handling only, or anything that could back up to the filler: 
Notes:
> 

### 45. Palletiser Conveyor 2
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Information required:
- Bag handling only, or anything that could back up to the filler: 
Notes:
> 

### 46. Pallet Index Conveyor 1
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Information required:
- Bag or pallet handling only: 
Notes:
> 

### 47. Pallet Index Conveyor 2
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Information required:
- Bag or pallet handling only: 
Notes:
> 

### 48. Concetti Palletiser 2
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Confirm or correct:
- [ ] Stacks filled bags onto pallets
Information required:
- Bags per pallet and pallet rate (pallets per hour): 
- Whether the model should end at the bagging scale and treat everything after as a count: 
Notes:
> 

### 49. Incline Roller Conveyor 1
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Information required:
- Pallet handling only: 
Notes:
> 

### 50. Incline Roller Conveyor 2
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Information required:
- Pallet handling only: 
Notes:
> 

### 51. Decline Roller Conveyor 1
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Information required:
- Pallet handling only: 
Notes:
> 

### 52. Decline Roller Conveyor 2
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Information required:
- Pallet handling only: 
Notes:
> 

### 53. Pallet Magazine Conveyor 1
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Confirm or correct:
- [ ] Supplies empty pallets to the palletiser
Information required:
- Whether this matters to the model at all: 
Notes:
> 

### 54. Pallet Magazine Conveyor 2
Status: Relocated     Sheet: 52-14
Part of this line? (unanswered)
Confirm or correct:
- [ ] Supplies empty pallets to the palletiser
Information required:
- Whether this matters to the model at all: 
Notes:
> 

### 55. Concetti Bagging Line 2 Main Field Supply
Status: Existing (electrical panel)     Sheet: 52-14
Part of this line? (unanswered)
Confirm or correct:
- [ ] Electrical supply panel, not process equipment
Information required:
- Confirm this is out of scope for the demo: 
Notes:
> 

## Line-wide questions
- Interlocks: when a bin reaches a high level, or a machine trips, which upstream equipment stops, in what order, and after how long? Is there a cause-and-effect list we can have?
  Answer: 
- Conveyor ramp times: how long does each variable-speed conveyor take to speed up and slow down? Which equipment stops almost instantly (direct-on-line)?
  Answer: 
- Control response: is there a typical delay between a sensor reading and the equipment reacting (controller scan, network) that is worth allowing for?
  Answer: 
- High-high level switches: where are these actually fitted along the line?
  Answer: 
- Start-up sequence: how long does the siren sound before motion, and in what order does the line start up?
  Answer: 
- Routing: at the top conveyor, what decides which of the three branches runs?
  Answer: 
- Where removed metal, samples, and rejects go, for each take-off point along the line.
  Answer: 
- Where the outload metal bins discharge (truck loadout), and how that is controlled.
  Answer: 

## Open decisions (for the model)
- Where to truncate the model: a likely start is the feed into the treating area, and likely end points are the bag and bin level counts. Confirm against the answers.
  Answer: 
- Whether to represent the chemical and formulation input as a flowing stream or as a simple on/off state on the treater.
  Answer: 
- Whether to show the waste water and dust extraction networks, or leave them out.
  Answer: 
- Default value to plot on the shared chart for each machine (throughput or fill level).
  Answer: 

## After the meeting
- Move confirmed answers from this sheet into:
- docs/REAL_LINE_SPECS.md (the durable record of the line)
- src/line/lineData.js (the machine names, parameters, and connections that drive the demo)

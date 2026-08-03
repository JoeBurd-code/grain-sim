# Hybrid simulation model

Conserved material in the sim can exist as continuous belt flow, an accumulated
batch (bucket, vessel, or bucket-elevator bucket), or an in-flight free-falling
parcel — never forced into a single uniform representation. The real line is
genuinely all three (belts between machines, batch bins and the treater, bucket
elevators with free-fall discharge), and the original mock already proved each
piece works in isolation (belt cells, `bucket`, the `inFlight` queue). A single
representation (e.g. everything-as-a-queue) would have been simpler but wouldn't
match any of the three physical behaviors well.

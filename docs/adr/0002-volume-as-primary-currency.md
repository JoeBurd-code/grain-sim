# Volume, not mass, as the primary conserved currency

Volume (m³) is what the sim conserves and steps forward each tick; mass is derived
(`mass = volume × density`) only where it's actually read — by a sensor, or by a
machine that deliberately changes density. This was chosen because volume is what
belt physics and fill-height visuals are naturally expressed in, and because most
machines on the real line pass density through untouched — computing mass
everywhere would have added bookkeeping with no payoff. The one machine that looked
like it might need mass-tracking, the treater, was later confirmed (2026-06-30) to
change seed density only negligibly, which removed the strongest case against this
decision.

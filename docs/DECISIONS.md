## 6. Rulings (copy to docs/DECISIONS.md)

Ruled by Zach Pressley, October 14, 2026, unless marked as proposed. Proposed items are recommendations Zach has not yet confirmed. Treat them as open.

**Q1. Movement rate vs. round length.** With 25m tiles, the 40×40 map is only 1 km square, and formed infantry covers about half of it in one 10-minute order. Ruling: keep 25m tiles and make the map much bigger. The game is no longer bound by Discord's limits. Exact size is set in Stage 1. *Proposed:* map size is a per-scenario setting starting around 200×200 (5 km), and the engine uses numeric x,y coordinates internally while players mostly refer to landmarks.

**Q2. Old code archival.** Tag `legacy-final`, then move retired code into `archive/` on `main` with a README. Nothing is deleted.

**Q3. Officer death rate.** *Proposed:* tie risk to exposure instead of a flat rate (low while holding, higher in melee, highest when the unit routs or is overrun), with wounded or captured coming before death in most cases. Playtest targets of roughly 1 in 20 to 30 battles on a winning side and 1 in 5 on a side that routs.

**Q4. Weapon effectiveness.** The engine supports both multipliers and flat bonuses, because having both gives more ways to weight the game. Values come from playtesting. What must be fixed in the spec is how and when each applies. *Proposed:* flat bonuses add to the base value first, then multipliers apply to that total, always in that order.

**Q5. Attacker and defender.** Removed permanently. Two units fighting are both attacking; neither role means anything. Units are Side 1 and Side 2. Advantage comes from position and circumstance: a unit coming down a hill gains, a unit in a worse position is penalized, an ambushed unit is penalized, and chaos and preparedness apply as already designed. Charge momentum belongs to the unit that moved into contact. A guard test keeps role language out of the engine.

**Q6. Unit size and tile capacity.** Armies run from a few hundred to about 1,000 per side. Combat math must be scale-invariant: casualties work as proportions, so 300 against 300 plays the same as 25 against 25, while casualty rates stay realistic and every clash feels like it matters. Units stay small enough that each one's commander has a visible effect; very large units would need several commanders and blur that.

**Q7. Tribal Warriors.** A faction-specific unit (for example, Germanic tribes). Same cost and same fighting ability as Militia, plus a morale bonus so they fight longer and rout less. Effectively fiercely loyal militia.

**Q8. The `training` field.** Removed from the army builder for now. Training tier comes from the quality ladder. Buying training may come back later as a purchase.

**Damage system.** The formula in `combat_design_parameters.md` is inverted against its worked examples. The tested damage rebuild on the recovered branch is the starting point. Where code, tests and worked examples agree, fix the doc to match. Where they disagree, log it for Zach.

**Not yet ruled.** Whether commander quality and unit quality are separate stats (proposed: separate, with the quality ladder governing how a unit fights and the commander governing how deep an order it can execute), and the player-facing coordinate format.

## Rulings, October 21, 2026

Ruled by Zach Pressley in conversation, October 21, 2026. Where a ruling
needs interpreting, the reading is marked as such and stays open until
confirmed.

**Player surface.** A web app, for now. The legacy Discord bot stays as it
is until the web app can run a full battle, then retires to `archive/`.

**Commander quality vs. unit quality.** Separate. Every commander has the
same quality (no commander is better at executing orders than another).
Commanders differ in personality. Unit quality still comes from the quality
ladder.

**Q3. Officer death rate.** It should hurt about 1 battle in 10 on a winning
side and about 1 in 5 on a losing side: a chance each battle, not something
that always happens. Risk also rises with the officer's unit's losses: the
fewer men left in a unit, the more likely its officer was killed in action.
Exact numbers are tuned by simulation to hit those rates.

**Officers captured or wounded.** Both, as well as killed. Capture is a fate
in its own right. A wound is a near miss, or the result of the player's
poor choices, such as leaving a unit exposed.

**AI provider.** Groq. When it fails, the game falls back to the
deterministic order grammar and plain event text.

**Q4. How bonuses combine.** The order (flat bonuses before multipliers or
not) does not matter much. What matters is that results scale well and the
game is fun. The current implementation stands; tune for outcomes.

**Player-facing coordinates.** A coarse grid that is easy to say and read:
letters for columns, numbers for rows, 20×20 squares, each square split
into 4 quarters. On a 2 km map (80×80 tiles of 25 m), a square is 100 m
(4×4 tiles) and a quarter is 50 m (2×2 tiles). Map features and landmarks
do most of the work. The engine keeps its numeric x,y underneath.
(Confirmed October 21.)

**Landmarks and navigation.** Named landmarks started as a way to give the
AI something to describe, and turned into the main way to navigate. That
was not the intent. Players should mostly give orders in general terms
about the ground: "approach the ridge to the east", "stop at the clearing
and set up a defensive position". Named landmarks stay for flavour and
summaries.

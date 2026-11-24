// src/engine/combat/tables.js
//
// Every number the combat engine reads. Data only — no logic, no randomness.
//
// Provenance matters here, so each table says where its numbers came from:
//
//   [notebook]  the design contract in docs/design/combat-design.md
//   [salvage]   copied from the legacy tree (src/game/*) per the salvage map in
//               docs/PHASE2_COMBAT_PLAN.md section 5. Numbers only, never code.
//   [derived]   new, because the round-based model has no legacy equivalent.
//               These are the tuning knobs — expect them to move.
//
// Rulings applied (docs/design/architecture-roadmap.md section 8):
//   Q4  weapon `effectiveness` is a damage multiplier, divided by 100
//   Q6  standard units are ~100 strong, elites 80
//   Q7  Tribal Warriors = Militia stats and cost, Professional morale
//   Q8  the separate `training` purchase is gone; quality tier IS training

// ── Troop quality ladder ───────────────────────────────
//
// [notebook] Stats rise with tier, and cost rises with them, so no cheap unit
// strictly dominates an expensive one. Two tiers break the monotonic pattern
// on purpose, and both are the notebook's doing:
//
//   tribal_warriors   Militia's stats and Militia's cost, but Professional
//                     morale. The bonus is faction loyalty, not a price
//                     premium, so it is faction-gated instead of paid for.
//   veteran_mercenary Best attack in the ladder, Militia morale. They hit
//                     hardest and leave first when losing.
//
// `size` is the unit's default strength per Q6. `attack`/`defense`/`push` are
// small integers that add to equipment ratings; `morale` feeds resistance, not
// a pool — see MORALE below.

const QUALITY_TIERS = {
  levy: {
    name: 'Levy',
    cost: 3,                 // [salvage] armyData TROOP_QUALITY
    size: 100,               // [Q6] was 400
    attack: 1,               // [salvage]
    defense: 1,              // [salvage]
    morale: 1,               // Recommendation A (docs/design/army-balance.md; taken 2026-11-23): was 0 [salvage]; at 0 levy broke at a look
    push: 1,                 // [derived] push has no legacy table
    staminaPool: 60,         // [notebook] better training = more stamina
    restrictions: ['heavy_weapons', 'heavy_armor', 'heavy_shield']
  },
  militia: {
    name: 'Militia',
    cost: 5,
    size: 100,
    attack: 2,
    defense: 2,
    morale: 2,               // Recommendation A: was 1
    push: 2,
    staminaPool: 75,
    restrictions: []
  },
  tribal_warriors: {
    name: 'Tribal Warriors',
    cost: 5,                 // [Q7] was 4 — equalized to militia
    size: 100,
    attack: 2,               // [Q7] was 3 — equalized to militia
    defense: 2,              // [Q7] was 2 — unchanged
    morale: 3,               // [Q7] Professional morale. The whole point.
    push: 2,
    staminaPool: 75,
    factionGated: true,      // [Q7] availability, not price, is the cost
    restrictions: []         // [Q7] same kit as Militia; the legacy heavy-armour ban dropped
  },
  professional: {
    name: 'Professional',
    cost: 7,
    size: 100,
    attack: 4,
    defense: 4,
    morale: 3,
    push: 3,
    staminaPool: 95,
    restrictions: []
  },
  veteran_mercenary: {
    name: 'Veteran Mercenary',
    cost: 9,
    size: 100,
    attack: 6,
    defense: 5,
    morale: 1,               // [notebook] "morale of mere Militia"
    push: 4,
    staminaPool: 110,
    restrictions: []
  },
  elite: {
    name: 'Elite',
    cost: 0,                 // [salvage] free, one per army, culture-assigned
    size: 80,                // [Q6] resolves the 300-vs-40-100 contradiction
    attack: 6,               // [notebook] "attack at Veteran Mercenary level"
    defense: 6,              // [notebook] better than Professional across the board
    morale: 5,               // [notebook] best in the game
    push: 5,
    staminaPool: 120,
    restrictions: []
  }
}

// Ordered worst to best. Used for tier comparisons and for the harness
// assertion that rounds-to-resolution rises with tier in mirror matches.
const QUALITY_ORDER = [
  'levy', 'militia', 'tribal_warriors', 'professional', 'veteran_mercenary', 'elite'
]

// ── Armour ─────────────────────────────────────────────
//
// Three separate things, deliberately not collapsed:
//   defense       [salvage] battleEngine ARMOR_DEFENSE_RATINGS — adds to the
//                 defense rating, the thing attack is measured against.
//   damageClass   which column of a weapon's `effectiveness` table this unit
//                 is looked up in. The rock-paper-scissors key.
//   staminaDrain  [notebook] kit weight, per locked decision 2. Heavy kit
//                 protects and hits harder but runs the tank down faster.
//   push          [derived] mass helps you shove.
//
// Heavy armour's drain was 6 and is 12 (army balance, docs/design/
// army-balance.md part 5): heavy infantry is the best in a stand-up fight,
// and the price of it is wind. At 6, two professional units in heavy armour
// won 88% of their battles against the usual armies and 79% against the
// other classic armies; at 12, 78% and 69%, and pikes on the flat beat them
// (54%). The notebook: "heavies must win before they gas out".

const ARMOR = {
  no_armor:     { defense: 0, damageClass: 'light',  staminaDrain: 0,   push: 0 },
  light_armor:  { defense: 3, damageClass: 'light',  staminaDrain: 1,   push: 0 },
  medium_armor: { defense: 6, damageClass: 'medium', staminaDrain: 3,   push: 1 },
  heavy_armor:  { defense: 9, damageClass: 'heavy',  staminaDrain: 12,  push: 2 }
}

// ── Shields ────────────────────────────────────────────
// [salvage] battleEngine SHIELD_DEFENSE_BONUSES; drain and push [derived].

const SHIELD = {
  no_shield:     { defense: 0, staminaDrain: 0,   push: 0 },
  light_shield:  { defense: 1, staminaDrain: 0.5, push: 0 },
  medium_shield: { defense: 2, staminaDrain: 1,   push: 1 },
  heavy_shield:  { defense: 3, staminaDrain: 2.5, push: 2 }
}

// ── Mount ──────────────────────────────────────────────
// [salvage] armyData MOUNT_OPTIONS charge_bonus; drain and push [derived].
// A horse is mass and momentum, and it tires.

const MOUNT = {
  defense: 1,
  // [derived] Deliberately modest. A horse's real shove is momentum, and
  // momentum lives in CHARGE, not here. An earlier value of 3 gave cavalry a
  // standing push advantage that never decayed, so a horse stuck in a melee
  // still out-shoved the infantry holding it - the exact opposite of the
  // notebook's "bad in long melee engagements", and invisible until the matrix
  // could tell a charge apart from a unit caught standing.
  push: 2,
  staminaDrain: 2,
  chargeBonus: 2
}

// ── Weapons ────────────────────────────────────────────
//
// [salvage] armyData.js, all 39 entries, verbatim. This is the single source of
// weapon truth for phase 2 — the legacy battleEngine WEAPON_ATTACK_RATINGS table
// is deliberately NOT merged in, because it is a second, differently-scaled
// attack number for the same weapons and double-counting it would inflate every
// rating. armyData wins because it is the table that carries `effectiveness`.
//
//   damage         base attack contribution
//   effectiveness  percentage vs each target armour class [Q4: multiplier / 100]
//   antiCavalry    derived from effectiveness.cavalry >= 85 — the spear counter
//   ranged         has a `range` in metres (25m per tile at this scale)

const WEAPONS = {
  // Light
  clubs:                   { damage: 6,  effectiveness: { light: 75, medium: 85, heavy: 60, cavalry: 40 } },
  daggers:                 { damage: 5,  effectiveness: { light: 70, medium: 30, heavy: 15, cavalry: 20 } },
  spear_basic:             { damage: 7,  effectiveness: { light: 80, medium: 60, heavy: 35, cavalry: 95 } },
  sickle:                  { damage: 5,  effectiveness: { light: 65, medium: 25, heavy: 10, cavalry: 30 } },
  light_javelin:           { damage: 5,  effectiveness: { light: 60, medium: 35, heavy: 15, cavalry: 50 }, range: 30 },
  germanic_war_scythe:     { damage: 6,  effectiveness: { light: 70, medium: 40, heavy: 20, cavalry: 35 } },
  chinese_quarterstaff:    { damage: 6,  effectiveness: { light: 75, medium: 45, heavy: 25, cavalry: 60 } },
  roman_pugio:             { damage: 5,  effectiveness: { light: 70, medium: 30, heavy: 15, cavalry: 20 } },

  // Medium
  spear_professional:      { damage: 8,  effectiveness: { light: 90, medium: 70, heavy: 45, cavalry: 95 } },
  battle_axe:              { damage: 8,  effectiveness: { light: 85, medium: 90, heavy: 65, cavalry: 55 } },
  mace:                    { damage: 7,  effectiveness: { light: 70, medium: 95, heavy: 85, cavalry: 50 } },
  sword_standard:          { damage: 7,  effectiveness: { light: 85, medium: 55, heavy: 30, cavalry: 45 } },
  roman_gladius:           { damage: 8,  effectiveness: { light: 90, medium: 60, heavy: 35, cavalry: 40 } },
  greek_xiphos:            { damage: 7,  effectiveness: { light: 85, medium: 55, heavy: 30, cavalry: 40 } },
  chinese_dao:             { damage: 8,  effectiveness: { light: 85, medium: 60, heavy: 35, cavalry: 50 } },
  celtic_longsword:        { damage: 8,  effectiveness: { light: 90, medium: 65, heavy: 40, cavalry: 50 } },
  persian_akinakes:        { damage: 6,  effectiveness: { light: 75, medium: 50, heavy: 25, cavalry: 40 } },

  // Heavy
  two_handed_spear:        { damage: 10, effectiveness: { light: 85, medium: 75, heavy: 55, cavalry: 90 } },
  heavy_mace:              { damage: 12, effectiveness: { light: 70, medium: 95, heavy: 85, cavalry: 45 } },
  great_axe:               { damage: 11, effectiveness: { light: 90, medium: 85, heavy: 70, cavalry: 50 } },
  macedonian_sarissa:      { damage: 9,  effectiveness: { light: 85, medium: 70, heavy: 50, cavalry: 95 } },
  thracian_rhomphaia:      { damage: 11, effectiveness: { light: 95, medium: 85, heavy: 70, cavalry: 60 } },
  celtic_champions_sword:  { damage: 10, effectiveness: { light: 90, medium: 75, heavy: 50, cavalry: 55 } },
  chinese_chang_dao:       { damage: 10, effectiveness: { light: 85, medium: 70, heavy: 45, cavalry: 80 } },
  germanic_framea:         { damage: 9,  effectiveness: { light: 80, medium: 65, heavy: 40, cavalry: 85 } },
  persian_kontos:          { damage: 15, effectiveness: { light: 95, medium: 90, heavy: 80, cavalry: 85 } },

  // Ranged — ranges in metres. Archers cannot use these while engaged in melee
  // (notebook), so in phase 2 they contribute melee damage only.
  // Recommendation A (docs/design/army-balance.md; taken 2026-11-23): sling range 300 -> 200, war
  // sling 350 -> 250: a sling outranged every bow, at a third of the price.
  sling:                   { damage: 8,  effectiveness: { light: 85, medium: 45, heavy: 25, cavalry: 90 }, range: 200 },
  self_bow_basic:          { damage: 6,  effectiveness: { light: 70, medium: 35, heavy: 15, cavalry: 65 }, range: 125 },
  throwing_spear:          { damage: 6,  effectiveness: { light: 75, medium: 45, heavy: 25, cavalry: 70 }, range: 25 },
  roman_plumbatae:         { damage: 5,  effectiveness: { light: 65, medium: 40, heavy: 20, cavalry: 45 }, range: 15 },
  germanic_throwing_axe:   { damage: 6,  effectiveness: { light: 70, medium: 50, heavy: 30, cavalry: 40 }, range: 20 },
  self_bow_professional:   { damage: 8,  effectiveness: { light: 75, medium: 45, heavy: 20, cavalry: 60 }, range: 225 },
  javelin_heavy:           { damage: 9,  effectiveness: { light: 85, medium: 65, heavy: 40, cavalry: 75 }, range: 35 },
  sling_professional:      { damage: 10, effectiveness: { light: 85, medium: 45, heavy: 25, cavalry: 90 }, range: 250 },
  roman_pilum:             { damage: 9,  effectiveness: { light: 80, medium: 70, heavy: 50, cavalry: 60 }, range: 25 },
  greek_composite_bow:     { damage: 9,  effectiveness: { light: 80, medium: 50, heavy: 25, cavalry: 65 }, range: 200 },
  persian_recurve_bow:     { damage: 9,  effectiveness: { light: 80, medium: 50, heavy: 25, cavalry: 70 }, range: 200 },
  han_chinese_crossbow:    { damage: 11, effectiveness: { light: 95, medium: 85, heavy: 70, cavalry: 60 }, range: 150 },
  parthian_horse_bow:      { damage: 9,  effectiveness: { light: 80, medium: 50, heavy: 25, cavalry: 75 }, range: 180 }
}

// A unit with no weapon specified fights with this. Scenarios in the harness
// were written before weapons existed, so this keeps them runnable.
const DEFAULT_WEAPON = 'sword_standard'

// [notebook] "Spears beat horses." A weapon counts as bracing against a charge
// when its anti-cavalry effectiveness is at or above this line. At 85 that is
// exactly the spear/sarissa/framea family — the historically correct set.
const ANTI_CAVALRY_THRESHOLD = 85

// ── Chaos ──────────────────────────────────────────────
//
// [locked decision 4] Chaos is the single RNG channel. Everything random in the
// engine flows through it, which is what makes a seeded run reproducible.
//
// [salvage] battleEngine ENVIRONMENTAL_CHAOS.terrain, but mapped EXPLICITLY to
// phase 1's terrain keys rather than assumed to match. The two key sets differ:
// phase 1 has road/ford/bridge and has no desert/urban/mountain. The plan warns
// about exactly this, so the mapping is written out rather than merged.

// KNOWN ISSUE, not yet ruled on. These values were authored for a
// single-resolution engine where chaos applied once. Here they apply EVERY
// round, to attack, defense and morale at once, which makes a terrain chaos
// value a large persistent penalty rather than a flavour modifier — and it
// swamps the corresponding entry in TERRAIN_MODIFIERS.
//
// The clearest case is forest. Cover is supposed to favour the unit in it, and
// TERRAIN_MODIFIERS.forest_cover says so (+defense, -attack). But forest also
// carries 2 chaos, and measured against a mirror the unit in cover wins 0% standing
// in woods; set forest chaos to 0 and the same matchup is 47/53. The cover
// bonus is doing nothing and the disorder penalty is doing everything, so
// standing in a forest is currently a straightforward mistake.
//
// Whether that is right is a design question — woods genuinely do break up
// formations — but it should be a decision, not an accident of a salvaged
// table. Flagged for a ruling before phase 4 wires terrain into real battles.
const TERRAIN_CHAOS = {
  plains: 0,   // [salvage] plains 0
  road:   0,   // [derived] phase 1 only — a road is as orderly as plains
  hill:   1,   // [salvage] hill 1
  forest: 2,   // [salvage] forest 2
  marsh:  2,   // [salvage] marsh 2
  river:  1,   // [salvage] river 1 — impassable in phase 1, kept for completeness
  ford:   2,   // [derived] phase 1 only — a contested crossing is disordered
  bridge: 1    // [derived] phase 1 only — constrained frontage, but firm footing
}

// [salvage] battleEngine TACTICAL_CHAOS.combat_situation, trimmed to the states
// phase 2 can actually be in. The rest arrive with their features.
const SITUATION_CHAOS = {
  prepared: 0,
  meeting_engagement: 1,
  ambush: 4
}

// [locked decision 4] Preparedness subtracts from chaos but can never eliminate
// it — the roll floor stays above zero so no two matchups play out the same.
const CHAOS = {
  MAX: 10,              // [salvage] the legacy scale was 0-10
  ROLL_MAX: 4,          // [derived] how much of the scalar is luck per round
  // [notebook] "prepared reduces chaos". Reduced from 3, because being prepared
  // turned out to be the single strongest state in the engine: chaos degrades
  // attack, defense AND presses on morale, so a chaos discount is a persistent
  // advantage on three channels at once. Braced-vs-unbraced was 100/0.
  //
  // Worth recording what tuning could NOT fix here. Morale is monotonic down
  // with no recovery (locked decision 5), and chaos is zero-mean noise, so any
  // constant edge — however small — accumulates in one direction over 4-8
  // rounds and decides the fight. Zeroing this reduction entirely still left
  // the braced side winning 97%. Graded win rates need a mechanism for the
  // trailing side to recover, and recovery is explicitly a phase 8 feature.
  // Until then, "counters are not absolute" holds through CONDITIONS — quality,
  // timing, who charged — rather than through close win rates.
  PREPARED_REDUCTION: 2,
  SURPRISE_PENALTY: 4,   // [notebook] "surprise increases chaos"
  // Each point of chaos degrades the disordered side's ratings by this much.
  EFFECT_PER_POINT: 0.03,   // chaos 10 -> x0.70 on attack/defense/push
  // ...and pushes on morale directly, which is how chaos causes routs.
  MORALE_PER_POINT: 0.5
}

// ── Stamina ────────────────────────────────────────────
//
// [locked decision 2] Three separated knobs. Pool comes from training tier
// (QUALITY_TIERS.staminaPool), drain rate comes from kit weight (ARMOR/SHIELD/
// MOUNT staminaDrain), and the fatigue multiplier is ONE universal curve of
// stamina percentage shared by every unit. The notebook's two curve shapes —
// heavy plateaus then falls off a cliff, light declines gently — emerge from
// different drain rates crossing the same curve at different speeds. No
// per-kit curve shapes are needed, and that is the point of the decision.

const STAMINA = {
  BASE_DRAIN: 8,        // [derived] the cost of fighting at all, per round
  // [notebook] "full effectiveness above ~60% stamina, degrading toward ~50%
  // effectiveness at zero — tune in the harness."
  FULL_ABOVE: 0.60,
  FLOOR_MULTIPLIER: 0.50
}

// ── Push ───────────────────────────────────────────────
//
// [locked decision 3] Push NEVER causes casualties. Winning the shove costs the
// loser morale (the real price — being driven back is a confidence killer) and
// stamina, and in later phases flips terrain advantage and feeds stacking.

const PUSH = {
  MORALE_COEF: 2.0,     // [derived] morale lost per point of push differential
  STAMINA_COEF: 1.5,    // [derived] stamina lost per point of push differential
  // [locked decision 3] Winning the shove has positional consequences once
  // combat meets the map. A differential at or above this line is a real
  // shove: the resolver reports it, and the phase 4 battle runner moves the
  // loser one tile straight back — which is the crest rule for free, because
  // terrain is read from position. Below the line the shove is just the
  // morale/stamina pressure above.
  SHOVE_THRESHOLD: 2.0
}

// ── Flanking ───────────────────────────────────────────
//
// [derived from salvage] SITUATIONAL_ATTACK_MODIFIERS had flanking +2 and
// rear +4 — but those were single-resolution numbers, and phase 2's tuning
// showed that a persistent per-round edge compounds into a verdict (see the
// note on CHAOS.PREPARED_REDUCTION). So: +1 attack per extra engagement the
// enemy is caught in, capped. Direction (flank vs rear) needs facing,
// which no unit has yet — that refinement is phase 8's formations work.
//
// Only active when one unit appears in several engagements at once, which
// can never happen in a duel — the balance matrix and its assertions are
// untouched by this table.

const FLANKING = {
  ATTACK_PER_EXTRA_ENGAGEMENT: 1,
  CAP: 2
}

// ── Crowding (stacking) ────────────────────────────────
//
// Friendly units may share a tile (ruled 2026-10-21), paying for it once the
// tile holds more men than it comfortably can. The tiers are the earlier
// build's density table (STACK-002, archive/docs/Context/Old Context/
// cohort_task_list.md), its thresholds quartered for 25 m tiles as the
// roadmap's scale table (§6) planned. A standard unit is 100 men, so two
// full units on one tile are already `compressed`; worn-down units crowd
// together more cheaply.
//
// Tiers apply only to a shared tile: a lone unit is never crowded, whatever
// its size. move is the share of movement lost, combat comes off attack and
// defense, morale is lost per combat round (the old table's -2 was on a
// smaller morale scale; this one runs to 100).
//
// Ruled 2026-10-29: crowding is meant to punish fighting packed together,
// not moving. The old table's movement losses (25/50/75/90%) are cut to
// 0/10/25/50%; the combat penalties stand.

const CROWDING = {
  CAP: 300, // men per tile, hard limit
  TIERS: [
    { name: 'organized', upTo: 100, move: 0, combat: 0, morale: 0 },
    { name: 'crowded', upTo: 150, move: 0, combat: 1, morale: 0 },
    { name: 'compressed', upTo: 200, move: 0.1, combat: 2, morale: 0 },
    { name: 'crushing', upTo: 250, move: 0.25, combat: 3, morale: 0 },
    { name: 'critical', upTo: 300, move: 0.5, combat: 4, morale: 5 }
  ],
  // However packed, a unit can still shuffle one tile of open ground a
  // turn, so a jam always unpicks.
  MIN_MOVE: 1
}

// ── Leaving a fight ────────────────────────────────────
//
// Ruled 2026-10-29: a fight holds on. Breaking contact costs movement, and
// the enemy gets a parting blow whose weight is chance (a chaos roll): even
// an orderly withdrawal can go wrong. Drilled troops do it far better (the
// Macedonian phalanx could wheel and withdraw in the face of the enemy);
// moving carefully halves the harm. Broken units are not this rule: they
// are pursued.
//
//   MOVE_COST          movement points spent breaking contact
//   CASUALTY_FRACTION  share of the unit lost at the worst roll, for levy,
//                      in a rapid withdrawal
//   MORALE             morale lost at the worst roll, likewise
//   ORDERLY            multiplier for a careful withdrawal
//   DRILL              multiplier by quality: how well the unit does it

const DISENGAGE = {
  MOVE_COST: 1,
  CASUALTY_FRACTION: 0.08,
  MORALE: 8,
  ORDERLY: 0.5,
  DRILL: {
    levy: 1.0,
    militia: 0.85,
    tribal_warriors: 0.75,
    professional: 0.55,
    veteran_mercenary: 0.5,
    elite: 0.3
  }
}

// ── Exposure ───────────────────────────────────────────
//
// Ruled 2026-10-29: a hidden unit with an enemy standing right beside it is
// ever more likely to be noticed. Each turn in a row an enemy stands within
// one tile, the chance of being found rises by PER_TURN (25%, 50%, 75%,
// then certain). Moving away, or the enemy leaving, resets it.

const EXPOSURE = {
  PER_TURN: 0.25
}

// ── Surprise ───────────────────────────────────────────
//
// Stage 3 plan, C4: a unit its target's side did not see as the turn
// began, falling on a unit that was marching, gets an edge in the first
// round of the fight, and the shock costs the target morale. Nothing
// against a unit moving carefully or standing. This stands in for "hitting
// the rear" until units have facing. Starting values, to be tuned.

const SURPRISE = {
  ATTACK: 2,
  MORALE: 10
}

// ── Pursuit ────────────────────────────────────────────
//
// [derived] A broken unit caught at the start of its flight bleeds. The old
// docs gave broken units -50% defense and pursuers +3 attack; run through the
// phase 2 ratio math that lands near an extra tenth of the unit per pursuer,
// so it is stated directly as a fraction — deterministic, no RNG channel
// beyond the rout that caused it. Re-validate in the harness when cavalry
// pursuit becomes a real mechanic (roadmap phase 4 exit notes).

const PURSUIT = {
  CASUALTY_FRACTION: 0.10,  // of current strength, per adjacent enemy
  // A broken unit that could not move this turn - fled into its own line, or
  // cornered - is being overrun, not chased. The first battle runs found the
  // failure this guards against: a trapped remnant bled 10% a round, rounding
  // toward zero, and an immortal nine-man wreck gridlocked both armies behind
  // it past the turn cap.
  TRAPPED_FRACTION: 0.30,
  MIN_KILLED: 1,            // a caught fleeing man dies; no asymptotic remnants
  MAX_PURSUERS: 2           // more than two cannot reach a fleeing column
}

// ── Missiles ───────────────────────────────────────────
//
// Ruled 2026-11-21: missile troops shoot. A unit whose weapon reaches
// MIN_RANGE_M or more (bows, slings, crossbows) looses a volley each tick at
// an enemy it can see within its reach, when it stood still that tick (horse
// archers may shoot on the move) and is not itself in a melee (design:
// "archers cannot use ranged attacks while under melee attack"). See
// combat/ranged.js and the missile step of battle/battle.js.
//
// Losses are light beside a melee's: RATE men per shooter per volley with a
// weapon of NORMAL_DAMAGE, times the weapon's `effectiveness` against the
// target's armour, the same table melee uses. A hundred bowmen at close
// range fell about five unarmoured men a volley, three in medium armour,
// one or two in heavy; a round of melee between even units costs each
// about ten. The losses shake morale through the ordinary morale formula,
// and a unit can break under fire.
//
// An enemy locked in a melee can be shot at, over the heads of the men
// fighting it, at INTO_MELEE of the effect: this is what archers behind a
// line are for. (The first build forbade it, and in a whole battle the
// archers loosed one volley: armies close from sight to contact in a tick.)
// No volley harms a friend. Starting values, to be tuned in play.
//
// Arrows do not run out (ruled 2026-11-21): having to stand still to shoot
// is the limit, and a supply would need more damage up front or it would
// handicap the factions built on missile troops.

const MISSILES = {
  MIN_RANGE_M: 100,
  RATE: 0.08,
  NORMAL_DAMAGE: 9,
  // Past half the weapon's reach the volley falls thin.
  LONG_SHOT: 0.6,
  // What the target's shield stops.
  SHIELD: { no_shield: 1, light_shield: 0.9, medium_shield: 0.8, heavy_shield: 0.65 },
  // A target among trees.
  IN_WOODS: 0.5,
  // A target locked in a melee with the shooters' friends.
  INTO_MELEE: 0.5,
  // Horse archers shooting as they ride.
  ON_THE_MOVE: 0.6,
  // Ruled 2026-11-21: "horse archers will need reduced numbers to be fair
  // in fights". They shoot without having to stand, which is the limit on
  // everyone else, so a mounted missile unit is raised at this share of
  // its quality tier's men (army/builder.js). A starting value.
  HORSE_ARCHER_NUMBERS: 0.6,
  // Recommendation A (docs/design/army-balance.md; taken 2026-11-23): how hard men felled by a volley shake a unit, as a share of
  // the same men felled hand to hand (was 1). Missile fire wears a unit;
  // the melee breaks it.
  SHOCK: 0.67,
  // Recommendation A: the weapon a missile unit fights with hand to hand (a key of
  // WEAPONS): its knife, not its sling or bow (the notebook: "engaged
  // archers fight (poorly) in melee"). null: its missile weapon's numbers,
  // as before, when a sling was swung as hard as a sword and braced
  // against horse like a spear. A unit's own `sidearm` comes first (Kush's
  // Golden Bows carry a sword: src/data/factions.js).
  SIDEARM: 'daggers'
}

// ── Thrown weapons ─────────────────────────────────────
//
// Second weapons (docs/design/army-balance.md, part 8): a unit that carries
// javelins, pila, plumbatae or throwing axes beside its hand weapon looses
// one volley of them as it comes to blows with an enemy, whether it closed
// or was closed on, and then fights hand to hand (battle/battle.js, the
// throw at contact; combat/ranged.js, thrownVolley). A volley as any
// missile volley is reckoned (MISSILES.RATE, the weapon's damage and its
// effectiveness against the target's armour, the target's shield), times
// CLOSE: every man throws, at a few paces, into a packed front. Only a
// unit with throws left throws: a man carried two or three, not a quiver.
// Starting values, measured in part 8.
const THROWN = {
  // How many times a unit throws in a battle: a legionary carried two pila
  // (Polybius 6.23), a peltast a few javelins. One a contact.
  THROWS: 2,
  // A thrown volley against a missile volley of the same weapon and men.
  // Measured (docs/design/army-balance.md, part 8): at 2, Rome's usual army
  // (pila) won 70% of the league and two professional units with pila beat
  // the same SP spent on a third unit, 88 to 84%; at 1, 58% and 78 to 84%;
  // at 1.5, 64% and 85 to 85%: pila worth what they cost.
  CLOSE: 1.5
}

// ── Fire and retreat ───────────────────────────────────
//
// Ruled 2026-11-24 ("I don't like the skirmish rule. Fire and retreat is
// ok"; "No firing on the move"). A missile unit pressing the enemy closes
// to where it can shoot and stands there shooting; when an enemy it can
// outmarch comes on, it falls back a march, and shoots again once it
// stands (battle/skirmish.js). No kit makes a man slower (Marathon:
// hoplites ran), falling back costs what any march costs, and foot do not
// shoot on a tick they moved. Horse archers shoot as they ride, at
// MISSILES.ON_THE_MOVE, as before the rule. Measured in
// docs/design/army-balance.md, part 7.
const SKIRMISH = {
  // How many tiles beyond the enemy's reach (its march and one tile to come
  // to blows) a missile unit falls back at. The skirmish proposal (part 6)
  // had 1; with it, horse archers that closed to shoot at men holding their
  // ground stood one tile inside that margin, fell back, closed again, and
  // a battle in the soak never ended (Parthia's light horse against a
  // Persian sword unit, 150 turns). At 0 a unit falls back only from men
  // who could reach it this tick; measured against 1 on the classic armies
  // (72 battles a cell) every kind moved 3 points or less.
  WARY: 0
}

// ── Pace ───────────────────────────────────────────────
//
// How much of a combat round is fought in one ten-minute tick of a battle.
// The tables are tuned in rounds, and a tick is one round: PER_TICK is 1.
//
// It was tried at 0.4 (2026-11-21) to make battles longer, and ruled back
// the same day: "the design direction was for the ability to go longer,
// not for the whole experience to change". The length comes from rallying,
// split effort and a verdict that waits for units that may yet rally:
// measured over 32 battles in the web app, about 140 minutes of battle
// time at 1, against 50 before those rules. Lowering this slows every fight
// (at 0.8, about 170 minutes; at 0.4, about 200) and is kept as a knob, and
// as `combatPace` on a battle's spec, for a scenario that wants it.

const PACE = {
  PER_TICK: 1
}

// ── Rallying, and taking heart ─────────────────────────
//
// Ruled 2026-11-21, in place of "morale only goes down": "Broken unit can
// rally at a safe distance and if not pursued. Morale only recovers with
// nearby success or a commander's presence."
//
// A broken unit with no formed enemy within SAFE_TILES stops running and
// forms up. Its morale is what it was: shaken, and likely to break again at
// the first blow unless friends succeed near it.
//
// It may rally any number of times. What stops it is how worn it is (ruled
// the same day: "the combat fatigue threshold is the right limiter, but
// have it impact the overall morale formula so that it's not always 30% and
// some veteran units rally because they are more experienced"). A unit's
// condition is the share of its men still standing times its fatigue (the
// one fatigue curve, 1 when fresh down to 0.5 when spent). It can rally
// while its condition is at least CONDITION divided by its morale
// resistance, the same divisor the morale formula uses: the quality tier,
// plus what a veteran unit has earned. So fresh troops need:
//   levy 64% of their men, militia 46%, professionals and tribal warriors
//   30%, elite 22%; and more than that when they are tired.
//
// When an enemy unit breaks or is destroyed, every unit of the other side
// within RANGE of it takes heart: MORALE points, never above the starting
// morale. (A commander's presence waits for commanders on the field.)

const RALLY = {
  SAFE_TILES: 6,
  CONDITION: 0.64
}

const HEART = {
  RANGE: 6,
  MORALE: 8
}

// The end of the day (ruled 2026-11-23: "add a cap to the battle at end of
// day like 40 turns"): a battle mustered from the app is over after this
// many player turns, and (until 2026-11-24) the side that lost the smaller
// share of its men had it. TURNS is no longer read
// (the army study keeps its own forty turns).
// Since the riders rulings (2026-11-23: "No the game keeps going"), each
// Commander is asked only when wanted, so the day is counted in battle time:
// forty turns at the fifteen minutes a turn ran on average before
// (messenger-league.js: 230 battle minutes over 15.1 player turns).
// Twelve hours since 2026-11-24 ("10 hours is fine... might as well make it
// 12 armies did not fight in the dark"); it was 600. And when it runs out
// the battle just ends, with no winner (ruled the same day: "No the day
// just ends the battle, you can choose to fight again the next day"):
// orchestrator/victory.js, 'night fell'.
const DAY = { TURNS: 40, MINUTES: 720 }

// The ground to fight for (each map's own: src/data/maps, `ground`;
// orchestrator/victory.js). A side that holds all of it alone, with no
// enemy standing on it, for HOLD_MINUTES of battle has taken the field and
// wins, as breaking the enemy army does. An hour is the Stage 3 plan's (F3)
// number, kept: in the ground league (harness/ground-league.js; docs/
// DECISIONS.md, "How each map's ground to fight for was built") the ground
// decided 29% of 1,600 battles between equal armies, the side that held it
// first won 57% of them, not all, so an enemy has time to come and take
// it back; and a player who will not come out loses 95 battles in 100.
// CLOSE_MINUTES before that, every side is told the ground is close to
// deciding the battle, and the battle stops for them: half the hour, so
// that the side about to lose it has time to answer.
const GROUND = { HOLD_MINUTES: 60, CLOSE_MINUTES: 30 }

// A unit's veterancy (veterans/veterancy.js; ruled 2026-11-23: the newest
// men fall first). The experience the fallen take with them, as a share of
// the unit's average: at 1 they die evenly; at 0.5 the men who fall have on
// average half the unit's experience. Starting value.
//
// docs/design/army-balance.md, part 4 (taken 2026-11-23): what a unit's veterancy
// does in a battle. A unit carries its average experience, 0 to 30
// (command/company.js, unitsOf), as `veterancy`. At each step it adds
// `fight` to its attack and defence ratings (a professional has 4 of each
// over a levy's 1) and `stand` to its morale resistance (a quality tier's
// morale point is 0.38); and of the men a blow would fell it loses only
// 1 - `survive` (they know how to keep alive), though it is shaken as if
// it had lost them all. The steps fall where an officer's levels do:
// green 4, seasoned 8, veteran 13, legendary 20. A unit with none fights
// as before.
// Measured (src/harness/army-study/veterans.js, a usual army against
// itself, 128 battles a row): legendary veterans win 60% (none: 48%) and
// lose 35% of their men a battle (none: 39%). Harder to break alone gave
// 78% and 35%; a lift to the fight alone, 72% and 35%.
const VETERANCY = {
  FALLEN_SHARE: 0.5,
  STEPS: [
    { from: 4, fight: 0.25, survive: 0.05 },   // green
    { from: 8, fight: 0.5, survive: 0.10 },    // seasoned
    { from: 13, fight: 0.75, survive: 0.15 },  // veteran
    { from: 20, fight: 1, survive: 0.20 }      // legendary
  ],
  // Against the computer, every unit of its army takes the average
  // veterancy of the units the Commander fields in that battle, but never
  // more than this: seasoned, the second step above. Ruled 2026-11-23,
  // "Yes" to "take it, with the computer's army matching your average
  // veterancy up to seasoned so it is never a pushover"
  // (docs/design/army-balance.md, part 4, "The fairness problem").
  MATCH_UP_TO: 8
}

// Training (command/company.js; ruled 2026-11-23: "Good perk for 30 is
// training, each battle fought increase the level of the unit. A 30
// officer over militia can have them eventually at professional level over
// time"). Every so many battles a unit comes through under an officer of
// the greatest experience, it rises one level of quality, up this ladder
// and no further. Tribal warriors rise to professionals; the elite are the
// elite already. Starting values.
const TRAINING = {
  BATTLES_PER_LEVEL: 5,
  LADDER: ['levy', 'militia', 'professional', 'veteran_mercenary']
}

// The Commander on the field (command/commander.js; ruled 2026-11-22: "low
// odds and not possible till a threshold"). The threshold is half because
// units here break at about half strength: with the first, generic armies a
// Commander's unit was struck under a quarter in 4 battles of 160, under
// half in 33.
//
// The odds were set again on 2026-11-23, once a Commander rode with his
// faction's elite unit: elites fight on when cut up, so he was rolled for
// far more often (with 10% a tick and 50% when overrun: taken in 1 battle
// in 12, killed in 1 in 48, for a player who sends everyone in). With the
// numbers below, over 960 battles of every faction against every other: a
// player who sends everyone in is taken in about 1 battle in 19; one who
// plans as the computer does, 1 in 27; killed, about 1 in 300 either way. A
// Commander whose unit stays out of the fight cannot fall.
const COMMANDER = {
  THRESHOLD: 0.5,      // his unit at or under this share of its strength
  DEATH_THRESHOLD: 0.25, // he can be killed only at or under this share (ruled 2026-11-23); above it he is taken
  CHANCE: 0.04,        // each tick it is struck while under the threshold
  OVERRUN: 0.3,        // the tick it is destroyed around him
  KILLED_SHARE: 0.12   // of those who fall, killed; the rest are taken
}

// A Commander in the enemy's hands, and the computer as his captor
// (command/commander.js, opponent/captor.js; ruled 2026-11-23: "Computers
// are worse than humans naturally ... Unpredictable but probably risky to
// bank your future on ... you can also surrender the field in return for
// freedom which some opponents would accept since it saves their manpower
// as well"). Starting values, Claude's: measured in docs/DECISIONS.md ("How
// the held Commander's negotiation ... were built").
//
// The computer accepts an offer on one seeded roll, with the chance
//   BASE + GIFT * (men offered / its own men at the start)
//        + HURT * (share of its own men out of the fight)
// held between FLOOR and CEILING. A roll that misses by less than
// COUNTER_BAND asks for more instead (the captive's strongest unit it has
// seen, on top of what was offered); a wider miss is refused.
const PARLEY = {
  BASE: 0.08,          // the field alone, from a captor who has lost no one
  GIFT: 1.0,           // per share of its own army handed to it
  HURT: 0.35,          // per share of its own men dead, fled or broken
  FLOOR: 0.05,
  CEILING: 0.7,        // never a sure thing
  COUNTER_BAND: 0.25,
  COUNTER_LASTS: 1     // player turns after the one it is made in that a counter stands
}

// An officer's loyalty, while his Commander is held (ruled 2026-11-23:
// "Desertion can be another part of a disloyal officer as his men abandon
// the unit by a % every round after the commander is captured. Loyal
// officers rally men and fight for their captured commander trying to free
// him."). Loyalty itself is not built yet: an officer may carry
// `loyalty`, 0 to 100, and one without it is NEUTRAL. Starting values,
// Claude's.
const LOYALTY = {
  NEUTRAL: 50,         // an officer with no loyalty yet, or no officer at all
  DISLOYAL: 30,        // at or under: his men desert while the Commander is held
  LOYAL: 70,           // at or over: he goes for the men who hold him
  DESERTION: 0.03,     // of the unit's men, each tick (ten minutes) he is held
  RALLY_MORALE: 15,    // a loyal officer's shaken men take this much heart, once

  // How loyalty is earned (ruled 2026-11-23: "Earned through glory or
  // survival. The theme of the game... sacrificing men for glory will cost
  // you with those who value survival and win favor with those who value
  // glory... Win and it's fine, a bloody victory or a boring one cost you
  // in different ways"). Each officer values one of the two. What a battle
  // does to his loyalty, by how it ended and what it was for his own unit:
  //   fought   his unit struck a blow or took one
  //   light    it lost no more than LIGHT of its men; bloody, BLOODY or more
  VALUES: ['glory', 'survival'],
  LIGHT: 0.15,
  BLOODY: 0.35,
  MOVES: {
    glory: {
      victory: { fought: 6, idle: -4 },    // a boring victory costs
      draw: { fought: 2, idle: -3 },
      defeat: { fought: -3, idle: -6 }
    },
    survival: {
      victory: { light: 6, some: 2, bloody: -5 },   // a bloody one costs
      draw: { light: 1, some: -2, bloody: -6 },
      defeat: { light: -3, some: -5, bloody: -8 }
    }
  },
  // What it does. A loyal officer learns faster ("maybe 25% faster"),
  // speaks up more, and holds to his orders when he loses the thread. A
  // disloyal one's men start a battle in worse heart, and he is likelier to
  // lose the thread of an order and go by his nature.
  // His senior officer may yield the field while he is held (ruled
  // 2026-11-23: "Let's make it so some officers can surrender the field as
  // well"): one who looks to his men, once this share of the army's men
  // are dead, fled or broken.
  YIELD_LOSSES: 0.5,
  LEARNS: 1.25,          // battles of experience a loyal officer gains from one
  DISLOYAL_MORALE: -10,  // on his unit's morale as a battle opens
  DISLOYAL_GRASP: 0.6,   // on his chance to keep each clause of an order
  // An officer given to his captor in a deal for his own Commander's
  // freedom (web/battles.js, settle): he has every reason to hate his new
  // Commander. Under DISLOYAL, so it bites from his first battle for him.
  // Claude's number, a guess.
  CAPTURED: 15
}

// Riding with another unit (ruled 2026-11-23: "a commander needed to be
// adjacent to another unit to switch. Always start with elite though").
// Adjacent: within one tile, as the eight tiles round a tile are.
const RIDE = {
  REACH: 1
}

// Orders and news by rider (docs/design/point-of-view-and-messengers.md;
// ruled 2026-11-23: "there is an immediate range around the commander then
// outside that range every turn of movement by a messenger on horseback is
// a delay in the order"; the ranges approved the same day: "Go with the
// proposed pov/messenger ranges"). command/messengers.js reads them.
const COMMAND = {
  IMMEDIATE: 6,        // tiles (150 m) from the Commander: an order arrives at once, and he sees for himself
  RIDER_PACE: 10,      // ground a lone rider covers in ten minutes, in move cost (a formed unit of horse: 5)
  CLEARANCE: 1,        // a rider will not cross a tile within this many of an enemy unit
  // The riders rulings (2026-11-23; docs/DECISIONS.md, "How the riders
  // rulings were built"). Claude's starting values, open to change:
  OVERDUE: 2,          // ten minutes of slack past a rider's ride from where a unit last was, before he notices no word has come ("notice when no word comes back")
  QUIET: 6,            // ten minutes a held Commander, and a side with no Commander on the field, wait before they are asked again (the hour a turn used to run). Not a free Commander whose men hold: since 2026-11-24 ("Holding for several turns would still get interrupts from passing enemy troops") he waits for news, or LONGEST
  LONGEST: 36          // ten minutes the battle runs at most without asking a Commander anything (six hours): a guard so that a battle cannot run away
}

// Officers who act on their Commander's intent when out of contact
// (docs/design/point-of-view-and-messengers.md, "What comes after"; the
// design: a veteran "fills gaps the way you would", and "once a long march
// starts, the officer is the one who reacts to what he finds"). Read by
// command/initiative.js. Claude's starting values, open to change (docs/
// DECISIONS.md, "How officers acting on their Commander's intent were
// built"):
//   FROM        the lowest grade that acts on his own: veteran (13 battles),
//               as the roadmap says ("veterans and above")
//   WAIT        ten minutes a unit must be cut off (no rider can get
//               through to it) before its officer gives up waiting for word
//               and uses his head: COMMAND.OVERDUE's slack, the same wait
//               his Commander gives before he notices no word has come
//   BLED        the share of his men lost at which an officer who looks to
//               his men (values: survival) saves the rest
//   GOOD_GROUND the terrain a cautious officer will stand on rather than
//               fall back: high ground, and woods (cover from missiles)
const INITIATIVE = {
  FROM: 'veteran',
  WAIT: 2,
  BLED: 0.5,
  GOOD_GROUND: ['hill', 'forest']
}

// What a report of the enemy holds, by the officer of the unit that made it
// (ruled 2026-11-23: "additional details as progression happens but never
// incorrect details"; the ladder as recorded in
// docs/design/point-of-view-and-messengers.md, "What comes after"). Read by
// orchestrator/reports.js. Each level tells what the one below tells, and:
//   none       (a unit with no officer) that there is an enemy, and where
//   green      what kind
//   seasoned   roughly how many (a band from ABOUT)
//   veteran    exactly how many
//   legendary  how they are holding up: their heart, their wind, broken or not
// Claude's choices, open to change (docs/DECISIONS.md, "How reports that
// grow with the officer were built"):
//   NO_OFFICERS  a battle with no officers at all (the soak, the hotseat,
//                old scenarios) tells what reports told before: kind and
//                exact numbers, a veteran's report
//   OWN_EYES     what the Commander sees from his own unit is at least a
//                veteran's report (the design says nothing of it: a guess)
//   ABOUT        the bands "roughly how many" is told in: [from, to] men,
//                each band's words in narrator/words.js (REPORT.about). No
//                gaps, no overlaps, so the true number is always in the band
//                told. Set for units of 40 to 100 men (src/data/factions.js),
//                with room for larger ones from scenarios.
const REPORTS = {
  LADDER: ['none', 'green', 'seasoned', 'veteran', 'legendary'],
  TELLS: {
    none: { kind: false, about: false, count: false, state: false },
    green: { kind: true, about: false, count: false, state: false },
    seasoned: { kind: true, about: true, count: false, state: false },
    veteran: { kind: true, about: true, count: true, state: false },
    legendary: { kind: true, about: true, count: true, state: true }
  },
  NO_OFFICERS: 'veteran',
  OWN_EYES: 'veteran',
  ABOUT: [[1, 19], [20, 49], [50, 79], [80, 129], [130, 199], [200, 399], [400, Infinity]]
}

// ── Morale ─────────────────────────────────────────────
//
// [locked decision 5, replaced 2026-11-21] Morale falls in a fight and rises
// only with success nearby (HEART above); a broken unit may rally (RALLY).
//
// Morale is a 0-100 pool on every unit (the harness already carries the field).
// The tier's `morale` stat is not the pool size; it is RESISTANCE, a divisor on
// incoming morale damage. That is what makes the notebook's claim literal:
// veterancy's main edge is that the unit stays.

const MORALE = {
  START: 100,
  ROUT_THRESHOLD: 25,        // [derived] crossing this triggers a rout check
  RESISTANCE_PER_POINT: 0.38, // resistance = 1 + tierMorale * this
  // [derived] morale lost per 1% of the unit's original strength killed
  CASUALTY_COEF: 5.5,
  // [notebook] "the system must guarantee the 1-2 round minimum before any
  // rout check can succeed." No unit may rout before this round.
  ROUT_FLOOR_ROUND: 2,
  // [derived] Exhausted men lose heart. Morale damage scaled by how far the
  // fatigue multiplier has fallen below full, so a fresh unit pays nothing and
  // a spent one pays this much per round.
  //
  // This exists because of a gap the balance matrix exposed. The fatigue
  // multiplier scales attack and defense alike, so in a mirror match it cancels
  // out of the damage ratio entirely: two heavy units could gas out completely
  // and kill each other no faster than when fresh. Heavy-infantry mirrors ran
  // 11-15 rounds against an 8-round cap for exactly that reason, and the
  // notebook's "heavies must win before they gas out" had no mechanism behind
  // it. Routing them through morale gives exhaustion a cost that does not
  // cancel, and keeps locked decision 2 intact — still one universal curve,
  // read by one more consumer.
  EXHAUSTION_COEF: 66
}

// ── Damage ─────────────────────────────────────────────

const DAMAGE = {
  // [derived] The master casualty knob. Casualties are a fraction of the
  // target's CURRENT strength (ruling: fraction, not flat), so an even
  // matchup at ratio 0.5 loses about 12% of its remaining men per round.
  // Tune this first — it sets rounds-to-resolution more than anything else.
  BASE_RATE: 0.24,
  // [notebook] The snowball: a unit that has lost men hits softer, which is
  // what breaks stalemates without the discarded damage-accumulation bucket.
  // Exponent 1.0 would be brutally self-reinforcing; 0.75 leaves room to rally.
  STRENGTH_SNOWBALL_EXPONENT: 0.75
}

// ── Charge ─────────────────────────────────────────────
//
// [notebook] "Cavalry gets a large Attack/Push spike on impact (round 1),
// decaying over subsequent rounds." Horse-vs-melee: big early spike, then below
// parity. Horse-vs-spears: spike suppressed. Horse-vs-archers: nearly unopposed.
//
// Indexed by rounds spent in contact, so index 0 is the round of impact.

const CHARGE = {
  DECAY: [1.80, 1.30, 1.00],   // multiplier on attack and push at impact, +1, +2
  SUSTAINED: 0.75,             // [notebook] cavalry is bad in long melee
  // A braced spear wall does not just blunt the charge, it inverts it.
  BRACED_MULTIPLIER: 0.15      // fraction of the spike that survives spears
}

// ── Situational modifiers ──────────────────────────────
// [salvage] battleEngine SITUATIONAL_ATTACK_MODIFIERS and
// SITUATIONAL_DEFENSE_MODIFIERS, trimmed to what phase 2 can detect today.
// Flanking and rear attacks need the occupancy model from phase 3.

// The legacy values are halved. They were authored for a single-resolution
// engine where a modifier applied once; here it applies every round, and
// because morale only ever falls (locked decision 5) a small persistent edge
// compounds into a near-certain result. At the salvaged values a mirror match
// went from 45/55 on flat ground to 2/98 with one side on a hill — position
// stopped being an advantage and became a verdict.
//
// Halving makes the advantage proportionate. It does NOT make the win rate
// graded, and no value here would: see the note on CHAOS.PREPARED_REDUCTION.
const TERRAIN_MODIFIERS = {
  // Holding the high ground. The hill-assault scenario exists to prove this
  // number is not zero.
  high_ground:        { attack: +0.5, defense: +1 },
  // [salvage] 'crossing_obstacle' -2, halved. The ford-crossing scenario should
  // be punishing, and this is the reason it is.
  crossing_obstacle:  { attack: -1,   defense: -1 },
  forest_cover:       { attack: -0.5, defense: +0.5 },
  marsh:              { attack: -1,   defense: +1 },
  prepared_defense:   { attack: 0,    defense: +1 }
}

// Which phase 1 terrain counts as elevated, and which counts as an obstacle to
// be caught crossing. Explicit, for the same reason TERRAIN_CHAOS is.
const HIGH_GROUND_TERRAIN = ['hill']
const CROSSING_TERRAIN = ['ford', 'river', 'marsh']

module.exports = {
  QUALITY_TIERS,
  QUALITY_ORDER,
  ARMOR,
  SHIELD,
  MOUNT,
  WEAPONS,
  DEFAULT_WEAPON,
  ANTI_CAVALRY_THRESHOLD,
  TERRAIN_CHAOS,
  SITUATION_CHAOS,
  CHAOS,
  STAMINA,
  PUSH,
  FLANKING,
  CROWDING,
  DISENGAGE,
  EXPOSURE,
  SURPRISE,
  PURSUIT,
  MISSILES,
  THROWN,
  SKIRMISH,
  PACE,
  RALLY,
  HEART,
  COMMANDER,
  TRAINING,
  DAY,
  GROUND,
  VETERANCY,
  PARLEY,
  LOYALTY,
  RIDE,
  COMMAND,
  INITIATIVE,
  REPORTS,
  MORALE,
  DAMAGE,
  CHARGE,
  TERRAIN_MODIFIERS,
  HIGH_GROUND_TERRAIN,
  CROSSING_TERRAIN
}

// The enemy catching a rider and reading the order he carries (docs/design/
// point-of-view-and-messengers.md, "What comes after"; command/
// messengers.js, ridersTaken). Claude's starting values, open to change
// (docs/DECISIONS.md, "How the enemy catching a rider was built"). As each
// ten minutes opens, an enemy unit within REACH tiles (the eight-way count)
// of the road a rider rode in the last ten minutes catches him on one roll
// of CHANCE. A rider keeps a tile clear of the enemy he knew of as he set
// out, so foot must have come at least a tile toward his road. Horse reach
// twice as far as foot (a formed unit of horse covers 5 tiles in ten
// minutes, foot 2 to 3) and ride him down more often: a man on foot catches
// a galloping rider only if he rides right by. Set for an event a player
// meets now and then, not every battle (measured: see DECISIONS).
const RIDER_TAKEN = {
  FOOT: { REACH: 1, CHANCE: 0.1 },
  HORSE: { REACH: 2, CHANCE: 0.25 }
}
module.exports.RIDER_TAKEN = RIDER_TAKEN

// ── Each people's perks ────────────────────────────────
//
// docs/design/army-balance.md, part 9: the "Cultural Perks" of the owner's
// doc (docs/Context/final_20_cultures_complete.txt), as far as the game can
// carry them. Which faction has which is src/data/factions.js (`perks`);
// whom in its army a perk is for is `who` here (army/perks.js gives each of
// the faction's own units the keys of its perks at the muster); what each
// does is combat/perks.js. Kept modest: a perk is felt, and does not decide
// a battle. Measured in the usual armies' league (army-study/usual.js); the
// rounds are in part 9.
//
//   who        'all' (the default), 'elite', 'levy_militia', 'militia',
//              'missile', 'horse', 'horse_archers', 'bought' (not the elite)
//   morale     added to morale resistance (a quality tier's morale point is
//              0.38, MORALE.RESISTANCE_PER_POINT)
//   veterancy  the unit fights at this veterancy at the least (VETERANCY:
//              green 4, seasoned 8, veteran 13)
//   breakAt    the morale at or under which it breaks, in place of
//              MORALE.ROUT_THRESHOLD (25); eliteBreakAt the elite's own
//   ground     terrain on which it gains `attack` and `defense` (added to
//              the ratings, as TERRAIN_MODIFIERS are)
//   dugIn      defence, when it held its ground to receive the enemy
//   smaller    attack, when it has fewer men than the enemy it fights
//   flanking   attack, when that enemy is fighting another unit as well
//   armor      the share of the enemy's armour its blows leave him
//   survive    of the men a blow would fell, the share saved
//   braced     the share of a charge's spike that lives through braced
//              spears, in place of CHARGE.BRACED_MULTIPLIER
//   onTheMove  a volley shot on the move, in place of MISSILES.ON_THE_MOVE
//   partner    a missile unit with a friend of this kind within `within`
//              tiles shoots `volley` times as hard
//   woods      terrain it crosses at `cost` (open ground is 1)
//   slowIn     terrain it crosses at `slow` times the map's cost
//   drain      a weight on the wind it spends fighting (STAMINA)
//   disengage  a weight on the parting blow as it leaves a fight
//   surprise   a weight on the shock of its surprise (SURPRISE.MORALE)
//   men        bought units raised at this many times their men (army/perks.js)
//   price      bought units of `quality` cost this share of their price,
//              rounded (army/builder.js)
// A perk with no number is true of the game already (the doc's crossbows,
// rhomphaia and merchant wealth), and is listed so the screen can say so.

const PERKS = {
  // Rome. Doc: "Professional discipline - all troops start with higher
  // morale and coordination". Rome's usual army was already at the top of
  // the league (64%), so the gentlest: at half a tier's morale point (0.19)
  // Rome won 73% (part 9, round 4); at 0.05, 65%; with none, 62%. At 0.02,
  // a little steadier, and inside the band.
  discipline: { morale: 0.02 },
  // Macedon. Doc: "Veterans of war - all Silver Shields start with
  // 10-battle veteran status". Veterancy 10 is seasoned.
  old_soldiers: { who: 'elite', veterancy: 10 },
  // Sparta. Doc: "Fight to the last man - effective until 50% casualties".
  // Read as men who break later: "effective until 50% casualties" taken
  // literally (no break at all until half are down) won Sparta 97% of the
  // league (part 9, round 1).
  last_man: { breakAt: 15 },
  // Sparta. Doc: "Superior perioeci militia - non-citizen troops fight
  // better than normal militia": its levy and militia fight as seasoned men.
  perioeci: { who: 'levy_militia', veterancy: 8 },
  // Carthage. Doc: "Merchant wealth - +2 bonus SP" (32): the budget, army/data.js.
  merchant_wealth: {},
  // Kush. Doc: "Archer-cavalry coordination - bonus effectiveness when
  // within 1 tile of each other": its bowmen and slingers, a quarter more.
  bow_and_horse: { who: 'missile', partner: 'horse', within: 1, volley: 1.25 },
  // Kush. Doc: "Desert mastery - movement bonus + heat resistance in
  // arid/hot environments". There is no desert or heat in the game: the
  // nearest honest thing is wind, men who tire more slowly in a fight.
  sun_hardened: { drain: 0.75 },
  // The Berbers. Doc: "Tribal confederation tactics - small unit
  // effectiveness bonuses": half a point of attack against a bigger unit
  // (high ground gives half a point).
  small_bands: { smaller: 0.5 },
  // Sarmatia. Doc: "Master of feigned retreat": its horse break off a fight
  // as if it were planned, the parting blow at half its weight.
  feigned_retreat: { who: 'horse', disengage: 0.5 },
  // Han (doc: "Han farming techniques - 1 block = 20% larger units") and
  // Mongolia (doc: "all other units 20% larger").
  larger_units: { who: 'bought', men: 1.2 },
  // Han. Doc: "Advanced technology - can deploy crossbows": crossbows are
  // Han's alone in the builder already.
  crossbows: {},
  // Maurya. Doc: "Wootz steel mastery - ignores 10% of enemy armor".
  wootz: { armor: 0.9 },
  // Silla. Doc: "Mountain warfare mastery - defensive and attack bonuses in
  // hills and mountains": on a hill, half a point of each, on top of the
  // high ground.
  mountain_warfare: { ground: ['hill'], attack: 0.5, defense: 0.5 },
  // Persia. Doc: "Superior support staff - bonus effectiveness for ...
  // medical": of the men a blow would fell, one in twenty lives (a green
  // veteran's `survive`).
  surgeons: { survive: 0.05 },
  // Parthia. Doc: "Heavy cavalry plains mastery - greater chance to break
  // defensive lines, attack bonus on plains": half a point on open ground,
  // and half the charge's spike lives through a braced spear wall
  // (CHARGE.BRACED_MULTIPLIER, 0.15 for other horse).
  plains_horse: { who: 'horse', ground: ['plains'], attack: 0.5, braced: 0.5 },
  // Parthia (doc: "Parthian shot perfection - horse archers can fire while
  // retreating at full effectiveness") and Mongolia (doc: "Horse archery
  // perfection - full accuracy while moving at maximum speed").
  parthian_shot: { who: 'horse_archers', onTheMove: 1 },
  // Germania (doc: "Forest warfare mastery - higher mobility through woods")
  // and the Celts (doc: "Woodland mobility - no movement penalties in rough
  // and wooded terrain"): woods at the cost of open ground.
  woodland: { woods: ['forest'], cost: 1 },
  // Thrace. Doc: "Mountain/hill defensive mastery - reduced damage in
  // elevated or fortified positions": on a hill, a point of defence.
  hill_defence: { ground: ['hill'], defense: 1 },
  // Thrace. Doc: "Rhomphaia equipment unlock": the rhomphaia is Thracian
  // alone in the builder already, for any of its troops.
  rhomphaia: {},
  // Samnium. Doc: "Mountainous and wooded guerrilla warfare - attack and
  // stealth bonuses in hills, mountains, and forests".
  guerrilla: { ground: ['hill', 'forest'], attack: 0.5 },
  // Samnium. Doc: "Samnite bravery - all units break at 30%, Sacred Spring
  // Warriors break at 40% (vs normal 15%)": men who break later, the
  // Sacred Spring Warriors later still. At 20 and 15 Samnium won 60%; at
  // 22 and 20, 55% (part 9, rounds 4 and 5).
  samnite_bravery: { breakAt: 22, eliteBreakAt: 20 },
  // Tibet. Doc: "Militia martial culture - militia units fight as veterans
  // with defensive bonuses": its militia fight as seasoned men.
  militia_veterans: { who: 'militia', veterancy: 8 },
  // Tibet. Doc: "All mercenaries cost 25% less": veteran mercenaries 9 -> 7.
  cheap_mercenaries: { quality: 'veteran_mercenary', price: 0.75 },
  // The Celts. Doc: "Berserker fury - ambushes and raids produce fear
  // effects": their surprise shakes half as much again.
  berserker: { surprise: 1.5 },
  // Bactria. Doc: "Noble cavalry - cavalry gets bonus attack ... when
  // attacking enemy flanks": half a point on an enemy fighting another.
  noble_cavalry: { who: 'horse', flanking: 0.5 },
  // Yayoi. Doc: "Archer-spear mastery - bonuses when deploying mixed
  // archery and spear formations": as Kush's archers with horse.
  bow_and_spear: { who: 'missile', partner: 'spear', within: 1, volley: 1.25 },
  // Yayoi. Doc: "Rapid fortification - build defensive positions faster,
  // gain combat bonuses when fighting behind fortifications". No
  // fortifications in the game: men who stood their ground to receive the
  // enemy (prepared, TERRAIN_MODIFIERS.prepared_defense) dig in, half a
  // point more defence.
  rapid_fortification: { dugIn: 0.5 },
  // The Berbers' restriction. Doc: "Forest/swamp mobility penalties -
  // reduced movement in dense terrain": woods and marsh half as dear again.
  dense_ground: { slowIn: ['forest', 'marsh'], slow: 1.5 }
}

module.exports.PERKS = PERKS

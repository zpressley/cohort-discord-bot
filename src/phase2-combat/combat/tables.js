// src/phase2-combat/combat/tables.js
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
    morale: 0,               // [salvage]
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
    morale: 1,
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
    restrictions: ['heavy_armor']
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

const ARMOR = {
  no_armor:     { defense: 0, damageClass: 'light',  staminaDrain: 0,   push: 0 },
  light_armor:  { defense: 3, damageClass: 'light',  staminaDrain: 1,   push: 0 },
  medium_armor: { defense: 6, damageClass: 'medium', staminaDrain: 3,   push: 1 },
  heavy_armor:  { defense: 9, damageClass: 'heavy',  staminaDrain: 6,   push: 2 }
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
  sling:                   { damage: 8,  effectiveness: { light: 85, medium: 45, heavy: 25, cavalry: 90 }, range: 300 },
  self_bow_basic:          { damage: 6,  effectiveness: { light: 70, medium: 35, heavy: 15, cavalry: 65 }, range: 125 },
  throwing_spear:          { damage: 6,  effectiveness: { light: 75, medium: 45, heavy: 25, cavalry: 70 }, range: 25 },
  roman_plumbatae:         { damage: 5,  effectiveness: { light: 65, medium: 40, heavy: 20, cavalry: 45 }, range: 15 },
  germanic_throwing_axe:   { damage: 6,  effectiveness: { light: 70, medium: 50, heavy: 30, cavalry: 40 }, range: 20 },
  self_bow_professional:   { damage: 8,  effectiveness: { light: 75, medium: 45, heavy: 20, cavalry: 60 }, range: 225 },
  javelin_heavy:           { damage: 9,  effectiveness: { light: 85, medium: 65, heavy: 40, cavalry: 75 }, range: 35 },
  sling_professional:      { damage: 10, effectiveness: { light: 85, medium: 45, heavy: 25, cavalry: 90 }, range: 350 },
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
// The clearest case is forest. Cover is supposed to favour a defender, and
// TERRAIN_MODIFIERS.forest_cover says so (+defense, -attack). But forest also
// carries 2 chaos, and measured against a mirror the defender wins 0% standing
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
// defender is caught in, capped. Direction (flank vs rear) needs facing,
// which no unit has yet — that refinement is phase 8's formations work.
//
// Only active when one unit appears in several engagements at once, which
// can never happen in a duel — the balance matrix and its assertions are
// untouched by this table.

const FLANKING = {
  ATTACK_PER_EXTRA_ENGAGEMENT: 1,
  CAP: 2
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

// ── Morale ─────────────────────────────────────────────
//
// [locked decision 5] Monotonic down. No recovery inside an engagement —
// reinforcements and visible victory elsewhere are a phase 8 feature.
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
  // defender's CURRENT strength (ruling: fraction, not flat), so an even
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
  PURSUIT,
  MORALE,
  DAMAGE,
  CHARGE,
  TERRAIN_MODIFIERS,
  HIGH_GROUND_TERRAIN,
  CROSSING_TERRAIN
}

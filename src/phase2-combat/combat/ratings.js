// src/phase2-combat/combat/ratings.js
//
// Step 1 of the build order: turn a harness unit into attack, defense and push
// ratings. Every function here is pure and none of them touch randomness — the
// chaos scalar arrives as a number in the context, already rolled elsewhere.
// That separation is what makes these testable with fixed inputs.
//
// The five stats of the notebook model split across two files: attack, defense
// and push are computed here; stamina and morale are pools that live across
// rounds and are handled in resolve.js. This file only reads them.

const T = require('./tables')

// ── Lookups ────────────────────────────────────────────
//
// The harness deliberately carries flat scalars (`quality: 'professional'`)
// rather than the nested objects a saved army uses. Unknown keys fall back to
// something sane rather than throwing, because a scenario written before a
// table existed should still run.

function resolveQuality(unit) {
  return T.QUALITY_TIERS[unit.quality] ?? T.QUALITY_TIERS.militia
}

function resolveWeapon(unit) {
  // The harness's createUnit defaults primaryWeapon to null; scenarios written
  // before weapons existed rely on that.
  const key = unit.primaryWeapon ?? T.DEFAULT_WEAPON
  return T.WEAPONS[key] ?? T.WEAPONS[T.DEFAULT_WEAPON]
}

function resolveArmor(unit) {
  return T.ARMOR[unit.armor] ?? T.ARMOR.no_armor
}

function resolveShield(unit) {
  return T.SHIELD[unit.shield] ?? T.SHIELD.no_shield
}

// ── Stamina ────────────────────────────────────────────
// [locked decision 2] Pool from training tier, drain from kit weight, and one
// universal curve shared by everyone.

// Tank size. Better trained troops carry more.
function staminaPool(unit) {
  return resolveQuality(unit).staminaPool
}

// How fast the tank empties, per round of fighting. This is the ONLY place kit
// weight expresses itself in time, and it is what gives heavy units their
// countdown clock: they protect and hit harder, but they must win early.
function staminaDrainPerRound(unit) {
  let drain = T.STAMINA.BASE_DRAIN
  drain += resolveArmor(unit).staminaDrain
  drain += resolveShield(unit).staminaDrain
  if (unit.mounted) drain += T.MOUNT.staminaDrain
  return drain
}

// The one universal fatigue curve. Full effectiveness while the tank is above
// FULL_ABOVE, then a straight decline to FLOOR_MULTIPLIER at empty.
//
// The notebook described two curve shapes — heavy kit plateaus then falls off a
// cliff, light kit declines gently. Both come out of THIS curve; the difference
// is purely that a heavy unit crosses it faster. That is decision 2's whole
// argument for not writing per-kit curves.
function fatigueMultiplier(staminaPct) {
  const pct = clamp(staminaPct, 0, 1)
  if (pct >= T.STAMINA.FULL_ABOVE) return 1
  const floor = T.STAMINA.FLOOR_MULTIPLIER
  return floor + (1 - floor) * (pct / T.STAMINA.FULL_ABOVE)
}

// ── Morale ─────────────────────────────────────────────

// The tier's morale stat is not a pool size — it is a divisor on incoming
// morale damage. This is the literal implementation of the notebook's claim
// that a veteran unit's main edge is that it stays.
function moraleResistance(unit) {
  return 1 + resolveQuality(unit).morale * T.MORALE.RESISTANCE_PER_POINT
}

// ── Rock-paper-scissors ────────────────────────────────

// Which column of an attacker's `effectiveness` table this unit is looked up
// in. A mounted unit is 'cavalry' whatever it is wearing — that is precisely
// what makes spears beat horses rather than beating horse armour.
function armorClass(unit) {
  if (unit.mounted) return 'cavalry'
  return resolveArmor(unit).damageClass
}

// [Q4] `effectiveness` is a damage multiplier, divided by 100. The tables were
// authored as percentages, so using them raw would inflate damage 100x.
function effectivenessAgainst(attacker, defender) {
  const weapon = resolveWeapon(attacker)
  const cls = armorClass(defender)
  return (weapon.effectiveness[cls] ?? 50) / 100
}

// [notebook] "Spears good vs horses. Cavalry charge bonus suppressed against
// braced spears." A weapon braces when its anti-cavalry effectiveness is at or
// above the threshold, which picks out the spear/sarissa/framea family exactly.
function isAntiCavalry(unit) {
  return resolveWeapon(unit).effectiveness.cavalry >= T.ANTI_CAVALRY_THRESHOLD
}

// Ranged weapons carry a range in metres. [notebook] Archers cannot use ranged
// attacks while under melee attack, so in phase 2 a bow contributes only its
// (poor) melee damage. Kept as a predicate for phase 8's ranged work.
function isRanged(unit) {
  return typeof resolveWeapon(unit).range === 'number'
}

// ── Time: the charge and its decay ─────────────────────
//
// [notebook] This is the mechanic that produces battle arcs. Cavalry gets a
// large spike on impact that decays over the following rounds and then settles
// BELOW parity, because a horse stuck in a melee is in the wrong place.
//
// @param {number} roundsInContact  0 on the round of impact
// @param {boolean} defenderBraced  defender carries an anti-cavalry weapon
function chargeMultiplier(unit, roundsInContact, defenderBraced) {
  if (!unit.mounted) return 1

  if (roundsInContact >= T.CHARGE.DECAY.length) return T.CHARGE.SUSTAINED

  const spike = T.CHARGE.DECAY[roundsInContact]
  if (!defenderBraced) return spike

  // Braced spears do not merely blunt the charge; only a fraction of the spike
  // above parity survives contact with the points.
  return 1 + (spike - 1) * T.CHARGE.BRACED_MULTIPLIER
}

// ── Terrain ────────────────────────────────────────────
//
// [salvage] Situational modifiers, trimmed to what phase 2 can actually detect.
// Flanking and rear attacks need phase 3's occupancy model and are absent on
// purpose rather than guessed at.
//
// `enemyTerrain` matters because high ground is relative: standing on a hill is
// only an advantage if the other unit is not also on one.
function terrainModifier(terrain, enemyTerrain, prepared = false) {
  let attack = 0
  let defense = 0

  const onHigh = T.HIGH_GROUND_TERRAIN.includes(terrain)
  const enemyOnHigh = T.HIGH_GROUND_TERRAIN.includes(enemyTerrain)

  if (onHigh && !enemyOnHigh) {
    attack += T.TERRAIN_MODIFIERS.high_ground.attack
    defense += T.TERRAIN_MODIFIERS.high_ground.defense
  }

  // Caught mid-crossing. The ford-crossing scenario exists to prove this hurts.
  if (T.CROSSING_TERRAIN.includes(terrain)) {
    attack += T.TERRAIN_MODIFIERS.crossing_obstacle.attack
    defense += T.TERRAIN_MODIFIERS.crossing_obstacle.defense
  }

  if (terrain === 'forest') {
    attack += T.TERRAIN_MODIFIERS.forest_cover.attack
    defense += T.TERRAIN_MODIFIERS.forest_cover.defense
  }

  if (prepared) {
    attack += T.TERRAIN_MODIFIERS.prepared_defense.attack
    defense += T.TERRAIN_MODIFIERS.prepared_defense.defense
  }

  return { attack, defense }
}

// ── The snowball ───────────────────────────────────────
//
// [notebook] A unit that has lost men hits softer. This is what replaces the
// discarded damage-accumulation bucket as the anti-stalemate mechanism: output
// falls as strength falls, so once an asymmetry opens it widens.
//
// The exponent softens it. At 1.0 the first bad round decides the fight; at
// 0.75 a battered unit can still make the winner pay.
function strengthScale(unit) {
  const max = unit.maxStrength || unit.strength || 1
  const fraction = clamp(unit.strength / max, 0, 1)
  return Math.pow(fraction, T.DAMAGE.STRENGTH_SNOWBALL_EXPONENT)
}

// Chaos degrades everything on the disordered side. [locked decision 4] chaos
// is a 0-10 scalar and the single channel every random input flows through.
function chaosMultiplier(chaos) {
  const c = clamp(chaos, 0, T.CHAOS.MAX)
  return 1 - c * T.CHAOS.EFFECT_PER_POINT
}

// ── Ratings ────────────────────────────────────────────
//
// Context for all three:
//   stamina          current stamina points (not a percentage)
//   roundsInContact  0 on the round of impact
//   terrain          phase 1 terrain key under this unit
//   enemyTerrain     terrain under the opposing unit
//   chaos            0-10, already rolled
//   enemyBraced      the enemy carries an anti-cavalry weapon
//   prepared         this unit set and braced for the attack

function baseAttackRating(unit) {
  return resolveQuality(unit).attack + resolveWeapon(unit).damage
}

function baseDefenseRating(unit) {
  const quality = resolveQuality(unit)
  let defense = quality.defense + resolveArmor(unit).defense + resolveShield(unit).defense
  if (unit.mounted) defense += T.MOUNT.defense
  return defense
}

function basePushRating(unit) {
  const quality = resolveQuality(unit)
  let push = quality.push + resolveArmor(unit).push + resolveShield(unit).push
  if (unit.mounted) push += T.MOUNT.push
  return push
}

function attackRating(unit, ctx = {}) {
  const {
    stamina = staminaPool(unit),
    roundsInContact = 0,
    terrain = 'plains',
    enemyTerrain = 'plains',
    chaos = 0,
    enemyBraced = false,
    prepared = false
  } = ctx

  const terrainMod = terrainModifier(terrain, enemyTerrain, prepared).attack
  const base = Math.max(0, baseAttackRating(unit) + terrainMod)

  return base
    * fatigueMultiplier(stamina / staminaPool(unit))
    * chargeMultiplier(unit, roundsInContact, enemyBraced)
    * chaosMultiplier(chaos)
    * strengthScale(unit)
}

function defenseRating(unit, ctx = {}) {
  const {
    stamina = staminaPool(unit),
    terrain = 'plains',
    enemyTerrain = 'plains',
    chaos = 0,
    prepared = false
  } = ctx

  const terrainMod = terrainModifier(terrain, enemyTerrain, prepared).defense
  const base = Math.max(0, baseDefenseRating(unit) + terrainMod)

  // Defense does not scale with the strength snowball. A thinner line is
  // easier to kill because there are fewer men in it, which the casualty
  // fraction already expresses — scaling defense too would double-count it.
  return base
    * fatigueMultiplier(stamina / staminaPool(unit))
    * chaosMultiplier(chaos)
}

function pushRating(unit, ctx = {}) {
  const {
    stamina = staminaPool(unit),
    roundsInContact = 0,
    chaos = 0,
    enemyBraced = false
  } = ctx

  return basePushRating(unit)
    * fatigueMultiplier(stamina / staminaPool(unit))
    * chargeMultiplier(unit, roundsInContact, enemyBraced)
    * chaosMultiplier(chaos)
    * strengthScale(unit)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

module.exports = {
  resolveQuality,
  resolveWeapon,
  resolveArmor,
  resolveShield,
  staminaPool,
  staminaDrainPerRound,
  fatigueMultiplier,
  moraleResistance,
  armorClass,
  effectivenessAgainst,
  isAntiCavalry,
  isRanged,
  chargeMultiplier,
  terrainModifier,
  strengthScale,
  chaosMultiplier,
  baseAttackRating,
  baseDefenseRating,
  basePushRating,
  attackRating,
  defenseRating,
  pushRating,
  clamp
}

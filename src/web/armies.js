// src/web/armies.js
//
// Buying a Commander's standard army, for the army screen and the server
// that keeps it. The rules are the builder's (engine/army/builder.js), as
// the Discord builder's were (archive/src/bot/armyInteractionHandler.js):
// a unit is a quality, horse or foot, a weapon, armour and a shield; its
// culture decides what it may field; the army is priced against the
// culture's budget; the elite comes free and is not for sale. This module
// adds only what a screen needs: each choice priced, each refusal given in
// the builder's own reason (in plain words), and each unit a name.
//
// Names. A unit is called for its kit ("spears", "horse archers"), or by a
// name its faction's own army gives the same weapon ("legionaries" for
// Roman swordsmen). A second of a name is numbered ("spears 2"), and the
// number is the unit's own while it is kept. The server takes only names
// the game would give that kit, so every name is one the order reader
// knows and none says "everyone" or "the enemy".
//
// Nothing here is trusted from the browser: every list is checked again.

const { buildUnit, buildArmy, PURCHASABLE } = require('../engine/army/builder')
const D = require('../engine/army/data')
const { tables: T } = require('../engine/combat')
const { FACTIONS } = require('../data/factions')
const { checkStandard, usualArmy, kitOf, baseOf } = require('../engine/army/standard')
const { KIT } = require('../narrator/words')

const cultureOf = (key) => FACTIONS[key]?.culture
const budgetOf = (key) => D.SP_BUDGETS[cultureOf(key)] ?? D.DEFAULT_SP_BUDGET
const shoots = (weapon) => ['primary_ranged', 'stackable_ranged'].includes(D.WEAPONS[weapon]?.stacking)
const mountCost = (key) => (D.HORSE_CULTURES.includes(cultureOf(key)) ? D.MOUNT_SP_DISCOUNTED : D.MOUNT_SP)

/** What a unit with this kit is called, before any number. */
function unitNoun(kit) {
  const noun = KIT.unit[kit.weapon] ?? 'troops'
  if (!kit.mounted) return noun
  if (shoots(kit.weapon)) return `horse ${noun}`
  return kit.weapon === 'persian_kontos' ? 'lancers' : 'riders'
}

// The names a unit with this kit may bear, first choice first: its
// faction's own name for the weapon, then the kit's.
function namesFor(key, kit) {
  const elite = FACTIONS[key]?.elite?.name
  const own = (FACTIONS[key]?.army ?? []).filter(u => u.weapon === kit.weapon && Boolean(u.mounted) === Boolean(kit.mounted)).map(u => u.name)
  return [...new Set([...own, unitNoun(kit)])].filter(n => n !== elite)
}

const taken = (base, names) => names.some(n => n === base || baseOf(n) === base)

/** The name a new unit is given: the first free one for its kit, else the first numbered. */
function nextName(key, kit, names) {
  const bases = namesFor(key, kit)
  const free = bases.find(b => !taken(b, names))
  if (free) return free
  let n = 2
  while (names.includes(`${bases[0]} ${n}`)) n++
  return `${bases[0]} ${n}`
}

function nameFits(key, kit, name) {
  return namesFor(key, kit).some(b => name === b || (name.startsWith(`${b} `) && /^[1-9][0-9]?$/.test(name.slice(b.length + 1))))
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** A unit's kit in words: "militia, spear, light armour, medium shield, on foot". */
function kitWords(kit) {
  const k = kitOf(kit)
  const weapon = (w) => KIT.weapon[w] ?? w
  return [KIT.quality[kit.quality] ?? kit.quality, weapon(k.weapon) + (kit.sidearm ? ` and ${weapon(kit.sidearm)}` : ''), KIT.armor[k.armor] ?? k.armor,
    KIT.shield[k.shield] ?? k.shield, KIT.mounted[String(k.mounted)]].join(', ')
}

// The builder's reason in plain words: its keys as the screen names them,
// "SP" as supply points, a unit by its name rather than its place.
const KEYS = [...Object.entries(KIT.weapon), ...Object.entries(KIT.armor), ...Object.entries(KIT.shield)]
  .sort((a, b) => b[0].length - a[0].length)
function plain(reason, names = []) {
  let s = String(reason).replace(/^unit (\d+): /, (_, n) => (names[n - 1] ? `${cap(names[n - 1])}: ` : ''))
  s = s.replace(/army costs (\d+) SP against a budget of (\d+)/, (_, cost, budget) => `the army would cost ${cost} ${KIT.points} against a budget of ${budget}`)
  s = s.replace(/demands (\w+) training/, (_, q) => `demands ${(T.QUALITY_TIERS[q]?.name ?? q).toLowerCase()} training`)
  s = s.replace(/"(\w+)" is not a purchasable troop quality/, (_, q) => `${KIT.quality[q] ?? q} troops cannot be bought`)
  for (const [key, word] of KEYS) s = s.replace(new RegExp(`\\b${key}\\b`, 'g'), `the ${word}`)
  s = s.replace(/\barmor\b/g, 'armour')
  return cap(s)
}

// A list from the browser: names and kit, nothing else.
// A unit its Commander has named (`named`, and what it was called before,
// `formerly`) keeps its name whatever its kit: the server takes the flag
// only from the army it keeps (battles.js, setArmy), never from the browser.
const clean = (units) => (Array.isArray(units) ? units.slice(0, 40) : []).map(u => ({
  name: typeof u?.name === 'string' ? u.name.slice(0, 40) : '', ...kitOf(u),
  ...(u?.named === true ? { named: true } : {}),
  ...(Array.isArray(u?.formerly) ? { formerly: u.formerly.slice(0, 10).map(n => String(n).slice(0, 40)) } : {})
}))

/**
 * Check an army a player sends, as the server keeps it.
 *
 * @returns {{ ok, errors, units, usedSP, budget }} errors in plain words
 */
function checkArmy(key, units) {
  const list = clean(units)
  const names = list.map(u => u.name)
  const checked = checkStandard(key, list)
  const errors = checked.errors.map(e => plain(e, names))
  list.forEach((u, i) => {
    if (u.name && !u.named && !checked.errors.some(e => e.startsWith(`unit ${i + 1}: `) && /name|called/.test(e)) && !nameFits(key, u, u.name)) {
      errors.push(`${cap(u.name)}: that is not a name for ${unitNoun(u)}`)
    }
  })
  return { ok: errors.length === 0, errors, units: list, usedSP: checked.army?.usedSP ?? null, budget: budgetOf(key) }
}

/**
 * The army screen's view of an army being built: each unit priced, the
 * budget spent and left, and for the unit being bought or changed (the
 * draft) every choice of every step, priced, with the builder's reason for
 * any it refuses. A choice is judged as the draft would be with it: so a
 * refusal names what stands in the way ("the sarissa takes both hands: no
 * shield"), and the army's budget is part of every choice.
 *
 * @param {string} key   the faction
 * @param {Object} body  { units, draft, at, reserved } `at`: the place in
 *                       `units` of the unit the draft changes; none for a
 *                       new one. `reserved`: names his other units bear
 */
function appraise(key, { units = [], draft = null, at = null, reserved = [] } = {}) {
  const faction = FACTIONS[key]
  if (!faction) return null
  const culture = faction.culture
  const budget = budgetOf(key)
  const list = clean(units)
  const place = Number.isInteger(at) && at >= 0 && at < list.length ? at : null
  const others = list.filter((_, i) => i !== place)
  const priced = list.map(u => {
    const r = buildUnit(u, culture)
    return { ...u, cost: r.ok ? r.cost : null, men: r.unit?.size ?? null, words: kitWords(u), errors: r.errors.map(e => plain(e)) }
  })
  const spentBy = (rows) => rows.reduce((n, u) => n + (buildUnit(u, culture).cost || 0), 0)
  const elite = faction.elite
  const out = {
    faction: key, title: faction.title, budget,
    spent: spentBy(list),
    elite: { name: elite.name, words: kitWords({ ...elite, quality: 'elite' }) },
    units: priced,
    errors: checkArmy(key, list).errors,
    // The least a unit can cost here: is there room for another?
    cheapest: Math.min(...PURCHASABLE.flatMap(q => Object.keys(D.WEAPONS).map(w => buildUnit({ quality: q, weapon: w }, culture)))
      .filter(r => r.ok).map(r => r.cost))
  }
  out.left = out.budget - out.spent
  if (!draft) return out

  const kit = kitOf(draft)
  // The names of the units he has that are not bought (taken from the
  // enemy; his elite, if he named it) are not free either.
  const otherNames = [...others.map(u => u.name), ...(Array.isArray(reserved) ? reserved.slice(0, 40).map(String) : [])]
  // A unit he named keeps its name whatever its kit.
  const name = typeof draft.name === 'string' && (draft.named === true || nameFits(key, kit, draft.name)) && !otherNames.includes(draft.name)
    ? draft.name : nextName(key, kit, otherNames)
  // Why the unit, or the army with it, is not allowed: the builder's first
  // reason, the unit's own before the budget's.
  const overBy = (candidate) => buildArmy({ culture, units: [...others, candidate] }).errors.find(e => /budget/.test(e)) ?? null
  const judge = (candidate) => {
    const unit = buildUnit(candidate, culture)
    if (!unit.ok) return plain(unit.errors[0])
    const over = overBy(candidate)
    return over ? plain(over) : null
  }
  // A choice is refused for what it would add: a reason the unit has not
  // already, or the budget overspent where it was not. (What already
  // stands in the way is the draft's own reason, shown with it.)
  const already = new Set(buildUnit(kit, culture).errors)
  const wasOver = overBy(kit)
  const refusal = (candidate) => {
    const fresh = buildUnit(candidate, culture).errors.find(e => !already.has(e))
    if (fresh) return plain(fresh)
    const over = overBy(candidate)
    return over && !wasOver && buildUnit(candidate, culture).ok ? plain(over) : null
  }
  const option = (field, value, cost, words) => ({ value, cost, words, refused: refusal({ ...kit, [field]: value }) })
  const legal = Object.entries(D.WEAPONS).filter(([, w]) => w.cultures === 'all' || w.cultures.includes(culture))
  const unit = buildUnit(kit, culture)
  out.draft = {
    ...kit,
    name,
    cost: unit.ok ? unit.cost : null,
    men: unit.unit?.size ?? null,
    words: kitWords(kit),
    refused: judge(kit),
    spentWith: spentBy(others) + (unit.ok ? unit.cost : 0),
    options: {
      quality: PURCHASABLE.map(q => option('quality', q, T.QUALITY_TIERS[q].cost, KIT.quality[q])),
      mounted: [option('mounted', false, 0, KIT.mounted.false), option('mounted', true, mountCost(key), KIT.mounted.true)],
      weapon: legal.map(([w, data]) => ({ ...option('weapon', w, data.sp, KIT.weapon[w] ?? w), shoots: shoots(w) })),
      armor: Object.keys(D.ARMOR_SP).map(a => option('armor', a, D.ARMOR_SP[a], KIT.armor[a])),
      shield: Object.keys(D.SHIELD_SP).map(s => option('shield', s, D.SHIELD_SP[s], KIT.shield[s]))
    }
  }
  return out
}

module.exports = { appraise, checkArmy, unitNoun, namesFor, nextName, nameFits, kitWords, plain, usualArmy, budgetOf, taken }

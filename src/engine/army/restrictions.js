// src/engine/army/restrictions.js
//
// Each people's restrictions on the army it buys (docs/design/army-balance.md,
// part 9; the owner's doc, docs/Context/final_20_cultures_complete.txt,
// "Cultural Restrictions"): only those the builder can check simply, from
// the units in the list. Which faction has which is src/data/factions.js
// (`restrictions`).
//
// They are checked when an army is bought (web/armies.js, checkArmy), not
// when one is mustered: a Commander's army bought before keeps its units.
// The elite counts in a share of the army ("half the army"), as one unit.
//
// A rule is one of
//   noQuality   { qualities }    none of these troops (Macedon: no levy or militia)
//   noArmor     { armors }       no one in this armour (Kush, Yayoi: no heavy armour)
//   lightKit    {}               nothing above light armour and light shields (Thrace)
//   noFoot      {}               every unit on a horse (Sarmatia, Mongolia)
//   noTrainedShooters {}         no bowmen or slingers of professional training or better (the Celts)
//   mostOfQuality { qualities, most }  at most so many units of these troops (Carthage)
//   mostHorse   { most }         at most so many units of horse (Yayoi)
//   heavyFoot   { atLeast | atMost }  the share of the army that is heavy
//                                foot: on foot, a hand weapon, in medium or
//                                heavy armour (Rome, Bactria)
//   horse       { atLeast }      the share of the army on horses (Parthia)
//   levySp      { atLeast }      supply points spent on levy (Parthia)
//   kinds       { atLeast }      of foot, bowmen and slingers, and horse, so
//                                many kinds (Maurya)
// `kind` says when a rule is judged on a screen: 'unit' and 'cap' refuse a
// choice that would break them; 'whole' is the army as a whole, said of it.
//
// Pure.

const { buildUnit } = require('./builder')
const T = require('../combat/tables')
const { FACTIONS } = require('../../data/factions')

const shoots = (u) => (T.WEAPONS[u.weapon]?.range ?? 0) >= T.MISSILES.MIN_RANGE_M
const heavyFoot = (u) => !u.mounted && !shoots(u) && (u.armor === 'medium_armor' || u.armor === 'heavy_armor')
const TRAINED = ['professional', 'veteran_mercenary', 'elite']
const LIGHT_ARMOR = ['no_armor', 'light_armor']
const LIGHT_SHIELD = ['no_shield', 'light_shield']
const share = (n, of) => `${n} of ${of}`
const qualityWord = (q) => (T.QUALITY_TIERS[q]?.name ?? q).toLowerCase()
const list = (words) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`)

const RULES = {
  noQuality: {
    kind: 'unit',
    check: (r, units, title) => units.filter(u => r.qualities.includes(u.quality))
      .map(u => `${title} does not field ${qualityWord(u.quality)} troops`)
  },
  noArmor: {
    kind: 'unit',
    check: (r, units, title) => units.filter(u => r.armors.includes(u.armor))
      .map(u => `${title} does not field men in ${u.armor.replace('_armor', '')} armour`)
  },
  lightKit: {
    kind: 'unit',
    check: (r, units, title) => units.filter(u => !LIGHT_ARMOR.includes(u.armor) || !LIGHT_SHIELD.includes(u.shield))
      .map(() => `${title} has no armour or shields above light`)
  },
  noFoot: {
    kind: 'unit',
    check: (r, units, title) => units.filter(u => !u.mounted).map(() => `${title} fights on horseback: no foot`)
  },
  noTrainedShooters: {
    kind: 'unit',
    check: (r, units, title) => units.filter(u => shoots(u) && TRAINED.includes(u.quality))
      .map(u => `${title} has no ${qualityWord(u.quality)} bowmen or slingers`)
  },
  mostOfQuality: {
    kind: 'cap',
    check: (r, units, title) => {
      const n = units.filter(u => r.qualities.includes(u.quality)).length
      return n > r.most ? [`${title} fields at most ${r.most} units of ${list(r.qualities.map(qualityWord))} troops`] : []
    }
  },
  mostHorse: {
    kind: 'cap',
    check: (r, units, title) => {
      const n = units.filter(u => u.mounted).length
      return n > r.most ? [`${title} fields at most ${r.most} unit${r.most === 1 ? '' : 's'} of horse`] : []
    }
  },
  heavyFoot: {
    kind: 'whole',
    check: (r, units, title, elite) => {
      const all = [...units, elite]
      const n = all.filter(heavyFoot).length
      if (r.atLeast != null && n < r.atLeast * all.length) {
        return [`${title} fights with heavy foot: at least ${pct(r.atLeast)} of the army must be foot with hand weapons in medium or heavy armour (it has ${share(n, all.length)}, the elite counted)`]
      }
      if (r.atMost != null && n > r.atMost * all.length) {
        return [`${title} fields a mixed army: no more than ${pct(r.atMost)} of it may be foot with hand weapons in medium or heavy armour (it has ${share(n, all.length)}, the elite counted)`]
      }
      return []
    }
  },
  horse: {
    kind: 'whole',
    check: (r, units, title, elite) => {
      const all = [...units, elite]
      const n = all.filter(u => u.mounted).length
      return n < r.atLeast * all.length
        ? [`${title} fights on horseback: at least ${pct(r.atLeast)} of the army must be horse (it has ${share(n, all.length)}, the elite counted)`]
        : []
    }
  },
  levySp: {
    kind: 'whole',
    check: (r, units, title, elite, culture) => {
      const spent = units.filter(u => u.quality === 'levy').reduce((s, u) => s + (buildUnit(u, culture).cost || 0), 0)
      return spent < r.atLeast ? [`${title} raises levies: at least ${r.atLeast} supply points of the army must go on levy (it has ${spent})`] : []
    }
  },
  kinds: {
    kind: 'whole',
    check: (r, units, title, elite) => {
      const all = [...units, elite]
      const kinds = new Set(all.map(u => (u.mounted ? 'horse' : shoots(u) ? 'shooters' : 'foot')))
      return kinds.size < r.atLeast
        ? [`${title} fights with every arm together: the army needs foot, bowmen or slingers, and horse (it has ${kinds.size} of the three)`]
        : []
    }
  }
}

const pct = (x) => (x === 0.5 ? 'half' : `${Math.round(x * 100)}%`)

/**
 * The faction's restrictions an army breaks.
 *
 * @param {string} key    the faction
 * @param {Array}  units  the bought units' kit ({ quality, weapon, armor, shield, mounted })
 * @param {Object} [o]    { kinds: ['unit', 'cap'] } judges only rules of these kinds
 * @returns {string[]}    one reason a rule is broken, at most, per rule
 */
function checkRestrictions(key, units, { kinds = null } = {}) {
  const faction = FACTIONS[key]
  if (!faction) return []
  const elite = { ...faction.elite, quality: 'elite' }
  const errors = []
  for (const r of faction.restrictions ?? []) {
    const rule = RULES[r.rule]
    if (!rule || (kinds && !kinds.includes(rule.kind))) continue
    const broken = rule.check(r, units, faction.title, elite, faction.culture)
    if (broken.length) errors.push(broken[0])
  }
  return errors
}

module.exports = { checkRestrictions, RULES, heavyFoot }

// src/interpreter/kinds.js
//
// Units by the kind the Army tab shows for them (narrator/words.js,
// kindWords): "skirmishers advance", "the pikes hold", "levy spearmen to
// C5", "attack their slingers". The word on the screen wins over the
// engine's older role (army/builder.js, roleFor), which goes by the weapon
// alone: Rome's velites are skirmishers here, not heavy infantry.
//
// A kind word finds every unit whose shown kind ends in it: "archers" is
// archers and horse archers, "heavy infantry" is those alone. "Infantry"
// and "cavalry" (the foot, the horse) are not read here: every unit on foot
// is infantry and every one on horse cavalry, whatever else the screen
// calls it, so they stay every unit on foot and every one on horse. A quality word before it narrows it
// ("levy skirmishers"). A unit's own name is not read here: the resolver
// tries names first, so a unit called "Skirmishers" keeps its name.

const { kindParts } = require('../narrator/words')

// What he may type for each kind the screen shows: the word itself,
// singular and plural, and the everyday forms.
const KIND_SAID = [
  ['horse archers', ['horse archers', 'horse archer', 'mounted archers', 'mounted archer', 'horse bowmen']],
  ['light horse', ['light horse', 'light cavalry', 'light horsemen']],
  ['lancers', ['lancers', 'lancer', 'lances', 'lancemen']],
  ['heavy infantry', ['heavy infantry', 'heavy foot', 'heavies', 'heavy infantrymen']],
  ['archers', ['archers', 'archer', 'bowmen', 'bowman', 'bows']],
  ['crossbowmen', ['crossbowmen', 'crossbowman', 'crossbows', 'crossbow']],
  ['slingers', ['slingers', 'slinger', 'slingmen', 'slings']],
  ['skirmishers', ['skirmishers', 'skirmisher', 'javelinmen', 'javelin men']],
  ['pikemen', ['pikemen', 'pikeman', 'pike men', 'pikes', 'pike', 'phalanx']],
  ['spearmen', ['spearmen', 'spearman', 'spear men', 'spears', 'spear']]
]
// How good the men are, as the screen says it, and as he may say it.
const QUALITY_SAID = {
  levy: 'levy', levies: 'levy', militia: 'militia', tribal: 'tribal', tribesmen: 'tribal',
  professional: 'professional', professionals: 'professional', mercenary: 'mercenary', mercenaries: 'mercenary',
  elite: 'elite'
}

const bare = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^(?:the|my|our|their|enemy|enemys|the enemy|the enemys|all the|all of the|all my|all)\s+/, '')
  .replace(/^(?:the|enemy)\s+/, '')

/**
 * The kind (and quality) the words name, or null when they name none.
 * @returns {{ kind: string, quality: string|null } | null}
 */
function kindSaid(words) {
  const text = bare(words)
  for (const [kind, forms] of KIND_SAID) {
    for (const form of forms) {
      if (text === form) return { kind, quality: null }
      if (text.endsWith(' ' + form)) {
        const before = text.slice(0, -form.length - 1)
        if (QUALITY_SAID[before]) return { kind, quality: QUALITY_SAID[before] }
      }
    }
  }
  return null
}

// Is a unit shown as this kind? Its shown kind is the kind, or ends in it.
function shownAs(unit, said, { quality = true } = {}) {
  const shown = kindParts(unit)
  if (!(shown.kind === said.kind || shown.kind.endsWith(' ' + said.kind))) return false
  return !quality || !said.quality || shown.quality === said.quality
}

/**
 * His own units the words name by their shown kind: null when the words are
 * no kind, or no unit is shown as that kind (the resolver then reads them
 * as it did before: "cavalry" is every unit on horse in an army with no
 * unit shown as cavalry).
 */
function unitsByKind(words, units) {
  const said = kindSaid(words)
  if (!said) return null
  const hits = units.filter(u => shownAs(u, said))
  return hits.length > 0 ? { units: hits, matchedBy: 'kind', kind: said } : null
}

/**
 * The enemy his side has seen that the words name by kind, as the reports
 * of them tell it (role, mounted, weapon, javelins, armour, shield): never
 * how good the men are, which no report tells, so a quality word is let go.
 * Null as unitsByKind.
 */
function enemiesByKind(words, enemies) {
  const said = kindSaid(words)
  if (!said) return null
  const told = (e) => e.primaryWeapon !== undefined && e.primaryWeapon !== null
  const hits = enemies.filter(e => told(e) && shownAs(e, said, { quality: false }))
  return hits.length > 0 ? hits : null
}

module.exports = { kindSaid, unitsByKind, enemiesByKind, KIND_SAID }

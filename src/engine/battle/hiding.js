// src/engine/battle/hiding.js
//
// How well a unit hides, and what hiding costs (ruled 2026-10-22 and 28).
//
// A unit can try to hide almost anywhere its commander tries to hide it. The
// engine decides how well it works, from this table: the ground the unit
// stands on, and the unit itself. The AI that reads a player's words only
// picks the order ("hide"); it never sets a number here. That is the
// shape-sorter rule: whatever the player says goes into one of these holes.
//
// seenWithin is how close an enemy must come to see the hidden unit by
// looking, on top of the ordinary sight rules (map/sight.js). 0 means
// looking is not enough: only a unit that checks the ground finds it.
//
// Rows run from best cover to none. Cavalry and large units (over 150 men)
// hide one row worse. Numbers are starting values, to be tuned in play.

const { CROWDING } = require('../combat/tables')

const ROWS = [
  { name: 'woods', words: 'in the woods', seenWithin: 0 },
  // Ranged fire does not exist yet; the cost to bows is recorded for when
  // it does.
  { name: 'marsh', words: 'in the marsh', seenWithin: 0, cost: { staminaPerTurn: 5, ranged: 'weakened' } },
  { name: 'edge', words: 'in cover at the edge of the trees or high ground', seenWithin: 2 },
  { name: 'open', words: 'in open ground', seenWithin: 4 },
  { name: 'none', words: 'nowhere: there is no cover here', seenWithin: null }
]

const ROW = Object.fromEntries(ROWS.map(r => [r.name, r]))
const NO_COVER = ['river', 'ford', 'bridge']
const LARGE = CROWDING.TIERS[0].upTo * 1.5 // 150 men

// The row the ground gives, before the unit is considered.
function groundRow(map, position) {
  const terrain = map.terrainAt(position)
  if (terrain === 'forest') return ROW.woods
  if (terrain === 'marsh') return ROW.marsh
  if (NO_COVER.includes(terrain)) return ROW.none
  if (terrain === 'hill') return ROW.edge
  const beside = map.neighbors(position).map(n => map.terrainAt(n))
  if (beside.includes('forest') || beside.includes('hill')) return ROW.edge
  return ROW.open
}

/**
 * How well this unit would hide where it stands.
 * @returns { name, words, seenWithin, cost? }  seenWithin null: cannot hide
 */
function coverFor(map, unit) {
  const row = groundRow(map, unit.position)
  const bulky = unit.mounted || unit.strength > LARGE
  if (!bulky || row === ROW.none) return row
  // One row worse: the two best rows both drop to the edge's seenWithin,
  // and open ground gives no cover at all to horses or a big body of men.
  const worse = row === ROW.woods || row === ROW.marsh ? ROW.edge : ROWS[ROWS.indexOf(row) + 1]
  return {
    ...row,
    words: `${row.words}, though too ${unit.mounted ? 'many horses' : 'big a body of men'} to hide well`,
    seenWithin: worse.seenWithin
  }
}

module.exports = { ROWS, coverFor }

// src/phase6-veterans/officers.js
//
// The named officers — the game's emotional core, per the roadmap: "named
// veteran officers who accumulate knowledge and die forever."
//
// Pure functions over a serializable roster. The one random thing here —
// who dies — draws from an injected RNG, the same seeded-stream discipline
// as combat, so a campaign replays exactly. (This is also what Q3's ruling
// asks for: keep the death table as authored, SIMULATE the survival curves,
// tune with data.)
//
// [salvage] The death ladder, from EliteUnit.getDeathProbability, keyed by
// the officer's OWN battles: the more they have lived through, the better
// they are at living through it.
//
//   Recruit (0)        15% per qualifying battle
//   Seasoned (1-2)     12%
//   Veteran (3-5)      10%
//   Elite (6-10)        8%
//   Legendary (11+)     6%
//
// A "qualifying battle" is one the officer's unit actually fought in — the
// caller decides that; a battle where the elite never engaged risks nobody.

const DEATH_TABLE = [
  { min: 11, chance: 0.06, rank: 'Legendary' },
  { min: 6, chance: 0.08, rank: 'Elite' },
  { min: 3, chance: 0.10, rank: 'Veteran' },
  { min: 1, chance: 0.12, rank: 'Seasoned' },
  { min: 0, chance: 0.15, rank: 'Recruit' }
]

function deathProbability(officer) {
  for (const rung of DEATH_TABLE) {
    if (officer.battlesExperience >= rung.min) return rung.chance
  }
  return 0.15
}

function officerRank(officer) {
  for (const rung of DEATH_TABLE) {
    if (officer.battlesExperience >= rung.min) return rung.rank
  }
  return 'Recruit'
}

/**
 * A roster of named positions. [roadmap] 8-12 named positions per culture;
 * the cultural position names come from data/cultures when phase 9 lands
 * that dataset, so the shape takes them as input rather than knowing any.
 *
 * @param {Array} positions  [{ position: 'First Spear', name: 'Marcus' }, ...]
 */
function createRoster(positions) {
  return positions.map((entry, index) => ({
    id: `officer_${index + 1}`,
    position: entry.position,
    name: entry.name,
    battlesExperience: 0,
    alive: true,
    // Knowledge dies with the officer. Strings for now; the AI narrator will
    // mine them ("ask your centurion" is phase 7 officer Q&A).
    knowledge: []
  }))
}

function livingOfficers(roster) {
  return roster.filter(o => o.alive)
}

/**
 * Resolve one battle's officer fates: experience for the living, death rolls
 * for everyone who fought, promotion of fresh blood into emptied positions.
 *
 * @param {Array}    roster  mutated
 * @param {Function} random  seeded RNG — the only randomness
 * @param {Object}   [opts]  { recruitNames: [] } names for promoted replacements
 * @returns {{deaths: Array, promotions: Array, memorials: Array}}
 */
function resolveOfficerFates(roster, random, opts = {}) {
  const recruitNames = [...(opts.recruitNames ?? [])]
  const deaths = []
  const promotions = []
  const memorials = []

  // Deaths roll in roster order — a fixed order, so the RNG stream is stable.
  for (const officer of roster) {
    if (!officer.alive) continue

    const chance = deathProbability(officer)
    if (random() < chance) {
      officer.alive = false
      deaths.push({
        id: officer.id,
        name: officer.name,
        position: officer.position,
        rank: officerRank(officer),
        battles: officer.battlesExperience
      })
      // The knowledge is the loss. It is recorded in the memorial — for the
      // narrator to grieve over — and then it is gone: nothing inherits it.
      memorials.push({
        name: officer.name,
        position: officer.position,
        battles: officer.battlesExperience,
        knowledgeLost: [...officer.knowledge]
      })
      officer.knowledge = []
    } else {
      officer.battlesExperience += 1
    }
  }

  // Automatic promotion: every emptied position is filled by a new officer
  // from the ranks — a Recruit, because the men who knew the dead man's job
  // died with him. The fallen stay in the roster as a record; the living
  // roster is livingOfficers().
  for (const death of deaths) {
    const name = recruitNames.shift() ?? `Replacement for ${death.name}`
    const recruit = {
      id: `officer_${roster.length + 1}`,
      position: death.position,
      name,
      battlesExperience: 0,
      alive: true,
      knowledge: [],
      promotedAfter: death.name
    }
    roster.push(recruit)
    promotions.push({ id: recruit.id, name, position: death.position, succeeds: death.name })
  }

  return { deaths, promotions, memorials }
}

module.exports = {
  DEATH_TABLE,
  deathProbability,
  officerRank,
  createRoster,
  livingOfficers,
  resolveOfficerFates
}

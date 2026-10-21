// src/engine/veterans/officers.js
//
// The named officers — the game's emotional core, per the roadmap: "named
// veteran officers who accumulate knowledge and die forever."
//
// Pure functions over a serializable roster. The one random thing here, each
// officer's fate after a battle, draws from an injected RNG, the same
// seeded-stream discipline as combat, so a campaign replays exactly.
//
// Fates follow ruling Q3 of 2026-10-21 (see FATES below): officers can be
// killed, captured or wounded, more often in defeat and in a battle that
// cost their unit many men.
//
// Ranks, by the officer's own battles, are a title only (the old salvaged
// death ladder they came from no longer sets the odds):

const RANKS = [
  { min: 11, rank: 'Legendary' },
  { min: 6, rank: 'Elite' },
  { min: 3, rank: 'Veteran' },
  { min: 1, rank: 'Seasoned' },
  { min: 0, rank: 'Recruit' }
]

function officerRank(officer) {
  for (const rung of RANKS) {
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
    status: 'active',  // active | wounded | captured | dead
    // Knowledge dies with the officer. Strings for now; the AI narrator will
    // mine them ("ask your centurion" is phase 7 officer Q&A).
    knowledge: []
  }))
}

// The officers on hand: alive and not held by the enemy. A wounded officer
// is still on the roster (recovering), marked by status.
function livingOfficers(roster) {
  return roster.filter(o => o.alive && o.status !== 'captured')
}

// ── Fates (ruling Q3, 2026-10-21) ─────────────────────
//
// After each battle the officers' unit fought, each present officer may be
// killed, captured or wounded. The rules, in battle-level terms (the chance
// that the battle costs the roster at least one officer that way):
//
//   killed    BASE[result] x (1 + LOSS_WEIGHT x losses), where losses is the
//             share of the unit's men lost. Tuned so a typical win (35% of
//             the elite lost) costs an officer about 1 battle in 10, and a
//             typical loss (50% lost) about 1 in 5. The fewer men left, the
//             likelier their officer fell.
//   captured  only when the unit broke and was run down: CAPTURE.caught,
//             more if trapped, more again if the unit was destroyed.
//   wounded   a near miss (WOUND.nearMiss x the kill chance), plus
//             WOUND.perPoorChoice for each poor choice the player made with
//             the unit: fighting surrounded (outnumbered), or leaving it
//             trapped. A wounded officer misses the next battle, then returns.
//
// Each battle-level chance is split across the officers present, so the
// per-battle rate holds whatever the roster size. One draw per present
// officer, in roster order: killed, else captured, else wounded, else fine.
// Experience no longer buys survival; the unit's survival does.

const FATES = {
  BASE: { victory: 0.0588, draw: 0.0794, defeat: 0.1 },
  LOSS_WEIGHT: 2,
  MAX_KILL: 0.6,
  CAPTURE: { caught: 0.15, trapped: 0.15, destroyed: 0.25 },
  WOUND: { nearMiss: 0.5, perPoorChoice: 0.1 },
  MAX_WOUND: 0.6
}

/**
 * Battle-level chances for a roster: { kill, capture, wound } in 0..1.
 * @param {Object} battle  { result: 'victory'|'draw'|'defeat', losses: 0..1,
 *   exposure: { routed, pursued, trapped, destroyed, outnumbered } }
 */
function fateChances(battle = {}) {
  const result = FATES.BASE[battle.result] !== undefined ? battle.result : 'draw'
  const losses = Math.max(0, Math.min(1, battle.losses ?? 0))
  const x = battle.exposure ?? {}

  const kill = Math.min(FATES.MAX_KILL, FATES.BASE[result] * (1 + FATES.LOSS_WEIGHT * losses))
  const caught = x.routed && (x.pursued || x.trapped || x.destroyed)
  const capture = caught || x.destroyed
    ? Math.min(0.6, FATES.CAPTURE.caught + (x.trapped ? FATES.CAPTURE.trapped : 0) + (x.destroyed ? FATES.CAPTURE.destroyed : 0))
    : 0
  const poorChoices = (x.outnumbered ? 1 : 0) + (x.trapped ? 1 : 0)
  const wound = Math.min(FATES.MAX_WOUND, FATES.WOUND.nearMiss * kill + FATES.WOUND.perPoorChoice * poorChoices)

  return { kill, capture, wound, poorChoices }
}

// Spread a battle-level chance over n officers: the per-officer chance p
// with 1 - (1 - p)^n = chance.
function perOfficer(chance, n) {
  return n > 0 && chance > 0 ? 1 - Math.pow(1 - chance, 1 / n) : 0
}

function woundReason(exposure = {}) {
  if (exposure.trapped) return 'trapped with the unit'
  if (exposure.outnumbered) return 'fought surrounded'
  return 'a near miss'
}

/**
 * Resolve one battle's officer fates: experience for those who came through,
 * death, capture or wounds for the unlucky, promotion into emptied posts.
 *
 * @param {Array}    roster  mutated
 * @param {Function} random  seeded RNG, the only randomness
 * @param {Object}   [opts]  { recruitNames: [], battle: see fateChances }
 * @returns {{ deaths, captures, wounds, recovered, promotions, memorials }}
 */
function resolveOfficerFates(roster, random, opts = {}) {
  const recruitNames = [...(opts.recruitNames ?? [])]
  const battle = opts.battle ?? {}
  const deaths = []
  const captures = []
  const wounds = []
  const recovered = []
  const promotions = []
  const memorials = []

  // Wounded officers sit this battle out, then return.
  const present = []
  for (const officer of roster) {
    if (!officer.alive || officer.status === 'captured') continue
    if (officer.status === 'wounded') {
      officer.status = 'active'
      recovered.push({ id: officer.id, name: officer.name, position: officer.position })
      continue
    }
    present.push(officer)
  }

  const chances = fateChances(battle)
  const n = present.length
  const pKill = perOfficer(chances.kill, n)
  const pCapture = perOfficer(chances.capture, n)
  const pWound = perOfficer(chances.wound, n)

  // One draw per present officer, in roster order, so the RNG stream is
  // stable.
  for (const officer of present) {
    const roll = random()
    const record = {
      id: officer.id, name: officer.name, position: officer.position,
      rank: officerRank(officer), battles: officer.battlesExperience
    }

    if (roll < pKill) {
      officer.alive = false
      officer.status = 'dead'
      deaths.push(record)
      // The knowledge is the loss. It is recorded in the memorial, for the
      // narrator to grieve over, and then it is gone: nothing inherits it.
      memorials.push({
        name: officer.name, position: officer.position,
        battles: officer.battlesExperience, knowledgeLost: [...officer.knowledge]
      })
      officer.knowledge = []
    } else if (roll < pKill + pCapture) {
      // Taken by the enemy. Alive, off the roster until ransomed or freed
      // (the later diplomacy work); the post is filled meanwhile.
      officer.status = 'captured'
      captures.push(record)
    } else if (roll < pKill + pCapture + pWound) {
      officer.status = 'wounded'
      officer.battlesExperience += 1
      wounds.push({ ...record, reason: woundReason(battle.exposure) })
    } else {
      officer.status = 'active'
      officer.battlesExperience += 1
    }
  }

  // Automatic promotion: every post emptied by death or capture is filled by
  // a new officer from the ranks, a Recruit, because the men who knew the
  // job are gone. The fallen and the captured stay in the roster as a
  // record; the officers present are livingOfficers().
  for (const lost of [...deaths, ...captures]) {
    const name = recruitNames.shift() ?? `Replacement for ${lost.name}`
    const recruit = {
      id: `officer_${roster.length + 1}`,
      position: lost.position,
      name,
      battlesExperience: 0,
      alive: true,
      status: 'active',
      knowledge: [],
      promotedAfter: lost.name
    }
    roster.push(recruit)
    promotions.push({ id: recruit.id, name, position: lost.position, succeeds: lost.name })
  }

  return { deaths, captures, wounds, recovered, promotions, memorials }
}

module.exports = {
  RANKS,
  FATES,
  fateChances,
  perOfficer,
  officerRank,
  createRoster,
  livingOfficers,
  resolveOfficerFates
}

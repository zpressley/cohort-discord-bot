// src/phase6-veterans/campaign.js
//
// The bridge between a battle (phase 4/5) and the commander's permanent
// record: take a finished battle, work out what it did to the veteran state
// and the officers, and save. Pure orchestration over the other three files.

const { applyBattle, veteranResistance, namingMilestone } = require('./veterancy')
const { resolveOfficerFates, livingOfficers } = require('./officers')

/**
 * Fold one finished battle into a commander's record. Mutates and returns the
 * commander; the caller saves via the repository.
 *
 * @param {Object}   commander     from persistence.createCommander / load
 * @param {Object}   battleReport
 * @param {string}   battleReport.battleId
 * @param {string}   battleReport.result        'victory' | 'defeat' | 'draw'
 * @param {Object}   battleReport.eliteSurvivors  men standing (null = did not fight)
 * @param {Object}   battleReport.regularsFought  unitId -> survived:boolean
 * @param {Function} random        seeded RNG for the officer death rolls
 * @param {Object}   [opts]        { recruitNames }
 * @returns {{ milestones: Array, officers: Object }}
 */
function recordBattle(commander, battleReport, random, opts = {}) {
  const milestones = []
  let officerOutcome = { deaths: [], promotions: [], memorials: [] }

  if (commander.elite && battleReport.eliteSurvivors !== null) {
    const before = namingMilestone(commander.elite.veteran.battlesParticipated)
    applyBattle(commander.elite.veteran, { survivors: battleReport.eliteSurvivors })
    const after = namingMilestone(commander.elite.veteran.battlesParticipated)

    // Milestones fire on the crossing, once.
    if (after && after !== before) {
      milestones.push({ type: after, atBattle: commander.elite.veteran.battlesParticipated })
    }

    officerOutcome = resolveOfficerFates(commander.elite.roster, random, opts)
  }

  for (const [unitId, survived] of Object.entries(battleReport.regularsFought ?? {})) {
    if (!commander.regulars[unitId]) commander.regulars[unitId] = { battles: 0 }
    if (survived) commander.regulars[unitId].battles += 1
    else delete commander.regulars[unitId]   // a destroyed unit's history dies with it
  }

  commander.battles.push({
    battleId: battleReport.battleId,
    result: battleReport.result,
    eliteSurvivors: battleReport.eliteSurvivors,
    officerDeaths: officerOutcome.deaths.map(d => d.name),
    milestones: milestones.map(m => m.type)
  })

  return { milestones, officers: officerOutcome }
}

// What the battle engine needs from the record: the earned resistance bonus
// to put on the elite unit's spec (ratings.moraleResistance reads it), and
// the living officers for the narrator.
function eliteBattleFields(commander) {
  if (!commander.elite) return {}
  return {
    veteranResistance: veteranResistance(commander.elite.veteran),
    strength: commander.elite.veteran.strength,
    maxStrength: commander.elite.veteran.strength,
    officers: livingOfficers(commander.elite.roster).map(o => ({
      name: o.name, position: o.position, battles: o.battlesExperience
    }))
  }
}

module.exports = { recordBattle, eliteBattleFields }

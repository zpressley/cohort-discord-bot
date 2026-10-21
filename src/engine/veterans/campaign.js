// src/engine/veterans/campaign.js
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
 * @param {Object}   [battleReport.eliteExposure] what befell the elite unit:
 *                   { routed, pursued, trapped, destroyed, outnumbered } (see
 *                   exposureFromEvents); raises capture and wound chances
 * @param {Object}   battleReport.regularsFought  unitId -> survived:boolean
 * @param {Function} random        seeded RNG for the officer fate rolls
 * @param {Object}   [opts]        { recruitNames }
 * @returns {{ milestones: Array, officers: Object }}
 */
function recordBattle(commander, battleReport, random, opts = {}) {
  const milestones = []
  let officerOutcome = { deaths: [], captures: [], wounds: [], recovered: [], promotions: [], memorials: [] }

  if (commander.elite && battleReport.eliteSurvivors !== null) {
    const strengthBefore = commander.elite.veteran.strength
    const losses = strengthBefore > 0
      ? Math.max(0, strengthBefore - battleReport.eliteSurvivors) / strengthBefore
      : 0
    const before = namingMilestone(commander.elite.veteran.battlesParticipated)
    applyBattle(commander.elite.veteran, { survivors: battleReport.eliteSurvivors })
    const after = namingMilestone(commander.elite.veteran.battlesParticipated)

    // Milestones fire on the crossing, once.
    if (after && after !== before) {
      milestones.push({ type: after, atBattle: commander.elite.veteran.battlesParticipated })
    }

    officerOutcome = resolveOfficerFates(commander.elite.roster, random, {
      ...opts,
      battle: { result: battleReport.result, losses, exposure: battleReport.eliteExposure ?? {} }
    })
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
    officerCaptures: officerOutcome.captures.map(c => c.name),
    officerWounds: officerOutcome.wounds.map(w => w.name),
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

/**
 * What befell one unit in a battle, read from the battle's event log: the
 * circumstances officer fates depend on.
 */
function exposureFromEvents(events, unitId) {
  const about = (e) => [e.unitId, e.a?.unitId, e.b?.unitId].includes(unitId)
  const mine = events.filter(about)
  return {
    routed: mine.some(e => e.type === 'rout' && e.unitId === unitId),
    pursued: mine.some(e => e.type === 'pursuit' && e.unitId === unitId),
    trapped: mine.some(e => e.type === 'pursuit' && e.unitId === unitId && e.trapped),
    destroyed: mine.some(e => e.type === 'destroyed' && e.unitId === unitId),
    // Fought more than one enemy at once: an enemy striking it had a flank
    // bonus, which only comes from its target being in several engagements.
    outnumbered: mine.some(e => e.type === 'exchange' &&
      ((e.a.unitId === unitId && e.b.flankBonus > 0) || (e.b.unitId === unitId && e.a.flankBonus > 0)))
  }
}

module.exports = { recordBattle, eliteBattleFields, exposureFromEvents }

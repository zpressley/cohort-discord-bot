// src/game/officers/eliteOfficerBootstrap.js
// Ensure elite units have veteran officer records for narrative and tactical use

const { models } = require('../../database/setup');
const { generateOfficerName } = require('./culturalNames');

/**
 * Ensure the given elite unit has a roster of VeteranOfficer entries.
 * Returns the refreshed EliteUnit instance (with .officers populated).
 */
async function ensureEliteOfficersForUnit(eliteUnit, culture, desiredCount = 4) {
  if (!eliteUnit) return null;

  const existing = await models.VeteranOfficer.findAll({
    where: { eliteUnitId: eliteUnit.id }
  });

  if (existing.length >= desiredCount) {
    eliteUnit.officers = existing;
    return eliteUnit;
  }

  const toCreate = desiredCount - existing.length;
  const created = [];

  for (let i = 0; i < toCreate; i++) {
    // Use cultural officer naming system; treat eliteUnit as elite unit for name selection
    const nameMeta = generateOfficerName({ isElite: true }, culture);

    const officer = await models.VeteranOfficer.create({
      eliteUnitId: eliteUnit.id,
      name: nameMeta.name,
      rank: nameMeta.position || 'Veteran Officer',
      battlesExperience: eliteUnit.battlesParticipated || 0,
      personality: {
        aggressive: 0,
        cautious: 0,
        tactical: 0,
        inspirational: 0
      },
      tacticalKnowledge: {
        enemyCultures: {},
        terrainExperience: {},
        weatherAdaptation: {},
        battleMemories: []
      },
      personalEquipment: {
        weapon: null,
        armor: null,
        special: []
      }
    });

    created.push(officer);
  }

  eliteUnit.officers = existing.concat(created);
  return eliteUnit;
}

/**
 * Convenience helper: fetch a commander’s elite unit (if any) and ensure it has officers.
 */
async function ensureEliteOfficersForCommander(commanderId, culture) {
  const elite = await models.EliteUnit.findOne({
    where: { commanderId },
    include: [{ model: models.VeteranOfficer, as: 'officers' }]
  });

  if (!elite) return null;

  // If officers already present, return as-is; otherwise bootstrap a small cadre
  if (elite.officers && elite.officers.length > 0) {
    return elite;
  }

  return ensureEliteOfficersForUnit(elite, culture);
}

module.exports = {
  ensureEliteOfficersForUnit,
  ensureEliteOfficersForCommander
};

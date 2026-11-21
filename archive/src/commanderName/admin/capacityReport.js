// src/commanderName/admin/capacityReport.js
// Helper to build a capacity report over all archetypes/philosophies.

const nameGenerator = require('../nameGeneration/nameGenerator');

const ARCHETYPES = ['engineer', 'mountain', 'ghost', 'mirage', 'hero', 'wall', 'wind', 'threshold', 'serpent', 'storm'];
const PHILOSOPHIES = ['glory', 'survival'];

async function buildCapacityReport() {
  const report = [];

  for (const archetype of ARCHETYPES) {
    const gloryData = await nameGenerator.checkCapacity(archetype, 'glory');
    const survivalData = await nameGenerator.checkCapacity(archetype, 'survival');

    report.push({
      archetype,
      glory: gloryData,
      survival: survivalData
    });
  }

  return report;
}

module.exports = {
  buildCapacityReport,
  ARCHETYPES,
  PHILOSOPHIES
};

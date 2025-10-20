// src/game/validation/scenarioKeyAssert.js
// Ensures scenario keys align with available map modules

function assertScenarioKeys() {
  const { BATTLE_SCENARIOS } = require('../../bot/commands/create-game');
  const keys = Object.keys(BATTLE_SCENARIOS || {});
  const mapRegistry = {
    river_crossing: () => require('../maps/riverCrossing').RIVER_CROSSING_MAP,
    bridge_control: () => require('../maps/bridgeControl').BRIDGE_CONTROL_MAP,
    hill_fort_assault: () => require('../maps/hillFortAssault').HILL_FORT_ASSAULT_MAP,
    forest_ambush: () => require('../maps/forestAmbush').FOREST_AMBUSH_MAP,
    desert_oasis: () => require('../maps/desertOasis').DESERT_OASIS_MAP
  };

  const missing = [];
  for (const k of keys) {
    const loader = mapRegistry[k];
    try {
      if (!loader) {
        missing.push({ key: k, reason: 'no map module registered' });
        continue;
      }
      const mod = loader();
      if (!mod || typeof mod !== 'object') {
        missing.push({ key: k, reason: 'map module invalid' });
      }
    } catch (e) {
      missing.push({ key: k, reason: e.message });
    }
  }

  if (missing.length) {
    const lines = missing.map(m => ` - ${m.key}: ${m.reason}`).join('\n');
    const msg = `Scenario key alignment failed:\n${lines}`;
    console.error(msg);
    throw new Error(msg);
  }

  return true;
}

module.exports = { assertScenarioKeys };

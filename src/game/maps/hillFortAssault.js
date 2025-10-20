// src/game/maps/hillFortAssault.js
const { generateASCIIMap } = require('./mapUtils');

const HILL_FORT_ASSAULT_MAP = {
  name: 'Hill Fort Assault',
  size: { rows: 20, cols: 20 },
  terrain: {
    river: [],
    fords: [],
    hill: ['M6','M7','N6','N7','O6','O7','P7'], // Fortified hill cluster
    marsh: ['C18','D18'],
    road: ['H12','I12','J12','K12','L12','M12','N12'],
    forest: ['E4','F4','G4','E5','F5','G5','E6','F6']
  },
  movementCosts: { plains: 1, road: 0.6, hill: 1.8, forest: 2.2, marsh: 3.2, river: 999 },
  combatModifiers: {
    hill: { defense: +3, missileRange: +1 },
    forest: { defense: +1 },
    road: { formationBonus: +1 }
  },
  objectives: {
    primary: 'Capture the hill fort or hold for 8 turns',
    controlPoints: [{ coord: 'N6', name: 'Hill Fort', controlRadius: 1 }]
  },
  specialRules: { maxTurns: 15 }
};

function getTerrainAt(coord) {
  if (HILL_FORT_ASSAULT_MAP.terrain.hill.includes(coord)) return 'hill';
  if (HILL_FORT_ASSAULT_MAP.terrain.marsh.includes(coord)) return 'marsh';
  if (HILL_FORT_ASSAULT_MAP.terrain.road.includes(coord)) return 'road';
  if (HILL_FORT_ASSAULT_MAP.terrain.forest.includes(coord)) return 'forest';
  return 'plains';
}

function generateBattleMap(battleState) {
  return generateASCIIMap({
    terrain: HILL_FORT_ASSAULT_MAP.terrain,
    player1Units: battleState.player1?.unitPositions || [],
    player2Units: battleState.player2?.unitPositions || []
  });
}

module.exports = { HILL_FORT_ASSAULT_MAP, getTerrainAt, generateBattleMap };
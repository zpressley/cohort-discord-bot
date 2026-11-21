// src/game/maps/desertOasis.js
const { generateASCIIMap } = require('./mapUtils');

const DESERT_OASIS_MAP = {
  name: 'Desert Oasis',
  size: { rows: 20, cols: 20 },
  terrain: {
    river: [],
    fords: [],
    hill: ['E9','F9','E10','F10'],
    marsh: [],
    road: ['C12','D12','E12','F12','G12','H12'],
    forest: ['J8','J9','K8','K9'] // oasis grove
  },
  movementCosts: { plains: 1, road: 0.7, hill: 1.6, forest: 1.8, marsh: 3.0, river: 999, sand: 1.2 },
  combatModifiers: {
    hill: { defense: +1 },
    forest: { defense: +1 },
    road: { formationBonus: +1 }
  },
  objectives: {
    primary: 'Hold the oasis grove (J8-K9) for 6 turns or deny water to the enemy',
    controlPoints: [{ coord: 'J9', name: 'Oasis', controlRadius: 1 }]
  },
  specialRules: { maxTurns: 8 }
};

function getTerrainAt(coord) {
  if (DESERT_OASIS_MAP.terrain.forest.includes(coord)) return 'forest';
  if (DESERT_OASIS_MAP.terrain.hill.includes(coord)) return 'hill';
  if (DESERT_OASIS_MAP.terrain.road.includes(coord)) return 'road';
  return 'plains';
}

function generateBattleMap(battleState) {
  return generateASCIIMap({
    terrain: DESERT_OASIS_MAP.terrain,
    player1Units: battleState.player1?.unitPositions || [],
    player2Units: battleState.player2?.unitPositions || []
  });
}

module.exports = { DESERT_OASIS_MAP, getTerrainAt, generateBattleMap };

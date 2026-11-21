// src/game/maps/forestAmbush.js
const { generateASCIIMap } = require('./mapUtils');

const FOREST_AMBUSH_MAP = {
  name: 'Forest Ambush',
  size: { rows: 20, cols: 20 },
  terrain: {
    river: [],
    fords: [],
    hill: ['H8','I8','H9','I9'],
    marsh: ['M15','N15','N16'],
    road: ['A5','B5','C5','D5','E5','F5','G5','H5','I5','J5','K5','L5'],
    forest: [
      // Dense band across center
      'A7','B7','C7','D7','E7','F7','G7','H7','I7','J7','K7','L7','M7','N7','O7','P7',
      'A8','B8','C8','D8','E8','F8','G8','H8','I8','J8','K8','L8','M8','N8','O8','P8',
      'A9','B9','C9','D9','E9','F9','G9','H9','I9','J9','K9','L9','M9','N9','O9','P9'
    ]
  },
  movementCosts: { plains: 1, road: 0.7, hill: 1.5, forest: 2.5, marsh: 3.5, river: 999 },
  combatModifiers: {
    forest: { defense: +2, ambushBonus: +6, formationPenalty: -3, cavalryPenalty: -5 },
    hill: { defense: +2 },
    road: { formationBonus: +1 }
  },
  objectives: {
    primary: 'Ambushers disrupt and bleed convoy; escorts protect passage',
    controlPoints: [{ coord: 'L5', name: 'Convoy Route', controlRadius: 1 }]
  },
  specialRules: { maxTurns: 10 }
};

function getTerrainAt(coord) {
  if (FOREST_AMBUSH_MAP.terrain.forest.includes(coord)) return 'forest';
  if (FOREST_AMBUSH_MAP.terrain.hill.includes(coord)) return 'hill';
  if (FOREST_AMBUSH_MAP.terrain.marsh.includes(coord)) return 'marsh';
  if (FOREST_AMBUSH_MAP.terrain.road.includes(coord)) return 'road';
  return 'plains';
}

function generateBattleMap(battleState) {
  return generateASCIIMap({
    terrain: FOREST_AMBUSH_MAP.terrain,
    player1Units: battleState.player1?.unitPositions || [],
    player2Units: battleState.player2?.unitPositions || []
  });
}

module.exports = { FOREST_AMBUSH_MAP, getTerrainAt, generateBattleMap };

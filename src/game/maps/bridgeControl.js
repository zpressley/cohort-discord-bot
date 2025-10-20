// src/game/maps/bridgeControl.js
const { generateASCIIMap } = require('./mapUtils');

const BRIDGE_CONTROL_MAP = {
  name: 'Bridge Control',
  size: { rows: 20, cols: 20 },
  terrain: {
    river: ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','F13','F14','F15','F16','F17','F18','F19','F20'],
    fords: [ { coord: 'F10', name: 'Old Bridge', width: 1 } ],
    hill: ['K6','K7','K8','L7','L8'],
    marsh: ['B14','C14','C15','D15','E15','E16','F16'],
    road: ['A10','B10','C10','D10','E10','F10','G10','H10','I10','J10','K10','L10','M10'],
    forest: ['N3','O3','P3','N4','O4','P4','N5','O5','P5','A18','B18','A19','B19']
  },
  movementCosts: { plains: 1, road: 0.5, hill: 1.5, forest: 2, marsh: 3, river: 999, ford: 1.5 },
  combatModifiers: {
    hill: { defense: +2, missileRange: +1 },
    forest: { defense: +2, ambushBonus: +4, formationPenalty: -3, cavalryPenalty: -4 },
    marsh: { movementPenalty: -3, formationPenalty: -3 },
    ford: { crossingPenalty: -4, defenderBonus: +3, maxWidth: 3 },
    road: { formationBonus: +1 }
  },
  objectives: {
    primary: 'Control the bridge (F10) for 4 turns or rout the enemy',
    controlPoints: [{ coord: 'F10', name: 'Bridge', controlRadius: 1 }]
  },
  specialRules: { maxTurns: 12 }
};

function getTerrainAt(coord) {
  if (BRIDGE_CONTROL_MAP.terrain.fords.some(f => f.coord === coord)) return 'ford';
  if (BRIDGE_CONTROL_MAP.terrain.river.includes(coord)) return 'river';
  if (BRIDGE_CONTROL_MAP.terrain.hill.includes(coord)) return 'hill';
  if (BRIDGE_CONTROL_MAP.terrain.marsh.includes(coord)) return 'marsh';
  if (BRIDGE_CONTROL_MAP.terrain.road.includes(coord)) return 'road';
  if (BRIDGE_CONTROL_MAP.terrain.forest.includes(coord)) return 'forest';
  return 'plains';
}

function generateBattleMap(battleState) {
  return generateASCIIMap({
    terrain: BRIDGE_CONTROL_MAP.terrain,
    player1Units: battleState.player1?.unitPositions || [],
    player2Units: battleState.player2?.unitPositions || []
  });
}

module.exports = { BRIDGE_CONTROL_MAP, getTerrainAt, generateBattleMap };

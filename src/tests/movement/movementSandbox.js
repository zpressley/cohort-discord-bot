// src/tests/movement/movementSandbox.js
// Simple sandbox to test interpretOrders + movement pipeline for different commands

const { interpretOrders } = require('../../ai/orderInterpreter');
const { processMovementPhase } = require('../../game/positionBasedCombat');
const { RIVER_CROSSING_MAP } = require('../../game/maps/riverCrossing');

async function run(commandP1, commandP2) {
  const map = RIVER_CROSSING_MAP;

  // Minimal battleState with three units per side
  const battleState = {
    currentTurn: 1,
    map: { terrain: map.terrain },
    player1: {
      culture: 'Roman Republic',
      army: { culture: 'Roman Republic' },
      unitPositions: [
        { unitId: 'north_unit_0', position: 'E16', currentStrength: 75, qualityType: 'professional', mounted: false, type: 'infantry' },
        { unitId: 'north_unit_1', position: 'F16', currentStrength: 60, qualityType: 'professional', mounted: true, type: 'cavalry' },
        { unitId: 'north_unit_2', position: 'G16', currentStrength: 55, qualityType: 'medium_infantry', mounted: false, type: 'medium infantry' }
      ]
    },
    player2: {
      culture: 'Han Dynasty',
      army: { culture: 'Han Dynasty' },
      unitPositions: [
        { unitId: 'south_unit_0', position: 'P11', currentStrength: 75, qualityType: 'elite', mounted: false, type: 'elite infantry', isElite: true },
        { unitId: 'south_unit_1', position: 'Q11', currentStrength: 60, qualityType: 'professional', mounted: false, type: 'medium infantry' },
        { unitId: 'south_unit_2', position: 'R11', currentStrength: 75, qualityType: 'professional', mounted: false, type: 'infantry' }
      ]
    }
  };

  console.log('=== Movement Sandbox ===');
  console.log('P1 Command:', commandP1);
  console.log('P2 Command:', commandP2);

  const p1Interp = await interpretOrders(commandP1, battleState, 'player1', map);
  const p2Interp = await interpretOrders(commandP2, battleState, 'player2', map);

  console.log('\nP1 validated actions:');
  console.dir(p1Interp.validatedActions, { depth: 4 });

  console.log('\nP2 validated actions:');
  console.dir(p2Interp.validatedActions, { depth: 4 });

  const p1Moves = p1Interp.validatedActions.filter(a => a.type === 'move');
  const p2Moves = p2Interp.validatedActions.filter(a => a.type === 'move');

  const movementResults = processMovementPhase(p1Moves, p2Moves, battleState, map);

  console.log('\nNew positions:');
  console.log('Player1:', movementResults.newPositions.player1.map(u => ({ id: u.unitId, pos: u.position })));
  console.log('Player2:', movementResults.newPositions.player2.map(u => ({ id: u.unitId, pos: u.position })));

  console.log('\nCompression info:', movementResults.compression);
}

if (require.main === module) {
  const [, , c1 = 'move south', c2 = 'move north'] = process.argv;
  run(c1, c2).catch(err => {
    console.error('Sandbox error:', err);
    process.exit(1);
  });
}

module.exports = { run };

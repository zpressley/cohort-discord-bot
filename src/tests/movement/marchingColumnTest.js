// src/tests/movement/marchingColumnTest.js
// Simple harness to sanity-check marching column depth, movement bonus,
// collision behavior, and map visualization.

const { RIVER_CROSSING_MAP, calculateOccupiedTiles } = require('../../game/maps/mapUtils');
const { validateMovement } = require('../../game/movement');
const { generateEmojiGrid } = require('../../game/maps/mapUtils');

function makeUnit({
  unitId,
  position,
  currentStrength,
  formationStatus = 'marching',
  facing = 'S',
  unitType = 'infantry',
  mounted = false,
  isElite = false,
  side
}) {
  return {
    unitId,
    position,
    currentStrength,
    maxStrength: currentStrength,
    formationStatus,
    facing,
    unitType,
    mounted,
    isElite,
    side,
    movementRemaining: mounted ? 10 : 6
  };
}

function printOccupied(label, unit) {
  const tiles = calculateOccupiedTiles(unit);
  console.log(`${label} strength=${unit.currentStrength}, tiles=${tiles.length}:`, tiles.join(', '));
}

async function run() {
  console.log('=== Marching Column Test ===');

  const map = { ...RIVER_CROSSING_MAP, weather: 'clear' };

  const u100 = makeUnit({ unitId: 'u100', position: 'H5', currentStrength: 100, side: 'player1' });
  const u300 = makeUnit({ unitId: 'u300', position: 'J5', currentStrength: 300, side: 'player1' });
  const u400 = makeUnit({ unitId: 'u400', position: 'L5', currentStrength: 400, side: 'player1' });

  printOccupied('100-man column', u100);
  printOccupied('300-man column', u300);
  printOccupied('400-man column', u400);

  console.log('\n=== Movement bonus check (marching vs deployed) ===');
  const marching = makeUnit({ unitId: 'march', position: 'C10', currentStrength: 400, side: 'player1' });
  const deployed = { ...marching, unitId: 'deploy', formationStatus: 'deployed' };

  const marchVal = validateMovement(marching, 'C20', map);
  const depVal = validateMovement(deployed, 'C20', map);
  console.log(' marching movement:', marchVal);
  console.log(' deployed movement:', depVal);

  console.log('\n=== Collision check: marching into deployed line ===');
  const blocker = {
    unitId: 'blocker',
    position: 'F15',
    currentStrength: 400,
    maxStrength: 400,
    formationStatus: 'deployed',
    facing: 'N',
    unitType: 'infantry',
    mounted: false,
    side: 'player1'
  };

  const marchToward = makeUnit({ unitId: 'col', position: 'F5', currentStrength: 400, side: 'player1' });
  const moveRes = validateMovement(marchToward, 'F20', map);
  console.log(' raw validateMovement result:', moveRes);

  const battleState = {
    map,
    player1: { unitPositions: [marchToward, blocker] },
    player2: { unitPositions: [] }
  };
  const { processMovementPhase } = require('../../game/movement');

  const movementResults = processMovementPhase([
    { unitId: 'col', targetPosition: moveRes.finalPosition, validation: moveRes }
  ], [], battleState, map);

  console.log(' new position for column:',
    movementResults.newPositions.player1.find(u => u.unitId === 'col'));

  console.log('\n=== Emoji map snippet with marching trails ===');
  const mapData = {
    terrain: map.terrain,
    player1Units: [u100, u300, u400],
    player2Units: []
  };
  const grid = generateEmojiGrid(mapData, 'player1');
  // Print a 10x10 window around row 0-9, col 5-14 for a quick visual
  for (let r = 0; r < 10; r++) {
    console.log(grid[r].slice(5, 15).join(' '));
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('marchingColumnTest error:', err);
    process.exit(1);
  });
}

module.exports = { run };

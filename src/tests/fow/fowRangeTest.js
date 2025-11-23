// src/tests/fow/fowRangeTest.js
// Simple Fog-of-War sight-line sanity checks

const { calculateVisibility } = require('../../game/fogOfWar');

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${name}`);
  }
}

function makeUnit(id, position) {
  return {
    unitId: id,
    position,
    unitType: 'infantry',
    currentStrength: 100
  };
}

function runFowRangeTests() {
  console.log('=== FOW RANGE TESTS ===');

  const terrain = { hill: [], forest: [], marsh: [], river: [], road: [] };

  // Friendly unit at F14
  const friendly = [makeUnit('p1_inf_0', 'F14')];

  function visibleAt(enemyPos, label) {
    const enemy = [makeUnit('p2_inf_0', enemyPos)];
    const vis = calculateVisibility(friendly, enemy, terrain, 'clear');
    const visible = vis.visibleEnemyPositions.includes(enemyPos);
    console.log(`${label}: distance sighted?`, visible, vis);
    return visible;
  }

  // Close contact (within ~3-4 tiles) SHOULD be visible
  assert('Enemy at H15 (approx 2 tiles) should be visible', visibleAt('H15', 'H15 (~2 tiles)'));

  // Mid-range contact (about 6 tiles) – should still be visible as
  // identified intel under clear conditions.
  assert('Enemy at N14 (~6 tiles east) should be visible (identified tier)',
    visibleAt('N14', 'N14 (~6 tiles)'));

  // Long-range contact (~10+ tiles) should NOT be visible at all.
  const farVisible = visibleAt('P14', 'P14 (far east)');
  assert('Enemy at P14 (~10+ tiles) should NOT be visible (tactical scale sanity)', !farVisible);

  if (!process.exitCode) {
    console.log('All FOW range sanity checks passed (per current expectations).');
  } else {
    console.error('One or more FOW range checks failed. Review DETECTION_RANGES in fogOfWar.js.');
  }
}

if (require.main === module) {
  runFowRangeTests();
}

module.exports = { runFowRangeTests };

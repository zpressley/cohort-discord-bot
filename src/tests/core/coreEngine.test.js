// src/tests/core/coreEngine.test.js
// Core invariants tests (no framework)

const { validateMovement } = require('../../../src/game/movementSystem');
const { RIVER_CROSSING_MAP } = require('../../../src/game/maps/riverCrossing');
const { resolveCombat } = require('../../../src/game/battleEngine');

function ok(name, cond) { cond ? pass(name) : fail(name); }
function pass(name) { console.log(`PASS: ${name}`); }
function fail(name) { console.error(`FAIL: ${name}`); process.exitCode = 1; }

function makeUnit(unitId, position, opts = {}) {
  return {
    unitId,
    position,
    currentStrength: opts.currentStrength || 100,
    maxStrength: opts.maxStrength || 100,
    mounted: !!opts.mounted,
    qualityType: opts.qualityType || 'professional',
    primaryWeapon: { name: opts.weapon || 'sword' },
    armor: { name: opts.armor || 'medium_armor' },
    shields: { name: opts.shield || 'scutum' },
    training: { type: 'basic', level: 1 }
  };
}

(async function run() {
  // Movement legality: entering river tile should be invalid
  {
    const unit = makeUnit('u1', 'J9'); // Adjacent to J10 (river)
    const res = validateMovement(unit, 'J10', RIVER_CROSSING_MAP);
    ok('movement into river is invalid', res.valid === false);
  }

  // Partial movement: far target results in partialMovement true
  {
    const unit = makeUnit('u2', 'A1');
    const res = validateMovement(unit, 'T20', RIVER_CROSSING_MAP);
    ok('partial movement valid', res.valid === true && res.partialMovement === true);
    ok('partial movement reduces remaining to 0', res.movementRemaining === 0);
    ok('finalPosition not equal target', res.finalPosition !== 'T20');
  }

  // Combat invariants: non-negative casualties and reasonable structure
  {
    const attacker = { units: [makeUnit('a1', 'E5', { weapon: 'spear', armor: 'light_armor' })], formation: 'line' };
    const defender = { units: [makeUnit('d1', 'E6', { weapon: 'sword', armor: 'medium_armor' })], formation: 'line' };
    const conditions = { terrain: 'plains', weather: 'clear' };
    const ctx = { turn: 1, location: 'E6' };

    const result = await resolveCombat(attacker, defender, conditions, ctx);
    ok('combat has result', !!result && !!result.combatResult);
    ok('casualties non-negative (attacker)', (result.casualties.attacker.total || 0) >= 0);
    ok('casualties non-negative (defender)', (result.casualties.defender.total || 0) >= 0);
  }

  // Diff idempotency check (simple): applying no move yields empty diff
  {
    const before = { player1: [{ unitId: 'p1', position: 'A1' }], player2: [{ unitId: 'p2', position: 'B2' }] };
    const after = { player1: [{ unitId: 'p1', position: 'A1' }], player2: [{ unitId: 'p2', position: 'B2' }] };
    const diffs = computeDiffs(before, after);
    ok('idempotent diffs empty when no movement', diffs.player1.length === 0 && diffs.player2.length === 0);
  }

  if (process.exitCode) {
    console.error('Core engine tests failed');
  } else {
    console.log('All core engine tests passed');
  }
})();

function computeDiffs(prevState, newPositions) {
  const diffOneSide = (before, after) => {
    const moves = [];
    const beforeIdx = Object.fromEntries((before || []).map(u => [u.unitId, u]));
    for (const u of after || []) {
      const prev = beforeIdx[u.unitId];
      if (prev && prev.position !== u.position) {
        moves.push({ unitId: u.unitId, from: prev.position, to: u.position });
      }
    }
    return moves;
  };
  return {
    player1: diffOneSide(prevState.player1, newPositions.player1),
    player2: diffOneSide(prevState.player2, newPositions.player2)
  };
}

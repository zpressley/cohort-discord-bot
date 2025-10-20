// src/tests/schemas/validator.test.js
// Minimal smoke tests for command schemas (no framework)

const { validateAction } = require('../../../src/game/schemas');

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${name}`);
  }
}

// Valid move
const validMove = { type: 'move', unitId: 'player1_inf_0', targetPosition: 'F11' };
assert('valid move', validateAction(validMove).valid === true);

// Invalid move (bad coord)
const badMove = { type: 'move', unitId: 'player1_inf_0', targetPosition: '11F' };
assert('invalid move coord', validateAction(badMove).valid === false);

// Valid attack by unit
const validAttack = { type: 'attack', unitId: 'u1', targetUnitId: 'u2' };
assert('valid attack', validateAction(validAttack).valid === true);

// Invalid attack (no target)
const badAttack = { type: 'attack', unitId: 'u1' };
assert('invalid attack missing target', validateAction(badAttack).valid === false);

// Valid formation
const validForm = { type: 'formation', unitId: 'u1', formationType: 'line' };
assert('valid formation', validateAction(validForm).valid === true);

// Invalid formation (enum)
const badForm = { type: 'formation', unitId: 'u1', formationType: 'shieldwall' };
assert('invalid formation enum', validateAction(badForm).valid === false);

// Valid conditional
const validCond = {
  type: 'conditional',
  condition: { check: 'enemy_at_position', position: 'F11' },
  ifTrue: [{ type: 'move', unitId: 'u1', targetPosition: 'G11' }]
};
assert('valid conditional', validateAction(validCond).valid === true);

// Invalid conditional
const badCond = { type: 'conditional', condition: {}, ifTrue: [] };
assert('invalid conditional', validateAction(badCond).valid === false);

if (process.exitCode) {
  console.error('Schema tests failed');
} else {
  console.log('All schema tests passed');
}

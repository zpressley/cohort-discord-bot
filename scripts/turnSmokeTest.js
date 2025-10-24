// scripts/turnSmokeTest.js
// Quick multi-turn smoke test without Discord. Runs a few turns and prints officer summaries.

const { processTurn } = require('../src/game/turnOrchestrator');
const { RIVER_CROSSING_MAP } = require('../src/game/maps/riverCrossing');
const { generateOfficerTurnSummary } = require('../src/ai/aiManager');

(async function main() {
  const map = RIVER_CROSSING_MAP;
  // Minimal battle object
  const battle = {
    id: 'smoke-battle',
    player1Id: 'P1',
    player2Id: 'P2',
    player1Culture: 'Roman Republic',
    player2Culture: 'Celtic Tribes',
    maxTurns: 3,
    currentTurn: 1,
    battleState: {
      weather: 'clear',
      terrain: map.terrain,
      player1: {
        culture: 'Roman Republic',
        unitPositions: [
          { unitId: 'north_unit_0', position: 'F6', currentStrength: 100, maxStrength: 100, mounted: false, qualityType: 'professional', primaryWeapon: { name: 'Roman Gladius' } },
          { unitId: 'north_unit_1', position: 'G6', currentStrength: 100, maxStrength: 100, mounted: false, qualityType: 'militia', primaryWeapon: { name: 'Spear (Professional)' } }
        ]
      },
      player2: {
        culture: 'Celtic Tribes',
        unitPositions: [
          { unitId: 'south_unit_0', position: 'P16', currentStrength: 100, maxStrength: 100, mounted: true, qualityType: 'professional', primaryWeapon: { name: 'Celtic Longsword' } },
          { unitId: 'south_unit_1', position: 'Q16', currentStrength: 100, maxStrength: 100, mounted: false, qualityType: 'militia', primaryWeapon: { name: 'Light Javelin' } }
        ]
      }
    }
  };

  const orders = [
    { p1: 'move to J11', p2: 'move to I17' },
    { p1: 'hold', p2: 'hold' },
    { p1: 'move south', p2: 'move north' }
  ];

  for (const step of orders) {
    const res = await processTurn(battle, step.p1, step.p2, map);
    if (!res.success) {
      console.error('Turn failed:', res.error, res.phase);
      process.exit(1);
    }
    const diffs = res.metrics?.diffs || { player1: [], player2: [] };
    const p1MovesTxt = diffs.player1.map(m => `${m.unitId}: ${m.from}→${m.to}`).join('\n');
    const p2MovesTxt = diffs.player2.map(m => `${m.unitId}: ${m.from}→${m.to}`).join('\n');

    const p1Officer = await generateOfficerTurnSummary({
      culture: battle.player1Culture,
      movesText: p1MovesTxt,
      combats: res.turnResults?.combats || 0,
      casualties: res.turnResults?.casualties?.player1 || 0,
      detectedEnemies: res.turnResults?.intelligence?.player1Detected || 0
    });
    const p2Officer = await generateOfficerTurnSummary({
      culture: battle.player2Culture,
      movesText: p2MovesTxt,
      combats: res.turnResults?.combats || 0,
      casualties: res.turnResults?.casualties?.player2 || 0,
      detectedEnemies: res.turnResults?.intelligence?.player2Detected || 0
    });

    console.log(`\n=== Turn ${battle.currentTurn} ===`);
    console.log('P1 officer:', p1Officer);
    console.log('P2 officer:', p2Officer);

    // Advance battle state
    battle.battleState = res.newBattleState;
    battle.currentTurn += 1;
  }

  console.log('\nSmoke test completed.');
})();

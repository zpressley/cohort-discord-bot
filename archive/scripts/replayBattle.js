// scripts/replayBattle.js (current code-020)
// Replay a battle by Battle ID: node scripts/replayBattle.js <battleId>

const { sequelize, models } = require('../src/database/setup');

(async function main() {
  try {
    const battleId = process.argv[2];
    if (!battleId) throw new Error('Usage: node scripts/replayBattle.js <battleId>');
    const battle = await models.Battle.findByPk(battleId, { include: ['turns'] });
    if (!battle) throw new Error('Battle not found');

    console.log(`Replaying battle ${battle.id} — scenario ${battle.scenario} (turns: ${battle.turns.length})`);
    for (const turn of battle.turns.sort((a,b)=>a.turnNumber-b.turnNumber)) {
      console.log(`\n=== Turn ${turn.turnNumber} ===`);
      console.log(`P1: ${turn.player1Command}`);
      console.log(`P2: ${turn.player2Command}`);
      console.log(`Summary:`, JSON.stringify(turn.combatResults || {}, null, 2));
      console.log(`Narrative:`, (turn.turnNarrative || '').slice(0, 400));
    }
    await sequelize.close();
  } catch (e) {
    console.error('Replay failed:', e.message);
    process.exit(1);
  }
})();

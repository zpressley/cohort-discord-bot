const { models } = require('./database/setup');

async function check() {
    const battle = await models.Battle.findByPk('9fec16be-c6de-4fa2-be0b-89956a946d8d');
    
    console.log('\n=== BATTLE ARMY DATA ===\n');
    console.log('Player 1 Culture:', battle.player1Culture);
    console.log('Player 2 Culture:', battle.player2Culture);
    
    console.log('\nPlayer 1 Army:', JSON.stringify(battle.battleState?.player1?.army, null, 2));
    console.log('\nPlayer 2 Army:', JSON.stringify(battle.battleState?.player2?.army, null, 2));
    
    process.exit(0);
}

check();
const { models } = require('./database/setup');

async function check() {
    // Get the most recent battle
    const battle = await models.Battle.findOne({
        where: {
            player1Id: '664280448788201522'
        },
        order: [['createdAt', 'DESC']]
    });
    
    if (!battle) {
        console.log('\n❌ No battles found\n');
        process.exit(0);
    }
    
    console.log('\n=== BATTLE ARMY DATA ===\n');
    console.log('Battle ID:', battle.id.substring(0, 8));
    console.log('Player 1 Culture:', battle.player1Culture);
    console.log('Player 2 Culture:', battle.player2Culture);
    
    console.log('\nPlayer 1 Army:', JSON.stringify(battle.battleState?.player1?.army, null, 2));
    console.log('\nPlayer 2 Army:', JSON.stringify(battle.battleState?.player2?.army, null, 2));
    
    // Also check Commander
    console.log('\n=== COMMANDER DATA ===\n');
    const commander = await models.Commander.findByPk('664280448788201522');
    console.log('Culture:', commander.culture);
    console.log('Has armyComposition:', commander.armyComposition !== null && commander.armyComposition !== undefined);
    if (commander.armyComposition) {
        console.log('Army units:', commander.armyComposition.units?.length || 0);
    }
    
    process.exit(0);
}

check();
const { models } = require('./database/setup');

async function check() {
    const battles = await models.Battle.findAll({
        where: { player1Id: '664280448788201522' },
        order: [['createdAt', 'DESC']],
        limit: 3
    });
    
    if (battles.length === 0) {
        console.log('No battles found');
        process.exit(0);
    }
    
    console.log(`\nLast ${battles.length} battles:\n`);
    
    battles.forEach(b => {
        console.log(`Battle ${b.id.substring(0, 8)}`);
        console.log(`  Status: ${b.status}`);
        console.log(`  Turn: ${b.currentTurn}`);
        console.log(`  Winner: ${b.winner || 'none'}`);
        console.log(`  P1 units: ${b.battleState?.player1?.unitPositions?.length || 0}`);
        console.log(`  P2 units: ${b.battleState?.player2?.unitPositions?.length || 0}\n`);
    });
    
    process.exit(0);
}

check();
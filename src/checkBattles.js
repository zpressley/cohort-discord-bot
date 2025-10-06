const { models } = require('./database/setup');

async function fix() {
    // Delete the stuck battle
    await models.Battle.destroy({
        where: {
            id: 'c2180a7b-6a05-43d0-87cd-c7e7b82c8c47'
        }
    });
    
    console.log('✅ Deleted stuck battle');
    
    // Show remaining battles
    const battles = await models.Battle.findAll({
        where: { player1Id: '664280448788201522' }
    });
    
    console.log(`\nRemaining battles: ${battles.length}`);
    battles.forEach(b => {
        console.log(`${b.id.substring(0, 8)} - ${b.status}`);
    });
    
    process.exit(0);
}

fix();
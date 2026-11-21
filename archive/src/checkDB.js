const setup = require('./database/setup');

async function checkUnitPositions() {
  try {
    const Battle = setup.models.Battle;
    
    await setup.sequelize.authenticate();
    console.log('✅ Database connected\n');
    
    // Get all battles ordered by update time
    const battles = await Battle.findAll({
      order: [['updatedAt', 'DESC']],
      limit: 10
    });
    
    console.log('Recent battles:');
    battles.forEach((b, i) => {
      console.log(`${i+1}. ${b.id.substring(0,8)} - ${b.status} - Turn ${b.currentTurn} - ${b.updatedAt}`);
    });
    
    // Get the most recently updated one
    const battle = battles[0];
    
    console.log('\n=== BATTLE STATE ===');
    console.log('Battle ID:', battle.id);
    console.log('Turn:', battle.currentTurn);
    console.log('Status:', battle.status);
    
    console.log('\n=== PLAYER 1 ===');
    console.log('Positions:', JSON.stringify(battle.battleState.player1.positions, null, 2));
    console.log('Army:', JSON.stringify(battle.battleState.player1.army, null, 2));
    
    console.log('\n=== PLAYER 2 ===');
    console.log('Positions:', JSON.stringify(battle.battleState.player2.positions, null, 2));
    console.log('Army:', JSON.stringify(battle.battleState.player2.army, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkUnitPositions();
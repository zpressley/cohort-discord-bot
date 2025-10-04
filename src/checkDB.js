// src/checkDb.js
const models = require('./database/setup');
const { Battle, Commander } = models;

async function check() {
    console.log('\n=== DATABASE CHECK ===\n');
    
    const battles = await Battle.findAll();
    console.log(`📊 Battles: ${battles.length}\n`);
    
    battles.forEach(b => {
        console.log(`Battle: ${b.id}`);
        console.log(`  Scenario: ${b.scenario}`);
        console.log(`  Player 1: ${b.player1Id} (${b.player1Culture})`);
        console.log(`  Player 2: ${b.player2Id || 'NULL - WAITING'}`);
        console.log(`  Status: ${b.status}\n`);
    });
    
    const commanders = await Commander.findAll();
    console.log(`👤 Commanders: ${commanders.length}\n`);
    
    commanders.forEach(c => {
        console.log(`Commander: ${c.discordId}`);
        console.log(`  Culture: ${c.culture}`);
        console.log(`  Has Army: ${c.armyComposition ? 'YES' : 'NO'}\n`);
    });
    
    process.exit(0);
}

check().catch(console.error);
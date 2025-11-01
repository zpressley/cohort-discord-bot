// src/game/briefingSystem.js
// AI-powered narrative briefing delivery

const { EmbedBuilder } = require('discord.js');
const { generateRichTextBriefing } = require('./briefingGenerator');
const { generateOpeningNarrative } = require('../ai/openingNarrative');
const { generateASCIIMap } = require('./maps/mapUtils');

async function sendInitialBriefings(battle, battleState, client) {
    const { models } = require('../database/setup');
    
    console.log('📬 Sending initial battle briefings...');
    
    try {
        const p1Commander = await models.Commander.findByPk(battle.player1Id);
        const p2Commander = await models.Commander.findByPk(battle.player2Id);
        
        const openingNarrative = await generateOpeningNarrative(battle, p1Commander, p2Commander);
        
        const p1Elite = await models.EliteUnit.findOne({ 
            where: { commanderId: battle.player1Id },
            include: [{ model: models.VeteranOfficer, as: 'officers' }]
        });
        const p2Elite = await models.EliteUnit.findOne({ 
            where: { commanderId: battle.player2Id },
            include: [{ model: models.VeteranOfficer, as: 'officers' }]
        });
        
        // Player 1
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            
            const openingEmbed = new EmbedBuilder()
                .setColor(0x8B0000)
                .setTitle('⚔️ THE BATTLE BEGINS')
                .setDescription(openingNarrative)
                .setFooter({ text: `Turn 1 of ${battle.maxTurns}` });
            
            await player1.send({ embeds: [openingEmbed] });
            
            const briefing = await generateRichTextBriefing(
                battleState, 'player1', p1Commander, p1Elite, 1,
                'Steel glints in morning light as your forces take their positions...'
            );
            await player1.send(briefing);
            
            const map = generateMapForPlayer(battleState, 'player1');
            await player1.send(`**BATTLEFIELD:**\n\`\`\`\n${map}\n\`\`\``);
            
            console.log('  ✅ Player 1 briefing sent');
        }
        
        // Player 2
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            
            const openingEmbed = new EmbedBuilder()
                .setColor(0x00008B)
                .setTitle('⚔️ THE BATTLE BEGINS')
                .setDescription(openingNarrative)
                .setFooter({ text: `Turn 1 of ${battle.maxTurns}` });
            
            await player2.send({ embeds: [openingEmbed] });
            
            const briefing = await generateRichTextBriefing(
                battleState, 'player2', p2Commander, p2Elite, 1,
                'Your commanders gather as dawn breaks over the battlefield...'
            );
            await player2.send(briefing);
            
            const map = generateMapForPlayer(battleState, 'player2');
            await player2.send(`**BATTLEFIELD:**\n\`\`\`\n${map}\n\`\`\``);
            
            console.log('  ✅ Player 2 briefing sent');
        }
        
        console.log('✅ Initial briefings complete');
        
    } catch (error) {
        console.error('Error sending initial briefings:', error);
        throw error;
    }
}

async function sendNextTurnBriefings(battle, battleState, client) {
    const { models } = require('../database/setup');
    
    try {
        const p1Commander = await models.Commander.findByPk(battle.player1Id);
        const p2Commander = await models.Commander.findByPk(battle.player2Id);
        const p1Elite = await models.EliteUnit.findOne({ 
            where: { commanderId: battle.player1Id },
            include: [{ model: models.VeteranOfficer, as: 'officers' }]
        });
        const p2Elite = await models.EliteUnit.findOne({ 
            where: { commanderId: battle.player2Id },
            include: [{ model: models.VeteranOfficer, as: 'officers' }]
        });
        
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            const briefing = await generateRichTextBriefing(
                battleState, 'player1', p1Commander, p1Elite, battle.currentTurn,
                getAtmosphericOpening(battle.currentTurn, battleState.weather)
            );
            await player1.send(briefing);
            
            const map = generateMapForPlayer(battleState, 'player1');
            await player1.send(`**BATTLEFIELD:**\n\`\`\`\n${map}\n\`\`\``);
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            const briefing = await generateRichTextBriefing(
                battleState, 'player2', p2Commander, p2Elite, battle.currentTurn,
                getAtmosphericOpening(battle.currentTurn, battleState.weather)
            );
            await player2.send(briefing);
            
            const map = generateMapForPlayer(battleState, 'player2');
            await player2.send(`**BATTLEFIELD:**\n\`\`\`\n${map}\n\`\`\``);
        }
        
        console.log(`✅ Turn ${battle.currentTurn} briefings sent`);
        
    } catch (error) {
        console.error('Error sending turn briefings:', error);
    }
}

function getAtmosphericOpening(turnNumber, weather) {
    const timeOfDay = turnNumber <= 3 ? 'dawn' : turnNumber <= 6 ? 'morning' : 'midday';
    const weatherDesc = weather?.type === 'rain' ? 'as rain begins to fall' : 'under clear skies';
    return `The ${timeOfDay} advances ${weatherDesc} as battle continues...`;
}

function generateMapForPlayer(battleState, playerSide) {
    const { generateEmojiMapViewport } = require('./maps/mapUtils');
    const playerData = battleState[playerSide];
    
    const getUnitsArray = (positions) => {
        if (!positions) return [];
        let units = Array.isArray(positions) ? positions : Object.values(positions);
        return units.filter(u => u && u.position && u.position.row !== undefined && u.position.col !== undefined);
    };
    
    const playerUnits = getUnitsArray(playerData.unitPositions);
    
    let centerRow = 10, centerCol = 10;
    if (playerUnits.length > 0) {
        centerRow = Math.floor(playerUnits.reduce((sum, u) => sum + u.position.row, 0) / playerUnits.length);
        centerCol = Math.floor(playerUnits.reduce((sum, u) => sum + u.position.col, 0) / playerUnits.length);
    }
    
    const view = {
        top: Math.max(0, centerRow - 7),
        left: Math.max(0, centerCol - 7),
        width: 15,
        height: 15
    };
    
    const mapData = {
        terrain: battleState.map?.terrain || require('./maps/riverCrossing').RIVER_CROSSING_MAP.terrain,
        player1Units: playerSide === 'player1' ? playerUnits : [],
        player2Units: playerSide === 'player1' ? getUnitsArray(playerData.visibleEnemyPositions) : playerUnits
    };
    
    return generateEmojiMapViewport(mapData, view);
}

module.exports = {
    sendInitialBriefings,
    sendNextTurnBriefings
};
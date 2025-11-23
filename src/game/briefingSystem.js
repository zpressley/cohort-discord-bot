// src/game/briefingSystem.js
// AI-powered narrative briefing delivery

const { EmbedBuilder } = require('discord.js');
const { generateRichTextBriefing, generateBattlefieldMapForBriefing } = require('./briefingGenerator');
const { generateOpeningNarrative } = require('../ai/openingNarrative');
const { generateASCIIMap } = require('./maps/mapUtils');
const { generateEmojiMapViewport, parseCoord } = require('./maps/mapUtils');

// Helper: send long text to a user, chunked to Discord's 2000-char limit
async function sendLongDM(user, content) {
    const MAX = 1900; // leave headroom
    if (!content || content.length <= MAX) {
        await user.send(content);
        return;
    }

    let remaining = content;
    while (remaining.length > 0) {
        let slice = remaining.slice(0, MAX);
        const lastNewline = slice.lastIndexOf('\n');
        if (lastNewline > 0) {
            slice = slice.slice(0, lastNewline);
        }
        await user.send(slice);
        remaining = remaining.slice(slice.length);
    }
}

async function sendInitialBriefings(battle, battleState, client) {
    const { models } = require('../database/setup');
    
    console.log('📬 Sending initial battle briefings...');
    
    try {
        const p1Commander = await models.Commander.findByPk(battle.player1Id);
        const p2Commander = await models.Commander.findByPk(battle.player2Id);
        const { ensureEliteOfficersForCommander } = require('./officers/eliteOfficerBootstrap');
        
        const p1Elite = await ensureEliteOfficersForCommander(battle.player1Id, p1Commander.culture);
        const p2Elite = await ensureEliteOfficersForCommander(battle.player2Id, p2Commander.culture);

        // Surface elite veteran levels into battleState for briefing use
        if (p1Elite) {
            battleState.player1.eliteVeteranLevel = p1Elite.veteranLevel || 'Recruit';
        }
        if (p2Elite) {
            battleState.player2.eliteVeteranLevel = p2Elite.veteranLevel || 'Recruit';
        }
        
        // Player 1
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            
            const rawBriefing = await generateRichTextBriefing(
                battleState, 'player1', p1Commander, p1Elite, 1,
                'Steel glints in morning light as your forces take their positions...'
            );

            const [p1Pre, p1Post] = rawBriefing.split('<<MAP_PLACEHOLDER>>');
            if (p1Pre && p1Pre.trim()) {
                await sendLongDM(player1, p1Pre.trimEnd());
            }

            const p1MapDisplay = await generateBattlefieldMapForBriefing(battleState, 'player1');
            const p1MapMessage = '🗺️ BATTLEFIELD\n```\n' + p1MapDisplay + '\n```\n*Use /map for different view*';
            await player1.send(p1MapMessage);

            if (p1Post && p1Post.trim()) {
                await sendLongDM(player1, p1Post.trimStart());
            }
            
            console.log('  ✅ Player 1 briefing sent');
        }


        // Player 2
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            
            const rawBriefing = await generateRichTextBriefing(
                battleState, 'player2', p2Commander, p2Elite, 1,
                'Your commanders gather as dawn breaks over the battlefield...'
            );

            const [p2Pre, p2Post] = rawBriefing.split('<<MAP_PLACEHOLDER>>');
            if (p2Pre && p2Pre.trim()) {
                await sendLongDM(player2, p2Pre.trimEnd());
            }

            const p2MapDisplay = await generateBattlefieldMapForBriefing(battleState, 'player2');
            const p2MapMessage = '🗺️ BATTLEFIELD\n```\n' + p2MapDisplay + '\n```\n*Use /map for different view*';
            await player2.send(p2MapMessage);

            if (p2Post && p2Post.trim()) {
                await sendLongDM(player2, p2Post.trimStart());
            }
            
            console.log('  ✅ Player 2 briefing sent');
        }


        console.log('✅ Initial briefings complete');
        
    } catch (error) {
        console.error('Error sending initial briefings:', error);
        throw error;
    }
}

async function sendNextTurnBriefings(battle, battleState, client, sideContext = {}) {
    const { models } = require('../database/setup');
    
    try {
        const p1Commander = await models.Commander.findByPk(battle.player1Id);
        const p2Commander = await models.Commander.findByPk(battle.player2Id);
        const { ensureEliteOfficersForCommander } = require('./officers/eliteOfficerBootstrap');
        
        const p1Elite = await ensureEliteOfficersForCommander(battle.player1Id, p1Commander.culture);
        const p2Elite = await ensureEliteOfficersForCommander(battle.player2Id, p2Commander.culture);

        if (p1Elite) battleState.player1.eliteVeteranLevel = p1Elite.veteranLevel || 'Recruit';
        if (p2Elite) battleState.player2.eliteVeteranLevel = p2Elite.veteranLevel || 'Recruit';
        
        if (battle.player1Id && !battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            const rawBriefing = await generateRichTextBriefing(
                battleState, 'player1', p1Commander, p1Elite, battle.currentTurn,
                null,
                (sideContext.player1 || {}).summary,
                (sideContext.player1 || {}).speaker
            );
            const [p1Pre, p1Post] = rawBriefing.split('<<MAP_PLACEHOLDER>>');
            if (p1Pre && p1Pre.trim()) {
                await sendLongDM(player1, p1Pre.trimEnd());
            }

            const p1MapDisplay = await generateBattlefieldMapForBriefing(battleState, 'player1');
            const p1MapMessage = '🗺️ BATTLEFIELD\n```\n' + p1MapDisplay + '\n```\n*Use /map for different view*';
            await player1.send(p1MapMessage);

            if (p1Post && p1Post.trim()) {
                await sendLongDM(player1, p1Post.trimStart());
            }
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            const rawBriefing = await generateRichTextBriefing(
                battleState, 'player2', p2Commander, p2Elite, battle.currentTurn,
                null,
                (sideContext.player2 || {}).summary,
                (sideContext.player2 || {}).speaker
            );
            const [p2Pre, p2Post] = rawBriefing.split('<<MAP_PLACEHOLDER>>');
            if (p2Pre && p2Pre.trim()) {
                await sendLongDM(player2, p2Pre.trimEnd());
            }

            const p2MapDisplay = await generateBattlefieldMapForBriefing(battleState, 'player2');
            const p2MapMessage = '🗺️ BATTLEFIELD\n```\n' + p2MapDisplay + '\n```\n*Use /map for different view*';
            await player2.send(p2MapMessage);

            if (p2Post && p2Post.trim()) {
                await sendLongDM(player2, p2Post.trimStart());
            }
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
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    const opponentData = battleState[opponentSide] || {};
    
    const getUnitsArray = (positions) => {
        if (!positions) return [];
        let units = Array.isArray(positions) ? positions : Object.values(positions);
        // Position can be string "H11" or object {row, col}
        return units.filter(u => u && u.position);
    };
    
    const playerUnits = getUnitsArray(playerData.unitPositions);
    
    let centerRow = 10, centerCol = 10;
    if (playerUnits.length > 0) {
        const positions = playerUnits.map(u => {
            const pos = typeof u.position === 'string' ? parseCoord(u.position) : u.position;
            return pos;
        }).filter(p => p);
        
        if (positions.length > 0) {
            centerRow = Math.floor(positions.reduce((sum, p) => sum + p.row, 0) / positions.length);
            centerCol = Math.floor(positions.reduce((sum, p) => sum + p.col, 0) / positions.length);
        }
    }
        
    const view = {
        top: Math.max(0, centerRow - 7),
        left: Math.max(0, centerCol - 7),
        width: 15,
        height: 15
    };

    // Enemies are stored as position strings; enrich with basic type flags so
    // the map can render correct emojis. We look up the real enemy unit at
    // that position (if any) and copy unitType/mounted/isElite.
    const enemyUnits = Array.isArray(opponentData.unitPositions)
        ? opponentData.unitPositions
        : (opponentData.unitPositions ? Object.values(opponentData.unitPositions) : []);

    const enemyPositionObjects = (playerData.visibleEnemyPositions || []).map(posStr => {
        const match = enemyUnits.find(u => u && u.position === posStr);
        return {
            position: posStr,
            side: opponentSide,
            unitType: match?.unitType,
            mounted: match?.mounted,
            isElite: match?.isElite,
            isCommander: match?.isCommander
        };
    });
        
    const mapData = {
        terrain: battleState.map?.terrain || require('./maps/riverCrossing').RIVER_CROSSING_MAP.terrain,
        player1Units: playerSide === 'player1' ? playerUnits : enemyPositionObjects,
        player2Units: playerSide === 'player2' ? playerUnits : enemyPositionObjects
    };

    const overlays = playerData.ghostPositions || [];
        
        console.log('GENERATING MAP FOR:', playerSide);
        console.log('  player1Units:', mapData.player1Units.length);
        console.log('  player2Units:', mapData.player2Units.length);
        console.log('  ghost overlays:', overlays.length);
    
        return generateEmojiMapViewport(mapData, view, overlays, playerSide);
}

module.exports = {
    sendInitialBriefings,
    sendNextTurnBriefings
};
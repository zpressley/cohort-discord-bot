// src/bot/briefing.js
// AI-powered narrative briefings — generation + delivery
// Merged from: briefingGenerator.js + briefingSystem.js

const { EmbedBuilder } = require('discord.js');
const { generateASCIIMap, generateEmojiMapViewport, calculateDistance, parseCoord } = require('../game/maps/mapUtils');
const { callGroqAI, generateOfficerDialogue, generateOfficerTurnSummary, generateOfficerResponse, getCulturalPersonality } = require('../ai/aiManager');
const { generateOpeningNarrative } = require('../ai/openingNarrative');

// ── BRIEFING GENERATION ────────────────────────────────────────────────────────

/**
 * Generate rich AI-powered briefing
 * Players should be able to play without map from this text alone
 */
async function generateRichTextBriefing(
    battleState,
    playerSide,
    commander,
    eliteUnit,
    turnNumber,
    atmosphericOpening,
    sideSummary = null,
    speaker = null
) {
    const playerData = battleState[playerSide];
    const cultureProfile = getCulturalPersonality(commander.culture || 'Roman Republic');
    const primaryOfficer = eliteUnit?.officers?.[0] || null;
    const officerName = primaryOfficer?.name || cultureProfile.officerName || 'Unit Commander';
    const veteranLevel = primaryOfficer?.battlesExperience || 0;

    const lines = [];

    // Header (compact for mobile)
    lines.push(`════ WAR COUNCIL — TURN ${turnNumber} ════`);

    // Turn-level battle report: use structured summary when available
    if (sideSummary) {
        const battleReport = generateSideBattleBrief(sideSummary);
        if (battleReport) {
            lines.push('');
            lines.push(battleReport.trim());
        }
    } else {
        // Fallback to older commander POV narrative
        try {
            const commanderNarrative = await generateCommanderTurnNarrativeForSide(
                battleState,
                playerSide,
                commander,
                turnNumber
            );
            if (commanderNarrative) {
                lines.push('');
                lines.push('TURN NARRATIVE');
                lines.push(commanderNarrative.trim());
            }
        } catch (err) {
            console.warn('Commander turn narrative failed:', err.message);
        }
    }

    lines.push('────────────────────');

    // YOUR FORCES section
    lines.push('YOUR FORCES');
    lines.push(formatUnitsSimple(playerData.unitPositions, battleState.map, playerData.eliteVeteranLevel));
    lines.push('────────────────────');

    // ENEMY INTELLIGENCE
    lines.push('🔍 INTELLIGENCE');

    let enemyIntel = playerData.intelMemory || playerData.visibleEnemyDetails || [];

    // Handle if it's an object instead of array
    if (!Array.isArray(enemyIntel)) {
        enemyIntel = Object.values(enemyIntel);
    }

    // Collapse per-unit intel into per-position summaries
    const summarizedIntel = summarizeIntelByPosition(enemyIntel);

    if (summarizedIntel.length === 0) {
        lines.push('  No enemy forces spotted');
    } else {
        const ghostSet = new Set(playerData.ghostPositions || []);

        summarizedIntel.forEach(intel => {
            const pos = intel.position;
            const terrain = getTerrainAtPosition(pos, battleState.map);
            const strength = getStrengthEstimate(intel);

            const isGhost = (!intel.seenThisTurn) || (intel.staleLevel && intel.staleLevel !== 'fresh');
            const isFresh = !!intel.seenThisTurn && (!intel.staleLevel || intel.staleLevel === 'fresh');

            let prefix = '';
            if (isGhost) {
                prefix = 'X';
            } else if (isFresh) {
                prefix = getEnemyIntelEmoji(intel);
            } else {
                prefix = '';
            }

            let lineHead = prefix
                ? `${prefix} [${pos}]`
                : `[${pos}]`;

            let line = `  ${lineHead} ${intel.unitType || 'infantry'} ${strength}`;

            if (intel.seenThisTurn || !intel.staleLevel || intel.staleLevel === 'fresh' || intel.staleLevel === 'stale') {
                line += ` (${terrain})`;
            }

            if (!intel.seenThisTurn || intel.staleLevel === 'stale' || intel.staleLevel === 'very_stale') {
                if (typeof intel.lastSeenTurn === 'number') {
                    line += ` — Last seen Turn ${intel.lastSeenTurn}`;
                }
            }

            if (intel.hasDeserted) {
                line += ' — DESERTED (mercenaries)';
            } else if (intel.isRouting) {
                line += ' — ROUTING!';
            }

            lines.push(line);
        });
    }

    lines.push('────────────────────');

    lines.push('<<MAP_PLACEHOLDER>>');

    lines.push('────────────────────');

    // OFFICER ASSESSMENT
    lines.push(`💬 ${officerName} reports`);

    const tacticalAssessment = await generateOfficerAssessment(
        playerData,
        commander.culture,
        officerName,
        veteranLevel,
        battleState.map,
        sideSummary,
        speaker
    );

    lines.push(`"${tacticalAssessment}"`);

    lines.push('════');
    lines.push('Type your orders to continue the battle');

    return lines.join('\n');
}

/**
 * Generate battlefield map for briefing (with proper centering)
 */
async function generateBattlefieldMapForBriefing(battleState, playerSide) {
    const { generateEmojiMapViewport: gEMV, parseCoord: pc } = require('../game/maps/mapUtils');
    const playerData = battleState[playerSide];
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    const opponentData = battleState[opponentSide] || {};

    const units = playerData.unitPositions || [];

    let centerRow = 10, centerCol = 10;

    if (units.length > 0) {
        const positions = units.map(u => {
            return typeof u.position === 'string' ? pc(u.position) : u.position;
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

    const enemyPositionObjects = (playerData.visibleEnemyPositions || []).map(posStr => ({
        position: posStr,
        side: playerSide === 'player1' ? 'player2' : 'player1'
    }));

    const enemyUnits = Array.isArray(opponentData.unitPositions)
        ? opponentData.unitPositions
        : (opponentData.unitPositions ? Object.values(opponentData.unitPositions) : []);

    const enrichedEnemies = enemyPositionObjects.map(e => {
        const match = enemyUnits.find(u => u && u.position === e.position);
        return {
            position: e.position,
            side: e.side,
            unitType: match?.unitType,
            mounted: match?.mounted,
            isElite: match?.isElite,
            isCommander: match?.isCommander
        };
    });

    const mapData = {
        terrain: battleState.map?.terrain || {},
        player1Units: playerSide === 'player1' ? units : enrichedEnemies,
        player2Units: playerSide === 'player2' ? units : enrichedEnemies
    };

    return gEMV(mapData, view, [], playerSide);
}

/**
 * Get unit icon matching map display
 */
function getUnitIcon(unit, isFriendly = true) {
    const color = isFriendly ? '🔵' : '🟠';

    if (unit.isElite) {
        return isFriendly ? '🔷' : '🔶';
    }

    if (unit.mounted || unit.type === 'cavalry') {
        return color;
    }

    return isFriendly ? '🟦' : '🟧';
}

/**
 * Format units with detailed info
 */
function formatUnitsSimple(units, map, eliteVeteranLevel) {
    return units.map(unit => {
        const icon = getUnitIcon(unit);
        const pos = unit.position;

        let unitName = unit.name || getUnitDescriptor(unit);

        if (unit.isElite && eliteVeteranLevel) {
            const tierLabelMap = {
                Recruit: 'Green Guard',
                Seasoned: 'Seasoned Guard',
                Veteran: 'Veteran Guard',
                'Elite Veteran': 'Elite Guard',
                Legendary: 'Legendary Guard'
            };
            const label = tierLabelMap[eliteVeteranLevel] || 'Elite Guard';
            unitName = label;
        }

        let weapon = unit.primaryWeapon?.name || 'Standard Arms';
        if (weapon.includes('(') && weapon.includes(')')) {
            const match = weapon.match(/(.+?)\s*\((.+?)\)/);
            if (match) {
                weapon = `${match[2]} ${match[1]}`;
            }
        }

        const terrain = getTerrainAtPosition(pos, map);

        const formationStatus = (unit.formationStatus || 'deployed').toLowerCase();
        let formationLabel;
        if (formationStatus === 'marching') formationLabel = 'Marching';
        else if (formationStatus === 'encamped') formationLabel = 'Encamped';
        else formationLabel = 'Deployed';

        let line = `${icon} [${pos}] ${unitName} — ${unit.currentStrength}`;

        if (unit.isRouting) {
            if ((unit.qualityType || '').toLowerCase() === 'veteran_mercenary' && unit.routingTarget === 'edge') {
                line += ' — ROUTING! (Deserting toward rear)';
            } else if (unit.routingTarget === 'camp' && unit.campPosition) {
                line += ` — ROUTING! (Falling back to camp at ${unit.campPosition})`;
            } else {
                line += ' — ROUTING!';
            }
        } else if (unit.isBroken) {
            if (unit.regroupedAtCamp && unit.campPosition) {
                line += ` — Shaken (Regrouped at camp ${unit.campPosition})`;
            } else {
                line += ' — Shaken';
            }
        }

        if (unit.activeMission?.status === 'active') {
            line += ` — To ${unit.activeMission.target}`;
        }

        line += ` (${terrain}, ${weapon}, ${formationLabel})`;

        return line;
    }).join('\n');
}

/**
 * Get unit descriptor based on equipment
 */
function getUnitDescriptor(unit) {
    if (unit.mounted) {
        if (unit.hasRanged) return 'Horse Archers';
        return 'Cavalry';
    }

    if (unit.hasRanged) {
        return 'Archers';
    }

    const armorType = unit.armor?.name || '';
    let base = 'Infantry';
    if (armorType.includes('Heavy')) base = 'Heavy Infantry';
    else if (armorType.includes('Medium')) base = 'Medium Infantry';

    const vb = unit.veteranBattles || 0;
    if (vb >= 10) return `Legendary ${base}`;
    if (vb >= 5) return `Veteran ${base}`;
    if (vb >= 2) return `Seasoned ${base}`;
    if (vb >= 1) return `Green ${base}`;
    return base;
}

/**
 * Generate a short, FOW-safe commander POV narrative for this side.
 */
async function generateCommanderTurnNarrativeForSide(battleState, playerSide, commander, turnNumber) {
    const playerData = battleState[playerSide] || {};
    const culture = commander.culture || 'Roman Republic';

    const weatherType = typeof battleState.weather === 'string'
        ? battleState.weather
        : (battleState.weather?.type || 'clear');

    const friendlyUnits = Array.isArray(playerData.unitPositions)
        ? playerData.unitPositions
        : (playerData.unitPositions ? Object.values(playerData.unitPositions) : []);

    const totalUnits = friendlyUnits.length;
    const routingUnits = friendlyUnits.filter(u => u.isRouting).length;
    const shakenUnits = friendlyUnits.filter(u => u.isBroken && !u.isRouting).length;
    const regroupedAtCamp = friendlyUnits.filter(u => u.regroupedAtCamp).length;

    let enemyContacts = [];
    if (Array.isArray(playerData.visibleEnemyDetails) && playerData.visibleEnemyDetails.length > 0) {
        enemyContacts = playerData.visibleEnemyDetails.filter(e => {
            if (!e) return false;
            if (e.seenThisTurn) return true;
            if (!e.staleLevel || e.staleLevel === 'fresh') return true;
            return false;
        });
    } else if (Array.isArray(playerData.intelMemory) && playerData.intelMemory.length > 0) {
        enemyContacts = playerData.intelMemory.filter(e => {
            if (!e) return false;
            if (e.seenThisTurn) return true;
            if (!e.staleLevel || e.staleLevel === 'fresh') return true;
            return false;
        });
    }

    const contactCount = enemyContacts.length;
    const ghostCount = Array.isArray(playerData.ghostPositions) ? playerData.ghostPositions.length : 0;

    const ourCenter = (() => {
        if (friendlyUnits.length === 0) return null;
        return friendlyUnits[0].position;
    })();

    const nearestEnemy = (() => {
        if (!enemyContacts.length) return null;
        const fresh = enemyContacts.filter(e => e.seenThisTurn);
        return (fresh[0] || enemyContacts[0]);
    })();

    const unitFacts = [];
    friendlyUnits.slice(0, 5).forEach(u => {
        const desc = getUnitDescriptor(u);
        const status = u.isRouting ? 'routing' : (u.isBroken ? 'shaken' : 'steady');
        const terrainHere = getTerrainAtPosition(u.position, battleState.map);
        unitFacts.push(
            `Unit ${u.unitId}: ${desc}, at ${u.position}, strength ${u.currentStrength}, status ${status}, terrain ${terrainHere}.`
        );
    });

    const hasMounted = friendlyUnits.some(u => u.mounted);

    const terrainSummary = (() => {
        if (!ourCenter) return 'You are currently positioned on open ground.';
        const here = getTerrainAtPosition(ourCenter, battleState.map);
        if (here === 'road') return 'You and your staff are positioned on the road, where it runs toward the river ford.';
        if (here === 'river') return 'You are standing near shallow water by the river crossing.';
        if (here === 'hill') return 'You stand on rising ground, looking down toward the approaches.';
        if (here === 'forest') return 'Your line stands among trees at the forest edge.';
        return 'Your line holds on relatively open ground.';
    })();

    const enemyGeometry = (() => {
        if (!nearestEnemy && ghostCount === 0) {
            return 'No enemy formations are directly visible this turn; only camp rumors speak of forces somewhere ahead.';
        }
        if (!nearestEnemy && ghostCount > 0) {
            return 'Old reports point to enemy forces somewhere beyond the visible field, but nothing concrete can be made out now.';
        }
        const terrainThere = getTerrainAtPosition(nearestEnemy.position, battleState.map);
        if (terrainThere === 'river') {
            return 'Scouts and front-rank soldiers can see enemy figures near the river crossing ahead, wading at the ford in shallow water.';
        }
        if (terrainThere === 'hill') {
            return 'There are shapes on the higher ground ahead, banners and figures moving along the ridge line.';
        }
        if (terrainThere === 'forest') {
            return 'Movement and banners flicker in and out of view at the tree line ahead.';
        }
        return 'Enemy banners and figures are visible somewhere along your front, but their exact depth and numbers remain unclear.';
    })();

    const safeSummary = [
        `Turn ${turnNumber}.`,
        terrainSummary,
        `Your army fields ${totalUnits} units this turn; ${routingUnits} routing, ${shakenUnits} shaken, ${regroupedAtCamp} regrouped at camp.`,
        hasMounted ? 'You have mounted troops able to act as scouts.' : 'You currently have no dedicated mounted scouts reporting back.',
        enemyGeometry
    ].join(' ');

    const prompt = [
        `You are the commanding general of a ${culture} army in an ancient warfare strategy game.`,
        `Write a vivid but concise narrative recap of THIS TURN from YOUR point of view, strictly in second person ("you", "your"). Never use "I".`,
        '',
        'SAFE FACTS (you may ONLY use these concrete details, combining them into flowing prose):',
        safeSummary,
        'Unit details (you may refer to these as "your infantry", "your cavalry", etc., but do NOT add new units):',
        ...unitFacts,
        '',
        'STRICT RULES:',
        '- Do NOT invent new units, numbers, locations, formations, or actions that are not in the SAFE FACTS above.',
        '- Focus on what the commander can see from the current line and what scouts/sentries report this turn.',
        '- For the enemy, you may describe them only in relation to terrain (e.g., near the ford, along the ridge), never using exact distances, grid references, or counts.',
        '- Do NOT describe giving new orders; describe only the current situation and what seems urgent or looming next.',
        '',
        'STYLE:',
        '- 2 short paragraphs, total 70–140 words.',
        '- Keep it tightly focused on battlefield geometry and unit state, not generic weather or mood.',
        '- Present tense, historically grounded tone, no modern slang, no emojis.',
    ].join('\n');

    const text = await generateOfficerResponse(prompt, 'groq');
    return text;
}

/**
 * Get terrain type at position
 */
function getTerrainAtPosition(position, map) {
    const pos = typeof position === 'string' ? parseCoord(position) : position;
    if (!pos || !map?.terrain) return 'plains';

    const terrain = map.terrain;

    if (terrain.forest?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'forest';
    }
    if (terrain.hill?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'hill';
    }
    if (terrain.marsh?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'marsh';
    }
    if (terrain.river?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'river';
    }
    if (terrain.road?.some(c => parseCoord(c)?.row === pos.row && parseCoord(c)?.col === pos.col)) {
        return 'road';
    }

    return 'plains';
}

async function generateOfficerAssessment(playerData, culture, officerName, veteranLevel, map, sideSummary = null, speaker = null) {
    const intelSnapshot = getOfficerIntelSnapshot(playerData, sideSummary);

    if (!sideSummary || !speaker) {
        const friendlyUnits = playerData.unitPositions || [];
        const visibleEnemies = playerData.visibleEnemyPositions || [];
        const moveSummary = friendlyUnits
            .map(u => `${u.unitId} at ${u.position}`)
            .slice(0, 5)
            .join('; ');

        const combats = 0;
        const casualties = 0;

        if (intelSnapshot.contactState !== 'live_contact' && combats === 0) {
            return buildNoContactOfficerLine(culture, intelSnapshot, moveSummary);
        }

        const context = {
            culture,
            movesText: moveSummary,
            combats,
            casualties,
            detectedEnemies: visibleEnemies.length
        };
        const shortLine = await generateOfficerTurnSummary(context, 'auto');
        return shortLine;
    }

    const insight = buildOfficerInsight(sideSummary, speaker);
    const combats = sideSummary.combat?.engagements?.length || 0;
    const casualties = sideSummary.combat?.ourTotalLosses || 0;

    if (intelSnapshot.contactState !== 'live_contact' && combats === 0) {
        const moveSummary = '';
        return buildNoContactOfficerLine(culture, intelSnapshot, moveSummary);
    }

    const context = {
        culture,
        movesText: '',
        combats,
        casualties,
        detectedEnemies: (sideSummary.enemyContacts || []).length,
        speakerName: speaker.name,
        speakerRole: speaker.role,
        personality: speaker.personalityArchetype,
        experienceLevel: speaker.experienceLevel,
        concern: insight.concern,
        recommendation: insight.recommendation,
        question: insight.question
    };

    const shortLine = await generateOfficerTurnSummary(context, 'auto');

    const heavyLosses = casualties >= 50;
    if (heavyLosses) {
        const eventPrompt = [
            `Turn with heavy losses (${casualties} warriors) and active contact state=${intelSnapshot.contactState}.`,
            intelSnapshot.contactState === 'live_contact'
                ? 'Enemy formations are visible this turn.'
                : 'No clear enemy formations visible; losses mostly from terrain, positioning, or ranged fire.',
            'Give 2-3 sentences of in-character assessment and concern, FOW-safe, no invented unit types or positions.'
        ].join(' ');

        try {
            const dialogue = await generateOfficerDialogue(speaker.name, culture, eventPrompt);
            return `${shortLine} ${dialogue}`;
        } catch (e) {
            console.warn('Officer extended dialogue failed:', e.message);
        }
    }

    return shortLine;
}

function getOfficerIntelSnapshot(playerData, sideSummary) {
    let freshContacts = 0;
    let ghostContacts = 0;

    if (sideSummary && Array.isArray(sideSummary.enemyContacts)) {
        freshContacts = sideSummary.enemyContacts.length;
    } else {
        const visible = Array.isArray(playerData.visibleEnemyPositions)
            ? playerData.visibleEnemyPositions.length
            : 0;
        freshContacts = visible;
    }

    if (Array.isArray(playerData.ghostPositions)) {
        ghostContacts = playerData.ghostPositions.length;
    }

    let contactState = 'none';
    if (freshContacts > 0) contactState = 'live_contact';
    else if (ghostContacts > 0) contactState = 'ghost_only';

    return {
        contactState,
        freshContacts,
        ghostContacts
    };
}

function buildNoContactOfficerLine(culture, intelSnapshot, moveSummary) {
    const c = (culture || '').toLowerCase();
    const moved = (moveSummary || '').length > 0;

    if (intelSnapshot.contactState === 'none') {
        if (c.includes('spartan')) {
            return moved
                ? 'Units maneuvered; no enemy in sight.'
                : 'All quiet. No enemy in sight.';
        }
        if (c.includes('roman')) {
            return moved
                ? 'Formation adjusted; scouts report no enemy contact this turn.'
                : 'All quiet, sir; scouts report no enemy contact.';
        }
        if (c.includes('celt')) {
            return moved
                ? 'The lads shift their line; still no sign of the foe ahead.'
                : 'Camp is quiet; no enemy shapes on the horizon.';
        }
        if (c.includes('han')) {
            return moved
                ? 'Columns reposition quietly; no enemy banners observed this turn.'
                : 'No enemy movement reported; lines hold in readiness.';
        }
        return moved
            ? 'Troops repositioned; no enemy contact reported.'
            : 'All quiet; no enemy contact reported.';
    }

    if (intelSnapshot.contactState === 'ghost_only') {
        if (c.includes('spartan')) {
            return 'Only old reports beyond the line; no enemy seen this turn.';
        }
        if (c.includes('roman')) {
            return 'Previous reports hint at forces ahead, but scouts see nothing concrete this turn.';
        }
        if (c.includes('celt')) {
            return 'Stories speak of warriors ahead, but today the mist shows nothing.';
        }
        if (c.includes('han')) {
            return 'Earlier sightings place the enemy farther ahead; current scouts report nothing visible.';
        }
        return 'Old reports suggest enemy ahead, but nothing can be seen this turn.';
    }

    return moved
        ? 'Units maneuvered; contact remains uncertain.'
        : 'Contact state unclear; no confirmed sightings this turn.';
}

function generateSideBattleBrief(summary) {
    const parts = [];

    if (summary.movements && summary.movements.length > 0) {
        const mv = summary.movements[0];
        parts.push(`Your ${mv.descriptor} moved from ${mv.from} to ${mv.to} (${mv.terrainFrom} → ${mv.terrainTo}).`);
    }

    if (summary.ownLine && summary.ownLine.length > 0) {
        const key = summary.ownLine[0];
        parts.push(`Your line now holds ${key.pos} on ${key.terrain}.`);
    }

    if (summary.enemyContacts && summary.enemyContacts.length > 0) {
        const first = summary.enemyContacts[0];
        const strengthText = first.estStrength ? `~${first.estStrength} warriors` : 'unknown strength';
        parts.push(`Enemy ${first.type} reported near ${first.pos} on ${first.terrain}, strength ${strengthText}.`);
    } else {
        parts.push('No enemy formations directly visible this turn.');
    }

    if (summary.combat && summary.combat.engagements.length > 0) {
        parts.push(
            `Engagements: ${summary.combat.engagements.length}, your losses ${summary.combat.ourTotalLosses}, ` +
            `enemy estimated losses ${summary.combat.enemyEstLosses}.`
        );
    }

    return parts.join(' ');
}

function buildOfficerInsight(sideSummary, speaker) {
    const archetype = (speaker.personalityArchetype || '').toLowerCase();
    const expLevel = (speaker.experienceLevel || 'Recruit').toLowerCase();

    const riverEngagement = (sideSummary.combat?.engagements || []).find(e => e.terrain === 'river');
    if (riverEngagement) {
        const concern = 'continuing to attack across the river ford into enemy cavalry';

        if (archetype.includes('cautious') || archetype.includes('formation') || archetype.includes('defensive')) {
            return {
                concern,
                recommendation: 'pull cavalry back from the ford; let infantry and missiles break their line or find another crossing',
                question: 'withdraw to regroup and seek better ground, or commit infantry in depth to force the ford?'
            };
        }

        if (archetype.includes('aggressive') || archetype.includes('strike') || archetype.includes('combat')) {
            return {
                concern,
                recommendation: 'commit fully at the ford now—infantry first, cavalry in support—before the enemy can reinforce',
                question: 'drive everything through this crossing now, or redirect forces to attempt a flank instead?'
            };
        }

        if (archetype.includes('scout') || archetype.includes('intelligence') || archetype.includes('raider')) {
            return {
                concern,
                recommendation: 'probe for alternate crossings while holding light troops at the ford to fix their cavalry in place',
                question: 'keep pressure here while a detachment searches another ford, or break contact entirely?'
            };
        }

        return {
            concern,
            recommendation: 'stop sending cavalry alone through the ford; either commit infantry in force or reposition',
            question: 'force the ford now or withdraw to seek another approach?'
        };
    }

    if (archetype.includes('aggressive') || archetype.includes('strike')) {
        return {
            concern: 'enemy line holding ahead',
            recommendation: 'press where their formation looks thinnest; use your strongest unit to break a hole, not spread them thin',
            question: 'commit to a decisive push now, or wait one more turn to tighten formation?'
        };
    }

    if (archetype.includes('cautious') || archetype.includes('defensive') || archetype.includes('formation')) {
        return {
            concern: 'maintaining formation and avoiding overextension',
            recommendation: 'hold current ground, tighten the line, and let scouts clarify enemy strength before advancing',
            question: 'stabilize here and gather more intelligence, or risk an advance without clear numbers?'
        };
    }

    if (archetype.includes('scout') || archetype.includes('intelligence') || archetype.includes('raider')) {
        return {
            concern: 'uncertain enemy numbers beyond visible contacts',
            recommendation: 'send light troops or cavalry to test their flanks while main body stays ready to exploit or withdraw',
            question: 'probe their flank now with a small detachment, or keep the entire force concentrated?'
        };
    }

    return {
        concern: 'enemy disposition ahead',
        recommendation: 'advance with caution and maintain cohesion while scouts probe',
        question: 'press the attack now or hold and observe?'
    };
}

/**
 * Cultural voice guidelines for AI
 */
function getCulturalVoice(culture) {
    const voices = {
        'Roman Republic': 'Speak formally and professionally. Use military terminology. Be precise and methodical.',
        'Celtic': 'Speak with passion and poetry. Reference spirits and honor. Be bold and direct.',
        'Han Dynasty': 'Speak with discipline and wisdom. Reference strategy and coordination. Be measured.',
        'Spartan City-State': 'Speak in terse, blunt statements. No flowery language. Direct and stoic.'
    };

    return voices[culture] || voices['Roman Republic'];
}

/**
 * Fallback if AI fails
 */
function generateFallbackAssessment(visibleEnemies, culture) {
    if (visibleEnemies.length === 0) {
        return `*"All quiet, Commander. No enemy contact. The men await your orders."*`;
    }

    const enemyClose = visibleEnemies.some(e => {
        return true;
    });

    if (culture === 'Spartan City-State') {
        return `*"Enemy sighted. We do not retreat."*`;
    }

    if (culture === 'Celtic') {
        return `*"Enemy spotted, Chief! The lads are eager for battle!"*`;
    }

    return `*"Enemy forces detected, Commander. Recommend we advance cautiously and maintain formation."*`;
}

/**
 * Get relative direction between two positions
 */
function getRelativeDirection(from, to) {
    const rowDiff = to.row.charCodeAt(0) - from.row.charCodeAt(0);
    const colDiff = to.col - from.col;

    let direction = '';
    if (rowDiff > 0) direction += 'south';
    if (rowDiff < 0) direction += 'north';
    if (colDiff > 0) direction += 'east';
    if (colDiff < 0) direction += 'west';

    return direction || 'nearby';
}

/**
 * Normalize intel unit type into simple buckets for display
 */
function normalizeIntelUnitType(intel) {
    const raw = (intel.unitType || '').toLowerCase();
    const isCav = intel.mounted || raw.includes('cavalry') || raw.includes('horse');
    const isElite = !!intel.isElite;

    if (isElite && isCav) return 'elite cavalry';
    if (isElite) return 'elite infantry';
    if (isCav) return 'cavalry';
    return 'infantry';
}

/**
 * Collapse per-unit intel into per-position aggregates with normalized types
 */
function summarizeIntelByPosition(enemyIntel) {
    const byPos = new Map();

    (enemyIntel || []).forEach(c => {
        if (!c || !c.position) return;
        const key = c.position;
        const existing = byPos.get(key) || {
            position: key,
            totalStrength: 0,
            infantryStrength: 0,
            cavalryStrength: 0,
            hasElite: false,
            staleLevel: c.staleLevel || 'fresh',
            lastSeenTurn: c.lastSeenTurn,
            isRouting: false,
            hasDeserted: false,
            quality: c.quality || 'low',
            seenThisTurn: false
        };

        const strength = typeof c.exactStrength === 'number'
            ? c.exactStrength
            : (typeof c.estimatedStrength === 'number' ? c.estimatedStrength : 0);

        existing.totalStrength += strength;

        const normType = normalizeIntelUnitType(c);
        if (normType.includes('cavalry')) {
            existing.cavalryStrength += strength;
        } else {
            existing.infantryStrength += strength;
        }

        if (c.isElite) existing.hasElite = true;
        if (c.isRouting) existing.isRouting = true;
        if (c.hasDeserted) existing.hasDeserted = true;
        if (c.seenThisTurn) existing.seenThisTurn = true;

        const staleRank = { fresh: 2, stale: 1, very_stale: 0 };
        const qRank = { high: 2, medium: 1, low: 0 };
        const cStale = c.staleLevel || 'fresh';
        if (staleRank[cStale] > staleRank[existing.staleLevel]) {
            existing.staleLevel = cStale;
            existing.lastSeenTurn = c.lastSeenTurn;
        }
        const cQual = c.quality || 'low';
        if (qRank[cQual] > qRank[existing.quality]) {
            existing.quality = cQual;
        }

        byPos.set(key, existing);
    });

    return Array.from(byPos.values()).map(entry => {
        const { totalStrength, infantryStrength, cavalryStrength, hasElite } = entry;
        const intel = { ...entry };

        let displayType;
        if (hasElite && cavalryStrength > 0) displayType = 'elite cavalry';
        else if (hasElite) displayType = 'elite infantry';
        else if (cavalryStrength > infantryStrength) displayType = 'cavalry';
        else displayType = 'infantry';

        intel.unitType = displayType;
        intel.exactStrength = totalStrength || undefined;
        intel.estimatedStrength = totalStrength || undefined;
        intel.seenThisTurn = !!entry.seenThisTurn;

        return intel;
    });
}

/**
 * Get enemy intel emoji based on unit type and elite status
 */
function getEnemyIntelEmoji(intel) {
    const type = (intel.unitType || '').toLowerCase();
    if (type.includes('elite') && type.includes('cavalry')) return '🔶';
    if (type.includes('elite')) return '🔶';
    if (type.includes('cavalry')) return '🟠';
    return '🟧';
}

/**
 * Get strength estimate based on intel quality
 */
function getStrengthEstimate(intel) {
    if (intel.quality === 'high') {
        if (typeof intel.exactStrength === 'number') {
            return `${intel.exactStrength} warriors`;
        }
        const approx = intel.estimatedStrength || 100;
        return `~${approx} warriors`;
    } else if (intel.quality === 'medium') {
        const base = intel.estimatedStrength || 100;
        const rounded = Math.round(base / 10) * 10;
        return `~${rounded} warriors`;
    } else {
        const strength = intel.estimatedStrength || 100;
        if (strength > 150) return 'Large force';
        if (strength > 75) return 'Medium force';
        return 'Small force';
    }
}

/**
 * Get quality indicator for intel
 */
function getQualityIndicator(quality) {
    if (quality === 'high') return '📍';
    if (quality === 'medium') return '👁️';
    return '🌫️';
}

// ── BRIEFING DELIVERY ──────────────────────────────────────────────────────────

// Helper: send long text to a user, chunked to Discord's 2000-char limit
async function sendLongDM(user, content) {
    const MAX = 1900;
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
        const { ensureEliteOfficersForCommander } = require('../game/officers/eliteOfficerBootstrap');

        const p1Elite = await ensureEliteOfficersForCommander(battle.player1Id, p1Commander.culture);
        const p2Elite = await ensureEliteOfficersForCommander(battle.player2Id, p2Commander.culture);

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
        const { ensureEliteOfficersForCommander } = require('../game/officers/eliteOfficerBootstrap');

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
    const { generateEmojiMapViewport: gEMV } = require('../game/maps/mapUtils');
    const playerData = battleState[playerSide];
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    const opponentData = battleState[opponentSide] || {};

    const getUnitsArray = (positions) => {
        if (!positions) return [];
        let units = Array.isArray(positions) ? positions : Object.values(positions);
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
        terrain: battleState.map?.terrain || require('../game/maps/mapUtils').RIVER_CROSSING_MAP.terrain,
        player1Units: playerSide === 'player1' ? playerUnits : enemyPositionObjects,
        player2Units: playerSide === 'player2' ? playerUnits : enemyPositionObjects
    };

    const overlays = playerData.ghostPositions || [];

    console.log('GENERATING MAP FOR:', playerSide);
    console.log('  player1Units:', mapData.player1Units.length);
    console.log('  player2Units:', mapData.player2Units.length);
    console.log('  ghost overlays:', overlays.length);

    return gEMV(mapData, view, overlays, playerSide);
}

module.exports = {
    generateRichTextBriefing,
    generateBattlefieldMapForBriefing,
    sendInitialBriefings,
    sendNextTurnBriefings
};

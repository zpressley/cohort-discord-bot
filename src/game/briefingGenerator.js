// src/game/briefingGenerator.js
// AI-powered narrative briefings (Gupta-style)

const { generateASCIIMap, calculateDistance, parseCoord } = require('./maps/mapUtils');
const { callGroqAI } = require('../ai/officerQA');
const { generateOfficerDialogue } = require('../ai/aiManager');

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
    const { getCulturalPersonality } = require('../ai/officerQA');
    const cultureProfile = getCulturalPersonality(commander.culture || 'Roman Republic');
    const primaryOfficer = eliteUnit?.officers?.[0] || null;
    const officerName = primaryOfficer?.name || cultureProfile.officerName || 'Unit Commander';
    const veteranLevel = primaryOfficer?.battlesExperience || 0;
    
    const lines = [];
    
    // Header (compact for mobile)
    lines.push(`════ WAR COUNCIL — TURN ${turnNumber} ════`);
    
    // Atmospheric opening disabled for now to avoid repetitive filler
    // (could be reintroduced later as a one-line tactical weather/terrain note)

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

    // Prefer persistent intel memory so we can surface ghost contacts and
    // "last seen" information. This is safe now that intel memory is keyed
    // per unit (not per tile) and summarized per position.
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

            // Determine prefix based on whether this is a current sighting or a ghost.
            // A contact is a ghost if we did not see it this turn (seenThisTurn=false)
            // or if its intel is marked stale/very_stale.
            const isGhost = (!intel.seenThisTurn) || (intel.staleLevel && intel.staleLevel !== 'fresh');
            const isFresh = !!intel.seenThisTurn && (!intel.staleLevel || intel.staleLevel === 'fresh');

            let prefix = '';
            if (isGhost) {
                prefix = 'X';        // Ghost contact
            } else if (isFresh) {
                prefix = getEnemyIntelEmoji(intel); // Live contact
            } else {
                prefix = '';         // Stale but not currently seen
            }

            let lineHead = prefix
                ? `${prefix} [${pos}]`
                : `[${pos}]`;

            let line = `  ${lineHead} ${intel.unitType || 'infantry'} ${strength}`;

            // Only include terrain when we have a reasonably current sense of where they are
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
    
    // BATTLEFIELD MAP placeholder; actual ASCII map is sent as its own
    // code-block message between the surrounding sections so layout is
    // stable and mobile-safe.
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
    const { generateEmojiMapViewport, parseCoord } = require('./maps/mapUtils');
    const playerData = battleState[playerSide];
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    const opponentData = battleState[opponentSide] || {};
    
    const units = playerData.unitPositions || [];
    
    // Calculate viewport centered on player units
    let centerRow = 10, centerCol = 10;
    
    if (units.length > 0) {
        const positions = units.map(u => {
            return typeof u.position === 'string' ? parseCoord(u.position) : u.position;
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
    
    // Build map data
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
    
    return generateEmojiMapViewport(mapData, view, [], playerSide);
}

/**
 * Get unit icon matching map display
 */
function getUnitIcon(unit, isFriendly = true) {
    const color = isFriendly ? '🔵' : '🟠';
    
    // Elite units get diamond
    if (unit.isElite) {
        return isFriendly ? '🔷' : '🔶';
    }
    
    // Mounted units get circle
    if (unit.mounted || unit.type === 'cavalry') {
        return color;
    }
    
    // Infantry (archer or melee) get square
    return isFriendly ? '🟦' : '🟧';
}

/**
 * Format units with detailed info
 * Format: [emoji][coords] Name (Weapon) - Size - Mission (Terrain)
 */
function formatUnitsSimple(units, map, eliteVeteranLevel) {
    return units.map(unit => {
        const icon = getUnitIcon(unit);
        const pos = unit.position; // String like "N4"
        
        // Get unit name (veteran name or descriptor)
        let unitName = unit.name || getUnitDescriptor(unit);

        // Surface elite veteran tier for the elite unit
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
        
        // Get main weapon and flip parenthetical format
        let weapon = unit.primaryWeapon?.name || 'Standard Arms';
        if (weapon.includes('(') && weapon.includes(')')) {
            const match = weapon.match(/(.+?)\s*\((.+?)\)/);
            if (match) {
                weapon = `${match[2]} ${match[1]}`; // "Self-Bow (Professional)" → "Professional Self-Bow"
            }
        }
        
        // Get terrain at position
        const terrain = getTerrainAtPosition(pos, map);
        
    // Build line: [emoji][coords] Name - Size (Weapon, Terrain/Mission)
    let line = `${icon} [${pos}] ${unitName} — ${unit.currentStrength}`;

        // Morale / routing state indicators
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
        
        // Only add mission if actively moving
        if (unit.activeMission?.status === 'active') {
            line += ` — To ${unit.activeMission.target}`;
        }
        
        line += ` (${terrain}, ${weapon})`;
        
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
    
    // Base descriptor from armor & type
    const armorType = unit.armor?.name || '';
    let base = 'Infantry';
    if (armorType.includes('Heavy')) base = 'Heavy Infantry';
    else if (armorType.includes('Medium')) base = 'Medium Infantry';

    // Overlay simple veteran tier for non-elite units using veteranBattles
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

    // Enemy contacts visible from this side's FOW-filtered intel
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

    // Derive simple geometry: average our position + nearest visible enemy
    const ourCenter = (() => {
        if (friendlyUnits.length === 0) return null;
        // use first unit as anchor for now
        return friendlyUnits[0].position;
    })();

    const nearestEnemy = (() => {
        if (!enemyContacts.length) return null;
        // prefer a fresh, seenThisTurn contact if possible
        const fresh = enemyContacts.filter(e => e.seenThisTurn);
        return (fresh[0] || enemyContacts[0]);
    })();

    // Build SAFE FACTS: explicit, minimal, FOW-safe details the model is allowed to use.
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

    const { generateOfficerResponse } = require('../ai/aiManager');
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
    
    // Check each terrain type
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
    const { generateOfficerTurnSummary } = require('../ai/aiManager');

    if (!sideSummary || !speaker) {
        // Fallback to simple summary if we don't have rich context yet
        const friendlyUnits = playerData.unitPositions || [];
        const visibleEnemies = playerData.visibleEnemyPositions || [];
        const moveSummary = friendlyUnits
            .map(u => `${u.unitId} at ${u.position}`)
            .slice(0, 5)
            .join('; ');

        const context = {
            culture,
            movesText: moveSummary,
            combats: 0,
            casualties: 0,
            detectedEnemies: visibleEnemies.length
        };
        const shortLine = await generateOfficerTurnSummary(context, 'auto');
        return `${officerName} reports: ${shortLine}`;
    }

    const insight = buildOfficerInsight(sideSummary, speaker);
    const context = {
        culture,
        movesText: '',
        combats: sideSummary.combat?.engagements?.length || 0,
        casualties: sideSummary.combat?.ourTotalLosses || 0,
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
    return `${speaker.name} (${speaker.role}): ${shortLine}`;
}

function generateSideBattleBrief(summary) {
    const parts = [];

    // Single, compact text block focused on what changed and what matters now.
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
        // Base concern is the same; personality changes recommendation and framing.
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

        // Default ford advice
        return {
            concern,
            recommendation: 'stop sending cavalry alone through the ford; either commit infantry in force or reposition',
            question: 'force the ford now or withdraw to seek another approach?'
        };
    }

    // Non-river generic insight, modulated by archetype
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

    // Experience can harden tone later; for now we keep the same structure and
    // let the AI prompt use experienceLevel for voice.
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
        // Simplified distance check
        return true; // Assume close for fallback
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

        // Use freshest/strongest intel for staleness and quality
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

        // Decide display type
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
    return '🟧'; // infantry/archers
}

/**
 * Get strength estimate based on intel quality
 */
function getStrengthEstimate(intel) {
    if (intel.quality === 'high') {
        // At very close range we should have effectively exact counts
        if (typeof intel.exactStrength === 'number') {
            return `${intel.exactStrength} warriors`;
        }
        // Otherwise treat as very tight estimate
        const approx = intel.estimatedStrength || 100;
        return `~${approx} warriors`;
    } else if (intel.quality === 'medium') {
        // Single rounded estimate instead of a range to keep lines tight
        const base = intel.estimatedStrength || 100;
        const rounded = Math.round(base / 10) * 10; // e.g. 83 → 80
        return `~${rounded} warriors`;
    } else {
        // Vague description only
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
    if (quality === 'high') return '📍'; // Close range, accurate
    if (quality === 'medium') return '👁️'; // Medium range, estimated
    return '🌫️'; // Long range, uncertain
}


module.exports = {
    generateRichTextBriefing,
    generateBattlefieldMapForBriefing
};

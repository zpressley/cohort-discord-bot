// src/game/orderFeedback.js
// Provide clear feedback on player orders and (optionally) friendly-fire warnings
// Version: 1.1.0

/**
 * Generate feedback for player showing what was understood
 * @param {Array} validatedActions - Parsed and validated actions
 * @param {string} originalOrder - Original order text
 * @returns {string} Formatted feedback message
 */
async function generateOrderFeedback(validatedActions, originalOrder, options = {}) {
    const units = options.units || [];
    const culture = options.culture || 'Roman';

    if (!validatedActions || validatedActions.length === 0) {
        return generateNoActionsFoundFeedback(originalOrder);
    }
    
    // Build phrases like "archers to [E4], cavalry to [D3] to support swordsmen at [D6]"
    const phrases = [];
    const pickLabel = (u) => {
        if (!u) return 'units';
        const primary = (u.primaryWeapon?.name || '').toLowerCase();
        if (primary.includes('bow') || primary.includes('sling')) return 'archers';
        if (u.mounted) return 'cavalry';
        return 'swordsmen';
    };

    const unitById = Object.fromEntries(units.map(u => [u.unitId, u]));

    for (const action of validatedActions) {
        if (action.type === 'move') {
            const u = unitById[action.unitId];
            const label = pickLabel(u);
            const engage = action.modifier?.engage ? ' to attack' : '';
            phrases.push(`${label} to [${action.targetPosition}]${engage}`);
        } else if (action.type === 'attack') {
            const u = unitById[action.unitId];
            const label = pickLabel(u);
            const target = action.targetPosition || action.target || 'target';
            phrases.push(`${label} attack at [${target}]`);
        } else if (action.type === 'formation') {
            const u = unitById[action.unitId];
            const label = pickLabel(u);
            phrases.push(`${label} form ${action.formationType}`);
        } else if (action.type === 'hold') {
            const u = unitById[action.unitId];
            const label = pickLabel(u);
            phrases.push(`${label} hold position`);
        }
    }

    // Join phrases into a readable summary
    const text = phrases.length === 0
      ? `No actionable orders parsed from: "${originalOrder}"`
      : phrases.length === 1
        ? phrases[0]
        : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;

    try {
        const { generateOrderAcknowledgement } = require('../ai/aiManager');
        const ack = await generateOrderAcknowledgement({ culture, phrases: text });
        return `Orders:\n\n"${ack}"`;
    } catch {
        return `Orders:\n\n"Yes, sir: ${text}."`;
    }
}

/**
 * Generate feedback when no valid actions found
 */
function generateNoActionsFoundFeedback(originalOrder) {
    let feedback = '⚠️ **Unable to Understand Orders**\n\n';
    feedback += `Your order: "${originalOrder}"\n\n`;
    feedback += '**Suggestions:**\n';
    feedback += '- Use clear commands: "move to P16", "attack Q16", "hold position"\n';
    feedback += '- Specify units: "northern units advance", "all units move south"\n';
    feedback += '- Check the map for valid positions\n\n';
    feedback += '**Examples:**\n';
    feedback += '• "advance to the ford"\n';
    feedback += '• "cavalry flank east"\n';
    feedback += '• "infantry hold, archers target enemy"\n';
    feedback += '• "all units attack"\n\n';
    feedback += 'Try rephrasing your order or use `/battle-status` to see your current situation.';
    
    return feedback;
}

/**
 * Format unit ID to readable name
 */
function formatUnitName(unitId) {
    if (!unitId) return 'Unknown Unit';
    
    // Convert "north_unit_0" to "Northern Unit 1"
    const parts = unitId.split('_');
    const direction = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const number = parseInt(parts[2]) + 1; // 0-indexed to 1-indexed
    
    return `${direction} Unit ${number}`;
}

/**
 * Generate feedback for ambiguous orders
 */
function generateAmbiguousFeedback(order, possibleInterpretations) {
    let feedback = '❓ **Order Unclear - Multiple Interpretations Possible**\n\n';
    feedback += `Your order: "${order}"\n\n`;
    feedback += '**Did you mean:**\n';
    
    possibleInterpretations.forEach((interpretation, index) => {
        feedback += `${index + 1}. ${interpretation}\n`;
    });
    
    feedback += '\nPlease clarify your order.';
    
    return feedback;
}

/**
 * Generate a friendly-fire warning for a high-risk ranged attack.
 * This is UX-only: it does not change mechanics, only messaging & confirmation.
 *
 * @param {Object} rangedValidation - validateRangedAttack() result
 * @param {Object} shooter - shooting unit (from battleState)
 * @param {string} culture - player's culture name
 * @returns {Object|null} { requiresConfirmation, warning, risk, options[] } or null
 */
function generateFriendlyFireWarning(rangedValidation, shooter, culture) {
    if (!rangedValidation || !rangedValidation.friendlyFireRisk) return null;

    const ffRisk = rangedValidation.friendlyFireRisk;
    if (!ffRisk || typeof ffRisk.risk !== 'number') return null;

    // Only warn when risk is meaningful (> 20%)
    if (ffRisk.risk < 0.2) {
        return null;
    }

    const riskPercent = Math.round(ffRisk.risk * 100);
    const enemyShare = Math.round((1 - ffRisk.risk) * 100);
    const friendlyShare = riskPercent;

    const officerName = getOfficerName(shooter, culture);
    const warningText = buildCulturalWarning(
        officerName,
        culture,
        riskPercent,
        enemyShare,
        friendlyShare,
        ffRisk.friendlyUnitsAtRisk || []
    );

    return {
        requiresConfirmation: true,
        warning: warningText,
        risk: ffRisk,
        options: [
            { id: 'confirm', label: '✓ Fire Anyway', value: 'proceed' },
            { id: 'cancel', label: '✗ Hold Fire', value: 'cancel' },
            { id: 'reposition', label: '📍 Reposition First', value: 'suggest_movement' }
        ]
    };
}

function buildCulturalWarning(officer, culture, risk, enemyDmg, friendlyDmg, friendlyUnits) {
    const base = {
        'Roman Republic':
            `⚠️ **${officer} reports:**\n\n` +
            `"Commander, the enemy is locked in melee with our troops. Firing now will strike both sides:\n` +
            `• ~${enemyDmg}% of this volley will hit the enemy.\n` +
            `• ~${friendlyDmg}% may fall among our own men.\n\n` +
            `Do you wish to proceed?"`,

        'Celtic':
            `⚠️ **${officer} shouts:**\n\n` +
            `"Chieftain! Our brothers are mixed with the foe! Your arrows will drink friendly blood as well as theirs:\n` +
            `• Enemy struck: ~${enemyDmg}%.\n` +
            `• Our warriors at risk: ~${friendlyDmg}%.\n\n` +
            `What is your command?"`,

        'Han Dynasty':
            `⚠️ **${officer} bows:**\n\n` +
            `"Honorable Commander, our soldiers are engaged in close combat. The manuals warn against such shots:\n` +
            `• Expected harm to the enemy: ~${enemyDmg}%.\n` +
            `• Expected harm to our own: ~${friendlyDmg}%.\n\n` +
            `Your decision will be remembered."`,

        default:
            `⚠️ **${officer}:**\n\n` +
            `"Commander, we would be shooting into our own melee. This volley is likely to hit BOTH sides:\n` +
            `• Enemy: ~${enemyDmg}% of hits.\n` +
            `• Friendly: ~${friendlyDmg}% of hits.\n\n` +
            `Proceed?"`
    };

    return base[culture] || base.default;
}

function getOfficerName(unit, culture) {
    if (unit && unit.officerName) return unit.officerName;

    const defaults = {
        'Roman Republic': 'Centurion Marcus',
        'Celtic': 'Brennus',
        'Han Dynasty': 'General Wei',
        'Spartan City-State': 'Lochagos',
        'Macedonian Kingdoms': 'Phalangarch',
        'Sarmatian Confederations': 'Khan',
        'Berber Confederations': 'Amghar',
        'Kingdom of Kush': 'Master Archer'
    };

    return defaults[culture] || 'Officer';
}

module.exports = {
    generateOrderFeedback,
    generateNoActionsFoundFeedback,
    generateAmbiguousFeedback,
    formatUnitName,
    generateFriendlyFireWarning
};

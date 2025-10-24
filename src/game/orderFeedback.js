// src/game/orderFeedback.js
// Provide clear feedback on player orders
// Version: 1.0.0

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

module.exports = {
    generateOrderFeedback,
    generateNoActionsFoundFeedback,
    generateAmbiguousFeedback,
    formatUnitName
};
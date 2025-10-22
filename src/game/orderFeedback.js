// src/game/orderFeedback.js
// Provide clear feedback on player orders
// Version: 1.0.0

/**
 * Generate feedback for player showing what was understood
 * @param {Array} validatedActions - Parsed and validated actions
 * @param {string} originalOrder - Original order text
 * @returns {string} Formatted feedback message
 */
function generateOrderFeedback(validatedActions, originalOrder) {
    if (!validatedActions || validatedActions.length === 0) {
        return generateNoActionsFoundFeedback(originalOrder);
    }
    
    let feedback = '✅ **Orders Understood:**\n\n';
    
    validatedActions.forEach((action, index) => {
        if (action.type === 'move') {
            const unitName = formatUnitName(action.unitId);
            feedback += `${index + 1}. Move **${unitName}** to **${action.targetPosition}**\n`;
            
            if (action.validation && !action.validation.valid) {
                feedback += `   ⚠️ ${action.validation.reason}\n`;
            }
        } else if (action.type === 'attack') {
            const unitName = formatUnitName(action.unitId);
            feedback += `${index + 1}. **${unitName}** attacks **${action.target}**\n`;
        } else if (action.type === 'formation') {
            const unitName = formatUnitName(action.unitId);
            feedback += `${index + 1}. **${unitName}** forms **${action.formationType}**\n`;
        } else if (action.type === 'hold') {
            const unitName = formatUnitName(action.unitId);
            feedback += `${index + 1}. **${unitName}** holds position\n`;
        } else {
            feedback += `${index + 1}. ${action.type} - ${action.description || 'Unknown action'}\n`;
        }
    });
    
    feedback += '\n*Waiting for enemy response...*';
    
    return feedback;
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
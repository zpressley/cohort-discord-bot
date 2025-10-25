// src/game/briefingFormatters.js
// Natural language formatters for briefings

/**
 * Get unit type emoji for ENEMY units (orange)
 */
function getUnitTypeEmoji(unitClass) {
    const emojis = {
        'infantry': '🟧',        // Orange square - enemy infantry
        'heavy_infantry': '🟧',  // Orange square - enemy heavy infantry
        'archers': '🟧',         // Orange square - enemy archers
        'cavalry': '🟠',         // Orange circle - enemy cavalry
        'light_cavalry': '🟠',   // Orange circle - enemy cavalry
        'elite': '🔶',           // Orange diamond - enemy elite
        'unknown': '🟫'          // Brown square - unknown
    };
    
    const normalized = (unitClass || 'unknown').toLowerCase().replace(/\s+/g, '_');
    return emojis[normalized] || '🟧';
}

/**
 * Get unit type emoji for YOUR units (blue)
 */
function getFriendlyUnitEmoji(unit) {
    if (unit.isElite) return '🔷';  // Blue diamond - your elite
    
    if (unit.mounted || unit.type === 'cavalry') {
        return '🔵';  // Blue circle - your cavalry
    }
    
    // Infantry, archers, everything else
    return '🟦';  // Blue square - your units
}



/**
 * Format strength estimate
 */
function formatStrengthEstimate(strength, detailLevel) {
    if (!strength || strength === 'unknown') {
        return 'size unclear';
    }
    
    if (detailLevel === 'high') {
        return `${strength} warriors`;
    }
    
    if (detailLevel === 'medium') {
        return `around ${strength} men`;
    }
    
    // Low detail
    if (typeof strength === 'number') {
        if (strength < 50) return 'small force';
        if (strength < 100) return 'medium force';
        return 'large force';
    }
    
    return strength;
}

/**
 * Format position confidence
 */
function formatIntelConfidence(detailLevel, turnsSinceObserved) {
    const isStale = turnsSinceObserved > 2;
    
    if (detailLevel === 'high') {
        return isStale ? 'last seen at' : 'at';
    }
    
    if (detailLevel === 'medium') {
        return isStale ? 'last seen around' : 'around';
    }
    
    // Low detail
    return isStale ? 'spotted near' : 'detected near';
}

module.exports = {
    getUnitTypeEmoji,           // For enemy intel (orange)
    getFriendlyUnitEmoji,       // For your forces (blue)
    formatStrengthEstimate,
    formatIntelConfidence
};
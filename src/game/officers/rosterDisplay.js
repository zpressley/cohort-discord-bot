// src/game/officers/rosterDisplay.js
// Format officer roster for Discord display

/**
 * Format officer roster for Discord
 */
function formatOfficerRoster(officers) {
    if (officers.length === 0) {
        return '**💬 Officer Roster:**\n\n' +
               '*No veteran officers yet. Units gain named officers after 3 battles.*\n\n' +
               '*Continue fighting to build veteran experience!*';
    }
    
    const lines = officers.map(o => {
        const statusIcon = o.status === 'broken' ? '💔' : '✅';
        const advisorBadge = o.canAdvise ? ' 🧠' : '';
        const veteranBadge = o.veteranLevel === 'legendary' ? ' ⭐' : '';
        
        return `   ${statusIcon} **${o.fullTitle}** (${o.unitName}) - ${o.battles} battles${advisorBadge}${veteranBadge}`;
    });
    
    const hasAdvisors = officers.some(o => o.canAdvise);
    const hasLegends = officers.some(o => o.veteranLevel === 'legendary');
    
    let footer = '\n\n';
    if (hasLegends) footer += '⭐ = *Legendary (11+ battles) - brilliant strategic insight*\n';
    if (hasAdvisors) footer += '🧠 = *Veteran (6+ battles) - provides tactical advice*\n';
    footer += '\n*Ask questions: "Marcus, what about that cavalry?" or "ask Cassius about the ford"*';
    
    return `**💬 Officer Roster:**\n\n${lines.join('\n')}${footer}`;
}

/**
 * Format officers for briefing (compact version)
 */
function formatOfficersForBriefing(officers) {
    if (officers.length === 0) return null;
    
    const lines = officers.map(o => {
        const badge = o.canAdvise ? '🧠' : '📋';
        return `${badge} ${o.fullTitle} - ${o.battles} battles`;
    });
    
    return lines.join('\n');
}

module.exports = {
    formatOfficerRoster,
    formatOfficersForBriefing
};
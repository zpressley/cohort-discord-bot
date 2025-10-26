// src/game/officers/namingSystem.js
// Officer name assignment and persistence

const { generateOfficerName } = require('./culturalNames');

/**
 * Assign officer names to units that reached Battle 3
 * Names are generated once and persist across all future battles
 */
function assignOfficerNames(units, culture) {
    return units.map(unit => {
        const battles = unit.veteranBattles || 0;
        
        // Assign name at exactly Battle 3 (not before, not after)
        if (battles === 3 && !unit.officerName) {
            const officer = generateOfficerName(unit, culture);
            
            console.log(`  👤 ${unit.unitId} earned officer: ${officer.fullTitle}`);
            
            return {
                ...unit,
                officerName: officer.name,
                officerPosition: officer.position,
                officerFullTitle: officer.fullTitle,
                officerAssignedBattle: battles
            };
        }
        
        // Keep existing name if already assigned
        return unit;
    });
}

/**
 * Get officer for specific unit
 */
function getOfficerForUnit(unit, culture) {
    // Return saved officer if exists
    if (unit.officerName) {
        return {
            name: unit.officerName,
            position: unit.officerPosition,
            fullTitle: unit.officerFullTitle,
            battles: unit.veteranBattles || 0,
            canAdvise: (unit.veteranBattles || 0) >= 6,
            memories: unit.institutionalMemory || []
        };
    }
    
    // No officer yet
    return {
        name: 'Unit Commander',
        position: 'Commander',
        fullTitle: 'Unit Commander',
        battles: unit.veteranBattles || 0,
        canAdvise: false,
        memories: []
    };
}

/**
 * Get officer roster for player
 */
function getOfficerRoster(battleState, playerSide) {
    const units = battleState[playerSide]?.unitPositions || [];
    
    const officers = units
        .filter(u => u.officerName)  // Only named officers
        .map(u => ({
            name: u.officerName,
            position: u.officerPosition,
            fullTitle: u.officerFullTitle,
            unitId: u.unitId,
            unitName: u.customName || getDefaultUnitName(u),
            battles: u.veteranBattles || 0,
            veteranLevel: getVeteranLevel(u.veteranBattles || 0),
            location: u.position,
            strength: `${u.currentStrength}/${u.maxStrength}`,
            morale: u.morale || 100,
            status: u.isBroken ? 'broken' : 'active',
            canAdvise: (u.veteranBattles || 0) >= 6
        }));
    
    return officers;
}

/**
 * Find officer by name in roster
 */
function findOfficerByName(nameQuery, officers) {
    const lower = nameQuery.toLowerCase();
    
    // Try exact name match
    let match = officers.find(o => 
        o.name.toLowerCase() === lower
    );
    if (match) return match;
    
    // Try partial name
    match = officers.find(o => 
        o.name.toLowerCase().includes(lower)
    );
    if (match) return match;
    
    // Try full title
    match = officers.find(o => 
        o.fullTitle.toLowerCase().includes(lower)
    );
    
    return match || null;
}

function getVeteranLevel(battles) {
    if (battles >= 11) return 'legendary';
    if (battles >= 6) return 'elite_veteran';
    if (battles >= 3) return 'veteran';
    if (battles >= 1) return 'seasoned';
    return 'recruit';
}

function getDefaultUnitName(unit) {
    if (unit.isElite) return 'Elite Guard';
    if (unit.type === 'cavalry' || unit.mounted) return 'Cavalry';
    if (unit.type === 'archers' || unit.hasRanged) return 'Archers';
    return 'Infantry';
}

module.exports = {
    assignOfficerNames,
    getOfficerForUnit,
    getOfficerRoster,
    findOfficerByName,
    getVeteranLevel
};
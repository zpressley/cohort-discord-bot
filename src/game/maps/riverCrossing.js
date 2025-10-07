// src/game/maps/riverCrossing.js
// River Crossing scenario - 15x15 grid tactical map

const { generateASCIIMap } = require('./mapUtils');

const RIVER_CROSSING_MAP = {
    name: 'Snake River Crossing',
    size: { rows: 15, cols: 15 },
    
    // Terrain definitions by coordinate
    terrain: {
        // Snake River running diagonally across map
        river: [
            'E3','F3','F4','G4','G5','H5','H6','I6','I7','H7','H8',
            'G8','G9','F9','F10','E10','E11','D11','D12','C12','C13','B13'
        ],
        
        // Crossing points (fords where river can be crossed)
        fords: [
            { coord: 'F11', name: 'Bridge Ford', width: 1 }, // Southern ford near bridge
            { coord: 'H11', name: 'Northern Ford', width: 1 } // Northern ford
        ],
        
        // Hill providing elevation advantage
        hill: ['B5', 'B6', 'C5', 'C6'], // Northwestern hill
        
        // Marsh terrain (movement penalty)
        marsh: [
            'M13','M14','M15','N13','N14','N15','O13','O14','O15',
            'L14','L15'
        ],
        
        // Main road (faster movement)
        road: [
            'H1','H2','H3','H4','H5','H6','H7','H8','H9','H10',
            'H11','H12','H13','H14','H15'
        ],
        
        // Light forest (cover bonus)
        forest: [
            'I2','I3','J2','J3','K2','K3', // Eastern woods
            'A8','A9','B8','B9','A10','B10' // Western woods
        ]
    },
    
    // Starting deployment zones for each side
    deployment: {
        north: {
            name: 'North Army Deployment',
            coords: ['B1','C1','D1','E1','B2','C2','D2','E2','B3','C3','D3'],
            description: 'Northern approach to the Snake River'
        },
        south: {
            name: 'South Army Deployment',
            coords: ['K9','L9','M9','N9','K10','L10','M10','N10','L11','M11'],
            description: 'Southern highlands near the marsh'
        }
    },
    
    // Movement costs per terrain type
    movementCosts: {
        plains: 1.0,      // Standard movement
        road: 0.5,        // 2x speed on road
        hill: 1.5,        // Slower uphill
        forest: 2.0,      // Dense vegetation
        marsh: 3.0,       // Very slow through swamp
        river: 999        // Impassable except at fords
    },
    
    // Tactical modifiers based on terrain
    combatModifiers: {
        hill: { 
            defense: +2,      // High ground advantage
            missileRange: +1  // Better shooting from elevation
        },
        forest: {
            defense: +2,           // Cover bonus
            ambushBonus: +4,       // Ambush attacks
            formationPenalty: -3,  // Can't maintain formations
            cavalryPenalty: -4     // Horses ineffective
        },
        marsh: {
            movementPenalty: -3,   // Slow movement
            formationPenalty: -3,  // Unstable ground
            heavyArmorPenalty: -2  // Sinking
        },
        ford: {
            crossingPenalty: -4,   // Vulnerable during crossing
            defenderBonus: +3,     // Defender advantage
            maxWidth: 3            // Only 3 units can fight
        },
        road: {
            formationBonus: +1,    // Easy coordination
            noMovementPenalty: true
        }
    },
    
    // Victory conditions specific to this scenario
    objectives: {
        primary: 'Control both fords for 3 consecutive turns OR destroy enemy army',
        secondary: 'Control the hill for artillery advantage',
        
        controlPoints: [
            { coord: 'F11', name: 'Bridge Ford', controlRadius: 1 },
            { coord: 'H11', name: 'Northern Ford', controlRadius: 1 },
            { coord: 'B5', name: 'Hill Summit', controlRadius: 2 }
        ]
    },
    
    // Scenario-specific special rules
    specialRules: {
        riverLevel: 'normal', // Can change with weather (heavy rain raises level)
        fordCrossable: true,  // Fords can become impassable in storms
        maxTurns: 12,
        
        weatherEffects: {
            heavy_rain: {
                riverLevel: 'high',
                fordCrossable: false,
                marshExpansion: ['L13','K14'] // Marsh spreads
            }
        }
    }
};

/**
 * Get terrain type at specific coordinate
 * @param {string} coord - Grid coordinate
 * @returns {string} Terrain type
 */
function getTerrainAt(coord) {
    if (RIVER_CROSSING_MAP.terrain.river.includes(coord)) return 'river';
    if (RIVER_CROSSING_MAP.terrain.fords.some(f => f.coord === coord)) return 'ford';
    if (RIVER_CROSSING_MAP.terrain.hill.includes(coord)) return 'hill';
    if (RIVER_CROSSING_MAP.terrain.marsh.includes(coord)) return 'marsh';
    if (RIVER_CROSSING_MAP.terrain.road.includes(coord)) return 'road';
    if (RIVER_CROSSING_MAP.terrain.forest.includes(coord)) return 'forest';
    return 'plains';
}

/**
 * Check if coordinate is a valid ford crossing
 * @param {string} coord - Coordinate to check
 * @returns {boolean} True if fordable
 */
function isFord(coord) {
    return RIVER_CROSSING_MAP.terrain.fords.some(f => f.coord === coord);
}

/**
 * Check if movement crosses river illegally
 * @param {string} from - Start coordinate
 * @param {string} to - End coordinate
 * @returns {boolean} True if illegal crossing attempted
 */
function crossesRiverIllegally(from, to) {
    const { calculatePath } = require('./mapUtils');
    const path = calculatePath(from, to, RIVER_CROSSING_MAP);
    
    for (const coord of path) {
        const terrain = getTerrainAt(coord);
        if (terrain === 'river') return true; // Crossed river not at ford
    }
    
    return false;
}

/**
 * Initialize unit positions at battle start
 * @param {string} side - 'north' or 'south'
 * @param {Array} units - Array of unit objects
 * @returns {Array} Units with assigned starting positions
 */
function initializeDeployment(side, units) {
    const deploymentZone = RIVER_CROSSING_MAP.deployment[side];
    const availablePositions = [...deploymentZone.coords];
    
    return units.map((unit, index) => {
        const position = availablePositions[index] || deploymentZone.coords[0];
        return {
            ...unit,
            unitId: `${side}_unit_${index}`,
            position: position,
            currentStrength: unit.quality?.size || 100,  // ← ADD THIS LINE
            maxStrength: unit.quality?.size || 100,      // ← ADD THIS LINE
            movementRemaining: getUnitMovementRange(unit),
            detectRange: getUnitDetectRange(unit),
            canMove: true
        };
    });
}

/**
 * Get unit movement range based on type
 */
function getUnitMovementRange(unit) {
    if (unit.qualityType === 'scout') return 6;
    if (unit.mounted) return 5;
    if (unit.qualityType === 'levy') return 4;
    return 3; // Standard infantry
}

/**
 * Get unit detection range
 */
function getUnitDetectRange(unit) {
    if (unit.qualityType === 'scout') return 5;
    if (unit.mounted) return 3;
    return 2; // Standard
}

/**
 * Generate ASCII representation of current battle
 * @param {Object} battleState - Current battle state with unit positions
 * @returns {string} ASCII map
 */
function generateBattleMap(battleState) {
    const mapData = {
        terrain: RIVER_CROSSING_MAP.terrain,
        player1Units: battleState.player1?.unitPositions || [],
        player2Units: battleState.player2?.unitPositions || []
    };
    
    return generateASCIIMap(mapData);
}

module.exports = {
    RIVER_CROSSING_MAP,
    getTerrainAt,
    isFord,
    crossesRiverIllegally,
    initializeDeployment,
    getUnitMovementRange,
    getUnitDetectRange,
    generateBattleMap
};
// src/game/maps/riverCrossing.js
// Snake River Crossing - 20x20 Tactical Battlefield

const { generateASCIIMap } = require('./mapUtils');

const RIVER_CROSSING_MAP = {
    name: 'Snake River Crossing',
    size: { rows: 20, cols: 20 },
    
    terrain: {
        // River with fords included
        river: [
            'L1','M1','N1','O1','L2','M2','N2','J4','K4','L4',
            'J5','K5','I6','J6','H7','I7','J7','H8','I8','H9',
            'I9','J9','I10','J10','J12','K12','J13','K13','I14','J14',
            'I15','J15','I16','I18','J18','I19','J19','K19','J20','K20',
            'L3','J11','I17'  // Fords are in the river
        ],
        
        fords: [
            { coord: 'L3', name: 'Northern Crossing', width: 1 },
            { coord: 'J11', name: 'Central Bridge', width: 1 },
            { coord: 'I17', name: 'Southern Crossing', width: 1 }
        ],
        
        hill: [
            'H1','I1','J1','Q1','R1','S1','T1','H2','I2','J2',
            'P2','Q2','R2','S2','Q3','R3','A10','B10','A11','B11'
        ],
        
        marsh: [
            'P1','O2','T2','S3','R4','S4','R5','Q6','R6','Q7',
            'P8','Q8','P9','P10','Q10','P12','Q12','Q13','R13','R14',
            'S14','T14','H15','K15','L15','R15','S15','T15','H16','J16',
            'K16','L16','S16','T16','S17','T17','K18','L18','S18','T18',
            'S19','T19','O20','R20','S20','T20'
        ],
        
        road: [
            'E6','E7','E8','E9','T9','E10','S10','T10','E11','H11',
            'I11','K11','L11','M11','N11','O11','P11','Q11','R11','S11',
            'E12','F12','G12','H12','N12','E13','N13','O13','E14','O14',
            'E15','O15','P15','E16','D17','E17','A18','B18','C18','P20'
        ],
        
        forest: [
            'A1','B1','C1','D1','F1','G1','A2','B2','A3','B3',
            'T3','A4','B4','T4','A5','B5','C5','H5','I5','N5',
            'S5','T5','A6','B6','C6','G6','H6','K6','N6','S6',
            'T6','A7','B7','C7','G7','K7','L7','A8','B8','C8',
            'G8','J8','K8','L8','F9','G9','K9','L9','F10','G10',
            'H10','K10','L10','A15','B15','C15','D15','A16','B16','C16',
            'D16','A17','B17','C17','D18','E18','G18','H18','A19','B19',
            'C19','D19','E19','H19','A20','B20','C20','D20','E20','H20','I20'
        ]
    },
    
    deployment: {
        north: {
            coords: [
                'E1','C2','D2','E2','F2','G2','C3','D3','E3','F3',
                'G3','D4','E4','F4','E5'
            ],
            description: 'Northern army near western forest'
        },
        south: {
            coords: [
                'P16','Q16','R16','O17','P17','Q17','R17','O18','P18','Q18',
                'R18','O19','P19','Q19','R19'
            ],
            description: 'Southern army approaching from southeast marsh'
        }
    },
    
    movementCosts: {
        plains: 1.0,
        road: 0.5,
        hill: 1.5,
        forest: 2.0,
        marsh: 3.0,
        river: 999,
        ford: 1.5
    },
    
    combatModifiers: {
        hill: { defense: +2, missileRange: +1 },
        forest: { defense: +2, ambushBonus: +4, formationPenalty: -3, cavalryPenalty: -4 },
        marsh: { movementPenalty: -3, formationPenalty: -3, heavyArmorPenalty: -2 },
        ford: { crossingPenalty: -4, defenderBonus: +3, maxWidth: 3 },
        road: { formationBonus: +1 }
    },
    
    objectives: {
        primary: 'Control two of three fords for 3 consecutive turns OR destroy enemy army',
        secondary: 'Control hill positions for artillery advantage',
        
        controlPoints: [
            { coord: 'L3', name: 'Northern Crossing', controlRadius: 1 },
            { coord: 'J11', name: 'Central Bridge', controlRadius: 1 },
            { coord: 'I17', name: 'Southern Crossing', controlRadius: 1 },
            { coord: 'H1', name: 'Northern Heights', controlRadius: 2 },
            { coord: 'A10', name: 'Western Ridge', controlRadius: 2 }
        ]
    },
    
    specialRules: {
        riverLevel: 'normal',
        fordCrossable: true,
        maxTurns: 15
    }
};

function getTerrainAt(coord) {
    if (RIVER_CROSSING_MAP.terrain.fords.some(f => f.coord === coord)) return 'ford';
    if (RIVER_CROSSING_MAP.terrain.river.includes(coord)) return 'river';
    if (RIVER_CROSSING_MAP.terrain.hill.includes(coord)) return 'hill';
    if (RIVER_CROSSING_MAP.terrain.marsh.includes(coord)) return 'marsh';
    if (RIVER_CROSSING_MAP.terrain.road.includes(coord)) return 'road';
    if (RIVER_CROSSING_MAP.terrain.forest.includes(coord)) return 'forest';
    return 'plains';
}

function isFord(coord) {
    return RIVER_CROSSING_MAP.terrain.fords.some(f => f.coord === coord);
}

function crossesRiverIllegally(from, to) {
    const { calculatePath } = require('./mapUtils');
    const path = calculatePath(from, to, RIVER_CROSSING_MAP);
    
    for (const coord of path) {
        const terrain = getTerrainAt(coord);
        if (terrain === 'river') return true;
    }
    
    return false;
}

function initializeDeployment(side, units) {
    const deploymentZone = RIVER_CROSSING_MAP.deployment[side];
    const availablePositions = [...deploymentZone.coords];
    
    return units.map((unit, index) => {
        const position = availablePositions[index] || deploymentZone.coords[0];
        return {
            ...unit,
            unitId: `${side}_unit_${index}`,
            position: position,
            currentStrength: unit.quality?.size || 100,
            maxStrength: unit.quality?.size || 100,
            movementRemaining: getUnitMovementRange(unit),
            detectRange: getUnitDetectRange(unit),
            canMove: true
        };
    });
}

function getUnitMovementRange(unit) {
    if (unit.qualityType === 'scout') return 6;
    if (unit.mounted) return 5;
    if (unit.qualityType === 'levy') return 4;
    return 3;
}

function getUnitDetectRange(unit) {
    if (unit.qualityType === 'scout') return 5;
    if (unit.mounted) return 3;
    return 2;
}

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
// src/game/maps/riverCrossing.js
// Snake River Crossing - 40x40 Tactical Battlefield (25m tiles)

const { generateASCIIMap } = require('./mapUtils');

// Core tactical (40x40) map used by the engine
const RIVER_CROSSING_MAP = {
    name: 'Snake River Crossing',
    size: { rows: 40, cols: 40 },
    gridSize: 40,
    tileSize: 25,
    
    terrain: {
        // 40x40 river layout (from baseMapRS custom_battle_40x40)
        river: [
            'AA1','AB1','AC1','AD1','AA2','AB2','Z3','AA3','AB3','X4',
            'Y4','Z4','AA4','W5','X5','Y5','U7','V7','W7','X7',
            'U8','V8','W8','X8','S9','T9','U9','V9','W9','S10',
            'T10','U10','V10','W10','Q11','R11','S11','T11','U11','V11',
            'P12','Q12','R12','S12','T12','O13','P13','Q13','R13','O14',
            'P14','Q14','C15','D15','E15','F15','G15','I15','J15','K15',
            'L15','M15','N15','O15','P15','Q15','R15','C16','O16','P16',
            'Q16','R16','A17','B17','C17','Q17','R17','S17','T17','Q18',
            'R18','S18','T18','S19','T19','U19','V19','S20','T20','U20',
            'V20','U23','V23','U24','V24','S25','T25','U25','V25','S26',
            'T26','U26','V26','Q27','R27','S27','T27','U27','Q28','R28',
            'S28','O29','P29','Q29','R29','S29','O30','P30','Q30','R30',
            'O31','P31','O32','P32','O33','P33','O35','P35','Q35','R35',
            'O36','P36','Q36','R36','Q37','R37','S37','T37','Q38','R38',
            'S38','T38','Q39','R39','S39','T39','U39','V39','Q40','R40',
            'S40','T40','U40','V40',
        ],
        
        // Ford tiles as simple coordinates (used by movement/pathfinding)
        ford: [
            'W6','X6','U21','V21','U22','V22','O34','P34',
        ],
        
        // Fords with metadata for legacy helpers (isFord / crossesRiverIllegally)
        // We attach simple names; width kept at 1 tile for now.
        fords: [
            { coord: 'W6', name: 'North Ford (W6)', width: 1 },
            { coord: 'X6', name: 'North Ford (X6)', width: 1 },
            { coord: 'U21', name: 'Central Ford (U21)', width: 1 },
            { coord: 'V21', name: 'Central Ford (V21)', width: 1 },
            { coord: 'U22', name: 'Central Ford (U22)', width: 1 },
            { coord: 'V22', name: 'Central Ford (V22)', width: 1 },
            { coord: 'O34', name: 'South Ford (O34)', width: 1 },
            { coord: 'P34', name: 'South Ford (P34)', width: 1 }
        ],
        
        // Hills / high ground
        hill: [
            'Q1','R1','S1','T1','U1','V1','W1','X1','AG1','AH1',
            'AI1','AJ1','AK1','AL1','AM1','AN1','R2','S2','T2','U2',
            'W2','AH2','AI2','AJ2','AK2','AL2','AM2','AN2','S3','T3',
            'U3','AI3','AK3','AL3','AM3','AN3','T4','AK4','AL4','AM4',
            'AN4','AM5','AN5','AN6','A20','B20','A21','B21','D21','E21',
            'F21','A22','B22','C22','D22','E22','F22','A23','B23','C23',
            'D23','E23','A24','B24','C24','D24','E24','F24','A25','B25',
            'C25','D25','A26','B26','C26',
        ],
        
        // Forest / woods
        forest: [
            'A1','B1','I1','J1','K1','L1','M1','N1','O1','P1',
            'AE1','AF1','A2','B2','I2','J2','K2','L2','M2','N2',
            'O2','P2','AC2','AD2','AE2','AF2','AG2','A3','B3','K3',
            'L3','M3','N3','O3','P3','AC3','AD3','AE3','AF3','A4',
            'B4','K4','L4','M4','N4','P4','AD4','AF4','A5','B5',
            'K5','L5','M5','A6','B6','K6','L6','A7','B7','A8',
            'A9','AG9','AH9','A10','B10','C10','AG10','AL10','A11','D11',
            'F11','G11','H11','I11','J11','A12','D12','G12','H12','I12',
            'J12','A13','B13','C13','D13','E13','I13','J13','K13','L13',
            'W13','X13','AI13','AN13','A14','B14','C14','D14','E14','F14',
            'G14','I14','J14','K14','L14','W14','AH14','AI14','AN14','A15',
            'B15','S15','T15','W15','AG15','AN15','A16','B16','D16','E16',
            'F16','G16','I16','J16','K16','L16','M16','S16','T16','U16',
            'V16','W16','AG16','D17','E17','F17','G17','I17','J17','K17',
            'L17','M17','U17','V17','W17','AC17','AD17','AF17','AG17','AJ17',
            'A18','B18','C18','D18','E18','F18','G18','I18','J18','L18',
            'M18','N18','U18','V18','W18','X18','AD18','AF18','AG18','AJ18',
            'A19','B19','C19','D19','E19','F19','G19','I19','K19','L19',
            'M19','N19','O19','R19','W19','X19','Y19','AG19','AH19','AI19',
            'C20','D20','E20','F20','G20','I20','J20','K20','L20','M20',
            'N20','O20','P20','Q20','R20','W20','X20','Y20','Z20','AH20',
            'C21','M22','N22','O22','AD22','AN22','M23','W23','X23','AG23',
            'AH23','N24','W24','X24','AG24','AI24','AJ24','AG25','AL25','AG26',
            'AH26','A27','B27','C27','E27','F27','G27','H27','A28','B28',
            'C28','D28','E28','F28','G28','H28','AF28','AI28','A29','B29',
            'C29','D29','E29','F29','G29','H29','U29','V29','AA29','AI29',
            'AJ29','AK29','A30','B30','E30','F30','G30','H30','U30','V30',
            'AA30','AB30','AF30','AJ30','A31','B31','C31','E31','F31','G31',
            'H31','S31','T31','U31','V31','AA31','AB31','AI31','AL31','A32',
            'B32','C32','D32','E32','F32','G32','H32','S32','T32','U32',
            'AA32','AB32','AI32','AJ32','J33','AA33','AB33','A34','B34','C34',
            'D34','E34','F34','G34','H34','I34','J34','AB34','A35','B35',
            'C35','D35','E35','F35','G35','H35','I35','J35','Y35','Z35',
            'AA35','AM35','AN35','A36','B36','C36','D36','E36','F36','G36',
            'H36','I36','J36','Y36','AA36','AB36','AM36','AN36','A37','B37',
            'C37','D37','E37','F37','G37','H37','AM37','AN37','A38','B38',
            'C38','F38','G38','AM38','AN38','A39','B39','C39','D39','E39',
            'F39','AM39','AN39','A40','B40','C40','D40','E40','F40','AM40',
            'AN40',
        ],
        
        // Marsh / wet ground
        marsh: [
            'AJ5','AK5','AL5','AI6','AJ6','AK6','AL6','AM6','AG7','AH7',
            'AI7','AJ7','AK7','AL7','AM7','AN7','AI9','AJ9','AK9','AL9',
            'AM9','AN9','AH10','AI10','AJ10','AK10','AM10','AN10','AF11','AG11',
            'AH11','AI11','AJ11','AK11','AL11','AM11','AN11','AC12','AD12','AF12',
            'AG12','AH12','AI12','AJ12','AK12','AL12','AM12','AN12','AD13','AG13',
            'AH13','AJ13','AK13','AL13','AM13','AG14','AJ14','AK14','AL14','AM14',
            'AH15','AI15','AJ15','AK15','AL15','AM15','AH16','AI16','AJ16','AK16',
            'AL16','AM16','AN16','AH17','AI17','AK17','AL17','AM17','AN17','AH18',
            'AI18','AK18','AL18','AM18','AN18','AJ19','AK19','AL19','AM19','AN19',
            'AI20','AJ20','AK20','AL20','AM20','AN20','AI22','AJ22','AK22','AL22',
            'AM22','AI23','AJ23','AK23','AL23','AM23','AN23','AK24','AL24','AM24',
            'AN24','AI25','AJ25','AK25','AM25','AN25','AI26','AJ26','AK26','AL26',
            'AM26','AN26','AF27','AG27','AH27','AI27','AJ27','AK27','AL27','AM27',
            'AN27','AG28','AH28','AJ28','AK28','AL28','AM28','AN28','AF29','AG29',
            'AH29','AL29','AM29','AN29','AC30','AD30','AG30','AH30','AK30','AL30',
            'AM30','AN30','AD31','AK31','AM31','AN31','AC32','AD32','AK32','AL32',
            'AM32','AN32','Y33','AK33','AL33','AM33','AN33','AK34','AL34','AM34',
            'AN34','U35','W35','U36','V36','W36','X36','M37','O37','P37',
            'U37','V37','W37','Y37','AA37','M38','N38','O38','P38','U38',
            'V38','W38','X38','Y38','AA38','AB38','K39','L39','M39','N39',
            'O39','P39','W39','X39','Y39','Z39','AA39','AC39','AD39','J40',
            'K40','L40','M40','N40','O40','P40','W40','X40','Y40','Z40',
            'AA40','AB40','AC40',
        ],
        
        // Roads / causeways
        road: [
            'E1','E2','E3','E4','E5','E6','E7','E8','AE8','AF8',
            'AG8','AH8','AI8','AJ8','AK8','AL8','AM8','AN8','E9','AE9',
            'E10','AE10','E11','AE11','E12','F12','AE12','F13','G13','H13',
            'AE13','H14','AE14','AE15','H16','AE16','H17','AE17','H18','AE18',
            'H19','AE19','H20','AE20','G21','H21','I21','J21','K21','L21',
            'M21','N21','O21','P21','Q21','R21','S21','T21','W21','X21',
            'Y21','Z21','AA21','AB21','AC21','AD21','AE21','AF21','AG21','AH21',
            'AI21','AJ21','AK21','AL21','AM21','AN21','I22','AE22','I23','AE23',
            'I24','AE24','I25','AE25','I26','AE26','I27','AE27','I28','AE28',
            'I29','AE29','I30','AE30','I31','AE31','I32','AE32','A33','B33',
            'C33','D33','E33','F33','G33','H33','I33','AE33','AF33','AG33',
            'AH33','AI33','AJ33','AJ34','AJ35','AJ36','AJ37','AJ38','AJ39','AJ40',
        ],
        
        // Single bridge tile (treated as road visually; still part of ford/river logic)
        bridge: [
            'H15',
        ]
    },
    
    // Tactical deployment zones are now handled via startingPositions,
    // but we keep movement/cost/combat metadata from the original map.
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
        primary: 'Control the river crossings for 3 consecutive turns OR destroy enemy army',
        secondary: 'Control hill positions for artillery advantage',
        
        controlPoints: [
            { coord: 'W6', name: 'Northern Crossing', controlRadius: 1 },
            { coord: 'U21', name: 'Central Crossing', controlRadius: 1 },
            { coord: 'O34', name: 'Southern Crossing', controlRadius: 1 },
            { coord: 'Q1', name: 'Northern Heights', controlRadius: 2 },
            { coord: 'A20', name: 'Western Ridge', controlRadius: 2 }
        ]
    },
    
    specialRules: {
        riverLevel: 'normal',
        fordCrossable: true,
        maxTurns: 15
    },

    // 40x40 tactical starting positions (from baseMapRS custom_battle_40x40)
    startingPositions: {
        player1: [
            'C1','D1','F1','G1','H1',
            'C2','D2','F2','G2','H2',
            'C3','D3','F3','G3','H3','I3','J3',
            'C4','D4','F4','G4','H4','I4','J4',
            'C5','D5','F5','G5','H5','I5','J5',
            'C6','D6','F6','G6','H6','I6','J6'
        ],
        player2: [
            'AE35','AF35','AG35','AH35','AI35','AK35','AL35',
            'AE36','AF36','AG36','AH36','AI36','AK36','AL36',
            'AE37','AF37','AG37','AH37','AI37','AK37','AL37',
            'AE38','AF38','AG38','AH38','AI38','AK38','AL38',
            'AG39','AH39','AI39','AK39','AL39',
            'AG40','AH40','AI40','AK40','AL40'
        ]
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
    // Support legacy 'north'/'south' as well as 'player1'/'player2'
    let key;
    if (side === 'north' || side === 'player1') key = 'player1';
    else if (side === 'south' || side === 'player2') key = 'player2';
    else key = side; // fallback

    const starting = RIVER_CROSSING_MAP.startingPositions[key];
    if (!starting || starting.length === 0) {
        throw new Error(`No starting positions defined for side: ${side}`);
    }

    const availablePositions = [...starting];
    const initialFacing = (side === 'north' || side === 'player1') ? 'S' : 'N';
    
    return units.map((unit, index) => {
        const position = availablePositions[index] || availablePositions[0];
        return {
            ...unit,
            unitId: `${side}_unit_${index}`,
            position: position,
            currentStrength: unit.quality?.size || 100,
            maxStrength: unit.quality?.size || 100,
            movementRemaining: getUnitMovementRange(unit),
            detectRange: getUnitDetectRange(unit),
            canMove: true,
            // Initial facing / formation footprint for older tests that use this helper
            facing: unit.facing || initialFacing,
            formationStatus: unit.formationStatus || 'deployed',
            tilesOccupied: unit.tilesOccupied || [position]
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
# Cohort Data Structures & Tactical Systems Documentation

## Overview
Comprehensive documentation of map systems, fog of war, pathfinding, position-based combat, army data structures, and core game constants.

---

## Map System
**Location:** `src/game/maps/`

### River Crossing Map
**Location:** `src/game/maps/riverCrossing.js`

#### **Purpose**
Define 20×20 grid battlefield for River Crossing scenario with fords, hills, forests, and deployment zones

#### **Map Structure**
```javascript
module.exports = {
  name: 'River Crossing',
  description: 'Ancient bridge crossing - tactical control scenario',
  size: { rows: 20, cols: 20 },  // 1km × 1km battlefield
  
  // Terrain features (coordinate arrays)
  terrain: {
    river: [
      'F1', 'F2', 'F3', ..., 'F20',   // Column F = river
      'G1', 'G2', 'G3', ..., 'G20',   // Column G = river
      'H1', 'H2', 'H3', ..., 'H20'    // Column H = river
    ],
    
    fords: [
      { coord: 'F11', name: 'Northern Ford', width: 1 },
      { coord: 'G11', name: 'Central Ford', width: 1 },
      { coord: 'H11', name: 'Southern Ford', width: 1 }
    ],
    
    hills: [
      'B3', 'B4', 'B5',     // Western hills
      'C3', 'C4', 'C5',
      'M3', 'M4', 'M5',     // Eastern hills
      'N3', 'N4', 'N5'
    ],
    
    forests: [
      'D15', 'D16', 'D17', 'D18',  // Southern forest
      'E15', 'E16', 'E17', 'E18',
      'L15', 'L16', 'L17', 'L18',  // Northern forest
      'M15', 'M16', 'M17', 'M18'
    ],
    
    roads: [
      'A11', 'B11', 'C11', 'D11', 'E11',  // Western approach road
      'I11', 'J11', 'K11', 'L11', 'M11'   // Eastern approach road
    ]
  },
  
  // Starting positions
  deploymentZones: {
    player1: {
      coords: ['A1', 'A2', 'A3', ..., 'E1', 'E2', 'E3'],  // Western 5×3 zone
      description: 'Western approach to river crossing'
    },
    player2: {
      coords: ['P1', 'P2', 'P3', ..., 'T1', 'T2', 'T3'],  // Eastern 5×3 zone
      description: 'Eastern approach to river crossing'
    }
  },
  
  // Victory conditions
  objectives: {
    type: 'control_points',
    points: [
      { coord: 'F11', name: 'Northern Ford', value: 1 },
      { coord: 'G11', name: 'Central Ford', value: 2 },  // Central most valuable
      { coord: 'H11', name: 'Southern Ford', value: 1 }
    ],
    winCondition: 'Control 2+ fords for 4 consecutive turns OR destroy enemy army',
    turnLimit: 12
  }
}
```

#### **Map Coordinate System**
- **Columns:** A-T (20 columns, 50m each = 1000m wide)
- **Rows:** 1-20 (20 rows, 50m each = 1000m deep)
- **Format:** Letter + Number (e.g., 'F11', 'M5')
- **Total Tiles:** 400 tiles (20 × 20)
- **Tile Size:** 50m × 50m = 2,500 m² per tile

### Map Utilities
**Location:** `src/game/maps/mapUtils.js`

#### **Coordinate Conversion Functions**

**`parseCoord(coordString)`**
**Purpose:** Convert 'F11' string to {row, col} object
```javascript
function parseCoord(coord) {
  const col = coord.charCodeAt(0) - 65;  // 'A' = 0, 'B' = 1, etc.
  const row = parseInt(coord.substring(1)) - 1;  // '1' = 0, '2' = 1, etc.
  return { row, col };
}

// Example: 'F11' → { row: 10, col: 5 }
```

**`coordToString(coordObject)`**
**Purpose:** Convert {row, col} object to 'F11' string
```javascript
function coordToString(coord) {
  const col = String.fromCharCode(65 + coord.col);  // 0 = 'A', 1 = 'B'
  const row = (coord.row + 1).toString();           // 0 = '1', 1 = '2'
  return col + row;
}

// Example: { row: 10, col: 5 } → 'F11'
```

#### **Distance Calculations**

**`manhattanDistance(coord1, coord2)`**
**Purpose:** Calculate grid distance (no diagonal shortcuts)
```javascript
function manhattanDistance(c1, c2) {
  const p1 = parseCoord(c1);
  const p2 = parseCoord(c2);
  return Math.abs(p1.row - p2.row) + Math.abs(p1.col - p2.col);
}

// Example: 'A1' to 'D4' = |0-3| + |0-3| = 6 tiles
```

**`euclideanDistance(coord1, coord2)`**
**Purpose:** Calculate straight-line distance (for visibility)
```javascript
function euclideanDistance(c1, c2) {
  const p1 = parseCoord(c1);
  const p2 = parseCoord(c2);
  return Math.sqrt(
    Math.pow(p1.row - p2.row, 2) + 
    Math.pow(p1.col - p2.col, 2)
  );
}

// Example: 'A1' to 'D4' = √(9 + 9) = 4.24 tiles
```

#### **A* Pathfinding**

**`findPathAStar(start, goal, map, getTerrainType)`**
**Purpose:** Find optimal path considering terrain movement costs
**Algorithm:** A* with terrain-weighted heuristic

```javascript
function findPathAStar(start, goal, map, getTerrainFunc) {
  const openSet = [start];
  const cameFrom = new Map();
  const gScore = new Map();  // Actual cost from start
  const fScore = new Map();  // Estimated total cost
  
  gScore.set(start, 0);
  fScore.set(start, heuristic(start, goal));
  
  while (openSet.length > 0) {
    // Get node with lowest fScore
    const current = getLowestFScore(openSet, fScore);
    
    if (current === goal) {
      return reconstructPath(cameFrom, current);
    }
    
    openSet.splice(openSet.indexOf(current), 1);
    
    // Check all neighbors
    for (const neighbor of getNeighbors(current, map)) {
      const terrain = getTerrainFunc(neighbor, map);
      
      // River blocks movement (except fords)
      if (terrain === 'river') continue;
      
      // Calculate movement cost
      const moveCost = getTerrainMovementCost(terrain);
      const tentativeGScore = gScore.get(current) + moveCost;
      
      if (!gScore.has(neighbor) || tentativeGScore < gScore.get(neighbor)) {
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentativeGScore);
        fScore.set(neighbor, tentativeGScore + heuristic(neighbor, goal));
        
        if (!openSet.includes(neighbor)) {
          openSet.push(neighbor);
        }
      }
    }
  }
  
  // No path found
  return { valid: false, reason: 'no_path_available' };
}
```

**Terrain Movement Costs:**
```javascript
function getTerrainMovementCost(terrain) {
  const costs = {
    plains: 1.0,
    road: 0.5,      // 2× speed
    ford: 1.5,      // Crossing penalty
    hill: 1.5,      // Uphill
    forest: 2.0,    // Dense vegetation
    marsh: 3.0,     // Very slow
    river: 999      // Impassable
  };
  return costs[terrain] || 1.0;
}
```

**`calculatePathCost(path, map, getTerrainType)`**
**Purpose:** Sum movement cost for entire path
```javascript
function calculatePathCost(path, map, getTerrainFunc) {
  let totalCost = 0;
  
  for (let i = 1; i < path.length; i++) {
    const terrain = getTerrainFunc(path[i], map);
    totalCost += getTerrainMovementCost(terrain);
  }
  
  return totalCost;
}
```

**Example:**
```
Path: ['A5', 'A6', 'B6', 'C6']
Terrain: [plains, plains, ford, plains]
Cost: 0 + 1.0 + 1.0 + 1.5 + 1.0 = 4.5 movement points
```

---

## Fog of War System
**Location:** `src/game/fogOfWar.js`

### Purpose
Implement line-of-sight visibility where players see only what their units can see, creating realistic intelligence limitations.

### Core Concepts

**Vision Ranges (tiles):**
```javascript
const LINE_OF_SIGHT = {
  standard: 3,        // 150m normal visibility
  cavalry: 3,         // 150m mounted (same as infantry)
  scouts: 5,          // 250m trained observers
  elevated: +2,       // Hills/towers add 100m
  
  // Weather modifiers
  lightRain: -1,      // 100m reduction
  heavyRain: -3,      // 50m visibility (Teutoburg)
  fog: -2,            // 100m reduction (Lake Trasimene)
  dust: -1,           // Large army movement
  
  // Terrain modifiers
  denseForest: -2,    // 50-100m
  lightForest: -1     // 100-150m
}
```

### Main Function

#### **`calculateVisibility(myUnits, enemyUnits, terrain, weather = 'clear')`**
**Purpose:** Determine which enemy units are visible to player
**Parameters:**
- `myUnits` (Array): Player's positioned units
- `enemyUnits` (Array): All enemy units (to check visibility)
- `terrain` (Object): Map terrain data
- `weather` (String): Current weather condition

**Process:**
```javascript
const visibleEnemies = [];
const detectedEnemies = [];  // Approximate detection only

myUnits.forEach(myUnit => {
  // Calculate vision range for this unit
  let visionRange = LINE_OF_SIGHT.standard;
  
  // Scout bonus
  if (myUnit.type === 'scouts') {
    visionRange = LINE_OF_SIGHT.scouts;
  }
  
  // Elevation bonus
  const myTerrain = getTerrainType(myUnit.position, terrain);
  if (myTerrain === 'hill') {
    visionRange += LINE_OF_SIGHT.elevated;
  }
  
  // Weather penalty
  if (weather === 'fog') {
    visionRange += LINE_OF_SIGHT.fog;  // Negative value
  }
  
  // Check each enemy unit
  enemyUnits.forEach(enemy => {
    const distance = euclideanDistance(myUnit.position, enemy.position);
    
    if (distance <= visionRange) {
      // Check line of sight (no blocking terrain)
      if (hasLineOfSight(myUnit.position, enemy.position, terrain)) {
        // Full visibility
        visibleEnemies.push({
          ...enemy,
          detectedBy: myUnit.unitId,
          confidence: 'confirmed',
          distance: Math.round(distance)
        });
      }
    } else if (distance <= visionRange + 2) {
      // Approximate detection (movement, dust, noise)
      detectedEnemies.push({
        approximatePosition: getGeneralArea(enemy.position),
        confidence: 'uncertain',
        description: 'Unknown force detected'
      });
    }
  });
});

return {
  visibleEnemyPositions: visibleEnemies,
  approximateDetections: detectedEnemies,
  totalEnemiesDetected: visibleEnemies.length + detectedEnemies.length
};
```

#### **`hasLineOfSight(from, to, terrain)`**
**Purpose:** Check if terrain blocks visibility between two points
**Algorithm:** Bresenham line algorithm with terrain checking

```javascript
function hasLineOfSight(from, to, terrain) {
  const line = bresenhamLine(from, to);
  
  // Check each tile in line
  for (const coord of line) {
    const terrainType = getTerrainType(coord, terrain);
    
    // Dense forest blocks line of sight
    if (terrainType === 'forest') {
      return false;
    }
    
    // Hills block if between observer and target
    if (terrainType === 'hill') {
      const observerElevated = isElevated(from, terrain);
      const targetElevated = isElevated(to, terrain);
      
      // Can see over hills if both elevated
      if (!observerElevated || !targetElevated) {
        return false;
      }
    }
  }
  
  return true;  // No blocking terrain
}
```

#### **`bresenhamLine(start, end)`**
**Purpose:** Get all coordinates in straight line between two points
**Returns:** Array of coordinate strings
```javascript
// Example: ('A1', 'D4') → ['A1', 'B2', 'C3', 'D4']
```

### Fog of War Intelligence Levels

**Confirmed (Full Visibility):**
```javascript
{
  unitId: 'player2_infantry_1',
  position: 'M5',
  type: 'infantry',
  strength: 87,  // Approximate size
  formation: 'phalanx',
  equipment: 'sarissa',
  detectedBy: 'player1_scouts',
  confidence: 'confirmed',
  distance: 4
}
```

**Approximate Detection:**
```javascript
{
  approximatePosition: 'Eastern woods (L-N, 15-18)',
  strength: 'Unknown',
  type: 'Unknown force',
  confidence: 'uncertain',
  description: 'Movement detected in eastern forest'
}
```

**No Intelligence:**
```javascript
// Enemy beyond vision range + 2 tiles
// Player has zero knowledge of their existence
// Historical: Most ancient battles fought with partial information
```

---

## Position-Based Combat
**Location:** `src/game/positionBasedCombat.js`

### Purpose
Process movement phase, detect unit proximity, identify combat engagements, and apply position-based tactical modifiers.

### Main Function

#### **`processMovementPhase(p1Moves, p2Moves, battleState, map)`**
**Purpose:** Execute all movements and identify resulting combat engagements
**Process:**
```javascript
// 1. Execute all movements
const newPositions = {
  player1: executePlayerMovements(p1Moves, battleState.player1, map),
  player2: executePlayerMovements(p2Moves, battleState.player2, map)
};

// 2. Detect adjacency (units within combat range)
const combatEngagements = [];

newPositions.player1.forEach(p1Unit => {
  newPositions.player2.forEach(p2Unit => {
    const distance = manhattanDistance(p1Unit.position, p2Unit.position);
    
    // Adjacent tiles = melee combat
    if (distance === 1) {
      combatEngagements.push({
        type: 'melee',
        location: p1Unit.position,  // Combat at attacker's position
        attacker: { 
          unit: p1Unit, 
          positionModifiers: getPositionModifiers(p1Unit, map) 
        },
        defender: { 
          unit: p2Unit, 
          positionModifiers: getPositionModifiers(p2Unit, map) 
        },
        tacticalSituation: analyzeTacticalSituation(p1Unit, p2Unit, map)
      });
    }
    
    // Ranged combat (2-5 tiles for archers)
    else if (distance >= 2 && distance <= 5) {
      if (p1Unit.equipment?.primaryWeapon === 'composite_bow' ||
          p1Unit.equipment?.primaryWeapon === 'crossbow') {
        combatEngagements.push({
          type: 'ranged',
          location: p2Unit.position,
          attacker: { unit: p1Unit, range: distance },
          defender: { unit: p2Unit }
        });
      }
    }
  });
});

return {
  newPositions,
  combatEngagements,
  movementSummary: generateMovementSummary(p1Moves, p2Moves)
};
```

#### **`getPositionModifiers(unit, map)`**
**Purpose:** Calculate tactical bonuses from unit's position
```javascript
function getPositionModifiers(unit, map) {
  const modifiers = {
    terrain: 0,
    elevation: 0,
    cover: 0,
    formation: 0
  };
  
  const terrain = getTerrainType(unit.position, map);
  
  // Elevation advantage
  if (terrain === 'hill') {
    modifiers.elevation = +2;  // +2 defense on high ground
    modifiers.missileBonus = +1;  // +1 range for archers
  }
  
  // Cover bonuses
  if (terrain === 'forest') {
    modifiers.cover = +1;  // Harder to hit
    modifiers.ambushBonus = +2;  // Ambush potential
  }
  
  // River crossing penalty
  if (terrain === 'ford' && unit.hasMoved) {
    modifiers.crossing = -4;  // Vulnerable during crossing
  }
  
  return modifiers;
}
```

#### **`analyzeTacticalSituation(unit1, unit2, map)`**
**Purpose:** Determine tactical advantages/disadvantages for combat
```javascript
function analyzeTacticalSituation(attacker, defender, map) {
  const situation = {
    terrainAdvantage: null,  // 'attacker', 'defender', or 'neutral'
    flanking: false,
    elevationDifference: 0,
    supportingUnits: []
  };
  
  // Elevation analysis
  const attackerTerrain = getTerrainType(attacker.position, map);
  const defenderTerrain = getTerrainType(defender.position, map);
  
  if (attackerTerrain === 'hill' && defenderTerrain !== 'hill') {
    situation.terrainAdvantage = 'attacker';
    situation.elevationDifference = +1;
  } else if (defenderTerrain === 'hill' && attackerTerrain !== 'hill') {
    situation.terrainAdvantage = 'defender';
    situation.elevationDifference = -1;
  }
  
  // TODO: Flanking detection (requires formation facing)
  // TODO: Supporting unit bonuses (adjacent friendlies)
  
  return situation;
}
```

---

## Army Data Structures
**Location:** `src/game/armyData.js`

### Purpose
Define all available troop types, equipment, support units, and cultural restrictions for army building system.

### Troop Quality Tiers

```javascript
const TROOP_QUALITIES = {
  professional: {
    cost: 10,           // Supply Point blocks
    size: 100,          // Warriors per unit
    baseStats: { attack: 8, defense: 7, mobility: 6, morale: 90 },
    description: '100 veteran warriors - professional training and superior equipment',
    requiresCulture: null  // Available to all
  },
  
  militia: {
    cost: 6,
    size: 100,
    baseStats: { attack: 5, defense: 5, mobility: 7, morale: 70 },
    description: '100 trained citizens - competent but part-time soldiers',
    requiresCulture: null
  },
  
  levy: {
    cost: 4,
    size: 100,
    baseStats: { attack: 3, defense: 4, mobility: 8, morale: 50 },
    description: '100 conscripts - minimal training, quantity over quality',
    requiresCulture: null
  },
  
  scouts: {
    cost: 3,
    size: 20,
    baseStats: { attack: 4, defense: 3, mobility: 10, morale: 80, vision: 5 },
    description: '20 light cavalry scouts - extended vision range',
    mounted: true,
    requiresCulture: null
  },
  
  cavalry: {
    cost: 12,
    size: 50,
    baseStats: { attack: 9, defense: 6, mobility: 10, morale: 85 },
    description: '50 mounted warriors - decisive shock force',
    mounted: true,
    requiresCulture: null
  },
  
  heavyCavalry: {
    cost: 15,
    size: 40,
    baseStats: { attack: 11, defense: 8, mobility: 8, morale: 95 },
    description: '40 cataphracts - armored shock cavalry',
    mounted: true,
    requiresCulture: ['Parthian', 'Sarmatian', 'Sassanid']  // Only certain cultures
  }
};
```

### Equipment Upgrades

```javascript
const EQUIPMENT_OPTIONS = {
  // Weapons
  warSpears: {
    cost: 4,
    applicableTo: ['professional', 'militia', 'levy'],
    effect: { attack: +2, formation: +1 },
    description: 'Long thrusting spears - formation fighting advantage'
  },
  
  compositeBows: {
    cost: 5,
    applicableTo: ['professional', 'scouts', 'cavalry'],
    effect: { attack: +3, range: 3 },
    weather_vulnerable: true,  // Wet strings -4 effectiveness
    description: 'Superior archery - 150m effective range'
  },
  
  crossbows: {
    cost: 6,
    applicableTo: ['professional', 'militia'],
    effect: { attack: +3, armorPenetration: +2, reload: 'slow' },
    description: 'Mechanical bows - ignore armor, slow reload',
    requiresCulture: ['Han Chinese', 'Chinese kingdoms']
  },
  
  sarissaPikes: {
    cost: 5,
    applicableTo: ['professional'],
    effect: { 
      attack: +4, 
      defense: +3, 
      antiCavalry: +8,
      flankVulnerable: -6 
    },
    description: '18-21 foot pikes - phalanx supremacy',
    requiresCulture: ['Macedonian', 'Successor kingdoms']
  },
  
  // Armor
  lightArmor: {
    cost: 4,
    applicableTo: ['all'],
    effect: { defense: +2, mobility: -1 },
    description: 'Leather and hide - basic protection'
  },
  
  heavyArmor: {
    cost: 8,
    applicableTo: ['professional', 'cavalry'],
    effect: { defense: +4, mobility: -2, heatVulnerable: true },
    description: 'Bronze/iron plates - excellent protection, heavy'
  },
  
  loricaSegmentata: {
    cost: 10,
    applicableTo: ['professional'],
    effect: { defense: +5, mobility: -1, arrowImmunity: '>100m' },
    description: 'Segmented plate - Roman innovation',
    requiresCulture: ['Roman Republic', 'Roman Empire']
  },
  
  // Shields
  roundShields: {
    cost: 2,
    applicableTo: ['all'],
    effect: { defense: +1, missileDefense: +1 },
    description: 'Basic round shields'
  },
  
  heavyShields: {
    cost: 4,
    applicableTo: ['professional', 'militia'],
    effect: { defense: +2, missileDefense: +2, formation: +1 },
    description: 'Large shields - formation fighting',
    waterVulnerable: true  // +150% weight when wet
  }
};
```

### Support Units

```javascript
const SUPPORT_OPTIONS = {
  fieldEngineers: {
    cost: 2,
    size: 10,
    abilities: [
      'Build field fortifications (+3 defense)',
      'Construct temporary bridges',
      'Repair siege equipment'
    ],
    description: 'Combat engineers - tactical construction'
  },
  
  medicalCorps: {
    cost: 2,
    size: 10,
    abilities: [
      'Recover 10% casualties per turn',
      '+10 morale recovery',
      'Disease prevention'
    ],
    description: 'Field medics - casualty recovery'
  },
  
  supplyTrain: {
    cost: 0,           // FREE (included)
    size: 50,
    abilities: [
      '4 days supplies',
      'Baggage defense (vulnerable target)',
      'Equipment maintenance'
    ],
    description: 'Basic supplies - always included'
  },
  
  siegeEngineers: {
    cost: 6,
    size: 20,
    abilities: [
      'Deploy battering rams',
      'Construct siege towers',
      'Operate ballistas'
    ],
    description: 'Siege specialists - fortification assault',
    requiresScenario: ['Hill Fort Assault', 'fortified positions']
  }
};
```

### Cultural Restrictions & Bonuses

```javascript
const CULTURAL_ARMY_RULES = {
  'Roman Republic': {
    required: {
      heavyInfantry: { 
        minimum: 50, // % of army
        reason: 'Legion core requirement'
      }
    },
    bonuses: {
      engineering: +1,           // Fortification bonuses
      tacticalFlexibility: +1,   // Can change formations mid-battle
      auxiliaryRecruitment: true // Hire defeated enemies as auxiliaries
    },
    restrictions: {
      mercenaries: false  // Professional army only
    }
  },
  
  'Spartan City-State': {
    required: {
      professionalOnly: true,  // Cannot hire militia/levy
      perioeci: {
        cost: +2,  // Support staff more expensive
        canFight: true  // But can fight if needed
      }
    },
    bonuses: {
      fightToLastMan: true,        // Break at 50% vs 15% normal
      perioeciBetter: true,         // Non-citizen troops fight better
      allyRecruitment: ['Greek cities']
    },
    restrictions: {
      mercenaries: false,
      smallElite: 40  // Only 40-warrior elite unit (vs 80 normal)
    }
  },
  
  'Carthaginian Empire': {
    bonuses: {
      merchantWealth: +2,  // 32 total SP vs 30 normal
      warElephants: true,
      campaignRecruitment: true  // Save SP to hire mid-battle
    },
    restrictions: {
      nativeManpower: { max: 2 },  // Max 200 professional natives
      mercenaryLoyalty: 'retreat_first'  // Mercs break first
    }
  },
  
  'Han Dynasty': {
    bonuses: {
      advancedTechnology: ['crossbows', 'cloud_ladders', 'advanced_catapults'],
      farmingEfficiency: +20,  // 1 block = 120 men vs 100 normal
      assimilation: true       // Conquered units join Han forces
    },
    restrictions: {
      administrators: { 
        required: 2,  // Must include 2 SP administrators
        consequence: 'entire_army_penalties_if_lost'
      }
    }
  },
  
  'Macedonian Kingdoms': {
    bonuses: {
      veteranStart: 10,        // Silver Shields start with 10-battle experience
      equipmentFlexibility: true,  // Can switch sarissa ↔ standard spears
      companionCavalry: true   // Recruit conquered cavalry
    },
    restrictions: {
      noMilitia: true,         // Professional standards only
      higherCosts: +15         // Professional army expensive
    }
  },
  
  'Pre-Genghis Mongolia': {
    bonuses: {
      horseArcheryPerfection: true,  // Full accuracy while moving
      nomadicEndurance: +40,          // 40% longer without supplies
      largerUnits: +20,               // 120 men per unit vs 100
      eliteSize: 100                  // 100-warrior elite vs 80 normal
    },
    restrictions: {
      noBaggageTrain: true,   // Must purchase if wanted
      allMounted: true,       // 100% cavalry requirement
      canDismount: {
        turns: 1,             // Can fight on foot 1 turn
        effectiveness: -3     // Major penalty
      }
    }
  }
};
```

---

## Turn Manager
**Location:** `src/game/turnManager.js`

### Purpose
Track turn state, manage player order submission, enforce time limits, and coordinate turn resolution.

### Turn State Tracking

```javascript
const TURN_STATE = {
  phase: 'awaiting_orders',  // awaiting_orders | processing | complete
  player1: {
    orderSubmitted: false,
    orderText: null,
    timestamp: null
  },
  player2: {
    orderSubmitted: false,
    orderText: null,
    timestamp: null
  },
  deadlineTimestamp: Date.now() + (24 * 60 * 60 * 1000)  // 24 hours
};
```

### Functions

#### **`submitOrder(battle, playerId, orderText)`**
**Purpose:** Record player order and check if both players ready
```javascript
async function submitOrder(battle, playerId, orderText) {
  const playerSide = battle.player1Id === playerId ? 'player1' : 'player2';
  
  // Store order
  if (!battle.battleState.pendingOrders) {
    battle.battleState.pendingOrders = {};
  }
  
  battle.battleState.pendingOrders[playerSide] = {
    order: orderText,
    timestamp: new Date()
  };
  
  battle.changed('battleState', true);
  await battle.save();
  
  // Check if both submitted
  const bothReady = battle.battleState.pendingOrders.player1 && 
                   battle.battleState.pendingOrders.player2;
  
  return {
    submitted: true,
    waitingForOpponent: !bothReady,
    readyToProcess: bothReady
  };
}
```

#### **`checkTurnTimeout(battle)`**
**Purpose:** Enforce 24-hour turn time limits
```javascript
async function checkTurnTimeout(battle) {
  const lastUpdate = new Date(battle.updatedAt);
  const hoursSince = (Date.now() - lastUpdate) / (1000 * 60 * 60);
  
  if (hoursSince > 24) {
    // Determine who timed out
    const p1Submitted = battle.battleState.pendingOrders?.player1;
    const p2Submitted = battle.battleState.pendingOrders?.player2;
    
    if (!p1Submitted && !p2Submitted) {
      // Both timed out - draw
      await battle.setWinner(null, 'mutual_timeout');
    } else if (!p1Submitted) {
      // Player 1 timed out - Player 2 wins
      await battle.setWinner(battle.player2Id, 'timeout');
    } else {
      // Player 2 timed out - Player 1 wins
      await battle.setWinner(battle.player1Id, 'timeout');
    }
    
    await notifyPlayersOfTimeout(battle);
    return { timedOut: true };
  }
  
  // Warning at 18 hours
  if (hoursSince > 18 && hoursSince < 19) {
    await sendTimeoutWarning(battle);
  }
  
  return { timedOut: false };
}
```

---

## Army Builder Block System

### Supply Point Allocation

**Base Allocation:** 30 SP per player

**Block Costs:**
```javascript
// Troops
Professional: 10 blocks = 100 warriors
Militia: 6 blocks = 100 warriors
Levy: 4 blocks = 100 warriors
Scouts: 3 blocks = 20 mounted scouts
Cavalry: 12 blocks = 50 mounted warriors
Heavy Cavalry: 15 blocks = 40 cataphracts

// Equipment (additive to troops)
War Spears: +4 blocks
Composite Bows: +5 blocks
Crossbows: +6 blocks (Han only)
Sarissa Pikes: +5 blocks (Macedonian only)

Light Armor: +4 blocks
Heavy Armor: +8 blocks
Lorica Segmentata: +10 blocks (Roman only)

Round Shields: +2 blocks
Heavy Shields: +4 blocks

// Support
Field Engineers: 2 blocks
Medical Corps: 2 blocks
Supply Train: FREE (always included)
Siege Engineers: 6 blocks

// Elite Unit: FREE (always included)
```

**Example Army (30 SP):**
```
1× Professional (10 blocks)
1× Militia (6 blocks)
+ War Spears (4 blocks)
+ Light Armor (4 blocks)
+ Heavy Shields (4 blocks)
+ Field Engineers (2 blocks)
= 30 blocks total

Elite Unit (FREE): 80 warriors
Supply Train (FREE): Basic supplies
```

### Validation Rules

```javascript
function validateArmyComposition(builderState) {
  const errors = [];
  
  // Minimum force requirement
  if (builderState.blocksUsed < 20) {
    errors.push('Army too small - use at least 20 blocks');
  }
  
  // Maximum not exceeded
  if (builderState.blocksUsed > builderState.blocksTotal) {
    errors.push(`Over budget: ${builderState.blocksUsed}/${builderState.blocksTotal} blocks`);
  }
  
  // Cultural restrictions
  const culture = builderState.culture;
  const rules = CULTURAL_ARMY_RULES[culture];
  
  if (rules?.required?.heavyInfantry) {
    const heavyPercent = calculateHeavyInfantryPercent(builderState);
    if (heavyPercent < rules.required.heavyInfantry.minimum) {
      errors.push(`${culture} requires ${rules.required.heavyInfantry.minimum}% heavy infantry`);
    }
  }
  
  if (rules?.restrictions?.mercenaries === false) {
    const hasMercenaries = builderState.selectedTroops.some(t => t.mercenary);
    if (hasMercenaries) {
      errors.push(`${culture} cannot hire mercenaries`);
    }
  }
  
  // Equipment compatibility
  builderState.selectedEquipment.forEach(eq => {
    const compatibleTroops = builderState.selectedTroops.filter(t =>
      EQUIPMENT_OPTIONS[eq.type].applicableTo.includes(t.type)
    );
    
    if (compatibleTroops.length === 0) {
      errors.push(`${eq.type} requires compatible troops`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

## Constants & Configuration

### Vision System Constants
```javascript
const VISION = {
  STANDARD_RANGE: 3,      // 150m base visibility
  SCOUT_RANGE: 5,         // 250m for scouts
  ELEVATED_BONUS: 2,      // +100m from hills
  FOG_PENALTY: -2,        // Lake Trasimene conditions
  FOREST_BLOCK: true,     // Dense forest blocks LOS
  HILL_BLOCK: 'conditional'  // Blocks unless both elevated
};
```

### Combat System Constants
```javascript
const COMBAT = {
  CASUALTY_VARIANCE: 0.4,  // ±40% randomization
  MORALE_BREAK_THRESHOLD: {
    levy: 0.15,            // Break at 15% casualties
    militia: 0.20,         // Break at 20%
    professional: 0.25,    // Break at 25%
    elite: 0.35,           // Break at 35%
    spartan: 0.50,         // Break at 50% (cultural)
    germanic: 1.00         // Never break (comitatus oath)
  },
  FORMATION_DEPLOY_TIME: {
    standard: 0,           // Already in formation
    phalanx: 1,            // 1 turn to form sarissa wall
    testudo: 1,            // 1 turn to form turtle
    berserker: 0           // No formation needed
  }
};
```

### Movement System Constants
```javascript
const MOVEMENT = {
  INFANTRY_BASE: 3,          // 150m per turn
  CAVALRY_BASE: 5,           // 250m per turn  
  SCOUT_BASE: 6,             // 300m per turn
  LEVY_BASE: 4,              // 200m per turn
  
  TERRAIN_MULTIPLIERS: {
    plains: 1.0,
    road: 2.0,               // Double speed
    ford: 0.66,              // Crossing penalty
    hill: 0.66,              // Uphill penalty
    forest: 0.5,             // Dense vegetation
    marsh: 0.33              // Very slow, sinking
  },
  
  FORMATION_PENALTIES: {
    phalanx: 0.8,            // -20% movement in sarissa formation
    testudo: 0.5,            // -50% movement in shield turtle
    standard: 1.0
  }
};
```

---

## Utility Functions

### Coordinate System

```javascript
/**
 * Parse grid coordinate string to row/col object
 * @param {string} coord - 'F11' format
 * @returns {Object} { row: 10, col: 5 }
 */
function parseCoord(coord) {
  const col = coord.charCodeAt(0) - 65;
  const row = parseInt(coord.substring(1)) - 1;
  return { row, col };
}

/**
 * Convert row/col object to grid coordinate string
 * @param {Object} coord - { row, col }
 * @returns {string} 'F11' format
 */
function coordToString(coord) {
  const col = String.fromCharCode(65 + coord.col);
  const row = (coord.row + 1).toString();
  return col + row;
}

/**
 * Get all adjacent coordinates (4 cardinal directions)
 * @param {string} coord - Center coordinate
 * @returns {Array<string>} Adjacent coordinates
 */
function getAdjacentCoords(coord) {
  const { row, col } = parseCoord(coord);
  const adjacent = [];
  
  // North, South, East, West
  const directions = [
    { row: -1, col: 0 },  // North
    { row: +1, col: 0 },  // South
    { row: 0, col: +1 },  // East
    { row: 0, col: -1 }   // West
  ];
  
  directions.forEach(dir => {
    const newRow = row + dir.row;
    const newCol = col + dir.col;
    
    // Bounds check
    if (newRow >= 0 && newRow < 20 && newCol >= 0 && newCol < 20) {
      adjacent.push(coordToString({ row: newRow, col: newCol }));
    }
  });
  
  return adjacent;
}

/**
 * Get all coordinates within range (including diagonals)
 * @param {string} center - Center coordinate
 * @param {number} range - Radius in tiles
 * @returns {Array<string>} All coordinates within range
 */
function getCoordsInRange(center, range) {
  const { row, col } = parseCoord(center);
  const inRange = [];
  
  for (let r = row - range; r <= row + range; r++) {
    for (let c = col - range; c <= col + range; c++) {
      // Bounds check
      if (r < 0 || r >= 20 || c < 0 || c >= 20) continue;
      
      // Distance check (Euclidean)
      const distance = Math.sqrt(
        Math.pow(r - row, 2) + Math.pow(c - col, 2)
      );
      
      if (distance <= range) {
        inRange.push(coordToString({ row: r, col: c }));
      }
    }
  }
  
  return inRange;
}
```

### Formatting Utilities

```javascript
/**
 * Create visual progress bar for army builder
 */
function createProgressBar(used, total) {
  const percentage = used / total;
  const filled = Math.floor(percentage * 20);
  const empty = 20 - filled;
  
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Format troop list for embed display
 */
function formatTroopsList(troops) {
  if (troops.length === 0) return 'None selected';
  
  return troops.map(t => 
    `${t.quantity}× ${capitalize(t.type)} (${getTroopCost(t.type)} blocks)`
  ).join('\n');
}

/**
 * Format unit positions for status display
 */
function formatUnitList(units) {
  if (units.length === 0) return 'No units deployed';
  
  return units.map(u =>
    `**${u.name || u.unitId}** (${u.currentStrength}/${u.maxStrength})\n` +
    `├─ Position: ${u.position}\n` +
    `├─ Morale: ${u.morale || 100}\n` +
    `└─ Status: ${u.status || 'Ready'}`
  ).join('\n\n');
}

/**
 * Format visible enemy intel with appropriate vagueness
 */
function formatVisibleEnemies(visibleEnemies) {
  if (visibleEnemies.length === 0) {
    return '🔍 No enemy forces detected\n*(Move scouts to gather intelligence)*';
  }
  
  return visibleEnemies.map(e => {
    if (e.confidence === 'confirmed') {
      return `**Enemy ${e.type}** at ${e.position}\n` +
             `├─ Strength: ~${e.strength} warriors\n` +
             `├─ Formation: ${e.formation}\n` +
             `└─ Distance: ${e.distance} tiles (${e.distance * 50}m)`;
    } else {
      return `**Unknown force** - ${e.approximatePosition}\n` +
             `└─ Confidence: Uncertain (movement detected)`;
    }
  }).join('\n\n');
}
```

---

## Zone-Based Combat System (Planned)

### Future Implementation
Currently combat uses simple adjacency (1 tile = combat). Planned enhancement to **zone-based positioning** with facing, flanking, and formation integrity.

### Zone Combat Structure (Design)
```javascript
const ZONE_COMBAT = {
  // Unit occupies 1 tile but "controls" adjacent tiles
  controlZone: 1,  // Tiles around unit it threatens
  
  // Facing direction affects vulnerability
  facing: {
    front: { defense: 1.0 },
    flank: { defense: 0.7 },   // -3 defense (30% reduction)
    rear: { defense: 0.4 }      // -6 defense (60% reduction)
  },
  
  // Formation facing
  phalanxFacing: {
    front: { defense: 1.8 },    // +8 defense (sarissa wall)
    flank: { defense: 0.4 },    // -6 defense (major vulnerability)
    rear: { defense: 0.3 }      // Catastrophic
  }
};
```

---

## Design Philosophy

### Grid-Based Tactics
- 20×20 grid provides meaningful positioning choices
- Terrain features create chokepoints (Thermopylae-style)
- Elevation advantages matter (high ground bonuses)
- Rivers create natural barriers (must find fords)

### Fog of War Realism
- Players see only what units can see
- Scouts extend vision range (historical role)
- Terrain blocks line of sight (forests, hills)
- Uncertainty creates scouting value

### Historical Map Design
- River Crossing: Based on Roman Rhine campaigns
- Hill Fort: Celtic oppida sieges
- Forest Ambush: Teutoburg Forest (9 AD)
- Desert Oasis: Arab/Berber desert warfare
- Mountain Pass: Thermopylae (480 BC), Persian Gates (330 BC)

### Progressive Complexity
- New players: Simple deployment zones, clear objectives
- Veterans: Complex terrain interactions, multi-ford control
- Masters: Environmental warfare, supply interdiction, psychological tactics
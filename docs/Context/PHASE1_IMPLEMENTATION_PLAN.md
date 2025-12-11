# Phase 1 Implementation Plan: Grid Rescale & Formation System

**Target:** 40×40 battlefield at 25m tiles with formation status and viewport system  
**Estimated Total:** 18-24 hours  
**Deliverable:** Playable game with operational movement and tactical combat

---

## TASK 1: Unit Size Scaling (1 hour)

### **Objective:** Scale all unit sizes from 100→400 warriors (regular) and 80-100→300 (elite)

### **Files to Modify:**

**`src/game/armyData.js`**
```javascript
// FIND AND REPLACE:

// All TROOP_QUALITY entries:
size: 100,  →  size: 400,

// Examples:
'levy': {
    name: 'Levy',
    cost: 3,
    size: 400,  // WAS: 100
    // ...
}

'professional': {
    name: 'Professional',
    cost: 7,
    size: 400,  // WAS: 100
    // ...
}
```

**`src/game/eliteTemplates.js`**
```javascript
// Find all elite unit definitions and update size field:

size: 80,  →  size: 300,
size: 100, →  size: 300,

// Example:
PRAETORIAN_GUARD: {
    size: 300,  // WAS: 80
    // ...
}
```

**`src/game/combat/damageAccumulation.js`** (if it uses hardcoded 100)
- Search for any `/ 100` divisions assuming 100-warrior units
- Replace with `/ unit.maxStrength` for dynamic scaling

### **Testing:**
```bash
# Create army, verify unit sizes show 300/400
node src/bot/commands/build-army.js
```

### **Acceptance Criteria:**
- [ ] Regular units show 400 max strength
- [ ] Elite units show 300 max strength
- [ ] Combat damage scales appropriately
- [ ] No hardcoded 100-warrior assumptions break

---

## TASK 2: Grid Coordinate System Expansion (3-4 hours)

### **Objective:** Support 40×40 grid with coordinates A1-AN40

### **Files to Modify:**

**`src/game/maps/mapUtils.js`**

**Replace `parseCoord()` function:**
```javascript
function parseCoord(coord) {
    if (!coord || typeof coord !== 'string') {
        throw new Error(`Invalid coordinate: ${coord}`);
    }
    
    // Match pattern: letters followed by numbers (A1, AB23, AN40)
    const match = coord.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
        throw new Error(`Invalid coordinate format: ${coord}. Expected A1-AN40.`);
    }
    
    const colStr = match[1];
    const row = parseInt(match[2]) - 1; // 1-indexed to 0-indexed
    
    // Convert column letters to number
    // A=0, B=1, ..., Z=25, AA=26, AB=27, ..., AN=39
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
        col = col * 26 + (colStr.charCodeAt(i) - 65);
        if (i > 0) col++; // Adjust for AA=26, not 0
    }
    
    // Validate bounds (40×40 grid)
    if (row < 0 || row >= 40 || col < 0 || col >= 40) {
        throw new Error(`Coordinate out of bounds: ${coord}. Valid range: A1-AN40`);
    }
    
    return { row, col };
}
```

**Replace `coordToString()` function:**
```javascript
function coordToString(pos) {
    let col = pos.col;
    let colStr = '';
    
    // Convert number to letters (0=A, 25=Z, 26=AA, 39=AN)
    if (col < 26) {
        colStr = String.fromCharCode(65 + col);
    } else {
        // Two-letter coordinates
        const firstLetter = Math.floor(col / 26) - 1;
        const secondLetter = col % 26;
        colStr = String.fromCharCode(65 + firstLetter) + String.fromCharCode(65 + secondLetter);
    }
    
    const row = pos.row + 1; // 0-indexed to 1-indexed
    return `${colStr}${row}`;
}
```

**Update validation:**
```javascript
function isValidCoord(coord) {
    try {
        const pos = parseCoord(coord);
        return pos.row >= 0 && pos.row < 40 && pos.col >= 0 && pos.col < 40;
    } catch {
        return false;
    }
}
```

### **Testing:**
```javascript
// Test cases:
parseCoord("A1")   // {row: 0, col: 0}
parseCoord("Z40")  // {row: 39, col: 25}
parseCoord("AA1")  // {row: 0, col: 26}
parseCoord("AN40") // {row: 39, col: 39}

coordToString({row: 0, col: 0})   // "A1"
coordToString({row: 39, col: 39}) // "AN40"
```

### **Acceptance Criteria:**
- [ ] Coordinates A1-AN40 parse correctly
- [ ] coordToString() generates valid coords
- [ ] Out of bounds detection works
- [ ] All existing code using parseCoord() still works

---

## TASK 3: Scale Vision & Movement Ranges (2 hours)

### **Objective:** Double all ranges to maintain same real-world distances at 25m tiles

### **Files to Modify:**

**`src/game/fogOfWar.js`**
```javascript
// OLD (50m tiles):
const LINE_OF_SIGHT = {
    standard: 3,      // 150m
    cavalry: 3,       // 150m
    scouts: 5,        // 250m
    elevated: '+2'    // +100m
};

// NEW (25m tiles):
const LINE_OF_SIGHT = {
    standard: 6,      // 150m (6 × 25m)
    cavalry: 6,       // 150m
    scouts: 10,       // 250m (10 × 25m)
    elevated: '+4'    // +100m (4 × 25m)
};
```

**`src/game/movementSystem.js`**
```javascript
// OLD (50m tiles):
const BASE_MOVEMENT_RATES = {
    infantry: 3,      // 150m
    cavalry: 5,       // 250m
    scouts: 6         // 300m
};

// NEW (25m tiles):
const BASE_MOVEMENT_RATES = {
    infantry: 6,      // 150m (6 × 25m)
    cavalry: 10,      // 250m (10 × 25m)
    scouts: 12        // 300m (12 × 25m)
};
```

**`src/game/combat/attackRatings.js` and `defenseRatings.js`**
```javascript
// Weapon ranges need doubling:
// OLD:
const WEAPON_RANGES = {
    compositeBows: {
        effective: 3,  // 150m
        maximum: 5     // 250m
    }
};

// NEW:
const WEAPON_RANGES = {
    compositeBows: {
        effective: 6,  // 150m (6 × 25m)
        maximum: 10    // 250m (10 × 25m)
    }
};
```

### **Acceptance Criteria:**
- [ ] Vision ranges maintain 150m standard
- [ ] Movement rates maintain historical speeds
- [ ] Weapon ranges accurate to research
- [ ] All distance calculations use 25m tile scale

---

## TASK 4: Formation Status System (5-6 hours)

### **Objective:** Track marching/deployed/encamped status with multi-tile columns

### **File to Create:**

**`src/game/formations/formationStatus.js`**
```javascript
// Formation status definitions and transitions

const FORMATION_STATUS = {
    marching: {
        tilesPerUnit: 4,         // 400 warriors = 4-tile column
        combatReady: false,
        deployTime: 2,           // 2 turns to deploy
        stackPenalty: 'SCALING', // Based on number of columns
        movementBonus: 1.5       // 50% faster when marching
    },
    
    deployed: {
        tilesPerUnit: 1,         // All in formation in 1 tile
        combatReady: true,
        deployTime: 0,
        stackPenalty: 'FORBIDDEN',
        movementBonus: 1.0
    },
    
    encamped: {
        tilesPerUnit: 1,
        combatReady: false,
        deployTime: 1,           // 1 turn to break camp
        stackPenalty: 'SHARED',  // Multiple units share camp
        movementBonus: 0         // Cannot move while encamped
    }
};

/**
 * Calculate tiles occupied by unit based on formation status
 */
function calculateOccupiedTiles(unit) {
    if (unit.formationStatus === 'marching') {
        // Create column based on facing direction
        const tiles = [];
        const basePos = parseCoord(unit.position);
        
        // Direction unit is moving
        const direction = unit.marchDirection || unit.facing || 'N';
        
        for (let i = 0; i < 4; i++) {
            const offset = getDirectionalOffset(direction, i);
            const tilePos = {
                row: basePos.row + offset.row,
                col: basePos.col + offset.col
            };
            tiles.push(coordToString(tilePos));
        }
        
        return tiles;
    } else {
        // Deployed or encamped = single tile
        return [unit.position];
    }
}

/**
 * Check if movement would cause stacking violation
 */
function checkStackingViolation(tile, movingUnit, allUnits) {
    const unitsInTile = allUnits.filter(u => {
        const occupied = calculateOccupiedTiles(u);
        return occupied.includes(tile) && u.unitId !== movingUnit.unitId;
    });
    
    if (unitsInTile.length === 0) {
        return { allowed: true, penalty: 0 };
    }
    
    // Check if any unit is deployed
    const anyDeployed = unitsInTile.some(u => u.formationStatus === 'deployed');
    const movingDeployed = movingUnit.formationStatus === 'deployed';
    
    if (anyDeployed || movingDeployed) {
        return { 
            allowed: false, 
            reason: "Deployed formations cannot stack" 
        };
    }
    
    // March columns stacking
    if (movingUnit.formationStatus === 'marching') {
        const marchingCount = unitsInTile.filter(u => 
            u.formationStatus === 'marching'
        ).length + 1; // +1 for moving unit
        
        // Scaling penalties
        const penalties = [0, -1, -3, -6]; // 1, 2, 3, 4+ columns
        const penalty = penalties[Math.min(marchingCount - 1, 3)];
        
        return {
            allowed: true,
            penalty: penalty,
            warning: marchingCount >= 3 ? "Heavy congestion" : null
        };
    }
    
    // Camps can share
    return { allowed: true, penalty: 0 };
}

/**
 * Execute deploy command: marching → deployed
 */
async function executeDeployment(unit, direction) {
    if (unit.formationStatus === 'deployed') {
        return { success: false, message: "Already deployed" };
    }
    
    // Track deployment progress
    if (!unit.deploymentProgress) {
        unit.deploymentProgress = 0;
    }
    
    unit.deploymentProgress++;
    
    if (unit.deploymentProgress >= 2) {
        // Deployment complete
        unit.formationStatus = 'deployed';
        unit.facing = direction;
        unit.deploymentProgress = 0;
        
        // Contract from column to single tile
        unit.position = unit.position; // Keep current position
        
        return { 
            success: true, 
            message: `${unit.name} deployed facing ${direction}` 
        };
    } else {
        // Still deploying
        return {
            success: false,
            message: `${unit.name} deploying... (Turn ${unit.deploymentProgress}/2)`,
            vulnerable: true // -3 defense while deploying
        };
    }
}

module.exports = {
    FORMATION_STATUS,
    calculateOccupiedTiles,
    checkStackingViolation,
    executeDeployment,
    // ... other functions
};
```

### **Acceptance Criteria:**
- [ ] Units track formationStatus: marching/deployed/encamped
- [ ] March columns occupy 4 tiles correctly
- [ ] Deploy command transitions over 2 turns
- [ ] Stacking penalties apply correctly
- [ ] Deployed units cannot overlap

---

## TASK 5: Viewport System (5-6 hours)

### **Objective:** 15×15 window on 40×40 battlefield with dual-zoom capability

### **File to Modify:**

**`src/game/maps/mapUtils.js`**

**Add viewport calculation:**
```javascript
/**
 * Calculate 15×15 viewport window on 40×40 grid
 * @param {string} centerCoord - Coordinate to center on
 * @param {number} gridSize - Total grid size (default 40)
 * @param {number} viewportSize - Viewport size (default 15)
 * @returns {Object} Viewport bounds
 */
function calculateViewport(centerCoord, gridSize = 40, viewportSize = 15) {
    const center = parseCoord(centerCoord);
    const halfView = Math.floor(viewportSize / 2);
    
    let startRow = center.row - halfView;
    let startCol = center.col - halfView;
    
    // Clamp to grid bounds
    startRow = Math.max(0, Math.min(startRow, gridSize - viewportSize));
    startCol = Math.max(0, Math.min(startCol, gridSize - viewportSize));
    
    return {
        startRow,
        startCol,
        endRow: startRow + viewportSize - 1,
        endCol: startCol + viewportSize - 1,
        center: centerCoord
    };
}

/**
 * Generate tactical map (25m tiles, high detail)
 */
function generateTacticalMap(battleState, centerCoord, playerSide) {
    const viewport = calculateViewport(centerCoord, 40, 15);
    const grid = Array(15).fill(null).map(() => Array(15).fill('.'));
    
    // Get map terrain
    const map = battleState.map || require('./riverCrossing').createMap();
    
    // Mark terrain within viewport
    Object.entries(map.terrain || {}).forEach(([terrainType, coords]) => {
        coords.forEach(coord => {
            const pos = parseCoord(coord);
            
            // Check if in viewport
            if (pos.row >= viewport.startRow && pos.row <= viewport.endRow &&
                pos.col >= viewport.startCol && pos.col <= viewport.endCol) {
                
                const viewRow = pos.row - viewport.startRow;
                const viewCol = pos.col - viewport.startCol;
                
                const symbol = {
                    river: '~',
                    ford: '=',
                    hill: '^',
                    forest: 'T',
                    marsh: '%',
                    road: '#'
                }[terrainType] || '.';
                
                grid[viewRow][viewCol] = symbol;
            }
        });
    });
    
    // Mark friendly units (visible)
    const friendlyUnits = playerSide === 'player1' 
        ? battleState.player1.unitPositions 
        : battleState.player2.unitPositions;
    
    friendlyUnits.forEach(unit => {
        const occupied = calculateOccupiedTiles(unit);
        occupied.forEach(tileCoord => {
            const pos = parseCoord(tileCoord);
            if (pos.row >= viewport.startRow && pos.row <= viewport.endRow &&
                pos.col >= viewport.startCol && pos.col <= viewport.endCol) {
                
                const viewRow = pos.row - viewport.startRow;
                const viewCol = pos.col - viewport.startCol;
                grid[viewRow][viewCol] = '1'; // Or unit-specific icon
            }
        });
    });
    
    // Mark enemy units (only if visible via fog of war)
    const enemyUnits = playerSide === 'player1'
        ? battleState.player2.unitPositions
        : battleState.player1.unitPositions;
    
    const { getVisibleEnemyUnits } = require('../fogOfWar');
    const visibleEnemies = getVisibleEnemyUnits(friendlyUnits, enemyUnits, map);
    
    visibleEnemies.forEach(unit => {
        const pos = parseCoord(unit.position);
        if (pos.row >= viewport.startRow && pos.row <= viewport.endRow &&
            pos.col >= viewport.startCol && pos.col <= viewport.endCol) {
            
            const viewRow = pos.row - viewport.startRow;
            const viewCol = pos.col - viewport.startCol;
            grid[viewRow][viewCol] = '2'; // Enemy icon
        }
    });
    
    // Build ASCII output with column labels
    return formatGridWithLabels(grid, viewport);
}

/**
 * Generate operational map (50m effective tiles, compressed view)
 */
function generateOperationalMap(battleState, centerCoord, playerSide) {
    // Compress 2×2 tactical tiles into 1 operational tile
    // Shows 30×30 tactical area as 15×15 operational display
    
    const tacticalViewport = calculateViewport(centerCoord, 40, 30);
    const grid = Array(15).fill(null).map(() => Array(15).fill('.'));
    
    // Compress every 2×2 tactical block into 1 operational tile
    for (let opRow = 0; opRow < 15; opRow++) {
        for (let opCol = 0; opCol < 15; opCol++) {
            const tacticalRow = tacticalViewport.startRow + (opRow * 2);
            const tacticalCol = tacticalViewport.startCol + (opCol * 2);
            
            // Sample dominant terrain from 2×2 tactical tiles
            const terrain = getDominantTerrain(battleState.map, tacticalRow, tacticalCol);
            grid[opRow][opCol] = terrain;
        }
    }
    
    // Add unit groups (compress multiple units to single icon)
    // ... similar logic but showing unit groups not individuals
    
    return formatGridWithLabels(grid, tacticalViewport);
}

/**
 * Format grid with column/row labels for Discord
 */
function formatGridWithLabels(grid, viewport) {
    const colStart = viewport.startCol;
    const rowStart = viewport.startRow;
    
    // Column headers (handle AA, AB, etc.)
    let header = '   ';
    for (let col = colStart; col < colStart + 15; col++) {
        const colLabel = coordToString({row: 0, col}).match(/[A-Z]+/)[0];
        header += colLabel.padEnd(2, ' ');
    }
    
    let ascii = header.trim() + '\n';
    ascii += '  ┌' + '─'.repeat(29) + '┐\n';
    
    for (let row = 0; row < 15; row++) {
        const actualRow = rowStart + row + 1; // 1-indexed
        const rowLabel = actualRow.toString().padStart(2, ' ');
        ascii += `${rowLabel}│`;
        ascii += grid[row].join(' ');
        ascii += `│${rowLabel}\n`;
    }
    
    ascii += '  └' + '─'.repeat(29) + '┘\n';
    return ascii;
}
```

### **Add auto-zoom logic:**
```javascript
/**
 * Determine appropriate zoom level based on army proximity
 */
function determineAutoZoom(battleState) {
    const distance = calculateArmyDistance(battleState);
    
    if (distance > 20) {
        return 'operational'; // Armies far apart
    } else if (distance > 10) {
        return 'transitional'; // Can see each other but not engaged
    } else {
        return 'tactical'; // Close combat range
    }
}

/**
 * Calculate distance between two armies (closest units)
 */
function calculateArmyDistance(battleState) {
    const p1Units = battleState.player1.unitPositions;
    const p2Units = battleState.player2.unitPositions;
    
    let minDist = Infinity;
    
    p1Units.forEach(u1 => {
        p2Units.forEach(u2 => {
            const dist = calculateDistance(u1.position, u2.position);
            minDist = Math.min(minDist, dist);
        });
    });
    
    return minDist;
}
```

### **Acceptance Criteria:**
- [ ] 15×15 viewport centers on any coordinate
- [ ] Tactical map shows 25m detail
- [ ] Operational map compresses 2×2 tiles
- [ ] Auto-zoom switches at 10-tile threshold
- [ ] Column labels handle AA-AN coordinates

---

## TASK 6: Update All Map Definitions (4-5 hours)

### **Objective:** Rescale all 6 scenario maps from 20×20 to 40×40

### **Files to Modify:**

**`src/game/maps/riverCrossing.js`**
**`src/game/maps/bridgeControl.js`**
**`src/game/maps/forestAmbush.js`**
**`src/game/maps/hillFortAssault.js`**
**`src/game/maps/desertOasis.js`**
Plus 1 more if exists

### **Process for each map:**

1. **Double all coordinates:**
   - River at rows 7-8 → becomes rows 14-16
   - Hills at D3-F5 → becomes H6-L10
   - Starting positions E1-E3 → becomes J2-J6

2. **Scale terrain features:**
   - 3-tile wide river → 6-tile wide river
   - 2×2 hill cluster → 4×4 hill cluster
   - Ford at 1 tile → ford at 2 tiles (wider crossing)

3. **Update starting positions:**
   - Player 1: Northwest quadrant (A1 to T20)
   - Player 2: Southeast quadrant (U21 to AN40)
   - Distance apart: 20-30 tiles (500m-750m)

### **Example: River Crossing Rescale**

**OLD (20×20):**
```javascript
createMap() {
    return {
        name: 'River Crossing',
        gridSize: 15,
        terrain: {
            river: ['G7','H7','I7','J7','K7','G8','H8','I8','J8','K8'],
            ford: ['I7','I8'],
            startingPositions: {
                player1: ['E2','F2','G2'],
                player2: ['K14','L14','M14']
            }
        }
    };
}
```

**NEW (40×40):**
```javascript
createMap() {
    return {
        name: 'River Crossing',
        gridSize: 40,
        terrain: {
            river: [
                // Double width, double position
                'N14','O14','P14','Q14','R14','S14','T14',
                'N15','O15','P15','Q15','R15','S15','T15',
                'N16','O16','P16','Q16','R16','S16','T16'
            ],
            ford: ['Q14','Q15','Q16'], // 3-tile wide ford
            startingPositions: {
                player1: ['J4','K4','L4','M4'], // 4 units in line
                player2: ['T30','U30','V30','W30'] // Far south
            }
        }
    };
}
```

### **Acceptance Criteria:**
- [ ] All 6 maps rescaled to 40×40
- [ ] Terrain features proportionally larger
- [ ] Starting positions 20-30 tiles apart
- [ ] Fords/bridges appropriately sized

---

## TASK 7: Direction Tracking & Flanking (3-4 hours)

### **Objective:** Track unit facing, calculate flanking from adjacent enemies

### **Files to Modify:**

**`src/database/models/Battle.js`**
```javascript
// Add to unit state in turnState JSON:
{
    unitId: 'p1_inf',
    position: 'H11',
    facing: 'S',              // NEW: N/S/E/W
    formationStatus: 'deployed', // NEW: marching/deployed/encamped
    tilesOccupied: ['H11'],   // NEW: Array for march columns
    // ... existing fields
}
```

**`src/game/positionBasedCombat.js`**

**Update `calculateFlankingBonus()`:**
```javascript
function calculateFlankingBonus(attacker, defender, allUnits) {
    const defenderPos = parseCoord(defender.position);
    const adjacent = getAdjacentCoords(defender.position);
    
    // Count enemy units adjacent to defender
    const adjacentEnemies = allUnits.filter(unit =>
        unit.side !== defender.side &&
        adjacent.includes(unit.position)
    );
    
    const attackDirections = adjacentEnemies.length;
    
    // Flanking based on number of attack directions
    if (attackDirections === 1) return 0;      // Front only
    if (attackDirections === 2) return +3;     // Flanked
    if (attackDirections === 3) return +6;     // U-shape
    if (attackDirections >= 4) return +8;      // Surrounded
    
    return 0;
}
```

**Add facing-based formation bonuses:**
```javascript
function getFormationDefenseBonus(defender, attackDirection) {
    const { facing, formation } = defender;
    
    if (formation === 'phalanx') {
        // Phalanx strong to front, weak to flanks
        if (attackDirection === facing) {
            return +8; // Front facing attack
        } else if (isFlankDirection(attackDirection, facing)) {
            return -6; // Side attack
        } else {
            return -8; // Rear attack
        }
    }
    
    // Other formations...
    return 0;
}

function isFlankDirection(attackDir, unitFacing) {
    // Perpendicular = flank
    if (unitFacing === 'N' || unitFacing === 'S') {
        return attackDir === 'E' || attackDir === 'W';
    } else {
        return attackDir === 'N' || attackDir === 'S';
    }
}
```

### **Acceptance Criteria:**
- [ ] Units track facing direction
- [ ] Flanking bonus scales with adjacent enemies (0/+3/+6/+8)
- [ ] Formation bonuses apply directionally
- [ ] Briefings show unit facing in text

---

## TASK 8: Map Commands (2 hours)

### **Objective:** Player control over viewport

### **File to Create:**

**`src/bot/commands/map.js`** (already exists, enhance it)

**Add subcommands:**
```javascript
// /map - Auto-zoom, commander-centered (default)
// /map tactical - Force tactical zoom
// /map operational - Force operational zoom  
// /map focus H20 - Center on coordinate
// /map pan north - Move viewport north 5 tiles
// /map follow - Re-enable auto-follow (default)
// /map lock - Disable auto-follow, stay at current view
```

**Implementation:**
```javascript
async function execute(interaction) {
    const subcommand = interaction.options.getString('view') || 'auto';
    const battle = await getCurrentBattle(interaction.user.id);
    
    let centerCoord, zoomLevel;
    
    switch(subcommand) {
        case 'tactical':
            zoomLevel = 'tactical';
            centerCoord = battle.getCommanderPosition(interaction.user.id);
            break;
            
        case 'operational':
            zoomLevel = 'operational';
            centerCoord = battle.getCommanderPosition(interaction.user.id);
            break;
            
        case 'focus':
            const coord = interaction.options.getString('coordinate');
            centerCoord = coord;
            zoomLevel = battle.playerPrefs[interaction.user.id].zoom || 'auto';
            break;
            
        default: // 'auto'
            zoomLevel = determineAutoZoom(battle.battleState);
            centerCoord = battle.getCommanderPosition(interaction.user.id);
    }
    
    const map = zoomLevel === 'tactical'
        ? generateTacticalMap(battle.battleState, centerCoord, getPlayerSide(interaction.user.id))
        : generateOperationalMap(battle.battleState, centerCoord, getPlayerSide(interaction.user.id));
    
    await interaction.reply({ content: map, ephemeral: true });
}
```

### **Acceptance Criteria:**
- [ ] `/map` shows appropriate zoom
- [ ] `/map tactical` forces 25m view
- [ ] `/map operational` forces 50m view
- [ ] `/map focus H20` pans viewport
- [ ] Auto-zoom at 10-tile threshold

---

## TASK 9: Marching Column Movement (4-5 hours)

### **Objective:** Units in march formation occupy 4 tiles, move as column

### **File to Modify:**

**`src/game/movementSystem.js`**

**Add march column movement:**
```javascript
async function executeMarchMovement(unit, targetPosition, map, allUnits) {
    // Unit occupies 4 tiles: front, second, third, rear
    const currentTiles = calculateOccupiedTiles(unit);
    
    // Calculate path for lead element
    const leadTile = currentTiles[0]; // Front of column
    const path = await calculatePath(leadTile, targetPosition, map);
    
    // Check if path clear for entire column
    for (let i = 0; i < Math.min(4, path.length); i++) {
        const checkTile = path[i];
        const stacking = checkStackingViolation(checkTile, unit, allUnits);
        
        if (!stacking.allowed) {
            return {
                success: false,
                reason: `Path blocked at ${checkTile}: ${stacking.reason}`
            };
        }
    }
    
    // Move column: Each tile advances along path
    const newTiles = [];
    for (let i = 0; i < 4; i++) {
        if (path[i]) {
            newTiles.push(path[i]);
        }
    }
    
    // Update unit position (front of column)
    unit.position = newTiles[0];
    unit.tilesOccupied = newTiles;
    
    // Apply movement bonus for marching
    const movementUsed = path.length / 1.5; // 50% faster when marching
    
    return {
        success: true,
        newPosition: unit.position,
        tilesOccupied: newTiles,
        movementUsed
    };
}
```

### **Acceptance Criteria:**
- [ ] March columns occupy 4 sequential tiles
- [ ] Columns move together maintaining formation
- [ ] Pathfinding accounts for column length
- [ ] 50% movement bonus when marching
- [ ] Ambush hits front of column first

---

## TASK 10: Integration & Testing (3-4 hours)

### **Objective:** Ensure all systems work together

### **Test Scenarios:**

**Test 1: Full Operational Movement**
```javascript
// armies start 30 tiles apart
// Turn 1-3: March toward each other (operational zoom)
// Turn 4: Scouts detect (10 tiles apart, auto-switch tactical)
// Turn 5: Deploy formations
// Turn 6+: Tactical combat
```

**Test 2: March Column Ambush**
```javascript
// P1: March column 4 tiles long
// P2: Ambush from forest
// Verify: Only front 100 warriors fight Turn 1
// Turn 2: Second section deploys
// Turn 3: Full unit deployed
```

**Test 3: Stacking During Combat**
```javascript
// Two deployed units, one gets pushed into other
// Verify: FORBIDDEN, pushing unit takes +25% casualties
// Verify: Push redirects to adjacent empty tile if available
```

**Test 4: Viewport Pan & Zoom**
```javascript
// Commander at A5, enemy at AN35
// /map shows A1-O15 (commander visible, enemy not)
// /map focus AN35 shows enemy area
// /map operational shows compressed overview with both armies
```

### **Files to Test:**
- Complete battle flow with new grid
- Movement through columns
- Deploy mechanics
- Combat at borders
- Viewport system

---

## Breaking Changes & Migration

### **Database Migration Required:**

**Old battles incompatible because:**
- Coordinates use 15×15 grid (A1-O15)
- Unit sizes are 100 warriors
- No formation status tracking

**Options:**
1. **Hard reset:** Mark all battles complete, fresh start
2. **Migration script:** Convert old coords to new (multiply by ~2.67)
3. **Dual system:** Old battles use legacy code, new use new system

**Recommendation:** Hard reset (project is early, clean slate better)

### **All Map-Dependent Code:**

**Must verify these don't break:**
- `briefingGenerator.js` - References coordinates in text
- `battleInitializer.js` - Sets starting positions
- `turnOrchestrator.js` - Processes movement
- Any hardcoded coordinate checks

---

## Implementation Order

**Week 1:**
1. TASK 1: Unit size scaling (1hr)
2. TASK 2: Coordinate system (3-4hr)
3. TASK 3: Vision/movement ranges (2hr)

**Week 2:**
4. TASK 6: Rescale all maps (4-5hr)
5. TASK 4: Formation status system (5-6hr)

**Week 3:**
6. TASK 5: Viewport system (5-6hr)
7. TASK 7: Direction & flanking (3-4hr)

**Week 4:**
8. TASK 9: March columns (4-5hr)
9. TASK 8: Map commands (2hr)
10. TASK 10: Integration testing (3-4hr)

**Total: 32-40 hours over 4 weeks**

---

## Phase 2 Considerations (Future)

Since you're just scaling unit sizes 4×, Phase 2 is **already done** with Phase 1:
- 300-400 warrior units → gives you 1,200-1,600 per army
- Close enough to 2000 target
- No additional work needed

**Unless you want actual 2000, then:**
- Add 1 more unit slot (4→5 units)
- 5 × 400 = 2,000 exactly

---

## Risk Assessment

**Low Risk:**
- Unit size scaling (just numbers)
- Coordinate system (self-contained)
- Map rescaling (tedious but straightforward)

**Medium Risk:**
- Formation status (new system, many interactions)
- Viewport (UI complexity)
- March columns (pathfinding complexity)

**High Risk:**
- Stacking penalties (edge cases everywhere)
- Combat at borders vs tile centers (conceptual shift for AI)
- All changes happening simultaneously (integration bugs)

**Mitigation:** Implement in order listed, test each task before next

---

**Ready to hand off to Warp?** Or need any clarifications?
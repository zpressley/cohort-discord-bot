// src/game/maps/mapUtils.js
// Core utilities for grid-based tactical combat

const UNIT_EMOJIS = {
    friendly: {
        infantry: '🟦',    // Blue square
        cavalry: '🔵',     // Blue circle
        commander: '🔷'    // Blue diamond (commander/elite)
    },
    
    enemy: {
        infantry: '🟧',    // Orange square
        cavalry: '🟠',     // Orange circle
        commander: '🔶'    // Orange diamond
    }
};

/**
 * Parse grid coordinate string to {row, col} object
 */
function parseCoord(coord) {
    if (!coord || typeof coord !== 'string') {
        throw new Error(`Invalid coordinate: ${coord}`);
    }
    
    const match = coord.match(/^([A-T])(\d+)$/);
    if (!match) {
        throw new Error(`Invalid coordinate format: ${coord}. Expected A1-T20.`);
    }
    
    const col = match[1].charCodeAt(0) - 65; // A=0, B=1, ..., T=19
    const row = parseInt(match[2]) - 1; // 1-indexed to 0-indexed
    
    if (row < 0 || row > 19 || col < 0 || col > 19) {
        throw new Error(`Coordinate out of bounds: ${coord}`);
    }
    
    return { row, col };
}

/**
 * Convert {row, col} object to grid coordinate string
 */
function coordToString(pos) {
    const col = String.fromCharCode(65 + pos.col); // 0=A, 1=B, ..., 19=T
    const row = pos.row + 1; // 0-indexed to 1-indexed
    return `${col}${row}`;
}

/**
 * Calculate distance between two coordinates (Chebyshev distance)
 */
function calculateDistance(from, to) {
    const fromPos = parseCoord(from);
    const toPos = parseCoord(to);
    
    const dx = Math.abs(toPos.col - fromPos.col);
    const dy = Math.abs(toPos.row - fromPos.row);
    
    return Math.max(dx, dy);
}

/**
 * Calculate Euclidean distance for detection ranges
 */
function calculateEuclideanDistance(from, to) {
    const fromPos = parseCoord(from);
    const toPos = parseCoord(to);
    
    const dx = toPos.col - fromPos.col;
    const dy = toPos.row - fromPos.row;
    
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get all adjacent coordinates (8 directions)
 */
function getAdjacentCoords(coord) {
    const pos = parseCoord(coord);
    const adjacent = [];
    
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            
            const newRow = pos.row + dr;
            const newCol = pos.col + dc;
            
            if (newRow >= 0 && newRow <= 19 && newCol >= 0 && newCol <= 19) {
                adjacent.push(coordToString({ row: newRow, col: newCol }));
            }
        }
    }
    
    return adjacent;
}

/**
 * Get all coordinates within range
 */
function getCoordsInRange(center, range) {
    const centerPos = parseCoord(center);
    const coords = [];
    
    for (let row = 0; row <= 19; row++) {
        for (let col = 0; col <= 19; col++) {
            const testCoord = coordToString({ row, col });
            const dist = calculateDistance(center, testCoord);
            
            if (dist <= range && dist > 0) {
                coords.push(testCoord);
            }
        }
    }
    
    return coords;
}

/**
 * Calculate movement path between two points
 */
function calculatePath(from, to, terrainMap) {
    const start = parseCoord(from);
    const end = parseCoord(to);
    
    const path = [from];
    let current = { ...start };
    
    while (current.row !== end.row || current.col !== end.col) {
        if (current.row < end.row) current.row++;
        else if (current.row > end.row) current.row--;
        
        if (current.col < end.col) current.col++;
        else if (current.col > end.col) current.col--;
        
        const coord = coordToString(current);
        path.push(coord);
    }
    
    return path;
}

/**
 * Calculate total movement cost for a path
 */
function calculatePathCost(path, terrainCosts, getTerrainType) {
    let totalCost = 0;
    
    for (let i = 1; i < path.length; i++) {
        const terrain = getTerrainType(path[i]);
        const cost = terrainCosts[terrain] || 1;
        totalCost += cost;
    }
    
    return totalCost;
}

/**
 * Check if coordinate is on the map
 */
function isValidCoord(coord) {
    try {
        const pos = parseCoord(coord);
        return pos.row >= 0 && pos.row <= 19 && pos.col >= 0 && pos.col <= 19;
    } catch {
        return false;
    }
}

/**
 * Get direction from one coordinate to another
 */
function getDirection(from, to) {
    const fromPos = parseCoord(from);
    const toPos = parseCoord(to);
    
    const dx = toPos.col - fromPos.col;
    const dy = toPos.row - fromPos.row;
    
    if (dx === 0 && dy < 0) return 'north';
    if (dx === 0 && dy > 0) return 'south';
    if (dx > 0 && dy === 0) return 'east';
    if (dx < 0 && dy === 0) return 'west';
    
    if (dx > 0 && dy < 0) return 'northeast';
    if (dx > 0 && dy > 0) return 'southeast';
    if (dx < 0 && dy < 0) return 'northwest';
    if (dx < 0 && dy > 0) return 'southwest';
    
    return 'same position';
}

/**
 * Determine unit emoji based on type and side
 */
function getUnitEmoji(unit, side = 'friendly') {
    const emojis = UNIT_EMOJIS[side];
    
    // Commander/Elite always diamond
    if (unit.isCommander || unit.isElite) {
        return emojis.commander;
    }
    
    const type = (unit.unitType || '').toLowerCase();
    
    // Cavalry = circle
    if (type.includes('cavalry') || type.includes('mounted') || type.includes('horse')) {
        return emojis.cavalry;
    }
    
    // Default: Infantry = square
    return emojis.infantry;
}

/**
 * Get emoji for stacked units (shows dominant type)
 */
function getStackedEmoji(units, side) {
    // Commander present = always show commander diamond
    const commander = units.find(u => u.isCommander || u.isElite);
    if (commander) {
        return UNIT_EMOJIS[side].commander;
    }
    
    // Find dominant type by strength
    const typeTotals = { cavalry: 0, infantry: 0 };
    
    units.forEach(unit => {
        const type = (unit.unitType || '').toLowerCase();
        const strength = unit.currentStrength || 0;
        
        if (type.includes('cavalry') || type.includes('mounted')) {
            typeTotals.cavalry += strength;
        } else {
            typeTotals.infantry += strength;
        }
    });
    
    // Return dominant type
    return typeTotals.cavalry > typeTotals.infantry 
        ? UNIT_EMOJIS[side].cavalry 
        : UNIT_EMOJIS[side].infantry;
}

/**
 * Generate ASCII map (legacy/fallback version)
 */
function generateASCIIMap(mapData) {
    const grid = Array(20).fill(null).map(() => Array(20).fill('.'));
    
    // Mark terrain
    if (mapData.terrain.river) {
        mapData.terrain.river.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '~';
        });
    }
    
    if (mapData.terrain.fords) {
        mapData.terrain.fords.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '=';
        });
    }
    
    if (mapData.terrain.hill) {
        mapData.terrain.hill.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '^';
        });
    }
    
    if (mapData.terrain.marsh) {
        mapData.terrain.marsh.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '%';
        });
    }
    
    if (mapData.terrain.road) {
        mapData.terrain.road.forEach(coord => {
            const pos = parseCoord(coord);
            if (grid[pos.row][pos.col] === '.') {
                grid[pos.row][pos.col] = '#';
            }
        });
    }
    
    if (mapData.terrain.forest) {
        mapData.terrain.forest.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = 'T';
        });
    }
    
    // Mark player units as simple numbers
    if (mapData.player1Units) {
        mapData.player1Units.forEach(unit => {
            const pos = parseCoord(unit.position);
            grid[pos.row][pos.col] = '1';
        });
    }
    
    if (mapData.player2Units) {
        mapData.player2Units.forEach(unit => {
            const pos = parseCoord(unit.position);
            grid[pos.row][pos.col] = '2';
        });
    }
    
    // Build map string
    let ascii = '    A B C D E F G H I J K L M N O P Q R S T\n';
    ascii += '   ──────────────────────────────────────────\n';
    
    for (let row = 0; row < 20; row++) {
        const rowNum = (row + 1).toString().padStart(2, ' ');
        ascii += `${rowNum} │`;
        ascii += grid[row].join(' ');
        ascii += `│ ${rowNum}\n`;
    }
    
    ascii += '   ──────────────────────────────────────────\n';
    ascii += '    A B C D E F G H I J K L M N O P Q R S T\n\n';
    ascii += 'Legend: . plains, ~ river, = ford, ^ hill, % marsh, # road, T forest, 1 P1, 2 P2';
    
    return ascii;
}

/**
 * A* Pathfinding - finds optimal path around obstacles
 */
function findPathAStar(from, to, terrainMap, getTerrainType) {
    const start = parseCoord(from);
    const goal = parseCoord(to);
    
    const openSet = [{ coord: from, f: 0, g: 0, h: 0 }];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(from, 0);
    
    const movementCosts = terrainMap.movementCosts || {
        plains: 1.0,
        road: 0.5,
        hill: 1.5,
        forest: 2.0,
        marsh: 3.0,
        river: 999,
        ford: 1.5
    };
    
    const heuristic = (coordStr) => {
        const pos = parseCoord(coordStr);
        return Math.abs(goal.col - pos.col) + Math.abs(goal.row - pos.row);
    };
    
    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        
        if (current.coord === to) {
            const path = reconstructPath(cameFrom, current.coord);
            const cost = gScore.get(current.coord);
            return { path, cost, valid: true };
        }
        
        closedSet.add(current.coord);
        const neighbors = getAdjacentCoords(current.coord);
        
        for (const neighbor of neighbors) {
            if (closedSet.has(neighbor)) continue;
            
            const terrain = getTerrainType(neighbor, terrainMap);
            const moveCost = movementCosts[terrain] || 1.0;
            
            if (moveCost >= 999) continue;
            
            const tentativeG = gScore.get(current.coord) + moveCost;
            
            if (!gScore.has(neighbor) || tentativeG < gScore.get(neighbor)) {
                cameFrom.set(neighbor, current.coord);
                gScore.set(neighbor, tentativeG);
                
                const h = heuristic(neighbor);
                const f = tentativeG + h;
                
                const existingNode = openSet.find(n => n.coord === neighbor);
                if (existingNode) {
                    existingNode.g = tentativeG;
                    existingNode.h = h;
                    existingNode.f = f;
                } else {
                    openSet.push({ coord: neighbor, g: tentativeG, h: h, f: f });
                }
            }
        }
    }
    
    return { 
        path: [from], 
        cost: 0, 
        valid: false, 
        reason: 'No path found - impassable terrain blocks all routes' 
    };
}

function reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        path.unshift(current);
    }
    return path;
}

/**
 * Generate emoji-based map
 */
function generateEmojiMap(mapData) {
    const grid = Array(20).fill(null).map(() => Array(20).fill('.'));
    
    // Mark terrain
    if (mapData.terrain.river) {
        mapData.terrain.river.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '~';
        });
    }
    
    if (mapData.terrain.fords) {
        mapData.terrain.fords.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '=';
        });
    }
    
    if (mapData.terrain.hill) {
        mapData.terrain.hill.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '^';
        });
    }
    
    if (mapData.terrain.marsh) {
        mapData.terrain.marsh.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '%';
        });
    }
    
    if (mapData.terrain.road) {
        mapData.terrain.road.forEach(coord => {
            const pos = parseCoord(coord);
            if (grid[pos.row][pos.col] === '.') {
                grid[pos.row][pos.col] = '#';
            }
        });
    }
    
    if (mapData.terrain.forest) {
        mapData.terrain.forest.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = 'T';
        });
    }
    
    // Group units by position
    const tileUnits = new Map();
    
    if (mapData.player2Units) {
        mapData.player2Units.forEach(unit => {
            if (!tileUnits.has(unit.position)) {
                tileUnits.set(unit.position, { friendly: [], enemy: [] });
            }
            tileUnits.get(unit.position).enemy.push(unit);
        });
    }
    
    if (mapData.player1Units) {
        mapData.player1Units.forEach(unit => {
            if (!tileUnits.has(unit.position)) {
                tileUnits.set(unit.position, { friendly: [], enemy: [] });
            }
            tileUnits.get(unit.position).friendly.push(unit);
        });
    }
    
    // Place emojis (friendly overwrites enemy)
    tileUnits.forEach((units, position) => {
        const pos = parseCoord(position);
        
        if (units.enemy.length > 0 && units.friendly.length === 0) {
            grid[pos.row][pos.col] = getStackedEmoji(units.enemy, 'enemy');
        }
        
        if (units.friendly.length > 0) {
            grid[pos.row][pos.col] = getStackedEmoji(units.friendly, 'friendly');
        }
    });
    
    // Build map string
    let ascii = '    A B C D E F G H I J K L M N O P Q R S T\n';
    ascii += '   ──────────────────────────────────────────\n';
    
    for (let row = 0; row < 20; row++) {
        const rowNum = (row + 1).toString().padStart(2, ' ');
        ascii += `${rowNum} │`;
        ascii += grid[row].join(' ');
        ascii += `│ ${rowNum}\n`;
    }
    
    ascii += '   ──────────────────────────────────────────\n';
    ascii += '    A B C D E F G H I J K L M N O P Q R S T\n\n';
    ascii += 'Terrain: . plains, ~ river, = ford, ^ hill, % marsh, # road, T forest';
    
    return ascii;
}

module.exports = {
    parseCoord,
    coordToString,
    calculateDistance,
    calculateEuclideanDistance,
    getAdjacentCoords,
    getCoordsInRange,
    calculatePath,
    calculatePathCost,
    isValidCoord,
    generateASCIIMap,
    generateEmojiMap,
    getUnitEmoji,
    getStackedEmoji,
    getDirection,
    UNIT_EMOJIS
};
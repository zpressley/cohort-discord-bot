// src/game/maps/mapUtils.js
// Core utilities for grid-based tactical combat

/**
 * Parse grid coordinate string to {row, col} object
 * @param {string} coord - Grid coordinate like "H11" or "A1"
 * @returns {Object} {row: number, col: number}
 */
function parseCoord(coord) {
    if (!coord || typeof coord !== 'string') {
        throw new Error(`Invalid coordinate: ${coord}`);
    }
    
    const match = coord.match(/^([A-O])(\d+)$/);
    if (!match) {
        throw new Error(`Invalid coordinate format: ${coord}. Expected A1-O15.`);
    }
    
    const col = match[1].charCodeAt(0) - 65; // A=0, B=1, ..., O=14
    const row = parseInt(match[2]) - 1; // 1-indexed to 0-indexed
    
    if (row < 0 || row > 14 || col < 0 || col > 14) {
        throw new Error(`Coordinate out of bounds: ${coord}`);
    }
    
    return { row, col };
}

/**
 * Convert {row, col} object to grid coordinate string
 * @param {Object} pos - Position object with row and col
 * @returns {string} Grid coordinate like "H11"
 */
function coordToString(pos) {
    const col = String.fromCharCode(65 + pos.col); // 0=A, 1=B, ..., 14=O
    const row = pos.row + 1; // 0-indexed to 1-indexed
    return `${col}${row}`;
}

/**
 * Calculate distance between two coordinates (Chebyshev distance)
 * Diagonal movement counts as 1 move (king's move in chess)
 * @param {string} from - Start coordinate
 * @param {string} to - End coordinate  
 * @returns {number} Number of moves required
 */
function calculateDistance(from, to) {
    const fromPos = parseCoord(from);
    const toPos = parseCoord(to);
    
    const dx = Math.abs(toPos.col - fromPos.col);
    const dy = Math.abs(toPos.row - fromPos.row);
    
    // Chebyshev distance: diagonal counts as 1
    return Math.max(dx, dy);
}

/**
 * Calculate Euclidean distance for detection ranges
 * @param {string} from - Start coordinate
 * @param {string} to - End coordinate
 * @returns {number} Straight-line distance
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
 * @param {string} coord - Center coordinate
 * @returns {Array<string>} Array of adjacent coordinates
 */
function getAdjacentCoords(coord) {
    const pos = parseCoord(coord);
    const adjacent = [];
    
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue; // Skip center
            
            const newRow = pos.row + dr;
            const newCol = pos.col + dc;
            
            if (newRow >= 0 && newRow <= 14 && newCol >= 0 && newCol <= 14) {
                adjacent.push(coordToString({ row: newRow, col: newCol }));
            }
        }
    }
    
    return adjacent;
}

/**
 * Get all coordinates within range (detection/movement)
 * @param {string} center - Center coordinate
 * @param {number} range - Range in tiles
 * @returns {Array<string>} All coordinates within range
 */
function getCoordsInRange(center, range) {
    const centerPos = parseCoord(center);
    const coords = [];
    
    for (let row = 0; row <= 14; row++) {
        for (let col = 0; col <= 14; col++) {
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
 * Returns array of coordinates for movement
 * @param {string} from - Start position
 * @param {string} to - Target position
 * @param {Object} terrainMap - Map terrain data for pathfinding
 * @returns {Array<string>} Path coordinates
 */
function calculatePath(from, to, terrainMap) {
    const start = parseCoord(from);
    const end = parseCoord(to);
    
    // Simple straight-line path (can be upgraded to A* pathfinding later)
    const path = [from];
    let current = { ...start };
    
    while (current.row !== end.row || current.col !== end.col) {
        // Move toward target (diagonal when possible)
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
 * @param {Array<string>} path - Array of coordinates
 * @param {Object} terrainCosts - Movement cost per terrain type
 * @param {Function} getTerrainType - Function to get terrain at coordinate
 * @returns {number} Total movement cost
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
 * @param {string} coord - Coordinate to check
 * @returns {boolean} True if valid
 */
function isValidCoord(coord) {
    try {
        const pos = parseCoord(coord);
        return pos.row >= 0 && pos.row <= 14 && pos.col >= 0 && pos.col <= 14;
    } catch {
        return false;
    }
}

/**
 * Generate ASCII map representation for debugging/AI
 * @param {Object} mapData - Map terrain and unit positions
 * @returns {string} ASCII art map
 */
function generateASCIIMap(mapData) {
    const grid = Array(15).fill(null).map(() => Array(15).fill('.'));
    
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
    
    console.log('DEBUG generateASCIIMap input:');
    console.log('  player1Units type:', typeof mapData.player1Units, 'isArray:', Array.isArray(mapData.player1Units));
    console.log('  player1Units length:', mapData.player1Units?.length);
    console.log('  player2Units type:', typeof mapData.player2Units, 'isArray:', Array.isArray(mapData.player2Units));
    console.log('  player2Units length:', mapData.player2Units?.length);
    
    // Mark player units
    if (mapData.player1Units) {
        console.log('  Iterating player1Units...');
        mapData.player1Units.forEach((unit, index) => {
            console.log(`    Unit ${index}:`, typeof unit, 'has position?', !!unit.position, 'position value:', unit.position);
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
    
    // Build ASCII string
    let ascii = '    A B C D E F G H I J K L M N O\n';
    ascii += '   ' + '─'.repeat(31) + '\n';
    
    for (let row = 0; row < 15; row++) {
        const rowNum = (row + 1).toString().padStart(2, ' ');
        ascii += `${rowNum} │`;
        ascii += grid[row].join(' ');
        ascii += `│ ${rowNum}\n`;
    }
    
    ascii += '   ' + '─'.repeat(31) + '\n';
    ascii += '    A B C D E F G H I J K L M N O\n\n';
    ascii += 'Legend: . plains, ~ river, = ford, ^ hill, % marsh, # road, T forest, 1 P1, 2 P2';
    
    return ascii;
}

/**
 * Get direction from one coordinate to another
 * @param {string} from - Start coordinate
 * @param {string} to - Target coordinate
 * @returns {string} Cardinal/intercardinal direction
 */
function getDirection(from, to) {
    const fromPos = parseCoord(from);
    const toPos = parseCoord(to);
    
    const dx = toPos.col - fromPos.col;
    const dy = toPos.row - fromPos.row;
    
    // Cardinal directions
    if (dx === 0 && dy < 0) return 'north';
    if (dx === 0 && dy > 0) return 'south';
    if (dx > 0 && dy === 0) return 'east';
    if (dx < 0 && dy === 0) return 'west';
    
    // Intercardinal directions
    if (dx > 0 && dy < 0) return 'northeast';
    if (dx > 0 && dy > 0) return 'southeast';
    if (dx < 0 && dy < 0) return 'northwest';
    if (dx < 0 && dy > 0) return 'southwest';
    
    return 'same position';
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
    getDirection
};
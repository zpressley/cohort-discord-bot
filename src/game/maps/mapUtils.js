

/**
 * Parse grid coordinate string to {row, col} object
 * Supports 20x20 maps (A1-T20)
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
 * Simple straight-line path (legacy)
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
        
        path.push(coordToString(current));
    }
    
    return path;
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
        plains: 1.0, road: 0.5, hill: 1.5, forest: 2.0,
        marsh: 3.0, river: 999, ford: 1.5
    };
    
    const heuristic = (coordStr) => {
        const pos = parseCoord(coordStr);
        return Math.abs(goal.col - pos.col) + Math.abs(goal.row - pos.row);
    };
    
    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        
        if (current.coord === to) {
            return reconstructPath(cameFrom, current.coord, from);
        }
        
        closedSet.add(current.coord);
        
        const neighbors = getAdjacentCoords(current.coord);
        
        for (const neighbor of neighbors) {
            if (closedSet.has(neighbor)) continue;
            
            const terrain = getTerrainType(neighbor);
            const terrainCost = movementCosts[terrain] || 1.0;
            
            if (terrainCost >= 999) {
                closedSet.add(neighbor);
                continue;
            }
            
            const tentativeG = gScore.get(current.coord) + terrainCost;
            
            if (!gScore.has(neighbor) || tentativeG < gScore.get(neighbor)) {
                cameFrom.set(neighbor, current.coord);
                gScore.set(neighbor, tentativeG);
                
                const h = heuristic(neighbor);
                const f = tentativeG + h;
                
                const existing = openSet.find(n => n.coord === neighbor);
                if (existing) {
                    existing.g = tentativeG;
                    existing.h = h;
                    existing.f = f;
                } else {
                    openSet.push({ coord: neighbor, g: tentativeG, h, f });
                }
            }
        }
    }
    
    return {
        path: [],
        cost: Infinity,
        valid: false,
        reason: 'No valid path exists to target'
    };
}

/**
 * Reconstruct path from A* came-from map
 */
function reconstructPath(cameFrom, current, start) {
    const path = [current];
    
    while (current !== start) {
        current = cameFrom.get(current);
        if (!current) break;
        path.unshift(current);
    }
    
    return {
        path,
        cost: path.length - 1,
        valid: true
    };
}

/**
 * Calculate path cost
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
 * Check if coordinate is valid
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
 * Generate ASCII map - 20x20 version
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
        mapData.terrain.fords.forEach(ford => {
            const coord = typeof ford === 'string' ? ford : ford.coord;
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
    
    // Mark units
    if (mapData.player1Units && Array.isArray(mapData.player1Units)) {
        mapData.player1Units.forEach((unit, index) => {
            try {
                const position = typeof unit === 'string' ? unit : unit.position;
                if (!position || typeof position !== 'string') return;
                
                const pos = parseCoord(position);
                grid[pos.row][pos.col] = '1';
            } catch (err) {
                console.error(`Error placing P1 unit ${index}:`, err.message);
            }
        });
    }
    
    if (mapData.player2Units && Array.isArray(mapData.player2Units)) {
        mapData.player2Units.forEach((unit, index) => {
            try {
                const position = typeof unit === 'string' ? unit : unit.position;
                if (!position || typeof position !== 'string') return;
                
                const pos = parseCoord(position);
                grid[pos.row][pos.col] = '2';
            } catch (err) {
                console.error(`Error placing P2 unit ${index}:`, err.message);
            }
        });
    }
    
    // Build ASCII - 20x20
    let ascii = '    A B C D E F G H I J K L M N O P Q R S T\n';
    ascii += '   ' + '─'.repeat(41) + '\n';
    
    for (let row = 0; row < 20; row++) {
        const rowNum = (row + 1).toString().padStart(2, ' ');
        ascii += `${rowNum} │`;
        ascii += grid[row].join(' ');
        ascii += `│ ${rowNum}\n`;
    }
    
    ascii += '   ' + '─'.repeat(41) + '\n';
    ascii += '    A B C D E F G H I J K L M N O P Q R S T\n\n';
    ascii += 'Legend: . plains, ~ river, = ford, ^ hill, % marsh, # road, T forest, 1 P1, 2 P2';
    
    return ascii;
}

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
    getDirection,
    findPathAStar,  // New A* function
    reconstructPath  // Helper for A*
};
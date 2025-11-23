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
 * Calculate movement path between two points (simple straight-line)
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

// In mapUtils.js, update getUnitEmoji:

function getUnitEmoji(unit, side = 'friendly') {
    const emojis = UNIT_EMOJIS[side];
    
    if (unit.isCommander || unit.isElite) {
        return emojis.commander;
    }
    
    // Check mounted property FIRST
    if (unit.mounted === true) {
        return emojis.cavalry;
    }
    
    const type = (unit.unitType || '').toLowerCase();
    
    if (type.includes('cavalry') || type.includes('horse')) {
        return emojis.cavalry;
    }
    
    return emojis.infantry;
}

function getStackedEmoji(units, side) {
    // Commander present = always show commander diamond
    const commander = units.find(u => u.isCommander || u.isElite);
    if (commander) {
        return UNIT_EMOJIS[side].commander;
    }
    
    // Check if any unit is mounted
    const hasCavalry = units.some(u => u.mounted === true);
    if (hasCavalry) {
        return UNIT_EMOJIS[side].cavalry;
    }
    
    // Find dominant type by strength (fallback)
    const typeTotals = { cavalry: 0, infantry: 0 };
    
    units.forEach(unit => {
        const strength = unit.currentStrength || 0;
        
        if (unit.mounted) {
            typeTotals.cavalry += strength;
        } else {
            typeTotals.infantry += strength;
        }
    });
    
    return typeTotals.cavalry > typeTotals.infantry 
        ? UNIT_EMOJIS[side].cavalry 
        : UNIT_EMOJIS[side].infantry;
}

/**
 * Generate ASCII map (legacy/fallback version) - use 15x15 in all other situations. 
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
            const coordStr = typeof ford === 'string' ? ford : ford.coord;
            const pos = parseCoord(coordStr);
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
    
    // Build map
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
        road: 1.0,   // roads no longer half-cost; use standard cost
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

/**
 * Reconstruct path from A* cameFrom map
 */
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
        mapData.terrain.fords.forEach(ford => {
            // Handle both string and object formats
            const coordStr = typeof ford === 'string' ? ford : ford.coord;
            const pos = parseCoord(coordStr);
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
    
    // Build map
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

/**
 * Generate a 15x15 emoji viewport from a 20x20 map
 * view = { top: number, left: number, width: 15, height: 15 }
 */
function generateEmojiMapViewport(mapData, view, overlays = [], viewingSide) {
    if (!viewingSide) {
        throw new Error('viewingSide required for generateEmojiMapViewport');
    }
    
    const full = generateEmojiGrid(mapData, viewingSide);

    // Overlay last-known positions with 'X' if not currently showing a unit icon
    try {
        const unitEmojis = new Set([
            UNIT_EMOJIS.friendly.infantry,
            UNIT_EMOJIS.friendly.cavalry,
            UNIT_EMOJIS.friendly.commander,
            UNIT_EMOJIS.enemy.infantry,
            UNIT_EMOJIS.enemy.cavalry,
            UNIT_EMOJIS.enemy.commander
        ]);
        for (const pos of overlays || []) {
            const p = parseCoord(pos);
            if (!p) continue;
            const current = full[p.row][p.col];
            if (!unitEmojis.has(current)) {
                full[p.row][p.col] = 'X';
            }
        }
    } catch (_) {}

    const top = Math.max(0, Math.min(20 - (view.height || 15), view.top || 0));
    const left = Math.max(0, Math.min(20 - (view.width || 15), view.left || 0));
    const h = view.height || 15;
    const w = view.width || 15;

    // Column headers (top only), spaced to 2 columns per cell
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, 20).split('');
    const headerLetters = letters.slice(left, left + w).map(l => l + ' ').join('');

    // Cell renderer: keep each cell width constant (2 cols). Emoji are double-width.
    const isEmoji = (ch) => {
        if (!ch) return false;
        const cp = ch.codePointAt(0);
        return cp >= 0x1F300 && cp <= 0x1FAFF;
    };
    const cellStr = (ch) => isEmoji(ch) ? ch + '' : ch + ' ';

    let out = `   ${headerLetters}\n`;
    out += '  ┌' + '─'.repeat(w * 2) + '┐\n';
    for (let r = 0; r < h; r++) {
        const rowNum = (top + r + 1).toString().padStart(2, ' ');
        out += `${rowNum}│`;
        const rowCells = full[top + r].slice(left, left + w).map(cellStr).join('');
        out += rowCells;
        out += '│\n';
    }
    out += '  └' + '─'.repeat(w * 2) + '┘\n';
    out += 'Legend: 🔵 Yours, 🟠 Enemy, X last known, ~ river, = ford, ^ hill, T forest';
    
    return out;
}

function generateEmojiGrid(mapData, viewingSide) {
    const grid = Array(20).fill(null).map(() => Array(20).fill('.'));
    
    // Add terrain
    if (mapData.terrain.river) {
        mapData.terrain.river.forEach(c => { const p = parseCoord(c); if (p) grid[p.row][p.col] = '~'; });
    }
    if (mapData.terrain.fords) {
        mapData.terrain.fords.forEach(f => { const c = typeof f === 'string' ? f : f.coord; const p = parseCoord(c); if (p) grid[p.row][p.col] = '='; });
    }
    if (mapData.terrain.hill) {
        mapData.terrain.hill.forEach(c => { const p = parseCoord(c); if (p) grid[p.row][p.col] = '^'; });
    }
    if (mapData.terrain.marsh) {
        mapData.terrain.marsh.forEach(c => { const p = parseCoord(c); if (p) grid[p.row][p.col] = '%'; });
    }
    if (mapData.terrain.road) {
        mapData.terrain.road.forEach(c => { const p = parseCoord(c); if (p && grid[p.row][p.col] === '.') grid[p.row][p.col] = '#'; });
    }
    if (mapData.terrain.forest) {
        mapData.terrain.forest.forEach(c => { const p = parseCoord(c); if (p) grid[p.row][p.col] = 'T'; });
    }
    
    // Units - swap friendly/enemy based on viewing side
    const tiles = new Map();
    const addUnits = (arr, key) => {
        (arr || []).forEach(u => {
            if (!u.position) return;
            const posStr = typeof u.position === 'string' ? u.position : coordToString(u.position);
            const list = tiles.get(posStr) || { friendly: [], enemy: [] };
            list[key].push(u);
            tiles.set(posStr, list);
        });
    };
    
    // Correct assignment based on who's viewing
    if (viewingSide === 'player1') {
        addUnits(mapData.player1Units, 'friendly');
        addUnits(mapData.player2Units, 'enemy');
    } else {
        addUnits(mapData.player2Units, 'friendly');
        addUnits(mapData.player1Units, 'enemy');
    }
    
    tiles.forEach((val, posStr) => {
        const p = parseCoord(posStr); 
        if (!p) return;
        
        if (val.enemy.length > 0 && val.friendly.length === 0) {
            grid[p.row][p.col] = getStackedEmoji(val.enemy, 'enemy');
        }
        if (val.friendly.length > 0) {
            grid[p.row][p.col] = getStackedEmoji(val.friendly, 'friendly');
        }
    });
    
    return grid;
}

module.exports = {
    parseCoord,
    coordToString,
    calculateDistance,
    calculateEuclideanDistance,
    getAdjacentCoords,
    getCoordsInRange,
    calculatePath,
    findPathAStar,
    reconstructPath,
    calculatePathCost,
    isValidCoord,
    generateASCIIMap,
    generateEmojiMap,
    getUnitEmoji,
    getStackedEmoji,
    getDirection,
    UNIT_EMOJIS,
    generateEmojiMapViewport,
    generateEmojiGrid
};


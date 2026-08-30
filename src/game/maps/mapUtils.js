// src/game/maps/mapUtils.js
// Core utilities for grid-based tactical combat

const { calculateVisibility } = require('../fogOfWar');

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
 * Parse grid coordinate string to {row, col} object for a 40x40 battlefield.
 * Supports A1-AN40, where columns are A..Z, AA..AN and rows 1..40.
 */
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
    const row = parseInt(match[2], 10) - 1; // 1-indexed to 0-indexed
    
    // Convert column letters to number using Excel-style base-26:
    // A=0, B=1, ..., Z=25, AA=26, AB=27, ..., AN=39
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
        const value = colStr.charCodeAt(i) - 64; // A=1 .. Z=26
        col = col * 26 + value;
    }
    col -= 1; // shift to 0-based
    
    // Validate bounds (40×40 grid)
    if (row < 0 || row >= 40 || col < 0 || col >= 40) {
        throw new Error(`Coordinate out of bounds: ${coord}. Valid range: A1-AN40`);
    }
    
    return { row, col };
}

/**
 * Convert {row, col} object to grid coordinate string (A..Z, AA..AN).
 */
function coordToString(pos) {
    let col = pos.col + 1; // work in 1-based for letters
    let colStr = '';
    
    while (col > 0) {
        const rem = (col - 1) % 26;
        colStr = String.fromCharCode(65 + rem) + colStr;
        col = Math.floor((col - 1) / 26);
    }
    
    const row = pos.row + 1; // 0-indexed to 1-indexed
    return `${colStr}${row}`;
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
            
            if (newRow >= 0 && newRow < 40 && newCol >= 0 && newCol < 40) {
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
    
    for (let row = 0; row < 40; row++) {
        for (let col = 0; col < 40; col++) {
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
        return pos.row >= 0 && pos.row < 40 && pos.col >= 0 && pos.col < 40;
    } catch {
        return false;
    }
}

/**
 * Calculate a 15×15 viewport window on a 40×40 grid.
 * Returns { startRow, startCol, endRow, endCol, center }.
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
    const grid = Array(40).fill(null).map(() => Array(40).fill('.'));
    
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
    // Draw bridge tiles as a distinct symbol (≡) on top of underlying terrain
    // so the crossing is clearly visible in the ASCII 40×40 tactical map.
    if (mapData.terrain.bridge) {
        mapData.terrain.bridge.forEach(coord => {
            const pos = parseCoord(coord);
            grid[pos.row][pos.col] = '≡';
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
    let ascii = '    ';
    // Column headers A..AN (0..39)
    for (let col = 0; col < 40; col++) {
        const label = coordToString({ row: 0, col }).match(/[A-Z]+/)[0];
        ascii += label.padEnd(3, ' ');
    }
    ascii += '\n';
    ascii += '   ' + '─'.repeat(3 * 40) + '\n';
    
    for (let row = 0; row < 40; row++) {
        const rowNum = (row + 1).toString().padStart(2, ' ');
        ascii += `${rowNum} │`;
        ascii += grid[row].join(' ');
        ascii += `│\n`;
    }
    
    ascii += '   ' + '─'.repeat(3 * 40) + '\n';
    ascii += '\n';
    ascii += 'Legend: . plains, ~ river, = ford, ≡ bridge, ^ hill, % marsh, # road, T forest, 1 P1, 2 P2';
    
    return ascii;
}

/**
 * Generate a 15×15 tactical ASCII map centered on a coordinate.
 * Uses full terrain + unit positions with basic FOW for enemy units.
 */
function generateTacticalMap(battleState, centerCoord, playerSide) {
    const viewport = calculateViewport(centerCoord, 40, 15);
    const grid = Array(15).fill(null).map(() => Array(15).fill('.'));

    const map = battleState.map || { terrain: {} };
    const terrain = map.terrain || {};

    // Mark terrain within viewport
    const terrainSymbols = {
        river: '~',
        ford: '=',
        hill: '^',
        forest: 'T',
        marsh: '%',
        road: '#'
    };

    Object.entries(terrain).forEach(([terrainType, coords]) => {
        const symbol = terrainSymbols[terrainType];
        if (!symbol) return;
        (coords || []).forEach(coord => {
            const pos = parseCoord(coord);
            if (pos.row >= viewport.startRow && pos.row <= viewport.endRow &&
                pos.col >= viewport.startCol && pos.col <= viewport.endCol) {
                const viewRow = pos.row - viewport.startRow;
                const viewCol = pos.col - viewport.startCol;
                grid[viewRow][viewCol] = symbol;
            }
        });
    });

    // Mark friendly units (full info)
    const sideData = battleState[playerSide] || {};
    const friendlyUnits = sideData.unitPositions || [];

    friendlyUnits.forEach(unit => {
        const occupied = calculateOccupiedTiles(unit);
        occupied.forEach(tileCoord => {
            const pos = parseCoord(tileCoord);
            if (pos.row >= viewport.startRow && pos.row <= viewport.endRow &&
                pos.col >= viewport.startCol && pos.col <= viewport.endCol) {
                const viewRow = pos.row - viewport.startRow;
                const viewCol = pos.col - viewport.startCol;
                grid[viewRow][viewCol] = '1'; // Friendly marker
            }
        });
    });

    // Mark enemy units using fog of war (only visible ones)
    try {
        const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
        const opponentData = battleState[opponentSide] || {};
        const enemyUnits = opponentData.unitPositions || [];
        const visibility = calculateVisibility(
            friendlyUnits,
            enemyUnits,
            battleState.terrain || {},
            battleState.weather || 'clear'
        );

        const visiblePositions = new Set(visibility.visibleEnemyPositions || []);

        enemyUnits.forEach(unit => {
            if (!visiblePositions.has(unit.position)) return; // not visible this turn
            const pos = parseCoord(unit.position);
            if (pos.row >= viewport.startRow && pos.row <= viewport.endRow &&
                pos.col >= viewport.startCol && pos.col <= viewport.endCol) {
                const viewRow = pos.row - viewport.startRow;
                const viewCol = pos.col - viewport.startCol;
                grid[viewRow][viewCol] = '2'; // Enemy marker
            }
        });
    } catch (_) {
        // If fogOfWar is unavailable for some reason, skip enemy markers.
    }

    return formatGridWithLabels(grid, viewport);
}

/**
 * Build a map of operational tiles -> units inside their 2×2 tactical block.
 * Keyed as "row,col" in 20×20 space, values are { friendly: [], enemy: [] }.
 */
function buildOperationalUnitTiles(battleState, playerSide) {
    const tiles = new Map();

    if (!battleState || !playerSide) return tiles;

    const sideData = battleState[playerSide] || {};
    const oppSide = playerSide === 'player1' ? 'player2' : 'player1';
    const oppData = battleState[oppSide] || {};

    const friendlyUnits = Array.isArray(sideData.unitPositions)
        ? sideData.unitPositions
        : (sideData.unitPositions ? Object.values(sideData.unitPositions) : []);
    const enemyAllUnits = Array.isArray(oppData.unitPositions)
        ? oppData.unitPositions
        : (oppData.unitPositions ? Object.values(oppData.unitPositions) : []);

    const visibleEnemyPositions = new Set(sideData.visibleEnemyPositions || []);
    const visibleEnemies = enemyAllUnits.filter(u => u && visibleEnemyPositions.has(u.position));

    const addToTile = (unit, key) => {
        if (!unit || !unit.position) return;
        const p = parseCoord(unit.position); // 40×40 tactical
        const opRow = Math.floor(p.row / 2);
        const opCol = Math.floor(p.col / 2);
        const k = `${opRow},${opCol}`;
        const cell = tiles.get(k) || { friendly: [], enemy: [] };
        cell[key].push(unit);
        tiles.set(k, cell);
    };

    friendlyUnits.forEach(u => addToTile(u, 'friendly'));
    visibleEnemies.forEach(u => addToTile(u, 'enemy'));

    return tiles;
}

/**
 * Generate a 15×15 operational map by compressing 2×2 tactical tiles
 * into 1 operational tile. Shows broader terrain patterns.
 */
function generateOperationalMap(battleState, centerCoord, playerSide) {
    // Use the premade 20×20 operational map as an information-first zoomed-out
    // representation of the 40×40 tactical map.
    const opMap = createOperationalMap(); // 20×20 operational map
    const gridSize = opMap.gridSize || 20;
    const viewSize = 15;

    // Map 40×40 center coordinate down to 20×20 by simple 2:1 scaling so the
    // operational view roughly follows the same area as the tactical center.
    let opCenterCoord = 'K10';
    try {
        const tac = parseCoord(centerCoord || 'T20');
        const opRow = Math.floor(tac.row / 2);
        const opCol = Math.floor(tac.col / 2);
        opCenterCoord = coordToString({ row: opRow, col: opCol });
    } catch (_) {
        // Fallback keeps center in middle of 20×20 grid
        opCenterCoord = 'K10';
    }

    const viewport = calculateViewport(opCenterCoord, gridSize, viewSize);
    const grid = Array(viewSize).fill(null).map(() => Array(viewSize).fill('.'));

    const terrainSymbols = {
        river: '~',
        ford: '=',
        hill: '^',
        forest: 'T',
        marsh: '%',
        road: '#',
        bridge: '≡'
    };

    Object.entries(opMap.terrain || {}).forEach(([terrainType, coords]) => {
        const symbol = terrainSymbols[terrainType];
        if (!symbol) return;
        (coords || []).forEach(coord => {
            try {
                const pos = parseCoord(coord);
                if (pos.row >= viewport.startRow && pos.row <= viewport.endRow &&
                    pos.col >= viewport.startCol && pos.col <= viewport.endCol) {
                    const r = pos.row - viewport.startRow;
                    const c = pos.col - viewport.startCol;
                    grid[r][c] = symbol;
                }
            } catch (_) {
                // ignore bad coords
            }
        });
    });

    // Overlay units based on 40×40 positions, projected into 20×20 cells
    // (2×2 tactical tiles per operational tile). Use stacked emojis so each
    // cell shows a single friendly/enemy icon summarizing that block.
    try {
        const tiles = buildOperationalUnitTiles(battleState, playerSide);

        tiles.forEach((cell, key) => {
            const [opRow, opCol] = key.split(',').map(Number);
            if (opRow < viewport.startRow || opRow > viewport.endRow ||
                opCol < viewport.startCol || opCol > viewport.endCol) return;
            const r = opRow - viewport.startRow;
            const c = opCol - viewport.startCol;

            if (cell.enemy.length > 0 && cell.friendly.length === 0) {
                grid[r][c] = getStackedEmoji(cell.enemy, 'enemy');
            }
            if (cell.friendly.length > 0) {
                grid[r][c] = getStackedEmoji(cell.friendly, 'friendly');
            }
        });
    } catch (_) {
        // If anything goes wrong, we still return the terrain-only map.
    }

    return formatGridWithLabels(grid, viewport);
}

/**
 * Helper: pick a dominant terrain symbol for a 2×2 block.
 */
function getDominantTerrainSymbol(terrain, baseRow, baseCol) {
    const symbols = {
        river: '~',
        ford: '=',
        hill: '^',
        forest: 'T',
        marsh: '%',
        road: '#'
    };

    const counts = {};

    Object.entries(terrain).forEach(([terrainType, coords]) => {
        const symbol = symbols[terrainType];
        if (!symbol) return;
        (coords || []).forEach(coord => {
            const pos = parseCoord(coord);
            if (pos.row >= baseRow && pos.row < baseRow + 2 &&
                pos.col >= baseCol && pos.col < baseCol + 2) {
                counts[symbol] = (counts[symbol] || 0) + 1;
            }
        });
    });

    // Default plains if nothing else appears
    if (Object.keys(counts).length === 0) return '.';

    // Return symbol with max count
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * For a given operational coordinate (20×20), return a human label for terrain.
 */
function getOperationalTerrainLabel(opMap, opCoordStr) {
    if (!opMap || !opMap.terrain) return 'Plains';
    const t = opMap.terrain;
    const inList = (key) => Array.isArray(t[key]) && t[key].includes(opCoordStr);

    if (inList('bridge')) return 'Bridge';
    if (inList('ford')) return 'Ford';
    if (inList('river')) return 'River';
    if (inList('marsh')) return 'Marsh';
    if (inList('forest')) return 'Forest';
    if (inList('hill')) return 'Hill';
    if (inList('road')) return 'Road';
    return 'Plains';
}

/**
 * Format a 15×15 grid with AA–AN style column labels and row numbers.
 * Layout is matched to the 20×20 operational map style so columns line up
 * cleanly in Discord code blocks.
 */
function formatGridWithLabels(grid, viewport) {
    const colStart = viewport.startCol;
    const rowStart = viewport.startRow;
    const h = grid.length;
    const w = grid[0]?.length || 0;

    // Column headers (top only), aligned so first letter sits above the first
    // cell after the left row-number + space + bar prefix.
    let header = '    ';
    for (let col = colStart; col < colStart + w; col++) {
        const colLabel = coordToString({ row: 0, col }).match(/[A-Z]+/)[0];
        header += colLabel + ' ';
    }

    // Helper: detect emoji so we can compensate for wide rendering.
    const isEmoji = (ch) => {
        if (!ch) return false;
        const cp = ch.codePointAt(0);
        return cp >= 0x1F300 && cp <= 0x1FAFF;
    };

    let ascii = header.trimEnd() + '\n';
    ascii += '   ┌' + '─'.repeat(w * 2 - 1) + '┐\n';

    for (let row = 0; row < h; row++) {
        const actualRow = rowStart + row + 1; // 1-indexed
        const rowLabel = actualRow.toString().padStart(2, ' ');
        ascii += `${rowLabel} │`;

        // Find longest contiguous run of emoji in this row so we can apply a
        // small fudge factor to keep the right border visually aligned.
        let maxRun = 0;
        let curRun = 0;
        let emojiCount = 0;
        for (let col = 0; col < w; col++) {
            const ch = grid[row][col] ?? '.';
            if (isEmoji(ch)) {
                emojiCount++;
                curRun++;
                if (curRun > maxRun) maxRun = curRun;
            } else {
                curRun = 0;
            }
        }
        const singleEmojiRow = emojiCount === 1;
        const extraSpaces = singleEmojiRow ? 0 : Math.floor(maxRun / 2); // about 1 space per 2 emoji

        let rowStr = '';
        for (let col = 0; col < w; col++) {
            const ch = grid[row][col] ?? '.';
            if (col > 0) rowStr += ' ';
            // For a single-emoji row, behave like "emoji + space" everywhere,
            // then trim one space from the far right to keep border aligned.
            if (singleEmojiRow && isEmoji(ch)) {
                rowStr += ch + ' ';
            } else {
                rowStr += ch;
            }
        }
        if (singleEmojiRow && rowStr.endsWith(' ')) {
            rowStr = rowStr.slice(0, -1);
        }
        rowStr += ' '.repeat(extraSpaces);

        ascii += rowStr;
        ascii += `│\n`;
    }

    ascii += '   └' + '─'.repeat(w * 2 - 1) + '┘\n';
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
    const grid = Array(40).fill(null).map(() => Array(40).fill('.'));
    
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
    // For emoji tactical view, treat bridge tiles as road visually so the
    // crossing blends with the road network but still replaces river glyph.
    if (mapData.terrain.bridge) {
        mapData.terrain.bridge.forEach(coord => {
            const pos = parseCoord(coord);
            if (grid[pos.row][pos.col] === '.' || grid[pos.row][pos.col] === '~') {
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

    const isEmoji = (ch) => {
        if (!ch) return false;
        const cp = ch.codePointAt(0);
        return cp >= 0x1F300 && cp <= 0x1FAFF;
    };

    for (let row = 0; row < 20; row++) {
        const rowNum = (row + 1).toString().padStart(2, ' ');
        ascii += `${rowNum} │`;

        // Longest contiguous run of emoji in this row
        let maxRun = 0;
        let curRun = 0;
        let emojiCount = 0;
        for (let col = 0; col < 20; col++) {
            const ch = grid[row][col] ?? '.';
            if (isEmoji(ch)) {
                emojiCount++;
                curRun++;
                if (curRun > maxRun) maxRun = curRun;
            } else {
                curRun = 0;
            }
        }
        const singleEmojiRow = emojiCount === 1;
        const extraSpaces = singleEmojiRow ? 0 : Math.floor(maxRun / 2);

        let rowStr = '';
        for (let col = 0; col < 20; col++) {
            const ch = grid[row][col] ?? '.';
            if (col > 0) rowStr += ' ';
            if (singleEmojiRow && isEmoji(ch)) {
                rowStr += ch + ' ';
            } else {
                rowStr += ch;
            }
        }
        if (singleEmojiRow && rowStr.endsWith(' ')) {
            rowStr = rowStr.slice(0, -1);
        }
        rowStr += ' '.repeat(extraSpaces);

        ascii += rowStr;
        ascii += `│\n`;
    }

    ascii += '   ──────────────────────────────────────────\n';
    ascii += 'Terrain: . plains, ~ river, = ford, ≡ bridge, ^ hill, % marsh, # road, T forest';

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

    const top = Math.max(0, Math.min(40 - (view.height || 15), view.top || 0));
    const left = Math.max(0, Math.min(40 - (view.width || 15), view.left || 0));
    const h = view.height || 15;
    const w = view.width || 15;

    // Column headers (top only), spaced to 2 columns per cell. Use
    // coordToString so AA, AB, ... appear correctly when viewport is far
    // to the east.
    const headerLabels = [];
    for (let col = left; col < left + w; col++) {
        const label = coordToString({ row: 0, col }).match(/[A-Z]+/)[0];
        headerLabels.push(label + ' ');
    }
    const headerLetters = headerLabels.join('');

    // Cell renderer: keep each cell width constant (2 cols). Emoji are double-width.
    const isEmoji = (ch) => {
        if (!ch) return false;
        const cp = ch.codePointAt(0);
        return cp >= 0x1F300 && cp <= 0x1FAFF;
    };
    const cellStr = (ch) => isEmoji(ch) ? ch : ch + ' ';

    let out = `   ${headerLetters}\n`;
    out += '  ┌' + '─'.repeat(w * 2) + '┐\n';
    for (let r = 0; r < h; r++) {
        const rowNum = (top + r + 1).toString().padStart(2, ' ');
        out += `${rowNum}│`;
        const slice = full[top + r].slice(left, left + w);

        // Longest contiguous emoji run + total count in this viewport row
        let maxRun = 0;
        let curRun = 0;
        let emojiCount = 0;
        for (let i = 0; i < slice.length; i++) {
            const ch = slice[i];
            if (isEmoji(ch)) {
                emojiCount++;
                curRun++;
                if (curRun > maxRun) maxRun = curRun;
            } else {
                curRun = 0;
            }
        }
        const singleEmojiRow = emojiCount === 1;
        const extraSpaces = singleEmojiRow ? 0 : Math.floor(maxRun / 2);

        let rowCells;
        if (singleEmojiRow) {
            // For a single-emoji row, treat emoji like "emoji + space" but
            // then remove one trailing space overall to keep the border aligned.
            const cellStrSingle = (ch) => (isEmoji(ch) ? ch + ' ' : ch + ' ');
            rowCells = slice.map(cellStrSingle).join('');
            if (rowCells.endsWith(' ')) {
                rowCells = rowCells.slice(0, -1);
            }
        } else {
            rowCells = slice.map(cellStr).join('') + ' '.repeat(extraSpaces);
        }
        out += rowCells;
        out += '│\n';
    }
    out += '  └' + '─'.repeat(w * 2) + '┘\n';
    out += 'Legend: 🔵 Yours, 🟠 Enemy, X last known, ~ river, = ford, ^ hill, T forest';
    
    return out;
}

function generateEmojiGrid(mapData, viewingSide) {
    const grid = Array(40).fill(null).map(() => Array(40).fill('.'));
    
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
            if (!u || !u.position) return;
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

    // Marching column visualization: vanguard emoji + trailing symbols per tile
    try {
        // Helper: choose trail symbol based on side + unit type/elite
        function getTrailSymbol(unit, isFriendly) {
            const elite = !!unit.isElite;
            const type = (unit.unitType || unit.type || '').toLowerCase();
            const cav = unit.mounted || type.includes('cavalry') || type.includes('horse');

            if (elite) {
                return isFriendly ? '◆' : '◇';
            }
            if (cav) {
                return isFriendly ? '●' : '○';
            }
            // default infantry
            return isFriendly ? '■' : '□';
        }

        // Draw marching columns for both sides relative to viewingSide
        const drawColumns = (units, isFriendly) => {
            (units || []).forEach(unit => {
                if (!unit || unit.formationStatus !== 'marching' || !unit.position) return;
                const occupied = calculateOccupiedTiles(unit);
                if (!occupied || occupied.length <= 1) return; // only multi-tile columns get trails

                const trailSymbol = getTrailSymbol(unit, isFriendly);

                // occupied[0] is the vanguard/front; leave its emoji as-is.
                for (let i = 1; i < occupied.length; i++) {
                    const coordStr = occupied[i];
                    try {
                        const p = parseCoord(coordStr);
                        if (!p) continue;
                        const current = grid[p.row][p.col];
                        // Do not overwrite other unit emojis; only paint over plain/terrain cells.
                        if (!current || ['.', '~', '=', '^', '%', '#', 'T'].includes(current)) {
                            grid[p.row][p.col] = trailSymbol;
                        }
                    } catch {
                        // ignore bad coords
                    }
                }
            });
        };

        if (viewingSide === 'player1') {
            drawColumns(mapData.player1Units, true);
            drawColumns(mapData.player2Units, false);
        } else {
            drawColumns(mapData.player2Units, true);
            drawColumns(mapData.player1Units, false);
        }
    } catch (_) {
        // If formations/formationStatus is unavailable for some reason, skip column trails.
    }
    
    return grid;
}


// ── MAP DATA ───────────────────────────────────────────────────────────────────

// 40×40 TACTICAL VERSION (25m tiles)
function createTacticalMap() {
    return {
        name: 'custom_battle',
        gridSize: 40,
        tileSize: 25,
        terrain: {
            river: [
                'AA1','AB1','AC1','AD1','AA2','AB2','Y3','Z3','AA3','AB3',
                'X4','Y4','Z4','AA4','W5','X5','Y5','V7','W7','X7',
                'U8','V8','W8','X8','T9','U9','V9','W9','S10','T10',
                'U10','V10','W10','O11','P11','Q11','R11','S11','T11','U11',
                'V11','O12','P12','Q12','R12','S12','T12','O13','P13','Q13',
                'R13','O14','P14','Q14','C15','D15','E15','F15','G15','I15',
                'J15','K15','L15','M15','N15','O15','P15','Q15','R15','C16',
                'O16','P16','Q16','R16','A17','B17','C17','Q17','R17','S17',
                'T17','Q18','R18','S18','T18','S19','T19','U19','V19','S20',
                'T20','U20','V20','U23','V23','U24','V24','S25','T25','U25',
                'V25','S26','T26','U26','V26','Q27','R27','S27','T27','U27',
                'V27','Q28','R28','S28','O29','P29','Q29','R29','S29','O30',
                'P30','Q30','R30','O31','P31','O32','P32','O33','P33','O35',
                'P35','Q35','R35','O36','P36','Q36','R36','Q37','R37','S37',
                'T37','Q38','R38','S38','T38','Q39','R39','S39','T39','U39',
                'V39','Q40','R40','S40','T40','U40','V40',
            ],
            ford: [
                'W6','X6','U21','V21','U22','V22','O34','P34',
            ],
            hill: [
                'Q1','R1','S1','T1','U1','V1','W1','X1','AG1','AH1',
                'AI1','AJ1','AK1','AL1','AM1','AN1','R2','S2','T2','U2',
                'W2','AH2','AI2','AJ2','AK2','AL2','AM2','AN2','S3','T3',
                'U3','AI3','AK3','AL3','AM3','AN3','T4','U4','AK4','AL4',
                'AM4','AN4','AM5','AN5','AM6','AN6','A20','B20','A21','B21',
                'D21','E21','F21','A22','B22','C22','D22','E22','F22','A23',
                'B23','C23','D23','E23','A24','B24','C24','D24','E24','F24',
                'A25','B25','C25','D25','A26','B26','C26',
            ],
            forest: [
                'A1','B1','I1','J1','K1','L1','M1','N1','O1','P1',
                'AE1','AF1','A2','B2','I2','J2','K2','L2','M2','N2',
                'O2','P2','AC2','AD2','AE2','AF2','AG2','A3','B3','K3',
                'L3','M3','N3','O3','P3','AC3','AD3','AE3','AF3','A4',
                'B4','K4','L4','M4','N4','P4','AC4','AD4','AF4','A5',
                'B5','K5','L5','N5','A6','B6','K6','L6','M6','A7',
                'B7','A8','A9','C9','D9','AG9','AH9','A10','B10','C10',
                'D10','AG10','AL10','A11','G11','H11','I11','J11','A12','G12',
                'H12','I12','J12','A13','B13','C13','D13','E13','I13','J13',
                'K13','L13','W13','X13','AI13','AN13','A14','B14','C14','D14',
                'E14','F14','G14','I14','J14','K14','L14','W14','X14','AH14',
                'AI14','AN14','A15','B15','S15','T15','U15','V15','W15','AH15',
                'AN15','A16','B16','D16','E16','F16','G16','I16','J16','K16',
                'L16','M16','S16','T16','U16','V16','W16','AH16','D17','E17',
                'F17','G17','I17','J17','K17','L17','M17','N17','U17','V17',
                'W17','AD17','AF17','AH17','AI17','AJ17','A18','B18','C18','D18',
                'E18','F18','G18','I18','J18','L18','M18','N18','U18','V18',
                'W18','X18','AD18','AF18','AG18','AH18','AI18','AJ18','A19','B19',
                'C19','D19','E19','F19','G19','I19','L19','M19','N19','O19',
                'P19','Q19','R19','W19','X19','Y19','Z19','AG19','AH19','AI19',
                'C20','D20','E20','F20','G20','I20','J20','K20','L20','M20',
                'N20','O20','P20','Q20','R20','W20','X20','Y20','Z20','AH20',
                'C21','M22','N22','O22','AD22','AN22','N23','W23','X23','W24',
                'X24','AL25','A27','B27','C27','E27','F27','G27','H27','A28',
                'B28','C28','D28','E28','F28','G28','H28','AI28','A29','B29',
                'C29','D29','E29','F29','G29','H29','U29','V29','AA29','AI29',
                'AJ29','AK29','A30','B30','E30','F30','G30','H30','U30','V30',
                'AA30','AB30','AJ30','A31','B31','C31','F31','G31','H31','T31',
                'U31','V31','AB31','AJ31','AL31','A32','B32','C32','D32','E32',
                'F32','G32','S32','T32','U32','AA32','AB32','AA34','AB34','A35',
                'B35','C35','D35','E35','F35','G35','H35','I35','J35','Y35',
                'Z35','AA35','AB35','AM35','AN35','A36','B36','C36','D36','E36',
                'F36','G36','H36','I36','J36','Y36','AA36','AB36','AM36','AN36',
                'A37','B37','C37','D37','E37','F37','G37','H37','AM37','AN37',
                'A38','B38','C38','D38','E38','F38','G38','AM38','AN38','A39',
                'B39','C39','D39','E39','F39','AM39','AN39','A40','B40','C40',
                'D40','E40','F40','AM40','AN40',
            ],
            marsh: [
                'AK5','AL5','AI6','AJ6','AK6','AL6','AG7','AH7','AJ7','AK7',
                'AL7','AM7','AN7','AI9','AJ9','AK9','AL9','AM9','AN9','AH10',
                'AI10','AJ10','AK10','AM10','AN10','AG11','AH11','AI11','AJ11','AK11',
                'AL11','AM11','AN11','AG12','AH12','AI12','AJ12','AK12','AL12','AM12',
                'AN12','AG13','AH13','AJ13','AK13','AL13','AM13','AG14','AJ14','AK14',
                'AL14','AM14','AI15','AJ15','AK15','AL15','AM15','AI16','AJ16','AK16',
                'AL16','AM16','AN16','AK17','AL17','AM17','AN17','AK18','AL18','AM18',
                'AN18','AJ19','AK19','AL19','AM19','AN19','AI20','AJ20','AK20','AL20',
                'AM20','AN20','AI21','AJ21','AK21','AL21','AM21','AN21','AI22','AJ22',
                'AK22','AL22','AM22','AI23','AJ23','AK23','AL23','AM23','AN23','AK24',
                'AL24','AM24','AN24','AJ25','AK25','AM25','AN25','AI26','AJ26','AK26',
                'AL26','AM26','AN26','AF27','AG27','AH27','AI27','AJ27','AK27','AL27',
                'AM27','AN27','AG28','AH28','AJ28','AK28','AL28','AM28','AN28','AF29',
                'AH29','AL29','AM29','AN29','AG30','AH30','AK30','AL30','AM30','AN30',
                'AC31','AD31','AK31','AM31','AN31','AC32','AD32','AK32','AL32','AM32',
                'AN32','Y33','AK33','AL33','AM33','AN33','AK34','AL34','AM34','AN34',
                'U35','V35','W35','U36','V36','W36','X36','M37','O37','P37',
                'U37','V37','W37','X37','Y37','AB37','M38','N38','O38','P38',
                'U38','V38','W38','X38','Y38','Z38','AB38','K39','L39','M39',
                'N39','O39','P39','W39','X39','Y39','Z39','AA39','AB39','AC39',
                'AD39','L40','M40','N40','O40','P40','W40','X40','Y40','Z40',
                'AA40','AB40','AC40','AD40',
            ],
            road: [
                'F7','F8','AF8','AG8','AH8','AI8','AJ8','AK8','AL8','AM8',
                'AN8','F9','AF9','F10','AF10','F11','AF11','F12','AF12','F13',
                'G13','H13','AE13','AF13','H14','AE14','AE15','H16','AE16','H17',
                'AE17','H18','AE18','H19','AE19','H20','AE20','H21','I21','J21',
                'K21','L21','M21','N21','O21','P21','Q21','R21','S21','T21',
                'W21','X21','Y21','Z21','AA21','AB21','AC21','AD21','AE21','AF21',
                'AG21','AH21','I22','AE22','I23','AE23','I24','AE24','I25','AE25',
                'I26','AE26','I27','AE27','I28','AE28','I29','AE29','I30','AE30',
                'I31','AE31','I32','AE32','I33','AE33','AF33','AG33','AH33','AI33',
                'AJ33','A34','B34','C34','D34','E34','F34','G34','H34','I34',
                'AJ34',
            ],
            bridge: [
                'H15',
            ],
        },
        startingPositions: {
            player1: ['C1','D1','E1','F1','G1','H1','C2','D2','E2','F2','G2','H2','C3','D3','E3','F3','G3','H3','I3','J3','C4','D4','E4','F4','G4','H4','I4','J4','C5','D5','E5','F5','G5','H5','I5','J5','C6','D6','E6','F6','G6','H6','I6','J6'],
            player2: ['AE35','AF35','AG35','AH35','AI35','AJ35','AK35','AL35','AE36','AF36','AG36','AH36','AI36','AJ36','AK36','AL36','AE37','AF37','AG37','AH37','AI37','AJ37','AK37','AL37','AE38','AF38','AG38','AH38','AI38','AJ38','AK38','AL38','AG39','AH39','AI39','AJ39','AK39','AL39','AG40','AH40','AI40','AJ40','AK40','AL40']
        }
    };
}

// 20×20 OPERATIONAL VERSION (50m tiles)
function createOperationalMap() {
    return {
        name: 'custom_battle',
        gridSize: 20,
        tileSize: 50,
        terrain: {
            river: [
                'N1','O1','L2','M2','N2','L3','M3','K4','L4','J5',
                'K5','L5','H6','I6','J6','K6','H7','I7','B8','C8',
                'E8','F8','G8','H8','I8','A9','B9','I9','J9','J10',
                'K10','K12','J13','K13','I14','J14','K14','H15','I15','J15',
                'H16','H17','H18','I18','I19','J19','I20','J20','K20',
            ],
            ford: [
                'K11',
            ],
            hill: [
                'I1','J1','K1','L1','Q1','R1','S1','T1','J2','K2',
                'R2','S2','T2','T3','A10','A11','B11','C11','A12','B12',
                'C12','A13','B13',
            ],
            forest: [
                'A1','E1','F1','G1','H1','P1','A2','F2','G2','H2',
                'O2','P2','A3','F3','G3','A4','A5','B5','A6','B6',
                'D6','E6','A7','B7','E7','F7','L7','A8','J8','K8',
                'L8','C9','E9','F9','G9','K9','L9','O9','B10','C10',
                'E10','F10','G10','H10','I10','L10','M10','Q10','G12','L12',
                'Q12','Q13','A14','B14','C14','D14','A15','B15','C15','D15',
                'K15','N15','R15','A16','B16','C16','D16','J16','K16','N16',
                'R16','N17','A18','B18','C18','D18','E18','M18','N18','T18',
                'A19','B19','C19','D19','T19','A20','B20','C20','T20',
            ],
            marsh: [
                'R3','S3','Q5','R5','S5','T5','O6','Q6','R6','S6',
                'T6','O7','Q7','R7','S7','T7','Q8','R8','S8','T8',
                'Q9','R9','S9','T9','R10','S10','T10','R12','S12','T12',
                'R13','S13','T13','Q14','R14','S14','T14','O15','Q15','S15',
                'T15','O16','S16','T16','M17','S17','T17','K18','L18','G19',
                'H19','K19','L19','M19','N19','E20','F20','G20','H20','L20',
                'M20','N20','O20',
            ],
            road: [
                'C1','C2','C3','C4','P4','Q4','R4','S4','T4','C5',
                'P5','C6','P6','C7','D7','P7','P8','D9','P9','D10',
                'P10','D11','E11','F11','G11','H11','I11','J11','L11','M11',
                'N11','O11','P11','Q11','R11','S11','T11','E12','P12','E13',
                'P13','E14','P14','E15','P15','E16','P16','A17','B17','C17',
                'D17','E17','P17','Q17','R17','R18','R19','R20',
            ],
            bridge: [
                'D8',
            ],
        },
        startingPositions: {
            player1: ['B1','D1','B2','D2','E2','B3','D3','E3'],
            player2: ['P18','Q18','S18','P19','Q19','S19','Q20','S20']
        }
    };
}

// ── RIVER CROSSING & TERRAIN ──────────────────────────────────────────────────

// src/game/maps/riverCrossing.js
// Snake River Crossing - 40x40 Tactical Battlefield (25m tiles)

const RIVER_CROSSING_MAP = {
    name: 'Snake River Crossing',
    size: { rows: 40, cols: 40 },
    gridSize: 40,
    tileSize: 25,

    terrain: {
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
        ford: [
            'W6','X6','U21','V21','U22','V22','O34','P34',
        ],
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
        bridge: [
            'H15',
        ]
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
    const path = calculatePath(from, to, RIVER_CROSSING_MAP);
    for (const coord of path) {
        const terrain = getTerrainAt(coord);
        if (terrain === 'river') return true;
    }
    return false;
}

function initializeDeployment(side, units) {
    let key;
    if (side === 'north' || side === 'player1') key = 'player1';
    else if (side === 'south' || side === 'player2') key = 'player2';
    else key = side;

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

// ── FORMATION FOOTPRINTS ───────────────────────────────────────────────────────

// src/game/formations/formationStatus.js
// Formation status definitions and core helpers for marching/deployed/encamped

const FORMATION_STATUS = {
  marching: {
    tilesPerUnit: 4,
    combatReady: false,
    deployTime: 1,
    stackPenalty: 'SCALING',
    movementBonus: 1.5
  },
  deployed: {
    tilesPerUnit: 1,
    combatReady: true,
    deployTime: 0,
    stackPenalty: 'FORBIDDEN',
    movementBonus: 1.0
  },
  encamped: {
    tilesPerUnit: 1,
    combatReady: false,
    deployTime: 1,
    stackPenalty: 'SHARED',
    movementBonus: 0
  }
};

function getDirectionalOffset(direction, index) {
  const step = index;
  switch (direction) {
    case 'N': return { row: -step, col: 0 };
    case 'S': return { row: step, col: 0 };
    case 'E': return { row: 0, col: step };
    case 'W': return { row: 0, col: -step };
    default:  return { row: 0, col: 0 };
  }
}

function calculateOccupiedTiles(unit) {
  const status = unit.formationStatus || 'deployed';

  if (status === 'marching') {
    const tiles = [];
    const basePos = parseCoord(unit.position);
    const direction = (unit.marchDirection || unit.facing || 'N').toUpperCase();
    const strength = unit.currentStrength || unit.maxStrength || 400;
    const tilesDeep = Math.max(1, Math.min(FORMATION_STATUS.marching.tilesPerUnit, Math.ceil(strength / 100)));

    for (let i = 0; i < tilesDeep; i++) {
      const offset = getDirectionalOffset(direction, i);
      const tilePos = {
        row: basePos.row + offset.row,
        col: basePos.col + offset.col
      };
      if (tilePos.row >= 0 && tilePos.row < 40 && tilePos.col >= 0 && tilePos.col < 40) {
        tiles.push(coordToString(tilePos));
      }
    }

    return tiles.length > 0 ? tiles : [unit.position];
  }

  return [unit.position];
}

function checkStackingViolation(tile, movingUnit, allUnits) {
  const unitsInTile = allUnits.filter(u => {
    const occupied = calculateOccupiedTiles(u);
    return occupied.includes(tile) && u.unitId !== movingUnit.unitId;
  });

  if (unitsInTile.length === 0) {
    return { allowed: true, penalty: 0 };
  }

  const movingStatus = movingUnit.formationStatus || 'deployed';
  const anyDeployed = unitsInTile.some(u => (u.formationStatus || 'deployed') === 'deployed');
  const anyEncamped = unitsInTile.some(u => (u.formationStatus || 'deployed') === 'encamped');

  if (movingStatus === 'deployed' || anyDeployed) {
    return {
      allowed: false,
      penalty: 0,
      reason: 'Deployed formations cannot stack on the same tile'
    };
  }

  if (movingStatus === 'encamped') {
    if (anyEncamped && !anyDeployed) {
      return { allowed: true, penalty: 0 };
    }
  }

  if (movingStatus === 'marching') {
    const marchingCount =
      unitsInTile.filter(u => (u.formationStatus || 'deployed') === 'marching').length + 1;
    const penalties = [0, -1, -3, -6];
    const penalty = penalties[Math.min(marchingCount - 1, penalties.length - 1)];
    return {
      allowed: true,
      penalty,
      warning: marchingCount >= 3 ? 'Heavy congestion in march column' : null
    };
  }

  return { allowed: true, penalty: 0 };
}

async function executeDeployment(unit, direction) {
  const status = unit.formationStatus || 'deployed';

  if (status === 'deployed') {
    return { success: false, message: 'Already deployed' };
  }

  if (!unit.deploymentProgress) {
    unit.deploymentProgress = 0;
  }

  unit.deploymentProgress++;

  if (unit.deploymentProgress >= FORMATION_STATUS.marching.deployTime) {
    unit.formationStatus = 'deployed';
    unit.facing = direction || unit.facing || 'N';
    unit.deploymentProgress = 0;

    const occupied = calculateOccupiedTiles(unit);
    unit.position = occupied[0] || unit.position;

    return {
      success: true,
      message: `${unit.name || unit.unitId || 'Unit'} deployed facing ${unit.facing}`
    };
  }

  return {
    success: false,
    message: `${unit.name || unit.unitId || 'Unit'} deploying... (Turn ${unit.deploymentProgress}/${FORMATION_STATUS.marching.deployTime})`,
    vulnerable: true
  };
}

// Exports live at the end of the file: the riverCrossing.js content appended
// during consolidation declares RIVER_CROSSING_MAP with `const` further down,
// and a module.exports above that declaration hit the temporal dead zone —
// the whole module threw on require, taking the live bot down with it.
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
    calculateViewport,
    generateASCIIMap,
    generateTacticalMap,
    generateOperationalMap,
    formatGridWithLabels,
    generateEmojiMap,
    getUnitEmoji,
    getStackedEmoji,
    getDirection,
    UNIT_EMOJIS,
    generateEmojiMapViewport,
    generateEmojiGrid,
    buildOperationalUnitTiles,
    getDominantTerrainSymbol,
    getOperationalTerrainLabel,
    // MAP DATA
    createTacticalMap,
    createOperationalMap,
    // RIVER CROSSING & TERRAIN
    RIVER_CROSSING_MAP,
    getTerrainAt,
    isFord,
    crossesRiverIllegally,
    initializeDeployment,
    getUnitMovementRange,
    getUnitDetectRange,
    generateBattleMap,
    // FORMATION FOOTPRINTS
    FORMATION_STATUS,
    calculateOccupiedTiles,
    checkStackingViolation,
    executeDeployment,
    getDirectionalOffset
};

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
    const { calculateOccupiedTiles } = require('../formations/formationStatus');
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
        const { calculateVisibility } = require('../fogOfWar');

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
    const { createMap } = require('./baseMapRS');
    const opMap = createMap(); // 20×20 operational map
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
        const { calculateOccupiedTiles } = require('../formations/formationStatus');

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
    getOperationalTerrainLabel
};


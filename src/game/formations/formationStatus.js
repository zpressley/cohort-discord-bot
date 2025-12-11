// src/game/formations/formationStatus.js
// Formation status definitions and core helpers for marching/deployed/encamped
// units. Implements the Phase 1 plan: 4-tile march columns, deploy over
// multiple turns, and stacking checks.

const { parseCoord, coordToString } = require('../maps/mapUtils');

// Formation status metadata (tunable knobs)
const FORMATION_STATUS = {
  marching: {
    // tilesPerUnit is a *maximum* depth; actual depth per unit is derived
    // from strength (100 warriors per tile, capped at 4).
    tilesPerUnit: 4,
    combatReady: false,
    deployTime: 1,           // 1 turns to deploy
    stackPenalty: 'SCALING', // Based on number of columns
    movementBonus: 1.5       // 50% faster when marching (handled in movement layer)
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
 * Get directional offset for a march column segment.
 * direction: 'N'|'S'|'E'|'W'
 * index: 0 = front, 1..3 = trailing tiles
 */
function getDirectionalOffset(direction, index) {
  const step = index; // 1 tile per segment behind the front
  switch (direction) {
    case 'N': return { row: -step, col: 0 };
    case 'S': return { row: step, col: 0 };
    case 'E': return { row: 0, col: step };
    case 'W': return { row: 0, col: -step };
    default:  return { row: 0, col: 0 };
  }
}

/**
 * Calculate tiles occupied by a unit based on its formationStatus.
 *
 * marching: column 4 warriors across, depth based on strength:
 *   - 100 warriors → 1 tile
 *   - 300 warriors → 3 tiles
 *   - 400 warriors → 4 tiles
 * deployed/encamped: single tile at unit.position.
 */
function calculateOccupiedTiles(unit) {
  const status = unit.formationStatus || 'deployed';

  if (status === 'marching') {
    const tiles = [];
    const basePos = parseCoord(unit.position);

    // Direction unit is moving (fallback to facing, then north)
    const direction = (unit.marchDirection || unit.facing || 'N').toUpperCase();

    // Determine column depth based on current/max strength (100 warriors per tile)
    const strength = unit.currentStrength || unit.maxStrength || 400;
    const tilesDeep = Math.max(1, Math.min(FORMATION_STATUS.marching.tilesPerUnit, Math.ceil(strength / 100)));

    for (let i = 0; i < tilesDeep; i++) {
      const offset = getDirectionalOffset(direction, i);
      const tilePos = {
        row: basePos.row + offset.row,
        col: basePos.col + offset.col
      };
      // Only keep tiles that are actually on the 40x40 grid
      if (tilePos.row >= 0 && tilePos.row < 40 && tilePos.col >= 0 && tilePos.col < 40) {
        tiles.push(coordToString(tilePos));
      }
    }

    return tiles.length > 0 ? tiles : [unit.position];
  }

  // Deployed or encamped = single tile
  return [unit.position];
}

/**
 * Check if moving a unit into a tile would cause a stacking violation.
 *
 * Returns { allowed: boolean, penalty: number, reason?, warning? }.
 */
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

  // Deployed formations cannot stack with any other formations
  if (movingStatus === 'deployed' || anyDeployed) {
    return {
      allowed: false,
      penalty: 0,
      reason: 'Deployed formations cannot stack on the same tile'
    };
  }

  // Encamped units can share space with other encamped units
  if (movingStatus === 'encamped') {
    if (anyEncamped && !anyDeployed) {
      return { allowed: true, penalty: 0 };
    }
  }

  // March columns stacking: apply scaling penalties
  if (movingStatus === 'marching') {
    const marchingCount =
      unitsInTile.filter(u => (u.formationStatus || 'deployed') === 'marching').length + 1; // +1 for moving

    // Scaling penalties: 1, 2, 3, 4+ columns
    const penalties = [0, -1, -3, -6];
    const penalty = penalties[Math.min(marchingCount - 1, penalties.length - 1)];

    return {
      allowed: true,
      penalty,
      warning: marchingCount >= 3 ? 'Heavy congestion in march column' : null
    };
  }

  // Default: allow stacking with no extra penalty
  return { allowed: true, penalty: 0 };
}

/**
 * Execute deploy command: marching → deployed over multiple turns.
 *
 * Returns an object describing the result:
 * - success: boolean
 * - message: string
 * - vulnerable?: boolean (e.g., while in transition)
 */
async function executeDeployment(unit, direction) {
  const status = unit.formationStatus || 'deployed';

  if (status === 'deployed') {
    return { success: false, message: 'Already deployed' };
  }

  // Track deployment progress on the unit
  if (!unit.deploymentProgress) {
    unit.deploymentProgress = 0;
  }

  unit.deploymentProgress++;

  // Once deployment time is reached, flip to deployed
  if (unit.deploymentProgress >= FORMATION_STATUS.marching.deployTime) {
    unit.formationStatus = 'deployed';
    unit.facing = direction || unit.facing || 'N';
    unit.deploymentProgress = 0;

    // Contract from column to single tile; keep the lead tile as position
    const occupied = calculateOccupiedTiles(unit);
    unit.position = occupied[0] || unit.position;

    return {
      success: true,
      message: `${unit.name || unit.unitId || 'Unit'} deployed facing ${unit.facing}`
    };
  }

  // Still deploying; treated as vulnerable
  return {
    success: false,
    message: `${unit.name || unit.unitId || 'Unit'} deploying... (Turn ${unit.deploymentProgress}/${FORMATION_STATUS.marching.deployTime})`,
    vulnerable: true
  };
}

module.exports = {
  FORMATION_STATUS,
  calculateOccupiedTiles,
  checkStackingViolation,
  executeDeployment,
  getDirectionalOffset
};

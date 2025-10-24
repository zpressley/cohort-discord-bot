// src/game/formations.js
// Formation change mechanics (FORM-002)

const FORMATION_CHANGES = {
  phalanx: { timing: 'oneTurn', vulnerablePenalty: -3 },
  testudo: { timing: 'oneTurn', vulnerablePenalty: -3 },
  wedge: { timing: 'instant', vulnerablePenalty: 0 },
  line: { timing: 'instant', vulnerablePenalty: 0 },
  column: { timing: 'instant', vulnerablePenalty: 0 },
  loose: { timing: 'instant', vulnerablePenalty: 0 },
  standard: { timing: 'instant', vulnerablePenalty: 0 }
};

const TERRAIN_RESTRICTIONS = {
  phalanx: ['forest', 'marsh'],
  testudo: ['forest', 'marsh']
};

function canUseFormationOnTerrain(formation, terrain) {
  const restricted = TERRAIN_RESTRICTIONS[formation] || [];
  return !restricted.includes(terrain);
}

function strengthAllowsFormation(unit, formation) {
  // Must have >=50% strength to maintain complex formations
  const max = unit.maxStrength || 100;
  const cur = Math.max(0, unit.currentStrength || 0);
  const ratio = cur / max;
  if (['phalanx', 'testudo', 'wedge'].includes(formation)) return ratio >= 0.5;
  return true;
}

function applyFormationActions(battleState, side, formationActions, map) {
  const units = battleState[side].unitPositions || [];
  const formationByUnit = new Map();
  for (const f of formationActions || []) {
    formationByUnit.set(f.unitId, f.formationType);
  }

  const updated = units.map(u => {
    const target = formationByUnit.get(u.unitId);
    if (!target) return u;

    // Terrain restriction
    const { getTerrainType } = require('./movementSystem');
    const terrain = getTerrainType(u.position, map);
    if (!canUseFormationOnTerrain(target, terrain)) {
      // Reject change; keep current
      return { ...u, formationMessage: `Cannot adopt ${target} on ${terrain}` };
    }

    // Strength requirement
    if (!strengthAllowsFormation(u, target)) {
      return { ...u, formationMessage: `Insufficient strength for ${target}` };
    }

    const change = FORMATION_CHANGES[target] || { timing: 'instant', vulnerablePenalty: 0 };
    if (change.timing === 'instant') {
      return { ...u, formation: target, formationChanging: null, formationMessage: `Formation -> ${target}` };
    }
    // oneTurn: mark changing; cannot move and -3 defense this turn
    return { ...u, formationChanging: { to: target, remaining: 1, penalty: change.vulnerablePenalty }, formationMessage: `Changing to ${target}` };
  });

  return updated;
}

module.exports = {
  FORMATION_CHANGES,
  applyFormationActions
};
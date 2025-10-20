// src/game/engine/adapters/schemaAdapter.js
// Adapter to normalize schema-validated actions for engine consumption (current code-032)

function sanitizeAction(a) {
  if (!a || typeof a !== 'object') return null;
  const t = a.type;
  switch (t) {
    case 'move':
      return {
        type: 'move',
        unitId: String(a.unitId || ''),
        currentPosition: a.currentPosition || null,
        targetPosition: a.targetPosition,
        finalPosition: a.finalPosition || a.targetPosition,
        validation: a.validation || { valid: true },
        newMission: a.newMission || null,
        reasoning: a.reasoning || null
      };
    case 'formation':
      return {
        type: 'formation',
        unitId: String(a.unitId || ''),
        formationType: a.formationType,
        reasoning: a.reasoning || null
      };
    case 'attack':
      return {
        type: 'attack',
        unitId: String(a.unitId || ''),
        targetUnitId: a.targetUnitId || null,
        targetPosition: a.targetPosition || null,
        modifier: a.modifier || null,
        reasoning: a.reasoning || null
      };
    case 'support_fire':
      return {
        type: 'support_fire',
        unitId: String(a.unitId || ''),
        supporting: a.supporting || null,
        targetUnitId: a.targetUnitId || null,
        reasoning: a.reasoning || null
      };
    case 'conditional':
      return {
        type: 'conditional',
        condition: a.condition,
        ifTrue: Array.isArray(a.ifTrue) ? a.ifTrue : [],
        ifFalse: Array.isArray(a.ifFalse) ? a.ifFalse : []
      };
    default:
      return null;
  }
}

function partitionActions(actions = []) {
  const out = { moves: [], formations: [], attacks: [], supports: [], conditionals: [] };
  for (const raw of actions) {
    const a = sanitizeAction(raw);
    if (!a) continue;
    if (a.type === 'move') out.moves.push(a);
    else if (a.type === 'formation') out.formations.push(a);
    else if (a.type === 'attack') out.attacks.push(a);
    else if (a.type === 'support_fire') out.supports.push(a);
    else if (a.type === 'conditional') out.conditionals.push(a);
  }
  return out;
}

module.exports = { sanitizeAction, partitionActions };

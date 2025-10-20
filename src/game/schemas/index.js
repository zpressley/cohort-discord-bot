// src/game/schemas/index.js
// Command Catalog Schemas and Validators (current code-002)

let Ajv; // optional dependency; falls back to manual checks if unavailable
try {
  Ajv = require('ajv');
} catch (_) {
  Ajv = null;
}

const moveSchema = require('./command.move.json');
const formationSchema = require('./command.formation.json');
const attackSchema = require('./command.attack.json');
const supportSchema = require('./command.support.json');
const conditionalSchema = require('./command.conditional.json');
const anySchema = require('./command.any.json');

const SCHEMAS = {
  move: moveSchema,
  formation: formationSchema,
  attack: attackSchema,
  support_fire: supportSchema,
  conditional: conditionalSchema,
  any: anySchema
};

function buildAjv() {
  if (!Ajv) return null;
  const ajv = new Ajv({ strict: false, allErrors: true, allowUnionTypes: true });
  // Register schemas by $id so $refs resolve
  ajv.addSchema(moveSchema);
  ajv.addSchema(formationSchema);
  ajv.addSchema(attackSchema);
  ajv.addSchema(supportSchema);
  ajv.addSchema(conditionalSchema);
  ajv.addSchema(anySchema);
  return ajv;
}

const ajv = buildAjv();
const compiled = ajv
  ? {
      move: ajv.compile(moveSchema),
      formation: ajv.compile(formationSchema),
      attack: ajv.compile(attackSchema),
      support_fire: ajv.compile(supportSchema),
      conditional: ajv.compile(conditionalSchema),
      any: ajv.compile(anySchema)
    }
  : {};

function manualValidate(action) {
  if (!action || typeof action !== 'object') {
    return { valid: false, errors: [{ message: 'action must be object' }] };
  }
  const t = action.type;
  switch (t) {
    case 'move':
      return typeof action.unitId === 'string' && typeof action.targetPosition === 'string'
        ? { valid: true }
        : { valid: false, errors: [{ message: 'move requires unitId and targetPosition' }] };
    case 'formation':
      return typeof action.unitId === 'string' && typeof action.formationType === 'string'
        ? { valid: true }
        : { valid: false, errors: [{ message: 'formation requires unitId and formationType' }] };
    case 'attack':
      return typeof action.unitId === 'string' && (typeof action.targetUnitId === 'string' || typeof action.targetPosition === 'string')
        ? { valid: true }
        : { valid: false, errors: [{ message: 'attack requires unitId and targetUnitId or targetPosition' }] };
    case 'support_fire':
      return typeof action.unitId === 'string' && (typeof action.supporting === 'string' || typeof action.targetUnitId === 'string')
        ? { valid: true }
        : { valid: false, errors: [{ message: 'support_fire requires unitId and supporting or targetUnitId' }] };
    case 'conditional':
      return action.condition && typeof action.condition.check === 'string' && Array.isArray(action.ifTrue)
        ? { valid: true }
        : { valid: false, errors: [{ message: 'conditional requires condition.check and ifTrue[]' }] };
    default:
      return { valid: false, errors: [{ message: `unsupported action type: ${t}` }] };
  }
}

function validateAction(action) {
  if (ajv) {
    const t = action?.type;
    const v = (t && compiled[t]) ? compiled[t] : compiled.any;
    const ok = v(action);
    return ok ? { valid: true } : { valid: false, errors: v.errors };
  }
  return manualValidate(action);
}

function validateActions(actions) {
  const results = [];
  let allValid = true;
  for (const a of actions || []) {
    const r = validateAction(a);
    if (!r.valid) allValid = false;
    results.push(r);
  }
  return { valid: allValid, results };
}

function getSchemaByType(type) {
  return SCHEMAS[type] || null;
}

module.exports = {
  SCHEMAS,
  validateAction,
  validateActions,
  getSchemaByType
};

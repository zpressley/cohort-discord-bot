// src/game/culturalRules.js
// Apply cultural constraints and bonuses to structured actions (current code-011)

const { CULTURAL_TACTICS } = require('./orderParser');

function adjustActionsForCulture(actions = [], culture) {
  const results = { violations: [], warnings: [] };
  if (!culture) return results;
  const tactics = CULTURAL_TACTICS[culture] || null;
  if (!tactics) return results;

  actions.forEach((a, idx) => {
    if (a.type === 'formation' && a.formationType) {
      if (tactics.restrictedFormations?.includes(a.formationType)) {
        results.violations.push({ index: idx, action: a, message: `${culture} cannot use ${a.formationType} formation` });
      }
      if (tactics.preferredFormations?.includes(a.formationType)) {
        results.warnings.push({ index: idx, action: a, message: `${culture} prefers ${a.formationType} formation` });
      }
    }
  });
  return results;
}

module.exports = { adjustActionsForCulture };

# Command Catalog Schemas (current code-002)

This defines deterministic action schemas and a validator to gate execution.

- Schemas: src/game/schemas/
  - command.move.json — move actions
  - command.formation.json — formation changes
  - command.attack.json — attacks by unit or position
  - command.support.json — support fire actions
  - command.conditional.json — conditional plans (ifTrue/ifFalse lists of actions)
  - command.any.json — umbrella for refs
- Validator: src/game/schemas/index.js
  - Uses Ajv if installed (npm i ajv), else a minimal fallback.

Usage

```js
const { validateAction, validateActions } = require('../../src/game/schemas');
const action = { type: 'move', unitId: 'player1_inf_0', targetPosition: 'F11' };
const result = validateAction(action);
if (!result.valid) throw new Error(JSON.stringify(result.errors));
```

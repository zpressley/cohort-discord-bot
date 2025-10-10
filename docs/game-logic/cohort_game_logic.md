# Cohort Game Logic Layer Documentation

## Overview
The game logic layer implements historically-accurate ancient warfare mechanics including combat resolution, movement validation, pathfinding, and zone-based tactical positioning. All systems are grounded in historical research with documented sources.

---

## Battle Engine
**Location:** `src/game/battleEngine.js`

### Purpose
Core combat resolution engine implementing formation interactions, weapon effectiveness vs armor, environmental modifiers, and cultural bonuses based on comprehensive historical research. Transforms mathematical combat calculations into deterministic outcomes.

### Core Data Structures

#### **FORMATION_INTERACTIONS** (Constant Object)
Historically-researched formation vs formation modifiers
```javascript
{
  'phalanx_vs_cavalry': { attack: +8, defense: +3 },  // Sarissa supremacy
  'phalanx_vs_flanking': { attack: -6, defense: -4 }, // Major vulnerability
  'testudo_vs_missiles': { attack: 0, defense: +6 },   // Shield turtle
  'testudo_vs_melee': { attack: -3, defense: +1 },    // Combat penalty
  'cavalry_charge_vs_infantry': { 
    attack: +6, 
    requires_movement: 3  // Must have momentum
  },
  'berserker_fury': { 
    attack: +4, 
    defense: -2, 
    immune_fear: true 
  }
}
```

**Source:** Battle of Chaeronea (338 BC), Battle of Pydna (168 BC), Roman tactical manuals

#### **WEAPON_EFFECTIVENESS** (Constant Object)
Penetration percentages for weapon vs armor combinations
```javascript
{
  'composite_bow_vs_mail': 0.40,           // 40% at 100m (research data)
  'crossbow_vs_mail': 0.90,                // Ignores most armor
  'crossbow_vs_heavy_armor': 0.70,         // Still effective
  'sarissa_vs_cavalry': 0.85,              // Near immunity frontal
  'sarissa_vs_flanking': 0.20,             // Devastating weakness
  'falx_vs_shields': 1.0,                  // Two-handed, ignores shields
  'wootz_steel_vs_any': 0.90,              // Superior metallurgy +10%
  'gladius_vs_heavy_armor': 0.55           // Roman close combat
}
```

**Source:** Archaeological studies, Battle of Carrhae (53 BC), Mauryan metalworking texts

#### **ENVIRONMENTAL_EFFECTS** (Nested Object)
Weather and terrain modifiers based on experimental archaeology
```javascript
{
  weather: {
    clear: { all: 1.0 },
    light_rain: { 
      composite_bow: 0.8,      // -2 range wet strings
      movement: 0.9,            // -1 muddy ground
      visibility: 0.9 
    },
    heavy_rain: {
      composite_bow: 0.4,       // -4 range, strings lose tension
      wooden_shields: { 
        weight: 1.5,             // +50% weight waterlogged
        defense: 0.9             // -1 defense structural integrity
      },
      heavy_armor_movement: 0.9, // Mud interaction
      formation_coordination: 0.8 // -2 formation bonus
    },
    fog: {
      visibility: 0.6,           // -4 hexes
      ambush_bonus: 1.4,         // +4 attack (Lake Trasimene)
      formation_coordination: 0.7,
      ranged_targeting: 0.8
    },
    extreme_heat: {
      heavy_armor: { 
        endurance: 0.5,           // 2.1x energy expenditure
        turns_before_penalty: 5 
      },
      desert_culture_immunity: true
    },
    wind: {
      archery_with_wind: 1.2,    // +2 bonus
      archery_against_wind: 0.8, // -2 penalty
      fire_weapons: 1.3,          // +3 spread (Cannae)
      dust_visibility: 0.8
    }
  },
  
  terrain: {
    open_plains: { 
      cavalry_charge: 1.2,       // +2 effectiveness
      formation_bonus: 1.0,      // Optimal
      visibility: 1.0
    },
    light_hills: {
      uphill_attack: 0.7,        // -3 penalty
      elevated_missile: 1.1,     // +1 range gravity
      elevated_defense: 1.2      // +2 defense high ground
    },
    steep_mountains: {
      heavy_movement: 0.4,       // -3 movement
      formation_fighting: 0.2,   // -5 impossible to maintain
      defensive_multiplier: 1.4  // +4 defenders (Thermopylae)
    },
    dense_forest: {
      formation_fighting: 0.2,   // -5 impossible
      cavalry_effectiveness: 0.2,// -4 horses panic
      ambush_bonus: 1.6,         // +6 forest specialists
      ranged_effectiveness: 0.4  // -3 trees block
    },
    marshland: {
      heavy_movement: 0.4,       // -3 sinking
      formation_stability: 0.4,  // -3 unstable ground
      disease_risk: 0.15,        // +15% per turn
      light_penalty: 0.9         // -1 light units only
    }
  }
}
```

**Sources:** Teutoburg Forest (9 AD), Battle of Cannae (216 BC), University of Leeds armor experiments, Battle of Thermopylae (480 BC)

#### **CULTURAL_MODIFIERS** (Object)
Culture-specific bonuses and immunities
```javascript
{
  'Roman': {
    formation_discipline: 1.1,  // Professional army
    engineering_bonus: 1.2,     // Siege/fortification
    tactical_flexibility: 1.1   // Manipular system
  },
  'Celtic': {
    charge_bonus: 1.1,
    intimidation: 1.1,          // Berserker fury psychological
    forest_bonus: 1.2           // Native terrain
  },
  'Han Chinese': {
    crossbow_coordination: 1.2, // Volley tactics
    siege_bonus: 1.1            // Advanced siege tech
  },
  'Berber': {
    desert_immunity: true,      // Heat effects negated
    raid_bonus: 1.2             // Hit-and-run mastery
  },
  'Spartan': {
    phalanx_discipline: 1.3,    // Superior phalanx
    never_retreat: true         // Fight to 50% casualties
  }
}
```

### Main Functions

#### **`resolveCombat(attackingForce, defendingForce, battleConditions, tacticalContext)`**
**Purpose:** Master combat resolution function combining all systems
**Parameters:**
- `attackingForce` (Object): Attacking units with equipment, formations, culture
- `defendingForce` (Object): Defending units (same structure)
- `battleConditions` (Object): Terrain, weather, environmental factors
- `tacticalContext` (Object): Turn number, morale, special conditions

**Process Flow:**
```
Step 1: Calculate base combat values
  └─> calculateUnitEffectiveness() for both sides

Step 2: Apply formation interactions
  └─> calculateFormationInteractions()

Step 3: Apply environmental effects  
  └─> calculateEnvironmentalEffects()

Step 4: Calculate weapon vs armor
  └─> calculateWeaponEffectiveness()

Step 5: Apply cultural bonuses
  └─> applyCulturalModifiers()

Step 6: Calculate final combat outcome
  └─> calculateCombatOutcome()

Step 7: Determine casualties and morale
  └─> calculateCasualties()
  └─> calculateMoraleEffects()

Step 8: Generate tactical developments
  └─> determineTacticalDevelopments()
```

**Returns:**
```javascript
{
  combatResult: {
    result: 'attacker_major_victory',
    intensity: 'decisive',
    combatRatio: 1.8,
    attackerPower: 450,
    defenderPower: 250
  },
  casualties: {
    attacker: [{ casualties: 12, type: 'professional' }],
    defender: [{ casualties: 45, type: 'militia' }]
  },
  moraleChanges: {
    attacker: +15,
    defender: -20
  },
  tacticalDevelopments: ['formation_disruption', 'flanking_opportunity'],
  environmentalEffects: { /* modifier breakdown */ },
  nextTurnModifiers: { /* carry-over effects */ }
}
```

#### **`calculateUnitEffectiveness(force, conditions, combatType)`**
**Purpose:** Calculate unit's base combat statistics from equipment and training
**Logic:**
```javascript
let effectiveness = {
  attack: 0,
  defense: 0,
  mobility: 0,
  morale: force.currentMorale || 100
};

force.units.forEach(unit => {
  const baseStats = getUnitBaseStats(unit.qualityType);
  const veteranBonus = getVeteranBonus(unit.experience || 0);
  const sizeMultiplier = unit.currentStrength / unit.maxStrength;
  
  effectiveness.attack += (baseStats.attack + veteranBonus) * sizeMultiplier;
  effectiveness.defense += (baseStats.defense + veteranBonus) * sizeMultiplier;
  effectiveness.mobility += baseStats.mobility * sizeMultiplier;
});

return effectiveness;
```

**Base Unit Stats:**
```javascript
{
  'professional': { attack: 8, defense: 7, mobility: 6 },
  'militia': { attack: 5, defense: 5, mobility: 7 },
  'levy': { attack: 3, defense: 4, mobility: 8 },
  'cavalry': { attack: 9, defense: 6, mobility: 10 },
  'archers': { attack: 7, defense: 4, mobility: 7 },
  'elite': { attack: 10, defense: 9, mobility: 8 }
}
```

**Veteran Bonus Scale:**
```javascript
function getVeteranBonus(experience) {
  if (experience >= 11) return 3;  // Legendary
  if (experience >= 6) return 2;   // Elite veteran
  if (experience >= 3) return 1;   // Veteran
  if (experience >= 1) return 0;   // Seasoned
  return -1;                        // Recruit penalty
}
```

#### **`calculateCombatOutcome(stats, formationMods, envMods, weaponEff, culturalMods, context)`**
**Purpose:** Combine all modifiers into final combat ratio and determine result
**Mathematical Formula:**
```javascript
finalAttackerPower = attackerStats.attack * 
  (1 + formationMods.attack / 10) *      // +/-1 per 10 points
  envMods.attacker.attack *               // Multiplier
  weaponEffectiveness *                   // Penetration %
  (culturalMods.attacker.attack || 1.0);

finalDefenderPower = defenderStats.defense *
  (1 + formationMods.defense / 10) *
  envMods.defender.defense *
  (culturalMods.defender.defense || 1.0);

combatRatio = finalAttackerPower / finalDefenderPower;
```

**Result Thresholds:**
```javascript
if (combatRatio > 1.5) return 'attacker_major_victory';      // Decisive
else if (combatRatio > 1.2) return 'attacker_victory';       // Significant
else if (combatRatio > 1.0) return 'attacker_advantage';     // Slight
else if (combatRatio > 0.8) return 'defender_advantage';     // Slight
else if (combatRatio > 0.6) return 'defender_victory';       // Significant
else return 'defender_major_victory';                        // Decisive
```

#### **`calculateCasualties(combatResult, attackingForce, defendingForce)`**
**Purpose:** Determine killed/wounded based on combat intensity
**Casualty Rates:**
```javascript
{
  'decisive': { winner: 0.05, loser: 0.25 },      // 5% vs 25%
  'significant': { winner: 0.08, loser: 0.18 },   // 8% vs 18%
  'slight': { winner: 0.10, loser: 0.15 },        // 10% vs 15%
  'moderate': { winner: 0.12, loser: 0.12 }       // Stalemate
}
```

**Randomization:** ±40% variance (0.8 to 1.2 multiplier) prevents deterministic outcomes

**Historical Basis:** Greek hoplite battles averaged 10% casualties (5% winner, 14% loser), Roman battles 15-25% for losers

---

## Movement System
**Location:** `src/game/movementSystem.js`

### Purpose
Validates unit movement across 20×20 grid battlefield using A* pathfinding, applies terrain movement costs, checks collisions, and parses natural language movement orders.

### Core Functions

#### **`validateMovement(unit, targetPosition, map)`**
**Purpose:** Validate if unit can reach target position this turn
**Process:**
1. Call `findPathAStar()` to get optimal path
2. Calculate `pathCost` using terrain modifiers
3. Compare cost to unit's `movementRemaining`
4. Return validation result

**Returns:**
```javascript
{
  valid: true,
  path: ['A5', 'A6', 'B6'],           // Coordinates
  cost: 2.5,                           // Movement points used
  movementRemaining: 0.5,              // Points left
  targetTerrain: 'ford',               // Destination type
  error: null                          // Or error message if invalid
}
```

**Example Invalid:**
```javascript
{
  valid: false,
  error: 'Target too far: requires 4.5 movement, you have 3',
  reason: 'insufficient_movement',
  path: ['A5', 'A6', 'B6', 'C6'],     // Shows attempted path
  cost: 4.5
}
```

#### **`getTerrainType(coord, map)`**
**Purpose:** Identify terrain at specific coordinate
**Logic:**
```javascript
if (map.terrain.river.includes(coord)) {
  // Check if it's a ford
  if (map.terrain.fords?.some(f => f.coord === coord)) {
    return 'ford';
  }
  return 'river'; // Impassable
}
if (map.terrain.hill.includes(coord)) return 'hill';
if (map.terrain.marsh.includes(coord)) return 'marsh';
if (map.terrain.road.includes(coord)) return 'road';
if (map.terrain.forest.includes(coord)) return 'forest';
return 'plains';
```

#### **`checkCollision(targetCoord, allUnits, movingUnitId)`**
**Purpose:** Detect unit collisions at target position
**Returns:**
```javascript
// No collision
{ collision: false }

// Friendly collision
{
  collision: true,
  type: 'friendly',
  message: 'Position occupied by friendly unit',
  canStack: true  // Allow stacking up to 3 units
}

// Enemy collision
{
  collision: true,
  type: 'enemy',
  message: 'Enemy unit detected',
  triggersCombat: true,
  enemyUnits: [unit1, unit2]
}
```

#### **`applyMovementModifiers(baseMovement, terrain, modifiers)`**
**Purpose:** Calculate effective movement after terrain and order modifiers

**Terrain Multipliers:**
```javascript
{
  marsh: 0.33,     // Very slow (1/3 speed)
  forest: 0.5,     // Half speed
  hill: 0.66,      // Slower uphill (2/3 speed)
  road: 2.0        // Double speed on roads
}
```

**Order Modifiers:**
```javascript
// "Cautious advance"
modifiers.cautious = true;
modifiers.speedMultiplier = 0.5;
modifiers.defenseBonus = +1;

// "Forced march"
modifiers.forcedMarch = true;
modifiers.speedMultiplier = 1.5;
modifiers.fatigueNextTurn = -1;

// "Stealth approach"
modifiers.stealth = true;
modifiers.speedMultiplier = 0.7;
modifiers.detectionPenalty = -2;  // Harder to detect
```

**Final Calculation:**
```javascript
effectiveMovement = baseMovement * 
  (modifiers.speedMultiplier || 1.0) *
  (terrainMultiplier || 1.0);

return Math.floor(effectiveMovement);  // Round down
```

#### **`parseMovementOrder(order, unit, map)`**
**Purpose:** Convert natural language to movement target
**Examples:**
```javascript
// Explicit coordinate
"Move to F11" → { targetCoord: 'F11', intent: 'move_to_coordinate' }

// Named location
"Advance to the ford" → { targetCoord: 'F11', intent: 'move_to_ford' }

// Directional
"Move north" → { 
  targetCoord: 'A2',  // Calculated from current + direction
  intent: 'move_direction',
  direction: 'north' 
}

// Hold position
"Hold position" → { 
  targetCoord: unit.position,
  intent: 'hold_position' 
}
```

**Direction Vectors:**
```javascript
{
  north: { row: -1, col: 0 },
  south: { row: +1, col: 0 },
  east: { row: 0, col: +1 },
  west: { row: 0, col: -1 },
  northeast: { row: -1, col: +1 },
  northwest: { row: -1, col: -1 },
  southeast: { row: +1, col: +1 },
  southwest: { row: +1, col: -1 }
}
```

---

## Turn Orchestrator
**Location:** `src/game/turnOrchestrator.js`

### Purpose
Master coordination layer that processes complete turns by orchestrating movement, detection (fog of war), combat resolution, casualty application, and narrative generation. Handles both players' orders simultaneously.

### Main Function

#### **`processTurn(battle, player1Order, player2Order, map)`**
**Purpose:** Execute complete turn from both players' orders to updated battle state

**Seven-Phase Process:**

**PHASE 1: Order Interpretation**
```javascript
const p1Interpretation = await interpretOrders(
  player1Order, 
  battleState, 
  'player1', 
  map
);
const p2Interpretation = await interpretOrders(
  player2Order, 
  battleState, 
  'player2', 
  map
);
```
*AI parses natural language into validated game actions*

**PHASE 2: Movement Execution**
```javascript
const movementResults = processMovementPhase(
  p1Interpretation.validatedActions.filter(a => a.type === 'move'),
  p2Interpretation.validatedActions.filter(a => a.type === 'move'),
  battleState,
  map
);
```
*Returns: `{ newPositions, combatEngagements, movementSummary }`*

**PHASE 3: Intelligence Update (Fog of War)**
```javascript
const p1Visibility = calculateVisibility(
  movementResults.newPositions.player1,
  movementResults.newPositions.player2,
  map.terrain
);
```
*Each player sees what their units can see (line of sight 3 tiles)*

**PHASE 4: Combat Resolution**
```javascript
for (const engagement of movementResults.combatEngagements) {
  const result = await resolveCombat(
    buildForceFromUnit(engagement.attacker, battleState),
    buildForceFromUnit(engagement.defender, battleState),
    { weather, terrain, positionModifiers },
    { turnNumber, location }
  );
  combatResults.push({ location, result, tacticalSituation });
}
```

**PHASE 5: Casualty Application**
```javascript
const updatedPositions = applyCasualties(
  movementResults.newPositions,
  combatResults
);
```
*Reduces unit strength, removes destroyed units (≤0 strength)*

**PHASE 6: Victory Check**
```javascript
const victoryCheck = checkVictoryConditions(
  updatedPositions,
  battle.currentTurn,
  map.objectives
);
```
*Checks: annihilation (0 strength), catastrophic casualties (>75%), objectives*

**PHASE 7: Narrative Generation**
```javascript
const narrative = await generateTurnNarrative({
  movements: movementResults,
  intelligence: { player1: p1Visibility, player2: p2Visibility },
  combats: combatResults,
  casualties: extractCasualtySummary(combatResults)
}, battleState, battle.currentTurn);
```

**Final Return:**
```javascript
{
  success: true,
  newBattleState: {
    player1: {
      unitPositions: updatedPositions.player1,
      visibleEnemyPositions: p1Visibility.visibleEnemyPositions
    },
    player2: { /* same structure */ }
  },
  turnResults: {
    movements: movementSummary,
    intelligence: { player1Detected: 3, player2Detected: 2 },
    combats: 2,
    casualties: { player1: 15, player2: 8 }
  },
  narrative: { /* AI-generated story */ },
  victory: { achieved: false },
  phase: 'complete'
}
```

### Helper Functions

#### **`buildForceFromUnit(unitData, battleState)`**
**Purpose:** Convert positioned unit into combat force structure
**Returns:**
```javascript
{
  units: [unitData.unit],
  culture: armyData.culture,
  formation: 'standard',              // Extracted from orders
  equipment: {},                       // From unit data
  currentMorale: battleState.morale,
  positionModifiers: unitData.positionModifiers  // Terrain bonuses
}
```

#### **`applyCasualties(positions, combatResults)`**
**Purpose:** Subtract casualties from unit strengths
**Process:**
1. Find units at combat locations
2. Subtract casualty counts from currentStrength
3. Filter out destroyed units (strength ≤ 0)
4. Return updated position arrays

#### **`checkVictoryConditions(positions, turnNumber, objectives)`**
**Purpose:** Determine if battle should end
**Conditions:**
- Annihilation: One side has 0 total strength
- Catastrophic: One side lost 75%+ of original strength
- Objectives: Control of fords, hills, etc (scenario-specific)
- Turn limit: Battle ends after 12 turns with tactical victory

**Early Turn Protection:** No victory before Turn 3 unless complete annihilation (prevents instant wins)

---

## Design Philosophy

### Historical Accuracy
All modifiers are based on documented research:
- Formation bonuses from Battle of Chaeronea, Pydna, Carrhae
- Weather effects from Teutoburg Forest, Cannae dust storms
- Terrain modifiers from Thermopylae chokepoint, forest ambushes
- Weapon penetration from archaeological armor tests

### Deterministic with Variance
- Combat is mathematically resolved (not random)
- Casualty variance (±40%) prevents perfect prediction
- Player skill determines tactics, not dice rolls

### Zone-Based Tactical Depth
- 20×20 grid creates meaningful positioning
- Line of sight (3 tiles) creates fog of war
- Terrain modifiers force tactical adaptation
- Movement costs create strategic choices

### Emotional Investment
- Named officers with personalities create attachment
- Permanent death means lost knowledge hurts
- Veteran progression rewards careful play
- Casualties have long-term consequences
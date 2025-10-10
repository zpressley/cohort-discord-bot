# Cohort Complete Function Reference

## Overview
Alphabetical reference of every major function in the Cohort codebase with parameters, return values, and usage examples.

---

## Database Model Functions

### VeteranOfficer Model

#### `addBattleExperience(battleType, enemies, terrain, weather, outcome)`
**Location:** `src/database/models/VeteranOfficer.js`
**Purpose:** Record battle participation and accumulate tactical knowledge
**Parameters:**
- `battleType` (string): 'standard' | 'siege' | 'ambush'
- `enemies` (string): Enemy culture name
- `terrain` (string): Battlefield terrain type
- `weather` (string): Weather conditions
- `outcome` (string): 'victory' | 'defeat' | 'draw'

**Process:**
1. Increment `battlesExperience += 1`
2. Add/increment enemy culture counter in `tacticalKnowledge.enemyCultures`
3. Add/increment terrain counter in `tacticalKnowledge.terrainExperience`
4. Add/increment weather counter in `tacticalKnowledge.weatherAdaptation`
5. Generate contextual lesson via `generateBattleLesson()`
6. Append to `battleMemories` array (max 10, FIFO)
7. Save to database

**Returns:** `Promise<VeteranOfficer>`

**Example:**
```javascript
await officer.addBattleExperience(
  'standard',
  'Celtic Tribes',
  'forest',
  'rain',
  'victory'
);
// Officer now has:
// - battlesExperience: 8
// - enemyCultures.Celtic: 2
// - terrainExperience.forest: 3
// - battleMemories: [..., "Celts struggle in rain - wet ground slows charges"]
```

#### `getKnowledgeBonus(enemyCulture, terrain, weather)`
**Purpose:** Calculate tactical bonus from accumulated experience
**Returns:** Integer (0-6)
**Formula:**
```javascript
bonus = min(enemyCultureExp, 3) +  // Max +3
        min(terrainExp, 2) +        // Max +2
        min(weatherExp, 1);         // Max +1
```

**Example:**
```javascript
// Officer with 4 battles vs Romans, 3 in hills, 2 in rain
const bonus = officer.getKnowledgeBonus('Roman Republic', 'hills', 'rain');
// Returns: min(4,3) + min(3,2) + min(2,1) = 3 + 2 + 1 = 6
```

#### `killInBattle(battleName, cause)`
**Purpose:** Permanently kill officer and record death
**Effects:**
- Sets `isAlive = false`
- Records death details
- **All tactical knowledge lost forever**

**Returns:** `Promise<VeteranOfficer>`

#### `getExperienceLevel()`
**Purpose:** Convert battle count to readable tier
**Returns:** String
**Thresholds:** 0→Recruit, 1→Seasoned, 3→Veteran, 6→Elite, 11→Legendary

---

### EliteUnit Model

#### `calculateVeteranLevel()`
**Purpose:** Update veteran tier based on average experience
**Logic:**
```javascript
if (averageExperience >= 11) veteranLevel = 'Legendary';
else if (averageExperience >= 6) veteranLevel = 'Elite Veteran';
else if (averageExperience >= 3) veteranLevel = 'Veteran';
else if (averageExperience >= 1) veteranLevel = 'Seasoned';
else veteranLevel = 'Recruit';
```
**Returns:** `Promise<EliteUnit>` (saves changes)

#### `addBattleExperience(survivors)`
**Purpose:** Apply post-battle veteran progression
**Parameters:**
- `survivors` (number): Count of surviving warriors

**Mathematical Process:**
```javascript
// If no casualties (default)
totalExperience += currentStrength;  // All gain +1
battlesParticipated += 1;

// If casualties occurred
if (survivors < currentStrength) {
  const casualties = currentStrength - survivors;
  const avgExp = averageExperience;
  const experienceLost = Math.round(casualties * avgExp);
  
  totalExperience = totalExperience + survivors - experienceLost;
  currentStrength = survivors;
}
```

**Returns:** `Promise<EliteUnit>`

**Example:**
```javascript
// Pre-battle: 80 warriors, 280 total exp (3.5 avg)
await eliteUnit.addBattleExperience(65);  // 15 casualties

// Calculation:
// +65 from survivors = 345
// -53 from casualties (15 × 3.5) = 292
// New average: 292 ÷ 65 = 4.49 → Veteran tier maintained
```

#### `addRecruits(newRecruits)`
**Purpose:** Restore unit strength with fresh recruits
**Parameters:**
- `newRecruits` (number): Warriors to add (default to restore full strength)

**Effect:**
```javascript
currentStrength += newRecruits;
// totalExperience unchanged (recruits have 0)
// averageExperience drops (larger denominator)
```

**Example:**
```javascript
// 65 veterans with 4.49 avg (292 total exp)
await eliteUnit.addRecruits(15);  // Restore to 80

// New average: 292 ÷ 80 = 3.65 → Drops to Veteran tier
```

#### `getDeathProbability()`
**Purpose:** Calculate officer death chance for this battle
**Returns:** Float (0.06 to 0.15)
**Scale:**
- Legendary (11+): 6%
- Elite (6-10): 8%
- Veteran (3-5): 10%
- Seasoned (1-2): 12%
- Recruit (0): 15%

---

### Battle Model

#### `getOpponent(playerId)`
**Purpose:** Get the other player's Discord ID
**Returns:** String (Discord ID)
**Usage:** `const enemyId = battle.getOpponent(myId);`

#### `advanceTurn()`
**Purpose:** Increment turn counter
**Effect:** `currentTurn += 1`
**Returns:** `Promise<Battle>`

#### `isComplete()`
**Purpose:** Check if battle has ended
**Returns:** Boolean
**Conditions:** `status === 'completed' OR currentTurn > maxTurns OR winner !== null`

#### `setWinner(playerId, reason)`
**Purpose:** Conclude battle with victor
**Parameters:**
- `playerId` (string): Winner's Discord ID or null for draw
- `reason` (string, optional): 'victory' | 'timeout' | 'forfeit'

**Effects:**
- Sets `winner = playerId`
- Sets `status = 'completed'`
- Records completion details in `battleResult`

**Returns:** `Promise<Battle>`

#### `generateWeather()`
**Purpose:** Randomly select weather for battle
**Probability Distribution:**
```javascript
const rand = Math.random();
if (rand < 0.40) return 'clear';           // 40%
else if (rand < 0.75) return 'light_rain'; // 35%
else if (rand < 0.85) return 'fog';        // 10%
else if (rand < 0.93) return 'extreme_heat'; // 8%
else if (rand < 0.97) return 'wind';       // 4%
else if (rand < 0.99) return 'cold';       // 2%
else return 'storm';                       // 1%
```
**Returns:** `Promise<Battle>` (saves weather)

---

### Commander Model

#### `updateRank()`
**Purpose:** Recalculate commander rank from battle count
**Thresholds:**
- 25+ battles: Legendary
- 10-24 battles: Elite
- 3-9 battles: Veteran
- 0-2 battles: Recruit

**Returns:** `Promise<Commander>`

#### `addCulturalKnowledge(culture, knowledge)`
**Purpose:** Record tactical lesson learned from defeating enemy culture
**Parameters:**
- `culture` (string): Enemy culture name
- `knowledge` (string): Tactical insight

**Prevents Duplicates:** Checks if knowledge already exists

**Example:**
```javascript
await commander.addCulturalKnowledge(
  'Macedonian Kingdoms',
  'Sarissa phalanx vulnerable to flanking - exploit with cavalry'
);
```

**Returns:** `Promise<Commander>`

#### `getWinRate()`
**Purpose:** Calculate win percentage
**Formula:** `(battlesWon / totalBattles) × 100`
**Returns:** Integer (0-100) or 0 if no battles

---

### BattleTurn Model

#### `addPlayerCommand(playerId, command)`
**Purpose:** Store player's order for this turn
**Effect:** Sets `player1Command` or `player2Command`
**Returns:** `Promise<BattleTurn>`

#### `bothPlayersReady()`
**Purpose:** Check if both commands submitted
**Returns:** Boolean
**Logic:** `player1Command !== null && player2Command !== null`

#### `resolveTurn(aiAnalysis, combatResults, narrative)`
**Purpose:** Record turn resolution results
**Parameters:**
- `aiAnalysis` (Object): AI interpretation of tactics
- `combatResults` (Object): Mathematical combat outcomes
- `narrative` (String): Generated battle story

**Effects:**
- Sets all three parameters
- Sets `isResolved = true`
- Sets `resolvedAt = new Date()`

**Returns:** `Promise<BattleTurn>`

#### `addOfficerEvent(type, officerId, details)`
**Purpose:** Record officer-specific events (promotion, death, heroism)
**Parameters:**
- `type` (string): 'promotions' | 'casualties' | 'heroicDeeds'
- `officerId` (UUID): Officer reference
- `details` (Object): Event specifics

**Returns:** `Promise<BattleTurn>`

---

## Game Logic Functions

### Battle Engine

#### `resolveCombat(attackingForce, defendingForce, battleConditions, tacticalContext)`
**Location:** `src/game/battleEngine.js`
**Purpose:** Master combat resolution combining all modifiers
**Parameters:**
```javascript
attackingForce: {
  units: Array,
  culture: String,
  formation: String,
  equipment: Object,
  currentMorale: Number
}

defendingForce: {
  // Same structure
}

battleConditions: {
  weather: String,
  terrain: String,
  positionModifiers: Object
}

tacticalContext: {
  turnNumber: Number,
  location: String
}
```

**Returns:**
```javascript
{
  combatResult: {
    result: String,        // Victory type
    intensity: String,     // Casualty severity
    combatRatio: Number,   // Power ratio
    attackerPower: Number,
    defenderPower: Number
  },
  casualties: {
    attacker: Array,
    defender: Array
  },
  moraleChanges: {
    attacker: Number,
    defender: Number
  },
  tacticalDevelopments: Array,
  environmentalEffects: Object,
  nextTurnModifiers: Object
}
```

#### `calculateUnitEffectiveness(force, conditions, combatType)`
**Purpose:** Calculate base combat statistics
**Returns:** Object with attack, defense, mobility, morale values

#### `calculateFormationInteractions(attackerFormation, defenderFormation)`
**Purpose:** Get formation vs formation modifiers
**Returns:** `{ attack: Number, defense: Number }`
**Example:** `('phalanx', 'cavalry') → { attack: +8, defense: +3 }`

#### `calculateEnvironmentalEffects(conditions, attackingForce, defendingForce)`
**Purpose:** Apply weather and terrain modifiers
**Returns:**
```javascript
{
  attacker: { attack: 0.9, defense: 1.0, mobility: 0.8 },
  defender: { attack: 1.0, defense: 1.2, mobility: 0.7 }
}
```

#### `calculateWeaponEffectiveness(attackerEquipment, defenderEquipment)`
**Purpose:** Calculate penetration percentage
**Returns:** Float (0.0-1.0)
**Example:** Crossbow vs mail → 0.90 (90% effective)

#### `applyCulturalModifiers(attackerCulture, defenderCulture, conditions)`
**Purpose:** Add cultural bonuses
**Returns:**
```javascript
{
  attacker: { attack: 1.1, engineering: 1.2 },
  defender: { defense: 1.3, phalanx: 1.3 }
}
```

#### `calculateCasualties(combatResult, attackingForce, defendingForce)`
**Purpose:** Determine killed/wounded from combat
**Returns:**
```javascript
{
  attacker: [{ casualties: 12, type: 'professional' }],
  defender: [{ casualties: 45, type: 'militia' }]
}
```

---

### Movement System

#### `validateMovement(unit, targetPosition, map)`
**Location:** `src/game/movementSystem.js`
**Purpose:** Check if movement is valid (path exists, within range)

**Process:**
1. Call `findPathAStar(unit.position, targetPosition, map)`
2. Calculate path cost using terrain modifiers
3. Compare to `unit.movementRemaining`
4. Return validation result

**Returns (Valid):**
```javascript
{
  valid: true,
  path: ['A5', 'A6', 'B6', 'C6'],
  cost: 3.5,
  movementRemaining: 0.5,
  targetTerrain: 'ford'
}
```

**Returns (Invalid):**
```javascript
{
  valid: false,
  error: 'Target too far: requires 4.5 movement, you have 3',
  reason: 'insufficient_movement',
  path: ['A5', ..., 'D6'],
  cost: 4.5
}
```

#### `executeMovement(unit, movementResult)`
**Purpose:** Apply validated movement to unit
**Returns:** Updated unit object with new position

#### `parseMovementOrder(order, unit, map)`
**Purpose:** Convert natural language to target coordinate
**Returns:**
```javascript
{
  targetCoord: 'F11',
  intent: 'move_to_ford',
  modifiers: { cautious: false, forcedMarch: false }
}
```

#### `checkCollision(targetCoord, allUnits, movingUnitId)`
**Purpose:** Detect unit at target position
**Returns:**
```javascript
{
  collision: true,
  type: 'enemy',
  triggersCombat: true,
  enemyUnits: [unit1, unit2]
}
```

#### `applyMovementModifiers(baseMovement, terrain, modifiers)`
**Purpose:** Calculate effective movement after penalties/bonuses
**Formula:** `base × speedMultiplier × terrainMultiplier`
**Returns:** Integer (floored movement value)

---

### Fog of War

#### `calculateVisibility(playerUnits, enemyUnits, terrain, weather)`
**Location:** `src/game/fogOfWar.js`
**Purpose:** Determine what player can see

**Algorithm:**
```javascript
For each player unit:
  1. Calculate vision range (base + elevation + weather)
  2. For each enemy unit:
    a. Calculate distance
    b. If within range AND line of sight:
       - Close range (0-50%): Confirmed intel
       - Medium range (50-80%): Estimated intel
       - Max range (80-100%): Suspected intel
    c. If just beyond range (+2 tiles):
       - Approximate detection (noise/dust)
```

**Returns:**
```javascript
{
  visibleEnemyPositions: ['M5', 'K8'],
  intelligence: {
    confirmed: [/* detailed objects */],
    estimated: [/* approximate objects */],
    suspected: [/* vague objects */]
  },
  totalEnemiesDetected: 3
}
```

#### `filterBattleStateForPlayer(battleState, playerSide)`
**Purpose:** Apply fog of war to complete battle state
**Returns:**
```javascript
{
  yourForces: {
    units: Array,       // Full data
    army: Object,
    supplies: Number,
    morale: Number
  },
  enemyForces: {
    detectedUnits: Array,    // Only visible enemies
    estimatedUnits: Array,
    suspectedActivity: Array,
    totalDetected: Number,
    unknownForces: Number    // Count of undetected
  },
  terrain: Object,
  weather: String,
  turnNumber: Number
}
```

#### `generateIntelligenceReport(visibility, culture)`
**Purpose:** Format visibility data as cultural officer report
**Returns:** String (formatted embed text)
**Example:**
```
📍 **Confirmed Contact at M5**
Centurion Marcus: "Enemy sarissa phalanx, approximately 90 spears..."

👁️ **Enemy Spotted at K8**
Optio Gaius: "Cavalry in the eastern sector, 50-60 riders..."

⚠️ **Possible Activity**
Movement detected in eastern forest - details unclear
```

#### `hasLineOfSight(from, to, terrain)`
**Purpose:** Check if terrain blocks visibility
**Algorithm:** Bresenham line algorithm checking intervening tiles
**Blocking Terrain:**
- Dense forest: Always blocks
- Hills: Blocks unless both endpoints elevated

**Returns:** Boolean

#### `processScoutMission(scoutUnit, targetArea, battleState)`
**Purpose:** Execute dedicated scout order
**Returns:**
```javascript
{
  scoutPosition: 'L8',
  detectedEnemies: [/* high confidence intel */],
  reportAvailable: true,
  scoutSurvived: true  // 50% chance if enemy within 1 tile
}
```

---

### Position-Based Combat

#### `detectCombatTriggers(player1Units, player2Units)`
**Location:** `src/game/positionBasedCombat.js`
**Purpose:** Find all combat engagements from unit proximity

**Detection Rules:**
- Distance = 1 tile → Melee combat
- Distance 2-5 tiles + ranged weapon → Ranged combat

**Returns:** Array of combat engagement objects

#### `calculatePositionalModifiers(attacker, defender, allUnits, map)`
**Purpose:** Calculate tactical bonuses from positioning

**Checks:**
1. Flanking: Friendly units attacking same target
2. Elevation: High ground advantage
3. River crossing: Crossing penalty
4. Forest: Cover and cavalry penalties
5. Marsh: Movement and coordination penalties

**Returns:**
```javascript
{
  attacker: { attack: +2, defense: 0 },
  defender: { attack: 0, defense: +4 },
  description: [
    'Flanking attack: +2',
    'Defender on hill: +2',
    'Forest cover: +2'
  ]
}
```

#### `calculateFlankingBonus(attacker, defender, allUnits)`
**Purpose:** Count friendly units attacking same enemy
**Returns:**
- 0 friendlies: 0 bonus
- 1 friendly: +2 (two-sided attack)
- 2+ friendlies: +4 (surrounded, Cannae-style)

#### `calculateElevationAdvantage(attackerPos, defenderPos, map)`
**Purpose:** Determine high ground bonuses
**Returns:**
```javascript
{ defender: +2, attacker: 0 }  // Defender elevated
{ attacker: +2, defender: 0 }  // Attacker elevated (rare)
{ attacker: 0, defender: 0 }   // Level ground
```

#### `isCrossingRiver(attackerPos, defenderPos, map)`
**Purpose:** Detect river crossing attack
**Conditions:**
- Defender at ford
- Attacker adjacent but not at ford
- Distance = 1 tile

**Returns:**
```javascript
{
  attacker: { attack: -4, vulnerable: true },
  defender: { defense: +3, secure: true },
  description: 'Attacking across water - formation disrupted'
}
```

#### `processMovementPhase(p1Moves, p2Moves, battleState, map)`
**Purpose:** Execute all movements and detect resulting combats

**Process:**
1. Apply all Player 1 movements
2. Apply all Player 2 movements
3. Detect combat triggers from new positions
4. Build combat contexts with position modifiers

**Returns:**
```javascript
{
  newPositions: {
    player1: [/* updated unit positions */],
    player2: [/* updated unit positions */]
  },
  combatEngagements: [/* full combat contexts */],
  movementSummary: {
    player1Moves: 2,
    player2Moves: 1
  }
}
```

---

### Turn Orchestrator

#### `processTurn(battle, player1Order, player2Order, map)`
**Location:** `src/game/turnOrchestrator.js`
**Purpose:** Execute complete turn from orders to narrative

**Seven-Phase Process:**
1. Interpret orders (AI)
2. Execute movements
3. Update visibility (fog of war)
4. Detect and resolve combat
5. Apply casualties
6. Check victory conditions
7. Generate narrative

**Returns:**
```javascript
{
  success: true,
  newBattleState: Object,
  turnResults: {
    movements: Object,
    intelligence: Object,
    combats: Number,
    casualties: Object
  },
  narrative: Object,
  victory: {
    achieved: Boolean,
    winner: String,
    reason: String
  },
  phase: 'complete'
}
```

#### `checkVictoryConditions(positions, turnNumber, objectives)`
**Purpose:** Determine if battle should end

**Victory Types:**
1. **Annihilation:** One side has 0 strength
2. **Catastrophic:** One side lost 75%+ of original strength
3. **Objectives:** Scenario-specific (ford control, hill capture)
4. **Turn Limit:** After 12 turns, tactical victory by casualties

**Returns:**
```javascript
{
  achieved: true,
  winner: 'player1',
  reason: 'enemy_destroyed'
}
```

#### `applyCasualties(positions, combatResults)`
**Purpose:** Subtract casualties from unit strengths

**Process:**
1. Find units at combat locations
2. Subtract casualty counts
3. Remove destroyed units (strength ≤ 0)

**Returns:**
```javascript
{
  player1: [/* units with reduced strength */],
  player2: [/* units with reduced strength */]
}
```

---

## AI System Functions

### Order Interpreter

#### `interpretOrders(orderText, battleState, playerSide, map)`
**Location:** `src/ai/orderInterpreter.js`
**Purpose:** Parse natural language order into game actions

**Process:**
1. Build context (units, terrain, culture)
2. Generate AI prompt with context
3. Call AI for parsing
4. Validate each action via movement/combat systems
5. Return validated actions with errors

**Returns:**
```javascript
{
  validatedActions: [
    {
      type: 'move',
      unitId: 'player1_professional_0',
      targetPosition: 'F11',
      validation: {/* movement validation */}
    }
  ],
  errors: [
    {
      unit: 'player1_cavalry_0',
      error: 'Target too far',
      reason: 'insufficient_movement'
    }
  ],
  officerComment: 'Centurion Marcus: Advancing to ford, sir.',
  rawAIResponse: Object
}
```

#### `isQuestion(text)`
**Purpose:** Distinguish questions from orders
**Detection:**
- Contains '?'
- Starts with question word
- Sentence structure indicates question

**Returns:** Boolean

**Examples:**
```javascript
isQuestion("Where is the enemy?")        // true
isQuestion("Advance to the ford")        // false
isQuestion("Should we attack?")          // true
isQuestion("Attack!")                    // false
```

---

### Officer Q&A

#### `answerTacticalQuestion(question, battleState, playerSide, eliteUnit)`
**Location:** `src/ai/officerQA.js`
**Purpose:** Generate officer response to player question

**Process:**
1. Filter battle state for fog of war
2. Get relevant veteran memories
3. Build cultural officer prompt
4. Call AI with limited context
5. Return officer's answer

**Returns:**
```javascript
{
  officerName: 'Centurion Marcus the Steady',
  response: "Sir, I've faced Macedonian phalanxes three times before. That sarissa wall looks solid - frontal assault will cost us dearly...",
  confidence: 'high',
  basedOn: ['enemy culture experience', 'visible positions', 'veteran memories']
}
```

#### `buildOfficerQuestionPrompt(question, visibleState, memories, culture)`
**Purpose:** Construct AI prompt with limited battlefield knowledge
**Key Constraint:** Officer sees only what units can see (fog of war)

**Returns:** String (complete AI prompt)

#### `getCulturalPersonality(culture)`
**Purpose:** Get officer archetype for culture
**Returns:**
```javascript
{
  officerName: 'Centurion Marcus',
  description: 'professional Roman officer, engineering-focused',
  speechStyle: 'Professional, direct, formal',
  additional: 'Romans value systematic tactics...'
}
```

#### `getRelevantMemories(eliteUnit, question, battleState)`
**Purpose:** Find veteran memories relevant to question

**Matching Logic:**
- Current enemy culture
- Terrain keywords (river, forest, hill)
- Tactical patterns (flank, cavalry, charge)

**Returns:** Array of memory objects (max 3)

---

### AI Narrative Engine

#### `generateBattleNarrative(combatResult, battleContext, officerMemories, turnHistory)`
**Location:** `src/ai/aiNarrativeEngine.js`
**Purpose:** Convert math to immersive story

**Returns:**
```javascript
{
  mainNarrative: {
    fullNarrative: String (200-300 words),
    template: String,
    historicalReference: String
  },
  officerReports: {
    attacker: Object,
    defender: Object
  },
  tacticalAnalysis: Object,
  nextTurnSetup: Object,
  historicalParallel: String
}
```

#### `findHistoricalParallel(combatResult, battleContext)`
**Purpose:** Match current battle to historical precedent

**Scoring:**
- Terrain match: +3
- Formation match: +2
- Combat result: +2
- Cultural enemies: +1

**Returns:**
```javascript
{
  key: 'river_crossing_victory',
  battles: ['Battle of Granicus (334 BC)'],
  narrative_elements: ['swift current', 'cavalry charge'],
  reference: 'Battle of Granicus (334 BC)'
}
```

#### `generateOfficerReports(combatResult, battleContext, officerMemories)`
**Purpose:** Create cultural officer perspectives
**Returns:** Object with attacker and defender officer reports

#### `generateOfficerPerspective(officer, culture, combatResult, side, memories)`
**Purpose:** Generate individual officer speech

**Process:**
1. Determine victory/defeat/stalemate
2. Select cultural speech pattern
3. Add memory context prefix
4. Add tactical analysis suffix
5. Format with officer name and rank

**Returns:**
```javascript
{
  officerName: 'Centurion Marcus the Steady',
  rank: 'Centurion',
  speech: 'The veteran\'s eyes narrow - "Discipline conquers all. We must consolidate our gains systematically."',
  personality: 'professional_disciplined',
  experience: 7
}
```

---

### AI Manager

#### `initializeAI()`
**Location:** `src/ai/aiManager.js`
**Purpose:** Initialize all AI provider connections
**Process:**
1. Load API keys from environment
2. Create OpenAI client
3. Create Anthropic client
4. Create Groq client
5. Log successful initializations

**Returns:** Void (sets module-level variables)

#### `generateBattleNarrative(battleContext, aiProvider)`
**Purpose:** Orchestrate AI narrative generation

**Parameters:**
- `battleContext` (Object): Battle state, combat results, cultures
- `aiProvider` (String): 'auto' | 'openai' | 'anthropic' | 'groq'

**Provider Selection (if 'auto'):**
```javascript
complexity = calculateBattleComplexity(context);

if (complexity >= 8 && anthropic) return 'anthropic';  // Premium
if (complexity <= 3 && groq) return 'groq';           // Simple
return 'openai';                                       // Standard
```

**Returns:** String (generated narrative) or template fallback

#### `selectBestProvider(battleContext)`
**Purpose:** Cost-optimize AI provider selection
**Complexity Calculation:**
```javascript
let complexity = 1;
if (eliteUnits > 1) complexity += 2;
if (weather !== 'clear') complexity += 1;
if (terrain !== 'plains') complexity += 1;
if (turn > 8) complexity += 2;
if (veteranOfficers > 5) complexity += 1;
// Range: 1-10
```

**Returns:** String ('openai' | 'anthropic' | 'groq' | 'template')

#### `generateWithOpenAI(context)`
**Purpose:** Call OpenAI GPT-4o-mini
**Model:** gpt-4o-mini
**Cost:** $0.003-0.006 per battle
**Max Tokens:** 800

**Returns:** String (narrative)

#### `generateWithAnthropic(context)`
**Purpose:** Call Claude 3.5 Sonnet
**Model:** claude-3-5-sonnet-20241022
**Cost:** $0.06-0.12 per battle
**Max Tokens:** 800

**Returns:** String (narrative)

#### `generateWithGroq(context)`
**Purpose:** Call Groq Llama 3 70B
**Model:** llama3-70b-8192
**Cost:** $0.002-0.003 per battle
**Max Tokens:** 600

**Returns:** String (narrative)

#### `generateTemplateResponse(context)`
**Purpose:** Fallback when all AI providers fail
**Returns:** Basic template narrative maintaining game flow

---

## Map Utility Functions

### Coordinate System

#### `parseCoord(coord)`
**Location:** `src/game/maps/mapUtils.js`
**Purpose:** Convert string coordinate to row/col object
**Example:** `'F11' → { row: 10, col: 5 }`
**Validation:** Throws error if invalid format or out of bounds

#### `coordToString(pos)`
**Purpose:** Convert row/col object to string coordinate
**Example:** `{ row: 10, col: 5 } → 'F11'`

#### `calculateDistance(from, to)`
**Purpose:** Chebyshev distance (king's move)
**Formula:** `max(|dx|, |dy|)` (diagonals count as 1)
**Example:** `('A1', 'D4') → 3` (can reach in 3 diagonal moves)

#### `calculateEuclideanDistance(from, to)`
**Purpose:** Straight-line distance for visibility
**Formula:** `√(dx² + dy²)`
**Example:** `('A1', 'D4') → 4.24`

#### `getAdjacentCoords(coord)`
**Purpose:** Get all 8 surrounding tiles
**Returns:** Array of coordinate strings
**Example:** `'F11' → ['E10', 'E11', 'E12', 'F10', 'F12', 'G10', 'G11', 'G12']`

#### `getCoordsInRange(center, range)`
**Purpose:** Get all coordinates within range (circle)
**Returns:** Array of coordinates
**Example:** `('F11', 3) → [all coords within 3-tile radius]`

#### `calculatePath(from, to, terrainMap)`
**Purpose:** Generate movement path (straight line, will upgrade to A*)
**Returns:** Array of coordinate strings
**Example:** `('A1', 'D4') → ['A1', 'B2', 'C3', 'D4']`

#### `calculatePathCost(path, terrainCosts, getTerrainType)`
**Purpose:** Sum movement cost for entire path
**Example:**
```javascript
path: ['A5', 'A6', 'B6', 'C6']
terrain: ['plains', 'plains', 'ford', 'plains']
costs: [0, 1.0, 1.0, 1.5, 1.0]
total: 4.5 movement
```

#### `isValidCoord(coord)`
**Purpose:** Validate coordinate format and bounds
**Returns:** Boolean

#### `generateASCIIMap(mapData)`
**Purpose:** Create text-based map for debugging
**Returns:** String (ASCII art)
**Example:**
```
    A B C D E F G H I J K L M N O
   ───────────────────────────────
 1 │. . . . . ~ ~ ~ . . . . . . .│ 1
 2 │. . . . . ~ ~ ~ . . . . . . .│ 2
...
11 │. . . . . = = = . . . . . 1 .│ 11
...
Legend: . plains, ~ river, = ford, ^ hill, 1 P1, 2 P2
```

#### `getDirection(from, to)`
**Purpose:** Get cardinal/intercardinal direction
**Returns:** String
**Example:** `('A1', 'C3') → 'southeast'`

---

## Pathfinding Functions

### A* Pathfinding
**Location:** `src/game/maps/mapUtils.js` (imported from riverCrossing.js)

#### `findPathAStar(start, goal, map, getTerrainType)`
**Purpose:** Find optimal path considering terrain costs

**Algorithm:**
```javascript
1. Initialize:
   - openSet = [start]
   - gScore[start] = 0
   - fScore[start] = heuristic(start, goal)

2. While openSet not empty:
   a. Get node with lowest fScore
   b. If node === goal: reconstruct path
   c. For each neighbor:
      - Skip if river (impassable)
      - Calculate movementCost via terrain
      - If better path found:
        * Update gScore, fScore
        * Add to openSet

3. Return path or {valid: false}
```

**Heuristic:** Manhattan distance (grid movement)

**Returns:**
```javascript
{
  valid: true,
  path: ['A5', 'A6', 'B6', 'C6', 'D6'],
  cost: 4.5,
  reason: null
}

// OR

{
  valid: false,
  path: null,
  cost: null,
  reason: 'River blocks path, no ford accessible'
}
```

---

## Discord Bot Functions

### Command Execution Pattern

**Standard Command Structure:**
```javascript
module.exports = {
  data: new SlashCommandBuilder()
    .setName('command-name')
    .setDescription('Description')
    .addOptions(...),
  
  async execute(interaction) {
    try {
      // 1. Validate user input
      // 2. Load data from database
      // 3. Process command logic
      // 4. Update database if needed
      // 5. Reply to user
      
      await interaction.reply({ content: 'Success!' });
      
    } catch (error) {
      console.error('Command error:', error);
      
      // Safe error reply
      const errorReply = {
        content: '❌ Error processing command',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply);
      } else {
        await interaction.reply(errorReply);
      }
    }
  }
};
```

### Helper Functions

#### `createEmbedBuilder(title, description, fields)`
**Purpose:** Standardized embed creation
**Returns:** EmbedBuilder instance

#### `createProgressBar(used, total)`
**Purpose:** Visual progress bar for army builder
**Returns:** String `[████████░░] 16/20`

#### `formatTroopsList(troops)`
**Purpose:** Format troop array for display
**Returns:** String with newline-separated troops

#### `getWeatherColor(weather)`
**Purpose:** Get embed color for weather type
**Returns:** Hex color
```javascript
{
  clear: 0x87CEEB,      // Sky blue
  rain: 0x4682B4,       // Steel blue  
  fog: 0x708090,        // Slate gray
  storm: 0x2F4F4F,      // Dark slate
  heat: 0xFF4500        // Orange red
}
```

---

## Utility Helper Functions

### String Formatting

#### `capitalize(str)`
```javascript
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

#### `formatNumber(num)`
```javascript
function formatNumber(num) {
  return num.toLocaleString();  // 1234 → "1,234"
}
```

#### `truncate(str, maxLength)`
```javascript
function truncate(str, maxLength = 100) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
```

### Time Utilities

#### `sleep(ms)`
```javascript
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

#### `formatTimeRemaining(timestamp)`
```javascript
function formatTimeRemaining(deadline) {
  const now = Date.now();
  const remaining = deadline - now;
  
  if (remaining < 0) return 'Expired';
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m remaining`;
}
```

---

## Complete Function Call Chain Example

### From Player Order to Narrative

```
Player DM: "Advance to ford"
    ↓
dmHandler.handleDM(message)
    ↓
  - Finds active battle
  - Stores order in battleState.pendingOrders.player1
  - Checks if both players ready
    ↓
processBattleTurn(battle)
    ↓
turnOrchestrator.processTurn(battle, p1Order, p2Order, map)
    ↓
PHASE 1: orderInterpreter.interpretOrders(p1Order, battleState, 'player1', map)
    ↓
  - buildOrderInterpretationPrompt()
  - callAIForOrderParsing(prompt)
  - validateMovement(unit, target, map)
    ↓
  - findPathAStar(start, goal, map, getTerrainType)
  - calculatePathCost(path, map)
    ↓
PHASE 2: positionBasedCombat.processMovementPhase(p1Actions, p2Actions, state, map)
    ↓
  - Execute movements (update positions)
  - detectCombatTriggers(newP1Positions, newP2Positions)
    ↓
  - calculatePositionalModifiers(attacker, defender, allUnits, map)
    ↓
    - calculateFlankingBonus()
    - calculateElevationAdvantage()
    - isCrossingRiver()
    ↓
PHASE 3: fogOfWar.calculateVisibility(myUnits, enemyUnits, terrain, weather)
    ↓
  - For each unit: calculate vision range
  - Check each enemy: within range?
  - hasLineOfSight(from, to, terrain)
  - Categorize intel quality
    ↓
PHASE 4: battleEngine.resolveCombat(attacker, defender, conditions, context)
    ↓
  - calculateUnitEffectiveness()
  - calculateFormationInteractions()
  - calculateEnvironmentalEffects()
  - calculateWeaponEffectiveness()
  - applyCulturalModifiers()
  - calculateCombatOutcome()
  - calculateCasualties()
    ↓
PHASE 5: turnOrchestrator.applyCasualties(positions, combatResults)
    ↓
  - Subtract casualties from units
  - Remove destroyed units
    ↓
PHASE 6: turnOrchestrator.checkVictoryConditions(positions, turn, objectives)
    ↓
PHASE 7: aiNarrativeEngine.generateBattleNarrative(result, context, memories)
    ↓
  - findHistoricalParallel()
  - generateOfficerReports()
    ↓
    - generateOfficerPerspective()
    ↓
  - aiManager.generateBattleNarrative()
    ↓
    - selectBestProvider()
    - generateWithOpenAI() / generateWithAnthropic() / generateWithGroq()
    ↓
  - generateTacticalAnalysis()
  - generateNextTurnSetup()
    ↓
SAVE: Battle.battleState = newState, currentTurn++
    ↓
SEND: DM both players with narrative + new briefings
```

---

This function reference provides complete documentation of every major function's purpose, parameters, returns, and usage patterns throughout the entire Cohort system.
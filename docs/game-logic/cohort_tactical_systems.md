# Cohort Tactical Systems Documentation

## Overview
Deep dive into fog of war intelligence, AI order interpretation, position-based combat modifiers, and scout mechanics. These systems create realistic ancient warfare where information is limited and positioning determines combat outcomes.

---

## Fog of War System (Complete)
**Location:** `src/game/fogOfWar.js`

### Core Concept
Players see only what their units can see, creating **realistic intelligence limitations** based on unit type, terrain, and weather. Ancient battles were fought with partial information - generals didn't have omniscient overhead views.

### Vision Range System

**Base Vision Ranges (tiles):**
```javascript
const LINE_OF_SIGHT = {
  standard: 3,        // 150m - infantry/cavalry normal vision
  scouts: 5,          // 250m - trained observers with extended range
  elevated: +2,       // +100m from hills/towers (total 5 tiles standard)
  
  // Weather Penalties
  lightRain: -1,      // -50m (wet conditions reduce clarity)
  heavyRain: -3,      // -150m (Teutoburg Forest conditions)
  fog: -2,            // -100m (Battle of Lake Trasimene)
  dust: -1,           // -50m (large army movement kicks up dust)
  
  // Terrain Modifiers  
  denseForest: -2,    // -100m (tree canopy blocks sight)
  lightForest: -1     // -50m (partial obstruction)
}
```

**Historical Examples:**
- **Teutoburg Forest (9 AD):** Heavy rain reduced Roman vision to 1-2 tiles, enabling Germanic ambushes
- **Lake Trasimene (217 BC):** Dense fog allowed Hannibal to hide 50,000 troops until Romans entered kill zone
- **Battle of Cannae (216 BC):** Dust from 125,000+ troops reduced visibility, concealing Hannibal's formations

### Main Function: `calculateVisibility()`

#### **Purpose**
Determine what each player can see based on unit positions, terrain, and weather

#### **Process Flow**
```javascript
function calculateVisibility(playerUnits, enemyUnits, terrain, weather = 'clear') {
  const visibleEnemies = [];
  const detectedPositions = new Set();
  const intelligence = {
    confirmed: [],    // Close range, detailed intel
    estimated: [],    // Medium range, approximate intel
    suspected: []     // Max range, vague intel
  };
  
  // For each of your units
  playerUnits.forEach(myUnit => {
    // Calculate vision range
    let visionRange = LINE_OF_SIGHT.standard;  // Default 3 tiles
    
    // Unit type bonus
    if (myUnit.type === 'scouts') {
      visionRange = LINE_OF_SIGHT.scouts;  // 5 tiles
    }
    
    // Terrain bonus/penalty
    const myTerrain = getTerrainType(myUnit.position, terrain);
    if (myTerrain === 'hill') {
      visionRange += LINE_OF_SIGHT.elevated;  // +2 tiles from high ground
    }
    if (myTerrain === 'forest') {
      visionRange += LINE_OF_SIGHT.denseForest;  // -2 tiles in trees
    }
    
    // Weather penalty
    if (weather === 'fog') {
      visionRange += LINE_OF_SIGHT.fog;  // -2 tiles (adding negative)
    }
    if (weather === 'heavy_rain') {
      visionRange += LINE_OF_SIGHT.heavyRain;  // -3 tiles
    }
    
    // Check each enemy unit
    enemyUnits.forEach(enemy => {
      const distance = euclideanDistance(myUnit.position, enemy.position);
      
      // Within vision range?
      if (distance <= visionRange) {
        // Check line of sight (terrain doesn't block)
        if (hasLineOfSight(myUnit.position, enemy.position, terrain)) {
          detectedPositions.add(enemy.position);
          
          // Intelligence quality based on distance
          if (distance <= visionRange * 0.5) {
            // CLOSE RANGE: Confirmed detailed intelligence
            intelligence.confirmed.push({
              position: enemy.position,
              unitType: enemy.unitType,
              estimatedStrength: enemy.currentStrength,  // Exact count visible
              equipment: enemy.equipment,  // Can see equipment
              formation: enemy.formation,  // Can see formation
              confidence: 'high',
              detectedBy: myUnit.unitId,
              distance: Math.round(distance)
            });
          }
          else if (distance <= visionRange * 0.8) {
            // MEDIUM RANGE: Estimated intelligence
            intelligence.estimated.push({
              position: enemy.position,
              unitType: enemy.unitType,  // Can identify type
              estimatedStrength: Math.round(enemy.currentStrength / 20) * 20,  // Rounded
              equipment: 'unknown',
              formation: 'unknown',
              confidence: 'medium',
              detectedBy: myUnit.unitId,
              distance: Math.round(distance)
            });
          }
          else {
            // MAX RANGE: Suspected activity only
            intelligence.suspected.push({
              position: enemy.position,
              unitType: 'unknown',
              estimatedStrength: 'unknown',
              confidence: 'low',
              description: 'Movement detected',
              detectedBy: myUnit.unitId,
              distance: Math.round(distance)
            });
          }
        }
      }
      // Beyond vision but close (approximate detection)
      else if (distance <= visionRange + 2) {
        // Vague detection from noise, dust, etc.
        intelligence.suspected.push({
          approximatePosition: getGeneralArea(enemy.position),
          confidence: 'uncertain',
          description: 'Unknown force detected (movement, dust, or noise)'
        });
      }
    });
  });
  
  return {
    visibleEnemyPositions: Array.from(detectedPositions),
    intelligence,
    totalEnemiesDetected: detectedPositions.size
  };
}
```

### Intelligence Quality Levels

#### **Confirmed Intelligence (Close Range)**
**Conditions:** Distance ≤ 50% of vision range + clear line of sight
**Information Provided:**
```javascript
{
  position: 'M5',                    // Exact coordinate
  unitType: 'infantry',              // Unit type known
  estimatedStrength: 87,             // Exact count visible
  equipment: 'sarissa_phalanx',      // Equipment identified
  formation: 'phalanx',              // Formation observed
  confidence: 'high',
  detectedBy: 'player1_scouts',      // Which unit spotted them
  distance: 2                        // 2 tiles = 100m away
}
```

**Player sees:** "**Enemy Infantry** at M5\n├─ Strength: 87 warriors\n├─ Equipment: Sarissa pikes\n├─ Formation: Phalanx\n└─ Distance: 100m"

#### **Estimated Intelligence (Medium Range)**
**Conditions:** Distance 50-80% of vision range + line of sight
**Information Provided:**
```javascript
{
  position: 'K8',
  unitType: 'cavalry',               // Type identifiable
  estimatedStrength: 60,             // Rounded to nearest 20
  equipment: 'unknown',              // Too far to see details
  formation: 'unknown',
  confidence: 'medium',
  distance: 4                        // 4 tiles = 200m
}
```

**Player sees:** "**Enemy Cavalry** at K8\n├─ Estimated: ~60 warriors\n├─ Details: Unknown\n└─ Distance: 200m"

#### **Suspected Activity (Max Range)**
**Conditions:** Distance 80-100% of vision range OR limited line of sight
**Information Provided:**
```javascript
{
  position: 'N12',
  unitType: 'unknown',
  estimatedStrength: 'unknown',
  confidence: 'low',
  description: 'Movement detected',
  distance: 5                        // At max scout range
}
```

**Player sees:** "⚠️ **Unknown Force** - N12\n└─ Movement detected (details unclear)"

#### **Approximate Detection (Beyond Vision)**
**Conditions:** Distance vision+1 to vision+2 tiles
**Information Provided:**
```javascript
{
  approximatePosition: 'Eastern woods (L-N, 15-18)',
  confidence: 'uncertain',
  description: 'Unknown force detected (movement, dust, or noise)'
}
```

**Player sees:** "🔍 **Unconfirmed Report**\nActivity in eastern woods - scouts recommend investigation"

#### **No Intelligence (Beyond Detection)**
**Conditions:** Distance > vision+2 tiles
**Information:** Complete ignorance of enemy unit existence

**Historical Parallel:** Most ancient battles fought with commanders having no idea where all enemy forces were positioned. Scouts were critical for intelligence gathering.

### Line of Sight Blocking

#### **`hasLineOfSight(from, to, terrain)`**
**Purpose:** Check if terrain blocks visibility between two points

**Algorithm:** Bresenham line algorithm
```javascript
function hasLineOfSight(from, to, terrain) {
  // Get all tiles in straight line between points
  const line = bresenhamLine(from, to);
  
  // Check each intervening tile
  for (const coord of line) {
    const terrainType = getTerrainType(coord, terrain);
    
    // Dense forest always blocks
    if (terrainType === 'forest') {
      return false;
    }
    
    // Hills block unless both points elevated
    if (terrainType === 'hill') {
      const observerElevated = isElevated(from, terrain);
      const targetElevated = isElevated(to, terrain);
      
      // Can see over hills if both elevated
      if (!observerElevated || !targetElevated) {
        return false;  // Hill blocks view
      }
    }
  }
  
  return true;  // Clear line of sight
}
```

**Examples:**
```
Observer on plains (A5) → Target in forest (D8) → BLOCKED (forest in line)
Observer on hill (B5) → Target on hill (M5) → VISIBLE (both elevated)
Observer on plains (A5) → Target behind hill (E6) → BLOCKED (hill intervening)
Scout on plains (A5) → Enemy at range 4 → VISIBLE if clear terrain
```

### Scout Missions

#### **`processScoutMission(scoutUnit, targetArea, battleState)`**
**Purpose:** Execute dedicated scouting orders for intelligence gathering

**Process:**
```javascript
// 1. Scout moves to target area
const scoutPosition = targetArea;

// 2. Calculate what scout detects (5-tile range)
const detected = enemyUnits.filter(enemy => {
  const distance = euclideanDistance(scoutPosition, enemy.position);
  return distance <= 5;  // Scouts have extended range
});

// 3. Check scout survival (can be intercepted)
const survived = checkScoutSurvival(scoutPosition, enemyUnits);

return {
  scoutPosition: scoutPosition,
  detectedEnemies: detected.map(e => ({
    position: e.position,
    unitType: e.unitType,
    strength: e.currentStrength,  // Detailed intel
    confidence: 'high'
  })),
  reportAvailable: true,
  scoutSurvived: survived
};
```

**Scout Survival Logic:**
```javascript
function checkScoutSurvival(scoutPos, enemyUnits) {
  // Enemy within 1 tile = interception possible
  const nearby = enemyUnits.filter(e => 
    calculateEuclideanDistance(scoutPos, e.position) <= 1
  );
  
  if (nearby.length > 0) {
    return Math.random() > 0.5;  // 50% escape chance
  }
  
  return true;  // Safe if no enemies nearby
}
```

**Narrative Integration:**
```
Scout survived:
"Your scouts slip through enemy positions, returning with critical intelligence..."

Scout killed:
"The scout patrol encounters enemy cavalry. Only one rider returns, 
bearing news but no detailed report..."
```

### Intelligence Report Generation

#### **`generateIntelligenceReport(visibility, culture)`**
**Purpose:** Format visibility data into cultural officer report

**Roman Report Example:**
```
📍 **Confirmed Contact at M5**
Centurion Lucius reports: "Enemy sarissa phalanx, approximately 90 spears. 
They're in standard formation. The silver shields mark them as Macedonian elites."

Type: Infantry (Phalanx)
Strength: ~87 warriors
Equipment: Sarissa pikes
Confidence: HIGH

👁️ **Enemy Spotted at K8**
Optio Marcus: "Cavalry in the eastern sector. Can't make out details from here, 
but looks like 50-60 mounted warriors."

Estimated: ~60 cavalry
Confidence: MEDIUM
```

**Celtic Report Example:**
```
📍 **Confirmed Contact at M5**
Brennus laughs: "Aye, see those long spears? Macedonian pike-bearers. 
About a hundred of 'em. They're scared - look how tight they stand!"

⚠️ **Possible Activity**
The Bard warns: "Dust rises in the eastern hills. Something moves there, 
but the spirits don't reveal more. Send the young ones to see."
```

**Cultural Voice Consistency:** Uses same personality system as combat narratives

---

## Order Interpretation System
**Location:** `src/ai/orderInterpreter.js`

### Purpose
Parse natural language orders into validated game actions using AI, handle ambiguity, and provide cultural officer feedback.

### Main Function: `interpretOrders()`

#### **Purpose**
Convert player's natural language order into structured game actions

#### **Parameters**
```javascript
interpretOrders(
  orderText,      // "Advance to the ford and hold position"
  battleState,    // Current game state
  playerSide,     // 'player1' or 'player2'
  map             // Map data for validation
)
```

#### **Process Flow**

**Step 1: Build Context for AI**
```javascript
const context = {
  currentTurn: battleState.currentTurn,
  yourUnits: playerUnits.map(u => ({
    id: u.unitId,
    type: u.unitType,
    position: u.position,
    strength: u.currentStrength,
    movementRemaining: u.movementRemaining || (u.mounted ? 5 : 3),
    equipment: u.equipment
  })),
  mapTerrain: {
    size: '20x20 grid',
    features: map.terrain,
    fords: map.terrain.fords,
    hills: map.terrain.hills
  },
  movementCosts: {
    plains: 1.0,
    road: 0.5,
    hill: 1.5,
    forest: 2.0,
    marsh: 3.0,
    ford: 1.5
  },
  culture: battleState[playerSide].culture
};
```

**Step 2: Generate AI Prompt**
```javascript
const prompt = `You are a tactical AI for an ancient warfare game. Parse the player's order into game actions.

**PLAYER ORDER:** "${orderText}"

**CURRENT SITUATION:**
- Turn: ${context.currentTurn}
- Culture: ${context.culture}
- Your Units: ${JSON.stringify(context.yourUnits, null, 2)}

**MAP INFORMATION:**
- Size: 20x20 grid (A1 to T20)
- River runs through columns F-H (vertical)
- Fords at F11, G11, H11 (crossable)
- Hills at B3-C5, M3-N5
- Roads through column H (vertical)

**MOVEMENT RULES:**
Infantry: 3 tiles base, Cavalry: 5 tiles, Scouts: 6 tiles
Terrain costs: Plains 1.0, Road 0.5, Hill 1.5, Forest 2.0, Marsh 3.0

**YOUR TASK:**
Parse the order into specific actions. Return JSON:

{
  "actions": [
    {
      "type": "move",
      "unitId": "player1_unit_0",
      "currentPosition": "A5",
      "targetPosition": "F11",
      "reasoning": "Advancing to northern ford"
    }
  ],
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": ["Approaching ford may trigger combat"]
  },
  "officerComment": "Centurion Marcus: Understood, advancing to ford."
}

**CRITICAL RULES:**
- DO NOT invent coordinates not in the order
- Match cultural officer personality (Roman=formal, Celtic=bold)
- Keep officer comment 1-2 sentences max
- Return ONLY valid JSON`;
```

**Step 3: Call AI and Parse Response**
```javascript
const aiResponse = await callAIForOrderParsing(prompt);
// Returns parsed JSON with actions array
```

**Step 4: Validate Each Action**
```javascript
const validatedActions = [];
const errors = [];

for (const action of aiResponse.actions) {
  if (action.type === 'move') {
    // Find referenced unit
    const unit = playerUnits.find(u => u.unitId === action.unitId);
    
    if (!unit) {
      errors.push(`Unit ${action.unitId} not found`);
      continue;
    }
    
    // Validate movement using movement system
    const validation = validateMovement(unit, action.targetPosition, map);
    
    if (validation.valid) {
      validatedActions.push({
        ...action,
        validation,
        unitId: unit.unitId  // Ensure correct ID format
      });
    } else {
      errors.push({
        unit: unit.unitId,
        error: validation.error,
        reason: validation.reason
      });
    }
  }
  
  // Other action types validated separately
  if (action.type === 'formation') {
    validatedActions.push(action);  // Formation changes always valid
  }
  
  if (action.type === 'scout') {
    validatedActions.push(action);  // Scout validation in scout system
  }
}
```

**Step 5: Return Results**
```javascript
return {
  validatedActions,                  // Actions that passed validation
  errors,                             // Invalid actions with explanations
  officerComment: aiResponse.officerComment,
  rawAIResponse: aiResponse          // Full AI response for debugging
};
```

### Fallback Parser (When AI Unavailable)

**Simple Keyword Matching:**
```javascript
async function callAIForOrderParsing(prompt) {
  // Extract data from prompt
  const yourUnits = /* parse from prompt */;
  const orderText = /* extract order text */;
  
  if (yourUnits.length === 0) {
    return { actions: [], validation: { isValid: true } };
  }
  
  const unit = yourUnits[0];  // Default to first unit
  const lowerOrder = orderText.toLowerCase();
  
  // Check for explicit coordinates (highest priority)
  const coordMatch = orderText.match(/\b([A-O]\d{1,2})\b/i);
  if (coordMatch) {
    const targetPosition = coordMatch[1].toUpperCase();
    return {
      actions: [{
        type: 'move',
        unitId: unit.id,
        currentPosition: unit.position,
        targetPosition: targetPosition,
        reasoning: `Moving to explicit coordinate ${targetPosition}`
      }],
      validation: { isValid: true, errors: [], warnings: [] }
    };
  }
  
  // Parse named locations
  if (lowerOrder.includes('ford')) {
    return moveToLocation(unit, 'F11', 'ford');
  }
  if (lowerOrder.includes('hill')) {
    return moveToLocation(unit, 'B5', 'hill');
  }
  
  // Parse directions
  if (lowerOrder.includes('south')) {
    return moveDirection(unit, 'south', 3);
  }
  if (lowerOrder.includes('north')) {
    return moveDirection(unit, 'north', 3);
  }
  
  // Default: hold position
  return {
    actions: [{
      type: 'hold',
      unitId: unit.id,
      currentPosition: unit.position
    }],
    validation: { isValid: true }
  };
}
```

### Question Detection

#### **`isQuestion(text)`**
**Purpose:** Distinguish tactical questions from battle orders
**Detection Logic:**
```javascript
function isQuestion(text) {
  // Question mark = obvious question
  if (text.includes('?')) return true;
  
  // Question words at start
  const questionWords = [
    'where', 'what', 'when', 'who', 'how', 'why',
    'can', 'should', 'could', 'would'
  ];
  const firstWord = text.toLowerCase().split(' ')[0];
  if (questionWords.includes(firstWord)) return true;
  
  // Question sentence structure
  if (text.match(/^(do|does|is|are|will|have|has)\s/i)) return true;
  
  return false;  // It's an order
}
```

**Usage in DM Handler:**
```javascript
if (isQuestion(message.content)) {
  // Route to officer Q&A system
  await answerTacticalQuestion(message.content, ...);
} else {
  // Route to order interpreter
  await interpretOrders(message.content, ...);
}
```

---

## Position-Based Combat
**Location:** `src/game/positionBasedCombat.js`

### Purpose
Detect combat triggers from unit proximity, calculate tactical position modifiers (flanking, elevation, terrain), and process complete movement phase with combat detection.

### Combat Trigger Detection

#### **`detectCombatTriggers(player1Units, player2Units)`**
**Purpose:** Identify all combat engagements based on unit positions

**Combat Range Rules:**
```javascript
// Melee combat
if (distance === 1) {  // Adjacent tiles (50m)
  combats.push({
    location: p1Unit.position,
    attacker: p1Unit,
    defender: p2Unit,
    type: 'melee',
    distance: 1
  });
}

// Ranged combat (archers/crossbows)
if (distance >= 2 && distance <= 5) {  // 100-250m
  if (p1Unit.hasRanged || p2Unit.hasRanged) {
    combats.push({
      location: p2Unit.position,  // Combat at target
      attacker: p1Unit,
      defender: p2Unit,
      type: 'ranged',
      distance: distance
    });
  }
}
```

**Returns:** Array of combat engagement objects

### Tactical Position Modifiers

#### **`calculatePositionalModifiers(attacker, defender, allUnits, map)`**
**Purpose:** Calculate combat bonuses/penalties from positioning

**Flanking Bonus:**
```javascript
function calculateFlankingBonus(attacker, defender, allUnits) {
  const defenderPos = defender.position;
  const adjacent = getAdjacentCoords(defenderPos);  // 4 tiles around defender
  
  // Count friendly units attacking same target
  const friendlyAttackers = allUnits.filter(unit => 
    unit.side === attacker.side &&
    unit.unitId !== attacker.unitId &&
    adjacent.includes(unit.position)
  );
  
  if (friendlyAttackers.length === 0) return 0;      // Single attacker
  if (friendlyAttackers.length === 1) return +2;     // 2-sided attack
  if (friendlyAttackers.length >= 2) return +4;      // 3+ sides (surrounded)
  
  return 0;
}
```

**Historical Example:** Battle of Cannae - Hannibal surrounded Romans, attacking from front, sides, and rear simultaneously = massive flanking advantage

**Elevation Bonus:**
```javascript
function calculateElevationAdvantage(attackerPos, defenderPos, map) {
  const attackerElevation = isOnHill(attackerPos, map) ? 1 : 0;
  const defenderElevation = isOnHill(defenderPos, map) ? 1 : 0;
  
  if (defenderElevation > attackerElevation) {
    return { 
      defender: +2,    // +2 defense on high ground
      attacker: 0 
    };
  }
  if (attackerElevation > defenderElevation) {
    return { 
      attacker: +2,    // +2 attack charging downhill (gravity)
      defender: 0 
    };
  }
  
  return { attacker: 0, defender: 0 };  // Level ground
}
```

**Historical Example:** Every ancient battle emphasized seizing high ground for defensive advantage

**River Crossing Penalty:**
```javascript
function isCrossingRiver(attackerPos, defenderPos, map) {
  // Defender at ford?
  if (!isFord(defenderPos)) return false;
  
  // Attacker adjacent?
  const distance = calculateDistance(attackerPos, defenderPos);
  if (distance !== 1) return false;
  
  // Attacker not at ford = crossing attack
  if (!isFord(attackerPos)) {
    return {
      attacker: { attack: -4, vulnerable: true },
      defender: { defense: +3, secure: true },
      description: 'Attacking across water - formation disrupted, defender secure'
    };
  }
  
  return false;
}
```

**Historical Examples:**
- Battle of Granicus (334 BC): Alexander's cavalry attacked uphill across river = massive disadvantage
- Battle of Hydaspes (326 BC): Porus positioned elephants at crossing, forcing Alexander to find alternate ford

**Complete Modifier Example:**
```javascript
const modifiers = {
  attacker: {
    attack: +2,    // From flanking (2 units attacking)
    defense: 0
  },
  defender: {
    attack: 0,
    defense: +4    // +2 high ground, +2 forest cover
  },
  description: [
    'Flanking attack: +2 attack',
    'Defender on hill in forest: +4 defense total',
    'Significant defensive advantage'
  ]
};
```

### Movement Phase Processing

#### **`processMovementPhase(p1Moves, p2Moves, battleState, map)`**
**Purpose:** Execute all movements and identify resulting combat engagements

**Complete Process:**
```javascript
// 1. Execute Player 1 movements
const newPlayer1Positions = battleState.player1.unitPositions.map(unit => {
  // Find movement order for this unit
  const movement = p1Moves.find(m => m.unitId === unit.unitId);
  
  if (movement && movement.validation.valid) {
    // Update unit position
    return {
      ...unit,
      position: movement.targetPosition,
      movementRemaining: movement.validation.movementRemaining,
      hasMoved: true,
      movementPath: movement.validation.path  // For narrative
    };
  }
  
  // No movement order = stay in place
  return unit;
});

// 2. Execute Player 2 movements (same logic)
const newPlayer2Positions = /* same process */;

// 3. Detect combat triggers with NEW positions
const combatTriggers = detectCombatTriggers(
  newPlayer1Positions, 
  newPlayer2Positions
);

// 4. Build enhanced combat contexts
const combatContexts = combatTriggers.map(combat => 
  buildCombatContext(combat, updatedBattleState, map)
);

return {
  newPositions: {
    player1: newPlayer1Positions,
    player2: newPlayer2Positions
  },
  combatEngagements: combatContexts,  // Ready for battle engine
  movementSummary: {
    player1Moves: p1Moves.filter(m => m.validation.valid).length,
    player2Moves: p2Moves.filter(m => m.validation.valid).length
  }
};
```

#### **`buildCombatContext(combat, battleState, map)`**
**Purpose:** Enhance combat trigger with full tactical context

**Input:** Basic combat trigger
```javascript
{
  location: 'M5',
  attacker: player1Unit,
  defender: player2Unit,
  type: 'melee',
  distance: 1
}
```

**Output:** Complete combat context
```javascript
{
  attacker: {
    unit: player1Unit,  // Full unit data
    positionModifiers: {
      attack: +2,      // Flanking
      defense: 0
    },
    position: 'M5'
  },
  defender: {
    unit: player2Unit,
    positionModifiers: {
      attack: 0,
      defense: +4      // High ground + forest
    },
    position: 'M5'
  },
  location: 'M5',
  terrain: 'forest',
  combatType: 'melee',
  tacticalSituation: [
    'Attacker benefits from flanking (+2)',
    'Defender holds high ground in forest (+4)',
    'Significant defensive advantage'
  ]
}
```

**This context feeds directly into `resolveCombat()` in battleEngine.js**

---

## Order Parsing Examples

### Simple Movement
**Order:** "Move north"
**Parsed:**
```javascript
{
  actions: [{
    type: 'move',
    unitId: 'player1_infantry_0',
    currentPosition: 'A5',
    targetPosition: 'A2',  // 3 tiles north
    reasoning: 'Moving north as ordered'
  }],
  officerComment: 'Centurion Marcus: Advancing north, sir.'
}
```

### Multi-Unit Coordination
**Order:** "Northern Company to ford, Archers cover from hill"
**Parsed:**
```javascript
{
  actions: [
    {
      type: 'move',
      unitId: 'northern_company',
      targetPosition: 'F11',
      reasoning: 'Northern Company advancing to ford'
    },
    {
      type: 'move',
      unitId: 'hillcrest_archers',
      targetPosition: 'B5',
      reasoning: 'Archers positioning on hill for covering fire'
    },
    {
      type: 'support_fire',
      supportingUnit: 'hillcrest_archers',
      protectedUnit: 'northern_company',
      reasoning: 'Archers providing cover'
    }
  ],
  officerComment: 'Centurion Marcus: Infantry advancing. Captain Swift: Archers taking position on the hill.'
}
```

### Complex Tactical Order
**Order:** "Cavalry feigned retreat to draw them out, then infantry charge their flank"
**Parsed:**
```javascript
{
  actions: [
    {
      type: 'tactical_maneuver',
      maneuverType: 'feigned_retreat',
      unitId: 'cavalry_wing',
      fallbackPosition: 'D8',
      reasoning: 'Cavalry executing feigned retreat'
    },
    {
      type: 'conditional_move',
      unitId: 'main_infantry',
      trigger: 'enemy_pursues_cavalry',
      targetPosition: 'M6',  // Enemy flank
      reasoning: 'Infantry prepared to flank when enemy commits'
    }
  ],
  validation: {
    warnings: [
      'Feigned retreat requires high morale to execute properly',
      'Conditional orders may not trigger if enemy doesn't pursue'
    ]
  },
  officerComment: 'Khan: A Parthian tactic - bold! The riders understand. Marcus: Infantry stands ready.'
}
```

### Ambiguous Order Handling

**Order:** "Attack!"
**AI Response:**
```javascript
{
  actions: [],
  validation: {
    isValid: false,
    errors: ['Order too vague - which unit should attack which enemy?']
  },
  clarificationNeeded: {
    question: 'Commander, which unit should attack? We have:',
    options: [
      'Northern Company at A5',
      'Cavalry at C7',
      'Archers at B3'
    ],
    suggestedTargets: [
      'Enemy infantry detected at M5',
      'Enemy cavalry at K8'
    ]
  },
  officerComment: 'Centurion Marcus: Sir, please clarify which unit attacks which enemy.'
}
```

**Player then clarifies:** "Northern Company attack the infantry at M5"

---

## Cultural Officer Comments

### Comment Generation by Culture

#### **Roman (Professional/Systematic):**
```javascript
function generateRomanComment(action) {
  if (action.type === 'move') {
    return 'Centurion Marcus: Orders received and understood, sir. Formation advancing.';
  }
  if (action.type === 'attack') {
    return 'Optio Gaius: Preparing assault. The men are ready.';
  }
  if (action.risky) {
    return 'Centurion Marcus: Bold strategy, sir. Risky, but sound if executed properly.';
  }
  return 'Orders acknowledged.';
}
```

#### **Celtic (Bold/Poetic):**
```javascript
function generateCelticComment(action) {
  if (action.type === 'charge') {
    return 'Brennus roars: Aye! The lads are eager for blood! For the tribe!';
  }
  if (action.type === 'move') {
    return 'The Champion grins: Swift as the hunt, fierce as wolves!';
  }
  if (action.defensive) {
    return 'Brennus frowns: Stand still? The spirits favor the bold, not the timid...';
  }
  return 'By the gods, we obey!';
}
```

#### **Spartan (Laconic/Brief):**
```javascript
function generateSpartanComment(action) {
  if (action.type === 'attack') return 'Lochagos: Forward.';
  if (action.type === 'defend') return 'It shall be done.';
  if (action.suicidal) return 'We go gladly.';
  return 'Understood.';
}
```

#### **Han Chinese (Scholarly/Philosophical):**
```javascript
function generateHanComment(action) {
  if (action.type === 'coordinated') {
    return 'General Wei bows: Your strategy shows wisdom. The crossbowmen coordinate as one.';
  }
  if (action.type === 'retreat') {
    return 'The wise general knows when to withdraw. The Mandate approves prudence.';
  }
  return 'As the Commander wills, so shall it be.';
}
```

---

## Integration Patterns

### Order Flow Through System

**Complete Order Processing Path:**
```
1. Player sends DM: "Advance to ford"
   ↓
2. dmHandler.js: Detects DM, routes to battle
   ↓
3. orderInterpreter.js: Calls AI to parse order
   ↓
4. AI returns: { actions: [{ type: 'move', target: 'F11' }] }
   ↓
5. orderInterpreter.js: Validates via movementSystem
   ↓
6. movementSystem.js: Checks path, terrain, movement cost
   ↓
7. Returns: { valid: true, path: [...], cost: 2.5 }
   ↓
8. orderInterpreter.js: Packages validated action
   ↓
9. Stored in battle.battleState.pendingOrders.player1
   ↓
10. When both players submit:
    ↓
11. turnOrchestrator.js: Processes complete turn
    ↓
12. positionBasedCombat.js: Executes movements
    ↓
13. detectCombatTriggers(): Finds unit proximity
    ↓
14. calculatePositionalModifiers(): Adds terrain bonuses
    ↓
15. battleEngine.js: Resolves combat mathematically
    ↓
16. aiNarrativeEngine.js: Converts math to story
    ↓
17. Results sent to both players via DM
```

### Data Flow Diagram

```
Player DM
    ↓
┌─────────────────┐
│ Order Parser    │ → AI interprets natural language
│ (AI-powered)    │ → Validates against game rules
└─────────────────┘
    ↓
┌─────────────────┐
│ Movement System │ → A* pathfinding
│ (Deterministic) │ → Terrain cost calculation
└─────────────────┘
    ↓
┌─────────────────┐
│ Combat Detector │ → Unit proximity check
│ (Geometric)     │ → Position modifier calculation
└─────────────────┘
    ↓
┌─────────────────┐
│ Battle Engine   │ → Mathematical combat resolution
│ (Mathematical)  │ → Formation/weapon/environment modifiers
└─────────────────┘
    ↓
┌─────────────────┐
│ Narrative AI    │ → Convert math to story
│ (AI-powered)    │ → Cultural officer dialogue
└─────────────────┘
    ↓
Player receives narrative
```

---

## Error Handling & User Feedback

### Validation Error Messages

**Movement Too Far:**
```
❌ **Order Failed**

Target too far: requires 4.5 movement, your infantry has 3.

**Suggestion:** Move to H10 this turn (uses 3.0 movement), 
then continue to K14 next turn (remaining 1.5 movement).
```

**Path Blocked:**
```
❌ **Order Failed**

No valid path to target - river blocks direct route.

**Suggestion:** Use ford at F11 to cross river, then continue east.

**Alternatively:** Order scouts to find alternate crossing point.
```

**Cultural Restriction:**
```
❌ **Order Rejected**

Celtic warriors refuse: "Stand and watch? The spirits favor the bold! 
We fight or we die, but we don't cower in fortresses like Romans!"

**Reason:** Celtic cultural restrictions prevent pure defensive tactics.

**Suggestion:** Order aggressive action or accept morale penalty.
```

### AI Fallback Levels

**Level 1 - Full AI:**
- Natural language parsing
- Multi-unit coordination
- Conditional orders
- Cultural dialogue

**Level 2 - Simple AI:**
- Keyword matching
- Single unit orders
- Explicit coordinates only
- Generic officer comments

**Level 3 - No AI:**
- Require explicit format: `/move unit1 F11`
- No natural language
- Manual coordination
- System messages only

**Graceful Degradation:** System falls back through levels if AI fails, maintaining gameplay

---

## Design Philosophy

### Player Intent Recognition
- AI interprets what player **means**, not just literal words
- "Advance to ford" might reference northern, central, or southern ford - AI chooses based on context
- Ambiguity triggers clarification questions rather than guessing

### Tactical Realism
- Flanking matters (surrounds enemies like Cannae)
- High ground provides significant advantage (Thermopylae model)
- River crossings are extremely dangerous (Granicus disaster potential)
- Forest negates cavalry and formation advantages (Teutoburg lesson)

### Information Warfare
- Scouts provide extended vision (historical role)
- Fog of war creates scouting value
- Intelligence quality degrades with distance
- Ancient generals fought partially blind - so do players

### Cultural Authenticity
- Roman officers speak formally and professionally
- Celtic warriors use poetic, bold language
- Spartan responses are terse and absolute
- Each culture's voice remains consistent across game
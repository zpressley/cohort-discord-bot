# Cohort Complete Workflows & Developer Reference


> ⚠️ **Past build notes, this project has moved in new direction, use for reference only not concrete action plan**
>
> Current direction: [`docs/PHASE2_COMBAT_PLAN.md`](../PHASE2_COMBAT_PLAN.md)

## Overview
End-to-end workflows for all major operations, debugging guides, common patterns, and quick reference for developers working on the Cohort ancient warfare bot.

---

## Complete Battle Lifecycle Workflow

### Stage 1: Battle Creation & Lobby
```
USER ACTION: /create-game river
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (create-game.js)                  │
├─────────────────────────────────────────────────┤
│ 1. Extract scenario choice from interaction     │
│ 2. Validate scenario exists                     │
│ 3. Get user's Discord ID and username           │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DATABASE LAYER                                   │
├─────────────────────────────────────────────────┤
│ Battle.create({                                 │
│   player1Id: interaction.user.id,               │
│   player2Id: null,                              │
│   scenario: 'River Crossing',                   │
│   status: 'waiting_for_players',                │
│   channelId: interaction.channelId              │
│ })                                              │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (Lobby Display)                   │
├─────────────────────────────────────────────────┤
│ 1. Create lobby embed:                          │
│    ⚔️ Battle Created: River Crossing           │
│    Commander: PlayerName                        │
│    Status: ⏳ Waiting for opponent              │
│                                                  │
│ 2. Add join button:                             │
│    [⚔️ Join Battle] (customId: join_battle_ID) │
│                                                  │
│ 3. Post to channel, store messageId             │
└─────────────────────────────────────────────────┘
    ↓
[WAITING STATE: Battle.status = 'waiting_for_players']
```

### Stage 2: Player 2 Joins
```
USER ACTION: Clicks ⚔️ Join Battle button
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (interactionHandler.js)           │
├─────────────────────────────────────────────────┤
│ 1. Route button interaction                     │
│ 2. Extract battleId from customId               │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (join-battle.js)                  │
├─────────────────────────────────────────────────┤
│ 1. Load Battle from database                    │
│ 2. Validate:                                    │
│    - Battle not full? ✓                        │
│    - Not joining own battle? ✓                 │
│ 3. Add player2Id                                │
│ 4. Change status to 'army_building'             │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (Update & Notify)                 │
├─────────────────────────────────────────────────┤
│ 1. Update lobby embed:                          │
│    ⚔️ Battle Ready!                            │
│    Player 1: Name1                              │
│    Player 2: Name2                              │
│                                                  │
│ 2. DM both players:                             │
│    "Build your army (30 Supply Points)"         │
│    [Opens army builder interface]               │
└─────────────────────────────────────────────────┘
    ↓
[WAITING STATE: Battle.status = 'army_building']
```

### Stage 3: Army Building
```
PLAYER 1 DM: Opens army builder
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (build-army.js)                   │
├─────────────────────────────────────────────────┤
│ 1. Find player's battle in 'army_building'      │
│ 2. Load commander culture and elite unit        │
│ 3. Initialize builder state:                    │
│    - blocksUsed: 0                              │
│    - blocksTotal: 30                            │
│    - selectedTroops: []                         │
│    - eliteUnit: (automatically included)        │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (Army Builder UI)                 │
├─────────────────────────────────────────────────┤
│ Sends DM with:                                  │
│                                                  │
│ 🏗️ Army Builder - Roman Republic               │
│ [████████████░░░░░░░░] 24/30 blocks            │
│                                                  │
│ 👥 TROOPS: Select quality ↓                    │
│ ⚔️ EQUIPMENT: Add upgrades ↓                   │
│ 🛠️ SUPPORT: Engineers, medics ↓                │
│                                                  │
│ [🔧 Modify] [💾 Save] [⚔️ Finalize]           │
└─────────────────────────────────────────────────┘
    ↓
USER SELECTS: ⭐ Professional (10 blocks)
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (armyInteractionHandler.js)       │
├─────────────────────────────────────────────────┤
│ 1. Handle menu selection                        │
│ 2. Update builderState:                         │
│    - selectedTroops.push(professional)          │
│    - blocksUsed += 10                           │
│ 3. Update embed with new progress              │
│ 4. Send updated army builder                    │
└─────────────────────────────────────────────────┘
    ↓
[PLAYER CONTINUES BUILDING...]
    ↓
USER CLICKS: ⚔️ Finalize Army
    ↓
┌─────────────────────────────────────────────────┐
│ GAME LOGIC LAYER (Validation)                   │
├─────────────────────────────────────────────────┤
│ 1. Validate minimum blocks (20+)                │
│ 2. Check cultural restrictions                  │
│ 3. Validate equipment compatibility             │
│ 4. Build final army object                      │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DATABASE LAYER                                   │
├─────────────────────────────────────────────────┤
│ Battle.battleState.player1.army = finalArmy     │
│ Save to database                                │
│                                                  │
│ Check: Both players finished building?          │
└─────────────────────────────────────────────────┘
    ↓
IF BOTH READY:
    ↓
┌─────────────────────────────────────────────────┐
│ GAME LOGIC LAYER (Battle Initialization)        │
├─────────────────────────────────────────────────┤
│ 1. Generate weather:                            │
│    battle.generateWeather() → 'light_rain'      │
│                                                  │
│ 2. Load scenario map:                           │
│    const map = require('./maps/riverCrossing')  │
│                                                  │
│ 3. Deploy units to starting zones:              │
│    - Player 1: Western 5×3 zone (A1-E3)        │
│    - Player 2: Eastern 5×3 zone (P1-T3)        │
│                                                  │
│ 4. Convert army build to positioned units:      │
│    unitPositions = [                            │
│      {                                          │
│        unitId: 'player1_professional_0',        │
│        position: 'B2',                          │
│        currentStrength: 100,                    │
│        equipment: {...}                         │
│      },                                         │
│      {                                          │
│        unitId: 'player1_elite',                 │
│        position: 'C2',                          │
│        currentStrength: 80,                     │
│        veteranLevel: 'Veteran'                  │
│      }                                          │
│    ]                                            │
│                                                  │
│ 5. Update battle:                               │
│    status = 'in_progress'                       │
│    battleState.player1.unitPositions = [...]    │
│    currentTurn = 1                              │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (Initial Briefings)               │
├─────────────────────────────────────────────────┤
│ Send DM to Player 1:                            │
│                                                  │
│ ⚔️ War Council - River Crossing                │
│ *Turn 1 - Dawn breaks over the battlefield*     │
│                                                  │
│ 🗺️ BATTLEFIELD SITUATION:                      │
│ The ancient river crossing awaits...            │
│                                                  │
│ YOUR FORCES:                                    │
│ ⚔️ Northern Company (100 veterans)             │
│ Position: B2                                    │
│ Status: Ready                                   │
│                                                  │
│ 🏛️ Praetorian Guard (80 elite)                │
│ Position: C2                                    │
│ Veteran Level: Veteran (3.5 battles avg)        │
│                                                  │
│ 🌦️ CONDITIONS:                                 │
│ Weather: Light rain                             │
│ Visibility: Reduced                             │
│                                                  │
│ 🎯 MISSION:                                     │
│ Secure river crossing - control 2+ fords        │
│                                                  │
│ ⚡ Awaiting your orders, Commander...           │
│                                                  │
│ [💬 Ask Officer] [📊 View Status]              │
└─────────────────────────────────────────────────┘
    ↓
[ACTIVE BATTLE STATE: Awaiting Turn 1 orders]
```

### Stage 4: Turn Processing (Detailed)
```
BOTH PLAYERS SUBMIT ORDERS VIA DM
Player 1: "Advance to northern ford"
Player 2: "Hold defensive position at eastern ford"
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (dmHandler.js)                    │
├─────────────────────────────────────────────────┤
│ For each DM:                                    │
│ 1. Identify sender (player1 or player2)         │
│ 2. Store in battleState.pendingOrders           │
│ 3. Reply: "✅ Orders received!"                │
│ 4. Check if both submitted                      │
│                                                  │
│ When both ready:                                │
│ 5. Trigger processBattleTurn(battle)            │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ ORCHESTRATOR (turnOrchestrator.processTurn)     │
├─────────────────────────────────────────────────┤
│ Load: battle, p1Order, p2Order, map             │
│                                                  │
│ Reset movement for all units:                   │
│ - unit.movementRemaining = base movement        │
│ - unit.canMove = true                           │
│ - unit.hasMoved = false                         │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 1: Order Interpretation                   │
│ [AI LAYER - orderInterpreter.js]                │
├─────────────────────────────────────────────────┤
│ interpretOrders(p1Order, battleState, 'p1', map)│
│   ↓                                              │
│ buildOrderInterpretationPrompt()                │
│   - Include unit positions, terrain, culture    │
│   - Format as structured AI prompt              │
│   ↓                                              │
│ callAIForOrderParsing(prompt)                   │
│   - Currently: Fallback keyword parser          │
│   - Future: Real AI call via aiManager          │
│   ↓                                              │
│ AI returns:                                     │
│ {                                               │
│   actions: [{                                   │
│     type: 'move',                               │
│     unitId: 'player1_professional_0',           │
│     targetPosition: 'F11'                       │
│   }]                                            │
│ }                                               │
│   ↓                                              │
│ Validate each action:                           │
│   validateMovement(unit, 'F11', map)            │
│     ↓                                            │
│   findPathAStar('B2', 'F11', map)               │
│     - Returns: {path: [...], cost: 3.5}         │
│     - Check: cost ≤ movementRemaining?          │
│     - Result: VALID ✓                           │
│   ↓                                              │
│ Return:                                         │
│ {                                               │
│   validatedActions: [action with validation],  │
│   errors: [],                                   │
│   officerComment: "Centurion: Advancing, sir"  │
│ }                                               │
└─────────────────────────────────────────────────┘
    ↓
REPEAT FOR PLAYER 2
    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 2: Movement Execution                     │
│ [GAME LOGIC - positionBasedCombat.js]           │
├─────────────────────────────────────────────────┤
│ processMovementPhase(p1Actions, p2Actions)      │
│   ↓                                              │
│ For each player:                                │
│   For each unit:                                │
│     Find matching movement action               │
│     If found and valid:                         │
│       unit.position = targetPosition            │
│       unit.movementRemaining -= cost            │
│       unit.hasMoved = true                      │
│   ↓                                              │
│ Result: newPositions {player1: [...], player2}  │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 2B: Combat Detection                      │
│ [GAME LOGIC - positionBasedCombat.js]           │
├─────────────────────────────────────────────────┤
│ detectCombatTriggers(newP1Pos, newP2Pos)        │
│   ↓                                              │
│ For each P1 unit:                               │
│   For each P2 unit:                             │
│     distance = calculateDistance(p1, p2)        │
│     if (distance === 1):                        │
│       → MELEE COMBAT at p1.position             │
│     if (distance 2-5 && hasRanged):             │
│       → RANGED COMBAT at p2.position            │
│   ↓                                              │
│ Found: 1 melee engagement at F11                │
│   ↓                                              │
│ calculatePositionalModifiers(att, def, all, map)│
│   - Flanking check → +2 attacker                │
│   - Elevation check → +2 defender (on hill)     │
│   - River crossing → -4 attacker, +3 defender   │
│   ↓                                              │
│ Build combat context with all modifiers         │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 3: Visibility Update                      │
│ [GAME LOGIC - fogOfWar.js]                      │
├─────────────────────────────────────────────────┤
│ calculateVisibility(myUnits, enemyUnits, terrain, weather)│
│   ↓                                              │
│ For each player1 unit:                          │
│   visionRange = 3 (standard)                    │
│   if (unit.type === 'scouts'): visionRange = 5  │
│   if (weather === 'light_rain'): visionRange -= 1│
│   ↓                                              │
│ For each enemy unit:                            │
│   distance = euclideanDistance(my, enemy)       │
│   if (distance ≤ visionRange):                  │
│     if (hasLineOfSight(my, enemy, terrain)):    │
│       Add to visible enemies                    │
│       Categorize intel quality:                 │
│         0-50% range: Confirmed (detailed)       │
│         50-80% range: Estimated (approximate)   │
│         80-100% range: Suspected (vague)        │
│   ↓                                              │
│ Return:                                         │
│ {                                               │
│   visibleEnemyPositions: ['M5', 'K8'],          │
│   intelligence: {confirmed: [...], ...},        │
│   totalEnemiesDetected: 2                       │
│ }                                               │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 4: Combat Resolution                      │
│ [GAME LOGIC - battleEngine.js]                  │
├─────────────────────────────────────────────────┤
│ For each combat engagement:                     │
│   resolveCombat(attacker, defender, conditions) │
│     ↓                                            │
│   STEP 1: Base effectiveness                    │
│     attackerStats = calculateUnitEffectiveness()│
│       - Base: Professional = 8 attack           │
│       - Veteran bonus: +2                       │
│       - Size: 87/100 = 0.87 multiplier          │
│       - Result: (8+2)×0.87 = 8.7                │
│     ↓                                            │
│   STEP 2: Formation interactions                │
│     formationMods = FORMATION_INTERACTIONS      │
│       ['standard_vs_phalanx'] = {attack: -2}    │
│     ↓                                            │
│   STEP 3: Environmental effects                 │
│     envMods = ENVIRONMENTAL_EFFECTS             │
│       weather.light_rain = {movement: 0.9}      │
│       terrain.ford = {crossing: -4}             │
│     ↓                                            │
│   STEP 4: Weapon vs armor                       │
│     weaponEff = WEAPON_EFFECTIVENESS            │
│       ['war_spears_vs_bronze_armor'] = 0.70     │
│     ↓                                            │
│   STEP 5: Cultural modifiers                    │
│     culturalMods = CULTURAL_MODIFIERS           │
│       Roman.formation_discipline = 1.1          │
│     ↓                                            │
│   STEP 6: Final power calculation               │
│     attackerPower = 8.7 × 0.8 × 0.9 × 0.7 × 1.1│
│                   = 4.83                        │
│     defenderPower = 9.4 × 1.8 × 1.2 × 1.0 × 1.3│
│                   = 26.4                        │
│     ↓                                            │
│   combatRatio = 4.83 ÷ 26.4 = 0.18             │
│     ↓                                            │
│   Result: 'defender_major_victory' (ratio < 0.4)│
│   Intensity: 'decisive'                         │
│     ↓                                            │
│   STEP 7: Calculate casualties                  │
│     Rates: winner 5%, loser 25%                 │
│     Attacker (loser): 87 × 0.25 × random(0.8-1.2)│
│                     = ~22 casualties            │
│     Defender (winner): 94 × 0.05 × random       │
│                      = ~5 casualties            │
│     ↓                                            │
│   STEP 8: Morale effects                        │
│     Attacker: -20 morale                        │
│     Defender: +15 morale                        │
│     ↓                                            │
│   Return complete combat result                 │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 5: Apply Casualties                       │
│ [ORCHESTRATOR - turnOrchestrator.js]            │
├─────────────────────────────────────────────────┤
│ applyCasualties(newPositions, combatResults)    │
│   ↓                                              │
│ Find unit at combat location:                   │
│   player1_professional_0 at F11                 │
│     currentStrength: 87 → 65 (-22 casualties)   │
│   ↓                                              │
│   player2_phalanx_0 at F11                      │
│     currentStrength: 94 → 89 (-5 casualties)    │
│   ↓                                              │
│ Remove destroyed units (strength ≤ 0)           │
│   - None destroyed this turn                    │
│   ↓                                              │
│ Return: updatedPositions                        │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 6: Victory Check                          │
│ [ORCHESTRATOR - turnOrchestrator.js]            │
├─────────────────────────────────────────────────┤
│ checkVictoryConditions(positions, turn, obj)    │
│   ↓                                              │
│ Annihilation check:                             │
│   P1 total strength: 65 + 80 = 145              │
│   P2 total strength: 89 + 85 = 174              │
│   → No annihilation                             │
│   ↓                                              │
│ Catastrophic casualties:                        │
│   P1: 145/200 = 72.5% (not catastrophic)        │
│   P2: 174/180 = 96.7% (not catastrophic)        │
│   → Battle continues                            │
│   ↓                                              │
│ Objective check:                                │
│   Fords controlled: Neither has 2+              │
│   → No objective victory                        │
│   ↓                                              │
│ Return: {achieved: false}                       │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ PHASE 7: Narrative Generation                   │
│ [AI LAYER - aiNarrativeEngine.js]               │
├─────────────────────────────────────────────────┤
│ generateBattleNarrative(combatResult, context)  │
│   ↓                                              │
│ findHistoricalParallel()                        │
│   - Terrain: river → matches 'river_crossing'   │
│   - Formation: phalanx vs standard              │
│   - Result: defender victory                    │
│   → Best match: Battle of Granicus (334 BC)     │
│   ↓                                              │
│ generateOfficerReports()                        │
│   ↓                                              │
│   For Player 1 (attacker/loser):                │
│     officer = Roman Centurion                   │
│     speech = defeat pattern + tactical note     │
│     → "We've lost the ford. An orderly          │
│        withdrawal preserves the legion."        │
│   ↓                                              │
│   For Player 2 (defender/winner):               │
│     officer = Macedonian Phalangarch            │
│     speech = victory pattern                    │
│     → "The sarissa holds! As at Chaeronea!"     │
│   ↓                                              │
│ generateMainNarrative() [AI call]               │
│   ↓                                              │
│   aiManager.generateBattleNarrative()           │
│     ↓                                            │
│   selectBestProvider(context)                   │
│     complexity = 5 (standard battle)            │
│     → Use 'openai' (GPT-4o-mini)                │
│     ↓                                            │
│   generateWithOpenAI(context)                   │
│     model: gpt-4o-mini                          │
│     prompt: [structured battle context]         │
│     ↓                                            │
│   Returns: "Steel rings against steel as Roman  │
│   forces surge toward the ancient ford..."      │
│   [200-word dramatic narrative]                 │
│   ↓                                              │
│ generateTacticalAnalysis()                      │
│   - Key developments                            │
│   - Opportunities                               │
│   - Threats                                     │
│   - Recommendations                             │
│   ↓                                              │
│ generateNextTurnSetup()                         │
│   - Battlefield state summary                   │
│   - Turn 2 prompt                               │
│   - Available actions                           │
│   ↓                                              │
│ Return complete narrative object                │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DATABASE LAYER (Save)                           │
├─────────────────────────────────────────────────┤
│ battle.battleState = newBattleState             │
│ battle.currentTurn = 2                          │
│ battle.save()                                   │
│   ↓                                              │
│ BattleTurn.create({                             │
│   battleId: battle.id,                          │
│   turnNumber: 1,                                │
│   player1Command: p1Order,                      │
│   player2Command: p2Order,                      │
│   combatResults: combatResults,                 │
│   turnNarrative: narrative.mainNarrative,       │
│   isResolved: true                              │
│ })                                              │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ DISCORD LAYER (Send Results)                    │
├─────────────────────────────────────────────────┤
│ DM to Player 1:                                 │
│                                                  │
│ 🎲 TURN 1 RESOLUTION                            │
│                                                  │
│ [AI-generated narrative describing combat]      │
│                                                  │
│ 📊 YOUR FORCES:                                 │
│ Northern Company: 65/100 (took heavy casualties)│
│ Praetorian Guard: 80/80 (intact)                │
│                                                  │
│ 🔍 ENEMY INTEL:                                 │
│ Macedonian phalanx at F11: ~89 warriors         │
│                                                  │
│ 💬 Centurion Marcus:                            │
│ "We've lost the ford, sir. Those pikes are      │
│ murderous in close quarters. We need to flank   │
│ or find another crossing."                      │
│                                                  │
│ ⚡ Turn 2 - What are your orders?               │
│                                                  │
│ [💬 Ask Officer] [📊 Status]                   │
└─────────────────────────────────────────────────┘
    ↓
[ACTIVE BATTLE STATE: Awaiting Turn 2 orders]
```

---

## Common Development Patterns

### Adding New Culture

**Step 1: Update Database Enum**
```javascript
// src/database/models/Commander.js
culture: {
  type: DataTypes.ENUM(
    'Roman Republic',
    // ... existing cultures
    'NEW_CULTURE_NAME'  // Add here
  )
}

// src/database/models/EliteUnit.js
culture: {
  type: DataTypes.ENUM(
    // ... same list
    'NEW_CULTURE_NAME'
  )
}
```

**Step 2: Add Cultural Modifiers**
```javascript
// src/game/battleEngine.js
const CULTURAL_MODIFIERS = {
  'NEW_CULTURE_NAME': {
    unique_bonus: 1.2,        // +20% to specialty
    terrain_mastery: 'desert',
    unique_equipment: ['special_weapon'],
    restrictions: {
      minimum_cavalry: 0.5  // Must be 50%+ cavalry
    }
  }
};
```

**Step 3: Add Cultural Personality**
```javascript
// src/ai/aiNarrativeEngine.js
const CULTURAL_PERSONALITIES = {
  'NEW_CULTURE_NAME': {
    officers: [
      { rank: 'Chief', personality: 'bold', speech: 'direct' }
    ],
    speechPatterns: {
      victory: ["We triumph!", ...],
      defeat: ["We fall with honor!", ...],
      tactical: ["Charge!", ...],
      casualty: ["He died well", ...]
    },
    narrative_style: 'heroic_mobile'
  }
};
```

**Step 4: Add to Army Builder**
```javascript
// src/bot/commands/build-army.js
// Cultural restrictions in validation
if (culture === 'NEW_CULTURE_NAME') {
  // Special validation rules
}
```

**Step 5: Database Migration**
```bash
# Delete database to refresh enum
rm data/cohort.db

# Restart bot (will recreate with new enum)
node src/index.js
```

---

### Adding New Map/Scenario

**Step 1: Create Map File**
```javascript
// src/game/maps/newScenario.js
module.exports = {
  name: 'New Scenario Name',
  description: 'Tactical description',
  size: { rows: 20, cols: 20 },
  
  terrain: {
    river: ['F1', 'F2', ..., 'F20'],
    fords: [
      { coord: 'F11', name: 'North Ford', width: 1 }
    ],
    hills: ['B3', 'B4', 'B5'],
    forests: ['D15', 'D16'],
    roads: ['A11', 'B11', 'C11']
  },
  
  deploymentZones: {
    player1: {
      coords: ['A1', 'A2', ..., 'E3'],
      description: 'Western approach'
    },
    player2: {
      coords: ['P1', 'P2', ..., 'T3'],
      description: 'Eastern approach'
    }
  },
  
  objectives: {
    type: 'control_points',
    points: [
      { coord: 'F11', name: 'Ford', value: 1 }
    ],
    winCondition: 'Control ford for 4 turns OR destroy enemy'
  }
};
```

**Step 2: Add to Scenario Enum**
```javascript
// src/database/models/Battle.js
scenario: {
  type: DataTypes.ENUM(
    'Bridge Control',
    // ... existing
    'New Scenario Name'  // Add here
  )
}
```

**Step 3: Add to Create Game Command**
```javascript
// src/bot/commands/create-game.js
.addStringOption(option =>
  option.addChoices(
    // ... existing choices
    { name: '🆕 New Scenario', value: 'new_scenario' }
  )
)

// Map choice to scenario name
const scenarioMap = {
  'new_scenario': 'New Scenario Name'
};
```

**Step 4: Update Map Loader**
```javascript
// src/game/turnOrchestrator.js or wherever map loaded
const mapFiles = {
  'River Crossing': require('./maps/riverCrossing'),
  'New Scenario Name': require('./maps/newScenario')
};

const map = mapFiles[battle.scenario];
```

---

### Adding New Equipment Type

**Step 1: Add to Army Data**
```javascript
// src/game/armyData.js
const EQUIPMENT_OPTIONS = {
  new_weapon: {
    cost: 5,                      // SP blocks
    applicableTo: ['professional', 'militia'],
    effect: { 
      attack: +3, 
      special: 'armor_piercing' 
    },
    description: 'New weapon description',
    requiresCulture: ['Culture1', 'Culture2']  // Optional
  }
};
```

**Step 2: Add Effectiveness Data**
```javascript
// src/game/battleEngine.js
const WEAPON_EFFECTIVENESS = {
  'new_weapon_vs_light_armor': 0.80,
  'new_weapon_vs_heavy_armor': 0.65,
  'new_weapon_vs_mail': 0.75
};
```

**Step 3: Add to Army Builder Menu**
```javascript
// src/bot/armyInteractionHandler.js
const equipmentMenu = new StringSelectMenuBuilder()
  .addOptions([
    // ... existing options
    {
      label: '⚔️ New Weapon (5 blocks)',
      description: 'New weapon description',
      value: 'new_weapon'
    }
  ]);
```

---

## Debugging Guide

### Common Issues & Solutions

#### **Issue: "Unit not found" in movement validation**
**Symptom:** Movement validation fails with "cannot find unit"
**Cause:** Unit ID mismatch between army builder and battle state
**Debug:**
```javascript
console.log('Units in battleState:', 
  battleState.player1.unitPositions.map(u => u.unitId)
);
console.log('Unit ID in action:', action.unitId);
// Compare: Do IDs match exactly?
```

**Solution:** Ensure consistent ID generation in army deployment

#### **Issue: Path not found**
**Symptom:** A* returns `{valid: false, reason: 'no_path_available'}`
**Cause:** River or impassable terrain blocks route
**Debug:**
```javascript
// Generate ASCII map to visualize
const ascii = generateASCIIMap({
  terrain: map.terrain,
  player1Units: [{position: 'A5'}],
  player2Units: [{position: 'M5'}]
});
console.log(ascii);
// Look for river blocking path
```

**Solution:** Check ford locations, ensure getTerrainType() recognizes fords

#### **Issue: Combat not triggering**
**Symptom:** Units adjacent but no combat
**Cause:** detectCombatTriggers() not finding units
**Debug:**
```javascript
console.log('P1 positions after movement:', 
  newPositions.player1.map(u => u.position)
);
console.log('P2 positions:', 
  newPositions.player2.map(u => u.position)
);
console.log('Detected combats:', combatEngagements.length);

// Calculate distance manually
const dist = calculateDistance(p1Pos, p2Pos);
console.log('Distance:', dist);  // Should be 1 for melee
```

**Solution:** Verify positions updated correctly in processMovementPhase

#### **Issue: AI narrative fails**
**Symptom:** Error in generateBattleNarrative()
**Cause:** API key missing or rate limit
**Debug:**
```javascript
console.log('AI providers initialized:', {
  openai: !!openai,
  anthropic: !!anthropic,
  groq: !!groq
});

// Check environment
console.log('API key present:', !!process.env.OPENAI_API_KEY);
```

**Solution:** Verify .env file, check API key validity, use fallback

#### **Issue: Fog of war shows all enemies**
**Symptom:** Player sees units beyond vision range
**Cause:** Vision calculation not applying penalties
**Debug:**
```javascript
const unit = playerUnits[0];
console.log('Base vision:', LINE_OF_SIGHT.standard);
console.log('Weather:', weather, 'Penalty:', LINE_OF_SIGHT[weather]);
console.log('Terrain at unit:', getTerrainType(unit.position));
console.log('Final vision range:', visionRange);

enemyUnits.forEach(enemy => {
  const dist = calculateEuclideanDistance(unit.position, enemy.position);
  console.log(`Enemy at ${enemy.position}: distance ${dist}, visible: ${dist <= visionRange}`);
});
```

**Solution:** Ensure penalties applied (adding negative values), check distance calculation

---

## Quick Reference

### Starting New Battle (Manual Testing)
```javascript
// In node console or test file
const { models } = require('./src/database/setup');
const { Battle, Commander } = models;

// Create test commander
const commander = await Commander.create({
  discordId: 'test123',
  username: 'TestUser',
  culture: 'Roman Republic'
});

// Create test battle
const battle = await Battle.create({
  player1Id: 'test123',
  player2Id: 'test456',
  scenario: 'River Crossing',
  status: 'in_progress',
  battleState: {
    player1: {
      unitPositions: [
        {
          unitId: 'player1_unit_0',
          position: 'A5',
          currentStrength: 100,
          maxStrength: 100
        }
      ]
    },
    player2: {
      unitPositions: [
        {
          unitId: 'player2_unit_0',
          position: 'M5',
          currentStrength: 100,
          maxStrength: 100
        }
      ]
    }
  }
});

// Process test turn
const map = require('./src/game/maps/riverCrossing');
const { processTurn } = require('./src/game/turnOrchestrator');

const result = await processTurn(
  battle,
  'Move to F11',
  'Hold position',
  map
);

console.log(result);
```

### Querying Battle Data
```javascript
// Find all active battles
const active = await Battle.findAll({
  where: { status: 'in_progress' },
  include: ['player1', 'player2']
});

// Get player's battles
const playerBattles = await Battle.findAll({
  where: {
    [Op.or]: [
      { player1Id: userId },
      { player2Id: userId }
    ]
  }
});

// Get battle with complete data
const fullBattle = await Battle.findByPk(battleId, {
  include: [
    { model: Commander, as: 'player1', include: ['eliteUnits'] },
    { model: Commander, as: 'player2', include: ['eliteUnits'] },
    { model: BattleTurn, as: 'turns', limit: 5 }
  ]
});
```

### Common Sequelize Operations
```javascript
// Update with validation
const battle = await Battle.findByPk(id);
battle.currentTurn += 1;
battle.changed('battleState', true);  // CRITICAL for JSON fields
await battle.save();

// Bulk update
await Battle.update(
  { status: 'abandoned' },
  { where: { status: 'waiting_for_players', updatedAt: { [Op.lt]: yesterday } } }
);

// Complex query
const commanders = await Commander.findAll({
  where: { rank: 'Legendary' },
  include: [{
    model: EliteUnit,
    as: 'eliteUnits',
    where: { veteranLevel: 'Legendary' },
    include: [{
      model: VeteranOfficer,
      as: 'officers',
      where: { isAlive: true }
    }]
  }],
  order: [['battlesWon', 'DESC']]
});
```

---

## Performance Optimization Checklist

### Database Queries
- ✅ Use eager loading (include) instead of separate queries
- ✅ Select only needed attributes
- ✅ Add indexes on frequently queried fields
- ✅ Use transactions for multi-step updates
- ✅ Compress old battle history in battleState JSON

### AI Calls
- ✅ Batch multiple requests when possible
- ✅ Use cheapest provider for simple tasks
- ✅ Cache common responses (cultural speech)
- ✅ Implement timeouts and fallbacks
- ✅ Monitor costs with per-request tracking

### Discord API
- ✅ Queue DM sends (1 per second max)
- ✅ Use ephemeral replies for errors
- ✅ Defer long-running operations
- ✅ Batch embed updates when possible
- ✅ Cache user/channel objects

---

## Critical Code Patterns

### JSON Field Updates (Sequelize)
```javascript
// ❌ WRONG: Direct mutation doesn't trigger save
battle.battleState.player1.morale = 80;
await battle.save();  // Change NOT saved!

// ✅ CORRECT: Mark field as changed
battle.battleState.player1.morale = 80;
battle.changed('battleState', true);  // CRITICAL
await battle.save();  // Now it saves

// ✅ ALTERNATIVE: Reassign completely
battle.battleState = {
  ...battle.battleState,
  player1: {
    ...battle.battleState.player1,
    morale: 80
  }
};
await battle.save();
```

### Async Error Handling
```javascript
// ✅ ALWAYS wrap async Discord operations
try {
  await interaction.reply({ content: 'Success' });
} catch (error) {
  console.error('Reply failed:', error);
  // Attempt recovery
  try {
    await interaction.followUp({ content: 'Error occurred', ephemeral: true });
  } catch (secondError) {
    console.error('Recovery failed:', secondError);
  }
}
```

### Map Coordinate Validation
```javascript
// ✅ ALWAYS validate before using coordinates
function safeGetTerrain(coord, map) {
  try {
    if (!isValidCoord(coord)) {
      console.error('Invalid coordinate:', coord);
      return 'plains';  // Safe default
    }
    return getTerrainType(coord, map);
  } catch (error) {
    console.error('Terrain lookup error:', error);
    return 'plains';
  }
}
```

---

## Testing Workflow

### Unit Test Pattern
```javascript
// tests/unit/battleEngine.test.js
const { resolveCombat } = require('../../src/game/battleEngine');

describe('Battle Engine - Combat Resolution', () => {
  test('Phalanx should defeat cavalry frontal charge', () => {
    const attacker = {
      units: [{ type: 'cavalry', strength: 50 }],
      formation: 'cavalry_charge'
    };
    
    const defender = {
      units: [{ type: 'infantry', strength: 100 }],
      formation: 'phalanx',
      equipment: { primaryWeapon: 'sarissa' }
    };
    
    const result = resolveCombat(attacker, defender, {}, {});
    
    expect(result.combatResult.result).toContain('defender');
    expect(result.casualties.attacker[0].casualties).toBeGreaterThan(
      result.casualties.defender[0].casualties
    );
  });
});
```

### Integration Test Pattern
```javascript
// tests/integration/completeTurn.test.js
describe('Complete Turn Processing', () => {
  test('Full turn from orders to narrative', async () => {
    // Setup
    const battle = await createTestBattle();
    const map = require('../../src/game/maps/riverCrossing');
    
    // Execute
    const result = await processTurn(
      battle,
      'Move north',
      'Move south',
      map
    );
    
    // Verify
    expect(result.success).toBe(true);
    expect(result.newBattleState.player1.unitPositions).toHaveLength(2);
    expect(result.narrative.mainNarrative).toBeDefined();
  });
});
```

---

## Environment-Specific Configuration

### Development
```javascript
{
  database: 'SQLite (./data/cohort.db)',
  logging: 'Console (verbose)',
  aiProvider: 'All available',
  turnLimit: '24 hours',
  autoReload: true
}
```

### Production
```javascript
{
  database: 'PostgreSQL (Railway managed)',
  logging: 'Winston (file + error tracking)',
  aiProvider: 'Cost-optimized selection',
  turnLimit: '24 hours',
  monitoring: 'Performance metrics'
}
```

### Testing
```javascript
{
  database: 'SQLite (in-memory)',
  logging: 'Minimal',
  aiProvider: 'Mock responses',
  turnLimit: '1 minute (fast tests)',
  cleanup: 'Reset after each test'
}
```

---

This complete workflow documentation provides developers with end-to-end understanding of how every component integrates, common patterns for extending functionality, debugging strategies, and quick reference for daily development tasks.
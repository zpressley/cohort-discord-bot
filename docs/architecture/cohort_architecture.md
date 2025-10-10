# Cohort System Architecture Documentation

## Overview
Complete system architecture, data flow patterns, testing framework, configuration management, and deployment considerations for the Cohort ancient warfare Discord bot.

---

## System Architecture Layers

### Layer 1: Discord Interface
**Components:** Bot client, command handlers, interaction routers, DM processors
**Responsibility:** User interaction, input validation, UI presentation
**Technology:** Discord.js v14, SlashCommandBuilder, EmbedBuilder
**Files:** `src/bot/*`, `src/index.js`

### Layer 2: Game Logic
**Components:** Combat engine, movement system, turn orchestrator, army builder
**Responsibility:** Game rules, tactical calculations, state management
**Technology:** Pure JavaScript with mathematical algorithms
**Files:** `src/game/*`

### Layer 3: AI Integration
**Components:** Order interpreter, narrative generator, officer Q&A, AI manager
**Responsibility:** Natural language processing, storytelling, cultural authenticity
**Technology:** Multi-provider AI (OpenAI, Claude, Groq)
**Files:** `src/ai/*`

### Layer 4: Data Persistence
**Components:** Database models, associations, migrations
**Responsibility:** Data storage, relationships, querying
**Technology:** Sequelize ORM, PostgreSQL/SQLite
**Files:** `src/database/*`

---

## Data Flow Patterns

### Battle Creation Flow

```
User Types: /create-game river
    ↓
[LAYER 1: Discord Interface]
Command: create-game.js
    ↓ 
Validates scenario choice
    ↓
[LAYER 4: Database]
Creates Battle record
    └─ player1Id: user.id
    └─ player2Id: null
    └─ status: 'waiting_for_players'
    └─ scenario: 'River Crossing'
    ↓
[LAYER 1: Discord Interface]  
Posts lobby embed with join button
Stores messageId in Battle record
    ↓
[WAIT STATE]
Battle.status = 'waiting_for_players'
```

### Player Join Flow

```
Player 2 Clicks: ⚔️ Join Battle button
    ↓
[LAYER 1: Discord Interface]
Interaction Handler routes to join-battle.js
    ↓
Extracts battleId from customId
Loads Battle from database
    ↓
Validates:
  - Battle not full? ✓
  - Not joining own battle? ✓
    ↓
[LAYER 4: Database]
Updates Battle record
    └─ player2Id: player2.id
    └─ status: 'army_building'
    ↓
[LAYER 1: Discord Interface]
Updates lobby embed
DMs both players with army builder
    ↓
[WAIT STATE]
Battle.status = 'army_building'
Both players build armies independently
```

### Army Building Flow

```
Player Selects: ⭐ Professional (10 blocks)
    ↓
[LAYER 1: Discord Interface]
armyInteractionHandler.js receives menu selection
    ↓
Updates builderState in memory
    └─ selectedTroops.push({ type: 'professional', blocks: 10 })
    └─ blocksUsed += 10
    ↓
Validates budget (24/30 blocks used)
Updates embed with new progress bar
    ↓
Player Clicks: Equipment → War Spears
    ↓
Validates compatibility with professional troops ✓
    └─ selectedEquipment.push({ type: 'war_spears', blocks: 4 })
    └─ blocksUsed += 4 (now 28/30)
    ↓
Player Clicks: 💾 Finalize Army
    ↓
[LAYER 2: Game Logic]
Validates complete army composition
Checks cultural restrictions
    ↓
[LAYER 4: Database]
Saves army to Battle.battleState.player1.army
    ↓
Checks if both players ready
    ↓
If both ready:
    [LAYER 2: Game Logic]
    Generates weather
    Loads scenario map
    Deploys units to starting positions
        ↓
    [LAYER 4: Database]
    Updates Battle
        └─ status: 'in_progress'
        └─ battleState.player1.unitPositions: [...]
        └─ battleState.player2.unitPositions: [...]
        ↓
    [LAYER 1: Discord Interface]
    Sends initial briefings to both players
        ↓
[WAIT STATE]
Battle.status = 'in_progress'
Waiting for turn 1 orders
```

### Turn Processing Flow (Complete)

```
Both players submit orders via DM
    ↓
[LAYER 1: Discord Interface]
dmHandler.js receives both messages
Stores in Battle.battleState.pendingOrders
    ↓
Detects both players ready
Triggers turn processing
    ↓
[LAYER 2: Game Logic]
turnOrchestrator.js: processTurn()
    ↓
┌──────────────────────────────────────┐
│ PHASE 1: Order Interpretation        │
│ [LAYER 3: AI Integration]            │
│ orderInterpreter.js                  │
│   ↓                                   │
│ Calls AI: "Parse natural language"   │
│   ↓                                   │
│ Returns: Structured actions          │
│   ↓                                   │
│ Validates: Movement ranges, targets  │
│   ↓                                   │
│ Output: validatedActions[]           │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ PHASE 2: Movement Execution          │
│ [LAYER 2: Game Logic]                │
│ positionBasedCombat.js               │
│   ↓                                   │
│ For each validated move:             │
│   - Update unit.position             │
│   - Subtract movement cost           │
│   - Record path taken                │
│   ↓                                   │
│ Output: newPositions                 │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ PHASE 3: Visibility Update           │
│ [LAYER 2: Game Logic]                │
│ fogOfWar.js                          │
│   ↓                                   │
│ For each player:                     │
│   - Calculate unit vision ranges     │
│   - Check enemy unit distances       │
│   - Apply terrain/weather penalties  │
│   - Categorize intelligence quality  │
│   ↓                                   │
│ Output: visibleEnemyPositions        │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ PHASE 4: Combat Detection            │
│ [LAYER 2: Game Logic]                │
│ positionBasedCombat.js               │
│   ↓                                   │
│ detectCombatTriggers():              │
│   - Find adjacent units (melee)      │
│   - Find ranged engagements          │
│   ↓                                   │
│ calculatePositionalModifiers():      │
│   - Flanking bonuses                 │
│   - Elevation advantages             │
│   - River crossing penalties         │
│   - Forest/terrain effects           │
│   ↓                                   │
│ Output: combatEngagements[]          │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ PHASE 5: Combat Resolution           │
│ [LAYER 2: Game Logic]                │
│ battleEngine.js                      │
│   ↓                                   │
│ For each combat:                     │
│   - Calculate unit effectiveness     │
│   - Apply formation interactions     │
│   - Apply environmental effects      │
│   - Calculate weapon effectiveness   │
│   - Apply cultural modifiers         │
│   - Determine combat outcome         │
│   - Calculate casualties             │
│   - Calculate morale changes         │
│   ↓                                   │
│ Output: combatResults[]              │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ PHASE 6: Casualty Application        │
│ [LAYER 2: Game Logic]                │
│ turnOrchestrator.js                  │
│   ↓                                   │
│ applyCasualties():                   │
│   - Subtract casualties from units   │
│   - Remove destroyed units           │
│   - Update morale                    │
│   ↓                                   │
│ checkVictoryConditions():            │
│   - Annihilation check               │
│   - Catastrophic casualties          │
│   - Objective control                │
│   ↓                                   │
│ Output: updatedPositions, victory    │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ PHASE 7: Narrative Generation        │
│ [LAYER 3: AI Integration]            │
│ aiNarrativeEngine.js                 │
│   ↓                                   │
│ findHistoricalParallel():            │
│   - Match battle to history          │
│   ↓                                   │
│ generateOfficerReports():            │
│   - Cultural speech patterns         │
│   - Officer personalities            │
│   ↓                                   │
│ generateMainNarrative():             │
│   - AI creates battle story          │
│   - References historical parallels  │
│   ↓                                   │
│ Output: Complete narrative           │
└──────────────────────────────────────┘
    ↓
[LAYER 4: Database]
Save updated battleState
Increment currentTurn
Record turn in BattleTurn table
    ↓
[LAYER 1: Discord Interface]
Send turn results to both players
    ↓
If battle ended:
  - Award victory/defeat
  - Process officer casualties
  - Update commander records
  - Close battle
Else:
  - Await next turn orders
```

---

## Configuration & Constants

### Environment Variables
**Location:** `.env` file (not in repository)

```bash
# Discord Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_client_id

# AI Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cohort_db
DB_USER=postgres
DB_PASSWORD=your_password

# For development (SQLite)
DB_STORAGE=./data/cohort.db

# Environment
NODE_ENV=development  # or 'production'

# Rate Limiting
AI_RATE_LIMIT=100  # Requests per minute
AI_TIMEOUT=30000   # 30 seconds

# Turn Time Limits (milliseconds)
RANKED_TURN_LIMIT=86400000   # 24 hours
SKIRMISH_TURN_LIMIT=172800000 # 48 hours
QUICK_TURN_LIMIT=600000       # 10 minutes
```

### Game Constants
**Location:** Various files, centralized pattern needed

**Battle Configuration:**
```javascript
const BATTLE_CONFIG = {
  // Grid dimensions
  GRID_SIZE: { rows: 20, cols: 20 },
  TILE_SIZE_METERS: 50,
  TOTAL_BATTLEFIELD_SIZE: '1km × 1km',
  
  // Turn limits
  MAX_TURNS: 12,
  MIN_TURNS_BEFORE_VICTORY: 3,
  
  // Army building
  SUPPLY_POINTS: 30,
  MIN_SP_USAGE: 20,
  
  // Victory conditions
  ANNIHILATION_THRESHOLD: 0,      // All units destroyed
  CATASTROPHIC_THRESHOLD: 0.25,   // 75%+ casualties
  MORALE_BREAK: {
    levy: 0.15,
    militia: 0.20,
    professional: 0.25,
    elite: 0.35,
    spartan: 0.50,      // Cultural exception
    germanic: 1.00       // Never break (comitatus)
  }
};
```

**Combat Constants:**
```javascript
const COMBAT_CONFIG = {
  // Casualty rates by intensity
  DECISIVE_WINNER: 0.05,      // Winner loses 5%
  DECISIVE_LOSER: 0.25,       // Loser loses 25%
  SIGNIFICANT_WINNER: 0.08,
  SIGNIFICANT_LOSER: 0.18,
  SLIGHT_WINNER: 0.10,
  SLIGHT_LOSER: 0.15,
  STALEMATE: 0.12,            // Both lose 12%
  
  // Casualty variance
  VARIANCE: 0.4,              // ±40% randomization
  
  // Combat ratio thresholds
  MAJOR_VICTORY: 1.5,         // 1.5:1 power ratio
  VICTORY: 1.2,
  ADVANTAGE: 1.0,
  STALEMATE: 0.8
};
```

**Movement Constants:**
```javascript
const MOVEMENT_CONFIG = {
  // Base movement (tiles per turn)
  INFANTRY: 3,        // 150m
  CAVALRY: 5,         // 250m
  SCOUTS: 6,          // 300m
  LEVY: 4,            // 200m
  
  // Terrain multipliers
  PLAINS: 1.0,
  ROAD: 2.0,          // Double speed
  FORD: 0.66,         // Crossing penalty
  HILL: 0.66,         // Uphill penalty
  FOREST: 0.5,        // Dense vegetation
  MARSH: 0.33,        // Very slow
  RIVER: 999,         // Impassable (except fords)
  
  // Formation penalties
  PHALANX_MOVEMENT: 0.8,    // -20%
  TESTUDO_MOVEMENT: 0.5,    // -50%
  BERSERKER_MOVEMENT: 1.0   // No penalty
};
```

**Vision Constants:**
```javascript
const VISION_CONFIG = {
  STANDARD: 3,        // 150m base
  SCOUT: 5,           // 250m extended
  ELEVATED_BONUS: 2,  // +100m from hills
  
  // Weather modifiers
  LIGHT_RAIN: -1,
  HEAVY_RAIN: -3,
  FOG: -2,
  DUST: -1,
  
  // Terrain modifiers
  FOREST: -2,
  LIGHT_FOREST: -1,
  
  // Intelligence quality ranges (% of vision range)
  CONFIRMED: 0.5,     // 0-50% = detailed intel
  ESTIMATED: 0.8,     // 50-80% = approximate intel
  SUSPECTED: 1.0,     // 80-100% = vague intel
  DISTANT: 2.0        // Beyond 100%, up to +2 tiles = noise detection
};
```

---

## Testing Framework

### Database Check Utility
**Location:** `src/checkDB.js`

#### **Purpose**
Verify database connection, check table creation, validate model relationships, and display current battle states for debugging.

#### **Functions**

**`checkDatabaseConnection()`**
```javascript
async function checkDatabaseConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}
```

**`displayAllBattles()`**
```javascript
async function displayAllBattles() {
  const battles = await Battle.findAll({
    include: [
      { model: Commander, as: 'player1' },
      { model: Commander, as: 'player2' }
    ]
  });
  
  console.log(`\n📊 Total Battles: ${battles.length}\n`);
  
  battles.forEach(battle => {
    console.log(`Battle ID: ${battle.id}`);
    console.log(`  Players: ${battle.player1.username} vs ${battle.player2?.username || 'Waiting'}`);
    console.log(`  Status: ${battle.status}`);
    console.log(`  Turn: ${battle.currentTurn}/${battle.maxTurns}`);
    console.log(`  Scenario: ${battle.scenario}`);
    console.log(`  Weather: ${battle.weather}`);
    console.log('---');
  });
}
```

**`validateModelRelationships()`**
```javascript
async function validateModelRelationships() {
  // Test Commander → EliteUnit relationship
  const commander = await Commander.findOne({
    include: ['eliteUnits']
  });
  
  if (commander && commander.eliteUnits) {
    console.log('✅ Commander → EliteUnit relationship working');
  }
  
  // Test EliteUnit → VeteranOfficer relationship
  const eliteUnit = await EliteUnit.findOne({
    include: ['officers']
  });
  
  if (eliteUnit && eliteUnit.officers) {
    console.log('✅ EliteUnit → VeteranOfficer relationship working');
  }
  
  // Test Battle → Commander relationships
  const battle = await Battle.findOne({
    include: ['player1', 'player2']
  });
  
  if (battle && battle.player1) {
    console.log('✅ Battle → Commander relationships working');
  }
}
```

### Battle Check Utility
**Location:** `src/checkBattles.js`

#### **Purpose**
Inspect specific battle states, validate turn data, and debug combat resolution issues.

#### **Functions**

**`inspectBattle(battleId)`**
```javascript
async function inspectBattle(battleId) {
  const battle = await Battle.findByPk(battleId, {
    include: [
      { model: Commander, as: 'player1' },
      { model: Commander, as: 'player2' },
      { model: BattleTurn, as: 'turns' }
    ]
  });
  
  console.log('\n🔍 BATTLE INSPECTION\n');
  console.log('ID:', battle.id);
  console.log('Status:', battle.status);
  console.log('Turn:', `${battle.currentTurn}/${battle.maxTurns}`);
  console.log('\nPlayers:');
  console.log(`  P1: ${battle.player1.username} (${battle.player1.culture})`);
  console.log(`  P2: ${battle.player2.username} (${battle.player2.culture})`);
  
  console.log('\nEnvironment:');
  console.log(`  Weather: ${battle.weather}`);
  console.log(`  Terrain: ${battle.terrain.primary}`);
  
  console.log('\nUnit Positions:');
  console.log('Player 1:');
  battle.battleState.player1.unitPositions?.forEach(unit => {
    console.log(`  ${unit.unitId}: ${unit.currentStrength}/${unit.maxStrength} at ${unit.position}`);
  });
  console.log('Player 2:');
  battle.battleState.player2.unitPositions?.forEach(unit => {
    console.log(`  ${unit.unitId}: ${unit.currentStrength}/${unit.maxStrength} at ${unit.position}`);
  });
  
  console.log('\nPending Orders:');
  console.log('Player 1:', battle.battleState.pendingOrders?.player1?.order || 'None');
  console.log('Player 2:', battle.battleState.pendingOrders?.player2?.order || 'None');
  
  console.log('\nTurn History:');
  battle.turns?.forEach(turn => {
    console.log(`Turn ${turn.turnNumber}:`);
    console.log(`  Result: ${turn.outcome}`);
    console.log(`  Casualties: P1 ${turn.casualties?.player1 || 0}, P2 ${turn.casualties?.player2 || 0}`);
  });
}
```

**`validateTurnData(battle)`**
```javascript
async function validateTurnData(battle) {
  const issues = [];
  
  // Check unit positions valid
  const p1Units = battle.battleState.player1.unitPositions || [];
  const p2Units = battle.battleState.player2.unitPositions || [];
  
  p1Units.forEach(unit => {
    if (!isValidCoordinate(unit.position)) {
      issues.push(`P1 unit at invalid position: ${unit.position}`);
    }
    if (unit.currentStrength > unit.maxStrength) {
      issues.push(`P1 unit over max strength: ${unit.currentStrength}/${unit.maxStrength}`);
    }
  });
  
  // Check both players have units
  if (p1Units.length === 0) {
    issues.push('Player 1 has no units deployed');
  }
  if (p2Units.length === 0) {
    issues.push('Player 2 has no units deployed');
  }
  
  // Check morale values
  if (battle.battleState.player1.morale < 0 || battle.battleState.player1.morale > 150) {
    issues.push('Player 1 morale out of range');
  }
  
  if (issues.length > 0) {
    console.error('❌ Battle validation issues:');
    issues.forEach(issue => console.error(`  - ${issue}`));
    return false;
  }
  
  console.log('✅ Battle data valid');
  return true;
}
```

### Test Commands

**Location:** `src/bot/commands/test-*.js`

#### **`test-submit-both.js`**
**Purpose:** Simulate both players submitting orders for testing turn resolution
```javascript
async function execute(interaction) {
  // Find test battle
  const battle = await Battle.findOne({
    where: { status: 'in_progress' }
  });
  
  // Submit test orders for both players
  const p1Order = "Move south";
  const p2Order = "Move north";
  
  // Process turn
  await processTurn(battle, p1Order, p2Order, map);
  
  await interaction.reply('✅ Test turn processed!');
}
```

#### **`test-join.js`**
**Purpose:** Auto-join test battles for rapid testing
```javascript
async function execute(interaction) {
  // Create test battle
  const battle = await Battle.create({
    player1Id: interaction.user.id,
    scenario: 'River Crossing'
  });
  
  // Auto-join as player 2 (test account)
  battle.player2Id = TEST_USER_ID;
  battle.status = 'army_building';
  await battle.save();
  
  await interaction.reply('✅ Test battle created and joined!');
}
```

---

## Error Recovery Strategies

### Database Transaction Safety

```javascript
async function safelyUpdateBattle(battle, updateFn) {
  const transaction = await sequelize.transaction();
  
  try {
    // Backup current state
    const backup = JSON.parse(JSON.stringify(battle.battleState));
    
    // Attempt update
    await updateFn(battle);
    await battle.save({ transaction });
    
    // Commit if successful
    await transaction.commit();
    return { success: true };
    
  } catch (error) {
    // Rollback on error
    await transaction.rollback();
    console.error('Update failed, rolled back:', error);
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}
```

### AI Failure Handling

```javascript
async function robustAICall(prompt, options = {}) {
  const maxRetries = 3;
  const fallbackModel = 'gpt-4o-mini';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Attempt AI call
      const response = await aiManager.call(prompt, options);
      return { success: true, response };
      
    } catch (error) {
      console.error(`AI attempt ${attempt} failed:`, error);
      
      // Last attempt - use fallback
      if (attempt === maxRetries) {
        if (options.fallback) {
          console.log('Using fallback response');
          return { 
            success: true, 
            response: options.fallback,
            usedFallback: true 
          };
        }
        
        return { success: false, error: error.message };
      }
      
      // Wait before retry
      await sleep(1000 * attempt);  // Exponential backoff
    }
  }
}
```

### State Corruption Detection

```javascript
async function validateBattleState(battle) {
  const errors = [];
  
  // Check required fields exist
  if (!battle.battleState.player1) {
    errors.push('Missing player1 battle state');
  }
  
  if (!battle.battleState.player2) {
    errors.push('Missing player2 battle state');
  }
  
  // Check unit positions valid
  const p1Units = battle.battleState.player1?.unitPositions || [];
  p1Units.forEach((unit, index) => {
    if (!unit.position || !isValidCoordinate(unit.position)) {
      errors.push(`P1 unit ${index} has invalid position: ${unit.position}`);
    }
    if (!unit.unitId) {
      errors.push(`P1 unit ${index} missing unitId`);
    }
    if (unit.currentStrength === undefined) {
      errors.push(`P1 unit ${index} missing strength`);
    }
  });
  
  // Check for duplicate unit IDs
  const allUnitIds = [
    ...p1Units.map(u => u.unitId),
    ...(battle.battleState.player2?.unitPositions || []).map(u => u.unitId)
  ];
  const duplicates = allUnitIds.filter((id, index) => 
    allUnitIds.indexOf(id) !== index
  );
  if (duplicates.length > 0) {
    errors.push(`Duplicate unit IDs: ${duplicates.join(', ')}`);
  }
  
  if (errors.length > 0) {
    console.error('❌ Battle state validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }
  
  return true;
}
```

---

## Performance Optimization

### Database Query Optimization

**Eager Loading:**
```javascript
// ❌ BAD: N+1 query problem
const battles = await Battle.findAll();
for (const battle of battles) {
  const player1 = await Commander.findByPk(battle.player1Id);
  const player2 = await Commander.findByPk(battle.player2Id);
}
// Result: 1 + (2 × N) queries

// ✅ GOOD: Single query with includes
const battles = await Battle.findAll({
  include: [
    { model: Commander, as: 'player1' },
    { model: Commander, as: 'player2' },
    { model: BattleTurn, as: 'turns', limit: 5, order: [['turnNumber', 'DESC']] }
  ]
});
// Result: 1 query total
```

**Selective Field Loading:**
```javascript
// Only load needed fields for list views
const battles = await Battle.findAll({
  attributes: ['id', 'scenario', 'status', 'currentTurn'],
  where: { status: 'in_progress' }
});

// Full data only when needed
const fullBattle = await Battle.findByPk(battleId, {
  include: ['player1', 'player2', 'turns']
});
```

### Memory Management

**Battle State Cleanup:**
```javascript
// Remove old turn data beyond 3 turns
function compressBattleHistory(battleState) {
  if (battleState.turnEvents && battleState.turnEvents.length > 3) {
    // Keep last 3 turns in detail
    const recentTurns = battleState.turnEvents.slice(-3);
    
    // Compress older turns
    const olderTurns = battleState.turnEvents.slice(0, -3);
    const compressed = {
      summary: 'Earlier battle events',
      turns: olderTurns.length,
      majorEvents: olderTurns.filter(e => e.significant).map(e => e.summary)
    };
    
    battleState.turnEvents = [compressed, ...recentTurns];
  }
  
  return battleState;
}
```

**Inactive Battle Cleanup:**
```javascript
// Cron job to clean up abandoned battles
async function cleanupInactiveBattles() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const abandoned = await Battle.findAll({
    where: {
      status: 'in_progress',
      updatedAt: { [Op.lt]: oneDayAgo }
    }
  });
  
  for (const battle of abandoned) {
    console.log(`Cleaning up abandoned battle: ${battle.id}`);
    battle.status = 'abandoned';
    await battle.save();
  }
}
```

### AI Request Caching

```javascript
const aiResponseCache = new Map();

async function cachedAICall(prompt, cacheKey) {
  // Check cache first
  if (aiResponseCache.has(cacheKey)) {
    console.log('Using cached AI response');
    return aiResponseCache.get(cacheKey);
  }
  
  // Make AI call
  const response = await aiManager.call(prompt);
  
  // Cache for 1 hour
  aiResponseCache.set(cacheKey, response);
  setTimeout(() => {
    aiResponseCache.delete(cacheKey);
  }, 60 * 60 * 1000);
  
  return response;
}
```

---

## Deployment Configuration

### Railway.app / Render.com Setup

**Procfile:**
```
web: node src/index.js
```

**Environment Variables (Production):**
```bash
# Set in Railway/Render dashboard
DISCORD_BOT_TOKEN=...
OPENAI_API_KEY=...
DATABASE_URL=postgresql://...  # Auto-provided by Railway

NODE_ENV=production
LOG_LEVEL=info
```

**Database Migration:**
```javascript
// Production uses PostgreSQL, development uses SQLite
const config = {
  development: {
    dialect: 'sqlite',
    storage: './data/cohort.db'
  },
  production: {
    dialect: 'postgres',
    url: process.env.DATABASE_URL,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
};

const sequelize = new Sequelize(config[process.env.NODE_ENV || 'development']);
```

### Health Check Endpoint

```javascript
// Optional: Express server for health checks
const express = require('express');
const app = express();

app.get('/health', async (req, res) => {
  try {
    // Check database
    await sequelize.authenticate();
    
    // Check Discord connection
    const botReady = client.isReady();
    
    res.json({
      status: 'healthy',
      database: 'connected',
      discord: botReady ? 'connected' : 'disconnected',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.listen(process.env.PORT || 3000);
```

---

## Monitoring & Logging

### Winston Logger Configuration

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console for development
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    
    // File for production
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'combined.log' 
    })
  ]
});

// Usage throughout codebase
logger.info('Battle created', { battleId, scenario });
logger.error('Combat resolution failed', { error, battleId });
logger.debug('AI response', { prompt, response });
```

### Metrics Tracking

```javascript
const metrics = {
  battles: {
    created: 0,
    completed: 0,
    abandoned: 0
  },
  ai: {
    calls: 0,
    costs: 0,
    errors: 0
  },
  performance: {
    avgTurnProcessing: 0,
    avgAIResponse: 0
  }
};

function trackMetric(category, metric, value) {
  metrics[category][metric] += value;
  
  // Log to monitoring service (e.g., Datadog, New Relic)
  // monitoringService.track(`cohort.${category}.${metric}`, value);
}
```

---

## Security Considerations

### Input Sanitization

```javascript
function sanitizeUserInput(text) {
  // Remove Discord markdown that could break embeds
  let sanitized = text.replace(/[`*_~|]/g, '');
  
  // Limit length
  sanitized = sanitized.substring(0, 500);
  
  // Remove SQL injection attempts (belt and suspenders with ORM)
  sanitized = sanitized.replace(/[';]/g, '');
  
  return sanitized.trim();
}
```

### Rate Limiting

```javascript
const userCommandTimestamps = new Map();
const COMMAND_COOLDOWN = 3000;  // 3 seconds

async function checkRateLimit(userId, commandName) {
  const key = `${userId}:${commandName}`;
  const lastUsed = userCommandTimestamps.get(key);
  
  if (lastUsed && Date.now() - lastUsed < COMMAND_COOLDOWN) {
    return {
      limited: true,
      retryAfter: Math.ceil((COMMAND_COOLDOWN - (Date.now() - lastUsed)) / 1000)
    };
  }
  
  userCommandTimestamps.set(key, Date.now());
  return { limited: false };
}
```

### Permission Checks

```javascript
async function canUserAccessBattle(userId, battleId) {
  const battle = await Battle.findByPk(battleId);
  
  if (!battle) return false;
  
  return battle.player1Id === userId || battle.player2Id === userId;
}
```

---

## System Integration Patterns

### Event-Driven Architecture

```javascript
const EventEmitter = require('events');
const gameEvents = new EventEmitter();

// Emit events at key points
gameEvents.on('battle_created', async (battle) => {
  console.log('New battle created:', battle.id);
  // Could trigger analytics, notifications, etc.
});

gameEvents.on('turn_completed', async (battle, turnResult) => {
  console.log('Turn completed:', battle.id, battle.currentTurn);
  // Could trigger AI narrative caching, metrics
});

gameEvents.on('battle_ended', async (battle, winner) => {
  console.log('Battle ended:', battle.id, 'Winner:', winner);
  // Process veteran experience, update rankings
});

// Emit from game logic
gameEvents.emit('battle_created', battle);
```

### Middleware Pattern

```javascript
// Command execution middleware
async function executeWithMiddleware(command, interaction) {
  // Pre-execution
  await checkRateLimit(interaction.user.id, command.data.name);
  await logCommandUsage(interaction);
  
  // Execute
  try {
    await command.execute(interaction);
  } catch (error) {
    await handleCommandError(error, interaction);
  }
  
  // Post-execution
  await trackMetrics(command.data.name);
}
```

---

## File Structure Overview

```
cohort-discord-bot/
├── src/
│   ├── index.js                 # Bot entry point
│   │
│   ├── database/
│   │   ├── setup.js             # Sequelize initialization
│   │   └── models/
│   │       ├── Battle.js        # Battle state tracking
│   │       ├── Commander.js     # Player progression
│   │       ├── EliteUnit.js     # Veteran units
│   │       ├── VeteranOfficer.js # Named officers
│   │       └── BattleTurn.js    # Turn history
│   │
│   ├── game/
│   │   ├── battleEngine.js      # Combat mathematics
│   │   ├── movementSystem.js    # Movement validation
│   │   ├── positionBasedCombat.js # Position modifiers
│   │   ├── fogOfWar.js          # Intelligence system
│   │   ├── turnOrchestrator.js  # Turn coordination
│   │   ├── armyData.js          # Troop/equipment data
│   │   └── maps/
│   │       ├── riverCrossing.js # Map definitions
│   │       └── mapUtils.js      # Pathfinding, coordinates
│   │
│   ├── ai/
│   │   ├── aiManager.js         # Multi-provider orchestration
│   │   ├── orderInterpreter.js  # Order parsing
│   │   ├── aiNarrativeEngine.js # Battle narratives
│   │   └── officerQA.js         # Tactical questions
│   │
│   └── bot/
│       ├── commandLoader.js     # Dynamic command loading
│       ├── interactionHandler.js # Main router
│       ├── dmHandler.js         # DM processing
│       ├── gameInteractionHandler.js
│       ├── armyInteractionHandler.js
│       ├── lobbyInteractionHandler.js
│       └── commands/
│           ├── create-game.js
│           ├── join-battle.js
│           ├── build-army.js
│           ├── stats.js
│           ├── abandon-battle.js
│           └── ping.js
│
├── data/
│   └── cohort.db                # SQLite database (development)
│
├── tests/
│   ├── unit/                    # Unit tests
│   └── integration/             # Integration tests
│
├── docs/                        # Project documentation
├── .env                         # Environment variables (not in repo)
├── .gitignore
├── package.json
└── README.md
```

---

## Critical System Constants

### Unit Type Definitions
```javascript
const UNIT_TYPES = {
  infantry: {
    baseMovement: 3,
    canFormPhalanx: true,
    canUseShields: true,
    terrainPenalty: { forest: 0.5, marsh: 0.33 }
  },
  cavalry: {
    baseMovement: 5,
    mounted: true,
    chargeBonus: 6,  // Requires 3+ tiles movement
    terrainPenalty: { forest: 0.2, marsh: 0.1 }
  },
  scouts: {
    baseMovement: 6,
    visionRange: 5,
    stealth: true,
    lightArmor: true
  }
};
```

### Cultural Equipment Restrictions
```javascript
const CULTURAL_EQUIPMENT = {
  'Roman Republic': {
    unique: ['lorica_segmentata', 'gladius', 'scutum'],
    forbidden: ['sarissa', 'composite_bow'],
    preferred: ['heavy_infantry', 'engineering']
  },
  'Macedonian Kingdoms': {
    unique: ['sarissa', 'companion_cavalry'],
    forbidden: ['crossbow'],
    preferred: ['phalanx', 'combined_arms']
  },
  'Han Dynasty': {
    unique: ['crossbow', 'cloud_ladder', 'advanced_catapult'],
    forbidden: [],
    preferred: ['coordinated_volleys', 'siege_warfare']
  }
};
```

---

## Design Philosophy Summary

### Historical Authenticity
Every mechanic grounded in documented research:
- Combat modifiers from actual battles
- Terrain effects from archaeological evidence
- Cultural speech patterns from primary sources
- Equipment effectiveness from weapon tests

### Deterministic Core, Narrative Variability
- Mathematical combat resolution (predictable)
- AI narrative generation (variable storytelling)
- Player skill determines tactics, not RNG
- Emotional engagement through AI characters

### Progressive Complexity
- New players: Simple template armies, basic orders
- Veterans: Custom builds, multi-unit coordination
- Masters: Cultural mastery, psychological warfare

### Sustainable Development
- Modular architecture allows incremental features
- AI fallbacks prevent critical failures
- Database schema supports future expansion
- Clear separation of concerns enables team development
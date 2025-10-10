# Cohort Implementation Guide & Next Steps

## Current Project Status

### ✅ Completed Systems (Production Ready)

#### **Database Layer (100%)**
- ✅ All models defined with proper associations
- ✅ Veteran progression mathematics implemented
- ✅ Officer knowledge tracking system
- ✅ Battle state JSON storage
- ✅ Commander cross-battle progression
- ✅ Database setup with migrations

#### **Map & Movement (90%)**
- ✅ 20×20 grid coordinate system
- ✅ A* pathfinding with terrain costs
- ✅ Movement validation
- ✅ Terrain type detection
- ✅ River Crossing map fully defined
- ⏳ Additional scenario maps (need implementation)

#### **Combat Mathematics (95%)**
- ✅ Formation interaction matrix
- ✅ Weapon effectiveness calculations
- ✅ Environmental effect modifiers
- ✅ Cultural bonus system
- ✅ Casualty calculation
- ✅ Morale effects
- ⏳ Edge case testing needed

#### **Fog of War (85%)**
- ✅ Vision range calculation
- ✅ Line of sight checking
- ✅ Intelligence quality tiers
- ✅ Visibility filtering
- ⏳ Scout mission integration
- ⏳ Elevation vision bonus

#### **Discord Bot (80%)**
- ✅ Slash command registration
- ✅ Interaction routing
- ✅ DM handling
- ✅ Lobby system
- ✅ Army builder menus
- ⏳ Error handling enhancement
- ⏳ Multi-battle context management

---

### 🔄 Partially Implemented (Needs Work)

#### **AI Integration (40%)**
**Status:** Placeholders exist, need real implementation

**Completed:**
- ✅ Multi-provider architecture designed
- ✅ Cultural personality data structures
- ✅ Historical precedent database
- ✅ Narrative template system
- ✅ Provider selection logic

**Needs Implementation:**
- ⏳ Connect to real OpenAI API
- ⏳ Connect to Anthropic API
- ⏳ Connect to Groq API
- ⏳ Test prompt engineering
- ⏳ Implement retry and fallback logic
- ⏳ Add cost tracking

**Critical Files:**
```javascript
// src/ai/aiManager.js
async function generateWithOpenAI(context) {
  // TODO: Replace placeholder with real API call
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [/* ... */]
  });
  return response.choices[0].message.content;
}
```

**Implementation Steps:**
1. Verify API keys in `.env`
2. Test basic completion call
3. Tune prompts for historical accuracy
4. Add error handling
5. Implement fallback cascade
6. Add cost logging

#### **Order Parsing (60%)**
**Status:** Keyword parser working, AI parser needs connection

**Completed:**
- ✅ Keyword vocabulary database
- ✅ Cultural tactics configuration
- ✅ Fuzzy matching for typos
- ✅ Confidence calculation
- ✅ Dual parser pattern designed

**Needs Implementation:**
- ⏳ Connect AI parser to real API
- ⏳ Test complex conditional orders
- ⏳ Implement confirmation flow for ambiguous orders
- ⏳ Add multi-turn mission parsing

#### **Veteran System (50%)**
**Status:** Math and database ready, naming triggers not implemented

**Completed:**
- ✅ Database schema for officers
- ✅ Experience calculation mathematics
- ✅ Death probability functions
- ✅ Knowledge accumulation system

**Needs Implementation:**
- ⏳ Battle 3 naming trigger
- ⏳ Battle 5 officer personality generation
- ⏳ Battle 10 legendary status activation
- ⏳ Officer death roll after battles
- ⏳ Automatic promotion system

**Implementation Location:**
```javascript
// src/game/turnOrchestrator.js
// After turn resolution, before sending results

async function processPostBattleEvents(battle, turnResult) {
  for (const playerSide of ['player1', 'player2']) {
    const commander = await getCommander(battle, playerSide);
    const eliteUnit = commander.eliteUnits[0];
    
    // Check for naming milestones
    if (eliteUnit.battlesParticipated === 3 && !eliteUnit.name) {
      await triggerUnitNaming(eliteUnit, battle);
    }
    
    if (eliteUnit.battlesParticipated === 5) {
      await triggerOfficerNaming(eliteUnit, battle);
    }
    
    if (eliteUnit.battlesParticipated === 10) {
      await applyLegendaryStatus(eliteUnit);
    }
    
    // Roll for officer deaths
    await rollForOfficerCasualties(eliteUnit, turnResult, battle);
  }
}
```

---

### ⏳ Not Yet Started (Planned)

#### **Advanced Combat Features**
- ⏳ Commander entity with capture mechanics
- ⏳ Multi-turn mission orders
- ⏳ Command range zones (instant/messenger/autonomous)
- ⏳ Unit autonomy AI
- ⏳ March formation types
- ⏳ Stacking density penalties
- ⏳ Defensive lock (Thermopylae mechanic)

#### **Multiplayer Features**
- ⏳ Concurrent battle management
- ⏳ Battle mode variants (Ranked/Skirmish/Quick)
- ⏳ Matchmaking system
- ⏳ Leaderboards
- ⏳ Tournament brackets

#### **Campaign Features**
- ⏳ Connected battle sequences
- ⏳ Supply accumulation
- ⏳ Reputation effects on negotiations
- ⏳ Elite capture and ransom
- ⏳ Cross-battle consequences

---

## Priority Implementation Queue

### Week 1 (Critical Path)
**Goal:** Complete end-to-end battle from creation to Turn 1

**Tasks:**
1. **Connect AI Providers**
   ```javascript
   // src/ai/aiManager.js
   // Replace placeholders with real API calls
   // Test with simple prompt
   // Verify response parsing
   ```

2. **Test Complete Turn Resolution**
   ```javascript
   // Create test battle manually
   // Submit both orders
   // Verify turn processes successfully
   // Check narrative generation
   ```

3. **Fix Any Turn Processing Bugs**
   - Movement validation
   - Combat resolution
   - Casualty application
   - State updates

4. **Deploy to Test Server**
   - Railway.app setup
   - Environment variables
   - Database migration
   - Verify bot online

**Success Criteria:**
- ✅ Two players can complete Turn 1
- ✅ AI generates battle narrative
- ✅ Results sent to both players
- ✅ Battle advances to Turn 2

---

### Week 2 (Core Features)
**Goal:** Complete multi-turn battles to victory

**Tasks:**
1. **Implement Victory Conditions**
   ```javascript
   // Enhance checkVictoryConditions()
   // Add objective tracking (ford control)
   // Test annihilation victory
   // Test catastrophic casualties victory
   ```

2. **Battle Completion Flow**
   ```javascript
   // Award experience to survivors
   // Update commander win/loss records
   // Record battle in history
   // Send victory/defeat notifications
   ```

3. **Basic Veteran Progression**
   ```javascript
   // Call eliteUnit.addBattleExperience(survivors)
   // Calculate new average experience
   // Update veteran level
   // Show progression in stats
   ```

4. **Multi-Turn Testing**
   - Complete 5-turn battle
   - Verify state persistence
   - Test timeout handling
   - Confirm veteran XP awarded

**Success Criteria:**
- ✅ Battles complete to victory
- ✅ Veteran experience updates correctly
- ✅ Commander ranks advance
- ✅ Battle history recorded

---

### Week 3 (Polish & Features)
**Goal:** Named veterans and officer system

**Tasks:**
1. **Unit Naming System**
   ```javascript
   async function triggerUnitNaming(eliteUnit, battle) {
     if (eliteUnit.battlesParticipated !== 3) return;
     
     // Generate AI suggestions based on battle history
     const suggestions = await generateUnitNameSuggestions(eliteUnit, battle);
     
     // Present to player
     await promptPlayerForUnitName(commander, suggestions);
     
     // Or auto-name if preferred
     eliteUnit.name = suggestions[0];
     await eliteUnit.save();
   }
   ```

2. **Officer Naming (Battle 5)**
   ```javascript
   async function triggerOfficerNaming(eliteUnit, battle) {
     const leadOfficer = eliteUnit.officers[0];
     
     // Generate personality from unit history
     const personality = analyzeUnitHistory(eliteUnit);
     
     // Generate name and title
     leadOfficer.name = generateOfficerName(eliteUnit.culture, personality);
     leadOfficer.personality = personality;
     
     await leadOfficer.save();
   }
   ```

3. **Legendary Status (Battle 10)**
   ```javascript
   async function applyLegendaryStatus(eliteUnit) {
     if (eliteUnit.averageExperience < 11) return;
     
     // Add legendary bonuses
     eliteUnit.legendaryBonuses = {
       moraleAura: +1,        // +1 morale to nearby units
       inspiringPresence: true,
       enhancedAutonomy: true
     };
     
     await eliteUnit.save();
     
     // Announce to server
     await announceNewLegendaryUnit(eliteUnit);
   }
   ```

4. **Officer Death System**
   ```javascript
   async function rollForOfficerCasualties(eliteUnit, turnResult, battle) {
     const officers = await eliteUnit.getOfficers({ where: { isAlive: true } });
     
     for (const officer of officers) {
       const deathChance = officer.getDeathProbability();
       const roll = Math.random();
       
       if (roll < deathChance) {
         // Officer killed
         await officer.killInBattle(battle.scenario, 'combat');
         
         // Promote replacement
         const nextOfficer = await promoteNewOfficer(eliteUnit, officer);
         
         // Add to turn narrative
         turnResult.narrative.officerEvents.push({
           type: 'death',
           officer: officer.name,
           promoted: nextOfficer.name
         });
       }
     }
   }
   ```

**Success Criteria:**
- ✅ Units earn names after 3 battles
- ✅ Lead officer named after 5 battles
- ✅ Legendary status at Battle 10
- ✅ Officers can die permanently
- ✅ Promotions happen automatically

---

### Week 4 (Advanced Features)
**Goal:** Multi-battle management and game modes

**Tasks:**
1. **Battle Context Management**
   - Multiple concurrent battles
   - Context detection in DMs
   - Battle selection UI

2. **Game Mode Variants**
   - Ranked (full stakes)
   - Skirmish (practice)
   - Quick battles (preset armies)

3. **Additional Maps**
   - Hill Fort Assault
   - Forest Ambush
   - Desert Oasis

4. **Enhanced Fog of War**
   - Scout missions
   - Intelligence reports
   - Elevation bonuses

---

## Critical Implementation Examples

### Example 1: Connecting Real AI

**Current Placeholder:**
```javascript
// src/ai/aiManager.js (current)
async function generateWithOpenAI(context) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: "You are a battle narrator"
    }, {
      role: "user",
      content: createBattlePrompt(context)
    }],
    max_tokens: 800
  });
  
  return response.choices[0].message.content;
}
```

**Enhanced Implementation:**
```javascript
async function generateWithOpenAI(context) {
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            role: "system",
            content: buildSystemPrompt(context.culture)
          }, {
            role: "user",
            content: createBattlePrompt(context)
          }],
          max_tokens: 800,
          temperature: 0.7
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 30000)
        )
      ]);
      
      // Log cost
      const estimatedCost = (response.usage.total_tokens / 1000) * 0.00015;
      trackAICost('openai', estimatedCost);
      
      return response.choices[0].message.content;
      
    } catch (error) {
      console.error(`OpenAI attempt ${attempt} failed:`, error);
      lastError = error;
      
      if (attempt < maxRetries) {
        await sleep(1000 * attempt);  // Exponential backoff
      }
    }
  }
  
  // All retries failed - cascade to fallback
  console.warn('OpenAI failed, trying Groq fallback');
  try {
    return await generateWithGroq(context);
  } catch (groqError) {
    console.error('Groq also failed, using template');
    return generateTemplateResponse(context);
  }
}
```

### Example 2: Implementing Officer Death Rolls

**Location:** Add to `src/game/turnOrchestrator.js`

```javascript
async function processOfficerCasualties(battle, turnResult) {
  const { models } = require('../database/setup');
  
  // Process both players
  for (const playerSide of ['player1', 'player2']) {
    const playerId = battle[`${playerSide}Id`];
    
    // Load commander with elite unit and officers
    const commander = await models.Commander.findByPk(playerId, {
      include: [{
        model: models.EliteUnit,
        as: 'eliteUnits',
        include: [{
          model: models.VeteranOfficer,
          as: 'officers',
          where: { isAlive: true }
        }]
      }]
    });
    
    if (!commander || !commander.eliteUnits[0]) continue;
    
    const eliteUnit = commander.eliteUnits[0];
    const livingOfficers = eliteUnit.officers;
    
    console.log(`Rolling death for ${livingOfficers.length} officers...`);
    
    const casualties = [];
    const promotions = [];
    
    for (const officer of livingOfficers) {
      const deathProbability = officer.getDeathProbability();
      const roll = Math.random();
      
      console.log(`${officer.name}: roll ${roll.toFixed(3)} vs ${deathProbability} death chance`);
      
      if (roll < deathProbability) {
        // Officer killed!
        await officer.killInBattle(
          battle.scenario,
          `Fell in combat at Turn ${battle.currentTurn}`
        );
        
        casualties.push({
          name: officer.name,
          rank: officer.rank,
          experience: officer.battlesExperience,
          knowledgeLost: Object.keys(officer.tacticalKnowledge.enemyCultures).length
        });
        
        console.log(`💀 ${officer.name} KILLED`);
        
        // Promote replacement
        const promoted = await promoteNextOfficer(eliteUnit, officer);
        if (promoted) {
          promotions.push({
            name: promoted.name,
            oldRank: promoted.previousRank,
            newRank: promoted.rank
          });
        }
      }
    }
    
    // Add to turn narrative
    if (casualties.length > 0 || promotions.length > 0) {
      turnResult.narrative.officerEvents = {
        casualties,
        promotions
      };
    }
  }
}

async function promoteNextOfficer(eliteUnit, fallenOfficer) {
  const { models } = require('../database/setup');
  
  // Find next officer in hierarchy
  const remainingOfficers = await models.VeteranOfficer.findAll({
    where: {
      eliteUnitId: eliteUnit.id,
      isAlive: true
    },
    order: [['battlesExperience', 'DESC']]
  });
  
  if (remainingOfficers.length === 0) {
    // Create new recruit officer
    return await models.VeteranOfficer.create({
      eliteUnitId: eliteUnit.id,
      name: `${fallenOfficer.rank} Recruit`,
      rank: fallenOfficer.rank,
      battlesExperience: 0
    });
  }
  
  // Most experienced officer gets promoted
  const promoted = remainingOfficers[0];
  promoted.previousRank = promoted.rank;
  promoted.rank = fallenOfficer.rank;
  await promoted.save();
  
  return promoted;
}
```

### Example 3: Implementing Multi-Battle Context

**Location:** `src/bot/dmHandler.js`

```javascript
async function handleDM(message) {
  if (message.author.bot) return;
  
  // Find all active battles for user
  const activeBattles = await Battle.findAll({
    where: {
      [Op.or]: [
        { player1Id: message.author.id },
        { player2Id: message.author.id }
      ],
      status: 'in_progress'
    }
  });
  
  if (activeBattles.length === 0) {
    return message.reply('No active battles. Use `/create-game` to start!');
  }
  
  // Single battle - auto-route
  if (activeBattles.length === 1) {
    return await processOrderForBattle(activeBattles[0], message);
  }
  
  // Multiple battles - need context
  const battleContext = userBattleContexts.get(message.author.id);
  
  if (battleContext && activeBattles.some(b => b.id === battleContext)) {
    // Use set context
    const battle = activeBattles.find(b => b.id === battleContext);
    return await processOrderForBattle(battle, message);
  }
  
  // No context - show battle selector
  return await showBattleSelector(message.author.id, activeBattles);
}

async function showBattleSelector(userId, battles) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Multiple Active Battles')
    .setDescription('Which battle do you want to command?');
  
  battles.forEach((battle, i) => {
    const opponent = getOpponentName(battle, userId);
    embed.addFields({
      name: `${i+1}. ${battle.scenario} - Turn ${battle.currentTurn}`,
      value: `Opponent: ${opponent}\n⏰ ${getTimeRemaining(battle)}`
    });
  });
  
  const buttons = battles.map((battle, i) =>
    new ButtonBuilder()
      .setCustomId(`select_battle_${battle.id}`)
      .setLabel(`Battle ${i+1}`)
      .setStyle(ButtonStyle.Primary)
  );
  
  const user = await client.users.fetch(userId);
  await user.send({ 
    embeds: [embed], 
    components: [new ActionRowBuilder().addComponents(...buttons)]
  });
}
```

---

## Testing Implementation Guide

### Unit Test Example
```javascript
// tests/unit/veteranProgression.test.js
const { EliteUnit } = require('../../src/database/models/EliteUnit');

describe('Elite Unit Veteran Progression', () => {
  let testUnit;
  
  beforeEach(async () => {
    testUnit = await EliteUnit.create({
      commanderId: 'test',
      name: 'Test Guard',
      culture: 'Roman Republic',
      size: 80,
      currentStrength: 80,
      totalExperience: 0
    });
  });
  
  test('First battle adds experience correctly', async () => {
    // All 80 warriors survive
    await testUnit.addBattleExperience(80);
    
    expect(testUnit.totalExperience).toBe(80);
    expect(testUnit.currentStrength).toBe(80);
    expect(testUnit.averageExperience).toBe(1.0);
    expect(testUnit.veteranLevel).toBe('Seasoned');
  });
  
  test('Casualties reduce both strength and average', async () => {
    // Setup: 3 battles, all survived
    testUnit.totalExperience = 240;  // 80×3
    testUnit.currentStrength = 80;
    testUnit.battlesParticipated = 2;
    await testUnit.save();
    
    // Battle 3: 20 casualties
    await testUnit.addBattleExperience(60);
    
    // Expected math:
    // +60 survivors = 300 total
    // -60 casualties lost (20 × 3.0 avg) = 240 total
    // 240 ÷ 60 = 4.0 average
    
    expect(testUnit.currentStrength).toBe(60);
    expect(testUnit.totalExperience).toBe(240);
    expect(testUnit.averageExperience).toBe(4.0);
    expect(testUnit.veteranLevel).toBe('Veteran');
  });
  
  test('Adding recruits dilutes average', async () => {
    // Setup: 60 veterans with 4.0 avg
    testUnit.currentStrength = 60;
    testUnit.totalExperience = 240;
    
    // Add 20 recruits
    await testUnit.addRecruits(20);
    
    expect(testUnit.currentStrength).toBe(80);
    expect(testUnit.totalExperience).toBe(240);  // Unchanged
    expect(testUnit.averageExperience).toBe(3.0);  // 240÷80
    expect(testUnit.veteranLevel).toBe('Veteran');  // Still veteran tier
  });
});
```

### Integration Test Example
```javascript
// tests/integration/completeBattle.test.js
describe('Complete Battle Integration', () => {
  test('Two players complete full battle to victory', async () => {
    // Create commanders
    const player1 = await Commander.create({
      discordId: 'test1',
      username: 'TestPlayer1',
      culture: 'Roman Republic'
    });
    
    const player2 = await Commander.create({
      discordId: 'test2',
      username: 'TestPlayer2',
      culture: 'Macedonian Kingdoms'
    });
    
    // Create battle
    const battle = await Battle.create({
      player1Id: 'test1',
      player2Id: 'test2',
      scenario: 'River Crossing',
      status: 'in_progress',
      battleState: createTestBattleState()
    });
    
    const map = require('../../src/game/maps/riverCrossing');
    
    // Process 5 turns
    for (let turn = 1; turn <= 5; turn++) {
      const result = await processTurn(
        battle,
        `Turn ${turn} P1 order`,
        `Turn ${turn} P2 order`,
        map
      );
      
      expect(result.success).toBe(true);
      expect(battle.currentTurn).toBe(turn + 1);
      
      if (result.victory.achieved) {
        break;
      }
    }
    
    // Verify victory awarded
    expect(battle.winner).not.toBeNull();
    
    // Verify commander records updated
    await player1.reload();
    await player2.reload();
    
    const winner = battle.winner === 'test1' ? player1 : player2;
    const loser = battle.winner === 'test1' ? player2 : player1;
    
    expect(winner.battlesWon).toBe(1);
    expect(loser.battlesLost).toBe(1);
  });
});
```

---

## Deployment Guide

### Production Deployment (Railway.app)

**Step 1: Prepare Repository**
```bash
# Ensure .env not in repo
echo ".env" >> .gitignore

# Commit all code
git add .
git commit -m "Prepare for deployment"
git push origin main
```

**Step 2: Railway Setup**
```
1. Go to Railway.app
2. New Project → Deploy from GitHub
3. Select cohort-discord-bot repository
4. Add PostgreSQL database (automatic)
```

**Step 3: Configure Environment**
```
Railway Dashboard → Variables:

DISCORD_BOT_TOKEN=your_token_here
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

NODE_ENV=production
LOG_LEVEL=info

# DATABASE_URL auto-provided by Railway
```

**Step 4: Deploy**
```
Railway auto-deploys on git push

Monitor logs:
- "✅ Database connection established"
- "✅ Discord bot ready"
- "✅ AI providers initialized"
```

**Step 5: Verify**
```
1. Bot appears online in Discord
2. /ping command responds
3. /create-game works
4. Database queries succeed
```

---

## Performance Optimization Implementation

### Database Query Optimization

**Before (N+1 Problem):**
```javascript
const battles = await Battle.findAll({ where: { status: 'in_progress' }});

for (const battle of battles) {
  const player1 = await Commander.findByPk(battle.player1Id);  // Query per battle
  const player2 = await Commander.findByPk(battle.player2Id);  // Query per battle
}
// Result: 1 + (N×2) queries
```

**After (Eager Loading):**
```javascript
const battles = await Battle.findAll({
  where: { status: 'in_progress' },
  include: [
    { model: Commander, as: 'player1' },
    { model: Commander, as: 'player2' }
  ]
});

for (const battle of battles) {
  const player1 = battle.player1;  // Already loaded
  const player2 = battle.player2;  // Already loaded
}
// Result: 1 query total
```

### Battle State Compression

```javascript
function compressBattleHistory(battleState) {
  // Keep last 3 turns in full detail
  const recentTurns = battleState.turnEvents.slice(-3);
  
  // Compress older turns
  if (battleState.turnEvents.length > 3) {
    const olderTurns = battleState.turnEvents.slice(0, -3);
    
    const compressed = {
      summary: `Turns 1-${olderTurns.length}`,
      totalCasualties: {
        player1: olderTurns.reduce((sum, t) => sum + (t.casualties?.player1 || 0), 0),
        player2: olderTurns.reduce((sum, t) => sum + (t.casualties?.player2 || 0), 0)
      },
      majorEvents: olderTurns
        .filter(t => t.significant)
        .map(t => ({ turn: t.turnNumber, event: t.summary }))
    };
    
    battleState.turnEvents = [compressed, ...recentTurns];
  }
  
  return battleState;
}
```

---

## Next Immediate Steps (This Week)

### Monday: AI Connection
```
1. Create test OpenAI account
2. Get API key
3. Test basic completion call
4. Integrate into aiManager.js
5. Test order interpretation
6. Test narrative generation
```

### Tuesday: End-to-End Testing
```
1. Create test Discord server
2. Add bot to server
3. Two test accounts
4. Create game
5. Join game
6. Build armies
7. Submit Turn 1 orders
8. Verify turn processes
9. Debug any failures
```

### Wednesday: Bug Fixes
```
1. Address issues from testing
2. Improve error messages
3. Add logging for debugging
4. Test edge cases
```

### Thursday: Victory Flow
```
1. Implement complete battle to victory
2. Test veteran XP application
3. Test commander record updates
4. Verify battle history saves
```

### Friday: Polish & Deploy
```
1. Clean up console logs
2. Add user-friendly error messages
3. Test on production Railway
4. Soft launch with friends
```

---

## Common Development Commands

### Database Operations
```bash
# Reset database (DESTRUCTIVE)
rm data/cohort.db

# Inspect database
sqlite3 data/cohort.db
.tables
SELECT * FROM Battles;
.quit

# Check database from Node
node src/checkDB.js
```

### Testing
```bash
# Run all tests
npm test

# Run specific test file
npm test tests/unit/veteranProgression.test.js

# Watch mode
npm test -- --watch
```

### Development Server
```bash
# Start with auto-reload
npx nodemon src/index.js

# Start normally
node src/index.js

# Start with debug logging
LOG_LEVEL=debug node src/index.js
```

---

## Final Checklist Before Launch

### Core Functionality
- [ ] Players can create battles
- [ ] Players can join battles
- [ ] Players can build armies
- [ ] Orders process via DM
- [ ] Turn resolution works end-to-end
- [ ] AI generates narratives
- [ ] Battle completes to victory
- [ ] Veteran XP applies correctly
- [ ] Stats display properly

### Error Handling
- [ ] Invalid orders show helpful errors
- [ ] AI failures have fallbacks
- [ ] Database errors recovered gracefully
- [ ] Timeout handling works
- [ ] Player disconnection handled

### User Experience
- [ ] Response times < 5 seconds
- [ ] Error messages clear and helpful
- [ ] Cultural voices consistent
- [ ] Embeds formatted attractively
- [ ] Tutorial/help system available

### Technical Requirements
- [ ] Environment variables configured
- [ ] Database migrations work
- [ ] Discord bot permissions correct
- [ ] AI API keys valid
- [ ] Logging captures errors
- [ ] Health check endpoint works

---

This implementation guide provides concrete next steps, code examples, and testing strategies to complete the Cohort ancient warfare bot from its current 60-70% completion to production-ready status.
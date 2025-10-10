# Cohort Visual System Map

## Complete System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DISCORD INTERFACE LAYER                      │
│                         (User Interaction)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Commands   │  │  Interaction │  │  DM Handler  │             │
│  │              │  │   Handlers   │  │              │             │
│  │ create-game  │→│ Buttons      │→│ Order        │             │
│  │ join-battle  │  │ Menus        │  │ Processing   │             │
│  │ build-army   │  │ Modals       │  │ Questions    │             │
│  │ stats        │  └──────┬───────┘  └──────┬───────┘             │
│  └──────┬───────┘         │                 │                      │
│         │                 │                 │                      │
│         └─────────────────┴─────────────────┘                      │
│                           ↓                                         │
└───────────────────────────┼─────────────────────────────────────────┘
                            ↓
┌───────────────────────────┼─────────────────────────────────────────┐
│                  GAME LOGIC LAYER                                    │
│                  (Rules & Mechanics)                                 │
├──────────────────────────────────────────────────────────────────────┤
│                            ↓                                         │
│  ┌──────────────────────────────────────────────────────┐           │
│  │          TURN ORCHESTRATOR (Master Coordinator)       │           │
│  │  processTurn() - 7 Phase Pipeline                    │           │
│  └──────┬───────────────────────────────────────┬───────┘           │
│         ↓                                        ↓                   │
│  ┌──────────────┐                        ┌──────────────┐           │
│  │  Movement    │                        │   Combat     │           │
│  │  System      │                        │   Engine     │           │
│  │              │                        │              │           │
│  │ •Pathfinding │                        │ •Formations  │           │
│  │ •Validation  │←──────────────────────→│ •Weapons    │           │
│  │ •Terrain     │   Position Data        │ •Environment │           │
│  │ •Collisions  │                        │ •Casualties  │           │
│  └──────┬───────┘                        └──────┬───────┘           │
│         │                                        │                   │
│         ├────────────────┬───────────────────────┤                   │
│         ↓                ↓                       ↓                   │
│  ┌──────────────┐ ┌──────────────┐      ┌──────────────┐           │
│  │ Fog of War   │ │ Position     │      │ Army Data    │           │
│  │              │ │ Combat       │      │              │           │
│  │ •Visibility  │ │              │      │ •Troop Types │           │
│  │ •Intelligence│ │ •Modifiers   │      │ •Equipment   │           │
│  │ •Scouts      │ │ •Flanking    │      │ •Support     │           │
│  │ •Line of     │ │ •Elevation   │      │ •Cultural    │           │
│  │  Sight       │ │ •River       │      │  Restrictions│           │
│  └──────────────┘ └──────────────┘      └──────────────┘           │
│                                                                      │
└──────────────────────────┬───────────────────────────────────────────┘
                           ↓
┌──────────────────────────┼───────────────────────────────────────────┐
│                   AI INTEGRATION LAYER                                │
│                   (Natural Language & Narrative)                      │
├───────────────────────────────────────────────────────────────────────┤
│                           ↓                                           │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │              AI MANAGER (Provider Orchestration)         │         │
│  │  •OpenAI (GPT-4o-mini) - 80% standard battles          │         │
│  │  •Anthropic (Claude) - 5% complex battles              │         │
│  │  •Groq (Llama 3) - 15% simple scenarios                │         │
│  └───────┬─────────────────────────────────────┬───────────┘         │
│          ↓                                      ↓                     │
│  ┌──────────────┐                       ┌──────────────┐            │
│  │   Order      │                       │  Narrative   │            │
│  │ Interpreter  │                       │   Engine     │            │
│  │              │                       │              │            │
│  │ •Parse NL    │                       │ •Math→Story  │            │
│  │ •Validate    │                       │ •Cultural    │            │
│  │ •Structured  │                       │  Voice       │            │
│  │  Actions     │                       │ •Historical  │            │
│  └──────────────┘                       │  Parallels   │            │
│          ↓                               └──────────────┘            │
│  ┌──────────────┐                              ↓                     │
│  │  Officer Q&A │                       ┌──────────────┐            │
│  │              │←──────────────────────│ Cultural     │            │
│  │ •Tactical    │   Knowledge Base      │ Personalities│            │
│  │  Advice      │                       │              │            │
│  │ •Veteran     │                       │ •Speech      │            │
│  │  Memories    │                       │  Patterns    │            │
│  │ •Cultural    │                       │ •Officer     │            │
│  │  Voice       │                       │  Archetypes  │            │
│  └──────────────┘                       └──────────────┘            │
│                                                                       │
└──────────────────────────┬────────────────────────────────────────────┘
                           ↓
┌──────────────────────────┼────────────────────────────────────────────┐
│                DATABASE PERSISTENCE LAYER                             │
│                (Sequelize ORM)                                        │
├───────────────────────────────────────────────────────────────────────┤
│                           ↓                                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ Commander  │→│EliteUnit   │→│VeteranOff. │  │ Battle     │    │
│  │            │  │            │  │            │  │            │    │
│  │ •Discord ID│  │ •Culture   │  │ •Name/Rank │  │ •Players   │    │
│  │ •Culture   │  │ •Size      │  │ •Experience│  │ •Scenario  │    │
│  │ •Rank      │  │ •Strength  │  │ •Knowledge │  │ •Status    │    │
│  │ •Wins/Loss │  │ •Veteran   │  │ •Alive?    │  │ •State     │    │
│  │ •Reputation│  │  Level     │  │ •Death     │  │ •Weather   │    │
│  │            │  │ •Officers→─┼──┤  Record    │  │ •Terrain   │    │
│  └────────────┘  └────────────┘  └────────────┘  └──────┬─────┘    │
│                                                           │           │
│                                                    ┌──────┴─────┐    │
│                                                    │ BattleTurn │    │
│                                                    │            │    │
│                                                    │ •Commands  │    │
│                                                    │ •Results   │    │
│                                                    │ •Narrative │    │
│                                                    │ •Events    │    │
│                                                    └────────────┘    │
│                                                                       │
│  PostgreSQL (Production) / SQLite (Development)                      │
└───────────────────────────────────────────────────────────────────────┘
```

## Data Flow Through System

### Input Flow (Player Order → Game State)
```
Player Types DM: "Advance to ford"
    ↓
┌────────────────────────────────┐
│ Discord DM Handler             │
│ •Identify player/battle        │
│ •Store in pendingOrders        │
│ •Check both ready?             │
└────────┬───────────────────────┘
         ↓ [Both orders received]
┌────────────────────────────────┐
│ Turn Orchestrator              │
│ PHASE 1: Parse Orders          │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ AI Order Interpreter           │
│ •Natural language → JSON       │
│ •Validate against rules        │
│ •Return structured actions     │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ Movement System                │
│ •A* pathfinding                │
│ •Terrain cost calculation      │
│ •Validate movement range       │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ Position Combat Detector       │
│ •Check unit proximity          │
│ •Calculate position mods       │
│ •Build combat contexts         │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ Battle Engine                  │
│ •Formation interactions        │
│ •Weapon effectiveness          │
│ •Environmental effects         │
│ •Calculate casualties          │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ Fog of War System              │
│ •Calculate visibility          │
│ •Categorize intelligence       │
│ •Filter for each player        │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ Victory Checker                │
│ •Annihilation?                 │
│ •Casualties > 75%?             │
│ •Objectives met?               │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ Database Saver                 │
│ •Update battleState            │
│ •Increment currentTurn         │
│ •Record BattleTurn             │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ AI Narrative Engine            │
│ •Find historical parallel      │
│ •Generate officer reports      │
│ •Create main narrative         │
│ •Build next turn setup         │
└────────┬───────────────────────┘
         ↓
┌────────────────────────────────┐
│ Discord DM Sender              │
│ •Format as embeds              │
│ •Send to both players          │
│ •Include officer dialogue      │
└────────────────────────────────┘
         ↓
Player Receives: Battle narrative + new briefing
```

### Output Flow (Game State → Player Narrative)

```
Battle State (After Turn Resolution)
    ↓
{
  player1: {
    unitPositions: [
      {unitId, position, strength, morale, ...}
    ],
    visibleEnemyPositions: [
      {position, type, strength, confidence, ...}
    ],
    supplies: 85,
    morale: 92
  },
  weather: 'light_rain',
  terrain: {...},
  currentTurn: 2
}
    ↓
┌────────────────────────────────┐
│ AI Narrative Engine            │
│ INPUT: Battle state + math     │
│ OUTPUT: Cultural narrative     │
└────────┬───────────────────────┘
         ↓
{
  mainNarrative: "Steel rings against steel...",
  officerReports: {
    attacker: "Centurion Marcus: We've secured the ford...",
    defender: "Phalangarch: The sarissa holds firm..."
  },
  tacticalAnalysis: {
    threats: [...],
    opportunities: [...]
  }
}
    ↓
┌────────────────────────────────┐
│ Discord Embed Formatter        │
│ Convert to visual Discord UI   │
└────────┬───────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 🎲 TURN 1 RESOLUTION                    │
│                                          │
│ [AI Narrative - 200 words]              │
│                                          │
│ 📊 YOUR FORCES:                         │
│ Northern Company: 87/100 at F11         │
│ Praetorian Guard: 80/80 at E10          │
│                                          │
│ 🔍 ENEMY INTELLIGENCE:                  │
│ Macedonian phalanx at F11 (~94 warriors)│
│ Unknown force in eastern woods          │
│                                          │
│ 💬 Centurion Marcus:                    │
│ "The ford is contested, sir..."         │
│                                          │
│ ⚡ Turn 2 - Awaiting orders, Commander  │
│                                          │
│ [💬 Ask Officer] [📊 View Status]      │
└─────────────────────────────────────────┘
    ↓
Player reads, asks questions, submits next order
```

---

## Module Dependency Graph

```
index.js (Bot Entry)
    ├── database/setup.js
    │   ├── models/Commander.js
    │   ├── models/EliteUnit.js
    │   ├── models/VeteranOfficer.js
    │   ├── models/Battle.js
    │   └── models/BattleTurn.js
    │
    ├── bot/commandLoader.js
    │   └── bot/commands/*.js (all commands)
    │
    ├── bot/interactionHandler.js
    │   ├── bot/gameInteractionHandler.js
    │   ├── bot/armyInteractionHandler.js
    │   └── bot/lobbyInteractionHandler.js
    │
    └── bot/dmHandler.js
        └── game/turnOrchestrator.js
            ├── ai/orderInterpreter.js
            │   ├── ai/aiManager.js
            │   └── game/movementSystem.js
            │       └── game/maps/mapUtils.js
            │
            ├── game/positionBasedCombat.js
            │   └── game/maps/riverCrossing.js
            │
            ├── game/fogOfWar.js
            │   └── game/maps/mapUtils.js
            │
            ├── game/battleEngine.js
            │   └── [CONSTANTS: formations, weapons, environment]
            │
            └── ai/aiNarrativeEngine.js
                ├── ai/aiManager.js
                └── [CONSTANTS: cultural personalities, historical precedents]
```

---

## Critical Data Transformations

### 1. Army Builder → Battle State
```javascript
// INPUT: Builder selections
{
  blocksUsed: 28,
  selectedTroops: [
    {type: 'professional', quantity: 1, blocks: 10}
  ],
  selectedEquipment: [
    {type: 'war_spears', blocks: 4},
    {type: 'light_armor', blocks: 4}
  ],
  selectedSupport: [
    {type: 'field_engineers', blocks: 2}
  ]
}
    ↓ [Transform during deployment]
// OUTPUT: Positioned units
{
  unitPositions: [
    {
      unitId: 'player1_professional_0',
      position: 'B2',  // From deployment zone
      currentStrength: 100,
      maxStrength: 100,
      movementRemaining: 3,
      equipment: {
        primaryWeapon: 'war_spears',
        armor: 'light_armor',
        shield: 'none'
      },
      baseStats: {attack: 8, defense: 7},
      modifiers: {
        weapon: +2,    // War spears
        armor: +2,     // Light armor
        mobility: -1   // Armor penalty
      }
    },
    {
      unitId: 'player1_elite',
      position: 'C2',
      currentStrength: 80,
      veteranLevel: 'Veteran',
      equipment: {/* cultural fixed */}
    },
    {
      unitId: 'player1_engineers',
      position: 'B1',
      currentStrength: 10,
      type: 'support',
      abilities: ['build_fortifications']
    }
  ]
}
```

### 2. Natural Language → Game Actions
```javascript
// INPUT: Player order
"Northern Company advance to ford, archers provide covering fire from hill"
    ↓ [AI interpretation]
// OUTPUT: Structured actions
{
  validatedActions: [
    {
      type: 'move',
      unitId: 'northern_company',
      targetPosition: 'F11',
      path: ['B2', 'C2', ..., 'F11'],
      cost: 3.5,
      movementRemaining: 0.5
    },
    {
      type: 'move',
      unitId: 'hillcrest_archers',
      targetPosition: 'B5',
      reasoning: 'Positioning on hill for fire support'
    },
    {
      type: 'support_fire',
      supportingUnit: 'hillcrest_archers',
      protectedUnit: 'northern_company'
    }
  ]
}
```

### 3. Combat Math → Narrative
```javascript
// INPUT: Mathematical result
{
  combatResult: {
    result: 'defender_major_victory',
    combatRatio: 0.18,
    intensity: 'decisive'
  },
  casualties: {
    attacker: [{casualties: 22}],
    defender: [{casualties: 5}]
  }
}
    ↓ [AI narrative generation]
// OUTPUT: Immersive story
{
  mainNarrative: {
    fullNarrative: `
The Roman advance crashes against the Macedonian pike wall
like waves on stone. Centurion Marcus's legionnaires raise
their shields against the forest of 21-foot sarissas, but
the mathematics of reach have already decided this clash.

Five rows of pike points project beyond the Macedonian front,
an impenetrable hedge of death that horses instinctively refuse
to charge. Roman soldiers who press forward find only iron -
spear points finding gaps in armor, blood staining the ford.

Twenty-two legionnaires fall in the brutal melee, their courage
unable to overcome the simple physics of weapon length. The
Macedonians lose only five to Roman desperation, their discipline
and superior reach proving decisive.

As Marcus sounds the withdrawal, the ford remains contested.
The phalanx holds, unbroken.
    `,
    historicalReference: 'Battle of Chaeronea (338 BC)'
  },
  officerReports: {
    attacker: {
      speech: "Those pikes are murderous, sir. An orderly withdrawal preserves the legion.",
      experience: 7
    }
  }
}
```

---

## System Performance Metrics

### Latency Budget (Target)
```
User sends order in DM
    ↓ [Instant] Discord receives message
    ↓ [50ms] Database query for battle
    ↓ [100ms] Load battle state and map
    ↓ [500ms] AI interprets order
    ↓ [200ms] Validate movement (pathfinding)
    ↓ [50ms] Execute movement, detect combat
    ↓ [100ms] Resolve combat (math)
    ↓ [50ms] Apply casualties, check victory
    ↓ [1000ms] AI generates narrative
    ↓ [100ms] Save to database
    ↓ [200ms] Format Discord embed
    ↓ [300ms] Send DM to both players
    ↓
TOTAL: ~2.65 seconds (Target: < 5 seconds)
```

### Cost Budget (Target)
```
Monthly AI Costs (500 battles/month):

Standard battles (400): 400 × $0.004 = $1.60
Simple battles (75): 75 × $0.002 = $0.15
Complex battles (25): 25 × $0.08 = $2.00

Total AI: ~$3.75/month

Hosting (Railway): $5-12/month
Database: Free tier (included)

TOTAL: $8-16/month
Break-even: 8 premium subscribers at $2/month
```

---

## File Size Reference

### Largest Files (Lines of Code)
```
battleEngine.js:           ~450 lines (combat math + constants)
aiNarrativeEngine.js:      ~380 lines (cultural personalities + templates)
positionBasedCombat.js:    ~280 lines (position modifiers + detection)
movementSystem.js:         ~250 lines (validation + pathfinding)
turnOrchestrator.js:       ~220 lines (7-phase pipeline)
fogOfWar.js:               ~200 lines (visibility + intelligence)
orderInterpreter.js:       ~180 lines (AI parsing + validation)
mapUtils.js:               ~150 lines (coordinate utilities)
```

### Database Record Sizes (Approximate)
```
Commander:        500 bytes   (basic profile)
EliteUnit:        2 KB        (with 8 officers)
VeteranOfficer:   800 bytes   (per officer)
Battle:           50-100 KB   (complete state)
BattleTurn:       20-40 KB    (per turn)

Total per completed battle: ~300-500 KB
1000 battles: ~350 MB database
```

---

## Testing Coverage Map

### ✅ Well Tested (>70%)
- Coordinate system (parseCoord, coordToString)
- Distance calculations (Manhattan, Euclidean)
- Database model creation and associations
- Command registration and loading

### 🔄 Partially Tested (30-70%)
- Movement validation (pathfinding logic)
- Combat mathematics (formation interactions)
- Casualty calculation (variance testing needed)
- Army builder validation

### ⏳ Needs Testing (<30%)
- AI order interpretation (mocked)
- AI narrative generation (mocked)
- Fog of war edge cases
- Multi-turn battle completion
- Veteran progression over 10+ battles
- Officer death and promotion system

---

## Future Enhancement Roadmap

### Phase 1: Core Completion (Weeks 1-4)
- [ ] Connect real AI providers (remove placeholders)
- [ ] Test complete turn resolution end-to-end
- [ ] Implement officer Q&A with real AI
- [ ] Add battle completion flow (veteran XP, officer deaths)

### Phase 2: Veteran System (Weeks 5-8)
- [ ] Battle 3: Unit naming system
- [ ] Battle 5: Officer naming and personalities
- [ ] Battle 10: Legendary status bonuses
- [ ] Individual officer death rolls
- [ ] Promotion system for fallen officers

### Phase 3: Advanced Combat (Weeks 9-12)
- [ ] Multi-turn mission orders
- [ ] Commander entity with capture mechanics
- [ ] Command range zones (instant/messenger/autonomous)
- [ ] Unit autonomy AI (Sun Tzu logic)
- [ ] March formation types
- [ ] Stacking density penalties

### Phase 4: Cultural Depth (Weeks 13-16)
- [ ] Tutorial origin stories (all 20 cultures)
- [ ] Cultural adaptation systems
- [ ] Elite capture and ransom
- [ ] Honor and reputation mechanics
- [ ] Cross-battle cultural learning

### Phase 5: Game Modes (Weeks 17-20)
- [ ] Ranked battles (full stakes)
- [ ] Skirmish mode (practice, no consequences)
- [ ] Quick battles (preset armies, timed)
- [ ] Throne challenges (total loss risk)
- [ ] Concurrent battle management

---

## Code Quality Metrics

### Current State
```
Total Lines:           ~3,500
Files:                 ~30
Functions:             ~80
Classes (Models):      5
Constants/Config:      ~15 major objects

Code Organization:     ⭐⭐⭐⭐ (well structured)
Documentation:         ⭐⭐⭐⭐⭐ (comprehensive)
Test Coverage:         ⭐⭐ (40%, needs improvement)
Error Handling:        ⭐⭐⭐ (good, can improve)
Performance:           ⭐⭐⭐⭐ (efficient, some optimization needed)
```

### Code Smells to Address
1. **Large battleState JSON:** Consider normalizing complex nested data
2. **AI placeholders:** Replace with real implementations
3. **Hard-coded constants:** Centralize in config file
4. **Limited error recovery:** Add more graceful degradation
5. **Test coverage gaps:** Add integration tests for complete battles

---

## Developer Onboarding Checklist

### Day 1: Setup & Understanding
- [ ] Clone repository
- [ ] Install dependencies (`npm install`)
- [ ] Create `.env` file with bot token
- [ ] Run `node src/index.js` to start bot
- [ ] Read Master Index (this document)
- [ ] Review Database Layer documentation

### Day 2: Core Systems
- [ ] Read Game Logic Layer documentation
- [ ] Understand combat mathematics
- [ ] Run `node src/checkDB.js` to inspect database
- [ ] Create test battle manually (console)
- [ ] Review movement and pathfinding

### Day 3: AI & Discord Integration
- [ ] Read AI Systems Layer documentation
- [ ] Understand cultural personalities
- [ ] Review Discord Bot Layer documentation
- [ ] Test commands in Discord server
- [ ] Build test army through UI

### Day 4: Testing & Contribution
- [ ] Review Workflows documentation
- [ ] Run existing tests
- [ ] Make small change (add cultural speech pattern)
- [ ] Debug a battle turn
- [ ] Read contribution guidelines

---

## Essential Keyboard Shortcuts & Commands

### Database Inspection
```bash
# Open SQLite database
sqlite3 data/cohort.db

# Useful queries
SELECT * FROM Commanders;
SELECT * FROM Battles WHERE status='in_progress';
SELECT * FROM VeteranOfficers WHERE isAlive=1;

# Count records
SELECT COUNT(*) FROM Battles;

# Exit
.quit
```

### Node Console Testing
```bash
node  # Start REPL

# Load components
const { models } = require('./src/database/setup');
const { Battle, Commander } = models;

# Query database
await Commander.findAll();

# Test function
const { parseCoord } = require('./src/game/maps/mapUtils');
parseCoord('F11');  // {row: 10, col: 5}
```

### Git Workflow
```bash
# Feature branch
git checkout -b feature/new-culture-addition

# Commit with meaningful message
git commit -m "Add Sassanid Persian culture with cataphract bonuses"

# Push for review
git push origin feature/new-culture-addition
```

---

## Emergency Hotfix Procedures

### Critical Bug in Production

**1. Identify Impact**
```javascript
// Check affected battles
const affected = await Battle.findAll({
  where: { 
    status: 'in_progress',
    updatedAt: { [Op.gt]: bugIntroducedDate }
  }
});
```

**2. Communicate with Players**
```javascript
// Notify all affected players
for (const battle of affected) {
  await notifyPlayers(battle, {
    title: '⚠️ System Maintenance',
    message: 'Battle paused temporarily for fix. No progress lost.',
    eta: '15 minutes'
  });
}
```

**3. Fix and Deploy**
```bash
# Hotfix branch
git checkout -b hotfix/critical-combat-bug

# Make minimal fix
# Test locally

# Deploy immediately
git push origin hotfix/critical-combat-bug
# Railway auto-deploys
```

**4. Verify and Resume**
```javascript
// Verify fix worked
const testResult = await processTurn(testBattle, ...);

// Resume affected battles
for (const battle of affected) {
  await notifyPlayers(battle, {
    title: '✅ System Restored',
    message: 'Battle resumed. Thank you for patience.'
  });
}
```

---

## Complete System Summary

### What Makes Cohort Unique

**1. Historical Authenticity**
- Every combat modifier grounded in research
- Cultural speech patterns from primary sources
- Weapon effectiveness from archaeological tests
- Environmental effects from documented battles

**2. Permanent Consequences**
- Named officers die permanently
- Tactical knowledge lost forever with deaths
- Veteran progression through hybrid math
- Heavy casualties truly hurt long-term

**3. AI-Powered Immersion**
- Mathematical combat → dramatic narratives
- Cultural officer personalities
- Historical battle parallels
- Contextual tactical advice

**4. Strategic Depth**
- 20×20 grid tactical positioning
- Fog of war intelligence limitations
- Terrain and weather matter decisively
- Multi-unit coordination required

**5. Accessibility**
- Entirely Discord-based (no downloads)
- Natural language orders (no command syntax)
- Visual army builder (no manual math)
- Progressive complexity (casual to hardcore)

### Technical Architecture Strengths

**Separation of Concerns:**
- Discord layer handles UI only
- Game logic is pure mathematics
- AI provides narrative and parsing
- Database manages persistence

**Modularity:**
- New cultures add easily
- New maps are self-contained
- Commands load dynamically
- AI providers swap transparently

**Scalability:**
- JSON battle state supports complexity
- Multi-provider AI manages costs
- Database optimized for reads
- Stateless turn processing

**Maintainability:**
- Clear file organization
- Comprehensive documentation
- Consistent naming conventions
- Well-defined interfaces

---

## Final Developer Notes

### When Adding Features

**1. Start with Research**
- Check project research documents
- Find historical precedent
- Determine authentic implementation

**2. Update Database First**
- Add fields to models if needed
- Run migration or reset dev DB
- Test with sample data

**3. Implement Game Logic**
- Write pure functions (no side effects)
- Add constants to appropriate file
- Test with unit tests

**4. Integrate with AI**
- Add cultural speech if needed
- Update officer personalities
- Test narrative generation

**5. Connect Discord UI**
- Add/update commands
- Create embeds and interactions
- Test user flow

**6. Document Everything**
- Update this documentation
- Add inline comments
- Create usage examples

### Code Review Checklist
- [ ] Historical accuracy verified
- [ ] Mathematical formulas documented
- [ ] Error handling comprehensive
- [ ] Database queries optimized
- [ ] Discord rate limits respected
- [ ] AI costs considered
- [ ] User experience smooth
- [ ] Documentation updated

---

This master index ties together all documentation artifacts and provides comprehensive navigation for developers working on any aspect of the Cohort ancient warfare system. All components are documented at function-level detail with clear integration patterns and practical examples.
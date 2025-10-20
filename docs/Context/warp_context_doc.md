# Cohort - Warp AI Context Document

**Project:** Cohort - Ancient Warfare Strategy Game  
**Platform:** Discord Bot (no external downloads)  
**Period:** 3000 BCE - 500 CE (pre-gunpowder ancient warfare)  
**Current Version:** v0.2.0 - Mission System Complete  
**Last Updated:** October 16, 2025

---

## 🎯 Project Vision

Create a Discord-based turn-based strategy game where players command ancient armies through **natural language orders**, with AI generating dramatic battle narratives from mathematical combat results. The game emphasizes:

- **Historical authenticity** over arbitrary game balance
- **Emotional investment** through named veteran officers with permanent death
- **Tactical depth** through realistic command limitations and fog of war
- **Elegant systems** where smart tactics overcome numerical superiority

**Core Philosophy:** "The math determines what happened, the AI tells you why it matters."

---

## 🏗️ Technical Architecture

### **Tech Stack:**
- **Discord.js v14** - Bot framework
- **Sequelize ORM** - Database (SQLite dev, PostgreSQL production)
- **Node.js** - Runtime
- **No AI connected yet** - Placeholder templates until AI integration

### **Repository:**
- GitHub: https://github.com/zpressley/cohort-discord-bot
- Raw files delay: 5-10 minutes after commit

### **File Structure:**
```
src/
├── ai/
│   ├── orderInterpreter.js - Natural language order parsing
│   ├── aiNarrativeEngine.js - Battle narrative generation
│   └── officerQA.js - Tactical question answering
├── bot/
│   ├── commands/ - Slash commands (/create-game, /build-army, etc.)
│   ├── dmHandler.js - Private battle command processing
│   └── interactionHandler.js - Discord event routing
├── game/
│   ├── battleEngine.js - Combat resolution
│   ├── turnOrchestrator.js - Master turn processing
│   ├── movementSystem.js - A* pathfinding, movement validation
│   ├── positionBasedCombat.js - Zone-based combat detection
│   ├── fogOfWar.js - Tiered visibility system
│   └── maps/ - Map definitions and utilities
└── database/
    ├── models/ - Sequelize models
    └── setup.js - Database initialization
```

---

## 🎮 How the Game Works

### **Turn Flow:**
1. **Player submits order** via DM: "cavalry advance to northern ford"
2. **Order interpretation** (orderInterpreter.js): Parse natural language → validated actions
3. **Mission system** (turnOrchestrator.js Phase 1.5): Auto-continue active missions
4. **Movement execution** (positionBasedCombat.js): Units move, missions created/updated
5. **Fog of war** (fogOfWar.js): Update visibility, detect enemies
6. **Combat resolution** (battleEngine.js): When units adjacent, calculate casualties
7. **State update** (turnOrchestrator.js): Save new positions, update database
8. **Narrative generation** (dmHandler.js): Send briefings with 4 sections

### **The 4-Section Briefing:**
```
YOUR FORCES:
[D5] 🔵 Professional Horses (100) - plains

INTELLIGENCE:
👁️ Enemy forces positioned on the hilltop at H2 (8 tiles away)

OFFICER REPORT:
"Enemy spotted, Commander. Legion stands ready."

MAP:
[Emoji-based tactical map with blue friendly, orange enemy]
```

---

## 🔑 Key Systems Explained

### **Mission System (MULTI-001) - ✅ COMPLETE**

**Problem Solved:** Units needed to move toward distant objectives over multiple turns automatically.

**How It Works:**
1. Player orders: "all units move to J11" (8 tiles away, unit has 5 movement)
2. Turn 1: Unit moves 5 tiles, **mission created** with target J11
3. Turn 2: Player says "hold" → Phase 1.5 **auto-continues mission** → moves 3 more tiles
4. Turn 3: Unit reaches J11 → **mission marked complete**

**Implementation:**
- **Mission Creation:** `positionBasedCombat.js` - When `validation.partialMovement === true`
- **Mission Storage:** Unit's `activeMission` field in database
- **Auto-Continuation:** `turnOrchestrator.js` Phase 1.5 - Checks all units for active missions
- **Completion Detection:** When `unit.position === mission.target`

**Key Files:**
- `src/ai/orderInterpreter.js` - "hold" returns empty actions (lets Phase 1.5 handle)
- `src/game/turnOrchestrator.js` - Phase 1.5 mission continuation logic
- `src/game/positionBasedCombat.js` - Mission creation on partial movement

---

### **Natural Language Order Parsing**

**Philosophy:** Players shouldn't memorize rigid commands. Parse intent from natural language.

**Supported Patterns:**
```javascript
// Coordinate-based
"move to J11" → Move to specific tile
"advance to ford" → Move to landmark

// Direction-based  
"move south" → Move 3 tiles south
"cavalry north" → Only cavalry moves north

// Unit targeting
"all units move to E5" → Both units target E5
"cavalry advance, infantry hold" → Split orders
"unit at F5 move east" → Specific unit by position
"northern unit hold" → Directional unit selection

// Mission control
"hold" → Auto-continue active missions
"continue mission" → Explicit continuation
"stop" → Actually stop (cancel missions)
```

**Implementation:** `src/ai/orderInterpreter.js`
- `determineTargetUnits()` - Filters units by keywords
- `callAIForOrderParsing()` - Main parsing logic
- `splitMultipleOrders()` - Handles comma-separated commands

---

### **Fog of War System**

**Tiered Visibility:**
- **Spotted (8 tiles):** "Enemy movement detected"
- **Identified (5 tiles):** "Enemy cavalry, ~100 strong"
- **Detailed (3 tiles):** "Enemy: 87 veteran heavy infantry, defensive formation"

**Modifiers:**
- Clear: Full range
- Light rain: -1 tile
- Heavy rain/fog: -2 tiles
- Forest: -2 tiles

**Implementation:** `src/game/fogOfWar.js`
- Each unit calculates what IT can see (not omniscient commander)
- Enemy only appears in briefing if within detection range
- Distance-based detail level for intelligence reports

---

## 🎲 Combat System (Current → Future)

### **Current System (Being Replaced):**
- Ratio-based: Attacker/Defender strength ratio determines casualties
- Works but not intuitive: "What does 1.4 ratio mean?"

### **New System (CMB-001 through CMB-014):**

**Formula:**
```javascript
// 1. Base damage
baseDamage = attacker.attack - defender.defense

// 2. Battlefield chaos (0-10)
chaosLevel = terrain + weather + density + situation
// Forest(+2) + Fog(+3) + Compressed(+3) = Chaos 8

// 3. Chaos roll
chaosRoll = random(1, chaosLevel) // 1d8
rawChaos = chaosRoll - (chaosLevel/2) // Centers around 0

// 4. Preparation negates chaos
attackerChaos = max(0, rawChaos - attacker.preparation)
defenderChaos = max(0, rawChaos - defender.preparation)

// 5. Apply chaos penalties
effectiveAttack = attack - attackerChaos
effectiveDefense = defense - defenderChaos

// 6. Final damage
damage = effectiveAttack - effectiveDefense
casualties = max(0, damage) * (strength/100) * 5
```

**Key Insight:** Preparation (formations, experience, defensive positions) **negates chaos**. High chaos hurts unprepared forces, prepared forces ignore it.

**Example - Baldwin IV at Montgisard (1177):**
- Chaos 8 (sandstorm)
- Templars: Preparation 10 (formed, experienced) → Chaos 0 (immune!)
- Saracens: Preparation 2 (marching column) → Chaos 6 (devastated!)

---

## 📏 Map & Scale System

### **Grid:**
- **Size:** 20×20 tiles (expandable to 20×30 or 25×20)
- **Scale:** 50 meters per tile = 1km × 1km battlefield
- **Coordinates:** A1 (top-left) to T20 (bottom-right)

### **Movement:**
- Infantry: 3 tiles per turn (150m)
- Cavalry: 5 tiles per turn (250m)
- Terrain costs: Plains 1, Road 0.5, Hill 1.5, Forest 2, Marsh 3

### **Vision:**
- Standard: 3 tiles (150m) - dust and chaos limit visibility
- Scouts: 5 tiles (250m)
- Elevated: +2 tiles

---

## 🗂️ Database Models

### **Commander**
```javascript
{
  discordId: PRIMARY KEY,
  username: string,
  culture: string (selected civilization),
  armyComposition: JSON (30 SP build),
  victories: integer,
  defeats: integer,
  reputation: integer
}
```

### **Battle**
```javascript
{
  id: UUID,
  player1Id: FK Commander,
  player2Id: FK Commander,
  scenario: string (river_crossing, hill_fort, etc.),
  status: enum (waiting, in_progress, completed),
  currentTurn: integer,
  weather: string (clear, rain, fog, etc.),
  battleState: JSON {
    player1: {
      unitPositions: [{
        unitId, position, currentStrength, 
        mounted, activeMission, ...
      }],
      visibleEnemyPositions: [coords],
      morale, supplies
    },
    player2: { ... same structure }
  }
}
```

### **BattleTurn**
```javascript
{
  battleId: FK,
  turnNumber: integer,
  player1Command: text (natural language order),
  player2Command: text,
  aiResolution: text (narrative),
  // Future: chaosLevel, attackerPrep, defenderPrep
}
```

---

## 🎨 Design Principles

### **1. Math First, AI Second**
- Hard-coded mechanics determine outcomes
- AI provides narrative flavor and handles edge cases
- Never let AI override mathematical results

### **2. Historical Authenticity Over Game Balance**
- Sarissa pikes SHOULD dominate cavalry on plains
- War elephants SHOULD terrify unprepared troops
- But terrain/weather/tactics can overcome any advantage

### **3. Elegant Over Complex**
- Prefer simple systems that interact interestingly
- Avoid feature creep and arbitrary rules
- Every mechanic grounded in historical reality

### **4. Permanent Consequences**
- Officer death = lost tactical knowledge forever
- Equipment becomes unit relics with history
- No save-scumming or rerolls

### **5. Natural Language Everything**
- Orders: "cavalry flank left, infantry hold the ford"
- Questions: "What's beyond that hill?"
- Responses: Culturally appropriate officer commentary

---

## 🚨 Critical Rules for AI Assistants

### **When Helping With Code:**

1. **Always check file versions** - Look for version headers at top
2. **Ask before major changes** - User wants to review approach first
3. **Provide complete functions** - Not snippets that might break context
4. **Include file names** - Specify exactly where changes go
5. **Show old vs new** - When replacing code, show what's being replaced

### **When Fixing Bugs:**

1. **Trace through logs** - Understand root cause before proposing fixes
2. **Check GitHub raw files** - Remember 5-10 min delay after commits
3. **Use established patterns** - Don't invent new architectures mid-stream
4. **Test incrementally** - One fix at a time when possible

### **Current Development Pattern:**

```
User: [Describes issue or goal]
AI: [Analyzes codebase, asks clarifying questions]
User: [Provides context or confirms approach]
AI: [Proposes specific solution with file/function names]
User: [Reviews and approves]
AI: [Provides complete implementation]
User: [Tests and reports results]
```

This saves tokens and prevents circular debugging!

---

## 🔧 Current Technical Status

### **What's Working:**
- ✅ 20×20 grid with A* pathfinding
- ✅ Natural language order parsing
- ✅ Multi-unit armies (tested with 2 units)
- ✅ Mission persistence across turns
- ✅ Auto-continuation when "hold" ordered
- ✅ Position-based targeting ("unit at F5")
- ✅ Directional targeting ("northern unit")
- ✅ Unit type targeting ("cavalry", "infantry")
- ✅ Comma-separated orders ("cavalry north, infantry east")
- ✅ Fog of war with tiered intelligence
- ✅ Emoji-based tactical maps (blue friendly, orange enemy)

### **Known Issues:**
- ⚠️ "units move to X" doesn't target all units (MULTI-002)
- ⚠️ Discord interaction timeouts on long turns (test command issue)
- ⚠️ Combat uses old ratio system (being replaced with CMB-001 through CMB-014)

### **Next Priorities:**
1. Quick fix: MULTI-002 (add "units" keyword - 15 min)
2. Major rewrite: Combat System v2.0 (15-20 hours across 14 tasks)

---

## 📝 Code Standards

### **File Headers:**
```javascript
// src/game/exampleFile.js
// Brief description of file purpose
// 
// Last Updated: YYYY-MM-DD
// Version: X.Y.Z
// Dependencies: list, of, dependencies
```

### **Function Documentation:**
```javascript
/**
 * Brief description
 * @param {Type} paramName - Description
 * @returns {Type} Description
 */
function exampleFunction(paramName) {
    // Implementation
}
```

### **Logging Standards:**
- **Keep:** Phase headers (`🎲 TURN X ORCHESTRATION`)
- **Keep:** Summaries (`✅ Turn complete - Movements: 2, Combat: 1`)
- **Keep:** All errors
- **Remove:** Verbose DEBUG blocks with full JSON dumps
- **Remove:** Step-by-step validation logging

### **Testing Approach:**
- Use `/test-submit-both` for rapid iteration
- Test cases defined in test commands
- Incremental testing preferred (one fix, test, next fix)

---

## 🎖️ Game Design Core Concepts

### **Supply Points (SP) System:**
- Players build armies with 30 SP budget
- Troops cost 1 SP per 100 men (Professional = 10 SP = 100 men)
- Equipment upgrades cost additional SP
- Support staff (engineers, medics) cost SP

### **20 Ancient Civilizations:**
Each with unique elite units, cultural bonuses, and restrictions:
- Roman Republic: Engineering, tactical flexibility
- Spartan City-State: Fight to last man, elite infantry
- Han Dynasty: Crossbow mastery, coordination
- Scythian: Horse archery, feigned retreats
- Celtic: Berserker fury, individual heroics
- (15 more with distinct traits)

### **Battle Scale:**
- 300-600 warriors per army (authentic ancient battle size)
- 8-12 named officers per elite unit (individual death tracking)
- 1km × 1km battlefields (20×20 grid)
- 8-15 turn engagements typical

---

## 🎯 Current Sprint: Combat System v2.0

**Goal:** Replace ratio-based combat with chaos-modified attack/defense system.

**Why:** 
- Attack/Defense numbers clearer than ratios at a glance
- Chaos modifier adds battlefield unpredictability
- Preparation rewards tactical planning
- Historical parallel: Baldwin IV's 500 Templars defeating 26,000 Saracens in sandstorm (prepared vs unprepared in high chaos)

**Implementation Tasks:**
1. **CMB-001:** Define attack/defense rating tables (weapons, armor, training)
2. **CMB-002:** Build chaos calculator (terrain, weather, density → chaos 0-10)
3. **CMB-003:** Build preparation calculator (formations, experience → preparation 0-15)
4. **CMB-004:** Rewrite combat engine with new formula
5. **CMB-005:** Add damage accumulation (negative damage carries forward)
6. **CMB-006:** Balance testing across scenarios
7. (Plus 8 more polish/integration tasks)

**Estimated:** 15-20 hours total

---

## 📖 Historical Research Foundation

The game is built on extensive historical research:

- **Weapon effectiveness matrices** from documented battles
- **Environmental warfare** - how weather/terrain decided outcomes
- **Formation mechanics** - why phalanx dominated cavalry frontally
- **Cultural military traditions** - authentic fighting styles and restrictions

**Example Research Insights:**
- Macedonian sarissa pikes: 18-21 feet, 5 rows of spearpoints = impenetrable vs cavalry
- Composite bows: 300m range, 50-80% effectiveness loss when wet
- Heavy armor: 2.1× energy expenditure in heat
- Teutoburg Forest: Rain + forest = complete Roman tactical failure

All mechanics grounded in real ancient warfare, not fantasy RPG tropes.

---

## 🤝 Working With This Codebase

### **Before Making Changes:**

1. **Check current file version** - Look for version header
2. **Review related systems** - Changes often affect multiple files
3. **Understand data flow** - Order → Interpret → Move → Combat → Narrative
4. **Check task dependencies** - Some tasks require others complete first

### **When Implementing Features:**

1. **Follow established patterns:**
   - Use existing functions (parseCoord, calculateDistance, etc.)
   - Match naming conventions (camelCase, descriptive names)
   - Maintain separation of concerns (AI interprets, mechanics resolve)

2. **Add appropriate logging:**
   - Phase markers for major steps
   - Errors always logged
   - Success confirmations
   - Avoid verbose dumps

3. **Update multiple layers:**
   - Game logic (src/game/)
   - Discord interface (src/bot/)
   - Database models if needed (src/database/)
   - Documentation (comments, task list)

### **Testing Checklist:**

- [ ] Does it work with 1 unit? 2 units? 10 units?
- [ ] Does it handle edge cases (no enemies, blocked paths, etc.)?
- [ ] Does it work across multiple turns?
- [ ] Does it persist properly to database?
- [ ] Does it generate good narratives?

---

## 🎪 Example Battle Flow

**Turn 1:**
```
Player: "all units advance to the ford"
System: Creates missions for both units (ford 8 tiles away)
Unit 1: Moves 5 tiles (cavalry) → mission to ford
Unit 2: Moves 3 tiles (infantry) → mission to ford
Briefing: Shows units at new positions with active missions
```

**Turn 2:**
```
Player: "hold"
Phase 1.5: Detects active missions, auto-continues
Unit 1: Moves 3 more tiles → reaches ford, mission complete
Unit 2: Moves 3 more tiles (still 2 away from ford)
Fog of War: Cavalry at ford spots enemy 6 tiles away
Briefing: "Cavalry reached ford. Enemy detected 6 tiles north."
```

**Turn 3:**
```
Player: "cavalry hold the ford, infantry continue"
Unit 1: Holds position (explicit order overrides mission)
Unit 2: Auto-continues mission → reaches ford
Fog of War: Both units now see enemy clearly (5 tiles)
Officer: "Enemy heavy infantry advancing! They outnumber us 2:1. Orders?"
```

**Turn 4:**
```
Player: "both units defensive formation"
Combat: Enemy reaches ford, attacks
Chaos: 3 (ford terrain + unit density)
Preparation: Player +6 (formation + defensive position), Enemy +2
Result: Chaos hurts enemy more, player holds ford despite being outnumbered
```

---

## 🚀 Getting Started with Development

### **For New Features:**

1. **Check task list** - Find relevant task (CMB-001, etc.)
2. **Read dependencies** - Complete prerequisite tasks first
3. **Review related code** - Understand existing patterns
4. **Propose approach** - User reviews before implementation
5. **Implement completely** - Full functions, not partial changes
6. **Test thoroughly** - Multiple scenarios
7. **Update task list** - Mark complete, note any issues

### **For Bug Fixes:**

1. **Reproduce the bug** - Understand exact symptoms
2. **Trace through code** - Find root cause
3. **Propose minimal fix** - Don't refactor unnecessarily
4. **Test fix** - Verify it works
5. **Check for side effects** - Did it break anything else?

### **For Questions:**

User prefers:
- Specific questions over vague "tell me more"
- Code examples over abstract explanations
- Historical context when relevant to game design
- Clear file/function names when discussing code

---

## 🎯 Success Metrics

**Definition of "Playable":**
- [ ] Two players can create and join battle
- [ ] Both players submit natural language orders
- [ ] Units move realistically toward objectives over multiple turns
- [ ] Combat resolves with historical authenticity
- [ ] AI generates engaging narratives
- [ ] Battles conclude with victory conditions
- [ ] Officers provide tactical advice
- [ ] Missions auto-continue intelligently

**We're at ~70% playable** - mission system complete, combat system next!

---

## 📞 Quick Reference

**GitHub Repo:** https://github.com/zpressley/cohort-discord-bot  
**Task List Artifact:** See conversation for current TASK_LIST.md  
**Test Command:** `/test-submit-both player1-order:"X" player2-order:"Y"`  
**Bot Restart:** `nodemon` watches for changes, auto-restarts  

**Key Commands for Testing:**
- `/create-game` - Start battle
- `/test-join` - Add AI opponent
- `/test-submit-both` - Submit orders for both players
- DM the bot - Send orders during real battle

---

**Ready to build! Current focus: Combat System v2.0 starting with CMB-001 (rating tables).**

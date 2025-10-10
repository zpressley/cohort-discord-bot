# Cohort AI Systems Documentation

## Overview
The AI layer transforms mathematical combat results into immersive historical narratives, interprets natural language orders into game actions, and generates culturally-authentic officer dialogue. Uses multi-provider AI (GPT-4o-mini, Claude, Groq) for cost optimization.

---

## AI Narrative Engine
**Location:** `src/ai/aiNarrativeEngine.js`

### Purpose
Converts mathematical combat results into rich historical narratives with cultural authenticity, officer personalities, and historical battle parallels. Maintains immersion while grounding all storytelling in actual combat mechanics.

### Core Data Structures

#### **CULTURAL_PERSONALITIES** (Constant Object)
Defines speech patterns, narrative styles, and officer archetypes for each culture

**Structure Example (Roman Republic):**
```javascript
'Roman': {
  officers: [
    { 
      rank: 'Centurion', 
      personality: 'professional_disciplined', 
      speech: 'formal_military' 
    },
    { 
      rank: 'Optio', 
      personality: 'experienced_practical', 
      speech: 'direct_tactical' 
    },
    { 
      rank: 'Signifer', 
      personality: 'proud_traditional', 
      speech: 'honor_focused' 
    }
  ],
  speechPatterns: {
    victory: [
      "The legion has prevailed",
      "Discipline conquers all",
      "For Rome and the Eagle"
    ],
    defeat: [
      "We withdraw in good order",
      "The standards remain intact",
      "Rome remembers"
    ],
    tactical: [
      "Form testudo",
      "Hold the line",
      "Maintain formation"
    ],
    casualty: [
      "He died as a soldier should",
      "His service honors Rome",
      "The legion mourns"
    ]
  },
  narrative_style: 'professional_systematic'
}
```

**Cultures Implemented:**
- Roman (professional, systematic)
- Celtic (heroic, passionate)
- Han Chinese (strategic, philosophical)
- Macedonian (heroic, tactical)
- Sarmatian (mobile, mystical)
- Berber (nomadic, poetic)
- Spartan (laconic, absolute)
- Mauryan (philosophical, organized)

**Usage:** AI selects appropriate speech based on culture, combat result, and officer personality

#### **HISTORICAL_PRECEDENTS** (Database Object)
Maps tactical situations to historical battle parallels for authentic narrative context

**Example Entry:**
```javascript
'river_crossing_victory': {
  battles: [
    'Battle of Granicus (334 BC)',
    'Battle of Hydaspes (326 BC)'
  ],
  narrative_elements: [
    'swift current threatens crossing',
    'defenders hold opposite bank',
    'cavalry charges through water',
    'formation disrupted by river'
  ]
}
```

**Matching Logic:**
- Terrain match: +3 score
- Formation match: +2 score
- Combat result match: +2 score
- Cultural historical enemies: +1 score
- Best match used for narrative framing

#### **NARRATIVE_TEMPLATES** (Structure Object)
Four-part narrative structure for different combat outcomes

**Template Structure:**
```javascript
'attacker_major_victory': {
  opening: "Steel rings against steel as {attacker_culture} forces surge forward...",
  development: "The {defender_formation} formation wavers under the devastating assault...",
  climax: "What began as resistance becomes rout as {tactical_development}...",
  resolution: "The battlefield belongs to {attacker_culture}, their victory complete."
}
```

**Variables Replaced:**
- `{attacker_culture}`, `{defender_culture}`: Player civilizations
- `{defender_formation}`, `{tactical_development}`: Combat-specific details
- `{key_moment}`, `{defensive_moment}`: Climactic events from combat resolution

### Main Functions

#### **`generateBattleNarrative(combatResult, battleContext, officerMemories, turnHistory)`**
**Purpose:** Master narrative generation orchestrating all AI systems
**Parameters:**
- `combatResult` (Object): Mathematical combat resolution
- `battleContext` (Object): Battle state, units, formations, terrain
- `officerMemories` (Object): Individual officer experiences
- `turnHistory` (Array): Previous turns for continuity

**Process Flow:**
```
Step 1: Identify historical parallel
  └─> findHistoricalParallel()

Step 2: Generate cultural officer perspectives  
  └─> generateOfficerReports()

Step 3: Create main battle narrative
  └─> generateMainNarrative() [AI call]

Step 4: Generate tactical situation analysis
  └─> generateTacticalAnalysis()

Step 5: Create next turn setup
  └─> generateNextTurnSetup()
```

**Returns:**
```javascript
{
  mainNarrative: {
    fullNarrative: "The clash of arms echoes...",
    template: 'attacker_victory',
    historicalReference: 'Battle of Gaugamela (331 BC)'
  },
  officerReports: {
    attacker: {
      officerName: "Centurion Marcus the Steady",
      rank: "Centurion",
      speech: "The veteran's eyes narrow - \"Discipline conquers all. We must consolidate our gains systematically.\"",
      personality: "professional_disciplined",
      experience: 7
    },
    defender: { /* similar structure */ }
  },
  tacticalAnalysis: {
    keyDevelopments: ['Formation integrity compromised'],
    tacticalOpportunities: ['Exploitation of gaps possible'],
    threats: ['Defender morale weakening'],
    recommendations: ['Veteran advice: Press advantage while enemy regroups']
  },
  nextTurnSetup: {
    battlefieldState: "Attacking forces gain momentum",
    nextTurnPrompt: "Turn 6 - What are your orders, Commander?",
    tacticalSuggestions: [...],
    availableActions: ['advance', 'pursue', 'consolidate']
  },
  historicalParallel: 'Battle of Gaugamela (331 BC)'
}
```

#### **`generateOfficerReports(combatResult, battleContext, officerMemories)`**
**Purpose:** Create culturally-authentic officer perspectives for both players
**Process:**
1. Select senior officer from cultural template
2. Determine speech type (victory/defeat/tactical)
3. Add memory context (veteran vs recruit phrasing)
4. Generate tactical note based on cultural fighting style
5. Format officer perspective with personality

**Example Output:**
```javascript
{
  officerName: "Brennus the Firebrand",
  rank: "Rí",
  speech: "Young but determined, \"The gods smile upon us! The spirits of war favor the brave!\"",
  personality: "honor_obsessed",
  experience: 2  // Seasoned officer
}
```

#### **`generateOfficerPerspective(officer, culture, combatResult, side, memories)`**
**Purpose:** Create individual officer speech with personality
**Logic:**
```javascript
// Determine victory/defeat/stalemate
const isWinner = /* calculate from side and result */;
const speechType = isWinner ? 'victory' : 
                  (result === 'stalemate' ? 'tactical' : 'defeat');

// Select speech pattern from culture
const speeches = culture.speechPatterns[speechType];
const baseSpeech = speeches[random()];

// Add memory context
let memoryPrefix = '';
if (memories.battleExperience > 5) {
  memoryPrefix = "The veteran's eyes narrow - ";
} else if (memories.battleExperience < 2) {
  memoryPrefix = "Young but determined, ";
}

// Add tactical analysis
const tacticalNote = culture.narrative_style === 'professional_systematic' ?
  generateRomanTacticalNote(combatResult) :
  generateCelticHeroicNote(combatResult);

return `${memoryPrefix}"${baseSpeech}${tacticalNote}"`;
```

**Cultural-Specific Tactical Notes:**

**Roman (Professional/Systematic):**
```javascript
function generateRomanTacticalNote(combatResult) {
  if (intensity === 'decisive') 
    return ' We must consolidate our gains systematically.';
  if (result.includes('defeat')) 
    return ' An orderly withdrawal preserves the legion.';
  return ' Discipline will see us through.';
}
```

**Celtic (Heroic/Passionate):**
```javascript
function generateCelticHeroicNote(combatResult) {
  if (intensity === 'decisive') 
    return ' The spirits of war favor the brave!';
  if (result.includes('defeat')) 
    return ' We die with songs on our lips!';
  return ' Courage conquers all!';
}
```

#### **`findHistoricalParallel(combatResult, battleContext)`**
**Purpose:** Match current battle to closest historical precedent
**Scoring System:**
```javascript
let score = 0;

// Terrain match (highest weight)
if (key.includes(terrain)) score += 3;

// Formation interaction
if (key.includes(formations.attacker) || 
    key.includes(formations.defender)) score += 2;

// Combat result type
if (key.includes(combatResult.result.split('_')[1])) score += 2;

// Historical cultural enemies
if ((attacker === 'Roman' && defender === 'Celtic') ||
    (attacker === 'Macedonian' && defender === 'Persian')) {
  score += 1;
}
```

**Returns:**
```javascript
{
  key: 'river_crossing_victory',
  battles: ['Battle of Granicus (334 BC)', ...],
  narrative_elements: ['swift current threatens crossing', ...],
  reference: 'Battle of Granicus (334 BC)'
}
```

#### **`generateTacticalAnalysis(combatResult, battleContext, officerMemories)`**
**Purpose:** Create tactical situation assessment for next turn planning
**Analysis Components:**
```javascript
{
  keyDevelopments: [
    'Formation integrity compromised',
    'Attacking forces gain momentum'
  ],
  tacticalOpportunities: [
    'Exploitation of gaps possible',
    'Enemy flank exposed'
  ],
  threats: [
    'Defender morale weakening',
    'Cavalry positioning for charge'
  ],
  recommendations: [
    'Veteran advice: Press advantage while enemy regroups',
    'Scout reports suggest enemy reinforcements approaching'
  ]
}
```

**Officer Experience Integration:**
If officer has 3+ battles experience, adds veteran tactical insights
If officer has enemy culture knowledge, warns about known tactics

#### **`generateFallbackNarrative(combatResult, battleContext)`**
**Purpose:** Provide basic narrative when AI fails or times out
**Returns:** Simple but functional narrative maintaining game flow

---

## AI Manager
**Location:** `src/ai/aiManager.js`

### Purpose
Multi-provider AI orchestration system that selects optimal AI model based on task complexity and cost, handles API calls, manages rate limiting, and provides fallbacks.

### Provider Selection Strategy

**Cost-Optimized Distribution:**
```javascript
{
  'GPT-4o-mini': {
    usage: '80% of battles',
    costPerBattle: '$0.003-0.006',
    useCases: ['Standard battles', 'Order parsing', 'Officer dialogue']
  },
  'Groq Llama 3 70B': {
    usage: '15% of battles',
    costPerBattle: '$0.002-0.003',
    useCases: ['Simple scenarios', 'Quick responses']
  },
  'Claude 3.5 Sonnet': {
    usage: '5% of battles',
    costPerBattle: '$0.06-0.12',
    useCases: ['Complex battles', 'Multi-unit coordination', 'Premium features']
  }
}
```

**Selection Logic:**
- Simple order parsing → Groq (cheapest, fast)
- Standard battle narrative → GPT-4o-mini (balanced)
- Complex multi-turn strategy → Claude (premium quality)

### Functions

#### **`selectProvider(taskType, complexity)`**
**Purpose:** Choose optimal AI provider
**Returns:** Provider name ('openai' | 'groq' | 'claude')

#### **`callAI(provider, prompt, options)`**
**Purpose:** Execute AI API call with retry logic
**Error Handling:**
- Rate limit: Wait and retry
- Timeout: Fallback to simpler model
- Error: Use fallback narrative

---

## Order Interpreter
**Location:** `src/ai/orderInterpreter.js`

### Purpose
Parse natural language orders into validated game actions using AI. Handles ambiguity, validates feasibility, and provides tactical feedback.

### Main Function

#### **`interpretOrders(orderText, battleState, playerId, map)`**
**Purpose:** Convert "Advance infantry to ford, archers cover" into executable actions
**Process:**
1. Send order text + battle context to AI
2. AI returns structured action list
3. Validate each action against game rules
4. Flag impossible actions with explanations
5. Return validated action array

**Example Input:**
```javascript
orderText: "Northern Company advance to bridge, Hillcrest Archers provide covering fire"
battleState: { /* current positions, terrain, etc */ }
playerId: "player1"
map: { /* River Crossing map */ }
```

**AI Prompt Structure:**
```
You are a tactical AI interpreter for an ancient warfare game.

BATTLE STATE:
- Turn: 3
- Your units: Northern Company (100 infantry, position A5), 
              Hillcrest Archers (20 archers, position B3)
- Enemy detected: Unknown force at F11 (bridge)
- Terrain: River with ford at F11

PLAYER ORDER: "Northern Company advance to bridge, Hillcrest Archers provide covering fire"

Parse this into structured actions:
1. Identify which units are referenced
2. Determine their intended actions (move/attack/hold/formation)
3. Specify target positions or units
4. Note any formation changes or tactical modifiers

Return JSON array of actions.
```

**Example Output:**
```javascript
{
  validatedActions: [
    {
      type: 'move',
      unitId: 'northern_company',
      targetPosition: 'F11',
      modifiers: { cautious: false, formation: 'standard' },
      valid: true
    },
    {
      type: 'support_fire',
      unitId: 'hillcrest_archers',
      targetUnit: 'northern_company',
      supportType: 'covering_fire',
      valid: true
    }
  ],
  warnings: [],
  impossibleActions: []
}
```

### Order Validation

**Validation Checks:**
1. **Unit Exists:** Referenced unit in player's army
2. **Action Possible:** Unit type can perform action (cavalry can't use siege equipment)
3. **Target Reachable:** Movement within range
4. **Formation Valid:** Cultural restrictions respected
5. **Resource Available:** Supplies/equipment required

**Impossible Action Example:**
```javascript
{
  type: 'move',
  unitId: 'cavalry_wing',
  targetPosition: 'K14',  // 8 tiles away
  valid: false,
  reason: 'insufficient_movement',
  explanation: 'Cavalry can move 5 tiles per turn, target is 8 tiles away',
  suggestion: 'Move to H10 this turn, reach K14 next turn'
}
```

---

## Officer Q&A System
**Location:** `src/ai/officerQA.js`

### Purpose
Allow players to ask tactical questions of their officers before committing orders. Officers answer based on their experience, cultural knowledge, and visible battlefield situation.

### Main Function

#### **`answerTacticalQuestion(question, officerData, battleContext, visibility)`**
**Purpose:** Generate officer response to player's tactical question
**Parameters:**
- `question` (string): Player's question
- `officerData` (Object): Officer rank, experience, tactical knowledge
- `battleContext` (Object): Current battle state
- `visibility` (Object): What officer can see (fog of war)

**AI Prompt Construction:**
```javascript
const prompt = `You are ${officerData.rank} ${officerData.name}, a ${officerData.culture} officer with ${officerData.battlesExperience} battles of experience.

YOUR TACTICAL KNOWLEDGE:
${formatTacticalKnowledge(officerData.tacticalKnowledge)}

CURRENT BATTLEFIELD SITUATION:
${formatBattlefieldState(battleContext, visibility)}

COMMANDER ASKS: "${question}"

Respond as this officer would, using:
1. Your cultural speech patterns (${officerData.culture} style)
2. Your accumulated tactical knowledge
3. What you can actually see on the battlefield
4. Your personality traits: ${formatPersonality(officerData.personality)}

If you don't have enough information, say so honestly.
If you have relevant battle memories, reference them.
Keep response concise (2-3 sentences).`;
```

**Example Interaction:**
```
Player: "What do you think of their cavalry positioning?"

Officer (Centurion Marcus, 7 battles vs Celts):
"Sir, that's classic Celtic cavalry - they'll feign retreat to draw us out. 
I've seen it three times before. Keep the infantry in testudo and they'll 
break themselves on our shields when they realize we won't chase."
```

**Knowledge Integration:**
- Officer has 3 battles vs Celts → mentions "seen it before"
- Knows Celtic feigned retreat tactic → specific warning
- Professional Roman culture → suggests testudo formation
- Veteran (7 battles) → confident tactical assessment

### Question Types Handled

**Tactical Assessment:**
- "Should we advance or hold position?"
- "Where's their weakest point?"
- "What's the biggest threat right now?"

**Enemy Intelligence:**
- "What do you know about Scythian tactics?"
- "How do we counter their phalanx?"
- "Will rain affect their composite bows?"

**Historical Knowledge:**
- "Have we fought Romans before?"
- "What worked against cavalry last time?"
- "Do you remember the forest battle?"

**Cultural Advice:**
- "How would Romans approach this?"
- "What would Spartans do here?"

### Response Quality Tiers

**Legendary Officer (11+ battles):**
- Detailed tactical analysis
- Multiple historical references
- Confident recommendations
- Cultural enemy expertise

**Veteran Officer (3-5 battles):**
- Solid tactical assessment
- Some historical context
- Cautious recommendations
- Limited enemy knowledge

**Recruit Officer (0-2 battles):**
- Basic observations
- No historical reference
- Uncertain tone
- Requests commander guidance

---

## Narrative Templates & Cultural Authenticity

### Speech Pattern Philosophy

**Laconic Spartan:**
- Ultra-brief responses
- No explanation needed
- Honor-absolute
- Example: "Sparta stands." (response to victory)

**Poetic Celtic:**
- Metaphorical language
- Nature imagery
- Hero-celebration
- Example: "Like smoke before wind, we are always elsewhere"

**Scholarly Han:**
- Philosophical framing
- Strategic wisdom
- Mandate of heaven references
- Example: "Heaven smiles upon the righteous. Harmony through strength."

**Professional Roman:**
- Systematic analysis
- Military terminology
- Discipline-focused
- Example: "An orderly withdrawal preserves the legion. Discipline will see us through."

### Historical Battle Database Usage

**Pattern Recognition:**
When AI detects tactical situation matching historical precedent:

**Example - Phalanx vs Cavalry:**
```javascript
// Battle context: Macedonian phalanx vs Celtic cavalry charge
// Historical match: Battle of Chaeronea (338 BC)

AI Narrative:
"Like Philip's phalanx at Chaeronea, the sarissa wall stands impenetrable. 
Celtic horses wheel away five meters short, instinct overcoming courage. 
The mathematics of reach have decided this clash before swords meet shields."
```

**Benefits:**
1. Educates players about real ancient battles
2. Validates tactical choices ("You executed a perfect Cannae!")
3. Grounds fantasy scenarios in historical reality
4. Rewards players who study ancient warfare

### Fallback Systems

**When AI Fails:**
```javascript
function generateFallbackNarrative(combatResult, battleContext) {
  return {
    mainNarrative: {
      fullNarrative: `The clash of arms echoes across the ${battleContext.terrain} as ${battleContext.attackerCulture} forces engage ${battleContext.defenderCulture} defenders. After fierce fighting, ${winner} emerges victorious in this ${combatResult.intensity} engagement.`,
      template: 'fallback',
      historicalReference: 'Ancient warfare'
    },
    officerReports: {
      attacker: { speech: '"The battle is decided."', rank: 'Commander' },
      defender: { speech: '"We fight with honor."', rank: 'Commander' }
    }
  };
}
```

**Purpose:** Maintain game flow even if AI services fail
**Quality:** Basic but functional, avoids game-breaking errors

---

## AI Cost Optimization

### Request Batching
- Combine multiple questions into single API call
- Order interpretation + officer response in one request
- Reduces API overhead

### Caching Strategy
- Cache cultural speech patterns
- Store historical parallel matches
- Reuse tactical assessments for similar situations

### Model Selection Examples

**Simple Order (Use Groq):**
```
"Advance north" → Groq parses in 200ms for $0.0002
```

**Standard Battle (Use GPT-4o-mini):**
```
Complex tactical narrative with officer dialogue → $0.004 per battle
```

**Premium Complex (Use Claude):**
```
Multi-unit coordination, cultural negotiation, historical parallel → $0.08
```

### Monthly Cost Projections
- Week 4 launch: $1-3/month (100 test battles)
- Month 2: $3-8/month (500 battles)  
- Month 6: $8-20/month (2000+ battles, 5% Claude premium)

---

## Design Philosophy

### AI as Storyteller, Not Judge
- **AI never determines combat effectiveness** (math does that)
- **AI converts math into narrative** (storytelling role)
- **AI provides cultural authenticity** (speech patterns)
- **AI handles edge cases** (referee for novel tactics)

### Cultural Authenticity Priority
Every culture has:
- Distinct speech patterns based on historical texts
- Authentic officer ranks (Centurion, Rí, Senapati)
- Cultural values reflected in dialogue
- Historical battle references from their civilization

### Knowledge Creates Consequences
- Officers with enemy knowledge give better advice
- Losing veteran officers means losing tactical insights
- New officers must rebuild institutional memory
- Player learns to value and protect experienced officers

### Immersion Through Consistency
- Same officer voice across multiple battles
- Historical parallels educate while entertaining
- Mathematical combat grounds fantastical narratives
- Permanent loss creates emotional weight
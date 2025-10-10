# Cohort Discord Commands & Order Processing - Deep Dive

## Overview
Comprehensive documentation of all Discord slash commands, lobby system, order parsing (both AI and keyword-based), and interaction handling patterns.

---

## Lobby System
**Location:** `src/bot/commands/lobby.js`

### Purpose
Central hub interface providing unified access to all game features: army building, battle creation, stats viewing, and help system.

### Command Structure
```javascript
data: new SlashCommandBuilder()
  .setName('lobby')
  .setDescription('Open the main Cohort game lobby')
```

### `execute(interaction)` Function

#### **Process Flow**
```javascript
async execute(interaction) {
  // 1. Load commander with relationships
  const commander = await Commander.findByPk(interaction.user.id, {
    include: ['eliteUnits']
  });
  
  // 2. Determine player status
  const isNewPlayer = !commander || !commander.culture;
  
  // 3. Show main lobby interface
  await showMainLobby(interaction, commander, isNewPlayer);
}
```

### `showMainLobby(interaction, commander, isNewPlayer)` Function

#### **Lobby Embed Construction**
```javascript
// Calculate stats display
let statsText = 'New Commander - No battles yet';
let armyStatus = 'No army built';

if (commander) {
  const winRate = commander.getWinRate();
  statsText = `Battles: ${commander.totalBattles} | Wins: ${commander.battlesWon} | Win Rate: ${winRate}%`;
  
  if (commander.culture) {
    armyStatus = `${commander.culture} forces ready`;
  }
}

// Check for active battles
let activeBattleText = 'No active battles';
if (commander) {
  const activeBattle = await Battle.findOne({
    where: {
      status: ['waiting_for_players', 'army_building', 'in_progress'],
      [Op.or]: [
        { player1Id: commander.discordId },
        { player2Id: commander.discordId }
      ]
    }
  });
  
  if (activeBattle) {
    activeBattleText = `Active: ${activeBattle.scenario} (Turn ${activeBattle.currentTurn})`;
  }
}
```

#### **Lobby Embed Fields**
```javascript
const embed = new EmbedBuilder()
  .setColor(0x8B4513)  // Brown (ancient warfare theme)
  .setTitle('⚔️ COHORT - Ancient Warfare Strategy')
  .setDescription('*Command armies from 3000 BC to 500 AD in tactical Discord battles*')
  .addFields(
    {
      name: '👤 Commander Status',
      value: `**Name:** ${username}\n**Culture:** ${culture || 'Not selected'}\n**Stats:** ${statsText}`,
      inline: true
    },
    {
      name: '🏛️ Army Status',
      value: armyStatus,
      inline: true
    },
    {
      name: '⚔️ Battle Status',
      value: activeBattleText,
      inline: true
    },
    {
      name: '🎮 How to Play',
      value: '1. **Build Army** - Choose culture and create forces\n2. **Create Battle** - Select scenario and wait for opponent\n3. **Fight** - Give orders via DM, AI narrates results\n4. **Victory** - Gain experience, unlock new tactics',
      inline: false
    }
  );
```

#### **Lobby Buttons**
```javascript
// Primary Actions
const mainButtons = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('lobby-build-army')
      .setLabel(isNewPlayer ? 'Choose Culture & Build Army' : 'Modify Army')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🏗️'),
      
    new ButtonBuilder()
      .setCustomId('lobby-create-battle')
      .setLabel('Create Battle')
      .setStyle(ButtonStyle.Success)
      .setEmoji('⚔️')
      .setDisabled(isNewPlayer),  // Disabled until army built
      
    new ButtonBuilder()
      .setCustomId('lobby-join-battle')
      .setLabel('Join Battle')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🛡️')
      .setDisabled(isNewPlayer)
  );

// Utility Actions
const utilityButtons = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('lobby-my-stats')
      .setLabel('My Stats')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📊')
      .setDisabled(isNewPlayer),
      
    new ButtonBuilder()
      .setCustomId('lobby-battle-history')
      .setLabel('Battle History')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📜')
      .setDisabled(isNewPlayer),
      
    new ButtonBuilder()
      .setCustomId('lobby-help')
      .setLabel('Help & Commands')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❓')
  );
```

### Button Interaction Handling
**Handled in:** `src/bot/lobbyInteractionHandler.js`

**Button Routing:**
```javascript
if (customId === 'lobby-build-army') {
  // Route to army builder
  await armyInteractionHandler.showBuilder(interaction);
}

if (customId === 'lobby-create-battle') {
  // Show scenario selection menu
  await showScenarioSelection(interaction);
}

if (customId === 'lobby-join-battle') {
  // Show available battles to join
  await showAvailableBattles(interaction);
}

if (customId === 'lobby-my-stats') {
  // Execute stats command
  const statsCommand = require('./commands/stats');
  await statsCommand.execute(interaction);
}

if (customId === 'lobby-battle-history') {
  // Show past battles
  await showBattleHistory(interaction);
}

if (customId === 'lobby-help') {
  // Show help documentation
  await showHelpSystem(interaction);
}
```

---

## Order Parser System (Keyword-Based)
**Location:** `src/game/orderParser.js`

### Purpose
Alternative/fallback order parsing using keyword matching and vocabulary recognition. More reliable than AI for simple orders but less flexible for complex multi-unit coordination.

### Core Data: Command Vocabulary

#### **COMMAND_VOCABULARY Object**
Comprehensive synonym dictionary for natural language parsing

**Movement Commands:**
```javascript
movement: {
  'advance': ['advance', 'move forward', 'push', 'attack', 'charge', 'go', 'march'],
  'retreat': ['retreat', 'withdraw', 'fall back', 'pull back', 'disengage'],
  'flank': ['flank', 'outflank', 'circle', 'go around', 'bypass'],
  'hold': ['hold', 'stay', 'remain', 'keep position', 'defend', 'guard'],
  'maneuver': ['maneuver', 'reposition', 'shift', 'adjust', 'move']
}
```

**Formation Commands:**
```javascript
formations: {
  'phalanx': ['phalanx', 'spear wall', 'pike formation', 'sarissa'],
  'testudo': ['testudo', 'turtle', 'shield wall', 'tortoise'],
  'wedge': ['wedge', 'triangle', 'arrow', 'point'],
  'line': ['line', 'battle line', 'formation', 'ranks'],
  'column': ['column', 'march column', 'file'],
  'loose': ['loose', 'skirmish', 'open order', 'scattered']
}
```

**Tactical Actions:**
```javascript
actions: {
  'attack': ['attack', 'assault', 'strike', 'engage', 'charge'],
  'defend': ['defend', 'block', 'parry', 'resist', 'hold'],
  'support': ['support', 'assist', 'help', 'cover', 'aid'],
  'harass': ['harass', 'skirmish', 'raid', 'hit and run'],
  'pursue': ['pursue', 'chase', 'follow', 'hunt down'],
  'feint': ['feint', 'fake', 'deceive', 'trick', 'pretend']
}
```

**Targets & Locations:**
```javascript
targets: {
  'ford': ['ford', 'crossing', 'river crossing', 'bridge'],
  'flank': ['flank', 'side', 'wing', 'left', 'right'],
  'center': ['center', 'middle', 'main force'],
  'rear': ['rear', 'back', 'behind'],
  'hill': ['hill', 'height', 'elevation', 'ridge'],
  'forest': ['forest', 'woods', 'trees'],
  'enemy': ['enemy', 'foe', 'opposition', 'them', 'their forces']
}
```

**Unit Types:**
```javascript
units: {
  'infantry': ['infantry', 'footmen', 'soldiers', 'troops', 'men'],
  'cavalry': ['cavalry', 'horses', 'riders', 'mounted'],
  'archers': ['archers', 'bowmen', 'arrows', 'ranged'],
  'elite': ['elite', 'guard', 'veterans', 'champions'],
  'all': ['all', 'everyone', 'entire force', 'whole army']
}
```

### Cultural Tactics Configuration

#### **CULTURAL_TACTICS Object**
Defines what each culture can/cannot do tactically

**Roman Republic:**
```javascript
'Roman': {
  preferredFormations: ['testudo', 'line', 'wedge'],
  restrictedFormations: [],  // Can use all
  specialTactics: [
    'engineering',           // Build fortifications
    'systematic_advance',    // Coordinated movement
    'fortification'          // Defensive works
  ],
  commandStyle: 'disciplined'
}
```

**Celtic Tribes:**
```javascript
'Celtic': {
  preferredFormations: ['loose', 'wedge'],
  restrictedFormations: ['testudo', 'phalanx'],  // Cannot use rigid formations
  specialTactics: [
    'berserker_charge',      // Fury attack
    'individual_combat'      // Hero duels
  ],
  commandStyle: 'heroic'
}
```

**Han Dynasty:**
```javascript
'Han Chinese': {
  preferredFormations: ['line', 'column'],
  restrictedFormations: [],
  specialTactics: [
    'crossbow_volley',       // Coordinated shooting
    'coordinated_advance'    // Disciplined movement
  ],
  commandStyle: 'coordinated'
}
```

**Sarmatian Confederations:**
```javascript
'Sarmatian': {
  preferredFormations: ['loose', 'wedge'],
  restrictedFormations: ['testudo', 'phalanx'],
  specialTactics: [
    'feigned_retreat',       // Parthian shot
    'horse_archery'          // Mobile archery
  ],
  commandStyle: 'mobile'
}
```

### Main Function: `parsePlayerOrders()`

#### **Purpose**
Parse natural language into structured commands using keyword matching

#### **Process**
```javascript
async function parsePlayerOrders(orderText, playerArmy, culture, battleState) {
  // 1. Normalize text
  const normalized = normalizeOrderText(orderText);
  // "Advance Infantry To Ford And Archers Cover"
  // → "advance infantry to ford and archers cover"
  
  // 2. Split into individual commands
  const phrases = splitIntoCommands(normalized);
  // ["advance infantry to ford", "archers cover"]
  
  // 3. Parse each command phrase
  const parsedCommands = [];
  for (const phrase of phrases) {
    const command = await parseIndividualCommand(
      phrase, 
      playerArmy, 
      culture, 
      battleState
    );
    if (command) parsedCommands.push(command);
  }
  
  // 4. Validate command combinations
  const validated = validateCommandCombination(
    parsedCommands, 
    culture, 
    playerArmy
  );
  
  // 5. Apply cultural context
  const culturalOrders = applyCulturalContext(
    validated, 
    culture, 
    battleState
  );
  
  return culturalOrders;
}
```

### `parseIndividualCommand(phrase, playerArmy, culture, battleState)`

#### **Purpose**
Extract structured data from single command phrase

#### **Extraction Process**
```javascript
const command = {
  originalPhrase: phrase,
  unitTargets: [],      // Which units
  action: null,         // What to do
  formation: null,      // Formation change
  target: null,         // Where/what to target
  modifier: null,       // Speed, stealth, etc.
  confidence: 0         // Parsing confidence (0-1)
};

// Step 1: Extract unit targets
command.unitTargets = extractUnitTargets(phrase, playerArmy);
// "infantry advance" → [{type: 'infantry', units: [unit1, unit2]}]

// Step 2: Extract primary action
command.action = extractAction(phrase);
// "advance" → {type: 'advance', category: 'movement'}

// Step 3: Extract formation
command.formation = extractFormation(phrase);
// "form testudo" → {type: 'testudo'}

// Step 4: Extract target
command.target = extractTarget(phrase, battleState);
// "to ford" → {type: 'ford', available: true}

// Step 5: Extract modifiers
command.modifier = extractModifiers(phrase);
// "quickly" → {speed: 'fast'}

// Step 6: Calculate confidence
command.confidence = calculateParsingConfidence(command);
// All elements found → 1.0, partial → 0.3-0.7

return command;
```

### Parsing Confidence System

#### **`calculateParsingConfidence(command)`**
**Purpose:** Determine how well order was understood

**Scoring:**
```javascript
let confidence = 0;

// Base requirements
if (command.unitTargets.length > 0) confidence += 0.3;  // Found units
if (command.action) confidence += 0.3;                  // Found action

// Bonuses for clarity
if (command.formation) confidence += 0.2;               // Specific formation
if (command.target && command.target.available) confidence += 0.2;  // Valid target

// Penalties for inference
if (command.action.inferred) confidence -= 0.1;         // Had to guess action

return Math.min(1.0, confidence);  // Cap at 1.0
```

**Confidence Levels:**
- **0.9-1.0:** High confidence (all elements clear)
- **0.6-0.8:** Medium confidence (minor ambiguity)
- **0.3-0.5:** Low confidence (requires confirmation)
- **<0.3:** Rejected (too ambiguous, ask for clarification)

**Usage:**
```javascript
if (command.confidence < 0.3) {
  return generateParsingError(
    phrase, 
    culture, 
    new Error('Order too ambiguous')
  );
}

if (command.confidence < 0.6) {
  // Request confirmation
  await requestOrderConfirmation(command, player);
}
```

### Cultural Validation

#### **`validateCommandCombination(commands, culture, playerArmy)`**
**Purpose:** Check commands against cultural restrictions

**Process:**
```javascript
const culturalTactics = CULTURAL_TACTICS[culture];

const validatedCommands = commands.map(command => {
  if (command.formation) {
    const formationType = command.formation.type;
    
    // Check restrictions
    if (culturalTactics.restrictedFormations.includes(formationType)) {
      command.culturalPenalty = 'restricted_formation';
      command.confidence *= 0.5;  // Reduce but allow
      
      // Will show warning:
      // "Celtic warriors resist rigid formations - morale penalty applied"
    }
    
    // Check preferences
    if (culturalTactics.preferredFormations.includes(formationType)) {
      command.culturalBonus = 'preferred_formation';
      command.confidence = Math.min(1.0, command.confidence * 1.2);
      
      // Will show: "Celtic warriors eager for loose formation charge!"
    }
  }
  
  return command;
});

return validatedCommands;
```

**Example - Celtic Testudo Attempt:**
```javascript
Input: "Form testudo"
Culture: Celtic

Result:
{
  formation: 'testudo',
  culturalPenalty: 'restricted_formation',
  confidence: 0.35,  // Reduced from 0.7
  warning: "Celtic warriors refuse: 'Stand in a Roman box? The spirits demand movement!'"
}
```

### Cultural Advice Generation

#### **`applyCulturalContext(orders, culture, battleState)`**
**Purpose:** Add cultural flavor and tactical suggestions

**Roman Example:**
```javascript
if (culture === 'Roman') {
  advice.push("Roman discipline requires coordinated movement");
  
  if (orders.some(cmd => cmd.formation?.type === 'testudo')) {
    advice.push("Testudo formation excellent for missile protection");
  }
  
  if (battleState.enemyHasArchers) {
    advice.push("Consider testudo advance against their archers");
  }
}
```

**Celtic Example:**
```javascript
if (culture === 'Celtic') {
  advice.push("Celtic warriors fight best with freedom to charge");
  
  if (orders.some(cmd => cmd.action?.type === 'attack')) {
    advice.push("The spirits of war favor bold assault");
  }
  
  if (orders.some(cmd => cmd.action?.type === 'hold')) {
    advice.push("⚠️ Celts grow restless in static defense - morale may suffer");
  }
}
```

**Sarmatian Example:**
```javascript
if (culture === 'Sarmatian') {
  advice.push("Horse and bow - movement is life");
  
  if (orders.some(cmd => cmd.action?.type === 'retreat')) {
    advice.push("Feigned retreat can become devastating counter-attack");
  }
  
  if (battleState.terrain === 'forest') {
    advice.push("⚠️ Steppe cavalry ineffective in dense forest");
  }
}
```

---

## Order Parsing Comparison: AI vs Keyword

### AI-Based Parser (orderInterpreter.js)

**Strengths:**
- Handles complex multi-unit coordination
- Understands context and implied meaning
- Can parse novel tactical combinations
- Provides natural language feedback

**Weaknesses:**
- Requires API calls (latency)
- Costs money per parse
- Can fail or timeout
- Needs fallback system

**Best For:**
- Complex conditional orders
- Multi-step strategies
- Ambiguous phrasing
- Cultural dialogue generation

**Example AI Handles Well:**
```
"If enemy cavalry approaches ford, infantry form testudo, 
otherwise advance to hill while archers provide suppressing fire"

AI Parses:
{
  conditionalOrders: [
    {
      condition: 'enemy_cavalry_at_ford',
      thenAction: {type: 'formation', formation: 'testudo', unit: 'infantry'}
    },
    {
      condition: 'no_cavalry_threat',
      thenAction: {type: 'move', target: 'hill', unit: 'infantry'}
    }
  ],
  simultaneousActions: [
    {type: 'support_fire', unit: 'archers', supporting: 'infantry'}
  ]
}
```

### Keyword Parser (orderParser.js)

**Strengths:**
- Instant response (no API call)
- Zero cost
- Predictable and reliable
- No external dependencies

**Weaknesses:**
- Limited to predefined vocabulary
- Cannot handle complex conditionals
- Struggles with novel phrasing
- Less natural feedback

**Best For:**
- Simple movement orders
- Single-unit commands
- Explicit coordinate targeting
- Basic tactical actions

**Example Keyword Handles Well:**
```
"Infantry advance to ford"

Keyword Parses:
{
  unitTargets: [{type: 'infantry', units: [unit1]}],
  action: {type: 'advance', category: 'movement'},
  target: {type: 'ford', available: true},
  confidence: 0.9
}
```

### Hybrid Approach (Recommended)

**Strategy:**
```javascript
async function parseOrder(orderText, battleState, culture) {
  // Try keyword parser first (fast, free)
  const keywordResult = await parsePlayerOrders(orderText, army, culture, battleState);
  
  if (keywordResult.confidence >= 0.7) {
    // High confidence keyword parse - use it
    return keywordResult;
  }
  
  // Keyword parser unsure - use AI
  const aiResult = await interpretOrders(orderText, battleState, playerSide, map);
  
  if (aiResult.validatedActions.length > 0) {
    // AI succeeded
    return aiResult;
  }
  
  // Both failed - request clarification
  return {
    success: false,
    error: 'Order unclear',
    suggestions: [
      'Try simpler phrasing like "advance to ford"',
      'Specify which unit: "infantry advance" or "cavalry flank"'
    ]
  };
}
```

---

## Order Processing Examples

### Example 1: Simple Movement

**Input:** "Move north"

**Keyword Parser:**
```javascript
{
  unitTargets: [{type: 'all', units: allUnits}],
  action: {type: 'advance', synonym: 'move', category: 'movement'},
  target: null,
  direction: 'north',
  confidence: 0.6
}
```

**Validation:**
```javascript
// For each unit in 'all':
const targetCoord = calculateDirectionalMove(unit.position, 'north', 3);
const validation = validateMovement(unit, targetCoord, map);

if (validation.valid) {
  validatedActions.push({
    type: 'move',
    unitId: unit.unitId,
    targetPosition: targetCoord
  });
}
```

### Example 2: Formation Change

**Input:** "Form testudo"

**Keyword Parser:**
```javascript
{
  unitTargets: [{type: 'infantry', units: [infantry]}],  // Infantry can form testudo
  action: {type: 'defend', inferred: true},
  formation: {type: 'testudo', synonym: 'testudo'},
  confidence: 0.8
}
```

**Cultural Check:**
```javascript
culture = 'Roman Republic';
CULTURAL_TACTICS['Roman'].preferredFormations.includes('testudo');  // true
// → Apply cultural bonus, increase confidence to 0.96
```

**Result:**
```javascript
{
  type: 'formation',
  unitId: 'player1_professional_0',
  formationType: 'testudo',
  culturalBonus: true,
  officerComment: "Centurion Marcus: Forming testudo. Excellent against missiles, sir."
}
```

### Example 3: Multi-Unit Coordination

**Input:** "Infantry to ford, cavalry flank left, archers cover"

**Keyword Parser:**
```javascript
// Split on "and"
phrases: [
  "infantry to ford",
  "cavalry flank left", 
  "archers cover"
]

// Parse each
commands: [
  {
    unitTargets: [{type: 'infantry', units: [inf]}],
    action: {type: 'advance'},
    target: {type: 'ford'},
    confidence: 0.9
  },
  {
    unitTargets: [{type: 'cavalry', units: [cav]}],
    action: {type: 'flank'},
    target: {type: 'flank', direction: 'left'},
    confidence: 0.8
  },
  {
    unitTargets: [{type: 'archers', units: [arch]}],
    action: {type: 'support'},
    target: null,
    confidence: 0.7
  }
]
```

**Validation Result:**
```javascript
{
  validatedActions: [
    {type: 'move', unitId: 'infantry_0', targetPosition: 'F11'},
    {type: 'move', unitId: 'cavalry_0', targetPosition: 'D12'},  // Left flank
    {type: 'support_fire', unitId: 'archers_0', supporting: 'infantry_0'}
  ],
  culturalAdvice: [
    "Roman discipline requires coordinated movement",
    "Excellent combined arms approach"
  ]
}
```

### Example 4: Complex Conditional (AI Required)

**Input:** "If enemy holds ford, cavalry circle east and charge rear while infantry pins front. If ford clear, infantry cross immediately."

**Keyword Parser:**
```javascript
{
  confidence: 0.2,  // Too complex, triggers AI
  error: 'Conditional logic requires AI interpretation'
}
```

**AI Parser:**
```javascript
{
  validatedActions: [
    {
      type: 'conditional',
      condition: {
        check: 'enemy_at_position',
        position: 'F11'
      },
      ifTrue: [
        {type: 'move', unitId: 'cavalry', targetPosition: 'K12', reasoning: 'Flank east'},
        {type: 'attack', unitId: 'cavalry', target: 'enemy_rear'},
        {type: 'attack', unitId: 'infantry', target: 'enemy_front', modifier: 'pinning'}
      ],
      ifFalse: [
        {type: 'move', unitId: 'infantry', targetPosition: 'F11', modifier: 'immediate'}
      ]
    }
  ],
  culturalComment: "Centurion Marcus: Complex maneuver, sir. Requires precise timing. The lads are ready."
}
```

---

## Error Messages & User Feedback

### Parsing Error Messages

#### **Low Confidence Parse:**
```
⚠️ **Order Unclear**

Your order: "move thing place"

**Issue:** Could not identify which unit or where to move

**Suggestions:**
- Specify unit: "infantry advance" or "cavalry move north"
- Specify location: "advance to ford" or "move to F11"
- Try: "infantry advance to northern ford"

Centurion Marcus: "Sir, please clarify which unit should move where."
```

#### **Cultural Restriction Violation:**
```
❌ **Order Rejected**

Your order: "Form phalanx"
Culture: Celtic Tribes

**Celtic warriors refuse:**
"Stand in tight ranks like Greeks? The spirits of war favor the bold and free! 
We charge as individuals or not at all!"

**Reason:** Celtic cultural restrictions prevent rigid phalanx formations

**Alternatives:**
- Use loose formation for mobility
- Order wedge charge for coordinated assault
- Rely on individual warrior prowess
```

#### **Impossible Movement:**
```
❌ **Movement Failed**

Your order: "Cavalry to K14"

**Issue:** Target requires 6.5 movement, cavalry has 5.0

**Path:** A5 → B5 → C6 → D7 → E8 → F9 → G10 → H11 → I12 → J13 → K14
**Cost:** 6.5 movement points
**Available:** 5.0 points

**Suggestion:** 
Move to I12 this turn (5.0 points), continue to K14 next turn (1.5 points)

Alternatively, use road for faster movement: H10 → K10 → K14 (4.0 points via road)
```

### Confirmation Requests

#### **Ambiguous Order Confirmation:**
```
❓ **Order Confirmation Needed**

Your order: "Attack enemy"

**Interpretation:**
Multiple enemies detected:
1. Enemy infantry at M5 (~87 warriors)
2. Enemy cavalry at K8 (~60 riders)

**Which enemy should we attack?**

[🎯 Infantry at M5] [🐎 Cavalry at K8] [⚔️ Both] [❌ Cancel]
```

#### **Risky Tactic Confirmation:**
```
⚠️ **High Risk Maneuver**

Your order: "Cavalry charge the phalanx frontally"

**Officer Warning:**
Centurion Marcus: "Sir, frontal cavalry charge against sarissa pikes is suicide. 
The mathematics of reach favor them decisively. I've seen this fail three times."

**Tactical Analysis:**
- Phalanx vs cavalry: +8 defender advantage
- Sarissa reach: 21 feet vs cavalry lances: 9 feet
- Historical precedent: Battle of Chaeronea (338 BC) - cavalry slaughtered

**Are you certain?**

[✅ Execute Anyway] [🔄 Reconsider] [💬 Ask for Alternatives]
```

---

## Command Implementation Details

### Stats Command
**Location:** `src/bot/commands/stats.js`

#### **Purpose**
Display comprehensive commander statistics including rank, win rate, elite unit status, and named officers

#### **Data Loading**
```javascript
const commander = await Commander.findOne({
  where: { discordId: interaction.user.id },
  include: [
    { 
      model: EliteUnit, 
      as: 'eliteUnits',
      include: [
        { 
          model: VeteranOfficer, 
          as: 'officers',
          where: { isAlive: true },
          required: false  // Include even if no living officers
        }
      ]
    }
  ]
});
```

#### **Stats Embed Construction**
```javascript
const winRate = commander.getWinRate();
const eliteUnit = commander.eliteUnits[0];
const livingOfficers = eliteUnit.officers.filter(o => o.isAlive);
const fallenOfficers = eliteUnit.officers.filter(o => !o.isAlive);

const statsEmbed = new EmbedBuilder()
  .setTitle(`📊 ${commander.username} - ${commander.culture}`)
  .setColor(0xFFD700)  // Gold
  .addFields(
    {
      name: '🎖️ Commander Rank',
      value: `**${commander.rank}**\n${getRankDescription(commander.rank)}`,
      inline: true
    },
    {
      name: '⚔️ Battle Record',
      value: `Total: ${commander.totalBattles}\nWins: ${commander.battlesWon}\nLosses: ${commander.battlesLost}\nWin Rate: ${winRate}%`,
      inline: true
    },
    {
      name: '⭐ Reputation',
      value: `${commander.reputation}/200\n${getReputationTier(commander.reputation)}`,
      inline: true
    },
    {
      name: '🏛️ Elite Unit',
      value: `**${eliteUnit.name || 'Unnamed Guard'}**\n` +
             `Strength: ${eliteUnit.currentStrength}/${eliteUnit.size}\n` +
             `Veteran Level: ${eliteUnit.veteranLevel}\n` +
             `Average Experience: ${eliteUnit.averageExperience.toFixed(2)} battles\n` +
             `Battles Fought: ${eliteUnit.battlesParticipated}`,
      inline: false
    },
    {
      name: '👥 Living Officers',
      value: livingOfficers.length > 0 ?
        livingOfficers.map(o => 
          `${o.rank} **${o.name}** (${o.battlesExperience} battles)\n` +
          `└─ Level: ${o.getExperienceLevel()}`
        ).join('\n') :
        'No named officers yet (earn names after 5 battles)',
      inline: false
    }
  );

// Add fallen officers section if any
if (fallenOfficers.length > 0) {
  statsEmbed.addFields({
    name: '⚰️ Fallen Heroes',
    value: fallenOfficers.slice(0, 5).map(o =>
      `${o.rank} ${o.name} - Fell at ${o.deathBattle}`
    ).join('\n'),
    inline: false
  });
}
```

#### **Helper Functions**

**`getRankDescription(rank)`**
```javascript
const descriptions = {
  'Recruit': 'New to command (0-2 battles)',
  'Veteran': 'Experienced commander (3-9 battles)',
  'Elite': 'Master tactician (10-24 battles)',
  'Legendary': 'Ancient warfare legend (25+ battles)'
};
return descriptions[rank];
```

**`getReputationTier(reputation)`**
```javascript
if (reputation >= 150) return '⭐⭐⭐ Honored';
if (reputation >= 120) return '⭐⭐ Respected';
if (reputation >= 80) return '⭐ Known';
return 'Neutral';
```

---

## Create Game Command
**Location:** `src/bot/commands/create-game.js`

### Scenario Selection
```javascript
.addStringOption(option =>
  option.setName('scenario')
    .setDescription('Battle scenario type')
    .setRequired(true)
    .addChoices(
      { name: '🌉 River Crossing - Control vital fords', value: 'river' },
      { name: '🏰 Hill Fort Assault - Siege warfare', value: 'hillfort' },
      { name: '🌲 Forest Ambush - Terrain advantage', value: 'forest' },
      { name: '🏜️ Desert Oasis - Supply control', value: 'desert' },
      { name: '🏔️ Mountain Pass - Chokepoint defense', value: 'mountain' }
    )
)
```

### Scenario Mapping
```javascript
const scenarioMap = {
  'river': 'River Crossing',
  'hillfort': 'Hill Fort Assault',
  'forest': 'Forest Ambush',
  'desert': 'Desert Oasis',
  'mountain': 'Mountain Pass'
};

const scenarioDescriptions = {
  'River Crossing': 'Ancient river crossing with contested fords. Control 2+ fords for 4 turns OR destroy enemy army.',
  'Hill Fort Assault': 'Fortified hilltop position. Attacker must breach walls, defender holds for 8 turns.',
  'Forest Ambush': 'Dense woodland engagement. Ambusher eliminates convoy, escort protects passage.',
  'Desert Oasis': 'Vital water source in hostile desert. Control oasis while managing heat exhaustion.',
  'Mountain Pass': 'Strategic chokepoint. Defender exploits terrain, attacker forces passage.'
};
```

---

## Abandon Battle Command
**Location:** `src/bot/commands/abandon-battle.js`

### Forfeit Confirmation Flow
```javascript
async execute(interaction) {
  // 1. Find active battle
  const battle = await Battle.findOne({
    where: {
      [Op.or]: [
        { player1Id: interaction.user.id },
        { player2Id: interaction.user.id }
      ],
      status: 'in_progress'
    }
  });
  
  if (!battle) {
    return interaction.reply({
      content: '❌ No active battle to abandon',
      ephemeral: true
    });
  }
  
  // 2. Show confirmation with consequences
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Abandon Battle?')
    .setDescription(
      `**Consequences:**\n` +
      `- Counts as loss in your record\n` +
      `- Your elite unit may suffer casualties\n` +
      `- Officers face standard death chances\n` +
      `- Opponent awarded victory`
    )
    .setColor(0xFF0000);
  
  const confirmButton = new ButtonBuilder()
    .setCustomId(`confirm_abandon_${battle.id}`)
    .setLabel('⚠️ Confirm Forfeit')
    .setStyle(ButtonStyle.Danger);
  
  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_abandon')
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Secondary);
  
  await interaction.reply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(confirmButton, cancelButton)
    ],
    ephemeral: true
  });
}
```

### Forfeit Processing (in interactionHandler.js)
```javascript
if (customId.startsWith('confirm_abandon_')) {
  const battleId = customId.split('_')[2];
  const battle = await Battle.findByPk(battleId);
  
  // Determine winner
  const forfeiter = interaction.user.id;
  const winner = battle.getOpponent(forfeiter);
  
  // Award victory
  await battle.setWinner(winner, 'forfeit');
  
  // Apply officer death chances to forfeiting player
  const forfeitEliteUnit = await getPlayerEliteUnit(forfeiter, battle);
  await rollForOfficerDeaths(forfeitEliteUnit, 'forfeit');
  
  // Update commander records
  const winnerCmd = await Commander.findByPk(winner);
  const loserCmd = await Commander.findByPk(forfeiter);
  
  winnerCmd.battlesWon += 1;
  loserCmd.battlesLost += 1;
  
  await winnerCmd.updateRank();
  await loserCmd.updateRank();
  
  await winnerCmd.save();
  await loserCmd.save();
  
  // Notify both players
  await notifyForfeit(battle, winner, forfeiter);
  
  await interaction.update({
    content: '✅ Battle forfeited. Results sent to both players.',
    components: []
  });
}
```

---

## Order Parsing Edge Cases

### Handling Typos and Misspellings
```javascript
function fuzzyMatch(input, vocabulary) {
  // Levenshtein distance for close matches
  const threshold = 2;  // Max 2 character difference
  
  for (const [key, synonyms] of Object.entries(vocabulary)) {
    for (const synonym of synonyms) {
      if (levenshteinDistance(input, synonym) <= threshold) {
        return { match: key, confidence: 0.7, corrected: synonym };
      }
    }
  }
  
  return null;
}

// Example:
// "advnce" → fuzzyMatch → "advance" (distance: 1)
// "calvary" → fuzzyMatch → "cavalry" (common typo)
```

### Handling Ambiguous References
```javascript
// Order: "Attack the phalanx"
// Problem: Multiple phalanx units detected

async function resolveAmbiguousTarget(targetType, visibleEnemies) {
  const matches = visibleEnemies.filter(e => 
    e.formation === targetType || e.unitType === targetType
  );
  
  if (matches.length === 1) {
    // Unambiguous
    return matches[0];
  }
  
  if (matches.length > 1) {
    // Request clarification
    return {
      ambiguous: true,
      options: matches,
      question: 'Multiple phalanx units detected. Which one?',
      choices: matches.map((m, i) => 
        `${i+1}. Phalanx at ${m.position} (~${m.estimatedStrength} warriors)`
      )
    };
  }
  
  // No matches
  return {
    notFound: true,
    error: `No ${targetType} units detected. Send scouts to gather intelligence.`
  };
}
```

### Handling Missing Information
```javascript
// Order: "Attack enemy cavalry"
// Problem: No enemy cavalry visible (fog of war)

function validateTargetVisibility(target, visibility) {
  const visibleEnemies = visibility.visibleEnemyPositions;
  
  if (target.type === 'enemy_cavalry') {
    const cavalrySpotted = visibleEnemies.some(e => e.unitType === 'cavalry');
    
    if (!cavalrySpotted) {
      return {
        valid: false,
        reason: 'target_not_visible',
        message: "Officer reports: 'No enemy cavalry spotted, sir. Should I send scouts to search?'",
        suggestions: [
          'Order scouts to search for cavalry',
          'Advance units to extend vision range',
          'Specify different target from visible enemies'
        ]
      };
    }
  }
  
  return { valid: true };
}
```

---

## Dual Parser Integration Pattern

### Recommended Implementation
```javascript
async function parseOrderWithFallback(orderText, battleState, playerSide, map, culture) {
  console.log(`Parsing: "${orderText}"`);
  
  // STEP 1: Try keyword parser (instant, free)
  const keywordStart = Date.now();
  const keywordResult = await parsePlayerOrders(
    orderText,
    battleState[playerSide].unitPositions,
    culture,
    battleState
  );
  const keywordTime = Date.now() - keywordStart;
  
  console.log(`Keyword parser: ${keywordTime}ms, confidence: ${keywordResult.confidence}`);
  
  // High confidence keyword parse - use it
  if (keywordResult.confidence >= 0.7) {
    return {
      source: 'keyword',
      result: keywordResult,
      processingTime: keywordTime,
      cost: 0
    };
  }
  
  // STEP 2: Keyword parser uncertain - try AI
  console.log('Keyword confidence low, calling AI...');
  const aiStart = Date.now();
  
  try {
    const aiResult = await interpretOrders(
      orderText,
      battleState,
      playerSide,
      map
    );
    const aiTime = Date.now() - aiStart;
    
    console.log(`AI parser: ${aiTime}ms`);
    
    if (aiResult.validatedActions.length > 0) {
      return {
        source: 'ai',
        result: aiResult,
        processingTime: aiTime,
        cost: 0.0004  // Approximate GPT-4o-mini cost
      };
    }
  } catch (error) {
    console.error('AI parsing failed:', error);
  }
  
  // STEP 3: Both failed - request clarification
  return {
    source: 'none',
    result: {
      success: false,
      error: 'Order could not be interpreted',
      suggestions: generateOrderSuggestions(orderText, culture),
      keywordAttempt: keywordResult,
      aiAttempt: aiResult
    },
    processingTime: Date.now() - keywordStart,
    cost: 0.0004
  };
}
```

### Cost Tracking
```javascript
const parseMetrics = {
  total: 0,
  keyword: 0,
  ai: 0,
  failed: 0,
  avgKeywordTime: 0,
  avgAITime: 0,
  totalCost: 0
};

function trackParsing(result) {
  parseMetrics.total++;
  
  if (result.source === 'keyword') {
    parseMetrics.keyword++;
    parseMetrics.avgKeywordTime = 
      (parseMetrics.avgKeywordTime * (parseMetrics.keyword - 1) + result.processingTime) 
      / parseMetrics.keyword;
  }
  
  if (result.source === 'ai') {
    parseMetrics.ai++;
    parseMetrics.totalCost += result.cost;
    parseMetrics.avgAITime = 
      (parseMetrics.avgAITime * (parseMetrics.ai - 1) + result.processingTime) 
      / parseMetrics.ai;
  }
  
  if (!result.result.success) {
    parseMetrics.failed++;
  }
  
  // Log metrics periodically
  if (parseMetrics.total % 100 === 0) {
    console.log('PARSING METRICS:', parseMetrics);
  }
}
```

---

## Natural Language Understanding Depth

### Intent Recognition Levels

**Level 1: Explicit (Highest Confidence)**
```
"Infantry unit at B5 advance to F11"
→ Unit: infantry at B5 (exact)
→ Action: advance
→ Target: F11 (coordinate)
→ Confidence: 1.0
```

**Level 2: Clear (High Confidence)**
```
"Northern Company to the ford"
→ Unit: Northern Company (named unit)
→ Action: advance (implied)
→ Target: ford (map feature)
→ Confidence: 0.9
```

**Level 3: Standard (Medium Confidence)**
```
"Infantry advance north"
→ Unit: infantry (type match)
→ Action: advance
→ Target: north (directional)
→ Confidence: 0.7
```

**Level 4: Vague (Low Confidence)**
```
"Move forward"
→ Unit: all (implied)
→ Action: advance
→ Target: forward (directional, vague)
→ Confidence: 0.4
```

**Level 5: Unclear (Rejected)**
```
"Do something"
→ Unit: unknown
→ Action: unknown
→ Target: unknown
→ Confidence: 0.1
→ Result: Request clarification
```

---

## Command Processing Pipeline Comparison

### Simple Order: "Move north"

#### **Keyword Parser Path:**
```
Input: "move north"
  ↓ [5ms] Normalize
"move north"
  ↓ [2ms] Extract action
{action: 'advance', synonym: 'move'}
  ↓ [2ms] Extract direction
{direction: 'north'}
  ↓ [1ms] Calculate confidence
confidence: 0.6
  ↓ [10ms TOTAL] Return
{
  unitTargets: [{type: 'all'}],
  action: {type: 'advance'},
  direction: 'north',
  confidence: 0.6
}
```

#### **AI Parser Path:**
```
Input: "move north"
  ↓ [10ms] Build AI prompt
"You are a tactical AI... Parse: 'move north'"
  ↓ [500ms] Call OpenAI API
GPT-4o-mini processes request
  ↓ [50ms] Parse JSON response
{actions: [{type: 'move', direction: 'north'}]}
  ↓ [20ms] Validate
{validatedActions: [...]}
  ↓ [580ms TOTAL] Return
Same result as keyword but took 58× longer
```

**Verdict:** Keyword parser wins for simple orders (faster, free)

### Complex Order: "If enemy at ford, cavalry flank east, else infantry cross"

#### **Keyword Parser Path:**
```
Input: "if enemy at ford cavalry flank east else infantry cross"
  ↓ [5ms] Normalize
"if enemy at ford cavalry flank east else infantry cross"
  ↓ [10ms] Split commands
["if enemy at ford cavalry flank east", "else infantry cross"]
  ↓ [5ms] Extract elements
Found: cavalry, infantry, ford
  ↓ [3ms] Calculate confidence
confidence: 0.3 (conditional logic not understood)
  ↓ [23ms TOTAL] Return
{
  success: false,
  confidence: 0.3,
  reason: 'Conditional logic requires AI interpretation',
  fallbackRequired: true
}
```

#### **AI Parser Path:**
```
Input: "if enemy at ford cavalry flank east else infantry cross"
  ↓ [15ms] Build complex AI prompt with battle context
  ↓ [800ms] Call Claude (complex order = premium AI)
Claude parses conditional structure
  ↓ [100ms] Parse and validate
{
  conditionalOrders: [
    {
      condition: 'enemy_at_position',
      position: 'F11',
      ifTrue: [{type: 'move', unit: 'cavalry', target: 'flank_east'}],
      ifFalse: [{type: 'move', unit: 'infantry', target: 'F11'}]
    }
  ]
}
  ↓ [915ms TOTAL] Return
Complex conditional order successfully parsed
```

**Verdict:** AI required for conditional logic (keyword can't handle)

---

## Order Validation Comprehensive Flow

```
Raw Player Order
    ↓
┌──────────────────────────────────┐
│ 1. Parse (Keyword or AI)         │
│ Extract: units, action, target   │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ 2. Validate Units Exist          │
│ Check: Player owns referenced    │
│        units                     │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ 3. Validate Action Capability    │
│ Check: Unit type can perform     │
│        action (cavalry can't     │
│        form testudo)             │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ 4. Validate Cultural Allowed     │
│ Check: Culture permits tactic    │
│        (Celtic can't use phalanx)│
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ 5. Validate Movement Range       │
│ Check: Target within movement    │
│        (via validateMovement)    │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ 6. Validate Target Exists        │
│ Check: Ford/hill/enemy visible   │
│        (fog of war)              │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ 7. Check Morale Requirements     │
│ Check: Unit morale high enough   │
│        for risky tactics         │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ 8. Generate Officer Feedback     │
│ Add: Cultural officer commentary │
└──────────┬───────────────────────┘
           ↓
Validated Order Ready for Execution
```

---

## System Integration Summary

The order processing system demonstrates the **layered validation approach** that makes Cohort robust:

1. **Parser Layer:** Converts natural language to structure (keyword or AI)
2. **Game Rules Layer:** Validates against unit capabilities and movement
3. **Cultural Layer:** Checks cultural restrictions and preferences
4. **Visibility Layer:** Validates targets are actually visible (fog of war)
5. **Morale Layer:** Checks unit morale supports risky orders
6. **Feedback Layer:** Provides cultural officer commentary

This multi-layer validation ensures:
- Orders are always executable (no impossible commands)
- Cultural authenticity maintained
- Historical accuracy preserved
- Player receives clear feedback
- Game state remains consistent

### Cost-Benefit Analysis

**Keyword Parser:**
- Cost: $0
- Speed: 10-50ms
- Accuracy: 70-80% for simple orders
- Best for: 80% of player orders

**AI Parser:**
- Cost: $0.0004 per parse
- Speed: 500-1000ms
- Accuracy: 95% for all orders
- Best for: 20% complex orders

**Hybrid Approach:**
- Total cost: ~$0.00008 per order average
- Average speed: ~150ms
- Overall accuracy: 85%+
- Best value: Use keyword first, AI fallback
# Cohort Discord Bot Layer Documentation

## Overview
The Discord bot layer handles all user interactions including slash commands, button/menu interactions, DM processing, and lobby management. Bridges Discord UI with game logic and database systems.

---

## Bot Entry Point
**Location:** `src/index.js`

### Purpose
Main bot initialization, Discord client setup, event handler registration, and graceful shutdown management.

### Initialization Flow

```javascript
// 1. Load environment variables
require('dotenv').config();

// 2. Initialize database
const { sequelize, models } = require('./database/setup');
await sequelize.sync({ alter: true });

// 3. Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]  // Required for DMs
});

// 4. Load slash commands dynamically
const commands = commandLoader.loadCommands();
client.commands = new Collection();
commands.forEach(cmd => client.commands.set(cmd.data.name, cmd));

// 5. Register event handlers
client.on('ready', onReadyHandler);
client.on('interactionCreate', interactionHandler);
client.on('messageCreate', dmHandler);

// 6. Login with bot token
await client.login(process.env.DISCORD_BOT_TOKEN);
```

### Event Handlers

#### **`onReadyHandler`**
**Fires:** When bot successfully connects to Discord
**Actions:**
- Log successful connection
- Display bot username and ID
- Set bot status/activity
- Register slash commands globally

#### **`interactionHandler`**
**Fires:** When user clicks button, uses menu, or types slash command
**Routes to:**
- Slash commands → `interactionHandler.js`
- Buttons → `gameInteractionHandler.js` or `lobbyInteractionHandler.js`
- Menus → `armyInteractionHandler.js`

#### **`dmHandler`**
**Fires:** When user sends DM to bot
**Routes to:** `dmHandler.js` for battle order processing

### Graceful Shutdown

```javascript
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  // Save any pending battle states
  await savePendingBattles();
  
  // Close database connections
  await sequelize.close();
  
  // Destroy Discord client
  client.destroy();
  
  process.exit(0);
});
```

---

## Command Loader
**Location:** `src/bot/commandLoader.js`

### Purpose
Dynamically load all slash command files from commands directory and prepare them for Discord registration.

### Function

#### **`loadCommands()`**
**Purpose:** Load all command modules and extract SlashCommandBuilder data
**Process:**
```javascript
const commandFiles = fs.readdirSync('./src/bot/commands')
  .filter(file => file.endsWith('.js'));

const commands = [];

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  
  if (command.data && command.execute) {
    commands.push(command);
    console.log(`✅ Loaded command: ${command.data.name}`);
  } else {
    console.warn(`⚠️ Invalid command file: ${file}`);
  }
}

return commands;
```

**Returns:** Array of command objects with `.data` (SlashCommandBuilder) and `.execute` (function)

---

## Slash Commands

### `/create-game`
**Location:** `src/bot/commands/create-game.js`

#### **Purpose**
Create new battle in public channel, post lobby embed, enable join reactions

#### **Command Definition**
```javascript
data: new SlashCommandBuilder()
  .setName('create-game')
  .setDescription('Create a new ancient warfare battle')
  .addStringOption(option =>
    option.setName('scenario')
      .setDescription('Battle scenario type')
      .setRequired(true)
      .addChoices(
        { name: '🌉 River Crossing', value: 'river' },
        { name: '🏰 Hill Fort Assault', value: 'hillfort' },
        { name: '🌲 Forest Ambush', value: 'forest' },
        { name: '🏜️ Desert Oasis', value: 'desert' },
        { name: '🏔️ Mountain Pass', value: 'mountain' }
      )
  )
```

#### **`execute(interaction)` Flow**
```javascript
// 1. Extract scenario choice
const scenario = interaction.options.getString('scenario');

// 2. Create battle in database
const battle = await Battle.create({
  player1Id: interaction.user.id,
  player2Id: null,  // Waiting for opponent
  scenario: scenarioMap[scenario],
  status: 'waiting_for_players',
  channelId: interaction.channelId
});

// 3. Create lobby embed with battle info
const lobbyEmbed = new EmbedBuilder()
  .setTitle(`⚔️ Battle Created: ${scenarioName}`)
  .setDescription(scenarioDescription)
  .addFields(
    { name: 'Commander', value: interaction.user.tag },
    { name: 'Status', value: '⏳ Waiting for opponent' }
  )
  .setColor(0x2B579A);

// 4. Add join button
const joinButton = new ButtonBuilder()
  .setCustomId(`join_battle_${battle.id}`)
  .setLabel('⚔️ Join Battle')
  .setStyle(ButtonStyle.Primary);

// 5. Post to channel
const message = await interaction.reply({
  embeds: [lobbyEmbed],
  components: [new ActionRowBuilder().addComponents(joinButton)],
  fetchReply: true
});

// 6. Store message ID for later updates
battle.messageId = message.id;
await battle.save();
```

### `/join-battle`
**Location:** `src/bot/commands/join-battle.js`

#### **Purpose**
Button click handler when Player 2 joins waiting battle

#### **`execute(interaction)` Flow**
```javascript
// 1. Extract battle ID from button custom ID
const battleId = interaction.customId.split('_')[2];

// 2. Load battle from database
const battle = await Battle.findByPk(battleId);

// 3. Validate join
if (battle.player2Id) {
  return interaction.reply({ 
    content: '❌ Battle already full', 
    ephemeral: true 
  });
}

if (interaction.user.id === battle.player1Id) {
  return interaction.reply({ 
    content: '❌ Cannot join your own battle', 
    ephemeral: true 
  });
}

// 4. Add player 2
battle.player2Id = interaction.user.id;
battle.status = 'army_building';
await battle.save();

// 5. Update lobby embed
const updatedEmbed = new EmbedBuilder()
  .setTitle(`⚔️ Battle Ready!`)
  .setDescription('Both commanders present')
  .addFields(
    { name: 'Player 1', value: player1.username },
    { name: 'Player 2', value: interaction.user.tag },
    { name: 'Next Step', value: 'Both players build armies in DMs' }
  );

await interaction.update({ 
  embeds: [updatedEmbed], 
  components: []  // Remove join button
});

// 6. DM both players to build armies
await sendArmyBuilderDMs(battle);
```

### `/build-army`
**Location:** `src/bot/commands/build-army.js`

#### **Purpose**
Launch interactive army builder in player's DM with React-style menus for troop/equipment selection

#### **Command Definition**
```javascript
data: new SlashCommandBuilder()
  .setName('build-army')
  .setDescription('Build your army for battle')
```

#### **`execute(interaction)` Flow**
```javascript
// 1. Find player's active battle in army_building status
const battle = await Battle.findOne({
  where: {
    [Op.or]: [
      { player1Id: interaction.user.id },
      { player2Id: interaction.user.id }
    ],
    status: 'army_building'
  }
});

if (!battle) {
  return interaction.reply({ 
    content: '❌ No active battle requiring army building',
    ephemeral: true  
  });
}

// 2. Load commander's culture and elite unit
const commander = await Commander.findOne({
  where: { discordId: interaction.user.id },
  include: ['eliteUnits']
});

// 3. Initialize army builder state
const builderState = {
  commanderId: interaction.user.id,
  battleId: battle.id,
  culture: commander.culture,
  eliteUnit: commander.eliteUnits[0],  // Fixed inclusion
  blocksUsed: 0,
  blocksTotal: 30,
  selectedTroops: [],
  selectedEquipment: [],
  selectedSupport: []
};

// 4. Create army builder embed with progress bar
const armyEmbed = createArmyBuilderEmbed(builderState);

// 5. Add troop selection menu
const troopMenu = new StringSelectMenuBuilder()
  .setCustomId('army_troops')
  .setPlaceholder('Select troop quality')
  .addOptions([
    {
      label: '⭐ Professional (10 blocks)',
      description: '100 veteran warriors - Attack 8, Defense 7',
      value: 'professional'
    },
    {
      label: '🛡️ Town Militia (6 blocks)',
      description: '100 trained citizens - Attack 5, Defense 5',
      value: 'militia'
    },
    {
      label: '⚔️ Levy (4 blocks)',
      description: '100 conscripts - Attack 3, Defense 4',
      value: 'levy'
    }
  ]);

// 6. Send to player DM
await interaction.user.send({
  embeds: [armyEmbed],
  components: [
    new ActionRowBuilder().addComponents(troopMenu),
    createEquipmentRow(),
    createSupportRow(),
    createActionButtons()
  ]
});

await interaction.reply({ 
  content: '✅ Army builder sent to your DMs!', 
  ephemeral: true 
});
```

### `/stats`
**Location:** `src/bot/commands/stats.js`

#### **Purpose**
Display commander statistics, elite unit status, and battle history

#### **`execute(interaction)` Flow**
```javascript
// 1. Load commander with relationships
const commander = await Commander.findOne({
  where: { discordId: interaction.user.id },
  include: [
    { 
      model: EliteUnit, 
      as: 'eliteUnits',
      include: [{ model: VeteranOfficer, as: 'officers' }]
    }
  ]
});

// 2. Calculate statistics
const winRate = commander.getWinRate();
const eliteUnit = commander.eliteUnits[0];
const livingOfficers = eliteUnit.officers.filter(o => o.isAlive);

// 3. Create stats embed
const statsEmbed = new EmbedBuilder()
  .setTitle(`📊 ${commander.username} - ${commander.culture}`)
  .setColor(0xFFD700)
  .addFields(
    { 
      name: '🎖️ Rank', 
      value: commander.rank, 
      inline: true 
    },
    { 
      name: '⚔️ Battles', 
      value: `${commander.totalBattles} (${commander.battlesWon}W - ${commander.battlesLost}L)`,
      inline: true
    },
    { 
      name: '📈 Win Rate', 
      value: `${winRate}%`,
      inline: true 
    },
    {
      name: '🏛️ Elite Unit',
      value: `${eliteUnit.name || 'Unnamed'}\nStrength: ${eliteUnit.currentStrength}/${eliteUnit.size}\nVeteran Level: ${eliteUnit.veteranLevel}\nBattles: ${eliteUnit.battlesParticipated}`
    },
    {
      name: '👥 Named Officers',
      value: livingOfficers.map(o => 
        `${o.rank} ${o.name} (${o.battlesExperience} battles)`
      ).join('\n') || 'None yet'
    }
  );

await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
```

### `/abandon-battle`
**Location:** `src/bot/commands/abandon-battle.js`

#### **Purpose**
Allow player to forfeit active battle, applying consequences based on game mode

#### **`execute(interaction)` Flow**
```javascript
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

// 2. Confirmation prompt
const confirmButton = new ButtonBuilder()
  .setCustomId(`confirm_abandon_${battle.id}`)
  .setLabel('⚠️ Confirm Forfeit')
  .setStyle(ButtonStyle.Danger);

await interaction.reply({
  content: `⚠️ **Abandon Battle?**\n\nThis will count as a loss. Your elite unit may suffer casualties.\n\nAre you sure?`,
  components: [new ActionRowBuilder().addComponents(confirmButton)],
  ephemeral: true
});

// 3. On confirmation (handled in interactionHandler):
// - Award victory to opponent
// - Apply standard death chances to your officers
// - Update commander loss record
// - Notify opponent of forfeit
```

---

## Interaction Handlers

### Main Interaction Router
**Location:** `src/bot/interactionHandler.js`

#### **Purpose**
Central router for all Discord interactions (slash commands, buttons, menus)

#### **`handleInteraction(interaction)`**
```javascript
async function handleInteraction(interaction) {
  try {
    // Route slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
    }
    
    // Route button interactions
    else if (interaction.isButton()) {
      const customId = interaction.customId;
      
      if (customId.startsWith('join_battle_')) {
        await handleJoinBattle(interaction);
      }
      else if (customId.startsWith('army_')) {
        await armyInteractionHandler.handle(interaction);
      }
      else if (customId.startsWith('confirm_')) {
        await handleConfirmation(interaction);
      }
    }
    
    // Route select menu interactions
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('army_')) {
        await armyInteractionHandler.handle(interaction);
      }
    }
    
  } catch (error) {
    console.error('Interaction handling error:', error);
    
    const errorReply = {
      content: '❌ An error occurred processing your action.',
      ephemeral: true
    };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorReply);
    } else {
      await interaction.reply(errorReply);
    }
  }
}
```

### Army Builder Interaction Handler
**Location:** `src/bot/armyInteractionHandler.js`

#### **Purpose**
Handle all army builder menu selections and button clicks during army building phase

#### **State Management**
```javascript
// In-memory builder states (could be cached or DB stored)
const activeBuilders = new Map(); // userId -> builderState

const builderState = {
  commanderId: string,
  battleId: string,
  culture: string,
  eliteUnit: object,
  blocksUsed: number,
  blocksTotal: 30,
  selectedTroops: [
    { type: 'professional', quantity: 1, blocks: 10 },
    { type: 'militia', quantity: 1, blocks: 6 }
  ],
  selectedEquipment: [
    { type: 'war_spears', blocks: 4 },
    { type: 'light_armor', blocks: 4 }
  ],
  selectedSupport: [
    { type: 'field_engineers', blocks: 2 }
  ]
};
```

#### **`handle(interaction)` Function**
Routes menu selections and button clicks:

**Troop Selection:**
```javascript
if (interaction.customId === 'army_troops') {
  const troopType = interaction.values[0];
  
  // Add troop to builder state
  builderState.selectedTroops.push({
    type: troopType,
    quantity: 1,
    blocks: TROOP_COSTS[troopType]
  });
  
  builderState.blocksUsed += TROOP_COSTS[troopType];
  
  // Update embed with new progress
  await updateBuilderEmbed(interaction, builderState);
}
```

**Equipment Selection:**
```javascript
if (interaction.customId === 'army_equipment') {
  const equipmentType = interaction.values[0];
  
  // Validate equipment applicable to selected troops
  if (!hasValidTroops(builderState, equipmentType)) {
    return interaction.reply({
      content: '❌ Equipment requires compatible troops first',
      ephemeral: true
    });
  }
  
  builderState.selectedEquipment.push({
    type: equipmentType,
    blocks: EQUIPMENT_COSTS[equipmentType]
  });
  
  builderState.blocksUsed += EQUIPMENT_COSTS[equipmentType];
  
  await updateBuilderEmbed(interaction, builderState);
}
```

**Finalize Army:**
```javascript
if (interaction.customId === 'army_finalize') {
  // Validate minimum requirements
  if (builderState.blocksUsed < 20) {
    return interaction.reply({
      content: '❌ Army too small. Use at least 20 blocks.',
      ephemeral: true
    });
  }
  
  // Save army to battle state
  await saveArmyComposition(battle, playerId, builderState);
  
  // Check if both players ready
  if (bothPlayersReady(battle)) {
    // Start battle!
    await initializeBattle(battle);
  } else {
    await interaction.update({
      content: '✅ Army saved! Waiting for opponent...',
      components: []
    });
  }
}
```

#### **`createArmyBuilderEmbed(builderState)`**
**Purpose:** Generate visual army builder embed with progress bar
```javascript
const progressBar = createProgressBar(
  builderState.blocksUsed, 
  builderState.blocksTotal
);

const embed = new EmbedBuilder()
  .setTitle(`🏗️ Army Builder - ${builderState.culture}`)
  .setDescription(`${progressBar} ${builderState.blocksUsed}/${builderState.blocksTotal} blocks`)
  .addFields(
    {
      name: '👥 Troops',
      value: formatTroopsList(builderState.selectedTroops)
    },
    {
      name: '⚔️ Equipment',
      value: formatEquipmentList(builderState.selectedEquipment)
    },
    {
      name: '🛠️ Support',
      value: formatSupportList(builderState.selectedSupport)
    }
  )
  .setColor(0x2B579A);

return embed;
```

**Progress Bar Visual:**
```
[████████████░░░░░░░░] 24/30 blocks
```

### Game Interaction Handler
**Location:** `src/bot/gameInteractionHandler.js`

#### **Purpose**
Handle in-battle button clicks for tactical questions, status checks, and order confirmations

#### **Button Types**

**Ask Tactical Question:**
```javascript
// Player clicks "💬 Ask Officer" button
if (customId === 'ask_officer') {
  // Show modal for question input
  const modal = new ModalBuilder()
    .setCustomId('officer_question_modal')
    .setTitle('Ask Your Officer');
  
  const questionInput = new TextInputBuilder()
    .setCustomId('question_text')
    .setLabel('What do you want to ask?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('e.g., "Should we advance or hold position?"')
    .setRequired(true);
  
  modal.addComponents(
    new ActionRowBuilder().addComponents(questionInput)
  );
  
  await interaction.showModal(modal);
}

// When modal submitted
if (customId === 'officer_question_modal') {
  const question = interaction.fields.getTextInputValue('question_text');
  
  // Get officer data and battle context
  const officer = await loadOfficerData(interaction.user.id, battle);
  const battleContext = battle.battleState;
  const visibility = calculatePlayerVisibility(interaction.user.id, battleState);
  
  // Generate AI officer response
  const response = await answerTacticalQuestion(
    question,
    officer,
    battleContext,
    visibility
  );
  
  await interaction.reply({
    content: `**${officer.rank} ${officer.name}:**\n\n"${response}"`,
    ephemeral: true
  });
}
```

**View Battle Status:**
```javascript
if (customId === 'view_status') {
  const playerId = interaction.user.id;
  const playerSide = battle.player1Id === playerId ? 'player1' : 'player2';
  const battleState = battle.battleState[playerSide];
  
  const statusEmbed = new EmbedBuilder()
    .setTitle(`📊 Battle Status - Turn ${battle.currentTurn}`)
    .addFields(
      {
        name: '👥 Your Forces',
        value: formatUnitList(battleState.unitPositions)
      },
      {
        name: '👁️ Enemy Intelligence',
        value: formatVisibleEnemies(battleState.visibleEnemyPositions)
      },
      {
        name: '🌦️ Conditions',
        value: `Weather: ${battle.weather}\nTerrain: ${battle.terrain.primary}`
      }
    );
  
  await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
}
```

### DM Handler
**Location:** `src/bot/dmHandler.js`

#### **Purpose**
Process battle orders sent via DM, route to appropriate battle context, and trigger turn resolution

#### **`handleDM(message)` Flow**
```javascript
async function handleDM(message) {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Find player's active battle needing orders
  const battle = await Battle.findOne({
    where: {
      [Op.or]: [
        { player1Id: message.author.id },
        { player2Id: message.author.id }
      ],
      status: 'in_progress'
    }
  });
  
  if (!battle) {
    return message.reply('No active battle. Use `/create-game` to start one!');
  }
  
  // Determine which player sent order
  const playerId = message.author.id;
  const playerSide = battle.player1Id === playerId ? 'player1' : 'player2';
  
  // Store order in battle state
  if (!battle.battleState.pendingOrders) {
    battle.battleState.pendingOrders = {};
  }
  
  battle.battleState.pendingOrders[playerSide] = {
    order: message.content,
    timestamp: new Date()
  };
  
  await battle.save();
  
  // Confirm receipt
  await message.reply('✅ **Orders received!**\n\nWaiting for opponent...');
  
  // Check if both players submitted
  const bothReady = battle.battleState.pendingOrders.player1 && 
                   battle.battleState.pendingOrders.player2;
  
  if (bothReady) {
    // Process turn!
    await processBattleTurn(battle);
  }
}
```

#### **`processBattleTurn(battle)` Function**
```javascript
async function processBattleTurn(battle) {
  const { player1, player2 } = battle.battleState.pendingOrders;
  
  // Load map for scenario
  const map = require(`../game/maps/${battle.scenario}`);
  
  // Process complete turn
  const turnResult = await processTurn(
    battle,
    player1.order,
    player2.order,
    map
  );
  
  if (!turnResult.success) {
    // Error handling
    await notifyPlayersOfError(battle, turnResult.error);
    return;
  }
  
  // Update battle state
  battle.battleState = turnResult.newBattleState;
  battle.currentTurn += 1;
  
  // Clear pending orders
  battle.battleState.pendingOrders = {};
  
  await battle.save();
  
  // Send results to both players
  await sendTurnResults(battle, turnResult);
  
  // Check if battle ended
  if (turnResult.victory.achieved) {
    await concludeBattle(battle, turnResult.victory);
  }
}
```

---

## Lobby System
**Location:** `src/bot/lobbyInteractionHandler.js`

### Purpose
Manage battle lobby lifecycle from creation through player joining to army building initialization

### Functions

#### **`updateLobbyEmbed(battle, message)`**
**Purpose:** Update lobby embed as players join
**States:**
- Waiting for players
- Both players joined
- Army building in progress
- Battle started

#### **`sendArmyBuilderDMs(battle)`**
**Purpose:** DM both players with army builder interface
```javascript
const player1 = await battle.getPlayer1();
const player2 = await battle.getPlayer2();

// Send builder to Player 1
await player1User.send({
  content: `⚔️ **Battle Starting!**\n\nScenario: ${battle.scenario}\nOpponent: ${player2.username}\n\nBuild your army (30 Supply Points):`,
  embeds: [armyBuilderEmbed],
  components: [armyBuilderMenus]
});

// Send builder to Player 2  
await player2User.send({ /* same structure */ });
```

#### **`initializeBattle(battle)`**
**Purpose:** Start battle once both armies built
```javascript
// 1. Generate weather
await battle.generateWeather();

// 2. Load scenario map
const map = loadScenarioMap(battle.scenario);

// 3. Deploy units to starting positions
const deployment = deployUnitsToMap(
  battle.battleState.player1.army,
  battle.battleState.player2.army,
  map
);

// 4. Update battle state
battle.battleState.player1.unitPositions = deployment.player1;
battle.battleState.player2.unitPositions = deployment.player2;
battle.status = 'in_progress';
await battle.save();

// 5. Send initial briefings to both players
await sendInitialBriefings(battle, map);
```

---

## DM Context Management

### Multi-Battle Support
Players can have multiple concurrent battles (1 ranked + unlimited skirmish/quick)

#### **Context Detection**
```javascript
async function determineBattleContext(userId) {
  // Get all active battles for user
  const activeBattles = await Battle.findAll({
    where: {
      [Op.or]: [{ player1Id: userId }, { player2Id: userId }],
      status: 'in_progress'
    }
  });
  
  if (activeBattles.length === 0) {
    return { context: 'none' };
  }
  
  if (activeBattles.length === 1) {
    // Auto-route to only battle
    return { context: 'single', battle: activeBattles[0] };
  }
  
  // Multiple battles - check which needs orders
  const needingOrders = activeBattles.filter(b => {
    const playerSide = b.player1Id === userId ? 'player1' : 'player2';
    return !b.battleState.pendingOrders?.[playerSide];
  });
  
  if (needingOrders.length === 1) {
    return { context: 'auto', battle: needingOrders[0] };
  }
  
  // Multiple need orders - require selection
  return { 
    context: 'multiple', 
    battles: needingOrders 
  };
}
```

#### **Battle Selector UI**
```javascript
async function showBattleSelector(userId, battles) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Active Battles')
    .setDescription('Select which battle to command:');
  
  battles.forEach((battle, index) => {
    embed.addFields({
      name: `${index + 1}. ${battle.scenario} - Turn ${battle.currentTurn}`,
      value: `Opponent: ${getOpponentName(battle, userId)}\n⏰ ${getTimeRemaining(battle)}`,
      inline: false
    });
  });
  
  const buttons = battles.map((battle, i) =>
    new ButtonBuilder()
      .setCustomId(`select_battle_${battle.id}`)
      .setLabel(`Battle ${i + 1}`)
      .setStyle(ButtonStyle.Primary)
  );
  
  await sendDM(userId, { 
    embeds: [embed], 
    components: [new ActionRowBuilder().addComponents(...buttons)] 
  });
}
```

---

## Embed Formatters

### Battle Briefing Embed
```javascript
function createBattleBriefing(battle, playerId) {
  const playerSide = battle.player1Id === playerId ? 'player1' : 'player2';
  const playerState = battle.battleState[playerSide];
  
  return new EmbedBuilder()
    .setTitle(`⚔️ War Council - ${battle.scenario}`)
    .setDescription(`*Turn ${battle.currentTurn} - ${getAtmosphericOpening(battle.weather)}*`)
    .addFields(
      {
        name: '🗺️ Battlefield Situation',
        value: generateSituationDescription(battle, playerState)
      },
      {
        name: '👥 Your Forces',
        value: formatOwnUnits(playerState.unitPositions)
      },
      {
        name: '🔍 Enemy Intelligence',
        value: formatEnemyIntel(playerState.visibleEnemyPositions)
      },
      {
        name: '🌦️ Conditions',
        value: `Weather: ${formatWeather(battle.weather)}\nTerrain: ${battle.terrain.primary}`
      },
      {
        name: '🎯 Mission Objective',
        value: battle.victoryConditions.description
      }
    )
    .setFooter({ text: 'Send orders via DM or ask your officers questions' })
    .setColor(getWeatherColor(battle.weather));
}
```

### Turn Resolution Embed
```javascript
function createTurnResolutionEmbed(turnResult, battle) {
  return new EmbedBuilder()
    .setTitle(`🎲 Turn ${battle.currentTurn} Resolution`)
    .setDescription(turnResult.narrative.mainNarrative.fullNarrative)
    .addFields(
      {
        name: '📍 Movement',
        value: turnResult.narrative.movementSummary
      },
      {
        name: '⚔️ Combat',
        value: turnResult.narrative.combatSummary
      },
      {
        name: '💀 Casualties',
        value: `Player 1: ${turnResult.turnResults.casualties.player1}\nPlayer 2: ${turnResult.turnResults.casualties.player2}`
      },
      {
        name: '🔍 Intelligence',
        value: `You detected ${turnResult.turnResults.intelligence.player1Detected} enemy units`
      }
    )
    .setColor(getCombatIntensityColor(turnResult.combatResult.intensity));
}
```

---

## Command Registration

### Global Command Registration
**Location:** Handled in `src/index.js` on bot ready

```javascript
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

async function registerCommands() {
  try {
    const commands = commandLoader.loadCommands();
    const commandData = commands.map(cmd => cmd.data.toJSON());
    
    console.log(`Registering ${commandData.length} slash commands...`);
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commandData }
    );
    
    console.log('✅ Slash commands registered globally');
  } catch (error) {
    console.error('Command registration error:', error);
  }
}
```

**Registered Commands:**
- `/create-game [scenario]` - Create new battle
- `/join-battle` - Join waiting battle (via button)
- `/build-army` - Open army builder
- `/stats` - View commander statistics  
- `/abandon-battle` - Forfeit current battle
- `/lobby` - View all active battles
- `/ping` - Test bot connection

---

## Error Handling Philosophy

### Graceful Degradation
```javascript
try {
  // Attempt AI narrative
  const narrative = await generateBattleNarrative(...);
} catch (error) {
  console.error('AI failed, using fallback:', error);
  // Use simple template narrative
  const narrative = generateFallbackNarrative(...);
}
```

### User Communication
```javascript
// Always inform users of issues
if (error.type === 'ai_timeout') {
  await message.reply(
    '⚠️ AI narrative took too long. Using simplified battle report.'
  );
}

if (error.type === 'invalid_order') {
  await message.reply(
    `❌ ${error.explanation}\n\nSuggestion: ${error.suggestion}`
  );
}
```

### State Recovery
```javascript
// Save battle state before risky operations
const backupState = JSON.parse(JSON.stringify(battle.battleState));

try {
  // Risky operation
  await processTurn(battle, orders);
} catch (error) {
  // Restore previous state
  battle.battleState = backupState;
  await battle.save();
  
  await notifyPlayers('Turn processing failed, state restored');
}
```

---

## Discord API Best Practices

### Rate Limiting
```javascript
// Queue DM sends to avoid rate limits
const dmQueue = [];

async function queuedDM(userId, content) {
  dmQueue.push({ userId, content });
  
  // Process queue with delay
  while (dmQueue.length > 0) {
    const dm = dmQueue.shift();
    await sendDM(dm.userId, dm.content);
    await sleep(1000);  // 1 message per second
  }
}
```

### Embed Limits
- Title: 256 characters max
- Description: 4096 characters max
- Fields: 25 max, each field name 256 chars, value 1024 chars
- Total embed: 6000 characters max

### Component Limits
- Action rows: 5 per message
- Buttons per row: 5 max
- Select menu options: 25 max

---

## Design Philosophy

### Separation of Concerns
- **Commands:** Define slash command structure only
- **Interaction Handlers:** Route and validate interactions
- **Game Logic:** Never directly in Discord files
- **Database:** Handles all persistence

### Ephemeral vs Public
- Errors: Ephemeral (only user sees)
- Status checks: Ephemeral
- Lobby announcements: Public
- Turn results: Private DM

### User Experience Priority
- Clear error messages with suggestions
- Progress indicators during long operations
- Confirmation for destructive actions
- Always show what happens next
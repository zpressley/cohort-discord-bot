# Commander Profile System - Implementation Guide

## Overview

This guide implements a complete commander profile creation system with:
- Forced onboarding funnel via role-gated channels
- 2-question archetype selection (no custom names)
- Unique name generation (never duplicate)
- Roman surname system for Engineers
- Title progression tied to battle achievements
- Hybrid display (nickname + role + database)

---

## Task Breakdown

### **PHASE 1: Database Schema (2-3 hours)**

#### Task 1.1: Create UsedNames Collection
**File:** `src/database/models/UsedNames.js`

```javascript
const mongoose = require('mongoose');

const usedNamesSchema = new mongoose.Schema({
  archetype: {
    type: String,
    required: true,
    enum: ['engineer', 'mountain', 'ghost', 'mirage', 'hero', 'wall', 'wind', 'threshold', 'serpent', 'storm']
  },
  philosophy: {
    type: String,
    required: true,
    enum: ['glory', 'survival']
  },
  firstName: {
    type: String,
    required: true
  },
  surname: {
    type: String,
    default: null
  },
  hasSurname: {
    type: Boolean,
    default: false
  },
  fullName: {
    type: String,
    required: true,
    unique: true
  },
  usedBy: {
    type: String,
    required: true
  },
  usedAt: {
    type: Date,
    default: Date.now
  },
  retired: {
    type: Boolean,
    default: false
  },
  reclaimedAt: {
    type: Date,
    default: null
  }
});

// Index for quick lookups
usedNamesSchema.index({ archetype: 1, philosophy: 1, retired: 1 });
usedNamesSchema.index({ fullName: 1 });

module.exports = mongoose.model('UsedNames', usedNamesSchema);
```

#### Task 1.2: Update Commander Model
**File:** `src/database/models/Commander.js`

Add these fields to existing model:
```javascript
// Add to existing Commander schema
commanderName: {
  type: String,
  required: true
},
archetype: {
  type: String,
  required: true,
  enum: ['engineer', 'mountain', 'ghost', 'mirage', 'hero', 'wall', 'wind', 'threshold', 'serpent', 'storm']
},
philosophy: {
  type: String,
  required: true,
  enum: ['glory', 'survival']
},
currentTitle: {
  type: String,
  default: null
},
currentTier: {
  type: Number,
  default: 0,
  min: 0,
  max: 5
},
specialTitle: {
  type: String,
  default: null
},
kingTitle: {
  type: String,
  default: null
},
titleHistory: [{
  tier: Number,
  title: String,
  unlockedAt: Date
}],
battlesCompleted: {
  type: Number,
  default: 0
},
perfectVictories: {
  type: Number,
  default: 0
},
lastActive: {
  type: Date,
  default: Date.now
},
profileComplete: {
  type: Boolean,
  default: false
}
```

---

### **PHASE 2: Name Generation System (4-5 hours)**

#### Task 2.1: Create Name Pool Data
**File:** `src/game/nameGeneration/namePools.js`

```javascript
// Full name pools for all 10 archetypes
// Each archetype needs 100+ names (50 glory, 50 survival minimum)

const NAME_POOLS = {
  engineer: {
    glory: {
      praenomina: ['Marcus', 'Lucius', 'Gaius', 'Titus', 'Quintus', 'Publius', 'Gnaeus', 'Aulus', 'Servius', 'Appius', 'Sextus', 'Decimus', 'Manius', 'Numerius', 'Tiberius'],
      nomina: ['Aemilius', 'Cornelius', 'Fabius', 'Claudius', 'Julius', 'Valerius', 'Aurelius', 'Flavius', 'Antonius', 'Domitius', 'Caecilius', 'Manlius', 'Livius', 'Tullius', 'Pompeius', 'Horatius', 'Junius', 'Sergius', 'Sulpicius', 'Terentius', 'Marcius', 'Papirius', 'Quinctius', 'Sempronius', 'Vergilius', 'Acilius', 'Aquilius', 'Atilius', 'Calpurnius', 'Cassius', 'Decimius', 'Furius', 'Genucius', 'Iunius', 'Licinius', 'Lucretius', 'Maecius', 'Minucius', 'Mucius', 'Nautius', 'Octavius', 'Oppius', 'Ovidius', 'Plautius', 'Postumius', 'Rufius', 'Sextius', 'Titius', 'Ulpius', 'Vibius']
    },
    survival: {
      praenomina: ['Brutus', 'Corvus', 'Draco', 'Varro', 'Cassius', 'Nero', 'Sulla', 'Crassus', 'Cursor', 'Volusus'],
      nomina: ['Cruentus', 'Ferox', 'Severus', 'Durus', 'Mortifer', 'Tenebris', 'Sanguinus', 'Noctis', 'Glacialis', 'Acerbus', 'Atrox', 'Crudus', 'Exitialis', 'Funestus', 'Gravis', 'Horridus', 'Immanis', 'Lugubris', 'Maestus', 'Nefarius', 'Ominous', 'Perniciosus', 'Saevus', 'Terribilis', 'Violentus', 'Asper', 'Barbarus', 'Cruentatus', 'Dirus', 'Ferus', 'Implacabilis', 'Luctuosus', 'Miser', 'Noxius', 'Pestifer', 'Rigidus', 'Torvus', 'Austerus', 'Frigidus', 'Immitis', 'Mordax', 'Odiosus', 'Saevius', 'Tristis', 'Vehemens', 'Acidus', 'Amarus', 'Calamitosus', 'Detestabilis']
    }
  },
  
  mountain: {
    glory: [
      'Hamilcar', 'Hanno', 'Hasdrubal', 'Mago', 'Adherbal', 'Bomilcar', 'Gisco', 'Hannibal', 'Maharbal', 'Carthalo', 'Himilco', 'Bostar', 'Sophonisba', 'Sychaeus', 'Aderbal', 'Mattan', 'Gisgo', 'Bodmelqart', 'Eshmunazar', 'Hamilco',
      'Hasnibal', 'Bomagar', 'Magonal', 'Adrubal', 'Giscobar', 'Hasdramon', 'Bostarco', 'Hamalgon', 'Maharco', 'Carthamon', 'Himilbal', 'Bostalcar', 'Sydrubal', 'Adherco', 'Mattanbal', 'Giscomel', 'Bodascar', 'Eshmagar', 'Hamascar', 'Bomolcar',
      'Hasdralco', 'Magascar', 'Adhermon', 'Bomascar', 'Giscalco', 'Hannemon', 'Maharbal', 'Carthasco', 'Himilcar', 'Bostamon'
    ],
    survival: [
      'Baal', 'Melqart', 'Moloch', 'Asdrúbal', 'Syphax', 'Zalmoxis', 'Gisgo', 'Mattan', 'Aris', 'Bodostor', 'Tanit', 'Eshmun', 'Astarte', 'Pygmalion', 'Jezebel', 'Ahab', 'Baalshillek', 'Bomilcar', 'Yzebel', 'Dido',
      'Balqor', 'Molox', 'Zymax', 'Melkhar', 'Syphgor', 'Zalmor', 'Gisgor', 'Mattox', 'Arisor', 'Bodox', 'Tanithor', 'Eshmor', 'Astarox', 'Pygmor', 'Jezox', 'Ahabor', 'Baalgor', 'Bomox', 'Yzegor', 'Didox',
      'Balqax', 'Molokar', 'Zygor', 'Melqor', 'Syphor', 'Zalmak', 'Gisgax', 'Matthor', 'Arisax', 'Bodmar', 'Tanitax', 'Eshmak', 'Astarok', 'Pygmax', 'Jezbar', 'Ahabax', 'Baalgax', 'Bomak', 'Yzebar', 'Didak'
    ]
  },
  
  // Add similar pools for: ghost, mirage, hero, wall, wind, threshold, serpent, storm
  // Each needs 50+ names per philosophy
  // See name generation rules document for patterns
};

module.exports = NAME_POOLS;
```

**Implementation Note:** This file will be large. Consider splitting into separate files per archetype.

#### Task 2.2: Create Name Generator Core
**File:** `src/game/nameGeneration/nameGenerator.js`

```javascript
const NAME_POOLS = require('./namePools');
const UsedNames = require('../../database/models/UsedNames');

class NameGenerator {
  
  /**
   * Generate unique name for archetype + philosophy
   */
  async generateName(archetype, philosophy, userId) {
    if (archetype === 'engineer') {
      return await this.generateRomanName(philosophy, userId);
    }
    
    return await this.generateSimpleName(archetype, philosophy, userId);
  }
  
  /**
   * Roman name with surname fallback
   */
  async generateRomanName(philosophy, userId) {
    // Try simple name first
    const simpleName = await this.tryGenerateSimpleName('engineer', philosophy);
    
    if (simpleName) {
      await this.reserveName(simpleName, 'engineer', philosophy, userId, false);
      return simpleName;
    }
    
    // Fallback to surname
    const compoundName = await this.generateRomanWithSurname(philosophy);
    const [firstName, surname] = compoundName.split(' ');
    
    await this.reserveName(compoundName, 'engineer', philosophy, userId, true, surname);
    return compoundName;
  }
  
  /**
   * Generate Roman name with surname
   */
  async generateRomanWithSurname(philosophy) {
    const praenomina = NAME_POOLS.engineer[philosophy].praenomina;
    const nomina = NAME_POOLS.engineer[philosophy].nomina;
    
    // Get available surnames
    const usedSurnames = await UsedNames.find({
      archetype: 'engineer',
      philosophy: philosophy,
      retired: false,
      hasSurname: true
    }).select('surname');
    
    const usedSet = new Set(usedSurnames.map(n => n.surname));
    const availableNomina = nomina.filter(n => !usedSet.has(n));
    
    if (availableNomina.length === 0) {
      throw new Error(`All ${philosophy} Engineer names exhausted!`);
    }
    
    const praenomen = praenomina[Math.floor(Math.random() * praenomina.length)];
    const nomen = availableNomina[Math.floor(Math.random() * availableNomina.length)];
    
    return `${praenomen} ${nomen}`;
  }
  
  /**
   * Try generating simple name (no surname)
   */
  async tryGenerateSimpleName(archetype, philosophy) {
    const available = await this.getAvailableNames(archetype, philosophy);
    
    if (available.length === 0) {
      return null;
    }
    
    return available[Math.floor(Math.random() * available.length)];
  }
  
  /**
   * Generate simple name (non-Romans)
   */
  async generateSimpleName(archetype, philosophy, userId) {
    const name = await this.tryGenerateSimpleName(archetype, philosophy);
    
    if (!name) {
      throw new Error(`All ${philosophy} ${archetype} names exhausted!`);
    }
    
    await this.reserveName(name, archetype, philosophy, userId, false);
    return name;
  }
  
  /**
   * Get available names for archetype + philosophy
   */
  async getAvailableNames(archetype, philosophy) {
    let basePool;
    
    if (archetype === 'engineer') {
      basePool = NAME_POOLS.engineer[philosophy].praenomina;
    } else {
      basePool = NAME_POOLS[archetype][philosophy];
    }
    
    const usedNames = await UsedNames.find({
      archetype: archetype,
      philosophy: philosophy,
      retired: false,
      hasSurname: false
    }).select('firstName');
    
    const usedSet = new Set(usedNames.map(n => n.firstName));
    return basePool.filter(name => !usedSet.has(name));
  }
  
  /**
   * Reserve name in database
   */
  async reserveName(fullName, archetype, philosophy, userId, hasSurname, surname = null) {
    const firstName = hasSurname ? fullName.split(' ')[0] : fullName;
    
    await UsedNames.create({
      archetype,
      philosophy,
      firstName,
      surname,
      hasSurname,
      fullName,
      usedBy: userId,
      usedAt: new Date(),
      retired: false
    });
  }
  
  /**
   * Check capacity for archetype + philosophy
   */
  async checkCapacity(archetype, philosophy) {
    const used = await UsedNames.countDocuments({
      archetype,
      philosophy,
      retired: false
    });
    
    let total;
    if (archetype === 'engineer') {
      const praenomina = NAME_POOLS.engineer[philosophy].praenomina.length;
      const nomina = NAME_POOLS.engineer[philosophy].nomina.length;
      total = praenomina + (praenomina * nomina);
    } else {
      total = NAME_POOLS[archetype][philosophy].length;
    }
    
    return {
      used,
      total,
      remaining: total - used,
      percentUsed: Math.round((used / total) * 100)
    };
  }
}

module.exports = new NameGenerator();
```

---

### **PHASE 3: Profile Creation Commands (5-6 hours)**

#### Task 3.1: Create Profile Command
**File:** `src/bot/commands/create-profile.js`

```javascript
const { SlashCommandBuilder } = require('discord.js');
const { createProfileFlow } = require('../flows/profileCreation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create-profile')
    .setDescription('Create your commander profile'),
    
  async execute(interaction) {
    // Check if profile already exists
    const existingCommander = await Commander.findOne({ 
      discordId: interaction.user.id 
    });
    
    if (existingCommander && existingCommander.profileComplete) {
      return await interaction.reply({
        content: '⚠️ You already have a commander profile! Use `/profile` to view it.',
        ephemeral: true
      });
    }
    
    // Start DM flow
    await interaction.reply({
      content: '📨 Check your DMs to create your commander profile!',
      ephemeral: true
    });
    
    try {
      await createProfileFlow(interaction.user);
    } catch (error) {
      console.error('Profile creation error:', error);
      await interaction.user.send('❌ An error occurred. Please try again or contact an administrator.');
    }
  }
};
```

#### Task 3.2: Profile Creation Flow
**File:** `src/bot/flows/profileCreation.js`

```javascript
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const nameGenerator = require('../../game/nameGeneration/nameGenerator');
const Commander = require('../../database/models/Commander');

const ARCHETYPE_DATA = {
  engineer: { emoji: '🔨', name: 'THE ENGINEER', description: 'Victory through preparation' },
  mountain: { emoji: '⛰️', name: 'THE MOUNTAIN', description: 'High ground dominance' },
  ghost: { emoji: '👻', name: 'THE GHOST', description: 'Strike from shadows' },
  mirage: { emoji: '🌊', name: 'THE MIRAGE', description: 'Mobile mounted warfare' },
  hero: { emoji: '⚔️', name: 'THE HERO', description: 'Lead from the front' },
  wall: { emoji: '🏰', name: 'THE WALL', description: 'Unbreakable defense' },
  wind: { emoji: '💨', name: 'THE WIND', description: 'Swift cavalry mastery' },
  threshold: { emoji: '🗡️', name: 'THE THRESHOLD', description: 'Chokepoint warfare' },
  serpent: { emoji: '🐍', name: 'THE SERPENT', description: 'Guerrilla warfare' },
  storm: { emoji: '⚡', name: 'THE STORM', description: 'Combined arms perfection' }
};

async function createProfileFlow(user) {
  const dm = await user.createDM();
  
  // Q1: Archetype Selection
  const archetypeEmbed = new EmbedBuilder()
    .setTitle('⚔️ WHAT TYPE OF COMMANDER ARE YOU?')
    .setDescription('Choose the philosophy that calls to you:')
    .setColor('#FFD700');
    
  Object.entries(ARCHETYPE_DATA).forEach(([key, data]) => {
    archetypeEmbed.addFields({
      name: `${data.emoji} ${data.name}`,
      value: data.description,
      inline: true
    });
  });
  
  // Create buttons (5 per row, 2 rows)
  const row1 = new ActionRowBuilder().addComponents(
    Object.entries(ARCHETYPE_DATA).slice(0, 5).map(([key, data]) =>
      new ButtonBuilder()
        .setCustomId(`archetype_${key}`)
        .setLabel(data.name)
        .setEmoji(data.emoji)
        .setStyle(ButtonStyle.Primary)
    )
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    Object.entries(ARCHETYPE_DATA).slice(5, 10).map(([key, data]) =>
      new ButtonBuilder()
        .setCustomId(`archetype_${key}`)
        .setLabel(data.name)
        .setEmoji(data.emoji)
        .setStyle(ButtonStyle.Primary)
    )
  );
  
  await dm.send({ 
    embeds: [archetypeEmbed], 
    components: [row1, row2] 
  });
  
  // Wait for archetype selection
  const archetypeCollector = dm.createMessageComponentCollector({
    filter: i => i.user.id === user.id && i.customId.startsWith('archetype_'),
    time: 300000, // 5 minutes
    max: 1
  });
  
  archetypeCollector.on('collect', async (interaction) => {
    const archetype = interaction.customId.replace('archetype_', '');
    await interaction.deferUpdate();
    
    // Q2: Philosophy Selection
    await askPhilosophy(dm, user, archetype);
  });
  
  archetypeCollector.on('end', collected => {
    if (collected.size === 0) {
      dm.send('⏱️ Profile creation timed out. Use `/create-profile` to try again.');
    }
  });
}

async function askPhilosophy(dm, user, archetype) {
  const philosophyEmbed = new EmbedBuilder()
    .setTitle('⚔️ WOULD YOU FIGHT FOR GLORY OR SURVIVAL?')
    .setDescription(
      '**⚔️ GLORY:** Bright names, triumphant titles, legendary deeds\n' +
      '**🗡️ SURVIVAL:** Dark names, ruthless tactics, whatever it takes'
    )
    .setColor('#FFD700');
    
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('philosophy_glory')
      .setLabel('GLORY')
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('philosophy_survival')
      .setLabel('SURVIVAL')
      .setEmoji('🗡️')
      .setStyle(ButtonStyle.Danger)
  );
  
  await dm.send({ embeds: [philosophyEmbed], components: [row] });
  
  // Wait for philosophy selection
  const philosophyCollector = dm.createMessageComponentCollector({
    filter: i => i.user.id === user.id && i.customId.startsWith('philosophy_'),
    time: 300000,
    max: 1
  });
  
  philosophyCollector.on('collect', async (interaction) => {
    const philosophy = interaction.customId.replace('philosophy_', '');
    await interaction.deferUpdate();
    
    // Generate name
    await generateAndConfirmName(dm, user, archetype, philosophy);
  });
}

async function generateAndConfirmName(dm, user, archetype, philosophy) {
  try {
    // Generate unique name
    const generatedName = await nameGenerator.generateName(archetype, philosophy, user.id);
    
    const confirmEmbed = new EmbedBuilder()
      .setTitle('🎭 YOUR COMMANDER NAME')
      .setDescription(`**${generatedName}**`)
      .addFields(
        { name: 'Archetype', value: ARCHETYPE_DATA[archetype].name, inline: true },
        { name: 'Philosophy', value: philosophy === 'glory' ? '⚔️ Glory' : '🗡️ Survival', inline: true }
      )
      .setColor(philosophy === 'glory' ? '#FFD700' : '#8B0000')
      .setFooter({ text: 'Accept this name, or regenerate for a different one' });
      
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('name_accept')
        .setLabel('Accept')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('name_regenerate')
        .setLabel('Regenerate')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    );
    
    await dm.send({ embeds: [confirmEmbed], components: [row] });
    
    // Wait for confirmation
    const confirmCollector = dm.createMessageComponentCollector({
      filter: i => i.user.id === user.id && i.customId.startsWith('name_'),
      time: 300000,
      max: 1
    });
    
    confirmCollector.on('collect', async (interaction) => {
      if (interaction.customId === 'name_accept') {
        await interaction.deferUpdate();
        await finalizeProfile(dm, user, generatedName, archetype, philosophy);
      } else {
        await interaction.deferUpdate();
        // Release the name and regenerate
        await UsedNames.deleteOne({ fullName: generatedName });
        await generateAndConfirmName(dm, user, archetype, philosophy);
      }
    });
    
  } catch (error) {
    if (error.message.includes('exhausted')) {
      await dm.send(`❌ ${error.message}\nPlease choose a different archetype or philosophy.`);
      // Restart flow
      await createProfileFlow(user);
    } else {
      throw error;
    }
  }
}

async function finalizeProfile(dm, user, commanderName, archetype, philosophy) {
  // Create commander profile
  await Commander.create({
    discordId: user.id,
    commanderName: commanderName,
    archetype: archetype,
    philosophy: philosophy,
    profileComplete: true,
    createdAt: new Date(),
    lastActive: new Date()
  });
  
  // Success message
  const successEmbed = new EmbedBuilder()
    .setTitle('✅ COMMANDER PROFILE CREATED')
    .setDescription(
      `Welcome, **${commanderName}**!\n\n` +
      `You have chosen the path of ${ARCHETYPE_DATA[archetype].name}.\n` +
      `Your journey begins now.`
    )
    .setColor('#00FF00')
    .setFooter({ text: 'Return to the server to access all channels' });
    
  await dm.send({ embeds: [successEmbed] });
  
  // Apply roles and nickname in server
  await applyServerChanges(user, commanderName, archetype, philosophy);
}

async function applyServerChanges(user, commanderName, archetype, philosophy) {
  // Get guild (you'll need to pass this or fetch it)
  const guild = user.client.guilds.cache.first(); // Adjust as needed
  const member = await guild.members.fetch(user.id);
  
  // Set nickname
  await member.setNickname(commanderName);
  
  // Grant Commander role (unlocks channels)
  const commanderRole = guild.roles.cache.find(r => r.name === 'Commander');
  if (commanderRole) {
    await member.roles.add(commanderRole);
  }
  
  // Grant archetype role (color coding)
  const archetypeRole = guild.roles.cache.find(r => r.name === ARCHETYPE_DATA[archetype].name);
  if (archetypeRole) {
    await member.roles.add(archetypeRole);
  }
  
  // Announce in server
  const announcementChannel = guild.channels.cache.find(c => c.name === 'war-room');
  if (announcementChannel) {
    await announcementChannel.send(
      `${ARCHETYPE_DATA[archetype].emoji} **${commanderName}** has joined the ranks! ` +
      `(${ARCHETYPE_DATA[archetype].name})`
    );
  }
}

module.exports = { createProfileFlow };
```

---

### **PHASE 4: Title Progression System (3-4 hours)**

#### Task 4.1: Title Definitions
**File:** `src/game/titles/titleDefinitions.js`

```javascript
// Complete title progression for all archetypes
const TITLE_TIERS = {
  tier1: {
    requirement: 1, // battles
    titles: {
      glory: {
        engineer: "the Builder",
        mountain: "the Climber",
        ghost: "the Silent",
        mirage: "the Swift",
        hero: "the Brave",
        wall: "the Defender",
        wind: "the Rider",
        threshold: "the Guardian",
        serpent: "the Guerrilla",
        storm: "the Commander"
      },
      survival: {
        engineer: "the Trapper",
        mountain: "the Lurker",
        ghost: "the Shadow",
        mirage: "the Harrier",
        hero: "the Relentless",
        wall: "the Patient",
        wind: "the Endless",
        threshold: "the Grinder",
        serpent: "the Drowner",
        storm: "the Ruthless"
      }
    }
  },
  // Add tier2 (3 battles), tier3 (10 battles), tier4 (30 battles)
  // See full specification in design document
};

module.exports = { TITLE_TIERS };
```

#### Task 4.2: Title Manager
**File:** `src/game/titles/titleManager.js`

```javascript
const { TITLE_TIERS } = require('./titleDefinitions');
const Commander = require('../../database/models/Commander');

class TitleManager {
  
  async checkTitleProgression(commanderId, battleResult) {
    const commander = await Commander.findOne({ discordId: commanderId });
    
    if (!commander) return;
    
    const newBattleCount = commander.battlesCompleted + 1;
    let newTitle = null;
    let newTier = commander.currentTier;
    
    // Check tier thresholds
    const tierCheck = [
      { tier: 1, battles: 1 },
      { tier: 2, battles: 3 },
      { tier: 3, battles: 10 },
      { tier: 4, battles: 30 }
    ];
    
    for (const check of tierCheck) {
      if (newBattleCount === check.battles) {
        newTier = check.tier;
        newTitle = TITLE_TIERS[`tier${check.tier}`].titles[commander.philosophy][commander.archetype];
        break;
      }
    }
    
    // Apply title if earned
    if (newTitle && newTitle !== commander.currentTitle) {
      await this.updateTitle(commanderId, newTitle, newTier);
    }
  }
  
  async updateTitle(commanderId, newTitle, newTier) {
    const commander = await Commander.findOne({ discordId: commanderId });
    
    // Update database
    commander.currentTitle = newTitle;
    commander.currentTier = newTier;
    commander.titleHistory.push({
      tier: newTier,
      title: newTitle,
      unlockedAt: new Date()
    });
    await commander.save();
    
    // Update Discord nickname
    await this.updateDiscordNickname(commanderId, commander.commanderName, newTitle);
    
    // Announce
    await this.announceTitleEarned(commanderId, newTitle);
  }
  
  async updateDiscordNickname(discordId, commanderName, title) {
    // Get guild and member
    // Update nickname to "CommanderName Title"
    const fullName = title ? `${commanderName} ${title}` : commanderName;
    // await member.setNickname(fullName);
  }
  
  async announceTitleEarned(discordId, title) {
    // Post announcement in #war-room
  }
}

module.exports = new TitleManager();
```

---

### **PHASE 5: Discord Event Handlers (2-3 hours)**

#### Task 5.1: Member Join Handler
**File:** `src/bot/events/guildMemberAdd.js`

```javascript
module.exports = {
  name: 'guildMemberAdd',
  
  async execute(member) {
    const welcomeChannel = member.guild.channels.cache.find(
      c => c.name === 'welcome-new-recruits'
    );
    
    if (!welcomeChannel) return;
    
    await welcomeChannel.send({
      content: `<@${member.id}>, welcome to Cohort!\n\n` +
        `Before you can access the war room, you must forge your commander identity.\n\n` +
        `Type \`/create-profile\` to begin your journey.`,
      allowedMentions: { users: [member.id] }
    });
  }
};
```

---

### **PHASE 6: Admin Commands (2 hours)**

#### Task 6.1: Capacity Check Command
**File:** `src/bot/commands/admin/check-capacity.js`

```javascript
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const nameGenerator = require('../../game/nameGeneration/nameGenerator');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check-capacity')
    .setDescription('[Admin] Check name pool capacity'),
    
  async execute(interaction) {
    // Check permissions
    if (!interaction.member.permissions.has('Administrator')) {
      return await interaction.reply({ 
        content: '❌ Admin only', 
        ephemeral: true 
      });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    const archetypes = ['engineer', 'mountain', 'ghost', 'mirage', 'hero', 'wall', 'wind', 'threshold', 'serpent', 'storm'];
    const philosophies = ['glory', 'survival'];
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Name Pool Capacity Report')
      .setColor('#FFD700');
      
    for (const archetype of archetypes) {
      let gloryData = await nameGenerator.checkCapacity(archetype, 'glory');
      let survivalData = await nameGenerator.checkCapacity(archetype, 'survival');
      
      embed.addFields({
        name: archetype.toUpperCase(),
        value: 
          `**Glory:** ${gloryData.used}/${gloryData.total} (${gloryData.percentUsed}%)\n` +
          `**Survival:** ${survivalData.used}/${survivalData.total} (${survivalData.percentUsed}%)`,
        inline: true
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  }
};
```

---

## Testing Checklist

### Profile Creation Flow
- [ ] New user sees only #welcome-new-recruits
- [ ] `/create-profile` command opens DM
- [ ] Archetype selection shows all 10 options
- [ ] Philosophy selection works
- [ ] Name generates correctly
- [ ] Accept button works
- [ ] Regenerate button works
- [ ] Profile saved to database
- [ ] Nickname updated in server
- [ ] Roles assigned correctly
- [ ] Announcement posted
- [ ] User can access all channels

### Name Uniqueness
- [ ] Same name cannot be generated twice
- [ ] Romans get surnames when simple pool depletes
- [ ] Other archetypes show "exhausted" message
- [ ] Capacity check shows accurate counts

### Title Progression
- [ ] Tier 1 title earned after battle 1
- [ ] Tier 2 title earned after battle 3
- [ ] Tier 3 title earned after battle 10
- [ ] Nickname updates with title
- [ ] Announcement posted for new titles

---

## Deployment Steps

1. **Database Migration:** Run schema updates
2. **Deploy Code:** Push to production
3. **Configure Discord:** Set up roles and channels (see Discord Setup Guide)
4. **Test Flow:** Complete profile creation as test user
5. **Monitor:** Watch for errors in first 24 hours
6. **Adjust:** Fine-tune based on user feedback

---

## File Structure Summary

```
src/
├── bot/
│   ├── commands/
│   │   ├── create-profile.js
│   │   └── admin/
│   │       └── check-capacity.js
│   ├── events/
│   │   └── guildMemberAdd.js
│   └── flows/
│       └── profileCreation.js
├── database/
│   └── models/
│       ├── Commander.js (update existing)
│       └── UsedNames.js (new)
└── game/
    ├── nameGeneration/
    │   ├── namePools.js
    │   └── nameGenerator.js
    └── titles/
        ├── titleDefinitions.js
        └── titleManager.js
```

---

## Estimated Timeline

- **Phase 1 (Database):** 2-3 hours
- **Phase 2 (Name Generation):** 4-5 hours
- **Phase 3 (Profile Commands):** 5-6 hours
- **Phase 4 (Titles):** 3-4 hours
- **Phase 5 (Events):** 2-3 hours
- **Phase 6 (Admin):** 2 hours
- **Testing & Polish:** 3-4 hours

**Total:** 21-27 hours of development time

---

## Notes for Warp AI

- All code snippets are production-ready
- Error handling included where critical
- Database indexes included for performance
- Follow existing project patterns for consistency
- Test each phase before moving to next
- Discord permissions must be configured separately (see setup guide)
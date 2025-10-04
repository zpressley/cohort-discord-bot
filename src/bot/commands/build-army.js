const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TROOP_QUALITY, ARMOR_CATEGORIES, SHIELD_OPTIONS, SUPPORT_SPECIALISTS, CULTURAL_SP_BUDGETS } = require('../../game/armyData');

// Cultural elite units data - Starting 8 Cultures (ONLY ONE DECLARATION)
const CULTURES = {
    'Roman Republic': { 
        elite: 'Praetorian Guard', 
        size: 80, 
        description: 'Professional legionnaires with tactical adaptability',
        perks: ['Engineering mastery', 'Professional discipline']
    },
    'Macedonian Kingdoms': { 
        elite: 'Silver Shields', 
        size: 80, 
        description: 'Battle-hardened professionals with combined arms',
        perks: ['Veterans of war', 'Equipment flexibility']
    },
    'Spartan City-State': { 
        elite: 'Lacedaimonian Guards', 
        size: 40, 
        description: 'Elite warriors with death-before-dishonor',
        perks: ['Fight to the last man', 'Superior perioeci militia']
    },
    'Carthaginian Empire': { 
        elite: 'The Sacred Band', 
        size: 100, 
        description: 'Cosmopolitan, professionally diverse',
        perks: ['War elephant terror', 'Merchant wealth (+2 SP)']
    },
    'Kingdom of Kush': { 
        elite: 'Children of the Golden Bow', 
        size: 80, 
        description: 'Master archers and desert warriors',
        perks: ['Desert mastery', 'Archer-cavalry coordination']
    },
    'Berber Confederations': { 
        elite: 'The Blue Men', 
        size: 80, 
        description: 'Desert cavalry with survival warfare',
        perks: ['Desert navigation mastery', 'Tribal confederation tactics']
    },
    'Sarmatian Confederations': { 
        elite: 'Iron Scale Riders', 
        size: 80, 
        description: 'Heavy cavalry-archers with dual-mode combat',
        perks: ['Dual-mode combat mastery', 'Master of feigned retreat']
    },
    'Han Dynasty': { 
        elite: 'Feathered Forest Guard', 
        size: 100, 
        description: 'Elite mixed troops with advanced technology',
        perks: ['Advanced technology', 'Han farming techniques (+20% unit size)']
    }
};

// Store army compositions temporarily (in production, this would go to database)
const armyCompositions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build-army')
        .setDescription('Build your ancient army using the 5-step Supply Point system'),
    
    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            
            // Get or create commander
            const [commander, created] = await models.Commander.findOrCreate({
                where: { discordId: interaction.user.id },
                defaults: {
                    discordId: interaction.user.id,
                    username: interaction.user.username
                }
            });

            if (created || !commander.culture) {
                await interaction.reply({
                    content: '🏺 Choose your ancient civilization first:',
                    components: [createCultureSelectMenu()],
                    ephemeral: true
                });
                return;
            }

            // Initialize army composition if not exists
            if (!armyCompositions.has(interaction.user.id)) {
                const startingSP = CULTURAL_SP_BUDGETS[commander.culture] || 30;
                armyCompositions.set(interaction.user.id, {
                    culture: commander.culture,
                    units: [], // Array of complete units with all 5 steps
                    support: {},
                    totalSP: startingSP,
                    usedSP: 0 // Elite unit is free (0 SP)
                });
            }

            await showMainArmyBuilder(interaction, commander);

        } catch (error) {
            console.error('Build army command error:', error);
            await interaction.reply({
                content: '❌ Error accessing army builder. Please try again.',
                ephemeral: true
            });
        }
    }
};

function createCultureSelectMenu() {
    const options = Object.entries(CULTURES).map(([culture, data]) => ({
        label: culture,
        description: `Elite: ${data.elite} (${data.size} warriors)`,
        value: culture
    }));

    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select-culture')
                .setPlaceholder('Choose your ancient civilization...')
                .addOptions(options)
        );
}

async function showMainArmyBuilder(interaction, commander) {
    const composition = armyCompositions.get(interaction.user.id);
    const cultureData = CULTURES[commander.culture];
    
    // Calculate current army status
    const spUsed = composition.usedSP;
    const spAvailable = composition.totalSP - spUsed;
    const progressBar = createProgressBar(spUsed, composition.totalSP);
    
    // Build army composition display
    let unitsDisplay = `**Elite Unit (0 SP - Cultural Heritage):**\n├── ${cultureData.elite} (${cultureData.size} warriors)\n└── Fixed cultural equipment\n\n`;
    
    if (composition.units.length > 0) {
        unitsDisplay += '**Regular Units:**\n';
        composition.units.forEach((unit, index) => {
            const totalCost = calculateUnitCost(unit);
            unitsDisplay += `├── Unit ${index + 1}: ${unit.quality.name} (${unit.quality.size} warriors) - ${totalCost} SP\n`;
            if (unit.primaryWeapon) {
                const rangedText = unit.rangedWeapons && unit.rangedWeapons.length > 0 ? 
                    ` + ${unit.rangedWeapons.map(w => w.name).join(', ')}` : '';
                unitsDisplay += `│   └── ${unit.primaryWeapon.name}${rangedText} + ${unit.armor.name} + ${unit.shields.name}\n`;
            }
        });
        unitsDisplay += '\n';
    }
    
    if (Object.keys(composition.support).length > 0) {
        unitsDisplay += '**Support:**\n';
        Object.entries(composition.support).forEach(([supportType, count]) => {
            const support = SUPPORT_SPECIALISTS[supportType];
            unitsDisplay += `├── ${count}x ${support.name} (${support.cost * count} SP)\n`;
        });
    }

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle(`🏺 ${commander.culture} Army Builder`)
        .setDescription(`**Supply Points:** ${spUsed}/${composition.totalSP} used (${spAvailable} available)`)
        .addFields(
            {
                name: `${getCultureEmoji(commander.culture)} Elite Unit: ${cultureData.elite}`,
                value: `${cultureData.description}\n**Size:** ${cultureData.size} warriors\n**Perks:** ${cultureData.perks.join(', ')}`,
                inline: false
            },
            {
                name: 'Army Composition',
                value: `\`\`\`\n${progressBar}\n\n${unitsDisplay || 'Only elite unit selected'}\`\`\``,
                inline: false
            },
            {
                name: '5-Step Unit Creation',
                value: '1️⃣ Manpower (3-9 SP)\n2️⃣ Primary Weapon (+1-3 SP)\n3️⃣ Ranged Weapon (optional)\n4️⃣ Armor (+0-2 SP)\n5️⃣ Shields (+0-2 SP)',
                inline: false
            }
        )
        .setFooter({ text: 'Create units using the 5-step process, then add support elements' });

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('create-unit')
                .setLabel('Create New Unit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👥')
                .setDisabled(spAvailable < 4),
            new ButtonBuilder()
                .setCustomId('add-support')
                .setLabel('Add Support')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛠️')
                .setDisabled(spAvailable < 1),
            new ButtonBuilder()
                .setCustomId('save-army')
                .setLabel('Save Army')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💾'),
            new ButtonBuilder()
                .setCustomId('reset-army')
                .setLabel('Reset')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔄')
        );

    await interaction.reply({
        embeds: [embed],
        components: [buttons],
        ephemeral: true
    });
}

function calculateUnitCost(unit) {
    let cost = unit.quality.cost;
    if (unit.mounted) cost += unit.mount.cost;
    if (unit.primaryWeapon) cost += unit.primaryWeapon.cost;
    if (unit.rangedWeapons) {
        unit.rangedWeapons.forEach(weapon => cost += weapon.cost);
    }
    if (unit.armor) cost += unit.armor.cost;
    if (unit.shields) cost += unit.shields.cost;
    return cost;
}

function hasEngineers(composition) {
    return composition.support.field_engineers && composition.support.field_engineers > 0;
}

function createProgressBar(used, total) {
    const percentage = used / total;
    const filledBars = Math.round(percentage * 20);
    const emptyBars = 20 - filledBars;
    
    return `[${('█').repeat(filledBars)}${('░').repeat(emptyBars)}] ${used}/${total} SP`;
}

function getCultureEmoji(culture) {
    const emojis = {
        'Roman Republic': '🏛',
        'Macedonian Kingdoms': '🛡',
        'Spartan City-State': '🏺',
        'Carthaginian Empire': '⚓',
        'Kingdom of Kush': '🏹',
        'Berber Confederations': '🏜',
        'Sarmatian Confederations': '🐎',
        'Han Dynasty': '🐉'
    };
    return emojis[culture] || '⚔';
}

// Export helper functions and data for interaction handlers
module.exports.armyCompositions = armyCompositions;
module.exports.showMainArmyBuilder = showMainArmyBuilder;
module.exports.CULTURES = CULTURES;
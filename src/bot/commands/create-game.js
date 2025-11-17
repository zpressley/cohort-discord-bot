const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Op } = require('sequelize');

// Battle scenarios from your design documents
const BATTLE_SCENARIOS = {
    'bridge_control': {
        name: 'Bridge Control',
        description: 'Ancient bridge crossing - tactical control scenario',
        terrain: 'bridge_crossing',
        maxTurns: 12,
        objective: 'Control bridge for 4 turns OR destroy enemy army',
        specialRules: 'Bridge allows maximum 3 units wide',
        culturalAdvantages: ['Roman Republic', 'Han Dynasty', 'Celtic Tribes']
    },
    'hill_fort_assault': {
        name: 'Hill Fort Assault',
        description: 'Fortified hilltop position assault',
        terrain: 'fortified_hills',
        maxTurns: 15,
        objective: 'Capture fortress OR hold for 8 turns',
        specialRules: 'Siege equipment available, escalade possible but risky',
        culturalAdvantages: ['Roman Republic', 'Han Dynasty', 'Spartan City-State']
    },
    'forest_ambush': {
        name: 'Forest Ambush',
        description: 'Dense woodland engagement',
        terrain: 'dense_forest',
        maxTurns: 10,
        objective: 'Ambusher eliminates convoy, Escort protects passage',
        specialRules: 'Formation penalties, ambush bonuses, cavalry ineffective',
        culturalAdvantages: ['Germanic Tribes', 'Celtic Tribes']
    },
    'river_crossing': {
        name: 'River Crossing',
        description: 'Contested water crossing',
        terrain: 'river_fords',
        maxTurns: 12,
        objective: 'Control 2+ fords for 3 turns OR eliminate enemy',
        specialRules: 'Crossing penalties (-4 Attack), defenders gain elevation bonus',
        culturalAdvantages: ['Roman Republic', 'Sarmatian Confederations']
    },
    'desert_oasis': {
        name: 'Desert Oasis',
        description: 'Vital water source control',
        terrain: 'desert_oasis',
        maxTurns: 8,
        objective: 'Hold oasis 6 turns OR destroy enemy water access',
        specialRules: 'Water critical for survival, heat exhaustion penalties',
        culturalAdvantages: ['Berber Confederations', 'Kingdom of Kush']
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-game')
        .setDescription('Create a new ancient warfare battle')
        .addStringOption(option =>
            option.setName('scenario')
                .setDescription('Battle scenario (optional - can select from menu)')
                .setRequired(false)
                .addChoices(
                    { name: 'Bridge Control', value: 'bridge_control' },
                    { name: 'Hill Fort Assault', value: 'hill_fort_assault' },
                    { name: 'Forest Ambush', value: 'forest_ambush' },
                    { name: 'River Crossing', value: 'river_crossing' },
                    { name: 'Desert Oasis', value: 'desert_oasis' }
                )),
    
    async execute(interaction) {
        try {
            const { models } = require('../../database/setup');
            
            // Check if user has an army built
            const commander = await models.Commander.findByPk(interaction.user.id);
            if (!commander || !commander.culture) {
                await interaction.reply({
                    content: 'You need to build an army first! Use `/build-army` to create your forces.',
                    ephemeral: true
                });
                return;
            }

            // Check for existing active battles
            const activeBattle = await models.Battle.findOne({
                where: {
                    status: {
                        [Op.in]: ['waiting_for_players', 'army_building', 'in_progress']
                    },
                    [Op.or]: [
                        { player1Id: interaction.user.id },
                        { player2Id: interaction.user.id }
                    ]
                },
                order: [['updatedAt', 'DESC']] // Get most recent
            });

            if (activeBattle) {
                await interaction.reply({
                    content: `You already have an active battle! Check your DMs for battle status, or use \`/abandon-battle\` to leave the current battle.`,
                    ephemeral: true
                });
                return;
            }

            const selectedScenario = interaction.options.getString('scenario');
            
            if (selectedScenario) {
                // Direct scenario creation
                await createBattleWithScenario(interaction, selectedScenario, commander);
            } else {
                // Show scenario selection menu
                await showScenarioSelection(interaction, commander);
            }

        } catch (error) {
            console.error('Create game command error:', error);
            await interaction.reply({
                content: 'Error creating battle. Please try again.',
                ephemeral: true
            });
        }
    }
};

async function showScenarioSelection(interaction, commander) {
    const options = Object.entries(BATTLE_SCENARIOS).map(([scenarioKey, scenario]) => {
        const advantages = scenario.culturalAdvantages.includes(commander.culture) ? ' ⭐' : '';
        return {
            label: scenario.name + advantages,
            description: scenario.description,
            value: scenarioKey
        };
    });

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('scenario-selection')
                .setPlaceholder('Choose your battlefield...')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle(`${commander.culture} - Battle Creation`)
        .setDescription('Select a battlefield scenario for your ancient warfare engagement:')
        .addFields(
            Object.entries(BATTLE_SCENARIOS).slice(0, 5).map(([scenarioKey, scenario]) => {
                const advantage = scenario.culturalAdvantages.includes(commander.culture) ? '\n⭐ **Cultural Advantage**' : '';
                return {
                    name: scenario.name,
                    value: `${scenario.description}\n**Objective:** ${scenario.objective}${advantage}`,
                    inline: true
                };
            })
        )
        .setFooter({ text: '⭐ indicates your culture has advantages in this terrain' });

    await interaction.reply({
        embeds: [embed],
        components: [selectMenu],
        ephemeral: true
    });
}

async function createBattleWithScenario(interaction, scenarioKey, commander) {
    const { models } = require('../../database/setup');
    const scenario = BATTLE_SCENARIOS[scenarioKey];
    
    try {
        // Generate random weather for this battle
        const weatherOptions = ['clear', 'light_rain', 'heavy_rain', 'fog', 'extreme_heat', 'wind', 'cold', 'storm'];
        const weatherWeights = [40, 20, 15, 10, 8, 4, 2, 1];
        const weather = generateRandomWeather(weatherOptions, weatherWeights);
        
        // Create battle record
        const battle = await models.Battle.create({
            player1Id: interaction.user.id,
            player1Culture: commander.culture,
            player2Id: null, // Will be filled when someone joins
            scenario: scenarioKey,
            status: 'waiting_for_players',
            maxTurns: scenario.maxTurns,
            weather: weather,
            terrain: {
                primary: scenario.terrain,
                features: [],
                modifiers: {}
            },
            victoryConditions: {
                objective: scenario.objective,
                specialRules: scenario.specialRules
            },
            channelId: interaction.channel?.id || interaction.channelId || null,
            battleState: {
                player1: { 
                    army: commander.armyComposition || {}, 
                    positions: {}, 
                    supplies: 100, 
                    morale: 100 
                },
                player2: { army: {}, positions: {}, supplies: 100, morale: 100 },
                objectives: {},
                turnEvents: []
            }
        });

        // Create public battle announcement
        const battleEmbed = new EmbedBuilder()
            .setColor(0x8B4513)
            .setTitle(`⚔️ BATTLE "${scenario.name.toUpperCase()}" CREATED!`)
            .setDescription(`${scenario.description}`)
            .addFields(
                {
                    name: '🗺️ Battlefield',
                    value: `**Terrain:** ${scenario.terrain.replace('_', ' ')}\n**Weather:** ${weather.replace('_', ' ')}\n**Max Turns:** ${scenario.maxTurns}`,
                    inline: true
                },
                {
                    name: '🎯 Victory Conditions',
                    value: scenario.objective,
                    inline: true
                },
                {
                    name: '⚡ Special Rules',
                    value: scenario.specialRules,
                    inline: false
                },
                {
                    name: '👤 Commander 1',
                    value: `**${commander.culture}**\n${interaction.user.username}`,
                    inline: true
                },
                {
                    name: '👤 Commander 2',
                    value: `*Waiting for opponent...*`,
                    inline: true
                }
            )
            .setFooter({ text: 'React with ⚔️ to join this battle!' });

        const joinButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`join-battle-${battle.id}`)
                    .setLabel('Join Battle')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚔️')
            );

        const battleMessage = await interaction.reply({
            embeds: [battleEmbed],
            components: [joinButton],
            ephemeral: false // Public message so others can join
        });

        // Store message ID for updates
        await battle.update({ messageId: battleMessage.id });

        // Send private briefing to creator
        //await sendPrivateBriefing(interaction.user, battle, scenario, commander, 'player1');

    } catch (error) {
        console.error('Battle creation error:', error);
        await interaction.reply({
            content: 'Error creating battle. Please try again.',
            ephemeral: true
        });
    }
}

async function sendPrivateBriefing(user, battle, scenario, commander, playerRole) {
    const text = [
        `🏺 War Council — ${scenario.name}`,
        `Commander of the ${commander.culture}`,
        '',
        '🗺️ Battlefield Situation',
        scenario.description,
        '',
        '🎯 Mission Objective',
        scenario.objective,
        '',
        '⚡ Tactical Briefing',
        `Weather: ${battle.weather.replace('_', ' ')}`,
        `Terrain: ${scenario.terrain.replace('_', ' ')}`,
        `Maximum engagement time: ${scenario.maxTurns} turns`,
        '',
        '📋 Status',
        playerRole === 'player1' ? 'Waiting for an opponent to join the battle...' : 'Battle is ready to begin! Prepare your strategy.',
        '',
        'You will receive detailed tactical briefings once both commanders are ready.'
    ].join('\n');

    try {
        await user.send(text);
    } catch (error) {
        console.log(`Could not send DM to ${user.username} - DMs may be disabled`);
    }
}

function generateRandomWeather(options, weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * total;
    
    for (let i = 0; i < options.length; i++) {
        random -= weights[i];
        if (random <= 0) {
            return options[i];
        }
    }
    
    return options[0]; // Fallback to clear weather
}

// Export for use in interaction handlers
module.exports.BATTLE_SCENARIOS = BATTLE_SCENARIOS;
module.exports.createBattleWithScenario = createBattleWithScenario;
module.exports.sendPrivateBriefing = sendPrivateBriefing;
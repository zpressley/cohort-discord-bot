const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Track units being built (temporary storage)
const unitsInProgress = new Map();

async function handleArmyBuilderInteractions(interaction) {
    console.log('Army interaction received:', interaction.customId);
    
    try {
        const { armyCompositions, showMainArmyBuilder, CULTURES } = require('./commands/build-army');
        const { models } = require('../database/setup');
        
        const userId = interaction.user.id;
        
        // Handle culture selection FIRST (before checking composition)
        if (interaction.customId === 'select-culture') {
            const selectedCulture = interaction.values[0];
            const { CULTURAL_SP_BUDGETS } = require('../game/armyData');
            
            console.log(`Culture selected: ${selectedCulture} for user ${userId}`);
            
            // Create or update commander with selected culture
            let commander = await models.Commander.findByPk(userId);
            if (!commander) {
                commander = await models.Commander.create({
                    discordId: userId,
                    username: interaction.user.username,
                    culture: selectedCulture,
                    rank: 'Recruit',
                    battlesWon: 0,
                    battlesLost: 0
                });
                console.log(`Commander created for ${userId} with culture ${selectedCulture}`);
            } else {
                commander.culture = selectedCulture;
                await commander.save();
                console.log(`Commander updated: ${userId} now ${selectedCulture}`);
            }
            
            // Initialize army composition
            const startingSP = CULTURAL_SP_BUDGETS[selectedCulture] || 30;
            armyCompositions.set(userId, {
                culture: selectedCulture,
                units: [],
                support: {},
                totalSP: startingSP,
                usedSP: 0
            });
            
            console.log(`Army composition initialized for ${userId}`);
            
            // Show main army builder
            await showMainArmyBuilder(interaction, commander);
            return;
        }
        
        // Get composition for all other interactions
        const composition = armyCompositions.get(userId);
        
        if (!composition && !['back-to-main'].includes(interaction.customId)) {
            await interaction.reply({
                content: 'Army composition not found. Please use `/lobby` and build your army.',
                ephemeral: true
            });
            return;
        }

        // Handle main army builder buttons
        if (interaction.customId === 'create-unit') {
            await startUnitCreation(interaction, composition);
        } else if (interaction.customId === 'add-support') {
            await showSupportSelection(interaction, composition);
        } else if (interaction.customId === 'save-army') {
            await saveArmy(interaction, composition);
        } else if (interaction.customId === 'reset-army') {
            await resetArmy(interaction, userId, armyCompositions);
        } else if (interaction.customId === 'back-to-main') {
            const commander = await models.Commander.findByPk(userId);
            await showMainArmyBuilder(interaction, commander);
        }
        
        // Handle step selections
        else if (interaction.customId === 'manpower-selection') {
            await handleStep1Selection(interaction, composition);
        } else if (interaction.customId === 'mount-decision') {
            // legacy; kept for compatibility
            await showMountDecision(interaction, composition);
        } else if (interaction.customId === 'primary-type-melee') {
            await showPrimaryWeaponSelection(interaction, composition);
        } else if (interaction.customId === 'primary-type-ranged') {
            await showPrimaryRangedSelection(interaction, composition);
        } else if (interaction.customId === 'primary-weapon-selection') {
            await handleStep2Selection(interaction, composition);
        } else if (interaction.customId === 'primary-ranged-selection') {
            const { getAllWeapons } = require('../game/armyData');
            const weaponKey = interaction.values[0];
            const unit = unitsInProgress.get(interaction.user.id);
            const allWeapons = getAllWeapons();
            unit.primaryWeapon = allWeapons[weaponKey];
            unit.primaryWeaponKey = weaponKey;
            await showSecondaryWeaponDecision(interaction, composition);
        } else if (interaction.customId === 'secondary-weapon-selection') {
            await handleSecondaryWeaponSelection(interaction, composition);
        } else if (interaction.customId === 'ranged-weapon-selection') {
            await handleRangedWeaponSelection(interaction, composition);
        } else if (interaction.customId === 'armor-selection') {
            await handleArmorSelection(interaction, composition);
        } else if (interaction.customId === 'shield-selection') {
            await handleShieldSelection(interaction, composition);
        } else if (interaction.customId === 'training-selection') {
            await handleTrainingSelection(interaction, composition);
        } else if (interaction.customId === 'support-selection') {
            await handlePurchase(interaction, composition);
        }
        
        // Handle skip/add buttons for optional equipment
        else if (interaction.customId === 'skip-mount') {
            await showPrimaryTypeDecision(interaction, composition);
        } else if (interaction.customId === 'add-mount') {
            await handleAddMount(interaction, composition);
        } else if (interaction.customId === 'skip-secondary') {
            // If primary is ranged, skip directly to armor; otherwise ask about optional ranged
            const unit = unitsInProgress.get(interaction.user.id);
            if (unit?.primaryWeapon?.stacking === 'primary_ranged') {
                await showArmorStep(interaction, composition);
            } else {
                await showRangedWeaponDecision(interaction, composition);
            }
        } else if (interaction.customId === 'add-secondary') {
            await showSecondaryWeaponSelection(interaction, composition);
        } else if (interaction.customId === 'skip-ranged') {
            await showArmorStep(interaction, composition);
        } else if (interaction.customId === 'add-ranged') {
            await showRangedWeaponSelection(interaction, composition);
        }
        
    } catch (error) {
        console.error('Army interaction error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `Error: ${error.message}`,
                ephemeral: true
            });
        }
    }
}

// STEP 1: Manpower Selection
async function startUnitCreation(interaction, composition) {
    const { TROOP_QUALITY } = require('../game/armyData');
    
    const unitId = interaction.user.id;
    unitsInProgress.set(unitId, {
        step: 1,
        culture: composition.culture,
        quality: null,
        mounted: false,
        mount: null,
        primaryWeapon: null,
        secondaryWeapons: [],
        rangedWeapons: [],
        armor: null,
        shields: null
    });

    const availableSP = composition.totalSP - composition.usedSP;
    const availableQualities = Object.entries(TROOP_QUALITY).filter(([qualityType, quality]) => {
        return quality.cost + 1 <= availableSP;
    });

    if (availableQualities.length === 0) {
        await interaction.reply({
            content: 'Not enough SP for any unit type. Need at least 4 SP.',
            ephemeral: true
        });
        return;
    }

    const options = availableQualities.map(([qualityType, quality]) => ({
        label: `${quality.name} (${quality.cost} SP)`,
        description: `${quality.size} warriors - ${quality.description.substring(0, 90)}`,
        value: qualityType
    }));

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('manpower-selection')
                .setPlaceholder('Step 1: Select Manpower Quality...')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 1: Manpower Quality')
        .setDescription(`**Available SP:** ${availableSP}\n\nChoose troop quality (affects equipment access and combat stats):`)
        .addFields({
            name: 'Quality Levels',
            value: '**Levy** (3 SP): Cannot use heavy equipment\n**Tribal Warriors** (4 SP): Cannot use heavy armor\n**Militia** (5 SP): Standard access\n**Professional** (7 SP): Full equipment access\n**Veteran Mercenary** (9 SP): Elite with full access',
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [selectMenu, createBackButton()]
    });
}

async function handleStep1Selection(interaction, composition) {
    const { TROOP_QUALITY } = require('../game/armyData');
    
    const qualityType = interaction.values[0];
    const unit = unitsInProgress.get(interaction.user.id);
    
    unit.quality = TROOP_QUALITY[qualityType];
    unit.qualityType = qualityType;
    unit.step = 2;
    
    await showMountDecision(interaction, composition);
}

// STEP 1.5: Mount Decision
async function showMountDecision(interaction, composition) {
    const { CULTURAL_MODIFIERS } = require('../game/armyData');
    
    const unit = unitsInProgress.get(interaction.user.id);
    const culturalMods = CULTURAL_MODIFIERS[composition.culture] || {};
    const mountCost = culturalMods.horse_cost || 3;
    
    const availableSP = composition.totalSP - composition.usedSP - unit.quality.cost;
    const canAffordMount = availableSP >= mountCost;

    const mountButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('add-mount')
                .setLabel(`Add Horses (+${mountCost} SP)`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(!canAffordMount),
            new ButtonBuilder()
                .setCustomId('skip-mount')
                .setLabel('Infantry (No Mount)')
                .setStyle(ButtonStyle.Primary)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 1.5: Mount Decision')
        .setDescription(`**Unit:** ${unit.quality.name}\n**Available SP:** ${availableSP}\n\nConvert to cavalry?`)
        .addFields({
            name: 'Cavalry Benefits & Restrictions',
            value: `**Benefits:** +3 Mobility, +2 Charge bonus, flanking capability\n**Restrictions:** Cannot use heavy shields, limited weapon options\n**Cost:** +${mountCost} SP`,
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [mountButtons, createBackButton()]
    });
}

async function handleAddMount(interaction, composition) {
    const { CULTURAL_MODIFIERS } = require('../game/armyData');
    
    const unit = unitsInProgress.get(interaction.user.id);
    const culturalMods = CULTURAL_MODIFIERS[composition.culture] || {};
    const mountCost = culturalMods.horse_cost || 3;
    
    unit.mounted = true;
    unit.mount = { name: 'Horses', cost: mountCost };
    
    await showPrimaryTypeDecision(interaction, composition);
}

// After deciding to skip/add mount, let user choose melee vs ranged track
async function showPrimaryTypeDecision(interaction, composition) {
    const unit = unitsInProgress.get(interaction.user.id);
    const usedSP = unit.quality.cost + (unit.mounted ? unit.mount.cost : 0);
    const availableSP = composition.totalSP - composition.usedSP - usedSP;

    const typeButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('primary-type-melee').setLabel('Melee Weapons').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('primary-type-ranged').setLabel('Ranged Weapons').setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 2: Choose Weapon Category')
        .setDescription(`**Available SP:** ${availableSP}\n\nSelect melee or ranged to continue.`);

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], components: [typeButtons], ephemeral: true });
    } else {
        await interaction.update({ embeds: [embed], components: [typeButtons, createBackButton()] });
    }
}

// STEP 2R: Primary Ranged Selection
async function showPrimaryRangedSelection(interaction, composition) {
    const { getAvailableWeapons } = require('../game/armyData');
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    const availableSP = composition.totalSP - composition.usedSP - usedSP;

    // Filter by culture, quality, and mount using shared utility
    const light = getAvailableWeapons(composition.culture, unit.qualityType, unit.mounted, 'light_ranged');
    const medium = getAvailableWeapons(composition.culture, unit.qualityType, unit.mounted, 'medium_ranged');
    const allRanged = [...light, ...medium];

    const options = allRanged
      .map(([key, w]) => ({
        label: `${w.name} (+${w.cost} SP)`,
        description: `Dmg: ${w.damage} | Rng: ${w.range}m`,
        value: key
      }));

    const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('primary-ranged-selection')
          .setPlaceholder('Select Primary Ranged...')
          .addOptions(options.slice(0,25))
    );

    const embed = new EmbedBuilder()
      .setColor(0x8B4513)
      .setTitle('Step 2: Primary Ranged Weapon')
      .setDescription(`**Available SP:** ${availableSP}\n\nSelect your primary ranged weapon:`);

    await interaction.update({ embeds:[embed], components:[menu, createBackButton()] });
}

// STEP 2: Primary Weapon Selection
async function showPrimaryWeaponSelection(interaction, composition) {
    const { LIGHT_WEAPONS, MEDIUM_WEAPONS, HEAVY_WEAPONS } = require('../game/armyData');
    
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    const availableSP = composition.totalSP - composition.usedSP - usedSP;
    
    // Combine melee weapons only (not ranged)
    const allMeleeWeapons = { ...LIGHT_WEAPONS, ...MEDIUM_WEAPONS, ...HEAVY_WEAPONS };
    
    const availableWeapons = Object.entries(allMeleeWeapons).filter(([weaponKey, weapon]) => {
        if (weapon.cost > availableSP) return false;
        if (weapon.cultures !== 'all' && !weapon.cultures.includes(composition.culture)) return false;
        if (weapon.min_quality && !meetsQualityRequirement(unit.qualityType, weapon.min_quality)) return false;
        if (unit.mounted && !weapon.cavalry_compatible && !weapon.mount_required) return false;
        if (weapon.mount_required && !unit.mounted) return false;
        return true;
    });

    const options = availableWeapons.slice(0, 25).map(([weaponKey, weapon]) => ({
        label: `${weapon.name} (+${weapon.cost} SP)`,
        description: `Dmg: ${weapon.damage} | ${weapon.stacking} | ${weapon.special.substring(0, 40)}`,
        value: weaponKey
    }));

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('primary-weapon-selection')
                .setPlaceholder('Step 2: Select Primary Weapon...')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 2: Primary Weapon')
        .setDescription(`**Unit:** ${unit.quality.name}${unit.mounted ? ' (Cavalry)' : ''}\n**Available SP:** ${availableSP}\n\nSelect your primary melee weapon:`)
        .addFields({
            name: 'Weapon Types',
            value: '**Light** (+1 SP): Basic arms\n**Medium** (+2 SP): Professional weapons\n**Heavy** (+3 SP): Two-handed, NO SHIELDS',
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [selectMenu, createBackButton()]
    });
}

async function handleStep2Selection(interaction, composition) {
    const { getAllWeapons } = require('../game/armyData');
    
    const weaponKey = interaction.values[0];
    const unit = unitsInProgress.get(interaction.user.id);
    
    const allWeapons = getAllWeapons();
    unit.primaryWeapon = allWeapons[weaponKey];
    unit.primaryWeaponKey = weaponKey;
    
    // Check if secondary weapons are available
    await showSecondaryWeaponDecision(interaction, composition);
}

// STEP 2.5: Secondary Weapon Decision
async function showSecondaryWeaponDecision(interaction, composition) {
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost + unit.primaryWeapon.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    const availableSP = composition.totalSP - composition.usedSP - usedSP;
    
    // Check if secondary weapons are available (daggers, sickles, etc.)
    const canAddSecondary = availableSP >= 1 && unit.primaryWeapon.stacking !== 'two_handed';

    const decisionButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('add-secondary')
                .setLabel('Add Secondary Weapon (+1 SP)')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!canAddSecondary),
            new ButtonBuilder()
                .setCustomId('skip-secondary')
                .setLabel('Skip Secondary')
                .setStyle(ButtonStyle.Primary)
        );

    let restrictionText = '';
    if (unit.primaryWeapon.stacking === 'two_handed') {
        restrictionText = '\n**Note:** Two-handed weapons cannot stack with secondary weapons';
    }

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 2.5: Secondary Weapons (Optional)')
        .setDescription(`**Unit:** ${unit.quality.name}${unit.mounted ? ' (Cavalry)' : ''} with ${unit.primaryWeapon.name}\n**Available SP:** ${availableSP}${restrictionText}\n\nAdd a backup weapon?`)
        .addFields({
            name: 'Secondary Weapons',
            value: 'Daggers, sickles, and backup weapons that stack with your primary weapon for versatility in combat.',
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [decisionButtons, createBackButton()]
    });
}

async function showSecondaryWeaponSelection(interaction, composition) {
    const { LIGHT_WEAPONS, MEDIUM_WEAPONS, HEAVY_WEAPONS } = require('../game/armyData');
    
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost + unit.primaryWeapon.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    const availableSP = composition.totalSP - composition.usedSP - usedSP;

    const isPrimaryRanged = unit.primaryWeapon?.stacking === 'primary_ranged';

    // Build candidate melee list
    const allMelee = { ...LIGHT_WEAPONS, ...MEDIUM_WEAPONS, ...HEAVY_WEAPONS };
    const candidates = Object.entries(allMelee).filter(([weaponKey, weapon]) => {
        // If primary is ranged: allow any one-handed melee (exclude two_handed)
        // If primary is melee: only true secondary stackers
        if (isPrimaryRanged) {
            if (weapon.stacking === 'two_handed') return false;
        } else {
            if (weapon.stacking !== 'secondary') return false;
        }
        if (weapon.cost > availableSP) return false;
        if (weapon.cultures !== 'all' && !weapon.cultures.includes(composition.culture)) return false;
        if (weapon.min_quality && !meetsQualityRequirement(unit.qualityType, weapon.min_quality)) return false;
        if (unit.mounted && !weapon.cavalry_compatible && !weapon.mount_required) return false;
        if (weapon.mount_required && !unit.mounted) return false;
        return true;
    });

    const options = candidates.map(([weaponKey, weapon]) => ({
        label: `${weapon.name} (+${weapon.cost} SP)`,
        description: `Dmg: ${weapon.damage}${weapon.range ? ` | Rng: ${weapon.range}m` : ''} | ${weapon.special.substring(0, 60)}`,
        value: weaponKey
    }));

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('secondary-weapon-selection')
                .setPlaceholder('Select Secondary Weapon...')
                .addOptions(options.slice(0,25))
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Secondary Weapon Selection')
        .setDescription(`**Available SP:** ${availableSP}\n\nChoose backup weapon (stacks with ${unit.primaryWeapon.name}):`)
        .addFields(
            candidates.slice(0, 12).map(([weaponKey, weapon]) => ({
                name: `${weapon.name} (+${weapon.cost} SP)`,
                value: `Damage: ${weapon.damage}${weapon.range ? ` | Rng: ${weapon.range}m` : ''} | ${weapon.special}`,
                inline: true
            }))
        );

    await interaction.update({
        embeds: [embed],
        components: [selectMenu, createBackButton()]
    });
}

async function handleSecondaryWeaponSelection(interaction, composition) {
    const { getAllWeapons } = require('../game/armyData');
    
    const weaponKey = interaction.values[0];
    const unit = unitsInProgress.get(interaction.user.id);
    
    const allWeapons = getAllWeapons();
    unit.secondaryWeapons.push(allWeapons[weaponKey]);
    
    // If primary is ranged, proceed to armor; else ask about optional ranged
    if (unit.primaryWeapon?.stacking === 'primary_ranged') {
        await showArmorStep(interaction, composition);
    } else {
        await showRangedWeaponDecision(interaction, composition);
    }
}

// STEP 3: Ranged Weapon Decision
async function showRangedWeaponDecision(interaction, composition) {
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost + unit.primaryWeapon.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    unit.secondaryWeapons.forEach(w => usedSP += w.cost);
    const availableSP = composition.totalSP - composition.usedSP - usedSP;
    
    const canAddRanged = availableSP >= 1;

    const decisionButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('add-ranged')
                .setLabel('Add Ranged Weapon')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!canAddRanged),
            new ButtonBuilder()
                .setCustomId('skip-ranged')
                .setLabel('Skip Ranged')
                .setStyle(ButtonStyle.Primary)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 3: Ranged Weapons (Optional)')
        .setDescription(`**Available SP:** ${availableSP}\n\nAdd ranged capability to your unit?`)
        .addFields({
            name: 'Ranged Options',
            value: 'Javelins, slings, bows, and throwing weapons. Can stack with melee weapons (except some bows limit shield options).',
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [decisionButtons, createBackButton()]
    });
}

async function showRangedWeaponSelection(interaction, composition) {
    const { LIGHT_RANGED, MEDIUM_RANGED } = require('../game/armyData');
    
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost + unit.primaryWeapon.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    unit.secondaryWeapons.forEach(w => usedSP += w.cost);
    const availableSP = composition.totalSP - composition.usedSP - usedSP;
    
    const allRangedWeapons = { ...LIGHT_RANGED, ...MEDIUM_RANGED };
    const availableRanged = Object.entries(allRangedWeapons).filter(([weaponKey, weapon]) => {
        if (weapon.cost > availableSP) return false;
        if (weapon.cultures !== 'all' && !weapon.cultures.includes(composition.culture)) return false;
        if (weapon.min_quality && !meetsQualityRequirement(unit.qualityType, weapon.min_quality)) return false;
        if (weapon.mount_required && !unit.mounted) return false;
        return true;
    });

    const options = availableRanged.map(([weaponKey, weapon]) => ({
        label: `${weapon.name} (+${weapon.cost} SP)`,
        description: `Dmg: ${weapon.damage} | Rng: ${weapon.range}m | ${weapon.special.substring(0, 40)}`,
        value: weaponKey
    }));

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ranged-weapon-selection')
                .setPlaceholder('Select Ranged Weapon...')
                .addOptions(options.slice(0, 25))
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 3: Ranged Weapon Selection')
        .setDescription(`**Available SP:** ${availableSP}\n\nAdd ranged capability:`)
        .addFields({
            name: 'Ranged Categories',
            value: '**Light Ranged** (+1 SP): Slings, basic bows, throwing spears\n**Medium Ranged** (+2 SP): Professional bows, heavy javelins\n*Note: Some bows restrict shield options*',
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [selectMenu, createBackButton()]
    });
}

async function handleRangedWeaponSelection(interaction, composition) {
    const { getAllWeapons } = require('../game/armyData');
    
    const weaponKey = interaction.values[0];
    const unit = unitsInProgress.get(interaction.user.id);
    
    const allWeapons = getAllWeapons();
    unit.rangedWeapons.push(allWeapons[weaponKey]);
    
    await showArmorStep(interaction, composition);
}

// STEP 4: Armor Selection
async function showArmorStep(interaction, composition) {
    const { ARMOR_CATEGORIES } = require('../game/armyData');
    
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost + unit.primaryWeapon.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    unit.secondaryWeapons.forEach(w => usedSP += w.cost);
    unit.rangedWeapons.forEach(w => usedSP += w.cost);
    const availableSP = composition.totalSP - composition.usedSP - usedSP;
    
    const availableArmor = Object.entries(ARMOR_CATEGORIES).filter(([armorType, armor]) => {
        if (armor.cost > availableSP) return false;
        if (unit.quality.restrictions && unit.quality.restrictions.includes('heavy_armor') && armorType === 'heavy_armor') {
            return false;
        }
        return true;
    });

    const options = availableArmor.map(([armorType, armor]) => ({
        label: `${armor.name} (${armor.cost === 0 ? 'FREE' : '+' + armor.cost + ' SP'})`,
        description: armor.description.substring(0, 90),
        value: armorType
    }));

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('armor-selection')
                .setPlaceholder('Step 4: Select Armor...')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 4: Armor Selection')
        .setDescription(`**Available SP:** ${availableSP}\n\nChoose armor protection level:`)
        .addFields({
            name: 'Armor Levels',
            value: '**No/Light Armor** (FREE): Speed, vulnerability\n**Medium Armor** (+1 SP): Balanced protection\n**Heavy Armor** (+2 SP): Maximum protection, -20% mobility',
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [selectMenu, createBackButton()]
    });
}

async function handleArmorSelection(interaction, composition) {
    const { ARMOR_CATEGORIES } = require('../game/armyData');
    
    const armorType = interaction.values[0];
    const unit = unitsInProgress.get(interaction.user.id);
    
    unit.armor = ARMOR_CATEGORIES[armorType];
    unit.armorType = armorType;
    
    await showShieldStep(interaction, composition);
}

// STEP 5: Shield Selection (Auto-filtered)
async function showShieldStep(interaction, composition) {
    const { SHIELD_OPTIONS, getAvailableShields } = require('../game/armyData');
    
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost + unit.primaryWeapon.cost + unit.armor.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    unit.secondaryWeapons.forEach(w => usedSP += w.cost);
    unit.rangedWeapons.forEach(w => usedSP += w.cost);
    const availableSP = composition.totalSP - composition.usedSP - usedSP;
    
    // Get allowed shields based on weapon choices
    const allWeapons = [unit.primaryWeapon, ...unit.secondaryWeapons, ...unit.rangedWeapons];
    const allowedShields = getAvailableShields(allWeapons, unit.mounted, unit.quality);
    
    const availableShields = Object.entries(SHIELD_OPTIONS).filter(([shieldType, shield]) => {
        if (shield.cost > availableSP) return false;
        if (!allowedShields.includes(shieldType)) return false;
        return true;
    });

    const options = availableShields.map(([shieldType, shield]) => ({
        label: `${shield.name} (${shield.cost === 0 ? 'FREE' : '+' + shield.cost + ' SP'})`,
        description: shield.description.substring(0, 90),
        value: shieldType
    }));

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('shield-selection')
                .setPlaceholder('Step 5: Select Shields...')
                .addOptions(options)
        );

    let restrictionText = '';
    if (unit.primaryWeapon.shield_restriction === 'no_shield') {
        restrictionText = '\n**Restriction:** Two-handed weapon requires no shield';
    } else if (unit.rangedWeapons.some(w => w.shield_restriction === 'secondary_melee_only')) {
        restrictionText = '\n**Restriction:** Bow limits shield options';
    }

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 5: Shield Selection')
        .setDescription(`**Available SP:** ${availableSP}${restrictionText}\n\nChoose shield configuration:`)
        .addFields({
            name: 'Shield Options',
            value: 'Options auto-filtered based on your weapon choices and mount status.',
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [selectMenu, createBackButton()]
    });
}

async function handleShieldSelection(interaction, composition) {
    const { SHIELD_OPTIONS } = require('../game/armyData');
    
    const shieldType = interaction.values[0];
    const unit = unitsInProgress.get(interaction.user.id);
    
    unit.shields = SHIELD_OPTIONS[shieldType];
    unit.shieldType = shieldType;
    
    await showTrainingStep(interaction, composition);
}

// Support and utility functions
async function showSupportSelection(interaction, composition) {
    const { SUPPORT_SPECIALISTS } = require('../game/armyData');
    
    const availableSP = composition.totalSP - composition.usedSP;
    const availableSupport = Object.entries(SUPPORT_SPECIALISTS).filter(([supportType, support]) => {
        return support.cost <= availableSP;
    });

    if (availableSupport.length === 0) {
        await interaction.reply({
            content: 'No support units available with current SP.',
            ephemeral: true
        });
        return;
    }

    const options = availableSupport.map(([supportType, support]) => ({
        label: `${support.name} (${support.cost} SP)`,
        description: support.description,
        value: `buy-support-${supportType}-${support.cost}`
    }));

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('support-selection')
                .setPlaceholder('Select support specialists...')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Support Specialists')
        .setDescription(`**Available SP:** ${availableSP}\n\n**Basic Baggage Train** (FREE):\nFood, water, equipment for 3-4 days\n\nAdd specialist support:`)
        .addFields(
            availableSupport.map(([supportType, support]) => ({
                name: `${support.name} (${support.cost} SP)`,
                value: support.ability,
                inline: true
            }))
        );

    await interaction.update({
        embeds: [embed],
        components: [selectMenu, createBackButton()]
    });
}

async function saveArmy(interaction, composition) {
    const { models } = require('../database/setup');
    
    const totalWarriors = composition.units.reduce((total, unit) => total + unit.quality.size, 0);
    const eliteSize = getEliteUnitSize(composition.culture);
    
    // Actually save to database
    await models.Commander.update(
        { 
            armyComposition: {
                culture: composition.culture,
                totalSP: composition.totalSP,
                usedSP: composition.usedSP,
                units: composition.units,
                support: composition.support,
                eliteSize: eliteSize
            }
        },
        { where: { discordId: interaction.user.id } }
    );
    
    await interaction.reply({
        content: `**${composition.culture} Army Saved!**

**Army Summary:**
Elite Unit: ${eliteSize} warriors (0 SP)
Regular Units: ${totalWarriors} warriors (${composition.units.length} units)
Support: ${Object.keys(composition.support).length} specialists
Total Warriors: ${totalWarriors + eliteSize}
Supply Points: ${composition.usedSP}/${composition.totalSP}

Your army is ready for ancient warfare!`,
        ephemeral: true
    });
}

async function resetArmy(interaction, userId, armyCompositions) {
    const composition = armyCompositions.get(userId);
    composition.units = [];
    composition.support = {};
    composition.usedSP = 0;
    
    await interaction.reply({
        content: 'Army reset to elite unit only.',
        ephemeral: true
    });
}

async function handlePurchase(interaction, composition) {
    const { SUPPORT_SPECIALISTS } = require('../game/armyData');
    
    const [action, category, itemType, cost] = interaction.values[0].split('-');
    const itemCost = parseInt(cost);
    
    if (composition.usedSP + itemCost > composition.totalSP) {
        await interaction.reply({
            content: 'Not enough Supply Points.',
            ephemeral: true
        });
        return;
    }

    if (category === 'support') {
        composition.support[itemType] = (composition.support[itemType] || 0) + 1;
        composition.usedSP += itemCost;
        
        const support = SUPPORT_SPECIALISTS[itemType];
        await interaction.reply({
            content: `Added ${support.name}! (${itemCost} SP used)`,
            ephemeral: true
        });
    }
}

function createBackButton() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back-to-main')
                .setLabel('Back to Army Builder')
                .setStyle(ButtonStyle.Secondary)
        );
}

function meetsQualityRequirement(actualQuality, requiredQuality) {
    const qualityLevels = ['levy', 'tribal_warriors', 'militia', 'professional', 'veteran_mercenary'];
    const actualIndex = qualityLevels.indexOf(actualQuality);
    const requiredIndex = qualityLevels.indexOf(requiredQuality);
    return actualIndex >= requiredIndex;
}

function getEliteUnitSize(culture) {
    const sizes = {
        'Spartan City-State': 40,
        'Han Dynasty': 100,
        'Carthaginian Empire': 100,
        'Mauryan Empire': 60
    };
    return sizes[culture] || 80;
}

// STEP 6: Training Selection
async function showTrainingStep(interaction, composition) {
    const unit = unitsInProgress.get(interaction.user.id);
    let usedSP = unit.quality.cost + unit.primaryWeapon.cost + unit.armor.cost + unit.shields.cost;
    if (unit.mounted) usedSP += unit.mount.cost;
    unit.secondaryWeapons.forEach(w => usedSP += w.cost);
    unit.rangedWeapons.forEach(w => usedSP += w.cost);
    const availableSP = composition.totalSP - composition.usedSP - usedSP;
    
    // Get available training types based on unit weapons
    const availableTraining = getAvailableTrainingTypes(unit, availableSP);
    
    const options = availableTraining.map(training => ({
        label: training.name,
        description: training.description,
        value: training.value
    }));
    
    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('training-selection')
                .setPlaceholder('Step 6: Select Training Type...')
                .addOptions(options)
        );
    
    const embed = new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('Step 6: Training Selection (Final Step)')
        .setDescription(`**Available SP:** ${availableSP}\n\nChoose training specialization for your unit:`)
        .addFields({
            name: 'Training Levels',
            value: '**None** (FREE): No specialized training\n**Basic** (+2 SP): Basic combat techniques\n**Technical** (+4 SP): Advanced tactical skills\n**Expert** (+6 SP): Elite professional training',
            inline: false
        });
    
    await interaction.update({
        embeds: [embed],
        components: [selectMenu, createBackButton()]
    });
}

async function handleTrainingSelection(interaction, composition) {
    const unit = unitsInProgress.get(interaction.user.id);
    const [trainingType, trainingLevel] = interaction.values[0].split('-');
    
    // Set training data
    unit.training = {
        type: trainingType,
        level: trainingLevel,
        cost: getTrainingCost(trainingLevel)
    };
    
    // Calculate final unit cost
    let totalCost = unit.quality.cost + unit.primaryWeapon.cost + unit.armor.cost + unit.shields.cost + unit.training.cost;
    if (unit.mounted) totalCost += unit.mount.cost;
    unit.secondaryWeapons.forEach(w => totalCost += w.cost);
    unit.rangedWeapons.forEach(w => totalCost += w.cost);
    
    // Add completed unit to army
    composition.units.push(unit);
    composition.usedSP += totalCost;
    
    // Clean up
    unitsInProgress.delete(interaction.user.id);
    
    // Build weapon summary
    let weaponSummary = unit.primaryWeapon.name;
    if (unit.secondaryWeapons.length > 0) {
        weaponSummary += ` + ${unit.secondaryWeapons.map(w => w.name).join(', ')}`;
    }
    if (unit.rangedWeapons.length > 0) {
        weaponSummary += ` + ${unit.rangedWeapons.map(w => w.name).join(', ')}`;
    }
    
    const trainingText = unit.training.level === 'none' ? 'None' : 
        `${unit.training.type} (${unit.training.level})`;
    
    const backButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back-to-main')
                .setLabel('Back to Army Builder')
                .setStyle(ButtonStyle.Primary)
        );
    
    await interaction.update({
        content: `**Unit Created Successfully!**\n\n**${unit.quality.name}**${unit.mounted ? ' (Cavalry)' : ''}\n**Weapons:** ${weaponSummary}\n**Armor:** ${unit.armor.name}\n**Shield:** ${unit.shields.name}\n**Training:** ${trainingText}\n\n**Total Cost:** ${totalCost} SP\n\nUnit added to your army!`,
        embeds: [],
        components: [backButton]
    });
}

function getAvailableTrainingTypes(unit, availableSP) {
    const trainingTypes = [];
    
    // None is always available
    trainingTypes.push({
        name: 'None (FREE)',
        description: 'No specialized training',
        value: 'none-none'
    });

    // Allowed training types are derived ONLY from mount status and PRIMARY weapon
    const allowed = [];
    if (unit.mounted) allowed.push('cavalry');

    const primary = unit.primaryWeapon || {};
    const pname = (primary.name || '').toLowerCase();
    const isPrimaryRanged = primary.stacking === 'primary_ranged';

    if (isPrimaryRanged) {
        // Ranged primary → archer-only (plus cavalry if mounted)
        if (pname.includes('bow') || pname.includes('crossbow') || pname.includes('javelin') || pname.includes('sling')) {
            allowed.push('archer');
        } else {
            allowed.push('archer'); // default ranged bucket
        }
    } else {
        // Melee primary → derive from melee type only (ignore secondary/ranged add-ons)
        if (pname.includes('sword') || pname.includes('gladius') || pname.includes('spatha')) {
            allowed.push('swordsman');
        }
        if (pname.includes('spear') || pname.includes('pike') || pname.includes('sarissa')) {
            allowed.push('spear');
        }
    }

    // Materialize levels for allowed types
    allowed.forEach(type => {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);
        if (availableSP >= 2) {
            trainingTypes.push({ name: `${typeName} - Basic (+2 SP)`, description: `Basic ${type} combat training`, value: `${type}-basic` });
        }
        if (availableSP >= 4) {
            trainingTypes.push({ name: `${typeName} - Technical (+4 SP)`, description: `Advanced ${type} tactical skills`, value: `${type}-technical` });
        }
        if (availableSP >= 6) {
            trainingTypes.push({ name: `${typeName} - Expert (+6 SP)`, description: `Elite ${type} professional training`, value: `${type}-expert` });
        }
    });

    return trainingTypes;
}

function getTrainingCost(level) {
    const costs = {
        'none': 0,
        'basic': 2,
        'technical': 4,
        'expert': 6
    };
    return costs[level] || 0;
}

module.exports = {
    handleArmyBuilderInteractions
};

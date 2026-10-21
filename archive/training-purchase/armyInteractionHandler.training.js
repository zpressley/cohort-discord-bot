// archive/training-purchase/armyInteractionHandler.training.js
//
// Archived 2026-10-19, Stage 0 task 5. NOT LOADED BY ANYTHING.
//
// The Discord army builder's "Step 6: Training Selection", copied verbatim
// from src/bot/armyInteractionHandler.js (lines 900-1053 at tag legacy-final).
// It sold a separate training upgrade (+2/+4/+6 SP) that no combat code ever
// read. Removed by ruling Q8 (docs/DECISIONS.md): a unit's training comes from
// its quality tier. Buying training may come back later as a purchase; if it
// does, start from the ruling, not from this file.
//
// The non-training half of handleTrainingSelection (adding the finished unit
// to the army) lives on in the live file as finalizeUnit().

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

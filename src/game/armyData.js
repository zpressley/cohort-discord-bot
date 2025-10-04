// Complete Army Builder System matching the detailed specification
// Supports 300-600 warrior battles with authentic historical equipment

// Step 1: Manpower Selection (per 100-man unit)
const TROOP_QUALITY = {
    'levy': {
        name: 'Levy',
        cost: 3,
        size: 100,
        description: 'Poorly equipped farmers, minimal training',
        combat: { attack: 1, defense: 1, morale: 0 },
        restrictions: ['heavy_weapons', 'heavy_armor', 'heavy_shield']
    },
    'tribal_warriors': {
        name: 'Tribal Warriors',
        cost: 4,
        size: 100,
        description: 'Fierce but undisciplined fighters',
        combat: { attack: 3, defense: 2, morale: 2 },
        restrictions: ['heavy_armor']
    },
    'militia': {
        name: 'Militia',
        cost: 5,
        size: 100,
        description: 'Trained citizen soldiers, part-time',
        combat: { attack: 2, defense: 2, morale: 1 }
    },
    'professional': {
        name: 'Professional',
        cost: 7,
        size: 100,
        description: 'Career military, full-time warriors',
        combat: { attack: 4, defense: 4, morale: 3 }
    },
    'veteran_mercenary': {
        name: 'Veteran Mercenary',
        cost: 9,
        size: 100,
        description: 'Elite experienced warriors',
        combat: { attack: 6, defense: 5, morale: 4 }
    }
};

// Mount upgrades
const MOUNT_OPTIONS = {
    'horses_standard': {
        name: 'Horses',
        cost: 3,
        description: 'Standard cavalry conversion',
        mobility_bonus: 3,
        charge_bonus: 2,
        restrictions: ['heavy_shield'] // Cannot use heavy shields when mounted
    },
    'horses_cultural': {
        name: 'Horses (Cultural Discount)',
        cost: 2,
        description: 'Discounted for horse cultures',
        mobility_bonus: 3,
        charge_bonus: 2,
        restrictions: ['heavy_shield'],
        cultures: ['Sarmatian Confederations', 'Parthian Empire']
    }
};

// Step 2: Primary Weapon Selection
const LIGHT_WEAPONS = {
    'clubs': {
        name: 'Clubs',
        cost: 1,
        damage: 6,
        description: 'Stone/metal heads on wooden shafts',
        cultures: 'all',
        stacking: 'primary',
        cavalry_compatible: false,
        effectiveness: { light: 75, medium: 85, heavy: 60, cavalry: 40 },
        special: 'Ignores 50% armor (blunt trauma), no training required'
    },
    'daggers': {
        name: 'Daggers',
        cost: 1,
        damage: 5,
        description: 'Basic bronze or iron knives',
        cultures: 'all',
        stacking: 'secondary', // Can stack with primary weapons
        cavalry_compatible: true,
        effectiveness: { light: 70, medium: 30, heavy: 15, cavalry: 20 },
        special: '+3 damage from behind, concealed backup weapon'
    },
    'spear_basic': {
        name: 'Spear (Basic)',
        cost: 1,
        damage: 7,
        description: 'Simple wooden shaft with metal point',
        cultures: 'all',
        stacking: 'primary',
        cavalry_compatible: false,
        cavalry_penalty: -2,
        effectiveness: { light: 80, medium: 60, heavy: 35, cavalry: 95 },
        special: '+2 damage in formation, horses instinctively avoid spears'
    },
    'sickle': {
        name: 'Sickle',
        cost: 1,
        damage: 5,
        description: 'Curved agricultural blade for slashing',
        cultures: 'all',
        stacking: 'secondary', // Can stack with spears/swords
        cavalry_compatible: false,
        effectiveness: { light: 65, medium: 25, heavy: 10, cavalry: 30 },
        special: 'Shield disarm attempts, agricultural tool conversion'
    },
    'light_javelin': {
        name: 'Light Javelin',
        cost: 1,
        damage: 5,
        description: '4-5 foot throwing spear',
        cultures: 'all',
        stacking: 'stackable_ranged', // Can carry 3-4 javelins
        carry_amount: 3,
        cavalry_compatible: true,
        cavalry_bonus: 2,
        range: 30,
        effectiveness: { light: 60, medium: 35, heavy: 15, cavalry: 50 },
        special: 'Expendable ammunition, opening volleys'
    },
    // Cultural specialties
    'germanic_war_scythe': {
        name: 'Germanic War Scythe',
        cost: 1,
        damage: 6,
        description: 'Modified farm tool',
        cultures: ['Germanic Tribes'],
        stacking: 'primary',
        cavalry_compatible: false,
        effectiveness: { light: 70, medium: 40, heavy: 20, cavalry: 35 },
        special: '+1 vs light armor'
    },
    'chinese_quarterstaff': {
        name: 'Chinese Quarterstaff',
        cost: 1,
        damage: 6,
        description: '6-8 foot pole',
        cultures: ['Han Dynasty'],
        stacking: 'primary',
        cavalry_compatible: false,
        shield_restriction: 'no_shield', // NO SHIELDS with quarterstaff
        effectiveness: { light: 75, medium: 45, heavy: 25, cavalry: 60 },
        special: '+2 reach advantage'
    },
    'roman_pugio': {
        name: 'Roman Pugio',
        cost: 1,
        damage: 5,
        description: 'Military dagger',
        cultures: ['Roman Republic'],
        stacking: 'secondary', // Can stack with any primary
        cavalry_compatible: true,
        effectiveness: { light: 70, medium: 30, heavy: 15, cavalry: 20 },
        special: 'Backup weapon, stacks with any primary'
    }
};

const MEDIUM_WEAPONS = {
    'spear_professional': {
        name: 'Spear (Professional)',
        cost: 2,
        damage: 8,
        description: 'Quality iron head, proper balance',
        cultures: 'all',
        stacking: 'primary',
        cavalry_compatible: false,
        cavalry_penalty: -2,
        effectiveness: { light: 90, medium: 70, heavy: 45, cavalry: 95 },
        special: '+3 damage in formation, +1 reach advantage'
    },
    'battle_axe': {
        name: 'Battle Axe',
        cost: 2,
        damage: 8,
        description: 'Iron head designed for warfare',
        cultures: 'all',
        stacking: 'primary',
        cavalry_compatible: false,
        cavalry_penalty: -1,
        effectiveness: { light: 85, medium: 90, heavy: 65, cavalry: 55 },
        special: '+2 damage vs shields, concentrated force'
    },
    'mace': {
        name: 'Mace',
        cost: 2,
        damage: 7,
        description: 'Bronze/iron crushing head',
        cultures: 'all',
        stacking: 'primary',
        cavalry_compatible: true,
        cavalry_bonus: 2,
        effectiveness: { light: 70, medium: 95, heavy: 85, cavalry: 50 },
        special: 'Ignores 60% armor value, ideal vs hard armor'
    },
    'sword_standard': {
        name: 'Sword (Standard)',
        cost: 2,
        damage: 7,
        description: 'Basic iron sword 60-70cm',
        cultures: 'all',
        stacking: 'primary',
        cavalry_compatible: true,
        cavalry_bonus: 1,
        effectiveness: { light: 85, medium: 55, heavy: 30, cavalry: 45 },
        special: 'Balanced cutting/thrusting, versatile'
    },
    // Cultural specialties
    'roman_gladius': {
        name: 'Roman Gladius',
        cost: 2,
        damage: 8,
        description: 'Short thrusting sword',
        cultures: ['Roman Republic'],
        stacking: 'primary',
        cavalry_compatible: false,
        effectiveness: { light: 90, medium: 60, heavy: 35, cavalry: 40 },
        special: 'Formation optimized, testudo compatible'
    },
    'greek_xiphos': {
        name: 'Greek Xiphos',
        cost: 2,
        damage: 7,
        description: 'Leaf-shaped blade',
        cultures: ['Spartan City-State', 'Macedonian Kingdoms'],
        stacking: 'primary',
        cavalry_compatible: false,
        effectiveness: { light: 85, medium: 55, heavy: 30, cavalry: 40 },
        special: '+1 when spear breaks, hoplite backup weapon'
    },
    'chinese_dao': {
        name: 'Chinese Dao',
        cost: 2,
        damage: 8,
        description: 'Single-edged saber',
        cultures: ['Han Dynasty'],
        stacking: 'primary',
        cavalry_compatible: true,
        cavalry_bonus: 2,
        effectiveness: { light: 85, medium: 60, heavy: 35, cavalry: 50 },
        special: 'Cavalry designed, +2 when mounted'
    },
    'celtic_longsword': {
        name: 'Celtic Longsword',
        cost: 2,
        damage: 8,
        description: 'Pattern-welded 70-90cm',
        cultures: ['Celtic Tribes'],
        stacking: 'primary',
        cavalry_compatible: true,
        cavalry_penalty: -1,
        effectiveness: { light: 90, medium: 65, heavy: 40, cavalry: 50 },
        special: 'Reach advantage, pattern-welded quality'
    },
    'persian_akinakes': {
        name: 'Persian Akinakes',
        cost: 2,
        damage: 6,
        description: 'Cross-guard short sword',
        cultures: ['Achaemenid Persian', 'Parthian Empire'],
        stacking: 'secondary', // Can stack with other weapons
        cavalry_compatible: true,
        cavalry_bonus: 2,
        effectiveness: { light: 75, medium: 50, heavy: 25, cavalry: 40 },
        special: 'Cavalry designed, +2 when mounted'
    }
};

const HEAVY_WEAPONS = {
    'two_handed_spear': {
        name: 'Two-Handed Spear',
        cost: 3,
        damage: 10,
        description: 'Long thrusting weapon',
        cultures: 'all',
        stacking: 'two_handed', // NO SHIELDS - requires both hands
        cavalry_compatible: false,
        min_quality: 'professional',
        shield_restriction: 'no_shield',
        effectiveness: { light: 85, medium: 75, heavy: 55, cavalry: 90 },
        special: '+2 reach advantage, requires both hands'
    },
    'heavy_mace': {
        name: 'Heavy Mace',
        cost: 3,
        damage: 12,
        description: 'Large crushing weapon requiring both hands',
        cultures: 'all',
        stacking: 'two_handed',
        cavalry_compatible: false,
        min_quality: 'professional',
        shield_restriction: 'no_shield',
        effectiveness: { light: 70, medium: 95, heavy: 85, cavalry: 45 },
        special: 'Ignores 70% armor value, devastating vs hard armor'
    },
    'great_axe': {
        name: 'Great Axe',
        cost: 3,
        damage: 11,
        description: 'Two-handed for breaking shields/armor',
        cultures: 'all',
        stacking: 'two_handed',
        cavalry_compatible: false,
        min_quality: 'professional',
        shield_restriction: 'no_shield',
        effectiveness: { light: 90, medium: 85, heavy: 70, cavalry: 50 },
        special: 'Shield breaking capability, concentrated impact'
    },
    // Cultural specialties
    'macedonian_sarissa': {
        name: 'Macedonian Sarissa',
        cost: 3,
        damage: 9,
        description: '5-7 meter pike',
        cultures: ['Macedonian Kingdoms'],
        stacking: 'two_handed',
        cavalry_compatible: false,
        shield_restriction: 'no_shield',
        effectiveness: { light: 85, medium: 70, heavy: 50, cavalry: 95 },
        special: '+8 vs cavalry in formation, impenetrable pike wall'
    },
    'thracian_rhomphaia': {
        name: 'Thracian Rhomphaia',
        cost: 3,
        damage: 11,
        description: 'Long slashing polearm',
        cultures: ['Thracian Odrysians'],
        stacking: 'two_handed',
        cavalry_compatible: false,
        shield_restriction: 'no_shield',
        effectiveness: { light: 95, medium: 85, heavy: 70, cavalry: 60 },
        special: 'Formation breaker, long reach slashing'
    },
    'celtic_champions_sword': {
        name: "Celtic Champion's Sword",
        cost: 3,
        damage: 10,
        description: 'Exceptional two-handed blade',
        cultures: ['Celtic Tribes'],
        stacking: 'two_handed',
        cavalry_compatible: false,
        shield_restriction: 'no_shield',
        effectiveness: { light: 90, medium: 75, heavy: 50, cavalry: 55 },
        special: '+4 single combat, champion weapon'
    },
    'chinese_chang_dao': {
        name: 'Chinese Chang Dao',
        cost: 3,
        damage: 10,
        description: 'Long-handled saber',
        cultures: ['Han Dynasty'],
        stacking: 'two_handed',
        cavalry_compatible: false,
        shield_restriction: 'no_shield',
        effectiveness: { light: 85, medium: 70, heavy: 45, cavalry: 80 },
        special: '+5 vs cavalry, long-handled design'
    },
    'germanic_framea': {
        name: 'Germanic Framea',
        cost: 3,
        damage: 9,
        description: 'Heavy spear with crossbar',
        cultures: ['Germanic Tribes'],
        stacking: 'two_handed',
        cavalry_compatible: false,
        shield_restriction: 'no_shield',
        effectiveness: { light: 80, medium: 65, heavy: 40, cavalry: 85 },
        special: '+6 vs cavalry, crossbar prevents overextension'
    },
    'persian_kontos': {
        name: 'Persian Kontos',
        cost: 3,
        damage: 15,
        description: '4+ meter cavalry lance',
        cultures: ['Achaemenid Persian', 'Parthian Empire'],
        stacking: 'two_handed',
        cavalry_compatible: true,
        mount_required: true, // CAVALRY ONLY
        shield_restriction: 'no_shield',
        effectiveness: { light: 95, medium: 90, heavy: 80, cavalry: 85 },
        special: '+8 charge bonus, devastating cavalry weapon'
    }
};

// Step 3: Ranged Weapons (can stack with melee)
const LIGHT_RANGED = {
    'sling': {
        name: 'Sling',
        cost: 1,
        damage: 8,
        description: 'Leather cord launching stones',
        cultures: 'all',
        stacking: 'stackable_ranged',
        cavalry_compatible: true,
        cavalry_bonus: 2,
        range: 300,
        effectiveness: { light: 85, medium: 45, heavy: 25, cavalry: 90 },
        special: 'Ignores 50% armor (blunt trauma), extreme impact energy'
    },
    'self_bow_basic': {
        name: 'Self-Bow (Basic)',
        cost: 1,
        damage: 6,
        description: 'Simple wooden hunting bow',
        cultures: 'all',
        stacking: 'primary_ranged', // Primary ranged, can carry dagger as backup
        cavalry_compatible: true,
        cavalry_penalty: -1,
        range: 125,
        shield_restriction: 'secondary_melee_only', // Can only carry secondary melee
        effectiveness: { light: 70, medium: 35, heavy: 15, cavalry: 65 },
        special: 'Silent attacks, rapid fire capability'
    },
    'throwing_spear': {
        name: 'Throwing Spear',
        cost: 1,
        damage: 6,
        description: 'Light spear for distance',
        cultures: 'all',
        stacking: 'stackable_ranged',
        carry_amount: 3,
        cavalry_compatible: true,
        cavalry_bonus: 1,
        range: 25,
        effectiveness: { light: 75, medium: 45, heavy: 25, cavalry: 70 },
        special: 'Expendable ammunition, opening volleys'
    },
    // Cultural specialties
    'roman_plumbatae': {
        name: 'Roman Plumbatae',
        cost: 1,
        damage: 5,
        description: 'Lead-weighted darts',
        cultures: ['Roman Republic'],
        stacking: 'stackable_ranged',
        carry_amount: 6,
        cavalry_compatible: true,
        range: 15,
        effectiveness: { light: 65, medium: 40, heavy: 20, cavalry: 45 },
        special: 'Carried in shield, Roman innovation'
    },
    'germanic_throwing_axe': {
        name: 'Germanic Throwing Axe',
        cost: 1,
        damage: 6,
        description: 'Francisca disruption weapon',
        cultures: ['Germanic Tribes'],
        stacking: 'stackable_ranged',
        carry_amount: 2,
        cavalry_compatible: false,
        range: 20,
        effectiveness: { light: 70, medium: 50, heavy: 30, cavalry: 40 },
        special: 'Shield disruption, psychological impact'
    }
};

const MEDIUM_RANGED = {
    'self_bow_professional': {
        name: 'Self-Bow (Professional)',
        cost: 2,
        damage: 8,
        description: 'High-quality single-piece bow',
        cultures: 'all',
        stacking: 'primary_ranged',
        cavalry_compatible: true,
        cavalry_penalty: -2,
        range: 225,
        shield_restriction: 'secondary_melee_only',
        min_quality: 'professional',
        effectiveness: { light: 75, medium: 45, heavy: 20, cavalry: 60 },
        special: 'Weather resistant, sustained fire'
    },
    'javelin_heavy': {
        name: 'Heavy Javelin',
        cost: 2,
        damage: 9,
        description: 'Professional throwing spear',
        cultures: 'all',
        stacking: 'stackable_ranged',
        carry_amount: 3,
        cavalry_compatible: true,
        cavalry_bonus: 2,
        range: 35,
        min_quality: 'professional',
        effectiveness: { light: 85, medium: 65, heavy: 40, cavalry: 75 },
        special: 'High kinetic energy, formation volleys'
    },
    'sling_professional': {
        name: 'Sling (Professional)',
        cost: 2,
        damage: 10,
        description: 'Expertly crafted with lead bullets',
        cultures: 'all',
        stacking: 'stackable_ranged',
        cavalry_compatible: true,
        cavalry_bonus: 3,
        range: 350,
        min_quality: 'professional',
        effectiveness: { light: 85, medium: 45, heavy: 25, cavalry: 90 },
        special: 'Extreme range, lifetime training, psychological warfare'
    },
    // Cultural specialties
    'roman_pilum': {
        name: 'Roman Pilum',
        cost: 2,
        damage: 9,
        description: 'Iron-shanked shield-bending javelin',
        cultures: ['Roman Republic'],
        stacking: 'stackable_ranged',
        carry_amount: 2,
        cavalry_compatible: false,
        range: 25,
        min_quality: 'professional',
        effectiveness: { light: 80, medium: 70, heavy: 50, cavalry: 60 },
        special: 'Disables shields, bends on impact'
    },
    'greek_composite_bow': {
        name: 'Greek Composite Bow',
        cost: 2,
        damage: 9,
        description: 'Advanced bow technology',
        cultures: ['Spartan City-State', 'Macedonian Kingdoms'],
        stacking: 'primary_ranged',
        cavalry_compatible: true,
        cavalry_penalty: -2,
        range: 200,
        shield_restriction: 'secondary_melee_only',
        min_quality: 'professional',
        effectiveness: { light: 80, medium: 50, heavy: 25, cavalry: 65 },
        special: 'Formation archery, superior construction'
    },
    'persian_recurve_bow': {
        name: 'Persian Recurve Bow',
        cost: 2,
        damage: 9,
        description: 'Symmetric composite',
        cultures: ['Achaemenid Persian'],
        stacking: 'primary_ranged',
        cavalry_compatible: true,
        cavalry_bonus: 1,
        range: 200,
        shield_restriction: 'secondary_melee_only',
        min_quality: 'professional',
        effectiveness: { light: 80, medium: 50, heavy: 25, cavalry: 70 },
        special: 'Cavalry optimized, symmetric design'
    },
    'han_chinese_crossbow': {
        name: 'Han Chinese Crossbow',
        cost: 2,
        damage: 11,
        description: 'Bronze trigger mechanism',
        cultures: ['Han Dynasty'],
        stacking: 'primary_ranged',
        cavalry_compatible: false,
        range: 150,
        shield_restriction: 'medium_shield_max', // Can use up to medium shields
        min_quality: 'professional',
        effectiveness: { light: 95, medium: 85, heavy: 70, cavalry: 60 },
        special: 'Ignores shields, stable platform required'
    },
    'parthian_horse_bow': {
        name: 'Parthian Horse Bow',
        cost: 2,
        damage: 9,
        description: 'Optimized for mounted archery',
        cultures: ['Parthian Empire'],
        stacking: 'primary_ranged',
        cavalry_compatible: true,
        mount_required: true,
        cavalry_bonus: 3,
        range: 180,
        shield_restriction: 'secondary_melee_only',
        min_quality: 'professional',
        effectiveness: { light: 80, medium: 50, heavy: 25, cavalry: 75 },
        special: 'Parthian shot - fire while retreating'
    }
};

// Step 4: Armor Selection
const ARMOR_CATEGORIES = {
    'no_armor': {
        name: 'No Armor',
        cost: 0,
        description: 'Speed advantage, vulnerable to all attacks',
        damage_reduction: 0,
        mobility_bonus: 1
    },
    'light_armor': {
        name: 'Light Armor',
        cost: 0,
        description: 'Leather, hide - stops 25-35% damage',
        damage_reduction: 30
    },
    'medium_armor': {
        name: 'Medium Armor',
        cost: 1,
        description: 'Scale mail, ring mail, bronze cuirass - stops 50-70% damage',
        damage_reduction: 60,
        mobility_penalty: -10
    },
    'heavy_armor': {
        name: 'Heavy Armor',
        cost: 2,
        description: 'Chain mail, plate, lorica segmentata - stops 75-90% damage',
        damage_reduction: 85,
        mobility_penalty: -20
    }
};

// Step 5: Shield Selection
const SHIELD_OPTIONS = {
    'no_shield': {
        name: 'No Shield',
        cost: 0,
        description: 'Two-handed weapons, maximum mobility',
        defense_bonus: 0,
        mobility_bonus: 1
    },
    'light_shield': {
        name: 'Light Shield',
        cost: 0,
        description: 'Bucklers, parrying shields - same cost as none',
        defense_bonus: 1
    },
    'medium_shield': {
        name: 'Medium Shield',
        cost: 1,
        description: 'Standard round/oval shields',
        defense_bonus: 2
    },
    'heavy_shield': {
        name: 'Heavy Shield',
        cost: 2,
        description: 'Tower shields, maximum protection',
        defense_bonus: 3,
        mobility_penalty: -1
    }
};

// Support elements
const SUPPORT_SPECIALISTS = {
    'field_engineers': {
        name: 'Field Engineers',
        cost: 2,
        description: 'Fortifications, siege equipment',
        ability: 'Build field defenses (+2 Defense when stationary)'
    },
    'medical_corps': {
        name: 'Medical Corps',
        cost: 1,
        description: 'Casualty recovery, disease prevention',
        ability: 'Reduce casualties by 10%, +1 Morale to all units'
    },
    'scout_network': {
        name: 'Scout Network',
        cost: 1,
        description: 'Intelligence, early warning',
        ability: 'Reveal enemy positions, +2 initiative'
    }
};

// Cultural configurations
const CULTURAL_SP_BUDGETS = {
    'Roman Republic': 30,
    'Macedonian Kingdoms': 30,
    'Spartan City-State': 25,
    'Carthaginian Empire': 32,
    'Kingdom of Kush': 30,
    'Berber Confederations': 30,
    'Sarmatian Confederations': 30,
    'Han Dynasty': 30
};

const CULTURAL_MODIFIERS = {
    'Roman Republic': {
        horse_cost: 3,
        bonus_weapons: ['roman_gladius', 'roman_pilum', 'roman_plumbatae', 'roman_pugio'],
        restrictions: []
    },
    'Han Dynasty': {
        horse_cost: 3,
        bonus_weapons: ['chinese_dao', 'chinese_chang_dao', 'han_chinese_crossbow', 'chinese_quarterstaff'],
        unit_size_bonus: 0.2, // 20% larger units
        restrictions: []
    },
    'Spartan City-State': {
        horse_cost: 3,
        bonus_weapons: ['greek_xiphos', 'greek_composite_bow'],
        mercenary_restriction: true,
        restrictions: []
    },
    'Celtic Tribes': {
        horse_cost: 3,
        bonus_weapons: ['celtic_longsword', 'celtic_champions_sword'],
        restrictions: ['self_bow_professional', 'greek_composite_bow'] // Poor archery tradition
    },
    'Sarmatian Confederations': {
        horse_cost: 2, // Cultural discount
        bonus_weapons: [],
        cavalry_requirement: 0.7, // 70% must be mounted
        restrictions: []
    }
};

// Equipment logic functions
function getAvailableShields(selectedWeapons, mountStatus, troopQuality) {
    let allowedShields = ['no_shield', 'light_shield', 'medium_shield', 'heavy_shield'];
    
    // Check weapon restrictions
    selectedWeapons.forEach(weapon => {
        if (weapon.shield_restriction === 'no_shield') {
            allowedShields = ['no_shield'];
        } else if (weapon.shield_restriction === 'secondary_melee_only') {
            allowedShields = ['no_shield', 'light_shield']; // Primary ranged weapons limit shields
        } else if (weapon.shield_restriction === 'medium_shield_max') {
            allowedShields = allowedShields.filter(s => s !== 'heavy_shield');
        }
    });
    
    // Mount restrictions
    if (mountStatus) {
        allowedShields = allowedShields.filter(s => s !== 'heavy_shield');
    }
    
    // Quality restrictions  
    if (troopQuality.restrictions && troopQuality.restrictions.includes('heavy_shield')) {
        allowedShields = allowedShields.filter(s => s !== 'heavy_shield');
    }
    
    return allowedShields;
}

function getAvailableWeapons(culture, qualityType, mountStatus, weaponCategory = 'all') {
    let weaponSets = [];
    
    if (weaponCategory === 'all' || weaponCategory === 'light') {
        weaponSets.push(...Object.entries(LIGHT_WEAPONS));
    }
    if (weaponCategory === 'all' || weaponCategory === 'medium') {
        weaponSets.push(...Object.entries(MEDIUM_WEAPONS));
    }
    if (weaponCategory === 'all' || weaponCategory === 'heavy') {
        weaponSets.push(...Object.entries(HEAVY_WEAPONS));
    }
    if (weaponCategory === 'all' || weaponCategory === 'light_ranged') {
        weaponSets.push(...Object.entries(LIGHT_RANGED));
    }
    if (weaponCategory === 'all' || weaponCategory === 'medium_ranged') {
        weaponSets.push(...Object.entries(MEDIUM_RANGED));
    }
    
    return weaponSets.filter(([weaponKey, weapon]) => {
        // Check cultural availability
        if (weapon.cultures !== 'all' && !weapon.cultures.includes(culture)) {
            return false;
        }
        
        // Check quality requirements
        if (weapon.min_quality && !meetsQualityRequirement(qualityType, weapon.min_quality)) {
            return false;
        }
        
        // Check mount requirements
        if (weapon.mount_required && !mountStatus) {
            return false;
        }
        
        return true;
    });
}

function meetsQualityRequirement(actualQuality, requiredQuality) {
    const qualityLevels = ['levy', 'tribal_warriors', 'militia', 'professional', 'veteran_mercenary'];
    const actualIndex = qualityLevels.indexOf(actualQuality);
    const requiredIndex = qualityLevels.indexOf(requiredQuality);
    return actualIndex >= requiredIndex;
}

function getAllWeapons() {
    return {
        ...LIGHT_WEAPONS,
        ...MEDIUM_WEAPONS,
        ...HEAVY_WEAPONS,
        ...LIGHT_RANGED,
        ...MEDIUM_RANGED
    };
}

module.exports = {
    TROOP_QUALITY,
    MOUNT_OPTIONS,
    LIGHT_WEAPONS,
    MEDIUM_WEAPONS,
    HEAVY_WEAPONS,
    LIGHT_RANGED,
    MEDIUM_RANGED,
    ARMOR_CATEGORIES,
    SHIELD_OPTIONS,
    SUPPORT_SPECIALISTS,
    CULTURAL_SP_BUDGETS,
    CULTURAL_MODIFIERS,
    getAvailableShields,
    getAvailableWeapons,
    getAllWeapons,
    meetsQualityRequirement
};
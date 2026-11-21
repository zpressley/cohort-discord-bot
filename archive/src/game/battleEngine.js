// src/game/battleEngine.js
// Combat System v2.0 - Chaos-Modified Attack/Defense Engine
// Replaces ratio-based system with structured attack/defense calculations

const { calculateDistance, getAdjacentCoords, parseCoord, getDirection, isFord } = require('./maps/mapUtils');

// ── WEAPON ATTACK RATINGS ──────────────────────────────

const WEAPON_ATTACK_RATINGS = {
    'clubs': 3, 'daggers': 2, 'spear_basic': 4, 'sickle': 2, 'light_javelin': 2,
    'sling': 4, 'self_bow_basic': 3, 'throwing_spear': 3,
    'germanic_war_scythe': 3, 'chinese_quarterstaff': 3, 'roman_pugio': 2,
    'roman_plumbatae': 2, 'germanic_throwing_axe': 3,
    'spear_professional': 5, 'battle_axe': 5, 'mace': 4, 'sword_standard': 4,
    'self_bow_professional': 5, 'javelin_heavy': 6, 'heavy_javelin': 6,
    'sling_professional': 6,
    'roman_gladius': 5, 'greek_xiphos': 4, 'chinese_dao': 5, 'celtic_longsword': 5,
    'persian_akinakes': 3, 'roman_pilum': 6, 'greek_composite_bow': 6,
    'persian_recurve_bow': 6, 'han_chinese_crossbow': 8, 'parthian_horse_bow': 6,
    'two_handed_spear': 7, 'heavy_mace': 9, 'great_axe': 8, 'macedonian_sarissa': 6,
    'thracian_rhomphaia': 8, 'celtic_champions_sword': 7, 'chinese_chang_dao': 7,
    'germanic_framea': 6, 'persian_kontos': 12
};

const TRAINING_ATTACK_BONUSES = {
    'levy': 0, 'tribal_warriors': 1, 'militia': 2, 'professional': 4,
    'veteran_mercenary': 6, 'elite_guard': 8, 'legendary': 10
};

const FORMATION_ATTACK_MODIFIERS = {
    'phalanx': -1, 'testudo': -2, 'shield_wall': -1, 'square': -1,
    'wedge': +2, 'line': 0, 'standard': 0, 'loose': +1, 'column': 0,
    'crescent': +1, 'echelon': 0,
    'celtic_fury': +3, 'roman_manipular': +1, 'macedonian_phalanx': -1,
    'parthian_feint': +2, 'germanic_boar': +2, 'chinese_five_elements': 0,
};

const SITUATIONAL_ATTACK_MODIFIERS = {
    'high_ground': +1, 'flanking': +2, 'rear_attack': +4, 'crossing_obstacle': -2,
    'in_fortification': -1, 'charging': +2, 'pursuing_broken': +3, 'desperate': +1,
    'surprised': -3, 'retreating': -2, 'forest_fighting': -1, 'night_combat': -2,
    'rain_weather': -1, 'extreme_heat': -1, 'marsh_terrain': -2,
    'closing_distance_bonus': 0,
};

function isRangedWeapon(weaponName) {
    const rangedWeapons = [
        'compositeBow', 'bow', 'crossbow', 'sling', 'javelin', 'throwing_axe',
        'han_chinese_crossbow', 'self_bow_professional', 'self_bow_basic',
        'greek_composite_bow', 'persian_recurve_bow', 'parthian_horse_bow',
        'sling_professional', 'javelin_heavy'
    ];
    return rangedWeapons.includes(weaponName);
}

function calculateClosingDistanceBonus(attacker, defender, conditions = {}, isDefender = false) {
    const attackerWeapon = attacker.primaryWeapon?.key || attacker.primaryWeapon?.name?.toLowerCase();
    const defenderWeapon = defender.primaryWeapon?.key || defender.primaryWeapon?.name?.toLowerCase();
    const attackerRanged = attackerWeapon && isRangedWeapon(attackerWeapon);
    const defenderRanged = defenderWeapon && isRangedWeapon(defenderWeapon);
    if (!attackerRanged) return 0;
    if (isDefender && conditions.combat_situation === 'ambush' && !defenderRanged) {
        console.log(`Ambush negates range advantage - melee closed distance!`);
        return 0;
    }
    let closingBonus = 0;
    if (!defenderRanged) {
        closingBonus = 3;
        if (conditions.terrain === 'forest') closingBonus = 2;
        else if (conditions.terrain === 'urban') closingBonus = 1;
        else if (conditions.terrain === 'marsh') closingBonus = 2;
        if (conditions.combat_situation === 'ambush' && !isDefender) closingBonus += 1;
    } else {
        closingBonus = 1;
        if (conditions.combat_situation === 'ambush' && !isDefender) closingBonus += 1;
    }
    return Math.min(closingBonus, 4);
}

function normalizeWeaponKey(name) {
    if (!name || typeof name !== 'string') return 'unarmed';
    if (name.match(/^[a-z_]+$/)) return name;
    const normalized = name.toLowerCase().trim().replace(/\s+/g, '_');
    if (WEAPON_ATTACK_RATINGS[normalized]) return normalized;
    const variations = [
        normalized, `roman_${normalized}`, `greek_${normalized}`, `celtic_${normalized}`,
        `persian_${normalized}`, `chinese_${normalized}`, `germanic_${normalized}`,
        `${normalized}_standard`, `${normalized}_professional`, `${normalized}_basic`
    ];
    for (const variant of variations) {
        if (WEAPON_ATTACK_RATINGS[variant]) return variant;
    }
    console.warn(`WARNING - Unknown weapon: '${name}' (normalized: '${normalized}')`);
    return normalized;
}

function calculateAttackRating(unit, situation = {}, targetUnit = null, isDefender = false) {
    let totalAttack = 0;
    const primaryWeapon = unit.weapons?.[0];
    const weaponKey = normalizeWeaponKey(primaryWeapon);
    if (WEAPON_ATTACK_RATINGS[weaponKey] !== undefined) {
        totalAttack += WEAPON_ATTACK_RATINGS[weaponKey];
    } else {
        totalAttack += 2;
    }
    const quality = unit.quality || 'levy';
    if (TRAINING_ATTACK_BONUSES[quality] !== undefined) {
        totalAttack += TRAINING_ATTACK_BONUSES[quality];
    } else {
        console.warn(`WARNING - Unknown quality type: '${quality}'`);
    }
    const formation = unit.formation || 'line';
    if (FORMATION_ATTACK_MODIFIERS[formation] !== undefined) {
        totalAttack += FORMATION_ATTACK_MODIFIERS[formation];
    } else {
        console.warn(`WARNING - Unknown formation type: '${formation}'`);
    }
    if (unit.mounted && targetUnit && !targetUnit.mounted) {
        const defenderFormation = targetUnit.formation || 'line';
        if (['line', 'phalanx', 'square', 'shield_wall'].includes(defenderFormation)) {
            totalAttack -= 2;
        } else {
            totalAttack -= 1;
        }
    }
    Object.keys(situation).forEach(modifier => {
        if (SITUATIONAL_ATTACK_MODIFIERS[modifier] !== undefined) {
            totalAttack += SITUATIONAL_ATTACK_MODIFIERS[modifier];
        }
    });
    if (targetUnit) {
        const closingBonus = calculateClosingDistanceBonus(unit, targetUnit, situation, isDefender);
        if (closingBonus > 0) {
            totalAttack += closingBonus;
            console.log(`Closing distance bonus: +${closingBonus} (ranged advantage)`);
        }
    }
    return Math.max(1, totalAttack);
}

function mapWeaponKeyToRatingKey(weaponKey) {
    const mapping = {
        'gladius': 'roman_gladius', 'xiphos': 'greek_xiphos', 'dao': 'chinese_dao',
        'longsword': 'celtic_longsword', 'crossbow': 'han_chinese_crossbow',
        'compositeBow': 'greek_composite_bow', 'spear': 'spear_professional',
        'javelin': 'javelin_heavy', 'bow': 'self_bow_professional',
        'sling': 'sling_professional', 'sword': 'sword_standard', 'axe': 'battle_axe',
        'mace': 'mace', 'dagger': 'daggers', 'club': 'clubs',
        'chainmail': 'medium_armor', 'bronze': 'light_armor', 'leather': 'light_armor',
        'plate': 'heavy_armor', 'roundshield': 'medium_shield', 'hoplon': 'heavy_shield',
        'scutum': 'heavy_shield', 'buckler': 'light_shield'
    };
    return mapping[weaponKey] || weaponKey;
}

function getAntiArmorBonus(weaponType, targetArmorType) {
    const antiArmorBonuses = {
        'clubs': { heavy_armor: 2, medium_armor: 1 },
        'mace': { heavy_armor: 3, medium_armor: 2 },
        'heavy_mace': { heavy_armor: 4, medium_armor: 3 },
        'sling': { heavy_armor: 2, medium_armor: 1 },
        'sling_professional': { heavy_armor: 3, medium_armor: 2 },
        'spear_basic': { no_armor: 1, light_armor: 2 },
        'spear_professional': { no_armor: 2, light_armor: 3 },
        'two_handed_spear': { no_armor: 2, light_armor: 3 },
        'macedonian_sarissa': { no_armor: 2, light_armor: 3 },
        'han_chinese_crossbow': { light_armor: 2, medium_armor: 1 },
        'battle_axe': { medium_armor: 1 },
        'great_axe': { medium_armor: 2, heavy_armor: 1 },
        'germanic_throwing_axe': { light_armor: 1 }
    };
    return antiArmorBonuses[weaponType]?.[targetArmorType] || 0;
}

// ── DEFENSE RATINGS ────────────────────────────────────

const ARMOR_DEFENSE_RATINGS = {
    'no_armor': 0, 'light_armor': 3, 'medium_armor': 6, 'heavy_armor': 9
};

const SHIELD_DEFENSE_BONUSES = {
    'no_shield': 0, 'light_shield': 1, 'medium_shield': 2, 'heavy_shield': 3
};

const TRAINING_DEFENSE_BONUSES = {
    'levy': 0, 'tribal_warriors': 1, 'militia': 2, 'professional': 4,
    'veteran_mercenary': 6, 'elite_guard': 8, 'legendary': 10
};

const FORMATION_DEFENSE_MODIFIERS = {
    'phalanx': +4, 'testudo': +6, 'shield_wall': +3, 'square': +2, 'hedgehog': +5,
    'line': +1, 'standard': +1, 'column': 0, 'echelon': +1,
    'wedge': -2, 'loose': -1, 'crescent': 0,
    'celtic_fury': -3, 'roman_manipular': +2, 'macedonian_phalanx': +4,
    'parthian_feint': -1, 'germanic_boar': -2, 'chinese_five_elements': +1,
};

const SITUATIONAL_DEFENSE_MODIFIERS = {
    'high_ground': +2, 'fortified_position': +4, 'river_bank': +1, 'forest_cover': +1,
    'marsh_defender': +2, 'prepared_defense': +2, 'fighting_retreat': +1,
    'desperate_last_stand': +2, 'surprised': -4, 'flanked': -3, 'rear_attack': -5,
    'broken_formation': -3, 'night_combat': -1, 'rain_weather': -1,
    'extreme_heat': -2, 'dust_storm': +1,
};

const ARMOR_TYPE_EFFECTIVENESS = {
    'no_armor': { blunt: 0, piercing: 0, slashing: 0 },
    'light_armor': { blunt: 2, piercing: 1, slashing: 4 },
    'medium_armor': { blunt: 3, piercing: 5, slashing: 6 },
    'heavy_armor': { blunt: 4, piercing: 8, slashing: 9 }
};

const WEAPON_DAMAGE_TYPES = {
    'clubs': 'blunt', 'mace': 'blunt', 'heavy_mace': 'blunt', 'sling': 'blunt',
    'sling_professional': 'blunt',
    'spear_basic': 'piercing', 'spear_professional': 'piercing',
    'two_handed_spear': 'piercing', 'macedonian_sarissa': 'piercing',
    'germanic_framea': 'piercing', 'light_javelin': 'piercing',
    'javelin_heavy': 'piercing', 'roman_pilum': 'piercing', 'throwing_spear': 'piercing',
    'persian_kontos': 'piercing', 'han_chinese_crossbow': 'piercing',
    'self_bow_basic': 'piercing', 'self_bow_professional': 'piercing',
    'greek_composite_bow': 'piercing', 'persian_recurve_bow': 'piercing',
    'parthian_horse_bow': 'piercing',
    'sword_standard': 'slashing', 'roman_gladius': 'slashing', 'greek_xiphos': 'slashing',
    'chinese_dao': 'slashing', 'celtic_longsword': 'slashing', 'persian_akinakes': 'slashing',
    'battle_axe': 'slashing', 'great_axe': 'slashing', 'thracian_rhomphaia': 'slashing',
    'celtic_champions_sword': 'slashing', 'chinese_chang_dao': 'slashing',
    'daggers': 'slashing', 'sickle': 'slashing', 'germanic_war_scythe': 'slashing',
    'chinese_quarterstaff': 'slashing', 'roman_pugio': 'slashing',
    'germanic_throwing_axe': 'slashing', 'roman_plumbatae': 'slashing'
};

function normalizeEquipmentKey(name) {
    if (!name || typeof name !== 'string') return 'no_armor';
    if (name.match(/^[a-z_]+$/)) return name;
    return name.toLowerCase().trim().replace(/\s+/g, '_');
}

function calculateDefenseRating(unit, situation = {}) {
    let totalDefense = 0;
    const armorKey = normalizeEquipmentKey(unit.armor || 'no_armor');
    if (ARMOR_DEFENSE_RATINGS[armorKey] !== undefined) {
        totalDefense += ARMOR_DEFENSE_RATINGS[armorKey];
        console.log(`DEBUG - Armor '${unit.armor}' -> '${armorKey}' = ${ARMOR_DEFENSE_RATINGS[armorKey]} defense`);
    } else {
        console.warn(`WARNING - Unknown armor type: '${unit.armor}' (normalized: '${armorKey}')`);
    }
    const shieldKey = normalizeEquipmentKey(unit.shield || 'no_shield');
    if (SHIELD_DEFENSE_BONUSES[shieldKey] !== undefined) {
        totalDefense += SHIELD_DEFENSE_BONUSES[shieldKey];
        console.log(`DEBUG - Shield '${unit.shield}' -> '${shieldKey}' = ${SHIELD_DEFENSE_BONUSES[shieldKey]} defense`);
    } else {
        console.warn(`WARNING - Unknown shield type: '${unit.shield}' (normalized: '${shieldKey}')`);
    }
    const quality = unit.quality || 'levy';
    if (TRAINING_DEFENSE_BONUSES[quality] !== undefined) {
        totalDefense += TRAINING_DEFENSE_BONUSES[quality];
        console.log(`DEBUG - Quality '${quality}' = ${TRAINING_DEFENSE_BONUSES[quality]} defense`);
    } else {
        console.warn(`WARNING - Unknown quality type: '${quality}'`);
    }
    const formation = unit.formation || 'line';
    if (FORMATION_DEFENSE_MODIFIERS[formation] !== undefined) {
        totalDefense += FORMATION_DEFENSE_MODIFIERS[formation];
        console.log(`DEBUG - Formation '${formation}' = ${FORMATION_DEFENSE_MODIFIERS[formation]} defense`);
    } else {
        console.warn(`WARNING - Unknown formation type: '${formation}'`);
    }
    Object.keys(situation).forEach(modifier => {
        if (SITUATIONAL_DEFENSE_MODIFIERS[modifier] !== undefined) {
            totalDefense += SITUATIONAL_DEFENSE_MODIFIERS[modifier];
        }
    });
    console.log(`DEBUG - Total defense calculated: ${totalDefense}`);
    return Math.max(0, totalDefense);
}

function getArmorEffectiveness(armorType, weaponDamageType) {
    const effectiveness = ARMOR_TYPE_EFFECTIVENESS[armorType];
    if (!effectiveness) return 0;
    return effectiveness[weaponDamageType] || effectiveness.piercing || 0;
}

function mapArmorKeyToRatingKey(armorKey) {
    const mapping = {
        'chainmail': 'medium_armor', 'bronze': 'light_armor', 'leather': 'light_armor',
        'cloth': 'light_armor', 'scale': 'medium_armor', 'lamellar': 'heavy_armor',
        'loricasegmentata': 'heavy_armor', 'plate': 'heavy_armor',
        'combined': 'heavy_armor', 'cataphract': 'heavy_armor', 'none': 'no_armor'
    };
    return mapping[armorKey] || armorKey;
}

function mapShieldKeyToRatingKey(shieldKey) {
    const mapping = {
        'roundshield': 'medium_shield', 'hoplon': 'heavy_shield', 'scutum': 'heavy_shield',
        'towershield': 'heavy_shield', 'pelta': 'light_shield', 'buckler': 'light_shield',
        'none': 'no_shield'
    };
    return mapping[shieldKey] || shieldKey;
}

function getWeaponDamageType(weaponType) {
    return WEAPON_DAMAGE_TYPES[weaponType] || 'slashing';
}

// ── CHAOS CALCULATOR ───────────────────────────────────

const ENVIRONMENTAL_CHAOS = {
    terrain: {
        'plains': 0, 'hill': 1, 'forest': 2, 'marsh': 2, 'mountain': 2,
        'river': 1, 'desert': 1, 'urban': 3
    },
    weather: {
        'clear': 0, 'overcast': 0, 'light_rain': 1, 'heavy_rain': 2,
        'fog': 3, 'snow': 2, 'sandstorm': 4, 'thunderstorm': 3
    },
    time_of_day: {
        'dawn': 1, 'morning': 0, 'midday': 0, 'afternoon': 0,
        'dusk': 1, 'night': 4, 'midnight': 4
    }
};

const TACTICAL_CHAOS = {
    unit_density: {
        'sparse': 0, 'normal': 0, 'dense': 1, 'compressed': 3, 'crush': 5
    },
    combat_situation: {
        'prepared': 0, 'meeting_engagement': 1, 'ambush': 4, 'pursuit': 2,
        'siege_assault': 2, 'river_crossing': 2, 'night_raid': 3, 'retreat': 3
    },
    formation_state: {
        'intact': 0, 'partially_disrupted': 1, 'mixed': 2,
        'mostly_disrupted': 3, 'broken': 4
    },
    command_state: {
        'coordinated': 0, 'delayed': 1, 'confused': 2, 'interrupted': 3, 'leaderless': 4
    }
};

const SPECIAL_CHAOS_MODIFIERS = {
    'three_way_battle': +2, 'civil_war': +1, 'forest_night': +1, 'marsh_fog': +2,
    'urban_fire': +3, 'war_elephants_present': +1, 'first_battle': +1,
    'blood_feud': -1, 'religious_fervor': -1, 'weapon_breakage': +1,
    'supply_shortage': +1, 'communication_failure': +2
};

function calculateChaosLevel(conditions) {
    let totalChaos = 0;
    const breakdown = { environmental: 0, tactical: 0, special: 0, factors: [] };

    if (conditions.terrain) {
        const v = ENVIRONMENTAL_CHAOS.terrain[conditions.terrain] || 0;
        totalChaos += v; breakdown.environmental += v;
        if (v > 0) breakdown.factors.push(`Terrain (${conditions.terrain}): +${v}`);
    }
    if (conditions.weather) {
        const v = ENVIRONMENTAL_CHAOS.weather[conditions.weather] || 0;
        totalChaos += v; breakdown.environmental += v;
        if (v > 0) breakdown.factors.push(`Weather (${conditions.weather}): +${v}`);
    }
    if (conditions.time_of_day) {
        const v = ENVIRONMENTAL_CHAOS.time_of_day[conditions.time_of_day] || 0;
        totalChaos += v; breakdown.environmental += v;
        if (v > 0) breakdown.factors.push(`Time (${conditions.time_of_day}): +${v}`);
    }
    if (conditions.unit_density) {
        const v = TACTICAL_CHAOS.unit_density[conditions.unit_density] || 0;
        totalChaos += v; breakdown.tactical += v;
        if (v > 0) breakdown.factors.push(`Unit density (${conditions.unit_density}): +${v}`);
    }
    if (conditions.combat_situation) {
        const v = TACTICAL_CHAOS.combat_situation[conditions.combat_situation] || 0;
        totalChaos += v; breakdown.tactical += v;
        if (v > 0) breakdown.factors.push(`Situation (${conditions.combat_situation}): +${v}`);
    }
    if (conditions.formation_state) {
        const v = TACTICAL_CHAOS.formation_state[conditions.formation_state] || 0;
        totalChaos += v; breakdown.tactical += v;
        if (v > 0) breakdown.factors.push(`Formation (${conditions.formation_state}): +${v}`);
    }
    if (conditions.command_state) {
        const v = TACTICAL_CHAOS.command_state[conditions.command_state] || 0;
        totalChaos += v; breakdown.tactical += v;
        if (v > 0) breakdown.factors.push(`Command (${conditions.command_state}): +${v}`);
    }
    if (conditions.special_modifiers) {
        conditions.special_modifiers.forEach(modifier => {
            const v = SPECIAL_CHAOS_MODIFIERS[modifier] || 0;
            totalChaos += v; breakdown.special += v;
            if (v !== 0) breakdown.factors.push(`${modifier}: ${v > 0 ? '+' : ''}${v}`);
        });
    }
    const finalChaos = Math.min(10, totalChaos);
    return {
        chaosLevel: finalChaos, rawTotal: totalChaos, capped: totalChaos > 10,
        minimumApplied: false, breakdown, description: getChaosDescription(finalChaos)
    };
}

function getChaosDescription(chaosLevel) {
    const descriptions = {
        0: "Perfect conditions - clear field, good weather, organized forces",
        1: "Minor complications - light weather or terrain effects",
        2: "Noticeable disorder - weather, terrain, or tactical issues",
        3: "Moderate chaos - multiple complicating factors",
        4: "Significant confusion - poor visibility or major disruption",
        5: "High chaos - dangerous conditions, formations breaking",
        6: "Severe disorder - multiple critical factors, friend-foe confusion",
        7: "Extreme chaos - sandstorm/night combat with disrupted command",
        8: "Near-total confusion - multiple severe factors combined",
        9: "Catastrophic disorder - barely organized combat",
        10: "Complete chaos - battle is more melee than organized warfare"
    };
    return descriptions[chaosLevel] || `Chaos level ${chaosLevel}`;
}

function rollChaosModifier(chaosLevel) {
    if (chaosLevel === 0) return { roll: 0, modifier: 0, description: "Perfect conditions - no random effects" };
    const roll = Math.floor(Math.random() * chaosLevel) + 1;
    const centerPoint = chaosLevel / 2;
    const rawModifier = roll - centerPoint;
    const modifier = Math.round(rawModifier);
    return { roll, modifier, chaosLevel, description: `Rolled ${roll} on d${chaosLevel} (${modifier >= 0 ? '+' : ''}${modifier} chaos modifier)` };
}

function analyzeBattleForChaos(battleState, map, unitPositions) {
    const conditions = {
        terrain: battleState.terrain || 'plains',
        weather: battleState.weather || 'clear',
        time_of_day: 'midday',
        special_modifiers: []
    };
    const totalUnits = unitPositions.length;
    const mapArea = (map.width || 20) * (map.height || 20);
    const averageStrength = unitPositions.reduce((sum, unit) => sum + (unit.currentStrength || 100), 0) / totalUnits;
    const totalWarriors = totalUnits * averageStrength;
    const density = totalWarriors / mapArea;
    if (density < 1) conditions.unit_density = 'sparse';
    else if (density < 2) conditions.unit_density = 'normal';
    else if (density < 3) conditions.unit_density = 'dense';
    else if (density < 4) conditions.unit_density = 'compressed';
    else conditions.unit_density = 'crush';
    const unitsInFormation = unitPositions.filter(unit => unit.formation && unit.formation !== 'loose').length;
    const formationRatio = unitsInFormation / totalUnits;
    if (formationRatio >= 0.8) conditions.formation_state = 'intact';
    else if (formationRatio >= 0.6) conditions.formation_state = 'partially_disrupted';
    else if (formationRatio >= 0.4) conditions.formation_state = 'mixed';
    else if (formationRatio >= 0.2) conditions.formation_state = 'mostly_disrupted';
    else conditions.formation_state = 'broken';
    if (battleState.turn === 1) conditions.special_modifiers.push('first_battle');
    return conditions;
}

// ── PREPARATION CALCULATOR ─────────────────────────────

const TIME_POSITION_BONUSES = {
    'waitedOneTurn': 0.2, 'defendingPreparedPosition': 0.2, 'highGround': 0.2, 'fortifiedPosition': 0.3
};
const INTELLIGENCE_BONUSES = {
    'scoutsDeployed': 0.2, 'foughtThisEnemyBefore': 0.2, 'identifiedEnemyType': 0.2, 'anticipatedAttack': 0.2
};
const COORDINATION_BONUSES = {
    'commanderPresent': 0.2, 'coordinatedAttack': 0.2, 'formationIntact': 0.2, 'clearOrders': 0.2
};
const ENVIRONMENTAL_BONUSES = {
    'weatherPreparation': 0.2, 'terrainSuited': 0.2, 'environmentalAdvantage': 0.2, 'acclimated': 0.2
};
const TACTICAL_ADVANTAGE_BONUSES = {
    'formationCountersEnemy': 0.2, 'weaponAdvantage': 0.2, 'freshTroops': 0.2, 'supplySecure': 0.2
};
const MORALE_READINESS_BONUSES = {
    'highMorale': 0.2, 'inspiringLeader': 0.2, 'culturalAdvantage': 0.2, 'recentVictory': 0.2
};
const PREPARATION_PENALTIES = {
    'surprised': -1.0, 'ambushed': -0.5, 'caughtMarching': -0.5,
    'disadvantageousTerrain': -0.5, 'badWeatherUnprepared': -0.5,
    'flanked': -0.5, 'surrounded': -1.0, 'formationBroken': -0.5,
    'assaultingFortification': -0.5, 'unknownEnemy': -0.5, 'noIntelligence': -0.5,
    'exhausted': -0.5, 'lowSupplies': -0.5
};
const ATTACKER_ASYMMETRIC_BONUSES = {
    'initiativeAdvantage': 0.2, 'momentumCharge': 0.2, 'chosenBattlefield': 0.2,
    'concentratedAssault': 0.2, 'tacticalSurprise': 0.2, 'ambushAdvantage': 0.6,
    'firstStrike': 0.4, 'teutoburg_ambush': 0.8
};
const DEFENDER_ASYMMETRIC_BONUSES = {
    'preparedPosition': 0.2, 'terrainKnowledge': 0.2, 'secureSupplies': 0.2,
    'defensiveOptimization': 0.2, 'interiorLines': 0.2
};
const FORMATION_PREPARATION_BONUSES = {
    'phalanx': 3, 'testudo': 2, 'shield_wall': 2, 'square': 2, 'hedgehog': 3,
    'line': 1, 'column': 0, 'echelon': 1, 'wedge': 0, 'loose': -1, 'crescent': 0,
    'celtic_fury': -2, 'roman_manipular': 2, 'macedonian_phalanx': 3,
    'parthian_feint': 0, 'germanic_boar': -1, 'chinese_five_elements': 2
};
const EXPERIENCE_PREPARATION_BONUSES = {
    'Recruit': 0, 'Seasoned': 0, 'Veteran': 1, 'Elite Veteran': 2, 'Legendary': 3
};
const POSITIONAL_PREPARATION_BONUSES = {
    'fortified_position': 2, 'field_fortification': 1, 'prepared_defense': 1,
    'high_ground': 1, 'river_bank_defender': 1,
    'crossing_obstacle': -1, 'surprised': -3, 'ambushed': -2, 'retreating': -1, 'broken_formation': -2
};

function calculatePreparation(unit, conditions = {}) {
    let totalPreparation = 1.0;
    const breakdown = { timePosition: 0, intelligence: 0, coordination: 0, environmental: 0, tactical: 0, morale: 0, penalties: 0, factors: [] };
    Object.keys(TIME_POSITION_BONUSES).forEach(factor => {
        if (conditions[factor]) { const b = TIME_POSITION_BONUSES[factor]; totalPreparation += b; breakdown.timePosition += b; breakdown.factors.push(`${factor}: +${b}`); }
    });
    Object.keys(INTELLIGENCE_BONUSES).forEach(factor => {
        if (conditions[factor]) { const b = INTELLIGENCE_BONUSES[factor]; totalPreparation += b; breakdown.intelligence += b; breakdown.factors.push(`${factor}: +${b}`); }
    });
    Object.keys(COORDINATION_BONUSES).forEach(factor => {
        if (conditions[factor]) { const b = COORDINATION_BONUSES[factor]; totalPreparation += b; breakdown.coordination += b; breakdown.factors.push(`${factor}: +${b}`); }
    });
    Object.keys(ENVIRONMENTAL_BONUSES).forEach(factor => {
        if (conditions[factor]) { const b = ENVIRONMENTAL_BONUSES[factor]; totalPreparation += b; breakdown.environmental += b; breakdown.factors.push(`${factor}: +${b}`); }
    });
    Object.keys(TACTICAL_ADVANTAGE_BONUSES).forEach(factor => {
        if (conditions[factor]) { const b = TACTICAL_ADVANTAGE_BONUSES[factor]; totalPreparation += b; breakdown.tactical += b; breakdown.factors.push(`${factor}: +${b}`); }
    });
    Object.keys(MORALE_READINESS_BONUSES).forEach(factor => {
        if (conditions[factor]) { const b = MORALE_READINESS_BONUSES[factor]; totalPreparation += b; breakdown.morale += b; breakdown.factors.push(`${factor}: +${b}`); }
    });
    Object.keys(PREPARATION_PENALTIES).forEach(penalty => {
        if (conditions[penalty]) { const p = PREPARATION_PENALTIES[penalty]; totalPreparation += p; breakdown.penalties += p; breakdown.factors.push(`${penalty}: ${p}`); }
    });
    if (conditions.isAttacker) {
        Object.keys(ATTACKER_ASYMMETRIC_BONUSES).forEach(bonus => {
            if (conditions[bonus]) { const b = ATTACKER_ASYMMETRIC_BONUSES[bonus]; totalPreparation += b; breakdown.tactical += b; breakdown.factors.push(`ATTACKER ${bonus}: +${b}`); }
        });
    }
    if (conditions.isDefender) {
        Object.keys(DEFENDER_ASYMMETRIC_BONUSES).forEach(bonus => {
            if (conditions[bonus]) { const b = DEFENDER_ASYMMETRIC_BONUSES[bonus]; totalPreparation += b; breakdown.tactical += b; breakdown.factors.push(`DEFENDER ${bonus}: +${b}`); }
        });
    }
    const finalPreparation = Math.max(0.5, Math.min(4.0, totalPreparation));
    return { preparationLevel: finalPreparation, rawTotal: totalPreparation, capped: totalPreparation > 4.0 || totalPreparation < 0.5, breakdown, description: getNewPreparationDescription(finalPreparation) };
}

function getNewPreparationDescription(preparationLevel) {
    if (preparationLevel >= 3.5) return `Legendary preparation (${preparationLevel.toFixed(1)}) - Near-masterful chaos mitigation`;
    else if (preparationLevel >= 3.0) return `Exceptional preparation (${preparationLevel.toFixed(1)}) - Excellent chaos mitigation (Caesar-level)`;
    else if (preparationLevel >= 2.5) return `Very well prepared (${preparationLevel.toFixed(1)}) - Strong chaos mitigation`;
    else if (preparationLevel >= 2.0) return `Well prepared (${preparationLevel.toFixed(1)}) - Good chaos mitigation (halves chaos)`;
    else if (preparationLevel >= 1.5) return `Adequately prepared (${preparationLevel.toFixed(1)}) - Moderate chaos mitigation`;
    else if (preparationLevel >= 1.0) return `Basic preparation (${preparationLevel.toFixed(1)}) - Minimal chaos mitigation`;
    else return `Poorly prepared (${preparationLevel.toFixed(1)}) - Chaos amplified!`;
}

function getPreparationDescription(preparationLevel) {
    return getNewPreparationDescription(preparationLevel);
}

function isChargeCapable(unit) {
    return unit.mounted || ['wedge', 'loose'].includes(unit.formation) ||
           unit.qualityType === 'professional' || unit.qualityType === 'veteran_mercenary';
}

function isDefensiveFormation(formation) {
    return ['phalanx', 'testudo', 'shield_wall', 'square', 'hedgehog'].includes(formation);
}

function _prepCalcDistance(pos1, pos2) {
    if (!pos1 || !pos2) return Infinity;
    const dx = pos1.x - pos2.x; const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function _getTerrainAt(position, terrainData) {
    if (terrainData.hill?.includes(position)) return 'hill';
    if (terrainData.forest?.includes(position)) return 'forest';
    if (terrainData.marsh?.includes(position)) return 'marsh';
    return 'plains';
}

function _checkWeatherPreparation(weather, unit) {
    return weather === 'clear' || Math.random() > 0.5;
}

function _checkTerrainSuited(terrain, unit) {
    if (unit.mounted) return terrain === 'plains' || terrain === 'road';
    if (unit.heavy) return terrain !== 'marsh' && terrain !== 'forest';
    return true;
}

function _checkFormationCounters(myFormation, enemyFormation) {
    const counters = { 'phalanx': ['cavalry', 'wedge'], 'testudo': ['loose', 'archery'], 'loose': ['phalanx', 'testudo'] };
    return counters[myFormation]?.includes(enemyFormation);
}

function buildPreparationContext(unit, battleState, combatContext, map, isAttacker) {
    const conditions = { isAttacker, isDefender: !isAttacker };
    if (!unit.hasMoved) conditions.waitedOneTurn = true;
    if (isAttacker && battleState.commanderPosition) {
        const distance = _prepCalcDistance(unit.position, battleState.commanderPosition);
        if (distance <= 3) conditions.commanderPresent = true;
    }
    const terrain = map.terrain;
    const unitTerrain = _getTerrainAt(unit.position, terrain);
    if (combatContext.fortified) conditions.fortifiedPosition = true;
    if (combatContext.elevation > 0) conditions.highGround = true;
    if (battleState.scoutingOrders?.includes(unit.unitId)) conditions.scoutsDeployed = true;
    if (unit.institutionalMemory?.foughtCultures?.includes(combatContext.enemyCulture)) conditions.foughtThisEnemyBefore = true;
    if (combatContext.enemyIdentified) conditions.identifiedEnemyType = true;
    if (!combatContext.surprised) conditions.anticipatedAttack = true;
    if (combatContext.coordinatedUnits > 1) conditions.coordinatedAttack = true;
    if (!unit.formationDisrupted) conditions.formationIntact = true;
    if (_checkWeatherPreparation(battleState.weather, unit)) conditions.weatherPreparation = true;
    if (_checkTerrainSuited(unitTerrain, unit)) conditions.terrainSuited = true;
    if (_checkFormationCounters(unit.formation, combatContext.enemyFormation)) conditions.formationCountersEnemy = true;
    if (!combatContext.previousCombatThisTurn) conditions.freshTroops = true;
    if (unit.morale > 80) conditions.highMorale = true;
    if (combatContext.surprised) conditions.surprised = true;
    if (combatContext.flanked) conditions.flanked = true;
    if (combatContext.ambushed) conditions.ambushed = true;
    if (isAttacker) {
        conditions.initiativeAdvantage = true; conditions.concentratedAssault = true;
        if (combatContext.combat_situation === 'ambush') {
            conditions.ambushAdvantage = true; conditions.tacticalSurprise = true;
            if (unitTerrain === 'forest' && !unit.mounted) conditions.teutoburg_ambush = true;
        }
    }
    if (!isAttacker) {
        conditions.preparedPosition = combatContext.combat_situation !== 'ambush';
        conditions.terrainKnowledge = true;
    }
    return conditions;
}

function calculatePreparationLegacy(unit, battleConditions = {}, isAttacker = false) {
    const conditions = {
        formationIntact: Math.random() > 0.2,
        freshTroops: Math.random() > 0.3,
        commanderPresent: Math.random() > 0.4,
        terrainSuited: battleConditions.terrain !== 'forest' || !unit.mounted,
        weatherPreparation: battleConditions.weather === 'clear' && Math.random() > 0.2,
        isAttacker, isDefender: !isAttacker
    };
    if (isAttacker) {
        conditions.initiativeAdvantage = true;
        conditions.concentratedAssault = true;
        conditions.momentumCharge = isChargeCapable(unit);
        conditions.chosenBattlefield = battleConditions.combat_situation !== 'ambush';
        conditions.tacticalSurprise = battleConditions.combat_situation === 'ambush';
        if (battleConditions.combat_situation === 'ambush') {
            conditions.ambushAdvantage = true; conditions.firstStrike = true;
            if (battleConditions.terrain === 'forest' && !unit.mounted) conditions.teutoburg_ambush = true;
        }
        if (battleConditions.combat_situation === 'siege_assault') conditions.assaultingFortification = true;
    }
    if (!isAttacker) {
        conditions.terrainKnowledge = true; conditions.secureSupplies = true;
        conditions.preparedPosition = battleConditions.combat_situation !== 'ambush';
        conditions.defensiveOptimization = isDefensiveFormation(unit.formation);
        conditions.interiorLines = true;
        if (battleConditions.combat_situation === 'ambush') conditions.surprised = true;
        if (battleConditions.combat_situation === 'flanked') conditions.flanked = true;
        if (battleConditions.combat_situation === 'surrounded') conditions.surrounded = true;
    }
    return calculatePreparation(unit, conditions);
}

// ── CULTURAL MODIFIERS ─────────────────────────────────

const CULTURAL_COMBAT_MODIFIERS = {
    'Roman Republic': {
        preparation_bonus: +2,
        attack_bonuses: { 'fortified_position': +1, 'systematic_advance': +1 },
        defense_bonuses: { 'testudo': +2, 'fortified_position': +2 },
        morale_bonus: +1,
        special_traits: { engineering: true, professional_army: true, auxiliary_recruitment: true }
    },
    'Macedonian Kingdoms': {
        preparation_bonus: +2,
        attack_bonuses: { 'phalanx': +1, 'combined_arms': +1 },
        defense_bonuses: { 'phalanx': +2, 'veteran_experience': +1 },
        morale_bonus: +1,
        special_traits: { veteran_start: true, equipment_flexibility: true, no_militia: true }
    },
    'Celtic': {
        preparation_bonus: -1,
        attack_bonuses: { 'charging': +2, 'flanking': +2, 'forest_fighting': +1 },
        defense_bonuses: { 'forest_cover': +2, 'individual_combat': +1 },
        morale_bonus: 0,
        special_traits: { berserker_fury: true, guerrilla_warfare: true, woodland_mobility: true, poor_archery: true }
    },
    'Han Dynasty': {
        preparation_bonus: +2,
        attack_bonuses: { 'crossbow_volley': +2, 'coordinated_advance': +1 },
        defense_bonuses: { 'prepared_defense': +1, 'fortified_position': +1 },
        morale_bonus: +1,
        special_traits: { advanced_technology: true, larger_units: true, assimilation: true }
    },
    'Sarmatian Confederations': {
        preparation_bonus: 0,
        attack_bonuses: { 'charging': +2, 'horse_archery': +2, 'feigned_retreat': +2 },
        defense_bonuses: { 'mobile_defense': +2, 'dual_mode': +1 },
        morale_bonus: 0,
        special_traits: { cavalry_requirement: true, dual_mode_combat: true, no_infantry: true }
    },
    'Mauryan Empire': {
        preparation_bonus: +1,
        attack_bonuses: { 'elephant_charge': +3, 'wootz_steel': +1 },
        defense_bonuses: { 'combined_arms': +1, 'dharmic_discipline': +1 },
        morale_bonus: +1,
        special_traits: { war_elephants: true, wootz_steel_mastery: true, no_pursuit: true, diverse_requirement: true }
    },
    'Spartan City-State': {
        preparation_bonus: +2,
        attack_bonuses: { 'phalanx': +2, 'last_stand': +3 },
        defense_bonuses: { 'phalanx': +3, 'never_retreat': +2 },
        morale_bonus: +2,
        special_traits: { fight_to_last: true, no_mercenaries: true, no_adaptation: true, perioeci_militia: true }
    },
    'Berber Confederations': {
        preparation_bonus: 0,
        attack_bonuses: { 'hit_and_run': +2, 'desert_fighting': +2, 'small_unit_tactics': +1 },
        defense_bonuses: { 'desert_terrain': +3, 'mobile_defense': +1 },
        morale_bonus: 0,
        special_traits: { desert_navigation: true, master_raiders: true, forest_penalty: true }
    }
};

function getCulturalModifiers(culture) {
    return CULTURAL_COMBAT_MODIFIERS[culture] || { preparation_bonus: 0, attack_bonuses: {}, defense_bonuses: {}, morale_bonus: 0, special_traits: {} };
}

// Alias used by legacy battleEngine code
const getCulturalCombatModifiers = getCulturalModifiers;

function applyCulturalAttackModifiers(baseAttack, culture, situation = {}) {
    const modifiers = getCulturalModifiers(culture);
    let totalAttack = baseAttack;
    Object.keys(situation).forEach(situationKey => {
        if (modifiers.attack_bonuses[situationKey]) totalAttack += modifiers.attack_bonuses[situationKey];
    });
    if (modifiers.special_traits.wootz_steel && situation.has_wootz_upgrade) totalAttack += 1;
    return Math.max(1, totalAttack);
}

function applyCulturalDefenseModifiers(baseDefense, culture, situation = {}) {
    const modifiers = getCulturalModifiers(culture);
    let totalDefense = baseDefense;
    Object.keys(situation).forEach(situationKey => {
        if (modifiers.defense_bonuses[situationKey]) totalDefense += modifiers.defense_bonuses[situationKey];
    });
    return Math.max(0, totalDefense);
}

function getCulturalPreparationBonus(culture) {
    return getCulturalModifiers(culture).preparation_bonus || 0;
}

function hasCulturalTrait(culture, trait) {
    return getCulturalModifiers(culture).special_traits[trait] || false;
}

function getCulturalMoraleBonus(culture) {
    return getCulturalModifiers(culture).morale_bonus || 0;
}

// ── DAMAGE ACCUMULATION ────────────────────────────────

function initializeDamageTracking(unit) {
    if (!unit.damageAccumulation) {
        unit.damageAccumulation = { accumulated: 0.0, totalDamageReceived: 0, turnsWithNegativeDamage: 0, lastPositiveDamage: 0, damageHistory: [] };
    }
    return unit;
}

function applyDamageWithAccumulation(unit, rawDamage, turnNumber = 1) {
    initializeDamageTracking(unit);
    const result = { rawDamage, accumulatedBefore: unit.damageAccumulation.accumulated, casualties: 0, accumulatedAfter: 0, overflow: false, description: "" };
    unit.damageAccumulation.damageHistory.push({ turn: turnNumber, rawDamage, accumulated: unit.damageAccumulation.accumulated });
    if (rawDamage > 0) {
        const casualties = calculateCasualtiesFromDamage(rawDamage);
        result.casualties = casualties; result.accumulatedAfter = 0; result.overflow = true;
        unit.damageAccumulation.accumulated = 0;
        unit.damageAccumulation.lastPositiveDamage = rawDamage;
        unit.damageAccumulation.totalDamageReceived += rawDamage;
        result.description = `Positive damage: ${rawDamage} = ${casualties} casualties. Bucket reset.`;
    } else if (rawDamage < 0) {
        const damageAmount = Math.abs(rawDamage);
        unit.damageAccumulation.accumulated += damageAmount;
        unit.damageAccumulation.turnsWithNegativeDamage++;
        if (unit.damageAccumulation.accumulated >= 1.0) {
            const overflowDamage = Math.floor(unit.damageAccumulation.accumulated);
            const casualties = overflowDamage * 5;
            unit.damageAccumulation.accumulated = unit.damageAccumulation.accumulated % 1.0;
            unit.damageAccumulation.totalDamageReceived += overflowDamage;
            result.casualties = casualties; result.accumulatedAfter = unit.damageAccumulation.accumulated; result.overflow = true;
            result.description = `Bucket overflow! ${damageAmount} added, ${overflowDamage} overflow = ${casualties} casualties. Remainder: ${result.accumulatedAfter.toFixed(1)}`;
        } else {
            result.accumulatedAfter = unit.damageAccumulation.accumulated;
            result.description = `Bucket filling: +${damageAmount} = ${result.accumulatedAfter.toFixed(1)}/1.0`;
        }
    } else {
        result.accumulatedAfter = unit.damageAccumulation.accumulated;
        result.description = "No damage applied";
    }
    return result;
}

function calculateCasualtiesFromDamage(netDamage) {
    if (netDamage <= 0) return 0;
    return Math.max(2, Math.round(netDamage * 5));
}

function getDamageAccumulationStatus(unit) {
    if (!unit.damageAccumulation) return { hasAccumulation: false, accumulated: 0, bucketLevel: 0, turnsWithNegative: 0, description: "No damage accumulation" };
    const acc = unit.damageAccumulation;
    return {
        hasAccumulation: acc.accumulated > 0, accumulated: acc.accumulated, bucketLevel: acc.accumulated,
        bucketFull: acc.accumulated >= 1.0, turnsWithNegative: acc.turnsWithNegativeDamage,
        totalReceived: acc.totalDamageReceived, lastPositive: acc.lastPositiveDamage,
        historyLength: acc.damageHistory.length,
        description: acc.accumulated > 0 ? `Bucket ${(acc.accumulated * 100).toFixed(1)}% full (${acc.accumulated.toFixed(2)}/1.0)` : "Empty bucket"
    };
}

function applyBattleDamage(units, damageValues, turnNumber = 1) {
    const results = { totalCasualties: 0, unitsWithOverflow: 0, unitsWithAccumulation: 0, detailedResults: [] };
    units.forEach((unit, index) => {
        const damage = damageValues[index] || 0;
        const unitResult = applyDamageWithAccumulation(unit, damage, turnNumber);
        results.totalCasualties += unitResult.casualties;
        if (unitResult.overflow) results.unitsWithOverflow++;
        if (unit.damageAccumulation && unit.damageAccumulation.accumulated < 0) results.unitsWithAccumulation++;
        results.detailedResults.push({ unitId: unit.id || index, unitType: unit.qualityType || 'unknown', ...unitResult });
    });
    return results;
}

function getDamageThreshold(unit) {
    if (!unit.damageAccumulation || unit.damageAccumulation.accumulated >= 0) return 1;
    return Math.abs(unit.damageAccumulation.accumulated) + 1;
}

function simulateDamageAccumulation(currentAccumulation, futureDamageValues) {
    let accumulated = currentAccumulation;
    const simulation = { steps: [], firstCasualtyTurn: null, totalCasualties: 0 };
    futureDamageValues.forEach((damage, turn) => {
        const stepResult = { turn: turn + 1, damageApplied: damage, accumulatedBefore: accumulated, casualties: 0, overflow: false };
        if (damage <= 0) { accumulated += damage; }
        else {
            const netDamage = accumulated + damage;
            if (netDamage > 0) {
                stepResult.casualties = calculateCasualtiesFromDamage(netDamage);
                stepResult.overflow = true; accumulated = 0;
                simulation.totalCasualties += stepResult.casualties;
                if (simulation.firstCasualtyTurn === null) simulation.firstCasualtyTurn = turn + 1;
            } else { accumulated = netDamage; }
        }
        stepResult.accumulatedAfter = accumulated;
        simulation.steps.push(stepResult);
    });
    return simulation;
}

function resetDamageAccumulation(unit) {
    const previousState = unit.damageAccumulation ? { ...unit.damageAccumulation } : null;
    unit.damageAccumulation = { accumulated: 0, totalDamageReceived: 0, turnsWithNegativeDamage: 0, lastPositiveDamage: 0, damageHistory: [] };
    return { reset: true, previousAccumulated: previousState?.accumulated || 0, description: `Reset accumulation (was ${previousState?.accumulated || 0})` };
}

// ── MORALE ─────────────────────────────────────────────

const BASE_BREAK_THRESHOLDS = {
    levy: 0.18, militia: 0.18, professional: 0.30, veteran: 0.40, elite: 0.48, legendary: 0.55
};

function getAdjustedBreakThreshold(unit, context = {}) {
    const quality = (unit.qualityType || unit.quality || 'professional').toLowerCase();
    let base = BASE_BREAK_THRESHOLDS[quality] ?? BASE_BREAK_THRESHOLDS.professional;
    let modifier = 0;
    const vb = unit.veteranBattles || 0;
    if (vb >= 10) modifier += 0.10;
    else if (vb >= 5) modifier += 0.06;
    else if (vb >= 2) modifier += 0.03;
    else if (vb === 1) modifier += 0.01;
    const eliteTier = (unit.veteranTier || '').toLowerCase();
    if (eliteTier === 'seasoned') modifier += 0.03;
    else if (eliteTier === 'veteran') modifier += 0.05;
    else if (eliteTier === 'elite veteran') modifier += 0.07;
    else if (eliteTier === 'legendary') modifier += 0.10;
    if (context.commanderNearby) modifier += 0.10;
    if (context.legendaryNearby) modifier += 0.05;
    if (context.commanderLost) modifier -= 0.10;
    if (context.alliesRoutingNearby && context.alliesRoutingNearby > 0) modifier -= 0.05;
    if (quality === 'legendary' && !context.commanderLost) modifier += 1.0;
    return Math.max(0.05, base + modifier);
}

function checkMorale(unit, casualtiesThisTurn, context = {}) {
    if (!unit || !unit.maxStrength) return unit;
    const casualtyRate = casualtiesThisTurn / unit.maxStrength;
    const threshold = getAdjustedBreakThreshold(unit, context);
    if (unit.isRouting) return unit;
    if (casualtyRate >= threshold && !unit.isBroken) {
        unit.isBroken = true;
        unit.isRouting = true;
        unit.morale = Math.min(unit.morale ?? 100, 20);
    }
    return unit;
}

// ── RANGED COMBAT ──────────────────────────────────────

const RANGE_BANDS = {
    light_javelin: { effective: 1, maximum: 1.5, trajectory: 'flat', type: 'thrown' },
    throwing_spear: { effective: 1, maximum: 1.5, trajectory: 'flat', type: 'thrown' },
    roman_pilum: { effective: 1, maximum: 1.5, trajectory: 'flat', type: 'thrown' },
    self_bow_basic: { effective: 3, maximum: 5, trajectory: 'medium', type: 'bow' },
    self_bow_professional: { effective: 5, maximum: 9, trajectory: 'medium', type: 'bow' },
    greek_composite_bow: { effective: 5, maximum: 8, trajectory: 'medium', type: 'bow' },
    persian_recurve_bow: { effective: 5, maximum: 8, trajectory: 'medium', type: 'bow' },
    parthian_horse_bow: { effective: 5, maximum: 7, trajectory: 'medium', type: 'bow' },
    han_chinese_crossbow: { effective: 4, maximum: 6, trajectory: 'flat', type: 'crossbow' },
    sling: { effective: 6, maximum: 12, trajectory: 'high', type: 'sling' },
    sling_professional: { effective: 8, maximum: 14, trajectory: 'high', type: 'sling' }
};

function getUnitPrimaryWeaponKey(unit) {
    if (!unit) return null;
    if (unit.primaryWeaponKey && typeof unit.primaryWeaponKey === 'string') return unit.primaryWeaponKey;
    const pw = unit.primaryWeapon || {};
    if (typeof pw === 'string') return pw;
    if (pw.key && typeof pw.key === 'string') return pw.key;
    if (pw.name && typeof pw.name === 'string') return pw.name.replace(/\s+/g, '_').toLowerCase();
    return null;
}

function getWeaponRange(weaponKey) {
    if (!weaponKey) return null;
    return RANGE_BANDS[weaponKey.toString()] || null;
}

function getUnitWeaponRange(unit) {
    const key = getUnitPrimaryWeaponKey(unit);
    if (!key) return null;
    return getWeaponRange(key);
}

function hasRangedWeapon(unit) {
    return !!getUnitWeaponRange(unit);
}

function calculateRangeModifier(distance, weaponRange) {
    if (!weaponRange || typeof distance !== 'number') return 0;
    if (distance <= weaponRange.effective) return 1.0;
    if (distance <= weaponRange.maximum) {
        const degradation = (distance - weaponRange.effective) / (weaponRange.maximum - weaponRange.effective || 1);
        return 1.0 - (degradation * 0.6);
    }
    return 0;
}

function findBestTarget(shooter, keyword, enemyState) {
    const enemyUnits = enemyState?.unitPositions || [];
    if (!enemyUnits.length) return null;
    const lowerKeyword = (keyword || '').toLowerCase();
    if (lowerKeyword && lowerKeyword !== 'enemy') {
        const match = enemyUnits.find(u => (u.unitType || '').toLowerCase().includes(lowerKeyword));
        if (match) return match;
    }
    let best = enemyUnits[0];
    let bestDist = calculateDistance(shooter.position, best.position);
    for (let i = 1; i < enemyUnits.length; i++) {
        const u = enemyUnits[i];
        const d = calculateDistance(shooter.position, u.position);
        if (d < bestDist) { best = u; bestDist = d; }
    }
    return best;
}

function calculateShootingAngle(shooter, target) {
    const { parseCoord } = require('./maps/mapUtils');
    if (!shooter?.position || !target?.position) return 'frontal';
    const s = parseCoord(shooter.position);
    const t = parseCoord(target.position);
    if (s.row === t.row || s.col === t.col) return 'flanking';
    return 'frontal';
}

function calculateFriendlyFireRisk(shooter, target, battleState, weaponRangeOverride) {
    const engagements = battleState?.meleeEngagements;
    const weaponRange = weaponRangeOverride || getUnitWeaponRange(shooter) || { trajectory: 'medium' };
    if (!engagements || typeof engagements.get !== 'function') {
        return { risk: 0, method: 'clear_shot', trajectoryType: weaponRange.trajectory || 'medium', friendlyUnitsAtRisk: [] };
    }
    const targetEngagement = engagements.get(target.unitId);
    if (!targetEngagement || !targetEngagement.engaged) {
        return { risk: 0, method: 'clear_shot', trajectoryType: weaponRange.trajectory || 'medium', friendlyUnitsAtRisk: [] };
    }
    const trajectoryRisk = { flat: 0.40, medium: 0.30, high: 0.20 };
    let baseRisk = trajectoryRisk[weaponRange.trajectory] ?? 0.30;
    const angle = calculateShootingAngle(shooter, target);
    if (angle === 'flanking') baseRisk *= 0.35;
    else if (angle === 'elevated') baseRisk *= 0.65;
    return { risk: baseRisk, method: angle || 'shooting_into_melee', trajectoryType: weaponRange.trajectory || 'medium', friendlyUnitsAtRisk: targetEngagement.adjacentFriendlies || [] };
}

function validateRangedAttack(shooter, targetKeyword, battleState, playerSide) {
    const enemySide = playerSide === 'player1' ? 'player2' : 'player1';
    const enemyState = battleState[enemySide];
    if (!shooter || !enemyState) return { valid: false, error: 'Invalid shooter or enemy state' };
    const weaponRange = getUnitWeaponRange(shooter);
    if (!weaponRange) return { valid: false, error: 'Unit has no ranged weapon' };
    const target = findBestTarget(shooter, targetKeyword, enemyState);
    if (!target) return { valid: false, error: `Cannot identify target "${targetKeyword || 'enemy'}"` };
    const distance = calculateDistance(shooter.position, target.position);
    if (distance <= 1) return { valid: false, error: 'Target is in melee range; use melee orders instead' };
    if (distance > weaponRange.maximum) return { valid: false, error: `Target out of range (${distance} tiles, max ${weaponRange.maximum})` };
    const rangeModifier = calculateRangeModifier(distance, weaponRange);
    const friendlyFireRisk = calculateFriendlyFireRisk(shooter, target, battleState, weaponRange);
    return { valid: true, target, distance, weaponRange, rangeModifier, friendlyFireRisk, needsConfirmation: friendlyFireRisk.risk > 0.20 };
}

// ── MAIN RESOLUTION ────────────────────────────────────

function calculateTotalAttackRating(force, targetForce = null, conditions = {}, isDefender = false) {
    if (!force.units || force.units.length === 0) return 1;
    let totalAttack = 0;
    force.units.forEach(unit => {
        const combatUnit = {
            weapons: unit.primaryWeapon?.name ? [unit.primaryWeapon.name] : ['unarmed'],
            quality: unit.qualityType || 'levy',
            formation: force.formation || 'line',
            mounted: unit.mounted || false
        };
        let targetUnit = null;
        if (targetForce && targetForce.units && targetForce.units.length > 0) {
            const firstTarget = targetForce.units[0];
            targetUnit = {
                weapons: firstTarget.primaryWeapon?.name ? [firstTarget.primaryWeapon.name] : ['unarmed'],
                quality: firstTarget.qualityType || 'levy',
                formation: targetForce.formation || 'line',
                mounted: firstTarget.mounted || false
            };
        }
        const unitAttack = calculateAttackRating(combatUnit, conditions, targetUnit, isDefender);
        const unitSize = unit.quality?.size || 100;
        totalAttack += unitAttack * (unitSize / 100);
    });
    return Math.max(1, Math.round(totalAttack));
}

function calculateTotalDefenseRating(force) {
    if (!force.units || force.units.length === 0) return 0;
    let totalDefense = 0;
    force.units.forEach(unit => {
        const combatUnit = {
            armor: unit.armor?.key || unit.armor?.name || 'no_armor',
            shield: unit.shields?.key || unit.shields?.name || 'no_shield',
            quality: unit.qualityType || 'levy',
            formation: force.formation || 'line'
        };
        let unitDefense = calculateDefenseRating(combatUnit, {});
        if (unit.isBroken || unit.status === 'broken') unitDefense = Math.max(0, Math.round(unitDefense * 0.5));
        if (unit.formationChanging && unit.formationChanging.remaining > 0) unitDefense = Math.max(0, unitDefense + (unit.formationChanging.penalty || -3));
        const unitSize = unit.quality?.size || 100;
        totalDefense += unitDefense * (unitSize / 100);
    });
    return Math.max(0, Math.round(totalDefense));
}

function calculateTotalPreparation(force, conditions, isAttacker = false) {
    if (!force.units || force.units.length === 0) return 1.0;
    let totalPreparation = 0;
    force.units.forEach(unit => {
        const combatUnit = {
            training: unit.training?.type ? `${unit.training.type}_${unit.training.level}` : 'none',
            formation: force.formation || 'line',
            experience: force.experience || 'regular',
            position: 'neutral',
            cultural_traits: [],
            mounted: unit.mounted || false
        };
        const preparationResult = calculatePreparationLegacy(combatUnit, conditions, isAttacker);
        let unitPreparation = preparationResult.preparationLevel || 1.0;
        if (unitPreparation > 4.0) unitPreparation = 1.0 + (unitPreparation / 10) * 3.0;
        const unitSize = unit.quality?.size || 100;
        totalPreparation += unitPreparation * (unitSize / 100);
    });
    const avgPreparation = totalPreparation / force.units.length;
    return Math.max(1.0, Math.min(4.0, avgPreparation));
}

async function resolveCombat(attackingForce, defendingForce, battleConditions, tacticalContext) {
    try {
        console.log('=== Combat System v2.0 - Starting Resolution ===');
        const attackerAttack = calculateTotalAttackRating(attackingForce, defendingForce, battleConditions, false);
        const attackerDefense = calculateTotalDefenseRating(attackingForce);
        const defenderAttack = calculateTotalAttackRating(defendingForce, attackingForce, battleConditions, true);
        const defenderDefense = calculateTotalDefenseRating(defendingForce);
        console.log(`Attack Ratings - Attacker: ${attackerAttack}, Defender: ${defenderAttack}`);
        console.log(`Defense Ratings - Attacker: ${attackerDefense}, Defender: ${defenderDefense}`);
        const chaosResult = calculateChaosLevel(battleConditions);
        const chaosLevel = chaosResult.chaosLevel;
        console.log(`Battlefield Chaos Level: ${chaosLevel}/10`);
        console.log(`Chaos Factors: ${chaosResult.breakdown.factors.join(', ') || 'None'}`);
        const attackerPreparation = calculateTotalPreparation(attackingForce, battleConditions, true);
        const defenderPreparation = calculateTotalPreparation(defendingForce, battleConditions, false);
        console.log(`Preparation - Attacker: ${attackerPreparation.toFixed(2)}, Defender: ${defenderPreparation.toFixed(2)}`);
        let chaosRoll = rollChaos(chaosLevel);
        const rawChaos = chaosRoll - (chaosLevel / 2);
        console.log(`Chaos Roll: ${chaosRoll}, Raw Chaos: ${rawChaos}`);
        let attackerChaos = rawChaos / Math.max(1.0, attackerPreparation);
        let defenderChaos = rawChaos / Math.max(1.0, defenderPreparation);
        if (battleConditions.combat_situation === 'ambush') {
            defenderChaos = defenderChaos * 1.5;
            console.log(`Ambush detected: Defender chaos amplified by 50%`);
        }
        console.log(`Applied Chaos - Attacker: ${attackerChaos.toFixed(2)}, Defender: ${defenderChaos.toFixed(2)}`);
        if (rawChaos !== 0) {
            const attackerReduction = ((1 - (attackerChaos / rawChaos)) * 100).toFixed(0);
            const defenderReduction = ((1 - (defenderChaos / rawChaos)) * 100).toFixed(0);
            console.log(`Preparation Effect - Attacker chaos reduced by ${attackerReduction}%, Defender by ${defenderReduction}%`);
        } else {
            console.log(`Preparation Effect - No chaos to reduce (clear conditions)`);
        }
        const attackerEffectiveAttack = attackerAttack - attackerChaos;
        const attackerEffectiveDefense = attackerDefense - attackerChaos;
        const defenderEffectiveAttack = defenderAttack - defenderChaos;
        const defenderEffectiveDefense = defenderDefense - defenderChaos;
        console.log(`Effective Values:`);
        console.log(`  Attacker: Attack ${attackerEffectiveAttack.toFixed(2)}, Defense ${attackerEffectiveDefense.toFixed(2)}`);
        console.log(`  Defender: Attack ${defenderEffectiveAttack.toFixed(2)}, Defense ${defenderEffectiveDefense.toFixed(2)}`);
        const attackerDamage = attackerEffectiveAttack - defenderEffectiveDefense;
        const defenderDamage = defenderEffectiveAttack - attackerEffectiveDefense;
        console.log(`Raw Damage - Attacker deals: ${attackerDamage.toFixed(2)}, Defender deals: ${defenderDamage.toFixed(2)}`);
        const casualties = applyDamageWithAccumulationToForces(attackerDamage, defenderDamage, attackingForce, defendingForce, tacticalContext.turn || 1);
        const combatResult = determineCombatResult(attackerDamage, defenderDamage, casualties);
        const moraleChanges = calculateMoraleFromResult(combatResult);
        console.log(`=== Combat Resolution Complete ===`);
        console.log(`Result: ${combatResult.result}`);
        console.log(`Casualties: Attacker ${casualties.attacker.total}, Defender ${casualties.defender.total}`);
        return {
            combatData: {
                chaosLevel, chaosRoll, rawChaos, attackerPreparation, defenderPreparation,
                attackerChaos, defenderChaos, attackerAttack, defenderAttack, attackerDefense, defenderDefense,
                effectiveAttack: { attacker: attackerEffectiveAttack, defender: defenderEffectiveAttack },
                effectiveDefense: { attacker: attackerEffectiveDefense, defender: defenderEffectiveDefense },
                rawDamage: { attacker: attackerDamage, defender: defenderDamage },
                damageAccumulation: {
                    attacker: casualties.attacker.accumulationData || [],
                    defender: casualties.defender.accumulationData || [],
                    hasAccumulatedDamage: {
                        attacker: casualties.attacker.accumulationData?.some(unit => unit.accumulatedAfter < 0) || false,
                        defender: casualties.defender.accumulationData?.some(unit => unit.accumulatedAfter < 0) || false
                    },
                    overflowUnits: {
                        attacker: casualties.attacker.accumulationData?.filter(unit => unit.overflow).length || 0,
                        defender: casualties.defender.accumulationData?.filter(unit => unit.overflow).length || 0
                    }
                }
            },
            combatResult, casualties, moraleChanges,
            tacticalDevelopments: determineTacticalDevelopments(combatResult, casualties),
            nextTurnModifiers: calculateNextTurnEffects(combatResult, battleConditions)
        };
    } catch (error) {
        console.error('Combat System v2.0 Error:', error);
        throw new Error(`Combat resolution failed: ${error.message}`);
    }
}

function rollChaos(chaosLevel) {
    if (chaosLevel <= 0) return 0;
    return Math.floor(Math.random() * chaosLevel) + 1;
}

function applyDamageWithAccumulationToForces(attackerDamage, defenderDamage, attackingForce, defendingForce, turnNumber) {
    const casualties = {
        attacker: { casualties: 0, total: 0, units: [], accumulationData: [] },
        defender: { casualties: 0, total: 0, units: [], accumulationData: [] }
    };
    const ATTACKER_DAMAGE_SCALE = 0.5;
    const DEFENDER_DAMAGE_SCALE = 0.5;
    const scaledAttackerDamage = attackerDamage * ATTACKER_DAMAGE_SCALE;
    const scaledDefenderDamage = defenderDamage * DEFENDER_DAMAGE_SCALE;
    if (defendingForce.units && defendingForce.units.length > 0) {
        const damagePerUnit = scaledAttackerDamage / defendingForce.units.length;
        defendingForce.units.forEach((unit, index) => {
            const result = applyDamageWithAccumulation(unit, damagePerUnit, turnNumber);
            const maxStr = unit.quality?.size || unit.maxStrength || 100;
            checkMorale(unit, result.casualties, {});
            unit.maxStrength = maxStr;
            casualties.defender.casualties += result.casualties;
            casualties.defender.total += result.casualties;
            casualties.defender.units.push({ casualties: result.casualties, type: unit.qualityType || 'professional', strength: maxStr, accumulated: result.accumulatedAfter, overflow: result.overflow });
            casualties.defender.accumulationData.push({ unitIndex: index, ...result });
        });
    }
    if (attackingForce.units && attackingForce.units.length > 0) {
        const damagePerUnit = scaledDefenderDamage / attackingForce.units.length;
        attackingForce.units.forEach((unit, index) => {
            const result = applyDamageWithAccumulation(unit, damagePerUnit, turnNumber);
            const maxStr = unit.quality?.size || unit.maxStrength || 100;
            checkMorale(unit, result.casualties, {});
            unit.maxStrength = maxStr;
            casualties.attacker.casualties += result.casualties;
            casualties.attacker.total += result.casualties;
            casualties.attacker.units.push({ casualties: result.casualties, type: unit.qualityType || 'professional', strength: maxStr, accumulated: result.accumulatedAfter, overflow: result.overflow });
            casualties.attacker.accumulationData.push({ unitIndex: index, ...result });
        });
    }
    return casualties;
}

function determineCombatResult(attackerDamage, defenderDamage, casualties) {
    let result = 'stalemate'; let intensity = 'moderate';
    const damageDifference = attackerDamage - defenderDamage;
    if (damageDifference >= 4) { result = 'attacker_major_victory'; intensity = 'decisive'; }
    else if (damageDifference >= 2) { result = 'attacker_victory'; intensity = 'significant'; }
    else if (damageDifference >= 0.5) { result = 'attacker_advantage'; intensity = 'slight'; }
    else if (damageDifference <= -4) { result = 'defender_major_victory'; intensity = 'decisive'; }
    else if (damageDifference <= -2) { result = 'defender_victory'; intensity = 'significant'; }
    else if (damageDifference <= -0.5) { result = 'defender_advantage'; intensity = 'slight'; }
    return { result, intensity, damageDifference, attackerDamage, defenderDamage };
}

function calculateMoraleFromResult(combatResult) {
    const baseMoraleChanges = {
        'attacker_major_victory': { attacker: +15, defender: -20 },
        'attacker_victory': { attacker: +10, defender: -15 },
        'attacker_advantage': { attacker: +5, defender: -8 },
        'stalemate': { attacker: -2, defender: -2 },
        'defender_advantage': { attacker: -8, defender: +5 },
        'defender_victory': { attacker: -15, defender: +10 },
        'defender_major_victory': { attacker: -20, defender: +15 }
    };
    return baseMoraleChanges[combatResult.result] || { attacker: 0, defender: 0 };
}

function determineTacticalDevelopments(combatResult, casualties) {
    const developments = [];
    if (combatResult.intensity === 'decisive') developments.push('formation_disruption');
    if (casualties.attacker.total > casualties.defender.total * 2) developments.push('defender_advantage');
    else if (casualties.defender.total > casualties.attacker.total * 2) developments.push('attacker_advantage');
    return developments;
}

function calculateNextTurnEffects(combatResult, conditions) {
    const effects = { moraleModifiers: {}, positionChanges: {}, specialConditions: [] };
    if (combatResult.intensity === 'significant' || combatResult.intensity === 'decisive') effects.positionChanges.winner_advance = true;
    return effects;
}

async function resolveRangedAttack(order, battleState, playerSide) {
    if (!order || !order.unitId) return null;
    const shooterSide = playerSide === 'player2' ? 'player2' : 'player1';
    const enemySide = shooterSide === 'player1' ? 'player2' : 'player1';
    const shooter = (battleState[shooterSide]?.unitPositions || []).find(u => u.unitId === order.unitId);
    if (!shooter) return null;
    const enemyUnits = battleState[enemySide]?.unitPositions || [];
    const targetId = order.validation?.target?.unitId || order.targetUnitId;
    const target = enemyUnits.find(u => u.unitId === targetId);
    if (!target) return null;
    const weaponRange = order.validation?.weaponRange || getUnitWeaponRange(shooter);
    if (!weaponRange) return null;
    const distance = calculateDistance(shooter.position, target.position);
    if (!Number.isFinite(distance) || distance <= 1 || distance > weaponRange.maximum) return null;
    const rangeModifier = order.validation?.rangeModifier ?? calculateRangeModifier(distance, weaponRange);
    if (rangeModifier <= 0) return null;
    const ffRisk = calculateFriendlyFireRisk(shooter, target, battleState, weaponRange);
    const attackerForce = { units: [shooter], formation: shooter.formation || 'line', experience: shooter.experience || 'regular' };
    const defenderForce = { units: [target], formation: target.formation || 'line', experience: target.experience || 'regular' };
    const conditions = { weather: battleState.weather, terrain: order.terrain || 'plains', combat_situation: order.combat_situation || null };
    const baseAttack = calculateTotalAttackRating(attackerForce, defenderForce, conditions, false);
    const baseDefense = calculateTotalDefenseRating(defenderForce);
    const rawDamage = Math.max(0, baseAttack - baseDefense);
    const rangedDamage = rawDamage * rangeModifier;
    const casualties = applyDamageWithAccumulationToForces(rangedDamage, 0, attackerForce, defenderForce, battleState.currentTurn || 1);
    const totalCasualties = casualties.defender.total || 0;
    let enemyCasualties = totalCasualties;
    let friendlyTotal = 0;
    if (ffRisk && typeof ffRisk.risk === 'number' && ffRisk.risk > 0) {
        const share = Math.max(0, Math.min(0.9, ffRisk.risk));
        enemyCasualties = Math.round(totalCasualties * (1 - share));
        friendlyTotal = Math.max(0, totalCasualties - enemyCasualties);
    }
    const friendlyCasualties = [];
    if (friendlyTotal > 0 && ffRisk && Array.isArray(ffRisk.friendlyUnitsAtRisk) && ffRisk.friendlyUnitsAtRisk.length > 0) {
        const ids = ffRisk.friendlyUnitsAtRisk;
        const base = Math.floor(friendlyTotal / ids.length);
        let remainder = friendlyTotal % ids.length;
        ids.forEach(id => {
            const cas = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder -= 1;
            if (cas > 0) friendlyCasualties.push({ unitId: id, casualties: cas });
        });
    }
    return { type: 'ranged_attack', shooterUnitId: shooter.unitId, target: { unitId: target.unitId, position: target.position }, distance, weaponRange, rangeModifier, casualties: enemyCasualties, friendlyCasualties, friendlyFireRisk: ffRisk };
}

// ── POSITIONAL COMBAT MODIFIERS ────────────────────────────────────────────────
// Merged from positionBasedCombat.js

/**
 * Derive a coarse cardinal attack direction (N/S/E/W) from attacker to defender.
 * Diagonals are collapsed to their dominant axis.
 */
function _getAttackCardinalDirection(attackerPos, defenderPos) {
    const dirStr = getDirection(attackerPos, defenderPos);
    if (!dirStr || typeof dirStr !== 'string') return null;
    const d = dirStr.toLowerCase();
    if (d.includes('north') && !d.includes('east') && !d.includes('west')) return 'N';
    if (d.includes('south') && !d.includes('east') && !d.includes('west')) return 'S';
    if (d.includes('east')  && !d.includes('north') && !d.includes('south')) return 'E';
    if (d.includes('west')  && !d.includes('north') && !d.includes('south')) return 'W';
    const from = parseCoord(attackerPos);
    const to = parseCoord(defenderPos);
    if (!from || !to) return null;
    const dRow = to.row - from.row;
    const dCol = to.col - from.col;
    if (Math.abs(dRow) >= Math.abs(dCol)) {
        return dRow >= 0 ? 'S' : 'N';
    } else {
        return dCol >= 0 ? 'E' : 'W';
    }
}

function _getFormationDefenseBonus(defender, attackDirection) {
    const facing = (defender.facing || 'N').toUpperCase();
    const formation = (defender.formation || '').toLowerCase();
    if (!attackDirection) return 0;
    const isFlank = (face, atk) => {
        if (face === 'N' || face === 'S') return atk === 'E' || atk === 'W';
        else return atk === 'N' || atk === 'S';
    };
    const isRear = (face, atk) => {
        if (face === 'N' && atk === 'S') return true;
        if (face === 'S' && atk === 'N') return true;
        if (face === 'E' && atk === 'W') return true;
        if (face === 'W' && atk === 'E') return true;
        return false;
    };
    if (formation === 'phalanx' || formation === 'shield_wall' || formation === 'roman_manipular') {
        if (attackDirection === facing) return +4;
        if (isFlank(facing, attackDirection)) return -4;
        if (isRear(facing, attackDirection)) return -6;
    }
    return 0;
}

function _getTerrainType(coord, map) {
    if (map.terrain.river && map.terrain.river.includes(coord)) {
        if (map.terrain.fords && map.terrain.fords.some(f => f.coord === coord)) return 'ford';
        return 'river';
    }
    if (map.terrain.hill && map.terrain.hill.includes(coord)) return 'hill';
    if (map.terrain.marsh && map.terrain.marsh.includes(coord)) return 'marsh';
    if (map.terrain.road && map.terrain.road.includes(coord)) return 'road';
    if (map.terrain.forest && map.terrain.forest.includes(coord)) return 'forest';
    return 'plains';
}

/**
 * Calculate flanking bonus from friendly units
 */
function calculateFlankingBonus(attacker, defender, allUnits) {
    const defenderPos = defender.position;
    const adjacent = getAdjacentCoords(defenderPos);

    // Enemy units of defender that are adjacent (other than this attacker)
    const adjacentEnemies = allUnits.filter(unit =>
        unit.side !== defender.side &&
        unit.unitId !== attacker.unitId &&
        adjacent.includes(unit.position)
    );

    if (adjacentEnemies.length === 0) return 0;

    const directions = new Set();
    adjacentEnemies.forEach(unit => {
        const dir = _getAttackCardinalDirection(unit.position, defenderPos);
        if (dir) directions.add(dir);
    });

    const attackDirections = directions.size;
    if (attackDirections <= 1) return 0;
    if (attackDirections === 2) return +3;
    if (attackDirections === 3) return +6;
    if (attackDirections >= 4) return +8;
    return 0;
}

/**
 * Calculate elevation advantage
 */
function calculateElevationAdvantage(attackerPos, defenderPos, map) {
    const attackerTerrain = _getTerrainType(attackerPos, map);
    const defenderTerrain = _getTerrainType(defenderPos, map);

    const attackerElevation = attackerTerrain === 'hill' ? 1 : 0;
    const defenderElevation = defenderTerrain === 'hill' ? 1 : 0;

    if (defenderElevation > attackerElevation) return { defender: +2, attacker: 0 };
    if (attackerElevation > defenderElevation) return { attacker: +2, defender: 0 };
    return { attacker: 0, defender: 0 };
}

/**
 * Check if attacker is crossing river to attack
 */
function isCrossingRiver(attackerPos, defenderPos, map) {
    if (!isFord(defenderPos)) return false;
    const distance = calculateDistance(attackerPos, defenderPos);
    if (distance !== 1) return false;
    return !isFord(attackerPos);
}

/**
 * Calculate tactical position modifiers for combat
 */
function calculatePositionalModifiers(attacker, defender, allUnits, map) {
    if (defender.formationChanging && defender.formationChanging.remaining > 0) {
        defender.positionModifiers = defender.positionModifiers || {};
        defender.positionModifiers.defense = (defender.positionModifiers.defense || 0) - 3;
    }
    const modifiers = {
        attacker: { attack: 0, defense: 0 },
        defender: { attack: 0, defense: 0 },
        description: []
    };

    const flankingBonus = calculateFlankingBonus(attacker, defender, allUnits);
    if (flankingBonus > 0) {
        modifiers.attacker.attack += flankingBonus;
        modifiers.description.push(`Flanking attack: +${flankingBonus} attack`);
    }

    const elevationMod = calculateElevationAdvantage(attacker.position, defender.position, map);
    if (elevationMod.defender > 0) {
        modifiers.defender.defense += elevationMod.defender;
        modifiers.description.push(`High ground defense: +${elevationMod.defender}`);
    }
    if (elevationMod.attacker > 0) {
        modifiers.attacker.attack += elevationMod.attacker;
        modifiers.description.push(`Downhill attack: +${elevationMod.attacker}`);
    }

    const attackDir = _getAttackCardinalDirection(attacker.position, defender.position);
    const facingBonus = _getFormationDefenseBonus(defender, attackDir);
    if (facingBonus !== 0) {
        modifiers.defender.defense += facingBonus;
        if (facingBonus > 0) {
            modifiers.description.push(`Formation facing advantage (${attackDir} vs ${defender.facing || 'N'}): +${facingBonus} defense`);
        } else {
            modifiers.description.push(`Hit from flank/rear (${attackDir} vs ${defender.facing || 'N'}): ${facingBonus} defense`);
        }
    }

    if ((defender.formationStatus || 'deployed') === 'marching' && attackDir) {
        const defFacing = (defender.facing || 'N').toUpperCase();
        if (attackDir === defFacing) {
            const strength = defender.currentStrength || defender.maxStrength || 400;
            const tilesDeep = Math.max(1, Math.min(4, Math.ceil(strength / 100)));
            const frontagePenalty = (tilesDeep - 1) * 2;
            if (frontagePenalty > 0) {
                modifiers.defender.defense -= frontagePenalty;
                modifiers.description.push(
                    `March column head hit: only 1/${tilesDeep} of men can fight; defense ${-frontagePenalty}`
                );
            }
        }
    }

    if (isCrossingRiver(attacker.position, defender.position, map)) {
        modifiers.attacker.attack -= 4;
        modifiers.defender.defense += 3;
        modifiers.description.push('Attacking across ford: -4 attack, defender +3 defense');
    }

    const defenderTerrain = _getTerrainType(defender.position, map);
    if (defenderTerrain === 'forest') {
        modifiers.defender.defense += 2;
        modifiers.description.push('Forest cover: +2 defense');
        if (attacker.mounted) {
            modifiers.attacker.attack -= 4;
            modifiers.description.push('Cavalry in forest: -4 attack');
        }
    }

    if (defenderTerrain === 'marsh') {
        modifiers.defender.defense -= 2;
        modifiers.attacker.attack -= 2;
        modifiers.description.push('Fighting in marsh: both sides -2');
    }

    return modifiers;
}

/**
 * Build combat context with positional data
 */
function buildCombatContext(combat, battleState, map) {
    const allUnits = [
        ...(battleState.player1.unitPositions || []).map(u => ({...u, side: 'player1'})),
        ...(battleState.player2.unitPositions || []).map(u => ({...u, side: 'player2'}))
    ];

    const positionMods = calculatePositionalModifiers(
        combat.attacker,
        combat.defender,
        allUnits,
        map
    );

    return {
        attacker: {
            unit: combat.attacker,
            positionModifiers: positionMods.attacker,
            position: combat.attacker.position
        },
        defender: {
            unit: combat.defender,
            positionModifiers: positionMods.defender,
            position: combat.defender.position
        },
        location: combat.location,
        terrain: _getTerrainType(combat.location, map),
        combatType: combat.type,
        tacticalSituation: positionMods.description
    };
}

// Combat System v2.0 Exports
module.exports = {
    resolveCombat,
    resolveRangedAttack,
    rollChaos,
    calculateTotalAttackRating,
    calculateTotalDefenseRating,
    calculateTotalPreparation,
    applyDamageWithAccumulationToForces,
    determineCombatResult,
    calculateMoraleFromResult,
    determineTacticalDevelopments,
    calculateNextTurnEffects,
    // attack ratings
    WEAPON_ATTACK_RATINGS, TRAINING_ATTACK_BONUSES, FORMATION_ATTACK_MODIFIERS, SITUATIONAL_ATTACK_MODIFIERS,
    calculateAttackRating, mapWeaponKeyToRatingKey, getAntiArmorBonus, isRangedWeapon, normalizeWeaponKey, calculateClosingDistanceBonus,
    // defense ratings
    ARMOR_DEFENSE_RATINGS, SHIELD_DEFENSE_BONUSES, TRAINING_DEFENSE_BONUSES, FORMATION_DEFENSE_MODIFIERS,
    SITUATIONAL_DEFENSE_MODIFIERS, ARMOR_TYPE_EFFECTIVENESS, WEAPON_DAMAGE_TYPES,
    calculateDefenseRating, mapArmorKeyToRatingKey, mapShieldKeyToRatingKey, getArmorEffectiveness, getWeaponDamageType, normalizeEquipmentKey,
    // chaos
    ENVIRONMENTAL_CHAOS, TACTICAL_CHAOS, SPECIAL_CHAOS_MODIFIERS,
    calculateChaosLevel, getChaosDescription, rollChaosModifier, analyzeBattleForChaos,
    // preparation
    calculatePreparation, buildPreparationContext, calculatePreparationLegacy,
    getPreparationDescription, getNewPreparationDescription, isChargeCapable, isDefensiveFormation,
    // cultural
    CULTURAL_COMBAT_MODIFIERS, getCulturalModifiers, getCulturalCombatModifiers,
    applyCulturalAttackModifiers, applyCulturalDefenseModifiers, getCulturalPreparationBonus, hasCulturalTrait, getCulturalMoraleBonus,
    // damage accumulation
    initializeDamageTracking, applyDamageWithAccumulation, calculateCasualtiesFromDamage,
    getDamageAccumulationStatus, applyBattleDamage, getDamageThreshold, simulateDamageAccumulation, resetDamageAccumulation,
    // morale
    checkMorale, getAdjustedBreakThreshold, BASE_BREAK_THRESHOLDS,
    // ranged
    RANGE_BANDS, getWeaponRange, getUnitWeaponRange, hasRangedWeapon, calculateRangeModifier,
    validateRangedAttack, calculateFriendlyFireRisk, getUnitPrimaryWeaponKey,
    // positional
    calculatePositionalModifiers, buildCombatContext, calculateFlankingBonus,
    calculateElevationAdvantage, isCrossingRiver
};

// 8 ELITE UNITS - Current Game Implementation
// Warp AI Format - Consistent Stats, Historically Grounded
// All elites: Professional quality with cultural specialization

const ELITE_UNITS = {
  
  // 1. ROMAN REPUBLIC
  roman_praetorian_guard: {
    culture: "Roman Republic",
    name: "Praetorian Guard",
    size: 80,
    officers: 12,
    equipment: {
      primary_weapon: "Roman Gladius (short thrusting sword)",
      secondary_weapon: "Pugio (military dagger)",
      ranged_weapon: "Pilum (2 heavy javelins)",
      armor: "Lorica Segmentata (segmented plate)",
      shield: "Scutum (large rectangular shield)"
    },
    stats: {
      attack: 8,
      defense: 8,
      morale: 7,
      movement: 3,
      range: 1
    },
    specialization: "Formation discipline, field engineering, tactical adaptability"
  },

  // 2. MACEDONIAN KINGDOMS  
  macedonian_silver_shields: {
    culture: "Macedonian Kingdoms",
    name: "Silver Shields (Argyraspides)",
    size: 80,
    officers: 12,
    equipment: {
      primary_weapon: "Sarissa Pike (18-21 foot) OR Dory Spear (flexible)",
      secondary_weapon: "Xiphos (short sword)",
      ranged_weapon: "None",
      armor: "Bronze Cuirass",
      shield: "Small Phalangite Shield (when using sarissa)"
    },
    stats: {
      attack: 9,
      defense: 7,
      morale: 8,
      movement: 3,
      range: 0
    },
    specialization: "Veteran warfare, equipment flexibility, combined arms mastery"
  },

  // 3. SPARTAN CITY-STATE
  spartan_lacedaimonian: {
    culture: "Spartan City-State",
    name: "Lacedaimonian Guards",
    size: 40,
    officers: 8,
    equipment: {
      primary_weapon: "Dory Spear (6-9 foot)",
      secondary_weapon: "Xiphos (short sword)",
      ranged_weapon: "None",
      armor: "Bronze Panoply (cuirass, helmet, greaves)",
      shield: "Hoplon (large round shield with lambda)"
    },
    stats: {
      attack: 10,
      defense: 10,
      morale: 10,
      movement: 3,
      range: 0
    },
    specialization: "Individual excellence, phalanx perfection, fight to 50% casualties"
  },

  // 4. CARTHAGINIAN EMPIRE
  carthaginian_sacred_band: {
    culture: "Carthaginian Empire",
    name: "The Sacred Band",
    size: 100,
    officers: 12,
    equipment: {
      primary_weapon: "Professional Spear",
      secondary_weapon: "Standard Sword",
      ranged_weapon: "Heavy Javelin",
      armor: "Heavy Armor (best available from empire)",
      shield: "Heavy Shield (white painted - distinctive)"
    },
    stats: {
      attack: 8,
      defense: 8,
      morale: 6,
      movement: 3,
      range: 1
    },
    specialization: "Mercenary coordination, war elephants, merchant wealth (+2 SP)"
  },

  // 5. KINGDOM OF KUSH
  kushite_golden_bow: {
    culture: "Kingdom of Kush (Nubia)",
    name: "Children of the Golden Bow",
    size: 80,
    officers: 10,
    equipment: {
      primary_weapon: "Nubian Bow (6-7 foot, requires foot-bracing)",
      secondary_weapon: "Standard Sword",
      ranged_weapon: "Bow IS primary weapon",
      armor: "Leather Armor with Gold Jewelry",
      shield: "Light Shield"
    },
    stats: {
      attack: 6,
      defense: 5,
      morale: 7,
      movement: 3,
      range: 4
    },
    specialization: "Supreme archery, desert mastery, archer-cavalry coordination"
  },

  // 6. BERBER CONFEDERATIONS
  berber_blue_men: {
    culture: "Berber Confederations",
    name: "The Blue Men",
    size: 80,
    officers: 10,
    equipment: {
      primary_weapon: "Light Spear (cavalry lance)",
      secondary_weapon: "Standard Sword",
      ranged_weapon: "Light Javelin (3-4 carried)",
      armor: "Leather Armor with Blue-Dyed Cloth",
      shield: "Light Shield",
      mount: "Desert Horses"
    },
    stats: {
      attack: 7,
      defense: 6,
      morale: 7,
      movement: 5,
      range: 1
    },
    specialization: "Desert mobility, hit-and-run raids, equipment adaptation"
  },

  // 7. SARMATIAN CONFEDERATIONS
  sarmatian_iron_scales: {
    culture: "Sarmatian Confederations",
    name: "Iron Scale Riders",
    size: 80,
    officers: 10,
    equipment: {
      primary_weapon: "Kontos Lance (4-meter two-handed)",
      secondary_weapon: "Standard Sword",
      ranged_weapon: "Composite Horse Bow",
      armor: "Scale Armor (rider and horse)",
      shield: "None (two-handed weapons)",
      mount: "Armored Horses"
    },
    stats: {
      attack: 8,
      defense: 7,
      morale: 7,
      movement: 5,
      range: 3
    },
    specialization: "Dual-mode combat, heavy cavalry charges, feigned retreat mastery"
  },

  // 8. HAN DYNASTY CHINA
  han_feathered_forest: {
    culture: "Han Dynasty China",
    name: "Feathered Forest Guard (Yulin)",
    size: 100,
    officers: 12,
    equipment: {
      primary_weapon: "Jian/Dao Swords",
      secondary_weapon: "None",
      ranged_weapon: "Chinese Crossbow (bronze trigger)",
      armor: "Iron Lamellar Armor",
      shield: "Medium Shield (crossbow compatible)",
      mount: "Mixed (50% cavalry, 50% infantry)"
    },
    stats: {
      attack: 7,
      defense: 7,
      morale: 8,
      movement: 3,
      range: 3
    },
    specialization: "Advanced technology, mass crossbow deployment, cultural assimilation"
  }

};

// BALANCE PARAMETERS (All Elites)
const ELITE_BALANCE = {
  attack_range: [6, 10],      // Min-max attack values
  defense_range: [5, 10],     // Min-max defense values  
  morale_range: [6, 10],      // Min-max morale values
  size_range: [40, 100],      // Spartan smallest, Han/Mongol/Carthage largest
  
  consistency: "Professional quality baseline with cultural bonuses",
  tradeoffs: "High attack usually means lower defense or mobility",
  
  examples: {
    spartan: "Maximum stats (10/10/10) but smallest size (40)",
    roman: "Balanced all-around (8/8/7) standard size (80)",
    kushite: "Ranged specialist (6/5/7) with superior range (4)",
    sarmatian: "Mobile dual-mode (8/7/7) mounted (movement 5)"
  }
};

// WARP GENERATION GUIDELINES
const WARP_INSTRUCTIONS = {
  stat_consistency: "Keep all elites within 6-10 range for attack/defense/morale",
  size_variation: "40 (Spartan) to 100 (Han/Carthage/Mongol) based on culture",
  equipment_authenticity: "Use historical weapons/armor from 3000 BC - 500 AD",
  specialization_clarity: "Each elite has 2-3 clear strengths, 1-2 clear weaknesses",
  no_magic: "All abilities based on historical military capabilities",
  cultural_distinctiveness: "Equipment and tactics reflect authentic cultural warfare"
};

module.exports = ELITE_UNITS;

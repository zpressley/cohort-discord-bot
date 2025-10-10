# Cohort Complete Variable & Object Reference

## Overview
Comprehensive index of all variables, objects, constants, and data structures used throughout the Cohort codebase, organized by system and purpose.

---

## Database Model Objects

### VeteranOfficer Object Properties
```javascript
{
  // Identification
  id: 'uuid-string',
  eliteUnitId: 'uuid-foreign-key',
  name: 'Centurion Marcus the Steady',
  rank: 'Centurion',
  
  // Experience
  battlesExperience: 7,           // Number (0-50+)
  isAlive: true,                  // Boolean
  
  // Personality (-5 to +5 scales)
  personality: {
    aggressive: 2,                // Prefers bold tactics
    cautious: -1,                 // Less cautious
    tactical: 4,                  // Highly tactical
    inspirational: 3              // Good morale booster
  },
  
  // Tactical Knowledge (dies with officer)
  tacticalKnowledge: {
    enemyCultures: {              // Culture → experience count
      'Celtic Tribes': 3,
      'Germanic Tribes': 2,
      'Sarmatian Confederations': 1
    },
    terrainExperience: {          // Terrain → experience count
      'forest': 4,
      'hills': 2,
      'river': 3
    },
    weatherAdaptation: {          // Weather → experience count
      'rain': 3,
      'fog': 1
    },
    battleMemories: [             // Max 10 recent lessons
      {
        type: 'forest_ambush',
        enemies: 'Germanic Tribes',
        terrain: 'forest',
        weather: 'rain',
        outcome: 'victory',
        lessons: 'Germanic forest tactics - expect ambush from multiple directions'
      }
    ]
  },
  
  // Equipment
  personalEquipment: {
    weapon: 'gladius_veteran',     // Named weapon
    armor: 'lorica_reinforced',
    special: ['battle_standard']   // Trophy items
  },
  
  // Specialization
  specialization: 'Formation Master',  // ENUM value
  
  // Relationships
  relationships: {
    'officer-uuid-1': 4,          // Close friend (+4 morale when together)
    'officer-uuid-2': -2          // Rivalry (-2 coordination)
  },
  
  // Death Record
  deathBattle: null,              // String or null
  deathCause: null,
  dateOfDeath: null
}
```

### EliteUnit Object Properties
```javascript
{
  // Identification
  id: 'uuid-string',
  commanderId: 'discord-id-string',
  name: 'The Iron Shields',       // Named after 3 battles
  culture: 'Roman Republic',      // ENUM
  
  // Size
  size: 80,                       // Maximum capacity
  currentStrength: 67,            // Current warriors (casualties applied)
  
  // Veteran Progression
  battlesParticipated: 7,
  totalExperience: 294,           // Sum of individual experiences
  averageExperience: 4.39,        // VIRTUAL: 294 ÷ 67
  veteranLevel: 'Veteran',        // ENUM: Recruit/Seasoned/Veteran/Elite/Legendary
  
  // Equipment (fixed by culture)
  equipment: {
    weapons: ['gladius', 'pilum'],
    armor: ['lorica_segmentata'],
    shields: ['scutum'],
    special: ['eagle_standard']
  },
  
  // Cultural System
  culturalPerks: [
    'Engineering mastery',
    'Professional discipline',
    'Tactical adaptability'
  ],
  adaptedKnowledge: {             // Learned from enemies
    'Celtic Tribes': ['Berserker charge patterns', 'Forest ambush tactics'],
    'Sarmatian Confederations': ['Feigned retreat recognition']
  },
  
  // Status
  morale: 92,                     // 0-150 range
  isActive: true
}
```

### Battle Object Properties
```javascript
{
  // Identification
  id: 'uuid-string',
  player1Id: 'discord-id-1',
  player2Id: 'discord-id-2',
  
  // Configuration
  scenario: 'River Crossing',     // ENUM
  status: 'in_progress',          // ENUM: waiting/army_building/in_progress/completed/abandoned
  currentTurn: 5,
  maxTurns: 12,
  
  // Environment
  weather: 'light_rain',          // ENUM: clear/light_rain/heavy_rain/fog/extreme_heat/wind/cold/storm
  terrain: {
    primary: 'plains',
    features: ['river', 'hills', 'forest'],
    modifiers: {
      riverCrossing: -4,
      hillDefense: +2
    }
  },
  
  // Complete Battle State (MASSIVE JSON)
  battleState: {
    player1: {
      army: {
        culture: 'Roman Republic',
        blocks: {
          troops: [
            { type: 'professional', quantity: 1, blocks: 10 }
          ],
          equipment: [
            { type: 'war_spears', blocks: 4 }
          ],
          support: [
            { type: 'field_engineers', blocks: 2 }
          ]
        },
        totalBlocks: 28
      },
      unitPositions: [
        {
          unitId: 'player1_professional_0',
          unitType: 'infantry',
          qualityType: 'professional',
          position: 'E10',
          currentStrength: 87,
          maxStrength: 100,
          morale: 92,
          movementRemaining: 1.5,
          hasMoved: true,
          equipment: {
            primaryWeapon: 'war_spears',
            armor: 'light_armor',
            shield: 'heavy_shields'
          },
          formation: 'standard',
          mounted: false
        },
        {
          unitId: 'player1_elite',
          unitType: 'elite_praetorian',
          position: 'D9',
          currentStrength: 67,
          maxStrength: 80,
          veteranLevel: 'Veteran',
          morale: 98
        }
      ],
      visibleEnemyPositions: [
        {
          position: 'M5',
          unitType: 'infantry',
          estimatedStrength: 87,
          equipment: 'sarissa',
          formation: 'phalanx',
          confidence: 'high',
          distance: 4
        }
      ],
      supplies: 85,               // % remaining
      morale: 95                  // Army-wide morale
    },
    player2: {
      /* Same structure */
    },
    objectives: {
      type: 'control_fords',
      controlledBy: {
        'F11': 'player1',
        'G11': null,
        'H11': 'player2'
      },
      turnControlCount: {
        'F11': 2,                 // Held 2 consecutive turns
        'H11': 1
      },
      winCondition: 'control_2_fords_for_4_turns'
    },
    pendingOrders: {
      player1: {
        order: 'Advance to central ford',
        timestamp: '2025-10-09T14:30:00Z'
      },
      player2: null               // Waiting
    },
    turnEvents: [                 // Last 3 turns in detail
      {
        turnNumber: 4,
        summary: 'River crossing attempted',
        movements: [...],
        combats: [...],
        casualties: { player1: 8, player2: 12 }
      }
    ]
  },
  
  // Victory
  victoryConditions: {
    type: 'control_points',
    description: 'Control 2+ fords for 4 turns OR destroy enemy'
  },
  winner: null,
  battleResult: null,
  
  // Discord
  channelId: 'discord-channel-id',
  messageId: 'discord-message-id'
}
```

### Commander Object Properties
```javascript
{
  // Identification
  discordId: '1234567890',        // PRIMARY KEY
  username: 'PlayerName',
  
  // Cultural Choice
  culture: 'Roman Republic',      // ENUM (20 cultures)
  armyComposition: {              // Saved build from builder
    /* Same structure as battle.battleState.player1.army */
  },
  
  // Progression
  rank: 'Veteran',                // ENUM: Recruit/Veteran/Elite/Legendary
  battlesWon: 5,
  battlesLost: 2,
  totalBattles: 7,                // VIRTUAL: won + lost
  
  // Reputation
  reputation: 115,                // 0-200 scale (100 = neutral)
  honorPoints: 23,
  
  // Play Style Learning
  preferredTactics: {
    aggressive: 3,                // Tends toward bold tactics
    defensive: -1,                // Avoids pure defense
    mobile: 2,                    // Prefers cavalry/movement
    formation: 4                  // Strong formation fighter
  },
  
  // Cross-Battle Learning
  culturalKnowledge: {
    'Celtic Tribes': [
      'Berserker charges break formations',
      'Forest ambush specialists',
      'Poor discipline in prolonged sieges'
    ],
    'Macedonian Kingdoms': [
      'Sarissa phalanx vulnerable to flanking',
      'Combined arms with cavalry'
    ]
  },
  
  // Activity
  lastActive: '2025-10-09T14:45:00Z'
}
```

---

## Game Logic Variables

### Movement Validation Variables
```javascript
// From validateMovement() return
const movementValidation = {
  valid: true,
  path: ['A5', 'A6', 'B6', 'C6'],    // Coordinate array
  cost: 3.5,                          // Movement points consumed
  movementRemaining: 0.5,             // Points left after movement
  targetTerrain: 'ford',
  error: null,
  reason: null
};

// Invalid example
const invalidMovement = {
  valid: false,
  error: 'Target too far: requires 4.5 movement, you have 3',
  reason: 'insufficient_movement',
  path: ['A5', 'A6', 'B6', 'C6', 'D6'],
  cost: 4.5
};
```

### Combat Result Variables
```javascript
// From resolveCombat() return
const combatResult = {
  combatResult: {
    result: 'attacker_major_victory',  // ENUM
    intensity: 'decisive',              // decisive/significant/slight/moderate
    combatRatio: 1.82,                  // Attacker power ÷ defender power
    attackerPower: 456,                 // Final calculated attack
    defenderPower: 250                  // Final calculated defense
  },
  
  casualties: {
    attacker: [
      { casualties: 8, type: 'professional' }
    ],
    defender: [
      { casualties: 32, type: 'militia' },
      { casualties: 15, type: 'levy' }
    ]
  },
  
  moraleChanges: {
    attacker: +15,                      // Morale boost from victory
    defender: -20                       // Morale penalty from defeat
  },
  
  tacticalDevelopments: [
    'formation_disruption',             // Defender formation broken
    'flanking_opportunity',             // Gap created for exploitation
    'position_advance'                  // Winner gains ground
  ],
  
  environmentalEffects: {
    attacker: { attack: 1.0, defense: 1.0, mobility: 0.9 },
    defender: { attack: 0.8, defense: 1.2, mobility: 0.7 }
  },
  
  nextTurnModifiers: {
    moraleModifiers: { player1: +15, player2: -20 },
    positionChanges: { winner_advance: true },
    specialConditions: ['muddy_terrain']
  }
};
```

### Position Modifier Variables
```javascript
// From calculatePositionalModifiers() return
const positionModifiers = {
  attacker: {
    attack: +2,        // From flanking
    defense: 0
  },
  defender: {
    attack: 0,
    defense: +4        // +2 high ground, +2 forest cover
  },
  description: [
    'Flanking attack: +2 attack',
    'Defender on hill in forest: +4 defense total',
    'Significant defensive advantage'
  ]
};
```

### Visibility Result Variables
```javascript
// From calculateVisibility() return
const visibilityResult = {
  visibleEnemyPositions: [
    {
      position: 'M5',
      unitType: 'infantry',
      estimatedStrength: 87,
      equipment: 'sarissa',
      formation: 'phalanx',
      confidence: 'high',
      detectedBy: 'player1_scouts',
      distance: 4
    },
    {
      position: 'K8',
      unitType: 'cavalry',
      estimatedStrength: 60,      // Rounded
      equipment: 'unknown',
      confidence: 'medium',
      distance: 5
    }
  ],
  
  intelligence: {
    confirmed: [/* high confidence intel */],
    estimated: [/* medium confidence intel */],
    suspected: [/* low confidence intel */]
  },
  
  totalEnemiesDetected: 2
};
```

### Army Builder State Variables
```javascript
// In-memory state during army building
const builderState = {
  commanderId: 'discord-user-id',
  battleId: 'battle-uuid',
  culture: 'Roman Republic',
  eliteUnit: {
    name: 'Praetorian Guard',
    size: 80,
    veteranLevel: 'Veteran',
    officers: [/* 8-12 officer objects */]
  },
  
  blocksUsed: 28,
  blocksTotal: 30,
  
  selectedTroops: [
    {
      type: 'professional',
      quantity: 1,
      blocks: 10,
      size: 100
    },
    {
      type: 'militia',
      quantity: 1,
      blocks: 6,
      size: 100
    }
  ],
  
  selectedEquipment: [
    {
      type: 'war_spears',
      blocks: 4,
      applicableTo: ['professional', 'militia'],
      effect: { attack: +2, formation: +1 }
    },
    {
      type: 'light_armor',
      blocks: 4,
      effect: { defense: +2, mobility: -1 }
    }
  ],
  
  selectedSupport: [
    {
      type: 'field_engineers',
      blocks: 2,
      size: 10
    }
  ],
  
  finalArmy: null  // Populated on finalize
};
```

---

## AI System Variables

### Order Interpretation Response
```javascript
// From interpretOrders() return
const orderInterpretation = {
  validatedActions: [
    {
      type: 'move',
      unitId: 'player1_professional_0',
      currentPosition: 'A5',
      targetPosition: 'F11',
      reasoning: 'Advancing to northern ford',
      validation: {
        valid: true,
        path: ['A5', 'B5', 'C5', 'D5', 'E5', 'F5', 'F6', ..., 'F11'],
        cost: 3.5,
        movementRemaining: 0.5
      }
    },
    {
      type: 'support_fire',
      unitId: 'player1_archers_0',
      targetUnit: 'player1_professional_0',
      supportType: 'covering_fire'
    }
  ],
  
  errors: [
    {
      unit: 'player1_cavalry_0',
      error: 'Cannot reach target this turn',
      reason: 'insufficient_movement',
      suggestion: 'Move to H10 this turn, reach K14 next turn'
    }
  ],
  
  officerComment: 'Centurion Marcus: Infantry advancing to ford. Archers providing cover.',
  
  rawAIResponse: {
    /* Complete AI JSON response for debugging */
  }
};
```

### Narrative Generation Response
```javascript
// From generateBattleNarrative() return
const narrativeResult = {
  mainNarrative: {
    fullNarrative: `Steel rings against steel as Roman forces surge across the ford at F11. The Thyros River runs red as Centurion Marcus's professionals clash with Macedonian pike-bearers holding the northern bank.

The sarissa wall bristles with 21-foot pikes, but Roman discipline prevails. Legionnaires raise their scuta shields against the pike points, pushing forward step by bloody step. The ford becomes a killing ground as both sides refuse to yield.

Captain Swift's archers loose volley after volley from the western hills, their arrows finding gaps in the Macedonian formation. Three Silver Shields fall to precise shooting, but the phalanx holds.

As the sun climbs higher, the Romans secure the southern half of the crossing. The battle hangs in balance - neither side can achieve decisive advantage at this deadly bottleneck.`,
    
    template: 'attacker_victory',
    historicalReference: 'Battle of Granicus (334 BC) - River crossing under fire'
  },
  
  officerReports: {
    attacker: {
      officerName: 'Centurion Marcus the Steady',
      rank: 'Centurion',
      speech: 'The veteran's eyes narrow - "We've got the ford, sir, but it cost us. Those pikes are no joke. We need to push through before they bring up reserves. Discipline will see us through."',
      personality: 'professional_disciplined',
      experience: 7
    },
    defender: {
      officerName: 'Phalangarch Alexander',
      rank: 'Phalangarch',
      speech: '"The sarissa holds! As our ancestors taught at Chaeronea, the pike wall stands unbroken. But their archers pick off good men. We must advance or fall back - this position bleeds us slowly."',
      personality: 'alexander_inspired',
      experience: 5
    }
  },
  
  tacticalAnalysis: {
    keyDevelopments: [
      'Ford partially secured by Roman forces',
      'Macedonian phalanx integrity maintained despite casualties',
      'Archer fire creating steady losses'
    ],
    tacticalOpportunities: [
      'Roman forces can push across ford with additional support',
      'Macedonian flanking maneuver possible through southern ford'
    ],
    threats: [
      'Roman forces vulnerable in bottleneck position',
      'Macedonian archer casualties unsustainable'
    ],
    recommendations: [
      'Roman: Press advantage while enemy disorganized',
      'Macedonian: Commit cavalry to flank or withdraw to better position'
    ]
  },
  
  nextTurnSetup: {
    battlefieldState: 'Ford contested, neither side controls fully',
    nextTurnPrompt: 'Turn 6 - The battle hangs in balance. What are your orders, Commander?',
    tacticalSuggestions: [
      'Consolidate ford position',
      'Commit reserves',
      'Attempt flanking maneuver'
    ],
    availableActions: [
      'advance',
      'hold position',
      'flank left',
      'flank right',
      'commit reserves',
      'tactical withdrawal'
    ]
  },
  
  historicalParallel: 'Battle of Granicus (334 BC)'
};
```

### Officer Q&A Response
```javascript
// From answerTacticalQuestion() return
const officerResponse = {
  officerName: 'Centurion Marcus the Steady',
  rank: 'Centurion',
  experience: 7,
  
  answer: "Sir, I've faced Macedonian phalanxes three times before. That sarissa wall at M5 looks solid - frontal assault will cost us dearly. But notice how tight they stand? They can't turn quickly. If we can get cavalry on their flank while our infantry pins them frontally, those pikes become liabilities. The key is timing - hit them from two directions simultaneously.",
  
  knowledgeUsed: {
    enemyCulture: 'Macedonian Kingdoms',
    experienceCount: 3,
    specificLessons: [
      'Sarissa phalanx vulnerable to flanking',
      'Tight formation = poor maneuverability',
      'Combined arms tactics essential vs phalanx'
    ]
  },
  
  confidence: 'high',             // Based on experience
  tacticalAdvice: 'coordinate_flank_attack'
};
```

---

## Constant Data Structures

### Formation Interaction Matrix
```javascript
const FORMATION_INTERACTIONS = {
  'phalanx_vs_cavalry': {
    attack: +8,              // Sarissa supremacy vs frontal cavalry
    defense: +3,
    historicalBasis: 'Battle of Chaeronea (338 BC)'
  },
  
  'phalanx_vs_flanking': {
    attack: -6,              // Catastrophic vulnerability
    defense: -4,
    historicalBasis: 'Battle of Pydna (168 BC) - 20,000 Macedonians killed vs 100 Romans'
  },
  
  'testudo_vs_missiles': {
    attack: 0,
    defense: +6,             // 90% projectile deflection
    historicalBasis: 'Roman anti-archer formation'
  },
  
  'testudo_vs_melee': {
    attack: -3,              // Restricted weapon movement
    defense: +1,
    movementPenalty: -50,    // 75% movement reduction
    historicalBasis: 'Defensive formation, not offensive'
  },
  
  'cavalry_charge_vs_infantry': {
    attack: +6,
    requires_movement: 3,    // Must have momentum (150m charge)
    historicalBasis: 'Battle of Gaugamela (331 BC) - Companion cavalry charges'
  },
  
  'cavalry_vs_spears': {
    attack: -4,              // Horses refuse to charge spear wall
    defense: -2,
    historicalBasis: 'Battle of Marathon (490 BC) - Horse psychology vs spears'
  },
  
  'berserker_fury': {
    attack: +4,
    defense: -2,
    immune_fear: true,
    historicalBasis: 'Celtic/Germanic warrior culture'
  },
  
  'shield_wall': {
    defense: +3,
    missile_defense: +2,
    formation_bonus: true,
    historicalBasis: 'Greek hoplite phalanx, Viking shield walls'
  }
};
```

### Environmental Effect Matrix
```javascript
const ENVIRONMENTAL_EFFECTS = {
  weather: {
    clear: {
      all: 1.0                       // No modifiers
    },
    
    light_rain: {
      composite_bow: 0.8,            // -2 range (-20%)
      movement: 0.9,                  // -1 tile (-10%)
      visibility: 0.9,                // -10%
      historicalExample: 'Minor rain in many battles'
    },
    
    heavy_rain: {
      composite_bow: 0.4,            // -4 range (-60%)
      wooden_shields: {
        weight: 1.5,                  // +150% weight waterlogged
        defense: 0.9                  // -1 defense structural integrity loss
      },
      heavy_armor_movement: 0.9,     // Mud + weight
      formation_coordination: 0.8,   // -2 formation bonus
      historicalExample: 'Teutoburg Forest (9 AD) - rain destroyed Roman advantages'
    },
    
    fog: {
      visibility: 0.6,               // -4 tiles (-40%)
      ambush_bonus: 1.4,             // +4 attack (+40%)
      formation_coordination: 0.7,   // -3 formation
      ranged_targeting: 0.8,         // -2 ranged accuracy
      historicalExample: 'Lake Trasimene (217 BC) - Hannibal hid 50,000 troops'
    },
    
    extreme_heat: {
      heavy_armor: {
        endurance: 0.5,              // 2.1× energy expenditure (research data)
        turns_before_penalty: 5,     // Combat effective 5 turns, then -2 all stats
        fatigue_accumulation: 2.0
      },
      desert_culture_immunity: true,
      historicalExample: 'Battle of Carrhae (53 BC) - desert heat exhausted Romans'
    },
    
    wind: {
      archery_with_wind: 1.2,        // +2 attack with wind (+20%)
      archery_against_wind: 0.8,     // -2 attack against wind (-20%)
      fire_weapons: 1.3,             // +3 spread effectiveness
      dust_visibility: 0.8,          // -2 visibility
      historicalExample: 'Battle of Cannae (216 BC) - wind drove dust into Roman eyes'
    },
    
    cold: {
      metal_weapon_breakage: 1.15,   // +15% breakage rate
      bronze_equipment_failure: 1.20,// +20% failure (metallurgical brittleness)
      morale: -1,                    // Discomfort penalty
      historicalExample: 'Winter campaigns reduced equipment reliability'
    },
    
    storm: {
      // Combines all penalties
      composite_bow: 0.2,            // Nearly unusable
      visibility: 0.4,               // Severe reduction
      movement: 0.7,                 // Difficult terrain
      morale: -2,                    // Severe discomfort
      communication: -3,             // Cannot hear orders
      historicalExample: 'Battle of Phintias (249 BC) - storm destroyed Roman fleet'
    }
  },
  
  terrain: {
    open_plains: {
      cavalry_charge: 1.2,           // +2 effectiveness
      formation_bonus: 1.0,          // Optimal
      visibility: 1.0,
      historicalExample: 'Battle of Gaugamela (331 BC) - perfect cavalry terrain'
    },
    
    light_hills: {
      uphill_attack: 0.7,            // -3 penalty
      elevated_missile: 1.1,         // +1 range from gravity
      elevated_defense: 1.2,         // +2 defense high ground
      movement_uphill: 0.66,         // 1.5× movement cost
      historicalExample: 'Most ancient battles emphasized high ground'
    },
    
    steep_mountains: {
      heavy_movement: 0.4,           // -3 tiles (-60%)
      medium_movement: 0.6,          // -2 tiles
      light_movement: 0.8,           // -1 tile
      formation_fighting: 0.2,       // -5 effectiveness (-80%)
      defensive_multiplier: 1.4,     // +4 defense (+40%)
      historicalExample: 'Thermopylae (480 BC) - 300 vs 100,000+ held 3 days'
    },
    
    light_forest: {
      formation_fighting: 0.8,       // -2 effectiveness
      cavalry_charge: 0.8,           // -2 movement/charge
      ambush_bonus: 1.2,             // +2 for light troops
      ranged_cover: 0.9,             // -1 due to trees
      visibility: -1                 // Tiles
    },
    
    dense_forest: {
      formation_fighting: 0.2,       // -5 impossible to maintain (-80%)
      cavalry_effectiveness: 0.2,    // -4 horses panic/cannot maneuver
      ambush_bonus: 1.6,             // +6 for forest specialists (+60%)
      ranged_effectiveness: 0.4,     // -3 trees block shots (-60%)
      visibility: -2,                // Tiles
      historicalExample: 'Teutoburg Forest (9 AD) - 3 Roman legions annihilated'
    },
    
    marshland: {
      heavy_movement: 0.4,           // -3 movement (sinking)
      medium_movement: 0.6,
      light_movement: 0.9,           // -1 only
      formation_stability: 0.4,      // -3 unstable ground
      disease_risk: 0.15,            // +15% per turn
      historicalExample: 'Battle of Pontes Longi (15 AD) - Romans trapped in bog'
    },
    
    river_crossing: {
      attacker_penalty: -4,          // Formation disrupted in water
      defender_bonus: +3,            // Secure position
      casualty_risk: 1.5,            // Drowning in armor
      historicalExample: 'Battle of Granicus (334 BC) - uphill river crossing attack'
    }
  }
};
```

### Weapon Effectiveness Matrix
```javascript
const WEAPON_EFFECTIVENESS = {
  // Format: 'weapon_vs_armor': penetration_percentage
  
  // Composite Bows (Parthian, Scythian, Nomadic)
  'composite_bow_vs_no_armor': 0.90,
  'composite_bow_vs_light_armor': 0.60,
  'composite_bow_vs_heavy_armor': 0.40,
  'composite_bow_vs_mail': 0.40,           // 40% at 100m (research data)
  
  // Crossbows (Han Chinese innovation)
  'crossbow_vs_no_armor': 0.95,
  'crossbow_vs_light_armor': 0.80,
  'crossbow_vs_heavy_armor': 0.70,
  'crossbow_vs_mail': 0.90,                // Penetrates armor
  
  // Sarissa Pikes (Macedonian)
  'sarissa_vs_cavalry': 0.85,              // Near immunity to frontal charges
  'sarissa_vs_infantry': 0.75,             // Extended reach advantage
  'sarissa_vs_flanking': 0.20,             // Catastrophic vulnerability
  
  // Roman Gladius
  'gladius_vs_no_armor': 0.85,
  'gladius_vs_light_armor': 0.70,
  'gladius_vs_heavy_armor': 0.55,
  'gladius_vs_phalanx': 0.45,              // Struggling against pike length
  
  // Dacian Falx (Two-handed anti-armor)
  'falx_vs_shields': 1.0,                  // Ignores shields completely
  'falx_vs_armor': 0.80,
  'falx_requires': 'two_hands',            // Cannot use shield
  
  // Mauryan Wootz Steel (Superior metallurgy)
  'wootz_steel_vs_any': 0.90,              // Minimum 90% effectiveness
  'wootz_steel_bonus': 0.10,               // Ignores 10% of any armor
  
  // War Spears (Standard)
  'spear_vs_cavalry': 0.75,
  'spear_vs_infantry': 0.65,
  'spear_formation_bonus': +1,             // Better in formation
  
  // Javelins (Celtic, Light troops)
  'javelin_vs_any': 0.60,
  'javelin_range': 1,                      // 1 tile only
  'javelin_volley': 'one_use'              // Then melee
};
```

### Cultural Modifier Object
```javascript
const CULTURAL_MODIFIERS = {
  'Roman Republic': {
    formation_discipline: 1.1,     // +10% formation effectiveness
    engineering_bonus: 1.2,        // +20% fortification/siege
    tactical_flexibility: 1.1,     // +10% adaptation
    unique_equipment: ['lorica_segmentata', 'scutum', 'gladius'],
    unique_tactics: ['testudo', 'manipular_system'],
    historicalBasis: 'Professional army, systematic tactics'
  },
  
  'Macedonian Kingdoms': {
    sarissa_bonus: 1.3,            // +30% with sarissa
    combined_arms: 1.1,            // +10% with cavalry+infantry
    vulnerable_flanking: 0.6,      // -40% when flanked
    unique_equipment: ['sarissa', 'companion_cavalry'],
    historicalBasis: 'Alexander\'s hammer and anvil tactics'
  },
  
  'Celtic Tribes': {
    charge_bonus: 1.1,             // +10% charge attacks
    intimidation: 1.1,             // +10% fear effects
    forest_bonus: 1.2,             // +20% in forests
    berserker_fury: 1.4,           // +40% attack, -20% defense
    break_threshold: 0.40,         // Fight to 40% casualties vs 15% normal
    unique_tactics: ['berserker_charge', 'individual_heroics'],
    historicalBasis: 'Warrior culture, honor-driven combat'
  },
  
  'Han Dynasty': {
    crossbow_coordination: 1.2,    // +20% coordinated volleys
    siege_bonus: 1.1,              // +10% siege warfare
    discipline: 1.1,               // +10% formation fighting
    advanced_technology: true,     // Access to advanced siege equipment
    farming_efficiency: 1.2,       // 120 men per block vs 100 normal
    unique_equipment: ['crossbow', 'cloud_ladder', 'advanced_catapult'],
    historicalBasis: 'Bureaucratic efficiency, technological innovation'
  },
  
  'Sarmatian Confederations': {
    horse_archery: 1.2,            // +20% mounted archery
    feigned_retreat: 1.3,          // +30% feigned retreat effectiveness
    heavy_cavalry: 1.2,            // +20% cataphract charges
    dual_mode: true,               // Can switch archer ↔ cataphract (1 turn)
    unique_tactics: ['parthian_shot', 'feigned_retreat'],
    historicalBasis: 'Steppe warfare mastery'
  },
  
  'Berber Confederations': {
    desert_immunity: true,         // Negate all heat penalties
    raid_bonus: 1.2,               // +20% hit-and-run
    camel_cavalry: true,           // Don't fear elephants
    captured_equipment: true,      // Upgrade from enemy supplies
    unique_tactics: ['desert_navigation', 'swift_raids'],
    historicalBasis: 'Desert warfare specialists'
  },
  
  'Spartan City-State': {
    phalanx_discipline: 1.3,       // +30% phalanx (best in Greece)
    never_retreat: true,           // Fight to 50% casualties
    perioeci_bonus: 1.1,           // Non-citizen troops better (+10%)
    professional_only: true,       // Cannot hire militia/levy
    small_elite: 40,               // Only 40-man elite vs 80 normal
    unique_tactics: ['laconic_discipline', 'hoplon_wall'],
    historicalBasis: 'Agoge training, warrior culture since age 7'
  },
  
  'Mauryan Empire': {
    elephant_coordination: 1.4,    // +40% war elephant effectiveness
    wootz_steel: 1.1,              // +10% vs all armor
    patti_formations: true,        // Combined arms doctrine
    buddhist_mercy: 'no_pursuit',  // Cannot pursue routed enemies
    diverse_requirement: 0.33,     // Max 33% any single type
    unique_equipment: ['war_elephants', 'wootz_steel_weapons'],
    historicalBasis: 'Largest elephant corps (9,000), superior metallurgy'
  },
  
  'Pre-Genghis Mongolia': {
    horse_archery_perfection: 1.5, // +50% mounted archery
    nomadic_endurance: 1.4,        // +40% without supplies
    larger_units: 1.2,             // 120 men per unit vs 100
    elite_size: 100,               // 100-man elite vs 80
    all_mounted: true,             // 100% cavalry requirement
    no_baggage: true,              // Must purchase supply train
    dismount_penalty: -3,          // Major penalty fighting on foot
    unique_tactics: ['perfect_parthian_shot', 'eternal_sky_mobility'],
    historicalBasis: 'Pre-Genghis steppe confederation tactics'
  }
};
```

---

## Turn Resolution Variables

### Turn Result Object
```javascript
// Complete turn processing result
const turnResult = {
  success: true,
  
  newBattleState: {
    player1: {
      unitPositions: [/* updated positions */],
      visibleEnemyPositions: [/* updated visibility */],
      supplies: 83,
      morale: 95
    },
    player2: {
      /* same structure */
    },
    currentTurn: 6,
    turnEvents: [/* compressed history */]
  },
  
  turnResults: {
    movements: {
      player1Moves: 2,             // 2 units moved
      player2Moves: 1
    },
    intelligence: {
      player1Detected: 3,          // P1 sees 3 enemy units
      player2Detected: 2           // P2 sees 2 enemy units
    },
    combats: 2,                    // 2 combat engagements
    casualties: {
      player1: 15,
      player2: 8
    }
  },
  
  narrative: {
    /* AI-generated narrative object */
  },
  
  victory: {
    achieved: false                // Battle continues
  },
  
  phase: 'complete'
};
```

### Combat Engagement Object
```javascript
// From detectCombatTriggers() and buildCombatContext()
const combatEngagement = {
  location: 'F11',                 // Combat coordinate
  
  attacker: {
    unit: {
      unitId: 'player1_professional_0',
      unitType: 'infantry',
      position: 'F11',
      currentStrength: 87,
      maxStrength: 100,
      equipment: {
        primaryWeapon: 'war_spears',
        armor: 'light_armor',
        shield: 'heavy_shields'
      },
      formation: 'standard',
      morale: 92
    },
    positionModifiers: {
      attack: +2,                  // Flanking
      defense: 0
    },
    position: 'F11'
  },
  
  defender: {
    unit: {
      unitId: 'player2_phalanx_0',
      unitType: 'infantry',
      position: 'F11',
      currentStrength: 94,
      equipment: {
        primaryWeapon: 'sarissa',
        armor: 'bronze_cuirass',
        shield: 'small_pelta'
      },
      formation: 'phalanx',
      morale: 88
    },
    positionModifiers: {
      attack: 0,
      defense: +4                  // High ground + formation
    },
    position: 'F11'
  },
  
  terrain: 'ford',
  combatType: 'melee',
  distance: 1,
  
  tacticalSituation: [
    'Attacker benefits from flanking (+2)',
    'Defender holds phalanx formation on high ground (+4)',
    'Ford crossing increases attacker vulnerability',
    'Defender has significant tactical advantage'
  ]
};
```

---

## Key Global Variables

### Discord Client
```javascript
// Main bot client (src/index.js)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// Command collection
client.commands = new Collection();  // Map<commandName, commandObject>
```

### Database Connection
```javascript
// Sequelize instance (src/database/setup.js)
const sequelize = new Sequelize({
  dialect: 'sqlite',              // or 'postgres' in production
  storage: './data/cohort.db',
  logging: false
});

// Model registry
const models = {
  VeteranOfficer,
  EliteUnit,
  Battle,
  Commander,
  BattleTurn
};
```

### AI Provider Registry
```javascript
// AI provider instances (src/ai/aiManager.js)
const aiProviders = {
  openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  groq: new Groq({ apiKey: process.env.GROQ_API_KEY })
};

// Provider selection weights
const providerWeights = {
  'simple_parsing': { groq: 0.80, openai: 0.20 },
  'standard_narrative': { openai: 0.95, claude: 0.05 },
  'complex_tactics': { claude: 0.60, openai: 0.40 }
};
```

---

## Critical Calculation Formulas

### Veteran Experience Math
```javascript
/**
 * Hybrid veteran system combining individual and unit progression
 * 
 * PRE-BATTLE:
 * - Unit has totalExperience points distributed across currentStrength warriors
 * - averageExperience = totalExperience ÷ currentStrength
 * 
 * BATTLE:
 * - Survivors gain +1 experience each
 * - Casualties remove their experience from total
 * 
 * POST-BATTLE:
 * - New recruits added to restore strength (0 experience each)
 * - Average recalculated: diluted by recruits
 */

// Example calculation
const preBattle = {
  totalExperience: 280,
  currentStrength: 80,
  averageExperience: 3.5  // Veteran tier
};

const battle = {
  survivors: 65,  // 15 casualties
  casualties: 15
};

const postBattleBefore Recruits = {
  totalExperience: 280 + 65 - (15 × 3.5),  // +survivors, -casualties
  //              = 280 + 65 - 52.5 = 292.5
  currentStrength: 65,
  averageExperience: 292.5 ÷ 65 = 4.5     // Elite Veteran tier!
};

const postBattleAfterRecruits = {
  totalExperience: 292.5,         // Unchanged (recruits have 0)
  currentStrength: 80,            // Restored to full strength
  averageExperience: 292.5 ÷ 80 = 3.66  // Drops to Veteran tier
};

// Veteran level thresholds
const veteranLevel = {
  0: 'Recruit',
  1: 'Seasoned',
  3: 'Veteran',
  6: 'Elite Veteran',
  11: 'Legendary'
};
```

### Combat Power Calculation
```javascript
/**
 * Final combat power formula combining all modifiers
 */

// Base unit effectiveness
const baseAttack = (unitStats.attack + veteranBonus) × sizeMultiplier;
// Example: (8 + 2) × 1.0 = 10

// Formation modifier
const formationMod = 1 + (formationBonus / 10);
// Example: 1 + (8 / 10) = 1.8 (phalanx vs cavalry)

// Environmental multiplier
const envMod = weatherEffect × terrainEffect;
// Example: 0.9 (light rain) × 1.0 (plains) = 0.9

// Weapon effectiveness
const weaponEff = WEAPON_EFFECTIVENESS['spear_vs_light_armor'];
// Example: 0.70

// Cultural multiplier
const culturalMod = CULTURAL_MODIFIERS.celtic.charge_bonus;
// Example: 1.1

// FINAL POWER
const finalPower = baseAttack × formationMod × envMod × weaponEff × culturalMod;
// Example: 10 × 1.8 × 0.9 × 0.70 × 1.1 = 12.47

// Combat ratio determines outcome
const combatRatio = attackerPower ÷ defenderPower;
// Example: 12.47 ÷ 8.5 = 1.47

// Result interpretation
if (combatRatio > 1.5) result = 'attacker_major_victory';
else if (combatRatio > 1.2) result = 'attacker_victory';      // This case
else if (combatRatio > 1.0) result = 'attacker_advantage';
// etc.
```

---

## Status Enumerations

### Battle Status Flow
```javascript
const BATTLE_STATUS = {
  WAITING_FOR_PLAYERS: 'waiting_for_players',  // Just created
  ARMY_BUILDING: 'army_building',              // Both joined, building armies
  IN_PROGRESS: 'in_progress',                  // Battle active
  COMPLETED: 'completed',                      // Victory achieved
  ABANDONED: 'abandoned'                       // Timeout or forfeit
};
```

### Weather Types
```javascript
const WEATHER_TYPES = {
  CLEAR: 'clear',                  // 40% probability
  LIGHT_RAIN: 'light_rain',        // 35% probability
  HEAVY_RAIN: 'heavy_rain',        // 15% probability
  FOG: 'fog',                      // 10% probability
  EXTREME_HEAT: 'extreme_heat',    // 8% probability
  WIND: 'wind',                    // 4% probability
  COLD: 'cold',                    // 2% probability
  STORM: 'storm'                   // 1% probability (rare disaster)
};
```

### Combat Result Types
```javascript
const COMBAT_RESULTS = {
  ATTACKER_MAJOR_VICTORY: 'attacker_major_victory',    // Ratio > 1.5
  ATTACKER_VICTORY: 'attacker_victory',                // Ratio > 1.2
  ATTACKER_ADVANTAGE: 'attacker_advantage',            // Ratio > 1.0
  STALEMATE: 'stalemate',                              // Ratio 0.8-1.0
  DEFENDER_ADVANTAGE: 'defender_advantage',            // Ratio > 0.6
  DEFENDER_VICTORY: 'defender_victory',                // Ratio > 0.4
  DEFENDER_MAJOR_VICTORY: 'defender_major_victory'     // Ratio ≤ 0.4
};
```

---

## Critical Object Patterns

### Unit Position Object (Core Battle State)
```javascript
const unitPosition = {
  // Identity
  unitId: 'player1_professional_0',
  unitType: 'infantry',
  qualityType: 'professional',
  
  // Position & Movement
  position: 'F11',
  movementRemaining: 1.5,
  hasMoved: true,
  movementPath: ['E9', 'E10', 'F10', 'F11'],
  
  // Strength & Morale
  currentStrength: 87,
  maxStrength: 100,
  morale: 92,
  
  // Equipment (from army builder)
  equipment: {
    primaryWeapon: 'war_spears',
    secondaryWeapon: 'gladius',
    armor: 'light_armor',
    shield: 'heavy_shields'
  },
  
  // Tactical State
  formation: 'standard',           // standard/phalanx/testudo/loose/berserker
  mounted: false,
  hasRanged: false,
  detectRange: 3,                  // Vision tiles
  
  // Mission (multi-turn orders)
  mission: {
    type: 'move_to_destination',
    target: 'L3',
    startTurn: 5,
    expectedCompletion: 7,
    contingencies: ['if_enemy_report_back']
  },
  
  // Status
  fatigued: false,
  pinned: false,                   // Cannot move (testudo, defensive lock)
  routed: false
};
```

### Complete System Integration

**Full Turn Processing Pipeline Variables:**
```javascript
const completeTurnPipeline = {
  // INPUT
  inputs: {
    battle: Battle,                // Database record
    player1Order: 'Advance to ford',
    player2Order: 'Hold position',
    map: riverCrossingMap
  },
  
  // PHASE 1 OUTPUT
  orderInterpretation: {
    player1: {
      validatedActions: [/* move actions */],
      errors: [],
      officerComment: string
    },
    player2: {/* same structure */}
  },
  
  // PHASE 2 OUTPUT
  movementResults: {
    newPositions: {
      player1: [/* unit position objects */],
      player2: [/* unit position objects */]
    },
    combatEngagements: [/* combat engagement objects */],
    movementSummary: {
      player1Moves: 2,
      player2Moves: 0
    }
  },
  
  // PHASE 3 OUTPUT
  visibilityUpdates: {
    player1Visibility: {
      visibleEnemyPositions: [/* visible enemy objects */],
      intelligence: {/* confirmed/estimated/suspected */},
      totalEnemiesDetected: 3
    },
    player2Visibility: {/* same structure */}
  },
  
  // PHASE 4-5 OUTPUT
  combatResolutions: [
    {
      location: 'F11',
      result: combatResult,        // Full combat result object
      tacticalSituation: [/* descriptions */]
    }
  ],
  
  // PHASE 6 OUTPUT
  casualtyApplication: {
    player1: [/* updated units with reduced strength */],
    player2: [/* same */]
  },
  
  victoryCheck: {
    achieved: false,
    winner: null,
    reason: null
  },
  
  // PHASE 7 OUTPUT
  narrative: {
    mainNarrative: {/* AI-generated battle story */},
    officerReports: {/* cultural officer perspectives */},
    tacticalAnalysis: {/* next turn planning */},
    nextTurnSetup: {/* prompt for Turn 6 */}
  },
  
  // FINAL OUTPUT
  finalResult: turnResult          // Complete turn result object
};
```

---

This comprehensive variable reference provides complete documentation of every major object, constant, and data structure in the Cohort system, enabling developers to understand data flow and system integration at the deepest level.
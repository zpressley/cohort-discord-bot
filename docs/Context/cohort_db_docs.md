# Cohort Database Layer Documentation

## Overview
The database layer uses Sequelize ORM with PostgreSQL for production and SQLite for development. All models track ancient warfare elements with historical accuracy, including veteran progression, elite units, battles, and commander statistics.

---

## VeteranOfficer Model
**Location:** `src/database/models/VeteranOfficer.js`

### Purpose
Tracks individual named officers within elite units. Each elite unit has 8-12 named officers who gain experience, develop personalities, accumulate tactical knowledge, and can permanently die in battle. Officers are the soul of the veteran system - their individual memories and experiences create emotional investment and gameplay depth.

### Schema Fields

#### **Primary Identification**
- **`id`** (UUID, Primary Key): Unique officer identifier
- **`eliteUnitId`** (UUID, Foreign Key → EliteUnits): Parent elite unit
- **`name`** (STRING, NOT NULL): Officer's name (e.g., "Centurion Marcus")
- **`rank`** (STRING, NOT NULL): Cultural rank (e.g., "Centurion", "War Chief", "Champion")

#### **Experience & Status**
- **`battlesExperience`** (INTEGER, default: 0): Number of battles survived
- **`isAlive`** (BOOLEAN, default: true): Current life status

#### **Personality System**
- **`personality`** (JSON, default structure):
  ```javascript
  {
    aggressive: 0,      // -5 to +5 scale
    cautious: 0,        // -5 to +5 scale
    tactical: 0,        // -5 to +5 scale
    inspirational: 0    // -5 to +5 scale
  }
  ```
  **Purpose:** Affects officer dialogue, autonomy AI decisions, and morale effects

#### **Institutional Memory** (Dies with Officer)
- **`tacticalKnowledge`** (JSON, default structure):
  ```javascript
  {
    enemyCultures: {},      // Culture → experience count
    terrainExperience: {},  // Terrain type → experience count
    weatherAdaptation: {},  // Weather → experience count
    battleMemories: []      // Array of lesson objects (max 10)
  }
  ```
  **Purpose:** Creates permanent consequences of officer death - knowledge is lost forever

#### **Equipment & Specialization**
- **`personalEquipment`** (JSON): Officer's personal gear
- **`specialization`** (ENUM): Officer role within unit
  - Values: 'Combat Leadership', 'Ranged Coordination', 'Formation Master', 'Scout Intelligence', 'Siege Specialist', 'Cavalry Coordination', 'Medical Support', 'Cultural Liaison'

#### **Social Connections**
- **`relationships`** (JSON): Officer ID → relationship strength (-5 to +5)
  **Purpose:** Affects unit cohesion and morale when officers interact

#### **Death Records**
- **`deathBattle`** (STRING, nullable): Battle name where officer died
- **`deathCause`** (STRING, nullable): Cause of death description
- **`dateOfDeath`** (DATE, nullable): Timestamp of death

### Instance Methods

#### **`addBattleExperience(battleType, enemies, terrain, weather, outcome)`**
**Purpose:** Add experience from completed battle and accumulate tactical knowledge
**Parameters:**
- `battleType` (string): Type of engagement
- `enemies` (string): Enemy culture faced
- `terrain` (string): Battlefield terrain
- `weather` (string): Weather conditions
- `outcome` (string): Battle result

**Process:**
1. Increments `battlesExperience` by 1
2. Adds/increments enemy culture knowledge counter
3. Adds/increments terrain experience counter
4. Adds/increments weather adaptation counter
5. Generates contextual battle lesson
6. Adds lesson to battleMemories (maintains max 10)
7. Saves changes to database

**Returns:** Promise<VeteranOfficer>

#### **`generateBattleLesson(enemies, terrain, weather, outcome)`**
**Purpose:** Generate contextual tactical wisdom from battle conditions
**Logic Examples:**
- Forest + Romans = "Romans struggle in dense forest - their formations break"
- Rain + Archers = "Rain makes composite bows useless"
- Victory + Hills = "High ground gives decisive advantage"

**Returns:** String lesson or "Battle experience gained" default

#### **`getKnowledgeBonus(enemyCulture, terrain, weather)`**
**Purpose:** Calculate tactical bonus from officer's accumulated knowledge
**Bonus Calculation:**
```javascript
let bonus = 0;
bonus += Math.min(enemyCultureExp, 3);  // Max +3 for enemy knowledge
bonus += Math.min(terrainExp, 2);       // Max +2 for terrain
bonus += Math.min(weatherExp, 1);       // Max +1 for weather
return bonus; // Total max: +6
```

**Returns:** Integer tactical bonus (0-6)

#### **`killInBattle(battleName, cause)`**
**Purpose:** Permanently kill officer and record death details
**Effects:**
1. Sets `isAlive = false`
2. Records battle name, cause, and timestamp
3. All tactical knowledge is lost forever
4. Triggers automatic promotion of surviving officer

**Returns:** Promise<VeteranOfficer>

#### **`getExperienceLevel()`**
**Purpose:** Get human-readable experience tier
**Thresholds:**
- 11+ battles: "Legendary"
- 6-10 battles: "Elite Veteran"
- 3-5 battles: "Veteran"
- 1-2 battles: "Seasoned"
- 0 battles: "Recruit"

**Returns:** String experience level

### Associations
- **belongsTo EliteUnit** (foreignKey: 'eliteUnitId', as: 'eliteUnit')

### Design Philosophy
Officers are designed to create **permanent loss mechanics** that hurt emotionally. When a legendary officer with 15 battles of enemy knowledge dies, that knowledge is gone forever. The player must rebuild institutional memory through surviving officers. This creates meaningful tactical consequences and emotional investment in named characters.

---

## EliteUnit Model
**Location:** `src/database/models/EliteUnit.js`

### Purpose
Represents the player's elite guard unit (80-100 warriors) with 8-12 named officers. Tracks veteran progression through hybrid system: surviving veterans gain experience while new recruits dilute average experience. Elite units have fixed cultural identity, equipment, and fighting styles.

### Schema Fields

#### **Primary Identification**
- **`id`** (UUID, Primary Key): Unit unique identifier
- **`commanderId`** (STRING, Foreign Key → Commanders.discordId): Owning player
- **`name`** (STRING, NOT NULL): Unit name (player-chosen or AI-suggested after 3 battles)
- **`culture`** (ENUM, NOT NULL): Cultural identity (20 cultures available)

#### **Size & Strength**
- **`size`** (INTEGER, NOT NULL, 40-100): Maximum unit capacity (varies by culture/equipment cost)
- **`currentStrength`** (INTEGER, NOT NULL): Current warrior count (casualties reduce this)

#### **Veteran Progression**
- **`battlesParticipated`** (INTEGER, default: 0): Total battles fought
- **`totalExperience`** (INTEGER, default: 0): Sum of all individual warrior experience
- **`averageExperience`** (VIRTUAL): Calculated as `totalExperience / currentStrength`
- **`veteranLevel`** (ENUM, default: 'Recruit'): Current tier
  - 'Recruit' (0 battles avg)
  - 'Seasoned' (1-2 battles avg)
  - 'Veteran' (3-5 battles avg)
  - 'Elite Veteran' (6-10 battles avg)
  - 'Legendary' (11+ battles avg)

#### **Equipment & Cultural Identity**
- **`equipment`** (JSON, default structure):
  ```javascript
  {
    weapons: [],    // Primary weapons array
    armor: [],      // Armor types
    shields: [],    // Shield types
    special: []     // Unique equipment
  }
  ```
- **`culturalPerks`** (JSON): Array of cultural bonuses
- **`adaptedKnowledge`** (JSON): Knowledge gained from defeating specific enemy cultures

#### **Combat Status**
- **`morale`** (INTEGER, 0-150, default: 100): Current morale level
- **`isActive`** (BOOLEAN, default: true): Whether unit is deployable

### Instance Methods

#### **`calculateVeteranLevel()`**
**Purpose:** Recalculate and update veteran tier based on average experience
**Logic:**
```javascript
const avg = this.averageExperience;
if (avg >= 11) this.veteranLevel = 'Legendary';
else if (avg >= 6) this.veteranLevel = 'Elite Veteran';
else if (avg >= 3) this.veteranLevel = 'Veteran';
else if (avg >= 1) this.veteranLevel = 'Seasoned';
else this.veteranLevel = 'Recruit';
```

**Returns:** Promise<EliteUnit> (saves to DB)

#### **`addBattleExperience(survivors)`**
**Purpose:** Add experience after battle, handling casualties
**Mathematical Model:**
```javascript
// Step 1: Add 1 experience to each survivor
totalExperience += actualSurvivors;
battlesParticipated += 1;

// Step 2: Calculate experience lost with casualties
if (survivors < currentStrength) {
  const casualties = currentStrength - survivors;
  const avgExp = averageExperience;
  const experienceLost = Math.round(casualties * avgExp);
  totalExperience -= experienceLost;
  currentStrength = survivors;
}
```

**Example Scenario:**
```
Pre-battle: 80 warriors, 3.5 avg experience (280 total)
Battle: 15 casualties, 65 survivors
Post-battle calculation:
  - Survivors gain +1: 280 + 65 = 345 total
  - Experience lost: 15 × 3.5 = 52.5 (rounded to 53)
  - New total: 345 - 53 = 292
  - New average: 292 ÷ 65 = 4.49 (veteran level increases!)
```

**Returns:** Promise<EliteUnit>

#### **`addRecruits(newRecruits)`**
**Purpose:** Add fresh recruits (0 experience), diluting average
**Effect:**
```javascript
currentStrength += newRecruits;
// totalExperience unchanged (recruits have 0 exp)
// averageExperience decreases due to larger denominator
```

**Example:** Adding 15 recruits to 65 veterans (4.49 avg) → 80 warriors, 3.65 avg (drops from Veteran to Seasoned tier)

**Returns:** Promise<EliteUnit>

#### **`getDeathProbability()`**
**Purpose:** Calculate individual officer death chance based on veteran level
**Death Rates:**
- Legendary (11+ battles): 6% per battle
- Elite Veteran (6-10): 8%
- Veteran (3-5): 10%
- Seasoned (1-2): 12%
- Recruit (0): 15%

**Design Rationale:** Veterans are more skilled, so less likely to die. Creates incentive to protect experienced officers.

**Returns:** Float (0.06 to 0.15)

### Associations
- **belongsTo Commander** (foreignKey: 'commanderId', as: 'commander')
- **hasMany VeteranOfficer** (foreignKey: 'eliteUnitId', as: 'officers')

### Design Philosophy
The hybrid experience system creates **meaningful casualty consequences**. Losing 20 veterans with high experience is devastating - not just numerically, but in terms of lost institutional knowledge and veteran bonuses. Adding fresh recruits brings numbers back but dilutes elite effectiveness, creating tension between safety and aggressive tactics.

---

## Battle, Commander Models & Database Setup

*(Continued in next artifact due to length...)*
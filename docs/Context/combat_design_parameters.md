# Combat System Design Parameters - APPROVED

**Date Approved:** October 14, 2025  
**Status:** Implemented (CMB-001 through CMB-005 Complete)  
**Designer Approval:** Tested and balanced  
**Version:** v2.0

---

## 🎯 Core Design Philosophy

**"Attack and Defense numbers you can understand at a glance, with chaos representing battlefield unpredictability that preparation can negate."**

### **Key Principles:**

1. **Clarity:** Attack 8 vs Defense 5 = clear advantage (3 damage base)
2. **Chaos as Uncertainty:** Battlefield conditions create unpredictability (0-10 scale)
3. **Preparation Rewards Tactics:** Formations, experience, defensive positions negate chaos
4. **Better Army Usually Wins:** 90% of time in low chaos
5. **Upsets Possible:** High chaos + preparation = David beats Goliath
6. **Historical Grounding:** Every mechanic based on documented ancient warfare

---

## ⚔️ The Complete Combat Formula

```javascript
// STEP 1: Base Damage
baseDamage = attacker.attack - defender.defense

// STEP 2: Calculate Battlefield Chaos (0-10)
chaosLevel = terrain + weather + density + situation

// STEP 3: Roll Chaos Modifier
chaosRoll = random(1, chaosLevel)  // 1d[chaosLevel]
rawChaos = chaosRoll - (chaosLevel / 2)  // Centers around 0

// STEP 4: Apply Preparation (negates chaos)
attackerChaos = max(0, rawChaos - attacker.preparation)
defenderChaos = max(0, rawChaos - defender.preparation)

// STEP 5: Calculate Effective Values
effectiveAttack = attacker.attack - attackerChaos
effectiveDefense = defender.defense - defenderChaos

// STEP 6: Final Damage
damage = effectiveAttack - effectiveDefense

// STEP 7: Convert to Casualties
if (damage > 0) {
    casualties = damage * (attacker.strength / 100) * 5
} else {
    // Negative damage accumulates until overflow
    accumulateDamage(defender, damage)
}
```

---

## 📊 Attack Ratings (Approved Values)

### **Weapons:**
```javascript
MELEE_WEAPONS = {
  // Light (2-3)
  dagger: 2,
  shortSword: 3,
  
  // Standard (4-6)
  spear: 4,
  sword: 5,
  axe: 6,
  longsword: 6,
  
  // Heavy (7-8)
  falx: 7,              // Dacian two-hander
  pike_sarissa: 8,      // 18-21 foot Macedonian pike
  
  // Special (10-12)
  cataphract: 10,       // Armored cavalry charge
  warElephant: 12       // Trample + terror
}

RANGED_WEAPONS = {
  sling: 3,
  javelin: 4,
  shortBow: 5,
  compositeBow: 7,      // Steppe mastery
  crossbow: 8,          // Armor penetration
  ballista: 10          // Siege anti-personnel
}
```

### **Training Bonuses:**
```javascript
TRAINING = {
  levy: 0,              // Farmers with spears
  militia: 2,           // Part-time soldiers
  professional: 4,      // Full-time warriors
  veteran: 6,           // Battle-hardened (3-5 battles)
  elite: 8,             // Best of best (starting elite units)
  legendary: 10         // 10+ battle veterans
}
```

### **Formation Attack Modifiers:**
```javascript
FORMATION_ATTACK = {
  standard: 0,
  phalanx: -2,          // Defensive formation
  testudo: -4,          // Pure defense
  wedge: +2,            // Cavalry charge
  berserker: +4,        // Celtic fury (penalties elsewhere)
  loose: 0              // Skirmisher default
}
```

---

## 🛡️ Defense Ratings (Approved Values)

### **Armor:**
```javascript
ARMOR = {
  none: 0,
  cloth: 1,             // Padded linen
  leather: 2,
  bronze: 4,            // Greek/early Roman
  chainmail: 5,
  scale: 6,             // Persian/Sarmatian
  lamellar: 7,          // Eastern armor
  loricaSegmentata: 8,  // Roman articulated plate
  cataphract: 9,        // Full horse+rider armor
  combined: 10          // Multiple armor layers
}
```

### **Shields:**
```javascript
SHIELDS = {
  none: 0,
  buckler: 1,
  pelta: 2,             // Light crescent
  roundShield: 3,
  hoplon: 4,            // Greek aspis
  scutum: 5,            // Roman rectangular
  towerShield: 6        // Full body coverage
}
```

### **Formation Defense Modifiers:**
```javascript
FORMATION_DEFENSE = {
  standard: 0,
  phalanx: +8,          // Nearly impenetrable vs cavalry
  testudo: +6,          // Anti-missile shell
  shieldWall: +4,       // Overlapping shields
  loose: -2,            // Skirmisher vulnerability
  berserker: -2         // Aggressive = vulnerable
}
```

---

## 🌪️ Chaos Calculation (0-10 Scale)

### **Environmental Factors:**
```javascript
CHAOS_ENVIRONMENTAL = {
  // Terrain
  plains: 0,
  lightForest: +2,
  denseForest: +4,
  marsh: +3,
  night: +4,
  
  // Weather
  clear: 0,
  lightRain: +1,
  heavyRain: +2,
  fog: +3,
  sandstorm: +3,
  blizzard: +4
}
```

### **Tactical Factors:**
```javascript
CHAOS_TACTICAL = {
  // Unit density
  organized: 0,         // Normal spacing
  crowded: +1,          // 400-600 per tile
  compressed: +3,       // 600+ per tile (Cannae)
  
  // Combat situation
  standard: 0,
  ambush: +4,           // Surprise attack
  flanked: +2,          // Under attack from side
  surrounded: +3,       // Encircled
  riverCrossing: +3     // Mid-crossing vulnerability
}
```

### **Maximum Chaos:** 
- Theoretical max: 10
- Practical max: 8-9 (night forest ambush in storm)
- Common: 2-4 (typical battlefield conditions)

---

## 🎖️ Preparation Modifiers (0-15 Scale)

### **Formation Bonuses:**
```javascript
PREPARATION_FORMATION = {
  phalanx: +6,          // Disciplined pike wall
  testudo: +4,          // Ordered shell formation
  shieldWall: +3,       // Viking/Saxon wall
  wedge: +2,            // Cavalry coordination
  standard: +1,         // Basic formation
  loose: 0,             // No formation bonus
  disorganized: -3      // Chaos multiplier!
}
```

### **Experience Bonuses:**
```javascript
PREPARATION_EXPERIENCE = {
  levy: 0,
  militia: +1,
  professional: +2,
  veteran: +3,
  elite: +4,
  legendary: +5
}
```

### **Tactical Position:**
```javascript
PREPARATION_POSITION = {
  defensive: +2,        // Prepared defensive stance
  fortified: +4,        // Behind walls/barriers
  elevated: +1,         // High ground
  
  // Penalties
  marching: -2,         // Caught in column
  surprised: -6,        // Ambushed
  crossing: -4          // Mid-river/obstacle
}
```

### **Command & Control:**
```javascript
PREPARATION_COMMAND = {
  commanderPresent: +1,     // Within 3 tiles
  waitedOneTurn: +2,        // Spent turn preparing
  coordinatedAttack: +2     // Multiple units planned
}
```

---

## 💧 Damage Accumulation (Bucket System)

**Problem:** What happens when attack < defense? (Example: 4 attack vs 6 defense = -2 damage)

**Solution:** The "Bucket/Cup" system - damage accumulates until it overflows.

### **The Bucket Analogy:**

Think of defense as a cup that fills up each turn with incoming attacks. When it overflows, casualties occur.

```javascript
DAMAGE_ACCUMULATION = {
  
  // Each unit tracks accumulated damage
  unit.accumulatedDamage = 0  // Starts empty
  
  // Each combat turn:
  rawDamage = effectiveAttack - effectiveDefense
  
  if (rawDamage > 0) {
    // POSITIVE DAMAGE: Immediate casualties
    casualties = rawDamage * (attacker.strength / 100) * 5
    // Accumulated damage resets to 0
    
  } else if (rawDamage < 0) {
    // NEGATIVE DAMAGE: Fill the bucket
    unit.accumulatedDamage += Math.abs(rawDamage)
    
    // Check if bucket overflows (>= 1.0)
    if (unit.accumulatedDamage >= 1.0) {
      // Overflow! Extract casualties
      overflowDamage = Math.floor(unit.accumulatedDamage)
      casualties = overflowDamage * 5
      
      // Keep remainder in bucket
      unit.accumulatedDamage = unit.accumulatedDamage % 1.0
    }
  }
}
```

### **Worked Example: 4 Attack vs 6 Defense**

**Turn 1:**
```
Damage: 4 - 6 = -2
Accumulated: 0 + 2 = 2.0
Bucket: [████████░░] (2.0/1.0 threshold)
Overflow! 2 damage = 10 casualties
Remainder: 0
```

**Turn 2:**
```
Damage: 4 - 6 = -2
Accumulated: 0 + 2 = 2.0
Overflow! 2 damage = 10 casualties
```

**Turn 3:**
```
Damage: 4 - 6 = -2
Accumulated: 0 + 2 = 2.0
Overflow! 2 damage = 10 casualties
Total casualties: 30 (triggers morale check at 30%)
```

**Result:** Weak attacker (4) chips away at strong defender (6), causing 10 casualties/turn through accumulated pressure.

### **Worked Example: Very Weak Attack vs Strong Defense**

**Turn 1-3: Attack 2 vs Defense 8**
```
Turn 1: -6 damage → Accumulated: 6.0 → Overflow: 6 damage = 30 casualties
Turn 2: -6 damage → Accumulated: 6.0 → Overflow: 6 damage = 30 casualties  
Turn 3: -6 damage → Accumulated: 6.0 → Overflow: 6 damage = 30 casualties
Total: 90 casualties in 3 turns → Unit routs (90% loss)
```

**Result:** Even completely outmatched attacker eventually causes casualties through persistent pressure. But high casualty rate triggers morale collapse quickly.

### **Worked Example: Fractional Accumulation**

**Turn 1-4: Attack 5 vs Defense 6**
```
Turn 1: -1 damage → Accumulated: 1.0 → Overflow: 1 damage = 5 casualties, remainder 0
Turn 2: -1 damage → Accumulated: 1.0 → Overflow: 1 damage = 5 casualties
Turn 3: -1 damage → Accumulated: 1.0 → Overflow: 1 damage = 5 casualties
Turn 4: -1 damage → Accumulated: 1.0 → Overflow: 1 damage = 5 casualties
Total: 20 casualties in 4 turns
```

**Result:** Tiny damage advantage (1 point) causes steady 5 casualties/turn through accumulated micro-damage.

### **Why This System Works:**

1. **No Stalemates:** Even impenetrable defense eventually yields casualties
2. **Realistic Grinding:** Strong defense delays casualties, doesn't prevent them
3. **Scales with Strength:** As unit shrinks, accumulated damage per turn decreases naturally
4. **Morale Matters:** 15% casualties triggers rout before annihilation
5. **Chaos Can Tip It:** One good chaos roll might push accumulation over threshold sooner

### **Historical Parallel:**

At the Siege of Alesia (52 BC), Roman fortifications (Defense 10+) withstood Gallic attacks (Attack 6-8) for weeks. The Gauls couldn't breach immediately, but accumulated pressure through:
- Repeated assaults filling the "damage bucket"
- Eventually forcing Roman casualties through sheer persistence
- Caesar won through relief forces, not impenetrable defense

The bucket system models this: defense delays but doesn't prevent defeat.

---

## 🎲 Chaos Impact Examples

### **Example 1: Plains Battle (Chaos 0)**
```
Attacker: 8 attack, 4 preparation
Defender: 5 defense, 6 preparation

No chaos roll → Pure math
Damage: 8 - 5 = 3
Result: 15 casualties (3 * 5 multiplier)

Outcome: PREDICTABLE - better attack wins cleanly
```

### **Example 2: Forest Skirmish (Chaos 6)**
```
Same forces, but in forest with fog

Chaos roll: 1d6 = 4
Raw chaos: 4 - 3 = +1

Attacker chaos: max(0, 1 - 4) = 0 (preparation blocked it)
Defender chaos: max(0, 1 - 6) = 0 (preparation blocked it)

Damage: (8-0) - (5-0) = 3
Result: 15 casualties (same as plains!)

Outcome: PREPARATION MATTERS - both sides negated chaos
```

### **Example 3: Night Ambush (Chaos 8)**
```
Attacker: 8 attack, 8 preparation (formed, waiting, elevated)
Defender: 5 defense, 0 preparation (marching column, surprised)

Chaos roll: 1d8 = 6
Raw chaos: 6 - 4 = +2

Attacker chaos: max(0, 2 - 8) = 0 (fully prepared!)
Defender chaos: max(0, 2 - 0) = 2 (NO preparation!)

Damage: (8-0) - (5-2) = 8 - 3 = 5
Result: 25 casualties (5 * 5 multiplier)

Outcome: CHAOS PUNISHES UNPREPARED - same units, massive swing
```

### **Example 4: Baldwin at Montgisard**
```
Templars: 8 attack, 10 preparation (formation, waiting, commander, defensive)
Saracens: 5 attack, 3 defense, 0 preparation (marching, river crossing)

Chaos: 8 (sandstorm + river + extended lines)
Roll: 1d8 = 6, Raw: 6-4 = +2

Templar chaos: max(0, 2-10) = 0 (immune!)
Saracen chaos: max(0, 2-0) = 2 (full penalty!)

Damage: (8-0) - (3-2) = 8-1 = 7
With 500 vs 26,000: Templars deliver 35 casualties per engagement
Saracens deliver: (5-0) - (7-0) = -2 (accumulates, no damage)

Result: 500 defeat 26,000 because preparation > numbers in chaos
```

---

## 💀 Damage Accumulation System

**Problem:** What if damage is negative?

**Solution:** Bucket system (like Baldwin's -2 accumulating)
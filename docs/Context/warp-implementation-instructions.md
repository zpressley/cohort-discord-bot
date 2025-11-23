# WARP AI Instructions - Cohort Bot Fix Implementation

## 🎯 WARP DIRECTIVE

You are implementing critical fixes for the Cohort Discord bot. The game is currently broken and needs these fixes applied in order. Follow each instruction exactly as written.

---

## 📋 CONTEXT FOR WARP

**Project:** Cohort Discord Bot - Ancient warfare strategy game  
**Language:** JavaScript/Node.js  
**Framework:** Discord.js v14  
**Database:** SQLite with Sequelize ORM  
**Current State:** Game broken - battles start but units don't deploy, victory triggers instantly, no maps shown

---

## 🔧 IMPLEMENTATION TASKS IN ORDER

### TASK 1: Fix Unit Deployment

**File:** `src/bot/gameInteractionHandler.js`  
**Problem:** Units never get deployed when battle starts  
**Location:** In the `handleBattleJoin` function, after line 111

**FIND this code block (around line 108-115):**
```javascript
// Join the battle
await battle.update({
    player2Id: interaction.user.id,
    status: 'in_progress'
});

// Generate initial weather for battle
await battle.generateWeather();
```

**ADD immediately after the weather generation:**
```javascript
// Initialize unit positions for both players
await startBattlePhase(battle);
```

**Verification:** The `startBattlePhase` function should already exist in the same file around line 186.

---

### TASK 2: Fix Victory Condition Bug

**File:** `src/game/turnOrchestrator.js`  
**Problem:** Battles end immediately because empty unit arrays trigger victory  
**Location:** The `checkVictoryConditions` function around line 240

**REPLACE the entire `checkVictoryConditions` function with:**
```javascript
function checkVictoryConditions(positions, turnNumber, objectives) {
    // Ensure positions exist and have units
    if (!positions?.player1?.length || !positions?.player2?.length) {
        console.log('Victory check skipped - units not deployed yet');
        return { achieved: false };
    }
    
    // Don't end battle in first 3 turns unless complete annihilation
    if (turnNumber < 3) {
        const p1Strength = positions.player1.reduce((sum, u) => sum + u.currentStrength, 0);
        const p2Strength = positions.player2.reduce((sum, u) => sum + u.currentStrength, 0);
        
        // Only allow total annihilation victory in early turns
        if (p1Strength > 0 && p2Strength > 0) {
            return { achieved: false };
        }
    }
    
    const p1Strength = positions.player1.reduce((sum, u) => sum + u.currentStrength, 0);
    const p2Strength = positions.player2.reduce((sum, u) => sum + u.currentStrength, 0);
    
    const p1Original = positions.player1.reduce((sum, u) => sum + (u.maxStrength || u.currentStrength), 0);
    const p2Original = positions.player2.reduce((sum, u) => sum + (u.maxStrength || u.currentStrength), 0);
    
    // Annihilation victory
    if (p1Strength <= 0) {
        return { achieved: true, winner: 'player2', reason: 'enemy_destroyed' };
    }
    if (p2Strength <= 0) {
        return { achieved: true, winner: 'player1', reason: 'enemy_destroyed' };
    }
    
    // 75% casualties = defeat
    if (p1Strength < p1Original * 0.25) {
        return { achieved: true, winner: 'player2', reason: 'catastrophic_casualties' };
    }
    if (p2Strength < p2Original * 0.25) {
        return { achieved: true, winner: 'player1', reason: 'catastrophic_casualties' };
    }
    
    // TODO: Add objective-based victory conditions
    
    return { achieved: false };
}
```

---

### TASK 3: Fix Map Display in Briefings

**File:** `src/bot/gameInteractionHandler.js`  
**Problem:** Maps aren't being sent with battle briefings  
**Location:** In the `startBattlePhase` function around line 240-280

**FIND this section (around line 260-280):**
```javascript
// Send initial map/briefings to both players
try {
    const client = require('../index').client;
    const { sendNextTurnBriefings } = require('./dmHandler');
    await sendNextTurnBriefings(battle, battle.battleState, { p1Interpretation:{}, p2Interpretation:{} }, client);
} catch (e) {
    console.log('Initial briefing send failed:', e.message);
    // Fallback minimal DM
```

**REPLACE with:**
```javascript
// Send initial map/briefings to both players
try {
    const client = require('../index').client;
    const { sendInitialBriefings } = require('../game/briefingSystem');
    
    // Ensure battle state has map terrain
    if (!battle.battleState.map) {
        const mapModule = require(`../game/maps/${battle.scenario}`);
        battle.battleState.map = {
            terrain: mapModule.RIVER_CROSSING_MAP?.terrain || mapModule.MAP?.terrain
        };
    }
    
    await sendInitialBriefings(battle, battle.battleState, client);
    console.log('✅ Initial briefings with maps sent');
} catch (e) {
    console.log('Initial briefing send failed:', e.message);
    // Fallback minimal DM
    try {
        const client = require('../index').client;
        const p1 = await client.users.fetch(battle.player1Id);
        const p2 = battle.player2Id ? await client.users.fetch(battle.player2Id) : null;
        const text = `⚔️ Turn 1 begins. Send your orders.`;
        await p1.send(text);
        if (p2) await p2.send(text);
    } catch (_) {}
}
```

---

### TASK 4: Fix Unit ID Consistency

**File:** `src/game/maps/riverCrossing.js`  
**Problem:** Unit IDs don't match between deployment and order processing  
**Location:** The `initializeDeployment` function

**FIND the `initializeDeployment` function and REPLACE it with:**
```javascript
function initializeDeployment(side, units) {
    const positions = [];
    const startRow = side === 'north' ? 2 : 18;
    const playerPrefix = side === 'north' ? 'player1' : 'player2';
    
    units.forEach((unit, index) => {
        positions.push({
            unitId: `${playerPrefix}_unit_${index}`,
            unitType: unit.type,
            unitName: unit.name || `Unit ${index + 1}`,
            position: `H${startRow}`,
            currentStrength: unit.count,
            maxStrength: unit.count,
            mounted: unit.type === 'cavalry' || unit.type === 'light_cavalry',
            morale: 100,
            formation: 'standard',
            movementRemaining: unit.type === 'cavalry' ? 5 : 3
        });
    });
    
    console.log(`Deployed ${side} units:`, positions.map(u => `${u.unitId} at ${u.position}`));
    return positions;
}
```

---

### TASK 5: Remove Missing File Reference

**File:** `src/index.js`  
**Problem:** References non-existent scenarioKeyAssert.js file  
**Location:** Lines 34-41

**FIND this code block:**
```javascript
// Scenario key alignment assertion
try {
    const { assertScenarioKeys } = require('./game/validation/scenarioKeyAssert');
    assertScenarioKeys();
    console.log('🧭 Scenario keys aligned with map modules.');
} catch (e) {
    console.error('❌ Scenario key assertion failed:', e.message);
    process.exit(1);
}
```

**REPLACE with:**
```javascript
// Scenario validation disabled until file implemented
console.log('🧭 Skipping scenario validation (not yet implemented).');
```

---

### TASK 6: Ensure Next Turn Briefings Include Maps

**File:** `src/bot/dmHandler.js`  
**Problem:** Next turn briefings don't include maps  
**Location:** In the `sendNextTurnBriefings` function around line 470

**FIND the `sendNextTurnBriefings` function and REPLACE it with:**
```javascript
async function sendNextTurnBriefings(battle, battleState, client) {
    try {
        const { sendNextTurnBriefings: sendBriefings } = require('../game/briefingSystem');
        await sendBriefings(battle, battleState, client);
    } catch (error) {
        console.error('Error sending briefings:', error);
        // Fallback to simple message
        const briefing = `⚡ **Turn ${battle.currentTurn} - Awaiting Orders**\n\n` +
            `Send your orders to continue the battle.`;
        
        if (!battle.player1Id.startsWith('TEST_')) {
            const player1 = await client.users.fetch(battle.player1Id);
            await player1.send(briefing);
        }
        
        if (battle.player2Id && !battle.player2Id.startsWith('TEST_')) {
            const player2 = await client.users.fetch(battle.player2Id);
            await player2.send(briefing);
        }
    }
}
```

---

## ✅ VERIFICATION STEPS

After implementing ALL fixes, test as follows:

1. **Start the bot:** `npm start`
2. **In Discord:**
   - User 1: `/build-army` → Select culture → Build forces
   - User 1: `/create-game` → Select scenario
   - User 2: `/build-army` → Select culture → Build forces  
   - User 2: Click "Join Battle" button
3. **Check DMs:**
   - Both players should receive briefings WITH maps
   - Maps should show unit positions
4. **Send orders in DMs:**
   - Player 1: `move south`
   - Player 2: `move north`
5. **Verify:**
   - Turn processes without instant victory
   - Units actually move on the map
   - Next turn briefing shows new positions

---

## ⚠️ IMPORTANT NOTES FOR WARP

1. **Order matters** - Apply fixes in the exact order given
2. **Don't skip fixes** - Each one addresses a critical issue
3. **Test after Task 5** - The game should be minimally functional
4. **If imports fail** - Check that the required file exists before importing
5. **Console logs** - Keep them for debugging, they help identify issues

---

## 🚫 DO NOT

- Do NOT attempt to optimize or refactor while fixing
- Do NOT skip the verification steps
- Do NOT change function signatures unless specified
- Do NOT remove console.log statements - they help debugging

---

## 📊 SUCCESS CRITERIA

The fixes are successful when:
1. ✅ Battles start and units appear on the map
2. ✅ Players can send movement orders that execute
3. ✅ Battles don't end on Turn 1
4. ✅ Maps display in all briefings
5. ✅ No startup errors about missing files

---

## 🆘 IF SOMETHING BREAKS

If a fix causes new errors:
1. Check the exact line numbers - they may have shifted
2. Verify the function/variable names match exactly
3. Ensure all required imports are added
4. Check that the file path in require() statements is correct
5. Look for typos in function names or variables

Common issues:
- `Cannot read property of undefined` - Check that objects exist before accessing properties
- `Module not found` - Check file paths and names
- `Unexpected token` - Check for syntax errors like missing brackets or commas

---

**END OF WARP INSTRUCTIONS**

Apply these fixes in order, test after each one, and the game should become functional.
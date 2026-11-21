// src/game/combat/tests/damageScalingSandbox.js
// Sandbox to experiment with pre-scaling raw damage before bucket accumulation
// without touching the main combat engine.

/**
 * Minimal reimplementation of the bucket accumulation model used in
 * applyDamageWithAccumulation, simplified for sandbox testing.
 *
 * Assumptions (from simpleCombatTest output):
 * - We treat |damage| as bucket input.
 * - Each full bucket (1.0) converts to casualties at 5 per point of overflow.
 * - Bucket resets to remainder after overflow.
 */

function simulateBucketOverTurns(rawDamagePerTurn, turns, scale = 1.0) {
    let bucket = 0; // 0..1
    let totalCasualties = 0;

    console.log(`\n=== Bucket Sandbox: rawDamage=${rawDamagePerTurn} scale=${scale} over ${turns} turns ===`);

    for (let turn = 1; turn <= turns; turn++) {
        const scaledDamage = rawDamagePerTurn * scale;
        const magnitude = Math.abs(scaledDamage);
        bucket += magnitude;

        let casualtiesThisTurn = 0;
        if (bucket >= 1.0) {
            const overflow = bucket - 1.0;
            casualtiesThisTurn = Math.round((1.0 + overflow) * 5); // same 5x multiplier
            bucket = overflow; // keep remainder in bucket
        }

        totalCasualties += casualtiesThisTurn;
        console.log(
            `Turn ${turn}: scaledDamage=${scaledDamage.toFixed(2)}, ` +
            `bucket=${bucket.toFixed(2)}, casualties=${casualtiesThisTurn}`
        );
    }

    console.log(`Total casualties over ${turns} turns: ${totalCasualties}`);
    return totalCasualties;
}

async function runDamageScalingSandbox() {
    console.log('\n🧪 DAMAGE SCALING SANDBOX (no engine changes)');

    // Case 1: Design doc example from simpleCombatTest
    // Attack 4 vs Defense 6 = -2 damage
    console.log('\n--- Case 1: -2 damage baseline (matches current tests) ---');
    simulateBucketOverTurns(-2, 3, 1.0); // should roughly align with 10/turn

    console.log('\n--- Case 1b: -2 damage with 0.5 scaling ---');
    simulateBucketOverTurns(-2, 3, 0.5);

    console.log('\n--- Case 1c: -2 damage with 0.3 scaling ---');
    simulateBucketOverTurns(-2, 3, 0.3);

    // Case 2: -1 damage (fractional accumulation example)
    console.log('\n--- Case 2: -1 damage baseline ---');
    simulateBucketOverTurns(-1, 4, 1.0);

    console.log('\n--- Case 2b: -1 damage with 0.5 scaling ---');
    simulateBucketOverTurns(-1, 4, 0.5);

    console.log('\n--- Case 2c: -1 damage with 0.3 scaling ---');
    simulateBucketOverTurns(-1, 4, 0.3);

    // Case 3: +3 damage (immediate casualties) – here scaling simply
    // reduces the casualties per turn linearly.
    console.log('\n--- Case 3: +3 damage baseline ---');
    simulateBucketOverTurns(3, 1, 1.0);

    console.log('\n--- Case 3b: +3 damage with 0.5 scaling ---');
    simulateBucketOverTurns(3, 1, 0.5);

    console.log('\n--- Case 3c: +3 damage with 0.3 scaling ---');
    simulateBucketOverTurns(3, 1, 0.3);
}

if (require.main === module) {
    runDamageScalingSandbox()
        .then(() => {
            console.log('\n✅ Damage scaling sandbox complete');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Damage scaling sandbox failed:', err);
            process.exit(1);
        });
}

module.exports = { simulateBucketOverTurns };

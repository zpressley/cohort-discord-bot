#!/usr/bin/env node

// Improved Balance Test Runner for Combat System v2.0
// Uses historically authentic metrics instead of artificial 50/50 balance

const { runImprovedBalanceAnalysis } = require('./improvedBalanceFramework');

async function main() {
    try {
        console.log('Combat System v2.0 - Improved Balance Analysis');
        console.log('==============================================\n');
        
        console.log('🎯 NEW BALANCE GOALS:');
        console.log('  ✓ Each culture competitive (30%+) in 4+ scenarios');
        console.log('  ✓ No auto-wins (>95% win rate)');
        console.log('  ✓ Tactical decisions swing outcomes 20-40%');
        console.log('  ✓ Chaos creates 30%+ variance in win rates');
        console.log('  ✓ Historical authenticity over artificial balance\n');
        
        const { testResults, report } = await runImprovedBalanceAnalysis();
        
        console.log('\n=== NEXT STEPS ===');
        if (report.systemStatus === 'BALANCED') {
            console.log('✅ System is balanced according to improved metrics');
            console.log('🔄 Proceed to chaos variance testing (CMB-006.3)');
        } else {
            console.log('⚙️  System needs additional tuning');
            console.log('🔧 Focus on breakthrough mechanics and damage scaling');
        }
        
        console.log('\n✅ Improved balance analysis completed!');
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Improved balance analysis failed:');
        console.error(error.message);
        console.error('\nStack trace:');
        console.error(error.stack);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

if (require.main === module) {
    main();
}

module.exports = { main };
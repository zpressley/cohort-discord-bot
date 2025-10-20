#!/usr/bin/env node

// Test runner for Combat Balance Testing (CMB-006)
// Executes automated balance tests for Combat System v2.0

const { runAllBalanceTests } = require('./combatBalanceTest');

async function main() {
    try {
        console.log('Combat System v2.0 - Balance Testing Suite');
        console.log('==========================================\n');
        
        const results = await runAllBalanceTests();
        
        console.log('\nBalance testing completed successfully!');
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Balance testing failed:');
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
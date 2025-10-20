const { Sequelize } = require('sequelize');
const path = require('path');

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_PATH || path.join(__dirname, '../../data/cohort.db'),
    logging: process.env.NODE_ENV === 'development' ? console.log : false
});

// Import models
const Commander = require('./models/Commander');
const EliteUnit = require('./models/EliteUnit');
const Battle = require('./models/Battle');
const BattleTurn = require('./models/BattleTurn');
const VeteranOfficer = require('./models/VeteranOfficer');
const BattleCommander = require('./models/BattleCommander');

// Initialize models
const models = {
    Commander: Commander(sequelize),
    EliteUnit: EliteUnit(sequelize),
    Battle: Battle(sequelize),
    BattleTurn: BattleTurn(sequelize),
    VeteranOfficer: VeteranOfficer(sequelize),
    BattleCommander: BattleCommander(sequelize)
};

// Define associations
Object.keys(models).forEach(modelName => {
    if (models[modelName].associate) {
        models[modelName].associate(models);
    }
});

async function setupDatabase() {
    try {
        const fs = require('fs');
        
        // Test connection
        await sequelize.authenticate();
        console.log('✅ Database connection established successfully.');
        
       // Check if database file exists AND has tables
        const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/cohort.db');
        const dbExists = fs.existsSync(dbPath);

        if (!dbExists || fs.statSync(dbPath).size === 0) {
            // Fresh or empty database - create clean tables
            console.log('📝 Creating fresh database...');
            await sequelize.sync({ force: true });
        } else {
            // Existing database with data - skip sync to avoid migration issues
            console.log('📂 Using existing database (no sync)...');
        }
        
        console.log('✅ Database tables ready.');
        
        // Create initial data if needed
        await createInitialData();
        
        return sequelize;
    } catch (error) {
        console.error('❌ Unable to connect to database:', error);
        throw error;
    }
}

async function createInitialData() {
    // Check if we need to create initial cultures/scenarios
    const commanderCount = await models.Commander.count();
    
    if (commanderCount === 0) {
        console.log('📚 Creating initial game data...');
        
        // Create sample cultures (will expand this later)
        const cultures = [
            'Roman Republic',
            'Germanic Tribes',
            'Celtic Gauls',
            'Han Dynasty',
            'Scythian Confederation'
        ];
        
        // Create sample scenarios
        const scenarios = [
            {
                name: 'Bridge Control',
                description: 'Ancient bridge crossing - tactical control scenario',
                maxTurns: 12,
                victoryConditions: 'Control bridge for 4 turns OR destroy enemy army'
            },
            {
                name: 'Hill Fort Assault',
                description: 'Fortified hilltop position assault',
                maxTurns: 15,
                victoryConditions: 'Capture fortress OR hold for 8 turns'
            }
        ];
        
        console.log('✅ Initial data created.');
    }
}

// Export everything
module.exports = {
    sequelize,
    models,
    setupDatabase
};
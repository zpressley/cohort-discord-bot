// src/tests/briefings/test_ai_warning_generation.js
// Test actual AI warning generation

// Load environment variables
require('dotenv').config();

async function testAIWarnings() {
    const { generateVeteranWarning } = require('../../ai/officerQA');
    
    console.log('=== TESTING AI WARNING GENERATION ===\n');
    
    // Verify Groq key is loaded
    if (!process.env.GROQ_API_KEY) {
        console.log('❌ GROQ_API_KEY not found in environment');
        console.log('   Make sure .env file exists at project root');
        return;
    }
    
    console.log('✅ Groq API key loaded');
    
    const veteran = {
        name: 'Marcus the Scarred',
        battles: 10
    };
    
    const triggers = [{
        type: 'battle_memory',
        severity: 'high',
        context: {
            memory: {
                memory: {
                    description: 'Celtic ambush at Teutoburg Forest'
                },
                outcome: 'disaster'
            }
        }
    }];
    
    console.log('Generating AI warning...\n');
    
    try {
        const warning = await generateVeteranWarning(
            veteran,
            triggers,
            "advance infantry through the forest",
            {},
            'player1'
        );
        
        console.log('✅ AI Generated Warning:');
        console.log(`   "${warning}"\n`);
        
        // Check quality
        if (warning.length > 50 && warning.toLowerCase().includes('forest')) {
            console.log('✅ Warning is contextual and substantial');
        } else {
            console.log('⚠️ Warning may be too generic');
        }
        
    } catch (error) {
        console.log('❌ AI generation failed:', error.message);
    }
}

testAIWarnings();
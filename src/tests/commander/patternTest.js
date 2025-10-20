// Debug test for commander action patterns
async function testPatterns() {
    console.log('\n🔍 PATTERN DEBUG TEST\n');
    
    const testOrders = [
        "I will move to the cavalry",
        "I will detach to F8", 
        "Marcus, take the praetorian guard and attack the bridge",
        "I will escape",
        "All units move north"
    ];
    
    for (const order of testOrders) {
        console.log(`\n📋 Testing: "${order}"`);
        
        // Test commander move pattern
        const commanderMovePattern = /(?:i will|i'll|i) (?:move to|join|go to) (?:the )?([\\w\\s]+)/i;
        const commanderMove = order.match(commanderMovePattern);
        console.log('  Commander move match:', commanderMove?.[1] || 'none');
        
        // Test detach pattern  
        const detachPattern = /(?:i will|i'll|i) (?:detach|move independently|leave the unit)(?:\\s+(?:to|at)\\s+([A-T]\\d{1,2}))?/i;
        const detachMatch = order.match(detachPattern);
        console.log('  Detach match:', detachMatch?.[1] || 'none');
        
        // Test delegation pattern
        const delegationPattern = /([\\w]+),\\s+take\\s+(?:the\\s+)?([\\w\\s]+)\\s+and\\s+([\\w\\s]+)/i;
        const delegation = order.match(delegationPattern);
        console.log('  Delegation match:', delegation ? `${delegation[1]} -> ${delegation[2]} -> ${delegation[3]}` : 'none');
        
        // Test split pattern
        const splitPattern = /\\w+,\\s+take\\s+(?:the\\s+)?[\\w\\s]+\\s+and\\s+[\\w\\s]+/i;
        const shouldNotSplit = splitPattern.test(order);
        console.log('  Should NOT split:', shouldNotSplit);
    }
}

testPatterns();
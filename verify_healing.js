require('dotenv').config();
const { Storage } = require('./netlify/functions/lib/storage');
const prophecyReveal = require('./netlify/functions/prophecy-reveal');

const storage = new Storage('sentiment-data');

// Mock Context
const context = {
    awsRequestId: 'verify-healing-' + Date.now(),
    callbackWaitsForEmptyEventLoop: false
};

async function verifyHealing() {
    console.log('🧪 VERIFYING SELF-HEALING LOGIC...\n');

    // 1. Sabotage: Delete today's prophecy
    console.log('1. Sabotage: Deleting prophecy from Upstash...');
    let data = await storage.get('data');
    if (data && data.prophecy) {
        data.prophecy = { text: '', date: '2000-01-01', ready: false }; // Set to old date
        await storage.set('data', data);
        console.log('   ✅ Prophecy wiped (simulating missing generation).');
    }

    console.log('\n-----------------------------------\n');

    // 2. Run Reveal (Should trigger Healing)
    console.log('2. Running Prophecy Reveal...');
    try {
        // Reveal logic normally posts to X. 
        // NOTE: This WILL post to X if successful. That's good proof.
        const result = await prophecyReveal.handler({}, context);
        console.log('   Result:', result.statusCode, result.body);

        const body = JSON.parse(result.body);
        if (body.success && body.revealed) {
            console.log('\n✅ TEST PASSED: Prophecy was generated and revealed!');
            console.log('   Prophecy:', body.prophecy);
        } else {
            console.error('\n❌ TEST FAILED: Response was not success.');
        }

    } catch (err) {
        console.error('   ❌ Failed:', err.message);
    }
}

verifyHealing();

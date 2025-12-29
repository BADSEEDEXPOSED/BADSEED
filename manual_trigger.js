const { generateProphecy } = require('./netlify/functions/lib/prophecy-logic');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
    console.log("--- MANUALLY TRIGGERING PROPHECY GENERATION ---");
    try {
        const result = await generateProphecy(true); // force = true
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

run();

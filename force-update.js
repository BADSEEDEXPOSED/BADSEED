
require('dotenv').config();
const { generateProphecy } = require('./netlify/functions/lib/prophecy-logic');

async function forceUpdate() {
    console.log("=== FORCING PROPHECY UPDATE ===");
    try {
        const result = await generateProphecy(true); // Force = true
        console.log("\n✅ SUCCESS!");
        console.log("New Date:", result.prophecy.date);
        console.log("Dominant:", result.dominant);
        console.log("Text:", result.prophecy.text);
    } catch (err) {
        console.error("\n❌ FAILED:", err.message);
    }
}

forceUpdate();

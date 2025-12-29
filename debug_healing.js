const { generateProphecy } = require('./netlify/functions/lib/prophecy-logic');
const { Storage } = require('./netlify/functions/lib/storage');
const dotenv = require('dotenv');

dotenv.config();

async function debugHealing() {
    console.log("--- DEBUGGING SELF-HEALING LOGIC ---");
    const storage = new Storage('sentiment-data');

    try {
        console.log("1. Checking DB state...");
        let storageData = await storage.get('data');
        const today = new Date().toISOString().split('T')[0];

        if (!storageData || !storageData.prophecy || storageData.prophecy.date !== today) {
            console.log(`2. ⚠️ MISSING prophecy for today (${today}).`);
            console.log("3. Triggering generation (force=true)...");

            try {
                const genResult = await generateProphecy(true);

                if (genResult.success && genResult.prophecy) {
                    console.log("4. ✅ Generation SUCCESS.");
                    console.log("   Text:", genResult.prophecy.text.substring(0, 50) + "...");
                    console.log("   X Status:", genResult.prophecy.x_post_status);
                } else {
                    console.log("4. ❌ Generation FAILED (No success flag or prophecy).");
                    console.log("   Result:", JSON.stringify(genResult));
                }
            } catch (genError) {
                console.error("4. ❌ Generation CRASHED:", genError.message);
                if (genError.message.includes("No API Key")) {
                    console.log("   -> CAUSE: OPENAI_KEY might be missing.");
                }
            }
        } else {
            console.log("2. Prophecy ALREADY EXISTS. (Cannot test healing if it exists)");
            console.log("   Run manual delete if you want to test healing.");
        }
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
    }
}

debugHealing();

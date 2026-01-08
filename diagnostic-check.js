
require('dotenv').config();
const { Storage } = require('./netlify/functions/lib/storage');

async function runDiagnostics() {
    console.log("=== BADSEED DIAGNOSTICS ===");
    console.log("Time:", new Date().toISOString());
    console.log("--------------------------------");

    // 1. Check Environment Variables
    console.log("[1] Checking API Keys (Local Environment)...");
    const changes = {
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY ? "✅ Present" : "❌ MISSING",
        X_CONSUMER_KEY: !!process.env.X_CONSUMER_KEY ? "✅ Present" : "❌ MISSING",
        X_ACCESS_TOKEN: !!process.env.X_ACCESS_TOKEN ? "✅ Present" : "❌ MISSING",
        UPSTASH_URL: !!process.env.UPSTASH_REDIS_REST_URL ? "✅ Present" : "❌ MISSING",
        UPSTASH_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN ? "✅ Present" : "❌ MISSING"
    };
    console.table(changes);

    if (!process.env.UPSTASH_REDIS_REST_URL) {
        console.error("⛔ CRITICAL: Upstash credentials missing. Cannot fetch data.");
        return;
    }

    // 2. Check Storage State
    console.log("\n[2] Fetching Prophecy Data from Upstash...");
    const storage = new Storage('sentiment-data');
    try {
        const data = await storage.get('data');
        if (!data) {
            console.log("⚠️ Storage is empty (null).");
        } else {
            console.log("\n--- PROPHECY STATE ---");
            console.log("Date:", data.prophecy?.date);
            console.log("Ready:", data.prophecy?.ready);
            console.log("Forced:", data.prophecy?.forced_ready || false);
            console.log("Generated At:", data.prophecy?.generatedAt);
            console.log("X Post Status:", data.prophecy?.x_post_status);
            console.log("Text:", data.prophecy?.text);

            console.log("\n--- SENTIMENT STATS ---");
            console.log(data.sentiments);

            console.log("\n--- SYSTEM HEALTH ---");
            console.log("System Status:", data.system_status || "OK");
            console.log("Last Error:", data.last_error || "None");
        }
    } catch (err) {
        console.error("❌ Storage Error:", err.message);
    }
}

runDiagnostics();

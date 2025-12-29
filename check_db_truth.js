const { Redis } = require('@upstash/redis');
const dotenv = require('dotenv');

dotenv.config();

async function checkProphecy() {
    const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    try {
        const data = await redis.get('data'); // The key used in prophecy-reveal.js and storage.js
        console.log("--- DB CONNECTION SUCCESS ---");
        console.log("DB URL (Partial):", process.env.UPSTASH_REDIS_REST_URL.substring(0, 20) + "...");

        if (data && data.prophecy) {
            console.log("\n--- CURRENT PROPHECY IN DB ---");
            console.log("Date:", data.prophecy.date);
            console.log("Text Length:", data.prophecy.text.length);
            console.log("Text Preview:", data.prophecy.text.substring(0, 50) + "...");
            console.log("Calculated Sentiment:", data.sentiment ? data.sentiment.dominant : "N/A");
            console.log("Ready:", data.prophecy.ready);
            console.log("Revealed At:", data.prophecy.revealedAt || "NULL");
            console.log("X Status:", data.prophecy.x_post_status || "NULL");
            console.log("Full Object:", JSON.stringify(data.prophecy, null, 2));
        } else {
            console.log("\n--- NO PROPHECY FOUND IN DB ---");
        }

    } catch (error) {
        console.error("DB Error:", error.message);
    }
}

checkProphecy();

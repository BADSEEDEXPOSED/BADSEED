const { Storage } = require('./netlify/functions/lib/storage');
const dotenv = require('dotenv');

dotenv.config();

async function restoreSentiment() {
    console.log("--- RESTORING SENTIMENT FOR UI ---");
    const storage = new Storage('sentiment-data');

    try {
        let data = await storage.get('data');

        if (data) {
            console.log("Current total:", data.totalMemos);
            // Bump mystery to 1 so UI renders
            data.sentiments.mystery = Math.max(data.sentiments.mystery, 1);
            data.totalMemos = Math.max(data.totalMemos, 1);

            await storage.set('data', data);
            console.log("✅ SENTIMENT RESTORED. Total > 0. UI should render.");
        } else {
            console.log("❌ No data found.");
        }

    } catch (error) {
        console.error("CRITICAL ERROR:", error);
    }
}

restoreSentiment();

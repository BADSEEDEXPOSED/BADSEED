const dotenv = require('dotenv');
dotenv.config();
const { Storage } = require('./netlify/functions/lib/storage');

async function hardReset() {
    console.log("--- HARD RESET DATABASE ---");
    const storage = new Storage('sentiment-data');

    try {
        const resetData = {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: new Date().toISOString(),
            prophecy: {
                text: '',
                date: '1999-01-01', // Force mismatch with Today
                ready: false,
                x_post_status: 'pending'
            },
            system_status: 'nominal',
            last_error: null
        };

        await storage.set('data', resetData);
        console.log("✅ DATA OVERWRITTEN. Date set to 1999-01-01.");

        // Verify immediately
        const verify = await storage.get('data');
        console.log("VERIFY READBACK -> Date:", verify.prophecy.date);

    } catch (error) {
        console.error("CRITICAL ERROR:", error);
    }
}

hardReset();

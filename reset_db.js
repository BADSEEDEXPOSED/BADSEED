const { Storage } = require('./netlify/functions/lib/storage');
const dotenv = require('dotenv');

dotenv.config();

async function resetProphecy() {
    console.log("--- RESETTING DATABASE FOR TEST ---");
    const storage = new Storage('sentiment-data');

    try {
        console.log("1. Fetching current data...");
        let data = await storage.get('data');

        if (data) {
            console.log("2. Clearing prophecy...");
            // Keep sentiment, just kill the prophecy
            data.prophecy = {
                text: '',
                date: '',
                ready: false,
                x_post_status: 'pending'
            };

            // Clear error states too
            data.system_status = 'nominal';
            data.last_error = null;

            await storage.set('data', data);
            console.log("3. ✅ DATABASE RESET. Prophecy cleared.");
        } else {
            console.log("2. Database already empty.");
        }

    } catch (error) {
        console.error("CRITICAL ERROR:", error);
    }
}

resetProphecy();

// Scheduled Function: Daily Reset
// Runs at 00:00 UTC daily - resets sentiment counters and blurs prophecy

const { Storage } = require('./lib/storage');

const storage = new Storage('sentiment-data');

exports.handler = async (event, context) => {
    console.log('[Daily Reset] Running at', new Date().toISOString());

    try {
        // Get current data
        let data = await storage.get('data') || {};

        // Archive yesterday's data (optional, for history)
        const historyStorage = new Storage('sentiment-history');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().split('T')[0];

        if (data.sentiments && data.prophecy) {
            try {
                let history = await historyStorage.get('history') || {};
                history[yesterdayKey] = {
                    sentiments: { ...data.sentiments },
                    prophecy: { ...data.prophecy },
                    totalMemos: data.totalMemos || 0
                };
                await historyStorage.set('history', history);
                console.log('[Daily Reset] Archived yesterday\'s data');
            } catch (historyError) {
                console.warn('[Daily Reset] Failed to archive history:', historyError.message);
            }
        }

        // Reset sentiment counters
        data.sentiments = { hope: 0, greed: 0, fear: 0, mystery: 0 };
        data.totalMemos = 0;

        // Reset prophecy (blur it)
        data.prophecy = {
            text: '',
            date: '',
            ready: false
        };

        data.lastReset = new Date().toISOString();
        await storage.set('data', data);

        console.log('[Daily Reset] Counters and prophecy reset');

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Daily reset complete',
                resetAt: data.lastReset
            })
        };
    } catch (error) {
        console.error('[Daily Reset] Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

// Netlify scheduled function config
exports.config = {
    schedule: "0 0 * * *"  // 00:00 UTC daily (midnight)
};

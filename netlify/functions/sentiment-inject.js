// API Endpoint: Manually Inject Sentiment
// Usage: POST { "hope": 10, "fear": -5 }
// Description: Allows "God Mode" (User) to force stats up/down instantly.

const { Storage } = require('./lib/storage');
const storage = new Storage('sentiment-data');

exports.handler = async (event) => {
    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        const updates = JSON.parse(event.body);

        let data = await storage.get('data') || {
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            totalMemos: 0
        };

        let log = [];

        // Apply Updates
        ['hope', 'greed', 'fear', 'mystery'].forEach(emotion => {
            if (updates[emotion]) {
                const val = parseInt(updates[emotion]);
                if (!isNaN(val)) {
                    data.sentiments[emotion] = (data.sentiments[emotion] || 0) + val;
                    // Prevent negatives? No, user might want to reduce it.
                    if (data.sentiments[emotion] < 0) data.sentiments[emotion] = 0;
                    log.push(`${emotion} ${val > 0 ? '+' : ''}${val}`);
                }
            }
        });

        if (log.length > 0) {
            await storage.set('data', data);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: `Injected: ${log.join(', ')}`,
                    newStats: data.sentiments
                })
            };
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "No valid sentiments provided. keys: hope, greed, fear, mystery" })
            };
        }

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};

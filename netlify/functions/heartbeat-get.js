// API Endpoint: Get Cloud Poller Heartbeat
// Usage: GET request to check if the background automation is running

const { Storage } = require('./lib/storage');
const storage = new Storage('queue-data'); // Same bucket as the poller

exports.handler = async (event) => {
    // CORS Headers (Universal)
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const lastHeartbeat = await storage.get('last-heartbeat');
        const now = Date.now();
        const hbTime = lastHeartbeat ? new Date(lastHeartbeat).getTime() : 0;
        const diffSeconds = Math.floor((now - hbTime) / 1000);

        // Status: OK if < 15 mins (allowing for 10m schedule variance)
        const status = diffSeconds < 900 ? 'online' : 'stalled';

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: status,
                lastPulse: lastHeartbeat || "NEVER",
                secondsAgo: diffSeconds
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};

// API Endpoint: Toggle Queue Processing
// Usage: POST { command: "pause" | "resume" }
//        GET returns current status

const { Storage } = require('./lib/storage');
const storage = new Storage('queue-control');

exports.handler = async (event) => {
    // CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        if (event.httpMethod === 'GET') {
            const status = await storage.get('status') || { paused: false };
            return { statusCode: 200, headers, body: JSON.stringify(status) };
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            const cmd = body.command; // "pause" or "resume"

            if (cmd !== 'pause' && cmd !== 'resume') {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid command" }) };
            }

            const paused = (cmd === 'pause');
            await storage.set('status', { paused, updatedAt: new Date().toISOString() });

            return {
                statusCode: 200, headers,
                body: JSON.stringify({ success: true, paused })
            };
        }

        return { statusCode: 405, headers, body: 'Method Not Allowed' };

    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};

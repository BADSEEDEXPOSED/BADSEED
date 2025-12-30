// API Endpoint: Clear Queue
// Usage: POST

const { Storage } = require('./lib/storage');
const storage = new Storage('queue-data');

exports.handler = async (event) => {
    // CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        await storage.set('queue', []);
        console.log('[Queue Clear] Queue wiped manually.');

        return {
            statusCode: 200, headers,
            body: JSON.stringify({ success: true, message: "Queue Cleared" })
        };

    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};

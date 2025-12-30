// API Endpoint: Add Test Item to Queue
// Usage: POST

const { Storage } = require('./lib/storage');
const storage = new Storage('queue-data');
const { v4: uuidv4 } = require('uuid');

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
        let queue = await storage.get('queue') || [];

        const testItem = {
            id: uuidv4(),
            memo: "TEST ITEM " + new Date().toLocaleTimeString(),
            aiLog: "This is a simulated resonance pattern for testing purposes.",
            createdAt: new Date().toISOString(),
            signature: "test-sig-" + Date.now()
        };

        queue.push(testItem);
        await storage.set('queue', queue);

        return {
            statusCode: 200, headers,
            body: JSON.stringify({ success: true, item: testItem })
        };

    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};

// API Endpoint: Set Sentinel Logic Rules
// Usage: POST { rules: [{ condition: "direction:out", effect: "greed:2" }, ...] }

const { Storage } = require('./lib/storage');
const storage = new Storage('sentiment-config');

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
        const body = JSON.parse(event.body);
        const rules = body.rules;

        if (!Array.isArray(rules)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Rules must be an array" }) };
        }

        // Save rules
        await storage.set('rules', rules);

        return {
            statusCode: 200, headers,
            body: JSON.stringify({ success: true, message: "Logic Updated", rules })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};

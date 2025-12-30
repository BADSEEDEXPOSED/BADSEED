// API Endpoint: Get Sentinel Logic Rules
// Usage: GET

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

    try {
        let rules = await storage.get('rules');

        // Default Rules if none exist
        if (!rules || rules.length === 0) {
            rules = [
                { id: 1, condition: "direction:out", effect: "greed", value: 2 },
                { id: 2, condition: "direction:out", effect: "fear", value: 1 },
                { id: 3, condition: "direction:in", effect: "hope", value: 2 },
                { id: 4, condition: "memo:none", effect: "mystery", value: 1 },
                { id: 5, condition: "ai:mystery", effect: "mystery", value: 1 }
            ];
            await storage.set('rules', rules);
        }

        return {
            statusCode: 200, headers,
            body: JSON.stringify({ rules })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};

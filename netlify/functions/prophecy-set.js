// API Endpoint: Manually Set Prophecy Text
// Usage: POST { "text": "The garden burns." }
// Description: Overwrites the current prophecy immediately.

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
        const body = JSON.parse(event.body);
        if (!body.text || typeof body.text !== 'string') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing 'text' field" }) };
        }

        let data = await storage.get('data') || {
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            prophecy: { text: '', date: '' }
        };

        const today = new Date().toISOString().split('T')[0];

        // Update Prophecy
        data.prophecy = {
            ...data.prophecy,
            text: body.text,
            date: today,
            updatedAt: new Date().toISOString(),
            ready: true, // Mark as ready for revelation
            forced: true // Flag as manually set
        };

        await storage.set('data', data);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: "Prophecy Overwritten",
                prophecy: data.prophecy
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

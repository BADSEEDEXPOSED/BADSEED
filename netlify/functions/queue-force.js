// API Endpoint: Force Run Queue Processor
// Usage: POST

const processor = require('./queue-processor');

exports.handler = async (event, context) => {
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
        console.log('[Queue Force] Manually triggering queue processor...');
        const result = await processor.handler(event, context);
        return {
            statusCode: 200, headers,
            body: JSON.stringify({ message: "Processor Triggered", result: result ? result.body : 'Unknown' })
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};
